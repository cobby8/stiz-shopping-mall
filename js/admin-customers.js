/**
 * STIZ 관리자 고객 관리 로직
 * 주문에서 자동 추출된 고객 데이터를 조회/검색/상세확인하는 프론트엔드
 *
 * 구조:
 * 1. 인증 확인 → 관리자가 아니면 로그인 페이지로 리다이렉트
 * 2. API에서 고객 목록 + 통계를 불러와 화면에 렌더링
 * 3. 필터/검색/페이지네이션으로 원하는 고객을 빠르게 찾기
 * 4. 고객 클릭 → 상세 모달에서 주문 이력 확인 + 메모 편집
 */

// ============================================================
// 상수 정의
// ============================================================
const API_BASE = 'http://localhost:4000';

// 주문 상태 한글 라벨 (주문 이력에서 표시용)
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

// 등급 라벨 정의 (서버에서 반환하는 grade 값 → 한국어 + CSS 클래스)
const GRADE_CONFIG = {
    vip:     { label: 'VIP',  badgeClass: 'badge-grade-vip' },
    regular: { label: '단골', badgeClass: 'badge-grade-regular' },
    normal:  { label: '일반', badgeClass: 'badge-grade-normal' },
    new:     { label: '신규', badgeClass: 'badge-grade-new' }
};

// 현재 필터 상태 (비유: 검색 조건표)
let currentFilters = {
    dealType: '',
    grade: '',      // 등급 필터 추가
    sortBy: 'orderCount',
    search: '',
    page: 1
};

// 현재 모달에서 열려있는 고객 ID
let currentCustomerId = null;

// ============================================================
// 초기화: 페이지 로드 시 실행
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1) 관리자 인증 확인
    checkAdminAuth();
    // 2) 통계 + 고객 목록 로드
    loadStats();
    loadCustomers();
});

// ============================================================
// 인증 관련 함수 (admin.js와 동일 패턴)
// ============================================================

/**
 * 관리자 인증 확인
 * JWT 토큰이 없거나 role이 admin이 아니면 로그인 페이지로 보낸다
 */
function checkAdminAuth() {
    const token = getAdminToken();

    if (!token) {
        alert('관리자 로그인이 필요합니다.');
        window.location.href = 'admin-login.html';
        return;
    }

    // JWT payload에서 사용자 정보 추출
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role !== 'admin') {
            alert('관리자 권한이 없습니다.');
            window.location.href = 'index.html';
            return;
        }
        // 헤더에 관리자 이름 표시
        const nameEl = document.getElementById('admin-name');
        if (nameEl) nameEl.textContent = payload.name || '관리자';
    } catch (e) {
        alert('인증 정보가 올바르지 않습니다. 다시 로그인해주세요.');
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
    }
}

/** localStorage에서 관리자 JWT 토큰 가져오기 */
function getAdminToken() {
    return localStorage.getItem('stiz_admin_token');
}

/**
 * API 호출 공통 함수
 * 모든 관리자 API 요청에 JWT 토큰을 헤더에 포함시킨다
 */
async function adminFetch(url, options = {}) {
    const token = getAdminToken();
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
    };

    const response = await fetch(`${API_BASE}${url}`, { ...options, headers });

    // 인증 만료 또는 권한 없음이면 로그인 페이지로
    if (response.status === 401 || response.status === 403) {
        alert('인증이 만료되었습니다. 다시 로그인해주세요.');
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
        return null;
    }

    return response;
}

// ============================================================
// 통계 로드
// ============================================================
async function loadStats() {
    try {
        const res = await adminFetch('/api/admin/customers/stats/summary');
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const stats = data.stats;

        // 통계 카드 숫자 업데이트
        document.getElementById('stat-total').textContent = stats.totalCustomers;
        document.getElementById('stat-repeat').textContent = stats.repeatCustomers;
        document.getElementById('stat-rate').textContent = stats.repeatRate + '%';
        document.getElementById('stat-types').textContent = Object.keys(stats.dealTypeCounts).length;

        // 거래유형 필터 드롭다운 채우기
        updateDealTypeFilter(stats.dealTypeCounts);
    } catch (error) {
        console.error('[Admin] 고객 통계 로드 실패:', error);
    }
}

/**
 * 거래유형 필터 드롭다운을 동적으로 채운다
 * 비유: "종류별 폴더 탭"을 만들어 빠르게 분류할 수 있게 하는 것
 */
