/**
 * 관리자 전용 API 라우트
 * Google Sheets 수동 관리를 대체하는 핵심 API
 *
 * 모든 엔드포인트에 adminAuth 미들웨어가 적용되어
 * 관리자 JWT 토큰이 없으면 접근 불가
 */

import express from 'express';
import db from '../db.js';
import { STATUS_FLOW, STATUS_LABELS, getCustomerStatus, normalizeStatus } from './orders.js';
import { runBackup } from '../backup.js';  // 수동 백업 API용
import { logActivity, getActivityLogs } from '../activityLog.js';  // 관리자 활동 로그 (D-2)
// 카카오 알림톡 서비스 — 상태 변경 시 고객 자동 알림
import { sendNotification } from '../services/notification.js';
import { STATUS_TO_NOTIFICATION_TYPE } from '../services/notification-templates.js';
// 관리자 통계/분석 라우트 — 2026-04-22 admin.js에서 분리 (stats 도메인 6개 라우트)
// 비유: "통계 캐비닛"을 별도 미니 사무실로 옮긴 것. URL은 그대로 /api/admin/stats/*
import statsRouter from './admin/stats.js';

const router = express.Router();

// /stats/* 하위 경로는 전부 statsRouter로 위임 (URL 변경 0)
// ⚠️ server.js:124에서 이미 adminAuth가 router-level로 적용됨 → 여기에 중복 부착 금지 (C-5)
router.use('/stats', statsRouter);

// I-2: 종목 영문→한글 매핑을 파일 상단 1곳에서 정의 (기존 2곳 중복 제거)
// 프론트 js/admin-common.js L45~60과 키세트 완전 동기화 — 새 종목 추가 시 양쪽 모두 업데이트 필요
// 비유: 관제실 서버 사무실 벽보 — 이 파일 안의 모든 라우트가 참조하는 단일 소스
const SPORT_LABELS = {
    basketball: '농구',
    teamwear: '팀웨어',       // #7: 프론트(admin-common.js)와 동일 위치 — D-83 규칙 준수
    soccer: '축구',
    volleyball: '배구',
    baseball: '야구',
    badminton: '배드민턴',
    tabletennis: '탁구',
    handball: '핸드볼',
    futsal: '풋살',
    tennis: '테니스',
    softball: '소프트볼',   // 프론트(admin-common.js)와 동기화 (stiz.db 0건, 예비)
    hockey: '하키',
    other: '기타',           // stiz.db 실측 1,137건 — 영문 노출 버그 해결
    etc: '기타',
    unknown: '미분류'
};

// (헬퍼 이동: getRevenueDate 함수는 2026-04-22 stats.js로 이동됨 — stats 도메인 전용 헬퍼)

function getLastStatusChangeAt(order, historyByOrderId) {
    const history = historyByOrderId[order.id] || [];
    if (history.length > 0) {
        return history[0].createdAt;
    }
    return order.updatedAt || order.createdAt || null;
}

function normalizeOrderStatus(order) {
    // 기본값을 먼저 배치하고, 원본 데이터가 덮어쓰도록 순서 수정
    // 이렇게 해야 원본에 값이 있으면 기본값 대신 원본이 우선됨
    return {
        ...order,
        status: normalizeStatus(order.status),
        workInstruction: {
            // 기본값 (원본에 해당 키가 없을 때만 적용)
            status: '',
            sentAt: '',
            receivedAt: '',
            sentBy: '',
            url: '',
            note: '',
            // 원본 데이터가 기본값을 덮어씀
            ...order.workInstruction
        }
    };
}

