/**
 * stiz.kr (카페24) 전체 상품 스크래핑 스크립트
 * -------------------------------------------------
 * 왜 이 스크립트가 필요한가:
 *   STIZ는 기존 카페24 쇼핑몰에서 자체 쇼핑몰로 이전 중이다.
 *   카페24의 상품 ~270개를 수동으로 옮기면 시간이 너무 많이 걸려서,
 *   HTML 파싱으로 자동 수집하여 JSON 중간파일로 저장한다.
 *
 * 동작 방식:
 *   1) 11개 카테고리 페이지를 모두 돌며 상품 product_no 목록을 수집
 *      (페이지네이션 대응)
 *   2) 각 product_no 마다 상세 페이지 HTML을 가져와
 *      og:title / 가격 / 대표 이미지 / 추가 이미지 / 사이즈 옵션을 정규식으로 추출
 *   3) 중복 제거 후 dev/cafe24-products.json 으로 저장
 *
 * 사용:
 *   node dev/scrape-cafe24.js
 *
 * 주의:
 *   - cheerio 같은 외부 파서를 쓰지 않고 정규식만 사용 (의존성 최소화)
 *   - 요청 간 500ms 딜레이 (서버 부하 방지)
 *   - User-Agent 헤더 설정
 *   - 한 상품에서 실패해도 전체는 계속 진행
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// 설정: 스크래핑 대상 카테고리
// ------------------------------------------------------------
// 비유: "이 매장의 몇 번 매대를 둘러볼지" 미리 정해두는 쇼핑 리스트
const CATEGORIES = [
    { id: 191, slug: 'basketball', name: 'BASKETBALL' },
    { id: 190, slug: 'soccer', name: 'SOCCER' },
    { id: 192, slug: 'teamwear', name: 'TEAMWEAR' },
    { id: 206, slug: 'compression', name: '컴프레션' },
    { id: 207, slug: 'practice', name: '연습복' },
    { id: 209, slug: 'accessories', name: '악세서리' },
    { id: 240, slug: 'sports-equipment', name: '용품' },
    { id: 227, slug: 'shirts', name: 'SHIRTS' },
    { id: 231, slug: 'bottom', name: 'BOTTOM' },
    { id: 253, slug: 'md-picks', name: 'MD제품' },
    { id: 251, slug: 'sale', name: '시즌오프' },
];

const BASE = 'https://stiz.kr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DELAY_MS = 500; // 요청 간 딜레이

// 출력 파일 경로
const OUT_PATH = path.join(__dirname, 'cafe24-products.json');

// ------------------------------------------------------------
// 유틸: sleep / fetch (에러 안전)
// ------------------------------------------------------------

// 비유: "잠깐 쉬었다 가기" — 서버가 과부하 받지 않도록 쉬는 시간
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 안전한 fetch: 실패 시 null 반환
async function safeFetch(url, retry = 2) {
    for (let i = 0; i <= retry; i++) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (e) {
            if (i === retry) {
                console.warn(`  [실패] ${url} :: ${e.message}`);
                return null;
            }
            await sleep(1000);
        }
    }
    return null;
}

// HTML 엔티티 해석 (간단한 것만)
function decodeEntities(s) {
    if (!s) return '';
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

// protocol-relative URL(//cafe24.poxo.com/...) → https://...
function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return BASE + u;
    return u;
}

// ------------------------------------------------------------
// 1단계: 카테고리별 상품 번호 목록 수집
// ------------------------------------------------------------

/**
 * 한 페이지에서 product_no 목록을 뽑아낸다.
 * 비유: 매대 앞에 서서 진열된 상품 번호표만 적어오는 것.
 */
function parseListPage(html) {
    // xans-product-listnormal ~ xans-product-normalpaging 구간 안의 상품만
    const listIdx = html.indexOf('xans-product-listnormal');
    const endIdx = html.indexOf('xans-product-normalpaging', listIdx);
    if (listIdx === -1) return [];
    const slice = html.substring(listIdx, endIdx > listIdx ? endIdx : html.length);
    const matches = slice.match(/anchorBoxName_(\d+)/g) || [];
    const ids = matches.map(m => m.replace('anchorBoxName_', ''));
    return [...new Set(ids)]; // 중복 제거
}

