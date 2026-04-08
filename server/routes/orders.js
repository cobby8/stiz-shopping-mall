import express from 'express';
import db from '../db.js';
// 관리자 인증 미들웨어 — 주문 목록/상세 조회를 관리자만 가능하게 제한
import { adminAuth } from '../middleware/adminAuth.js';
// 카카오 알림톡 서비스 — 주문 생성/디자인 확정 시 고객에게 자동 알림
import { sendNotification } from '../services/notification.js';

const router = express.Router();

/**
 * 주문번호 자동 생성 함수
 * 형식: ORD-YYYYMMDD-NNN (예: ORD-20260326-001)
 * 비유: 은행 대기표처럼 날짜별로 001부터 순번이 매겨진다.
 * 같은 날 주문이 여러 건이면 002, 003... 으로 증가한다.
 */
function generateOrderNumber() {
    // 오늘 날짜를 YYYYMMDD 형식으로 만든다
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

    // 기존 주문 중 오늘 날짜 접두사를 가진 것들을 찾아 최대 순번을 구한다
    const prefix = `ORD-${dateStr}-`;
    const orders = db.getAll('orders');
    let maxSeq = 0;

    for (const order of orders) {
        if (order.orderNumber && order.orderNumber.startsWith(prefix)) {
            // "ORD-20260326-003" 에서 "003"을 추출해 숫자로 변환
            const seq = parseInt(order.orderNumber.slice(prefix.length), 10);
            if (seq > maxSeq) maxSeq = seq;
        }
    }

    // 다음 순번을 3자리로 패딩 (1 -> "001")
    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    return `${prefix}${nextSeq}`;
}

/**
 * 상태 매핑 유틸리티
 * 서버 내부에서는 12단계 상세 상태를 사용하지만,
 * 고객에게는 4단계로 단순화하여 보여준다.
 * 비유: 공장 내부에서는 "재단→봉제→검품→포장"으로 나누지만,
 *       고객에게는 "제작 중"이라고만 알려주는 것과 같다.
 */
export const STATUS_FLOW = [
    'consult_started',          // 상담개시
    'design_requested',         // 시안요청
    'draft_done',               // 초안완료
    'revision',                 // 수정 중
    'design_confirmed',         // 디자인확정
    'order_received',           // 주문서접수
    'payment_completed',        // 결제완료
    'work_instruction_pending', // 작업지시서 전송전
    'work_instruction_sent',    // 작업지시서 전송후
    'work_instruction_received',// 작업지시서 접수
    'in_production',            // 생산중
    'production_done',          // 생산완료
    'factory_released',         // 공장출고
    'warehouse_received',       // 창고입고
    'released',                 // 출고
    'shipped',                  // 배송중
    'delivered',                // 배송완료
    'hold',                     // 보류
    'cancelled'                 // 취소
];

export const LEGACY_STATUS_MAP = {
    payment_pending: 'order_received',
    payment_done: 'payment_completed',
    grading: 'work_instruction_received',
    line_work: 'work_instruction_received',
    pending: 'consult_started',
    processing: 'in_production'
};

export function normalizeStatus(status) {
    if (!status) return status;
    return LEGACY_STATUS_MAP[status] || status;
}

// 고객에게 보여줄 4단계 매핑
export function getCustomerStatus(detailedStatus) {
    const normalized = normalizeStatus(detailedStatus);
    const designStatuses = ['consult_started', 'design_requested', 'draft_done', 'revision', 'design_confirmed'];
    const productionStatuses = ['order_received', 'payment_completed', 'work_instruction_pending', 'work_instruction_sent', 'work_instruction_received', 'in_production', 'production_done', 'factory_released'];
    const shippingStatuses = ['warehouse_received', 'released', 'shipped'];

    if (designStatuses.includes(normalized)) return { step: 1, label: '상담/시안 진행중' };
    if (productionStatuses.includes(normalized)) return { step: 2, label: '제작 준비/생산중' };
    if (shippingStatuses.includes(normalized)) return { step: 3, label: '출고/배송중' };
    if (normalized === 'delivered') return { step: 4, label: '배송완료' };
    // hold/cancelled 상태 별도 매핑 — 고객에게 명확한 안내 제공
    if (normalized === 'hold') return { step: 0, label: '보류중' };
    if (normalized === 'cancelled') return { step: 0, label: '취소됨' };

    return { step: 0, label: '확인중' };
}

