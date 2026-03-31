/**
 * 관리자 전용 API 라우트
 * Google Sheets 수동 관리를 대체하는 핵심 API
 *
 * 모든 엔드포인트에 adminAuth 미들웨어가 적용되어
 * 관리자 JWT 토큰이 없으면 접근 불가
 */

import express from 'express';
import db from '../db.js';
import { STATUS_FLOW, STATUS_LABELS, getCustomerStatus } from './orders.js';

const router = express.Router();

// ============================================================
// GET /api/admin/orders - 전체 주문 목록 (필터/검색/정렬/페이지네이션)
// 비유: Google Sheets의 필터 기능을 API로 구현한 것
// ============================================================
router.get('/orders', (req, res) => {
    try {
        // 쿼리 파라미터에서 필터 조건 추출
        const filters = {};

        // 상태 필터 (예: ?status=in_production)
        if (req.query.status) filters.status = req.query.status;
        // 담당자 필터 (예: ?manager=신경록)
        if (req.query.manager) filters.manager = req.query.manager;

        // 중첩 필드 필터 (종목, 거래유형)
        // findByFilter에서 'customer.dealType' 같은 dot notation 지원
        if (req.query.sport) filters['items.0.sport'] = req.query.sport; // 첫 번째 아이템의 종목
        if (req.query.dealType) filters['customer.dealType'] = req.query.dealType;

        // 정렬/페이지네이션/검색 옵션 + 범위 필터
        const options = {
            search: req.query.search || '',
            sortBy: req.query.sortBy || 'createdAt',
            sortOrder: req.query.sortOrder || 'desc',
            page: req.query.page || 1,
            limit: req.query.limit || 20,
            // 날짜 범위 필터 (예: ?dateFrom=2026-01-01&dateTo=2026-03-31)
            dateFrom: req.query.dateFrom || '',
            dateTo: req.query.dateTo || '',
            // 금액 범위 필터 (예: ?amountMin=500000&amountMax=1000000)
            amountMin: req.query.amountMin || '',
            amountMax: req.query.amountMax || ''
        };

        let result = db.findByFilter('orders', filters, options);

        // 미수금 필터: 결제일이 없고 금액이 있는 주문만 (비유: 외상 장부만 보기)
        if (req.query.unpaid === 'true') {
            const allOrders = db.getAll('orders');
            const unpaidOrders = allOrders.filter(o => {
                const amount = o.payment?.totalAmount || 0;
                const paidDate = o.payment?.paidDate;
                return !paidDate && amount > 0 && o.status !== 'cancelled';
            });
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const start = (page - 1) * limit;
            result = {
                data: unpaidOrders.slice(start, start + limit),
                total: unpaidOrders.length,
                page,
                totalPages: Math.ceil(unpaidOrders.length / limit)
            };
        }

        res.json({
            success: true,
            orders: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                totalPages: result.totalPages,
                limit: parseInt(options.limit)
            }
        });
    } catch (error) {
        console.error('[Admin] Orders list error:', error);
        res.status(500).json({ success: false, error: '주문 목록 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/orders/:id - 주문 상세 조회
// ============================================================
router.get('/orders/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const order = db.findById('orders', id);

        if (!order) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        // 상태 변경 이력도 함께 반환
        const allHistory = db.getAll('order-history');
        const history = allHistory
            .filter(h => h.orderId === id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            order,
            history,
            statusLabels: STATUS_LABELS    // 프론트엔드에서 라벨 표시용
        });
    } catch (error) {
        console.error('[Admin] Order detail error:', error);
        res.status(500).json({ success: false, error: '주문 상세 조회 실패' });
    }
});

// ============================================================
// PUT /api/admin/orders/:id - 주문 정보 수정 (전체 필드)
// 비유: Google Sheets에서 셀을 직접 편집하는 것과 동일
// ============================================================
router.put('/orders/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = db.findById('orders', id);

        if (!existing) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        // 수정 불가 필드 보호 (id, orderNumber, createdAt은 변경 불가)
        const updates = { ...req.body };
        delete updates.id;
        delete updates.orderNumber;
        delete updates.createdAt;
        updates.updatedAt = new Date().toISOString();

        const updated = db.updateById('orders', id, updates);

        console.log(`[Admin] Order updated: ${existing.orderNumber} by ${req.user.name}`);

        res.json({ success: true, order: updated });
    } catch (error) {
        console.error('[Admin] Order update error:', error);
        res.status(500).json({ success: false, error: '주문 수정 실패' });
    }
});

// ============================================================
// PATCH /api/admin/orders/:id/status - 상태 변경 (+ 이력 자동 기록)
// 비유: Google Sheets에서 "상태" 열 값을 바꾸면
//       옆 시트에 "누가 언제 바꿨는지" 자동으로 기록되는 것
// ============================================================
router.patch('/orders/:id/status', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status, memo } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, error: '변경할 상태를 지정하세요.' });
        }

        // 유효한 상태값인지 확인
        if (!STATUS_FLOW.includes(status)) {
            return res.status(400).json({
                success: false,
                error: `유효하지 않은 상태입니다. 가능한 값: ${STATUS_FLOW.join(', ')}`
            });
        }

        const existing = db.findById('orders', id);
        if (!existing) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        const fromStatus = existing.status;

        // 주문 상태 업데이트
        const updated = db.updateById('orders', id, {
            status,
            updatedAt: new Date().toISOString()
        });

        // 상태 변경 이력 자동 기록 (order-history.json에 추가)
        db.insert('order-history', {
            orderId: id,
            orderNumber: existing.orderNumber,
            fromStatus,
            toStatus: status,
            changedBy: `admin_${req.user.name}`,   // 누가 바꿨는지
            memo: memo || '',                       // 변경 사유
            createdAt: new Date().toISOString()
        });

        console.log(`[Admin] Status changed: ${existing.orderNumber} ${fromStatus} → ${status} by ${req.user.name}`);

        res.json({
            success: true,
            order: updated,
            statusChange: {
                from: { status: fromStatus, label: STATUS_LABELS[fromStatus] },
                to: { status, label: STATUS_LABELS[status] }
            }
        });
    } catch (error) {
        console.error('[Admin] Status change error:', error);
        res.status(500).json({ success: false, error: '상태 변경 실패' });
    }
});

