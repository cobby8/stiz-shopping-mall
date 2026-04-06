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
// 상수 정의 (공통 상수는 admin-common.js에서 로드)
// ============================================================

// 12단계 상태 흐름 (순서대로) — 주문 상세 페이지 고유
// 정상 진행 흐름 + 특수 상태(보류/취소)
const STATUS_FLOW = [
    'consult_started', 'design_requested', 'draft_done', 'revision', 'design_confirmed',
    'order_received', 'payment_completed',
    'work_instruction_pending', 'work_instruction_sent', 'work_instruction_received',
    'in_production', 'production_done', 'factory_released', 'warehouse_received',
    'released', 'shipped', 'delivered',
    'hold', 'cancelled'
];

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
let currentDetailPreset = null;

const ORDER_DETAIL_PRESETS = {
    all: {
        requiredScope: null,
        defaultTab: 'customer',
        tabs: ['customer', 'design', 'production', 'shipping', 'payment', 'history'],
        fields: null,
        showQuickStatus: true,
        showContact: true,
        showComments: true,
        showTags: true,
        showEdit: true,
        showPaymentConfirm: true,
        showDesignPreview: true,
        showOrderSheetPreview: true
    },
    design: {
        requiredScope: 'design',
        defaultTab: 'design',
        tabs: ['customer', 'design', 'history'],
        fields: [
            'customer.name', 'customer.teamName', 'customer.phone', 'customer.dealType', 'memo',
            'design.status', 'design.revisionCount', 'design.designer', 'design.orderSheetUrl', 'design.designFileUrl'
        ],
        showQuickStatus: true,
        showContact: false,
        showComments: true,
        showTags: true,
        showEdit: true,
        showPaymentConfirm: false,
        showDesignPreview: true,
        showOrderSheetPreview: true
    },
    cs: {
        requiredScope: 'cs',
        defaultTab: 'customer',
        tabs: ['customer', 'payment', 'history'],
        fields: [
            'customer.name', 'customer.teamName', 'customer.email', 'customer.phone', 'customer.dealType',
            'groupId', 'store', 'revenueType', 'memo',
            'payment.totalAmount', 'payment.unitPrice', 'payment.quantity', 'payment.paidDate',
            'payment.paymentType', 'payment.transactionMethod', 'payment.quoteUrl',
            'workInstruction.status', 'workInstruction.sentAt', 'workInstruction.sentBy', 'workInstruction.url', 'workInstruction.note'
        ],
        showQuickStatus: true,
        showContact: true,
        showComments: true,
        showTags: true,
        showEdit: true,
        showPaymentConfirm: true,
        showDesignPreview: false,
        showOrderSheetPreview: true
    },
    production: {
        requiredScope: 'production',
        defaultTab: 'production',
        tabs: ['customer', 'production', 'shipping', 'history'],
        fields: [
            'customer.name', 'customer.teamName', 'customer.phone', 'memo',
            'production.status', 'production.factory', 'production.gradingDone',
            'workInstruction.status', 'workInstruction.sentAt', 'workInstruction.receivedAt', 'workInstruction.sentBy', 'workInstruction.url', 'workInstruction.note',
            'shipping.address', 'shipping.desiredDate', 'shipping.releaseDate', 'shipping.shippedDate', 'shipping.carrier', 'shipping.trackingNumber'
        ],
        showQuickStatus: true,
        showContact: false,
        showComments: true,
        showTags: true,
        showEdit: true,
        showPaymentConfirm: false,
        showDesignPreview: false,
        showOrderSheetPreview: false
    },
    // 출고 파트 프리셋 (4파트 재구성으로 신규 추가)
    // 배송/물류 정보에 집중하는 뷰
    shipping: {
        requiredScope: 'shipping',
        defaultTab: 'shipping',
        tabs: ['customer', 'shipping', 'history'],
        fields: [
            'customer.name', 'customer.teamName', 'customer.phone', 'memo',
            'shipping.address', 'shipping.desiredDate', 'shipping.releaseDate',
            'shipping.shippedDate', 'shipping.carrier', 'shipping.trackingNumber'
        ],
        showQuickStatus: true,
        showContact: true,
        showComments: true,
        showTags: false,
        showEdit: true,
        showPaymentConfirm: false,
        showDesignPreview: false,
        showOrderSheetPreview: false
    }
};

