# P0-1 결제 승인 + 주문 생성 원자 트랜잭션화 정밀 설계

> 작성: 2026-04-29 / planner-architect
> 상위 분석: `dev/usability-plan-2026-04-29.md` L53~54, L66, L102~104
> 사용자 결정 (Q1): A 지금 진행 (Day 2)

## A. 현 흐름 실측 (L-10)

### A-1. 결제 → 주문 생성 7단계 (현재)

| # | 위치 | 줄 | 동작 |
|---|------|---|------|
| 1 | `js/checkout.js` | L312~370 | `processTossPayment()` — `localStorage.setItem('stiz_pending_order', ...)` 후 `tossPayments.requestPayment()` 호출 |
| 2 | (브라우저) | — | 토스 결제창 → successUrl(`/checkout.html?status=success&paymentKey=...&orderId=...&amount=...`) 리다이렉트 |
| 3 | `js/checkout.js` | L384~427 | `handleTossPaymentSuccess()` — URL 파싱 → `localStorage.getItem('stiz_pending_order')` 복원 → `POST /api/payment/confirm` |
| 4 | `server/routes/payment.js` | L48~138 | 토스 v1 `confirm` API 호출 → `status==='DONE'` + 금액 일치 검증 → **응답 반환만** (DB insert 없음) |
| 5 | `js/checkout.js` | L429~462 | confirmData.success → `buildOrderData()` → **별도** `POST /api/orders` (CHECKOUT_API) |
| 6 | `server/routes/orders.js` | L211~310 | status 화이트리스트 + payment 정규화 + `db.insert('orders', ...)` + `sendNotification('order_created')` |
| 7 | `js/checkout.js` | L469~485 | `clearCart()` + `localStorage.removeItem('stiz_pending_order')` + `showOrderComplete()` |

### A-2. 트랜잭션 끊김 지점 — 4↔5 사이

`payment.js`는 **응답만 반환**하고 종료한다. `orders.js`의 INSERT는 **별도 HTTP 라운드트립**.

이 구간에 들어갈 수 있는 위험:
- 클라이언트 네트워크 끊김(Wi-Fi 변경, LTE→Wi-Fi 핸드오버)
- 사용자 새로고침 / 탭 닫기 / 뒤로가기
- JS 예외 (buildOrderData throw)
- 모바일 백그라운드 진입 → fetch abort

**현 코드의 자기 인지**: `checkout.js` L481에 `"결제는 완료되었으나 주문 처리에 실패했습니다."` 이미 메시지 존재 → 개발자가 위험을 알고 있었지만 미해결.

### A-3. DB / 스키마 실측

| 항목 | 결과 |
|------|------|
| `better-sqlite3` 트랜잭션 | ✅ 지원. `db.transaction(fn)` (`server/db-sqlite.js` L203, L314) |
| `paymentKey` 저장 위치 | ❌ 컬럼 없음. **JSON blob `data` 안에만** (`orders.data.payment.paymentKey`) |
| UNIQUE 제약 | `orders.orderNumber` 만 (`schema.sql` L11) |
| `extractOrderColumns()` | id/orderNumber/status/manager/customerId/createdAt/orderReceiptDate/updatedAt 8필드 (L122~133) |
| 토스 `cancel` API 사용 | ❌ **payment.js에 cancel/refund 코드 0줄**. 보상 처리 미구현 |

## B. 트랜잭션 끊김 재현 시나리오 (현재)

```
1. 사용자가 카드 결제 → 토스 결제창 → successUrl 리다이렉트
2. checkout.js fetch /api/payment/confirm → 200 OK (토스 승인 OK)
3. ⚠️ 사용자가 즉시 새로고침 또는 Wi-Fi 끊김
4. fetch /api/orders 실행 안 됨
5. 결과: 토스에 결제 기록 + 고객 카드 청구 + STIZ DB에 주문 0건
6. 고객은 주문 추적 페이지에서 자기 주문을 찾을 수 없음
7. 운영팀은 토스 대시보드와 STIZ 주문 대조해서 환불 / 수동 주문 생성
```

운영 첫 주에 1~2건 발생 가능 (Q2 b — 운영 첫 주문 자연 검증과 충돌).

## C. 추천 안: A+B 하이브리드

| 안 | 내용 | 효과 | 비용 |
|----|------|------|------|
| A | **서버 통합** — payment/confirm 안에서 토스 승인 + DB insert 한 트랜잭션 | 트랜잭션 경계 명확. 클라이언트 끊김 무관 | checkout.js 변경 (orderData를 confirm에 동봉) + payment.js 50줄 추가 |
| B | **paymentKey UNIQUE 멱등** — 동시/재시도 호출 차단 | 안 A 안에서 자연스럽게 적용 | schema 1줄 + extractOrderColumns 1줄 |
| C | localStorage 재시도 큐 | 새 디바이스 누락. 안 A 채택하면 불필요 | — |

**채택**: A + B 하이브리드. (C 불필요)

