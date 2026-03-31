/**
 * STIZ 관리자 대시보드 로직
 * Google Sheets를 대체하는 주문 관리 화면의 프론트엔드
 *
 * 구조:
 * 1. 인증 확인 → 관리자가 아니면 로그인 페이지로 리다이렉트
 * 2. API에서 주문 목록 + 통계 데이터를 불러와 화면에 렌더링
 * 3. 필터/검색/페이지네이션으로 원하는 주문을 빠르게 찾기
 */

// ============================================================
// 상수 정의
// ============================================================
const API_BASE = 'http://localhost:4000';

// 상태 한글 라벨 (서버의 STATUS_LABELS와 동일하게 유지)
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
    basketball: '농구',
    soccer: '축구',
    volleyball: '배구',
    baseball: '야구'
};

// 현재 필터 상태를 저장하는 객체 (비유: 검색 조건표)
let currentFilters = {
    status: '',
    manager: '',
    sport: '',
    dealType: '',           // 거래유형 필터 추가
    search: '',
    dateFrom: '',           // 날짜 범위 시작 (예: 2026-01-01)
    dateTo: '',             // 날짜 범위 끝 (예: 2026-03-31)
    amountMin: '',          // 금액 범위 최소
    amountMax: '',          // 금액 범위 최대
    excludeCompleted: true, // 기본값: 완료 주문 숨김 (진행중 탭)
    page: 1
};

// ============================================================
// 초기화: 페이지 로드 시 실행
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1) 관리자 인증 확인
    checkAdminAuth();

    // 2) 연도 드롭다운 이벤트 리스너 등록
    // 비유: 연도를 바꾸면 해당 연도의 매출/건수 등 통계가 갱신됨
    const yearSelect = document.getElementById('stats-year-select');
    if (yearSelect) {
        yearSelect.addEventListener('change', () => {
            loadStats(yearSelect.value);
        });
    }

    // 3) 데이터 로드 — 현재 연도 기준 통계 + 주문 목록
    const currentYear = new Date().getFullYear().toString();
    if (yearSelect) yearSelect.value = currentYear; // 드롭다운 기본값을 현재 연도로
    loadStats(currentYear);
    loadOrders();
});

/**
 * 관리자 인증 확인
 * JWT 토큰이 없거나 role이 admin이 아니면 로그인 페이지로 보낸다.
 * 비유: 관제실 입구에서 출입증을 확인하는 것
 */
function checkAdminAuth() {
    const token = getAdminToken();

    if (!token) {
        // 토큰이 없으면 로그인 페이지로 이동
        alert('관리자 로그인이 필요합니다.');
        window.location.href = 'admin-login.html';
        return;
    }

    // 토큰에서 사용자 정보 추출하여 헤더에 표시
    // JWT는 header.payload.signature 구조이고, payload에 사용자 정보가 담겨있다
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
        // 토큰 파싱 실패 시 로그인 페이지로
        alert('인증 정보가 올바르지 않습니다. 다시 로그인해주세요.');
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
    }
}

/**
 * 관리자 JWT 토큰 가져오기
 * localStorage에 별도 키로 저장 (일반 사용자 토큰과 분리)
 */
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

    // 401(인증 만료) 또는 403(권한 없음)이면 로그인 페이지로
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
/**
 * 통계 로드 (연도별)
 * @param {string} year - 조회할 연도 (예: '2026'). 미지정 시 현재 연도
 * 비유: "올해 성적표"를 서버에서 가져와 대시보드에 표시
 */
