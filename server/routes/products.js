/**
 * 상품 API 라우트 (Phase E-2)
 * 비유: 쇼핑몰의 "상품 접수 창구" — 고객용(진열장 구경)과 관리자용(재고실 관리) 2종류
 *
 * 공개 API (4개): 인증 불필요 — 고객이 상품을 조회
 * 관리자 API (12개): adminAuth 필요 — 관리자가 상품을 등록/수정/삭제
 *
 * DB 접근: better-sqlite3 직접 사용 (parameterized query로 SQL 인젝션 방지)
 */
import { Router } from 'express';
import { database as db } from '../db-sqlite.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { createUpload, imageFilter } from '../middleware/upload.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 상품 이미지 업로드 설정 — 최대 10MB, 이미지 파일만 허용
const productUpload = createUpload({
  fileFilter: imageFilter,
  maxSize: 10 * 1024 * 1024
});

// =============================================
// 공개 API (고객용 — 인증 불필요)
// =============================================

/**
 * [공개 1] GET /api/products
 * 상품 목록 조회 (active 상품만)
 * 필터: ?category=1&type=ready&search=페가수스&sort=newest&page=1&limit=20
 * 비유: 매장 진열장을 둘러보는 것 — "판매중" 상품만 보여줌
 */
router.get('/products', (req, res) => {
  try {
    const {
      category,   // 카테고리 ID
      type,       // 'ready' 또는 'custom'
      search,     // 검색어 (상품명, 영문명, 키워드)
      sort = 'newest', // 정렬: newest, price_asc, price_desc, name
      page = 1,
      limit = 20
    } = req.query;

    // 페이지네이션 계산
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    // WHERE 조건 동적 조립 — 항상 active 상품만 표시
    const conditions = ["p.status = 'active'"];
    const params = [];

    // 카테고리 필터 — 대분류 선택 시 하위 카테고리 상품도 합집합으로 반환 (D-89)
    // 비유: "농구" 매장에 들어가면 heritage/pro/reversible 선반 전부 보이는 것
    if (category) {
      const catId = parseInt(category);
      // 해당 catId를 parentId로 가진 하위 카테고리가 있는지 확인
      const hasChildren = db.prepare(
        'SELECT COUNT(*) as cnt FROM product_categories WHERE parentId = ?'
      ).get(catId);
      if (hasChildren && hasChildren.cnt > 0) {
        // 대분류: 본인 + 하위 카테고리 상품 합집합
        conditions.push('(p.categoryId = ? OR p.categoryId IN (SELECT id FROM product_categories WHERE parentId = ?))');
        params.push(catId, catId);
      } else {
        // 하위 카테고리 또는 하위 없는 대분류: 정확 매칭
        conditions.push('p.categoryId = ?');
        params.push(catId);
      }
    }

    // 타입 필터 (기성품/커스텀)
    if (type && (type === 'ready' || type === 'custom')) {
      conditions.push('p.type = ?');
      params.push(type);
    }

    // 검색어 필터 — 상품명, 영문명, 키워드에서 LIKE 검색
    if (search) {
      conditions.push('(p.name LIKE ? OR p.nameEn LIKE ? OR p.keywords LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    // 정렬 기준 결정
    const sortMap = {
      newest: 'p.createdAt DESC',
      oldest: 'p.createdAt ASC',
      price_asc: 'p.price ASC',
      price_desc: 'p.price DESC',
      name: 'p.name ASC',
      popular: 'p.sortOrder ASC, p.createdAt DESC'
    };
    const orderBy = sortMap[sort] || sortMap.newest;

    // 전체 개수 조회 (페이지네이션용)
    const countSql = `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`;
    const { total } = db.prepare(countSql).get(...params);

    // 상품 목록 조회 — 카테고리명과 대표이미지를 JOIN으로 포함
    const listSql = `
      SELECT
        p.id, p.type, p.categoryId, p.name, p.nameEn, p.sku,
        p.description, p.price, p.clubPrice, p.sizes, p.fabric,
        p.customMeta, p.status, p.sortOrder, p.createdAt,
        p.isConsultPrice, p.brand,
        c.name AS categoryName, c.slug AS categorySlug,
        pi.url AS thumbnail
      FROM products p
      LEFT JOIN product_categories c ON p.categoryId = c.id
      LEFT JOIN product_images pi ON pi.productId = p.id AND pi.isPrimary = 1
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const products = db.prepare(listSql).all(...params, limitNum, offset);

    // customMeta JSON 파싱 — 문자열을 객체로 변환
    products.forEach(p => {
      try { p.customMeta = JSON.parse(p.customMeta || '{}'); } catch { p.customMeta = {}; }
    });

    // 카테고리별 상품 수 (사이드바 필터용)
    const categoryCounts = db.prepare(`
      SELECT c.id, c.name, c.slug, COUNT(p.id) as count
      FROM product_categories c
      LEFT JOIN products p ON p.categoryId = c.id AND p.status = 'active'
      WHERE c.active = 1
      GROUP BY c.id
      ORDER BY c.sortOrder ASC
    `).all();

    res.json({
      success: true,
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      categories: categoryCounts
    });
  } catch (error) {
    console.error('[products] GET /products 에러:', error);
    res.status(500).json({ success: false, error: '상품 목록 조회 실패' });
  }
});

/**
 * [공개 2] GET /api/products/categories
 * 활성 카테고리 목록 (트리 구조)
 * 비유: 매장 안내판 — "1층 농구, 2층 축구" 같은 분류 목록
 * 주의: /products/:id 보다 먼저 선언해야 'categories'를 :id로 인식하지 않음
 */
router.get('/products/categories', (req, res) => {
  try {
    // 활성 카테고리만 조회 + 각 카테고리의 active 상품 수 포함
    const categories = db.prepare(`
      SELECT c.id, c.name, c.slug, c.parentId, c.sortOrder,
             COUNT(p.id) as productCount
      FROM product_categories c
      LEFT JOIN products p ON p.categoryId = c.id AND p.status = 'active'
      WHERE c.active = 1
      GROUP BY c.id
      ORDER BY c.sortOrder ASC
    `).all();

    // 트리 구조로 변환 — 대분류 아래에 중분류를 children으로 배치
    const tree = [];
    const parentMap = {};

    // 1차: 대분류(parentId가 null인 것) 수집
    categories.forEach(cat => {
      if (!cat.parentId) {
        cat.children = [];
        parentMap[cat.id] = cat;
        tree.push(cat);
      }
    });

    // 2차: 중분류를 부모의 children에 추가
    categories.forEach(cat => {
      if (cat.parentId && parentMap[cat.parentId]) {
        parentMap[cat.parentId].children.push(cat);
      }
    });

    res.json({ success: true, categories: tree });
  } catch (error) {
    console.error('[products] GET /products/categories 에러:', error);
    res.status(500).json({ success: false, error: '카테고리 조회 실패' });
  }
});

/**
 * [공개 3] GET /api/products/featured
 * 메인 추천 상품 (index.html 베스트셀러/신상품용)
 * 비유: 매장 입구의 "추천 코너" — 신상품, 베스트셀러를 모아서 보여줌
 */
router.get('/products/featured', (req, res) => {
  try {
    const { limit = 8 } = req.query;
    const limitNum = Math.min(20, Math.max(1, parseInt(limit) || 8));

    // 최신 상품 — 등록일 기준 정렬
    const newest = db.prepare(`
      SELECT p.id, p.type, p.name, p.nameEn, p.price, p.clubPrice,
             p.description, p.categoryId, p.customMeta, p.isConsultPrice,
             c.name AS categoryName,
             pi.url AS thumbnail
      FROM products p
      LEFT JOIN product_categories c ON p.categoryId = c.id
      LEFT JOIN product_images pi ON pi.productId = p.id AND pi.isPrimary = 1
      WHERE p.status = 'active'
      ORDER BY p.createdAt DESC
      LIMIT ?
    `).all(limitNum);

    // 추천 상품 — sortOrder가 작을수록 우선 (관리자가 직접 순서 지정)
    const recommended = db.prepare(`
      SELECT p.id, p.type, p.name, p.nameEn, p.price, p.clubPrice,
             p.description, p.categoryId, p.customMeta, p.isConsultPrice,
             c.name AS categoryName,
             pi.url AS thumbnail
      FROM products p
      LEFT JOIN product_categories c ON p.categoryId = c.id
      LEFT JOIN product_images pi ON pi.productId = p.id AND pi.isPrimary = 1
      WHERE p.status = 'active' AND p.sortOrder > 0
      ORDER BY p.sortOrder ASC
      LIMIT ?
    `).all(limitNum);

    // customMeta JSON 파싱
    [...newest, ...recommended].forEach(p => {
      try { p.customMeta = JSON.parse(p.customMeta || '{}'); } catch { p.customMeta = {}; }
    });

    res.json({ success: true, newest, recommended });
  } catch (error) {
    console.error('[products] GET /products/featured 에러:', error);
    res.status(500).json({ success: false, error: '추천 상품 조회 실패' });
  }
});

/**
 * [공개 4] GET /api/products/:id
 * 상품 상세 조회 (이미지 + 옵션 포함)
 * :id에 숫자(id) 또는 문자열(sku) 모두 허용
 * 비유: 매장에서 상품 하나를 집어들고 "라벨 + 사이즈 + 사진" 전부 확인하는 것
 */
router.get('/products/:id', (req, res) => {
  try {
    const { id } = req.params;

    // id가 숫자면 PK로, 문자열이면 sku로 조회
    const isNumeric = /^\d+$/.test(id);
    const productSql = `
      SELECT p.*, c.name AS categoryName, c.slug AS categorySlug
      FROM products p
      LEFT JOIN product_categories c ON p.categoryId = c.id
      WHERE ${isNumeric ? 'p.id = ?' : 'p.sku = ?'} AND p.status = 'active'
    `;
    const product = db.prepare(productSql).get(isNumeric ? parseInt(id) : id);

    if (!product) {
      return res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
    }

    // customMeta JSON 파싱
    try { product.customMeta = JSON.parse(product.customMeta || '{}'); } catch { product.customMeta = {}; }

    // 이미지 목록 조회 — 정렬 순서대로
    const images = db.prepare(`
      SELECT id, url, alt, isPrimary, sortOrder
      FROM product_images
      WHERE productId = ?
      ORDER BY sortOrder ASC
    `).all(product.id);

    // 옵션 목록 조회 — 사이즈, 색상 등
    const options = db.prepare(`
      SELECT id, optionType, optionValue, priceAdjust, stock, sortOrder
      FROM product_options
      WHERE productId = ? AND active = 1
      ORDER BY sortOrder ASC
    `).all(product.id);

    // 옵션을 타입별로 그룹핑 — { sizes: [...], colors: [...] }
    const groupedOptions = {};
    options.forEach(opt => {
      const key = opt.optionType + 's'; // size -> sizes, color -> colors
      if (!groupedOptions[key]) groupedOptions[key] = [];
      groupedOptions[key].push({
        value: opt.optionValue,
        stock: opt.stock,
        additionalPrice: opt.priceAdjust,
        id: opt.id
      });
    });

    // 같은 카테고리의 관련 상품 4개 (현재 상품 제외)
    const related = db.prepare(`
      SELECT p.id, p.type, p.name, p.price, p.customMeta,
             c.name AS categoryName,
             pi.url AS thumbnail
      FROM products p
      LEFT JOIN product_categories c ON p.categoryId = c.id
      LEFT JOIN product_images pi ON pi.productId = p.id AND pi.isPrimary = 1
      WHERE p.categoryId = ? AND p.id != ? AND p.status = 'active'
      ORDER BY RANDOM()
      LIMIT 4
    `).all(product.categoryId, product.id);

    related.forEach(p => {
      try { p.customMeta = JSON.parse(p.customMeta || '{}'); } catch { p.customMeta = {}; }
    });

    // 응답에서 원가/도매가 제외 (보안: 공개 API에서 민감 가격 노출 금지)
    const { costPrice, wholesalePrice, ...publicProduct } = product;

    res.json({
      success: true,
      product: {
        ...publicProduct,
        images,
        options: groupedOptions
      },
      relatedProducts: related
    });
  } catch (error) {
    console.error('[products] GET /products/:id 에러:', error);
    res.status(500).json({ success: false, error: '상품 상세 조회 실패' });
  }
});

// =============================================
// 관리자 API (adminAuth 필요)
// =============================================

/**
 * [관리자 1] GET /api/admin/products
 * 전체 상품 목록 (모든 상태, 원가 포함)
 * 비유: 재고실 전체 점검 — 비매품/숨김 상품까지 모두 보여줌
 */
router.get('/admin/products', adminAuth, (req, res) => {
  try {
    const {
      category, type, status, search,
      sort = 'newest', page = 1, limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    // 관리자는 모든 상태 조회 가능 — 필터 없으면 전체
    const conditions = [];
    const params = [];

    if (category) {
      conditions.push('p.categoryId = ?');
      params.push(parseInt(category));
    }
    if (type) {
      conditions.push('p.type = ?');
      params.push(type);
    }
    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(p.name LIKE ? OR p.nameEn LIKE ? OR p.sku LIKE ? OR p.keywords LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const sortMap = {
      newest: 'p.createdAt DESC',
      oldest: 'p.createdAt ASC',
      price_asc: 'p.price ASC',
      price_desc: 'p.price DESC',
      name: 'p.name ASC'
    };
    const orderBy = sortMap[sort] || sortMap.newest;

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM products p ${whereClause}`).get(...params);

    // 관리자용: 원가(costPrice), 도매가(wholesalePrice) 포함
    const products = db.prepare(`
      SELECT p.*, c.name AS categoryName, c.slug AS categorySlug,
             pi.url AS thumbnail
      FROM products p
      LEFT JOIN product_categories c ON p.categoryId = c.id
      LEFT JOIN product_images pi ON pi.productId = p.id AND pi.isPrimary = 1
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    products.forEach(p => {
      try { p.customMeta = JSON.parse(p.customMeta || '{}'); } catch { p.customMeta = {}; }
    });

    // 상태별 통계 (필터 패널용)
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count FROM products GROUP BY status
    `).all();

    res.json({
      success: true,
      products,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      statusCounts
    });
  } catch (error) {
    console.error('[products] GET /admin/products 에러:', error);
    res.status(500).json({ success: false, error: '관리자 상품 목록 조회 실패' });
  }
});

/**
 * [관리자 2] POST /api/admin/products
 * 상품 신규 등록 (JSON body)
 * 이미지는 별도 엔드포인트로 업로드 (등록 후 상품 ID로 연결)
 * 비유: 새 상품을 재고실에 입고하고 바코드(id)를 붙이는 것
 */
router.post('/admin/products', adminAuth, (req, res) => {
  try {
    const {
      type = 'ready', categoryId, name, nameEn = '', sku = '',
      description = '', price = 0, costPrice = 0, clubPrice = 0,
      wholesalePrice = 0, sizes = '', fabric = '', keywords = '',
      customMeta = '{}', status = 'draft', sortOrder = 0
    } = req.body;

    // 필수 필드 검증
    if (!name) {
      return res.status(400).json({ success: false, error: '상품명은 필수입니다.' });
    }
    if (!categoryId) {
      return res.status(400).json({ success: false, error: '카테고리를 선택해주세요.' });
    }

    const now = new Date().toISOString();

    // customMeta가 객체로 들어오면 문자열로 변환
    const metaStr = typeof customMeta === 'string' ? customMeta : JSON.stringify(customMeta);

    const result = db.prepare(`
      INSERT INTO products (type, categoryId, name, nameEn, sku, description,
        price, costPrice, clubPrice, wholesalePrice, sizes, fabric,
        keywords, customMeta, status, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      type, parseInt(categoryId), name, nameEn, sku, description,
      parseInt(price) || 0, parseInt(costPrice) || 0,
      parseInt(clubPrice) || 0, parseInt(wholesalePrice) || 0,
      sizes, fabric, keywords, metaStr, status, parseInt(sortOrder) || 0,
      now, now
    );

    // 사이즈 문자열이 있으면 product_options에 자동 등록
    // 예: "S,M,L,XL" -> 각각 옵션 행으로 삽입
    if (sizes) {
      const sizeList = sizes.split(',').map(s => s.trim()).filter(Boolean);
      const insertOpt = db.prepare(`
        INSERT INTO product_options (productId, optionType, optionValue, sortOrder)
        VALUES (?, 'size', ?, ?)
      `);
      sizeList.forEach((size, idx) => {
        insertOpt.run(result.lastInsertRowid, size, idx);
      });
    }

    res.json({
      success: true,
      product: { id: Number(result.lastInsertRowid) },
      message: '상품이 등록되었습니다.'
    });
  } catch (error) {
    console.error('[products] POST /admin/products 에러:', error);
    res.status(500).json({ success: false, error: '상품 등록 실패' });
  }
});

/**
 * [관리자 3] PUT /api/admin/products/:id
 * 상품 수정 (부분 수정 가능 — 전달된 필드만 업데이트)
 * 비유: 기존 상품의 가격표를 바꿔 붙이는 것
 */
router.put('/admin/products/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;

    // 기존 상품 확인
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(parseInt(id));
    if (!existing) {
      return res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
    }

    // 수정 가능한 필드 목록 — 전달된 것만 업데이트
    const allowedFields = [
      'type', 'categoryId', 'name', 'nameEn', 'sku', 'description',
      'price', 'costPrice', 'clubPrice', 'wholesalePrice',
      'sizes', 'fabric', 'keywords', 'customMeta', 'status', 'sortOrder'
    ];

    const updates = [];
    const values = [];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = req.body[field];
        // 숫자 필드는 정수 변환
        if (['price', 'costPrice', 'clubPrice', 'wholesalePrice', 'categoryId', 'sortOrder'].includes(field)) {
          val = parseInt(val) || 0;
        }
        // customMeta는 객체면 문자열로 변환
        if (field === 'customMeta' && typeof val === 'object') {
          val = JSON.stringify(val);
        }
        values.push(val);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '수정할 내용이 없습니다.' });
    }

    // updatedAt 자동 갱신
    updates.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(parseInt(id));

    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ success: true, message: '상품이 수정되었습니다.' });
  } catch (error) {
    console.error('[products] PUT /admin/products/:id 에러:', error);
    res.status(500).json({ success: false, error: '상품 수정 실패' });
  }
});

/**
 * [관리자 4] DELETE /api/admin/products/:id
 * 상품 삭제 (soft delete — status를 'archived'로 변경)
 * 비유: 상품을 매장에서 치우되 창고에는 보관 (완전 폐기 아님)
 */
router.delete('/admin/products/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(parseInt(id));

    if (!product) {
      return res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
    }

    // soft delete: 상태만 archived로 변경 (데이터 보존)
    db.prepare(`UPDATE products SET status = 'archived', updatedAt = ? WHERE id = ?`)
      .run(new Date().toISOString(), parseInt(id));

    res.json({ success: true, message: `"${product.name}" 상품이 삭제(보관)되었습니다.` });
  } catch (error) {
    console.error('[products] DELETE /admin/products/:id 에러:', error);
    res.status(500).json({ success: false, error: '상품 삭제 실패' });
  }
});

/**
 * [관리자 5] PATCH /api/admin/products/:id/status
 * 상태 빠른 변경 (active/draft/archived)
 * 비유: 상품 진열 스위치를 켜고 끄는 것
 */
router.patch('/admin/products/:id/status', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'draft', 'archived'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `유효하지 않은 상태입니다. (${validStatuses.join(', ')} 중 선택)`
      });
    }

    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(parseInt(id));
    if (!product) {
      return res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
    }

    db.prepare('UPDATE products SET status = ?, updatedAt = ? WHERE id = ?')
      .run(status, new Date().toISOString(), parseInt(id));

    res.json({ success: true, message: `상태가 "${status}"로 변경되었습니다.` });
  } catch (error) {
    console.error('[products] PATCH /admin/products/:id/status 에러:', error);
    res.status(500).json({ success: false, error: '상태 변경 실패' });
  }
});

/**
 * [관리자 6] POST /api/admin/products/:id/images
 * 상품 이미지 업로드 (여러 장)
 * 비유: 상품 사진을 찍어서 상품 카드에 붙이는 것
 */
router.post('/admin/products/:id/images', adminAuth, (req, res, next) => {
  // multer에 저장 경로와 접두사 전달
  req.uploadDir = 'products';
  req.uploadPrefix = 'prod';
  next();
}, productUpload.array('images', 10), (req, res) => {
  try {
    const { id } = req.params;

    // 상품 존재 확인
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(parseInt(id));
    if (!product) {
      return res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '업로드할 이미지가 없습니다.' });
    }

    // 기존 이미지 수 확인 — 대표 이미지 자동 설정용
    const { count: existingCount } = db.prepare(
      'SELECT COUNT(*) as count FROM product_images WHERE productId = ?'
    ).get(parseInt(id));

    const now = new Date().toISOString();
    const insertImg = db.prepare(`
      INSERT INTO product_images (productId, url, alt, isPrimary, sortOrder, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // primaryIndex: 클라이언트가 지정한 대표 이미지 인덱스 (FormData에서 전달)
    const primaryIndex = parseInt(req.body.primaryIndex);
    // type: 'detail'이면 상세페이지 이미지 (alt에 'detail' 저장)
    const imageType = req.body.type || '';

    const uploaded = [];
    req.files.forEach((file, idx) => {
      const url = `/uploads/products/${file.filename}`;
      // 대표 이미지 결정: primaryIndex가 있으면 해당 인덱스, 없으면 첫 이미지(기존 없을 때)
      let isPrimary = 0;
      if (!isNaN(primaryIndex)) {
        isPrimary = (idx === primaryIndex) ? 1 : 0;
      } else {
        isPrimary = (existingCount === 0 && idx === 0) ? 1 : 0;
      }
      const alt = imageType === 'detail' ? 'detail' : '';
      const sortOrder = existingCount + idx;

      const result = insertImg.run(parseInt(id), url, alt, isPrimary, sortOrder, now);
      uploaded.push({
        id: Number(result.lastInsertRowid),
        url,
        isPrimary,
        sortOrder,
        filename: file.filename,
        originalname: file.originalname,
        size: file.size
      });
    });

    res.json({
      success: true,
      images: uploaded,
      message: `${uploaded.length}개 이미지가 업로드되었습니다.`
    });
  } catch (error) {
    console.error('[products] POST /admin/products/:id/images 에러:', error);
    res.status(500).json({ success: false, error: '이미지 업로드 실패' });
  }
});

/**
 * [관리자 7] DELETE /api/admin/products/:id/images/:imageId
 * 이미지 개별 삭제 (DB 레코드 + 파일 모두 삭제)
 * 비유: 상품 카드에서 사진 한 장을 떼어내는 것
 */
router.delete('/admin/products/:id/images/:imageId', adminAuth, (req, res) => {
  try {
    const { id, imageId } = req.params;

    // 이미지 정보 조회
    const image = db.prepare(
      'SELECT * FROM product_images WHERE id = ? AND productId = ?'
    ).get(parseInt(imageId), parseInt(id));

    if (!image) {
      return res.status(404).json({ success: false, error: '이미지를 찾을 수 없습니다.' });
    }

    // DB에서 삭제
    db.prepare('DELETE FROM product_images WHERE id = ?').run(parseInt(imageId));

    // 실제 파일 삭제 (서버 디스크에서 제거)
    const filePath = path.join(__dirname, '..', image.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 삭제된 이미지가 대표였으면, 남은 이미지 중 첫 번째를 대표로 승격
    if (image.isPrimary) {
      const next = db.prepare(
        'SELECT id FROM product_images WHERE productId = ? ORDER BY sortOrder ASC LIMIT 1'
      ).get(parseInt(id));
      if (next) {
        db.prepare('UPDATE product_images SET isPrimary = 1 WHERE id = ?').run(next.id);
      }
    }

    res.json({ success: true, message: '이미지가 삭제되었습니다.' });
  } catch (error) {
    console.error('[products] DELETE /admin/products/:id/images/:imageId 에러:', error);
    res.status(500).json({ success: false, error: '이미지 삭제 실패' });
  }
});

/**
 * [관리자 8] PUT /api/admin/products/:id/images/order
 * 이미지 순서 변경 + 대표 이미지 설정
 * body: { order: [{ id: 3, sortOrder: 0, isPrimary: true }, ...] }
 * 비유: 상품 사진 앨범의 순서를 드래그앤드롭으로 바꾸는 것
 */
router.put('/admin/products/:id/images/order', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ success: false, error: '순서 정보가 필요합니다.' });
    }

    // 해당 상품의 모든 이미지를 먼저 isPrimary=0으로 초기화
    db.prepare('UPDATE product_images SET isPrimary = 0 WHERE productId = ?').run(parseInt(id));

    // 각 이미지의 sortOrder와 isPrimary를 업데이트
    const updateStmt = db.prepare(
      'UPDATE product_images SET sortOrder = ?, isPrimary = ? WHERE id = ? AND productId = ?'
    );

    order.forEach(item => {
      updateStmt.run(
        parseInt(item.sortOrder) || 0,
        item.isPrimary ? 1 : 0,
        parseInt(item.id),
        parseInt(id)
      );
    });

    res.json({ success: true, message: '이미지 순서가 변경되었습니다.' });
  } catch (error) {
    console.error('[products] PUT /admin/products/:id/images/order 에러:', error);
    res.status(500).json({ success: false, error: '이미지 순서 변경 실패' });
  }
});

