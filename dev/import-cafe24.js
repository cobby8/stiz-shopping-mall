/**
 * 카페24 상품 DB 등록 스크립트 (Step 4)
 * -------------------------------------------------
 * 왜 필요한가:
 *   Step 3까지 완료되면 dev/cafe24-products.json 에는
 *   상품 정보 + 로컬 이미지 경로(mainImageLocal / detailImagesLocal) 가 들어있다.
 *   이것을 실제 서비스 DB(server/data/stiz.db)의
 *   products / product_images / product_options 테이블에 등록한다.
 *
 * 동작:
 *   1) JSON 로드
 *   2) 각 상품마다:
 *      - 카테고리 매핑 (카페24 slug → 실제 product_categories.slug)
 *      - cafe24Id 기준 기존 상품 조회
 *      - 있으면 UPDATE, 없으면 INSERT
 *      - 기존 이미지/옵션 삭제 후 재등록 (재실행 안전)
 *   3) 통계 출력
 *
 * 중요:
 *   - PM 기획서의 컬럼명(retailPrice, imageUrl, productCode)은 "실제 DB 스키마"와 다름.
 *     실제로는 price / url / sku 를 사용한다. 이 스크립트는 실제 스키마에 맞췄다.
 *
 * 사용:
 *   node dev/import-cafe24.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const JSON_PATH = path.join(ROOT, 'dev', 'cafe24-products.json');
const DB_PATH = path.join(ROOT, 'server', 'data', 'stiz.db');

/**
 * 카페24 카테고리 slug → 실제 DB product_categories.slug 매핑.
 *
 * 왜 이렇게 매핑하는가:
 *   - 실제 DB에는 'basketball' / 'soccer' 같은 단순 slug 가 없음.
 *     대신 'custom-basketball' / 'custom-soccer' 가 존재.
 *   - 'shirts' / 'bottom' 도 없고, 'brand-shirts' / 'brand-bottom' 가 존재.
 *   - 카페24 전용 카테고리(teamwear/compression 등)는
 *     Step 1에서 만들어둔 'cafe24-*' 슬러그에 매핑.
 */
const CATEGORY_SLUG_MAP = {
  basketball: 'custom-basketball',
  soccer: 'custom-soccer',
  teamwear: 'cafe24-teamwear',
  compression: 'cafe24-compression',
  practice: 'cafe24-practice',
  accessories: 'cafe24-accessories',
  'sports-equipment': 'cafe24-sports-equipment',
  shirts: 'brand-shirts',
  bottom: 'brand-bottom',
  'md-picks': 'cafe24-md-picks',
  sale: 'cafe24-sale',
};

function nowIso() {
  return new Date().toISOString();
}

