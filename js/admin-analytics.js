/**
 * STIZ 관리자 매출/실적 분석 페이지 전용 JS
 * admin-analytics.html에서 사용
 *
 * 구조:
 * 1. 공통 상수 + 인증 + API 호출 + 유틸리티 (admin.js에서 복사)
 * 2. 통계 카드 로드 (loadStats)
 * 3. 월별 매출 차트 (loadMonthlyChart)
 * 4. 담당자별 실적 (loadStaffStats)
 * 5. 고객별 매출 랭킹 (loadTopCustomers)
 */

// ============================================================
// 공통 상수 (admin.js와 동일)
// ============================================================
const API_BASE = 'http://localhost:4000';

// 상태 한글 라벨 (통계 카드에서 사용)
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

// 월별 매출 차트 인스턴스 (업데이트 시 기존 차트를 파괴 후 재생성하기 위해 전역 관리)
let monthlyChartInstance = null;

// 종목별 도넛 차트 인스턴스
let sportChartInstance = null;

// 종목별 색상 매핑 — 각 종목을 직관적인 색상으로 구분
// 비유: 농구공=주황, 축구장=초록, 배구=파랑 처럼 종목 이미지에 맞는 색상
const SPORT_COLORS = {
    basketball: '#F97316',   // 주황 (농구공 색)
    soccer:     '#22C55E',   // 초록 (잔디)
    volleyball: '#3B82F6',   // 파랑
    baseball:   '#EF4444',   // 빨강
    badminton:  '#A855F7',   // 보라
    futsal:     '#14B8A6',   // 청록
    handball:   '#F59E0B',   // 호박
    tennis:     '#84CC16',   // 라임
    tabletennis:'#EC4899',   // 핑크
    hockey:     '#6366F1',   // 인디고
    etc:        '#9CA3AF',   // 회색
    unknown:    '#D1D5DB'    // 연회색
};

// 종목 영문→한글 라벨 (서버에서도 제공하지만, 프론트 폴백용)
const SPORT_LABELS = {
    basketball: '농구',
    soccer:     '축구',
    volleyball: '배구',
    baseball:   '야구',
    badminton:  '배드민턴',
    futsal:     '풋살',
    handball:   '핸드볼',
    tennis:     '테니스',
    tabletennis:'탁구',
    hockey:     '하키',
    etc:        '기타',
    unknown:    '미분류'
};

// ============================================================
// 초기화: 페이지 로드 시 실행
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1) 관리자 인증 확인 — 로그인 안 했으면 로그인 페이지로 리다이렉트
    checkAdminAuth();

    // 2) 연도 드롭다운 이벤트 리스너 등록
    // 비유: 연도를 바꾸면 모든 분석 데이터가 해당 연도 기준으로 갱신됨
    const yearSelect = document.getElementById('stats-year-select');
    if (yearSelect) {
        yearSelect.addEventListener('change', () => {
            const selectedYear = yearSelect.value;
            loadStats(selectedYear);         // 통계 카드 갱신
            loadMonthlyChart(selectedYear);  // 월별 매출 차트 갱신
            loadSportChart(selectedYear);    // 종목별 매출 차트 갱신
            loadStaffStats(selectedYear);    // 담당자별 실적 갱신
            loadTopCustomers(selectedYear);  // 고객별 매출 랭킹 갱신
        });
    }

    // 3) 현재 연도 기준으로 모든 데이터 초기 로드
    const currentYear = new Date().getFullYear().toString();
    if (yearSelect) yearSelect.value = currentYear; // 드롭다운 기본값을 현재 연도로
    loadStats(currentYear);
    loadMonthlyChart(currentYear);
    loadSportChart(currentYear);     // 종목별 매출 차트 초기 로드
    loadStaffStats(currentYear);
    loadTopCustomers(currentYear);
});

// ============================================================
// 공통: 인증 함수 (admin.js에서 복사)
// ============================================================