// 상태 한글 라벨 매핑
export const STATUS_LABELS = {
    consult_started: '상담개시',
    design_requested: '시안요청',
    draft_done: '초안 완료',
    revision: '수정 중',
    design_confirmed: '디자인확정',
    order_received: '주문서접수',
    payment_completed: '결제완료',
    work_instruction_pending: '작업지시서 전송전',
    work_instruction_sent: '작업지시서 전송후',
    work_instruction_received: '작업지시서 접수',
    in_production: '생산중',
    production_done: '생산완료',
    factory_released: '공장출고',
    warehouse_received: '창고입고',
    released: '출고',
    shipped: '배송중',
    delivered: '배송완료',
    hold: '보류',
    cancelled: '취소'
};

/**
 * 기존 주문을 새 스키마에 맞게 마이그레이션 (누락 필드 기본값 채움)
 * 비유: 낡은 서류 양식에 새 항목 칸을 추가하고 빈칸에 기본값을 채워넣는 것
 */
function migrateOrder(order) {
    const normalizedStatus = normalizeStatus(order.status || 'consult_started');
    return {
        ...order,
        status: normalizedStatus,
        // 기존 주문 중 orderNumber가 없는 경우 자동 생성
        orderNumber: order.orderNumber || generateOrderNumber(),
        groupId: order.groupId || null,
        customer: {
            name: order.customer?.name || '',
            email: order.customer?.email || '',
            phone: order.customer?.phone || '',
            teamName: order.customer?.teamName || '',
            dealType: order.customer?.dealType || '개인',
            ...order.customer
        },
        // A-5: design 기본값 확장 — 무료 수정 횟수, 시안 파일 목록, 수정 이력 추가
        design: {
            status: 'requested',
            revisionCount: 0,
            maxFreeRevisions: 2,      // 무료 수정 횟수 한도
            designer: '',
            designFileUrl: '',
            orderSheetUrl: '',
            draftFiles: [],            // 시안 파일 목록 (여러 장 가능)
            revisionHistory: [],       // 수정 요청 이력
            ...(order.design || {})    // 클라이언트가 보낸 값이 있으면 덮어쓰기
        },
        // A-5: 주문서 데이터 (팀원별 배번/사이즈) — 주문 시점에는 보통 null
        orderSheet: order.orderSheet || null,
        // A-5: 참고 파일 목록 (로고, 참고 이미지 등)
        referenceFiles: order.referenceFiles || [],
        // A-5: 고객 시안 요청 메모 (관리자용 memo와 구분)
        customerMemo: order.customerMemo || '',
        // A-5: 견적 정보
        estimate: order.estimate || null,
        production: order.production || {
            status: '',
            factory: '',
            gradingDone: false
        },
        workInstruction: {
            status: order.workInstruction?.status || '',
            sentAt: order.workInstruction?.sentAt || '',
            receivedAt: order.workInstruction?.receivedAt || '',
            sentBy: order.workInstruction?.sentBy || '',
            url: order.workInstruction?.url || '',
            note: order.workInstruction?.note || '',
            ...order.workInstruction
        },
        shipping: {
            address: order.shipping?.address || '',
            desiredDate: order.shipping?.desiredDate || '',
            releaseDate: order.shipping?.releaseDate || '',
            shippedDate: order.shipping?.shippedDate || '',
            trackingNumber: order.shipping?.trackingNumber || '',
            carrier: order.shipping?.carrier || '',
            ...order.shipping
        },
        payment: order.payment || {
            totalAmount: order.total || 0,
            unitPrice: 0,
            quantity: 0,
            paidDate: '',
            paymentType: 'deposit',
            transactionMethod: 'cash',
            quoteUrl: '',
            autoQuote: false
        },
        manager: order.manager || '',
        memo: order.memo || '',
        updatedAt: order.updatedAt || order.createdAt || new Date().toISOString()
    };
}


