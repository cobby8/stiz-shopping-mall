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

// API_BASE, STATUS_LABELS → admin-common.js에서 로드

// 월별 매출 차트 인스턴스 (업데이트 시 기존 차트를 파괴 후 재생성하기 위해 전역 관리)
let monthlyChartInstance = null;

// 종목별 도넛 차트 인스턴스
let sportChartInstance = null;

// 마진 추이 차트 인스턴스
let marginChartInstance = null;

// [C-3] 전역 변수: loadStats()에서 가져온 총매출을 달성률 계산에 재사용
// 비유: 성적표에서 읽은 현재 점수를 목표 대비 계산기에 넘기는 것
let currentTotalRevenue = 0;

// [C-3] 전역 변수: 현재 로드된 월별 매출 데이터 (월별 미니바 계산에 사용)
let currentMonthlyData = null;

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

// SPORT_LABELS → admin-common.js에서 로드

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
            loadMarginAnalysis(selectedYear); // [C-4] 마진 분석 갱신
            loadStaffStats(selectedYear);    // 담당자별 실적 갱신
            loadTopCustomers(selectedYear);  // 고객별 매출 랭킹 갱신
            loadSalesGoal(selectedYear);     // [C-3] 매출 목표 달성률 갱신
        });
    }

    // 3) 현재 연도 기준으로 모든 데이터 초기 로드
    const currentYear = new Date().getFullYear().toString();
    if (yearSelect) yearSelect.value = currentYear; // 드롭다운 기본값을 현재 연도로
    loadStats(currentYear);
    loadMonthlyChart(currentYear);
    loadSportChart(currentYear);     // 종목별 매출 차트 초기 로드
    loadMarginAnalysis(currentYear); // [C-4] 마진 분석 초기 로드
    loadStaffStats(currentYear);
    loadTopCustomers(currentYear);
    loadSalesGoal(currentYear);      // [C-3] 매출 목표 달성률 초기 로드
});

// checkAdminAuth, getAdminToken, adminFetch, formatCurrency, formatDate,
// escapeHtml, handleLogout → admin-common.js에서 로드

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

        // [C-3] 총매출을 전역 변수에 저장 — 달성률 계산에 재사용
        currentTotalRevenue = stats.totalRevenue || 0;

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

        // [C-3] 월별 데이터를 전역에 저장 — 목표 달성률 월별 미니바에서 재사용
        currentMonthlyData = monthly;

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

// ============================================================
// [C-3] 매출 목표 달성률
// 비유: 모금 현황판 — 올해 목표 대비 현재 얼마나 달성했는지 게이지로 표시
// ============================================================

/**
 * 매출 목표를 서버에서 가져와 달성률 프로그레스 바를 렌더링
 * @param {string} year - 조회할 연도
 */
async function loadSalesGoal(year) {
    const selectedYear = year || new Date().getFullYear().toString();

    try {
        const res = await adminFetch(`/api/admin/sales-goals/${selectedYear}`);
        if (!res) return;

        const data = await res.json();
        if (!data.success) return;

        // 제목에 연도 표시
        const titleEl = document.getElementById('goal-title');
        if (titleEl) titleEl.textContent = `${selectedYear}년 매출 목표 달성률`;

        // 목표 미설정 시: 안내 UI 표시
        const emptyEl = document.getElementById('goal-empty');
        const contentEl = document.getElementById('goal-content');

        if (!data.goal) {
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (contentEl) contentEl.classList.add('hidden');
            return;
        }

        // 목표가 있으면: 안내 숨기고 달성률 표시
        if (emptyEl) emptyEl.classList.add('hidden');
        if (contentEl) contentEl.classList.remove('hidden');

        renderGoalProgress(data.goal, selectedYear);

    } catch (error) {
        console.error('[Analytics] 매출 목표 로드 실패:', error);
    }
}