/**
 * 관리자 인증 확인
 * JWT 토큰이 없거나 role이 admin이 아니면 로그인 페이지로 보낸다.
 * 비유: 관제실 입구에서 출입증을 확인하는 것
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

/** 관리자 JWT 토큰 가져오기 */
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

    // 401/403이면 인증 만료 처리
    if (response.status === 401 || response.status === 403) {
        alert('인증이 만료되었습니다. 다시 로그인해주세요.');
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
        return null;
    }

    return response;
}

// ============================================================
// 공통: 유틸리티 함수 (admin.js에서 복사)
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

// ============================================================
// 통계 카드 로드
// ============================================================

/**
 * 통계 로드 (연도별)
 * @param {string} year - 조회할 연도 (예: '2026')
 * 비유: "올해 성적표"를 서버에서 가져와 카드에 표시
 */
async function loadStats(year) {
    try {
        const selectedYear = year || new Date().getFullYear().toString();

        // 해당 연도 통계 API 호출
        const res = await adminFetch(`/api/admin/stats?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const stats = data.stats;

        // 연도 타이틀 업데이트 -- "2026년 주문 현황"
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

    } catch (error) {
        console.error('[Analytics] 통계 로드 실패:', error);
    }
}

// ============================================================
// 월별 매출 차트
// ============================================================

/**
 * 금액을 읽기 쉬운 단위로 포맷 (차트 축 표시용)
 * 비유: 675000000 -> "6.8억", 45000000 -> "4,500만"
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
 * @param {string} year - 조회할 연도
 */
async function loadMonthlyChart(year) {
    const chartLoading = document.getElementById('chart-loading');
    const chartTitle = document.getElementById('chart-title');

    try {
        // 로딩 표시
        if (chartLoading) chartLoading.classList.remove('hidden');

        const selectedYear = year || new Date().getFullYear().toString();

        // 차트 제목 업데이트
        if (chartTitle) chartTitle.textContent = `${selectedYear}년 월별 매출 추이`;

        // API 호출: 월별 매출/주문수 데이터
        const res = await adminFetch(`/api/admin/stats/monthly?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const monthly = data.monthly; // [{month:1, revenue:금액, orders:건수}, ...]

        // X축: 1월~12월, 막대: 매출, 라인: 주문수
        const labels = monthly.map(m => `${m.month}월`);
        const revenueData = monthly.map(m => m.revenue);
        const ordersData = monthly.map(m => m.orders);

        // 기존 차트 파괴 (메모리 누수 방지)
        if (monthlyChartInstance) {
            monthlyChartInstance.destroy();
            monthlyChartInstance = null;
        }

        const ctx = document.getElementById('monthlyChart');
        if (!ctx) return;

        // Chart.js 복합 차트 생성
        // 막대(bar): 매출 -> 왼쪽 Y축 / 라인(line): 주문수 -> 오른쪽 Y축
        monthlyChartInstance = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        // 막대 차트: 월별 매출
                        type: 'bar',
                        label: '매출',
                        data: revenueData,
                        backgroundColor: 'rgba(230, 57, 70, 0.7)',   // brand-red 계열
                        borderColor: 'rgba(230, 57, 70, 1)',
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: 'y-revenue',
                        order: 2       // 막대가 라인 뒤에
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
                        tension: 0.3,
                        yAxisID: 'y-orders',
                        order: 1       // 라인이 막대 위에
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',       // 같은 X축 위치의 모든 데이터셋 동시 표시
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
                        grid: { display: false }
                    },
                    // 왼쪽 Y축: 매출 (억/만 단위)
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
                            color: '#E63946'
                        }
                    },
                    // 오른쪽 Y축: 주문수 (건)
                    'y-orders': {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },
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
                            color: '#111111'
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('[Analytics] 월별 차트 로드 실패:', error);
    } finally {
        if (chartLoading) chartLoading.classList.add('hidden');
    }
}

// ============================================================
// 담당자별 실적
// ============================================================

/**
 * 담당자별 실적 데이터를 로드하여 테이블에 렌더링
 * 비유: 직원별 성적표를 서버에서 가져와 테이블로 보여주는 것
 * @param {string} year - 조회할 연도
 */
