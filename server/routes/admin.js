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
import { runBackup } from '../backup.js';  // 수동 백업 API용

const router = express.Router();

// 매출 기준일 반환 (주문서접수일 우선, 없으면 상담개시일 폴백)
// 비유: "계약일"이 있으면 계약일 기준, 없으면 "상담일" 기준으로 매출 집계
function getRevenueDate(order) {
    return order.orderReceiptDate || order.createdAt;
}

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

        // 완료 주문 제외 여부 (기본값: true = 진행중만 표시)
        // 비유: 기본으로 "이미 끝난 주문"은 숨기고, "전체" 탭 클릭 시에만 전부 표시
        const excludeCompleted = req.query.excludeCompleted !== 'false';

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
            amountMax: req.query.amountMax || '',
            // 완료 상태 제외: delivered(배송완료), cancelled(취소)를 목록에서 빼기
            excludeStatuses: excludeCompleted ? ['delivered', 'cancelled'] : []
        };

        // 탭 건수 계산용: 동일 필터 조건에서 진행중/전체 각각의 건수를 구한다
        // 비유: "진행중 (309건)" / "전체 (8,073건)" 표시를 위해 두 가지 건수 모두 필요
        const optionsAll = { ...options, excludeStatuses: [], page: 1, limit: 1 };
        const resultAll = db.findByFilter('orders', filters, optionsAll);
        const optionsActive = { ...options, excludeStatuses: ['delivered', 'cancelled'], page: 1, limit: 1 };
        const resultActive = db.findByFilter('orders', filters, optionsActive);

        // 상태별 건수 계산: 진행중 하위 탭에 각 상태별 건수를 표시하기 위함
        // 비유: "시안요청 (12건)" / "제작중 (5건)" 등 세부 상태별 숫자
        // 상태 필터를 제외한 나머지 필터 조건(담당자, 종목 등)은 유지
        const statusTabs = ['design_requested', 'design_confirmed', 'draft_done', 'line_work', 'in_production', 'released', 'hold'];
        const statusCounts = {};
        const filtersWithoutStatus = { ...filters };
        delete filtersWithoutStatus.status; // 상태 필터만 제거
        statusTabs.forEach(st => {
            const stFilters = { ...filtersWithoutStatus, status: st };
            const stOptions = { ...options, excludeStatuses: [], page: 1, limit: 1 };
            const stResult = db.findByFilter('orders', stFilters, stOptions);
            statusCounts[st] = stResult.total;
        });

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
                limit: parseInt(options.limit),
                // totalAll: 현재 필터 조건에서 상태 제외 없이 센 전체 건수
                // totalActive: 완료/취소 제외한 진행중 건수
                // 비유: "진행중 탭"과 "전체 탭"에 각각 표시할 건수
                totalAll: resultAll.total,
                totalActive: resultActive.total,
                // 상태별 건수: 진행중 하위 탭에 표시
                statusCounts: statusCounts
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
// PATCH /api/admin/orders/bulk-status - 주문 일괄 상태 변경
// 비유: 체크리스트에서 여러 항목을 한번에 체크하고 상태를 일괄 변경하는 것
// ============================================================
router.patch('/orders/bulk-status', (req, res) => {
    try {
        const { orderIds, status } = req.body;

        // 필수 파라미터 검증
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ success: false, error: '변경할 주문 ID 목록을 지정하세요.' });
        }
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

        // 각 주문을 순회하며 상태 변경 + 이력 기록
        const results = [];
        let updated = 0;
        let failed = 0;

        orderIds.forEach(orderId => {
            const id = parseInt(orderId);
            const existing = db.findById('orders', id);

            if (!existing) {
                // 주문을 찾을 수 없는 경우
                results.push({ id, success: false, error: '주문 없음' });
                failed++;
                return;
            }

            const fromStatus = existing.status;

            // 이미 같은 상태면 건너뛰기 (불필요한 이력 방지)
            if (fromStatus === status) {
                results.push({ id, success: true, skipped: true, orderNumber: existing.orderNumber });
                updated++;
                return;
            }

            // 상태 업데이트
            db.updateById('orders', id, {
                status,
                updatedAt: new Date().toISOString()
            });

            // 상태 변경 이력 기록
            db.insert('order-history', {
                orderId: id,
                orderNumber: existing.orderNumber,
                fromStatus,
                toStatus: status,
                changedBy: `admin_${req.user.name}`,
                memo: `일괄 변경 (${orderIds.length}건 중)`,
                createdAt: new Date().toISOString()
            });

            results.push({ id, success: true, orderNumber: existing.orderNumber, fromStatus, toStatus: status });
            updated++;
        });

        console.log(`[Admin] Bulk status change: ${updated} updated, ${failed} failed → ${status} by ${req.user.name}`);

        res.json({
            success: true,
            updated,
            failed,
            results,
            statusLabel: STATUS_LABELS[status]
        });
    } catch (error) {
        console.error('[Admin] Bulk status change error:', error);
        res.status(500).json({ success: false, error: '일괄 상태 변경 실패' });
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
        const allOrders = db.getAll('orders');

        // 연도 파라미터: 기본값은 현재 연도 (예: 2026)
        // 비유: "올해 매출만 보기" — 연도 드롭다운에서 선택한 연도의 주문만 집계
        const year = req.query.year || new Date().getFullYear().toString();

        // 매출 기준일(orderReceiptDate) 기준으로 해당 연도 주문만 필터링
        // 폴백: orderReceiptDate가 없으면 createdAt(상담개시일) 사용
        const orders = allOrders.filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

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

        // 8) 고객별 미수금 집계 — 비유: "외상 장부"를 고객별로 정리한 것
        // paidDate가 없고, 금액이 있고, 취소가 아닌 주문을 고객별로 모아서 합산
        const unpaidByCustomerMap = {};
        orders.forEach(order => {
            const amount = order.payment?.totalAmount || 0;
            const paidDate = order.payment?.paidDate;
            if (!paidDate && amount > 0 && order.status !== 'cancelled') {
                // 고객명을 키로 사용 (같은 이름의 고객은 합산)
                const key = order.customer?.name || '미상';
                if (!unpaidByCustomerMap[key]) {
                    unpaidByCustomerMap[key] = {
                        customerName: order.customer?.name || '미상',
                        teamName: order.customer?.teamName || '-',
                        count: 0,
                        totalAmount: 0
                    };
                }
                unpaidByCustomerMap[key].count++;
                unpaidByCustomerMap[key].totalAmount += amount;
            }
        });

        // 금액 내림차순 정렬 후 상위 20명만 반환
        const unpaidByCustomer = Object.values(unpaidByCustomerMap)
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 20);

        // 미수금 건수 합계 (탭 표시용)
        const unpaidCount = orders.filter(o => {
            const amt = o.payment?.totalAmount || 0;
            return !o.payment?.paidDate && amt > 0 && o.status !== 'cancelled';
        }).length;

        res.json({
            success: true,
            stats: {
                year,                          // 선택된 연도 (프론트에서 표시용)
                totalOrders: orders.length,
                statusCounts,              // 4단계 요약
                detailedStatusCounts,      // 12단계 상세 (hold, cancelled 포함)
                managerCounts,             // 담당자별
                sportCounts,               // 종목별
                dealTypeCounts,            // 거래유형별
                totalRevenue,              // 총 매출
                unpaidAmount,              // 미수금 합계
                unpaidCount,               // 미수금 건수
                unpaidByCustomer,          // 고객별 미수금 TOP 20
                holdCount                  // 보류 건수
            }
        });
    } catch (error) {
        console.error('[Admin] Stats error:', error);
        res.status(500).json({ success: false, error: '통계 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats/monthly - 월별 매출/주문수 집계
// 비유: 매출 보고서를 월별로 나눠 차트에 그릴 데이터를 만드는 것
// ============================================================
router.get('/stats/monthly', (req, res) => {
    try {
        const allOrders = db.getAll('orders');

        // 연도 파라미터: 기본값은 현재 연도
        const year = req.query.year || new Date().getFullYear().toString();

        // 해당 연도 주문만 필터링 (매출 기준일 = orderReceiptDate 우선)
        const orders = allOrders.filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // 1~12월 월별 데이터 초기화
        // 비유: 12칸짜리 빈 성적표를 먼저 만들어놓고, 주문을 하나씩 해당 월 칸에 넣기
        const monthly = [];
        for (let m = 1; m <= 12; m++) {
            monthly.push({ month: m, revenue: 0, orders: 0 });
        }

        // 각 주문을 해당 월에 집계
        orders.forEach(order => {
            // 매출 기준일에서 월 추출 (ISO 형식: "2025-11-04T00:00:00.000Z")
            const revenueDate = getRevenueDate(order);
            const monthStr = revenueDate.substring(5, 7); // "11" 같은 문자열
            const monthIdx = parseInt(monthStr, 10) - 1;      // 0부터 시작하는 인덱스
            if (monthIdx >= 0 && monthIdx < 12) {
                const amount = order.payment?.totalAmount || order.total || 0;
                monthly[monthIdx].revenue += amount;
                monthly[monthIdx].orders += 1;
            }
        });

        res.json({
            success: true,
            year,
            monthly
        });
    } catch (error) {
        console.error('[Admin] Monthly stats error:', error);
        res.status(500).json({ success: false, error: '월별 통계 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats/staff - 담당자별 실적 집계
// 비유: 직원별 성적표 — 누가 몇 건을 처리했고, 매출은 얼마이며, 완료율은 어떤지
// ============================================================
router.get('/stats/staff', (req, res) => {
    try {
        const allOrders = db.getAll('orders');

        // 연도 파라미터: 기본값은 현재 연도
        const year = req.query.year || new Date().getFullYear().toString();

        // 해당 연도 주문만 필터 (매출 기준일 = orderReceiptDate 우선)
        const orders = allOrders.filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // 담당자별 집계 맵: { "김현서": { orders, revenue, delivered, totalDays, daysCount } }
        const staffMap = {};

        orders.forEach(order => {
            const name = order.manager || '미배정';

            // 담당자 데이터 초기화
            if (!staffMap[name]) {
                staffMap[name] = {
                    name,
                    orders: 0,        // 총 주문수
                    revenue: 0,       // 총 매출
                    delivered: 0,     // 배송완료 건수 (완료율 계산용)
                    totalDays: 0,     // 처리일 합계 (평균 계산용)
                    daysCount: 0      // 처리일을 계산할 수 있는 건수
                };
            }

            const staff = staffMap[name];
            staff.orders += 1;
            staff.revenue += order.payment?.totalAmount || order.total || 0;

            // 완료율: delivered 상태인 주문 비율
            if (order.status === 'delivered') {
                staff.delivered += 1;
            }

            // 평균 처리일: createdAt ~ shipping.shippedDate 또는 updatedAt(delivered)
            // 비유: 주문 접수일부터 배송완료일까지 며칠 걸렸는지 평균
            if (order.status === 'delivered' && order.createdAt) {
                const startDate = new Date(order.createdAt);
                // 배송일이 있으면 배송일, 없으면 updatedAt 사용
                const endDateStr = order.shipping?.shippedDate || order.updatedAt;
                if (endDateStr) {
                    const endDate = new Date(endDateStr);
                    const diffDays = Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
                    // 비정상 데이터 필터 (365일 이상은 제외)
                    if (diffDays <= 365) {
                        staff.totalDays += diffDays;
                        staff.daysCount += 1;
                    }
                }
            }
        });

        // 집계 결과를 배열로 변환 + 완료율/평균 처리일 계산
        const staff = Object.values(staffMap)
            .map(s => ({
                name: s.name,
                orders: s.orders,
                revenue: s.revenue,
                // 완료율: 배송완료 건수 / 전체 건수 (백분율, 소수점 1자리)
                completionRate: s.orders > 0
                    ? Math.round((s.delivered / s.orders) * 1000) / 10
                    : 0,
                // 평균 처리일: 처리일 합계 / 처리일 계산 가능 건수 (소수점 1자리)
                avgDays: s.daysCount > 0
                    ? Math.round((s.totalDays / s.daysCount) * 10) / 10
                    : null  // 데이터 없으면 null
            }))
            // 매출 내림차순 정렬 (가장 많이 번 담당자가 위에)
            .sort((a, b) => b.revenue - a.revenue);

        res.json({
            success: true,
            year,
            staff
        });
    } catch (error) {
        console.error('[Admin] Staff stats error:', error);
        res.status(500).json({ success: false, error: '담당자별 실적 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats/top-customers - 고객별 매출 랭킹 TOP 20
// 비유: VIP 고객 순위표 — 누가 가장 많이 주문하고 매출이 높은지 한눈에 파악
// ============================================================
router.get('/stats/top-customers', (req, res) => {
    try {
        const allOrders = db.getAll('orders');
        const allCustomers = db.getAll('customers');

        // 연도 파라미터: 기본값은 현재 연도
        const year = req.query.year || new Date().getFullYear().toString();

        // 해당 연도 주문만 필터 (매출 기준일 = orderReceiptDate 우선)
        const orders = allOrders.filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // 고객별 매출 집계 맵
        // 키: customerId (없으면 고객명 fallback)
        // 비유: 고객마다 통장을 만들어서, 주문이 들어올 때마다 금액을 적어넣는 것
        const customerMap = {};

        orders.forEach(order => {
            // customerId가 있으면 우선 사용, 없으면 고객명으로 그룹핑
            const key = order.customerId || order.customer?.name || '미상';
            const amount = order.payment?.totalAmount || order.total || 0;

            if (!customerMap[key]) {
                customerMap[key] = {
                    customerId: order.customerId || null,
                    name: order.customer?.name || '미상',
                    teamName: order.customer?.teamName || '-',
                    dealType: order.customer?.dealType || '미분류',
                    orders: 0,           // 해당 연도 주문수
                    revenue: 0,          // 해당 연도 매출 합계
                    lastOrderDate: null   // 해당 연도 최근 주문일
                };
            }

            const c = customerMap[key];
            c.orders += 1;
            c.revenue += amount;

            // 최근 주문일 갱신 (매출 기준일 기준, 더 최신 날짜로 교체)
            const revenueDate = getRevenueDate(order);
            if (!c.lastOrderDate || revenueDate > c.lastOrderDate) {
                c.lastOrderDate = revenueDate;
            }
        });

        // customers.json에서 전체 주문수(orderCount) 가져와 재주문율 계산
        // 재주문율: 해당 고객의 총 주문 횟수가 2회 이상이면 "재주문 고객"
        // 비유: 단골 여부 — 한 번만 온 손님(1회)과 여러 번 온 단골(2회+)을 구분
        const result = Object.values(customerMap).map(c => {
            // customers.json에서 해당 고객의 전체 주문수 조회
            let totalOrderCount = c.orders; // 기본: 이번 연도 주문수
            if (c.customerId) {
                const customerRecord = allCustomers.find(cust => cust.id === c.customerId);
                if (customerRecord) {
                    totalOrderCount = customerRecord.orderCount || c.orders;
                }
            }

            return {
                ...c,
                // 재주문 여부: 전체 주문 2회 이상이면 true
                isRepeat: totalOrderCount >= 2,
                totalOrderCount  // 전체 기간 주문수 (참고용)
            };
        });

        // 매출 내림차순 정렬 후 TOP 20
        const topCustomers = result
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20);

        // 재주문 고객 비율 (전체 고객 중)
        const totalCustomerCount = Object.keys(customerMap).length;
        const repeatCount = result.filter(c => c.isRepeat).length;
        const repeatRate = totalCustomerCount > 0
            ? Math.round((repeatCount / totalCustomerCount) * 100)
            : 0;

        res.json({
            success: true,
            year,
            totalCustomers: totalCustomerCount,  // 해당 연도 주문한 총 고객수
            repeatCount,                          // 재주문 고객수 (2회+ 전체 기간)
            repeatRate,                           // 재주문율 (%)
            customers: topCustomers
        });
    } catch (error) {
        console.error('[Admin] Top customers stats error:', error);
        res.status(500).json({ success: false, error: '고객별 매출 랭킹 조회 실패' });
    }
});

// ============================================================
// PATCH /api/admin/orders/:id/payment - 입금 확인 (미수금 → 입금 완료 처리)
// 비유: 외상 장부에서 "입금 완료" 도장을 찍는 것
// ============================================================
router.patch('/orders/:id/payment', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = db.findById('orders', id);

        if (!existing) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        // 요청에서 입금 정보 추출
        const { paidDate, paidAmount, paymentNote } = req.body;

        if (!paidDate) {
            return res.status(400).json({ success: false, error: '입금일(paidDate)을 지정하세요.' });
        }

        // 기존 payment 객체에 입금 정보 병합
        const updatedPayment = {
            ...existing.payment,
            paidDate,                              // 입금 확인 날짜
            paidAmount: paidAmount || existing.payment?.totalAmount || 0,  // 입금액 (미지정 시 전체 금액)
            paymentNote: paymentNote || ''          // 입금 메모 (선택)
        };

        const updated = db.updateById('orders', id, {
            payment: updatedPayment,
            updatedAt: new Date().toISOString()
        });

        console.log(`[Admin] Payment confirmed: ${existing.orderNumber} / ${paidDate} / ${paidAmount || 'full'} by ${req.user.name}`);

        res.json({ success: true, order: updated });
    } catch (error) {
        console.error('[Admin] Payment update error:', error);
        res.status(500).json({ success: false, error: '입금 확인 처리 실패' });
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

// ============================================================
// GET /api/admin/backup - 수동 백업 실행
// 비유: 관리자가 "지금 당장 금고에 복사본 넣어!" 버튼을 누르는 것
// ============================================================
router.get('/backup', async (req, res) => {
    try {
        const result = await runBackup();

        if (result.success) {
            res.json({
                success: true,
                message: `${result.files.length}개 파일 백업 완료`,
                files: result.files,
                timestamp: result.timestamp
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || '백업 실행 중 오류 발생'
            });
        }
    } catch (error) {
        console.error('[Admin] Backup error:', error);
        res.status(500).json({ success: false, error: '백업 실행 실패' });
    }
});

export default router;
