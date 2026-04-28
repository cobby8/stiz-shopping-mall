/**
 * 업로드 파일 접근 게이트 (P1-3, R-09)
 *
 * 비유: 사물함 보관소 입구에 사진 검사대를 세우는 것.
 *  - 진열장(/uploads/products/**)은 누구나 봐도 되는 공개 카탈로그 → 그냥 통과
 *  - 사물함(/uploads/references/**, /uploads/designs/**)은 본인 짐 → 출입증(JWT) 필요
 *  - 직원 창고(/uploads/temp/**)는 직원만 → 관리자 토큰만 통과
 *
 * 설계 결정 (developer L-10 실측 후):
 *  - product_images 1,397장이 /uploads/products/**에 매핑되어 있어 공개 유지 필수 (회귀 0)
 *  - referenceFiles는 DB에 단순 URL 문자열로만 저장됨 → 파일→소유자 정밀 매칭 인덱스 없음
 *    (스펙: schema 큰 변경 X) → "로그인 게이트 + 추측불가 파일명(timestamp+random6hex)
 *    + 외부 노출 0" 3중 보수적 차단으로 충분 판단
 *  - 관리자 토큰(role=admin, 서명 검증 통과)은 모든 파일에 접근 가능
 *  - UPLOADS_GUARD_ENABLED=false 환경변수로 즉시 비활성 가능 (운영 롤백 안전핀)
 */

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../routes/auth.js';

// 비유: 비상 스위치 — 외부 URL이 깨지는 등 응급 상황에서 'false'로 두면
// 게이트가 통째로 비활성되어 기존 동작(누구나 접근)으로 복귀한다.
// 기본값은 보안 우선 (true).
const GUARD_ENABLED = process.env.UPLOADS_GUARD_ENABLED !== 'false';

// 비유: 진열장 — products/는 모두에게 공개되는 상품 사진 폴더.
// 챗봇/상품 카드/메인 페이지 등에서 비로그인 상태로도 봐야 함.
// 정확한 prefix 매칭으로 우회 차단 (예: '/uploads/products-evil/' 같은 시도)
const PUBLIC_PREFIXES = ['/products/'];

// 비유: 직원 창고 — temp/는 관리자가 임시로 올리는 자료. 일반 사용자는 절대 접근 불가.
const ADMIN_ONLY_PREFIXES = ['/temp/'];

/**
 * 요청에서 사용자 토큰을 꺼내 검증한다.
 * 반환:
 *  - 검증 통과: { id, role, ... } JWT payload
 *  - 토큰 없음/만료/위조: null
 *
 * 토큰 위치 우선순위 (P0-2/P1-1 패턴 응용):
 *  1) Authorization: Bearer <token> (admin SPA, fetch 호출 등)
 *  2) cookie: stiz_admin_token (관리자 페이지에서 직접 URL 접근 시)
 *  3) cookie: stiz_token (일반 사용자 페이지에서 직접 URL 접근 시)
 *
 * 주의: 현재 프로젝트는 대부분 localStorage 토큰 + Authorization 헤더로
 * API를 호출하지만, 정적 파일 직접 접근(<img src="...">)에는 헤더가 안 붙으므로
 * cookie 폴백이 핵심이다. 다만 클라이언트가 토큰을 cookie에 자동 저장하지 않는
 * 현재 구조에서는 — 비로그인 차단 효과만 우선 확보하고, 향후 JWT cookie 도입 시
 * 자연스럽게 정밀 인증으로 확장된다.
 */
function getVerifiedUser(req) {
  let token = null;

  // 1) Authorization 헤더 (Bearer)
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // 2) cookie 폴백 — express는 기본적으로 cookie 파서 미장착이므로 raw 파싱
  if (!token) {
    const cookieHeader = req.headers?.cookie;
    if (cookieHeader) {
      // 'stiz_admin_token=abc; stiz_token=xyz; foo=bar' → Map
      const cookies = {};
      for (const part of cookieHeader.split(';')) {
        const eq = part.indexOf('=');
        if (eq > 0) {
          const k = part.slice(0, eq).trim();
          const v = part.slice(eq + 1).trim();
          if (k) cookies[k] = decodeURIComponent(v);
        }
      }
      // 관리자 토큰 우선 — admin SPA에서 발급된 토큰
      token = cookies.stiz_admin_token || cookies.stiz_token || null;
    }
  }

  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // P1-2와 동일한 명시적 만료 검증 (jwt.verify가 이미 처리하지만 이중 안전망)
    if (payload?.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    // 위조/만료 — 익명 처리
    return null;
  }
}

/**
 * 게이트 미들웨어 — express.static 앞에 부착된다.
 *
 * req.path 예: '/products/cafe24/3938/main.png' (mount /uploads 기준)
 *  → app.use('/uploads', uploadGate, express.static(...)) 로 부착하면
 *    req.path는 '/products/...' 같이 mount prefix 제거된 형태가 들어옴.
 *
 * 분기:
 *  - 게이트 비활성(env) → 그냥 통과
 *  - PUBLIC_PREFIXES 매칭 → 통과 (공개 카탈로그)
 *  - 관리자 토큰 → 통과 (모든 파일)
 *  - ADMIN_ONLY_PREFIXES 매칭 + 비관리자 → 403
 *  - 비로그인 + 비공개 경로 → 403
 *  - 로그인 사용자 → 통과 (designs/references)
 */
export function uploadGate(req, res, next) {
  // 환경변수 비활성 모드 — 기존 동작과 동일하게 통과
  if (!GUARD_ENABLED) return next();

  const filePath = req.path || '';

  // 1) 공개 prefix — 누구나 접근 (상품 카탈로그)
  // startsWith로 정확한 prefix 매칭 → '/products-evil/' 같은 우회 차단
  for (const pref of PUBLIC_PREFIXES) {
    if (filePath.startsWith(pref)) return next();
  }

  // 2) 사용자 검증
  const user = getVerifiedUser(req);
  const isAdmin = user?.role === 'admin';

  // 3) 관리자 토큰은 모든 파일 통과 (운영 우회용 출입증)
  if (isAdmin) return next();

  // 4) 관리자 전용 prefix — temp는 일반 사용자에게 노출 X
  for (const pref of ADMIN_ONLY_PREFIXES) {
    if (filePath.startsWith(pref)) {
      return res.status(403).json({
        success: false,
        error: '파일 접근 권한이 없습니다.'
      });
    }
  }

  // 5) 비공개 prefix (designs/references) — 로그인 사용자만 통과
  // 비유: 사물함 출입증만 있으면 통과. 정확한 본인 매칭은 schema 변경 필요해서
  //        현재는 추측불가 파일명(timestamp+random6hex)으로 보호되며,
  //        외부에 URL이 노출되는 경로가 0건이라 1차 방어선으로 충분.
  if (!user) {
    return res.status(403).json({
      success: false,
      error: '파일 접근 권한이 없습니다.'
    });
  }

  // 로그인 사용자 — 통과
  return next();
}

// 테스트/검증용 export — 운영 코드에서는 직접 호출 X
export const __testing = { getVerifiedUser, GUARD_ENABLED, PUBLIC_PREFIXES, ADMIN_ONLY_PREFIXES };

export default uploadGate;
