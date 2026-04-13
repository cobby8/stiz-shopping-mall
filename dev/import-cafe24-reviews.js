/**
 * stiz.kr 상품 후기 크롤링 → DB(product_reviews) 등록 스크립트
 *
 * - board_no=4 (상품 후기 게시판) 전체 페이지 순회
 * - 각 행에서 번호, product_no, 제목, 작성자, 날짜, 별점 추출
 * - cafe24Id → productId 매핑 후 INSERT
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// DB 연결
const dbPath = join(__dirname, '..', 'server', 'data', 'stiz.db');
const db = new Database(dbPath);

// FK 제약 비활성화 — userId=0(크롤링 유저)이 users에 없으므로
db.pragma('foreign_keys = OFF');

// 요청 간 딜레이 (ms) — 서버 부하 방지
const DELAY = 500;
const BASE_URL = 'https://stiz.kr/board/product/list.html?board_no=4';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// cafe24Id → productId 매핑 테이블을 미리 로드 (매번 쿼리하지 않기 위해)
const cafe24Map = new Map();
const products = db.prepare('SELECT id, cafe24Id FROM products WHERE cafe24Id IS NOT NULL').all();
for (const p of products) {
  cafe24Map.set(p.cafe24Id, p.id);
}
console.log(`[준비] cafe24Id 매핑 ${cafe24Map.size}개 로드 완료`);

// INSERT 준비 — userId=0은 "크롤링 데이터(비회원)"를 의미
const insert = db.prepare(`
  INSERT OR IGNORE INTO product_reviews
    (productId, userId, userName, rating, content, createdAt, updatedAt)
  VALUES (?, 0, ?, ?, ?, ?, ?)
`);

/**
 * 한 페이지의 HTML을 파싱하여 후기 목록을 추출
 */
function parseReviews(html, page) {
  const reviews = [];

  // 데이터 행만 추출 (xans-record- 클래스가 있는 tr)
  const rows = html.split('<tr').filter(r => r.includes('xans-record-'));

  for (const row of rows) {
    try {
      // 1) 번호 추출: 첫 번째 <td> 안의 숫자
      const noMatch = row.match(/<td>\s*(\d+)\s*<\/td>/);
      const no = noMatch ? parseInt(noMatch[1]) : 0;

      // 2) product_no 추출: product_no=XXXX 패턴
      const prodMatch = row.match(/product_no=(\d+)/);
      const cafe24Id = prodMatch ? parseInt(prodMatch[1]) : null;

      // 3) 제목 추출: read.html 링크의 텍스트
      const titleMatch = row.match(/read\.html[^"]*"[^>]*>([^<]+)<\/a>/);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // 4) 작성자 추출: </a> 이후의 <td> 중 마스킹된 이름
      //    구조: td[4]에 작성자가 있음 (네****, 1**** 등)
      const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
      // td 순서: [0]번호, [1]상품이미지, [2]displaynone, [3]제목, [4]작성자, [5]날짜, [6]조회수, [7]추천, [8]별점
      const writerTd = tds[4] || '';
      const writerMatch = writerTd.match(/<td[^>]*>\s*([^<]+)\s*<\/td>/);
      const writer = writerMatch ? writerMatch[1].trim() : '';

      // 5) 날짜 추출: txtNum 안의 날짜 (2026-04-10 형태)
      const dateMatch = row.match(/<span class="txtNum">(\d{4}-\d{2}-\d{2})<\/span>/);
      const date = dateMatch ? dateMatch[1] : '';

      // 6) 별점 추출: ico_pointN.gif에서 N
      const gradeMatch = row.match(/ico_point(\d)\.gif/);
      const rating = gradeMatch ? parseInt(gradeMatch[1]) : 5;

      if (cafe24Id && title && date) {
        reviews.push({ no, cafe24Id, title, writer, date, rating });
      }
    } catch (e) {
      console.error(`  [파싱 에러] page=${page}: ${e.message}`);
    }
  }

  return reviews;
}

/**
 * 페이지 HTML을 가져오는 함수
 */
async function fetchPage(page) {
  const url = `${BASE_URL}&page=${page}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for page ${page}`);
  return res.text();
}

/**
 * 딜레이 유틸
 */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== 메인 실행 =====
async function main() {
  console.log('[시작] stiz.kr 상품 후기 크롤링');
  console.log(`[대상] board_no=4, 최대 74페이지`);

  let totalInserted = 0;
  let totalSkippedNoMapping = 0;
  let totalSkippedDuplicate = 0;
  let totalParsed = 0;
  const unmappedProducts = new Map(); // cafe24Id → 횟수

  // 트랜잭션으로 감싸서 성능 최적화
  const insertAll = db.transaction((reviews) => {
    let inserted = 0;
    let skippedNoMapping = 0;

    for (const r of reviews) {
      const productId = cafe24Map.get(r.cafe24Id);

      if (!productId) {
        // 매핑 실패 기록
        skippedNoMapping++;
        unmappedProducts.set(r.cafe24Id, (unmappedProducts.get(r.cafe24Id) || 0) + 1);
        continue;
      }

      // content에 제목을 넣음 (본문 접근 불가하므로)
      const result = insert.run(
        productId,        // productId
        r.writer,         // userName (마스킹된 이름)
        r.rating,         // rating (별점)
        r.title,          // content (제목 = 내용)
        r.date,           // createdAt
        r.date            // updatedAt
      );

      if (result.changes > 0) inserted++;
    }

    return { inserted, skippedNoMapping };
  });

  // 74페이지 순회
  for (let page = 1; page <= 74; page++) {
    try {
      const html = await fetchPage(page);
      const reviews = parseReviews(html, page);
      totalParsed += reviews.length;

      if (reviews.length === 0) {
        console.log(`  [page ${page}] 행 0개 — 종료`);
        break;
      }

      const { inserted, skippedNoMapping } = insertAll(reviews);
      totalInserted += inserted;
      totalSkippedNoMapping += skippedNoMapping;

      // 진행 상황 출력 (10페이지마다)
      if (page % 10 === 0 || page === 1 || page === 74) {
        console.log(`  [page ${page}/74] 파싱 ${reviews.length}건 | 누적 삽입 ${totalInserted} | 매핑실패 ${totalSkippedNoMapping}`);
      }

      // 딜레이
      if (page < 74) await sleep(DELAY);

    } catch (e) {
      console.error(`  [에러] page=${page}: ${e.message}`);
    }
  }

  // 결과 요약
  console.log('\n========== 완료 ==========');
  console.log(`총 파싱: ${totalParsed}건`);
  console.log(`DB 삽입: ${totalInserted}건`);
  console.log(`매핑 실패 (cafe24Id 없음): ${totalSkippedNoMapping}건`);

  if (unmappedProducts.size > 0) {
    console.log(`\n[매핑 실패 상세] (${unmappedProducts.size}개 상품)`);
    // 많이 실패한 순으로 상위 20개만 출력
    const sorted = [...unmappedProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [cafe24Id, count] of sorted) {
      console.log(`  cafe24Id=${cafe24Id}: ${count}건`);
    }
  }

  // DB 최종 확인
  const total = db.prepare('SELECT COUNT(*) as cnt FROM product_reviews').get();
  console.log(`\n[DB 확인] product_reviews 총 ${total.cnt}건`);

  db.close();
}

main().catch(e => {
  console.error('치명적 에러:', e);
  db.close();
  process.exit(1);
});
