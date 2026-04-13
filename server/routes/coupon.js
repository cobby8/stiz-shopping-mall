/**
 * 쿠폰/적립금 API (#15)
 * 비유: 할인 쿠폰함 시스템 — 쿠폰 코드 입력 → 유효성 검증 → 할인 적용
 *
 * 공개 API: 쿠폰 유효성 검증 (로그인 불필요)
 * 관리자 API: 쿠폰 생성/목록 조회
 */

import express from 'express';
import { database } from '../db-sqlite.js';
import { adminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// ============================================================
// GET /api/coupons/check?code=xxx — 쿠폰 유효성 검증
// 비유: 쿠폰 코드를 계산대에 제출하면, "이 쿠폰 쓸 수 있는지" 확인해주는 것
// ============================================================
router.get('/coupons/check', (req, res) => {
    try {
        const { code } = req.query;

        // 코드 미입력
        if (!code) {
            return res.status(400).json({ success: false, error: '쿠폰 코드를 입력해주세요.' });
        }

        // DB에서 쿠폰 조회
        const coupon = database.prepare('SELECT * FROM coupons WHERE code = ?').get(code.trim().toUpperCase());

        // 존재하지 않는 쿠폰
        if (!coupon) {
            return res.status(404).json({ success: false, error: '유효하지 않은 쿠폰 코드입니다.' });
        }

        // 비활성 쿠폰
        if (!coupon.isActive) {
            return res.status(400).json({ success: false, error: '사용할 수 없는 쿠폰입니다.' });
        }

        // 사용 횟수 초과
        if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ success: false, error: '쿠폰 사용 횟수가 초과되었습니다.' });
        }

        // 만료일 확인 (expiresAt이 있고, 현재 시각이 만료일 이후이면 만료)
        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
            return res.status(400).json({ success: false, error: '만료된 쿠폰입니다.' });
        }

        // 유효한 쿠폰 — 할인 정보 반환
        res.json({
            success: true,
            coupon: {
                code: coupon.code,
                name: coupon.name,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                minOrderAmount: coupon.minOrderAmount,
                maxDiscount: coupon.maxDiscount
            }
        });
    } catch (error) {
        console.error('[Coupon] 쿠폰 검증 실패:', error);
        res.status(500).json({ success: false, error: '쿠폰 검증 중 오류가 발생했습니다.' });
    }
});

// ============================================================
// POST /api/admin/coupons — 쿠폰 생성 (관리자 전용)
// 비유: 관리자가 새 쿠폰을 발행하는 것 (할인율, 유효기간 등 설정)
// ============================================================
router.post('/admin/coupons', adminAuth, (req, res) => {
    try {
        const { code, name, discountType, discountValue, minOrderAmount, maxDiscount, usageLimit, expiresAt } = req.body;

        // 필수값 검증
        if (!code || !name || discountValue === undefined) {
            return res.status(400).json({ success: false, error: '쿠폰 코드, 이름, 할인 값은 필수입니다.' });
        }

        // 중복 코드 체크
        const existing = database.prepare('SELECT id FROM coupons WHERE code = ?').get(code.trim().toUpperCase());
        if (existing) {
            return res.status(409).json({ success: false, error: '이미 존재하는 쿠폰 코드입니다.' });
        }

        // 쿠폰 INSERT
        const stmt = database.prepare(`
            INSERT INTO coupons (code, name, discountType, discountValue, minOrderAmount, maxDiscount, usageLimit, expiresAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            code.trim().toUpperCase(),
            name.trim(),
            discountType || 'percent',
            parseInt(discountValue),
            parseInt(minOrderAmount) || 0,
            maxDiscount ? parseInt(maxDiscount) : null,
            parseInt(usageLimit) || 1,
            expiresAt || null
        );

        console.log(`[Coupon] 쿠폰 생성: ${code} (${name})`);
        res.json({
            success: true,
            coupon: { id: result.lastInsertRowid, code: code.trim().toUpperCase(), name }
        });
    } catch (error) {
        console.error('[Coupon] 쿠폰 생성 실패:', error);
        res.status(500).json({ success: false, error: '쿠폰 생성 실패' });
    }
});

// ============================================================
// GET /api/admin/coupons — 쿠폰 목록 조회 (관리자 전용)
// ============================================================
router.get('/admin/coupons', adminAuth, (req, res) => {
    try {
        const coupons = database.prepare('SELECT * FROM coupons ORDER BY createdAt DESC').all();
        res.json({ success: true, coupons });
    } catch (error) {
        console.error('[Coupon] 쿠폰 목록 조회 실패:', error);
        res.status(500).json({ success: false, error: '쿠폰 목록 조회 실패' });
    }
});

export default router;
