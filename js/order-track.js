/**
 * STIZ 주문 추적 페이지 로직 (Phase C 확장)
 *
 * 비유: 택배 조회 시스템 + 고객 서비스 창구
 * 주문번호+연락처를 입력하면 서버 API에서 현재 상태를 가져와
 * 4단계 프로그레스 바 + 상세 타임라인 + 시안 확인 + 주문서 + 결제 기능을 제공한다.
 */

// 서버 API 주소 (auth.js의 API_BASE와 동일)
// 빈 문자열이면 현재 접속 호스트 기준 상대경로로 요청됨 (LAN 내 다른 PC 호환)
const TRACK_API_BASE = '';

// 현재 조회된 주문 데이터 (시안 확정/수정 요청 등에서 사용)
let currentOrder = null;
// 사용자가 입력한 연락처 (본인 확인용)
let currentPhone = '';
// 카탈로그 사이즈 목록 (주문서 사이즈 드롭다운용)
let catalogSizes = [];

// 고객에게 보여줄 4단계 정의
const PROGRESS_STEPS = [
    { step: 1, label: '시안 진행', icon: 'palette' },
    { step: 2, label: '제작 진행', icon: 'precision_manufacturing' },
    { step: 3, label: '배송 준비', icon: 'inventory_2' },
    { step: 4, label: '배송 완료', icon: 'check_circle' }
];

// 상태 배지 색상 매핑
const STATUS_BADGE_COLORS = {
    1: 'bg-yellow-100 text-yellow-800',
    2: 'bg-blue-100 text-blue-800',
    3: 'bg-purple-100 text-purple-800',
    4: 'bg-green-100 text-green-800'
};

/**
 * XSS 방지 함수
 * 비유: 사용자 입력에 섞여 들어올 수 있는 "악성 코드"를 무력화하는 소독제
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 주문 조회 메인 함수
 * 입력된 주문번호(+연락처)로 서버 API를 호출하고 결과를 화면에 렌더링한다.
 */
async function trackOrder() {
    const input = document.getElementById('order-number-input');
    const phoneInput = document.getElementById('phone-input');
    const orderNumber = input.value.trim();
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const errorEl = document.getElementById('search-error');
    const loadingEl = document.getElementById('loading');
    const resultEl = document.getElementById('result-area');
    const notFoundEl = document.getElementById('not-found');

    // 입력값 초기화
    errorEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    notFoundEl.classList.add('hidden');

    // 유효성 검사: 빈 값 방지
    if (!orderNumber) {
        errorEl.textContent = '주문번호를 입력해주세요.';
        errorEl.classList.remove('hidden');
        input.focus();
        return;
    }

    // 연락처 저장 (본인 확인 API에서 사용)
    currentPhone = phone;

    // 로딩 표시
    loadingEl.classList.remove('hidden');

    try {
        // 서버 API 호출: 비로그인 주문 추적 엔드포인트
        const response = await fetch(`${TRACK_API_BASE}/api/orders/track/${encodeURIComponent(orderNumber)}`);
        const data = await response.json();

        // 로딩 숨기기
        loadingEl.classList.add('hidden');

        if (!response.ok || !data.success) {
            notFoundEl.classList.remove('hidden');
            return;
        }

        // 조회 성공: 주문 데이터 저장 + 결과 렌더링
        currentOrder = data.order;
        renderResult(data.order);
        resultEl.classList.remove('hidden');

        // Phase C: 연락처가 있으면 시안/주문서/결제 탭 표시
        if (phone) {
            renderActionTabs(data.order);
        }

    } catch (error) {
        loadingEl.classList.add('hidden');
        errorEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
        errorEl.classList.remove('hidden');
        console.error('[OrderTrack] Error:', error);
    }
}

/**
 * 조회 결과를 화면에 렌더링하는 함수
 */
