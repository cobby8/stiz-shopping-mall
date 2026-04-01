/**
 * Google Sheets 주문 데이터 임포트 스크립트
 * 비유: Google Sheets(엑셀)에 있는 주문 데이터를 우리 시스템 DB로 이사시키는 작업
 *
 * 사용법: node server/data/import-sheets.js
 * - Google Sheets에서 CSV를 다운로드하여 orders.json에 저장
 * - 기존 orders.json은 orders.json.bak으로 백업
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const BACKUP_FILE = path.join(__dirname, 'orders.json.bak');

// Google Sheets CSV 다운로드 URL (공개 시트)
// 비유: 하나의 엑셀 파일에 여러 시트(탭)가 있는 것처럼,
//       gid 값이 다르면 다른 시트를 가리킨다
// 여러 시트 파일을 순회하며 임포트 (연도별 시트가 다름)
const SHEET_SOURCES = [
    {
        name: '2026년 주문진행상황',
        base: 'https://docs.google.com/spreadsheets/d/1nKKsSwhEG5vl0XWXshQ34dajs7bc4_CpsVXml1QaBAw/export?format=csv',
        tabs: [
            { gid: '0', name: '2026-진행주문', defaultStatus: null },
            { gid: '618544926', name: '2026-완료주문(미수)', defaultStatus: 'delivered' },
            { gid: '1160190509', name: '2026-완료주문', defaultStatus: 'delivered' },
            { gid: '1148162040', name: '2026-주문보류', defaultStatus: 'hold' },
        ]
    },
    {
        name: '2025년 주문진행상황',
        base: 'https://docs.google.com/spreadsheets/d/1ZqUlr-yj6i7CJ7QpPiCv_-KbLixkf6uzZpNJx03eM1k/export?format=csv',
        tabs: [
            { gid: '618544926', name: '2025-완료주문(미수)', defaultStatus: 'delivered' },
            { gid: '1160190509', name: '2025-완료주문', defaultStatus: 'delivered' },
            { gid: '1148162040', name: '2025-주문보류', defaultStatus: 'hold' },
        ]
    },
    {
        name: '2024년 주문진행상황',
        base: 'https://docs.google.com/spreadsheets/d/1ckL_zeukVj4pM1keqSwacgoEaHr4Netw72qG2iDABHw/export?format=csv',
        tabs: [
            { gid: '0', name: '2024-진행주문', defaultStatus: 'delivered' },        // 13건 (오래된 진행건 → 완료 처리)
            { gid: '618544926', name: '2024-완료주문(미수)', defaultStatus: 'delivered' },  // 6건
            { gid: '1160190509', name: '2024-완료주문', defaultStatus: 'delivered' },       // ~453건
            { gid: '1148162040', name: '2024-주문보류', defaultStatus: 'hold' },            // 30건
        ]
    },
    {
        name: '2023년 주문진행상황',
        base: 'https://docs.google.com/spreadsheets/d/15lFEfsvl1zQxD7I5Z9DHSaM6ulo-uvAQVBi7bNwJWIM/export?format=csv',
        tabs: [
            // gid=0 (진행주문)은 비어있으므로 제외
            // 2023년은 gid가 다른 연도와 다름!
            { gid: '1580172219', name: '2023-완료주문(미수)', defaultStatus: 'delivered' },  // ~280건
            { gid: '2141413091', name: '2023-완료주문', defaultStatus: 'delivered' },        // ~300건
            { gid: '1986947150', name: '2023-주문보류', defaultStatus: 'hold' },             // 40건
        ]
    }
];

// ============================================================
// 1. CSV 다운로드 (리다이렉트 자동 처리)
// ============================================================

/**
 * HTTPS GET 요청 + 리다이렉트 따라가기
 * 비유: 링크를 클릭했는데 다른 페이지로 넘어가는 경우를 자동 처리
 */
function fetchUrl(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('리다이렉트 횟수 초과'));

        https.get(url, (res) => {
            // 301, 302 등 리다이렉트 응답이면 새 URL로 재요청
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location, maxRedirects - 1));
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            // 응답 데이터를 모아서 문자열로 반환
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// ============================================================
// 2. CSV 파싱 (외부 패키지 없이 직접 구현)
// ============================================================

/**
 * 헤더 컬럼명 정규화
 * 비유: Google Sheets에서 줄바꿈이 포함된 컬럼명("주문\n수량\n(pack)")을
 *       공백으로 이어붙여서 "주문 수량 (pack)"으로 만든다
 */
