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
// 상수 정의 (공통 상수는 admin-common.js에서 로드)
// ============================================================

// 고객 등급 계산 함수 (주문 목록에서 VIP/단골 배지 표시용)
// 서버의 calculateGrade와 동일한 기준을 프론트에서도 사용
function getCustomerGradeBadge(customer) {
    if (!customer) return '';
    const totalSpent = customer.totalSpent || 0;
    const orderCount = customer.orderCount || 0;

    // VIP: 총매출 500만원 이상 또는 주문 5건 이상
    if (totalSpent >= 5000000 || orderCount >= 5) {
        return '<span class="ml-1 text-xs font-bold px-1.5 py-0.5 rounded" style="background:#fef3c7;color:#92400e;border:1px solid #f59e0b;">VIP</span>';
    }
    // 단골: 총매출 100만원 이상 또는 주문 2건 이상
    if (totalSpent >= 1000000 || orderCount >= 2) {
        return '<span class="ml-1 text-xs font-bold px-1.5 py-0.5 rounded" style="background:#dbeafe;color:#1e40af;border:1px solid #3b82f6;">단골</span>';
    }
    return '';  // 일반/신규는 주문 목록에서 배지 표시하지 않음
}

// 태그 → CSS 클래스 매핑 (주문 목록에서 팀명 옆에 작은 배지로 표시)
// 비유: 프리셋 태그는 고유 색상, 나머지는 기본 초록 톤
const TAG_MINI_CLASS = {
    '급함': 'tag-mini-urgent',
    'VIP': 'tag-mini-vip',
    '수정요청': 'tag-mini-revision',
    '확인필요': 'tag-mini-check',
    '보류': 'tag-mini-hold',
};

/**
 * 주문의 tags 배열을 작은 배지 HTML로 변환
 * @param {string[]} tags - 태그 배열
 * @returns {string} 배지 HTML 문자열
 */
function getTagBadges(tags) {
    if (!tags || tags.length === 0) return '';
    return tags.map(tag => {
        const cls = TAG_MINI_CLASS[tag] || 'tag-mini-custom';
        return `<span class="tag-mini ${cls}">${escapeHtml(tag)}</span>`;
    }).join('');
}

// 상태별 탭 정의 — 진행중 주문을 세부 상태별로 나눠보기 위한 탭 목록
// 비유: "진행중" 서랍을 열면 그 안에 "시안요청", "제작중" 등 작은 칸막이가 있는 것
const STATUS_TABS = [
    { code: '', label: '전체 진행중' },
    { code: 'design_requested', label: '시안요청' },
    { code: 'design_confirmed', label: '디자인확정' },
    { code: 'draft_done', label: '초안완료' },
    { code: 'line_work', label: '라인작업' },
    { code: 'in_production', label: '제작중' },
    { code: 'released', label: '출고' },
    { code: 'hold', label: '보류' }
];

// ============================================================
// D-day 계산 헬퍼 — 납기까지 남은 일수를 계산
// 비유: 시험일까지 남은 날을 세는 것. 음수면 이미 지남
// ============================================================

/**
 * 희망납기(desiredDate)까지 남은 일수를 계산하여 { text, cssClass } 반환
 * @param {string} desiredDate - ISO 날짜 문자열 (예: "2026-04-05T00:00:00.000Z")
 * @param {string} orderStatus - 주문 상태 (delivered/cancelled면 표시 안 함)
 * @returns {{ text: string, cssClass: string }} D-day 텍스트와 CSS 클래스
 */