// POST /api/orders - 주문 생성
// A-5: 고객 주문 위자드에서 보내는 확장 필드(fabric, composition, referenceFiles, design 등) 수용
// 기존 필드만 보내도 정상 동작 (하위 호환 유지)
router.post('/', (req, res) => {
    try {
        const order = req.body;

        // 기본 유효성 검증
        // - 비회원 주문 지원: email 또는 phone 중 하나만 있으면 통과
        // - 주문 시점에는 배송지가 없을 수 있으므로 shipping.address 필수 해제
        if (!order.customer || !order.customer.name) {
            return res.status(400).json({ success: false, error: 'Customer name is required' });
        }
        if (!order.customer.email && !order.customer.phone) {
            return res.status(400).json({ success: false, error: 'Email or phone is required' });
        }
        if (!order.items || order.items.length === 0) {
            return res.status(400).json({ success: false, error: 'Cart is empty' });
        }

        // 주문번호 자동 생성 (클라이언트가 보내지 않으면 서버에서 생성)
        order.orderNumber = order.orderNumber || generateOrderNumber();

        // 확장된 스키마 기본값 설정
        order.status = normalizeStatus(order.status || 'consult_started');
        order.createdAt = new Date().toISOString();
        order.updatedAt = order.createdAt;

        // A-5: 확장 필드 기본값 — 클라이언트가 보내지 않았을 때만 채운다
        // referenceFiles: 고객이 업로드한 참고 파일(로고, 참고 이미지 등) 목록
        order.referenceFiles = order.referenceFiles || [];
        // customerMemo: 고객의 시안 요청 메모 (기존 memo는 관리자용)
        order.customerMemo = order.customerMemo || '';
        // estimate: 견적 정보 (클라이언트에서 계산하여 전송)
        order.estimate = order.estimate || null;
        // orderSheet: 팀원별 배번/사이즈 데이터 — 주문 시점에는 보통 없음
        order.orderSheet = order.orderSheet || null;

        // 누락 필드 채우기 (migrateOrder에서 design 등 나머지 기본값 처리)
        const fullOrder = migrateOrder(order);
        const saved = db.insert('orders', fullOrder);

        console.log(`[Order] New order: ${saved.orderNumber} (${saved.items?.length || 0} items, ₩${saved.total || 0})`);

        // 카카오 알림톡: 주문 접수 확인 알림 (비동기, 실패해도 주문 정상)
        sendNotification('order_created', saved);

        res.json({
            success: true,
            orderNumber: saved.orderNumber,
            message: 'Order placed successfully'
        });
    } catch (error) {
        console.error('[Order] Error:', error);
        res.status(500).json({ success: false, error: 'Failed to process order' });
    }
});

// GET /api/orders - 주문 목록 조회 (관리자 전용)
// 보안: 인증 없이 전체 주문 목록이 노출되는 취약점 수정 — adminAuth 추가
router.get('/', adminAuth, (req, res) => {
    const orders = db.getAll('orders');
    res.json({ success: true, orders });
});