function normalizeHeader(h) {
    // 줄바꿈을 공백으로 치환하고 연속 공백 정리
    return h.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * CSV 텍스트를 객체 배열로 변환
 * 비유: 엑셀 파일을 행 단위로 읽어서 { 열이름: 값 } 형태로 만드는 것
 *
 * 주의: 큰따옴표 안의 콤마는 구분자가 아님 (예: 주소에 콤마가 포함될 수 있음)
 *       큰따옴표 안의 줄바꿈도 필드 값의 일부임
 */
function parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    // 한 글자씩 읽으면서 행을 분리 (큰따옴표 안의 줄바꿈은 필드 값으로 유지)
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            // 큰따옴표 토글 + raw 텍스트 그대로 보존
            if (inQuotes && text[i + 1] === '"') {
                current += '""'; // 이스케이프된 큰따옴표도 그대로 보존
                i++;
            } else {
                inQuotes = !inQuotes;
                current += '"'; // 큰따옴표 자체도 보존 (splitCSVLine에서 제거)
            }
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            // 줄바꿈이면 한 행 완성
            if (current.trim() && current.trim() !== ',') lines.push(current);
            current = '';
            // \r\n 처리
            if (ch === '\r' && text[i + 1] === '\n') i++;
        } else {
            current += ch;
        }
    }
    // 마지막 행 처리
    if (current.trim() && current.trim() !== ',') lines.push(current);

    if (lines.length < 2) return []; // 헤더만 있거나 빈 파일

    // 첫 번째 행 = 컬럼 헤더 (줄바꿈 포함 컬럼명 정규화 + 앞뒤 공백 제거)
    const rawHeaders = splitCSVLine(lines[0]);
    const headers = rawHeaders.map(h => normalizeHeader(h));

    // normalizeHeader에서 줄바꿈/공백이 자동 정리됨

    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = splitCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
            if (h) { // 빈 헤더(첫 번째 빈 컬럼) 건너뛰기
                row[h] = (values[idx] || '').trim();
            }
        });
        rows.push(row);
    }

    return rows;
}

/**
 * CSV 한 행을 필드 배열로 분리
 * 비유: "서울, 강남구" 같은 값에서 콤마를 구분자로 잘못 자르지 않도록 처리
 * 큰따옴표로 감싸진 필드는 내부의 콤마/줄바꿈을 그대로 유지
 */
function splitCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // 이스케이프된 큰따옴표
                current += '"';
                i++;
            } else {
                // 큰따옴표 토글 (값에는 포함하지 않음)
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current);
    return fields;
}

// ============================================================
// 3. 데이터 변환 매핑
// ============================================================

// 종목 한글 → 영문 매핑
const SPORT_MAP = {
    '농구': 'basketball',
    '축구': 'soccer',
    '배구': 'volleyball',
    '야구': 'baseball',
    '기타': 'other',
};

// 주문서/입금 → paymentType 매핑
const PAYMENT_TYPE_MAP = {
    '입금확인': 'deposit',
    '후결제': 'deferred',
    '후원': 'sponsor',
    '판매용': 'sale',
    '업로드': 'upload',
    '불량재제작': 'defect_remake',
};

// 거래방식 → transactionMethod 매핑
const TRANSACTION_MAP = {
    '현금': 'cash',
    '현금영수증': 'cash_receipt',
    '세금계산서': 'tax_invoice',
    '쇼핑몰': 'shopping_mall',
};

/**
 * YYMMDD 또는 YYYYMMDD 형식 날짜를 ISO 문자열로 변환
 * 비유: "260225" → "2026-02-25" 처럼 축약된 날짜를 정식 날짜로 바꾸는 것
 */
function parseDate(str) {
    if (!str || str.trim() === '') return '';

    const s = str.trim();
    let year, month, day;

    if (s.length === 6) {
        // YYMMDD → 20YY-MM-DD
        year = 2000 + parseInt(s.slice(0, 2), 10);
        month = s.slice(2, 4);
        day = s.slice(4, 6);
    } else if (s.length === 8) {
        // YYYYMMDD → YYYY-MM-DD
        year = parseInt(s.slice(0, 4), 10);
        month = s.slice(4, 6);
        day = s.slice(6, 8);
    } else {
        return ''; // 인식 불가 형식은 빈 문자열
    }

    return `${year}-${month}-${day}T00:00:00.000Z`;
}

/**
 * 콤마가 포함된 숫자 문자열을 정수로 변환
 * 비유: "80,000" → 80000 (쉼표를 제거하고 숫자만 추출)
 */
function parseNumber(str) {
    if (!str || str.trim() === '') return 0;
    return parseInt(str.replace(/,/g, ''), 10) || 0;
}

