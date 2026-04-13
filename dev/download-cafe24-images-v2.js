/**
 * 카페24 상품 이미지 다운로드 스크립트 v2 (Step 5)
 * -------------------------------------------------
 * 왜 v2 가 필요한가:
 *   v1 은 mainImage + detailImages 배열만 로컬로 내려받았다.
 *   하지만 우리는 상세 페이지 HTML(detailHtml) 전체를 DB 에 저장하기 때문에,
 *   그 HTML 안에 박혀있는 <img src="..."> 들도 전부 로컬화해야
 *   카페24 계약 종료 후에도 상세페이지가 깨지지 않는다.
 *
 * v1 대비 추가된 것:
 *   - dev/cafe24-products-v2.json 사용 (스크래퍼 v2 산출물)
 *   - detailHtml 안의 모든 cafe24 CDN URL 을 자동 스캔/다운로드
 *   - 다운로드 후 detailHtml 의 URL 을 전부 로컬 경로(/uploads/...)로 치환
 *   - 치환된 detailHtml 을 다시 JSON 에 저장 → import 단계에서 그대로 DB 저장
 *
 * 동작:
 *   1) JSON 로드
 *   2) 각 상품마다 server/uploads/products/cafe24/{cafe24Id}/ 생성
 *   3) mainImage → main.{ext}
 *   4) detailImages[] → detail-1.{ext}, detail-2.{ext}, ...
 *   5) detailHtml 안의 <img>/ec-data-src/data-src 모두 스캔 → embed-N.{ext}
 *   6) detailHtml 문자열에서 원본 URL → 로컬 경로로 일괄 replace
 *   7) JSON 에 mainImageLocal / detailImagesLocal / detailHtml(치환본) 저장
 *
 * 재실행 안전:
 *   - 이미 내려받은 파일은 크기 체크 후 스킵
 *   - 실패한 이미지는 로컬 경로 배열에 추가하지 않음
 *
 * 사용:
 *   node dev/download-cafe24-images-v2.js
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const JSON_PATH = path.join(ROOT, 'dev', 'cafe24-products-v2.json');
const OUT_BASE = path.join(ROOT, 'server', 'uploads', 'products', 'cafe24');

const DELAY_MS = 150; // v1 보다 약간 타이트 — 이미지 양이 훨씬 많음
const TIMEOUT_MS = 20000;
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// URL 의 확장자 추출 (쿼리 제거 후) — 없으면 .jpg
function getExt(url) {
    try {
        const clean = url.split('?')[0];
        const m = clean.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
        if (m) return '.' + m[1].toLowerCase();
    } catch (_) {}
    return '.jpg';
}

// 절대 URL 변환 (// 프로토콜 상대, / 루트 상대 대응)
function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return 'https://stiz.kr' + u;
    return u;
}

/**
 * 단일 이미지 다운로드 — https/http 분기 + 리다이렉트 3회까지 추적
 */
function downloadImage(url, destPath, redirectCount = 0) {
    return new Promise((resolve, reject) => {
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
                if (
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location &&
                    redirectCount < 3
                ) {
                    res.resume();
                    return downloadImage(res.headers.location, destPath, redirectCount + 1)
                        .then(resolve)
                        .catch(reject);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error('HTTP ' + res.statusCode));
                }
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => file.close(() => resolve(true)));
                file.on('error', (err) => {
                    fs.unlink(destPath, () => reject(err));
                });
            }
        );
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (err) => reject(err));
    });
}

