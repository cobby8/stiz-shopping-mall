/**
 * 상품 카탈로그 API (A-2)
 *
 * settings 테이블에서 product_catalog JSON을 읽고/쓰는 API
 * 비유: 식당 메뉴판을 읽거나 수정하는 창구
 *
 * - GET  /api/catalog         — 공개 API (고객 주문 위자드에서 사용, 인증 불필요)
 * - GET  /api/admin/catalog   — 관리자 전용 (updatedAt/updatedBy 포함)
 * - PUT  /api/admin/catalog   — 관리자 전용 (카탈로그 전체 JSON 업데이트)
 */

import { Router } from 'express';
import { database as db } from '../db-sqlite.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { createUpload } from '../middleware/upload.js';
import * as XLSX from 'xlsx';

// --- CSV/XLSX 가져오기용 multer 설정 ---
// temp 폴더에 저장, CSV/XLSX 확장자만 허용, 최대 10MB
const csvFilter = (req, file, cb) => {
    if (/\.(csv|xlsx?|xls)$/i.test(file.originalname)) {
        cb(null, true);
    } else {
        cb(new Error('CSV 또는 Excel 파일만 업로드 가능합니다. (.csv, .xlsx, .xls)'), false);
    }
};
const csvUpload = createUpload({ fileFilter: csvFilter, maxSize: 10 * 1024 * 1024 });

// --- 키워드 → STIZ 종목 매핑 테이블 (자동 제안용) ---
// 비유: 통역사가 가지고 있는 "영어↔한국어 단어장"
const SPORT_KEYWORDS = {
    'basketball': 'basketball', 'basket': 'basketball', '농구': 'basketball',
    'soccer': 'soccer', 'football': 'soccer', '축구': 'soccer',
    'volleyball': 'volleyball', '배구': 'volleyball',
    'baseball': 'baseball', '야구': 'baseball',
    'futsal': 'futsal', '풋살': 'futsal',
    'handball': 'handball', '핸드볼': 'handball',
    'badminton': 'badminton', '배드민턴': 'badminton',
    'hockey': 'hockey', '하키': 'hockey',
};

// --- 키워드 → STIZ 품목 매핑 테이블 ---
const CATEGORY_KEYWORDS = {
    'jersey': 'uniform', 'uniform': 'uniform', 'kit': 'uniform', '유니폼': 'uniform',
    'shooting': 'shooting_shirt', '슈팅': 'shooting_shirt', 'shooting shirt': 'shooting_shirt',
    'hoodie': 'hoodie', '후드': 'hoodie', 'hoody': 'hoodie',
    'tshirt': 'tshirt', 't-shirt': 'tshirt', '반팔': 'tshirt', 'tee': 'tshirt',
    'shorts': 'etc', '하의': 'etc', 'pant': 'etc', 'pants': 'etc',
    'windbreaker': 'windbreaker', '바람막이': 'windbreaker', 'wind': 'windbreaker',
    'vest': 'vest', '조끼': 'vest',
};

const router = Router();

// --- 공개 API: 카탈로그 조회 ---
// 고객 주문 위자드에서 호출. 인증 불필요.
// active: true인 항목만 필터링해서 반환 (비활성 항목은 고객에게 안 보임)
router.get('/catalog', (req, res) => {
    try {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('product_catalog');

        if (!row) {
            return res.status(404).json({ success: false, error: '카탈로그가 설정되지 않았습니다.' });
        }

        const catalog = JSON.parse(row.value);

        // 활성 항목만 필터링 — 관리자가 비활성화한 종목/품목은 고객에게 안 보임
        // 배열 필드는 active: true만 남기고, 객체/딕셔너리 필드는 그대로 전달
        const filterActive = (arr) => (arr || []).filter(i => i.active);

        const filtered = {
            // 새 구조 필드 (Part 7 가격/구성 고도화)
            sports: filterActive(catalog.sports),
            grades: filterActive(catalog.grades),
            categories: filterActive(catalog.categories),
            packages: filterActive(catalog.packages),
            priceTable: catalog.priceTable || {},
            sportGradeMap: catalog.sportGradeMap || {},
            gradePackageMap: catalog.gradePackageMap || {},
            finishOptions: {
                top: filterActive(catalog.finishOptions?.top),
                bottom: filterActive(catalog.finishOptions?.bottom),
            },
            discounts: filterActive(catalog.discounts),
            discountPriceTable: catalog.discountPriceTable || {},
            sizePresets: catalog.sizePresets || {},
            categorySizeMap: catalog.categorySizeMap || {},
            homeAway: filterActive(catalog.homeAway),
            // 하위 호환용 (기존 코드가 참조할 수 있으므로 유지)
            fabrics: filterActive(catalog.fabrics),
            compositions: catalog.compositions || null,
            basePrices: catalog.basePrices || {},
            sizes: catalog.sizes || [],
            sportCategoryMap: catalog.sportCategoryMap || null,
        };

        res.json({ success: true, data: filtered });
    } catch (error) {
        console.error('[catalog] GET /api/catalog 에러:', error);
        res.status(500).json({ success: false, error: '카탈로그 조회 실패' });
    }
});