/**
 * 시안 + 제작상황 + 출고일을 종합해서 전체 주문 상태를 결정
 * 비유: 여러 부서의 진행 상황을 종합해서 "지금 이 주문은 전체적으로 어디쯤인지" 판단
 */
function determineStatus(row) {
    const production = row['제작상황'] || '';
    const design = row['시안'] || '';
    const releaseDate = row['출고일'] || '';
    const shippedDate = row['발송일'] || '';

    // 배송 완료 (발송일이 있으면)
    if (shippedDate) return 'shipped';
    // 출고 완료
    if (production === '생산완료' && releaseDate) return 'released';
    // 생산 완료
    if (production === '생산완료') return 'production_done';
    // 생산 중
    if (production === '생산중') return 'in_production';
    // 라인 작업 완료
    if (production === '신 라인작업 완료') return 'line_work';
    // 라인 작업 중 (그레이딩 단계)
    if (production === '신 라인작업 중') return 'grading';
    // 디자인 확정 (아직 생산 진입 전)
    if (design === '디자인확정' && !production) return 'design_confirmed';
    // 초안 완료 또는 수정 완료
    if (design === '수정완료' || design === '초안완료') return 'draft_done';
    // 작업 중
    if (design === '작업중') return 'design_requested';

    return 'design_requested'; // 기본값
}

/**
 * "진행" 컬럼에서 수정 횟수를 추출
 * 비유: "2차수정" → 2, "초안요청" → 0
 */
function extractRevisionCount(progress) {
    if (!progress) return 0;
    const match = progress.match(/(\d+)차수정/);
    if (match) return parseInt(match[1], 10);
    if (progress === '초과수정') return 4; // 초과수정은 4회로 간주
    return 0;
}

/**
 * 품목 한글 → 영문 카테고리 매핑
 */
function mapCategory(item) {
    const map = {
        '유니폼': 'uniform',
        '반팔티': 'tshirt',
        '후드티': 'hoodie',
        '긴팔티': 'longsleeve',
        '바지': 'pants',
        '반바지': 'shorts',
        '조끼': 'vest',
        '점퍼': 'jumper',
        '져지': 'jersey',
        '암슬리브': 'arm_sleeve',
        '워머': 'warmer',
    };
    // 부분 매칭 (품목에 키워드가 포함되면 매핑)
    for (const [kr, en] of Object.entries(map)) {
        if (item.includes(kr)) return en;
    }
    return 'other';
}

/**
 * 제작방식 한글 → 영문 매핑
 */
function mapMethod(method) {
    const map = {
        '전사': 'sublimation',
        '자수': 'embroidery',
        '프린팅': 'printing',
        '실크스크린': 'silkscreen',
        '열전사': 'heat_transfer',
    };
    return map[method] || method || '';
}

// ============================================================
// 4. 행 → 주문 객체 변환
// ============================================================

/**
 * 시트의 한 행을 DB 주문 스키마 객체로 변환
 * 비유: Google Sheets 양식을 우리 시스템 양식으로 "번역"하는 작업
 */
