/**
 * 관리자 견적서 PDF 자동 생성 라우트 (Phase B-1, 2026-04-30)
 *
 * 비유: "주문서 한 장으로 견적서 PDF 출력하는 자동 영수증 프린터"
 *  - 운영자가 admin-order에서 "견적서 PDF" 버튼 클릭
 *  - 서버가 주문 데이터 + 회사 정보 + 한글 폰트로 A4 PDF 생성 → 브라우저 다운로드
 *  - 외부 PDF 도구(엑셀/한글) 수동 작성 → 자동 생성으로 전환 (정밀 설계 B-1)
 *
 * 마운트: admin/orders.js에서 quoteRouter 사용
 *   최종 URL: GET /api/admin/orders/:orderNumber/quote.pdf
 *
 * ⚠️ adminAuth는 server.js:145 `app.use('/api/admin', adminAuth, ...)`로
 *    상위에서 이미 적용됨 → 라우터에 중복 부착 금지 (C-5, E-18)
 *
 * 한글 폰트:
 *  - server/assets/fonts/PretendardVariable.ttf (사용자 다운로드 필요, SIL OFL 라이선스)
 *  - 파일이 없으면 영문 기본 폰트로 폴백 + 콘솔 경고 (라우트 자체는 죽지 않음)
 *  - Pretendard 다운로드: https://github.com/orioncactus/pretendard/releases
 */

import express from 'express';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../db.js';
import { SPORT_LABELS } from '../../constants/sport-labels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 폰트 경로 — server/assets/fonts/ (server.js 기준 동일 트리)
// Pretendard Variable 1개로 Regular/Bold 모두 처리 가능 (가변 폰트)
// 분리 폰트(Regular/Bold)도 지원 — Variable이 없으면 분리 폰트 fallback 시도
const FONT_DIR = path.join(__dirname, '../../assets/fonts');
const FONT_VARIABLE = path.join(FONT_DIR, 'PretendardVariable.ttf');
const FONT_REGULAR = path.join(FONT_DIR, 'Pretendard-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Pretendard-Bold.ttf');

// 회사 정보 — env로 덮어쓰기 가능 (운영자가 추후 .env에 채움)
// 비유: 견적서 상단 "회사 명함" — 환경에 따라 갈아끼울 수 있게 env 우선
const COMPANY = {
    name: process.env.COMPANY_NAME || 'STIZ',
    bizNumber: process.env.COMPANY_BIZ_NUMBER || '',
    representative: process.env.COMPANY_REPRESENTATIVE || '',
    address: process.env.COMPANY_ADDRESS || '',
    phone: process.env.COMPANY_PHONE || '',
    email: process.env.COMPANY_EMAIL || '',
    bankName: process.env.COMPANY_BANK_NAME || '',
    bankAccount: process.env.COMPANY_BANK_ACCOUNT || '',
    bankHolder: process.env.COMPANY_BANK_HOLDER || ''
};

// 카테고리 라벨 캐시 — settings.product_catalog에서 1회 로드
// 비유: "품목 코드표"를 매 요청마다 다시 펴기 아까우니 한 번만 펴고 책상에 둠
let categoryLabelCache = null;
function loadCategoryLabels() {
    if (categoryLabelCache) return categoryLabelCache;
    try {
        const settings = db.getAll('settings');
        const catalog = settings.find(s => s.key === 'product_catalog');
        if (catalog) {
            const data = typeof catalog.value === 'string' ? JSON.parse(catalog.value) : catalog.value;
            const map = {};
            (data.categories || []).forEach(c => { map[c.id] = c.label; });
            categoryLabelCache = map;
        } else {
            categoryLabelCache = {};
        }
    } catch (err) {
        console.warn('[quote] 카테고리 라벨 로드 실패:', err.message);
        categoryLabelCache = {};
    }
    return categoryLabelCache;
}

// 제작 방식 라벨 매핑 — items[].method 영문키 → 한글
const METHOD_LABELS = {
    sublimation: '승화전사',
    embroidery: '자수',
    print: '나염',
    heat_transfer: '열전사',
    cut_sew: '재단봉제',
    direct: '직접 인쇄'
};