// ============================================================
// GET /api/admin/orders - 전체 주문 목록 (필터/검색/정렬/페이지네이션)
// 비유: Google Sheets의 필터 기능을 API로 구현한 것
// ============================================================
router.get('/orders', (req, res) => {
    try {
        const requestedStatus = normalizeStatus(req.query.status || '');
        const requestedManager = req.query.manager || '';
        const requestedSport = req.query.sport || '';
        const requestedDealType = req.query.dealType || '';
        const requestedTag = req.query.tag || '';
        const search = (req.query.search || '').toLowerCase();
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = (req.query.sortOrder || 'desc').toLowerCase();
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const excludeCompleted = req.query.excludeCompleted !== 'false';
        const dateFrom = req.query.dateFrom || '';
        const dateTo = req.query.dateTo || '';
        const amountMin = req.query.amountMin ? parseFloat(req.query.amountMin) : null;
        const amountMax = req.query.amountMax ? parseFloat(req.query.amountMax) : null;
        // 파트별 뷰에서 전달하는 허용 상태 목록 (쉼표 구분)
        // 비유: "이 부서에서 볼 수 있는 게시물 종류"만 필터링
        const allowedStatusesParam = req.query.allowedStatuses || '';
        const allowedStatuses = allowedStatusesParam
            ? allowedStatusesParam.split(',').map(s => normalizeStatus(s.trim())).filter(Boolean)
            : null;
        // 완료 상태 제외 목록 — 단, 파트가 명시적으로 요청한 상태는 제외하지 않음
        // 비유: "끝난 주문"은 기본적으로 숨기지만, 출고 파트가 "배송완료"를 보겠다고 하면 보여줌
        const baseExcluded = ['delivered', 'cancelled'];
        const activeExcluded = allowedStatuses
            ? baseExcluded.filter(s => !allowedStatuses.includes(s))
            : baseExcluded;
        // statusTabs: STATUS_FLOW 기준으로 탭에 표시할 상태 목록
        // 보안/기능 수정: production_done(생산완료), revision(수정중) 누락 수정
        const statusTabs = ['consult_started', 'design_requested', 'draft_done', 'revision', 'design_confirmed', 'order_received', 'payment_completed', 'work_instruction_pending', 'work_instruction_sent', 'work_instruction_received', 'in_production', 'production_done', 'factory_released', 'warehouse_received', 'released', 'shipped', 'hold'];

        const allOrders = db.getAll('orders').map(normalizeOrderStatus);

        const matchesCommonFilters = (order) => {
            if (requestedManager && (order.manager || '') !== requestedManager) return false;
            if (requestedSport && (order.items?.[0]?.sport || '') !== requestedSport) return false;
            if (requestedDealType && (order.customer?.dealType || '') !== requestedDealType) return false;
            if (requestedTag && !(order.tags || []).includes(requestedTag)) return false;
            if (dateFrom) {
                const orderDate = order.orderReceiptDate || order.createdAt;
                if (!orderDate || new Date(orderDate) < new Date(dateFrom)) return false;
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setDate(to.getDate() + 1);
                const orderDate = order.orderReceiptDate || order.createdAt;
                if (!orderDate || new Date(orderDate) >= to) return false;
            }
            const amount = order.payment?.totalAmount || order.total || 0;
            if (amountMin !== null && amount < amountMin) return false;
            if (amountMax !== null && amount > amountMax) return false;
            if (search) {
                const haystack = [
                    order.orderNumber || '',
                    order.customer?.name || '',
                    order.customer?.teamName || '',
                    order.memo || ''
                ].join(' ').toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        };

        const allFiltered = allOrders.filter(matchesCommonFilters);
        const activeFiltered = allFiltered.filter(order => !activeExcluded.includes(order.status));

        // allowedStatuses가 있으면 해당 상태의 주문만 남김 (파트별 뷰 서버 필터링)
        const partFiltered = allowedStatuses
            ? activeFiltered.filter(order => allowedStatuses.includes(order.status))
            : activeFiltered;

        // statusCounts: allowedStatuses가 있으면 해당 상태만 카운트, 없으면 전체
        const statusCounts = {};
        const countBase = allowedStatuses ? partFiltered : activeFiltered;
        statusTabs.forEach(status => {
            statusCounts[status] = countBase.filter(order => order.status === status).length;
        });

        // 파트 뷰에서는 partFiltered 사용, 전체 뷰에서는 기존과 동일
        let filteredOrders = excludeCompleted
            ? (allowedStatuses ? partFiltered : activeFiltered)
            : [...allFiltered];
        if (requestedStatus) {
            filteredOrders = filteredOrders.filter(order => order.status === requestedStatus);
        }

        if (req.query.unpaid === 'true') {
            filteredOrders = allFiltered.filter(order => {
                const amount = order.payment?.totalAmount || 0;
                const paidDate = order.payment?.paidDate;
                return !paidDate && amount > 0 && order.status !== 'cancelled';
            });
        }

        filteredOrders.sort((a, b) => {
            if (sortBy === 'deadline') {
                const aDate = a.shipping?.desiredDate || null;
                const bDate = b.shipping?.desiredDate || null;
                if (!aDate && !bDate) return 0;
                if (!aDate) return 1;
                if (!bDate) return -1;
                return new Date(aDate) - new Date(bDate);
            }

            const aVal = a[sortBy] ?? '';
            const bVal = b[sortBy] ?? '';
            if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
            return aVal < bVal ? 1 : -1;
        });

        const total = filteredOrders.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const start = (page - 1) * limit;
        const paginatedOrders = filteredOrders.slice(start, start + limit);

        // 각 주문의 고객에 VIP 등급 배지를 표시하기 위해
        // customerId가 있으면 customers.json에서 실제 고객 데이터를 조회하여 grade 계산
        const allCustomers = db.getAll('customers');
        const customerMap = {};  // 캐시: 같은 고객 중복 조회 방지
        allCustomers.forEach(c => { customerMap[c.id] = c; });

        paginatedOrders.forEach(order => {
            if (order.customerId && customerMap[order.customerId]) {
                const cust = customerMap[order.customerId];
                const totalSpent = cust.totalSpent || 0;
                const orderCount = cust.orderCount || 0;
                // 등급 계산 (customers.js의 calculateGrade와 동일 기준)
                let grade = 'normal';
                if (totalSpent >= 5000000 || orderCount >= 5) grade = 'vip';
                else if (totalSpent >= 1000000 || orderCount >= 2) grade = 'regular';
                // customer 객체에 grade 추가
                if (order.customer) order.customer.grade = grade;
            }
        });

        res.json({
            success: true,
            orders: paginatedOrders,
            pagination: {
                total,
                page,
                totalPages,
                limit,
                totalAll: allFiltered.length,
                totalActive: partFiltered.length,  // 파트 뷰면 파트 기준, 전체 뷰면 전체 기준
                statusCounts
            }
        });
    } catch (error) {
        console.error('[Admin] Orders list error:', error);
        res.status(500).json({ success: false, error: '주문 목록 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/orders/stale - 일정 시간 이상 상태 변화가 없는 진행중 주문
// 비유: 오래 멈춰 있는 주문서를 따로 모아 "확인 필요" 바구니에 담는 것
// ============================================================
router.get('/orders/stale', (req, res) => {
    try {
        const hours = Math.max(1, parseInt(req.query.hours, 10) || 48);
        const limit = Math.max(1, parseInt(req.query.limit, 10) || 5);
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);

        const orders = db.getAll('orders').map(normalizeOrderStatus);
        const history = db.getAll('order-history')
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        const historyByOrderId = {};
        history.forEach(entry => {
            if (!historyByOrderId[entry.orderId]) {
                historyByOrderId[entry.orderId] = [];
            }
            historyByOrderId[entry.orderId].push(entry);
        });

        const staleOrders = orders
            .filter(order => !['delivered', 'cancelled', 'hold'].includes(order.status))
            .map(order => {
                const lastStatusChangeAt = getLastStatusChangeAt(order, historyByOrderId);
                const lastChangedTs = lastStatusChangeAt ? new Date(lastStatusChangeAt).getTime() : 0;
                const staleHours = lastChangedTs
                    ? Math.floor((Date.now() - lastChangedTs) / (1000 * 60 * 60))
                    : null;

                return {
                    ...order,
                    lastStatusChangeAt,
                    staleHours
                };
            })
            .filter(order => order.lastStatusChangeAt && new Date(order.lastStatusChangeAt).getTime() <= cutoff)
            .sort((a, b) => new Date(a.lastStatusChangeAt || 0) - new Date(b.lastStatusChangeAt || 0))
            .slice(0, limit)
            .map(order => ({
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                statusLabel: STATUS_LABELS[order.status] || order.status,
                manager: order.manager || '미배정',
                teamName: order.customer?.teamName || '',
                customerName: order.customer?.name || '',
                desiredDate: order.shipping?.desiredDate || '',
                lastStatusChangeAt: order.lastStatusChangeAt,
                staleHours: order.staleHours
            }));

        res.json({
            success: true,
            hours,
            orders: staleOrders
        });
    } catch (error) {
        console.error('[Admin] Stale orders error:', error);
        res.status(500).json({ success: false, error: '확인 필요 주문 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/orders/:id - 주문 상세 조회
// ============================================================
router.get('/orders/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const rawOrder = db.findById('orders', id);
        const order = rawOrder ? normalizeOrderStatus(rawOrder) : null;

        if (!order) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        // 상태 변경 이력도 함께 반환
        const allHistory = db.getAll('order-history');
        const history = allHistory
            .filter(h => h.orderId === id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(entry => ({
                ...entry,
                fromStatus: normalizeStatus(entry.fromStatus),
                toStatus: normalizeStatus(entry.toStatus)
            }));

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

        res.json({ success: true, order: normalizeOrderStatus(updated) });
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
        const { status, memo, orderReceiptDate, payment, workInstruction } = req.body;
        const normalizedStatus = normalizeStatus(status);

        if (!normalizedStatus) {
            return res.status(400).json({ success: false, error: '변경할 상태를 지정하세요.' });
        }

        // 유효한 상태값인지 확인
        if (!STATUS_FLOW.includes(normalizedStatus)) {
            return res.status(400).json({
                success: false,
                error: `유효하지 않은 상태입니다. 가능한 값: ${STATUS_FLOW.join(', ')}`
            });
        }

        const existing = db.findById('orders', id);
        if (!existing) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        const fromStatus = normalizeStatus(existing.status);

        // 주문 상태 업데이트
        const patch = {
            status: normalizedStatus,
            updatedAt: new Date().toISOString()
        };

        if (orderReceiptDate) {
            patch.orderReceiptDate = orderReceiptDate;
        }
        if (payment) {
            patch.payment = {
                ...(existing.payment || {}),
                ...payment
            };
        }
        if (workInstruction) {
            patch.workInstruction = {
                ...(existing.workInstruction || {}),
                ...workInstruction
            };
        }

        const updated = db.updateById('orders', id, patch);

        // 상태 변경 이력 자동 기록 (order-history.json에 추가)
        db.insert('order-history', {
            orderId: id,
            orderNumber: existing.orderNumber,
            fromStatus,
            toStatus: normalizedStatus,
            changedBy: `admin_${req.user.name}`,   // 누가 바꿨는지
            memo: memo || '',                       // 변경 사유
            createdAt: new Date().toISOString()
        });

        console.log(`[Admin] Status changed: ${existing.orderNumber} ${fromStatus} → ${normalizedStatus} by ${req.user.name}`);

        // [D-2] 활동 로그 기록 — 비동기로 API 응답에 영향 없음
        logActivity('order_status_change', {
            orderNumber: existing.orderNumber,
            orderId: id,
            fromStatus: STATUS_LABELS[fromStatus] || fromStatus,
            toStatus: STATUS_LABELS[normalizedStatus] || normalizedStatus,
            memo: memo || ''
        }, req.user);

        // 카카오 알림톡: 상태 변경 시 고객 자동 알림 (비동기, 실패해도 응답 정상)
        // 전용 템플릿이 있는 상태(결제완료/생산중/배송중/배송완료)는 해당 템플릿 사용
        // 그 외 상태는 범용 status_changed 템플릿 사용
        const notificationType = STATUS_TO_NOTIFICATION_TYPE[normalizedStatus] || 'status_changed';
        sendNotification(notificationType, { ...existing, ...patch }, {
            fromStatus,
            toStatus: normalizedStatus,
            statusLabel: STATUS_LABELS[normalizedStatus] || normalizedStatus
        });

        res.json({
            success: true,
            order: normalizeOrderStatus(updated),
            statusChange: {
                from: { status: fromStatus, label: STATUS_LABELS[fromStatus] },
                to: { status: normalizedStatus, label: STATUS_LABELS[normalizedStatus] }
            }
        });
    } catch (error) {
        console.error('[Admin] Status change error:', error);
        res.status(500).json({ success: false, error: '상태 변경 실패' });
    }
});

// ============================================================
// POST /api/admin/orders/:id/duplicate - 주문 복제 (재주문)
// 비유: 지난번 주문서를 복사기에 넣고, 날짜와 번호만 새로 찍는 것
// 고객/아이템 정보는 그대로 가져오되, 상태/결제/디자인/생산/배송은 초기화
// ============================================================
router.post('/orders/:id/duplicate', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const original = db.findById('orders', id);

        if (!original) {
            return res.status(404).json({ success: false, error: '원본 주문을 찾을 수 없습니다.' });
        }

        // 새 주문번호 생성: ORD-오늘날짜-NNN (당일 마지막 번호 + 1)
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');  // 예: 20260331
        const allOrders = db.getAll('orders');
        const todayPrefix = `ORD-${dateStr}-`;

        // 오늘 생성된 주문 중 가장 큰 번호 찾기
        const todayNumbers = allOrders
            .filter(o => o.orderNumber && o.orderNumber.startsWith(todayPrefix))
            .map(o => parseInt(o.orderNumber.replace(todayPrefix, '')) || 0);
        const nextNum = todayNumbers.length > 0 ? Math.max(...todayNumbers) + 1 : 1;
        const newOrderNumber = `${todayPrefix}${String(nextNum).padStart(3, '0')}`;

        // 새 주문 데이터 구성 — 원본에서 고객/아이템만 복사, 나머지는 초기화
        const newOrder = {
            id: Date.now(),                           // 고유 ID (타임스탬프)
            orderNumber: newOrderNumber,               // 새 주문번호
            groupId: original.groupId || null,         // 그룹 ID 유지
            customer: JSON.parse(JSON.stringify(original.customer)),  // 고객 정보 깊은 복사
            items: JSON.parse(JSON.stringify(original.items)),        // 아이템 깊은 복사
            design: {                                  // 디자인: 초기 상태로 리셋
                status: 'draft_done',
                revisionCount: 0,
                designer: original.design?.designer || '',
                orderSheetUrl: '',
                designFileUrl: ''
            },
            production: {                              // 생산: 초기 상태로 리셋
                status: '',
                factory: original.production?.factory || '',
                gradingDone: false
            },
            workInstruction: {
                status: '',
                sentAt: '',
                receivedAt: '',
                sentBy: '',
                url: '',
                note: ''
            },
            shipping: {                                // 배송: 주소만 복사, 나머지 초기화
                address: original.shipping?.address || '',
                desiredDate: '',
                releaseDate: '',
                shippedDate: '',
                trackingNumber: '',
                carrier: ''
            },
            payment: {                                 // 결제: 단가/수량만 복사, 입금 정보 초기화
                totalAmount: original.payment?.totalAmount || 0,
                unitPrice: original.payment?.unitPrice || 0,
                quantity: original.payment?.quantity || 0,
                packQuantity: original.payment?.packQuantity || 0,
                qpp: original.payment?.qpp || 1,
                paidDate: null,                        // 미결제 상태
                paymentType: original.payment?.paymentType || '',
                transactionMethod: original.payment?.transactionMethod || '',
                quoteUrl: '',
                autoQuote: false
            },
            manager: original.manager || '',           // 담당자 유지
            store: original.store || '',               // 거래점 유지
            status: 'consult_started',                 // 처음부터 시작
            memo: `[복제] 원본: ${original.orderNumber}`,  // 원본 추적용 메모
            detail: '',
            revenueType: original.revenueType || '',   // 매출구분 유지
            createdAt: today.toISOString(),             // 현재 시간
            updatedAt: today.toISOString(),
            designRequestDate: today.toISOString(),    // 시안요청일 = 생성일
            orderReceiptDate: null,                    // 접수일은 비워둠
            customerId: original.customerId || null,   // 고객 ID 유지
            _duplicatedFrom: original.id               // 원본 주문 참조 (내부 추적용)
        };

        // DB에 새 주문 저장
        const saved = db.insert('orders', newOrder);

        // 상태 변경 이력: 복제로 생성됨을 기록
        db.insert('order-history', {
            id: Date.now() + 1,
            orderId: saved.id,
            fromStatus: null,
            toStatus: 'consult_started',
            changedBy: req.user.name || '관리자',
            memo: `주문 복제 (원본: ${original.orderNumber})`,
            createdAt: today.toISOString()
        });

        console.log(`[Admin] Order duplicated: ${original.orderNumber} → ${newOrderNumber} by ${req.user.name}`);

        // [D-2] 활동 로그 기록
        logActivity('order_duplicate', {
            originalOrderNumber: original.orderNumber,
            newOrderNumber,
            customerName: original.customer?.name || '미상'
        }, req.user);

        res.json({
            success: true,
            order: normalizeOrderStatus(saved),
            message: `주문이 복제되었습니다. 새 주문번호: ${newOrderNumber}`
        });
    } catch (error) {
        console.error('[Admin] Order duplicate error:', error);
        res.status(500).json({ success: false, error: '주문 복제 실패' });
    }
});

// ============================================================
// PATCH /api/admin/orders/bulk-status - 주문 일괄 상태 변경
// 비유: 체크리스트에서 여러 항목을 한번에 체크하고 상태를 일괄 변경하는 것
// ============================================================
router.patch('/orders/bulk-status', (req, res) => {
    try {
        const { orderIds, status } = req.body;
        const normalizedStatus = normalizeStatus(status);

        // 필수 파라미터 검증
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ success: false, error: '변경할 주문 ID 목록을 지정하세요.' });
        }
        if (!normalizedStatus) {
            return res.status(400).json({ success: false, error: '변경할 상태를 지정하세요.' });
        }

        // 유효한 상태값인지 확인
        if (!STATUS_FLOW.includes(normalizedStatus)) {
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

            const fromStatus = normalizeStatus(existing.status);

            // 이미 같은 상태면 건너뛰기 (불필요한 이력 방지)
            if (fromStatus === normalizedStatus) {
                results.push({ id, success: true, skipped: true, orderNumber: existing.orderNumber });
                updated++;
                return;
            }

            // 상태 업데이트
            db.updateById('orders', id, {
                status: normalizedStatus,
                updatedAt: new Date().toISOString()
            });

            // 상태 변경 이력 기록
            db.insert('order-history', {
                orderId: id,
                orderNumber: existing.orderNumber,
                fromStatus,
                toStatus: normalizedStatus,
                changedBy: `admin_${req.user.name}`,
                memo: `일괄 변경 (${orderIds.length}건 중)`,
                createdAt: new Date().toISOString()
            });

            results.push({ id, success: true, orderNumber: existing.orderNumber, fromStatus, toStatus: normalizedStatus });
            updated++;
        });

        console.log(`[Admin] Bulk status change: ${updated} updated, ${failed} failed → ${normalizedStatus} by ${req.user.name}`);

        // [D-2] 활동 로그 기록
        logActivity('order_bulk_status', {
            toStatus: STATUS_LABELS[normalizedStatus] || normalizedStatus,
            totalCount: orderIds.length,
            updatedCount: updated,
            failedCount: failed
        }, req.user);

        res.json({
            success: true,
            updated,
            failed,
            results,
            statusLabel: STATUS_LABELS[normalizedStatus]
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
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(entry => ({
                ...entry,
                fromStatus: normalizeStatus(entry.fromStatus),
                toStatus: normalizeStatus(entry.toStatus)
            }));

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

        // [D-2] 활동 로그 기록
        logActivity('payment_confirm', {
            orderNumber: existing.orderNumber,
            orderId: id,
            paidDate,
            paidAmount: paidAmount || existing.payment?.totalAmount || 0,
            customerName: existing.customer?.name || '미상'
        }, req.user);

        res.json({ success: true, order: updated });
    } catch (error) {
        console.error('[Admin] Payment update error:', error);
        res.status(500).json({ success: false, error: '입금 확인 처리 실패' });
    }
});

// ============================================================
// DELETE /api/admin/orders/:id/payment - 입금 취소 (잘못 찍은 도장 되돌리기)
// 비유: 외상 장부에 잘못 찍은 "입금 완료" 도장을 지우는 것
// - payment.paidDate / paidAmount / paymentNote 3개 필드만 리셋
// - 주문 금액/결제수단/tossOrderId 등 추적 정보는 보존 (재입금 가능)
// - status가 payment_completed면 order_received로 자동 하향 (targetStatus로 오버라이드 가능)
// - 감사 로그(activity_log) + 상태 이력(order-history) 자동 기록
// ============================================================
// 결제 취소 시 이동 허용되는 status 화이트리스트
// 결제 이후 단계(in_production 등)로는 이동 금지 — 업무 프로세스상 이상 상황이라 수동 처리 필요
const PAYMENT_CANCEL_TARGET_WHITELIST = [
    'consult_started',
    'design_requested',
    'draft_done',
    'revision',
    'design_confirmed',
    'order_received'
];

router.delete('/orders/:id/payment', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = db.findById('orders', id);

        // 1. 주문 존재 확인
        if (!existing) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        // 2. body 파라미터: targetStatus(선택) + reason(선택, 500자 truncate)
        const { targetStatus, reason } = req.body || {};
        // reason은 선택 입력이지만 문자열 보장 + 500자로 잘라 저장 (관리자 편의 우선)
        const safeReason = typeof reason === 'string' ? reason.slice(0, 500) : '';

        // 3. prev 값 캡처 — 로그 기록용 (리셋 전에 반드시 보관)
        const prevPayment = {
            paidDate: existing.payment?.paidDate || '',
            paidAmount: existing.payment?.paidAmount || 0,
            paymentNote: existing.payment?.paymentNote || ''
        };
        const prevStatus = normalizeStatus(existing.status);

        // 4. payment 객체 리셋 — 3개 필드만 초기화, 나머지(totalAmount/paymentKey 등)는 보존
        // 비유: 도장 찍은 날짜/금액/메모만 지우개로 지우고, 장부 자체는 그대로
        const updatedPayment = {
            ...(existing.payment || {}),
            paidDate: '',
            paidAmount: 0,
            paymentNote: ''
        };

        // 5. status 원복 로직
        // - targetStatus 명시 시: 화이트리스트 검증 후 적용
        // - 미지정 & prev.status === 'payment_completed': order_received로 자동 하향
        // - 그 외: status 불변 (배송중/생산중 등에서 paidDate만 리셋)
        let newStatus = prevStatus;
        let statusPreserved = false;

        if (targetStatus) {
            // 관리자가 명시적으로 목적지를 지정한 경우
            const normalizedTarget = normalizeStatus(targetStatus);
            if (!PAYMENT_CANCEL_TARGET_WHITELIST.includes(normalizedTarget)) {
                return res.status(400).json({
                    success: false,
                    error: `결제 취소 시 이동 가능한 상태가 아닙니다. 허용: ${PAYMENT_CANCEL_TARGET_WHITELIST.join(', ')}`
                });
            }
            newStatus = normalizedTarget;
        } else if (prevStatus === 'payment_completed') {
            // 기본 자동 하향
            newStatus = 'order_received';
        } else {
            // status 불변 — 결제 이후 단계에서 입금만 취소하는 경우
            statusPreserved = true;
        }

        // 6. DB 업데이트 — status 변경 여부에 관계없이 payment는 항상 리셋
        const patch = {
            payment: updatedPayment,
            updatedAt: new Date().toISOString()
        };
        if (newStatus !== prevStatus) {
            patch.status = newStatus;
        }
        const updated = db.updateById('orders', id, patch);

        // 7. status가 실제로 바뀐 경우만 order-history에 기록
        // changedBy에 '(payment_cancel)' 꼬리표를 붙여 이력 타임라인에서 원인 구분 가능
        if (newStatus !== prevStatus) {
            db.insert('order-history', {
                orderId: id,
                orderNumber: existing.orderNumber,
                fromStatus: prevStatus,
                toStatus: newStatus,
                changedBy: `admin_${req.user.name} (payment_cancel)`,
                memo: safeReason || '입금 취소로 인한 상태 하향',
                createdAt: new Date().toISOString()
            });
        }

        console.log(`[Admin] Payment cancelled: ${existing.orderNumber} / prev ${prevPayment.paidDate}(${prevPayment.paidAmount}) / status ${prevStatus} → ${newStatus} by ${req.user.name}`);

        // 8. 감사 로그 — prev 값 전부 + reason + newStatus 기록
        logActivity('payment_cancel', {
            orderNumber: existing.orderNumber,
            orderId: id,
            prevPaidDate: prevPayment.paidDate,
            prevPaidAmount: prevPayment.paidAmount,
            prevPaymentNote: prevPayment.paymentNote,
            prevStatus,
            newStatus,
            reason: safeReason,
            customerName: existing.customer?.name || '미상'
        }, req.user);

        // 9. 응답 — prevPayment를 함께 반환하여 프론트에서 "되돌리기" UI도 가능
        res.json({
            success: true,
            order: normalizeOrderStatus(updated),
            prevPayment,
            statusPreserved
        });
    } catch (error) {
        console.error('[Admin] Payment cancel error:', error);
        res.status(500).json({ success: false, error: '입금 취소 처리 실패' });
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
// GET /api/admin/orders/:id/comments - 코멘트 목록 조회 (최신순)
// 비유: 주문 폴더에 붙어있는 포스트잇들을 최신 것부터 읽는 것
// ============================================================
router.get('/orders/:id/comments', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const order = db.findById('orders', id);

        if (!order) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        // comments 배열이 없으면 빈 배열 반환
        const comments = (order.comments || [])
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, comments });
    } catch (error) {
        console.error('[Admin] Comments list error:', error);
        res.status(500).json({ success: false, error: '코멘트 조회 실패' });
    }
});

// ============================================================
// POST /api/admin/orders/:id/comments - 코멘트 추가
// 비유: 주문 폴더에 새 포스트잇을 붙이는 것 (기존 것은 그대로 유지)
// ============================================================
router.post('/orders/:id/comments', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const order = db.findById('orders', id);

        if (!order) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        const { text, author } = req.body;

        // 코멘트 내용 필수 검증
        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, error: '코멘트 내용을 입력하세요.' });
        }

        // 새 코멘트 객체 생성 (고유 ID = 현재 타임스탬프)
        const newComment = {
            id: Date.now(),
            text: text.trim(),
            author: author || req.user?.name || '관리자',  // 담당자명 (JWT에서 자동)
            createdAt: new Date().toISOString()
        };

        // 기존 comments 배열에 추가 (없으면 새로 생성)
        if (!order.comments) order.comments = [];
        order.comments.push(newComment);

        // DB에 저장
        db.updateById('orders', id, { comments: order.comments });

        console.log(`[Admin] Comment added to ${order.orderNumber} by ${newComment.author}`);

        // [D-2] 활동 로그 기록
        logActivity('comment_add', {
            orderNumber: order.orderNumber,
            orderId: id,
            commentText: text.trim().substring(0, 50)  // 미리보기용 50자 제한
        }, req.user);

        res.json({ success: true, comment: newComment });
    } catch (error) {
        console.error('[Admin] Comment add error:', error);
        res.status(500).json({ success: false, error: '코멘트 추가 실패' });
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
            // [D-2] 활동 로그 기록
            logActivity('backup_manual', {
                fileCount: result.files.length,
                timestamp: result.timestamp
            }, req.user);

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

// ============================================================
// PATCH /api/admin/orders/:id/tags - 주문 태그 업데이트
// 비유: 주문서에 색깔 스티커(태그)를 붙이거나 떼는 기능
// ============================================================
router.patch('/orders/:id/tags', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { tags } = req.body;

        // tags가 배열인지 검증
        if (!Array.isArray(tags)) {
            return res.status(400).json({ success: false, error: 'tags는 배열이어야 합니다.' });
        }

        const existing = db.findById('orders', id);
        if (!existing) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        // 태그 배열 저장 (중복 제거 + 빈 문자열 제거)
        const cleanTags = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
        const updated = db.updateById('orders', id, {
            tags: cleanTags,
            updatedAt: new Date().toISOString()
        });

        console.log(`[Admin] Order tags updated: ${existing.orderNumber} → [${cleanTags.join(', ')}] by ${req.user.name}`);

        res.json({ success: true, order: updated });
    } catch (error) {
        console.error('[Admin] Order tags update error:', error);
        res.status(500).json({ success: false, error: '태그 업데이트 실패' });
    }
});