/**
 * [관리자 9] GET /api/admin/products/categories
 * 카테고리 전체 목록 (비활성 포함 — 관리자용)
 * 비유: 매장 분류판을 전부 보여줌 (숨긴 분류까지)
 * 주의: /admin/products/:id 보다 먼저 선언되어야 함
 */
router.get('/admin/products/categories', adminAuth, (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT c.*, COUNT(p.id) as productCount
      FROM product_categories c
      LEFT JOIN products p ON p.categoryId = c.id
      GROUP BY c.id
      ORDER BY c.sortOrder ASC
    `).all();

    res.json({ success: true, categories });
  } catch (error) {
    console.error('[products] GET /admin/products/categories 에러:', error);
    res.status(500).json({ success: false, error: '카테고리 조회 실패' });
  }
});

/**
 * [관리자 10] POST /api/admin/products/categories
 * 카테고리 추가
 * 비유: 매장에 새로운 코너를 만드는 것
 */
router.post('/admin/products/categories', adminAuth, (req, res) => {
  try {
    const { name, slug, parentId = null, sortOrder = 0 } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: '카테고리 이름은 필수입니다.' });
    }

    // slug 중복 체크
    if (slug) {
      const existing = db.prepare('SELECT id FROM product_categories WHERE slug = ?').get(slug);
      if (existing) {
        return res.status(409).json({ success: false, error: '이미 사용중인 slug입니다.' });
      }
    }

    const now = new Date().toISOString();
    // slug가 없으면 이름을 기반으로 자동 생성 (한글은 그대로 사용)
    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '-');

    const result = db.prepare(`
      INSERT INTO product_categories (name, slug, parentId, sortOrder, active, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(name, finalSlug, parentId ? parseInt(parentId) : null, parseInt(sortOrder) || 0, now, now);

    res.json({
      success: true,
      category: { id: Number(result.lastInsertRowid), name, slug: finalSlug },
      message: '카테고리가 추가되었습니다.'
    });
  } catch (error) {
    console.error('[products] POST /admin/products/categories 에러:', error);
    res.status(500).json({ success: false, error: '카테고리 추가 실패' });
  }
});