function renderResult(order) {
    // 1) 주문 기본 정보 표시
    document.getElementById('result-order-number').textContent = `#${escapeHtml(order.orderNumber)}`;
    document.getElementById('result-team-name').textContent = escapeHtml(order.teamName || order.customerName || '주문 정보');

    // 상태 배지 표시
    const badge = document.getElementById('result-status-badge');
    const currentStep = order.customerStatus?.step || 0;
    const badgeColor = STATUS_BADGE_COLORS[currentStep] || 'bg-gray-100 text-gray-800';
    badge.className = `inline-block px-3 py-1 text-xs font-bold rounded-full ${badgeColor}`;
    badge.textContent = escapeHtml(order.customerStatus?.label || order.statusLabel || '확인중');

    // 주문 아이템 요약
    const itemsEl = document.getElementById('result-items');
    if (order.items && order.items.length > 0) {
        const itemTexts = order.items.map(item => {
            const sport = item.sport ? `[${escapeHtml(getSportLabel(item.sport))}] ` : '';
            return `${sport}${escapeHtml(item.name)} ${item.quantity ? `x${item.quantity}` : ''}`;
        });
        itemsEl.textContent = itemTexts.join(' / ');
    } else {
        itemsEl.textContent = '';
    }

    // 2) 프로그레스 바 렌더링
    renderProgressBar(currentStep);

    // 3) 타임라인 렌더링
    renderTimeline(order.history || []);

    // 4) 배송 정보
    const shippingEl = document.getElementById('shipping-info');
    if (order.trackingNumber) {
        document.getElementById('result-carrier').textContent = escapeHtml(order.carrier || '미정');
        document.getElementById('result-tracking').textContent = escapeHtml(order.trackingNumber);
        const trackingLink = document.getElementById('tracking-link');
        trackingLink.href = getTrackingUrl(order.carrier, order.trackingNumber);
        shippingEl.classList.remove('hidden');
    } else {
        shippingEl.classList.add('hidden');
    }

    // 5) 희망 납기일 표시
    const desiredDateEl = document.getElementById('desired-date-info');
    if (order.desiredDate) {
        document.getElementById('result-desired-date').textContent =
            new Date(order.desiredDate).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        desiredDateEl.classList.remove('hidden');
    } else {
        desiredDateEl.classList.add('hidden');
    }
}

// ============================================================
// Phase C: 시안/주문서/결제 탭 영역
// ============================================================

/**
 * 시안/주문서/결제 탭을 활성화하고 내용을 렌더링
 * 연락처가 입력되었을 때만 호출된다
 */
async function renderActionTabs(order) {
    const tabsEl = document.getElementById('action-tabs');
    tabsEl.classList.remove('hidden');

    // 카탈로그에서 사이즈 목록 가져오기 (주문서 드롭다운용)
    await loadCatalogSizes();

    // 시안 탭 내용 렌더링
    renderDesignTab(order);
    // 주문서 탭 내용 렌더링
    renderOrderSheetTab(order);
    // 결제 탭 내용 렌더링
    renderPaymentTab(order);

    // 주문 상태에 따라 활성 탭 자동 결정
    const status = order.status;
    const designStatuses = ['consult_started', 'design_requested', 'draft_done', 'revision', 'design_confirmed'];
    const orderSheetStatuses = ['design_confirmed', 'order_received'];
    const paymentStatuses = ['order_received', 'payment_completed'];

    if (paymentStatuses.includes(status)) {
        switchTab('payment');
    } else if (orderSheetStatuses.includes(status)) {
        switchTab('ordersheet');
    } else {
        switchTab('design');
    }
}

/**
 * 카탈로그에서 사이즈 목록을 로드
 * GET /api/catalog → sizes 배열
 */
async function loadCatalogSizes() {
    try {
        const res = await fetch(`${TRACK_API_BASE}/api/catalog`);
        const data = await res.json();
        // sizes 배열이 있으면 사용, 없으면 기본값
        catalogSizes = data.sizes || ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    } catch (e) {
        console.warn('[OrderTrack] Failed to load catalog sizes, using defaults');
        catalogSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    }
}

/**
 * 탭 전환 함수
 * 비유: TV 채널 변경 — 하나만 보이고 나머지는 숨긴다
 */
function switchTab(tabName) {
    const tabs = ['design', 'ordersheet', 'payment'];
    tabs.forEach(t => {
        const panel = document.getElementById(`panel-${t}`);
        const tab = document.getElementById(`tab-${t}`);
        if (t === tabName) {
            panel.classList.remove('hidden');
            tab.classList.remove('border-transparent', 'text-gray-400');
            tab.classList.add('border-black', 'text-black');
        } else {
            panel.classList.add('hidden');
            tab.classList.remove('border-black', 'text-black');
            tab.classList.add('border-transparent', 'text-gray-400');
        }
    });
}

// =====================
// 시안 확인 탭 로직
// =====================

/**
 * 시안 탭 내용 렌더링
 * design.draftFiles가 있으면 갤러리 표시, 없으면 빈 안내
 */
