/**
 * 카카오 알림톡 메시지 템플릿 모음
 *
 * 역할: 알림 유형별로 메시지 본문을 생성하는 함수 모음.
 * 비유: 편지 양식(템플릿)에 이름/날짜만 바꿔 넣는 것.
 *
 * 7개 알림 유형:
 * 1. order_created     — 주문 접수 확인
 * 2. design_confirmed  — 디자인 확정 알림
 * 3. payment_completed — 결제 완료 안내
 * 4. in_production     — 생산 시작 알림
 * 5. shipped           — 배송 시작 안내
 * 6. delivered         — 배송 완료 안내
 * 7. status_changed    — 범용 상태 변경 알림 (위 6개에 해당하지 않는 경우)
 */

// 상태 코드 → 한글 라벨 매핑 (orders.js의 STATUS_LABELS와 동일)
// 순환 참조를 피하기 위해 여기서 별도로 정의한다.
const STATUS_LABELS = {
    consult_started: '상담개시',
    design_requested: '시안요청',
    draft_done: '시안완료',
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
 * 주문 추적 URL 생성 헬퍼
 * 고객이 클릭하면 주문 진행 상황을 확인할 수 있는 링크
 */
function trackUrl(orderNumber) {
    // 실제 도메인은 환경변수로 분리 가능. 현재는 로컬 기준.
    const baseUrl = process.env.BASE_URL || 'https://stiz.co.kr';
    return `${baseUrl}/order-track.html?order=${encodeURIComponent(orderNumber)}`;
}

/**
 * 고객 이름 추출 헬퍼 (없으면 "고객님")
 */
function customerName(order) {
    return order.customer?.name || '고객님';
}

/**
 * 품목 요약 헬퍼 — "농구 유니폼 세트 외 2건" 같은 형식
 */
function itemSummary(order) {
    const items = order.items || [];
    if (items.length === 0) return '주문 상품';
    const first = items[0];
    const name = first.name || first.sport || '상품';
    if (items.length === 1) return name;
    return `${name} 외 ${items.length - 1}건`;
}

// ============================================================
// 1. 주문 접수 확인
// 트리거: POST /api/orders 성공 시
// ============================================================
function orderCreated(order) {
    return `[STIZ] 주문이 접수되었습니다.

안녕하세요, ${customerName(order)}님.
주문이 정상적으로 접수되었습니다.

■ 주문번호: ${order.orderNumber}
■ 주문내역: ${itemSummary(order)}
■ 수량: ${(order.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0)}벌

담당자가 확인 후 시안 작업을 시작하겠습니다.
진행 상황은 아래 링크에서 확인하실 수 있습니다.

${trackUrl(order.orderNumber)}`;
}

// ============================================================
// 2. 디자인 확정 알림
// 트리거: POST /api/orders/:orderNumber/design-confirm 성공 시
// ============================================================
function designConfirmed(order) {
    return `[STIZ] 디자인이 확정되었습니다.

안녕하세요, ${customerName(order)}님.
요청하신 디자인이 확정 처리되었습니다.

■ 주문번호: ${order.orderNumber}
■ 주문내역: ${itemSummary(order)}

주문서(배번/사이즈) 작성 및 결제를 진행해 주세요.
확인 후 생산에 들어갑니다.

${trackUrl(order.orderNumber)}`;
}

// ============================================================
// 3. 결제 완료 안내
// 트리거: 관리자가 상태를 payment_completed로 변경 시
// ============================================================
function paymentCompleted(order) {
    return `[STIZ] 결제가 확인되었습니다.

안녕하세요, ${customerName(order)}님.
입금이 정상적으로 확인되었습니다.

■ 주문번호: ${order.orderNumber}
■ 결제금액: ${(order.payment?.totalAmount || order.total || 0).toLocaleString()}원

생산 준비를 시작하겠습니다.
진행 상황은 아래 링크에서 확인하실 수 있습니다.

${trackUrl(order.orderNumber)}`;
}

// ============================================================
// 4. 생산 시작 알림
// 트리거: 관리자가 상태를 in_production으로 변경 시
// ============================================================
function inProduction(order) {
    return `[STIZ] 생산이 시작되었습니다.

안녕하세요, ${customerName(order)}님.
주문하신 상품의 생산이 시작되었습니다.

■ 주문번호: ${order.orderNumber}
■ 주문내역: ${itemSummary(order)}

생산 완료 후 출고/배송 안내를 드리겠습니다.

${trackUrl(order.orderNumber)}`;
}

// ============================================================
// 5. 배송 시작 안내
// 트리거: 관리자가 상태를 shipped로 변경 시
// ============================================================
function shipped(order) {
    const tracking = order.shipping?.trackingNumber || '';
    const carrier = order.shipping?.carrier || '';
    // 운송장 정보가 있으면 추가 표시
    const trackingInfo = tracking
        ? `\n■ 택배사: ${carrier}\n■ 운송장번호: ${tracking}`
        : '';

    return `[STIZ] 상품이 발송되었습니다.

안녕하세요, ${customerName(order)}님.
주문하신 상품이 발송되었습니다.

■ 주문번호: ${order.orderNumber}${trackingInfo}

배송은 보통 1~3일 소요됩니다.

${trackUrl(order.orderNumber)}`;
}

// ============================================================
// 6. 배송 완료 안내
// 트리거: 관리자가 상태를 delivered로 변경 시
// ============================================================
function delivered(order) {
    return `[STIZ] 배송이 완료되었습니다.

안녕하세요, ${customerName(order)}님.
주문하신 상품이 배송 완료되었습니다.

■ 주문번호: ${order.orderNumber}
■ 주문내역: ${itemSummary(order)}

상품에 문제가 있으시면 언제든 문의해 주세요.
STIZ를 이용해 주셔서 감사합니다.`;
}

// ============================================================
// 7. 범용 상태 변경 알림 (위 6개에 해당하지 않는 경우)
// 트리거: 관리자가 상태를 변경했는데, 전용 템플릿이 없는 경우
// ============================================================
function statusChanged(order, extra = {}) {
    const label = extra.statusLabel
        || STATUS_LABELS[extra.toStatus]
        || extra.toStatus
        || '변경됨';

    return `[STIZ] 주문 상태가 변경되었습니다.

안녕하세요, ${customerName(order)}님.
주문 상태가 업데이트되었습니다.

■ 주문번호: ${order.orderNumber}
■ 변경 상태: ${label}

자세한 내용은 아래 링크에서 확인해 주세요.

${trackUrl(order.orderNumber)}`;
}

// ============================================================
// 알림 유형 → 템플릿 함수 매핑
// notification.js에서 getTemplateByType(type)으로 호출한다.
// ============================================================
const TEMPLATE_MAP = {
    order_created: orderCreated,
    design_confirmed: designConfirmed,
    payment_completed: paymentCompleted,
    in_production: inProduction,
    shipped: shipped,
    delivered: delivered,
    status_changed: statusChanged
};

/**
 * 알림 유형에 맞는 템플릿 함수를 반환
 * @param {string} type - 알림 유형 키
 * @returns {Function|null} - 템플릿 함수 또는 null
 */
export function getTemplateByType(type) {
    return TEMPLATE_MAP[type] || null;
}

// 상태 코드 → 전용 알림 유형 매핑
// 관리자가 상태를 변경할 때, 이 매핑에 있으면 전용 템플릿 사용
// 없으면 범용 status_changed 사용
export const STATUS_TO_NOTIFICATION_TYPE = {
    payment_completed: 'payment_completed',
    in_production: 'in_production',
    shipped: 'shipped',
    delivered: 'delivered'
};

export default { getTemplateByType, STATUS_TO_NOTIFICATION_TYPE };