/**
 * [관리자 11] PUT /api/admin/products/categories/:id
 * 카테고리 수정
 */
router.put('/admin/products/categories/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, parentId, sortOrder, active } = req.body;

    const existing = db.prepare('SELECT id FROM product_categories WHERE id = ?').get(parseInt(id));
    if (!existing) {
      return res.status(404).json({ success: false, error: '카테고리를 찾을 수 없습니다.' });
    }

    // slug 중복 체크 (자기 자신은 제외)
    if (slug) {
      const dup = db.prepare('SELECT id FROM product_categories WHERE slug = ? AND id != ?').get(slug, parseInt(id));
      if (dup) {
        return res.status(409).json({ success: false, error: '이미 사용중인 slug입니다.' });
      }
    }

    // 전달된 필드만 업데이트
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (slug !== undefined) { updates.push('slug = ?'); values.push(slug); }
    if (parentId !== undefined) { updates.push('parentId = ?'); values.push(parentId ? parseInt(parentId) : null); }
    if (sortOrder !== undefined) { updates.push('sortOrder = ?'); values.push(parseInt(sortOrder) || 0); }
    if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '수정할 내용이 없습니다.' });
    }

    updates.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(parseInt(id));

    db.prepare(`UPDATE product_categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ success: true, message: '카테고리가 수정되었습니다.' });
  } catch (error) {
    console.error('[products] PUT /admin/products/categories/:id 에러:', error);
    res.status(500).json({ success: false, error: '카테고리 수정 실패' });
  }
});

/**
 * [관리자 12] DELETE /api/admin/products/categories/:id
 * 카테고리 삭제 — 하위 상품이 있으면 거부
 * 비유: 매장의 코너를 없애려면 먼저 진열된 상품을 다 치워야 함
 */
router.delete('/admin/products/categories/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;

    const category = db.prepare('SELECT id, name FROM product_categories WHERE id = ?').get(parseInt(id));
    if (!category) {
      return res.status(404).json({ success: false, error: '카테고리를 찾을 수 없습니다.' });
    }

    // 하위 카테고리 확인
    const { childCount } = db.prepare(
      'SELECT COUNT(*) as childCount FROM product_categories WHERE parentId = ?'
    ).get(parseInt(id));
    if (childCount > 0) {
      return res.status(409).json({
        success: false,
        error: `하위 카테고리가 ${childCount}개 있습니다. 먼저 하위 카테고리를 삭제해주세요.`
      });
    }

    // 해당 카테고리에 상품이 있는지 확인
    const { productCount } = db.prepare(
      'SELECT COUNT(*) as productCount FROM products WHERE categoryId = ?'
    ).get(parseInt(id));
    if (productCount > 0) {
      return res.status(409).json({
        success: false,
        error: `"${category.name}" 카테고리에 상품이 ${productCount}개 있습니다. 먼저 상품을 이동하거나 삭제해주세요.`
      });
    }

    // 안전하게 삭제
    db.prepare('DELETE FROM product_categories WHERE id = ?').run(parseInt(id));

    res.json({ success: true, message: `"${category.name}" 카테고리가 삭제되었습니다.` });
  } catch (error) {
    console.error('[products] DELETE /admin/products/categories/:id 에러:', error);
    res.status(500).json({ success: false, error: '카테고리 삭제 실패' });
  }
});

// --- multer 에러 처리 ---
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '파일 크기가 제한을 초과했습니다. (최대 10MB)' });
  }
  if (err.message && err.message.includes('허용되지 않는')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
