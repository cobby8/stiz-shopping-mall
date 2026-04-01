/**
 * STIZ 관리자 주문 상세/편집 로직
 *
 * 기능:
 * 1. 주문 상세 정보 표시 (탭별 구분: 고객/디자인/생산/물류/금융/이력)
 * 2. 편집 모드: 필드를 직접 수정하고 저장
 * 3. 상태 변경: 모달에서 새 상태 선택 + 사유 입력
 * 4. 상태 변경 이력 타임라인 표시
 */

// ============================================================
// 상수 정의
// ============================================================
const API_BASE = 'http://localhost:4000';

// 12단계 상태 흐름 (순서대로)
// 정상 진행 흐름 + 특수 상태(보류/취소)
const STATUS_FLOW = [
    'design_requested', 'draft_done', 'revision', 'design_confirmed',
    'payment_pending', 'payment_done',
    'grading', 'line_work', 'in_production', 'production_done',
    'released', 'shipped', 'delivered',
    'hold', 'cancelled'
];

// 상태 한글 라벨
const STATUS_LABELS = {
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
    hold: '보류',
    cancelled: '취소',
    pending: '대기',
    processing: '처리중'
};

// 종목 한글 라벨
const SPORT_LABELS = {
    basketball: '농구', soccer: '축구', volleyball: '배구', baseball: '야구',
    badminton: '배드민턴', tabletennis: '탁구', handball: '핸드볼',
    futsal: '풋살', tennis: '테니스', softball: '소프트볼', other: '기타'
};

// 품목(카테고리) 한글 라벨
const CATEGORY_LABELS = {
    uniform: '유니폼', jacket: '자켓', pants: '바지',
    training: '트레이닝', hoodie: '후드', vest: '조끼',
    t_shirt: '티셔츠', arm_sleeve: '암슬리브', other: '기타'
};

// 공법 한글 라벨
const METHOD_LABELS = {
    sublimation: '승화전사', embroidery: '자수',
    printing: '프린팅', cutting: '재단', other: '기타'
};

// 결제 유형 라벨
const PAYMENT_TYPE_LABELS = {
    deposit: '입금확인', deferred: '후결제', sponsor: '후원'
};

// 거래 방식 라벨
const TRANSACTION_METHOD_LABELS = {
    cash: '현금', tax_invoice: '세금계산서', shopping_mall: '쇼핑몰'
};

// 현재 주문 데이터 (전역 상태)
let currentOrder = null;
let currentHistory = [];
let isEditMode = false;
let currentTab = 'customer';

// ============================================================
// 초기화
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 관리자 인증 확인
    checkAdminAuth();
    // URL에서 주문 ID 추출 후 데이터 로드
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');

    if (!orderId) {
        showError();
        return;
    }

    loadOrderDetail(orderId);
});

// ============================================================
// 인증 관련 (admin.js와 동일)
// ============================================================
function checkAdminAuth() {
    const token = getAdminToken();
    if (!token) {
        alert('관리자 로그인이 필요합니다.');
        window.location.href = 'admin-login.html';
        return;
    }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role !== 'admin') {
            alert('관리자 권한이 없습니다.');
            window.location.href = 'index.html';
            return;
        }
        const nameEl = document.getElementById('admin-name');
        if (nameEl) nameEl.textContent = payload.name || '관리자';
    } catch (e) {
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
    }
}

function getAdminToken() {
    return localStorage.getItem('stiz_admin_token');
}

/** API 호출 공통 함수 (JWT 토큰 포함) */
async function adminFetch(url, options = {}) {
    const token = getAdminToken();
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
    };

    const response = await fetch(`${API_BASE}${url}`, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
        alert('인증이 만료되었습니다. 다시 로그인해주세요.');
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
        return null;
    }

    return response;
}