function convertRow(row, index, orderNumberMap) {
    // 상담개시일(A열)을 주문 생성일로 사용 (기존에는 '시안요청'을 잘못 사용)
    // 폴백 우선순위: 상담개시일 → 시안요청 → 주문서접수일
    // 2025년 완료주문 등 상담개시일/시안요청 둘 다 없는 시트가 있음
    const consultDateStr = row['상담개시일'] || row['시안요청'] || row['주문서 접수일'] || row['주문서접수일'] || '';
    const consultDate = parseDate(consultDateStr);

    // 시안요청 날짜 → designRequestDate로 별도 보관
    const requestDateStr = row['시안요청'] || '';
    const designRequestDate = parseDate(requestDateStr);

    // 주문서접수일(V열) → 매출 발생 기준일 (신규 추가)
    // 시트 헤더가 "주문서 접수일" (띄어쓰기 포함)이므로 양쪽 모두 매칭
    const receiptDateStr = row['주문서 접수일'] || row['주문서접수일'] || '';
    const orderReceiptDate = parseDate(receiptDateStr);

    // 주문번호: ORD-YYYYMMDD-NNN (상담개시일 기준으로 생성)
    // consultDateStr에 이미 폴백 로직이 적용되어 있음
    const dateSource = consultDateStr;
    let dateKey = '';
    if (dateSource.length === 6) {
        dateKey = `20${dateSource.slice(0, 2)}${dateSource.slice(2, 4)}${dateSource.slice(4, 6)}`;
    } else if (dateSource.length === 8) {
        dateKey = dateSource;
    } else {
        dateKey = '20260101'; // 날짜 없으면 기본값
    }

    // 같은 날짜의 순번을 추적
    if (!orderNumberMap[dateKey]) orderNumberMap[dateKey] = 0;
    orderNumberMap[dateKey]++;
    const seq = String(orderNumberMap[dateKey]).padStart(3, '0');
    const orderNumber = `ORD-${dateKey}-${seq}`;

    // 현재 시각 (updatedAt용)
    const now = new Date().toISOString();

    return {
        id: Date.now() + index, // 유니크 ID (타임스탬프 + 인덱스)
        orderNumber,
        groupId: row['그룹 ID(여러항목 통합시)'] || null,

        // 고객 정보
        customer: {
            name: row['대표자'] || row['담당자'] || '',
            email: '',
            phone: row['연락처'] || '',
            teamName: row['팀명'] || '',
            dealType: row['거래구분'] || '개인',
        },

        // 제품 정보 (시트에서는 한 행이 한 아이템)
        items: [{
            name: row['품목'] || '',
            sport: SPORT_MAP[row['종목']] || 'other',
            category: mapCategory(row['품목'] || ''),
            method: mapMethod(row['제작방식']),
            fit: row['핏'] || '',
            fabricTop: row['상의원단'] || '',
            fabricBottom: row['하의원단'] || '',
            topConfig: row['상의구성'] || '',
            bottomConfig: row['하의구성'] || '',
            baseModel: row['베이스모델'] || '',
            quantity: parseNumber(row['총주문수량 (piece)']),
            unitPrice: parseNumber(row['단가']),
            subtotal: parseNumber(row['총금액']),
        }],

        // 디자인 상태
        design: {
            status: (() => {
                const d = row['시안'] || '';
                if (d === '디자인확정') return 'confirmed';
                if (d === '수정완료') return 'revision_done';
                if (d === '초안완료') return 'draft_done';
                if (d === '작업중') return 'in_progress';
                return 'requested';
            })(),
            revisionCount: extractRevisionCount(row['진행']),
            designer: row['최종작업자'] || '',
            orderSheetUrl: row['주문서 링크'] || '',
            designFileUrl: '',
        },

        // 생산 정보
        production: {
            status: (() => {
                const p = row['제작상황'] || '';
                if (p === '생산완료') return 'done';
                if (p === '생산중') return 'in_production';
                if (p === '신 라인작업 완료') return 'line_work_done';
                if (p === '신 라인작업 중') return 'line_work';
                return '';
            })(),
            factory: row['제작공장'] || '',
            gradingDone: !!(row['그레이딩'] && row['그레이딩'].trim() !== ''),
        },

        // 배송 정보
        shipping: {
            address: row['주소'] || '',
            desiredDate: parseDate(row['희망납기']),
            releaseDate: parseDate(row['출고일']),
            shippedDate: parseDate(row['발송일']),
            trackingNumber: row['송장번호'] || '',
            carrier: '',
        },

        // 결제 정보
        payment: {
            totalAmount: parseNumber(row['총금액']),
            unitPrice: parseNumber(row['단가']),
            quantity: parseNumber(row['총주문수량 (piece)']),
            packQuantity: parseNumber(row['주문 수량 (pack)']),
            qpp: parseNumber(row['포장당 수량 (QPP)']),
            paidDate: parseDate(row['입금일자']),
            paymentType: PAYMENT_TYPE_MAP[row['주문서/입금']] || 'deposit',
            transactionMethod: TRANSACTION_MAP[row['거래방식']] || 'cash',
            quoteUrl: row['견적서 링크'] || '',
            autoQuote: row['견적서 자동 발급'] === 'TRUE',
        },

        // 관리 정보
        manager: row['담당자'] || '',
        store: row['거래점'] || '',
        status: determineStatus(row),
        memo: [row['비고'], row['세부내용']].filter(Boolean).join(' | '),
        detail: row['세부내용'] || '',
        revenueType: row['매출구분'] || '',

        // 날짜 필드 3종 (Phase E-1에서 정리)
        // createdAt: 상담개시일(A열) = 주문이 처음 생성된 날짜
        createdAt: consultDate || now,
        // designRequestDate: 시안요청 날짜 = 디자인 작업 시작일
        designRequestDate: designRequestDate || null,
        // orderReceiptDate: 주문서접수일(V열) = 매출 발생 기준일 (빈 값이면 null)
        orderReceiptDate: orderReceiptDate || null,

        updatedAt: now,
    };
}

// ============================================================
// 5. 메인 실행
// ============================================================