function renderDesignTab(order) {
    const emptyEl = document.getElementById('design-empty');
    const galleryEl = document.getElementById('design-gallery');
    const actionsEl = document.getElementById('design-actions');
    const confirmedEl = document.getElementById('design-confirmed-msg');
    const design = order.design || {};
    const draftFiles = design.draftFiles || [];

    if (draftFiles.length === 0) {
        // 시안이 없으면 빈 안내 표시
        emptyEl.classList.remove('hidden');
        galleryEl.classList.add('hidden');
        return;
    }

    // 시안이 있으면 갤러리 표시
    emptyEl.classList.add('hidden');
    galleryEl.classList.remove('hidden');

    // 수정 횟수 정보
    const infoEl = document.getElementById('design-revision-info');
    const maxFree = design.maxFreeRevisions || 2;
    const count = design.revisionCount || 0;
    infoEl.textContent = `수정 ${count}/${maxFree}회 (무료)`;

    // 시안 이미지 그리드
    const imagesEl = document.getElementById('design-images');
    imagesEl.innerHTML = '';
    draftFiles.forEach((file, idx) => {
        const url = typeof file === 'string' ? file : (file.url || '');
        const name = typeof file === 'string' ? `시안 ${idx + 1}` : (file.originalName || `시안 ${idx + 1}`);
        const div = document.createElement('div');
        div.className = 'border border-gray-200 rounded-lg overflow-hidden';
        div.innerHTML = `
            <a href="${escapeHtml(url)}" target="_blank" class="block">
                <img src="${escapeHtml(url)}" alt="${escapeHtml(name)}"
                    class="w-full h-48 object-cover hover:opacity-90 transition"
                    onerror="this.parentElement.innerHTML='<div class=\\'w-full h-48 flex items-center justify-center bg-gray-100 text-gray-400\\'>이미지를 불러올 수 없습니다</div>'">
            </a>
            <p class="text-xs text-gray-500 px-3 py-2">${escapeHtml(name)}</p>
        `;
        imagesEl.appendChild(div);
    });

    // 수정 이력 표시
    const historyEl = document.getElementById('design-history');
    const historyList = document.getElementById('design-history-list');
    const revisionHistory = design.revisionHistory || [];
    if (revisionHistory.length > 0) {
        historyEl.classList.remove('hidden');
        historyList.innerHTML = '';
        revisionHistory.forEach((rev, idx) => {
            const date = new Date(rev.requestedAt).toLocaleDateString('ko-KR', {
                month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            });
            const statusText = rev.completedAt ? '완료' : '진행중';
            const statusClass = rev.completedAt ? 'text-green-600' : 'text-yellow-600';
            const chargeText = rev.isExtraCharge ? ' (유료)' : '';
            const div = document.createElement('div');
            div.className = 'bg-gray-50 rounded p-3';
            div.innerHTML = `
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-bold">${idx + 1}차 수정${escapeHtml(chargeText)}</span>
                    <span class="text-xs ${statusClass} font-bold">${statusText}</span>
                </div>
                <p class="text-xs text-gray-600">${escapeHtml(rev.message)}</p>
                <p class="text-xs text-gray-400 mt-1">${date}</p>
            `;
            historyList.appendChild(div);
        });
    } else {
        historyEl.classList.add('hidden');
    }

    // 확정/수정 버튼 표시 조건: design.status가 'draft_done' 또는 'revision_done'일 때
    if (design.status === 'draft_done' || design.status === 'revision_done') {
        actionsEl.classList.remove('hidden');
        confirmedEl.classList.add('hidden');
    } else if (design.status === 'confirmed') {
        actionsEl.classList.add('hidden');
        confirmedEl.classList.remove('hidden');
    } else {
        actionsEl.classList.add('hidden');
        confirmedEl.classList.add('hidden');
    }
}

/**
 * 디자인 확정 API 호출
 */
async function confirmDesign() {
    if (!currentOrder || !currentPhone) {
        alert('연락처를 입력한 후 조회해주세요.');
        return;
    }
    if (!confirm('디자인을 확정하시겠습니까? 확정 후에는 수정이 어렵습니다.')) return;

    try {
        const res = await fetch(`${TRACK_API_BASE}/api/orders/${encodeURIComponent(currentOrder.orderNumber)}/design-confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentPhone })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            alert(data.error || '디자인 확정에 실패했습니다.');
            return;
        }

        alert('디자인이 확정되었습니다!');
        // 화면 갱신
        trackOrder();
    } catch (error) {
        console.error('[OrderTrack] Design confirm error:', error);
        alert('서버 연결에 실패했습니다.');
    }
}

/** 수정 요청 폼 표시 */
function showRevisionForm() {
    document.getElementById('revision-form').classList.remove('hidden');
    document.getElementById('design-actions').classList.add('hidden');
    document.getElementById('revision-message').focus();
}

/** 수정 요청 폼 숨기기 */
function hideRevisionForm() {
    document.getElementById('revision-form').classList.add('hidden');
    document.getElementById('design-actions').classList.remove('hidden');
}

/**
 * 수정 요청 API 호출
 */
async function submitRevision() {
    if (!currentOrder || !currentPhone) {
        alert('연락처를 입력한 후 조회해주세요.');
        return;
    }

    const message = document.getElementById('revision-message').value.trim();
    if (!message) {
        alert('수정 내용을 입력해주세요.');
        document.getElementById('revision-message').focus();
        return;
    }

    try {
        const res = await fetch(`${TRACK_API_BASE}/api/orders/${encodeURIComponent(currentOrder.orderNumber)}/revision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentPhone, message })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            alert(data.error || '수정 요청에 실패했습니다.');
            return;
        }

        alert(data.message || '수정 요청이 접수되었습니다.');
        document.getElementById('revision-message').value = '';
        // 화면 갱신
        trackOrder();
    } catch (error) {
        console.error('[OrderTrack] Revision error:', error);
        alert('서버 연결에 실패했습니다.');
    }
}

