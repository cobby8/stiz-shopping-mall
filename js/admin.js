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

// 월별 매출 차트 인스턴스 (업데이트 시 기존 차트를 파괴 후 재생성하기 위해 전역 관리)
let monthlyChartInstance = null;

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
    // 비유: 연도를 바꾸면 해당 연도의 매출/건수 등 통계 + 차트가 함께 갱신됨
    const yearSelect = document.getElementById('stats-year-select');
    if (yearSelect) {
        yearSelect.addEventListener('change', () => {
            loadStats(yearSelect.value);
            loadMonthlyChart(yearSelect.value);  // 차트도 연도에 맞게 갱신
            loadStaffStats(yearSelect.value);    // 담당자별 실적도 연도에 맞게 갱신
            loadTopCustomers(yearSelect.value);  // 고객별 매출 랭킹도 연도에 맞게 갱신
        });
    }

    // 3) 데이터 로드 — 현재 연도 기준 통계 + 차트 + 주문 목록
    const currentYear = new Date().getFullYear().toString();
    if (yearSelect) yearSelect.value = currentYear; // 드롭다운 기본값을 현재 연도로
    loadStats(currentYear);
    loadMonthlyChart(currentYear);  // 월별 매출 차트 초기 로드
    loadStaffStats(currentYear);    // 담당자별 실적 초기 로드
    loadTopCustomers(currentYear);  // 고객별 매출 랭킹 초기 로드
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

        // 미수금 탭 건수/금액 업데이트 — "미수금 (138건 / 6,910만원)" 형태
        const unpaidCountEl = document.getElementById('tab-unpaid-count');
        if (unpaidCountEl) {
            const unpaidCnt = stats.unpaidCount || 0;
            const unpaidAmt = stats.unpaidAmount || 0;
            // 금액이 큰 경우 만원 단위로 표시 (가독성)
            const amtText = unpaidAmt >= 10000
                ? Math.round(unpaidAmt / 10000).toLocaleString('ko-KR') + '만원'
                : unpaidAmt.toLocaleString('ko-KR') + '원';
            unpaidCountEl.textContent = `(${unpaidCnt}건 / ${amtText})`;
        }

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
        // 접수일 (매출 기준일: orderReceiptDate 우선, 없으면 createdAt 폴백)
        const receiptDate = order.orderReceiptDate || order.createdAt;
        const createdDate = receiptDate ? formatDate(receiptDate) : '-';

        row.innerHTML = `
            <td class="px-3 py-3 w-10" onclick="event.stopPropagation()">
                <input type="checkbox" class="order-checkbox w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red cursor-pointer"
                    data-order-id="${order.id}"
                    onchange="onOrderCheckboxChange()">
            </td>
            <td class="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">${order.orderNumber || '-'}</td>
            <td class="px-4 py-3 font-medium whitespace-nowrap">${escapeHtml(teamName)}</td>
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">${escapeHtml(customerName)}</td>
            <td class="px-4 py-3 whitespace-nowrap">${sportLabel}</td>
            <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">${escapeHtml(order.manager || '미배정')}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap font-medium">${formatCurrency(amount)}</td>
            <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">${createdDate}</td>
        `;

        // 행 클릭 시 주문 상세 페이지로 이동 (체크박스 영역은 stopPropagation으로 제외)
        row.onclick = () => window.location.href = `admin-order.html?id=${order.id}`;

        tbody.appendChild(row);
    });

    // 전체 선택 체크박스 초기화 + 일괄 작업 바 숨김
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
    updateBulkActionBar();

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
    const tabUnpaid = document.getElementById('tab-unpaid');

    // 기본 스타일 (비활성 상태)
    const inactiveClass = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200';
    const activeClass = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-gray-900 text-white';
    // 미수금 탭 전용 스타일
    const unpaidInactiveClass = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200';
    const unpaidActiveClass = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-orange-500 text-white border border-orange-500';

    // 모든 탭 비활성화
    tabActive.className = inactiveClass;
    tabAll.className = inactiveClass;
    if (tabUnpaid) tabUnpaid.className = unpaidInactiveClass;

    // 선택된 탭만 활성화
    if (tab === 'active') {
        tabActive.className = activeClass;
    } else if (tab === 'all') {
        tabAll.className = activeClass;
    } else if (tab === 'unpaid' && tabUnpaid) {
        tabUnpaid.className = unpaidActiveClass;
    }
}

