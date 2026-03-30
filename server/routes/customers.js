/**
 * 고객 관리 API 라우트
 * 관리자가 고객 목록 조회, 검색, 상세 확인, 수정, 병합 등을 할 수 있다.
 *
 * 모든 엔드포인트는 /api/admin/customers 하위에 마운트되며,
 * adminAuth 미들웨어를 통과해야 접근 가능하다.
 *
 * 비유: 고객 명부(CRM)를 API로 관리하는 것.
 *       Google Sheets에서 고객 탭을 별도로 관리하던 것을 대체한다.
 */

import express from 'express';
import db from '../db.js';

const router = express.Router();

// ============================================================
// GET /api/admin/customers - 고객 목록 (검색/정렬/페이지네이션)
// 비유: 고객 명부를 넘기면서 원하는 고객을 찾는 것
// ============================================================
router.get('/', (req, res) => {
    try {
        let customers = db.getAll('customers');

        // 텍스트 검색 (이름, 팀명, 전화번호, 이메일에서 검색)
        if (req.query.search) {
            const keyword = req.query.search.toLowerCase();
            customers = customers.filter(c =>
                (c.name || '').toLowerCase().includes(keyword) ||
                (c.teamName || '').toLowerCase().includes(keyword) ||
                (c.phone || '').toLowerCase().includes(keyword) ||
                (c.email || '').toLowerCase().includes(keyword)
            );
        }

        // 거래유형 필터 (예: ?dealType=재고)
        if (req.query.dealType) {
            customers = customers.filter(c => c.dealType === req.query.dealType);
        }

        // 전체 건수 (페이지네이션 전)
        const total = customers.length;

        // 정렬 (기본: 주문 수 내림차순 = 단골 고객 먼저)
        const sortBy = req.query.sortBy || 'orderCount';
        const sortOrder = req.query.sortOrder || 'desc';
        customers.sort((a, b) => {
            const aVal = a[sortBy] ?? '';
            const bVal = b[sortBy] ?? '';
            if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
            return aVal < bVal ? 1 : -1;
        });

        // 페이지네이션
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const totalPages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const paged = customers.slice(start, start + limit);

        res.json({
            success: true,
            customers: paged,
            pagination: { total, page, totalPages, limit }
        });
    } catch (error) {
        console.error('[Admin] Customers list error:', error);
        res.status(500).json({ success: false, error: '고객 목록 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/customers/:id - 고객 상세 (+ 연결된 주문 목록)
// 비유: 고객 카드를 열어서 거래 이력을 한눈에 보는 것
// ============================================================
router.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const customers = db.getAll('customers');
        const customer = customers.find(c => c.id === id);

        if (!customer) {
            return res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' });
        }

        // 해당 고객의 주문 목록 가져오기
        const allOrders = db.getAll('orders');
        const customerOrders = allOrders
            .filter(o => o.customerId === id)
            .map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                teamName: o.customer?.teamName || '',
                status: o.status,
                totalAmount: o.payment?.totalAmount || o.total || 0,
                createdAt: o.createdAt,
                items: (o.items || []).map(i => ({
                    name: i.name,
                    sport: i.sport,
                    quantity: i.quantity
                }))
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            customer,
            orders: customerOrders
        });
    } catch (error) {
        console.error('[Admin] Customer detail error:', error);
        res.status(500).json({ success: false, error: '고객 상세 조회 실패' });
    }
});

// ============================================================
// PUT /api/admin/customers/:id - 고객 정보 수정
// 관리자가 연락처, 메모 등을 업데이트할 때 사용
// ============================================================
router.put('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const customers = db.getAll('customers');
        const index = customers.findIndex(c => c.id === id);

        if (index === -1) {
            return res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' });
        }

        // 수정 불가 필드 보호
        const updates = { ...req.body };
        delete updates.id;
        delete updates.createdAt;
        delete updates.orderIds;      // 주문 연결은 자동 관리
        delete updates.orderCount;    // 주문 통계는 자동 계산
        delete updates.totalSpent;    // 매출 통계는 자동 계산
        updates.updatedAt = new Date().toISOString();

        // 기존 데이터에 업데이트 병합
        customers[index] = { ...customers[index], ...updates };
        db.saveAll('customers', customers);

        console.log(`[Admin] Customer updated: ${customers[index].teamName || customers[index].name} by ${req.user?.name}`);

        res.json({ success: true, customer: customers[index] });
    } catch (error) {
        console.error('[Admin] Customer update error:', error);
        res.status(500).json({ success: false, error: '고객 수정 실패' });
    }
});

