# STIZ 사이트 전체 점검 보고서 -- 오류/버그

## 요약
- 점검일: 2026-04-07
- 총 점검 항목: 52건
- 통과: 46건 / 실패: 6건 (Critical 1 / Warning 3 / Info 2)

---

## 발견된 오류

### [RED] Critical (서비스 장애)

#### BUG-01: admin.js navMap에 shipping 누락 -- 출고 파트 네비 활성화 안 됨

- 파일: `js/admin.js` (약 286행)
- 현상: `navMap` 객체에 `shipping: 'nav-shipping'`이 빠져 있어, `admin.html?view=shipping`(출고 파트) 페이지에서 네비게이션 메뉴의 "출고 파트" 링크가 활성 상태(흰색 볼드+밑줄)로 표시되지 않는다. 대신 기본값인 "전체 주문"이 활성화된다.
- 영향: 출고 파트 담당자가 어떤 페이지에 있는지 시각적으로 확인할 수 없다.
- 수정 방법: navMap에 `shipping: 'nav-shipping'` 추가

```javascript
// 현재 (버그)
const navMap = {
    all: 'nav-all',
    design: 'nav-design',
    cs: 'nav-cs',
    production: 'nav-production'
};

// 수정 필요
const navMap = {
    all: 'nav-all',
    design: 'nav-design',
    cs: 'nav-cs',
    production: 'nav-production',
    shipping: 'nav-shipping'        // <-- 누락된 항목
};
```

---

### [YELLOW] Warning (기능 이상)

#### BUG-02: admin-home.html 네비게이션에 파트별 링크 누락

- 파일: `admin-home.html` (219~226행)
- 현상: admin-home.html의 상단 네비에는 6개 링크만 있다 (홈, 주문 관리, 일정표, 매출 분석, 고객 관리, 쇼핑몰 보기). 반면 다른 페이지(admin.html, admin-calendar.html, admin-analytics.html, admin-customers.html)에는 10개 링크가 있다 (디자인 파트, CS 파트, 제작 파트, 출고 파트가 추가로 있음).
- 영향: 홈 페이지에서 파트별 페이지로 직접 이동할 수 없다. 주문 관리 페이지를 거쳐야 한다.
- 원인: 4파트 재구성 시 admin-home.html의 네비를 업데이트하지 않은 것으로 추정

#### BUG-03: CS 파트 뷰에 해당하는 주문이 0건

- 현상: CS 파트의 `allowedStatuses`는 `consult_started`, `order_received`, `payment_completed`, `work_instruction_pending`, `work_instruction_sent`인데, DB에 이 5개 상태의 주문이 단 하나도 없다.
- 원인 분석: 현재 DB의 상태값은 `design_requested`, `draft_done`, `design_confirmed`, `work_instruction_received`, `in_production`, `released`, `delivered`, `hold`, `line_work`, `cancelled` 10종류뿐이다. CS 파트가 담당하는 중간 단계 상태(상담개시, 주문서접수, 결제완료 등)가 스프레드시트 데이터 임포트 과정에서 누락되었거나, 이 상태들을 실제로 사용하지 않는 워크플로우다.
- 영향: CS 파트 페이지가 항상 빈 목록을 보여줘서, 해당 파트 담당자가 사용할 수 없다.
- 참고: 제작 파트의 `production_done`, `factory_released`도 0건이고, 출고 파트의 `warehouse_received`, `shipped`도 0건이다. 실제 운영에서 사용하는 세분화 단계가 DB에 반영되지 않은 상태다.

#### BUG-04: designRequestDate에 2024년 날짜가 대량 존재

- 현상: 전체 6,836건 중 `designRequestDate`가 2024년인 주문이 850건, `createdAt`이 2024년인 주문이 2,375건, `orderReceiptDate`가 2024년인 주문이 2,250건이다.
- 예시: ORD-20260323-007의 designRequestDate가 `2024-04-02`, ORD-20260327-008의 designRequestDate가 `2024-09-26`
- 영향: 캘린더나 날짜 기반 필터링에서 데이터가 기대와 다르게 표시될 수 있다.
- 판단: 과거 디자인 요청 후 2026년에 재주문/재접수한 경우 정상일 수 있으나, 2024년 orderReceiptDate 2,250건은 데이터 마이그레이션 시 날짜 변환 오류 가능성이 높다. 확인 필요.