/**
 * 탭 전환: "진행중" / "전체" / "미수금" 탭 클릭 시 호출
 * 비유: 서랍을 바꾸는 것 — "진행중 서랍", "전체 서랍", "외상 서랍"
 */
function switchTab(tab) {
    // 미수금 요약 패널은 미수금 탭에서만 표시
    const unpaidPanel = document.getElementById('unpaid-summary-panel');
    if (unpaidPanel) unpaidPanel.classList.add('hidden');

    if (tab === 'active') {
        currentFilters.excludeCompleted = true;
        currentFilters.unpaid = '';  // 미수금 필터 해제
    } else if (tab === 'all') {
        currentFilters.excludeCompleted = false;
        currentFilters.unpaid = '';  // 미수금 필터 해제
    } else if (tab === 'unpaid') {
        // 미수금 탭: 결제일 없고 금액 있는 주문만 표시
        currentFilters.excludeCompleted = false;
        currentFilters.unpaid = 'true';
        // 미수금 요약 패널 표시 + 데이터 로드
        if (unpaidPanel) unpaidPanel.classList.remove('hidden');
        loadUnpaidSummary();
    }

    switchTabUI(tab); // 탭 버튼 스타일 변경
    currentFilters.page = 1;
    loadOrders();
}

/**
 * 탭 건수 업데이트: 서버 응답의 totalActive/totalAll로 양쪽 탭에 건수 표시
 * 비유: "진행중 (309건)" / "전체 (8,073건)" / "미수금 (138건)" 식으로 숫자가 바뀜
 */