// ============================================================
// GET /api/admin/activity-log - 최근 활동 로그 조회 (D-2)
// 비유: CCTV 녹화 영상을 최신순으로 되감아 보는 것
// 쿼리 파라미터:
//   - limit: 가져올 건수 (기본 50, 최대 200)
//   - action: 특정 액션만 필터 (예: order_status_change)
// ============================================================
router.get('/activity-log', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const action = req.query.action || null;

        const logs = getActivityLogs(limit, action);

        res.json({
            success: true,
            logs,
            total: logs.length
        });
    } catch (error) {
        console.error('[Admin] Activity log error:', error);
        res.status(500).json({ success: false, error: '활동 로그 조회 실패' });
    }
});

// ============================================================
// [C-3] 매출 목표 달성률 API
// 비유: "올해 목표 매출액"을 설정/조회하는 엔드포인트
// 데이터는 sales-goals.json에 연도별로 저장된다
// ============================================================

// GET /api/admin/sales-goals/:year — 해당 연도 매출 목표 조회
// 비유: "올해 목표가 뭐였지?" 확인
router.get('/sales-goals/:year', (req, res) => {
    try {
        const year = req.params.year;
        const goals = db.getAll('sales-goals');
        // 연도(id)가 일치하는 목표를 찾는다
        const goal = goals.find(g => g.id === year) || null;

        res.json({ success: true, goal });
    } catch (error) {
        console.error('[Admin] Sales goal GET error:', error);
        res.status(500).json({ success: false, error: '매출 목표 조회 실패' });
    }
});