// --- 관리자 API: 카탈로그 전체 조회 (비활성 항목 포함) ---
// updatedAt, updatedBy도 함께 반환하여 "마지막 수정 정보" 표시
router.get('/admin/catalog', adminAuth, (req, res) => {
    try {
        const row = db.prepare('SELECT value, updatedAt, updatedBy FROM settings WHERE key = ?').get('product_catalog');

        if (!row) {
            return res.status(404).json({ success: false, error: '카탈로그가 설정되지 않았습니다.' });
        }

        const catalog = JSON.parse(row.value);

        res.json({
            success: true,
            data: catalog,
            updatedAt: row.updatedAt,
            updatedBy: row.updatedBy,
        });
    } catch (error) {
        console.error('[catalog] GET /api/admin/catalog 에러:', error);
        res.status(500).json({ success: false, error: '카탈로그 조회 실패' });
    }
});

// --- 관리자 API: 카탈로그 전체 업데이트 ---
// 관리자 UI에서 편집한 카탈로그 JSON 전체를 저장
// 비유: 화이트보드 메뉴판을 통째로 새로 쓰는 것
router.put('/admin/catalog', adminAuth, (req, res) => {
    try {
        const catalog = req.body;

        // 기본 유효성 검사 — 필수 섹션이 있는지 확인
        // fabrics는 grades로 대체되었으므로 필수에서 제외 (Part 7 고도화)
        if (!catalog || !catalog.sports || !catalog.categories) {
            return res.status(400).json({
                success: false,
                error: '카탈로그 데이터가 올바르지 않습니다. sports, categories는 필수입니다.',
            });
        }

        const now = new Date().toISOString();
        // req.user는 adminAuth 미들웨어가 설정한 관리자 정보
        const updatedBy = req.user?.name || req.user?.email || 'admin';

        db.prepare(`
            UPDATE settings SET value = @value, updatedAt = @updatedAt, updatedBy = @updatedBy
            WHERE key = 'product_catalog'
        `).run({
            value: JSON.stringify(catalog),
            updatedAt: now,
            updatedBy,
        });

        res.json({
            success: true,
            message: '카탈로그가 저장되었습니다.',
            updatedAt: now,
            updatedBy,
        });
    } catch (error) {
        console.error('[catalog] PUT /api/admin/catalog 에러:', error);
        res.status(500).json({ success: false, error: '카탈로그 저장 실패' });
    }
});