// GET /api/orders/track/:orderNumber - 비로그인 주문 추적 (주문번호로 조회)
// 비유: 택배 송장번호 조회 - 로그인 없이 주문번호만으로 진행상황 확인
router.get('/track/:orderNumber', (req, res) => {
    try {
        const { orderNumber } = req.params;
        const orders = db.getAll('orders');
        const order = orders.find(o => o.orderNumber === orderNumber);

        if (!order) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' });
        }

        // 고객에게는 민감 정보를 제외하고 필요한 것만 반환
        const normalizedStatus = normalizeStatus(order.status);
        const customerStatus = getCustomerStatus(normalizedStatus);

        // 상태 변경 이력 조회 (고객에게 보여줄 타임라인)
        const allHistory = db.getAll('order-history');
        const history = allHistory
            .filter(h => h.orderId === order.id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(h => ({
                status: STATUS_LABELS[h.toStatus] || h.toStatus,
                date: h.createdAt,
                memo: h.memo || ''
            }));

        // A-6: 응답에 시안/주문서/결제/참고파일 정보 추가 (민감 정보 제외)
        res.json({
            success: true,
            order: {
                orderNumber: order.orderNumber,
                teamName: order.customer?.teamName || '',
                customerName: order.customer?.name || '',
                // A-6: items에 확장 필드(fabric, composition) 포함하여 반환
                items: (order.items || []).map(item => ({
                    name: item.name,
                    sport: item.sport,
                    category: item.category || '',
                    fabric: item.fabric || '',
                    composition: item.composition || null,
                    quantity: item.quantity
                })),
                status: normalizedStatus,
                customerStatus,                      // 4단계 단순화 상태
                statusLabel: STATUS_LABELS[normalizedStatus] || normalizedStatus,
                trackingNumber: order.shipping?.trackingNumber || '',
                carrier: order.shipping?.carrier || '',
                desiredDate: order.shipping?.desiredDate || '',
                // A-6: 시안 정보 — 고객이 시안 확인/수정 요청할 때 필요
                // designer, orderSheetUrl 등 관리자 전용 필드는 제외
                design: {
                    status: order.design?.status || 'requested',
                    revisionCount: order.design?.revisionCount || 0,
                    maxFreeRevisions: order.design?.maxFreeRevisions || 2,
                    draftFiles: order.design?.draftFiles || [],
                    revisionHistory: order.design?.revisionHistory || [],
                },
                // A-6: 참고 파일 목록 (고객이 업로드한 로고/참고 이미지)
                referenceFiles: order.referenceFiles || [],
                // A-6: 주문서 데이터 (팀원별 배번/사이즈)
                orderSheet: order.orderSheet || null,
                // A-6: 결제 정보 — 총액과 결제 여부만 (계좌번호 등 민감 정보 제외)
                payment: {
                    totalAmount: order.payment?.totalAmount || order.total || 0,
                    status: order.payment?.paidDate ? 'paid' : 'unpaid',
                },
                // A-6: 고객 메모 + 견적
                customerMemo: order.customerMemo || '',
                estimate: order.estimate || null,
                history                              // 상태 변경 타임라인
            }
        });
    } catch (error) {
        console.error('[Order] Track error:', error);
        res.status(500).json({ success: false, error: '주문 조회 실패' });
    }
});

// GET /api/orders/:orderNumber - 주문번호로 상세 조회 (관리자 전용)
// 보안: 주문번호만 알면 누구나 상세 정보를 볼 수 있던 취약점 수정
router.get('/:orderNumber', adminAuth, (req, res) => {
    const orders = db.getAll('orders');
    const order = orders.find(o => o.orderNumber === req.params.orderNumber);
    if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, order });
});

// ============================================================
// Phase C: 고객용 API (시안 확정 / 수정 요청 / 주문서 / 입금 알림)
// 비유: 주문 후 고객이 "식당 창구"에서 할 수 있는 후속 요청 4가지
// 모든 API는 주문번호 + 연락처로 본인 확인한다 (비회원 지원)
// ============================================================

/**
 * 주문 조회 + 본인 확인 헬퍼
 * 비유: 은행 창구에서 "신분증 확인" 절차
 * 주문번호로 주문을 찾고, 연락처가 일치하는지 검증한다.
 * @param {string} orderNumber - 주문번호
 * @param {string} phone - 고객 연락처
 * @returns {{ order, data } | { error, status }} - 성공 시 order+data, 실패 시 error+status
 */
function findOrderByNumberAndPhone(orderNumber, phone) {
    // findOne으로 주문번호 인덱스 컬럼 직접 조회 (성능 우수)
    const order = db.findOne('orders', 'orderNumber', orderNumber);
    if (!order) return { error: '주문을 찾을 수 없습니다', status: 404 };

    // 하이픈 제거 후 비교 (010-1234-5678 → 01012345678)
    const dbPhone = (order.customer?.phone || '').replace(/-/g, '');
    const inputPhone = (phone || '').replace(/-/g, '');
    if (!inputPhone || dbPhone !== inputPhone) {
        return { error: '연락처가 일치하지 않습니다', status: 403 };
    }
    return { order };
}

/**
 * POST /api/orders/:orderNumber/design-confirm
 * 고객이 시안을 확정하는 API (Step 9b)
 * design.status를 'confirmed'로, 주문 상태를 'design_confirmed'로 변경
 */
