/**
 * STIZ 관리자 대시보드 홈 로직
 * 로그인 후 첫 화면 — 오늘의 핵심 수치 + 최근 활동 + 납기 임박 주문
 *
 * 구조:
 * 1. 인증 확인 → 관리자 아니면 로그인 페이지로 리다이렉트
 * 2. 핵심 수치(KPI) 로드 → 진행중 주문, 오늘 신규, 납기 임박, 미수금
 * 3. 최근 활동 로그 로드 → 최신 10건
 * 4. 납기 임박 주문 로드 → D-3 이내 상위 5건
 */

// ============================================================
// 상수 정의
// ============================================================
const API_BASE = 'http://localhost:4000';

// 상태 한글 라벨 (다른 admin 페이지와 동일)
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

// 활동 로그 액션별 한글 라벨 + 아이콘 + 색상
// 비유: 각 액션 종류마다 다른 색 스티커를 붙여서 한눈에 구분
const ACTION_CONFIG = {
    order_status_change: {
        label: '상태 변경',
        icon: 'swap_horiz',
        bgColor: 'bg-blue-50',
        iconColor: 'text-blue-600'
    },
    order_bulk_status: {
        label: '일괄 상태 변경',
        icon: 'checklist',
        bgColor: 'bg-indigo-50',
        iconColor: 'text-indigo-600'
    },
    order_edit: {
        label: '주문 수정',
        icon: 'edit',
        bgColor: 'bg-yellow-50',
        iconColor: 'text-yellow-600'
    },
    order_duplicate: {
        label: '주문 복제',
        icon: 'content_copy',
        bgColor: 'bg-purple-50',
        iconColor: 'text-purple-600'
    },
    payment_confirm: {
        label: '입금 확인',
        icon: 'paid',
        bgColor: 'bg-green-50',
        iconColor: 'text-green-600'
    },
    comment_add: {
        label: '코멘트 추가',
        icon: 'chat',
        bgColor: 'bg-cyan-50',
        iconColor: 'text-cyan-600'
    },
    backup_manual: {
        label: '수동 백업',
        icon: 'backup',
        bgColor: 'bg-gray-100',
        iconColor: 'text-gray-600'
    }
};

// ============================================================
// 인증 관련 공통 함수
// ============================================================

/** JWT 토큰 가져오기 */
function getToken() {
    return localStorage.getItem('stiz_admin_token');
}

/** 토큰에서 사용자 정보 추출 (JWT payload 디코딩) */
function getUserFromToken() {
    const token = getToken();
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
    } catch (e) {
        return null;
    }
}

/** 인증 확인 — 관리자 토큰이 없으면 로그인 페이지로 이동 */
function checkAuth() {
    const user = getUserFromToken();
    if (!user || user.role !== 'admin') {
        window.location.href = 'admin-login.html';
        return null;
    }
    // 만료 확인
    const now = Math.floor(Date.now() / 1000);
    if (user.exp && user.exp < now) {
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
        return null;
    }
    return user;
}

/** 로그아웃 처리 */
function handleLogout() {
    localStorage.removeItem('stiz_admin_token');
    window.location.href = 'admin-login.html';
}

/** 인증 헤더가 포함된 API 호출 헬퍼 */
async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        // 토큰 만료 또는 무효 — 로그인 페이지로 이동
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
        return null;
    }
    return response.json();
}

// ============================================================
// 유틸리티 함수
// ============================================================

/** 숫자를 한국식 금액 포맷으로 변환 (예: 1234567 → "1,234,567원") */
function formatMoney(amount) {
    if (!amount && amount !== 0) return '-';
    return amount.toLocaleString('ko-KR') + '원';
}

/** 숫자를 콤마 포맷으로 변환 (예: 1234 → "1,234") */
function formatNumber(num) {
    if (!num && num !== 0) return '0';
    return num.toLocaleString('ko-KR');
}

/**
 * 날짜/시간을 상대적 시간으로 변환
 * 비유: "3분 전", "2시간 전" 처럼 사람이 이해하기 쉬운 시간 표현
 */
function timeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / (1000 * 60));
    const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay < 7) return `${diffDay}일 전`;
    // 7일 이상이면 날짜 표시
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
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
        // 통계 API 호출 (현재 연도)
        const statsData = await apiFetch(`${API_BASE}/api/admin/stats`);
        if (!statsData || !statsData.success) throw new Error('통계 로드 실패');

        const stats = statsData.stats;

        // 1. 진행중 주문 수 = 전체 - 배송완료 (delivered 제외)
        const activeOrders = stats.totalOrders - (stats.statusCounts.delivered || 0);
        document.getElementById('kpi-active').textContent = formatNumber(activeOrders);

        // 2. 오늘 신규 주문 수 — 전체 주문 목록에서 오늘 날짜 필터
        const today = new Date().toISOString().slice(0, 10); // "2026-03-31" 형식
        const todayData = await apiFetch(
            `${API_BASE}/api/admin/orders?dateFrom=${today}&dateTo=${today}&excludeCompleted=false&limit=1`
        );
        const todayCount = todayData?.pagination?.total || 0;
        document.getElementById('kpi-today').textContent = formatNumber(todayCount);

        // 3. 납기 임박 (D-3 이내) — 주문 목록에서 진행중 + 납기순 정렬로 계산
        const urgentData = await apiFetch(
            `${API_BASE}/api/admin/orders?sortBy=deadline&excludeCompleted=true&limit=200`
        );
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
        document.getElementById('kpi-unpaid').textContent = formatMoney(stats.unpaidAmount || 0);
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
 * 최근 활동 로그 로드
 * 비유: 회사 내부 게시판 — 누가 무슨 작업을 했는지 시간순 표시
 */
