/**
 * PG 결제 API (payment.js) — PortOne(구 아임포트) 연동 인프라
 * 비유: 마트 카드 결제기 — 카드를 긁으면 PG사에 승인 요청하고, 결과를 받아 검증하는 것
 *
 * 흐름:
 *   1. 프론트에서 PortOne SDK로 결제창 호출
 *   2. 사용자가 결제 완료
 *   3. 프론트에서 imp_uid + merchant_uid를 서버로 전송
 *   4. 서버에서 PortOne API로 결제 금액 검증 (위변조 방지)
 *   5. 검증 통과 → 주문 상태를 "결제 완료"로 변경
 *
 * 엔드포인트:
 *   POST /api/payment/prepare   — 결제 사전 등록 (결제할 금액을 서버에 미리 기록)
 *   POST /api/payment/complete  — 결제 완료 검증 (PortOne에 실제 결제 금액 확인)
 *
 * 주의: PortOne API 키가 없으면(.env 미설정) 콘솔 경고만 출력하고 검증을 스킵한다.
 */

import { Router } from 'express';

const router = Router();

// ===== 환경변수에서 PortOne 설정 읽기 =====
// 키가 없으면 테스트 모드로 동작 (실제 PG 호출 안 함)
const PORTONE_API_KEY = process.env.PORTONE_API_KEY || '';
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';
const PORTONE_MERCHANT_ID = process.env.PORTONE_MERCHANT_ID || '';

// PortOne 설정 여부 — 하나라도 비어있으면 테스트 모드
const isPortOneConfigured = !!(PORTONE_API_KEY && PORTONE_API_SECRET && PORTONE_MERCHANT_ID);

if (!isPortOneConfigured) {
  console.warn('[payment] PortOne API 키가 설정되지 않았습니다. 테스트 모드로 동작합니다.');
  console.warn('[payment] .env에 PORTONE_API_KEY, PORTONE_API_SECRET, PORTONE_MERCHANT_ID를 설정하세요.');
}

/**
 * PortOne 액세스 토큰 발급
 * 비유: PG사 창구에 "직원증"을 보여주고 임시 출입증을 받는 것
 * API 호출할 때마다 이 토큰이 필요하다
 */
async function getPortOneToken() {
  if (!isPortOneConfigured) return null;

  try {
    const res = await fetch('https://api.iamport.kr/users/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imp_key: PORTONE_API_KEY,
        imp_secret: PORTONE_API_SECRET
      })
    });
    const data = await res.json();
    if (data.code === 0) {
      return data.response.access_token;
    }
    console.error('[payment] PortOne 토큰 발급 실패:', data.message);
    return null;
  } catch (err) {
    console.error('[payment] PortOne 토큰 요청 오류:', err.message);
    return null;
  }
}

// ===== POST /api/payment/prepare — 결제 사전 등록 =====
// 비유: "이 주문은 15만원짜리입니다"를 PG사에 미리 알려두는 것
// 나중에 실제 결제 금액과 비교하여 위변조를 감지
router.post('/payment/prepare', async (req, res) => {
  try {
    const { merchant_uid, amount } = req.body;

    if (!merchant_uid || !amount) {
      return res.status(400).json({
        success: false,
        error: 'merchant_uid와 amount는 필수입니다.'
      });
    }

    // PortOne 미설정 → 테스트 모드 (사전 등록 스킵)
    if (!isPortOneConfigured) {
      console.log(`[payment:test] 사전 등록 — ${merchant_uid}: ${amount}원`);
      return res.json({ success: true, test: true, merchant_uid, amount });
    }

    // PortOne API로 사전 등록
    const token = await getPortOneToken();
    if (!token) {
      return res.status(500).json({ success: false, error: 'PortOne 인증 실패' });
    }

    const prepareRes = await fetch('https://api.iamport.kr/payments/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify({ merchant_uid, amount })
    });
    const prepareData = await prepareRes.json();

    if (prepareData.code !== 0) {
      return res.status(400).json({
        success: false,
        error: prepareData.message || '사전 등록 실패'
      });
    }

    res.json({ success: true, merchant_uid, amount });
  } catch (err) {
    console.error('[payment] 사전 등록 오류:', err);
    res.status(500).json({ success: false, error: '결제 사전 등록 실패' });
  }
});

// ===== POST /api/payment/complete — 결제 완료 검증 =====
// 비유: 카드 결제 후 "영수증"을 PG사에 보여주고 "진짜 결제됐나요?" 확인하는 것
// 프론트에서 받은 imp_uid로 PortOne에 실제 결제 정보를 조회하여 금액 일치 여부 확인
router.post('/payment/complete', async (req, res) => {
  try {
    const { imp_uid, merchant_uid, paid_amount } = req.body;

    if (!imp_uid || !merchant_uid) {
      return res.status(400).json({
        success: false,
        error: 'imp_uid와 merchant_uid는 필수입니다.'
      });
    }

    // PortOne 미설정 → 테스트 모드 (검증 스킵, 무조건 성공)
    if (!isPortOneConfigured) {
      console.log(`[payment:test] 결제 완료 — imp: ${imp_uid}, merchant: ${merchant_uid}, amount: ${paid_amount}`);
      return res.json({
        success: true,
        test: true,
        message: '테스트 모드 — PortOne 키 미설정으로 검증을 건너뜁니다.',
        imp_uid,
        merchant_uid,
        paid_amount
      });
    }

    // 1. PortOne 액세스 토큰 발급
    const token = await getPortOneToken();
    if (!token) {
      return res.status(500).json({ success: false, error: 'PortOne 인증 실패' });
    }

    // 2. PortOne에서 실제 결제 정보 조회
    const paymentRes = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
      headers: { 'Authorization': token }
    });
    const paymentData = await paymentRes.json();

    if (paymentData.code !== 0) {
      return res.status(400).json({
        success: false,
        error: paymentData.message || '결제 정보 조회 실패'
      });
    }

    const payment = paymentData.response;

    // 3. 결제 상태 확인 — "paid"여야 정상
    if (payment.status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: `결제가 완료되지 않았습니다. 상태: ${payment.status}`
      });
    }

    // 4. 금액 검증 — 프론트에서 보낸 금액과 실제 결제 금액이 일치하는지
    // 위변조 방지의 핵심: 해커가 금액을 줄여서 결제하는 것을 막는다
    if (paid_amount && payment.amount !== paid_amount) {
      return res.status(400).json({
        success: false,
        error: `결제 금액 불일치. 예상: ${paid_amount}, 실제: ${payment.amount}`
      });
    }

    // 5. 검증 통과 — 결제 성공
    res.json({
      success: true,
      imp_uid: payment.imp_uid,
      merchant_uid: payment.merchant_uid,
      paid_amount: payment.amount,
      pay_method: payment.pay_method,
      status: payment.status
    });
  } catch (err) {
    console.error('[payment] 결제 검증 오류:', err);
    res.status(500).json({ success: false, error: '결제 검증 실패' });
  }
});

// ===== GET /api/payment/config — 프론트에서 merchantId 가져오기 =====
// PortOne SDK 초기화에 필요한 가맹점 식별코드를 프론트에 전달
// 비밀키(API_SECRET)는 절대 노출하지 않는다
router.get('/payment/config', (req, res) => {
  res.json({
    success: true,
    merchantId: PORTONE_MERCHANT_ID || '',
    configured: isPortOneConfigured
  });
});

export default router;
