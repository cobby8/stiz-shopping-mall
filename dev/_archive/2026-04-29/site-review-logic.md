# STIZ 사이트 전체 점검 보고서 — 논리적 오류

## 요약
- 점검일: 2026-04-06
- 점검 파일 수: 14개 (서버 6 + 프론트 7 + DB 1)
- 점검 범위: server/routes/admin.js, orders.js, auth.js, server.js, middleware/adminAuth.js, db-sqlite.js, js/admin.js, admin-common.js, admin-order.js, admin-home.js, admin-calendar.js, admin-analytics.js, admin-customers.js

## 발견된 논리적 오류

---

### 🔴 Critical (데이터 손상/보안 위험)

#### C-1. 주문 API가 인증 없이 전체 데이터 노출
- **파일**: `server/routes/orders.js` 225~228줄
- **문제**: `GET /api/orders`가 인증 미들웨어 없이 전체 주문 목록을 반환한다. 결제 정보(금액, 입금일), 고객 연락처, 주소 등 모든 민감 정보가 포함된 8,000건 이상의 주문이 누구나 접근 가능하다.
- **영향**: 고객 개인정보(이름, 이메일, 전화번호, 주소) + 거래 정보(금액, 결제방식) 전면 노출. 개인정보보호법 위반 소지.
- **수정 방법**: adminAuth 미들웨어 적용하거나, 최소한 필드를 제한하여 반환해야 한다.

#### C-2. 주문 상세 API도 인증 없이 노출
- **파일**: `server/routes/orders.js` 284~291줄
- **문제**: `GET /api/orders/:orderNumber`가 인증 없이 주문번호만으로 전체 주문 상세를 반환한다. 관리자 전용 API(`/api/admin/orders/:id`)와 달리 민감 정보 필터링 없이 원본 그대로 노출.
- **영향**: 주문번호 패턴(ORD-YYYYMMDD-NNN)을 알면 순차적으로 모든 주문 정보를 열람할 수 있다.
- **수정 방법**: 이 엔드포인트를 제거하거나, `/api/orders/track/:orderNumber`처럼 민감 정보를 제외하고 반환해야 한다.

#### C-3. JWT 비밀키가 소스코드에 하드코딩
- **파일**: `server/routes/auth.js` 12줄
- **문제**: `JWT_SECRET = process.env.JWT_SECRET || 'stiz-shop-secret-key-2026'` — 환경변수가 설정되지 않으면 기본값이 사용되며, 이 기본값은 소스코드에 노출되어 있다.
- **영향**: 공격자가 이 키를 알면 임의의 JWT 토큰을 생성하여 관리자 권한을 획득할 수 있다. 특히 `.env` 파일 없이 개발 모드로 실행 중일 가능성이 높다.
- **수정 방법**: 서버 시작 시 `JWT_SECRET` 환경변수가 없으면 에러를 발생시켜 기동을 차단하거나, 최소한 경고를 출력해야 한다.

#### C-4. db-sqlite.js에서 테이블명/컬럼명이 문자열 보간으로 삽입
- **파일**: `server/db-sqlite.js` 94, 363, 372줄
- **문제**: `` `SELECT * FROM ${tbl}` ``, `` `WHERE ${field} = ?` `` 등에서 `tbl`과 `field`가 문자열 보간으로 SQL에 삽입된다. 현재는 내부 코드에서만 호출하지만, `field` 파라미터가 `findOne(collection, field, value)` 형태로 전달되므로, 라우트 핸들러에서 사용자 입력을 `field`에 넣으면 SQL 인젝션이 발생한다.
- **현재 위험도**: 중간. 현재 코드에서 `findOne`은 `'email'`, `'id'` 등 하드코딩된 필드명으로만 호출되지만, 향후 수정 시 취약점이 될 수 있다.
- **수정 방법**: `field`를 화이트리스트로 검증하거나, `tableName()` 함수처럼 허용된 값인지 확인하는 로직을 추가해야 한다.

---

### 🟡 Warning (잘못된 동작 가능)

