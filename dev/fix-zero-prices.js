/**
 * 0원 상품 가격 복구 스크립트 (W-1)
 * ----------------------------------
 * 왜 필요한가:
 *   v1 스크래핑에서 가격을 제대로 가져오지 못해 100개 상품이 price=0, isConsultPrice=0으로 남아있다.
 *   이 상태면 쇼핑몰에서 "0원"으로 노출될 수 있다.
 *
 * 동작:
 *   1) cafe24Id가 있는 상품 → stiz.kr 상세 페이지에서 JSON-LD 가격 재확인
 *   2) cafe24Id가 없는 상품 → price-sheet.csv에서 상품명으로 가격 매칭
 *   3) dry-run → 결과 출력 → apply 모드로 DB 업데이트
 *
 * 사용:
 *   node dev/fix-zero-prices.js            → dry-run (확인만)
 *   node dev/fix-zero-prices.js --apply    → 실제 DB 업데이트
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'server', 'data', 'stiz.db');
const CSV_PATH = path.join(__dirname, 'price-sheet.csv');

// --apply 플래그 확인
const isApply = process.argv.includes('--apply');

// ============================================================
// 유틸: 가격 파싱 (scrape-cafe24-v2.js에서 검증된 로직 재사용)
// ============================================================

/**
 * 가격 문자열을 분석하여 숫자 또는 "상담" 여부를 판정
 * 비유: 가격표에 숫자가 적혀있으면 숫자를, "문의"라고 적혀있으면 상담 플래그를 반환
 */
function parsePrice(priceValue) {
    if (priceValue === null || priceValue === undefined) {
        return { price: 0, isConsultPrice: 0 };
    }
    if (typeof priceValue === 'number') {
        return { price: Math.round(priceValue), isConsultPrice: 0 };
    }
    const s = String(priceValue).trim();
    // 숫자만 있거나 숫자+콤마 형태 → 정수로 변환
    if (/^[0-9,]+(\.[0-9]+)?$/.test(s)) {
        return { price: parseInt(s.replace(/,/g, ''), 10) || 0, isConsultPrice: 0 };
    }
    // "상담 후 결제", "문의", "별도 문의" 등 → 상담 상품
    return { price: 0, isConsultPrice: 1 };
}

/**
 * JSON-LD 블록 안전 추출 (scrape-cafe24-v2.js에서 검증된 로직)
 */
function extractJsonLd(html) {
    const m = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return null;
    const raw = m[1].trim();
    try {
        return JSON.parse(raw);
    } catch (e) {
        // JSON 파싱 실패 시 정규식으로 price만 추출
        const offersPriceMatch = raw.match(/"offers"[\s\S]*?"price"\s*:\s*"([^"]+)"/);
        return offersPriceMatch ? { offers: { price: offersPriceMatch[1] } } : null;
    }
}

// ============================================================
// 1단계: cafe24Id 있는 상품 — stiz.kr에서 가격 스크래핑
// ============================================================

