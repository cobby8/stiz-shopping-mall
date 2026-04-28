/**
 * API 레이트 리밋 미들웨어 (P0-2, R-02)
 *
 * 비유: 식당 입구에 줄 정리 직원을 세우는 것 — 한 손님이 1분에 너무 많이
 *       주문하면 "잠시만요"라고 막아준다. 봇이나 공격자가 1초에 1만 번
 *       호출해서 AI 비용을 폭주시키거나 PG사에 차단당하는 사고를 막는다.
 *
 * 3종 리미터:
 *   - loginLimiter   : POST /api/auth/login   (1분 5회) — brute force 차단
 *   - aiLimiter      : POST /api/generate/*   (1분 10회) — Gemini 비용 폭탄 차단
 *   - paymentLimiter : POST /api/payment/*    (1분 20회) — PG 차단 위험 회피
 *
 * 관리자 화이트리스트:
 *   - JWT 토큰의 role === 'admin' 이면 skip (운영자가 자기 발에 안 걸리도록)
 *   - 단, 위조/만료 토큰은 통과 X — jwt.verify로 검증해야만 admin으로 인정
 *     (atob 수동 디코딩은 서명 검증 없이 payload만 보므로 위조 우회가 가능 → 사용 X)
 */

import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../routes/auth.js';

/**
 * 관리자 토큰 판별 — 서명 검증까지 통과한 admin만 true
 *
 * 비유: VIP 카드를 보여줘서 줄 정리 직원이 통과시키는 것. 단, 카드는
 *       반드시 진짜여야 한다(서명 검증). 가짜 카드는 일반 손님 취급.
 *
 * @returns {boolean} true면 레이트 리밋 우회, false면 일반 사용자처럼 적용
 */
function isAdmin(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

        const token = authHeader.split(' ')[1];
        if (!token) return false;

        // jwt.verify는 서명+만료 모두 검증 — 위조/만료 토큰은 throw 발생
        // catch 블록에서 false 반환 → 일반 사용자로 폴백 (의도적 동작, 보안 우선)
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded?.role === 'admin';
    } catch (_err) {
        // 토큰 없음/위조/만료 → 화이트리스트 통과 X (일반 사용자처럼 카운트)
        return false;
    }
}

/**
 * 한국어 429 응답 핸들러 — 모든 리미터가 공통 사용
 *
 * 응답 형식 통일:
 *   { success: false, error: "한국어 메시지", retryAfter: 60 }
 */
function rateLimitHandler(req, res /*, next, options */) {
    res.status(429).json({
        success: false,
        error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        retryAfter: 60,
    });
}

// 공통 옵션 — DRY 원칙
// standardHeaders: true → RateLimit-* 표준 응답 헤더 노출 (RFC 9239)
// legacyHeaders: false → 구식 X-RateLimit-* 헤더 비활성화 (불필요)
const commonOptions = {
    windowMs: 60 * 1000, // 1분 윈도우
    standardHeaders: true,
    legacyHeaders: false,
    skip: isAdmin,         // 관리자 화이트리스트
    handler: rateLimitHandler,
};

/**
 * 로그인 리미터 — 1분에 5회까지
 *
 * 비유: 비밀번호 자물쇠를 여러 번 잘못 돌리면 잠기는 것.
 *       brute force 패스워드 공격을 차단한다.
 */
export const loginLimiter = rateLimit({
    ...commonOptions,
    limit: 5,
});

/**
 * AI 리미터 — 1분에 10회까지
 *
 * 비유: AI는 호출 1번당 비용이 발생하는 "비싼 음식"이라, 누가 1초에
 *       1만 번 시키면 식당이 망한다. 분당 10번으로 제한.
 *       대상: /api/generate (POST), /api/generate/chat (POST)
 */
export const aiLimiter = rateLimit({
    ...commonOptions,
    limit: 10,
});

/**
 * 결제 리미터 — 1분에 20회까지
 *
 * 비유: PG사(토스페이먼츠)는 비정상 호출 패턴을 감지하면 가맹점 자체를
 *       차단할 수 있다. 결제 시도 무한 반복을 막아 가맹점 보호.
 *       대상: /api/payment/config (GET), /api/payment/confirm (POST)
 */
export const paymentLimiter = rateLimit({
    ...commonOptions,
    limit: 20,
});

// 테스트/디버깅용 export — 다른 모듈에서 isAdmin 재사용 가능
export { isAdmin };
