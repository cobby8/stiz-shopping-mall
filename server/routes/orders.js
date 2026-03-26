import express from 'express';
import db from '../db.js';

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
    'design_requested',   // 시안 요청
    'draft_done',         // 초안 완료
    'revision',           // 수정 중
    'design_confirmed',   // 디자인 확정
    'payment_pending',    // 결제 대기
    'payment_done',       // 결제 완료
    'grading',            // 그레이딩 (사이즈 작업)
    'line_work',          // 라인 작업
    'in_production',      // 생산 중
    'production_done',    // 생산 완료
    'released',           // 출고
    'shipped',            // 배송 중
    'delivered'           // 배송 완료
];

// 고객에게 보여줄 4단계 매핑
export function getCustomerStatus(detailedStatus) {
    const designStatuses = ['design_requested', 'draft_done', 'revision', 'design_confirmed'];
    const productionStatuses = ['payment_pending', 'payment_done', 'grading', 'line_work', 'in_production', 'production_done'];
    const shippingStatuses = ['released', 'shipped'];

    if (designStatuses.includes(detailedStatus)) return { step: 1, label: '시안 진행중' };
    if (productionStatuses.includes(detailedStatus)) return { step: 2, label: '제작 진행중' };
    if (shippingStatuses.includes(detailedStatus)) return { step: 3, label: '배송 준비중' };
    if (detailedStatus === 'delivered') return { step: 4, label: '배송완료' };

    // 기존 호환용 (pending, processing 등 이전 상태값)
    if (detailedStatus === 'pending') return { step: 1, label: '시안 진행중' };
    if (detailedStatus === 'processing') return { step: 2, label: '제작 진행중' };

    return { step: 0, label: '확인중' };
}

// 상태 한글 라벨 매핑
export const STATUS_LABELS = {
    design_requested: '시안 요청',
    draft_done: '초안 완료',
    revision: '수정 중',
    design_confirmed: '디자인 확정',
    payment_pending: '결제 대기',
    payment_done: '결제 완료',
    grading: '그레이딩',
    line_work: '라인 작업',
    in_production: '생산 중',
    production_done: '생산 완료',
    released: '출고',
    shipped: '배송 중',
    delivered: '배송 완료',
    // 기존 호환
    pending: '대기',
    processing: '처리중'
};

/**
 * 기존 주문을 새 스키마에 맞게 마이그레이션 (누락 필드 기본값 채움)
 * 비유: 낡은 서류 양식에 새 항목 칸을 추가하고 빈칸에 기본값을 채워넣는 것
 */
function migrateOrder(order) {
    return {
        ...order,
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
        design: order.design || {
            status: 'requested',
            revisionCount: 0,
            designer: '',
            orderSheetUrl: '',
            designFileUrl: ''
        },
        production: order.production || {
            status: '',
            factory: '',
            gradingDone: false
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
router.post('/', (req, res) => {
    try {
        const order = req.body;

        // 기본 유효성 검증
        if (!order.customer || !order.customer.name || !order.customer.email) {
            return res.status(400).json({ success: false, error: 'Customer info required' });
        }
        if (!order.items || order.items.length === 0) {
            return res.status(400).json({ success: false, error: 'Cart is empty' });
        }
        if (!order.shipping || !order.shipping.address) {
            return res.status(400).json({ success: false, error: 'Shipping address required' });
        }

        // 주문번호 자동 생성 (클라이언트가 보내지 않으면 서버에서 생성)
        order.orderNumber = order.orderNumber || generateOrderNumber();

        // 확장된 스키마 기본값 설정
        order.status = order.status || 'design_requested';
        order.createdAt = new Date().toISOString();
        order.updatedAt = order.createdAt;

        // 누락 필드 채우기
        const fullOrder = migrateOrder(order);
        const saved = db.insert('orders', fullOrder);

        console.log(`[Order] New order: ${saved.orderNumber} (${saved.items?.length || 0} items, ₩${saved.total || 0})`);

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

// GET /api/orders - 주문 목록 조회
router.get('/', (req, res) => {
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
        const customerStatus = getCustomerStatus(order.status);

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

        res.json({
            success: true,
            order: {
                orderNumber: order.orderNumber,
                teamName: order.customer?.teamName || '',
                customerName: order.customer?.name || '',
                items: (order.items || []).map(item => ({
                    name: item.name,
                    sport: item.sport,
                    quantity: item.quantity
                })),
                status: order.status,
                customerStatus,                      // 4단계 단순화 상태
                statusLabel: STATUS_LABELS[order.status] || order.status,
                trackingNumber: order.shipping?.trackingNumber || '',
                carrier: order.shipping?.carrier || '',
                desiredDate: order.shipping?.desiredDate || '',
                history                              // 상태 변경 타임라인
            }
        });
    } catch (error) {
        console.error('[Order] Track error:', error);
        res.status(500).json({ success: false, error: '주문 조회 실패' });
    }
});

// GET /api/orders/:orderNumber - 주문번호로 상세 조회
router.get('/:orderNumber', (req, res) => {
    const orders = db.getAll('orders');
    const order = orders.find(o => o.orderNumber === req.params.orderNumber);
    if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, order });
});

export default router;
