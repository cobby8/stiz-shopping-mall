// ============================================================
// 챗봇 "티즈" 상품 요약 JSON 빌드 스크립트 (K2)
// ============================================================
// 비유: 창고의 상품 목록(374건)을 한 장씩 읽어
//       A4 1장(약 110KB)짜리 "요약 카드 묶음"으로 만들어 두는 일.
//       챗봇은 이 카드로 "농구 3~5만원대 추천"에 즉답한다.
//
// 실행: 프로젝트 루트에서 `node scripts/build-knowledge.js`
//       또는 `npm run build-knowledge`
//
// 설계 원칙:
// 1) DB는 반드시 readonly: true — 이 스크립트가 실수로 쓰지 않도록
// 2) 화이트리스트 테이블(products / product_categories / product_options)만 읽음
//    orders / customers / users / user_mileage / wishlists / cart_items 등은 절대 접근 금지
// 3) 내부 원가(costPrice/clubPrice/wholesalePrice) JSON 포함 금지 (노출 리스크)
// 4) description / detailHtml / cafe24Id는 JSON 크기·토큰 낭비로 제외
// 5) atomic write: tmp 파일에 쓴 뒤 rename — 쓰기 중 크래시로 파일이 깨지지 않게
// ============================================================

import Database from 'better-sqlite3';
import { writeFileSync, renameSync, readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM에서 __dirname 복원
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// DB 경로: 서버 data 폴더의 stiz.db (런타임 DB와 동일)
const DB_PATH = join(__dirname, '..', 'server', 'data', 'stiz.db');
// 출력 경로: 서버 knowledge 폴더 (K1 3파일과 같은 위치)
const OUT_DIR = join(__dirname, '..', 'server', 'data', 'knowledge');
const OUT_PATH = join(OUT_DIR, 'products.json');
const TMP_PATH = join(OUT_DIR, 'products.json.tmp');

// 화이트리스트 테이블: 이 3개 외에는 이 스크립트에서 절대 SELECT 하지 않는다.
// (주석으로 의도를 명시 — 코드 리뷰 시 검증 포인트)
const ALLOWED_READ_TABLES = Object.freeze(['products', 'product_categories', 'product_options']);

// 금지 테이블 (개인정보/거래정보) — 실수 방지용 명시 목록
const FORBIDDEN_TABLES = Object.freeze([
    'orders', 'customers', 'users', 'user_mileage',
    'wishlists', 'cart_items', 'coupons', 'newsletter_subscribers',
    'board_posts', 'product_reviews', 'activity_log', 'order_history'
]);

// ------------------------------------------------------------
// 유틸: 파일 크기를 KB 단위 문자열로
// ------------------------------------------------------------
function humanSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
}

// ------------------------------------------------------------
// 유틸: 가격 히스토그램 버킷 계산
// ------------------------------------------------------------
function priceBucket(price) {
    if (price <= 0) return null;          // 0원/음수는 실가격 아님
    if (price < 20000) return 'under20k';
    if (price < 30000) return '20to30k';
    if (price < 40000) return '30to40k';
    if (price < 50000) return '40to50k';
    if (price < 70000) return '50to70k';
    if (price < 100000) return '70to100k';
    return 'over100k';
}

// ------------------------------------------------------------
// 유틸: customMeta(JSON 문자열) 안전 파싱 → sport / subCategory 추출
// ------------------------------------------------------------
// customMeta 예시: '{"sport":"농구","subCategory":"베이직 유니폼"}'
function parseCustomMeta(raw) {
    if (!raw || typeof raw !== 'string') return { sport: null, subCategory: null };
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '{}') return { sport: null, subCategory: null };
    try {
        const obj = JSON.parse(trimmed);
        return {
            sport: obj && typeof obj.sport === 'string' && obj.sport ? obj.sport : null,
            subCategory: obj && typeof obj.subCategory === 'string' && obj.subCategory ? obj.subCategory : null
        };
    } catch {
        return { sport: null, subCategory: null };
    }
}