**근거**:
1. 안 A가 트랜잭션 경계를 가장 깔끔하게 만든다 — 클라이언트 "fetch 완료 응답"을 받는 시점에 이미 DB에 주문 존재.
2. B(paymentKey UNIQUE)는 "동일 paymentKey 두 번 confirm" 같은 재시도 케이스를 자연 차단 + DB 무결성. **안 A의 안전망** 역할.
3. C(localStorage 큐)는 안 A 채택 시 의미 없음 — 서버 응답을 받기 전에는 클라이언트가 굳이 "재시도"할 필요가 없음 (서버에 이미 commit). 응답 못 받았으면 멱등 retry로 충분.

## D. 변경 파일 5개 + 작업 단위 5개

### D-1. 작업 단위

| # | 단위 | 파일 | 변경량 | 시간 | 위험 | 의존 |
|---|------|------|:----:|:----:|:----:|------|
| 1 | schema: orders.paymentKey 컬럼 + UNIQUE | `server/schema.sql` (+2줄) + 마이그레이션 1회 (`server/db-sqlite.js` `ALTER TABLE`) | +5 | 30분 | 🟡 중 | 없음 |
| 2 | extractOrderColumns에 paymentKey 추가 | `server/db-sqlite.js` L122~133 (+2줄) | +2 | 10분 | 🟢 저 | 1 |
| 3 | payment.js에 트랜잭션 + 멱등 + cancel 보상 | `server/routes/payment.js` (+50~70줄) | +60 | 90분 | 🔴 고 | 1, 2 |
| 4 | orders.js POST 핸들러는 그대로 유지 (재사용) — 단 sendNotification 호출 위치만 옮김 | (현 흐름은 안 A에서 호출 안 됨, 무통장에서만 사용) | 0 | 10분 | 🟢 저 | 3 |
| 5 | checkout.js: confirm에 orderData 동봉 + 별도 POST /api/orders 제거 | `js/checkout.js` L384~485 (-30 +20줄) | ~ | 60분 | 🟡 중 | 3 |
| 6 | 통합 테스트 시나리오 5건 | tester | — | 30분 | — | 1~5 |

**총 추정 시간**: 4시간 (스펙 일치)

### D-2. 변경 파일 영향도

```
server/schema.sql               +2  (paymentKey TEXT UNIQUE)
server/db-sqlite.js             +5  (extractOrderColumns + 마이그레이션 ALTER)
server/routes/payment.js        +60 (트랜잭션 + 멱등 + cancel 보상)
js/checkout.js                  -10 (분리 호출 통합)
[변경 0]                        server/routes/orders.js (POST / — 무통장용 그대로)
[변경 0]                        server/services/notification.js
```

## E. 트랜잭션 경계 + 보상 처리 (의사 코드)

### E-1. payment.js 새 흐름

```js
router.post('/payment/confirm', async (req, res) => {
  const { paymentKey, orderId, amount, orderData } = req.body;
  // ↑ orderData 신규: checkout.js가 buildOrderData()로 만든 주문 객체

  // 0. 멱등 체크 (트랜잭션 밖) — 이미 처리된 paymentKey면 기존 주문 반환
  const existing = db.findByFilter('orders', o => o.payment?.paymentKey === paymentKey);
  if (existing.length > 0) {
    return res.json({ success: true, orderNumber: existing[0].orderNumber, idempotent: true });
  }

  // 1. 토스 승인 API 호출 (현재 그대로)
  const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {...});
  const tossData = await tossRes.json();
  if (!tossRes.ok || tossData.status !== 'DONE' || tossData.totalAmount !== Number(amount)) {
    return res.status(400).json({ success: false, error: ... });
  }

  // 2. 트랜잭션: 주문 insert (UNIQUE 제약으로 동시성 안전)
  let savedOrder;
  try {
    savedOrder = db.transaction(() => {
      const fullOrder = migrateOrder({
        ...sanitizeOrderData(orderData),  // status 화이트리스트 + payment 정규화
        payment: {
          ...orderData.payment,
          paymentKey: tossData.paymentKey,
          tossOrderId: tossData.orderId,
          totalAmount: tossData.totalAmount,
          method: 'toss',
          paidDate: tossData.approvedAt  // ⭐ 토스 승인 시점 = 입금 확정
        },
        status: 'design_requested',  // PG 결제는 CS 건너뜀
        orderNumber: generateOrderNumber()
      });
      return db.insert('orders', fullOrder);
    })();
  } catch (err) {
    // 3. DB insert 실패 → 보상 트랜잭션: 토스 취소
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      // paymentKey 중복 (동시 confirm 호출) → 기존 주문 재조회
      const existing = db.findByFilter('orders', o => o.payment?.paymentKey === paymentKey);
      if (existing.length > 0) return res.json({ success: true, orderNumber: existing[0].orderNumber, idempotent: true });
    }

    // 그 외 DB 실패 → 토스 cancel API 호출 (환불)
    console.error('[payment] DB insert 실패, 토스 취소 진행:', err);
    await cancelTossPayment(paymentKey, secretKey, '주문 생성 실패로 자동 취소');
    return res.status(500).json({ success: false, error: 'DB 오류로 결제가 취소되었습니다. 다시 시도해주세요.' });
  }

  // 4. 알림 (트랜잭션 밖, fire-and-forget — 실패해도 주문 OK)
  sendNotification('order_created', savedOrder);

  // 5. 응답
  res.json({ success: true, orderNumber: savedOrder.orderNumber, paymentKey, totalAmount: tossData.totalAmount });
});

// 헬퍼: 토스 결제 취소
async function cancelTossPayment(paymentKey, secretKey, reason) {
  const auth = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
  return fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancelReason: reason })
  });
}
```