// =====================
// 주문서 탭 로직
// =====================

/**
 * 주문서 탭 내용 렌더링
 * 기존 주문서 데이터가 있으면 로드, 없으면 빈 행 3개
 */
function renderOrderSheetTab(order) {
    const statusEl = document.getElementById('ordersheet-status');
    const bodyEl = document.getElementById('ordersheet-body');
    const submittedMsg = document.getElementById('ordersheet-submitted-msg');
    const actionsEl = document.getElementById('ordersheet-actions');
    const addRowBtn = document.getElementById('btn-add-row');
    const sheet = order.orderSheet;

    // 제출 완료 상태 처리
    if (sheet && sheet.isDraft === false && sheet.submittedAt) {
        statusEl.textContent = '제출 완료';
        statusEl.className = 'text-xs px-2 py-1 rounded-full bg-green-100 text-green-700';
        submittedMsg.classList.remove('hidden');
        actionsEl.classList.add('hidden');
        addRowBtn.classList.add('hidden');
        // 읽기 전용 테이블 표시
        renderOrderSheetReadOnly(sheet.members || [], bodyEl);
        return;
    }

    // 작성중/임시저장 상태
    submittedMsg.classList.add('hidden');
    actionsEl.classList.remove('hidden');
    addRowBtn.classList.remove('hidden');

    if (sheet && sheet.isDraft) {
        statusEl.textContent = '임시 저장됨';
        statusEl.className = 'text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700';
    } else {
        statusEl.textContent = '미작성';
        statusEl.className = 'text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500';
    }

    // 기존 데이터가 있으면 로드, 없으면 빈 행 3개
    bodyEl.innerHTML = '';
    const members = (sheet && sheet.members) ? sheet.members : [];
    if (members.length > 0) {
        members.forEach((m, idx) => addOrderSheetRowWithData(idx + 1, m));
    } else {
        for (let i = 1; i <= 3; i++) addOrderSheetRowWithData(i, {});
    }
}

/**
 * 주문서 읽기 전용 렌더링 (제출 완료 후)
 */
function renderOrderSheetReadOnly(members, bodyEl) {
    bodyEl.innerHTML = '';
    members.forEach((m, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100';
        tr.innerHTML = `
            <td class="py-2 pr-2 text-gray-400">${idx + 1}</td>
            <td class="py-2 pr-2 font-bold">${escapeHtml(m.number)}</td>
            <td class="py-2 pr-2">${escapeHtml(m.name)}</td>
            <td class="py-2 pr-2">${escapeHtml(m.topSize)}</td>
            <td class="py-2 pr-2">${escapeHtml(m.bottomSize)}</td>
            <td></td>
        `;
        bodyEl.appendChild(tr);
    });
}

/**
 * 사이즈 드롭다운 option HTML 생성
 */
function sizeOptions(selected) {
    let html = '<option value="">선택</option>';
    catalogSizes.forEach(s => {
        const sel = s === selected ? ' selected' : '';
        html += `<option value="${escapeHtml(s)}"${sel}>${escapeHtml(s)}</option>`;
    });
    return html;
}

/**
 * 주문서 행 추가 (데이터 포함)
 */
function addOrderSheetRowWithData(rowNum, data) {
    const bodyEl = document.getElementById('ordersheet-body');
    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-100 ordersheet-row';
    // 입력 필드에 공통 스타일 적용
    const inputClass = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black';
    const selectClass = 'w-full border border-gray-200 rounded px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black bg-white';
    tr.innerHTML = `
        <td class="py-2 pr-2 text-gray-400 text-xs">${rowNum}</td>
        <td class="py-2 pr-2">
            <input type="text" class="os-number ${inputClass}" value="${escapeHtml(data.number || '')}" placeholder="-" maxlength="4" style="width:50px">
        </td>
        <td class="py-2 pr-2">
            <input type="text" class="os-name ${inputClass}" value="${escapeHtml(data.name || '')}" placeholder="이름">
        </td>
        <td class="py-2 pr-2">
            <select class="os-top ${selectClass}">${sizeOptions(data.topSize || '')}</select>
        </td>
        <td class="py-2 pr-2">
            <select class="os-bottom ${selectClass}">${sizeOptions(data.bottomSize || '')}</select>
        </td>
        <td class="py-2">
            <button onclick="removeOrderSheetRow(this)" class="text-gray-300 hover:text-red-500 transition">
                <span class="material-symbols-outlined" style="font-size:18px;">close</span>
            </button>
        </td>
    `;
    bodyEl.appendChild(tr);
}

