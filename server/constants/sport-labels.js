/**
 * SPORT_LABELS — 종목 영문키 → 한글 라벨 매핑 (15종, D-83)
 *
 * 이 파일을 만든 이유:
 *  - 기존에는 서버 3곳(admin.js + admin/stats.js 사본 + 향후 calendar.js)에 같은 사전이 복붙되어 있었다.
 *  - 새 종목을 추가할 때마다 3곳 전부 고쳐야 해서 빠뜨리기 쉬웠다.
 *  - 공유 모듈로 빼서 "서버는 이 파일 1곳만, 프론트는 js/admin-common.js 1곳만" → 총 2곳으로 감축.
 *
 * 비유: 예전에는 각 사무실 벽에 따로 번역 사전을 붙여놨다면, 이제는 공용 도서관에 비치한 셈.
 *
 * ⚠️ 프론트 js/admin-common.js L45~60과 동기화 필수
 *    (ESM vs <script> 차이로 자동 공유 불가 — Q1-A 결정으로 서버 전용 ESM만 여기에 둠)
 *
 * 참조 파일 (서버):
 *   - server/routes/admin/calendar.js (6차 신규)
 *   - server/routes/admin/stats.js (1차 사본 제거 후 import 전환)
 *
 * 새 종목 추가 시: 이 파일 + js/admin-common.js 양쪽 수정 (2곳 동기화)
 * D-83 규칙: 서버 3곳 → 1곳 단일 소스로 감축.
 */

// 실제 사전 — admin.js 원본(L61~77)·stats.js 원본(L38~54)과 한 글자도 다르지 않게 이동
export const SPORT_LABELS = {
    basketball: '농구',
    teamwear: '팀웨어',       // #7: 프론트(admin-common.js)와 동일 위치 — D-83 규칙 준수
    soccer: '축구',
    volleyball: '배구',
    baseball: '야구',
    badminton: '배드민턴',
    tabletennis: '탁구',
    handball: '핸드볼',
    futsal: '풋살',
    tennis: '테니스',
    softball: '소프트볼',   // 프론트(admin-common.js)와 동기화 (stiz.db 0건, 예비)
    hockey: '하키',
    other: '기타',           // stiz.db 실측 1,137건 — 영문 노출 버그 해결
    etc: '기타',
    unknown: '미분류'
};

// default export도 함께 제공 — 호출 측이 named/default 양쪽 다 쓸 수 있게
export default SPORT_LABELS;
