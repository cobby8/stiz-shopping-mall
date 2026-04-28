/**
 * STIZ Authentication Logic
 * 서버 API 기반 인증 (JWT 토큰 방식)
 *
 * 동작 원리 (비유):
 * - 회원가입: 서버에 "회원카드 만들어주세요" 요청
 * - 로그인: 서버에서 "출입증(JWT 토큰)" 발급받아 브라우저에 보관
 * - 로그인 확인: 브라우저에 보관된 출입증이 있는지 확인
 * - 로그아웃: 출입증을 버림
 */

// localStorage에 저장할 키 이름
const AUTH_TOKEN_KEY = 'stiz_token';     // JWT 토큰 (출입증)
const AUTH_USER_KEY = 'stiz_user';       // 사용자 정보 캐시 (이름, 이메일 등)

// API 기본 경로 — 빈 문자열이면 현재 접속한 호스트를 자동 사용
// (localhost든 192.168.x.x든 같은 코드로 동작)
const API_BASE = '';

// ============================================================
// 0-A. JWT 토큰 유효성 헬퍼 (P1-2, 2026-04-29 추가)
// 비유: "출입증의 유효기간이 아직 안 지났는지 확인"
//
// JWT 구조: header.payload.signature (점 2개로 구분된 3조각)
// payload는 base64url 인코딩된 JSON. payload.exp는 만료 시각(초 단위 Unix timestamp).
// 클라이언트 측 검증은 "사용성"용이며, 서버는 jwt.verify로 별도 검증함.
// 즉 위조 토큰은 클라이언트에서 막지 않아도 서버가 막아주므로,
// 여기선 "만료 토큰을 들고 다니지 않게" 거르는 정도로 충분.
// ============================================================
function isTokenValid(token) {
    if (!token || typeof token !== 'string') return false;
    try {
        // JWT는 점(.) 2개로 3조각이 정상
        const parts = token.split('.');
        if (parts.length !== 3) return false;

        // base64url → base64 변환 (- → +, _ → /, padding 보충)
        // atob는 base64만 처리하므로 변환 필요
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4;
        if (pad === 2) b64 += '==';
        else if (pad === 3) b64 += '=';
        else if (pad !== 0) return false; // pad === 1은 비정상 길이

        const payload = JSON.parse(atob(b64));

        // exp가 숫자가 아니면 비정상 토큰 (서버는 expiresIn 옵션으로 항상 exp 발급)
        if (typeof payload.exp !== 'number') return false;

        // exp는 초 단위, Date.now()는 밀리초 단위 → *1000으로 맞춰 비교
        // exp가 현재보다 미래여야 유효
        return payload.exp * 1000 > Date.now();
    } catch (err) {
        // 디코딩 실패 / JSON 파싱 실패 등 모든 예외는 무효 처리
        return false;
    }
}

// ============================================================
// 0-B. 인증 정보 조용히 정리 (P1-2, 2026-04-29 추가)
// 비유: "만료된 출입증을 조용히 휴지통에 버리기 (입구로 안내는 안 함)"
//
// logout()과 차이: logout()은 location.href로 페이지 이동까지 함.
// clearAuth는 만료 감지 시 호출되므로 페이지 이동 없이 storage만 정리.
// 만약 clearAuth 안에서 redirect 하면 모든 페이지가 강제로 index.html로 튕겨남.
// ============================================================
function clearAuth() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
}

// ============================================================
// 1. 로그인 상태 확인 (P1-2 보강)
// 비유: "내 출입증이 아직 있고, 유효기간도 안 지났는지 확인"
//
// 변경 전: 토큰이 localStorage에 있기만 하면 true (만료 토큰도 통과)
// 변경 후: exp 검증 → 만료 시 자동 정리 + false
// ============================================================
function isLoggedIn() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!isTokenValid(token)) {
        // 토큰이 있지만 만료/무효한 경우, 다음 호출 때 또 만료 토큰을
        // 들고 가지 않도록 즉시 정리. 토큰 자체가 없으면 정리할 것도 없음.
        if (token) clearAuth();
        return false;
    }
    return true;
}

// ============================================================
// 2. 현재 로그인된 사용자 정보 가져오기 (P1-2 보강)
// 비유: "출입증에 적힌 이름 읽기 — 단, 출입증이 만료됐으면 안 읽음"
//
// 만료 토큰의 사용자 정보를 그대로 반환하면 "로그아웃됐는데 이름은 보이는"
// 어색한 UI가 발생. 토큰 만료 시 user 캐시도 같이 정리하고 null 반환.
// ============================================================
function getUser() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!isTokenValid(token)) {
        if (token) clearAuth();
        return null;
    }
    const user = localStorage.getItem(AUTH_USER_KEY);
    return user ? JSON.parse(user) : null;
}