#### W-1. 서버 statusTabs에 'production_done' 누락
- **파일**: `server/routes/admin.js` 81줄
- **문제**: 서버의 `statusTabs` 배열에 `'production_done'`이 빠져 있다. `STATUS_FLOW`(orders.js)에는 19단계 중 하나로 정의되어 있고, 프론트 `PAGE_PRESETS.production.allowedStatuses`에도 없다. 하지만 `STATUS_LABELS`에는 `production_done: '생산완료'`가 존재한다.
- **영향**: `statusCounts`에서 '생산완료' 건수가 집계되지 않아, 제작 파트 탭에서 '생산완료' 건수가 표시되지 않는다. 해당 상태의 주문이 건수 합산에서 빠진다.
- **수정 방법**: `statusTabs` 배열에 `'production_done'`을 `'in_production'` 뒤에 추가해야 한다.

#### W-2. 프론트 STATUS_TABS에도 'production_done' 누락 + 'shipped' 누락
- **파일**: `js/admin.js` 58~74줄
- **문제**: 프론트엔드 `STATUS_TABS` 배열에 `'production_done'`과 `'shipped'` 탭이 없다. 서버의 `statusTabs`에는 `'shipped'`가 있어서 건수는 집계되지만, 프론트에 해당 탭 버튼이 없으므로 표시되지 않는다.
- **영향**: '생산완료', '배송중' 상태의 주문이 상태별 탭에서 개별적으로 조회 불가. 특히 출고 파트(`shipping` 프리셋)에서 `allowedStatuses`에 `'shipped'`를 포함했지만 탭이 없어 건수만 합산되고 개별 필터는 안 된다.
- **수정 방법**: `STATUS_TABS`에 `{ code: 'production_done', label: '생산완료' }`와 `{ code: 'shipped', label: '배송중' }`을 추가해야 한다.

#### W-3. 서버 statusTabs에 'revision' 누락
- **파일**: `server/routes/admin.js` 81줄
- **문제**: `statusTabs`에 `'revision'`(수정 중)이 포함되지 않았다. `STATUS_FLOW`에는 존재하고, 디자인 프리셋 `allowedStatuses`에도 포함되어 있다.
- **영향**: '수정 중' 상태의 주문 건수가 `statusCounts`에서 집계되지 않아, 디자인 파트에서 해당 건수가 항상 0으로 표시된다.
- **수정 방법**: `statusTabs`에 `'revision'`을 `'draft_done'` 뒤에 추가해야 한다.

#### W-4. normalizeOrderStatus의 스프레드 연산자 순서 오류
- **파일**: `server/routes/admin.js` 32~45줄
- **문제**:
  ```javascript
  workInstruction: {
      status: order.workInstruction?.status || '',
      sentAt: order.workInstruction?.sentAt || '',
      // ...기본값 설정...
      ...order.workInstruction  // ← 기본값 설정 후 원본으로 다시 덮어씀
  }
  ```
  스프레드 연산자가 기본값 설정 **뒤에** 위치하여, `order.workInstruction`에 빈 문자열이나 null이 있으면 기본값이 무의미해진다. 예를 들어 `order.workInstruction.status`가 `null`이면 위에서 `''`로 설정했다가 아래 `...order.workInstruction`에서 다시 `null`로 덮어씌워진다.
- **영향**: 데이터 정규화가 의도대로 작동하지 않아, 프론트에서 null 값 관련 오류가 발생할 수 있다.
- **수정 방법**: 스프레드 연산자를 먼저 적용하고 기본값을 뒤에 쓰거나, 명시적인 null 체크 로직을 사용해야 한다.

#### W-5. 주문 복제 시 Date.now()으로 ID 생성 — 충돌 가능
- **파일**: `server/routes/admin.js` 456줄
- **문제**: `id: Date.now()`로 ID를 생성한다. 밀리초 단위 타임스탬프를 ID로 사용하면, 같은 밀리초 내에 2개 이상의 요청이 들어올 때 ID 충돌이 발생한다. db-sqlite.js의 `insert()`에서도 `record.id = record.id || Date.now()`를 사용한다.
- **영향**: 동시 요청 시 ID 충돌로 데이터 저장 실패 또는 데이터 덮어쓰기 발생 가능.
- **수정 방법**: SQLite의 `AUTOINCREMENT` 기능을 사용하거나, UUID를 ID로 사용하는 것이 안전하다. 현재 트래픽이 적으면 당장 문제는 없지만, 일괄 처리(bulk-status 등) 시에는 주의 필요.