async function loadStats(year) {
    try {
        // 연도 파라미터가 없으면 현재 연도 사용
        const selectedYear = year || new Date().getFullYear().toString();

        // 연도를 쿼리파라미터로 전달하여 해당 연도 통계만 요청
        const res = await adminFetch(`/api/admin/stats?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const stats = data.stats;

        // 연도 타이틀 업데이트 — "2026년 주문 현황"
        const yearLabel = document.getElementById('stats-year-label');
        if (yearLabel) yearLabel.textContent = stats.year || selectedYear;

        // 상태별 카드 숫자 업데이트
        document.getElementById('stat-design').textContent = stats.statusCounts.design || 0;
        document.getElementById('stat-production').textContent = stats.statusCounts.production || 0;
        document.getElementById('stat-shipping').textContent = stats.statusCounts.shipping || 0;
        document.getElementById('stat-delivered').textContent = stats.statusCounts.delivered || 0;

        // 총 주문 + 매출
        document.getElementById('stat-total').textContent = `${stats.totalOrders}건`;
        document.getElementById('stat-revenue').textContent = formatCurrency(stats.totalRevenue);

        // 미수금 + 보류 카드 업데이트
        document.getElementById('stat-unpaid').textContent = formatCurrency(stats.unpaidAmount || 0);
        document.getElementById('stat-hold').textContent = `${stats.holdCount || 0}건`;

        // 담당자 필터 옵션 동적 생성
        updateManagerFilter(stats.managerCounts);
        // 거래유형 필터 옵션 동적 생성
        updateDealTypeFilter(stats.dealTypeCounts || {});
    } catch (error) {
        console.error('[Admin] 통계 로드 실패:', error);
    }
}

/**
 * 담당자 필터 드롭다운을 동적으로 채운다
 * API에서 받은 담당자별 건수 데이터를 이용
 */
function updateManagerFilter(managerCounts) {
    const select = document.getElementById('filter-manager');
    // 기존 옵션 중 "전체 담당자"만 남기고 제거
    select.innerHTML = '<option value="">전체 담당자</option>';

    // 담당자 이름별로 옵션 추가 (건수 표시)
    Object.entries(managerCounts).forEach(([name, count]) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `${name} (${count})`;
        select.appendChild(option);
    });
}

/**
 * 거래유형 필터 드롭다운을 동적으로 채운다
 * API에서 받은 거래유형별 건수 데이터를 이용
 * 비유: 동호회, 대학동아리 등 유형별로 몇 건인지 보여주는 메뉴
 */
function updateDealTypeFilter(dealTypeCounts) {
    const select = document.getElementById('filter-dealType');
    if (!select) return;
    // 기존 옵션 중 "전체 거래유형"만 남기고 제거
    select.innerHTML = '<option value="">전체 거래유형</option>';

    // 건수 많은 순으로 정렬해서 옵션 추가
    Object.entries(dealTypeCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, count]) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `${name} (${count})`;
            select.appendChild(option);
        });
}

// ============================================================
// 주문 목록 로드
// ============================================================
async function loadOrders() {
    showLoading(true);

    try {
        // 필터 조건을 URL 쿼리 파라미터로 변환
        const params = new URLSearchParams();
        if (currentFilters.status) params.set('status', currentFilters.status);
        if (currentFilters.manager) params.set('manager', currentFilters.manager);
        if (currentFilters.sport) params.set('sport', currentFilters.sport);
        if (currentFilters.dealType) params.set('dealType', currentFilters.dealType);     // 거래유형
        if (currentFilters.search) params.set('search', currentFilters.search);
        if (currentFilters.unpaid) params.set('unpaid', currentFilters.unpaid);            // 미수금 필터
        // 범위 필터: 날짜와 금액 (값이 있을 때만 서버로 전달)
        if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom);
        if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo);
        if (currentFilters.amountMin) params.set('amountMin', currentFilters.amountMin);
        if (currentFilters.amountMax) params.set('amountMax', currentFilters.amountMax);
        // 완료 주문 제외 여부 — "진행중" 탭이면 true, "전체" 탭이면 false
        params.set('excludeCompleted', currentFilters.excludeCompleted);
        params.set('page', currentFilters.page);
        params.set('limit', 20);

        const res = await adminFetch(`/api/admin/orders?${params.toString()}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) {
            showEmpty();
            return;
        }

        if (data.orders.length === 0) {
            showEmpty();
            return;
        }

        // 테이블에 주문 데이터 렌더링
        renderOrdersTable(data.orders);
        // 페이지네이션 렌더링
        renderPagination(data.pagination);
        // 탭 건수 업데이트 — 진행중 건수와 전체 건수를 탭에 표시
        updateTabCounts(data.pagination);
    } catch (error) {
        console.error('[Admin] 주문 로드 실패:', error);
        showEmpty();
    }
}

/**
 * 주문 테이블 렌더링
 * 각 주문을 한 행으로 표시. 클릭하면 상세 페이지로 이동
 */
function renderOrdersTable(orders) {
    const tbody = document.getElementById('orders-tbody');
    tbody.innerHTML = '';

    orders.forEach(order => {
        const row = document.createElement('tr');
        row.className = 'order-row border-b border-gray-50 cursor-pointer';
        // 클릭 시 주문 상세 페이지로 이동 (id를 URL 파라미터로 전달)
        row.onclick = () => window.location.href = `admin-order.html?id=${order.id}`;

        // 팀명 (customer.teamName이 없으면 고객명 표시)
        const teamName = order.customer?.teamName || '-';
        const customerName = order.customer?.name || '-';
        // 종목 (첫 번째 아이템 기준)
        const sport = order.items?.[0]?.sport || '';
        const sportLabel = SPORT_LABELS[sport] || sport || '-';
        // 상태 배지
        const statusBadge = getStatusBadge(order.status);
        // 금액
        const amount = order.payment?.totalAmount || order.total || 0;
        // 등록일
        const createdDate = order.createdAt ? formatDate(order.createdAt) : '-';

        row.innerHTML = `
            <td class="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">${order.orderNumber || '-'}</td>
            <td class="px-4 py-3 font-medium whitespace-nowrap">${escapeHtml(teamName)}</td>
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">${escapeHtml(customerName)}</td>
            <td class="px-4 py-3 whitespace-nowrap">${sportLabel}</td>
            <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">${escapeHtml(order.manager || '미배정')}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap font-medium">${formatCurrency(amount)}</td>
            <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">${createdDate}</td>
        `;
        tbody.appendChild(row);
    });

    // 테이블 표시, 로딩/빈상태 숨김
    showTable();
}

