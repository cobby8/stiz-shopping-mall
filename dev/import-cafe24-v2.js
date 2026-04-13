/**
 * 카페24 상품 DB 등록 스크립트 v2 (Step 6)
 * -------------------------------------------------
 * 왜 v2 가 필요한가:
 *   v1 은 6개 신규 컬럼(detailHtml / origin / brand / modelName / manufacturer / isConsultPrice)을
 *   반영하지 못했고, 대분류 slug 만으로 카테고리를 배정했다.
 *
 *   v2 는:
 *   - 6개 신규 컬럼 전부 UPSERT
 *   - subCategoryId 가 있으면 대분류 대신 하위 카테고리 id 로 배정
 *   - isConsultPrice=1 이면 price=0 저장 + 컬럼 플래그 기록
 *   - detailHtml 에서 <script>, <style> 제거 (sanitize)
 *   - cafe24Id 기준 UPSERT (INSERT or UPDATE)
 *   - product_images / product_options 는 DELETE 후 재삽입 (재실행 안전)
 *
 * 사용:
 *   node dev/import-cafe24-v2.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const JSON_PATH = path.join(ROOT, 'dev', 'cafe24-products-v2.json');
const DB_PATH = path.join(ROOT, 'server', 'data', 'stiz.db');

/**
 * 스크래퍼 v2 의 카페24 대분류 slug → 실제 DB 대분류 slug 매핑
 * -------------------------------------------------
 * Part 10 마이그레이션으로 카테고리가 고객 관점 10개(id 100~109) 로 재편되었다.
 * 카페24 slug('basketball', 'teamwear' 등)가 그대로 DB slug 와 일치하는 경우가 많지만,
 * 일부는 매핑이 필요하다.
 *   - 'shirts' (227)   → teamwear(103) — stiz.kr SHIRTS 는 팀웨어 셔츠 라인
 *   - 'bottom' (231)   → casual(106)   — BOTTOM 카테고리는 캐주얼 팬츠/쇼츠
 *   - 'sports-equipment' (240) → accessories(107)
 *   - 'sale' (251)     → sale(109)
 *   - 나머지 basketball/soccer/teamwear/compression/practice/accessories/md-picks 는 1:1
 */
const PARENT_SLUG_MAP = {
    basketball: 'basketball',
    soccer: 'soccer',
    teamwear: 'teamwear',
    compression: 'compression',
    practice: 'practice',
    accessories: 'accessories',
    'sports-equipment': 'accessories',
    shirts: 'teamwear',
    bottom: 'casual',
    'md-picks': 'md-picks',
    sale: 'sale',
};

function nowIso() {
    return new Date().toISOString();
}

/**
 * detailHtml 에서 <script>, <style> 태그 + 내부 내용을 제거한다.
 * 비유: 편지에 낙서돼 있는 연필 자국(스크립트)만 지우고 나머지 글은 그대로 둔다.
 *
 * 왜 필요한가:
 *   카페24 상세페이지에는 가끔 analytics 스크립트/CSS 가 섞여 있다.
 *   DB 에 그대로 저장해 프론트에서 innerHTML 로 뿌리면 XSS 위험 + CSS 충돌이 난다.
 */
function sanitizeDetailHtml(html) {
    if (!html) return '';
    return html
        // <script ...>...</script> 통째로 제거 (다중 라인 포함)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        // <style ...>...</style> 통째로 제거
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        // onXxx="..." 인라인 이벤트 핸들러 제거 (XSS 방지)
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
}