// ------------------------------------------------------------
// 메인 빌드 로직
// ------------------------------------------------------------
function build() {
    const t0 = Date.now();

    // 출력 폴더 확인 (없으면 생성)
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

    // DB 존재 여부 확인
    if (!existsSync(DB_PATH)) {
        console.error(`[build-knowledge] ❌ DB 파일 없음: ${DB_PATH}`);
        process.exit(1);
    }

    // readonly 강제 — 실수로 UPDATE/INSERT를 날려도 DB에 영향 X
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

    try {
        // ----------------------------------------------------
        // 1) 카테고리 트리 빌드
        //    parentId 기반 2계층 (루트 → 자식)
        //    실제 상품 수는 products 집계로 교차 계산
        // ----------------------------------------------------
        const categoriesRaw = db.prepare(`
            SELECT id, name, slug, parentId, sortOrder, active
            FROM product_categories
            WHERE active = 1
            ORDER BY sortOrder ASC, id ASC
        `).all();

        // 카테고리별 실제 active 상품 수 집계 (카테고리 트리 표시용)
        const countRows = db.prepare(`
            SELECT categoryId, COUNT(*) AS cnt
            FROM products
            WHERE status = 'active' AND categoryId IS NOT NULL
            GROUP BY categoryId
        `).all();
        const countByCat = new Map(countRows.map(r => [r.categoryId, r.cnt]));

        // 2계층 트리 조립 (루트만 1뎁스 children 보유 — 현재 스키마는 2계층)
        const rootCats = categoriesRaw.filter(c => !c.parentId);
        const childCats = categoriesRaw.filter(c => c.parentId);
        const categoryTree = rootCats.map(root => ({
            id: root.id,
            slug: root.slug || '',
            name: root.name,
            productCount: countByCat.get(root.id) || 0,
            children: childCats
                .filter(c => c.parentId === root.id)
                .map(c => ({
                    id: c.id,
                    slug: c.slug || '',
                    name: c.name,
                    productCount: countByCat.get(c.id) || 0
                }))
        }));

        // id → 이름 빠른 조회 맵 (상품 items 빌드 시 categoryName 채우기용)
        const catNameById = new Map(categoriesRaw.map(c => [c.id, c.name]));

        // ----------------------------------------------------
        // 2) active 상품 목록 + 옵션 존재 여부
        //    ⚠️ SELECT 컬럼 화이트리스트: 내부가·HTML·cafe24Id 제외
        // ----------------------------------------------------
        const productRows = db.prepare(`
            SELECT
                p.id,
                p.type,
                p.categoryId,
                p.name,
                p.price,
                p.isConsultPrice,
                p.customMeta,
                p.sortOrder,
                (SELECT COUNT(*) FROM product_options o
                   WHERE o.productId = p.id AND o.active = 1) AS optionCount
            FROM products p
            WHERE p.status = 'active'
            ORDER BY p.sortOrder ASC, p.id ASC
        `).all();

        // ----------------------------------------------------
        // 3) items 배열 가공 (금지 필드는 애초에 SELECT 안했으니 안전)
        // ----------------------------------------------------
        const items = productRows.map(p => {
            const meta = parseCustomMeta(p.customMeta);
            const categoryName = catNameById.get(p.categoryId) || null;
            return {
                id: p.id,
                type: p.type || 'ready',
                name: p.name,
                categoryId: p.categoryId || null,
                categoryName,
                price: Number(p.price) || 0,
                isConsultPrice: Boolean(p.isConsultPrice),
                sport: meta.sport,
                subCategory: meta.subCategory,
                hasOptions: (p.optionCount || 0) > 0,
                url: `/detail.html?id=${p.id}`
            };
        });

        // ----------------------------------------------------
        // 4) stats 집계 (챗봇이 "배구 뭐 있어?"에 먼저 통계로 안내)
        // ----------------------------------------------------
        const stats = {
            totalActive: items.length,
            byType: { custom: 0, ready: 0 },
            withPrice: 0,
            consultPrice: 0,
            withCustomMeta: 0,
            sportCounts: {},
            priceHistogram: {
                under20k: 0, '20to30k': 0, '30to40k': 0,
                '40to50k': 0, '50to70k': 0, '70to100k': 0, over100k: 0
            }
        };
        for (const it of items) {
            // 타입 집계
            if (it.type === 'custom') stats.byType.custom++;
            else if (it.type === 'ready') stats.byType.ready++;
            // 가격/상담 분기
            if (it.isConsultPrice) stats.consultPrice++;
            if (it.price > 0) stats.withPrice++;
            // customMeta 채움 여부 (sport 또는 subCategory 하나라도 있으면 집계)
            if (it.sport || it.subCategory) stats.withCustomMeta++;
            // sport 분포
            if (it.sport) stats.sportCounts[it.sport] = (stats.sportCounts[it.sport] || 0) + 1;
            // 가격 히스토그램 (실가격 상품만)
            const bucket = priceBucket(it.price);
            if (bucket && !it.isConsultPrice) stats.priceHistogram[bucket]++;
        }

        // ----------------------------------------------------
        // 5) 최종 JSON 객체 + 버전 태그
        // ----------------------------------------------------
        const builtAt = new Date();
        const version = `k2-${builtAt.toISOString().slice(0, 10)}-${builtAt.toTimeString().slice(0, 5).replace(':', '')}`;
        const json = {
            version,
            builtAt: builtAt.toISOString(),
            stats,
            categoryTree,
            items
        };

        // ----------------------------------------------------
        // 6) atomic write: tmp 파일에 먼저 쓰고 rename
        //    — 쓰기 도중 크래시가 나도 기존 products.json은 보존됨
        // ----------------------------------------------------
        const serialized = JSON.stringify(json);
        writeFileSync(TMP_PATH, serialized, 'utf-8');

        // 이전 파일이 있으면 diff 로그용으로 상품 수 읽기 (실패해도 빌드는 진행)
        let prevCount = null;
        if (existsSync(OUT_PATH)) {
            try {
                const prev = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
                prevCount = Array.isArray(prev.items) ? prev.items.length : null;
            } catch { /* 이전 파일 깨져있어도 무시 */ }
        }

        renameSync(TMP_PATH, OUT_PATH);

        // ----------------------------------------------------
        // 7) 결과 로그 — 사용자가 "성공했나?" 즉시 확인
        // ----------------------------------------------------
        const size = statSync(OUT_PATH).size;
        const elapsed = Date.now() - t0;
        const diffLine = prevCount !== null
            ? ` (이전 ${prevCount}개 → 지금 ${items.length}개, diff ${items.length - prevCount >= 0 ? '+' : ''}${items.length - prevCount})`
            : ' (최초 빌드)';

        console.log(`[build-knowledge] ✅ ${items.length}개 상품 요약 완료${diffLine}`);
        console.log(`[build-knowledge]    파일: ${OUT_PATH}`);
        console.log(`[build-knowledge]    크기: ${humanSize(size)} / 버전: ${version} / 소요: ${elapsed}ms`);
        console.log(`[build-knowledge]    stats: custom ${stats.byType.custom} / ready ${stats.byType.ready} / withPrice ${stats.withPrice} / consultPrice ${stats.consultPrice} / withCustomMeta ${stats.withCustomMeta}`);
        console.log(`[build-knowledge]    sport: ${Object.entries(stats.sportCounts).map(([k, v]) => `${k}(${v})`).join(' / ') || '(없음)'}`);
        // 참고용: 화이트리스트 테이블만 읽었음을 명시
        console.log(`[build-knowledge]    읽은 테이블: ${ALLOWED_READ_TABLES.join(', ')} (그 외 금지)`);
    } finally {
        db.close();
    }
}

// 스크립트 실행
try {
    build();
} catch (err) {
    console.error('[build-knowledge] ❌ 빌드 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
}