// PUT /api/admin/sales-goals/:year — 해당 연도 매출 목표 저장/수정
// 비유: "올해 목표를 15억으로 설정" 저장
router.put('/sales-goals/:year', (req, res) => {
    try {
        const year = req.params.year;
        const { annualGoal, monthlyGoals } = req.body;

        // 연간 목표 금액은 필수
        if (annualGoal === undefined || annualGoal === null) {
            return res.status(400).json({ success: false, error: '연간 목표 금액은 필수입니다' });
        }

        const goals = db.getAll('sales-goals');
        const existingIndex = goals.findIndex(g => g.id === year);

        const goalData = {
            id: year,
            year: year,
            annualGoal: Number(annualGoal),
            // 월별 목표가 있으면 저장, 없으면 빈 객체
            monthlyGoals: monthlyGoals || {},
            updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            // 기존 목표 수정
            goals[existingIndex] = goalData;
        } else {
            // 새 목표 추가
            goals.push(goalData);
        }

        db.saveAll('sales-goals', goals);

        res.json({ success: true, goal: goalData });
    } catch (error) {
        console.error('[Admin] Sales goal PUT error:', error);
        res.status(500).json({ success: false, error: '매출 목표 저장 실패' });
    }
});

// ============================================================
// GET /api/admin/reorder-candidates - 재주문 시기 도래 고객 목록 (B-3)
// 비유: "작년 이맘때 주문한 고객 중 올해 아직 안 온 사람" 명단을 자동으로 뽑아주는 것
// 미용실에서 "3개월 전에 오신 고객님, 슬슬 방문할 때 되셨어요" 알림과 같은 원리
// ============================================================
router.get('/reorder-candidates', (req, res) => {
    try {
        // --- 쿼리 파라미터 파싱 ---
        const range = parseInt(req.query.range) || 1;              // +-N개월 범위 (기본 1)
        const excludeOrdered = req.query.excludeOrdered !== 'false'; // 올해 이미 주문한 고객 제외 (기본 true)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        // --- 현재 날짜 기준으로 "작년 이맘때" 범위 계산 ---
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 1~12
        const currentYear = now.getFullYear();
        const lastYear = currentYear - 1;

        // 시작월/종료월 계산 (경계 처리: 1월이면 작년12월, 12월이면 다음해1월)
        // 비유: 달력에서 현재 월의 앞뒤 N칸을 칠하는 것
        let startMonth = currentMonth - range;
        let endMonth = currentMonth + range;
        let startYear = lastYear;
        let endYear = lastYear;

        // 월이 0 이하면 전년도로 넘김 (예: 1월-1 = 0 → 12월)
        if (startMonth <= 0) {
            startMonth += 12;
            startYear = lastYear - 1;
        }
        // 월이 12 초과면 다음해로 넘김 (예: 12월+1 = 13 → 1월)
        if (endMonth > 12) {
            endMonth -= 12;
            endYear = lastYear + 1;
        }

        // 범위의 시작일과 종료일을 문자열로 생성
        const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
        // 종료월의 마지막 날 계산 (다음달 1일에서 하루 빼기)
        const endMonthLastDay = new Date(endYear, endMonth, 0).getDate();
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endMonthLastDay).padStart(2, '0')}`;

        // 기간 라벨 생성 (프론트에 표시용)
        const periodLabel = `${startYear}년 ${startMonth}월~${endYear === startYear ? '' : endYear + '년 '}${endMonth}월`;

        // --- 주문 데이터에서 해당 기간의 주문 필터링 ---
        const allOrders = db.getAll('orders');
        const allCustomers = db.getAll('customers');

        // 고객 ID → 고객 정보 빠른 조회용 맵
        const customerMap = {};
        allCustomers.forEach(c => { customerMap[c.id] = c; });

        // 1단계: 작년 해당 기간 주문을 customerId별로 그룹핑
        // 비유: "작년 봄 주문 장부"에서 고객별로 묶는 것
        const lastYearOrdersByCustomer = {};
        allOrders.forEach(order => {
            if (!order.customerId) return;
            // 주문 기준일: 주문서접수일(orderReceiptDate) 우선, 없으면 생성일(createdAt)
            const orderDate = order.orderReceiptDate || order.createdAt;
            if (!orderDate) return;

            const dateOnly = orderDate.slice(0, 10); // "YYYY-MM-DD"
            // 해당 기간 내 주문인지 확인
            if (dateOnly >= startDate && dateOnly <= endDate) {
                if (!lastYearOrdersByCustomer[order.customerId]) {
                    lastYearOrdersByCustomer[order.customerId] = [];
                }
                lastYearOrdersByCustomer[order.customerId].push(order);
            }
        });

        // 2단계: 올해 주문한 고객 ID 집합 만들기 (제외 필터용)
        // 비유: "올해 이미 온 고객" 명부
        const thisYearStart = `${currentYear}-01-01`;
        const orderedThisYearSet = new Set();
        allOrders.forEach(order => {
            if (!order.customerId) return;
            const orderDate = order.orderReceiptDate || order.createdAt;
            if (!orderDate) return;
            const dateOnly = orderDate.slice(0, 10);
            if (dateOnly >= thisYearStart) {
                orderedThisYearSet.add(order.customerId);
            }
        });

        // 3단계: 후보 목록 생성 — 작년 해당 기간 주문 고객 중 조건에 맞는 고객 추출
        let candidates = [];
        let excludedCount = 0; // 올해 이미 주문하여 제외된 고객 수

        Object.entries(lastYearOrdersByCustomer).forEach(([customerId, orders]) => {
            const cid = isNaN(customerId) ? customerId : Number(customerId);
            const orderedThisYear = orderedThisYearSet.has(cid) || orderedThisYearSet.has(String(cid));

            // 올해 이미 주문한 고객 제외 옵션 처리
            if (orderedThisYear) {
                excludedCount++;
                if (excludeOrdered) return; // 제외 옵션이 켜져 있으면 건너뛰기
            }

            // 해당 고객의 작년 주문 중 가장 최근 + 가장 큰 금액 주문 찾기
            // 정렬: 날짜 내림차순
            orders.sort((a, b) => {
                const da = (a.orderReceiptDate || a.createdAt || '');
                const db2 = (b.orderReceiptDate || b.createdAt || '');
                return db2.localeCompare(da);
            });
            const latestOrder = orders[0];
            // 해당 기간 총 주문 금액 합산
            // 주문 금액은 payment 객체 안에 있음 (o.payment.totalAmount)
            const periodAmount = orders.reduce((sum, o) => sum + (o.payment?.totalAmount || 0), 0);

            // 고객 정보 보강 (customers.json에서 가져오기)
            const customer = customerMap[cid] || customerMap[String(cid)] || {};

            // 아이템 요약 텍스트 생성 (예: "축구 유니폼 외 2건")
            let lastOrderItems = '주문 내역 없음';
            if (latestOrder.items && latestOrder.items.length > 0) {
                const firstName = latestOrder.items[0].name || latestOrder.items[0].sport || '아이템';
                lastOrderItems = latestOrder.items.length === 1
                    ? firstName
                    : `${firstName} 외 ${latestOrder.items.length - 1}건`;
            }

            candidates.push({
                customerId: cid,
                name: customer.name || latestOrder.customer?.name || '미상',
                teamName: customer.teamName || latestOrder.customer?.teamName || '',
                phone: customer.phone || latestOrder.customer?.phone || '',
                lastOrderDate: (latestOrder.orderReceiptDate || latestOrder.createdAt || '').slice(0, 10),
                lastOrderItems: lastOrderItems,
                lastOrderAmount: periodAmount,
                totalOrders: customer.orderCount || orders.length,
                totalSpent: customer.totalSpent || periodAmount,
                orderedThisYear: orderedThisYear
            });
        });

        // 4단계: 금액 내림차순 정렬 (돈을 많이 쓴 고객부터 — 영업 효과 극대화)
        candidates.sort((a, b) => b.lastOrderAmount - a.lastOrderAmount);

        const totalCandidates = candidates.length;

        // 5단계: 페이지네이션 적용
        const totalPages = Math.ceil(totalCandidates / limit);
        const startIdx = (page - 1) * limit;
        const paginatedCandidates = candidates.slice(startIdx, startIdx + limit);

        res.json({
            success: true,
            candidates: paginatedCandidates,
            summary: {
                totalCandidates,
                excludedAlreadyOrdered: excludedCount,
                periodLabel,
                startDate,
                endDate
            },
            pagination: {
                page,
                limit,
                totalPages,
                total: totalCandidates
            }
        });
    } catch (error) {
        console.error('[Admin] Reorder candidates error:', error);
        res.status(500).json({ success: false, error: '재주문 후보 조회 실패' });
    }
});

// ============================================================
// [D-5] 주문 템플릿 — CRUD + 주문↔템플릿 변환
// 비유: 워드의 "문서 템플릿" 기능
//  - 자주 쓰는 주문 설정을 저장해두고
//  - 새 주문 생성 시 불러와 자동 채우기
// ============================================================

// --- GET /api/admin/templates --- 템플릿 목록 (검색/카테고리 필터)
router.get('/templates', (req, res) => {
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
router.get('/templates/:id', (req, res) => {
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
router.post('/templates', (req, res) => {
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
router.put('/templates/:id', (req, res) => {
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
router.delete('/templates/:id', (req, res) => {
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

// --- POST /api/admin/orders/:id/save-as-template --- 기존 주문에서 템플릿 추출 저장
// 비유: 완성된 문서에서 "양식만 추출"해서 템플릿으로 저장
// 고객 정보, 주문번호, 상태, 날짜, 결제완료 정보는 제거
router.post('/orders/:id/save-as-template', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const order = db.findById('orders', id);

        if (!order) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        const { name, description, category } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: '템플릿 이름은 필수입니다.' });
        }

        // 템플릿에 포함할 설정만 추출 (고객/주문번호/상태/날짜/결제완료 정보 제거)
        const templateData = {
            items: JSON.parse(JSON.stringify(order.items || [])),       // 종목, 품목, 공법 등
            design: {
                designer: order.design?.designer || '',                // 디자이너만 유지
            },
            production: {
                factory: order.production?.factory || '',              // 공장만 유지
            },
            payment: {
                unitPrice: order.payment?.unitPrice || 0,
                qpp: order.payment?.qpp || 1,
                paymentType: order.payment?.paymentType || '',
                transactionMethod: order.payment?.transactionMethod || '',
            },
            manager: order.manager || '',
            store: order.store || '',
            revenueType: order.revenueType || '',
        };

        const now = new Date().toISOString();
        const template = {
            id: Date.now(),
            name: name.trim(),
            description: (description || '').trim(),
            category: (category || '').trim(),
            templateData,
            usageCount: 0,
            createdBy: req.user?.name || '관리자',
            createdAt: now,
            updatedAt: now,
        };

        const saved = db.insert('order_templates', template);

        logActivity('template_from_order', {
            templateName: saved.name,
            templateId: saved.id,
            sourceOrderNumber: order.orderNumber
        }, req.user);

        console.log(`[Admin] Template from order: "${saved.name}" from ${order.orderNumber} by ${req.user?.name}`);
        res.json({ success: true, template: saved, message: `템플릿 "${saved.name}"이 생성되었습니다.` });
    } catch (error) {
        console.error('[Admin] Save as template error:', error);
        res.status(500).json({ success: false, error: '템플릿 저장 실패' });
    }
});

// --- POST /api/admin/orders/from-template/:templateId --- 템플릿으로 새 주문 생성
// 비유: 템플릿 양식을 불러와서 새 문서를 시작하는 것
// 주문번호 생성은 기존 duplicate 로직 재사용
router.post('/orders/from-template/:templateId', (req, res) => {
    try {
        const templateId = parseInt(req.params.templateId);
        const template = db.findById('order_templates', templateId);

        if (!template) {
            return res.status(404).json({ success: false, error: '템플릿을 찾을 수 없습니다.' });
        }

        // templateData가 문자열이면 파싱 (안전장치)
        const tData = typeof template.templateData === 'string'
            ? JSON.parse(template.templateData)
            : template.templateData;

        // --- 주문번호 생성 (duplicate 로직 재사용) ---
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const allOrders = db.getAll('orders');
        const todayPrefix = `ORD-${dateStr}-`;

        const todayNumbers = allOrders
            .filter(o => o.orderNumber && o.orderNumber.startsWith(todayPrefix))
            .map(o => parseInt(o.orderNumber.replace(todayPrefix, '')) || 0);
        const nextNum = todayNumbers.length > 0 ? Math.max(...todayNumbers) + 1 : 1;
        const newOrderNumber = `${todayPrefix}${String(nextNum).padStart(3, '0')}`;

        // 새 주문 데이터: 템플릿 설정 + 빈 고객/결제 정보
        const newOrder = {
            id: Date.now(),
            orderNumber: newOrderNumber,
            groupId: null,
            customer: { name: '', phone: '', teamName: '', dealType: '' },  // 빈 고객 정보
            items: JSON.parse(JSON.stringify(tData.items || [])),
            design: {
                status: 'design_requested',
                revisionCount: 0,
                designer: tData.design?.designer || '',
                orderSheetUrl: '',
                designFileUrl: ''
            },
            production: {
                status: '',
                factory: tData.production?.factory || '',
                gradingDone: false
            },
            shipping: {
                address: '',
                desiredDate: '',
                releaseDate: '',
                shippedDate: '',
                trackingNumber: '',
                carrier: ''
            },
            payment: {
                totalAmount: 0,
                unitPrice: tData.payment?.unitPrice || 0,
                quantity: 0,
                packQuantity: 0,
                qpp: tData.payment?.qpp || 1,
                paidDate: null,
                paymentType: tData.payment?.paymentType || '',
                transactionMethod: tData.payment?.transactionMethod || '',
                quoteUrl: '',
                autoQuote: false
            },
            manager: tData.manager || '',
            store: tData.store || '',
            status: 'design_requested',
            memo: `[템플릿] ${template.name}`,
            detail: '',
            revenueType: tData.revenueType || '',
            createdAt: today.toISOString(),
            updatedAt: today.toISOString(),
            designRequestDate: today.toISOString(),
            orderReceiptDate: null,
            customerId: null,
            _fromTemplateId: template.id,       // 원본 템플릿 추적용
        };

        const saved = db.insert('orders', newOrder);

        // 상태 변경 이력 기록
        db.insert('order-history', {
            id: Date.now() + 1,
            orderId: saved.id,
            fromStatus: null,
            toStatus: 'design_requested',
            changedBy: req.user?.name || '관리자',
            memo: `템플릿에서 생성 (${template.name})`,
            createdAt: today.toISOString()
        });

        // usageCount 증가
        db.updateById('order_templates', templateId, {
            usageCount: (template.usageCount || 0) + 1,
            updatedAt: today.toISOString()
        });

        logActivity('order_from_template', {
            templateName: template.name,
            templateId: template.id,
            newOrderNumber,
        }, req.user);

        console.log(`[Admin] Order from template: "${template.name}" → ${newOrderNumber} by ${req.user?.name}`);
        res.json({
            success: true,
            order: saved,
            message: `템플릿 "${template.name}"에서 새 주문이 생성되었습니다. 주문번호: ${newOrderNumber}`
        });
    } catch (error) {
        console.error('[Admin] Order from template error:', error);
        res.status(500).json({ success: false, error: '템플릿에서 주문 생성 실패' });
    }
});

// ============================================================
// GET /api/admin/calendar/events - 캘린더용 주문 이벤트 목록
// 비유: 벽 달력에 붙일 포스트잇 데이터를 만들어주는 API
// FullCalendar가 월/주 뷰를 바꿀 때마다 start~end 범위로 자동 호출
// ============================================================
router.get('/calendar/events', (req, res) => {
    try {
        const { start, end } = req.query;

        // start/end 필수 — FullCalendar가 자동으로 보내는 파라미터
        if (!start || !end) {
            return res.status(400).json({ success: false, error: 'start, end 파라미터 필수' });
        }

        const allOrders = db.getAll('orders');
        const events = []; // FullCalendar 이벤트 배열

        // 각 주문에서 최대 3개 이벤트(포스트잇)를 생성
        allOrders.forEach(order => {
            // 주문 기본 정보 — 이벤트 제목과 부가정보에 사용
            const teamName = order.customer?.teamName || order.customer?.name || '미지정';
            const sport = order.items?.[0]?.sport || '';
            // I-2: 상단 SPORT_LABELS 재사용 (파일 내 중복 제거됨) — 새 종목은 상단 1곳만 추가
            const sportLabel = sport ? (SPORT_LABELS[sport] || sport) : '';
            const title = sportLabel ? `${teamName} - ${sportLabel}` : teamName;

            // 공통 extendedProps — 프론트에서 필터/표시에 사용
            const baseProps = {
                orderNumber: order.orderNumber || order.id,
                status: order.status || 'unknown',
                teamName,
                manager: order.manager || '미지정',
                orderId: order.id
            };

            // --- 이벤트 1: 납기일 (가장 중요한 포스트잇) ---
            // 날짜 비교 시 substring(0,10)으로 날짜 부분만 추출 (시간대 차이로 인한 누락 방지)
            const deadlineDate = order.shipping?.desiredDate?.substring(0, 10);
            const startDate = start.substring(0, 10);
            const endDate = end.substring(0, 10);
            if (deadlineDate && deadlineDate >= startDate && deadlineDate <= endDate) {
                // D-day 계산 — 납기까지 남은 일수에 따라 색상 결정
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dday = Math.ceil((new Date(deadlineDate) - today) / (1000 * 60 * 60 * 24));

                let color;
                // 완료/취소 주문은 회색으로 통일
                if (order.status === 'delivered' || order.status === 'cancelled') {
                    color = '#9CA3AF'; // 회색
                } else if (dday <= 3) {
                    color = '#E63946'; // 빨강: 3일 이내 긴급
                } else if (dday <= 7) {
                    color = '#F59E0B'; // 주황: 7일 이내 주의
                } else {
                    color = '#10B981'; // 초록: 여유
                }

                events.push({
                    id: `${order.id}-deadline`,
                    title: `[납기] ${title}`,
                    start: deadlineDate,
                    color,
                    extendedProps: { ...baseProps, type: 'deadline', dday }
                });
            }

            // --- 이벤트 2: 접수일 (주문이 들어온 날) ---
            const receiptDate = order.orderReceiptDate || order.createdAt;
            // createdAt은 ISO 형식일 수 있으므로 날짜 부분만 추출
            const receiptDateStr = receiptDate ? receiptDate.substring(0, 10) : null;
            if (receiptDateStr && receiptDateStr >= startDate && receiptDateStr <= endDate) {
                const receiptColor = (order.status === 'delivered' || order.status === 'cancelled')
                    ? '#9CA3AF' : '#3B82F6'; // 파랑 또는 회색

                events.push({
                    id: `${order.id}-receipt`,
                    title: `[접수] ${title}`,
                    start: receiptDateStr,
                    color: receiptColor,
                    extendedProps: { ...baseProps, type: 'receipt' }
                });
            }

            // --- 이벤트 3: 출고일 (출고 예정/완료일) ---
            const releaseDate = order.shipping?.releaseDate?.substring(0, 10);
            if (releaseDate && releaseDate >= startDate && releaseDate <= endDate) {
                const releaseColor = (order.status === 'delivered' || order.status === 'cancelled')
                    ? '#9CA3AF' : '#8B5CF6'; // 보라 또는 회색

                events.push({
                    id: `${order.id}-release`,
                    title: `[출고] ${title}`,
                    start: releaseDate,
                    color: releaseColor,
                    extendedProps: { ...baseProps, type: 'release' }
                });
            }
        });

        console.log(`[Admin] Calendar events: ${events.length} events for ${start} ~ ${end}`);
        res.json(events); // FullCalendar는 배열을 직접 기대함

    } catch (error) {
        console.error('[Admin] Calendar events error:', error);
        res.status(500).json({ success: false, error: '캘린더 이벤트 조회 실패' });
    }
});

// 분리된 stats.js에서 import 사용 (2026-04-22 admin.js 분리 리팩토링)
// 비유: 지점(stats.js)에서 본사(admin.js)의 "상태 정규화 스티커"를 꺼내 쓰도록 문 열어놓은 것
export { normalizeOrderStatus };

export default router;