#### W-6. 캘린더 이벤트의 날짜 비교가 문자열 비교
- **파일**: `server/routes/admin.js` 2141줄
- **문제**: `deadlineDate >= start && deadlineDate <= end`에서 ISO 날짜 문자열과 YYYY-MM-DD 문자열을 직접 비교한다. `deadlineDate`가 `"2026-04-05T00:00:00.000Z"` 형식이고 `start`가 `"2026-04-01"` 형식이면, 문자열 비교가 정상 작동하지만, 시간대(T 이후)에 따라 경계값 판정이 부정확할 수 있다.
- **영향**: 월말/월초 경계에서 이벤트가 누락되거나 중복 표시될 수 있다. 납기일이 ISO 형식(시간 포함)이면 `"2026-04-30T00:00:00.000Z" <= "2026-04-30"`이 `false`가 되어 해당 날짜 이벤트가 표시되지 않는다.
- **수정 방법**: `.substring(0, 10)`으로 날짜 부분만 추출하여 비교해야 한다. (접수일은 이미 이렇게 처리하고 있다: 2171줄)

#### W-7. requireAuth 미들웨어가 DB 확인을 하지 않음
- **파일**: `server/middleware/adminAuth.js` 103~131줄
- **문제**: `requireAuth`는 JWT 토큰의 디코드된 정보만 사용하고, `adminAuth`처럼 DB에서 사용자 존재 여부를 확인하지 않는다. 토큰 발급 후 사용자가 삭제되어도 7일간 유효한 토큰으로 접근 가능하다.
- **영향**: 삭제/비활성화된 사용자가 토큰 만료까지 API에 접근할 수 있다. 현재 `requireAuth`를 사용하는 라우트가 없으면 영향은 없지만, 향후 고객용 API에 적용 시 문제가 된다.
- **수정 방법**: DB 조회를 추가하거나, 사용하지 않는다면 제거를 고려해야 한다.

#### W-8. 대시보드(admin-home.js)에서 stats API를 중복 호출
- **파일**: `js/admin-home.js` 89줄, 149줄
- **문제**: `loadKPIs()`에서 `/api/admin/stats`를 호출하고, `loadWorkSummary()`에서도 동일한 API를 다시 호출한다. 같은 데이터를 2번 요청한다.
- **영향**: 서버에서 `db.getAll('orders')`가 2번 실행되어 불필요한 부하. 8,000건 주문의 전체 스캔이 2회 발생.
- **수정 방법**: 한 번만 호출하고 결과를 공유하면 된다.

#### W-9. getCustomerStatus에서 'hold'와 'cancelled' 처리 미비
- **파일**: `server/routes/orders.js` 79~91줄
- **문제**: `getCustomerStatus` 함수가 `hold`와 `cancelled` 상태를 어떤 단계에도 매핑하지 않아 `{ step: 0, label: '확인중' }`을 반환한다.
- **영향**: 고객이 주문 추적 페이지에서 '보류' 또는 '취소' 주문을 확인할 때 "확인중"이라는 모호한 메시지를 보게 된다. 고객 입장에서 혼란스러울 수 있다.
- **수정 방법**: `hold`는 별도 메시지("주문 보류 중"), `cancelled`는 "주문 취소됨"으로 매핑해야 한다.

---

### 🟢 Info (개선 권장)

#### I-1. admin-common.js의 STATUS_LABELS에 레거시 코드 잔존
- **파일**: `js/admin-common.js` 39~40줄
- **문제**: `pending: '상담개시'`, `processing: '생산중'`이 STATUS_LABELS에 포함되어 있다. 서버에서는 `LEGACY_STATUS_MAP`으로 정규화하므로 이 키로 주문이 올 일이 없지만, 프론트에서 혹시 레거시 상태를 직접 받을 경우를 대비한 것으로 보인다.
- **영향**: 동작에는 문제 없으나, 19단계 상태 체계와 혼동될 수 있다.
- **수정 방법**: 주석으로 레거시 대응 코드임을 명시하거나 제거.