function getCurrentDetailView() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view && ORDER_DETAIL_PRESETS[view]) return view;

    if (hasAdminScope('design') && !hasAdminScope('cs') && !hasAdminScope('production')) return 'design';
    if (hasAdminScope('cs') && !hasAdminScope('design') && !hasAdminScope('production')) return 'cs';
    if (hasAdminScope('production') && !hasAdminScope('design') && !hasAdminScope('cs') && !hasAdminScope('shipping')) return 'production';
    if (hasAdminScope('shipping') && !hasAdminScope('design') && !hasAdminScope('cs') && !hasAdminScope('production')) return 'shipping';
    return 'all';
}

function setDetailElementVisibility(id, visible) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
}

function updateOrderListLink() {
    const link = document.getElementById('order-list-link');
    if (!link) return;

    const view = getCurrentDetailView();
    link.href = view === 'all' ? 'admin.html' : `admin.html?view=${view}`;
}

function getCurrentOrderViewQuery() {
    const view = getCurrentDetailView();
    return view === 'all' ? '' : `&view=${view}`;
}

function applyDetailPreset() {
    const view = getCurrentDetailView();
    currentDetailPreset = ORDER_DETAIL_PRESETS[view] || ORDER_DETAIL_PRESETS.all;

    if (currentDetailPreset.requiredScope && !hasAdminScope(currentDetailPreset.requiredScope)) {
        alert('해당 파트 주문 상세에 접근할 권한이 없습니다.');
        redirectToDefaultAdminPage();
        return false;
    }

    updateOrderListLink();

    document.querySelectorAll('[data-tab]').forEach(btn => {
        const tab = btn.getAttribute('data-tab');
        btn.classList.toggle('hidden', !currentDetailPreset.tabs.includes(tab));
    });

    setDetailElementVisibility('quick-status-card', currentDetailPreset.showQuickStatus);
    setDetailElementVisibility('contact-card', currentDetailPreset.showContact);
    setDetailElementVisibility('comments-card', currentDetailPreset.showComments);
    setDetailElementVisibility('tags-section', currentDetailPreset.showTags);
    setDetailElementVisibility('edit-toggle-btn', currentDetailPreset.showEdit);
    setDetailElementVisibility('payment-confirm-section', currentDetailPreset.showPaymentConfirm);
    setDetailElementVisibility('design-preview-section', currentDetailPreset.showDesignPreview);
    setDetailElementVisibility('ordersheet-preview-section', currentDetailPreset.showOrderSheetPreview);

    currentTab = currentDetailPreset.defaultTab;
    return true;
}

function applyFieldVisibilityPreset() {
    const allowedFields = currentDetailPreset?.fields;
    if (!allowedFields) return;

    const allowed = new Set(allowedFields);
    document.querySelectorAll('[data-field]').forEach(el => {
        const fieldPath = el.getAttribute('data-field');
        const wrapper = el.closest('div');
        if (!wrapper) return;
        wrapper.classList.toggle('hidden', !allowed.has(fieldPath));
    });
}

// ============================================================
// 초기화
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 관리자 인증 확인
    checkAdminAuth();
    if (!applyDetailPreset()) return;
    // URL에서 주문 ID 추출 후 데이터 로드
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');

    if (!orderId) {
        showError();
        return;
    }

    loadOrderDetail(orderId);
});

// 인증/API 함수는 admin-common.js에서 로드 (checkAdminAuth, getAdminToken, adminFetch)

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
        if (currentDetailPreset.showQuickStatus) {
            renderQuickStatusButtons();
        }
        if (currentDetailPreset.showContact) {
            renderContactInfo();
        }
        if (currentDetailPreset.showComments) {
            loadComments(currentOrder.id);  // 코멘트 타임라인 로드
        }

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
    document.getElementById('timeline-consult-started').textContent = order.createdAt ? formatDateTime(order.createdAt) : '-';

    // 시안요청일 — 값이 있을 때만 표시
    toggleTimelineDate('date-design-request', 'current-design-request-date', order.designRequestDate);

    // 접수일(매출기준일) — 값이 있을 때만 표시
    toggleTimelineDate('date-order-receipt', 'current-order-receipt-date', order.orderReceiptDate);
    toggleTimelineDate('date-payment-completed', 'current-payment-completed-date', order.payment?.paidDate);
    toggleTimelineDate('date-workinstruction-sent', 'current-workinstruction-sent-date', order.workInstruction?.sentAt);
    toggleTimelineDate('date-workinstruction-received', 'current-workinstruction-received-date', order.workInstruction?.receivedAt);

    // 각 탭의 data-field 요소에 값 채우기
    // 비유: 양식 문서의 빈칸에 데이터를 적어넣는 것
    fillFieldValues();
    applyFieldVisibilityPreset();

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
    if (currentDetailPreset.showPaymentConfirm) {
        renderPaymentConfirmSection();
    }

    // 태그(라벨) 영역 렌더링 — 프리셋 + 커스텀 태그 표시
    if (currentDetailPreset.showTags) {
        renderTags();
    }

    // 시안/주문서 미리보기 렌더링
    if (currentDetailPreset.showDesignPreview) {
        renderDesignPreview();
    }
    if (currentDetailPreset.showOrderSheetPreview) {
        renderOrderSheetPreview();
    }

    switchTab(currentTab);
}

