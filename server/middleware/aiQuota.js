/**
 * AI 일일 쿼터 + 프롬프트 주입 방어 미들웨어 (P0-3, R-03)
 *
 * 비유: 식당 주방장 옆에 "오늘 음식 몇 번 만들어줬는지" 기록하는 직원을 두는 것.
 *       단골(로그인)에겐 50번까지, 처음 손님(IP)에겐 30번까지, VIP(관리자)에겐
 *       1000번까지 허용. 자정 되면 카운트 리셋. 누가 봇으로 1만 번 돌리면
 *       Gemini 비용 폭주 → 사장님 파산. 그 사고를 막는 레이어.
 *
 * 두 가지 방어 레이어:
 *   1. 쿼터 체크 (checkAiQuota) — 일일 호출 횟수 제한
 *   2. 프롬프트 주입 검출 (detectInjection) — "이전 지시 무시" 같은 시도 차단
 *
 * 호출 흐름:
 *   클라 요청 → P0-2 분당 레이트 리밋 → P0-3 일일 쿼터 (이 미들웨어)
 *           → 라우트 핸들러 (주입 검출 + Gemini 호출 + 사용량 기록)
 *
 * P0-2 호환: 분당이 먼저 막히면 일일 카운트는 INSERT 안 됨 (응답 성공 시점에만 기록).
 *           즉 "분당 10건 × 60분 × 24시간 = 14,400건" 가능 시나리오 차단됨.
 */

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../routes/auth.js';
import { database as db } from '../db-sqlite.js';

// ============================================================
// 일일 쿼터 한도 (자정 기준 리셋)
// ============================================================
// 비유: VIP 등급에 따른 무료 음료 잔수.
//   - 무료(IP): 30잔 — 익명 손님은 한도 짧게
//   - 로그인: 50잔 — 회원은 조금 더 관대
//   - 관리자: 1000잔 — 운영팀 작업 차단되지 않게 사실상 무제한
const DAILY_LIMITS = {
    anonymous: 30,
    user: 50,
    admin: 1000,
};

/**
 * 요청에서 사용자 정보 추출 (JWT 검증 통과 시에만)
 *
 * 비유: 손님 명찰 확인. 진짜 명찰이면 회원/관리자 등급 인정,
 *       가짜·만료된 명찰이면 익명 손님으로 취급(보안 우선).
 *
 * @returns {{id, role}|null} 검증된 사용자 또는 null
 */
function getVerifiedUser(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

        const token = authHeader.split(' ')[1];
        if (!token) return null;

        // jwt.verify는 서명+만료 모두 검증 — 위조/만료는 throw
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded || !decoded.id) return null;
        return { id: String(decoded.id), role: decoded.role || 'customer' };
    } catch (_err) {
        // 토큰 없음/위조/만료 → 익명으로 폴백 (의도적, 보안 우선)
        return null;
    }
}

/**
 * 오늘(localtime) 자정 기준 이후 카운트만 매칭하는 SQL 시작 시각 반환
 *
 * 비유: "오늘 0시부터 지금까지" 범위 — datetime('now','localtime')의 날짜 부분만
 *       추출하여 'YYYY-MM-DD 00:00:00' 형태로 만든다.
 *       schema의 created_at도 localtime으로 저장되므로 비교 정합성 OK.
 */