function main() {
    console.log('[import-v2] JSON 로드:', JSON_PATH);
    if (!fs.existsSync(JSON_PATH)) {
        throw new Error(`JSON 없음: ${JSON_PATH} — 먼저 scrape+download v2 실행 필요`);
    }
    const products = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log('[import-v2] 대상 상품 수:', products.length);

    console.log('[import-v2] DB 열기:', DB_PATH);
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');

    // ───── 카테고리 slug → id 캐시
    const catRows = db.prepare('SELECT id, slug FROM product_categories').all();
    const catBySlug = {};
    const catById = {};
    for (const r of catRows) {
        catBySlug[r.slug] = r.id;
        catById[r.id] = r.slug;
    }

    for (const [from, to] of Object.entries(PARENT_SLUG_MAP)) {
        if (!catBySlug[to]) {
            console.warn(`[import-v2] 경고: 대분류 매핑 대상 slug 없음: ${from} → ${to}`);
        }
    }

    // ───── Prepared Statements
    const selectByCafe24Id = db.prepare('SELECT id FROM products WHERE cafe24Id = ?');

    // INSERT — 6개 신규 컬럼 포함
    const insertProduct = db.prepare(`
        INSERT INTO products
            (type, categoryId, name, sku, description, price,
             detailHtml, origin, brand, modelName, manufacturer, isConsultPrice,
             status, createdAt, updatedAt, cafe24Id)
        VALUES (?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                'active', ?, ?, ?)
    `);

    // UPDATE — 6개 컬럼 포함 (sku/cafe24Id 는 고정이므로 제외)
    const updateProduct = db.prepare(`
        UPDATE products
           SET categoryId = ?, name = ?, description = ?, price = ?,
               detailHtml = ?, origin = ?, brand = ?, modelName = ?,
               manufacturer = ?, isConsultPrice = ?, updatedAt = ?
         WHERE id = ?
    `);

    const deleteImages = db.prepare('DELETE FROM product_images WHERE productId = ?');
    const insertImage = db.prepare(`
        INSERT INTO product_images (productId, url, alt, isPrimary, sortOrder, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const deleteOptions = db.prepare('DELETE FROM product_options WHERE productId = ?');
    const insertOption = db.prepare(`
        INSERT INTO product_options
            (productId, optionType, optionValue, priceAdjust, stock, sortOrder, active)
        VALUES (?, ?, ?, 0, 0, ?, 1)
    `);

    // ───── 통계
    let insertedCount = 0;
    let updatedCount = 0;
    let imageCount = 0;
    let optionCount = 0;
    let skippedNoCategory = 0;
    let subCatUsedCount = 0;
    let parentFallbackCount = 0;
    let consultCount = 0;
    const skippedList = [];
    const categoryDist = {}; // 카테고리별 상품 수

    // ───── 트랜잭션
    const runAll = db.transaction(() => {
        for (const p of products) {
            // (1) 카테고리 결정 — subCategoryId 우선, 없으면 parent slug 맵
            let categoryId = null;
            if (p.subCategoryId && catById[p.subCategoryId]) {
                categoryId = p.subCategoryId;
                subCatUsedCount++;
            } else {
                const parentSlug = PARENT_SLUG_MAP[p.categorySlug];
                if (parentSlug && catBySlug[parentSlug]) {
                    categoryId = catBySlug[parentSlug];
                    parentFallbackCount++;
                }
            }

            if (!categoryId) {
                skippedNoCategory++;
                skippedList.push({
                    cafe24Id: p.cafe24Id,
                    categorySlug: p.categorySlug,
                    subCategoryId: p.subCategoryId || null,
                });
                continue;
            }

            // 카테고리 분포 통계
            const catSlugLabel = catById[categoryId] || `id${categoryId}`;
            categoryDist[catSlugLabel] = (categoryDist[catSlugLabel] || 0) + 1;

            // (2) 필드 정리
            const description = p.description || '';
            const price = Number(p.price) || 0;
            const isConsult = p.isConsultPrice ? 1 : 0;
            if (isConsult) consultCount++;

            const detailHtml = sanitizeDetailHtml(p.detailHtml || '');
            const origin = p.origin || '';
            const brand = p.brand || '';
            const modelName = p.modelName || '';
            const manufacturer = p.manufacturer || '';

            // (3) UPSERT
            const existing = selectByCafe24Id.get(p.cafe24Id);
            let productId;
            const now = nowIso();

            if (existing) {
                productId = existing.id;
                updateProduct.run(
                    categoryId, p.name, description, price,
                    detailHtml, origin, brand, modelName, manufacturer, isConsult,
                    now, productId
                );
                updatedCount++;
            } else {
                const result = insertProduct.run(
                    'ready',
                    categoryId, p.name, p.sku, description, price,
                    detailHtml, origin, brand, modelName, manufacturer, isConsult,
                    now, now, p.cafe24Id
                );
                productId = result.lastInsertRowid;
                insertedCount++;
            }

            // (4) 이미지 재삽입
            deleteImages.run(productId);
            let sortOrder = 0;
            if (p.mainImageLocal) {
                insertImage.run(productId, p.mainImageLocal, p.name, 1, sortOrder++, now);
                imageCount++;
            }
            const details = Array.isArray(p.detailImagesLocal) ? p.detailImagesLocal : [];
            for (const img of details) {
                insertImage.run(productId, img, p.name, 0, sortOrder++, now);
                imageCount++;
            }

            // (5) 옵션 재삽입
            deleteOptions.run(productId);
            let optSort = 0;
            const options = Array.isArray(p.options) ? p.options : [];
            for (const opt of options) {
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

    // ───── 결과 출력
    console.log('─────────────────────────────');
    console.log('[import-v2] 최종 결과');
    console.log('  신규 INSERT      :', insertedCount);
    console.log('  UPDATE           :', updatedCount);
    console.log('  이미지 등록      :', imageCount);
    console.log('  옵션 등록        :', optionCount);
    console.log('  하위 카테고리 사용:', subCatUsedCount);
    console.log('  대분류 폴백      :', parentFallbackCount);
    console.log('  상담 상품        :', consultCount);
    console.log('  카테고리 누락    :', skippedNoCategory);
    console.log('─────────────────────────────');
    console.log('카테고리별 분포:');
    const sorted = Object.entries(categoryDist).sort((a, b) => b[1] - a[1]);
    for (const [slug, cnt] of sorted) {
        console.log(`  ${slug.padEnd(30)} ${cnt}`);
    }
    console.log('─────────────────────────────');

    if (skippedList.length > 0) {
        const skipLog = path.join(ROOT, 'dev', 'import-v2-skipped.json');
        fs.writeFileSync(skipLog, JSON.stringify(skippedList, null, 2), 'utf8');
        console.log('[import-v2] 스킵된 상품 목록:', skipLog);
    }
}

try {
    main();
} catch (err) {
    console.error('[import-v2] 치명적 오류:', err);
    process.exit(1);
}