---

### [GREEN] Info (개선 권장)

#### INFO-01: hold 상태가 getCustomerStatus에서 step 0('확인중')으로 매핑됨

- 파일: `server/routes/orders.js` (getCustomerStatus 함수)
- 현상: `hold` 상태(15건)가 design/production/shipping 어디에도 매핑되지 않아 step 0 + '확인중' 라벨로 분류된다.
- 영향: 고객 측 주문 추적(order-track.html)에서 보류 주문이 "확인중"이라는 모호한 상태로 표시된다.
- 권장: hold를 별도로 처리하거나, 직전 상태의 step을 유지하는 로직 추가

#### INFO-02: Tailwind CSS CDN이 302 리다이렉트 응답

- 현상: `https://cdn.tailwindcss.com`이 302 리다이렉트를 반환한다. 최종 응답은 200 OK(407KB)이므로 기능에 문제는 없다.
- 권장: 프로덕션 환경에서는 CDN 의존도를 줄이고, 빌드된 CSS 파일을 사용하는 것이 안정적이다. Tailwind CDN은 개발용으로만 권장된다.

---

## 상세 결과

### 1. 서버 API 점검

| # | 엔드포인트 | 결과 | 비고 |
|---|-----------|------|------|
| 1 | GET /api/admin/stats | PASS (200) | 연도별 필터링 정상, 320건 집계 |
| 2 | GET /api/admin/orders | PASS (200) | 페이지네이션 정상 (limit=20) |
| 3 | GET /api/admin/orders?excludeCompleted=true | PASS (200) | 165건 (delivered/cancelled 제외) |
| 4 | GET /api/admin/orders?excludeCompleted=false | PASS (200) | 6,836건 (전체) |
| 5 | GET /api/admin/customers | PASS (200) | 1,815명 |
| 6 | GET /api/admin/calendar/events | PASS (200) | 668개 이벤트 |
| 7 | POST /api/auth/login (빈 body) | PASS (400) | "Email and password required" |
| 8 | POST /api/auth/login (잘못된 인증) | PASS (401) | "Invalid credentials" |
| 9 | GET /api/auth/me (유효 토큰) | PASS (200) | 사용자 정보 정상 반환 |
| 10 | GET /api/auth/me (토큰 없음) | PASS (401) | "No token provided" |
| 11 | GET /api/auth/me (잘못된 토큰) | PASS (401) | "Invalid token" |
| 12 | PATCH /orders/:id/status (없는 주문) | PASS (404) | "주문을 찾을 수 없습니다." |
| 13 | PATCH /orders/:id/status (빈 body) | PASS (400) | "변경할 상태를 지정하세요." |
| 14 | 인증 없이 admin API 접근 | PASS (401) | 모든 admin API가 적절히 거부 |

### 2. 페이지 로드 점검

| # | 페이지 | 결과 | 비고 |
|---|--------|------|------|
| 1 | admin.html | PASS (200) | |
| 2 | admin-home.html | PASS (200) | |
| 3 | admin-order.html | PASS (200) | |
| 4 | admin-analytics.html | PASS (200) | |
| 5 | admin-customers.html | PASS (200) | |
| 6 | admin-calendar.html | PASS (200) | |
| 7 | admin-cs.html | PASS (200) | admin.html?view=cs로 리다이렉트 |
| 8 | admin-design.html | PASS (200) | admin.html?view=design으로 리다이렉트 |
| 9 | admin-production.html | PASS (200) | admin.html?view=production으로 리다이렉트 |
| 10 | admin-shipping.html | PASS (200) | admin.html?view=shipping으로 리다이렉트 |
| 11 | admin-login.html | PASS (200) | |
| 12 | myshop.html | PASS (200) | |

### 3. JS 파일 로드 및 문법 점검