/**
 * 페이지네이션 최대 페이지 번호 파악 (없으면 1)
 */
function parseMaxPage(html) {
    const pagingIdx = html.indexOf('xans-product-normalpaging');
    if (pagingIdx === -1) return 1;
    const slice = html.substring(pagingIdx, pagingIdx + 5000);
    const pageNums = (slice.match(/page=(\d+)/g) || []).map(s => parseInt(s.split('=')[1], 10));
    if (pageNums.length === 0) return 1;
    return Math.max(...pageNums);
}

/**
 * 한 카테고리의 모든 상품 번호를 수집 (페이지 전부)
 */
async function collectCategoryProducts(cat) {
    console.log(`\n[카테고리] ${cat.name} (cate_no=${cat.id})`);
    const page1Url = `${BASE}/product/list.html?cate_no=${cat.id}`;
    const html1 = await safeFetch(page1Url);
    if (!html1) return [];

    const maxPage = parseMaxPage(html1);
    console.log(`  페이지 수: ${maxPage}`);
    const all = new Set(parseListPage(html1));

    for (let p = 2; p <= maxPage; p++) {
        await sleep(DELAY_MS);
        const url = `${BASE}/product/list.html?cate_no=${cat.id}&page=${p}`;
        const html = await safeFetch(url);
        if (!html) continue;
        parseListPage(html).forEach(id => all.add(id));
        process.stdout.write(`  page ${p}/${maxPage} (누적 ${all.size}개)\r`);
    }
    console.log(`  → 총 ${all.size}개 상품 발견`);
    return [...all].map(productNo => ({ productNo, categorySlug: cat.slug, categoryName: cat.name }));
}

// ------------------------------------------------------------
// 2단계: 상품 상세 페이지 파싱
// ------------------------------------------------------------

/**
 * 상세 페이지 HTML에서 상품 정보를 추출한다.
 * og 태그, product:price, data-src(lazy 이미지), option1 select 박스 등.
 */