async function safeDownload(url, destPath) {
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

/**
 * detailHtml 에서 모든 이미지 URL 을 스캔한다.
 * - ec-data-src / data-src / src 세 가지 속성 모두 지원
 * - 카페24 고유 placeholder/스페이서(NNEditor 제외 짧은 것) 제거
 * - 반환: [{ originalUrl, absoluteUrl }] — 원본 문자열도 보존해야 치환 가능
 */
function extractImagesFromDetailHtml(html) {
    if (!html) return [];
    const found = [];
    const seen = new Set();

    // 우선순위: ec-data-src → data-src → src
    const patterns = [
        /ec-data-src=["']([^"']+)["']/g,
        /data-src=["']([^"']+)["']/g,
        // src 는 <img ... src="..."> 에 한함
        /<img[^>]*\ssrc=["']([^"']+)["']/g,
    ];

    for (const re of patterns) {
        let m;
        while ((m = re.exec(html)) !== null) {
            const originalUrl = m[1];
            if (!originalUrl) continue;
            // 유효한 이미지만 — cafe24 업로드 경로 or 확장자 매칭
            if (!/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(originalUrl) &&
                !/web\/(product|upload)|NNEditor|poxo\.com/i.test(originalUrl)) {
                continue;
            }
            if (seen.has(originalUrl)) continue;
            seen.add(originalUrl);
            found.push({ originalUrl, absoluteUrl: absUrl(originalUrl) });
        }
    }
    return found;
}

async function main() {
    console.log('[download-v2] JSON 로드:', JSON_PATH);
    if (!fs.existsSync(JSON_PATH)) {
        throw new Error(`JSON 없음: ${JSON_PATH} — 먼저 scrape-cafe24-v2.js 실행 필요`);
    }
    const products = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log('[download-v2] 대상 상품 수:', products.length);

    fs.mkdirSync(OUT_BASE, { recursive: true });

    let totalImages = 0;
    let okCount = 0;
    let skipCount = 0;
    let failCount = 0;
    let embedReplacedCount = 0; // detailHtml 치환 횟수
    const failures = [];

    const startAt = Date.now();

    for (let idx = 0; idx < products.length; idx++) {
        const p = products[idx];
        const dir = path.join(OUT_BASE, String(p.cafe24Id));
        fs.mkdirSync(dir, { recursive: true });

        // ───── 1) 대표 이미지
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
            p.mainImageLocal = `/uploads/products/cafe24/${p.cafe24Id}/${filename}`;
            if (!res.skipped) await sleep(DELAY_MS);
        }

        // ───── 2) detailImages 배열 (스크래퍼가 이미 뽑아둔 목록)
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
            if (res.ok || res.skipped) {
                if (res.ok) okCount++;
                else skipCount++;
                p.detailImagesLocal.push(`/uploads/products/cafe24/${p.cafe24Id}/${filename}`);
            } else {
                failCount++;
                failures.push({ cafe24Id: p.cafe24Id, url, reason: res.error });
            }
            if (!res.skipped) await sleep(DELAY_MS);
        }

        // ───── 3) detailHtml 내부 이미지 스캔 + 다운로드 + URL 치환
        // 왜 치환이 필요한가: DB 에 저장된 HTML 을 그대로 detail.html 페이지에 뿌릴 텐데,
        // cafe24.poxo.com 링크가 살아있으면 계약 만료 시 한꺼번에 깨진다.
        if (p.detailHtml && p.detailHtml.length > 0) {
            const embedded = extractImagesFromDetailHtml(p.detailHtml);
            let newHtml = p.detailHtml;
            for (let i = 0; i < embedded.length; i++) {
                const { originalUrl, absoluteUrl } = embedded[i];
                totalImages++;
                const ext = getExt(absoluteUrl);
                const filename = `embed-${i + 1}${ext}`;
                const destPath = path.join(dir, filename);
                const res = await safeDownload(absoluteUrl, destPath);
                if (res.ok || res.skipped) {
                    if (res.ok) okCount++;
                    else skipCount++;
                    // detailHtml 의 원본 URL(속성값 그대로)을 로컬 경로로 치환
                    // 같은 URL 이 여러 번 나와도 replaceAll 로 한 번에 처리
                    const localPath = `/uploads/products/cafe24/${p.cafe24Id}/${filename}`;
                    // 문자열 replaceAll — 정규식 이스케이프
                    const esc = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    newHtml = newHtml.replace(new RegExp(esc, 'g'), localPath);
                    embedReplacedCount++;
                } else {
                    failCount++;
                    failures.push({ cafe24Id: p.cafe24Id, url: absoluteUrl, reason: res.error });
                }
                if (!res.skipped) await sleep(DELAY_MS);
            }
            p.detailHtml = newHtml; // 치환본으로 덮어쓰기
        }

        // 진행률 (10개마다)
        if ((idx + 1) % 10 === 0 || idx === products.length - 1) {
            const pct = (((idx + 1) / products.length) * 100).toFixed(1);
            const elapsed = ((Date.now() - startAt) / 1000).toFixed(0);
            console.log(
                `[download-v2] ${idx + 1}/${products.length} (${pct}%) | ` +
                    `ok=${okCount} skip=${skipCount} fail=${failCount} embed=${embedReplacedCount} | ${elapsed}s`
            );
        }

        // 상품 20개마다 중간 저장 — 장시간 작업 중 중단 대비
        if ((idx + 1) % 20 === 0) {
            fs.writeFileSync(JSON_PATH, JSON.stringify(products, null, 2), 'utf8');
        }
    }

    // 최종 저장
    fs.writeFileSync(JSON_PATH, JSON.stringify(products, null, 2), 'utf8');
    console.log('[download-v2] JSON 업데이트 완료:', JSON_PATH);

    if (failures.length > 0) {
        const failLog = path.join(ROOT, 'dev', 'download-v2-failures.json');
        fs.writeFileSync(failLog, JSON.stringify(failures, null, 2), 'utf8');
        console.log('[download-v2] 실패 목록:', failLog);
    }

    console.log('─────────────────────────────');
    console.log('[download-v2] 최종 결과');
    console.log('  총 이미지     :', totalImages);
    console.log('  성공          :', okCount);
    console.log('  스킵          :', skipCount, '(이미 받음)');
    console.log('  실패          :', failCount);
    console.log('  detailHtml 치환:', embedReplacedCount);
    console.log('─────────────────────────────');
}

main().catch((err) => {
    console.error('[download-v2] 치명적 오류:', err);
    process.exit(1);
});
