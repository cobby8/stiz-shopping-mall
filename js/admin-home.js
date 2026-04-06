/**
 * STIZ 관리자 대시보드 홈 로직
 * 로그인 후 첫 화면 — 오늘의 핵심 수치 + 최근 활동 + 납기 임박 주문
 *
 * 구조:
 * 1. 인증 확인 → 관리자 아니면 로그인 페이지로 리다이렉트
 * 2. 핵심 수치(KPI) 로드 → 진행중 주문, 오늘 신규, 납기 임박, 미수금
 * 3. 파트별 업무 현황 로드 → 디자인/CS/제작/출고 대기량
 * 4. 확인 필요 주문 로드 → 48시간 이상 상태 변화 없는 진행중 주문
 */

// API_BASE, STATUS_LABELS → admin-common.js에서 로드

// getToken/getAdminToken, getUserFromToken, checkAuth/checkAdminAuth,
// handleLogout, apiFetch/adminFetch, formatMoney/formatCurrency,
// formatNumber, timeAgo → admin-common.js에서 로드

const WORK_GROUPS = [
    {
        key: 'design',
        title: '디자인 파트',
        icon: 'draw',
        accentClass: 'text-sky-600',
        statuses: ['design_requested', 'draft_done', 'revision', 'design_confirmed']
    },
    {
        key: 'cs',
        title: 'CS 파트',
        icon: 'support_agent',
        accentClass: 'text-emerald-600',
        statuses: ['consult_started', 'order_received', 'payment_completed', 'work_instruction_pending', 'work_instruction_sent']
    },
    {
        key: 'production',
        title: '제작 파트',
        icon: 'construction',
        accentClass: 'text-violet-600',
        statuses: ['work_instruction_received', 'in_production', 'production_done', 'factory_released']
    },
    {
        key: 'shipping',
        title: '출고 파트',
        icon: 'local_shipping',
        accentClass: 'text-amber-600',
        statuses: ['warehouse_received', 'released', 'shipped', 'delivered']
    }
];

/**
 * 토큰에서 사용자 정보 추출 (JWT payload 디코딩)
 * 대시보드 초기화 시 관리자 이름을 표시하기 위해 필요 — admin-common.js에는 없는 함수
 */
function getUserFromToken() {
    const token = getAdminToken(); // admin-common.js의 getAdminToken() 사용
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
    } catch (e) {
        return null;
    }
}

/**
 * D-day 계산 (납기일까지 남은 일수)
 * 비유: "시험까지 D-3" 같은 카운트다운
 */