async function loadStaffStats(year) {
    const staffLoading = document.getElementById('staff-loading');
    const staffTitle = document.getElementById('staff-title');
    const tbody = document.getElementById('staff-stats-tbody');
    const emptyEl = document.getElementById('staff-empty');

    if (!tbody) return;

    try {
        if (staffLoading) staffLoading.classList.remove('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');

        const selectedYear = year || new Date().getFullYear().toString();

        // 제목 업데이트
        if (staffTitle) staffTitle.textContent = `${selectedYear}년 담당자별 실적`;

        // API 호출
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
            const revenueText = formatStaffRevenue(s.revenue);

            // 완료율 색상: 80%+ 초록, 50~80% 노랑, 50% 미만 빨강
            let rateColor = 'text-gray-600';
            if (s.completionRate >= 80) {
                rateColor = 'text-green-600';
            } else if (s.completionRate >= 50) {
                rateColor = 'text-amber-600';
            } else if (s.completionRate > 0) {
                rateColor = 'text-red-500';
            }

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
        console.error('[Analytics] 담당자별 실적 로드 실패:', error);
    } finally {
        if (staffLoading) staffLoading.classList.add('hidden');
    }
}

/**
 * 담당자별 매출 금액을 읽기 쉬운 단위로 포맷
 * 비유: 큰 숫자를 "2.3억" 또는 "4,500만원" 같이 변환
 * @param {number} amount - 원 단위 금액
 * @returns {string} - 포맷된 금액 문자열
 */
function formatStaffRevenue(amount) {
    if (!amount && amount !== 0) return '-';
    if (amount >= 100000000) {
        return (amount / 100000000).toFixed(1) + '억';
    } else if (amount >= 10000000) {
        return Math.round(amount / 10000).toLocaleString('ko-KR') + '만원';
    } else if (amount >= 10000) {
        return Math.round(amount / 10000).toLocaleString('ko-KR') + '만원';
    }
    return amount.toLocaleString('ko-KR') + '원';
}

// ============================================================
// 고객별 매출 랭킹 TOP 20
// ============================================================

/**
 * 고객별 매출 랭킹 데이터를 로드하여 테이블에 렌더링
 * 비유: VIP 고객 순위표 -- 누가 가장 많이 사고, 단골인지 한눈에 파악
 * @param {string} year - 조회할 연도
 */