#### I-2. SPORT_LABELS가 서버(admin.js)와 프론트(admin-common.js) 양쪽에 중복 정의
- **파일**: `server/routes/admin.js` 1087~1100줄, 1190~1194줄 / `js/admin-common.js` 43~59줄
- **문제**: 종목 라벨 매핑이 서버의 `by-sport` API, `margin` API, `calendar/events` API에 각각 로컬 변수로 정의되어 있고, 프론트에도 별도로 존재한다. 서버 쪽에만 3곳에 중복.
- **영향**: 새 종목 추가 시 모든 곳을 수정해야 하며, 일부 누락될 수 있다. 예를 들어 `'softball'`이 서버 admin.js의 SPORT_LABELS에는 없지만 캘린더 이벤트 생성부에만 있다.
- **수정 방법**: 서버에서는 orders.js에 공통 SPORT_LABELS를 export하고 import해서 사용.

#### I-3. 프론트엔드 getDefaultAdminPage()에서 'all' scope 분기 누락
- **파일**: `js/admin-common.js` 97~108줄
- **문제**: 서버의 `getDefaultAdminPage()`는 `scopes.includes('all')`이면 `'admin-home.html'`을 반환하지만, 프론트의 같은 이름 함수는 `scopes.includes('all')` 체크가 없어 design/cs/production/shipping 중 해당하는 것이 없으면 `'admin-home.html'`로 폴백한다.
- **영향**: `scopes: ['all']`인 사용자는 결과적으로 동일하게 동작하므로 실제 문제는 없다. 하지만 서버와 프론트의 로직 불일치.
- **수정 방법**: 프론트에도 `if (scopes.includes('all')) return 'admin-home.html';`을 첫 줄에 추가하여 서버와 일치시킨다.

#### I-4. admin.js의 applyNavActiveState()에 'shipping' 네비 누락
- **파일**: `js/admin.js` 286~304줄
- **문제**: `navMap`에 `shipping: 'nav-shipping'`이 없어서, 출고 파트 뷰에서 네비게이션의 활성 표시가 되지 않는다.
- **영향**: 출고 파트 페이지에서 어떤 네비 항목에도 활성 스타일이 적용되지 않아 사용자가 현재 위치를 인지하기 어렵다.
- **수정 방법**: `navMap`에 `shipping: 'nav-shipping'`을 추가한다.

#### I-5. admin-home.js에서 XSS 위험이 있는 innerHTML 사용
- **파일**: `js/admin-home.js` 232, 240~247줄
- **문제**: `loadStaleOrders()`에서 `customerName`, `order.orderNumber` 등 서버 데이터를 `escapeHtml()` 없이 직접 innerHTML에 삽입한다. 다른 파일(admin.js)에서는 `escapeHtml()`을 꼼꼼히 적용하고 있다.
- **영향**: 주문의 팀명이나 고객명에 `<script>` 같은 HTML 태그가 포함되면 XSS 공격이 가능하다. 데이터가 관리자가 입력한 것이므로 위험도는 낮지만, 외부 데이터 임포트(스프레드시트 동기화) 시 의도치 않은 HTML이 유입될 수 있다.
- **수정 방법**: `escapeHtml(customerName)` 등을 적용한다.

#### I-6. 주문 생성 API에서 관리자/고객 구분 없이 직접 주문 생성 가능
- **파일**: `server/routes/orders.js` 184~222줄
- **문제**: `POST /api/orders`에 인증 미들웨어가 없어서 누구나 주문을 생성할 수 있다. 특히 `order.status`를 요청 body에서 직접 받아서 임의의 상태로 주문 생성이 가능하다.
- **영향**: 의도하지 않은 주문 데이터가 DB에 삽입될 수 있다.
- **수정 방법**: 인증을 적용하거나, 최소한 status를 강제로 `'consult_started'`로 고정해야 한다.

#### I-7. admin-home.js에서 calcDday가 admin.js와 다른 반올림 방식
- **파일**: `js/admin-home.js` 74줄 vs `js/admin.js` 180줄
- **문제**: admin-home.js는 `Math.ceil()`, admin.js는 `Math.round()`를 사용한다. 같은 납기일에 대해 다른 D-day 값이 표시될 수 있다.
- **영향**: 대시보드와 주문 목록에서 같은 주문의 D-day가 1일 차이날 수 있다.
- **수정 방법**: 하나의 공통 함수로 통일. admin-common.js에 D-day 계산 함수를 옮기는 것이 좋다.