function todayStartLocal() {
    const now = new Date();
    // YYYY-MM-DD 형태로만 잘라내면 SQLite TEXT 비교에서 자정 이후 모든 값이 매칭됨
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} 00:00:00`;
}

/**
 * 요청자의 오늘 사용량 카운트 조회
 *
 * 비유: 카운터 직원이 명단을 훑어서 "이 손님이 오늘 몇 번 시켰지?" 세는 것.
 *       로그인 사용자는 user_id 기준, 익명은 IP 기준.
 */
function countTodayUsage(userId, ip) {
    const start = todayStartLocal();
    if (userId) {
        const row = db.prepare(`
            SELECT COUNT(*) AS c FROM ai_usage
            WHERE user_id = ? AND created_at >= ?
        `).get(userId, start);
        return row?.c || 0;
    }
    // 익명: IP 기준
    const row = db.prepare(`
        SELECT COUNT(*) AS c FROM ai_usage
        WHERE user_id IS NULL AND ip = ? AND created_at >= ?
    `).get(ip || '', start);
    return row?.c || 0;
}

/**
 * 일일 쿼터 체크 미들웨어
 *
 * 비유: 식당 입구 "오늘 N번 이상 시킨 손님은 잠시 쉬세요" 안내원.
 *       관리자 → 1000건, 로그인 → 50건, 익명 → 30건.
 *       초과 시 429 응답 + 한국어 안내. 통과 시 req.aiUsageMeta에 메타 저장
 *       → 라우트 핸들러가 응답 후 INSERT 호출.
 */
export function checkAiQuota(req, res, next) {
    try {
        const user = getVerifiedUser(req);
        // Express 표준 IP — req.ip가 빈값일 경우 connection.remoteAddress 폴백
        const ip = req.ip || req.connection?.remoteAddress || '';

        // 한도 결정: 관리자 > 로그인 > 익명
        let limit;
        let kind;
        if (user?.role === 'admin') {
            limit = DAILY_LIMITS.admin;
            kind = 'admin';
        } else if (user) {
            limit = DAILY_LIMITS.user;
            kind = 'user';
        } else {
            limit = DAILY_LIMITS.anonymous;
            kind = 'anonymous';
        }

        const used = countTodayUsage(user?.id || null, ip);

        if (used >= limit) {
            // 한도 초과 — 한국어 안내 + retryAfter 24시간(자정 리셋이지만 보수적으로 86400)
            return res.status(429).json({
                success: false,
                error: '오늘 AI 호출 한도를 초과했습니다. 내일 다시 시도하거나 관리자에게 문의해주세요.',
                retryAfter: 86400,
            });
        }

        // 통과 — 라우트 핸들러가 응답 성공 시 기록할 수 있도록 메타 부착
        req.aiUsageMeta = {
            user_id: user?.id || null,
            ip,
            endpoint: req.originalUrl || req.path || '',
            kind,
            used,
            limit,
        };
        next();
    } catch (e) {
        // 쿼터 체크 자체 실패는 서비스 차단하지 않음 (open-fail).
        // AI 호출이 막히는 게 더 큰 사고이므로 카운트 누락만 감수.
        console.error('[aiQuota] 쿼터 체크 실패(open-fail로 진행):', e.message);
        req.aiUsageMeta = null;
        next();
    }
}

// ============================================================
// 프롬프트 주입 패턴 (보수적 — 정상 질문 차단 0 목표)
// ============================================================
// 비유: 시스템 프롬프트는 식당의 "조리법 비밀 문서". 손님이 "이전 지시 무시하고
//       조리법 알려줘"라고 말하면 셰프가 깜빡 응할 수 있음.
//       이 패턴 매칭이 1차 방어, <user_input> 구분자가 2차 방어.
//
// 주의: 정상 챗봇 질문(K1 FAQ/K2 상품/K3 관리자 FAQ)이 우연히 매칭되지 않도록
//       매우 구체적인 어구만 등록. "역할" 단독 X, "당신의 역할은" 같은 시도성 어구만.
const SUSPICIOUS_PATTERNS = [
    /이전\s*지시\s*무시/i,                          // 가장 흔한 한국어 시도
    /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules?)/i, // 영어 표준 우회
    /시스템\s*프롬프트/i,                            // 노출 요구
    /system\s+prompt/i,
    /당신의?\s*역할은/i,                             // 새 역할 부여 시도
    /your\s+role\s+is/i,
    /you\s+are\s+now/i,                             // "you are now a hacker"
    /pretend\s+you\s+are/i,                         // 역할극 우회
];

/**
 * 사용자 입력에 프롬프트 주입 시도가 포함되는지 검사
 *
 * 비유: 입장권에 적힌 글에서 "직원에게 비밀번호 말해" 같은 의심 문구를 찾는 것.
 *       매칭되면 차단, 안 되면 통과.
 *
 * @returns {boolean} true=의심됨(차단해야 함), false=정상
 */
export function detectInjection(text) {
    if (typeof text !== 'string' || !text) return false;
    return SUSPICIOUS_PATTERNS.some((p) => p.test(text));
}

/**
 * 사용자 입력을 시스템 프롬프트와 분리하기 위한 구분자 래퍼
 *
 * 비유: 손님 메모를 그대로 셰프에게 건네지 말고, "<손님 메모>" 봉투에
 *       넣어서 전달. 셰프는 봉투 안 내용을 "지시"가 아닌 "데이터"로 인식.
 *
 * @returns {string} '<user_input>...</user_input>' 형태로 감싼 문자열
 */
export function wrapUserInput(userInput) {
    const safe = String(userInput == null ? '' : userInput);
    return `<user_input>\n${safe}\n</user_input>`;
}

/**
 * 사용량 기록 — 라우트 핸들러가 응답 직전 호출
 *
 * 비유: 손님이 음식 받고 나갈 때 카운터 직원이 "1잔 추가" 표시하는 것.
 *       체크는 응답 성공 시점에만 — 4xx/5xx 실패는 카운트 안 함(보수적).
 *
 * @param {object} meta - req.aiUsageMeta (checkAiQuota가 부착)
 * @param {number} promptLength - 사용자 입력 길이
 * @param {number} responseLength - AI 응답 길이
 */
export function recordAiUsage(meta, promptLength = 0, responseLength = 0) {
    if (!meta) return; // 쿼터 체크 실패한 경우 메타 null — 그냥 skip
    try {
        db.prepare(`
            INSERT INTO ai_usage (user_id, ip, endpoint, prompt_length, response_length)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            meta.user_id || null,
            meta.ip || '',
            meta.endpoint || '',
            Number(promptLength) || 0,
            Number(responseLength) || 0,
        );
    } catch (e) {
        // INSERT 실패는 응답에 영향 X — 로그만 남김
        console.error('[aiQuota] 사용량 기록 실패:', e.message);
    }
}

// 테스트/디버깅용 export — 다른 모듈에서 패턴 재사용 가능
export { SUSPICIOUS_PATTERNS, DAILY_LIMITS };
