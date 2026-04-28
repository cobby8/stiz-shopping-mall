/**
 * STIZ 관리자 페이지 진입 가드 (P1-1, 2026-04-29)
 *
 * 역할
 * ----
 *  admin-*.html 페이지 진입 시 즉시 실행되어 관리자 자격이 없으면
 *  admin-login.html 로 강제 이동시킨다.
 *
 * 비유
 * ----
 *  회원제 라운지 입구의 보안 직원. 출입증(JWT)이
 *   - 없거나 / 만료되었거나 / 위조되었거나 / 일반 회원용이면
 *  안에 못 들여보내고 입구(로그인 페이지)로 돌려보낸다.
 *
 * 적용 방법
 * --------
 *  각 admin-*.html 의 <head> 가장 위에서 동기 로드.
 *      <script src="js/admin-guard.js"></script>
 *  ⚠️ defer / async / DOMContentLoaded 안에서 실행 금지 — 빈 대시보드가 깜빡임.
 *
 * 자체 isTokenValid 미니 구현 이유
 * --------------------------------
 *  js/auth.js 의 isTokenValid 와 같은 로직이지만, auth.js 를 먼저 로드하면
 *  파싱/실행 사이에 빈 화면이 잠깐 보이는 문제가 있다. 의존성 0 의
 *  IIFE 로 가장 먼저 실행해 화면 노출 전에 차단한다.
 *  (향후 통합 시 함수 시그니처를 동일하게 맞춰 두었다.)
 *
 * 토큰 키
 * ------
 *  admin 페이지는 일반 페이지(stiz_token)와 다른 키 'stiz_admin_token' 을 쓴다.
 *  (admin-login.html 271행, admin-calendar.html 145행 참고)
 */
(function adminGuard() {
    'use strict';

    // 관리자 토큰을 보관하는 localStorage 키 — admin-login.html 과 동일해야 함
    var TOKEN_KEY = 'stiz_admin_token';

    /**
     * JWT 토큰 유효성 검사 (만료 + 구조 + 디코딩 가능 여부)
     * 비유: "출입증의 유효기간이 아직 지나지 않았는지 확인"
     *
     * 클라이언트 검증은 사용성 용도. 위조 토큰은 서버가 jwt.verify 로 막는다.
     * 여기서는 "만료된 토큰을 들고 다니지 않게" 거르는 정도면 충분.
     */
    function isTokenValid(token) {
        if (!token || typeof token !== 'string') return false;
        try {
            // JWT 는 점(.) 2개로 3조각 (header.payload.signature) 이 정상
            var parts = token.split('.');
            if (parts.length !== 3) return false;

            // base64url → base64 변환 후 atob 디코딩 (atob 은 base64만 처리)
            var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            var pad = b64.length % 4;
            if (pad === 2) b64 += '==';
            else if (pad === 3) b64 += '=';
            else if (pad !== 0) return false; // pad === 1 은 비정상 길이

            var payload = JSON.parse(atob(b64));

            // exp 필드가 숫자가 아니면 비정상 (서버는 expiresIn 옵션으로 항상 발급)
            if (typeof payload.exp !== 'number') return false;

            // exp 는 초 단위 / Date.now() 는 밀리초 단위 → *1000 으로 맞춰 비교
            return payload.exp * 1000 > Date.now();
        } catch (err) {
            // 디코딩 / JSON 파싱 실패 등 모든 예외는 무효 처리 (fail-safe)
            return false;
        }
    }

    /**
     * JWT payload 에서 role 추출. 디코딩 실패 시 null.
     * 비유: "출입증의 직급란을 읽기"
     */
    function getRole(token) {
        try {
            var parts = token.split('.');
            if (parts.length !== 3) return null;
            var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            var pad = b64.length % 4;
            if (pad === 2) b64 += '==';
            else if (pad === 3) b64 += '=';
            else if (pad !== 0) return null;
            var payload = JSON.parse(atob(b64));
            return payload && typeof payload.role === 'string' ? payload.role : null;
        } catch (err) {
            return null;
        }
    }

    /**
     * 인증 정보를 정리하고 로그인 페이지로 강제 이동.
     *
     * - location.replace 사용 이유: 뒤로가기 버튼으로 admin 페이지에 다시
     *   들어오지 못하도록 히스토리에 남기지 않는다.
     * - next 파라미터: 로그인 후 원래 가려던 페이지로 복귀하기 위한 경로.
     * - reason 파라미터: 'expired' / 'not_admin' — 로그인 페이지에서
     *   상황별 안내 메시지를 띄울 때 활용 가능 (현재는 단순 식별용).
     */
    function clearAndRedirect(reason) {
        try {
            localStorage.removeItem(TOKEN_KEY);
            // 혹시 일반 사용자 토큰/캐시가 있어도 admin 페이지에선 무관 → 건드리지 않음.
        } catch (e) {
            // localStorage 접근이 막힌 환경(시크릿 모드 등)도 일단 redirect 진행
        }

        var next = encodeURIComponent(location.pathname + location.search);
        // location.replace: 현재 히스토리 항목을 덮어쓰며 이동 — 뒤로가기 차단
        location.replace('admin-login.html?next=' + next + '&reason=' + reason);
    }

    // ------------------------------------------------------------
    // 실제 가드 실행
    // ------------------------------------------------------------
    var token;
    try {
        token = localStorage.getItem(TOKEN_KEY);
    } catch (e) {
        // localStorage 자체 접근 불가 (예: 일부 브라우저 시크릿 모드)
        return clearAndRedirect('expired');
    }

    // 1) 토큰이 없거나 / 만료 / 위조 → 즉시 차단
    if (!isTokenValid(token)) return clearAndRedirect('expired');

    // 2) 토큰은 유효하지만 role 이 admin 이 아님 → 일반 회원이 URL 직접 입력한 케이스
    if (getRole(token) !== 'admin') return clearAndRedirect('not_admin');

    // 통과 — 페이지 정상 로드 진행
})();
