/**
 * 장바구니 서버 동기화 API (cart.js)
 * 비유: 마트에서 장바구니를 카운터에 맡기는 서비스
 * - 비로그인: localStorage만 사용 (이 API 호출 안 함)
 * - 로그인: localStorage ↔ 서버 양방향 동기화
 *
 * 엔드포인트:
 *   GET    /api/cart         — 내 장바구니 조회
 *   POST   /api/cart         — 항목 추가/수량 변경
 *   DELETE /api/cart/:id     — 항목 삭제
 *   POST   /api/cart/merge   — 로그인 시 localStorage 장바구니를 서버에 병합
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/adminAuth.js';
import { database as db } from '../db-sqlite.js';

const router = Router();

// ===== GET /api/cart — 로그인 사용자의 장바구니 전체 조회 =====
// 비유: "내 장바구니 보여줘"
router.get('/cart', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    // 해당 사용자의 장바구니 항목을 최신순으로 조회
    const items = db.prepare(
      'SELECT * FROM cart_items WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId);

    res.json({ success: true, items });
  } catch (err) {
    console.error('[cart] 조회 실패:', err);
    res.status(500).json({ success: false, error: '장바구니 조회 실패' });
  }
});

// ===== POST /api/cart — 장바구니에 항목 추가 또는 수량 변경 =====
// 비유: 상품을 장바구니에 넣는 것. 이미 있으면 수량만 증가
// UNIQUE(userId, productId, size) 제약이 중복 방지
router.post('/cart', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, name, price, size, qty, image } = req.body;

    // 필수값 검증
    if (!productId) {
      return res.status(400).json({ success: false, error: 'productId는 필수입니다.' });
    }

    const quantity = parseInt(qty) || 1;

    // 이미 같은 상품+사이즈가 있는지 확인
    const existing = db.prepare(
      'SELECT * FROM cart_items WHERE userId = ? AND productId = ? AND size = ?'
    ).get(userId, productId, size || '');

    if (existing) {
      // 있으면 수량 합산 + 최신 정보로 업데이트
      db.prepare(
        `UPDATE cart_items SET qty = qty + ?, name = ?, price = ?, image = ?, updatedAt = datetime('now')
         WHERE id = ?`
      ).run(quantity, name || existing.name, price ?? existing.price, image || existing.image, existing.id);
    } else {
      // 없으면 새로 추가
      db.prepare(
        `INSERT INTO cart_items (userId, productId, name, price, size, qty, image)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(userId, productId, name || '', price || 0, size || '', quantity, image || '');
    }

    // 변경된 장바구니 반환
    const items = db.prepare(
      'SELECT * FROM cart_items WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId);

    res.json({ success: true, items });
  } catch (err) {
    console.error('[cart] 추가 실패:', err);
    res.status(500).json({ success: false, error: '장바구니 추가 실패' });
  }
});

// ===== DELETE /api/cart/:id — 장바구니 항목 삭제 =====
// 비유: 장바구니에서 상품을 빼는 것
// 본인 장바구니의 항목만 삭제 가능 (다른 사용자 것은 불가)
router.delete('/cart/:id', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = parseInt(req.params.id);

    // 본인 장바구니 항목인지 확인 후 삭제 (보안: 다른 사람 장바구니 삭제 방지)
    const result = db.prepare(
      'DELETE FROM cart_items WHERE id = ? AND userId = ?'
    ).run(itemId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: '항목을 찾을 수 없습니다.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[cart] 삭제 실패:', err);
    res.status(500).json({ success: false, error: '장바구니 삭제 실패' });
  }
});

// ===== POST /api/cart/merge — 로그인 시 localStorage 장바구니를 서버에 병합 =====
// 비유: 비로그인 상태에서 담은 물건을 로그인 후 "내 장바구니"에 합치는 것
// 같은 상품+사이즈가 이미 서버에 있으면 수량을 더 큰 쪽으로 업데이트
// 이 API는 로그인 직후 1번만 호출된다
router.post('/cart/merge', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const { items } = req.body; // localStorage에서 가져온 장바구니 배열

    if (!Array.isArray(items) || items.length === 0) {
      // 병합할 항목이 없으면 서버 장바구니 그대로 반환
      const serverItems = db.prepare(
        'SELECT * FROM cart_items WHERE userId = ? ORDER BY createdAt DESC'
      ).all(userId);
      return res.json({ success: true, items: serverItems });
    }

    // 트랜잭션으로 묶어서 중간에 실패하면 전부 롤백
    const mergeTransaction = db.transaction((localItems) => {
      for (const item of localItems) {
        const productId = item.id || item.productId;
        if (!productId) continue; // id 없는 항목은 무시

        const size = item.size || '';
        const qty = parseInt(item.qty) || 1;

        // 서버에 같은 상품+사이즈가 있는지 확인
        const existing = db.prepare(
          'SELECT * FROM cart_items WHERE userId = ? AND productId = ? AND size = ?'
        ).get(userId, productId, size);

        if (existing) {
          // 있으면 수량을 더 큰 쪽으로 업데이트 (로컬이 더 크면 로컬 우선)
          const newQty = Math.max(existing.qty, qty);
          db.prepare(
            `UPDATE cart_items SET qty = ?, name = ?, price = ?, image = ?, updatedAt = datetime('now')
             WHERE id = ?`
          ).run(newQty, item.name || existing.name, item.price ?? existing.price, item.image || existing.image, existing.id);
        } else {
          // 없으면 새로 추가
          db.prepare(
            `INSERT INTO cart_items (userId, productId, name, price, size, qty, image)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(userId, productId, item.name || '', item.price || 0, size, qty, item.image || '');
        }
      }
    });

    mergeTransaction(items);

    // 병합 완료된 장바구니 반환
    const mergedItems = db.prepare(
      'SELECT * FROM cart_items WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId);

    res.json({ success: true, items: mergedItems });
  } catch (err) {
    console.error('[cart] 병합 실패:', err);
    res.status(500).json({ success: false, error: '장바구니 병합 실패' });
  }
});

export default router;
