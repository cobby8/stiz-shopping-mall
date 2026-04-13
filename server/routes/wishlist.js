/**
 * 위시리스트(찜) 라우트 (wishlist.js)
 * 로그인한 사용자가 상품에 하트를 누르면 서버에 저장
 * 비유: 쇼핑몰의 "관심상품" 기능 — 여러 기기에서 동기화됨
 *
 * 엔드포인트:
 * - GET    /api/wishlist              — 내 찜 목록 (상품 정보 포함)
 * - POST   /api/wishlist              — 찜 토글 (있으면 삭제, 없으면 추가)
 * - DELETE /api/wishlist/:productId   — 찜 삭제
 */

import express from 'express';
import { database } from '../db-sqlite.js';
import { requireAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// ============================================================
// GET /api/wishlist — 내 찜 목록 조회
// wishlists 테이블과 products 테이블을 JOIN하여 상품 정보도 함께 반환
// 비유: "관심상품 보관함"을 열어보는 것
// ============================================================
router.get('/wishlist', requireAuth, (req, res) => {
    try {
        const userId = req.user.id;

        // wishlists + products + product_images(대표이미지) JOIN
        // 찜한 상품의 이름, 가격, 썸네일을 한 번에 가져옴
        const items = database.prepare(`
            SELECT w.id, w.productId, w.createdAt,
                   p.name, p.price, p.type, p.status,
                   (SELECT url FROM product_images WHERE productId = p.id AND isPrimary = 1 LIMIT 1) as thumbnail
            FROM wishlists w
            LEFT JOIN products p ON w.productId = p.id
            WHERE w.userId = ?
            ORDER BY w.createdAt DESC
        `).all(userId);

        res.json({ success: true, items });
    } catch (error) {
        console.error('[Wishlist] 목록 조회 실패:', error);
        res.status(500).json({ success: false, error: '찜 목록 조회 실패' });
    }
});

// ============================================================
// POST /api/wishlist — 찜 토글 (추가/삭제)
// body: { productId }
// 이미 찜한 상품이면 삭제, 아니면 추가 → "하트 토글" 동작
// ============================================================
router.post('/wishlist', requireAuth, (req, res) => {
    try {
        const userId = req.user.id;
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, error: 'productId가 필요합니다.' });
        }

        // 이미 찜한 상품인지 확인
        const existing = database.prepare(
            'SELECT id FROM wishlists WHERE userId = ? AND productId = ?'
        ).get(userId, productId);

        if (existing) {
            // 이미 있으면 삭제 (토글 OFF)
            database.prepare('DELETE FROM wishlists WHERE id = ?').run(existing.id);
            return res.json({ success: true, wishlisted: false, message: '찜이 해제되었습니다.' });
        }

        // 없으면 추가 (토글 ON)
        database.prepare(
            "INSERT INTO wishlists (userId, productId, createdAt) VALUES (?, ?, datetime('now'))"
        ).run(userId, productId);

        res.json({ success: true, wishlisted: true, message: '찜 목록에 추가되었습니다.' });
    } catch (error) {
        console.error('[Wishlist] 토글 실패:', error);
        res.status(500).json({ success: false, error: '찜 처리 실패' });
    }
});

// ============================================================
// DELETE /api/wishlist/:productId — 찜 삭제
// URL 파라미터로 상품 ID를 받아 해당 찜 삭제
// ============================================================
router.delete('/wishlist/:productId', requireAuth, (req, res) => {
    try {
        const userId = req.user.id;
        const productId = parseInt(req.params.productId);

        const result = database.prepare(
            'DELETE FROM wishlists WHERE userId = ? AND productId = ?'
        ).run(userId, productId);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: '찜 목록에 없는 상품입니다.' });
        }

        res.json({ success: true, message: '찜이 해제되었습니다.' });
    } catch (error) {
        console.error('[Wishlist] 삭제 실패:', error);
        res.status(500).json({ success: false, error: '찜 삭제 실패' });
    }
});

export default router;