function calcDday(desiredDate, orderStatus) {
    // 완료/취소 주문은 D-day 표시 안 함
    if (!desiredDate || orderStatus === 'delivered' || orderStatus === 'cancelled') {
        return { text: '-', cssClass: '' };
    }

    // 오늘 자정과 납기일 자정의 차이를 일(day) 단위로 계산
    const today = new Date();
    today.setHours(0, 0, 0, 0);                    // 오늘 0시로 통일
    const deadline = new Date(desiredDate);
    deadline.setHours(0, 0, 0, 0);                  // 납기일도 0시로 통일

    const diffMs = deadline - today;                 // 밀리초 차이
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)); // 일 단위 변환

    // D-day 텍스트 생성 (D-3, D-day, D+2 형태)
    let text, cssClass;
    if (diffDays > 0) {
        text = `D-${diffDays}`;                      // 3일 남음 → "D-3"
    } else if (diffDays === 0) {
        text = 'D-day';                              // 오늘이 납기일
    } else {
        text = `D+${Math.abs(diffDays)}`;            // 2일 초과 → "D+2"
    }

    // 색상 클래스 결정 — 초록(여유) / 주황(임박) / 빨강(초과)
    if (diffDays > 3) {
        cssClass = 'dday-safe';                      // 4일 이상 남음: 초록
    } else if (diffDays >= 1) {
        cssClass = 'dday-warn';                      // 1~3일 남음: 주황 (주의)
    } else {
        cssClass = 'dday-danger';                    // D-day 또는 초과: 빨강 (위험)
    }

    return { text, cssClass };
}

// 현재 선택된 메인 탭을 추적 (active/all/unpaid)
let currentMainTab = 'active';

// 현재 필터 상태를 저장하는 객체 (비유: 검색 조건표)
let currentFilters = {
    status: '',
    manager: '',
    sport: '',
    dealType: '',           // 거래유형 필터 추가
    tag: '',                // 태그 필터 (예: '급함', 'VIP')
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
        // 연도 변경 시 통계 카드만 갱신 (차트/실적/랭킹은 admin-analytics.html로 이동됨)
        yearSelect.addEventListener('change', () => {
            loadStats(yearSelect.value);
        });
    }

    // 3) 데이터 로드 — 현재 연도 기준 통계 + 차트 + 주문 목록
    const currentYear = new Date().getFullYear().toString();
    if (yearSelect) yearSelect.value = currentYear; // 드롭다운 기본값을 현재 연도로
    loadStats(currentYear);
    // 차트/실적/랭킹 초기 로드 제거: admin-analytics.html로 이동됨
    loadOrders();
});