function updateDealTypeFilter(dealTypeCounts) {
    const select = document.getElementById('filter-dealType');
    // "전체 유형"만 남기고 초기화
    select.innerHTML = '<option value="">전체 유형</option>';

    // 건수 내림차순 정렬 후 옵션 추가
    Object.entries(dealTypeCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = `${type} (${count})`;
            select.appendChild(option);
        });
}

// ============================================================
// 고객 목록 로드
// ============================================================
async function loadCustomers() {
    showLoading(true);

    try {
        // 필터 조건을 URL 쿼리 파라미터로 변환
        const params = new URLSearchParams();
        if (currentFilters.dealType) params.set('dealType', currentFilters.dealType);
        if (currentFilters.grade) params.set('grade', currentFilters.grade);  // 등급 필터
        if (currentFilters.search) params.set('search', currentFilters.search);
        params.set('sortBy', currentFilters.sortBy);
        params.set('sortOrder', currentFilters.sortBy === 'name' ? 'asc' : 'desc');
        params.set('page', currentFilters.page);
        params.set('limit', 20);

        const res = await adminFetch(`/api/admin/customers?${params.toString()}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) {
            showEmpty();
            return;
        }

        if (data.customers.length === 0) {
            showEmpty();
            return;
        }

        // 테이블에 고객 데이터 렌더링
        renderCustomersTable(data.customers);
        // 페이지네이션 렌더링
        renderPagination(data.pagination);
    } catch (error) {
        console.error('[Admin] 고객 로드 실패:', error);
        showEmpty();
    }
}

/**
 * 고객 테이블 렌더링
 * 각 고객을 한 행으로 표시. 클릭하면 상세 모달이 열린다.
 */
function renderCustomersTable(customers) {
    const tbody = document.getElementById('customers-tbody');
    tbody.innerHTML = '';

    customers.forEach(customer => {
        const row = document.createElement('tr');
        row.className = 'customer-row border-b border-gray-50 cursor-pointer';
        // 클릭 시 고객 상세 모달 열기
        row.onclick = () => openCustomerModal(customer.id);

        // 거래유형 배지 색상 결정
        const dealBadge = getDealTypeBadge(customer.dealType);
        // 등급 배지 (서버에서 계산된 grade 필드 사용)
        const gradeBadge = getGradeBadge(customer.grade);
        // 총 매출 포맷
        const totalSpent = formatCurrency(customer.totalSpent || 0);
        // 최근 주문일 (lastOrderDate가 있으면 표시)
        const lastOrder = customer.lastOrderDate ? formatDate(customer.lastOrderDate) : '-';
        // 주문수 뱃지 (2건 이상이면 강조)
        const orderCountClass = customer.orderCount >= 2 ? 'text-green-600 font-bold' : '';

        row.innerHTML = `
            <td class="px-4 py-3 font-medium whitespace-nowrap">${escapeHtml(customer.name || '-')}</td>
            <td class="px-4 py-3 whitespace-nowrap">${escapeHtml(customer.teamName || '-')}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap">${gradeBadge}</td>
            <td class="px-4 py-3 whitespace-nowrap">${dealBadge}</td>
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">${escapeHtml(customer.phone || '-')}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap ${orderCountClass}">${customer.orderCount || 0}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap font-medium">${totalSpent}</td>
            <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">${lastOrder}</td>
        `;
        tbody.appendChild(row);
    });

    // 테이블 표시
    showTable();
}

/**
 * 거래유형에 따른 배지 HTML 반환
 * 비유: 각 유형마다 다른 색 라벨 스티커를 붙이는 것
 */
function getDealTypeBadge(dealType) {
    if (!dealType) return '<span class="badge-etc text-xs font-medium px-2 py-1 rounded-full">미분류</span>';

    // 거래유형 키워드에 따라 배지 색상 결정
    let badgeClass = 'badge-etc';
    if (dealType.includes('동호회')) badgeClass = 'badge-club';
    else if (dealType.includes('대학') || dealType.includes('동아리')) badgeClass = 'badge-univ';
    else if (dealType.includes('학원') || dealType.includes('학교') || dealType.includes('SC')) badgeClass = 'badge-school';
    else if (dealType.includes('프로') || dealType.includes('구단') || dealType.includes('실업')) badgeClass = 'badge-pro';

    return `<span class="${badgeClass} text-xs font-medium px-2 py-1 rounded-full">${escapeHtml(dealType)}</span>`;
}

/**
 * 고객 등급에 따른 배지 HTML 반환
 * 비유: 고객 카드에 금색/파란색/초록색 스탬프를 찍는 것
 */
function getGradeBadge(grade) {
    const config = GRADE_CONFIG[grade] || GRADE_CONFIG.normal;
    return `<span class="${config.badgeClass} text-xs font-bold px-2 py-0.5 rounded-full">${config.label}</span>`;
}

/**
 * 페이지네이션 렌더링 (admin.js와 동일한 패턴)
 */
function renderPagination(pagination) {
    const infoEl = document.getElementById('pagination-info');
    const buttonsEl = document.getElementById('pagination-buttons');

    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    infoEl.textContent = `총 ${pagination.total}명 중 ${start}-${end}`;

    buttonsEl.innerHTML = '';

    // 이전 버튼
    if (pagination.page > 1) {
        buttonsEl.appendChild(createPageButton('이전', pagination.page - 1));
    }

    // 페이지 번호 (최대 5개)
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.totalPages, pagination.page + 2);
    for (let i = startPage; i <= endPage; i++) {
        const btn = createPageButton(i, i);
        if (i === pagination.page) {
            btn.className = 'bg-brand-black text-white px-3 py-1 rounded text-sm font-medium';
        }
        buttonsEl.appendChild(btn);
    }

    // 다음 버튼
    if (pagination.page < pagination.totalPages) {
        buttonsEl.appendChild(createPageButton('다음', pagination.page + 1));
    }

    // 2페이지 이상일 때만 표시
    const paginationEl = document.getElementById('pagination');
    paginationEl.classList.toggle('hidden', pagination.totalPages <= 1);
}

/** 페이지 버튼 요소 생성 */
function createPageButton(label, page) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'border border-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-100 transition-colors';
    btn.onclick = (e) => {
        e.stopPropagation();
        currentFilters.page = page;
        loadCustomers();
    };
    return btn;
}

// ============================================================
// 필터 함수들
// ============================================================

/** 필터 드롭다운 변경 시 호출 */
function applyFilters() {
    currentFilters.dealType = document.getElementById('filter-dealType').value;
    currentFilters.grade = document.getElementById('filter-grade').value;  // 등급 필터
    currentFilters.sortBy = document.getElementById('filter-sort').value;
    currentFilters.page = 1;
    loadCustomers();
}

/** 검색 입력 시 엔터키로 실행 */
function handleSearchKeyup(event) {
    if (event.key === 'Enter') {
        currentFilters.search = document.getElementById('filter-search').value.trim();
        currentFilters.page = 1;
        loadCustomers();
    }
}

/** 모든 필터 초기화 */
function resetFilters() {
    document.getElementById('filter-dealType').value = '';
    document.getElementById('filter-grade').value = '';
    document.getElementById('filter-sort').value = 'orderCount';
    document.getElementById('filter-search').value = '';

    currentFilters = { dealType: '', grade: '', sortBy: 'orderCount', search: '', page: 1 };
    loadCustomers();
}

// ============================================================
// 고객 상세 모달
// ============================================================

/**
 * 고객 상세 모달 열기
 * API에서 고객 정보 + 연결된 주문 목록을 가져와 모달에 표시
 */
async function openCustomerModal(customerId) {
    currentCustomerId = customerId;

    // 모달 표시
    const modal = document.getElementById('customer-modal');
    modal.classList.remove('hidden');
    // 바디 스크롤 방지
    document.body.style.overflow = 'hidden';

    // 로딩 표시
    document.getElementById('modal-orders').innerHTML = '<p class="text-sm text-gray-400">주문 이력을 불러오는 중...</p>';

    try {
        const res = await adminFetch(`/api/admin/customers/${customerId}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) {
            alert('고객 정보를 불러올 수 없습니다.');
            closeCustomerModal();
            return;
        }

        const customer = data.customer;
        const orders = data.orders || [];
        const summary = data.summary || {};

        // === 요약 카드 렌더링 (B-4: 모달 상단 핵심 지표) ===
        document.getElementById('modal-name').textContent = customer.name || '-';
        document.getElementById('modal-grade').innerHTML = getGradeBadge(customer.grade);
        // 팀명은 요약 카드 우측 상단에 표시
        document.getElementById('modal-teamName-badge').textContent = customer.teamName || '-';

        // 4칸 그리드 숫자 채우기 (서버에서 계산한 summary 사용)
        document.getElementById('modal-totalOrders').textContent = summary.totalOrders || 0;
        document.getElementById('modal-totalRevenue').textContent = formatCurrency(summary.totalRevenue || 0);
        document.getElementById('modal-avgOrderAmount').textContent = formatCurrency(summary.avgOrderAmount || 0);
        document.getElementById('modal-lastOrderDate').textContent =
            summary.lastOrderDate ? formatFullDate(summary.lastOrderDate) : '없음';

        // === 기본 정보 채우기 ===
        document.getElementById('modal-phone').textContent = customer.phone || '-';
        document.getElementById('modal-email').textContent = customer.email || '-';
        document.getElementById('modal-dealType').textContent = customer.dealType || '미분류';
        document.getElementById('modal-createdAt').textContent = customer.createdAt ? formatFullDate(customer.createdAt) : '-';

        // 메모
        document.getElementById('modal-memo').value = customer.memo || '';

        // 주문 이력 렌더링
        renderModalOrders(orders);

        // 연락 이력 로드 (B-2: 주문 이력 아래에 타임라인으로 표시)
        loadContacts();
    } catch (error) {
        console.error('[Admin] 고객 상세 로드 실패:', error);
        document.getElementById('modal-orders').innerHTML = '<p class="text-sm text-red-500">로드 실패</p>';
    }
}