/**
 * 행 추가 버튼 핸들러
 */
function addOrderSheetRow() {
    const bodyEl = document.getElementById('ordersheet-body');
    const currentRows = bodyEl.querySelectorAll('.ordersheet-row').length;
    addOrderSheetRowWithData(currentRows + 1, {});
}

/**
 * 행 삭제
 */
function removeOrderSheetRow(btn) {
    const row = btn.closest('tr');
    if (row) {
        row.remove();
        // 행 번호 재정렬
        const rows = document.querySelectorAll('#ordersheet-body .ordersheet-row');
        rows.forEach((r, idx) => {
            r.querySelector('td').textContent = idx + 1;
        });
    }
}

/**
 * 주문서 저장/제출 API 호출
 * @param {boolean} isDraft - true면 임시 저장, false면 최종 제출
 */
async function saveOrderSheet(isDraft) {
    if (!currentOrder || !currentPhone) {
        alert('연락처를 입력한 후 조회해주세요.');
        return;
    }

    // 테이블에서 멤버 데이터 수집
    const rows = document.querySelectorAll('#ordersheet-body .ordersheet-row');
    const members = [];
    rows.forEach(row => {
        const number = row.querySelector('.os-number')?.value?.trim() || '';
        const name = row.querySelector('.os-name')?.value?.trim() || '';
        const topSize = row.querySelector('.os-top')?.value || '';
        const bottomSize = row.querySelector('.os-bottom')?.value || '';
        // 완전히 빈 행은 건너뛰기
        if (number || name || topSize || bottomSize) {
            members.push({ number, name, topSize, bottomSize });
        }
    });

    if (members.length === 0) {
        alert('팀원 정보를 1명 이상 입력해주세요.');
        return;
    }

    // 최종 제출 시 확인
    if (!isDraft && !confirm(`${members.length}명의 주문서를 제출하시겠습니까? 제출 후에는 수정이 어렵습니다.`)) {
        return;
    }

    try {
        const res = await fetch(`${TRACK_API_BASE}/api/orders/${encodeURIComponent(currentOrder.orderNumber)}/order-sheet`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentPhone, members, isDraft })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            alert(data.error || '주문서 저장에 실패했습니다.');
            return;
        }

        alert(data.message || (isDraft ? '임시 저장되었습니다.' : '주문서가 제출되었습니다.'));
        // 화면 갱신
        trackOrder();
    } catch (error) {
        console.error('[OrderTrack] Order sheet error:', error);
        alert('서버 연결에 실패했습니다.');
    }
}

// =====================
// 결제 탭 로직
// =====================

/**
 * 결제 탭 내용 렌더링
 */
function renderPaymentTab(order) {
    const amountEl = document.getElementById('payment-amount');
    const statusArea = document.getElementById('payment-status-area');
    const notifyForm = document.getElementById('payment-notify-form');
    const confirmedMsg = document.getElementById('payment-confirmed-msg');
    const notifiedMsg = document.getElementById('payment-notified-msg');
    const payment = order.payment || {};

    // 결제 금액 표시
    const totalAmount = payment.totalAmount || 0;
    amountEl.textContent = totalAmount > 0
        ? `${totalAmount.toLocaleString()}원`
        : '금액 미확정';

    // 결제 상태에 따른 UI 분기
    if (payment.status === 'paid') {
        // 결제 완료
        statusArea.innerHTML = `
            <div class="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <span class="text-green-600 text-sm font-bold">결제 완료</span>
            </div>`;
        notifyForm.classList.add('hidden');
        confirmedMsg.classList.remove('hidden');
        notifiedMsg.classList.add('hidden');
    } else if (payment.status === 'pending_confirmation') {
        // 입금 확인 대기중
        statusArea.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <span class="text-blue-600 text-sm font-bold">입금 확인 대기중</span>
                <p class="text-blue-500 text-xs mt-1">입금자: ${escapeHtml(payment.depositorName || '')}</p>
            </div>`;
        notifyForm.classList.add('hidden');
        confirmedMsg.classList.add('hidden');
        notifiedMsg.classList.remove('hidden');
    } else {
        // 미결제
        statusArea.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                <span class="text-gray-500 text-sm">입금 대기중</span>
            </div>`;
        notifyForm.classList.remove('hidden');
        confirmedMsg.classList.add('hidden');
        notifiedMsg.classList.add('hidden');
    }
}

