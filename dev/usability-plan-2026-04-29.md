# STIZ 사용성 개선 통합 작업 계획 (2026-04-29)

> 작성: planner-architect | 기반: dev/ 21개 문서 + 코드 실측(L-10) + scratchpad 작업로그
> 목표: **"실제로 사용할 수 있도록"** — 블로커/심각한 사용성 이슈 우선, 미적 개선/리팩토링은 후순위
> 범위: 소비자 프론트엔드 + 관리자 페이지 (SOLAPI는 별도 진행, 챗봇 K1~K3는 완료됨)

---

## A. 분석 요약

### 검토 대상
- dev/ 문서: **21개** (chatbot 5 / ux 2 / site-review 3 / admin-audit 2 / roadmap 1 / 기타 8)
- scratchpad 작업로그 최근 10건
- knowledge: index/architecture/decisions 정독

### 결과 분포
| 분류 | 건수 | 비고 |
|------|:--:|------|
| ✅ 이미 처리/폐기 (작업 불필요) | **약 80%** | 문서 시점이 4월 초~중순. 그 이후 활발히 커밋됨 |
| 🔴 P0 살아있는 블로커 | **3건** | 결제 트랜잭션 / 레이트 리밋 / AI 쿼터 |
| 🟡 P1 살아있는 사용성 이슈 | **5건** | admin-guard / 토큰 만료 / 업로드 보호 / 마진 입력 UI / 검증 필요 |
| 🟢 P2 개선 후순위 | 다수 | 본 계획에서 제외 |

### 핵심 발견
1. **ux-fixes-tasks-2026-04-21.md (TASK-001~015)는 사실상 전부 처리됨.**
   - TASK-001 (custom_2d ADD TO CART) → custom_2d.html이 14줄 리다이렉트로 폐기됨 (D-96)
   - TASK-002 (login/myshop DOMContentLoaded 래핑) → 두 파일 다 적용됨 (login.html L113, myshop.html L206)
   - TASK-003 (헤더 카트 뱃지) → `syncHeaderCartBadge()` 적용됨 (header_render.js L335)
   - TASK-004 (주문 추적 CTA) → `goToOrderTracking()` 추가됨 (order_result.html L99/L179)
   - TASK-005 (order_result 한국어화) → 영어 잔재 0건 (grep 확인)
   - TASK-006 (custom.html 한국어화) → 진행됨 (D-96으로 흐름 재정의)
   - TASK-007 (헤더 유저 아이콘 myshop 직결) → `goToUserPage()` 적용됨 (header_render.js L549)
   - TASK-008 (custom_*에 카트 링크) → 폐기로 갈음 (D-96)
   - TASK-009 (alert→토스트) → cart.js L43에 stizToast 통합됨
   - TASK-010 (data-include 레거시) → 12개 파일 전부 제거됨
   - TASK-011 (비밀번호 찾기 안내) → inquiry로 연결됨
   - TASK-013 (aria-label) → header_render.js 4곳 부착됨
2. **site-review-bugs.md / site-review-logic.md도 거의 전부 처리됨.**
   - BUG-01 (navMap shipping) → admin.js L326~331 추가됨
   - BUG-02 (admin-home.html 네비) → 10개 링크 다 들어감 (admin-home.html L238~243)
   - BUG-03 (CS 파트 0건) → 실측 9건 존재 (A-20). 폐기됨
   - C-1/C-2/C-3 (orders 인증) → POST 화이트리스트 + JWT fail-fast 적용 (D-82)
   - C-4 (SQL 인젝션) → ALLOWED_TABLES 화이트리스트 (D-88)
   - W-1/W-2/W-3 (statusTabs 누락) → 다 추가됨
   - W-9 (hold/cancelled 미처리) → orders.js L94/L95 추가됨
3. **admin-frontend-audit.md C-1 (reviews 라우팅 404) → 해결됨** (server.js L113~115에 reviewRoutes를 adminRoutes보다 먼저 마운트)
4. **detail-review.md 영어 잔재 → 전부 한국어로 수정됨** (title 15개 다 확인)
5. **챗봇 5개 문서 (faq-draft/faq-final/k2-plan/knowledge-plan/renewal-plan)는 K1~K3 + FAQ CMS 완료로 폐기 후보**
6. **카페24 마이그레이션 → D-15/D-75~78로 이미 완료**
7. **product-data-review.md → "이미 삭제됨" 결론, 폐기**