// 인증/API 함수는 admin-common.js에서 로드 (checkAdminAuth, getAdminToken, adminFetch)

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
        if (currentFilters.tag) params.set('tag', currentFilters.tag);                   // 태그 필터
        if (currentFilters.search) params.set('search', currentFilters.search);
        if (currentFilters.unpaid) params.set('unpaid', currentFilters.unpaid);            // 미수금 필터
        // 범위 필터: 날짜와 금액 (값이 있을 때만 서버로 전달)
        if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom);
        if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo);
        if (currentFilters.amountMin) params.set('amountMin', currentFilters.amountMin);
        if (currentFilters.amountMax) params.set('amountMax', currentFilters.amountMax);
        // 정렬 기준 — 납기순(deadline) 등 커스텀 정렬 지원
        if (currentFilters.sortBy) params.set('sortBy', currentFilters.sortBy);
        // 완료 주문 제외 여부 — "진행중" 탭이면 true, "전체" 탭이면 false
        params.set('excludeCompleted', currentFilters.excludeCompleted);
        params.set('page', currentFilters.page);
        // 진행중 탭(약 300건)은 페이지 나누지 않고 전체를 한번에 표시
        // 전체/미수금 탭은 건수가 많으므로 기존 20건 페이지네이션 유지
        const limit = (currentMainTab === 'active') ? 9999 : 20;
        params.set('limit', limit);

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
        // 고객 등급 배지 (VIP/단골만 표시, 일반/신규는 생략)
        const gradeBadge = getCustomerGradeBadge(order.customer);
        // 종목 (첫 번째 아이템 기준)
        const sport = order.items?.[0]?.sport || '';
        const sportLabel = SPORT_LABELS[sport] || sport || '-';
        // 품목 표시: items가 여러 개면 "유니폼 외 N건" 형태로 표시
        const itemCount = order.items?.length || 0;
        const firstItemName = order.items?.[0]?.name || '품목없음';
        const itemDisplay = itemCount > 1
            ? `${firstItemName} 외 ${itemCount - 1}건`
            : firstItemName;
        // 상태 배지
        const statusBadge = getStatusBadge(order.status);
        // 금액
        const amount = order.payment?.totalAmount || order.total || 0;
        // 접수일 (매출 기준일: orderReceiptDate 우선, 없으면 createdAt 폴백)
        const receiptDate = order.orderReceiptDate || order.createdAt;
        const createdDate = receiptDate ? formatDate(receiptDate) : '-';

        // D-day 계산: 희망납기까지 남은 일수 (초록/주황/빨강으로 긴급도 표시)
        const dday = calcDday(order.shipping?.desiredDate, order.status);

        row.innerHTML = `
            <td class="px-3 py-3 w-10" onclick="event.stopPropagation()">
                <input type="checkbox" class="order-checkbox w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red cursor-pointer"
                    data-order-id="${order.id}"
                    onchange="onOrderCheckboxChange()">
            </td>
            <td class="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">${order.orderNumber || '-'}</td>
            <td class="px-4 py-3 font-medium whitespace-nowrap">${escapeHtml(teamName)}${gradeBadge}${getTagBadges(order.tags)}</td>
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">${escapeHtml(customerName)}</td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span>${sportLabel}</span>
                ${itemCount > 1 ? `<span class="ml-1 text-xs text-gray-400">(${itemDisplay})</span>` : ''}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">${escapeHtml(order.manager || '미배정')}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap font-medium">${formatCurrency(amount)}</td>
            <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">${createdDate}</td>
            <td class="px-4 py-3 text-center text-xs whitespace-nowrap ${dday.cssClass}">${dday.text}</td>
        `;

        // 행 클릭 시 주문 상세 페이지로 이동 (체크박스 영역은 stopPropagation으로 제외)
        row.onclick = () => window.location.href = `admin-order.html?id=${order.id}`;

        tbody.appendChild(row);
    });

    // 납기 임박 건수 계산: D-3 이내(D-day, D+N 포함)인 진행중 주문만 카운트
    // 비유: "3일 안에 납품해야 하는 주문이 몇 건인가?" 세는 것
    let deadlineCount = 0;
    orders.forEach(order => {
        if (order.status === 'delivered' || order.status === 'cancelled') return;
        if (!order.shipping?.desiredDate) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const dl = new Date(order.shipping.desiredDate); dl.setHours(0, 0, 0, 0);
        const diff = Math.round((dl - today) / (1000 * 60 * 60 * 24));
        if (diff <= 3) deadlineCount++;              // D-3 이하면 "임박"으로 카운트
    });

    // 납기 임박 경고 배지 표시/숨김
    const deadlineWrap = document.getElementById('deadline-alert-wrap');
    const deadlineStat = document.getElementById('stat-deadline');
    if (deadlineWrap && deadlineStat) {
        if (deadlineCount > 0) {
            deadlineWrap.classList.remove('hidden');
            deadlineStat.textContent = `${deadlineCount}건`;
        } else {
            deadlineWrap.classList.add('hidden');
        }
    }

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

    // 진행중 탭이면 페이지네이션 항상 숨김 (전체 한번에 표시)
    // 전체/미수금 탭은 페이지가 2개 이상일 때만 표시
    const paginationEl = document.getElementById('pagination');
    if (currentMainTab === 'active') {
        paginationEl.classList.add('hidden');
    } else {
        paginationEl.classList.toggle('hidden', pagination.totalPages <= 1);
    }
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

    // 상태별 하위 탭 영역은 진행중 탭에서만 표시
    const statusTabsEl = document.getElementById('status-tabs-row');

    if (tab === 'active') {
        currentMainTab = 'active';
        currentFilters.excludeCompleted = true;
        currentFilters.unpaid = '';  // 미수금 필터 해제
        currentFilters.status = ''; // 상태 필터 초기화 (전체 진행중)
        document.getElementById('filter-status').value = '';
        if (statusTabsEl) statusTabsEl.classList.remove('hidden');
        // 상태별 하위 탭도 "전체 진행중"으로 리셋
        highlightStatusTab('');
    } else if (tab === 'all') {
        currentMainTab = 'all';
        currentFilters.excludeCompleted = false;
        currentFilters.unpaid = '';  // 미수금 필터 해제
        if (statusTabsEl) statusTabsEl.classList.add('hidden');
    } else if (tab === 'unpaid') {
        currentMainTab = 'unpaid';
        // 미수금 탭: 결제일 없고 금액 있는 주문만 표시
        currentFilters.excludeCompleted = false;
        currentFilters.unpaid = 'true';
        if (statusTabsEl) statusTabsEl.classList.add('hidden');
        // 미수금 요약 패널 표시 + 데이터 로드
        if (unpaidPanel) unpaidPanel.classList.remove('hidden');
        loadUnpaidSummary();
    }

    switchTabUI(tab); // 탭 버튼 스타일 변경
    currentFilters.page = 1;
    loadOrders();
}

