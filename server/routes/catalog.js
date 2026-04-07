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
        const filtered = {
            sports: (catalog.sports || []).filter(s => s.active),
            categories: (catalog.categories || []).filter(c => c.active),
            sportCategoryMap: catalog.sportCategoryMap || null,
            fabrics: (catalog.fabrics || []).filter(f => f.active),
            compositions: {
                homeAway: (catalog.compositions?.homeAway || []).filter(h => h.active),
                parts: (catalog.compositions?.parts || []).filter(p => p.active),
                type: (catalog.compositions?.type || []).filter(t => t.active),
            },
            basePrices: catalog.basePrices || {},
            sizes: catalog.sizes || [],
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
        if (!catalog || !catalog.sports || !catalog.categories || !catalog.fabrics) {
            return res.status(400).json({
                success: false,
                error: '카탈로그 데이터가 올바르지 않습니다. sports, categories, fabrics는 필수입니다.',
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

export default router;