function parseDetailPage(html, productNo) {
    // og:title — 상품명 (예: "26FW_BB_USA")
    const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    // 제목의 "STIZ | " prefix 제거, "스포티 감성" 같은 꼬리말은 그대로 둔다
    let name = ogTitle ? decodeEntities(ogTitle[1]).trim() : '';
    name = name.replace(/^STIZ\s*\|\s*/i, '').trim();

    // og:description
    const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i);
    const description = ogDesc ? decodeEntities(ogDesc[1]).trim() : '';

    // og:image — 대표 이미지
    const ogImg = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const mainImage = ogImg ? absUrl(ogImg[1]) : '';

    // 가격: product:price:amount
    const priceM = html.match(/<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i);
    const price = priceM ? parseInt(priceM[1], 10) || 0 : 0;

    // 판매가 없고 "상담 후 결제" 상품도 있음 (가격 0)

    // 상세설명 이미지 (lazy-load): data-src="//cafe24.poxo.com/.../NNEditor/..."
    const dataSrcMatches = html.match(/data-src=["']([^"']+)["']/g) || [];
    const detailImages = [];
    for (const m of dataSrcMatches) {
        const url = m.replace(/^data-src=["']/, '').replace(/["']$/, '');
        // 상품 상세 설명 이미지 (NNEditor 혹은 product/big 경로)만
        if (/NNEditor|\/web\/product\/(big|medium|extra)/.test(url)) {
            detailImages.push(absUrl(url));
        }
    }
    // 중복 제거 (대표 이미지는 따로 관리하므로 제외)
    const uniqueDetailImages = [...new Set(detailImages)].filter(u => u !== mainImage);

    // 사이즈 옵션 추출: <select name="option1" ...>...<option value="P..." link_image="">S</option>...
    const options = [];
    // select name="option1" 또는 "option2" ...
    const optSelects = html.match(/<select[^>]*name=["']option\d+["'][^>]*>[\s\S]*?<\/select>/gi) || [];
    for (const sel of optSelects) {
        const titleM = sel.match(/option_title=["']([^"']+)["']/);
        const optionType = titleM ? decodeEntities(titleM[1]).trim() : 'size';
        // <option value="P0000FHI000A"  link_image="">S</option>
        const optMatches = sel.match(/<option\s+value=["']P[0-9A-Z]+["'][^>]*>([^<]+)<\/option>/g) || [];
        for (const o of optMatches) {
            const valM = o.match(/>([^<]+)<\/option>/);
            if (!valM) continue;
            const val = decodeEntities(valM[1]).trim();
            // 빈 값, "선택하세요", 구분선 스킵
            if (!val || /^-+/.test(val) || /선택/.test(val)) continue;
            options.push({ type: optionType, value: val });
        }
    }

    // 상품코드: 카페24 상품 상세에 "상품코드" 텍스트로 노출되는 경우가 있음
    // 간단히 xans-product-detail 내부의 code 패턴 검색
    // 예: <span class="xans-product-detaildesign"> ... </span>
    // 보통 상품코드가 없으므로 빈 문자열로 두고 product_no를 sku로 활용
    const sku = `CAFE24-${productNo}`;

    return {
        cafe24Id: parseInt(productNo, 10),
        sku,
        name,
        description,
        price,
        mainImage,
        detailImages: uniqueDetailImages,
        options,
    };
}

// ------------------------------------------------------------
// 메인 실행
// ------------------------------------------------------------

async function main() {
    console.log('[scrape-cafe24] 시작');
    console.log(`  출력 파일: ${OUT_PATH}`);
    console.log(`  대상 카테고리: ${CATEGORIES.length}개`);

    // 1단계: 모든 카테고리에서 product_no 목록 수집
    // productNo -> { productNo, categories: [slug...] } 형태로 병합
    const productMap = new Map();
    for (const cat of CATEGORIES) {
        const items = await collectCategoryProducts(cat);
        for (const it of items) {
            if (productMap.has(it.productNo)) {
                // 이미 있으면 categories 리스트에 추가 (시즌오프 등 중복 상품)
                productMap.get(it.productNo).categories.push(cat.slug);
            } else {
                productMap.set(it.productNo, {
                    productNo: it.productNo,
                    categories: [cat.slug],
                });
            }
        }
        await sleep(DELAY_MS);
    }

    const totalProducts = productMap.size;
    console.log(`\n[수집 완료] 총 유니크 상품: ${totalProducts}개`);

    // 2단계: 각 상품 상세 페이지 파싱
    console.log('\n[상세 페이지 파싱 시작]');
    const results = [];
    let i = 0;
    for (const [productNo, info] of productMap) {
        i++;
        const url = `${BASE}/product/detail.html?product_no=${productNo}`;
        const html = await safeFetch(url);
        if (!html) {
            console.warn(`  [${i}/${totalProducts}] ${productNo} :: 페이지 로드 실패`);
            await sleep(DELAY_MS);
            continue;
        }
        try {
            const parsed = parseDetailPage(html, productNo);
            // 첫 번째 카테고리를 primary, 나머지는 extraCategories로 저장
            parsed.categorySlug = info.categories[0];
            parsed.extraCategories = info.categories.slice(1);
            results.push(parsed);
            const pct = ((i / totalProducts) * 100).toFixed(1);
            process.stdout.write(`  [${i}/${totalProducts}] (${pct}%) ${parsed.name || productNo} (img=${parsed.detailImages.length}, opt=${parsed.options.length})\n`);
        } catch (e) {
            console.warn(`  [${i}/${totalProducts}] ${productNo} :: 파싱 에러 ${e.message}`);
        }
        // 중간 저장 (매 50개마다) — 긴 작업 중 끊겨도 복구 가능
        if (i % 50 === 0) {
            fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
            console.log(`  [중간 저장] ${i}개 저장됨`);
        }
        await sleep(DELAY_MS);
    }

    // 최종 저장
    fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n[완료] ${results.length}개 상품을 ${OUT_PATH}에 저장`);

    // 요약 통계
    const withImages = results.filter(p => p.detailImages.length > 0).length;
    const withOptions = results.filter(p => p.options.length > 0).length;
    const withPrice = results.filter(p => p.price > 0).length;
    console.log(`  - 가격 있는 상품: ${withPrice}/${results.length}`);
    console.log(`  - 상세 이미지 있는 상품: ${withImages}/${results.length}`);
    console.log(`  - 옵션 있는 상품: ${withOptions}/${results.length}`);
}

main().catch(e => {
    console.error('[FATAL]', e);
    process.exit(1);
});