// ============================================================
// 주문 상세 로드
// ============================================================
async function loadOrderDetail(orderId) {
    try {
        const res = await adminFetch(`/api/admin/orders/${orderId}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success || !data.order) {
            showError();
            return;
        }

        currentOrder = data.order;
        currentHistory = data.history || [];

        // 화면에 데이터 렌더링
        renderOrderDetail();
        renderHistory();
        renderQuickStatusButtons();
        renderContactInfo();
        loadComments(currentOrder.id);  // 코멘트 타임라인 로드

        // 로딩 숨기고 콘텐츠 표시
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('order-content').classList.remove('hidden');
    } catch (error) {
        console.error('[AdminOrder] 주문 로드 실패:', error);
        showError();
    }
}

// ============================================================
// 주문 상세 렌더링
// ============================================================
function renderOrderDetail() {
    const order = currentOrder;

    // 페이지 타이틀의 주문번호
    document.getElementById('order-number').textContent = order.orderNumber || '-';
    document.title = `STIZ Admin - ${order.orderNumber || '주문 상세'}`;

    // 상단 상태 바
    renderCurrentStatusBadge(order.status);
    document.getElementById('current-manager').textContent = order.manager || '미배정';
    document.getElementById('current-date').textContent = order.createdAt ? formatDateTime(order.createdAt) : '-';
    document.getElementById('current-updated').textContent = order.updatedAt ? formatDateTime(order.updatedAt) : '-';

    // 시안요청일 — 값이 있을 때만 표시
    const designReqEl = document.getElementById('date-design-request');
    if (order.designRequestDate) {
        document.getElementById('current-design-request-date').textContent = formatDateTime(order.designRequestDate);
        designReqEl.classList.remove('hidden');
        designReqEl.classList.add('flex', 'items-center', 'gap-4');
    } else {
        designReqEl.classList.add('hidden');
    }

    // 접수일(매출기준일) — 값이 있을 때만 표시
    const orderRecEl = document.getElementById('date-order-receipt');
    if (order.orderReceiptDate) {
        document.getElementById('current-order-receipt-date').textContent = formatDateTime(order.orderReceiptDate);
        orderRecEl.classList.remove('hidden');
        orderRecEl.classList.add('flex', 'items-center', 'gap-4');
    } else {
        orderRecEl.classList.add('hidden');
    }

    // 각 탭의 data-field 요소에 값 채우기
    // 비유: 양식 문서의 빈칸에 데이터를 적어넣는 것
    fillFieldValues();

    // 아이템 목록 렌더링
    renderItems();

    // 세부내용(detail) — memo와 다를 때만 표시
    const detailSection = document.getElementById('detail-section');
    if (order.detail && order.detail !== order.memo) {
        document.getElementById('detail-value').textContent = order.detail;
        detailSection.classList.remove('hidden');
    } else {
        detailSection.classList.add('hidden');
    }

    // 입금 확인 영역 렌더링 (금융 탭 내)
    renderPaymentConfirmSection();
}

/**
 * data-field 속성을 가진 모든 요소에 주문 데이터의 값을 채운다
 * data-field="customer.name"이면 order.customer.name의 값을 표시
 */
function fillFieldValues() {
    const order = currentOrder;
    const fields = document.querySelectorAll('[data-field]');

    fields.forEach(el => {
        const fieldPath = el.getAttribute('data-field');
        let value = getNestedValue(order, fieldPath);

        // 특수한 필드는 별도 포맷팅
        if (fieldPath === 'payment.totalAmount' || fieldPath === 'payment.unitPrice') {
            value = value ? formatCurrency(value) : '-';
        } else if (fieldPath === 'payment.paymentType') {
            value = PAYMENT_TYPE_LABELS[value] || value || '-';
        } else if (fieldPath === 'payment.transactionMethod') {
            value = TRANSACTION_METHOD_LABELS[value] || value || '-';
        } else if (fieldPath === 'production.gradingDone') {
            value = value === true ? '완료' : value === false ? '미완료' : '-';
        } else if (fieldPath === 'design.status') {
            value = STATUS_LABELS[value] || value || '-';
        } else if (fieldPath === 'production.status') {
            value = STATUS_LABELS[value] || value || '-';
        } else {
            // URL 필드는 링크로 표시
            if (fieldPath.includes('Url') && value && value.startsWith('http')) {
                el.innerHTML = `<a href="${escapeHtml(value)}" target="_blank" class="text-blue-600 hover:underline text-sm">${escapeHtml(value)}</a>`;
                return;
            }
            value = value || '-';
        }

        el.textContent = value;
    });
}

/** 주문 아이템 목록 렌더링 */
function renderItems() {
    const itemsList = document.getElementById('items-list');
    const items = currentOrder.items || [];

    if (items.length === 0) {
        itemsList.innerHTML = '<p class="text-base text-gray-400">아이템 정보가 없습니다.</p>';
        return;
    }

    // 여러 아이템일 때 전체 합계 계산용
    const totalAmount = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const hasMultiple = items.length > 1;

    itemsList.innerHTML = items.map((item, idx) => {
        // 한글 변환: 영문 값을 사용자가 읽기 편한 한글로 변환
        const sportLabel = SPORT_LABELS[item.sport] || item.sport || '';
        const categoryLabel = CATEGORY_LABELS[item.category] || item.category || '';
        const methodLabel = METHOD_LABELS[item.method] || item.method || '';
        const itemName = item.name || categoryLabel || `아이템 ${idx + 1}`;

        // 종목 아이콘 매핑 (종목별 대표 이모지 대신 Material 아이콘명)
        const sportIcons = {
            basketball: 'sports_basketball', soccer: 'sports_soccer',
            volleyball: 'sports_volleyball', baseball: 'sports_baseball',
            badminton: 'sports_tennis', tabletennis: 'sports_tennis',
            handball: 'sports_handball', futsal: 'sports_soccer',
            tennis: 'sports_tennis', softball: 'sports_baseball'
        };
        const sportIcon = sportIcons[item.sport] || 'checkroom';

        // 스펙 태그 배열: 값이 있는 것만 태그로 표시
        const specTags = [];
        if (methodLabel) specTags.push(methodLabel);
        if (item.fit) specTags.push(escapeHtml(item.fit));
        if (item.baseModel) specTags.push(escapeHtml(item.baseModel));

        // 상의 정보 조합: 원단 + 구성을 한 줄로
        const topParts = [];
        if (item.fabricTop) topParts.push(escapeHtml(item.fabricTop));
        if (item.topConfig) topParts.push(escapeHtml(item.topConfig));

        // 하의 정보 조합
        const bottomParts = [];
        if (item.fabricBottom) bottomParts.push(escapeHtml(item.fabricBottom));
        if (item.bottomConfig) bottomParts.push(escapeHtml(item.bottomConfig));

        return `
        <div class="item-card bg-gray-50 rounded-lg overflow-hidden ${hasMultiple && idx < items.length - 1 ? 'mb-3' : ''}">
            <!-- 헤더: 종목 + 품목명 + 수량 -->
            <div class="item-card-header flex items-center justify-between px-5 py-3 bg-gray-100 border-b border-gray-200">
                <div class="flex items-center gap-3">
                    ${hasMultiple ? `<span class="item-number text-sm font-bold text-gray-400">#${idx + 1}</span>` : ''}
                    <span class="material-symbols-outlined text-xl text-gray-500">${sportIcon}</span>
                    <span class="text-lg font-bold text-gray-800">
                        ${sportLabel ? `${sportLabel} ` : ''}${escapeHtml(itemName)}
                    </span>
                </div>
                <div class="text-base font-semibold text-gray-600">
                    수량 <span class="text-lg text-gray-800">${item.quantity || 0}</span>벌
                </div>
            </div>

            <!-- 스펙 태그: 공법 + 핏 + 모델 (값이 있을 때만) -->
            ${specTags.length > 0 ? `
            <div class="flex flex-wrap gap-2 px-5 pt-3">
                ${specTags.map(tag => `
                    <span class="inline-block px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">${tag}</span>
                `).join('')}
            </div>` : ''}

            <!-- 원단/구성 정보: 상의/하의 행 (값이 있을 때만) -->
            ${topParts.length > 0 || bottomParts.length > 0 ? `
            <div class="px-5 pt-3 space-y-1.5">
                ${topParts.length > 0 ? `
                <div class="flex items-center gap-2 text-base text-gray-700">
                    <span class="text-sm font-semibold text-gray-500 w-8">상의</span>
                    <span class="text-gray-300">|</span>
                    <span>${topParts.join(' / ')}</span>
                </div>` : ''}
                ${bottomParts.length > 0 ? `
                <div class="flex items-center gap-2 text-base text-gray-700">
                    <span class="text-sm font-semibold text-gray-500 w-8">하의</span>
                    <span class="text-gray-300">|</span>
                    <span>${bottomParts.join(' / ')}</span>
                </div>` : ''}
            </div>` : ''}

            <!-- 금액: 단가 + 소계 -->
            <div class="flex items-center justify-end gap-4 px-5 py-3 mt-1">
                ${item.unitPrice ? `
                <span class="text-sm text-gray-500">단가 ${formatCurrency(item.unitPrice)}</span>` : ''}
                ${item.subtotal ? `
                <span class="text-xl font-bold text-gray-800">${formatCurrency(item.subtotal)}</span>` : ''}
            </div>
        </div>`;
    }).join('')

    // 아이템이 여러 개면 전체 합계 표시
    + (hasMultiple ? `
        <div class="flex items-center justify-between px-5 py-3 mt-2 bg-gray-800 rounded-lg text-white">
            <span class="text-base font-medium">전체 ${items.length}건 / ${totalQty}벌</span>
            <span class="text-xl font-bold">${formatCurrency(totalAmount)}</span>
        </div>` : '');
}

/** 현재 상태 배지 렌더링 */
function renderCurrentStatusBadge(status) {
    const badge = document.getElementById('current-status-badge');
    const label = STATUS_LABELS[status] || status || '알 수 없음';

    // 상태 그룹별 색상
    const designStatuses = ['design_requested', 'draft_done', 'revision', 'design_confirmed'];
    const productionStatuses = ['payment_pending', 'payment_done', 'grading', 'line_work', 'in_production', 'production_done'];
    const shippingStatuses = ['released', 'shipped'];

    let bgColor = 'bg-gray-100 text-gray-700';
    if (designStatuses.includes(status)) bgColor = 'bg-blue-100 text-blue-800';
    else if (productionStatuses.includes(status)) bgColor = 'bg-amber-100 text-amber-800';
    else if (shippingStatuses.includes(status)) bgColor = 'bg-green-100 text-green-800';
    else if (status === 'hold') bgColor = 'bg-orange-100 text-orange-700';
    else if (status === 'cancelled') bgColor = 'bg-red-100 text-red-700';

    badge.className = `text-sm font-medium px-3 py-1 rounded-full ${bgColor}`;
    badge.textContent = label;
}

// ============================================================
// 상태 변경 이력 타임라인
// ============================================================
function renderHistory() {
    const container = document.getElementById('history-timeline');

    if (currentHistory.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400">상태 변경 이력이 없습니다.</p>';
        return;
    }

    // 비유: 택배 추적처럼 시간순으로 이벤트를 나열
    container.innerHTML = currentHistory.map((entry, idx) => {
        const fromLabel = STATUS_LABELS[entry.fromStatus] || entry.fromStatus;
        const toLabel = STATUS_LABELS[entry.toStatus] || entry.toStatus;
        const date = entry.createdAt ? formatDateTime(entry.createdAt) : '';
        const isLast = idx === currentHistory.length - 1;

        return `
            <div class="relative pl-6 pb-6">
                <div class="timeline-dot"></div>
                ${!isLast ? '<div class="timeline-line"></div>' : ''}
                <div>
                    <p class="text-sm font-medium">${fromLabel} → ${toLabel}</p>
                    <p class="text-xs text-gray-500 mt-0.5">${date} | ${escapeHtml(entry.changedBy || '')}</p>
                    ${entry.memo ? `<p class="text-xs text-gray-600 mt-1 bg-gray-50 rounded px-2 py-1">${escapeHtml(entry.memo)}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// 빠른 상태 변경 버튼 (사이드바)
// ============================================================
function renderQuickStatusButtons() {
    const container = document.getElementById('quick-status-buttons');
    const currentIdx = STATUS_FLOW.indexOf(currentOrder.status);

    // 현재 상태의 다음 2개 상태를 빠른 변경 버튼으로 표시
    // 비유: 택배 상태에서 "다음 단계로 이동" 버튼
    const nextStatuses = [];
    if (currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1) {
        nextStatuses.push(STATUS_FLOW[currentIdx + 1]);
        if (currentIdx + 2 < STATUS_FLOW.length) {
            nextStatuses.push(STATUS_FLOW[currentIdx + 2]);
        }
    }

    if (nextStatuses.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400">최종 상태입니다.</p>';
        return;
    }

    container.innerHTML = nextStatuses.map(status => `
        <button onclick="quickStatusChange('${status}')"
            class="w-full text-left px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between">
            <span>${STATUS_LABELS[status]}</span>
            <span class="material-symbols-outlined text-base text-gray-400">arrow_forward</span>
        </button>
    `).join('');
}

/** 빠른 상태 변경 (확인 후 바로 변경) */
async function quickStatusChange(newStatus) {
    const label = STATUS_LABELS[newStatus] || newStatus;
    if (!confirm(`상태를 "${label}"(으)로 변경하시겠습니까?`)) return;

    await changeStatus(newStatus, '');
}

// ============================================================
// 고객 연락 정보 렌더링
// ============================================================
function renderContactInfo() {
    const container = document.getElementById('contact-info');
    const customer = currentOrder.customer || {};

    container.innerHTML = `
        <p class="flex items-center space-x-2">
            <span class="material-symbols-outlined text-base text-gray-400">person</span>
            <span>${escapeHtml(customer.name || '-')}</span>
        </p>
        ${customer.phone ? `
        <p class="flex items-center space-x-2">
            <span class="material-symbols-outlined text-base text-gray-400">phone</span>
            <a href="tel:${customer.phone}" class="text-blue-600 hover:underline">${escapeHtml(customer.phone)}</a>
        </p>` : ''}
        ${customer.email ? `
        <p class="flex items-center space-x-2">
            <span class="material-symbols-outlined text-base text-gray-400">mail</span>
            <a href="mailto:${customer.email}" class="text-blue-600 hover:underline text-xs">${escapeHtml(customer.email)}</a>
        </p>` : ''}
    `;
}

// ============================================================
// 탭 전환
// ============================================================
function switchTab(tabName) {
    currentTab = tabName;

    // 모든 탭 콘텐츠 숨기기
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    // 선택한 탭 콘텐츠 표시
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.remove('hidden');

    // 탭 버튼 활성 상태 전환
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // 클릭된 버튼에 active 클래스 추가
    event.target.classList.add('active');
}

// ============================================================
// 편집 모드
// ============================================================

/**
 * 편집 모드 토글
 * 보기 모드 ↔ 편집 모드를 전환한다
 * 비유: Google Sheets에서 셀을 더블클릭해서 편집 가능한 상태로 바꾸는 것
 */
function toggleEditMode() {
    isEditMode = !isEditMode;

    const editBtn = document.getElementById('edit-toggle-btn');
    const editActions = document.getElementById('edit-actions');

    if (isEditMode) {
        // 편집 모드 활성화: 텍스트 필드를 입력 필드로 변환
        editBtn.innerHTML = '<span class="material-symbols-outlined text-base">edit_off</span><span>편집 취소</span>';
        editActions.classList.remove('hidden');
        convertToEditFields();
    } else {
        // 편집 모드 비활성화: 원래 값으로 복원
        editBtn.innerHTML = '<span class="material-symbols-outlined text-base">edit</span><span>편집</span>';
        editActions.classList.add('hidden');
        fillFieldValues();
    }
}

/** 편집 취소 */
function cancelEdit() {
    isEditMode = false;
    document.getElementById('edit-toggle-btn').innerHTML = '<span class="material-symbols-outlined text-base">edit</span><span>편집</span>';
    document.getElementById('edit-actions').classList.add('hidden');
    fillFieldValues();
}

/**
 * 텍스트 표시를 입력 필드로 변환
 * data-field 속성의 값을 input의 name으로 사용
 */
function convertToEditFields() {
    const order = currentOrder;
    // 편집 가능한 필드 목록 (읽기 전용 필드는 제외)
    const editableFields = [
        'customer.name', 'customer.teamName', 'customer.email', 'customer.phone', 'customer.dealType',
        'groupId', 'store', 'revenueType', 'memo',
        'design.status', 'design.revisionCount', 'design.designer', 'design.orderSheetUrl', 'design.designFileUrl',
        'production.status', 'production.factory',
        'shipping.address', 'shipping.desiredDate', 'shipping.releaseDate', 'shipping.shippedDate',
        'shipping.carrier', 'shipping.trackingNumber',
        'payment.totalAmount', 'payment.unitPrice', 'payment.quantity', 'payment.paidDate',
        'payment.paymentType', 'payment.transactionMethod', 'payment.quoteUrl',
        'manager'
    ];

    const fields = document.querySelectorAll('[data-field]');
    fields.forEach(el => {
        const fieldPath = el.getAttribute('data-field');

        // 편집 가능한 필드만 입력 필드로 변환
        if (!editableFields.includes(fieldPath)) return;

        const value = getNestedValue(order, fieldPath);
        const displayValue = (value === null || value === undefined) ? '' : String(value);

        el.innerHTML = `<input type="text" class="edit-input" data-edit-field="${fieldPath}" value="${escapeHtml(displayValue)}">`;
    });
}

/** 편집 내용 저장 (PUT API 호출) */
async function saveChanges() {
    const inputs = document.querySelectorAll('[data-edit-field]');
    const updates = {};

    // 입력된 값들을 객체로 구성
    // 비유: 수정한 양식의 내용을 모아서 서버에 제출하는 것
    inputs.forEach(input => {
        const fieldPath = input.getAttribute('data-edit-field');
        const value = input.value.trim();
        setNestedValue(updates, fieldPath, value);
    });

    try {
        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            alert('저장되었습니다.');
            // 수정된 데이터로 화면 갱신
            currentOrder = data.order;
            isEditMode = false;
            document.getElementById('edit-toggle-btn').innerHTML = '<span class="material-symbols-outlined text-base">edit</span><span>편집</span>';
            document.getElementById('edit-actions').classList.add('hidden');
            renderOrderDetail();
        } else {
            alert('저장 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[AdminOrder] 저장 실패:', error);
        alert('저장 중 오류가 발생했습니다.');
    }
}

// ============================================================
// 상태 변경 모달
// ============================================================

/** 상태 변경 모달 열기 */
function openStatusModal() {
    const modal = document.getElementById('status-modal');
    const currentLabel = STATUS_LABELS[currentOrder.status] || currentOrder.status;
    document.getElementById('modal-current-status').textContent = currentLabel;

    // 가능한 상태 목록을 select에 채우기
    const select = document.getElementById('modal-new-status');
    select.innerHTML = '';
    STATUS_FLOW.forEach(status => {
        // 현재 상태는 제외
        if (status === currentOrder.status) return;
        const option = document.createElement('option');
        option.value = status;
        option.textContent = STATUS_LABELS[status];
        select.appendChild(option);
    });

    // 다음 상태를 기본 선택
    const currentIdx = STATUS_FLOW.indexOf(currentOrder.status);
    if (currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1) {
        select.value = STATUS_FLOW[currentIdx + 1];
    }

    document.getElementById('modal-memo').value = '';
    modal.classList.remove('hidden');
}

/** 상태 변경 모달 닫기 */
function closeStatusModal() {
    document.getElementById('status-modal').classList.add('hidden');
}

/** 상태 변경 확인 */
async function confirmStatusChange() {
    const newStatus = document.getElementById('modal-new-status').value;
    const memo = document.getElementById('modal-memo').value.trim();

    if (!newStatus) {
        alert('변경할 상태를 선택해주세요.');
        return;
    }

    await changeStatus(newStatus, memo);
    closeStatusModal();
}

/**
 * 상태 변경 API 호출
 * PATCH /api/admin/orders/:id/status
 */
async function changeStatus(newStatus, memo) {
    try {
        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus, memo })
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            alert(`상태가 "${STATUS_LABELS[newStatus]}"(으)로 변경되었습니다.`);
            // 화면 전체 새로고침 (이력도 업데이트 필요)
            loadOrderDetail(currentOrder.id);
        } else {
            alert('상태 변경 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[AdminOrder] 상태 변경 실패:', error);
        alert('상태 변경 중 오류가 발생했습니다.');
    }
}

// ============================================================
// 주문 복제 (재주문)
// 비유: 지난번 주문서를 복사기에 넣고 새 주문서로 만드는 것
// 고객/아이템은 그대로, 상태/결제는 처음부터 시작
// ============================================================
async function duplicateOrder() {
    if (!currentOrder) return;

    // 복제 전 확인 — 실수로 누르는 것을 방지
    const customerName = currentOrder.customer?.name || '고객';
    const orderNum = currentOrder.orderNumber || '';
    if (!confirm(`이 주문을 복제하시겠습니까?\n\n원본: ${orderNum} (${customerName})\n\n복제된 주문은 "시안 요청" 상태로 새로 생성됩니다.`)) {
        return;
    }

    try {
        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}/duplicate`, {
            method: 'POST'
        });

        if (!res) return;
        const data = await res.json();

        if (data.success && data.order) {
            alert(data.message || '주문이 복제되었습니다.');
            // 새로 생성된 주문의 상세 페이지로 이동
            window.location.href = `admin-order.html?id=${data.order.id}`;
        } else {
            alert('주문 복제 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[AdminOrder] 주문 복제 실패:', error);
        alert('주문 복제 중 오류가 발생했습니다.');
    }
}

// ============================================================
// 알림 발송
// ============================================================
async function sendNotification() {
    const message = prompt('고객에게 보낼 메시지를 입력하세요:');
    if (!message) return;

    try {
        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}/notify`, {
            method: 'POST',
            body: JSON.stringify({ type: 'custom', message })
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            alert('알림이 기록되었습니다.\n(실제 발송은 Phase 4에서 구현 예정)');
        } else {
            alert('알림 발송 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[AdminOrder] 알림 발송 실패:', error);
        alert('알림 발송 중 오류가 발생했습니다.');
    }
}

// ============================================================
// UI 상태 전환
// ============================================================

function showError() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
}

// ============================================================
// 유틸리티 함수들
// ============================================================

/**
 * 중첩 객체에서 dot notation 경로로 값 가져오기
 * 예: getNestedValue(order, 'customer.name') → order.customer.name
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((curr, key) => {
        return curr && curr[key] !== undefined ? curr[key] : null;
    }, obj);
}

/**
 * 중첩 객체에 dot notation 경로로 값 설정하기
 * 예: setNestedValue(obj, 'customer.name', '홍길동')
 *     → obj.customer.name = '홍길동'
 */
function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let curr = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        if (!curr[keys[i]]) curr[keys[i]] = {};
        curr = curr[keys[i]];
    }

    // 숫자로 변환 가능한 필드는 숫자로 저장
    const lastKey = keys[keys.length - 1];
    const numericFields = ['totalAmount', 'unitPrice', 'quantity', 'revisionCount'];
    if (numericFields.includes(lastKey) && value !== '' && !isNaN(value)) {
        curr[lastKey] = Number(value);
    } else {
        curr[lastKey] = value;
    }
}

/** 금액 포맷 (예: 675,000원) */
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return Number(amount).toLocaleString('ko-KR') + '원';
}

/** 날짜+시간 포맷 (예: 2026-03-26 14:30) */
function formatDateTime(dateString) {
    const d = new Date(dateString);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}

/** HTML 특수문자 이스케이프 (XSS 방지) */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// 입금 확인 기능 (미수금 관리)
// ============================================================

/**
 * 금융 탭 하단에 입금 확인 버튼 또는 완료 표시를 렌더링
 * 비유: 외상 장부에 "입금 확인" 도장을 찍거나, 이미 찍힌 도장을 보여주는 것
 *
 * - paidDate가 없는 경우: "입금 확인" 버튼 + 입금액 입력 폼
 * - paidDate가 있는 경우: "입금 완료 (날짜)" 표시
 */
function renderPaymentConfirmSection() {
    const section = document.getElementById('payment-confirm-section');
    if (!section || !currentOrder) return;

    const payment = currentOrder.payment || {};
    const totalAmount = payment.totalAmount || 0;

    // 이미 입금된 주문: 완료 표시
    if (payment.paidDate) {
        const paidDateStr = payment.paidDate.includes('T')
            ? payment.paidDate.split('T')[0]   // ISO 형식이면 날짜만 추출
            : payment.paidDate;
        const paidAmt = payment.paidAmount || totalAmount;
        section.innerHTML = `
            <div class="flex items-center space-x-2 text-green-700 bg-green-50 rounded-lg px-4 py-3">
                <span class="material-symbols-outlined">check_circle</span>
                <div>
                    <p class="font-medium text-sm">입금 완료 (${escapeHtml(paidDateStr)})</p>
                    <p class="text-xs text-green-600 mt-0.5">입금액: ${formatCurrency(paidAmt)}</p>
                    ${payment.paymentNote ? `<p class="text-xs text-green-600 mt-0.5">메모: ${escapeHtml(payment.paymentNote)}</p>` : ''}
                </div>
            </div>
        `;
        return;
    }

    // 금액이 없거나 취소된 주문: 입금 확인 불필요
    if (totalAmount <= 0 || currentOrder.status === 'cancelled') {
        section.innerHTML = '';
        return;
    }

    // 미수금 주문: 입금 확인 버튼 + 입력 폼
    section.innerHTML = `
        <div class="bg-orange-50 rounded-lg px-4 py-3 border border-orange-200">
            <p class="text-sm font-medium text-orange-700 mb-3 flex items-center">
                <span class="material-symbols-outlined mr-1 text-base">warning</span>
                미수금: ${formatCurrency(totalAmount)}
            </p>
            <!-- 입금 확인 폼: 날짜(기본 오늘) + 금액(기본 전체금액) + 메모 -->
            <div id="payment-confirm-form" class="space-y-2">
                <div class="flex flex-wrap gap-2 items-end">
                    <div>
                        <label class="text-xs text-gray-500 block mb-1">입금일</label>
                        <input type="date" id="confirm-paid-date" value="${new Date().toISOString().split('T')[0]}"
                            class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    </div>
                    <div>
                        <label class="text-xs text-gray-500 block mb-1">입금액</label>
                        <input type="number" id="confirm-paid-amount" value="${totalAmount}" min="0"
                            class="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    </div>
                    <div class="flex-1 min-w-[150px]">
                        <label class="text-xs text-gray-500 block mb-1">메모 (선택)</label>
                        <input type="text" id="confirm-payment-note" placeholder="입금 메모..."
                            class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    </div>
                </div>
                <button onclick="confirmPayment()"
                    class="mt-2 bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center space-x-1">
                    <span class="material-symbols-outlined text-base">account_balance_wallet</span>
                    <span>입금 확인</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * 입금 확인 API 호출
 * PATCH /api/admin/orders/:id/payment
 * 비유: 외상 장부에 "입금 완료" 도장을 찍고 서버에 저장하는 것
 */
async function confirmPayment() {
    const paidDate = document.getElementById('confirm-paid-date').value;
    const paidAmount = document.getElementById('confirm-paid-amount').value;
    const paymentNote = document.getElementById('confirm-payment-note').value.trim();

    if (!paidDate) {
        alert('입금일을 선택해주세요.');
        return;
    }

    const totalAmount = currentOrder.payment?.totalAmount || 0;
    const label = formatCurrency(parseInt(paidAmount) || totalAmount);

    if (!confirm(`입금 확인 처리하시겠습니까?\n\n입금일: ${paidDate}\n입금액: ${label}`)) return;

    try {
        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}/payment`, {
            method: 'PATCH',
            body: JSON.stringify({
                paidDate,
                paidAmount: parseInt(paidAmount) || totalAmount,
                paymentNote
            })
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            alert('입금 확인이 완료되었습니다.');
            // 업데이트된 데이터로 화면 갱신
            currentOrder = data.order;
            renderOrderDetail();
        } else {
            alert('입금 확인 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[AdminOrder] 입금 확인 실패:', error);
        alert('입금 확인 중 오류가 발생했습니다.');
    }
}

// ============================================================
// 코멘트 시스템 (주문별 타임라인형 메모)
// 비유: 주문 폴더에 포스트잇을 붙이고, 시간순으로 쌓이는 메모장
// ============================================================

/** 현재 주문의 코멘트 목록을 서버에서 불러온다 */
async function loadComments(orderId) {
    try {
        const res = await adminFetch(`/api/admin/orders/${orderId}/comments`);
        if (!res) return;

        const data = await res.json();
        if (data.success) {
            renderComments(data.comments || []);
        }
    } catch (error) {
        console.error('[AdminOrder] 코멘트 로드 실패:', error);
    }
}

/**
 * 새 코멘트를 등록한다
 * 담당자명은 JWT 토큰에서 자동 추출 (서버에서도 fallback 처리)
 */
async function addComment() {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();

    // 빈 코멘트 방지
    if (!text) {
        alert('코멘트 내용을 입력해주세요.');
        return;
    }

    // JWT에서 현재 로그인한 관리자 이름 추출
    let authorName = '관리자';
    try {
        const token = getAdminToken();
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            authorName = payload.name || '관리자';
        }
    } catch (e) { /* fallback: '관리자' */ }

    try {
        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ text, author: authorName })
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            // 입력 필드 초기화 후 목록 새로고침
            input.value = '';
            loadComments(currentOrder.id);
        } else {
            alert('코멘트 등록 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[AdminOrder] 코멘트 추가 실패:', error);
        alert('코멘트 등록 중 오류가 발생했습니다.');
    }
}

/**
 * 코멘트 목록을 타임라인 형태로 렌더링 (최신이 위)
 * 각 코멘트: 작성자 + 시간 + 내용
 */
function renderComments(comments) {
    const container = document.getElementById('comments-list');

    if (!comments || comments.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400">코멘트가 없습니다.</p>';
        return;
    }

    container.innerHTML = comments.map(comment => {
        // 시간 표시: 오늘이면 시:분만, 아니면 날짜+시간
        const dateStr = comment.createdAt ? formatCommentDate(comment.createdAt) : '';

        return `
            <div class="border-l-2 border-gray-200 pl-3 py-1">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-semibold text-gray-700">${escapeHtml(comment.author || '관리자')}</span>
                    <span class="text-xs text-gray-400">${dateStr}</span>
                </div>
                <p class="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">${escapeHtml(comment.text)}</p>
            </div>
        `;
    }).join('');
}

/**
 * 코멘트 날짜 포맷: 오늘이면 "14:30", 올해면 "3/26 14:30", 다른 해면 "2025-03-26"
 * 비유: 카카오톡 채팅방 시간 표시처럼 최근일수록 간략하게
 */
function formatCommentDate(dateString) {
    const d = new Date(dateString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isSameYear = d.getFullYear() === now.getFullYear();

    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');

    if (isToday) return `${h}:${min}`;
    if (isSameYear) return `${d.getMonth() + 1}/${d.getDate()} ${h}:${min}`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 로그아웃 */
function handleLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    localStorage.removeItem('stiz_admin_token');
    window.location.href = 'admin-login.html';
}
