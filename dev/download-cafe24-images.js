/**
 * 카페24 상품 이미지 다운로드 스크립트 (Step 3)
 * -------------------------------------------------
 * 왜 필요한가:
 *   dev/cafe24-products.json 에는 카페24 CDN(cafe24.poxo.com) URL이 그대로 들어있다.
 *   자체 쇼핑몰로 이전하려면 이미지도 우리 서버에 저장해야 한다.
 *   (카페24 계약이 끝나면 원본 URL은 사용 불가)
 *
 * 동작:
 *   1) JSON을 읽어 261개 상품을 순회
 *   2) 각 상품 cafe24Id 로 디렉터리 생성
 *      server/uploads/products/cafe24/{cafe24Id}/
 *   3) 대표 이미지 -> main.{ext}
 *      상세 이미지 -> detail-1.{ext}, detail-2.{ext}, ...
 *   4) 성공/실패 카운트하면서 진행률 출력
 *   5) 완료 후 JSON에 mainImageLocal / detailImagesLocal 필드를 추가 저장
 *
 * 특징:
 *   - 외부 의존성 없음 (Node 내장 https/http만 사용)
 *   - User-Agent 설정 (일부 CDN이 기본 UA를 차단하므로)
 *   - 요청 간 200ms 딜레이 (서버 부하 방지)
 *   - 이미 받은 파일은 스킵 (재실행 안전)
 *   - 한 장이 실패해도 전체 계속 진행
 *
 * 사용:
 *   node dev/download-cafe24-images.js
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

// ESM 환경에서 __dirname 대체 (import.meta.url 사용)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 프로젝트 루트 기준 경로 (dev/ 의 부모)
const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'dev', 'cafe24-products.json');
const OUT_BASE = path.join(ROOT, 'server', 'uploads', 'products', 'cafe24');

// 요청 간 딜레이 (ms) — 카페24 CDN 부하 방지
const DELAY_MS = 200;

// 다운로드 타임아웃 (ms)
const TIMEOUT_MS = 20000;

// 브라우저처럼 보이게 User-Agent 설정
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** sleep: 순차 요청 사이 잠시 쉬기 위한 유틸 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * URL에서 확장자만 추출.
 * 쿼리스트링이 붙어있을 수 있어서 `?` 이전까지 자른다.
 * 확장자가 없으면 기본 .jpg로 폴백.
 */
function getExt(url) {
  try {
    const clean = url.split('?')[0];
    const m = clean.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
    if (m) return '.' + m[1].toLowerCase();
  } catch (_) {}
  return '.jpg';
}

/**
 * 단일 이미지 다운로드.
 * - https / http 자동 분기
 * - 리다이렉트(301/302) 1회까지 따라감
 * - User-Agent 헤더 필수
 * - 스트림으로 파일에 바로 저장
 */
function downloadImage(url, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    // 프로토콜 선택
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/*,*/*;q=0.8',
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        // 리다이렉트 처리 (최대 3회)
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectCount < 3
        ) {
          res.resume(); // 소켓 정리
          return downloadImage(res.headers.location, destPath, redirectCount + 1)
            .then(resolve)
            .catch(reject);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }

        // 파일로 스트림 저장
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(true)));
        file.on('error', (err) => {
          // 중간에 실패하면 망가진 파일 삭제
          fs.unlink(destPath, () => reject(err));
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => reject(err));
  });
}

/**
 * 안전한 다운로드 래퍼.
 * - 이미 파일이 있고 크기가 0보다 크면 스킵 (재실행 안전)
 * - 실패하면 에러 메시지만 리턴하고 전체 루프는 계속
 */
async function safeDownload(url, destPath) {
  // 이미 받은 파일이면 스킵
  if (fs.existsSync(destPath)) {
    const stat = fs.statSync(destPath);
    if (stat.size > 0) return { skipped: true };
  }
  try {
    await downloadImage(url, destPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function main() {
  console.log('[download] JSON 로드:', JSON_PATH);
  const products = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log('[download] 대상 상품 수:', products.length);

  // 출력 디렉터리 생성
  fs.mkdirSync(OUT_BASE, { recursive: true });

  // 통계 변수
  let totalImages = 0;
  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const failures = []; // 실패 목록 (url + reason)

  const startAt = Date.now();

  for (let idx = 0; idx < products.length; idx++) {
    const p = products[idx];
    // 상품별 디렉터리
    const dir = path.join(OUT_BASE, String(p.cafe24Id));
    fs.mkdirSync(dir, { recursive: true });

    // ── 대표 이미지
    if (p.mainImage) {
      totalImages++;
      const ext = getExt(p.mainImage);
      const filename = 'main' + ext;
      const destPath = path.join(dir, filename);
      const res = await safeDownload(p.mainImage, destPath);
      if (res.ok) okCount++;
      else if (res.skipped) skipCount++;
      else {
        failCount++;
        failures.push({ cafe24Id: p.cafe24Id, url: p.mainImage, reason: res.error });
      }
      // JSON에 로컬 경로 기록 (실패해도 기록: 나중에 수동 보완용)
      p.mainImageLocal = `/uploads/products/cafe24/${p.cafe24Id}/${filename}`;
      if (!res.skipped) await sleep(DELAY_MS);
    }

    // ── 상세 이미지들
    p.detailImagesLocal = [];
    const details = Array.isArray(p.detailImages) ? p.detailImages : [];
    for (let i = 0; i < details.length; i++) {
      const url = details[i];
      if (!url) continue;
      totalImages++;
      const ext = getExt(url);
      const filename = `detail-${i + 1}${ext}`;
      const destPath = path.join(dir, filename);
      const res = await safeDownload(url, destPath);
      if (res.ok) {
        okCount++;
        p.detailImagesLocal.push(`/uploads/products/cafe24/${p.cafe24Id}/${filename}`);
      } else if (res.skipped) {
        skipCount++;
        p.detailImagesLocal.push(`/uploads/products/cafe24/${p.cafe24Id}/${filename}`);
      } else {
        failCount++;
        failures.push({ cafe24Id: p.cafe24Id, url, reason: res.error });
        // 실패한 이미지는 로컬 경로 배열에 추가하지 않음
      }
      if (!res.skipped) await sleep(DELAY_MS);
    }

    // 10개 상품마다 진행률 표시
    if ((idx + 1) % 10 === 0 || idx === products.length - 1) {
      const pct = (((idx + 1) / products.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startAt) / 1000).toFixed(0);
      console.log(
        `[download] ${idx + 1}/${products.length} (${pct}%) | ` +
          `ok=${okCount} skip=${skipCount} fail=${failCount} | ${elapsed}s`
      );
    }
  }

  // ── JSON 업데이트 저장 (로컬 경로 포함)
  fs.writeFileSync(JSON_PATH, JSON.stringify(products, null, 2), 'utf8');
  console.log('[download] JSON 업데이트 완료:', JSON_PATH);

  // 실패 목록 별도 저장 (있으면)
  if (failures.length > 0) {
    const failLog = path.join(ROOT, 'dev', 'download-failures.json');
    fs.writeFileSync(failLog, JSON.stringify(failures, null, 2), 'utf8');
    console.log('[download] 실패 목록:', failLog);
  }

  console.log('─────────────────────────────');
  console.log('[download] 최종 결과');
  console.log('  총 이미지:', totalImages);
  console.log('  성공    :', okCount);
  console.log('  스킵    :', skipCount, '(이미 받음)');
  console.log('  실패    :', failCount);
  console.log('─────────────────────────────');
}

main().catch((err) => {
  console.error('[download] 치명적 오류:', err);
  process.exit(1);
});