function main() {
  console.log('[import] JSON 로드:', JSON_PATH);
  const products = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log('[import] 대상 상품 수:', products.length);

  console.log('[import] DB 열기:', DB_PATH);
  const db = new Database(DB_PATH);
  // WAL 모드는 이미 설정되어 있을 것이므로 별도 설정 생략
  db.pragma('foreign_keys = ON');

  // ── 카테고리 slug → id 캐시 만들기
  const catRows = db.prepare('SELECT id, slug FROM product_categories').all();
  const catBySlug = {};
  for (const r of catRows) catBySlug[r.slug] = r.id;

  // 매핑 결과 사전 검증: 매핑된 slug 가 실제 DB에 없는 경우 경고
  for (const [from, to] of Object.entries(CATEGORY_SLUG_MAP)) {
    if (!catBySlug[to]) {
      console.warn(`[import] 경고: 카테고리 매핑 대상 slug 없음: ${from} -> ${to}`);
    }
  }

  // ── 준비된 구문(Prepared Statement) 캐시 — 성능 위해 미리 컴파일
  const selectByCafe24Id = db.prepare('SELECT id FROM products WHERE cafe24Id = ?');

  // products INSERT
  // 실제 컬럼: type, categoryId, name, sku, description, price, createdAt, updatedAt, cafe24Id
  // type='ready' (기성품) 으로 고정 — 카페24에서 이전된 상품은 커스텀 주문이 아닌 완성품이므로
  const insertProduct = db.prepare(`
    INSERT INTO products
      (type, categoryId, name, sku, description, price, createdAt, updatedAt, cafe24Id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // products UPDATE (중복 재실행 대비)
  const updateProduct = db.prepare(`
    UPDATE products
       SET categoryId = ?, name = ?, sku = ?, description = ?, price = ?, updatedAt = ?
     WHERE id = ?
  `);

  // product_images 삭제/삽입
  // 실제 컬럼: productId, url, alt, isPrimary, sortOrder, createdAt
  const deleteImages = db.prepare('DELETE FROM product_images WHERE productId = ?');
  const insertImage = db.prepare(`
    INSERT INTO product_images (productId, url, alt, isPrimary, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // product_options 삭제/삽입
  // 실제 컬럼: productId, optionType, optionValue, priceAdjust, stock, sortOrder, active
  const deleteOptions = db.prepare('DELETE FROM product_options WHERE productId = ?');
  const insertOption = db.prepare(`
    INSERT INTO product_options
      (productId, optionType, optionValue, priceAdjust, stock, sortOrder, active)
    VALUES (?, ?, ?, 0, 0, ?, 1)
  `);

  // ── 통계
  let insertedCount = 0;
  let updatedCount = 0;
  let imageCount = 0;
  let optionCount = 0;
  let skippedNoCategory = 0;
  const skippedList = [];

  // ── 트랜잭션으로 묶기 (속도 + 원자성)
  const runAll = db.transaction(() => {
    for (const p of products) {
      // 카테고리 매핑
      const targetSlug = CATEGORY_SLUG_MAP[p.categorySlug];
      const categoryId = targetSlug ? catBySlug[targetSlug] : null;
      if (!categoryId) {
        skippedNoCategory++;
        skippedList.push({ cafe24Id: p.cafe24Id, categorySlug: p.categorySlug });
        continue;
      }

      // 설명이 없으면 빈 문자열
      const description = p.description || '';
      // 가격이 0 이하인 경우는 그대로 저장 (수동 보완 필요)
      const price = Number(p.price) || 0;

      // 기존 상품 확인
      const existing = selectByCafe24Id.get(p.cafe24Id);
      let productId;
      const now = nowIso();

      if (existing) {
        productId = existing.id;
        updateProduct.run(categoryId, p.name, p.sku, description, price, now, productId);
        updatedCount++;
      } else {
        const result = insertProduct.run(
          'ready',          // type — 기성품으로 고정
          categoryId,
          p.name,
          p.sku,            // sku (= CAFE24-{번호})
          description,
          price,
          now,              // createdAt
          now,              // updatedAt
          p.cafe24Id        // cafe24Id — 원본 카페24 product_no
        );
        productId = result.lastInsertRowid;
        insertedCount++;
      }

      // ── 이미지 재등록 (기존 것 다 지우고 다시)
      deleteImages.run(productId);
      let sortOrder = 0;

      // 대표 이미지
      if (p.mainImageLocal) {
        insertImage.run(productId, p.mainImageLocal, p.name, 1, sortOrder++, now);
        imageCount++;
      }
      // 상세 이미지들
      const details = Array.isArray(p.detailImagesLocal) ? p.detailImagesLocal : [];
      for (const img of details) {
        insertImage.run(productId, img, p.name, 0, sortOrder++, now);
        imageCount++;
      }

      // ── 옵션 재등록
      deleteOptions.run(productId);
      let optSort = 0;
      const options = Array.isArray(p.options) ? p.options : [];
      for (const opt of options) {
        // 옵션 타입이 '사이즈' 등 한글이면 그대로 저장 (표시용)
        const optType = opt.type || 'size';
        const optValue = opt.value;
        if (!optValue) continue;
        insertOption.run(productId, optType, optValue, optSort++);
        optionCount++;
      }
    }
  });

  runAll();
  db.close();

  // ── 결과 출력
  console.log('─────────────────────────────');
  console.log('[import] 최종 결과');
  console.log('  신규 INSERT   :', insertedCount);
  console.log('  UPDATE        :', updatedCount);
  console.log('  이미지 등록   :', imageCount);
  console.log('  옵션 등록     :', optionCount);
  console.log('  카테고리 누락 :', skippedNoCategory);
  console.log('─────────────────────────────');

  if (skippedList.length > 0) {
    const skipLog = path.join(ROOT, 'dev', 'import-skipped.json');
    fs.writeFileSync(skipLog, JSON.stringify(skippedList, null, 2), 'utf8');
    console.log('[import] 스킵된 상품 목록:', skipLog);
  }
}

try {
  main();
} catch (err) {
  console.error('[import] 치명적 오류:', err);
  process.exit(1);
}