function calcDday(desiredDate) {
    if (!desiredDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 시간을 0시로 통일하여 오차 방지
    const target = new Date(desiredDate);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    return diffDays;
}

// ============================================================
// 대시보드 데이터 로드
// ============================================================

/**
 * 핵심 수치(KPI) 로드
 * 비유: 출근해서 보는 "오늘의 숫자판" — 한눈에 중요 지표 파악
 */
async function loadKPIs() {
    try {
        // 통계 API 호출 (현재 연도) — adminFetch는 Response 객체 반환, .json() 필요
        const statsRes = await adminFetch('/api/admin/stats');
        if (!statsRes) throw new Error('통계 로드 실패');
        const statsData = await statsRes.json();
        if (!statsData.success) throw new Error('통계 로드 실패');

        const stats = statsData.stats;

        // 1. 진행중 주문 수 = 전체 - 배송완료 (delivered 제외)
        const activeOrders = stats.totalOrders - (stats.statusCounts.delivered || 0);
        document.getElementById('kpi-active').textContent = formatNumber(activeOrders);

        // 2. 오늘 신규 주문 수 — 전체 주문 목록에서 오늘 날짜 필터
        const today = new Date().toISOString().slice(0, 10); // "2026-03-31" 형식
        const todayRes = await adminFetch(`/api/admin/orders?dateFrom=${today}&dateTo=${today}&excludeCompleted=false&limit=1`);
        const todayData = todayRes ? await todayRes.json() : null;
        const todayCount = todayData?.pagination?.total || 0;
        document.getElementById('kpi-today').textContent = formatNumber(todayCount);

        // 3. 납기 임박 (D-3 이내) — 주문 목록에서 진행중 + 납기순 정렬로 계산
        const urgentRes = await adminFetch('/api/admin/orders?sortBy=deadline&excludeCompleted=true&limit=200');
        const urgentData = urgentRes ? await urgentRes.json() : null;
        let urgentCount = 0;
        if (urgentData?.orders) {
            urgentData.orders.forEach(order => {
                const dday = calcDday(order.shipping?.desiredDate);
                // D-3 이내 = 3일 이하 남은 것 (D-day, D+1 초과 포함)
                if (dday !== null && dday <= 3) urgentCount++;
            });
        }
        document.getElementById('kpi-urgent').textContent = formatNumber(urgentCount);
        // 납기 임박이 있으면 빨간색으로 강조
        if (urgentCount > 0) {
            document.getElementById('kpi-urgent').classList.add('text-orange-600');
        }

        // 4. 미수금 총액
        document.getElementById('kpi-unpaid').textContent = formatCurrency(stats.unpaidAmount || 0);
        if (stats.unpaidAmount > 0) {
            document.getElementById('kpi-unpaid').classList.add('text-red-600');
            // 미수금 금액이 크면 글자 크기 조정
            if (stats.unpaidAmount >= 100000000) {
                document.getElementById('kpi-unpaid').style.fontSize = '22px';
            }
        }

    } catch (err) {
        console.error('[Dashboard] KPI 로드 실패:', err);
        // 에러 시 "-" 표시
        ['kpi-active', 'kpi-today', 'kpi-urgent', 'kpi-unpaid'].forEach(id => {
            document.getElementById(id).textContent = '-';
        });
    }
}

/**
 * 파트별 업무 현황 로드
 * 비유: 디자인/CS/제작/출고 파트의 업무 큐를 한 장의 보드로 보는 것
 */
async function loadWorkSummary() {
    try {
        const statsRes = await adminFetch('/api/admin/stats');
        if (!statsRes) throw new Error('업무 현황 로드 실패');
        const data = await statsRes.json();
        if (!data.success) throw new Error('업무 현황 로드 실패');

        const container = document.getElementById('work-summary');
        const counts = data.stats?.detailedStatusCounts || {};

        const html = `
            <div class="work-grid">
                ${WORK_GROUPS.map(group => {
                    const total = group.statuses.reduce((sum, status) => sum + (counts[status] || 0), 0);
                    const rows = group.statuses.map(status => {
                        const count = counts[status] || 0;
                        return `
                            <a href="admin.html?status=${encodeURIComponent(status)}" class="work-status-row">
                                <span class="work-status-name">${STATUS_LABELS[status] || status}</span>
                                <span class="work-status-count">${formatNumber(count)}건</span>
                            </a>
                        `;
                    }).join('');

                    return `
                        <section class="work-card">
                            <div class="work-card-head">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined ${group.accentClass}">${group.icon}</span>
                                    <span class="work-card-label">${group.title}</span>
                                </div>
                                <span class="work-card-total">${formatNumber(total)}</span>
                            </div>
                            <div class="work-status-list">
                                ${rows}
                            </div>
                        </section>
                    `;
                }).join('')}
            </div>
        `;

        container.innerHTML = html;

    } catch (err) {
        console.error('[Dashboard] 업무 현황 로드 실패:', err);
        document.getElementById('work-summary').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">error_outline</span>
                <p class="text-sm">업무 현황을 불러올 수 없습니다.</p>
            </div>
        `;
    }
}

/**
 * 확인 필요 주문 로드 (48시간 이상 상태 변화 없는 진행중 주문)
 * 비유: 오래 멈춰 있는 주문을 따로 모아 확인하는 목록
 */
async function loadStaleOrders() {
    try {
        const res = await adminFetch('/api/admin/orders/stale?hours=48&limit=5');
        if (!res) throw new Error('확인 필요 주문 로드 실패');
        const data = await res.json();
        const container = document.getElementById('stale-orders');

        if (!data?.success || !Array.isArray(data.orders)) throw new Error('확인 필요 주문 로드 실패');

        if (data.orders.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <span class="material-symbols-outlined text-4xl mb-2 text-green-400">check_circle</span>
                    <p class="text-sm text-green-600 font-medium">확인 필요 주문이 없습니다.</p>
                    <p class="text-xs text-gray-400 mt-1">최근 48시간 내 상태 변화가 유지되고 있습니다.</p>
                </div>
            `;
            return;
        }

        let html = '<div class="space-y-0">';
        data.orders.forEach(order => {
            const staleText = order.staleHours >= 24
                ? `${Math.floor(order.staleHours / 24)}일 ${order.staleHours % 24}시간`
                : `${order.staleHours}시간`;
            const customerName = order.teamName || order.customerName || '미상';
            const orderLink = `admin-order.html?id=${order.id}`;

            html += `
                <a href="${orderLink}" class="urgent-row flex items-center justify-between py-3 px-2 rounded-lg cursor-pointer" style="border-bottom:1px solid #f3f4f6;">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="dday-badge dday-danger">${staleText}</span>
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">${customerName}</p>
                            <p class="text-xs text-gray-400 truncate">${order.orderNumber || order.id}</p>
                        </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <p class="text-xs text-gray-500">${order.statusLabel || STATUS_LABELS[order.status] || order.status}</p>
                        <p class="text-xs text-gray-400">${order.lastStatusChangeAt ? formatDateTime(order.lastStatusChangeAt) : '-'}</p>
                    </div>
                </a>
            `;
        });
        html += '</div>';

        container.innerHTML = html;

    } catch (err) {
        console.error('[Dashboard] 확인 필요 주문 로드 실패:', err);
        document.getElementById('stale-orders').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">error_outline</span>
                <p class="text-sm">확인 필요 주문을 불러올 수 없습니다.</p>
            </div>
        `;
    }
}

// ============================================================
// 재주문 시기 도래 고객 (B-3) — 대시보드 요약 카드
// 비유: "작년 이맘때 주문한 고객 중 올해 아직 안 온 사람" 상위 5명 표시
// ============================================================

/**
 * 재주문 시기 도래 고객 요약 로드 (상위 5건)
 * API에서 데이터를 가져와 대시보드 카드에 렌더링
 */
async function loadReorderCandidates() {
    try {
        // 상위 5건만 요청 (대시보드 요약용)
        const res = await adminFetch('/api/admin/reorder-candidates?limit=5&page=1');
        if (!res) throw new Error('재주문 후보 로드 실패');
        const data = await res.json();
        if (!data.success) throw new Error('재주문 후보 로드 실패');

        const { candidates, summary } = data;

        // --- 요약 문구 표시 ---
        // "작년 3~5월에 주문했지만 올해 아직 주문하지 않은 고객이 284명 있습니다."
        const summaryEl = document.getElementById('reorder-summary');
        if (summary.totalCandidates === 0) {
            summaryEl.textContent = `${summary.periodLabel}에 주문한 고객 중 올해 미주문 고객이 없습니다.`;
        } else {
            summaryEl.innerHTML = `<span class="font-bold text-amber-600">${summary.periodLabel}</span>에 주문했지만 올해 아직 주문하지 않은 고객이 <span class="font-bold text-amber-600">${formatNumber(summary.totalCandidates)}명</span> 있습니다.`;
        }

        // --- 상위 5건 목록 렌더링 ---
        const listEl = document.getElementById('reorder-list');

        // 후보가 없으면 안심 메시지
        if (candidates.length === 0) {
            listEl.innerHTML = `
                <div class="text-center py-6 text-gray-400">
                    <span class="material-symbols-outlined text-3xl mb-2 text-green-400">check_circle</span>
                    <p class="text-sm text-green-600 font-medium">재주문 시기 도래 고객이 없습니다.</p>
                </div>
            `;
            return;
        }

        // 각 후보를 행으로 렌더링 (클릭 시 고객관리 재주문 탭으로 이동)
        let html = '<div class="space-y-0">';
        candidates.forEach((c, idx) => {
            // 팀명이 있으면 "팀명 (이름)", 없으면 이름만
            const displayName = c.teamName
                ? `${escapeHtml(c.teamName)} (${escapeHtml(c.name)})`
                : escapeHtml(c.name);

            html += `
                <div class="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-amber-50 transition-colors" style="border-bottom:1px solid #f3f4f6;">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-sm font-bold text-gray-400 w-5">${idx + 1}</span>
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">${displayName}</p>
                            <p class="text-xs text-gray-400 truncate">작년 ${escapeHtml(c.lastOrderDate)} · ${escapeHtml(c.lastOrderItems)}</p>
                        </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <p class="text-sm font-bold text-amber-600">${formatCurrency(c.lastOrderAmount)}</p>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        listEl.innerHTML = html;

    } catch (err) {
        console.error('[Dashboard] 재주문 후보 로드 실패:', err);
        // 에러 시 간단한 안내 표시
        const summaryEl = document.getElementById('reorder-summary');
        if (summaryEl) summaryEl.textContent = '재주문 후보 데이터를 불러올 수 없습니다.';
        const listEl = document.getElementById('reorder-list');
        if (listEl) listEl.innerHTML = `
            <div class="text-center py-6 text-gray-400">
                <span class="material-symbols-outlined text-3xl mb-2">error_outline</span>
                <p class="text-sm">데이터를 불러올 수 없습니다.</p>
            </div>
        `;
    }
}

// ============================================================
// 페이지 초기화
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. 인증 확인 — admin-common.js의 checkAdminAuth() 사용
    checkAdminAuth();
    const user = getUserFromToken();
    if (!user) return;

    // 2. 헤더에 관리자 이름 표시
    const adminNameEl = document.getElementById('admin-name');
    if (adminNameEl && user.name) {
        adminNameEl.textContent = user.name;
    }

    // 3. 인사말 표시 — "안녕하세요, [담당자명]님! 오늘의 현황입니다."
    const greetingEl = document.getElementById('greeting');
    if (greetingEl && user.name) {
        greetingEl.textContent = `안녕하세요, ${user.name}님! 오늘의 현황입니다.`;
    }

    // 4. 데이터 병렬 로드 — KPI, 업무 현황, 확인 필요 주문, 재주문 요약을 동시에 조회
    loadKPIs();
    loadWorkSummary();
    loadStaleOrders();
    loadReorderCandidates(); // B-3: 재주문 시기 도래 고객 요약
});