/** 고객 상세 모달 닫기 */
function closeCustomerModal() {
    const modal = document.getElementById('customer-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    currentCustomerId = null;
}

/**
 * 모달 내 주문 이력 렌더링
 * 각 주문을 카드 형태로 표시하며, 클릭하면 주문 상세 페이지로 이동
 */
function renderModalOrders(orders) {
    const container = document.getElementById('modal-orders');

    if (orders.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400">주문 이력이 없습니다.</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const statusLabel = STATUS_LABELS[order.status] || order.status || '알 수 없음';
        const amount = formatCurrency(order.totalAmount || 0);
        const date = order.createdAt ? formatFullDate(order.createdAt) : '-';
        // 아이템 요약 (첫 번째 아이템 이름 + 나머지 건수)
        const itemSummary = getItemSummary(order.items);

        return `
            <a href="admin-order.html?id=${order.id}"
               class="block border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div class="flex items-center justify-between mb-1">
                    <span class="font-mono text-xs text-gray-500">${order.orderNumber || '-'}</span>
                    <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">${statusLabel}</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-700">${escapeHtml(itemSummary)}</span>
                    <span class="text-sm font-medium">${amount}</span>
                </div>
                <p class="text-xs text-gray-400 mt-1">${date}</p>
            </a>
        `;
    }).join('');
}