// --- 관리자 API: CSV/엑셀 가져오기 (파싱 + 매핑 제안) ---
// 비유: 다른 가게 메뉴판(CSV)을 가져와서 우리 양식에 맞게 번역해주는 통역사
// 파일을 받아서 파싱하고, 키워드로 자동 매핑을 제안하지만, 저장은 하지 않음
router.post('/admin/catalog/import', adminAuth, (req, res, next) => {
    // multer에 uploadDir/uploadPrefix를 설정하여 temp 폴더에 저장
    req.uploadDir = 'temp';
    req.uploadPrefix = 'csv';
    next();
}, csvUpload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '파일이 업로드되지 않았습니다.' });
        }

        // --- 1. 엑셀/CSV 파일 파싱 ---
        // XLSX 라이브러리가 CSV, XLS, XLSX를 모두 읽을 수 있음
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0]; // 첫 번째 시트 사용
        const sheet = workbook.Sheets[sheetName];
        // 시트를 JSON 배열로 변환 — 첫 행이 헤더(컬럼명)가 됨
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rows || rows.length === 0) {
            return res.status(400).json({ success: false, error: '파일에 데이터가 없습니다.' });
        }

        // --- 2. 기존 카탈로그 데이터 가져오기 (매핑 대조용) ---
        const catalogRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('product_catalog');
        const catalog = catalogRow ? JSON.parse(catalogRow.value) : { sports: [], categories: [], fabrics: [] };

        // 기존 종목/품목 ID 목록 (빠른 조회용 Set)
        const existingSports = new Set((catalog.sports || []).map(s => s.id));
        const existingCategories = new Set((catalog.categories || []).map(c => c.id));

        // --- 3. 각 행을 파싱하고 자동 매핑 제안 ---
        const products = [];
        const discoveredSports = new Set();    // CSV에서 발견된 새 종목 후보
        const discoveredCategories = new Set(); // CSV에서 발견된 새 품목 후보

        rows.forEach((row, idx) => {
            // 원본 데이터 보존 (raw)
            const raw = { ...row };

            // 상품명과 카테고리에서 키워드 추출
            const productName = String(row['상품명'] || row['product_name'] || row['name'] || row['Name'] || '').toLowerCase();
            const categoryStr = String(row['카테고리'] || row['category'] || row['Category'] || row['분류'] || '').toLowerCase();
            const priceStr = row['판매가'] || row['price'] || row['Price'] || row['판매 가격'] || 0;

            // 종목 자동 매핑 — 카테고리 + 상품명에서 키워드 검색
            const sportMatch = matchKeyword(categoryStr + ' ' + productName, SPORT_KEYWORDS);
            // 품목 자동 매핑 — 상품명에서 키워드 검색
            const categoryMatch = matchKeyword(productName, CATEGORY_KEYWORDS);

            // 매핑 신뢰도 판정
            const sportSuggestion = sportMatch
                ? { id: sportMatch, label: findLabel(catalog.sports, sportMatch), confidence: 'high' }
                : { id: null, label: null, confidence: 'none' };
            const categorySuggestion = categoryMatch
                ? { id: categoryMatch, label: findLabel(catalog.categories, categoryMatch), confidence: 'medium' }
                : { id: null, label: null, confidence: 'none' };

            // 기존 카탈로그에 없는 새 값 추적
            if (sportMatch && !existingSports.has(sportMatch)) discoveredSports.add(sportMatch);
            if (categoryMatch && !existingCategories.has(categoryMatch)) discoveredCategories.add(categoryMatch);

            // 카테고리 문자열 자체가 기존에 없으면 새 종목 후보로 추가
            if (!sportMatch && categoryStr.trim()) {
                discoveredSports.add(categoryStr.trim());
            }

            products.push({
                rowIndex: idx + 1,
                raw,
                suggestion: {
                    sport: sportSuggestion,
                    category: categorySuggestion,
                    basePrice: parseInt(priceStr) || 0,
                },
            });
        });

        // --- 4. 응답: 파싱된 상품 + 매핑 제안 + 새 발견 값 ---
        res.json({
            success: true,
            totalRows: rows.length,
            columns: Object.keys(rows[0] || {}), // CSV 컬럼 목록 (UI에서 표시용)
            products,
            newValues: {
                sports: [...discoveredSports],
                categories: [...discoveredCategories],
            },
        });
    } catch (error) {
        console.error('[catalog] POST /api/admin/catalog/import 에러:', error);
        res.status(500).json({ success: false, error: 'CSV 파싱 실패: ' + error.message });
    }
}, (err, req, res, next) => {
    // multer 에러 핸들러 — 파일 형식/크기 오류 처리
    if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ success: false, error: err.message });
    }
    next();
});

/**
 * 키워드 매핑 헬퍼 — 텍스트에서 매핑 테이블의 키워드를 찾아 STIZ ID 반환
 * 비유: 문서에서 "축구" 또는 "soccer"를 찾으면 → 'soccer' 반환
 * @param {string} text - 검색 대상 텍스트
 * @param {Object} keywordMap - { 키워드: STIZ_ID } 테이블
 * @returns {string|null} 매칭된 STIZ ID 또는 null
 */
function matchKeyword(text, keywordMap) {
    if (!text) return null;
    const lowerText = text.toLowerCase();
    for (const [keyword, id] of Object.entries(keywordMap)) {
        if (lowerText.includes(keyword)) return id;
    }
    return null;
}

/**
 * 카탈로그 항목에서 ID에 해당하는 label을 찾는 헬퍼
 * @param {Array} items - 카탈로그 항목 배열 [{id, label}, ...]
 * @param {string} id - 찾을 ID
 * @returns {string|null}
 */
function findLabel(items, id) {
    if (!items) return null;
    const item = items.find(i => i.id === id);
    return item ? item.label : null;
}

export default router;