/**
 * 달성률 프로그레스 바 + 월별 미니바를 화면에 그린다
 * @param {object} goal - { annualGoal, monthlyGoals }
 * @param {string} year - 표시할 연도
 */
function renderGoalProgress(goal, year) {
    const annualGoal = goal.annualGoal || 0;
    const revenue = currentTotalRevenue || 0;

    // --- 연간 요약 숫자 표시 ---
    const targetEl = document.getElementById('goal-annual-target');
    const currentEl = document.getElementById('goal-current-revenue');
    const remainEl = document.getElementById('goal-remaining');
    const rateBadge = document.getElementById('goal-rate-badge');

    if (targetEl) targetEl.textContent = formatChartAmount(annualGoal);
    if (currentEl) currentEl.textContent = formatChartAmount(revenue);

    // 남은 금액 (목표 - 현재). 초과 시 음수이므로 0으로 처리
    const remaining = Math.max(0, annualGoal - revenue);
    if (remainEl) remainEl.textContent = remaining > 0 ? formatChartAmount(remaining) : '달성 완료';

    // --- 달성률 % 계산 ---
    const rate = annualGoal > 0 ? (revenue / annualGoal) * 100 : 0;
    const rateText = rate.toFixed(1) + '%';

    // 달성률에 따른 색상 결정
    // 비유: 시험 점수처럼 — 30점 미만 빨강, 30~70점 주황, 70~100점 파랑, 100점+ 초록
    let barColor, badgeBg, badgeText;
    if (rate >= 100) {
        barColor = 'bg-green-500';
        badgeBg = 'bg-green-100 text-green-700';
        badgeText = '목표 초과 달성!';
    } else if (rate >= 70) {
        barColor = 'bg-blue-500';
        badgeBg = 'bg-blue-100 text-blue-700';
        badgeText = rateText;
    } else if (rate >= 30) {
        barColor = 'bg-amber-500';
        badgeBg = 'bg-amber-100 text-amber-700';
        badgeText = rateText;
    } else {
        barColor = 'bg-red-500';
        badgeBg = 'bg-red-100 text-red-700';
        badgeText = rateText;
    }

    // 배지 표시
    if (rateBadge) {
        rateBadge.textContent = badgeText;
        rateBadge.className = `text-sm font-bold px-2 py-0.5 rounded-full ${badgeBg}`;
    }

    // --- 연간 프로그레스 바 ---
    const progressBar = document.getElementById('goal-progress-bar');
    const progressText = document.getElementById('goal-progress-text');

    if (progressBar) {
        // 너비는 최대 100%로 제한 (초과해도 바가 넘치지 않게)
        const barWidth = Math.min(100, rate);
        progressBar.style.width = barWidth + '%';
        // 기존 bg 클래스를 제거하고 새 색상 적용
        progressBar.className = progressBar.className
            .replace(/bg-(green|blue|amber|red)-500/g, '')
            .trim() + ' ' + barColor;
    }
    if (progressText) {
        progressText.textContent = rateText;
    }

    // --- 월별 미니 프로그레스 바 ---
    renderMonthlyMinibars(goal, year);
}

/**
 * 월별 미니 프로그레스 바 12개를 그리드로 렌더링
 * 비유: 12개월 각각의 작은 게이지 — 이번 달은 목표의 몇 %를 달성했는지 개별 확인
 * @param {object} goal - { annualGoal, monthlyGoals }
 * @param {string} year - 표시할 연도
 */
