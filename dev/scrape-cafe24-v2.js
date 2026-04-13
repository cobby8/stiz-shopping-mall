/**
 * stiz.kr (카페24) 상품 스크래퍼 v2 — Part 11
 * -------------------------------------------------
 * 왜 v2가 필요한가:
 *   v1 스크립트는 product:price:amount 메타(할인가)만 읽어서 진짜 가격을 놓쳤고,
 *   상세 HTML / 브랜드 / 원산지 / 상품정보고시를 전혀 수집하지 못했다.
 *
 *   v2 는 다음을 해결한다:
 *   - schema.org JSON-LD 를 1순위 데이터 원천으로 사용 (name/price/brand/description/image)
 *   - price 필드가 "상담 후 결제" 같은 문자열이면 isConsultPrice=1 로 표시
 *   - id="detailImage" 영역 전체를 detailHtml 로 저장 (ec-data-src 이미지 포함)
 *   - detailImages 배열은 ec-data-src / data-src 양쪽 모두 수집
 *
 * 사용:
 *   node dev/scrape-cafe24-v2.js              → 전체 카테고리 스크래핑
 *   node dev/scrape-cafe24-v2.js --sample     → 기획서의 5개 샘플만
 *   node dev/scrape-cafe24-v2.js --ids=744,719,3344  → 지정 ID만
 *
 * 출력:
 *   dev/cafe24-products-v2.json  (전체)
 *   dev/cafe24-sample-v2.json    (샘플 모드)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// 설정
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// 하위 카테고리 매핑 (cafe24 cate_no → DB product_categories.id)
// ------------------------------------------------------------
// 왜 필요한가:
//   v1 은 대분류만 스캔했다. stiz.kr 좌측 트리에는 각 대분류 아래 세부 선반이 있는데,
//   예컨대 BASKETBALL 안에 "HERITAGE / PRO / REVERSIBLE" 이 따로 있다.
//   이 세부 선반을 추가로 순회해 각 상품에 subCategoryId 를 붙여주면
//   import 단계에서 훨씬 정확한 카테고리로 등록할 수 있다.
// 주의:
//   203 (tracktop) 은 DB 에서 이미 다른 용도로 선점되어 있다 → 기획 지시에 따라
//   이 스크래퍼에서는 별도 sub 로 취급하지 않고 대분류 teamwear(103)에 귀속시킨다.
const SUB_CATEGORIES = [
    // 농구 (100) → 110~112
    { cafe24CateNo: 261, dbCategoryId: 110, parentSlug: 'basketball', name: 'HERITAGE' },
    { cafe24CateNo: 266, dbCategoryId: 111, parentSlug: 'basketball', name: 'PRO' },
    { cafe24CateNo: 196, dbCategoryId: 112, parentSlug: 'basketball', name: 'REVERSIBLE' },
    // 축구 (101) → 113~114
    { cafe24CateNo: 263, dbCategoryId: 113, parentSlug: 'soccer', name: 'SOCCER 2023' },
    { cafe24CateNo: 268, dbCategoryId: 114, parentSlug: 'soccer', name: 'SOCCER 2024' },
    // 팀웨어 (103) → 115~119 (118 tracktop 은 제외)
    { cafe24CateNo: 204, dbCategoryId: 115, parentSlug: 'teamwear', name: 'T-SHIRT' },
    { cafe24CateNo: 201, dbCategoryId: 116, parentSlug: 'teamwear', name: 'SHOOTING SHIRT' },
    { cafe24CateNo: 200, dbCategoryId: 117, parentSlug: 'teamwear', name: 'SHOOTING JERSEY' },
    // 203 → teamwear 대분류 (118 은 선점된 자리라 subCategoryId 부여 안 함)
    { cafe24CateNo: 284, dbCategoryId: 119, parentSlug: 'teamwear', name: 'HOODIE' },
    // 컴프레션 (104) → 120~123
    { cafe24CateNo: 210, dbCategoryId: 120, parentSlug: 'compression', name: 'TOP' },
    { cafe24CateNo: 217, dbCategoryId: 121, parentSlug: 'compression', name: 'ARM SLEEVE' },
    { cafe24CateNo: 265, dbCategoryId: 122, parentSlug: 'compression', name: 'KIDS' },
    { cafe24CateNo: 211, dbCategoryId: 123, parentSlug: 'compression', name: 'BOTTOM' },
    // 캐주얼 (106) → 124~127
    { cafe24CateNo: 212, dbCategoryId: 124, parentSlug: 'casual', name: 'LONG SLEEVE' },
    { cafe24CateNo: 216, dbCategoryId: 125, parentSlug: 'casual', name: 'SHORT SLEEVE' },
    { cafe24CateNo: 232, dbCategoryId: 126, parentSlug: 'casual', name: 'PANTS' },
    { cafe24CateNo: 233, dbCategoryId: 127, parentSlug: 'casual', name: 'SHORTS' },
    // MD (108) → 128~129
    { cafe24CateNo: 254, dbCategoryId: 128, parentSlug: 'md-picks', name: 'MD ITEMS' },
    { cafe24CateNo: 259, dbCategoryId: 129, parentSlug: 'md-picks', name: 'MD CUSTOM' },
];

const BASE = 'https://stiz.kr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DELAY_MS = 500;

// Part 11 기획에서 지정한 5개 검수 샘플
const SAMPLE_IDS = ['744', '719', '3344', '3448', '3817'];

// ------------------------------------------------------------
// 유틸
// ------------------------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return BASE + u;
    return u;
}

// JSON-LD 블록을 안전하게 추출 — "상담 후 결제" 같은 비-JSON-호환 price 문자열도 지원
// 비유: 편지 봉투 안의 정해진 양식지를 꺼내 읽는 것. 양식지의 한 줄이 깨져 있어도 필요한 정보는 직접 골라서 빼낸다.
function extractJsonLd(html) {
    const m = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return null;
    const raw = m[1].trim();

    // 우선 JSON.parse 시도
    try {
        // price 값이 숫자가 아닌 한글(예: "상담 후 결제")이어도 이미 문자열로 들어있으니 파싱 자체는 가능
        return JSON.parse(raw);
    } catch (e) {
        // 혹시 JSON 오류가 나면 정규식 기반 필드 추출로 폴백
        const pick = (key) => {
            const r = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`);
            return (raw.match(r) || [, ''])[1];
        };
        const brandMatch = raw.match(/"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
        const offersPriceMatch = raw.match(/"offers"[\s\S]*?"price"\s*:\s*"([^"]+)"/);
        const imagesMatch = raw.match(/"image"\s*:\s*\[([^\]]+)\]/);
        return {
            name: pick('name'),
            description: pick('description'),
            brand: brandMatch ? { name: brandMatch[1] } : null,
            offers: offersPriceMatch ? { price: offersPriceMatch[1] } : null,
            image: imagesMatch ? imagesMatch[1].match(/"[^"]+"/g).map(s => s.replace(/"/g, '')) : [],
        };
    }
}

// 가격 문자열 판정: 숫자면 정수, "상담 후 결제" 등 문자면 consultPrice=true
// 비유: 가격표에 숫자 대신 "문의" 라고 적혀 있으면 그대로 "문의" 임을 기록한다.
function parsePrice(priceValue) {
    if (priceValue === null || priceValue === undefined) {
        return { price: 0, isConsultPrice: 0 };
    }
    if (typeof priceValue === 'number') {
        return { price: Math.round(priceValue), isConsultPrice: 0 };
    }
    const s = String(priceValue).trim();
    // 숫자만 있거나 숫자+콤마 형태
    if (/^[0-9,]+(\.[0-9]+)?$/.test(s)) {
        return { price: parseInt(s.replace(/,/g, ''), 10) || 0, isConsultPrice: 0 };
    }
    // "상담 후 결제", "문의", "별도 문의" 등 한글 포함 → 상담 상품
    return { price: 0, isConsultPrice: 1 };
}

// id="detailImage" 블록을 추출한다 (상세 설명 HTML)
// 비유: 한 페이지 안의 특정 라벨이 붙은 봉투만 찾아서 통째로 꺼낸다.
function extractDetailHtml(html) {
    const idx = html.indexOf('id="detailImage"');
    if (idx === -1) return '';
    // div 시작 앞쪽의 < 위치 찾기
    const divStart = html.lastIndexOf('<div', idx);
    if (divStart === -1) return '';
    // div depth 추적하며 매칭되는 </div> 찾기
    let depth = 0;
    let pos = divStart;
    const len = html.length;
    while (pos < len) {
        const nextOpen = html.indexOf('<div', pos + 1);
        const nextClose = html.indexOf('</div>', pos + 1);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            pos = nextOpen;
        } else {
            if (depth === 0) {
                // 이 </div> 가 매칭되는 닫는 태그
                return html.substring(divStart, nextClose + 6);
            }
            depth--;
            pos = nextClose;
        }
    }
    return '';
}

// detailHtml 에서 이미지 URL 목록 추출 (ec-data-src + data-src + src 순)
function extractImagesFromDetail(detailHtml) {
    if (!detailHtml) return [];
    const urls = [];
    // ec-data-src
    const ecMatches = detailHtml.match(/ec-data-src=["']([^"']+)["']/g) || [];
    for (const m of ecMatches) {
        const u = m.replace(/^ec-data-src=["']/, '').replace(/["']$/, '');
        urls.push(absUrl(u));
    }
    // data-src (중복 방지)
    const dsMatches = detailHtml.match(/data-src=["']([^"']+)["']/g) || [];
    for (const m of dsMatches) {
        const u = m.replace(/^data-src=["']/, '').replace(/["']$/, '');
        urls.push(absUrl(u));
    }
    // src (lazy 가 아닌 즉시 src 도 포함)
    const srcMatches = detailHtml.match(/<img[^>]*\ssrc=["']([^"']+)["']/g) || [];
    for (const m of srcMatches) {
        const u = m.replace(/^.*\ssrc=["']/, '').replace(/["']$/, '');
        // placeholder / 스페이서 / 아이콘 제외
        if (/NNEditor|web\/product\/(big|medium|extra)|web\/upload/.test(u)) {
            urls.push(absUrl(u));
        }
    }
    return [...new Set(urls)];
}

// ------------------------------------------------------------
// 상세 페이지 파싱 (v2)
// ------------------------------------------------------------
function parseDetailPageV2(html, productNo) {
    // 1) JSON-LD 로 기본 정보
    const ld = extractJsonLd(html) || {};
    let name = ld.name ? decodeEntities(String(ld.name)).trim() : '';
    name = name.replace(/^STIZ\s*\|\s*/i, '').trim();

    const description = ld.description ? decodeEntities(String(ld.description)).trim() : '';
    const brand = (ld.brand && ld.brand.name) ? String(ld.brand.name).trim() : '';
    const ldImages = Array.isArray(ld.image) ? ld.image : (ld.image ? [ld.image] : []);
    const mainImage = ldImages.length > 0 ? absUrl(ldImages[0]) : '';

    // 2) 가격
    const priceRaw = (ld.offers && ld.offers.price !== undefined) ? ld.offers.price : null;
    const { price, isConsultPrice } = parsePrice(priceRaw);

    // 3) og:image 보조 (JSON-LD 에 없으면)
    let fallbackMain = mainImage;
    if (!fallbackMain) {
        const og = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (og) fallbackMain = absUrl(og[1]);
    }

    // 4) 상세 HTML (detailImage div)
    const detailHtml = extractDetailHtml(html);
    const detailImages = extractImagesFromDetail(detailHtml);

    // 5) 상품정보고시(원산지/제조사/모델명) — stiz.kr 에는 대부분 없음
    //    있으면 prdInfo 테이블 또는 dt/dd 형태. 우선 빈 값으로 두고 v2 import 후 수동 보강
    const origin = '';       // 향후 카페24 관리자에서 추가되면 확장 포인트
    const modelName = '';
    const manufacturer = '';

    // 6) 사이즈 옵션
    const options = [];
    const optSelects = html.match(/<select[^>]*name=["']option\d+["'][^>]*>[\s\S]*?<\/select>/gi) || [];
    for (const sel of optSelects) {
        const titleM = sel.match(/option_title=["']([^"']+)["']/);
        const optionType = titleM ? decodeEntities(titleM[1]).trim() : 'size';
        const optMatches = sel.match(/<option\s+value=["']P[0-9A-Z]+["'][^>]*>([^<]+)<\/option>/g) || [];
        for (const o of optMatches) {
            const valM = o.match(/>([^<]+)<\/option>/);
            if (!valM) continue;
            const val = decodeEntities(valM[1]).trim();
            if (!val || /^-+/.test(val) || /선택/.test(val)) continue;
            options.push({ type: optionType, value: val });
        }
    }

    return {
        cafe24Id: parseInt(productNo, 10),
        sku: `CAFE24-${productNo}`,
        name,
        description,
        brand,
        origin,
        modelName,
        manufacturer,
        price,
        isConsultPrice,
        mainImage: fallbackMain,
        detailHtml,
        detailImages,
        options,
    };
}

// ------------------------------------------------------------
// 카테고리 페이지 수집 (v1과 동일)
// ------------------------------------------------------------
function parseListPage(html) {
    const listIdx = html.indexOf('xans-product-listnormal');
    const endIdx = html.indexOf('xans-product-normalpaging', listIdx);
    if (listIdx === -1) return [];
    const slice = html.substring(listIdx, endIdx > listIdx ? endIdx : html.length);
    const matches = slice.match(/anchorBoxName_(\d+)/g) || [];
    return [...new Set(matches.map(m => m.replace('anchorBoxName_', '')))];
}

function parseMaxPage(html) {
    const pagingIdx = html.indexOf('xans-product-normalpaging');
    if (pagingIdx === -1) return 1;
    const slice = html.substring(pagingIdx, pagingIdx + 5000);
    const pageNums = (slice.match(/page=(\d+)/g) || []).map(s => parseInt(s.split('=')[1], 10));
    if (pageNums.length === 0) return 1;
    return Math.max(...pageNums);
}

async function collectCategoryProducts(cat) {
    console.log(`\n[카테고리] ${cat.name} (cate_no=${cat.id})`);
    const html1 = await safeFetch(`${BASE}/product/list.html?cate_no=${cat.id}`);
    if (!html1) return [];
    const maxPage = parseMaxPage(html1);
    console.log(`  페이지 수: ${maxPage}`);
    const all = new Set(parseListPage(html1));
    for (let p = 2; p <= maxPage; p++) {
        await sleep(DELAY_MS);
        const html = await safeFetch(`${BASE}/product/list.html?cate_no=${cat.id}&page=${p}`);
        if (!html) continue;
        parseListPage(html).forEach(id => all.add(id));
    }
    console.log(`  → 총 ${all.size}개`);
    return [...all].map(pno => ({ productNo: pno, categorySlug: cat.slug, categoryName: cat.name }));
}

// ------------------------------------------------------------
// 메인
// ------------------------------------------------------------
async function main() {
    const args = process.argv.slice(2);
    const isSample = args.includes('--sample');
    const idsArg = args.find(a => a.startsWith('--ids='));
    const explicitIds = idsArg ? idsArg.replace('--ids=', '').split(',').filter(Boolean) : null;

    let targetIds = null;   // Set<string> | null
    let outFile;

    if (explicitIds) {
        targetIds = new Set(explicitIds);
        outFile = path.join(__dirname, 'cafe24-scraped-ids.json');
        console.log(`[모드] 지정 ID ${explicitIds.length}개`);
    } else if (isSample) {
        targetIds = new Set(SAMPLE_IDS);
        outFile = path.join(__dirname, 'cafe24-sample-v2.json');
        console.log(`[모드] 샘플 ${SAMPLE_IDS.length}개`);
    } else {
        outFile = path.join(__dirname, 'cafe24-products-v2.json');
        console.log('[모드] 전체 카테고리');
    }

    // 상세 페이지 대상 id 목록 결정
    let productList;    // [{ productNo, categorySlug, categoryName }]
    if (targetIds) {
        // 샘플/지정 모드: 카테고리 스캔 생략, 바로 상세 요청
        productList = [...targetIds].map(pno => ({
            productNo: pno,
            categorySlug: 'sample',
            categoryName: 'sample',
        }));
    } else {
        // 전체 모드: 대분류 → 하위 카테고리 순서로 순회하며 productMap 구성
        // productMap: productNo → { categories: [slug], subCategoryIds: [id] }
        // 왜 둘 다 저장: 대분류 slug 로는 기존 import 로직 호환성 유지, subCategoryIds 는 신규 정밀 매핑용
        const productMap = new Map();

        // (1) 대분류 스캔 — 기존 로직
        for (const cat of CATEGORIES) {
            const items = await collectCategoryProducts(cat);
            for (const it of items) {
                if (productMap.has(it.productNo)) {
                    productMap.get(it.productNo).categories.push(cat.slug);
                } else {
                    productMap.set(it.productNo, {
                        productNo: it.productNo,
                        categories: [cat.slug],
                        subCategoryIds: [],
                    });
                }
            }
            await sleep(DELAY_MS);
        }

        // (2) 하위 카테고리 추가 스캔 — 각 cate_no 로 list.html 재조회
        // 비유: 큰 서랍(대분류)을 한 번 본 뒤, 서랍 안의 작은 칸(하위)을 한 번 더 열어본다.
        console.log(`\n[하위 카테고리] ${SUB_CATEGORIES.length}개 추가 스캔`);
        for (const sub of SUB_CATEGORIES) {
            const cat = { id: sub.cafe24CateNo, slug: sub.parentSlug, name: `${sub.parentSlug}/${sub.name}` };
            const items = await collectCategoryProducts(cat);
            for (const it of items) {
                const entry = productMap.get(it.productNo);
                if (entry) {
                    // 이미 대분류 스캔에서 발견된 상품 — subCategoryId 만 추가
                    if (!entry.subCategoryIds.includes(sub.dbCategoryId)) {
                        entry.subCategoryIds.push(sub.dbCategoryId);
                    }
                } else {
                    // 대분류 스캔에서 누락된 상품 — 하위에서 처음 발견
                    productMap.set(it.productNo, {
                        productNo: it.productNo,
                        categories: [sub.parentSlug],
                        subCategoryIds: [sub.dbCategoryId],
                    });
                }
            }
            await sleep(DELAY_MS);
        }

        productList = [...productMap.values()].map(v => ({
            productNo: v.productNo,
            categorySlug: v.categories[0],
            extraCategories: v.categories.slice(1),
            // 여러 하위 카테고리에 걸친 경우 첫 번째를 주 subCategoryId 로 사용
            subCategoryId: v.subCategoryIds[0] || null,
            extraSubCategoryIds: v.subCategoryIds.slice(1),
        }));
    }

    console.log(`\n[파싱 시작] 총 ${productList.length}개`);
    const results = [];
    for (let i = 0; i < productList.length; i++) {
        const info = productList[i];
        const url = `${BASE}/product/detail.html?product_no=${info.productNo}`;
        const html = await safeFetch(url);
        if (!html) {
            console.warn(`  [${i + 1}/${productList.length}] ${info.productNo} :: 페이지 로드 실패`);
            await sleep(DELAY_MS);
            continue;
        }
        try {
            const parsed = parseDetailPageV2(html, info.productNo);
            parsed.categorySlug = info.categorySlug;
            if (info.extraCategories) parsed.extraCategories = info.extraCategories;
            // 하위 카테고리 id 기록 — import 단계에서 이 id 가 있으면 대분류 대신 우선 사용
            if (info.subCategoryId) parsed.subCategoryId = info.subCategoryId;
            if (info.extraSubCategoryIds && info.extraSubCategoryIds.length > 0) {
                parsed.extraSubCategoryIds = info.extraSubCategoryIds;
            }
            results.push(parsed);
            const mark = parsed.isConsultPrice ? '상담' : `${parsed.price}원`;
            console.log(`  [${i + 1}/${productList.length}] ${info.productNo} ${parsed.name || '(no name)'} | ${mark} | img=${parsed.detailImages.length} | detail=${parsed.detailHtml.length}자`);
        } catch (e) {
            console.warn(`  [${i + 1}/${productList.length}] ${info.productNo} :: 파싱 에러 ${e.message}`);
        }
        // 전체 모드에서는 50개마다 중간 저장
        if (!targetIds && (i + 1) % 50 === 0) {
            fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');
            console.log(`  [중간 저장] ${i + 1}개`);
        }
        await sleep(DELAY_MS);
    }

    fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n[완료] ${results.length}개 → ${outFile}`);

    // 요약 통계
    const withPrice = results.filter(p => p.price > 0).length;
    const withConsult = results.filter(p => p.isConsultPrice === 1).length;
    const withBrand = results.filter(p => p.brand).length;
    const withDetail = results.filter(p => p.detailHtml.length > 0).length;
    const withImages = results.filter(p => p.detailImages.length > 0).length;
    console.log(`  - 숫자 가격: ${withPrice}/${results.length}`);
    console.log(`  - 상담 후 결제: ${withConsult}/${results.length}`);
    console.log(`  - 브랜드 있음: ${withBrand}/${results.length}`);
    console.log(`  - 상세 HTML 있음: ${withDetail}/${results.length}`);
    console.log(`  - 상세 이미지 있음: ${withImages}/${results.length}`);
}

main().catch(e => {
    console.error('[FATAL]', e);
    process.exit(1);
});