function toggleTimelineDate(wrapperId, valueId, value) {
    const wrapper = document.getElementById(wrapperId);
    const valueEl = document.getElementById(valueId);
    if (!wrapper || !valueEl) return;

    if (value) {
        valueEl.textContent = formatDateTime(value);
        wrapper.classList.remove('hidden');
    } else {
        valueEl.textContent = '-';
        wrapper.classList.add('hidden');
    }
}

// ============================================================
// 시안 미리보기 기능
// URL이 이미지 확장자(.png, .jpg 등)면 미리보기를 표시한다
// 이미지가 아닌 URL이면 링크만 표시, URL이 없으면 "미등록" 안내
// ============================================================

/** 이미지 URL인지 확인하는 정규식 패턴 */
const IMAGE_URL_PATTERN = /\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?.*)?$/i;

/**
 * 시안 파일 URL의 미리보기를 렌더링한다
 * - 이미지 URL → 썸네일 미리보기 (클릭 시 새 탭에서 원본 열기)
 * - 비이미지 URL → 외부 링크 버튼
 * - URL 없음 → "시안 미등록" 안내
 */
function renderDesignPreview() {
    const container = document.getElementById('design-preview-content');
    if (!container) return;

    const url = currentOrder?.design?.designFileUrl;

    // URL이 없는 경우: 미등록 안내
    if (!url || url.trim() === '') {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">hide_image</span>
                <p class="text-sm">시안 미등록</p>
                <p class="text-xs mt-1">편집 모드에서 시안 파일 링크를 입력하세요</p>
            </div>
        `;
        return;
    }

    // 이미지 URL인 경우: 미리보기 표시
    if (IMAGE_URL_PATTERN.test(url)) {
        container.innerHTML = `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="클릭하면 원본 이미지를 새 탭에서 엽니다">
                <img
                    id="design-preview-img"
                    src="${escapeHtml(url)}"
                    alt="시안 미리보기"
                    class="max-w-full max-h-96 rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onerror="handleDesignImgError(this)"
                />
            </a>
            <p class="text-xs text-gray-400 mt-2">이미지를 클릭하면 새 탭에서 원본을 볼 수 있습니다</p>
        `;
        return;
    }

    // 이미지가 아닌 URL인 경우: 외부 링크 버튼
    container.innerHTML = `
        <div class="flex items-center gap-3 py-4">
            <span class="material-symbols-outlined text-2xl text-gray-400">link</span>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
               class="text-blue-600 hover:underline text-sm break-all">
                ${escapeHtml(url)}
            </a>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
               class="ml-auto px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors whitespace-nowrap">
                열기
            </a>
        </div>
    `;
}

/**
 * 주문서 URL의 미리보기를 렌더링한다
 * 주문서 링크가 이미지면 미리보기, 아니면 링크만 표시
 */
function renderOrderSheetPreview() {
    const section = document.getElementById('ordersheet-preview-section');
    const container = document.getElementById('ordersheet-preview-content');
    if (!section || !container) return;

    const url = currentOrder?.design?.orderSheetUrl;

    // URL이 없으면 섹션 자체를 숨김
    if (!url || url.trim() === '') {
        section.classList.add('hidden');
        return;
    }

    // URL이 있으면 섹션 표시
    section.classList.remove('hidden');

    // 이미지 URL인 경우: 미리보기
    if (IMAGE_URL_PATTERN.test(url)) {
        container.innerHTML = `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="클릭하면 원본을 새 탭에서 엽니다">
                <img
                    src="${escapeHtml(url)}"
                    alt="주문서 미리보기"
                    class="max-w-full max-h-96 rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onerror="handleDesignImgError(this)"
                />
            </a>
            <p class="text-xs text-gray-400 mt-2">이미지를 클릭하면 새 탭에서 원본을 볼 수 있습니다</p>
        `;
        return;
    }

    // 비이미지 URL: 링크 버튼
    container.innerHTML = `
        <div class="flex items-center gap-3 py-4">
            <span class="material-symbols-outlined text-2xl text-gray-400">description</span>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
               class="text-blue-600 hover:underline text-sm break-all">
                ${escapeHtml(url)}
            </a>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
               class="ml-auto px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors whitespace-nowrap">
                열기
            </a>
        </div>
    `;
}

/**
 * 이미지 로드 실패 시 에러 처리
 * 깨진 이미지 대신 안내 메시지를 표시한다
 */
function handleDesignImgError(imgEl) {
    const parent = imgEl.parentElement.parentElement;
    parent.innerHTML = `
        <div class="flex flex-col items-center justify-center py-6 text-gray-400 border border-dashed border-gray-200 rounded-lg">
            <span class="material-symbols-outlined text-3xl mb-2">broken_image</span>
            <p class="text-sm">이미지를 불러올 수 없습니다</p>
            <a href="${escapeHtml(imgEl.src)}" target="_blank" rel="noopener noreferrer"
               class="text-blue-600 hover:underline text-xs mt-2">
                링크 직접 열기
            </a>
        </div>
    `;
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
        if (fieldPath === 'payment.totalAmount' || fieldPath === 'payment.unitPrice' || fieldPath === 'payment.costPerUnit' || fieldPath === 'payment.totalCost') {
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
        } else if (fieldPath === 'workInstruction.status') {
            value = STATUS_LABELS[value] || value || '-';
        } else if (['workInstruction.sentAt', 'workInstruction.receivedAt', 'payment.paidDate', 'shipping.desiredDate', 'shipping.releaseDate', 'shipping.shippedDate'].includes(fieldPath)) {
            value = value ? formatDateTime(value) : '-';
        } else {
            // URL 필드는 링크로 표시
            if (fieldPath.includes('Url') && value && value.startsWith('http')) {
                el.innerHTML = `<a href="${escapeHtml(value)}" target="_blank" class="text-blue-600 hover:underline text-sm">${escapeHtml(value)}</a>`;
                return;
            }
            if (fieldPath === 'workInstruction.url' && value && value.startsWith('http')) {
                el.innerHTML = `<a href="${escapeHtml(value)}" target="_blank" class="text-blue-600 hover:underline text-sm">${escapeHtml(value)}</a>`;
                return;
            }
            value = value || '-';
        }

        el.textContent = value;
    });

    // --- 원가/마진 자동 계산 표시 ---
    // 비유: 매출에서 원가를 빼면 마진, 마진을 매출로 나누면 마진율
    updateMarginDisplay(order);
}

/**
 * 마진 표시 갱신 (읽기 모드 + 편집 모드 공용)
 * @param {object} order - 현재 주문 데이터
 * @param {number} [overrideCost] - 편집 중일 때 입력된 총원가 (optional)
 */
function updateMarginDisplay(order, overrideCost) {
    const totalAmount = order.payment?.totalAmount || order.total || 0;
    const totalCost = overrideCost !== undefined ? overrideCost : (order.payment?.totalCost || 0);

    const marginEl = document.getElementById('calc-margin');
    const marginRateEl = document.getElementById('calc-margin-rate');
    if (!marginEl || !marginRateEl) return;

    // 원가 미입력(0)이면 "미입력" 표시
    if (!totalCost && overrideCost === undefined && !order.payment?.costPerUnit) {
        marginEl.textContent = '-';
        marginRateEl.textContent = '원가 미입력';
        marginRateEl.className = 'field-value text-gray-400 text-sm';
        return;
    }

    const margin = totalAmount - totalCost;
    const marginRate = totalAmount > 0 ? Math.round((margin / totalAmount) * 1000) / 10 : 0;

    marginEl.textContent = formatCurrency(margin);

    // 마진율에 따라 색상 배지 적용: >=30% 초록, 15~29% 주황, <15% 빨강
    let colorClass = 'text-red-600';        // <15%
    if (marginRate >= 30) colorClass = 'text-green-600';
    else if (marginRate >= 15) colorClass = 'text-amber-600';

    marginRateEl.textContent = marginRate + '%';
    marginRateEl.className = `field-value font-bold ${colorClass}`;
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
    const designStatuses = ['consult_started', 'design_requested', 'draft_done', 'revision', 'design_confirmed'];
    const productionStatuses = ['order_received', 'payment_completed', 'work_instruction_pending', 'work_instruction_sent', 'work_instruction_received', 'in_production', 'production_done', 'factory_released'];
    const shippingStatuses = ['warehouse_received', 'released', 'shipped'];

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
    if (currentDetailPreset && !currentDetailPreset.tabs.includes(tabName)) {
        return;
    }

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
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');
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
        'workInstruction.status', 'workInstruction.sentAt', 'workInstruction.receivedAt', 'workInstruction.sentBy', 'workInstruction.url', 'workInstruction.note',
        'shipping.address', 'shipping.desiredDate', 'shipping.releaseDate', 'shipping.shippedDate',
        'shipping.carrier', 'shipping.trackingNumber',
        'payment.totalAmount', 'payment.unitPrice', 'payment.quantity', 'payment.paidDate',
        'payment.paymentType', 'payment.transactionMethod', 'payment.quoteUrl',
        'payment.costPerUnit', 'payment.totalCost', 'payment.costNote',
        'manager'
    ];

    const fields = document.querySelectorAll('[data-field]');
    fields.forEach(el => {
        const fieldPath = el.getAttribute('data-field');

        // 편집 가능한 필드만 입력 필드로 변환
        if (!editableFields.includes(fieldPath)) return;

        const value = getNestedValue(order, fieldPath);
        let displayValue = (value === null || value === undefined) ? '' : String(value);
        if (['workInstruction.sentAt', 'workInstruction.receivedAt', 'payment.paidDate', 'shipping.desiredDate', 'shipping.releaseDate', 'shipping.shippedDate'].includes(fieldPath) && displayValue.includes('T')) {
            displayValue = displayValue.slice(0, 16);
        }

        if (fieldPath === 'workInstruction.status') {
            el.innerHTML = `
                <select class="edit-input" data-edit-field="${fieldPath}">
                    <option value="">선택 안 함</option>
                    <option value="work_instruction_pending" ${displayValue === 'work_instruction_pending' ? 'selected' : ''}>작업지시서 전송전</option>
                    <option value="work_instruction_sent" ${displayValue === 'work_instruction_sent' ? 'selected' : ''}>작업지시서 전송후</option>
                    <option value="work_instruction_received" ${displayValue === 'work_instruction_received' ? 'selected' : ''}>작업지시서 접수</option>
                </select>
            `;
            return;
        }

        if (fieldPath === 'workInstruction.note') {
            el.innerHTML = `<textarea class="edit-input" data-edit-field="${fieldPath}" rows="3">${escapeHtml(displayValue)}</textarea>`;
            return;
        }

        const inputType = ['workInstruction.sentAt', 'workInstruction.receivedAt'].includes(fieldPath)
            ? 'datetime-local'
            : 'text';

        el.innerHTML = `<input type="${inputType}" class="edit-input" data-edit-field="${fieldPath}" value="${escapeHtml(displayValue)}">`;
    });

    // --- 원가 입력 시 총원가/마진/마진율 실시간 자동 계산 ---
    // 비유: "벌당 원가"를 입력하면 수량을 곱해서 "총 원가"를 자동으로 채워주는 계산기
    const costPerUnitInput = document.querySelector('[data-edit-field="payment.costPerUnit"]');
    const totalCostInput = document.querySelector('[data-edit-field="payment.totalCost"]');

    if (costPerUnitInput && totalCostInput) {
        costPerUnitInput.addEventListener('input', () => {
            const costPerUnit = parseInt(costPerUnitInput.value) || 0;
            const quantity = order.payment?.quantity || order.items?.[0]?.quantity || 1;
            const calculatedTotalCost = costPerUnit * quantity;
            // 총원가 필드를 자동으로 채움 (사용자가 나중에 직접 수정도 가능)
            totalCostInput.value = calculatedTotalCost;
            // 마진 표시도 실시간 갱신
            updateMarginDisplay(order, calculatedTotalCost);
        });

        // totalCost 직접 입력 시에도 마진 갱신 (벌당 단가가 다를 때 총원가를 직접 입력)
        totalCostInput.addEventListener('input', () => {
            const totalCost = parseInt(totalCostInput.value) || 0;
            updateMarginDisplay(order, totalCost);
        });
    }
}

/** 편집 내용 저장 (PUT API 호출) */
async function saveChanges() {
    const inputs = document.querySelectorAll('[data-edit-field]');
    const updates = {};
    const workInstructionFlowStatuses = ['order_received', 'payment_completed', 'work_instruction_pending', 'work_instruction_sent', 'work_instruction_received'];

    // 입력된 값들을 객체로 구성
    // 비유: 수정한 양식의 내용을 모아서 서버에 제출하는 것
    inputs.forEach(input => {
        const fieldPath = input.getAttribute('data-edit-field');
        const value = input.value.trim();
        setNestedValue(updates, fieldPath, value);
    });

    // 원가 필드가 변경되었으면 costUpdatedAt 타임스탬프 자동 기록
    if (updates.payment?.costPerUnit || updates.payment?.totalCost) {
        if (!updates.payment) updates.payment = {};
        updates.payment.costUpdatedAt = new Date().toISOString();
    }

    // 작업지시서 상태를 수정하면 대표 상태도 같은 구간에서 함께 맞춘다.
    if (workInstructionFlowStatuses.includes(currentOrder.status)) {
        const workInstructionStatus = updates.workInstruction?.status || '';
        if (workInstructionStatus) {
            updates.status = workInstructionStatus;
        } else if (updates.workInstruction?.receivedAt) {
            updates.status = 'work_instruction_received';
        } else if (updates.workInstruction?.sentAt) {
            updates.status = 'work_instruction_sent';
        }
    }

    applyStatusDateDefaults(updates, updates.status || currentOrder.status);

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
        const updates = {};
        applyStatusDateDefaults(updates, newStatus);

        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus, memo, ...updates })
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

function applyStatusDateDefaults(updates, targetStatus) {
    const now = new Date().toISOString();
    const currentPayment = currentOrder?.payment || {};
    const currentWorkInstruction = currentOrder?.workInstruction || {};
    const targetIndex = STATUS_FLOW.indexOf(targetStatus);
    const hasReached = (status) => {
        const idx = STATUS_FLOW.indexOf(status);
        return idx !== -1 && targetIndex >= idx;
    };

    if (hasReached('order_received') && !currentOrder?.orderReceiptDate && !updates.orderReceiptDate) {
        updates.orderReceiptDate = now;
    }

    if (hasReached('payment_completed')) {
        if (!updates.payment) updates.payment = {};
        if (!currentPayment.paidDate && !updates.payment.paidDate) {
            updates.payment.paidDate = now;
        }
    }

    if (hasReached('work_instruction_sent')) {
        if (!updates.workInstruction) updates.workInstruction = {};
        if (!updates.workInstruction.status && !hasReached('work_instruction_received')) {
            updates.workInstruction.status = 'work_instruction_sent';
        }
        if (!currentWorkInstruction.sentAt && !updates.workInstruction.sentAt) {
            updates.workInstruction.sentAt = now;
        }
    }

    if (hasReached('work_instruction_received')) {
        if (!updates.workInstruction) updates.workInstruction = {};
        if (!updates.workInstruction.status) {
            updates.workInstruction.status = 'work_instruction_received';
        }
        if (!currentWorkInstruction.sentAt && !updates.workInstruction.sentAt) {
            updates.workInstruction.sentAt = now;
        }
        if (!currentWorkInstruction.receivedAt && !updates.workInstruction.receivedAt) {
            updates.workInstruction.receivedAt = now;
        }
    }
}

// ============================================================
// 주문 복제 (재주문)
// ============================================================
// 태그(라벨) 시스템
// 비유: 주문서에 색깔 스티커를 붙여서 급함/VIP/수정요청 등을 한눈에 파악
// ============================================================

// 프리셋 태그 정의: { 이름, CSS 클래스 }
const TAG_PRESETS = [
    { name: '급함',     cssClass: 'tag-urgent' },
    { name: 'VIP',      cssClass: 'tag-vip' },
    { name: '수정요청', cssClass: 'tag-revision' },
    { name: '확인필요', cssClass: 'tag-check' },
    { name: '보류',     cssClass: 'tag-hold' },
];

/**
 * 태그 영역을 현재 주문의 tags 배열 기준으로 렌더링
 * 프리셋 태그: 클릭하면 토글(추가/제거)
 * 커스텀 태그: X 버튼으로 제거 가능
 */
function renderTags() {
    const order = currentOrder;
    const tags = order.tags || [];         // 현재 주문에 붙어있는 태그 목록

    // 프리셋 태그 렌더링 — 활성/비활성 구분
    const presetsEl = document.getElementById('tag-presets');
    if (presetsEl) {
        presetsEl.innerHTML = TAG_PRESETS.map(preset => {
            const isActive = tags.includes(preset.name);  // 이미 붙어있으면 활성
            return `<span class="tag-badge ${preset.cssClass} ${isActive ? '' : 'inactive'}"
                          onclick="togglePresetTag('${preset.name}')">${preset.name}</span>`;
        }).join('');
    }

    // 커스텀 태그 렌더링 — 프리셋에 없는 태그만 표시
    const presetNames = TAG_PRESETS.map(p => p.name);
    const customTags = tags.filter(t => !presetNames.includes(t));
    const customListEl = document.getElementById('tag-custom-list');
    if (customListEl) {
        customListEl.innerHTML = customTags.map(tag =>
            `<span class="tag-badge tag-custom">
                ${escapeHtml(tag)}<span class="tag-remove" onclick="removeTag('${escapeHtml(tag)}')">&times;</span>
            </span>`
        ).join('');
    }
}

/**
 * 프리셋 태그 토글: 있으면 제거, 없으면 추가
 * @param {string} tagName - 토글할 프리셋 태그 이름
 */
async function togglePresetTag(tagName) {
    if (!currentOrder) return;
    const tags = currentOrder.tags || [];
    const idx = tags.indexOf(tagName);

    if (idx >= 0) {
        tags.splice(idx, 1);   // 이미 있으면 제거 (스티커 떼기)
    } else {
        tags.push(tagName);    // 없으면 추가 (스티커 붙이기)
    }

    await saveTags(tags);
}

/**
 * 커스텀 태그 추가: 입력값을 태그 배열에 추가
 * @param {string} value - 사용자가 입력한 태그 텍스트
 */
async function addCustomTag(value) {
    const tagName = value.trim();
    if (!tagName || !currentOrder) return;

    const tags = currentOrder.tags || [];
    // 이미 존재하는 태그면 중복 추가 안 함
    if (tags.includes(tagName)) return;

    tags.push(tagName);
    await saveTags(tags);
}

/**
 * 태그 제거: 특정 태그를 배열에서 삭제
 * @param {string} tagName - 제거할 태그 이름
 */
async function removeTag(tagName) {
    if (!currentOrder) return;
    const tags = (currentOrder.tags || []).filter(t => t !== tagName);
    await saveTags(tags);
}

/**
 * 서버에 태그 저장 → 로컬 상태 갱신 → 화면 다시 렌더링
 * @param {string[]} tags - 저장할 태그 배열
 */
async function saveTags(tags) {
    try {
        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}/tags`, {
            method: 'PATCH',
            body: JSON.stringify({ tags })
        });
        if (!res) return;

        const data = await res.json();
        if (data.success) {
            currentOrder.tags = data.order.tags;   // 로컬 상태 갱신
            renderTags();                           // 화면 다시 그리기
        } else {
            alert('태그 저장 실패: ' + (data.error || ''));
        }
    } catch (err) {
        console.error('[AdminOrder] 태그 저장 실패:', err);
        alert('태그 저장 중 오류가 발생했습니다.');
    }
}