/**
 * 상태에 따른 배지 HTML 반환
 * 비유: 각 상태마다 다른 색 스티커를 붙여서 한눈에 구분
 */
function getStatusBadge(status) {
    const label = STATUS_LABELS[status] || status || '알 수 없음';

    // 상태를 4그룹으로 나눠 색상 결정
    const designStatuses = ['design_requested', 'draft_done', 'revision', 'design_confirmed'];
    const productionStatuses = ['payment_pending', 'payment_done', 'grading', 'line_work', 'in_production', 'production_done'];
    const shippingStatuses = ['released', 'shipped'];

    let badgeClass = 'badge-delivered'; // 기본: 회색
    if (designStatuses.includes(status)) badgeClass = 'badge-design';       // 파란색
    else if (productionStatuses.includes(status)) badgeClass = 'badge-production'; // 노란색
    else if (shippingStatuses.includes(status)) badgeClass = 'badge-shipping';     // 초록색
    // 보류: 주황색, 취소: 빨간색 (특수 상태는 별도 인라인 스타일)
    else if (status === 'hold') badgeClass = 'bg-orange-100 text-orange-700';
    else if (status === 'cancelled') badgeClass = 'bg-red-100 text-red-700';

    return `<span class="${badgeClass} text-xs font-medium px-2 py-1 rounded-full">${label}</span>`;
}

/**
 * 페이지네이션 렌더링
 * 비유: 책의 페이지 번호. [이전] [1] [2] [3] [다음] 형태
 */
function renderPagination(pagination) {
    const infoEl = document.getElementById('pagination-info');
    const buttonsEl = document.getElementById('pagination-buttons');

    // "총 N건 중 1-20" 형태의 정보 텍스트
    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    infoEl.textContent = `총 ${pagination.total}건 중 ${start}-${end}`;

    // 페이지 버튼 생성
    buttonsEl.innerHTML = '';

    // 이전 버튼
    if (pagination.page > 1) {
        buttonsEl.appendChild(createPageButton('이전', pagination.page - 1));
    }

    // 페이지 번호 버튼 (최대 5개 표시)
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

    // 페이지가 2개 이상일 때만 페이지네이션 표시
    const paginationEl = document.getElementById('pagination');
    paginationEl.classList.toggle('hidden', pagination.totalPages <= 1);
}

/** 페이지 버튼 요소 생성 헬퍼 */
function createPageButton(label, page) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'border border-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-100 transition-colors';
    btn.onclick = (e) => {
        e.stopPropagation();
        currentFilters.page = page;
        loadOrders();
    };
    return btn;
}

// ============================================================
// 탭 전환 함수들 (진행중 / 전체)
// ============================================================

/**
 * 탭 UI만 업데이트 (loadOrders 호출 없이 버튼 스타일만 변경)
 * applyFilters에서 상태 필터 변경 시 자동 탭 전환할 때 사용
 */
function switchTabUI(tab) {
    const tabActive = document.getElementById('tab-active');
    const tabAll = document.getElementById('tab-all');

    if (tab === 'active') {
        tabActive.className = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-gray-900 text-white';
        tabAll.className = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200';
    } else {
        tabAll.className = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-gray-900 text-white';
        tabActive.className = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200';
    }
}

/**
 * 탭 전환: "진행중" 또는 "전체" 탭 클릭 시 호출
 * 비유: 서랍을 바꾸는 것 — "진행중 서랍"에는 작업 중인 주문만, "전체 서랍"에는 모든 주문
 */
function switchTab(tab) {
    if (tab === 'active') {
        currentFilters.excludeCompleted = true;
    } else {
        currentFilters.excludeCompleted = false;
    }

    switchTabUI(tab); // 탭 버튼 스타일 변경
    currentFilters.page = 1;
    loadOrders();
}

/**
 * 탭 건수 업데이트: 서버 응답의 totalActive/totalAll로 양쪽 탭에 건수 표시
 * 비유: "진행중 (309건)" / "전체 (8,073건)" 식으로 숫자가 바뀜
 */
function updateTabCounts(pagination) {
    const activeCountEl = document.getElementById('tab-active-count');
    const allCountEl = document.getElementById('tab-all-count');

    // 서버가 항상 totalActive(진행중)와 totalAll(전체)을 보내주므로 단순 표시
    if (activeCountEl) activeCountEl.textContent = `(${pagination.totalActive})`;
    if (allCountEl) allCountEl.textContent = `(${pagination.totalAll})`;
}