async function main() {
    console.log('\n=== STIZ Google Sheets 주문 데이터 임포트 (멀티 탭) ===\n');

    const orderNumberMap = {}; // 날짜별 순번 추적 (전체 탭 공유)
    const allOrders = [];      // 모든 탭의 주문을 합칠 배열
    let globalIndex = 0;       // 전체 인덱스 (ID 중복 방지)

    // 모든 시트 소스의 탭을 순회하면서 CSV 다운로드 + 파싱 + 변환
    const allTabs = [];
    for (const source of SHEET_SOURCES) {
        for (const tab of source.tabs) {
            allTabs.push({ ...tab, base: source.base, sourceName: source.name });
        }
    }

    for (let t = 0; t < allTabs.length; t++) {
        const tab = allTabs[t];
        const tabUrl = `${tab.base}&gid=${tab.gid}`;
        console.log(`\n[탭 ${t + 1}/${allTabs.length}] "${tab.name}" (gid=${tab.gid})`);

        // CSV 다운로드
        let csvText;
        try {
            csvText = await fetchUrl(tabUrl);
            console.log(`  다운로드 완료 (${csvText.length.toLocaleString()}자)`);
        } catch (err) {
            // 탭 하나 실패해도 나머지 계속 진행
            console.warn(`  다운로드 실패 (건너뜀): ${err.message}`);
            continue;
        }

        // CSV 파싱
        const rows = parseCSV(csvText);
        console.log(`  전체 행: ${rows.length}개`);

        // 팀명이 비어있는 행은 건너뛰기
        const validRows = rows.filter(r => r['팀명'] && r['팀명'].trim() !== '');
        console.log(`  유효 행: ${validRows.length}개 (빈 행 ${rows.length - validRows.length}개 제외)`);

        // 데이터 변환 (globalIndex를 넘겨서 ID 중복 방지)
        // defaultStatus가 있으면 시트 데이터 대신 탭 기본 상태를 사용
        const orders = validRows.map((row, i) => {
            const order = convertRow(row, globalIndex + i, orderNumberMap);
            order._sourceTab = tab.name;
            if (tab.defaultStatus) {
                order.status = tab.defaultStatus; // 완료주문(미수) → delivered_unpaid 등
            }
            return order;
        });

        globalIndex += validRows.length;
        allOrders.push(...orders);

        console.log(`  변환 완료: ${orders.length}건`);
    }

    // 상태별 통계
    console.log('\n\n=== 전체 통계 ===');
    const statusCount = {};
    allOrders.forEach(o => {
        statusCount[o.status] = (statusCount[o.status] || 0) + 1;
    });

    console.log(`\n  [상태별 건수] (총 ${allOrders.length}건)`);
    Object.entries(statusCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([status, count]) => {
            console.log(`    ${status}: ${count}건`);
        });

    // 저장
    console.log('\n[저장] orders.json에 저장 중...');

    // 기존 데이터 백업
    if (fs.existsSync(ORDERS_FILE)) {
        fs.copyFileSync(ORDERS_FILE, BACKUP_FILE);
        console.log(`  기존 데이터 백업 완료 → orders.json.bak`);
    }

    // 새 데이터 저장
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(allOrders, null, 2), 'utf-8');
    console.log(`  저장 완료: ${ORDERS_FILE}`);

    // 결과 요약
    console.log('\n=== 임포트 완료 ===');
    console.log(`  총 ${allOrders.length}건 임포트 (${allTabs.length}개 탭)`);
    if (allOrders.length > 0) {
        console.log(`  주문번호 범위: ${allOrders[0]?.orderNumber} ~ ${allOrders[allOrders.length - 1]?.orderNumber}`);
    }

    // 종목별 통계
    const sportCount = {};
    allOrders.forEach(o => {
        const sport = o.items[0]?.sport || 'unknown';
        sportCount[sport] = (sportCount[sport] || 0) + 1;
    });
    console.log('\n  [종목별 건수]');
    Object.entries(sportCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([sport, count]) => {
            console.log(`    ${sport}: ${count}건`);
        });

    // 탭별 건수
    const tabCount = {};
    allOrders.forEach(o => {
        const tab = o._sourceTab || 'unknown';
        tabCount[tab] = (tabCount[tab] || 0) + 1;
    });
    console.log('\n  [탭별 건수]');
    Object.entries(tabCount).forEach(([tab, count]) => {
        console.log(`    ${tab}: ${count}건`);
    });

    console.log('\n');
}

main().catch(err => {
    console.error('임포트 실패:', err);
    process.exit(1);
});