// 안전한 폰트 등록 — Variable / Regular+Bold / 폴백 순으로 시도
// 반환: { ok, regular, bold, fallback } — fallback=true면 한글 깨짐 가능
function registerFonts(doc) {
    // 1순위: Variable 단일 파일 (Pretendard 1.3.x 권장)
    if (fs.existsSync(FONT_VARIABLE)) {
        doc.registerFont('NotoRegular', FONT_VARIABLE);
        doc.registerFont('NotoBold', FONT_VARIABLE);
        return { ok: true, fallback: false, source: 'variable' };
    }
    // 2순위: 분리 Regular/Bold
    if (fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD)) {
        doc.registerFont('NotoRegular', FONT_REGULAR);
        doc.registerFont('NotoBold', FONT_BOLD);
        return { ok: true, fallback: false, source: 'regular-bold' };
    }
    // 3순위: Regular만 있으면 Bold도 같은 파일로 (스타일은 동일)
    if (fs.existsSync(FONT_REGULAR)) {
        doc.registerFont('NotoRegular', FONT_REGULAR);
        doc.registerFont('NotoBold', FONT_REGULAR);
        return { ok: true, fallback: false, source: 'regular-only' };
    }
    // 폴백: pdfkit 기본 폰트 (Helvetica) — 한글 깨짐 발생
    // 운영자에게 콘솔로 경고 (서비스는 죽지 않음)
    console.warn('[quote] ⚠️ 한글 폰트 미발견. 한글 깨짐 가능. ' +
        '아래 경로에 Pretendard TTF 파일을 두세요:\n' +
        `  ${FONT_VARIABLE}\n  또는\n  ${FONT_REGULAR}`);
    doc.registerFont('NotoRegular', 'Helvetica');
    doc.registerFont('NotoBold', 'Helvetica-Bold');
    return { ok: false, fallback: true, source: 'helvetica' };
}

// 천 단위 콤마 + "원" 표기
function formatKRW(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('ko-KR') + '원';
}

// YYYY-MM-DD 표기 — Date 또는 ISO 문자열 안전 변환
function formatDate(value) {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    } catch (e) {
        return '';
    }
}

// 견적일 + 30일 → 견적 유효기간 종료일
function addDays(value, days) {
    const base = value ? new Date(value) : new Date();
    base.setDate(base.getDate() + days);
    return formatDate(base);
}

const router = express.Router();

/**
 * GET /:orderNumber/quote.pdf
 *  - 주문번호 → 견적서 PDF 스트림 응답
 *  - 권한: adminAuth (server.js 상위 마운트)
 *
 * 동작:
 *  1. orderNumber로 주문 조회 (없으면 404)
 *  2. PDFDocument 생성 + 한글 폰트 등록
 *  3. Content-Disposition으로 다운로드 강제 + PDF 스트림 직접 res로 pipe
 *  4. 헤더(회사) → 제목 → 수신/날짜 → 내역 테이블 → 합계 → 입금계좌/유효기간 → 비고 순서로 그리기
 */