// ============================================================
// 주문 복제(재주문) 기능
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
            window.location.href = `admin-order.html?id=${data.order.id}${getCurrentOrderViewQuery()}`;
        } else {
            alert('주문 복제 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[AdminOrder] 주문 복제 실패:', error);
        alert('주문 복제 중 오류가 발생했습니다.');
    }
}

// ============================================================
// [D-5] 템플릿으로 저장
// 비유: 현재 주문서에서 "양식만 추출"해서 재사용 가능한 템플릿으로 저장
// 고객 정보, 주문번호, 상태, 날짜 등은 자동으로 제거됨
// ============================================================

// 모달 열기: 현재 주문의 종목 정보를 기본 이름/카테고리로 자동 채움
function openSaveAsTemplateModal() {
    if (!currentOrder) return;

    const modal = document.getElementById('save-template-modal');
    const nameInput = document.getElementById('template-name');
    const categoryInput = document.getElementById('template-category');
    const descInput = document.getElementById('template-description');

    // 첫 번째 아이템의 종목/공법을 기본 이름으로 제안
    const firstItem = currentOrder.items?.[0];
    const sportName = firstItem?.sport || '';
    const methodName = firstItem?.method || '';
    nameInput.value = [sportName, methodName].filter(Boolean).join(' ') || '';
    categoryInput.value = sportName || '';
    descInput.value = '';

    modal.classList.remove('hidden');
}

