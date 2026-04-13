/**
 * 상품 리뷰 API (Phase F: 오픈 전 필수)
 * 비유: 쇼핑몰 상품 페이지 하단의 "구매 후기" 게시판 API
 *
 * 엔드포인트 4개:
 * - GET    /api/products/:productId/reviews  — 상품별 리뷰 목록 (공개)
 * - POST   /api/products/:productId/reviews  — 리뷰 작성 (로그인 필요)
 * - PUT    /api/reviews/:id                  — 리뷰 수정 (작성자만)
 * - DELETE /api/reviews/:id                  — 리뷰 삭제 (작성자 또는 관리자)
 */

import express from 'express';
import db, { database } from '../db.js';
import { requireAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// ===== 1. GET /api/products/:productId/reviews — 리뷰 목록 (공개) =====
// 비유: 상품 페이지에 들어가면 누구나 볼 수 있는 후기 리스트
router.get('/products/:productId/reviews', (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (!productId || isNaN(productId)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 상품 ID입니다.' });
    }

    // 최신 리뷰가 위에 오도록 내림차순 정렬
    const reviews = database.prepare(
      'SELECT * FROM product_reviews WHERE productId = ? ORDER BY createdAt DESC'
    ).all(productId);

    // 평균 별점 계산 — 리뷰가 0개면 0 반환
    const stats = database.prepare(
      'SELECT COUNT(*) as count, COALESCE(AVG(rating), 0) as avgRating FROM product_reviews WHERE productId = ?'
    ).get(productId);

    res.json({
      success: true,
      reviews,
      stats: {
        count: stats.count,
        // 소수점 첫째 자리까지 반올림 (예: 4.3)
        avgRating: Math.round(stats.avgRating * 10) / 10,
      },
    });
  } catch (error) {
    console.error('[Reviews] 목록 조회 실패:', error);
    res.status(500).json({ success: false, error: '리뷰 목록 조회 실패' });
  }
});