router.get('/:orderNumber/quote.pdf', (req, res) => {
    try {
        // 주문 조회 — orderNumber는 인덱스 컬럼 (db-sqlite L449)
        const order = db.findOne('orders', 'orderNumber', req.params.orderNumber);
        if (!order) {
            return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
        }

        const customer = order.customer || {};
        const payment = order.payment || {};
        const items = Array.isArray(order.items) ? order.items : [];
        const categoryLabels = loadCategoryLabels();

        // PDFDocument 생성 — A4 + 50pt 마진 (기본 표준)
        // bufferPages: true → 추후 페이지 번호 등 후처리 시 활용 가능
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `견적서 ${order.orderNumber}`,
                Author: COMPANY.name,
                Subject: '견적서',
                Creator: 'STIZ Admin'
            }
        });

        // 한글 폰트 등록 (Variable / Regular+Bold / 폴백 순)
        const fontResult = registerFonts(doc);
        // pdfkit 기본 메서드 호출 직전에 폰트 적용
        doc.font('NotoRegular');

        // 응답 헤더 — 다운로드 파일명에 한글 들어가면 RFC 5987 인코딩 필요
        // 여기는 영문/숫자 orderNumber만 사용해 단순 ASCII로 처리
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `attachment; filename="quote-${order.orderNumber}.pdf"`);

        // PDF 스트림을 응답으로 직접 pipe (메모리 절약 + 빠른 시작)
        doc.pipe(res);

        // 페이지 좌표 헬퍼 — 마진 안쪽 그리기 영역
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const leftX = doc.page.margins.left;

        // ─────────────────────────────────────────────
        // 1. 상단: 회사 정보 (왼쪽) + 견적서 제목 (오른쪽 또는 가운데)
        // ─────────────────────────────────────────────
        // 회사명 — 큰 굵은 글씨
        doc.font('NotoBold').fontSize(20).fillColor('#111111')
            .text(COMPANY.name, leftX, 50, { width: pageWidth / 2 });

        // 회사 메타 — 작은 회색
        doc.font('NotoRegular').fontSize(9).fillColor('#666666');
        const companyLines = [];
        if (COMPANY.bizNumber) companyLines.push(`사업자등록번호: ${COMPANY.bizNumber}`);
        if (COMPANY.representative) companyLines.push(`대표자: ${COMPANY.representative}`);
        if (COMPANY.address) companyLines.push(`주소: ${COMPANY.address}`);
        if (COMPANY.phone) companyLines.push(`전화: ${COMPANY.phone}`);
        if (COMPANY.email) companyLines.push(`이메일: ${COMPANY.email}`);
        if (companyLines.length === 0) companyLines.push('회사 정보를 .env에 등록하세요 (COMPANY_BIZ_NUMBER 등)');
        let metaY = 75;
        companyLines.forEach(line => {
            doc.text(line, leftX, metaY, { width: pageWidth / 2 });
            metaY += 12;
        });

        // 견적서 제목 — 오른쪽 상단
        doc.font('NotoBold').fontSize(28).fillColor('#111111')
            .text('견적서', leftX + pageWidth / 2, 50,
                { width: pageWidth / 2, align: 'right' });

        // 견적일 / 견적번호 — 제목 아래
        const issueDate = formatDate(new Date());
        doc.font('NotoRegular').fontSize(9).fillColor('#666666');
        doc.text(`견적일: ${issueDate}`, leftX + pageWidth / 2, 85,
            { width: pageWidth / 2, align: 'right' });
        doc.text(`견적번호: ${order.orderNumber}`, leftX + pageWidth / 2, 99,
            { width: pageWidth / 2, align: 'right' });
        doc.text(`유효기간: ${addDays(new Date(), 30)} 까지`, leftX + pageWidth / 2, 113,
            { width: pageWidth / 2, align: 'right' });

        // 구분선
        const lineY = Math.max(metaY, 130) + 6;
        doc.strokeColor('#222222').lineWidth(1)
            .moveTo(leftX, lineY).lineTo(leftX + pageWidth, lineY).stroke();

        // ─────────────────────────────────────────────
        // 2. 수신자 (팀명/고객명/연락처)
        // ─────────────────────────────────────────────
        let cursorY = lineY + 16;
        doc.font('NotoBold').fontSize(11).fillColor('#111111')
            .text('수신', leftX, cursorY);
        cursorY += 16;

        doc.font('NotoRegular').fontSize(10).fillColor('#222222');
        const recipientLines = [];
        if (customer.teamName) recipientLines.push(`팀/단체명: ${customer.teamName}`);
        if (customer.name) recipientLines.push(`담당자: ${customer.name}`);
        if (customer.phone) recipientLines.push(`연락처: ${customer.phone}`);
        if (customer.email) recipientLines.push(`이메일: ${customer.email}`);
        if (customer.dealType) recipientLines.push(`거래 구분: ${customer.dealType}`);
        if (recipientLines.length === 0) recipientLines.push('(고객 정보 미입력)');
        recipientLines.forEach(line => {
            doc.text(line, leftX + 12, cursorY);
            cursorY += 14;
        });

        cursorY += 8;

        // 안내 문구
        doc.font('NotoRegular').fontSize(9).fillColor('#666666')
            .text('아래와 같이 견적합니다.', leftX, cursorY);
        cursorY += 18;

        // ─────────────────────────────────────────────
        // 3. 내역 테이블 — 종목 / 품목 / 제작방식 / 단가 / 수량 / 금액
        // ─────────────────────────────────────────────
        // 컬럼 정의 (총 폭 = pageWidth)
        // 비유: "엑셀 시트 한 줄짜리 표" 좌우 폭을 미리 계산
        const cols = [
            { key: 'sport', label: '종목', width: 60, align: 'left' },
            { key: 'category', label: '품목', width: 120, align: 'left' },
            { key: 'method', label: '제작방식', width: 80, align: 'left' },
            { key: 'unitPrice', label: '단가', width: 75, align: 'right' },
            { key: 'quantity', label: '수량', width: 50, align: 'right' },
            { key: 'subtotal', label: '금액', width: pageWidth - 60 - 120 - 80 - 75 - 50, align: 'right' }
        ];
        const rowHeight = 22;
        const headerHeight = 24;

        // 테이블 헤더 — 회색 배경 + 흰색 글씨
        doc.rect(leftX, cursorY, pageWidth, headerHeight).fill('#222222');
        doc.font('NotoBold').fontSize(10).fillColor('#FFFFFF');
        let colX = leftX;
        cols.forEach(col => {
            doc.text(col.label, colX + 6, cursorY + 7,
                { width: col.width - 12, align: col.align });
            colX += col.width;
        });
        cursorY += headerHeight;

        // items 순회 — 견적서는 결제 단가 기준 (payment.unitPrice * quantity 우선, fallback items)
        // 운영 데이터 패턴: items[].subtotal이 0이거나, payment.totalAmount만 있는 케이스 다수
        let computedTotal = 0;
        const rows = [];

        if (items.length > 0) {
            items.forEach(item => {
                const sport = SPORT_LABELS[item.sport] || item.sport || '-';
                const category = categoryLabels[item.category] || item.category || item.name || '-';
                const method = METHOD_LABELS[item.method] || item.method || '-';
                const unitPrice = Number(item.unitPrice) || 0;
                const quantity = Number(item.quantity) || 0;
                // subtotal 우선, 없으면 단가*수량 계산
                const subtotal = Number(item.subtotal) || (unitPrice * quantity);
                computedTotal += subtotal;
                rows.push({ sport, category, method, unitPrice, quantity, subtotal });
            });
        } else {
            // items 비어 있으면 payment 기반 1행
            const unitPrice = Number(payment.unitPrice) || 0;
            const quantity = Number(payment.quantity) || 0;
            rows.push({
                sport: '-',
                category: customer.teamName || '주문',
                method: '-',
                unitPrice,
                quantity,
                subtotal: unitPrice * quantity
            });
            computedTotal = unitPrice * quantity;
        }

        // 행 그리기 — 짝수행만 옅은 배경 (zebra striping)
        doc.font('NotoRegular').fontSize(10);
        rows.forEach((row, idx) => {
            // 페이지 넘침 방지 — 다음 행이 페이지 하단 70pt 안으로 들어가면 새 페이지
            if (cursorY + rowHeight > doc.page.height - doc.page.margins.bottom - 120) {
                doc.addPage();
                cursorY = doc.page.margins.top;
            }
            if (idx % 2 === 1) {
                doc.rect(leftX, cursorY, pageWidth, rowHeight).fill('#F7F7F7');
            }
            doc.fillColor('#222222');
            colX = leftX;
            cols.forEach(col => {
                let value = row[col.key];
                if (col.key === 'unitPrice' || col.key === 'subtotal') value = formatKRW(value);
                if (col.key === 'quantity') value = `${Number(value).toLocaleString('ko-KR')}`;
                doc.text(String(value), colX + 6, cursorY + 6,
                    { width: col.width - 12, align: col.align, ellipsis: true, lineBreak: false });
                colX += col.width;
            });
            cursorY += rowHeight;
        });

        // 테이블 외곽선 — 헤더 위부터 마지막 행까지 (대략)
        // pdfkit은 fill 후 stroke 따로 적용해야 해서 외곽선만 별도로 그림

        // ─────────────────────────────────────────────
        // 4. 합계 / VAT / 총액
        // ─────────────────────────────────────────────
        // payment.totalAmount가 있으면 "공식 총액"으로 우선 사용 (운영자가 입력한 최종 합의 금액)
        // 없으면 items 합산값 사용
        const totalAmount = Number(payment.totalAmount) > 0
            ? Number(payment.totalAmount)
            : computedTotal;
        // VAT는 한국 일반 부가세 10% — 단가가 부가세 별도인지 포함인지 운영 정책마다 다르므로
        // 여기서는 "총액(VAT 포함)"으로 표기 (실무 견적서 표준)
        const vatIncluded = Math.round(totalAmount / 11);
        const supplyAmount = totalAmount - vatIncluded;

        cursorY += 12;
        const summaryX = leftX + pageWidth - 240;
        const summaryW = 240;
        const summaryRowHeight = 20;

        // 공급가액
        doc.font('NotoRegular').fontSize(10).fillColor('#222222');
        doc.text('공급가액', summaryX, cursorY, { width: 100, align: 'left' });
        doc.text(formatKRW(supplyAmount), summaryX + 100, cursorY,
            { width: summaryW - 100, align: 'right' });
        cursorY += summaryRowHeight;

        // 부가세
        doc.text('부가세 (VAT 포함분)', summaryX, cursorY, { width: 130, align: 'left' });
        doc.text(formatKRW(vatIncluded), summaryX + 130, cursorY,
            { width: summaryW - 130, align: 'right' });
        cursorY += summaryRowHeight;

        // 총액 — 굵은 글씨 + 짙은 배경
        doc.rect(summaryX, cursorY, summaryW, summaryRowHeight + 6).fill('#222222');
        doc.font('NotoBold').fontSize(12).fillColor('#FFFFFF');
        doc.text('총액 (VAT 포함)', summaryX + 6, cursorY + 6, { width: 140, align: 'left' });
        doc.text(formatKRW(totalAmount), summaryX + 140, cursorY + 6,
            { width: summaryW - 140 - 6, align: 'right' });
        cursorY += summaryRowHeight + 14;

        // ─────────────────────────────────────────────
        // 5. 입금 계좌 / 비고
        // ─────────────────────────────────────────────
        cursorY += 14;
        doc.font('NotoBold').fontSize(11).fillColor('#111111')
            .text('입금 계좌', leftX, cursorY);
        cursorY += 16;

        doc.font('NotoRegular').fontSize(10).fillColor('#222222');
        if (COMPANY.bankName || COMPANY.bankAccount || COMPANY.bankHolder) {
            const accountLine = [
                COMPANY.bankName,
                COMPANY.bankAccount,
                COMPANY.bankHolder ? `(예금주: ${COMPANY.bankHolder})` : ''
            ].filter(Boolean).join(' ');
            doc.text(accountLine, leftX + 12, cursorY);
        } else {
            doc.fillColor('#999999')
                .text('계좌 정보를 .env에 등록하세요 (COMPANY_BANK_NAME / COMPANY_BANK_ACCOUNT / COMPANY_BANK_HOLDER)',
                    leftX + 12, cursorY);
        }
        cursorY += 18;

        // 비고 — 고객 메모(memo) 또는 내부 메모 기반
        if (order.memo || order.customerMemo) {
            cursorY += 8;
            doc.font('NotoBold').fontSize(11).fillColor('#111111')
                .text('비고', leftX, cursorY);
            cursorY += 16;
            doc.font('NotoRegular').fontSize(10).fillColor('#222222');
            const memoText = order.customerMemo || order.memo || '';
            doc.text(memoText, leftX + 12, cursorY, { width: pageWidth - 24 });
            cursorY = doc.y + 6;
        }

        // 납기일 (있으면)
        if (order.deliveryDate) {
            cursorY += 6;
            doc.font('NotoRegular').fontSize(10).fillColor('#666666')
                .text(`납기 예정일: ${formatDate(order.deliveryDate)}`, leftX, cursorY);
            cursorY += 14;
        }

        // 푸터 — 페이지 하단 고정
        const footerY = doc.page.height - doc.page.margins.bottom - 30;
        doc.font('NotoRegular').fontSize(8).fillColor('#999999')
            .text(`본 견적서는 발행일로부터 30일간 유효합니다. (${COMPANY.name})`,
                leftX, footerY, { width: pageWidth, align: 'center' });

        // 폰트 폴백 시 화면 상단에 작은 경고 — 운영자가 PDF 열었을 때 인지 가능
        if (fontResult.fallback) {
            doc.font('Helvetica').fontSize(7).fillColor('#CC4444')
                .text('[Korean font missing — install Pretendard at server/assets/fonts/]',
                    leftX, footerY - 12, { width: pageWidth, align: 'center' });
        }

        // 문서 종료 — 응답 스트림 자동 close
        doc.end();
    } catch (err) {
        // PDF 생성 도중 예외 — 헤더 이미 보냈으면 스트림 종료, 아니면 JSON 응답
        console.error('[quote] PDF 생성 실패:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: '견적서 생성 중 오류가 발생했습니다.', detail: err.message });
        } else {
            try { res.end(); } catch (_) { /* swallow */ }
        }
    }
});

export default router;