/**
 * 주문 아이템 요약 텍스트 생성
 * 비유: "농구 유니폼 외 2건" 같은 한 줄 요약
 */
function getItemSummary(items) {
    if (!items || items.length === 0) return '아이템 없음';

    const first = items[0].name || items[0].sport || '아이템';
    if (items.length === 1) return first;
    return `${first} 외 ${items.length - 1}건`;
}

/**
 * 고객 메모 저장
 * 모달에서 메모를 수정한 후 저장 버튼을 누르면 API로 전송
 */
async function saveCustomerMemo() {
    if (!currentCustomerId) return;

    const memo = document.getElementById('modal-memo').value.trim();

    try {
        const res = await adminFetch(`/api/admin/customers/${currentCustomerId}`, {
            method: 'PUT',
            body: JSON.stringify({ memo })
        });

        if (!res) return;

        const data = await res.json();
        if (data.success) {
            alert('메모가 저장되었습니다.');
        } else {
            alert('저장 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[Admin] 메모 저장 실패:', error);
        alert('메모 저장에 실패했습니다.');
    }
}

// ============================================================
// 연락 이력 (B-2)
// 비유: 고객 카드 뒷면에 통화/문자/카톡/이메일 기록을 남기는 것
// ============================================================

// 연락 유형별 아이콘 + 한국어 라벨 매핑
const CONTACT_TYPE_CONFIG = {
    phone:   { icon: 'call',          label: '전화',     color: 'text-blue-500' },
    message: { icon: 'sms',           label: '문자',     color: 'text-green-500' },
    kakao:   { icon: 'chat_bubble',   label: '카카오톡', color: 'text-yellow-600' },
    email:   { icon: 'mail',          label: '이메일',   color: 'text-purple-500' }
};

/**
 * 연락 이력 로드
 * 현재 열린 고객의 연락 이력을 API에서 가져와 타임라인으로 표시
 */
async function loadContacts() {
    if (!currentCustomerId) return;

    const container = document.getElementById('modal-contacts');
    container.innerHTML = '<p class="text-sm text-gray-400">연락 이력을 불러오는 중...</p>';

    try {
        const res = await adminFetch(`/api/admin/customers/${currentCustomerId}/contacts`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) {
            container.innerHTML = '<p class="text-sm text-red-500">로드 실패</p>';
            return;
        }

        renderContacts(data.contacts);
    } catch (error) {
        console.error('[Admin] 연락 이력 로드 실패:', error);
        container.innerHTML = '<p class="text-sm text-red-500">로드 실패</p>';
    }
}

/**
 * 연락 이력 추가
 * 유형 선택 + 메모 입력 후 등록 버튼 클릭 시 API로 전송
 */
async function addContact() {
    if (!currentCustomerId) return;

    const type = document.getElementById('contact-type').value;
    const note = document.getElementById('contact-note').value.trim();

    // 빈 내용 방지
    if (!note) {
        alert('연락 내용을 입력해주세요.');
        return;
    }

    try {
        // JWT에서 관리자 이름 추출 (작성자 기록용)
        const token = getAdminToken();
        let authorName = '관리자';
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            authorName = payload.name || '관리자';
        } catch (e) { /* 파싱 실패 시 기본값 사용 */ }

        const res = await adminFetch(`/api/admin/customers/${currentCustomerId}/contacts`, {
            method: 'POST',
            body: JSON.stringify({ type, note, author: authorName })
        });

        if (!res) return;

        const data = await res.json();
        if (data.success) {
            // 입력 필드 초기화
            document.getElementById('contact-note').value = '';
            // 연락 이력 다시 로드하여 새 항목 표시
            loadContacts();
        } else {
            alert('등록 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[Admin] 연락 이력 추가 실패:', error);
        alert('연락 이력 등록에 실패했습니다.');
    }
}

/**
 * 연락 이력 타임라인 렌더링
 * 각 연락을 아이콘 + 유형 + 내용 + 작성자 + 날짜로 표시
 */
function renderContacts(contacts) {
    const container = document.getElementById('modal-contacts');

    // 연락 이력이 없으면 안내 메시지
    if (!contacts || contacts.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400">연락 이력이 없습니다.</p>';
        return;
    }

    // 타임라인형 카드로 렌더링
    container.innerHTML = contacts.map(contact => {
        const config = CONTACT_TYPE_CONFIG[contact.type] || CONTACT_TYPE_CONFIG.phone;
        const date = contact.createdAt ? formatFullDate(contact.createdAt) : '-';
        // 시간도 표시 (HH:MM)
        const time = contact.createdAt ? formatTime(contact.createdAt) : '';

        return `
            <div class="flex items-start space-x-3 border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <!-- 유형 아이콘 -->
                <span class="material-symbols-outlined ${config.color} text-lg mt-0.5">${config.icon}</span>
                <!-- 내용 영역 -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-medium ${config.color}">${config.label}</span>
                        <span class="text-xs text-gray-400">${date} ${time}</span>
                    </div>
                    <p class="text-sm text-gray-700 whitespace-pre-wrap break-words">${escapeHtml(contact.note)}</p>
                    <p class="text-xs text-gray-400 mt-1">${escapeHtml(contact.author || '관리자')}</p>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 시간 포맷 (HH:MM)
 * 비유: "15:30" 형태의 시간 표시
 */
function formatTime(dateString) {
    const d = new Date(dateString);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ============================================================
// CSV 내보내기 (B-5)
// ============================================================

/**
 * 현재 필터 조건에 맞는 고객 데이터를 CSV 파일로 다운로드
 * 비유: 엑셀에서 "다른 이름으로 저장 → CSV"를 자동으로 해주는 버튼
 *
 * 동작 원리:
 * 1. 현재 필터 조건 그대로 API 호출 (단, limit을 매우 크게 → 전체 데이터)
 * 2. 가져온 고객 배열을 CSV 문자열로 변환
 * 3. BOM(Byte Order Mark) 추가 → 엑셀에서 한글이 깨지지 않도록
 * 4. 브라우저 다운로드 트리거
 */
async function exportCustomersCSV() {
    try {
        // --- 1단계: 현재 필터 조건으로 전체 고객 데이터 요청 ---
        const params = new URLSearchParams();
        if (currentFilters.dealType) params.set('dealType', currentFilters.dealType);
        if (currentFilters.grade) params.set('grade', currentFilters.grade);
        if (currentFilters.search) params.set('search', currentFilters.search);
        params.set('sortBy', currentFilters.sortBy);
        params.set('sortOrder', currentFilters.sortBy === 'name' ? 'asc' : 'desc');
        params.set('page', 1);
        // limit을 10000으로 설정하여 사실상 전체 데이터를 가져온다
        params.set('limit', 10000);

        const res = await adminFetch(`/api/admin/customers?${params.toString()}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success || !data.customers || data.customers.length === 0) {
            alert('내보낼 고객 데이터가 없습니다.');
            return;
        }

        const customers = data.customers;

        // --- 2단계: CSV 헤더 + 데이터 행 생성 ---
        // CSV 컬럼 정의 (엑셀에서 보기 좋은 한글 헤더)
        const headers = ['고객명', '팀명', '연락처', '이메일', '거래유형', '등급', '주문수', '총매출', '최근주문일'];

        // 등급 코드를 한글로 변환하는 매핑
        const gradeLabels = { vip: 'VIP', regular: '단골', normal: '일반', new: '신규' };

        // 각 고객을 CSV 행으로 변환
        const rows = customers.map(c => {
            return [
                c.name || '',
                c.teamName || '',
                c.phone || '',
                c.email || '',
                c.dealType || '미분류',
                gradeLabels[c.grade] || '일반',
                c.orderCount || 0,
                c.totalSpent || 0,
                c.lastOrderDate ? formatFullDate(c.lastOrderDate) : ''
            ];
        });

        // --- 3단계: CSV 문자열 조립 ---
        // csvEscape: 쉼표나 줄바꿈이 포함된 값을 큰따옴표로 감싼다
        const csvEscape = (val) => {
            const str = String(val);
            // 쉼표, 줄바꿈, 큰따옴표가 포함되면 이스케이프 처리
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };

        // 헤더 + 데이터를 줄바꿈으로 연결
        const csvContent = [
            headers.map(csvEscape).join(','),
            ...rows.map(row => row.map(csvEscape).join(','))
        ].join('\r\n');

        // --- 4단계: BOM 추가 + 파일 다운로드 ---
        // BOM(Byte Order Mark): 엑셀이 UTF-8 인코딩을 인식하게 하는 3바이트 접두사
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

        // 파일명: "고객목록_2026-03-31.csv" 형태
        const today = new Date();
        const dateStr = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, '0'),
            String(today.getDate()).padStart(2, '0')
        ].join('-');
        const fileName = `고객목록_${dateStr}.csv`;

        // 다운로드 링크를 동적으로 생성하여 클릭 → 즉시 제거
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // 메모리 해제
        URL.revokeObjectURL(link.href);

    } catch (error) {
        console.error('[Admin] CSV 내보내기 실패:', error);
        alert('CSV 내보내기에 실패했습니다.');
    }
}

// ============================================================
// UI 상태 전환 함수들
// ============================================================

/** 로딩 상태 표시 */
function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
    document.getElementById('table-wrapper').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('pagination').classList.add('hidden');
}

/** 빈 상태 표시 */
function showEmpty() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('table-wrapper').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('pagination').classList.add('hidden');
}

/** 테이블 표시 */
function showTable() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('table-wrapper').classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('pagination').classList.remove('hidden');
}

// ============================================================
// 유틸리티 함수들
// ============================================================

/** 금액을 한국 원화 형식으로 포맷 (예: 675,000원) */
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return amount.toLocaleString('ko-KR') + '원';
}

/** 날짜를 간결한 형식으로 변환 (예: 03/26) */
function formatDate(dateString) {
    const d = new Date(dateString);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

/** 날짜를 전체 형식으로 변환 (예: 2026-03-26) */
function formatFullDate(dateString) {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    window.location.href = 'admin-login.html';
}
