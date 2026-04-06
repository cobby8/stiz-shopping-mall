/**
 * STIZ 관리자 공통 모듈
 * 모든 관리자 페이지(admin*.html)에서 공유하는 상수, 인증, API호출, 유틸리티 함수
 *
 * 왜 분리했는가:
 * 5개 JS 파일(admin.js, admin-order.js, admin-analytics.js, admin-customers.js, admin-home.js)에
 * 동일한 함수가 복사-붙여넣기되어 있었음.
 * 하나를 고치면 나머지 4개도 고쳐야 하는 문제 → 공통 모듈로 한 곳에서 관리
 */

// ============================================================
// 공통 상수
// ============================================================

// API 서버 주소 — 모든 관리자 API 호출의 기본 URL
const API_BASE = 'http://localhost:4000';

// 주문 상태 한글 라벨 — 영문 코드를 한글로 변환 (상태 배지, 필터 등에서 사용)
const STATUS_LABELS = {
    consult_started: '상담개시',
    design_requested: '시안요청',
    draft_done: '초안 완료',
    revision: '수정 중',
    design_confirmed: '디자인확정',
    order_received: '주문서접수',
    payment_completed: '결제완료',
    work_instruction_pending: '작업지시서 전송전',
    work_instruction_sent: '작업지시서 전송후',
    work_instruction_received: '작업지시서 접수',
    in_production: '생산중',
    production_done: '생산완료',
    factory_released: '공장출고',
    warehouse_received: '창고입고',
    released: '출고',
    shipped: '배송중',
    delivered: '배송완료',
    hold: '보류',
    cancelled: '취소',
    pending: '상담개시',
    processing: '생산중'
};

// 종목 한글 라벨 — 영문 코드를 한글로 변환 (테이블/CSV/차트에서 사용)
const SPORT_LABELS = {
    basketball: '농구',
    soccer: '축구',
    volleyball: '배구',
    baseball: '야구',
    badminton: '배드민턴',
    tabletennis: '탁구',
    handball: '핸드볼',
    futsal: '풋살',
    tennis: '테니스',
    softball: '소프트볼',
    hockey: '하키',
    other: '기타',
    etc: '기타',
    unknown: '미분류'
};

// ============================================================
// 인증 관련 함수
// 비유: 관제실 입구의 출입증 확인 시스템
// ============================================================

/**
 * localStorage에서 관리자 JWT 토큰 가져오기
 * 비유: 지갑에서 출입증을 꺼내는 것
 */
function getAdminToken() {
    return localStorage.getItem('stiz_admin_token');
}

function getAdminPayload() {
    const token = getAdminToken();
    if (!token) return null;

    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (error) {
        return null;
    }
}

function getAdminScopes() {
    const payload = getAdminPayload();
    if (!payload || payload.role !== 'admin') return [];
    if (Array.isArray(payload.scopes) && payload.scopes.length > 0) return payload.scopes;
    return ['all'];
}

function hasAdminScope(scope) {
    const scopes = getAdminScopes();
    return scopes.includes('all') || scopes.includes(scope);
}

function getDefaultAdminPage() {
    const payload = getAdminPayload();
    if (!payload || payload.role !== 'admin') return 'admin-home.html';
    if (payload.defaultPage) return payload.defaultPage;

    const scopes = getAdminScopes();
    if (scopes.includes('design')) return 'admin-design.html';
    if (scopes.includes('cs')) return 'admin-cs.html';
    if (scopes.includes('production')) return 'admin-production.html';
    return 'admin-home.html';
}

function redirectToDefaultAdminPage() {
    window.location.href = getDefaultAdminPage();
}

function applyAdminScopeVisibility() {
    const scopes = getAdminScopes();
    const items = document.querySelectorAll('[data-admin-scope]');

    items.forEach(item => {
        const required = (item.getAttribute('data-admin-scope') || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);

        if (required.length === 0) return;

        const allowed = required.some(scope => scopes.includes('all') || scopes.includes(scope));
        if (!allowed) {
            item.classList.add('hidden');
        }
    });
}

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

    // JWT는 header.payload.signature 구조이고, payload에 사용자 정보가 담겨있다
    try {
        const payload = getAdminPayload();
        if (!payload) {
            throw new Error('invalid_token');
        }
        if (payload.role !== 'admin') {
            alert('관리자 권한이 없습니다.');
            window.location.href = 'index.html';
            return;
        }
        // 만료 확인 (exp가 있으면 현재 시간과 비교)
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            localStorage.removeItem('stiz_admin_token');
            window.location.href = 'admin-login.html';
            return;
        }
        // 헤더에 관리자 이름 표시
        const nameEl = document.getElementById('admin-name');
        if (nameEl) nameEl.textContent = payload.name || '관리자';
        applyAdminScopeVisibility();
    } catch (e) {
        // 토큰 파싱 실패 시 로그인 페이지로
        alert('인증 정보가 올바르지 않습니다. 다시 로그인해주세요.');
        localStorage.removeItem('stiz_admin_token');
        window.location.href = 'admin-login.html';
    }
}

/**
 * API 호출 공통 함수
 * 모든 관리자 API 요청에 JWT 토큰을 헤더에 포함시킨다
 * 비유: 매번 출입증을 보여주면서 요청하는 것 — 이 함수가 자동으로 해준다
 *
 * @param {string} url - API 경로 (예: '/api/admin/orders')
 * @param {object} options - fetch 옵션 (method, body 등)
 * @returns {Response|null} 응답 객체. 인증 실패 시 null
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
// 유틸리티 함수
// ============================================================

/**
 * 금액을 한국 원화 형식으로 포맷
 * 예: 675000 → "675,000원"
 */
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return Number(amount).toLocaleString('ko-KR') + '원';
}

/**
 * 날짜를 간결한 형식으로 변환
 * 예: "2026-03-26T14:30:00Z" → "03/26"
 */
function formatDate(dateString) {
    const d = new Date(dateString);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

/**
 * HTML 특수문자 이스케이프 (XSS 방지)
 * 비유: 사용자가 입력한 텍스트에 악성 코드가 있을 수 있으니 무력화시키는 것
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 날짜+시간을 "2026-03-26 14:30" 형식으로 변환
 * formatDate()는 "03/26"만 보여주지만, 이 함수는 연도와 시간까지 포함
 */
function formatDateTime(dateString) {
    const d = new Date(dateString);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * 날짜를 전체 형식으로 변환 (예: "2026-03-26")
 * formatDate()의 "03/26"보다 연도까지 포함하여 명확한 날짜 표시
 */
function formatFullDate(dateString) {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 숫자를 콤마 포맷으로 변환 (예: 1234 → "1,234")
 * formatCurrency()와 달리 "원" 단위를 붙이지 않는 순수 숫자 포맷
 */
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
 * 로그아웃 처리
 * confirm 후 토큰 삭제 + 로그인 페이지로 이동
 */
function handleLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    localStorage.removeItem('stiz_admin_token');
    window.location.href = 'admin-login.html';
}
