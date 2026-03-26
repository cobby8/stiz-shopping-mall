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
const STATUS_FLOW = [
    'design_requested', 'draft_done', 'revision', 'design_confirmed',
    'payment_pending', 'payment_done',
    'grading', 'line_work', 'in_production', 'production_done',
    'released', 'shipped', 'delivered'
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
    pending: '대기',
    processing: '처리중'
};

// 종목 한글 라벨
const SPORT_LABELS = {
    basketball: '농구', soccer: '축구',
    volleyball: '배구', baseball: '야구'
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
        window.location.href = 'login.html';
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
        window.location.href = 'login.html';
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
        window.location.href = 'login.html';
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

    // 각 탭의 data-field 요소에 값 채우기
    // 비유: 양식 문서의 빈칸에 데이터를 적어넣는 것
    fillFieldValues();

    // 아이템 목록 렌더링
    renderItems();
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
        itemsList.innerHTML = '<p class="text-sm text-gray-400">아이템 정보가 없습니다.</p>';
        return;
    }

    itemsList.innerHTML = items.map((item, idx) => `
        <div class="bg-gray-50 rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
                <p class="font-medium text-sm">${escapeHtml(item.name || `아이템 ${idx + 1}`)}</p>
                <span class="text-xs text-gray-500">${SPORT_LABELS[item.sport] || item.sport || ''}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
                <div><span class="text-gray-400">종류:</span> ${escapeHtml(item.category || '-')}</div>
                <div><span class="text-gray-400">공법:</span> ${escapeHtml(item.method || '-')}</div>
                <div><span class="text-gray-400">수량:</span> ${item.quantity || '-'}벌</div>
                <div><span class="text-gray-400">단가:</span> ${item.unitPrice ? formatCurrency(item.unitPrice) : '-'}</div>
                <div><span class="text-gray-400">핏:</span> ${escapeHtml(item.fit || '-')}</div>
                <div><span class="text-gray-400">원단(상):</span> ${escapeHtml(item.fabricTop || '-')}</div>
                <div><span class="text-gray-400">원단(하):</span> ${escapeHtml(item.fabricBottom || '-')}</div>
                <div><span class="text-gray-400">모델:</span> ${escapeHtml(item.baseModel || '-')}</div>
            </div>
            ${item.subtotal ? `<p class="text-right mt-2 font-medium text-sm">${formatCurrency(item.subtotal)}</p>` : ''}
        </div>
    `).join('');
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
        'groupId', 'memo',
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

/** 로그아웃 */
function handleLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    localStorage.removeItem('stiz_admin_token');
    window.location.href = 'login.html';
}