/**
 * 계좌번호 클립보드 복사
 */
function copyAccount() {
    const accountNumber = '1005-104-213186';
    navigator.clipboard.writeText(accountNumber).then(() => {
        alert('계좌번호가 복사되었습니다.');
    }).catch(() => {
        // clipboard API 미지원 시 대체
        prompt('아래 계좌번호를 복사해주세요:', accountNumber);
    });
}

/**
 * 입금 완료 알림 API 호출
 */
async function notifyPayment() {
    if (!currentOrder || !currentPhone) {
        alert('연락처를 입력한 후 조회해주세요.');
        return;
    }

    const depositorName = document.getElementById('depositor-name').value.trim();
    const amount = document.getElementById('deposit-amount').value;

    if (!depositorName) {
        alert('입금자명을 입력해주세요.');
        document.getElementById('depositor-name').focus();
        return;
    }

    try {
        const res = await fetch(`${TRACK_API_BASE}/api/orders/${encodeURIComponent(currentOrder.orderNumber)}/payment-notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: currentPhone,
                depositorName,
                amount: amount ? parseInt(amount, 10) : null
            })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            alert(data.error || '입금 알림에 실패했습니다.');
            return;
        }

        alert(data.message || '입금 확인 요청이 접수되었습니다.');
        // 화면 갱신
        trackOrder();
    } catch (error) {
        console.error('[OrderTrack] Payment notify error:', error);
        alert('서버 연결에 실패했습니다.');
    }
}

// ============================================================
// 기존 유틸리티 함수 (Phase A/B에서 사용하던 것)
// ============================================================

/**
 * 4단계 프로그레스 바 렌더링
 * 비유: 지하철 노선도처럼 현재 어느 역에 있는지 보여준다.
 */
function renderProgressBar(currentStep) {
    const container = document.getElementById('progress-bar');
    container.innerHTML = '';

    PROGRESS_STEPS.forEach(({ step, label, icon }) => {
        const div = document.createElement('div');
        div.className = 'progress-step';

        let state = 'waiting';
        if (step < currentStep) state = 'completed';
        else if (step === currentStep) state = 'active';

        if (state === 'completed') div.classList.add('completed');
        if (state === 'active') div.classList.add('active');

        let circleClass = 'bg-gray-200 text-gray-400';
        if (state === 'completed') circleClass = 'bg-black text-white';
        if (state === 'active') circleClass = 'bg-black text-white ring-4 ring-gray-200';

        div.innerHTML = `
            <div class="step-circle ${circleClass}">
                <span class="material-symbols-outlined" style="font-size: 20px;">${icon}</span>
            </div>
            <p class="text-xs mt-2 font-medium ${state === 'waiting' ? 'text-gray-400' : 'text-gray-900'}">${label}</p>
            <p class="text-[10px] mt-0.5 ${state === 'active' ? 'text-brand-red font-bold' : 'text-gray-400'}">
                ${state === 'completed' ? '완료' : state === 'active' ? '진행중' : ''}
            </p>
        `;

        container.appendChild(div);
    });
}

/**
 * 상태 변경 이력을 타임라인으로 렌더링
 */
function renderTimeline(history) {
    const container = document.getElementById('timeline');
    container.innerHTML = '';

    if (history.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">아직 상세 이력이 없습니다.</p>';
        return;
    }

    history.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'timeline-item pb-4';

        const date = new Date(item.date);
        const dateStr = date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
        const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            <div class="timeline-dot"></div>
            <div>
                <p class="text-sm font-bold">${escapeHtml(item.status)}</p>
                ${item.memo ? `<p class="text-xs text-gray-500 mt-0.5">${escapeHtml(item.memo)}</p>` : ''}
                <p class="text-xs text-gray-400 mt-1">${dateStr} ${timeStr}</p>
            </div>
        `;

        container.appendChild(div);
    });
}

/**
 * 종목 코드를 한글 라벨로 변환
 */
function getSportLabel(sport) {
    const labels = {
        basketball: '농구',
        soccer: '축구',
        volleyball: '배구',
        baseball: '야구'
    };
    return labels[sport] || sport;
}

/**
 * 택배사별 배송추적 URL 생성
 */
function getTrackingUrl(carrier, trackingNumber) {
    const urls = {
        'CJ대한통운': `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${trackingNumber}`,
        '한진택배': `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mession=&wblnum=${trackingNumber}`,
        '롯데택배': `https://www.lotteglogis.com/home/reservation/tracking/index?InvNo=${trackingNumber}`,
        '우체국': `https://service.epost.go.kr/trace.RetrieveDomRi498.comm?sid1=${trackingNumber}`,
        '로젠택배': `https://www.ilogen.com/web/personal/trace/${trackingNumber}`
    };
    return urls[carrier] || `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${trackingNumber}`;
}