async function fetchCafe24Price(cafe24Id) {
    const url = `https://stiz.kr/product/detail.html?product_no=${cafe24Id}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return { price: 0, isConsultPrice: 0, error: `HTTP ${res.status}` };

        const html = await res.text();
        const ld = extractJsonLd(html);

        if (ld && ld.offers && ld.offers.price !== undefined) {
            return parsePrice(ld.offers.price);
        }

        // JSON-LD 실패 시 og:price:amount 메타 태그로 폴백
        const metaMatch = html.match(/<meta\s+property="product:price:amount"\s+content="([^"]+)"/i);
        if (metaMatch) {
            return parsePrice(metaMatch[1]);
        }

        return { price: 0, isConsultPrice: 0, error: 'price not found in page' };
    } catch (err) {
        return { price: 0, isConsultPrice: 0, error: err.message };
    }
}

// ============================================================
// 2단계: cafe24Id 없는 상품 — price-sheet.csv에서 이름 매칭
// ============================================================

/**
 * CSV 파싱 (쉼표 구분, 큰따옴표 지원)
 * 비유: 엑셀에서 상품명과 판매가 열을 찾아 읽는 것
 */
function loadPriceSheet() {
    if (!fs.existsSync(CSV_PATH)) {
        console.log('[CSV] price-sheet.csv 없음 — cafe24Id 없는 상품은 건너뜀');
        return [];
    }

    const raw = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = raw.split('\n');

    // 헤더에서 "제품명"과 "판매가" 열 위치 파악
    const header = parseCSVLine(lines[0]);
    const nameIdx = header.findIndex(h => h.includes('제품명'));
    const priceIdx = header.findIndex(h => h === '판매가');

    if (nameIdx === -1 || priceIdx === -1) {
        console.log('[CSV] 헤더에서 제품명/판매가 열을 찾지 못함');
        return [];
    }

    const entries = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = parseCSVLine(lines[i]);
        const name = (cols[nameIdx] || '').trim();
        const priceStr = (cols[priceIdx] || '').trim();
        if (name && priceStr) {
            entries.push({ name, ...parsePrice(priceStr) });
        }
    }

    console.log(`[CSV] price-sheet.csv에서 ${entries.length}개 항목 로드됨`);
    return entries;
}

/**
 * 간단한 CSV 라인 파서 — 큰따옴표 안의 쉼표는 무시
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * 상품명 유사도 매칭 — 정확히 일치하거나 포함 관계로 매칭
 * 비유: 엑셀에서 VLOOKUP을 하되, 정확히 같은 이름이 없으면 가장 비슷한 것으로 찾기
 */
function findInPriceSheet(productName, priceSheet) {
    // 1순위: 정확히 일치
    const exact = priceSheet.find(e => e.name === productName);
    if (exact) return exact;

    // 2순위: DB 상품명이 CSV 이름을 포함하거나 그 반대
    const partial = priceSheet.find(e =>
        productName.includes(e.name) || e.name.includes(productName)
    );
    if (partial) return partial;

    return null;
}

// ============================================================
// 메인 실행
// ============================================================

async function main() {
    console.log('=== 0원 상품 가격 복구 스크립트 ===');
    console.log(`모드: ${isApply ? 'APPLY (실제 DB 업데이트)' : 'DRY-RUN (확인만)'}`);
    console.log('');

    const db = new Database(DB_PATH);

    // price=0이고 isConsultPrice=0인 상품 전체 조회
    const zeroProducts = db.prepare(
        "SELECT id, name, cafe24Id, price, isConsultPrice FROM products WHERE price = 0 AND isConsultPrice = 0"
    ).all();

    console.log(`총 0원 상품: ${zeroProducts.length}개`);

    // cafe24Id 유무로 분류
    const withCafe24 = zeroProducts.filter(p => p.cafe24Id);
    const withoutCafe24 = zeroProducts.filter(p => !p.cafe24Id);

    console.log(`  - cafe24Id 있음: ${withCafe24.length}개 (stiz.kr 스크래핑)`);
    console.log(`  - cafe24Id 없음: ${withoutCafe24.length}개 (price-sheet.csv 매칭)`);
    console.log('');

    // 결과 수집
    const updates = [];  // { id, name, newPrice, newIsConsultPrice, source }
    const failures = []; // { id, name, reason }

    // --- Part A: cafe24Id 있는 상품 스크래핑 ---
    console.log('--- Part A: stiz.kr 스크래핑 시작 ---');
    for (let i = 0; i < withCafe24.length; i++) {
        const p = withCafe24[i];
        const result = await fetchCafe24Price(p.cafe24Id);

        if (result.error) {
            // 스크래핑 실패한 상품도 isConsultPrice=1로 설정 (0원 노출 방지)
            updates.push({
                id: p.id, name: p.name,
                newPrice: 0, newIsConsultPrice: 1,
                source: `stiz.kr 실패 (${result.error}) → isConsultPrice=1`
            });
            console.log(`  [${i + 1}/${withCafe24.length}] FAIL→CONSULT: ${p.name} — ${result.error}`);
        } else if (result.price > 0) {
            updates.push({
                id: p.id, name: p.name,
                newPrice: result.price, newIsConsultPrice: 0,
                source: `stiz.kr (cafe24Id=${p.cafe24Id})`
            });
            console.log(`  [${i + 1}/${withCafe24.length}] OK: ${p.name} → ${result.price}원`);
        } else if (result.isConsultPrice) {
            updates.push({
                id: p.id, name: p.name,
                newPrice: 0, newIsConsultPrice: 1,
                source: `stiz.kr (cafe24Id=${p.cafe24Id}, 상담상품)`
            });
            console.log(`  [${i + 1}/${withCafe24.length}] CONSULT: ${p.name} → 상담 후 결제`);
        } else {
            failures.push({ id: p.id, name: p.name, reason: 'price=0 on stiz.kr too' });
            console.log(`  [${i + 1}/${withCafe24.length}] ZERO: ${p.name} — stiz.kr에서도 0원`);
        }

        // 500ms 딜레이 — stiz.kr 서버 부담 방지
        if (i < withCafe24.length - 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // --- Part B: cafe24Id 없는 상품 — CSV 매칭 ---
    console.log('');
    console.log('--- Part B: price-sheet.csv 매칭 시작 ---');
    const priceSheet = loadPriceSheet();

    for (const p of withoutCafe24) {
        const match = findInPriceSheet(p.name, priceSheet);
        if (match && match.price > 0) {
            updates.push({
                id: p.id, name: p.name,
                newPrice: match.price, newIsConsultPrice: 0,
                source: `CSV: "${match.name}" → ${match.price}원`
            });
            console.log(`  CSV OK: ${p.name} → ${match.price}원`);
        } else if (match && match.isConsultPrice) {
            updates.push({
                id: p.id, name: p.name,
                newPrice: 0, newIsConsultPrice: 1,
                source: `CSV: "${match.name}" → 상담상품`
            });
            console.log(`  CSV CONSULT: ${p.name} → 상담 후 결제`);
        } else {
            // CSV에서도 못 찾으면 → 신상품이라 가격 미정 → isConsultPrice=1로 설정
            updates.push({
                id: p.id, name: p.name,
                newPrice: 0, newIsConsultPrice: 1,
                source: '매칭 실패 → isConsultPrice=1 (가격 미정)'
            });
            console.log(`  NO MATCH: ${p.name} → isConsultPrice=1로 설정 (가격 미정)`);
        }
    }

    // --- 결과 요약 ---
    console.log('');
    console.log('=== 결과 요약 ===');
    const priceFound = updates.filter(u => u.newPrice > 0).length;
    const consultSet = updates.filter(u => u.newIsConsultPrice === 1).length;
    console.log(`  가격 복구: ${priceFound}개`);
    console.log(`  상담 설정: ${consultSet}개`);
    console.log(`  실패: ${failures.length}개`);

    if (failures.length > 0) {
        console.log('');
        console.log('--- 실패 목록 ---');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.reason}`));
    }

    // --- DB 업데이트 (apply 모드만) ---
    if (isApply && updates.length > 0) {
        console.log('');
        console.log('=== DB 업데이트 실행 ===');

        const updateStmt = db.prepare(
            'UPDATE products SET price = ?, isConsultPrice = ?, updatedAt = ? WHERE id = ?'
        );
        const now = new Date().toISOString();

        // 트랜잭션으로 일괄 처리 — 하나라도 실패하면 전체 롤백
        const transaction = db.transaction(() => {
            let count = 0;
            for (const u of updates) {
                updateStmt.run(u.newPrice, u.newIsConsultPrice, now, u.id);
                count++;
            }
            return count;
        });

        const updated = transaction();
        console.log(`  ${updated}개 상품 업데이트 완료!`);

        // 업데이트 후 검증
        const remaining = db.prepare(
            "SELECT COUNT(*) as cnt FROM products WHERE price = 0 AND isConsultPrice = 0"
        ).get();
        console.log(`  남은 0원 상품: ${remaining.cnt}개`);
    } else if (!isApply) {
        console.log('');
        console.log('※ dry-run 모드입니다. 실제 적용하려면: node dev/fix-zero-prices.js --apply');
    }

    db.close();
}

main().catch(console.error);