### 살아있는 핵심 이슈 (improvement-roadmap-2026-04-22.md 기반)
- 🔴 R-01: **결제 승인 + 주문 생성 트랜잭션 미통합** (실측 확인) — payment.js L121~132에서 토스 승인 후 주문 insert 안 함, 클라이언트가 별도로 POST /api/orders 호출 (checkout.js L385~454). 실서비스 시작 시 "결제만 됐는데 주문은 없는 상태" 발생 가능
- 🔴 R-02: **API 레이트 리밋 부재** — package.json에 express-rate-limit 미설치
- 🔴 R-03: **AI/Gemini 일일 쿼터 + 프롬프트 주입 방어 부재**
- 🟡 R-05: **관리자 페이지 프론트 가드 부재** — js/admin-guard.js 없음. URL 직접 접근 시 빈 대시보드 노출
- 🟡 R-07: **auth.js isLoggedIn() exp 검증 없음** — auth.js L24~26 단순히 토큰 존재만 체크
- 🟡 R-09: **/uploads 정적 서빙** (server.js L24 — 인증 없이 누구나 접근)

---

## B. P0 블로커 (1주 내 처리)

| # | 항목 | 영역 | 실측 위치 | 시간 | 위험 | 의존성 | 비고 |
|---|------|------|----------|------|------|--------|------|
| P0-1 | **결제 승인 + 주문 생성 원자 트랜잭션화** | 결제/DB | payment.js L121~132, checkout.js L385~454 | 4h | 중 | — | improvement-roadmap R-01. 실서비스 오픈 전 필수. paymentKey unique 제약 + 멱등 처리 + 실패 시 토스 cancel API 호출. 단, **현재 SOLAPI 운영 진입 전이라 실거래 0건 → "오픈 직전 처리"로 합의 가능** |
| P0-2 | **API 레이트 리밋 적용** | 보안 | server.js, server/package.json | 2h | 하 | — | improvement-roadmap R-02. `/api/auth/login` 5회/분, `/api/generate` 10회/분, `/api/payment/confirm` 20회/분. 비용 폭탄 방지. **실서비스 전 필수** |
| P0-3 | **AI 일일 쿼터 + 프롬프트 주입 방어** | AI | server/routes/ai.js, server/services/knowledge.js | 3h | 중 | P0-2 다음 | improvement-roadmap R-03. Gemini API 비용 폭탄 차단. ai_usage 테이블 신설 + `<user_input>` 구분자 + 의심 키워드 필터 |

### P0 처리 시 반드시 확인할 것
- **payment.js 변경 시 sqliteDb.transaction으로 묶기** — 금액 검증 후 같은 요청에서 orders insert 실패 시 토스 취소 API 호출
- **레이트 리밋 적용 후 관리자 정상 사용 회귀 테스트** — 관리자가 빠른 검색 시 자기 발에 걸리지 않도록 IP가 아닌 token 기반 분기 권장
- **AI 쿼터는 사용자 ID 우선, 없으면 IP fallback**

---

## C. P1 사용성 이슈 (2~3주 내)