router.post('/:orderNumber/design-confirm', (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { phone } = req.body;

        // 본인 확인
        const result = findOrderByNumberAndPhone(orderNumber, phone);
        if (result.error) {
            return res.status(result.status).json({ success: false, error: result.error });
        }
        const { order } = result;

        // 시안이 'draft_done' 상태일 때만 확정 가능
        const designStatus = order.design?.status || '';
        if (designStatus !== 'draft_done' && designStatus !== 'revision_done') {
            return res.status(400).json({
                success: false,
                error: '현재 시안을 확정할 수 없는 상태입니다 (초안 완료 후 확정 가능)'
            });
        }

        // design.status 업데이트 + 주문 상태 변경
        const updatedDesign = {
            ...(order.design || {}),
            status: 'confirmed',
            confirmedAt: new Date().toISOString()
        };

        db.updateById('orders', order.id, {
            design: updatedDesign,
            status: 'design_confirmed',
            updatedAt: new Date().toISOString()
        });

        // 상태 변경 이력 기록
        db.insert('order-history', {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'design_confirmed',
            changedBy: order.customer?.name || '고객',
            memo: '고객이 디자인을 확정했습니다',
            createdAt: new Date().toISOString()
        });

        console.log(`[Order] Design confirmed: ${orderNumber}`);

        // 카카오 알림톡: 디자인 확정 알림 (비동기, 실패해도 정상 응답)
        // order 객체에 최신 design 상태를 반영하여 전달
        sendNotification('design_confirmed', { ...order, design: updatedDesign });

        res.json({ success: true, message: '디자인이 확정되었습니다' });
    } catch (error) {
        console.error('[Order] Design confirm error:', error);
        res.status(500).json({ success: false, error: '디자인 확정 처리 실패' });
    }
});

/**
 * POST /api/orders/:orderNumber/revision
 * 고객이 시안 수정을 요청하는 API (Step 9a)
 * 수정 내용과 참고 파일을 함께 전송할 수 있다
 */
router.post('/:orderNumber/revision', (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { phone, message, attachments } = req.body;

        // 본인 확인
        const result = findOrderByNumberAndPhone(orderNumber, phone);
        if (result.error) {
            return res.status(result.status).json({ success: false, error: result.error });
        }
        const { order } = result;

        // 수정 요청 내용이 비어있으면 거부
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, error: '수정 내용을 입력해주세요' });
        }

        // 무료 수정 횟수 체크 — 초과해도 요청은 가능하지만 유료 안내
        const revisionCount = (order.design?.revisionCount || 0) + 1;
        const maxFree = order.design?.maxFreeRevisions || 2;
        const isExtraCharge = revisionCount > maxFree;

        // 수정 이력에 새 항목 추가
        const revisionHistory = [...(order.design?.revisionHistory || []), {
            requestedAt: new Date().toISOString(),
            message: message.trim(),
            attachments: attachments || [],  // 참고 파일 URL 배열
            completedAt: null,               // 디자이너가 완료하면 채워짐
            isExtraCharge                    // 유료 수정 여부
        }];

        const updatedDesign = {
            ...(order.design || {}),
            status: 'revision',
            revisionCount,
            revisionHistory
        };

        db.updateById('orders', order.id, {
            design: updatedDesign,
            status: 'revision',
            updatedAt: new Date().toISOString()
        });

        // 상태 변경 이력 기록
        db.insert('order-history', {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'revision',
            changedBy: order.customer?.name || '고객',
            memo: `수정 요청 (${revisionCount}회차): ${message.trim().substring(0, 100)}`,
            createdAt: new Date().toISOString()
        });

        console.log(`[Order] Revision requested: ${orderNumber} (${revisionCount}회차)`);
        res.json({
            success: true,
            message: isExtraCharge
                ? `수정 요청이 접수되었습니다 (무료 ${maxFree}회 초과, 추가 비용이 발생할 수 있습니다)`
                : '수정 요청이 접수되었습니다',
            revisionCount,
            isExtraCharge
        });
    } catch (error) {
        console.error('[Order] Revision error:', error);
        res.status(500).json({ success: false, error: '수정 요청 처리 실패' });
    }
});

/**
 * PUT /api/orders/:orderNumber/order-sheet
 * 주문서(배번/사이즈) 저장 및 수정 API (Step 10)
 * isDraft=true면 임시 저장, false면 최종 제출
 * 비유: 팀원 명단을 작성하고 "제출" 또는 "임시저장" 하는 것
 */
