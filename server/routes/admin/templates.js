/**
 * 관리자 주문 템플릿(order_templates) 라우트
 * 2026-04-22: admin.js에서 분리 (templates 도메인 5개 라우트, D-90/D-91 패턴 3차)
 *
 * 비유: "워드의 문서 템플릿" 기능
 *  - 자주 쓰는 주문 설정을 저장해두고
 *  - 새 주문 생성 시 불러와 자동 채우기
 *
 * URL 매핑 (admin.js에서 `router.use('/templates', ...)`로 mount):
 *   GET    /api/admin/templates        → router.get('/')
 *   GET    /api/admin/templates/:id    → router.get('/:id')
 *   POST   /api/admin/templates        → router.post('/')
 *   PUT    /api/admin/templates/:id    → router.put('/:id')
 *   DELETE /api/admin/templates/:id    → router.delete('/:id')
 *
 * ⚠️ adminAuth는 server.js:124에서 이미 router-level로 적용됨 → 여기서 중복 부착 금지 (C-5)
 * ⚠️ E-20 함정: 이 파일은 server/routes/admin/ (2단계 깊이)이므로 import 경로는 `../../` 사용
 *    - db.js         → ../../db.js         (server/db.js)
 *    - activityLog.js → ../../activityLog.js (server/activityLog.js)
 */

import express from 'express';
// E-20: server/routes/admin/templates.js 기준 → server/db.js는 2단계 상위
import db from '../../db.js';
// E-20: server/activityLog.js도 동일하게 2단계 상위 경로
import { logActivity } from '../../activityLog.js';

const router = express.Router();

// --- GET /api/admin/templates --- 템플릿 목록 (검색/카테고리 필터)
router.get('/', (req, res) => {
    try {
        let templates = db.getAll('order_templates');

        // 카테고리 필터 (예: ?category=축구)
        if (req.query.category) {
            templates = templates.filter(t => t.category === req.query.category);
        }

        // 텍스트 검색 (이름, 설명에서 검색)
        if (req.query.search) {
            const keyword = req.query.search.toLowerCase();
            templates = templates.filter(t =>
                (t.name || '').toLowerCase().includes(keyword) ||
                (t.description || '').toLowerCase().includes(keyword)
            );
        }

        // 정렬: 사용 횟수 내림차순 (인기순) → 최신순
        templates.sort((a, b) => {
            if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        res.json({ success: true, templates });
    } catch (error) {
        console.error('[Admin] Templates list error:', error);
        res.status(500).json({ success: false, error: '템플릿 목록 조회 실패' });
    }
});

// --- GET /api/admin/templates/:id --- 템플릿 상세
router.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const template = db.findById('order_templates', id);

        if (!template) {
            return res.status(404).json({ success: false, error: '템플릿을 찾을 수 없습니다.' });
        }

        res.json({ success: true, template });
    } catch (error) {
        console.error('[Admin] Template detail error:', error);
        res.status(500).json({ success: false, error: '템플릿 조회 실패' });
    }
});

// --- POST /api/admin/templates --- 템플릿 생성
router.post('/', (req, res) => {
    try {
        const { name, description, category, templateData } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: '템플릿 이름은 필수입니다.' });
        }
        if (!templateData) {
            return res.status(400).json({ success: false, error: '템플릿 데이터가 없습니다.' });
        }

        const now = new Date().toISOString();
        const template = {
            id: Date.now(),
            name: name.trim(),
            description: (description || '').trim(),
            category: (category || '').trim(),
            templateData,         // JS 객체 — db-sqlite.js가 JSON.stringify 처리
            usageCount: 0,
            createdBy: req.user?.name || '관리자',
            createdAt: now,
            updatedAt: now,
        };

        const saved = db.insert('order_templates', template);

        // [D-2] 활동 로그
        logActivity('template_create', {
            templateName: saved.name,
            templateId: saved.id,
            category: saved.category
        }, req.user);

        console.log(`[Admin] Template created: "${saved.name}" by ${req.user?.name}`);
        res.json({ success: true, template: saved, message: `템플릿 "${saved.name}"이 생성되었습니다.` });
    } catch (error) {
        console.error('[Admin] Template create error:', error);
        res.status(500).json({ success: false, error: '템플릿 생성 실패' });
    }
});

// --- PUT /api/admin/templates/:id --- 템플릿 수정
router.put('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = db.findById('order_templates', id);

        if (!existing) {
            return res.status(404).json({ success: false, error: '템플릿을 찾을 수 없습니다.' });
        }

        // 수정 가능 필드만 추출
        const updates = {};
        if (req.body.name !== undefined) updates.name = req.body.name.trim();
        if (req.body.description !== undefined) updates.description = req.body.description.trim();
        if (req.body.category !== undefined) updates.category = req.body.category.trim();
        if (req.body.templateData !== undefined) updates.templateData = req.body.templateData;
        updates.updatedAt = new Date().toISOString();

        const updated = db.updateById('order_templates', id, updates);

        logActivity('template_update', {
            templateName: updated.name,
            templateId: updated.id
        }, req.user);

        console.log(`[Admin] Template updated: "${updated.name}" by ${req.user?.name}`);
        res.json({ success: true, template: updated, message: '템플릿이 수정되었습니다.' });
    } catch (error) {
        console.error('[Admin] Template update error:', error);
        res.status(500).json({ success: false, error: '템플릿 수정 실패' });
    }
});

// --- DELETE /api/admin/templates/:id --- 템플릿 삭제
router.delete('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = db.findById('order_templates', id);

        if (!existing) {
            return res.status(404).json({ success: false, error: '템플릿을 찾을 수 없습니다.' });
        }

        db.deleteById('order_templates', id);

        logActivity('template_delete', {
            templateName: existing.name,
            templateId: existing.id
        }, req.user);

        console.log(`[Admin] Template deleted: "${existing.name}" by ${req.user?.name}`);
        res.json({ success: true, message: `템플릿 "${existing.name}"이 삭제되었습니다.` });
    } catch (error) {
        console.error('[Admin] Template delete error:', error);
        res.status(500).json({ success: false, error: '템플릿 삭제 실패' });
    }
});

export default router;