function renderMonthlyMiniBar(goal, year) {
    // 이 함수는 renderMonthlyMiniBarS에서 호출됨 (오타 방지용 래퍼 아님)
}
function renderMonthlyMiniBars(goal, year) {
    const grid = document.getElementById('goal-monthly-grid');
    if (!grid) return;

    const annualGoal = goal.annualGoal || 0;
    const monthlyGoals = goal.monthlyGoals || {};

    // 월별 실적 데이터가 아직 로드되지 않았으면 빈 상태
    const monthlyRevenue = {};
    if (currentMonthlyData) {
        currentMonthlyData.forEach(m => {
            monthlyRevenue[m.month] = m.revenue || 0;
        });
    }

    let html = '';
    for (let m = 1; m <= 12; m++) {
        // 월별 목표: 개별 설정이 있으면 그것 사용, 없으면 연간/12 균등 분배
        const monthGoal = monthlyGoals[String(m)]
            ? Number(monthlyGoals[String(m)])
            : Math.round(annualGoal / 12);

        const monthRev = monthlyRevenue[m] || 0;
        const monthRate = monthGoal > 0 ? (monthRev / monthGoal) * 100 : 0;
        const barWidth = Math.min(100, monthRate);

        // 색상 결정 (연간과 동일한 로직)
        let miniColor;
        if (monthRate >= 100) miniColor = 'bg-green-500';
        else if (monthRate >= 70) miniColor = 'bg-blue-500';
        else if (monthRate >= 30) miniColor = 'bg-amber-500';
        else miniColor = 'bg-red-500';

        // 미래 달(아직 데이터 없는 달)은 회색 처리
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear().toString();
        const isFuture = (year === currentYear && m > currentMonth);
        if (isFuture) miniColor = 'bg-gray-300';

        html += `
            <div class="text-center">
                <div class="text-xs text-gray-500 mb-1">${m}월</div>
                <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div class="${miniColor} h-2 rounded-full transition-all duration-500"
                         style="width: ${isFuture ? 0 : barWidth}%"></div>
                </div>
                <div class="text-xs mt-1 ${isFuture ? 'text-gray-300' : 'text-gray-600'}">
                    ${isFuture ? '-' : monthRate.toFixed(0) + '%'}
                </div>
            </div>
        `;
    }

    grid.innerHTML = html;
}

// ============================================================
// [C-3] 목표 설정 모달 관련 함수
// ============================================================

/**
 * 목표 설정 모달 열기
 * 현재 선택된 연도의 기존 목표가 있으면 입력란에 미리 채워넣는다
 */
async function openGoalModal() {
    const modal = document.getElementById('goal-modal');
    const yearLabel = document.getElementById('goal-modal-year');
    const yearSelect = document.getElementById('stats-year-select');
    const selectedYear = yearSelect ? yearSelect.value : new Date().getFullYear().toString();

    if (yearLabel) yearLabel.textContent = selectedYear;

    // 기존 목표 데이터 로드
    try {
        const res = await adminFetch(`/api/admin/sales-goals/${selectedYear}`);
        if (res) {
            const data = await res.json();
            const goal = data.goal;

            const annualInput = document.getElementById('goal-annual-input');
            const monthlyToggle = document.getElementById('goal-monthly-toggle');

            if (goal) {
                // 기존 목표가 있으면 입력란에 미리 채움
                if (annualInput) annualInput.value = goal.annualGoal ? goal.annualGoal.toLocaleString('ko-KR') : '';

                // 월별 세부 목표가 있으면 토글 켜고 값 채움
                const hasMonthly = goal.monthlyGoals && Object.keys(goal.monthlyGoals).length > 0;
                if (monthlyToggle) {
                    monthlyToggle.checked = hasMonthly;
                    toggleMonthlyGoals();
                }

                if (hasMonthly) {
                    document.querySelectorAll('.goal-month-input').forEach(input => {
                        const month = input.getAttribute('data-month');
                        const val = goal.monthlyGoals[month];
                        input.value = val ? Number(val).toLocaleString('ko-KR') : '';
                    });
                }
            } else {
                // 목표가 없으면 입력란 초기화
                if (annualInput) annualInput.value = '';
                if (monthlyToggle) {
                    monthlyToggle.checked = false;
                    toggleMonthlyGoals();
                }
                document.querySelectorAll('.goal-month-input').forEach(input => {
                    input.value = '';
                });
            }
        }
    } catch (e) {
        console.error('[Analytics] 목표 모달 데이터 로드 실패:', e);
    }

    // 모달 표시
    if (modal) modal.classList.remove('hidden');
}

