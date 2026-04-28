/**
 * 토스페이먼츠 결제 API (payment.js)
 * 비유: 마트 카드 결제기 — 고객이 토스로 결제하면, 서버에서 "진짜 결제됐나요?" 확인하는 것
 *
 * [P0-1 트랜잭션 통합 후] 새 흐름:
 *   1. 프론트에서 토스 SDK로 결제창 호출 → 사용자가 결제 완료
 *   2. 토스가 successUrl로 리다이렉트 (paymentKey, orderId, amount 쿼리)
 *   3. 프론트에서 서버로 POST /api/payment/confirm 요청 (orderData 동봉!)
 *   4. 서버에서 한 번에 처리:
 *      a) paymentKey 멱등 사전 조회 (이미 있으면 기존 주문 반환)
 *      b) 토스 confirm API 호출 → 금액 검증
 *      c) 트랜잭션으로 orders INSERT (paymentKey UNIQUE → 동시 호출 자연 차단)
 *      d) DB 실패 시 토스 cancel API 보상 호출 (자동 환불)
 *   5. 응답으로 orderNumber 반환 → 프론트에서 주문완료 페이지 표시
 *
 * 엔드포인트:
 *   GET  /api/payment/config   — 프론트에 clientKey 전달 (SDK 초기화용)
 *   POST /api/payment/confirm  — 결제 승인 + 주문 생성 (한 트랜잭션)
 *
 * 주의: TOSS_CLIENT_KEY / TOSS_SECRET_KEY가 없으면 PG 결제 비활성화 (무통장만 표시)
 */

import { Router } from 'express';
import db, { database } from '../db.js';
// [P0-1] 트랜잭션 안에서 재사용 — orders.js POST 핸들러와 동일한 정규화 로직
import { migrateOrder, generateOrderNumber, normalizeStatus } from './orders.js';
// [P0-1] 알림은 트랜잭션 commit 후 호출 (실패해도 주문은 OK)
import { sendNotification } from '../services/notification.js';

const router = Router();

// ===== 환경변수 헬퍼 =====
// ES Module에서는 import가 dotenv.config()보다 먼저 실행되므로,
// 환경변수를 함수 호출 시점에 읽어야 한다 (모듈 레벨에서 읽으면 빈 값)
function getTossKeys() {
  const clientKey = process.env.TOSS_CLIENT_KEY || '';
  const secretKey = process.env.TOSS_SECRET_KEY || '';
  const configured = !!(clientKey && secretKey);
  return { clientKey, secretKey, configured };
}