/**
 * 상태별 하위 탭 클릭 시 호출 (진행중 탭 내에서 세부 상태 필터)
 * 비유: "진행중" 서랍 안에서 "시안요청" 칸, "제작중" 칸으로 나눠보는 것
 * @param {string} statusCode - 상태 코드 (빈 문자열이면 전체 진행중)
 */
function switchStatusTab(statusCode) {
    currentFilters.status = statusCode;
    // 상태 필터 드롭다운도 연동 (탭과 드롭다운이 같은 값을 가리키도록)
    document.getElementById('filter-status').value = statusCode;
    highlightStatusTab(statusCode);
    currentFilters.page = 1;
    loadOrders();
}

/**
 * 상태별 하위 탭 활성 스타일 변경
 * @param {string} activeCode - 현재 활성 상태 코드
 */
function highlightStatusTab(activeCode) {
    // 새 카드형 탭: active 클래스 토글로 스타일 전환 (CSS에서 처리)
    const btns = document.querySelectorAll('.status-sub-tab');
    btns.forEach(btn => {
        const code = btn.dataset.statusCode || '';
        if (code === activeCode) {
            btn.classList.add('active');    // 활성: 흰색 배경 + 파란 하단 보더
        } else {
            btn.classList.remove('active'); // 비활성: 투명 배경 + 회색 글씨
        }
    });
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

    // 상태별 하위 탭 건수 업데이트 — "시안요청 (12)" 형태
    if (pagination.statusCounts) {
        // "전체 진행중" 탭의 건수 = totalActive (2줄 구조: tab-label + tab-count)
        const allActiveBtn = document.querySelector('.status-sub-tab[data-status-code=""]');
        if (allActiveBtn) {
            allActiveBtn.innerHTML = `<span class="tab-label">전체 진행중</span><span class="tab-count">${pagination.totalActive}</span>`;
        }
        // 각 상태별 건수 표시 (동일한 2줄 구조)
        STATUS_TABS.forEach(tab => {
            if (!tab.code) return; // "전체 진행중"은 위에서 처리
            const btn = document.querySelector(`.status-sub-tab[data-status-code="${tab.code}"]`);
            if (btn) {
                const count = pagination.statusCounts[tab.code] || 0;
                btn.innerHTML = `<span class="tab-label">${tab.label}</span><span class="tab-count">${count}</span>`;
            }
        });
    }
}

/**
 * 납기 임박 배지 클릭 시 납기순(deadline) 정렬로 주문 목록 재로드
 * 비유: "가장 급한 주문부터 보여줘!" 버튼
 */