### E-2. 보상 트랜잭션 정의

| 단계 실패 | 보상 |
|---------|------|
| 토스 승인 자체 실패 | 없음 (DB 영향 0). 클라이언트 에러 응답 |
| 토스 승인 OK + DB UNIQUE 충돌 | **재조회 후 기존 주문 반환** (멱등) |
| 토스 승인 OK + DB 일반 실패 | **토스 cancel API 호출** → 자동 환불 → 클라이언트 에러 응답 |
| sendNotification 실패 | try-catch (notification.js 내부) — 무시 |

## F. 실패 시나리오 5종 처리표

| # | 시나리오 | 결과 |
|---|---------|------|
| 1 | 정상 결제 | 토스 승인 → DB 주문 1건 → 알림 → 200 OK |
| 2 | 토스 승인 실패 (카드 한도) | DB 변경 0 → 400 응답 → 클라이언트 에러 표시 |
| 3 | 토스 승인 OK + 동시 confirm 2회 (사용자 따닥) | 첫 confirm DB insert 성공 → 두 번째 SQLITE_CONSTRAINT → 기존 주문 반환 (멱등) |
| 4 | 토스 승인 OK + DB insert 실패 (디스크 풀 등) | catch → 토스 cancel → 환불 → 500 응답 |
| 5 | 클라이언트 네트워크 끊김 (응답 못 받음) | 서버는 트랜잭션 commit 완료 → 사용자가 새로고침/재시도 시 동일 paymentKey로 confirm 재호출 → 멱등 응답 (기존 orderNumber 반환) |

## G. 회귀 위험 + 방어선

### G-1. 위험 4종

1. **결제 흐름 회귀 = 매출 0** — 한 줄 버그도 치명. tester 시나리오 5종 전수 + 무통장 흐름 회귀 검증 필수
2. **schema 마이그레이션** — 기존 8,073건 주문에 `paymentKey` 컬럼 NULL 채우기. UNIQUE는 NULL 허용이라 충돌 없음 (SQLite 표준)
3. **토스 cancel API 미경험** — payment.js에 cancel 코드 0줄. 토스 V1 cancel API 스펙 확인 필요 (`POST /v1/payments/{paymentKey}/cancel` body `cancelReason` 필수)
4. **무통장 흐름 영향 0 보장** — 무통장은 `processBankTransfer()` (checkout.js L491~)이 직접 `POST /api/orders` 호출. 안 A 변경은 PG만. orders.js POST 그대로 유지

### G-2. 방어선 5종

1. tester가 시나리오 5종 + 무통장 회귀 + 기존 주문 1건 조회 검증
2. `db.findByFilter('orders', o => o.payment?.paymentKey === ...)` 멱등 체크는 트랜잭션 밖에서 (lock 없음, 빠름)
3. UNIQUE 충돌 catch는 SQLITE_CONSTRAINT_UNIQUE 에러 코드 명시 매칭
4. 토스 cancel 실패 시(네트워크 끊김 등) — 로그 + 운영팀 알림 (env로 cancel 실패 알림 채널 운영)
5. **dry-run 단계 1회**: 운영 키로 1만원 결제 → 정상 흐름 검증 → 환불 → 트랜잭션 끊김 시뮬레이션 1회 (개발자 도구로 5단계 fetch 차단)

## H. 작업 시작 전 사용자 확인 필요

### H-1. 의사결정 1: 멱등 응답 의미
**Q**: 동일 paymentKey 재호출 시 응답 형식?
**제안**: `{ success: true, orderNumber, idempotent: true, totalAmount }` — 클라이언트는 `idempotent` 플래그 무시하고 정상 처리 (응답이 항상 동일)

### H-2. 의사결정 2: 토스 cancel 실패 시 처리
**Q**: 토스 cancel API 호출도 실패하면? (DB insert 실패 + cancel 실패 = 결제됨 + 주문 없음 + 환불 안 됨)
**제안**: 에러 로그 + activityLog `payment_orphan` 기록 + 운영팀 수동 환불 (월 0~1건 예상)

### H-3. 의사결정 3: schema 마이그레이션 방식
**Q**: 기존 8,073건은 paymentKey 컬럼 빈 값(NULL)으로 채울 것인가?
**제안**: `ALTER TABLE orders ADD COLUMN paymentKey TEXT` + `CREATE UNIQUE INDEX idx_orders_paymentKey ON orders(paymentKey) WHERE paymentKey IS NOT NULL AND paymentKey != ''` (부분 인덱스 — 빈값/NULL 중복 허용, 실값만 UNIQUE)

→ **3건 모두 보수적 default로 진행 가능**. 별도 사용자 확인 없이 developer에게 위임 후 테스트로 검증.