function updateTabCounts(pagination) {
    const activeCountEl = document.getElementById('tab-active-count');
    const allCountEl = document.getElementById('tab-all-count');

    // 서버가 항상 totalActive(진행중)와 totalAll(전체)을 보내주므로 단순 표시
    if (activeCountEl) activeCountEl.textContent = `(${pagination.totalActive})`;
    if (allCountEl) allCountEl.textContent = `(${pagination.totalAll})`;

    // 미수금 탭 건수는 stats에서 가져오므로 여기서는 건수만 있을 때만 업데이트
    // (stats 로드 시 별도로 updateUnpaidTabCount 호출)
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

/**
 * 미수금 요약 패널에 고객별 미수금 TOP 리스트를 렌더링
 * GET /api/admin/stats에서 unpaidByCustomer 데이터를 가져와 테이블에 표시
 * 비유: 외상 장부에서 누가 가장 많이 밀렸는지 순위를 매기는 것
 */
async function loadUnpaidSummary() {
    try {
        // 현재 연도 선택값을 가져와서 해당 연도 미수금 집계 요청
        const yearSelect = document.getElementById('stats-year-select');
        const selectedYear = yearSelect ? yearSelect.value : new Date().getFullYear().toString();

        const res = await adminFetch(`/api/admin/stats?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const unpaidList = data.stats.unpaidByCustomer || [];
        const tbody = document.getElementById('unpaid-summary-tbody');
        if (!tbody) return;

        if (unpaidList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-sm text-gray-400">미수금 내역이 없습니다.</td></tr>';
            return;
        }

        // 고객별 미수금 테이블 렌더링
        tbody.innerHTML = unpaidList.map((item, idx) => `
            <tr class="border-b border-orange-50 hover:bg-orange-25">
                <td class="px-3 py-2 text-gray-500 font-medium">${idx + 1}</td>
                <td class="px-3 py-2 font-medium">${escapeHtml(item.customerName)}</td>
                <td class="px-3 py-2 text-gray-600">${escapeHtml(item.teamName)}</td>
                <td class="px-3 py-2 text-right">${item.count}건</td>
                <td class="px-3 py-2 text-right font-bold text-orange-600">${formatCurrency(item.totalAmount)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('[Admin] 미수금 요약 로드 실패:', error);
    }
}

// ============================================================
// 월별 매출 차트 (D-1)
// ============================================================

/**
 * 금액을 읽기 쉬운 단위로 포맷 (차트 축 표시용)
 * 비유: 675000000 → "6.8억", 45000000 → "4,500만"
 * @param {number} value - 원 단위 금액
 * @returns {string} - 읽기 쉬운 한국어 금액
 */
function formatChartAmount(value) {
    if (value >= 100000000) {
        // 1억 이상: 억 단위 (소수점 1자리)
        return (value / 100000000).toFixed(1) + '억';
    } else if (value >= 10000) {
        // 1만 이상: 만 단위 (정수)
        return Math.round(value / 10000).toLocaleString('ko-KR') + '만';
    }
    return value.toLocaleString('ko-KR');
}

/**
 * 월별 매출 차트 로드 및 렌더링
 * API에서 월별 데이터를 가져와 Chart.js 복합 차트(막대+라인) 생성
 * 비유: 월별 매출 막대그래프 위에 주문수 꺾은선을 겹쳐 그려서 추이를 한눈에 파악
 * @param {string} year - 조회할 연도 (예: '2026')
 */
async function loadMonthlyChart(year) {
    const chartLoading = document.getElementById('chart-loading');
    const chartTitle = document.getElementById('chart-title');

    try {
        // 로딩 표시
        if (chartLoading) chartLoading.classList.remove('hidden');

        const selectedYear = year || new Date().getFullYear().toString();

        // 차트 제목 업데이트 — "2026년 월별 매출 추이"
        if (chartTitle) chartTitle.textContent = `${selectedYear}년 월별 매출 추이`;

        // API 호출: 월별 매출/주문수 데이터 가져오기
        const res = await adminFetch(`/api/admin/stats/monthly?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const monthly = data.monthly; // [{month:1, revenue:금액, orders:건수}, ...]

        // X축 라벨: 1월~12월
        const labels = monthly.map(m => `${m.month}월`);
        // 막대 데이터: 월별 매출
        const revenueData = monthly.map(m => m.revenue);
        // 라인 데이터: 월별 주문수
        const ordersData = monthly.map(m => m.orders);

        // 기존 차트가 있으면 파괴 (메모리 누수 방지)
        if (monthlyChartInstance) {
            monthlyChartInstance.destroy();
            monthlyChartInstance = null;
        }

        // 캔버스 요소 가져오기
        const ctx = document.getElementById('monthlyChart');
        if (!ctx) return;

        // Chart.js 복합 차트 생성
        // 막대(bar): 매출 → 왼쪽 Y축
        // 라인(line): 주문수 → 오른쪽 Y축
        monthlyChartInstance = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        // 막대 차트: 월별 매출
                        type: 'bar',
                        label: '매출',
                        data: revenueData,
                        backgroundColor: 'rgba(230, 57, 70, 0.7)',   // brand-red 계열 (반투명)
                        borderColor: 'rgba(230, 57, 70, 1)',
                        borderWidth: 1,
                        borderRadius: 4,                              // 모서리 둥글게
                        yAxisID: 'y-revenue',                         // 왼쪽 Y축에 연결
                        order: 2                                      // 막대가 라인 뒤에 (겹칠 때)
                    },
                    {
                        // 라인 차트: 월별 주문수
                        type: 'line',
                        label: '주문수',
                        data: ordersData,
                        borderColor: '#111111',                       // brand-black
                        backgroundColor: 'rgba(17, 17, 17, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#111111',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.3,                                 // 부드러운 곡선
                        yAxisID: 'y-orders',                          // 오른쪽 Y축에 연결
                        order: 1                                      // 라인이 막대 위에
                    }
                ]
            },
            options: {
                responsive: true,                  // 컨테이너에 맞게 크기 자동 조절
                maintainAspectRatio: false,         // 높이를 컨테이너에 맞춤
                interaction: {
                    mode: 'index',                 // 같은 X축 위치의 모든 데이터셋 동시 표시
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true,
                            padding: 16,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        // 툴팁에서 매출은 원화 형식, 주문수는 건 단위로 표시
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.label === '매출') {
                                    return '매출: ' + context.raw.toLocaleString('ko-KR') + '원';
                                }
                                return '주문수: ' + context.raw + '건';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false }   // X축 격자선 숨김 (깔끔하게)
                    },
                    // 왼쪽 Y축: 매출 (원 단위 → 억/만 단위로 표시)
                    'y-revenue': {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            callback: function(value) {
                                return formatChartAmount(value);
                            },
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: '매출',
                            font: { size: 11, weight: 'bold' },
                            color: '#E63946'        // brand-red
                        }
                    },
                    // 오른쪽 Y축: 주문수 (건)
                    'y-orders': {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },  // 오른쪽 축 격자선은 그리지 않음
                        ticks: {
                            callback: function(value) {
                                return value + '건';
                            },
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: '주문수',
                            font: { size: 11, weight: 'bold' },
                            color: '#111111'        // brand-black
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('[Admin] 월별 차트 로드 실패:', error);
    } finally {
        // 로딩 표시 숨김
        if (chartLoading) chartLoading.classList.add('hidden');
    }
}

// ============================================================
// 담당자별 실적 (D-2)
// ============================================================

/**
 * 담당자별 실적 데이터를 로드하여 테이블에 렌더링
 * API에서 담당자별 주문수/매출/완료율/평균 처리일을 가져와 표시
 * 비유: 직원별 성적표를 서버에서 가져와 테이블로 정리해 보여주는 것
 * @param {string} year - 조회할 연도 (예: '2026')
 */
async function loadStaffStats(year) {
    const staffLoading = document.getElementById('staff-loading');
    const staffTitle = document.getElementById('staff-title');
    const tbody = document.getElementById('staff-stats-tbody');
    const emptyEl = document.getElementById('staff-empty');

    if (!tbody) return;

    try {
        // 로딩 표시
        if (staffLoading) staffLoading.classList.remove('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');

        const selectedYear = year || new Date().getFullYear().toString();

        // 제목 업데이트 — "2026년 담당자별 실적"
        if (staffTitle) staffTitle.textContent = `${selectedYear}년 담당자별 실적`;

        // API 호출: 담당자별 실적 데이터 가져오기
        const res = await adminFetch(`/api/admin/stats/staff?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const staffList = data.staff || [];

        // 데이터 없으면 빈 상태 표시
        if (staffList.length === 0) {
            tbody.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }

        // 테이블 렌더링
        tbody.innerHTML = staffList.map(s => {
            // 매출 포맷: 1억 이상이면 "X.X억", 1만 이상이면 "X,XXX만원", 그 외 원 단위
            const revenueText = formatStaffRevenue(s.revenue);

            // 완료율 색상: 80% 이상 초록, 50~80% 노랑, 50% 미만 빨강
            // 비유: 신호등 색깔로 성과를 직관적으로 표시
            let rateColor = 'text-gray-600'; // 기본
            if (s.completionRate >= 80) {
                rateColor = 'text-green-600';
            } else if (s.completionRate >= 50) {
                rateColor = 'text-amber-600';
            } else if (s.completionRate > 0) {
                rateColor = 'text-red-500';
            }

            // 평균 처리일: 데이터가 없으면 "-" 표시
            const avgDaysText = s.avgDays !== null ? `${s.avgDays}일` : '-';

            return `
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3 font-medium whitespace-nowrap">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">${s.orders.toLocaleString('ko-KR')}건</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap font-medium">${revenueText}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap font-medium ${rateColor}">${s.completionRate}%</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap text-gray-600">${avgDaysText}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('[Admin] 담당자별 실적 로드 실패:', error);
    } finally {
        // 로딩 표시 숨김
        if (staffLoading) staffLoading.classList.add('hidden');
    }
}

/**
 * 담당자별 매출 금액을 읽기 쉬운 단위로 포맷
 * 비유: 큰 숫자를 "2.3억" 또는 "4,500만원" 같이 한눈에 볼 수 있게 변환
 * @param {number} amount - 원 단위 금액
 * @returns {string} - 포맷된 금액 문자열
 */
function formatStaffRevenue(amount) {
    if (!amount && amount !== 0) return '-';
    if (amount >= 100000000) {
        // 1억 이상: "X.X억" (소수점 1자리)
        return (amount / 100000000).toFixed(1) + '억';
    } else if (amount >= 10000000) {
        // 1천만 이상: "X,XXX만원"
        return Math.round(amount / 10000).toLocaleString('ko-KR') + '만원';
    } else if (amount >= 10000) {
        // 1만 이상: "XXX만원"
        return Math.round(amount / 10000).toLocaleString('ko-KR') + '만원';
    }
    // 1만 미만: 원 단위
    return amount.toLocaleString('ko-KR') + '원';
}

// ============================================================
// 고객별 매출 랭킹 TOP 20 (D-3)
// ============================================================

/**
 * 고객별 매출 랭킹 데이터를 로드하여 테이블에 렌더링
 * API에서 매출 TOP 20 고객 + 재주문율을 가져와 표시
 * 비유: VIP 고객 순위표 — 누가 가장 많이 사고, 단골인지 한눈에 파악
 * @param {string} year - 조회할 연도 (예: '2026')
 */
async function loadTopCustomers(year) {
    const loading = document.getElementById('top-customers-loading');
    const title = document.getElementById('top-customers-title');
    const tbody = document.getElementById('top-customers-tbody');
    const emptyEl = document.getElementById('top-customers-empty');
    const repeatBadge = document.getElementById('top-customers-repeat');

    if (!tbody) return;

    try {
        // 로딩 표시
        if (loading) loading.classList.remove('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');
        if (repeatBadge) repeatBadge.classList.add('hidden');

        const selectedYear = year || new Date().getFullYear().toString();

        // 제목 업데이트 — "2026년 고객별 매출 랭킹 TOP 20"
        if (title) title.textContent = `${selectedYear}년 고객별 매출 랭킹 TOP 20`;

        // API 호출: 고객별 매출 TOP 20 데이터 가져오기
        const res = await adminFetch(`/api/admin/stats/top-customers?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const customers = data.customers || [];

        // 재주문율 배지 표시 — "재주문율 42% (126/300명)"
        if (repeatBadge && data.totalCustomers > 0) {
            repeatBadge.textContent = `재주문율 ${data.repeatRate}% (${data.repeatCount}/${data.totalCustomers}명)`;
            repeatBadge.classList.remove('hidden');
        }

        // 데이터 없으면 빈 상태 표시
        if (customers.length === 0) {
            tbody.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }

        // 거래유형별 배지 색상 매핑
        // 비유: 고객 유형마다 다른 색 이름표를 달아주는 것
        const dealTypeColors = {
            '동호회': 'bg-blue-50 text-blue-700',
            '대학동아리': 'bg-purple-50 text-purple-700',
            '학원SC': 'bg-green-50 text-green-700',
            '프로스포츠구단': 'bg-red-50 text-red-700',
            '재고': 'bg-gray-100 text-gray-600',
            '기타': 'bg-gray-50 text-gray-500',
            '미분류': 'bg-gray-50 text-gray-400'
        };

        // 테이블 렌더링
        tbody.innerHTML = customers.map((c, idx) => {
            // 매출 포맷 (D-2의 formatStaffRevenue 재활용)
            const revenueText = formatStaffRevenue(c.revenue);

            // 순위 메달: 1~3위는 금/은/동 색상으로 강조
            let rankDisplay = `${idx + 1}`;
            if (idx === 0) rankDisplay = '<span class="text-amber-500 font-bold">1</span>';
            else if (idx === 1) rankDisplay = '<span class="text-gray-400 font-bold">2</span>';
            else if (idx === 2) rankDisplay = '<span class="text-amber-700 font-bold">3</span>';

            // 거래유형 배지 색상
            const dealColor = dealTypeColors[c.dealType] || 'bg-gray-50 text-gray-500';

            // 재주문 여부 표시: 단골이면 초록 체크, 신규면 회색 X
            const repeatIcon = c.isRepeat
                ? '<span class="text-green-500 text-xs font-medium">단골</span>'
                : '<span class="text-gray-300 text-xs">신규</span>';

            // 최근 주문일 포맷: "03/26" 형태
            const lastDate = c.lastOrderDate ? formatDate(c.lastOrderDate) : '-';

            return `
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="px-3 py-3 text-center whitespace-nowrap">${rankDisplay}</td>
                    <td class="px-3 py-3 font-medium whitespace-nowrap">${escapeHtml(c.name)}</td>
                    <td class="px-3 py-3 text-gray-600 whitespace-nowrap">${escapeHtml(c.teamName)}</td>
                    <td class="px-3 py-3 whitespace-nowrap">
                        <span class="${dealColor} text-xs px-2 py-0.5 rounded-full">${escapeHtml(c.dealType)}</span>
                    </td>
                    <td class="px-3 py-3 text-right whitespace-nowrap">${c.orders}건</td>
                    <td class="px-3 py-3 text-right whitespace-nowrap font-medium">${revenueText}</td>
                    <td class="px-3 py-3 text-center whitespace-nowrap">${repeatIcon}</td>
                    <td class="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">${lastDate}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('[Admin] 고객별 매출 랭킹 로드 실패:', error);
    } finally {
        // 로딩 표시 숨김
        if (loading) loading.classList.add('hidden');
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
    // 미수금 요약 패널 숨기기
    const unpaidPanel = document.getElementById('unpaid-summary-panel');
    if (unpaidPanel) unpaidPanel.classList.add('hidden');
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

// ============================================================
// CSV 내보내기 (D-5)
// ============================================================

/**
 * 현재 필터 조건의 주문 데이터를 CSV 파일로 다운로드
 * 비유: 현재 화면에 보이는 주문 목록을 엑셀용 파일로 저장하는 것
 *
 * 동작 방식:
 * 1. 현재 필터 조건 그대로 서버에 요청 (단, limit을 크게 잡아 전체 데이터 확보)
 * 2. 주문 데이터를 CSV 텍스트로 변환 (한글 헤더 + BOM 포함)
 * 3. 브라우저가 자동으로 파일 다운로드 시작
 */
async function exportToCSV() {
    try {
        // --- 1단계: 현재 필터 조건으로 전체 데이터 요청 ---
        // 페이지네이션 무시하고 최대 10,000건까지 가져옴
        const params = new URLSearchParams();
        if (currentFilters.status) params.set('status', currentFilters.status);
        if (currentFilters.manager) params.set('manager', currentFilters.manager);
        if (currentFilters.sport) params.set('sport', currentFilters.sport);
        if (currentFilters.dealType) params.set('dealType', currentFilters.dealType);
        if (currentFilters.search) params.set('search', currentFilters.search);
        if (currentFilters.unpaid) params.set('unpaid', currentFilters.unpaid);
        if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom);
        if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo);
        if (currentFilters.amountMin) params.set('amountMin', currentFilters.amountMin);
        if (currentFilters.amountMax) params.set('amountMax', currentFilters.amountMax);
        params.set('excludeCompleted', currentFilters.excludeCompleted);
        params.set('page', 1);
        params.set('limit', 10000); // 페이지네이션 무시: 전체 데이터 요청

        const res = await adminFetch(`/api/admin/orders?${params.toString()}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success || !data.orders || data.orders.length === 0) {
            alert('내보낼 주문 데이터가 없습니다.');
            return;
        }

        // --- 2단계: CSV 문자열 생성 ---
        // 한글 헤더 (엑셀에서 열었을 때 바로 이해 가능)
        const headers = ['주문번호', '주문일', '고객명', '팀명', '거래유형', '상태', '종목', '담당자', '금액', '결제상태'];

        // 각 주문을 CSV 행으로 변환
        const rows = data.orders.map(order => {
            // 주문번호
            const orderNumber = order.orderNumber || '';
            // 주문일 (YYYY-MM-DD 형식)
            const createdAt = order.createdAt ? order.createdAt.substring(0, 10) : '';
            // 고객 정보
            const customerName = order.customer?.name || '';
            const teamName = order.customer?.teamName || '';
            // 거래유형 (customer 객체 또는 주문 자체에 있을 수 있음)
            const dealType = order.customer?.dealType || order.dealType || '';
            // 상태를 한글로 변환
            const status = STATUS_LABELS[order.status] || order.status || '';
            // 종목 한글 변환
            const sport = SPORT_LABELS[order.items?.[0]?.sport] || order.items?.[0]?.sport || '';
            // 담당자
            const manager = order.manager || '';
            // 금액 (숫자만, 쉼표 없이 — 엑셀에서 숫자로 인식하도록)
            const amount = order.payment?.totalAmount || order.total || 0;
            // 결제상태: 결제일이 있으면 "결제완료", 없으면 "미결제"
            const paymentStatus = order.payment?.paidDate ? '결제완료' : (amount > 0 ? '미결제' : '-');

            // CSV에서 쉼표/줄바꿈이 포함된 값은 큰따옴표로 감싸야 함
            return [orderNumber, createdAt, customerName, teamName, dealType, status, sport, manager, amount, paymentStatus]
                .map(val => csvEscape(val))
                .join(',');
        });

        // 헤더 + 데이터 행을 줄바꿈으로 연결
        const csvContent = [headers.join(','), ...rows].join('\n');

        // --- 3단계: BOM 추가 후 다운로드 ---
        // BOM(Byte Order Mark): 엑셀이 UTF-8 한글을 제대로 인식하게 하는 마법의 3바이트
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

        // 파일명: "주문목록_2026-03-31.csv" 형식
        const today = new Date();
        const dateStr = today.getFullYear() + '-'
            + String(today.getMonth() + 1).padStart(2, '0') + '-'
            + String(today.getDate()).padStart(2, '0');
        const fileName = `주문목록_${dateStr}.csv`;

        // 다운로드 트리거: 임시 링크를 만들어 클릭 시뮬레이션
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        // 메모리 정리
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('[Admin] CSV 내보내기 실패:', error);
        alert('CSV 내보내기 중 오류가 발생했습니다.');
    }
}

/**
 * CSV 값 이스케이프 처리
 * 값에 쉼표, 큰따옴표, 줄바꿈이 있으면 큰따옴표로 감싸고, 내부 큰따옴표는 두 번으로 치환
 * 비유: 셀 안에 쉼표가 있으면 엑셀이 다음 컬럼으로 착각하니까, 따옴표로 보호하는 것
 */
function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // 쉼표, 큰따옴표, 줄바꿈이 있으면 큰따옴표로 감싸기
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/** 로그아웃 */
function handleLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    localStorage.removeItem('stiz_admin_token');
    window.location.href = 'admin-login.html';
}

// ============================================================
// 일괄 상태 변경 (D-4)
// 비유: 이메일에서 여러 건을 체크한 후 "읽음 처리" 하는 것처럼
//       여러 주문을 선택해서 한번에 상태를 바꾸는 기능
// ============================================================

/**
 * 전체 선택/해제 토글
 * 헤더의 체크박스 클릭 시 현재 페이지의 모든 주문 체크박스를 on/off
 */
function toggleSelectAll(headerCheckbox) {
    const checkboxes = document.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = headerCheckbox.checked;
    });
    // 선택 건수 업데이트 + 일괄 작업 바 표시/숨김
    updateBulkActionBar();
}

/**
 * 개별 체크박스 변경 시 호출
 * 선택 건수를 업데이트하고, 전체 선택 체크박스 상태도 동기화
 */
function onOrderCheckboxChange() {
    const checkboxes = document.querySelectorAll('.order-checkbox');
    const selectAllCb = document.getElementById('select-all-checkbox');
    const checkedCount = document.querySelectorAll('.order-checkbox:checked').length;

    // 전체 선택 체크박스: 모든 개별 체크박스가 선택됐으면 체크, 아니면 해제
    if (selectAllCb) {
        selectAllCb.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
    }

    updateBulkActionBar();
}

/**
 * 일괄 작업 바 표시/숨김 + 선택 건수 텍스트 갱신
 * 비유: 선택한 항목이 있을 때만 하단에 "N건 선택됨" 바가 나타나는 것
 */
function updateBulkActionBar() {
    const bar = document.getElementById('bulk-action-bar');
    const countSpan = document.getElementById('bulk-selected-count');
    const checkedCount = document.querySelectorAll('.order-checkbox:checked').length;

    if (checkedCount > 0) {
        // 선택된 항목이 있으면 바 표시
        bar.classList.remove('hidden');
        countSpan.textContent = `${checkedCount}건 선택됨`;
    } else {
        // 선택된 항목이 없으면 바 숨김
        bar.classList.add('hidden');
    }
}

/**
 * 모든 체크박스 선택 해제
 * "선택 해제" 버튼 클릭 시 호출
 */
function clearAllCheckboxes() {
    const checkboxes = document.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => { cb.checked = false; });
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
    updateBulkActionBar();
}

/**
 * 선택된 주문들의 상태를 일괄 변경
 * 드롭다운에서 선택한 상태로 체크된 모든 주문의 상태를 한번에 변경
 */
async function bulkUpdateStatus() {
    // 1) 선택된 주문 ID 수집
    const checkedBoxes = document.querySelectorAll('.order-checkbox:checked');
    const orderIds = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.orderId));

    if (orderIds.length === 0) {
        alert('변경할 주문을 선택하세요.');
        return;
    }

    // 2) 변경할 상태 확인
    const statusSelect = document.getElementById('bulk-status-select');
    const newStatus = statusSelect.value;
    if (!newStatus) {
        alert('변경할 상태를 선택하세요.');
        return;
    }

    // 3) 사용자 확인 (실수 방지)
    const statusLabel = STATUS_LABELS[newStatus] || newStatus;
    if (!confirm(`${orderIds.length}건의 주문을 "${statusLabel}" 상태로 변경하시겠습니까?`)) {
        return;
    }

    // 4) 서버 API 호출
    try {
        const res = await adminFetch('/api/admin/orders/bulk-status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderIds, status: newStatus })
        });

        if (!res) return;

        const data = await res.json();
        if (data.success) {
            alert(`${data.updated}건 변경 완료` + (data.failed > 0 ? ` (${data.failed}건 실패)` : ''));
            // 성공 시: 드롭다운 초기화 + 체크박스 해제 + 목록 새로고침
            statusSelect.value = '';
            clearAllCheckboxes();
            loadOrders();
            // 통계도 갱신 (상태가 바뀌면 카드 숫자도 변해야 하므로)
            const yearSelect = document.getElementById('stats-year-select');
            if (yearSelect) loadStats(yearSelect.value);
        } else {
            alert('일괄 변경 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[Admin] 일괄 상태 변경 실패:', error);
        alert('일괄 상태 변경 중 오류가 발생했습니다.');
    }
}