function sortByDeadline() {
    // 진행중 탭으로 전환 (완료/취소 주문은 제외)
    switchTab('active');
    // 정렬 기준을 deadline으로 변경하여 서버에서 납기 오름차순 정렬
    currentFilters.sortBy = 'deadline';
    currentFilters.page = 1;
    loadOrders();
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
    currentFilters.tag = document.getElementById('filter-tag').value;                // 태그 필터
    currentFilters.dateFrom = document.getElementById('filter-dateFrom').value;       // 날짜 시작
    currentFilters.dateTo = document.getElementById('filter-dateTo').value;           // 날짜 끝
    currentFilters.amountMin = document.getElementById('filter-amountMin').value;     // 금액 최소
    currentFilters.amountMax = document.getElementById('filter-amountMax').value;     // 금액 최대
    currentFilters.unpaid = '';  // 일반 필터 사용 시 미수금 필터 해제

    // 배송완료/취소 상태를 선택하면 자동으로 "전체" 탭으로 전환
    // 비유: 완료 주문을 보려고 선택했는데 "진행중" 탭이면 결과가 0건 → 자동 전환
    if (['delivered', 'cancelled'].includes(currentFilters.status)) {
        currentFilters.excludeCompleted = false;
        currentMainTab = 'all';
        switchTabUI('all'); // 탭 UI만 업데이트 (loadOrders는 아래에서 호출)
        const statusTabsEl = document.getElementById('status-tabs-row');
        if (statusTabsEl) statusTabsEl.classList.add('hidden');
    }

    // 진행중 탭에서 상태 필터 드롭다운을 변경하면 상태별 하위 탭도 연동
    if (currentMainTab === 'active') {
        highlightStatusTab(currentFilters.status);
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
// 분석 함수 제거됨: loadMonthlyChart, formatChartAmount,
// loadStaffStats, formatStaffRevenue, loadTopCustomers
// → admin-analytics.js로 이동 완료
// ============================================================

/** 모든 필터 초기화 */
function resetFilters() {
    // 1줄 필터 초기화
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-manager').value = '';
    document.getElementById('filter-sport').value = '';
    document.getElementById('filter-dealType').value = '';
    document.getElementById('filter-tag').value = '';
    document.getElementById('filter-search').value = '';
    // 2줄 범위 필터 초기화
    document.getElementById('filter-dateFrom').value = '';
    document.getElementById('filter-dateTo').value = '';
    document.getElementById('filter-amountMin').value = '';
    document.getElementById('filter-amountMax').value = '';

    currentFilters = {
        status: '', manager: '', sport: '', dealType: '', tag: '',
        search: '', unpaid: '', sortBy: '',
        dateFrom: '', dateTo: '', amountMin: '', amountMax: '',
        excludeCompleted: true, // 초기화 시 "진행중" 탭으로 복원
        page: 1
    };
    // 탭 UI도 "진행중"으로 복원
    currentMainTab = 'active';
    switchTabUI('active');
    // 상태별 하위 탭도 "전체 진행중"으로 복원 + 표시
    highlightStatusTab('');
    const statusTabsEl = document.getElementById('status-tabs-row');
    if (statusTabsEl) statusTabsEl.classList.remove('hidden');
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

// 유틸리티 함수는 admin-common.js에서 로드 (formatCurrency, formatDate, escapeHtml)

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

// handleLogout은 admin-common.js에서 로드

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

// ============================================================
// [D-5] 주문 템플릿 기능
// 비유: 워드의 "문서 템플릿" — 자주 쓰는 주문 설정을 저장/불러오기
// 3개 모달: 선택(새 주문), 관리(목록/수정/삭제), 수정(개별 편집)
// ============================================================

// --- 템플릿 선택 모달 (새 주문 생성용) ---

// 모달 열기: API에서 템플릿 목록을 불러와 표시
async function openTemplateSelectModal() {
    document.getElementById('template-select-modal').classList.remove('hidden');
    document.getElementById('tpl-select-search').value = '';
    await loadTemplateSelectList();
}

function closeTemplateSelectModal() {
    document.getElementById('template-select-modal').classList.add('hidden');
}

// 템플릿 목록 로드 + 카테고리 드롭다운 갱신
async function loadTemplateSelectList() {
    const listEl = document.getElementById('tpl-select-list');
    const searchVal = document.getElementById('tpl-select-search').value.trim();
    const categoryVal = document.getElementById('tpl-select-category').value;

    try {
        // 쿼리 파라미터 구성
        const params = new URLSearchParams();
        if (searchVal) params.set('search', searchVal);
        if (categoryVal) params.set('category', categoryVal);

        const res = await adminFetch(`/api/admin/templates?${params.toString()}`);
        if (!res) return;
        const data = await res.json();

        if (!data.success || !data.templates) {
            listEl.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">템플릿 조회 실패</p>';
            return;
        }

        const templates = data.templates;

        // 카테고리 드롭다운 갱신 (검색 중이 아닐 때만)
        if (!searchVal && !categoryVal) {
            const categorySelect = document.getElementById('tpl-select-category');
            const categories = [...new Set(templates.map(t => t.category).filter(Boolean))];
            // 기존 옵션 유지하면서 갱신
            const currentOptions = categorySelect.value;
            categorySelect.innerHTML = '<option value="">전체 카테고리</option>';
            categories.forEach(cat => {
                categorySelect.innerHTML += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
            });
            categorySelect.value = currentOptions; // 선택 유지
        }

        if (templates.length === 0) {
            listEl.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">등록된 템플릿이 없습니다.</p>';
            return;
        }

        // 템플릿 목록 렌더링 — 각 항목 클릭 시 해당 템플릿으로 주문 생성
        listEl.innerHTML = templates.map(t => `
            <div class="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                 onclick="createOrderFromTemplate(${t.id})">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="font-medium text-sm">${escapeHtml(t.name)}</p>
                        ${t.category ? `<span class="text-xs text-gray-400">${escapeHtml(t.category)}</span>` : ''}
                        ${t.description ? `<p class="text-xs text-gray-500 mt-1">${escapeHtml(t.description)}</p>` : ''}
                    </div>
                    <div class="text-right">
                        <span class="text-xs text-gray-400">사용 ${t.usageCount || 0}회</span>
                        <span class="material-symbols-outlined text-gray-300 text-base ml-2">arrow_forward</span>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('[Admin] 템플릿 목록 로드 실패:', error);
        listEl.innerHTML = '<p class="text-center text-red-400 text-sm py-8">로드 실패</p>';
    }
}

// 템플릿으로 새 주문 생성: API 호출 후 주문 상세 페이지로 이동
async function createOrderFromTemplate(templateId) {
    if (!confirm('이 템플릿으로 새 주문을 생성하시겠습니까?')) return;

    try {
        const res = await adminFetch(`/api/admin/orders/from-template/${templateId}`, {
            method: 'POST'
        });
        if (!res) return;
        const data = await res.json();

        if (data.success && data.order) {
            alert(data.message || '새 주문이 생성되었습니다.');
            closeTemplateSelectModal();
            // 새 주문의 상세 페이지로 이동
            window.location.href = `admin-order.html?id=${data.order.id}`;
        } else {
            alert('주문 생성 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[Admin] 템플릿에서 주문 생성 실패:', error);
        alert('주문 생성 중 오류가 발생했습니다.');
    }
}

// --- 템플릿 관리 모달 (목록/수정/삭제) ---

async function openTemplateManageModal() {
    document.getElementById('template-manage-modal').classList.remove('hidden');
    document.getElementById('tpl-manage-search').value = '';
    await loadTemplateManageList();
}

function closeTemplateManageModal() {
    document.getElementById('template-manage-modal').classList.add('hidden');
}

// 관리 목록 로드: 테이블 형식으로 이름/카테고리/사용횟수/수정/삭제 표시
async function loadTemplateManageList() {
    const listEl = document.getElementById('tpl-manage-list');
    const searchVal = document.getElementById('tpl-manage-search').value.trim();

    try {
        const params = new URLSearchParams();
        if (searchVal) params.set('search', searchVal);

        const res = await adminFetch(`/api/admin/templates?${params.toString()}`);
        if (!res) return;
        const data = await res.json();

        if (!data.success || !data.templates) {
            listEl.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">조회 실패</p>';
            return;
        }

        const templates = data.templates;

        if (templates.length === 0) {
            listEl.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">등록된 템플릿이 없습니다.</p>';
            return;
        }

        // 테이블 렌더링
        listEl.innerHTML = `
            <table class="w-full text-sm">
                <thead class="bg-gray-50 sticky top-0">
                    <tr>
                        <th class="text-left px-3 py-2 font-medium text-gray-500">이름</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-500">카테고리</th>
                        <th class="text-center px-3 py-2 font-medium text-gray-500">사용횟수</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-500">생성자</th>
                        <th class="text-center px-3 py-2 font-medium text-gray-500">작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${templates.map(t => `
                        <tr class="border-t border-gray-100 hover:bg-gray-50">
                            <td class="px-3 py-2">
                                <p class="font-medium">${escapeHtml(t.name)}</p>
                                ${t.description ? `<p class="text-xs text-gray-400">${escapeHtml(t.description)}</p>` : ''}
                            </td>
                            <td class="px-3 py-2 text-gray-500">${escapeHtml(t.category || '-')}</td>
                            <td class="px-3 py-2 text-center">${t.usageCount || 0}</td>
                            <td class="px-3 py-2 text-gray-500">${escapeHtml(t.createdBy || '-')}</td>
                            <td class="px-3 py-2 text-center">
                                <button onclick="openTemplateEditModal(${t.id})" class="text-gray-400 hover:text-gray-700 mr-2" title="수정">
                                    <span class="material-symbols-outlined text-base">edit</span>
                                </button>
                                <button onclick="deleteTemplate(${t.id}, '${escapeHtml(t.name)}')" class="text-gray-400 hover:text-red-500" title="삭제">
                                    <span class="material-symbols-outlined text-base">delete</span>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('[Admin] 템플릿 관리 목록 로드 실패:', error);
        listEl.innerHTML = '<p class="text-center text-red-400 text-sm py-8">로드 실패</p>';
    }
}

// --- 템플릿 수정 모달 ---

// 수정 모달 열기: API에서 상세 정보를 가져와 폼에 채움
async function openTemplateEditModal(templateId) {
    try {
        const res = await adminFetch(`/api/admin/templates/${templateId}`);
        if (!res) return;
        const data = await res.json();

        if (!data.success || !data.template) {
            alert('템플릿 조회 실패');
            return;
        }

        const t = data.template;
        document.getElementById('tpl-edit-id').value = t.id;
        document.getElementById('tpl-edit-name').value = t.name || '';
        document.getElementById('tpl-edit-category').value = t.category || '';
        document.getElementById('tpl-edit-description').value = t.description || '';

        document.getElementById('template-edit-modal').classList.remove('hidden');
    } catch (error) {
        console.error('[Admin] 템플릿 상세 조회 실패:', error);
        alert('템플릿 정보를 불러올 수 없습니다.');
    }
}

function closeTemplateEditModal() {
    document.getElementById('template-edit-modal').classList.add('hidden');
}

// 수정 저장: PUT /api/admin/templates/:id
async function saveTemplateEdit() {
    const id = document.getElementById('tpl-edit-id').value;
    const name = document.getElementById('tpl-edit-name').value.trim();

    if (!name) {
        alert('템플릿 이름을 입력해주세요.');
        return;
    }

    const category = document.getElementById('tpl-edit-category').value.trim();
    const description = document.getElementById('tpl-edit-description').value.trim();

    try {
        const res = await adminFetch(`/api/admin/templates/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, description })
        });
        if (!res) return;
        const data = await res.json();

        if (data.success) {
            alert(data.message || '템플릿이 수정되었습니다.');
            closeTemplateEditModal();
            // 관리 목록 새로고침
            loadTemplateManageList();
        } else {
            alert('수정 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[Admin] 템플릿 수정 실패:', error);
        alert('수정 중 오류가 발생했습니다.');
    }
}

// --- 템플릿 삭제 ---
async function deleteTemplate(templateId, templateName) {
    if (!confirm(`템플릿 "${templateName}"을(를) 삭제하시겠습니까?\n\n삭제된 템플릿은 복구할 수 없습니다.`)) {
        return;
    }

    try {
        const res = await adminFetch(`/api/admin/templates/${templateId}`, {
            method: 'DELETE'
        });
        if (!res) return;
        const data = await res.json();

        if (data.success) {
            alert(data.message || '템플릿이 삭제되었습니다.');
            loadTemplateManageList(); // 목록 새로고침
        } else {
            alert('삭제 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[Admin] 템플릿 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
}