// ============================================================
// 3. JWT 토큰 가져오기 (API 호출 시 Authorization 헤더에 사용) (P1-2 보강)
//
// 만료 토큰을 그대로 반환하면 호출자가 401 받기 직전까지 모르고 API 호출함.
// 호출 전에 미리 만료 감지 → 정리 + null 반환으로 깔끔히 차단.
// ============================================================
function getToken() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!isTokenValid(token)) {
        if (token) clearAuth();
        return null;
    }
    return token;
}

// ============================================================
// 4. 회원가입 — 서버 API 호출 (/api/auth/register)
// 비유: "회원카드 만들어주세요" → 서버가 DB에 저장
// 반환: { success, user?, error? }
// ============================================================
async function register(userData) {
    const { name, email, password, phone } = userData;

    // 클라이언트 사전 검증 (서버에서도 검증하지만, 빠른 피드백을 위해)
    if (!name || name.trim().length < 2) {
        return { success: false, error: '이름을 2자 이상 입력해주세요.' };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, error: '올바른 이메일을 입력해주세요.' };
    }
    if (!password || password.length < 8) {
        return { success: false, error: '비밀번호는 8자 이상이어야 합니다.' };
    }

    try {
        // 서버에 회원가입 요청
        const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, phone: phone || '' })
        });

        const data = await res.json();

        if (!data.success) {
            // 서버 에러 메시지를 한국어로 변환
            const errorMap = {
                'All fields required': '모든 필수 항목을 입력해주세요.',
                'Password must be 8+ characters': '비밀번호는 8자 이상이어야 합니다.',
                'Email already registered': '이미 가입된 이메일입니다.'
            };
            return { success: false, error: errorMap[data.error] || data.error };
        }

        return { success: true, user: data.user };
    } catch (err) {
        console.error('[Auth] 회원가입 요청 실패:', err);
        return { success: false, error: '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' };
    }
}

// ============================================================
// 5. 로그인 — 서버 API 호출 (/api/auth/login)
// 비유: "출입증 발급해주세요" → 서버가 JWT 토큰 발급
// 반환: { success, user?, error? }
// ============================================================
async function login(email, password) {
    if (!email || !password) {
        return { success: false, error: '이메일과 비밀번호를 입력해주세요.' };
    }

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!data.success) {
            const errorMap = {
                'Email and password required': '이메일과 비밀번호를 입력해주세요.',
                'Invalid credentials': '이메일 또는 비밀번호가 올바르지 않습니다.'
            };
            return { success: false, error: errorMap[data.error] || data.error };
        }

        // 토큰과 사용자 정보를 localStorage에 저장
        // 비유: 출입증을 지갑에 넣어두기
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));

        return { success: true, user: data.user };
    } catch (err) {
        console.error('[Auth] 로그인 요청 실패:', err);
        return { success: false, error: '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' };
    }
}

// ============================================================
// 6. 로그아웃 — 토큰 + 사용자 정보 삭제
// 비유: "출입증 버리기"
// ============================================================
function logout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    location.href = 'index.html';
}

// ============================================================
// 7. 헤더 UI 업데이트 — 로그인 상태에 따라 메뉴 변경
// 로그인 전: "로그인 / 회원가입"
// 로그인 후: "My Page / 로그아웃"
// ============================================================
function updateHeaderAuth() {
    const user = getUser();
    const loginLink = document.getElementById('login-link');
    const joinLink = document.getElementById('join-link');

    if (user && loginLink) {
        loginLink.innerText = 'My Page';
        loginLink.href = 'myshop.html';
    }
    if (user && joinLink) {
        joinLink.innerText = 'Logout';
        joinLink.href = '#';
        joinLink.onclick = (e) => {
            e.preventDefault();
            logout();
        };
    }
}

// ============================================================
// 8. 사용자 주문 내역 조회 (향후 서버 API로 전환 예정)
// 현재는 localStorage 기반 — 실제 주문은 관리자 시스템에서 관리
// ============================================================
function getUserOrders() {
    const user = getUser();
    if (!user) return [];
    const orders = JSON.parse(localStorage.getItem('stiz_orders') || '[]');
    return orders.filter(o => o.customer && o.customer.email === user.email);
}

// 초기화: 페이지 로드 시 헤더 인증 상태 반영
document.addEventListener('DOMContentLoaded', () => {
    updateHeaderAuth();
});