| # | 파일 | 결과 | 비고 |
|---|------|------|------|
| 1 | js/admin.js | PASS | node --check 통과 |
| 2 | js/admin-order.js | PASS | |
| 3 | js/admin-home.js | PASS | |
| 4 | js/admin-common.js | PASS | |
| 5 | js/admin-calendar.js | PASS | |
| 6 | js/admin-customers.js | PASS | |
| 7 | js/admin-analytics.js | PASS | |
| 8 | server/routes/admin.js | PASS | |
| 9 | server/routes/orders.js | PASS | |
| 10 | server/routes/auth.js | PASS | |
| 11 | server/routes/customers.js | PASS | |
| 12 | server/routes/ai.js | PASS | |
| 13 | server/middleware/adminAuth.js | PASS | |
| 14 | server/server.js | PASS | |
| 15 | server/db.js | PASS | |
| 16 | server/db-sqlite.js | PASS | |

### 4. 파트별 뷰 점검

| # | 뷰 | allowedStatuses | 건수 | 결과 | 비고 |
|---|-----|----------------|------|------|------|
| 1 | 전체 (no view) | 없음 | 165건 | PASS | delivered/cancelled 제외 |
| 2 | design | design_requested, draft_done, revision, design_confirmed | 110건 | PASS | 3개 상태 반환 (revision 0건) |
| 3 | cs | consult_started, order_received, payment_completed, work_instruction_pending, work_instruction_sent | 0건 | FAIL | BUG-03 참조 |
| 4 | production | work_instruction_received, in_production, production_done, factory_released | 34건 | PASS | 1개 상태만 실제 존재 |
| 5 | shipping | warehouse_received, released, shipped, delivered | 6,675건 | PASS | delivered 포함 정상 |

### 5. 데이터 정합성 점검

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | status 컬럼 vs JSON status 일치 | PASS | 6,836건 전체 일치 (0건 불일치) |
| 2 | 유효한 상태코드만 존재 | PASS | 10종 모두 유효 |
| 3 | NULL/빈 status 없음 | PASS | 0건 |
| 4 | 고아 customerId 없음 | PASS | 0건 |
| 5 | normalizeStatus 매핑 정상 | PASS | line_work -> work_instruction_received 등 |
| 6 | 날짜 데이터 정합성 | WARN | BUG-04 참조 (2024년 날짜 대량 존재) |

### 6. 네비게이션 일관성 점검

| # | 페이지 | 네비 링크 수 | 결과 | 비고 |
|---|--------|-------------|------|------|
| 1 | admin.html | 10개 | PASS | 기준 (홈, 전체주문, 디자인, CS, 제작, 출고, 일정표, 매출분석, 고객관리, 쇼핑몰보기) |
| 2 | admin-calendar.html | 10개 | PASS | admin.html과 동일 |
| 3 | admin-analytics.html | 10개 | PASS | admin.html과 동일 |
| 4 | admin-customers.html | 10개 | PASS | admin.html과 동일 |
| 5 | admin-home.html | 6개 | FAIL | BUG-02 참조 (파트별 4개 링크 누락) |

### 7. CDN 리소스 접근 점검

| # | 리소스 | 결과 | 비고 |
|---|--------|------|------|
| 1 | Tailwind CSS (cdn.tailwindcss.com) | PASS | 302 -> 200 (407KB) |
| 2 | FullCalendar 6.1.15 | PASS (200) | |
| 3 | Pretendard 폰트 | PASS (200) | |
| 4 | Material Symbols Outlined | PASS (200) | |

---

## 종합 평가

서버 API, 페이지 로드, JS 문법, DB 정합성은 전반적으로 **안정적**이다. 인증/에러 응답도 적절하다.

주요 수정 대상:
1. **BUG-01** (navMap shipping 누락): 1줄 수정으로 해결 가능, 즉시 수정 권장
2. **BUG-02** (admin-home.html 네비 불일치): 4개 링크 추가 필요
3. **BUG-03** (CS 파트 0건): 워크플로우 설계 문제 -- 현재 DB에 CS 상태가 없는 것은 스프레드시트에서 해당 단계를 구분하지 않았기 때문으로 추정. 운영 방침 결정 필요.
4. **BUG-04** (2024년 날짜): 데이터 검증 및 정리 필요

---

점검 수행: tester (QA)
점검 도구: curl + node.js + SQLite 직접 쿼리