// ===== [P0-1] 토스 결제 취소 헬퍼 (보상 트랜잭션용) =====
// 비유: DB 저장이 실패했을 때 "토스에서 결제를 자동으로 취소(환불)해주세요" 요청하는 것
// 토스 v1 cancel API: POST /v1/payments/{paymentKey}/cancel + body { cancelReason }
// 실패 시 로그만 남김 — 자동 환불 보장은 못 하지만, 운영자가 수동 환불할 수 있게 흔적 남김
async function tossCancel(paymentKey, secretKey, reason) {
  try {
    const auth = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
    const response = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cancelReason: reason })
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[Payment] cancel API 실패 — paymentKey=${paymentKey}, reason=${reason}, status=${response.status}, body=${errBody}`);
      return false;
    }
    console.log(`[Payment] cancel 성공 — paymentKey=${paymentKey}, reason=${reason}`);
    return true;
  } catch (err) {
    console.error(`[Payment] cancel 호출 예외 — paymentKey=${paymentKey}`, err.message);
    return false;
  }
}

// ===== [P0-1] orderData 정규화 (orders.js POST 핸들러의 화이트리스트 로직 재현) =====
// 비유: 고객이 보낸 주문서에서 "위조 가능 필드"를 서버 기준으로 강제 리셋하는 것
// orders.js POST `/`와 동일한 정규화 정책 — 결제 통합으로 우회 차단
//
// PG 결제 전용 화이트리스트:
//   - status: 결제 완료 PG 흐름이라 'design_requested' 또는 'consult_started'만 허용
//   - payment: 위조 가능 필드(paidDate/quoteUrl/autoQuote)를 강제 리셋
//   - paymentKey/tossOrderId는 토스 응답으로 덮어쓰기 (호출자가 위조해도 무효)
const ALLOWED_NEW_ORDER_STATUSES = ['consult_started', 'design_requested'];

function sanitizePgOrderData(orderData, tossData) {
  // 필수 필드 검증
  if (!orderData || typeof orderData !== 'object') {
    throw new Error('orderData가 누락되었습니다.');
  }
  if (!orderData.customer || !orderData.customer.name) {
    throw new Error('Customer name is required');
  }
  if (!orderData.customer.email && !orderData.customer.phone) {
    throw new Error('Email or phone is required');
  }
  if (!orderData.items || orderData.items.length === 0) {
    throw new Error('Cart is empty');
  }

  // status 화이트리스트 (위조 차단)
  const requestedStatus = normalizeStatus(orderData.status || 'design_requested');
  const safeStatus = ALLOWED_NEW_ORDER_STATUSES.includes(requestedStatus)
    ? requestedStatus
    : 'design_requested';

  // payment 정규화 — 토스 응답값을 권위 있는 출처로 사용
  const p = orderData.payment || {};
  const safePayment = {
    // 금액: 토스 응답의 totalAmount를 신뢰 (위조 방지)
    totalAmount: Number(tossData.totalAmount),
    unitPrice: Number(p.unitPrice) || 0,
    quantity: Number(p.quantity) || 0,
    subtotal: Number(p.subtotal) || 0,
    shipping: Number(p.shipping) || 0,
    // 결제 수단 화이트리스트
    paymentType: ['deposit', 'card', 'transfer'].includes(p.paymentType) ? p.paymentType : 'card',
    transactionMethod: ['cash', 'card', 'transfer'].includes(p.transactionMethod) ? p.transactionMethod : 'card',
    // method: 토스가 알려준 실제 결제 수단을 우선 사용 (예: '카드', '간편결제')
    method: tossData.method || 'toss',
    // 토스 추적 필드 — 응답값으로 강제 덮어쓰기 (호출자 입력 무시)
    paymentKey: tossData.paymentKey,
    tossOrderId: tossData.orderId,
    // 입금일 = 토스 승인 시각 (PG 결제는 즉시 입금 확정)
    paidDate: tossData.approvedAt || new Date().toISOString(),
    // 관리자 전용 필드는 강제 리셋
    quoteUrl: '',
    autoQuote: false,
  };

  return {
    ...orderData,
    status: safeStatus,
    payment: safePayment,
    // 확장 필드 기본값
    referenceFiles: orderData.referenceFiles || [],
    customerMemo: orderData.customerMemo || '',
    estimate: orderData.estimate || null,
    orderSheet: orderData.orderSheet || null,
  };
}

// ===== GET /api/payment/config — 프론트에서 clientKey 가져오기 =====
// 토스 SDK 초기화에 필요한 clientKey를 프론트에 전달
// secretKey는 절대 노출하지 않는다
router.get('/payment/config', (req, res) => {
  const { clientKey, configured } = getTossKeys();
  res.json({
    success: true,
    clientKey,
    enabled: configured
  });
});

// ===== POST /api/payment/confirm — [P0-1] 결제 승인 + 주문 생성 (원자 트랜잭션) =====
// 비유: 결제 영수증을 토스에 보여주고 + 그 자리에서 바로 주문서를 봉투에 넣는 것
//       기존: 영수증 확인(payment.js) → 응답 → 클라가 다시 주문 생성 호출(orders.js)
//       신규: 영수증 확인 + 주문서 봉투 한 번에 처리. 중간에 끊겨도 주문은 안전.
//
// 흐름:
//   1. 멱등 사전 조회 (paymentKey UNIQUE 컬럼)
//   2. 토스 confirm API 호출 + 금액 검증
//   3. orderData 화이트리스트 정규화
//   4. db.transaction() — INSERT (paymentKey UNIQUE → 동시 호출 자연 차단)
//   5. 충돌 catch → 재조회 (이중 안전망)
//   6. DB 실패 → tossCancel 보상
//   7. 트랜잭션 commit 후 알림 (fire-and-forget)
router.post('/payment/confirm', async (req, res) => {
  try {
    const { paymentKey, orderId, amount, orderData } = req.body;

    // 필수 파라미터 검증 (orderData는 신규 추가)
    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'paymentKey, orderId, amount는 필수입니다.'
      });
    }

    // 환경변수를 요청 시점에 읽기 (ES Module import 순서 문제 방지)
    const { secretKey, configured } = getTossKeys();

    // 토스 미설정 → 에러 반환
    if (!configured) {
      console.warn(`[payment:warn] 토스 미설정 상태에서 결제 승인 요청 — orderId: ${orderId}`);
      return res.status(503).json({
        success: false,
        error: '결제 시스템이 설정되지 않았습니다. 관리자에게 문의하세요.'
      });
    }

    // ===== [P0-1] 단계 1: 멱등 사전 조회 (트랜잭션 밖, lock 없음, 빠름) =====
    // 비유: "이 영수증 번호로 이미 주문서가 있나?" 먼저 살펴보는 것
    // 같은 paymentKey로 confirm이 두 번 와도(클라 새로고침/네트워크 재시도) 첫 주문 그대로 반환
    const existingFound = db.findOne('orders', 'paymentKey', paymentKey);
    if (existingFound) {
      console.log(`[Payment] 멱등 응답 — paymentKey=${paymentKey}, orderNumber=${existingFound.orderNumber}`);
      return res.json({
        success: true,
        orderNumber: existingFound.orderNumber,
        idempotent: true,
        totalAmount: existingFound.payment?.totalAmount || Number(amount),
        paymentKey
      });
    }

    // ===== 단계 2: 토스 결제 승인 API 호출 =====
    // Authorization: Basic base64(시크릿키 + ":")
    const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: Number(amount)
      })
    });

    const tossData = await tossRes.json();

    // 토스 API 응답 확인 — 실패 시 DB 영향 0
    if (!tossRes.ok) {
      console.error('[payment] 토스 승인 실패:', tossData);
      return res.status(400).json({
        success: false,
        error: tossData.message || '결제 승인에 실패했습니다.',
        code: tossData.code || 'UNKNOWN'
      });
    }

    // 결제 상태 확인 — "DONE"이어야 정상
    if (tossData.status !== 'DONE') {
      return res.status(400).json({
        success: false,
        error: `결제가 완료되지 않았습니다. 상태: ${tossData.status}`
      });
    }

    // 금액 검증 — 위변조 방지 (해커가 금액을 줄여 결제하는 것을 막는다)
    if (tossData.totalAmount !== Number(amount)) {
      console.error(`[payment] 금액 불일치! 요청: ${amount}, 실제: ${tossData.totalAmount}`);
      // 금액 위조 시도 → 토스 cancel로 환불
      await tossCancel(tossData.paymentKey, secretKey, '금액 불일치 자동 취소');
      return res.status(400).json({
        success: false,
        error: `결제 금액 불일치. 예상: ${amount}, 실제: ${tossData.totalAmount}`
      });
    }

    console.log(`[payment] 토스 승인 OK — orderId: ${orderId}, amount: ${tossData.totalAmount}, method: ${tossData.method}`);

    // ===== [P0-1] 단계 3: orderData 정규화 (화이트리스트 + 토스 응답 권위) =====
    // orderData가 없으면(레거시 클라이언트) 최소 데이터로 폴백 — 운영 알림 후 수동 보정
    let safeOrderData;
    try {
      if (orderData) {
        safeOrderData = sanitizePgOrderData(orderData, tossData);
      } else {
        // orderData 누락 — 결제는 됐으니 최소 주문이라도 저장 (수동 보정용 표식)
        console.warn(`[payment] orderData 누락 — 최소 주문 생성. paymentKey=${paymentKey}`);
        safeOrderData = {
          customer: { name: '결제 확인 필요', phone: '', email: '', teamName: '' },
          items: [],
          total: tossData.totalAmount,
          shipping: { address: '', recipientName: '' },
          payment: {
            method: tossData.method || 'toss',
            totalAmount: tossData.totalAmount,
            paymentKey: tossData.paymentKey,
            tossOrderId: tossData.orderId,
            paidDate: tossData.approvedAt || new Date().toISOString(),
            quoteUrl: '',
            autoQuote: false,
          },
          customerMemo: '[자동] orderData 누락된 결제 — 운영팀 수동 보정 필요',
          type: 'shop',
          status: 'design_requested',
        };
      }
    } catch (validationErr) {
      // 정규화 실패(필수 필드 누락 등) → 토스 cancel 보상
      console.error('[payment] orderData 정규화 실패 → 토스 취소:', validationErr.message);
      await tossCancel(tossData.paymentKey, secretKey, `주문 데이터 검증 실패: ${validationErr.message}`);
      return res.status(400).json({
        success: false,
        error: `주문 데이터 검증 실패 — 결제는 자동 환불됩니다. (${validationErr.message})`
      });
    }

    // ===== [P0-1] 단계 4: 트랜잭션 — orders INSERT (paymentKey UNIQUE 부분 인덱스가 멱등 보장) =====
    // 비유: 봉투에 주문서를 넣고 봉인. paymentKey 중복이면 SQLITE_CONSTRAINT 에러로 자동 차단
    let savedOrder;
    try {
      const txn = database.transaction(() => {
        // orderNumber 자동 생성 (트랜잭션 안에서 호출 — 같은 날 동시 주문도 안전)
        const fullOrder = migrateOrder({
          ...safeOrderData,
          orderNumber: safeOrderData.orderNumber || generateOrderNumber(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return db.insert('orders', fullOrder);
      });
      savedOrder = txn();
    } catch (dbErr) {
      // ===== 단계 5: UNIQUE 충돌 catch (이중 안전망) =====
      // 사전 조회와 INSERT 사이에 동시 confirm 호출이 끼어든 경우
      // SQLite 에러 코드 'SQLITE_CONSTRAINT_UNIQUE'로 정확 매칭
      if (dbErr && dbErr.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        console.log(`[Payment] UNIQUE 충돌 catch — 동시 confirm 감지. paymentKey=${paymentKey}`);
        const refound = db.findOne('orders', 'paymentKey', paymentKey);
        if (refound) {
          return res.json({
            success: true,
            orderNumber: refound.orderNumber,
            idempotent: true,
            totalAmount: refound.payment?.totalAmount || tossData.totalAmount,
            paymentKey
          });
        }
        // 재조회도 못 찾으면 일반 DB 실패로 폴스루
      }

      // ===== 단계 6: 일반 DB 실패 → tossCancel 보상 트랜잭션 =====
      console.error('[payment] DB INSERT 실패 → 토스 취소:', dbErr);
      await tossCancel(tossData.paymentKey, secretKey, '주문 저장 실패로 자동 취소');
      return res.status(500).json({
        success: false,
        error: '주문 저장 중 오류 — 결제는 자동 환불 처리됩니다. 잠시 후 다시 시도해주세요.'
      });
    }

    console.log(`[Payment] 주문 생성 OK — ${savedOrder.orderNumber} (paymentKey=${paymentKey}, ₩${savedOrder.payment?.totalAmount || 0})`);

    // ===== 단계 7: 알림 (트랜잭션 밖, fire-and-forget) =====
    // 비유: 주문서가 봉인된 후 "주문 접수됐어요" 카톡 발송. 발송 실패해도 주문은 OK.
    // sendNotification 내부에서 try-catch — 여기까지 예외 올라오지 않음
    sendNotification('order_created', savedOrder);

    // ===== 응답 =====
    res.json({
      success: true,
      orderNumber: savedOrder.orderNumber,
      paymentKey: tossData.paymentKey,
      orderId: tossData.orderId,
      totalAmount: tossData.totalAmount,
      method: tossData.method,
      status: tossData.status,
      approvedAt: tossData.approvedAt
    });

  } catch (err) {
    // 예상치 못한 외곽 예외 (네트워크 등)
    console.error('[payment] 결제 승인 오류:', err);
    res.status(500).json({ success: false, error: '결제 승인 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