// ============================================================
// 검색모드 전환 + 일괄입력 + 이름연락처 검색
// ============================================================

/**
 * 검색 모드 전환
 * 비유: 라디오 버튼 — "주문번호" 또는 "이름+연락처" 중 하나를 선택
 * @param {string} mode - 'orderNumber' 또는 'namePhone'
 */
function switchSearchMode(mode) {
    const modes = ['orderNumber', 'namePhone'];
    modes.forEach(m => {
        const panel = document.getElementById(`search-mode-${m}`);
        const tab = document.getElementById(`mode-${m}`);
        if (m === mode) {
            panel.classList.remove('hidden');
            tab.classList.remove('border-transparent', 'text-gray-400');
            tab.classList.add('border-black', 'text-black');
        } else {
            panel.classList.add('hidden');
            tab.classList.remove('border-black', 'text-black');
            tab.classList.add('border-transparent', 'text-gray-400');
        }
    });
    // 모드 전환 시 기존 결과 숨기기
    document.getElementById('result-area').classList.add('hidden');
    document.getElementById('not-found').classList.add('hidden');
    document.getElementById('search-results-list').classList.add('hidden');
    document.getElementById('bulk-results-list').classList.add('hidden');
}

/**
 * 일괄입력 텍스트를 파싱하여 주문번호 배열로 변환
 * 줄바꿈, 쉼표, 세미콜론, 공백으로 구분된 주문번호를 인식
 * @param {string} text - 사용자가 입력한 텍스트
 * @returns {string[]} - 유효한 주문번호 배열 (중복 제거)
 */
function parseBulkInput(text) {
    if (!text || !text.trim()) return [];
    // 구분자: 줄바꿈, 쉼표, 세미콜론으로 분리
    const parts = text.split(/[\n,;]+/);
    const numbers = [];
    const seen = new Set();
    parts.forEach(part => {
        const trimmed = part.trim();
        // ORD- 접두사가 있는 것만 유효한 주문번호로 취급
        if (trimmed && trimmed.startsWith('ORD-') && !seen.has(trimmed)) {
            seen.add(trimmed);
            numbers.push(trimmed);
        }
    });
    return numbers;
}

/**
 * 일괄 조회: 여러 주문번호를 순차 조회하여 요약 목록 표시
 */