// ============================================================
// POST /api/admin/customers/merge - 고객 병합
// 같은 고객이 다른 이름으로 등록된 경우, 하나로 합치는 기능
// 비유: 연락처 앱에서 중복 연락처를 합치는 것
// ============================================================
router.post('/merge', (req, res) => {
    try {
        const { keepId, mergeId } = req.body;

        if (!keepId || !mergeId) {
            return res.status(400).json({
                success: false,
                error: 'keepId(유지할 고객)와 mergeId(병합할 고객)를 지정하세요.'
            });
        }

        const customers = db.getAll('customers');
        const keepCustomer = customers.find(c => c.id === keepId);
        const mergeCustomer = customers.find(c => c.id === mergeId);

        if (!keepCustomer || !mergeCustomer) {
            return res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' });
        }

        // 병합: mergeCustomer의 주문을 keepCustomer로 이전
        keepCustomer.orderIds = [...new Set([
            ...(keepCustomer.orderIds || []),
            ...(mergeCustomer.orderIds || [])
        ])];
        keepCustomer.orderCount = keepCustomer.orderIds.length;
        keepCustomer.totalSpent = (keepCustomer.totalSpent || 0) + (mergeCustomer.totalSpent || 0);
        keepCustomer.updatedAt = new Date().toISOString();

        // orders.json에서 mergeId → keepId로 변경
        const orders = db.getAll('orders');
        let updatedOrders = 0;
        orders.forEach(o => {
            if (o.customerId === mergeId) {
                o.customerId = keepId;
                updatedOrders++;
            }
        });
        db.saveAll('orders', orders);

        // 병합된 고객 삭제
        const filtered = customers.filter(c => c.id !== mergeId);
        // keepCustomer 업데이트 반영
        const keepIndex = filtered.findIndex(c => c.id === keepId);
        if (keepIndex !== -1) filtered[keepIndex] = keepCustomer;
        db.saveAll('customers', filtered);

        console.log(`[Admin] Customers merged: ${mergeCustomer.teamName || mergeCustomer.name} → ${keepCustomer.teamName || keepCustomer.name} (${updatedOrders}건 이전)`);

        res.json({
            success: true,
            customer: keepCustomer,
            mergedOrders: updatedOrders,
            message: `${mergeCustomer.teamName || mergeCustomer.name}이(가) ${keepCustomer.teamName || keepCustomer.name}으로 병합되었습니다.`
        });
    } catch (error) {
        console.error('[Admin] Merge error:', error);
        res.status(500).json({ success: false, error: '고객 병합 실패' });
    }
});

// ============================================================
// GET /api/admin/customers/stats/summary - 고객 통계 요약
// ============================================================
router.get('/stats/summary', (req, res) => {
    try {
        const customers = db.getAll('customers');

        // 거래유형별 집계
        const dealTypeCounts = {};
        let totalCustomers = customers.length;
        let repeatCustomers = 0;  // 재주문 고객 (2건 이상)

        customers.forEach(c => {
            const dt = c.dealType || '미분류';
            dealTypeCounts[dt] = (dealTypeCounts[dt] || 0) + 1;
            if (c.orderCount >= 2) repeatCustomers++;
        });

        res.json({
            success: true,
            stats: {
                totalCustomers,
                repeatCustomers,
                repeatRate: totalCustomers > 0
                    ? Math.round((repeatCustomers / totalCustomers) * 100)
                    : 0,
                dealTypeCounts
            }
        });
    } catch (error) {
        console.error('[Admin] Customer stats error:', error);
        res.status(500).json({ success: false, error: '고객 통계 조회 실패' });
    }
});

export default router;