async function loadRecentActivity() {
    try {
        const data = await apiFetch(`${API_BASE}/api/admin/activity-log?limit=10`);
        if (!data || !data.success) throw new Error('활동 로그 로드 실패');

        const container = document.getElementById('activity-list');

        // 로그가 없으면 빈 상태 표시
        if (!data.logs || data.logs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <span class="material-symbols-outlined text-4xl mb-2">inbox</span>
                    <p class="text-sm">아직 기록된 활동이 없습니다.</p>
                </div>
            `;
            return;
        }

        // 활동 로그 렌더링
        let html = '';
        data.logs.forEach(log => {
            // 액션별 설정 가져오기 (없으면 기본값)
            const config = ACTION_CONFIG[log.action] || {
                label: log.action,
                icon: 'info',
                bgColor: 'bg-gray-100',
                iconColor: 'text-gray-600'
            };

            // 상세 설명 생성 — 액션 종류에 따라 다르게 표시
            const desc = buildActivityDescription(log);

            html += `
                <div class="activity-item">
                    <div class="activity-icon ${config.bgColor}">
                        <span class="material-symbols-outlined ${config.iconColor}" style="font-size:18px;">${config.icon}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-gray-900 font-medium truncate">${desc}</p>
                        <p class="text-xs text-gray-400 mt-0.5">${log.userName || '시스템'} · ${timeAgo(log.timestamp)}</p>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (err) {
        console.error('[Dashboard] 활동 로그 로드 실패:', err);
        document.getElementById('activity-list').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">error_outline</span>
                <p class="text-sm">활동 로그를 불러올 수 없습니다.</p>
            </div>
        `;
    }
}

/**
 * 활동 로그 항목의 상세 설명 생성
 * 비유: "누가 무엇을 어떻게 했는지" 한 줄로 요약
 */
function buildActivityDescription(log) {
    const d = log.details || {};
    switch (log.action) {
        case 'order_status_change':
            // "주문 ORD-xxx: 시안 요청 → 제작중"
            return `${d.orderId || '주문'}: ${STATUS_LABELS[d.fromStatus] || d.fromStatus || '?'} → ${STATUS_LABELS[d.toStatus] || d.toStatus || '?'}`;
        case 'order_bulk_status':
            return `${d.count || 0}건 일괄 상태 변경 → ${STATUS_LABELS[d.toStatus] || d.toStatus || '?'}`;
        case 'order_edit':
            return `${d.orderId || '주문'} 정보 수정`;
        case 'order_duplicate':
            return `${d.originalOrderId || '주문'} → ${d.newOrderId || '새 주문'} 복제`;
        case 'payment_confirm':
            return `${d.orderId || '주문'} 입금 확인 (${formatMoney(d.amount)})`;
        case 'comment_add':
            return `${d.orderId || '주문'}에 코멘트 추가`;
        case 'backup_manual':
            return '수동 백업 실행';
        default:
            return log.action;
    }
}

/**
 * 납기 임박 주문 로드 (D-3 이내, 최대 5건)
 * 비유: "오늘 당장 확인해야 할 급한 주문" 목록
 */
async function loadUrgentOrders() {
    try {
        // 납기순 정렬로 진행중 주문 가져오기
        const data = await apiFetch(
            `${API_BASE}/api/admin/orders?sortBy=deadline&excludeCompleted=true&limit=200`
        );

        const container = document.getElementById('urgent-orders');

        if (!data || !data.orders) throw new Error('주문 로드 실패');

        // D-3 이내인 주문만 필터링
        const urgentOrders = data.orders.filter(order => {
            const dday = calcDday(order.shipping?.desiredDate);
            return dday !== null && dday <= 3;
        }).slice(0, 5); // 상위 5건만

        // 납기 임박 주문이 없으면 안심 메시지
        if (urgentOrders.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <span class="material-symbols-outlined text-4xl mb-2 text-green-400">check_circle</span>
                    <p class="text-sm text-green-600 font-medium">납기 임박 주문이 없습니다!</p>
                    <p class="text-xs text-gray-400 mt-1">모든 주문이 여유롭습니다.</p>
                </div>
            `;
            return;
        }

        // 납기 임박 주문 테이블 렌더링
        let html = '<div class="space-y-0">';
        urgentOrders.forEach(order => {
            const dday = calcDday(order.shipping?.desiredDate);
            const ddayText = dday === 0 ? 'D-day' : dday > 0 ? `D-${dday}` : `D+${Math.abs(dday)}`;

            // D-day에 따른 배지 색상 결정
            let badgeClass = 'dday-safe';
            if (dday <= 0) badgeClass = 'dday-danger';      // D-day 또는 초과
            else if (dday <= 3) badgeClass = 'dday-warn';    // D-1 ~ D-3

            // 고객명 (팀명 또는 개인명)
            const customerName = order.customer?.teamName || order.customer?.name || '미상';

            // 주문 상세 페이지로 이동하는 링크
            const orderLink = `admin-order.html?id=${order.id}`;

            html += `
                <a href="${orderLink}" class="urgent-row flex items-center justify-between py-3 px-2 rounded-lg cursor-pointer" style="border-bottom:1px solid #f3f4f6;">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="dday-badge ${badgeClass}">${ddayText}</span>
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">${customerName}</p>
                            <p class="text-xs text-gray-400 truncate">${order.orderId || order.id}</p>
                        </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <p class="text-xs text-gray-500">${STATUS_LABELS[order.status] || order.status}</p>
                        <p class="text-xs text-gray-400">${order.shipping?.desiredDate || '-'}</p>
                    </div>
                </a>
            `;
        });
        html += '</div>';

        container.innerHTML = html;

    } catch (err) {
        console.error('[Dashboard] 납기 임박 로드 실패:', err);
        document.getElementById('urgent-orders').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">error_outline</span>
                <p class="text-sm">납기 임박 주문을 불러올 수 없습니다.</p>
            </div>
        `;
    }
}

// ============================================================
// 페이지 초기화
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. 인증 확인
    const user = checkAuth();
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

    // 4. 데이터 병렬 로드 — 세 API를 동시에 호출하여 빠르게 화면 표시
    // 비유: 세 명이 동시에 다른 서류를 가져오는 것 (순서대로 기다리지 않음)
    loadKPIs();
    loadRecentActivity();
    loadUrgentOrders();
});