| # | 항목 | 영역 | 실측 위치 | 시간 | 위험 | 의존성 | 비고 |
|---|------|------|----------|------|------|--------|------|
| P1-1 | **관리자 프론트 가드 (admin-guard.js 신설)** | 관리자 | admin-*.html 10개 + 신규 js/admin-guard.js | 2h | 하 | — | R-05. 토큰 만료된 관리자/비관리자 접근 시 빈 대시보드 노출. JWT exp 파싱해 만료 시 admin-login.html로 즉시 리다이렉트 |
| P1-2 | **auth.js 토큰 만료 검증** | 인증 | js/auth.js L24~26 | 1h | 하 | P1-1과 동시 가능 | R-07. 현재 isLoggedIn()이 토큰 존재만 체크. atob+JSON.parse로 exp 체크 + 만료 시 자동 logout |
| P1-3 | **업로드 파일 경로 보호** | 보안 | server.js L24, server/routes/upload.js | 3h | 중 | — | R-09. /uploads/designs/** 정적 서빙 → /api/files/:hash로 전환 + 소유자 검증. UUID 파일명 |
| P1-4 | **PG 결제 운영 가능 여부 검증** | 결제 | server/.env, /api/payment/config | 30분 | 하 | — | TOSS_CLIENT_KEY/SECRET_KEY가 .env에 채워져 있는지(테스트키/라이브키) + `configured: true` 응답 확인. **사용자 손 검증 필요** |
| P1-5 | **마진 분석 신뢰도 향상 (원가 입력 UI 강화)** | 운영 | admin-order.html L686~704 | 2h | 하 | — | BH-1. costPerUnit 필드는 이미 있음(admin-order.html L696). 입력률을 높이는 UX 개선(주문 상세 첫 화면에 노출 / 일괄 입력 / 입력률 대시보드) |

### P1 후보지만 우선순위 낮춰도 됨
- BH-3 미수금 에이징 분류 — 1.5h, 운영 효율 ↑ but 블로커 아님
- BM-2 주문 상세 페이지 탭/아코디언 — 개선이지 블로커 아님
- W-2 알림 발송 → SOLAPI Phase 2 진행 중이라 별도 트랙

---

## D. 추천 진행 순서 (1주차)

### Day 1 (월) — 보안 기반
1. **P0-2 레이트 리밋 (2h)** — 가장 쉽고 효과 큼. express-rate-limit 설치 + 3종 리미터 + 한국어 메시지
2. **P1-2 auth.js exp 검증 (1h)** — 한 번에 같이. 토큰 만료 자동 logout
3. **P1-1 admin-guard.js (2h)** — 10개 admin-*.html에 가드 스크립트 부착

### Day 2 (화) — 결제 안정성
4. **P0-1 결제 트랜잭션화 (4h)** — 하루 몰아서. payment.js + orders.js + db schema. paymentKey unique + 멱등.
5. **P1-4 PG 검증 (30분)** — 사용자 손. 토스 키 채워졌는지 확인 후 테스트 결제 1건

### Day 3 (수) — AI 안전
6. **P0-3 AI 쿼터+프롬프트 주입 방어 (3h)**

### Day 4 (목) — 보안 마무리
7. **P1-3 업로드 보호 (3h)** — /uploads → /api/files/:hash + 소유자 검증

### Day 5 (금) — 운영 효율
8. **P1-5 마진 입력 UI (2h)** — 주문 상세에서 원가 강조

### 1주차 결과
- **P0 3건 100% 클리어 → 실서비스 오픈 가능 상태**
- P1 5건 100% 클리어
- 총 약 20시간 작업

---

## E. 폐기/이미 처리 항목 (참고)

### dev/ 21개 문서 분류
| 분류 | 문서 | 처리 방법 |
|------|------|---------|
| ✅ 처리 완료 (아카이브 권장) | ux-fixes-tasks-2026-04-21.md | 15 TASK 전부 처리됨 |
| ✅ 처리 완료 (아카이브 권장) | ux-audit-consumer-2026-04-21.md | 위 fixes의 기반, 함께 아카이브 |
| ✅ 처리 완료 (아카이브) | site-review-bugs.md | BUG-01/02 처리, BUG-03/04 폐기 |
| ✅ 처리 완료 (아카이브) | site-review-logic.md | C-1~C-4/W-1~W-9/I-1~I-8 거의 전부 |
| ✅ 처리 완료 (아카이브) | site-review-features.md | M-4 (CSV) 완료, H-1 (SOLAPI) 별도 트랙, H-3/H-4/H-5는 P1/P2로 |
| ✅ 처리 완료 (아카이브) | admin-frontend-audit.md | C-1 (reviews 404) 해결, W-1~W-4는 운영 이슈 |
| ✅ 처리 완료 (아카이브) | detail-review.md | 영어 잔재 전부 한국어화됨 |
| ✅ 처리 완료 (아카이브) | cafe24-migration-audit.md | D-15/D-75~78 완료 |
| ✅ 처리 완료 (아카이브) | implementation-report.md | 2026-03-31 시점, 그 이후 5개월간 발전. 자료 가치만 보존 |
| ✅ 처리 완료 (아카이브) | product-data-review.md | "이미 삭제됨" 결론 |
| ✅ 처리 완료 (아카이브) | order-flow-plan.md | Part 0/0-B/8/9 다 구현됨 (D-60~D-80) |
| ✅ 처리 완료 (아카이브) | chatbot-faq-draft.md | K3 완료 |
| ✅ 처리 완료 (아카이브) | chatbot-faq-final.md | K3 완료 |
| ✅ 처리 완료 (아카이브) | chatbot-knowledge-k2-plan.md | K2 완료 (sport 95.2%) |
| ✅ 처리 완료 (아카이브) | chatbot-knowledge-plan.md | K1~K3 완료 |
| ✅ 처리 완료 (아카이브) | chatbot-renewal-plan.md | Phase 1~3B 완료 |
| ✅ 처리 완료 (아카이브) | admin-faq-test-checklist.md | FAQ CMS 완료 |
| ✅ 처리 완료 (아카이브) | ui-audit.md | detail-review의 상위/구버전 |
| ✅ 처리 완료 (아카이브) | payment-plan.md | 토스 v1 전환 완료 (D-45) |
| 🔄 진행 중 (보존) | solapi-d35.md | SOLAPI Phase 2 심사 대기 중 |
| 📝 활성 (현재 작업 기준) | improvement-roadmap-2026-04-22.md | R-01/02/03/05/07/09 살아있음. 본 계획의 기반 |

**제안**: 위 표에서 ✅ 표시된 19개는 `dev/_archive/2026-04-29/`로 이동하고 README에 "처리 완료, 참조용 보존"으로 명시. solapi-d35.md와 improvement-roadmap-2026-04-22.md는 활성 보존.

---

## F. 다음 단계 결정 필요

### 사용자에게 물어볼 것
1. **P0-1 결제 트랜잭션화 시점**: 지금 (Day 2) vs SOLAPI Phase 2 운영 투입 직전?
   - 추천: **지금 처리** — SOLAPI는 알림이고 결제는 거래 자체. 별개 트랙
2. **P1-4 PG 검증**: 토스 라이브 키로 본인폰 1건 테스트 결제 (~5만원, 즉시 환불) — 동의?
3. **dev/ 19개 문서 아카이브**: `dev/_archive/2026-04-29/`로 이동 동의?
   - 추천: **이동** — 점검 시 혼란 방지. git에서는 history 보존되므로 안전
4. **P1-5 마진 입력 UI**: 어떤 방향?
   - (A) 주문 상세 첫 화면에 원가 입력 강조 표시
   - (B) 별도 일괄 입력 페이지
   - (C) 입력률 KPI를 admin-home에 표시 (간접 유도)
   - 추천: **A부터 시작 → 저항 적음**

### 추가 검증 필요 (사용자 손 또는 다음 세션)
- TOSS_CLIENT_KEY/SECRET_KEY가 테스트키인지 라이브키인지 (파일은 못 읽음 — 사용자 확인)
- /api/payment/config 응답에서 enabled 값 확인 (서버 띄운 상태에서 curl)

---

## G. 위험 요인

1. **결제 트랜잭션화 변경은 회귀 위험 큼** — checkout.js / payment.js / orders.js 3개 파일 동시 수정. tester 검증 필수. 이전/이후 모두 수동 결제 1건씩 테스트
2. **레이트 리밋이 관리자 자체 발에 걸릴 수 있음** — 관리자가 페이지 빠르게 클릭하면 본인이 차단됨. token 기반 화이트리스트 분기 권장
3. **admin-guard.js 추가 후 토큰 만료 시 즉시 리다이렉트되면 작업 중인 데이터 손실 가능** — 만료 30초 전 경고 + "연장하기" UX 권장 (단, 1주차에서는 단순 리다이렉트로 충분)
4. **AI 쿼터를 너무 빡빡하게 잡으면 정상 사용자도 막힘** — 일일 30회는 챗봇 기준 합리적이나 모니터링 필요
5. **/uploads 보호 변경은 기존 URL 깨짐** — 외부에 공유된 URL이 있는지 확인 필요. 마이그레이션 기간 30일 권장