/** 상태 카드 클릭 시 해당 상태 그룹으로 필터 */
function filterByStatus(group) {
    const select = document.getElementById('filter-status');

    // 상태 카드의 그룹(design/production/shipping/delivered)을
    // 실제 상태값 범위로 매핑
    const statusMap = {
        design: 'design_requested',      // 시안 관련 첫 번째 상태
        production: 'payment_pending',    // 제작 관련 첫 번째 상태
        shipping: 'released',            // 배송 관련 첫 번째 상태
        delivered: 'delivered',
        hold: 'hold',                    // 보류
        cancelled: 'cancelled'           // 취소
    };

    // 이미 같은 필터가 적용 중이면 해제 (토글 동작)
    if (currentFilters.status === statusMap[group]) {
        select.value = '';
        currentFilters.status = '';
    } else {
        // 간단히 그룹의 대표 상태만 필터링하는 대신,
        // 실제로는 검색 기능을 이용해야 하므로 select 값만 변경
        // (서버에서 정확한 status 값으로 필터링)
        select.value = statusMap[group] || '';
        currentFilters.status = select.value;
    }

    // 배송완료/취소 상태 카드 클릭 시 자동으로 "전체" 탭 전환
    if (['delivered', 'cancelled'].includes(currentFilters.status)) {
        currentFilters.excludeCompleted = false;
        switchTabUI('all');
    }

    currentFilters.page = 1;
    loadOrders();
}

/**
 * 결제 상태로 필터 (미수금 카드 클릭 시)
 * 비유: "돈 안 받은 주문만 보기" 버튼
 */
function filterByPaymentStatus(type) {
    if (type === 'unpaid') {
        // 미수금 필터: 서버에 unpaid=true 파라미터 전달
        // 비유: "돈 안 받은 주문만 보기" — 결제일이 비어있고 금액이 있는 주문
        const select = document.getElementById('filter-status');
        select.value = '';  // 상태 필터는 초기화
        currentFilters.status = '';
        currentFilters.unpaid = 'true';  // 미수금 전용 필터
        currentFilters.page = 1;
        loadOrders();
    }
}

/** 필터 드롭다운/입력 변경 시 호출 */
function applyFilters() {
    currentFilters.status = document.getElementById('filter-status').value;
    currentFilters.manager = document.getElementById('filter-manager').value;
    currentFilters.sport = document.getElementById('filter-sport').value;
    currentFilters.dealType = document.getElementById('filter-dealType').value;       // 거래유형
    currentFilters.dateFrom = document.getElementById('filter-dateFrom').value;       // 날짜 시작
    currentFilters.dateTo = document.getElementById('filter-dateTo').value;           // 날짜 끝
    currentFilters.amountMin = document.getElementById('filter-amountMin').value;     // 금액 최소
    currentFilters.amountMax = document.getElementById('filter-amountMax').value;     // 금액 최대
    currentFilters.unpaid = '';  // 일반 필터 사용 시 미수금 필터 해제

    // 배송완료/취소 상태를 선택하면 자동으로 "전체" 탭으로 전환
    // 비유: 완료 주문을 보려고 선택했는데 "진행중" 탭이면 결과가 0건 → 자동 전환
    if (['delivered', 'cancelled'].includes(currentFilters.status)) {
        currentFilters.excludeCompleted = false;
        switchTabUI('all'); // 탭 UI만 업데이트 (loadOrders는 아래에서 호출)
    }

    currentFilters.page = 1;
    loadOrders();
}

/** 검색 입력 시 엔터키로 검색 실행 */
function handleSearchKeyup(event) {
    if (event.key === 'Enter') {
        currentFilters.search = document.getElementById('filter-search').value.trim();
        currentFilters.page = 1;
        loadOrders();
    }
}

/** 모든 필터 초기화 */
function resetFilters() {
    // 1줄 필터 초기화
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-manager').value = '';
    document.getElementById('filter-sport').value = '';
    document.getElementById('filter-dealType').value = '';
    document.getElementById('filter-search').value = '';
    // 2줄 범위 필터 초기화
    document.getElementById('filter-dateFrom').value = '';
    document.getElementById('filter-dateTo').value = '';
    document.getElementById('filter-amountMin').value = '';
    document.getElementById('filter-amountMax').value = '';

    currentFilters = {
        status: '', manager: '', sport: '', dealType: '',
        search: '', unpaid: '',
        dateFrom: '', dateTo: '', amountMin: '', amountMax: '',
        excludeCompleted: true, // 초기화 시 "진행중" 탭으로 복원
        page: 1
    };
    // 탭 UI도 "진행중"으로 복원
    switchTabUI('active');
    loadOrders();
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