// ============================================================
// GET /api/admin/orders/:id/history - 상태 변경 이력 조회
// ============================================================
router.get('/orders/:id/history', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const allHistory = db.getAll('order-history');
        const history = allHistory
            .filter(h => h.orderId === id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            history,
            statusLabels: STATUS_LABELS
        });
    } catch (error) {
        console.error('[Admin] History error:', error);
        res.status(500).json({ success: false, error: '이력 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats - 대시보드 통계
// 비유: Google Sheets 상단의 요약 행 (상태별 건수, 매출 합계 등)
// ============================================================
router.get('/stats', (req, res) => {
    try {
        const orders = db.getAll('orders');

        // 1) 상태별 건수 - 고객용 4단계 기준으로 집계
        const statusCounts = {
            design: 0,        // 시안 진행중
            production: 0,    // 제작 진행중
            shipping: 0,      // 배송 준비중
            delivered: 0      // 배송완료
        };

        // 2) 상세 상태별 건수 (관리자용)
        const detailedStatusCounts = {};

        // 3) 담당자별 건수
        const managerCounts = {};

        // 4) 종목별 건수
        const sportCounts = {};

        // 4-b) 거래유형별 건수 (동호회, 대학동아리, 학원SC 등)
        const dealTypeCounts = {};

        // 5) 총 매출
        let totalRevenue = 0;

        // 6) 미수금 (결제일 없는 주문의 총금액 합산)
        // 비유: 물건은 보냈는데 아직 돈을 안 받은 금액 합계
        let unpaidAmount = 0;

        // 7) 보류 건수
        let holdCount = 0;

        orders.forEach(order => {
            // 4단계 집계
            const cs = getCustomerStatus(order.status);
            if (cs.step === 1) statusCounts.design++;
            else if (cs.step === 2) statusCounts.production++;
            else if (cs.step === 3) statusCounts.shipping++;
            else if (cs.step === 4) statusCounts.delivered++;

            // 상세 상태 집계
            const st = order.status || 'unknown';
            detailedStatusCounts[st] = (detailedStatusCounts[st] || 0) + 1;

            // 담당자 집계
            const mgr = order.manager || '미배정';
            managerCounts[mgr] = (managerCounts[mgr] || 0) + 1;

            // 종목 집계 (첫 번째 아이템 기준)
            const sport = order.items?.[0]?.sport || 'unknown';
            sportCounts[sport] = (sportCounts[sport] || 0) + 1;

            // 거래유형 집계 (customer.dealType 기준)
            const dealType = order.customer?.dealType || '미분류';
            dealTypeCounts[dealType] = (dealTypeCounts[dealType] || 0) + 1;

            // 매출 합산
            const orderAmount = order.payment?.totalAmount || order.total || 0;
            totalRevenue += orderAmount;

            // 미수금 집계: 결제일(paidDate)이 비어있고, 금액이 있는 주문
            if (!order.payment?.paidDate && orderAmount > 0 && order.status !== 'cancelled') {
                unpaidAmount += orderAmount;
            }

            // 보류 건수
            if (order.status === 'hold') holdCount++;
        });

        res.json({
            success: true,
            stats: {
                totalOrders: orders.length,
                statusCounts,              // 4단계 요약
                detailedStatusCounts,      // 12단계 상세 (hold, cancelled 포함)
                managerCounts,             // 담당자별
                sportCounts,               // 종목별
                dealTypeCounts,            // 거래유형별
                totalRevenue,              // 총 매출
                unpaidAmount,              // 미수금 합계
                holdCount                  // 보류 건수
            }
        });
    } catch (error) {
        console.error('[Admin] Stats error:', error);
        res.status(500).json({ success: false, error: '통계 조회 실패' });
    }
});

// ============================================================
// POST /api/admin/orders/:id/notify - 수동 알림 발송 트리거
// Phase 4에서 실제 카카오/SMS 연동 시 확장 예정. 지금은 로그만 기록
// ============================================================
router.post('/orders/:id/notify', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const order = db.findById('orders', id);

        if (!order) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        const { message, type } = req.body; // type: 'status_update' | 'custom'

        // Phase 4 전까지는 로그만 기록
        console.log(`[Notify] Manual notification triggered for ${order.orderNumber}`);
        console.log(`  Type: ${type || 'custom'}, Message: ${message || '(no message)'}`);
        console.log(`  Customer: ${order.customer?.name} / ${order.customer?.phone}`);

        res.json({
            success: true,
            message: '알림 발송이 기록되었습니다. (실제 발송은 Phase 4에서 구현 예정)',
            notification: {
                orderId: id,
                orderNumber: order.orderNumber,
                customerName: order.customer?.name,
                type: type || 'custom',
                sentAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('[Admin] Notify error:', error);
        res.status(500).json({ success: false, error: '알림 발송 실패' });
    }
});

export default router;