// ===== 2. POST /api/products/:productId/reviews — 리뷰 작성 (로그인 필요) =====
// 비유: 로그인한 회원이 "후기 작성" 버튼을 눌러 별점+텍스트를 남기는 것
router.post('/products/:productId/reviews', requireAuth, (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (!productId || isNaN(productId)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 상품 ID입니다.' });
    }

    const { rating, content } = req.body;

    // 별점 검증: 1~5 정수만 허용
    const ratingNum = parseInt(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, error: '별점은 1~5 사이의 정수여야 합니다.' });
    }

    // 내용 검증: 최소 2자 이상
    if (!content || content.trim().length < 2) {
      return res.status(400).json({ success: false, error: '리뷰 내용을 2자 이상 입력해주세요.' });
    }

    // 같은 상품에 같은 사용자가 이미 리뷰를 작성했는지 확인 (중복 방지)
    const existing = database.prepare(
      'SELECT id FROM product_reviews WHERE productId = ? AND userId = ?'
    ).get(productId, req.user.id);

    if (existing) {
      return res.status(409).json({ success: false, error: '이미 이 상품에 리뷰를 작성하셨습니다.' });
    }

    const now = new Date().toISOString();
    // ID 생성: 타임스탬프 + 랜덤 3자리 (db-sqlite.js와 동일 패턴)
    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    // DB에서 사용자 이름 조회 — requireAuth의 req.user에 name이 없을 수 있으므로 직접 조회
    const userRecord = db.findById('users', req.user.id);
    const userName = userRecord?.name || req.user.name || '';

    // DB 삽입 — userName은 스냅샷으로 저장 (나중에 사용자 이름이 바뀌어도 리뷰에는 작성 시점 이름 유지)
    database.prepare(`
      INSERT INTO product_reviews (id, productId, userId, userName, rating, content, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, productId, req.user.id, userName, ratingNum, content.trim(), now, now);

    const review = database.prepare('SELECT * FROM product_reviews WHERE id = ?').get(id);

    console.log(`[Reviews] 리뷰 작성: 상품=${productId}, 사용자=${req.user.email}, 별점=${ratingNum}`);
    res.json({ success: true, review });
  } catch (error) {
    console.error('[Reviews] 작성 실패:', error);
    res.status(500).json({ success: false, error: '리뷰 작성 실패' });
  }
});

// ===== 3. PUT /api/reviews/:id — 리뷰 수정 (작성자만) =====
// 비유: 자기가 쓴 후기의 "수정" 버튼을 눌러 내용을 고치는 것
router.put('/reviews/:id', requireAuth, (req, res) => {
  try {
    const reviewId = parseInt(req.params.id);
    if (!reviewId || isNaN(reviewId)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 리뷰 ID입니다.' });
    }

    // 리뷰 존재 여부 확인
    const review = database.prepare('SELECT * FROM product_reviews WHERE id = ?').get(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, error: '리뷰를 찾을 수 없습니다.' });
    }

    // 작성자 본인만 수정 가능 (관리자도 수정은 불가 — 삭제만 가능)
    if (review.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: '본인이 작성한 리뷰만 수정할 수 있습니다.' });
    }

    const { rating, content } = req.body;

    // 별점 검증
    const ratingNum = parseInt(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, error: '별점은 1~5 사이의 정수여야 합니다.' });
    }

    // 내용 검증
    if (!content || content.trim().length < 2) {
      return res.status(400).json({ success: false, error: '리뷰 내용을 2자 이상 입력해주세요.' });
    }

    const now = new Date().toISOString();
    database.prepare(
      'UPDATE product_reviews SET rating = ?, content = ?, updatedAt = ? WHERE id = ?'
    ).run(ratingNum, content.trim(), now, reviewId);

    const updated = database.prepare('SELECT * FROM product_reviews WHERE id = ?').get(reviewId);

    console.log(`[Reviews] 리뷰 수정: ID=${reviewId}, 사용자=${req.user.email}`);
    res.json({ success: true, review: updated });
  } catch (error) {
    console.error('[Reviews] 수정 실패:', error);
    res.status(500).json({ success: false, error: '리뷰 수정 실패' });
  }
});

// ===== 4. DELETE /api/reviews/:id — 리뷰 삭제 (작성자 또는 관리자) =====
// 비유: 자기 후기 삭제하거나, 관리자가 부적절한 후기를 제거하는 것
router.delete('/reviews/:id', requireAuth, (req, res) => {
  try {
    const reviewId = parseInt(req.params.id);
    if (!reviewId || isNaN(reviewId)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 리뷰 ID입니다.' });
    }

    const review = database.prepare('SELECT * FROM product_reviews WHERE id = ?').get(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, error: '리뷰를 찾을 수 없습니다.' });
    }

    // 작성자 본인이거나 관리자만 삭제 가능
    if (review.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '삭제 권한이 없습니다.' });
    }

    database.prepare('DELETE FROM product_reviews WHERE id = ?').run(reviewId);

    console.log(`[Reviews] 리뷰 삭제: ID=${reviewId}, 삭제자=${req.user.email}`);
    res.json({ success: true, message: '리뷰가 삭제되었습니다.' });
  } catch (error) {
    console.error('[Reviews] 삭제 실패:', error);
    res.status(500).json({ success: false, error: '리뷰 삭제 실패' });
  }
});

// ===== 5. GET /api/admin/reviews — 관리자용 전체 리뷰 목록 (W-2) =====
// 비유: 관리자가 모든 상품의 후기를 한 곳에서 관리하는 대시보드
// adminAuth는 server.js에서 개별 적용하지 않고, 여기서 직접 import하여 사용
import { adminAuth } from '../middleware/adminAuth.js';

router.get('/admin/reviews', adminAuth, (req, res) => {
  try {
    // 쿼리 파라미터: page, limit, productId, rating (필터)
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const productId = parseInt(req.query.productId) || null;
    const rating = parseInt(req.query.rating) || null;

    // WHERE 조건 동적 조립 — 필터가 있으면 추가
    let where = '1=1';
    const params = [];

    if (productId) {
      where += ' AND r.productId = ?';
      params.push(productId);
    }
    if (rating && rating >= 1 && rating <= 5) {
      where += ' AND r.rating = ?';
      params.push(rating);
    }

    // 총 개수 (페이지네이션용)
    const countRow = database.prepare(
      `SELECT COUNT(*) as total FROM product_reviews r WHERE ${where}`
    ).get(...params);

    // 리뷰 목록 — 상품명도 함께 조회 (JOIN)
    const reviews = database.prepare(`
      SELECT r.*, p.name as productName,
             (SELECT url FROM product_images WHERE productId = p.id AND isPrimary = 1 LIMIT 1) as productThumbnail
      FROM product_reviews r
      LEFT JOIN products p ON r.productId = p.id
      WHERE ${where}
      ORDER BY r.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // 통계: 전체 리뷰 수, 평균 별점, 별점 분포
    const stats = database.prepare(
      'SELECT COUNT(*) as total, COALESCE(AVG(rating), 0) as avgRating FROM product_reviews'
    ).get();
    const distribution = database.prepare(
      'SELECT rating, COUNT(*) as count FROM product_reviews GROUP BY rating ORDER BY rating DESC'
    ).all();

    res.json({
      success: true,
      reviews,
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limit)
      },
      stats: {
        total: stats.total,
        avgRating: Math.round(stats.avgRating * 10) / 10,
        distribution
      }
    });
  } catch (error) {
    console.error('[Reviews] 관리자 목록 조회 실패:', error);
    res.status(500).json({ success: false, error: '리뷰 목록 조회 실패' });
  }
});

export default router;