async function trackBulkOrders() {
    const textarea = document.getElementById('bulk-input');
    const orderNumbers = parseBulkInput(textarea.value);

    if (orderNumbers.length === 0) {
        alert('유효한 주문번호가 없습니다. ORD-로 시작하는 주문번호를 입력해주세요.');
        return;
    }

    // 기존 결과 숨기기
    document.getElementById('result-area').classList.add('hidden');
    document.getElementById('not-found').classList.add('hidden');
    document.getElementById('search-results-list').classList.add('hidden');

    const listEl = document.getElementById('bulk-results-list');
    const itemsEl = document.getElementById('bulk-results-items');
    itemsEl.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">조회 중...</p>';
    listEl.classList.remove('hidden');

    // 각 주문번호를 병렬로 조회
    const results = await Promise.allSettled(
        orderNumbers.map(async (num) => {
            const res = await fetch(`${TRACK_API_BASE}/api/orders/track/${encodeURIComponent(num)}`);
            const data = await res.json();
            return { orderNumber: num, success: data.success, order: data.order };
        })
    );

    // 결과 렌더링
    itemsEl.innerHTML = '';
    results.forEach(r => {
        const div = document.createElement('div');
        if (r.status === 'fulfilled' && r.value.success) {
            const o = r.value.order;
            const stepColors = STATUS_BADGE_COLORS[o.customerStatus?.step] || 'bg-gray-100 text-gray-800';
            div.className = 'border border-gray-200 rounded-lg p-4 hover:border-gray-400 cursor-pointer transition';
            div.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <span class="text-xs text-gray-400">${escapeHtml(o.orderNumber)}</span>
                        <p class="text-sm font-bold mt-0.5">${escapeHtml(o.teamName || o.customerName || '-')}</p>
                    </div>
                    <span class="px-2 py-0.5 text-xs font-bold rounded-full ${stepColors}">
                        ${escapeHtml(o.customerStatus?.label || o.statusLabel || '확인중')}
                    </span>
                </div>
            `;
            // 클릭 시 해당 주문 상세 조회
            div.addEventListener('click', () => {
                document.getElementById('order-number-input').value = o.orderNumber;
                trackOrder();
                listEl.classList.add('hidden');
            });
        } else {
            div.className = 'border border-red-100 bg-red-50 rounded-lg p-4';
            div.innerHTML = `
                <span class="text-xs text-red-400">${escapeHtml(r.value?.orderNumber || '알 수 없음')}</span>
                <p class="text-sm text-red-600 mt-0.5">주문을 찾을 수 없습니다</p>
            `;
        }
        itemsEl.appendChild(div);
    });
}

/**
 * 이름+연락처로 주문 검색
 * GET /api/orders/search?name=...&phone=... API 호출
 * 여러 주문이 나올 수 있으므로 목록으로 표시
 */
async function searchByNamePhone() {
    const nameInput = document.getElementById('search-name-input');
    const phoneInput = document.getElementById('search-phone-input');
    const errorEl = document.getElementById('search-error-np');
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    errorEl.classList.add('hidden');
    document.getElementById('result-area').classList.add('hidden');
    document.getElementById('not-found').classList.add('hidden');
    document.getElementById('bulk-results-list').classList.add('hidden');

    // 필수값 검증
    if (!name) {
        errorEl.textContent = '이름을 입력해주세요.';
        errorEl.classList.remove('hidden');
        nameInput.focus();
        return;
    }
    if (!phone) {
        errorEl.textContent = '연락처를 입력해주세요.';
        errorEl.classList.remove('hidden');
        phoneInput.focus();
        return;
    }

    try {
        const res = await fetch(`${TRACK_API_BASE}/api/orders/search?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`);
        const data = await res.json();

        if (!res.ok || !data.success || !data.orders || data.orders.length === 0) {
            document.getElementById('not-found').classList.remove('hidden');
            return;
        }

        // 검색 결과 목록 표시
        const listEl = document.getElementById('search-results-list');
        const itemsEl = document.getElementById('search-results-items');
        itemsEl.innerHTML = '';
        listEl.classList.remove('hidden');

        data.orders.forEach(o => {
            const stepColors = STATUS_BADGE_COLORS[o.customerStatus?.step] || 'bg-gray-100 text-gray-800';
            const div = document.createElement('div');
            div.className = 'border border-gray-200 rounded-lg p-4 hover:border-gray-400 cursor-pointer transition';
            div.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <span class="text-xs text-gray-400">${escapeHtml(o.orderNumber)}</span>
                        <p class="text-sm font-bold mt-0.5">${escapeHtml(o.teamName || o.customerName || '-')}</p>
                        <p class="text-xs text-gray-400 mt-0.5">${o.itemSummary ? escapeHtml(o.itemSummary) : ''}</p>
                    </div>
                    <span class="px-2 py-0.5 text-xs font-bold rounded-full ${stepColors}">
                        ${escapeHtml(o.customerStatus?.label || o.statusLabel || '확인중')}
                    </span>
                </div>
            `;
            // 클릭 시 주문번호 모드로 전환하여 상세 조회
            div.addEventListener('click', () => {
                switchSearchMode('orderNumber');
                document.getElementById('order-number-input').value = o.orderNumber;
                document.getElementById('phone-input').value = phone;
                trackOrder();
                listEl.classList.add('hidden');
            });
            itemsEl.appendChild(div);
        });
    } catch (error) {
        errorEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
        errorEl.classList.remove('hidden');
    }
}

/**
 * 비로그인 사용자에게 회원가입 유도 배너 표시
 * localStorage에 auth token이 없으면 배너를 보여준다
 */
function showJoinBannerIfNeeded() {
    const token = localStorage.getItem('stiz_token');
    const banner = document.getElementById('join-banner');
    if (!token && banner) {
        banner.classList.remove('hidden');
    }
}

/**
 * 페이지 초기화
 * - URL 파라미터에 주문번호(+연락처)가 있으면 자동 조회
 * - Enter 키로도 조회 가능
 * - 비로그인 시 회원가입 유도 배너 표시
 */
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('order-number-input');
    const phoneInput = document.getElementById('phone-input');

    // URL 파라미터에서 주문번호+연락처 추출
    const params = new URLSearchParams(window.location.search);
    const orderNumber = params.get('orderNumber');
    const phone = params.get('phone');

    if (orderNumber) {
        input.value = orderNumber;
        if (phone && phoneInput) phoneInput.value = phone;
        trackOrder();
    }

    // Enter 키로 조회 (주문번호 모드)
    [input, phoneInput].forEach(el => {
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') trackOrder();
            });
        }
    });

    // Enter 키로 조회 (이름+연락처 모드)
    const nameInput = document.getElementById('search-name-input');
    const searchPhoneInput = document.getElementById('search-phone-input');
    [nameInput, searchPhoneInput].forEach(el => {
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') searchByNamePhone();
            });
        }
    });

    // 비로그인 시 회원가입 배너 표시
    showJoinBannerIfNeeded();
});