router.put('/:orderNumber/order-sheet', (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { phone, members, isDraft } = req.body;

        // 본인 확인
        const result = findOrderByNumberAndPhone(orderNumber, phone);
        if (result.error) {
            return res.status(result.status).json({ success: false, error: result.error });
        }
        const { order } = result;

        // members 배열 검증
        if (!Array.isArray(members) || members.length === 0) {
            return res.status(400).json({ success: false, error: '팀원 정보를 1명 이상 입력해주세요' });
        }

        // 각 멤버의 필수 필드 확인 (최종 제출 시에만 엄격하게)
        if (!isDraft) {
            for (let i = 0; i < members.length; i++) {
                const m = members[i];
                if (!m.name || !m.topSize) {
                    return res.status(400).json({
                        success: false,
                        error: `${i + 1}번째 팀원의 이름과 상의 사이즈는 필수입니다`
                    });
                }
            }
        }

        const orderSheet = {
            members: members.map(m => ({
                number: (m.number || '').toString().trim(),
                name: (m.name || '').trim(),
                topSize: (m.topSize || '').trim(),
                bottomSize: (m.bottomSize || '').trim()
            })),
            isDraft: isDraft !== false,  // 기본값은 임시저장
            submittedAt: isDraft === false ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString()
        };

        // 주문서 제출(isDraft=false)이면 주문 상태도 변경
        const updates = {
            orderSheet,
            updatedAt: new Date().toISOString()
        };

        if (isDraft === false) {
            updates.status = 'order_received';
        }

        db.updateById('orders', order.id, updates);

        // 최종 제출 시에만 이력 기록
        if (isDraft === false) {
            db.insert('order-history', {
                orderId: order.id,
                fromStatus: order.status,
                toStatus: 'order_received',
                changedBy: order.customer?.name || '고객',
                memo: `주문서 제출 (${members.length}명)`,
                createdAt: new Date().toISOString()
            });
        }

        console.log(`[Order] Order sheet ${isDraft === false ? 'submitted' : 'saved'}: ${orderNumber} (${members.length}명)`);
        res.json({
            success: true,
            message: isDraft === false ? '주문서가 제출되었습니다' : '임시 저장되었습니다',
            orderSheet
        });
    } catch (error) {
        console.error('[Order] Order sheet error:', error);
        res.status(500).json({ success: false, error: '주문서 저장 실패' });
    }
});

/**
 * POST /api/orders/:orderNumber/payment-notify
 * 고객이 입금 완료를 알리는 API (Step 11)
 * 실제 입금 확인은 관리자가 수동으로 하고, 이 API는 "입금했다"는 알림만 전달
 * 비유: 은행에 돈을 보내고 "보냈습니다" 문자를 보내는 것
 */
router.post('/:orderNumber/payment-notify', (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { phone, depositorName, amount } = req.body;

        // 본인 확인
        const result = findOrderByNumberAndPhone(orderNumber, phone);
        if (result.error) {
            return res.status(result.status).json({ success: false, error: result.error });
        }
        const { order } = result;

        // 입금자명 필수
        if (!depositorName || !depositorName.trim()) {
            return res.status(400).json({ success: false, error: '입금자명을 입력해주세요' });
        }

        // payment 정보 업데이트 (입금 확인 대기 상태)
        const updatedPayment = {
            ...(order.payment || {}),
            depositorName: depositorName.trim(),
            notifiedAmount: amount || null,    // 고객이 알린 입금액
            notifiedAt: new Date().toISOString(),
            status: 'pending_confirmation'     // 관리자 확인 대기
        };

        db.updateById('orders', order.id, {
            payment: updatedPayment,
            updatedAt: new Date().toISOString()
        });

        // 이력 기록
        db.insert('order-history', {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: order.status,  // 상태는 변경하지 않음 (관리자 확인 후 변경)
            changedBy: order.customer?.name || '고객',
            memo: `입금 완료 알림 (입금자: ${depositorName.trim()})`,
            createdAt: new Date().toISOString()
        });

        console.log(`[Order] Payment notified: ${orderNumber} (입금자: ${depositorName.trim()})`);
        res.json({
            success: true,
            message: '입금 확인 요청이 접수되었습니다. 확인 후 안내드리겠습니다.'
        });
    } catch (error) {
        console.error('[Order] Payment notify error:', error);
        res.status(500).json({ success: false, error: '입금 알림 처리 실패' });
    }
});

export default router;