async function loadTopCustomers(year) {
    const loading = document.getElementById('top-customers-loading');
    const title = document.getElementById('top-customers-title');
    const tbody = document.getElementById('top-customers-tbody');
    const emptyEl = document.getElementById('top-customers-empty');
    const repeatBadge = document.getElementById('top-customers-repeat');

    if (!tbody) return;

    try {
        if (loading) loading.classList.remove('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');
        if (repeatBadge) repeatBadge.classList.add('hidden');

        const selectedYear = year || new Date().getFullYear().toString();

        // 제목 업데이트
        if (title) title.textContent = `${selectedYear}년 고객별 매출 랭킹 TOP 20`;

        // API 호출
        const res = await adminFetch(`/api/admin/stats/top-customers?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const customers = data.customers || [];

        // 재주문율 배지 표시
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
            const revenueText = formatStaffRevenue(c.revenue);

            // 순위 메달: 1~3위는 금/은/동 색상
            let rankDisplay = `${idx + 1}`;
            if (idx === 0) rankDisplay = '<span class="text-amber-500 font-bold">1</span>';
            else if (idx === 1) rankDisplay = '<span class="text-gray-400 font-bold">2</span>';
            else if (idx === 2) rankDisplay = '<span class="text-amber-700 font-bold">3</span>';

            const dealColor = dealTypeColors[c.dealType] || 'bg-gray-50 text-gray-500';

            // 재주문 여부: 단골이면 초록 체크, 신규면 회색
            const repeatIcon = c.isRepeat
                ? '<span class="text-green-500 text-xs font-medium">단골</span>'
                : '<span class="text-gray-300 text-xs">신규</span>';

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
        console.error('[Analytics] 고객별 매출 랭킹 로드 실패:', error);
    } finally {
        if (loading) loading.classList.add('hidden');
    }
}

// ============================================================
// 종목별 매출 도넛 차트
// ============================================================

/**
 * 종목별 매출 데이터를 로드하여 도넛 차트 + 상세 테이블로 렌더링
 * 비유: "어떤 종목이 매출에 가장 많이 기여하는지" 파이 차트로 한눈에 비교
 * @param {string} year - 조회할 연도
 */
async function loadSportChart(year) {
    const loading = document.getElementById('sport-chart-loading');
    const title = document.getElementById('sport-chart-title');
    const tbody = document.getElementById('sport-stats-tbody');
    const emptyEl = document.getElementById('sport-chart-empty');

    try {
        if (loading) loading.classList.remove('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');

        const selectedYear = year || new Date().getFullYear().toString();

        // 제목 업데이트
        if (title) title.textContent = `${selectedYear}년 종목별 매출`;

        // API 호출
        const res = await adminFetch(`/api/admin/stats/by-sport?year=${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        const sports = data.sports || [];

        // 데이터 없으면 빈 상태 표시
        if (sports.length === 0) {
            if (tbody) tbody.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            // 기존 차트 파괴
            if (sportChartInstance) {
                sportChartInstance.destroy();
                sportChartInstance = null;
            }
            return;
        }

        // 총 매출 계산 (비중 % 계산용)
        const totalRevenue = sports.reduce((sum, s) => sum + s.revenue, 0);

        // ── 도넛 차트 렌더링 ──
        // 기존 차트 파괴 (메모리 누수 방지)
        if (sportChartInstance) {
            sportChartInstance.destroy();
            sportChartInstance = null;
        }

        const ctx = document.getElementById('sportChart');
        if (ctx) {
            // 각 종목의 색상 배열 생성 — SPORT_COLORS에서 매핑, 없으면 기본 회색
            const bgColors = sports.map(s => SPORT_COLORS[s.sport] || '#9CA3AF');

            sportChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: sports.map(s => s.label),
                    datasets: [{
                        data: sports.map(s => s.revenue),
                        backgroundColor: bgColors,
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '55%',  // 도넛 가운데 구멍 크기
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                padding: 12,
                                font: { size: 12 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.raw;
                                    const pct = totalRevenue > 0
                                        ? ((value / totalRevenue) * 100).toFixed(1)
                                        : 0;
                                    return `${context.label}: ${value.toLocaleString('ko-KR')}원 (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // ── 상세 테이블 렌더링 ──
        if (tbody) {
            tbody.innerHTML = sports.map(s => {
                // 비중(%) 계산
                const pct = totalRevenue > 0
                    ? ((s.revenue / totalRevenue) * 100).toFixed(1)
                    : '0.0';

                // 종목 색상 점 (테이블에서 차트 색상과 매칭)
                const dotColor = SPORT_COLORS[s.sport] || '#9CA3AF';
                const revenueText = formatStaffRevenue(s.revenue);

                return `
                    <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td class="px-4 py-3 font-medium whitespace-nowrap flex items-center gap-2">
                            <span class="inline-block w-3 h-3 rounded-full flex-shrink-0" style="background:${dotColor}"></span>
                            ${escapeHtml(s.label)}
                        </td>
                        <td class="px-4 py-3 text-right whitespace-nowrap">${s.orders.toLocaleString('ko-KR')}건</td>
                        <td class="px-4 py-3 text-right whitespace-nowrap font-medium">${revenueText}</td>
                        <td class="px-4 py-3 text-right whitespace-nowrap text-gray-600">${pct}%</td>
                    </tr>
                `;
            }).join('');
        }

    } catch (error) {
        console.error('[Analytics] 종목별 매출 차트 로드 실패:', error);
    } finally {
        if (loading) loading.classList.add('hidden');
    }
}