#### I-8. 서버에서 매 API 호출마다 db.getAll('orders') 전체 스캔
- **파일**: `server/routes/admin.js` 전반
- **문제**: orders API에서 `db.getAll('orders')`를 호출하면 SQLite에서 전체 행을 읽고 JSON을 파싱한다. stats, monthly, staff, top-customers, by-sport, margin, calendar/events, reorder-candidates 등 12개 API가 각각 전체 스캔을 수행한다.
- **영향**: 8,000건 주문 x 12개 API = 대시보드 로딩 시 최대 96,000건의 JSON 파싱. SQLite로 전환했지만 getAll 패턴이 그대로여서 성능 개선 효과가 제한적이다.
- **수정 방법**: SQL WHERE 절로 필요한 데이터만 조회하는 최적화가 필요하다 (architecture.md A-12에서도 언급된 "후속 최적화").

---

## 파일별 상세

### server/routes/orders.js
| 항목 | 발견 사항 |
|------|----------|
| C-1 | GET /api/orders — 인증 없이 전체 주문 노출 |
| C-2 | GET /api/orders/:orderNumber — 인증 없이 상세 노출 |
| I-6 | POST /api/orders — 인증 없이 주문 생성 + status 미검증 |
| W-9 | getCustomerStatus — hold/cancelled 미처리 |

### server/routes/auth.js
| 항목 | 발견 사항 |
|------|----------|
| C-3 | JWT_SECRET 하드코딩 기본값 |

### server/routes/admin.js
| 항목 | 발견 사항 |
|------|----------|
| W-1 | statusTabs에 production_done 누락 |
| W-3 | statusTabs에 revision 누락 |
| W-4 | normalizeOrderStatus 스프레드 연산자 순서 |
| W-5 | Date.now() ID 충돌 가능 |
| W-6 | 캘린더 날짜 문자열 비교 경계값 문제 |
| I-2 | SPORT_LABELS 3곳 중복 정의 |
| I-8 | getAll 전체 스캔 12회 |

### server/middleware/adminAuth.js
| 항목 | 발견 사항 |
|------|----------|
| W-7 | requireAuth DB 확인 미비 |

### server/db-sqlite.js
| 항목 | 발견 사항 |
|------|----------|
| C-4 | 테이블명/컬럼명 문자열 보간 — 잠재적 SQL 인젝션 |

### js/admin.js
| 항목 | 발견 사항 |
|------|----------|
| W-2 | STATUS_TABS에 production_done, shipped 누락 |
| I-4 | applyNavActiveState에 shipping 누락 |
| I-7 | calcDday 반올림 방식 불일치 |

### js/admin-common.js
| 항목 | 발견 사항 |
|------|----------|
| I-1 | STATUS_LABELS 레거시 코드 잔존 |
| I-3 | getDefaultAdminPage 서버/프론트 로직 불일치 |

### js/admin-home.js
| 항목 | 발견 사항 |
|------|----------|
| W-8 | stats API 중복 호출 |
| I-5 | innerHTML에 escapeHtml 미적용 |
| I-7 | calcDday Math.ceil vs Math.round 불일치 |

### js/admin-order.js
| 항목 | 발견 사항 |
|------|----------|
| - | 별도 치명적 문제 없음. STATUS_FLOW 정의가 서버와 일치 확인. |

### js/admin-calendar.js
| 항목 | 발견 사항 |
|------|----------|
| - | 별도 치명적 문제 없음. 필터 로직 정상. |

---

## 종합 판정

전체 19건의 이슈 발견:
- 🔴 Critical: **4건** (인증 부재 2건, JWT 키 노출 1건, SQL 인젝션 잠재성 1건)
- 🟡 Warning: **9건** (상태 탭 누락 3건, 데이터 정규화 1건, ID 충돌 1건, 날짜 비교 1건, 인증 미비 1건, API 중복 호출 1건, 고객 상태 미처리 1건)
- 🟢 Info: **8건** (코드 중복, 로직 불일치, XSS 위험, 성능 등)

**우선 수정 순서**: C-1/C-2 (인증 미비) > C-3 (JWT 키) > W-1/W-2/W-3 (상태 탭 누락) > W-4 (정규화) > W-6 (날짜 비교) > 나머지