// 모달 닫기
function closeSaveAsTemplateModal() {
    document.getElementById('save-template-modal').classList.add('hidden');
}

// 저장 실행: POST /api/admin/orders/:id/save-as-template 호출
async function saveAsTemplate() {
    if (!currentOrder) return;

    const name = document.getElementById('template-name').value.trim();
    if (!name) {
        alert('템플릿 이름을 입력해주세요.');
        return;
    }

    const category = document.getElementById('template-category').value.trim();
    const description = document.getElementById('template-description').value.trim();

    try {
        const res = await adminFetch(`/api/admin/orders/${currentOrder.id}/save-as-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, category })
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            alert(data.message || '템플릿이 저장되었습니다.');
            closeSaveAsTemplateModal();
        } else {
            alert('템플릿 저장 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[AdminOrder] 템플릿 저장 실패:', error);
        alert('템플릿 저장 중 오류가 발생했습니다.');
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

// formatCurrency, formatDateTime, escapeHtml → admin-common.js에서 로드

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

// ============================================================
// 인쇄 / PDF 생성
// ============================================================

/**
 * 주문서 인쇄 함수
 * 브라우저의 window.print()를 활용하여 PDF 저장 또는 프린터 출력
 * 비유: 워드 문서에서 Ctrl+P 누르는 것과 동일 — 화면의 불필요한 요소를 숨기고 문서만 인쇄
 *
 * 동작 순서:
 * 1. 인쇄 헤더에 주문번호/날짜 채우기
 * 2. 모든 탭 콘텐츠를 표시 (인쇄 시에는 탭 구분 없이 전체 정보)
 * 3. window.print() 호출
 * 4. 인쇄 완료 후 원래 탭 상태로 복원
 */
function printOrder() {
    if (!currentOrder) return;

    // 1) 인쇄 헤더에 주문 정보 채우기
    const printNumberEl = document.getElementById('print-order-number');
    const printDateEl = document.getElementById('print-date');
    if (printNumberEl) {
        printNumberEl.textContent = `주문번호: ${currentOrder.orderNumber || currentOrder._id}`;
    }
    if (printDateEl) {
        // 인쇄 시점 날짜 표시 — "출력일: 2026-03-31"
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        printDateEl.textContent = `출력일: ${y}-${m}-${d}`;
    }

    // 2) 현재 활성 탭을 기억해두고, 모든 탭 콘텐츠를 보이게 설정
    //    @media print CSS가 .tab-content를 display:block으로 강제하지만,
    //    일부 브라우저에서 hidden 클래스가 우선할 수 있으므로 JS로도 처리
    const savedTab = currentTab;
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => tab.classList.remove('hidden'));

    // 3) 브라우저 인쇄 다이얼로그 호출
    window.print();

    // 4) 인쇄 완료 후 원래 탭 상태로 복원
    //    afterprint 이벤트로 복원 (인쇄 다이얼로그 닫힌 후 실행)
    const restoreTabs = () => {
        allTabs.forEach(tab => {
            // 저장해둔 원래 탭만 표시하고 나머지는 숨김
            const tabName = tab.id.replace('tab-', '');
            if (tabName !== savedTab) {
                tab.classList.add('hidden');
            }
        });
        window.removeEventListener('afterprint', restoreTabs);
    };
    window.addEventListener('afterprint', restoreTabs);
}

// handleLogout → admin-common.js에서 로드