/**
 * 목표 설정 모달 닫기
 */
function closeGoalModal() {
    const modal = document.getElementById('goal-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * 월별 세부 목표 입력란 토글 (체크박스 on/off)
 */
function toggleMonthlyGoals() {
    const toggle = document.getElementById('goal-monthly-toggle');
    const inputs = document.getElementById('goal-monthly-inputs');
    if (toggle && inputs) {
        if (toggle.checked) {
            inputs.classList.remove('hidden');
        } else {
            inputs.classList.add('hidden');
        }
    }
}

/**
 * 입력란에 숫자 콤마 자동 포맷
 * 비유: "1500000000" 입력하면 "1,500,000,000"으로 보기 좋게 변환
 * @param {HTMLInputElement} el - 대상 입력란
 */
function formatGoalInput(el) {
    // 숫자가 아닌 문자 제거 후 콤마 포맷
    let value = el.value.replace(/[^0-9]/g, '');
    if (value) {
        el.value = Number(value).toLocaleString('ko-KR');
    }
}

/**
 * 매출 목표를 서버에 저장
 * 모달의 입력값을 읽어서 PUT API로 전송
 */
async function saveSalesGoal() {
    const yearSelect = document.getElementById('stats-year-select');
    const selectedYear = yearSelect ? yearSelect.value : new Date().getFullYear().toString();

    // 연간 목표 금액 파싱 (콤마 제거 후 숫자로 변환)
    const annualInput = document.getElementById('goal-annual-input');
    const annualValue = annualInput ? annualInput.value.replace(/[^0-9]/g, '') : '';

    if (!annualValue || Number(annualValue) <= 0) {
        alert('연간 목표 금액을 입력해주세요.');
        return;
    }

    const annualGoal = Number(annualValue);

    // 월별 세부 목표 수집
    const monthlyToggle = document.getElementById('goal-monthly-toggle');
    let monthlyGoals = {};

    if (monthlyToggle && monthlyToggle.checked) {
        document.querySelectorAll('.goal-month-input').forEach(input => {
            const month = input.getAttribute('data-month');
            const val = input.value.replace(/[^0-9]/g, '');
            if (val) {
                monthlyGoals[month] = Number(val);
            }
        });
    }

    // PUT API 호출
    try {
        const res = await adminFetch(`/api/admin/sales-goals/${selectedYear}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ annualGoal, monthlyGoals })
        });

        if (!res) return;

        const data = await res.json();
        if (data.success) {
            closeGoalModal();
            // 저장 성공 후 달성률 UI 갱신
            loadSalesGoal(selectedYear);
        } else {
            alert('저장 실패: ' + (data.error || '알 수 없는 오류'));
        }
    } catch (error) {
        console.error('[Analytics] 매출 목표 저장 실패:', error);
        alert('저장 중 오류가 발생했습니다.');
    }
}

// ============================================================
// [C-4] 수익률/마진 분석
// 비유: "얼마나 팔았는가"가 아닌 "얼마나 남았는가"를 보여주는 엑스레이
// ============================================================

/**
 * 마진 분석 데이터 로드 및 UI 전체 갱신
 * @param {string} year - 조회할 연도
 */
async function loadMarginAnalysis(year) {
    const loadingEl = document.getElementById('margin-loading');
    const emptyEl = document.getElementById('margin-empty');
    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
        const res = await adminFetch(`/api/admin/stats/margin?year=${year}`);
        if (!res) return;
        const data = await res.json();

        if (!data.success) {
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }

        // 마진 요약 카드 업데이트
        renderMarginSummary(data.summary);

        // 월별 마진 추이 차트
        renderMarginChart(data.monthly);

        // 종목별/고객별 마진 테이블
        renderMarginTables(data.bySport, data.byCustomerTop10);

        if (emptyEl) emptyEl.classList.add('hidden');
    } catch (error) {
        console.error('[Analytics] 마진 분석 로드 실패:', error);
        if (emptyEl) emptyEl.classList.remove('hidden');
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

/**
 * 마진 요약 카드 4칸 + 입력률 표시
 * 비유: 매출 성적표의 "총점, 원가, 순이익, 이익률" 네 칸
 */
function renderMarginSummary(summary) {
    // 억 단위로 보기 좋게 포맷 (1억 미만이면 만원 단위)
    const fmt = (v) => {
        if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
        if (v >= 10000) return (v / 10000).toFixed(0) + '만';
        return v.toLocaleString('ko-KR') + '원';
    };

    const revenueEl = document.getElementById('margin-total-revenue');
    const costEl = document.getElementById('margin-total-cost');
    const marginEl = document.getElementById('margin-total-margin');
    const rateEl = document.getElementById('margin-rate');
    const inputRateEl = document.getElementById('margin-input-rate');

    if (revenueEl) revenueEl.textContent = fmt(summary.totalRevenue);
    if (costEl) costEl.textContent = fmt(summary.totalCost);
    if (marginEl) {
        marginEl.textContent = fmt(summary.totalMargin);
        // 마진이 양수면 초록, 음수면 빨강
        marginEl.className = `text-lg font-bold ${summary.totalMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`;
    }
    if (rateEl) {
        rateEl.textContent = summary.marginRate + '%';
        // 마진율 색상: >=30% 초록, 15~29% 주황, <15% 빨강
        let color = 'text-red-600';
        if (summary.marginRate >= 30) color = 'text-emerald-600';
        else if (summary.marginRate >= 15) color = 'text-amber-600';
        rateEl.className = `text-2xl font-bold ${color}`;
    }
    if (inputRateEl) {
        inputRateEl.textContent = `원가 입력률: ${summary.ordersTotal}건 중 ${summary.ordersWithCost}건 입력 (${summary.costInputRate}%)`;
    }
}

/**
 * 월별 마진 추이 차트 (Chart.js 복합: 매출+원가 막대 + 마진율 라인)
 * 비유: "매출 막대 위에 원가를 겹치면, 남는 부분이 이익"
 */
function renderMarginChart(monthly) {
    const canvas = document.getElementById('marginChart');
    if (!canvas) return;

    // 기존 차트가 있으면 파괴 (Chart.js는 같은 canvas에 중복 생성 불가)
    if (marginChartInstance) {
        marginChartInstance.destroy();
        marginChartInstance = null;
    }

    const labels = monthly.map(m => m.month + '월');
    const revenueData = monthly.map(m => m.revenue);
    const costData = monthly.map(m => m.cost);
    const marginRateData = monthly.map(m => m.marginRate);

    marginChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '매출',
                    data: revenueData,
                    backgroundColor: 'rgba(156, 163, 175, 0.5)',  // 회색
                    borderColor: 'rgba(156, 163, 175, 1)',
                    borderWidth: 1,
                    order: 2  // 막대가 뒤에
                },
                {
                    label: '원가',
                    data: costData,
                    backgroundColor: 'rgba(239, 68, 68, 0.5)',    // 빨강
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 1,
                    order: 2
                },
                {
                    label: '마진율(%)',
                    data: marginRateData,
                    type: 'line',                     // 라인 차트로 오버레이
                    borderColor: 'rgba(16, 185, 129, 1)',  // 에메랄드
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: 'rgba(16, 185, 129, 1)',
                    fill: false,
                    yAxisID: 'y1',                    // 오른쪽 Y축 사용
                    order: 1  // 라인이 앞에
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    beginAtZero: true,
                    position: 'left',
                    ticks: {
                        callback: (v) => {
                            if (v >= 100000000) return (v / 100000000).toFixed(0) + '억';
                            if (v >= 10000) return (v / 10000).toFixed(0) + '만';
                            return v;
                        }
                    },
                    title: { display: true, text: '금액' }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    max: 100,
                    grid: { drawOnChartArea: false },  // 오른쪽 축 그리드는 비표시
                    ticks: { callback: (v) => v + '%' },
                    title: { display: true, text: '마진율' }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === 'y1') {
                                return ctx.dataset.label + ': ' + ctx.parsed.y + '%';
                            }
                            return ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString('ko-KR') + '원';
                        }
                    }
                }
            }
        }
    });
}

/**
 * 마진율에 따라 색상 배지 HTML 생성
 * >=30% 초록, 15~29% 주황, <15% 빨강
 */
function getMarginRateBadge(rate) {
    let bgClass = 'bg-red-100 text-red-700';     // <15%
    if (rate >= 30) bgClass = 'bg-green-100 text-green-700';
    else if (rate >= 15) bgClass = 'bg-amber-100 text-amber-700';
    return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${bgClass}">${rate}%</span>`;
}

/**
 * 종목별/고객별 마진 테이블 렌더링
 */
function renderMarginTables(bySport, byCustomerTop10) {
    // --- 종목별 ---
    const sportTbody = document.getElementById('margin-sport-tbody');
    if (sportTbody) {
        if (bySport.length === 0) {
            sportTbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400 text-sm">데이터 없음</td></tr>';
        } else {
            sportTbody.innerHTML = bySport.map(s => `
                <tr class="border-b border-gray-50 hover:bg-gray-50">
                    <td class="px-4 py-3 font-medium">${escapeHtml(s.label)}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(s.revenue)}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(s.cost)}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(s.margin)}</td>
                    <td class="px-4 py-3 text-right">${getMarginRateBadge(s.marginRate)}</td>
                    <td class="px-4 py-3 text-right">${s.orders}건</td>
                </tr>
            `).join('');
        }
    }

    // --- 고객별 TOP 10 ---
    const customerTbody = document.getElementById('margin-customer-tbody');
    if (customerTbody) {
        if (byCustomerTop10.length === 0) {
            customerTbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400 text-sm">데이터 없음</td></tr>';
        } else {
            customerTbody.innerHTML = byCustomerTop10.map(c => `
                <tr class="border-b border-gray-50 hover:bg-gray-50">
                    <td class="px-4 py-3 font-medium">${escapeHtml(c.teamName)}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(c.revenue)}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(c.cost)}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(c.margin)}</td>
                    <td class="px-4 py-3 text-right">${getMarginRateBadge(c.marginRate)}</td>
                    <td class="px-4 py-3 text-right">${c.orders}건</td>
                </tr>
            `).join('');
        }
    }
}

/**
 * 마진 분석 탭 전환 (종목별 / 고객 TOP 10)
 * 비유: 같은 성적표를 "과목별"로 볼지 "학생별"로 볼지 전환하는 것
 */
function switchMarginTab(tab) {
    const sportTab = document.getElementById('margin-tab-sport');
    const customerTab = document.getElementById('margin-tab-customer');
    const sportTable = document.getElementById('margin-table-sport');
    const customerTable = document.getElementById('margin-table-customer');

    // 활성 탭 스타일
    const activeClass = 'border-gray-800 text-gray-800';
    const inactiveClass = 'text-gray-400 border-transparent hover:text-gray-600';

    if (tab === 'sport') {
        sportTab.className = `px-4 py-2 text-sm font-medium border-b-2 ${activeClass}`;
        customerTab.className = `px-4 py-2 text-sm font-medium border-b-2 ${inactiveClass}`;
        sportTable.classList.remove('hidden');
        customerTable.classList.add('hidden');
    } else {
        sportTab.className = `px-4 py-2 text-sm font-medium border-b-2 ${inactiveClass}`;
        customerTab.className = `px-4 py-2 text-sm font-medium border-b-2 ${activeClass}`;
        sportTable.classList.add('hidden');
        customerTable.classList.remove('hidden');
    }
}
