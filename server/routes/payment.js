/**
 * 토스페이먼츠 결제 API (payment.js)
 * 비유: 마트 카드 결제기 — 고객이 토스로 결제하면, 서버에서 "진짜 결제됐나요?" 확인하는 것
 *
 * 토스페이먼츠 결제 흐름:
 *   1. 프론트에서 토스 SDK로 결제창 호출 → 사용자가 결제 완료
 *   2. 토스가 successUrl로 리다이렉트 (paymentKey, orderId, amount 쿼리)
 *   3. 프론트에서 서버로 POST /api/payment/confirm 요청
 *   4. 서버에서 토스 API로 결제 승인 확인 (금액 위변조 방지)
 *   5. 승인 통과 → 프론트에서 주문 생성 진행
 *
 * 엔드포인트:
 *   GET  /api/payment/config   — 프론트에 clientKey 전달 (SDK 초기화용)
 *   POST /api/payment/confirm  — 결제 승인 확인 (토스 API 호출)
 *
 * 주의: TOSS_CLIENT_KEY / TOSS_SECRET_KEY가 없으면 PG 결제 비활성화 (무통장만 표시)
 */

import { Router } from 'express';

const router = Router();

// ===== 환경변수에서 토스페이먼츠 설정 읽기 =====
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || '';
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';

// 토스 설정 여부 — 하나라도 비어있으면 비활성화
const isTossConfigured = !!(TOSS_CLIENT_KEY && TOSS_SECRET_KEY);

if (!isTossConfigured) {
  console.warn('[payment] 토스페이먼츠 키가 설정되지 않았습니다. PG 결제가 비활성화됩니다.');
  console.warn('[payment] .env에 TOSS_CLIENT_KEY와 TOSS_SECRET_KEY를 설정하세요.');
}

// ===== GET /api/payment/config — 프론트에서 clientKey 가져오기 =====
// 토스 SDK 초기화에 필요한 clientKey를 프론트에 전달
// secretKey는 절대 노출하지 않는다
router.get('/payment/config', (req, res) => {
  res.json({
    success: true,
    clientKey: TOSS_CLIENT_KEY || '',
    enabled: isTossConfigured
  });
});

// ===== POST /api/payment/confirm — 결제 승인 확인 =====
// 비유: 결제 영수증을 토스에 보여주고 "진짜 이 금액으로 결제됐나요?" 확인하는 것
// 프론트에서 받은 paymentKey로 토스 API에 승인 요청을 보내 금액 일치 여부를 확인한다
router.post('/payment/confirm', async (req, res) => {
  try {
    const { paymentKey, orderId, amount } = req.body;

    // 필수 파라미터 검증
    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'paymentKey, orderId, amount는 필수입니다.'
      });
    }

    // 토스 미설정 → 에러 반환 (결제 비활성화 상태에서는 이 엔드포인트에 오면 안 됨)
    if (!isTossConfigured) {
      console.warn(`[payment:warn] 토스 미설정 상태에서 결제 승인 요청 — orderId: ${orderId}`);
      return res.status(503).json({
        success: false,
        error: '결제 시스템이 설정되지 않았습니다. 관리자에게 문의하세요.'
      });
    }

    // 토스페이먼츠 결제 승인 API 호출
    // Authorization: Basic base64(시크릿키 + ":")
    // 시크릿키 뒤에 콜론(:)을 붙이는 것이 토스 인증 규격
    const authHeader = 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');

    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: Number(amount) // 숫자형으로 전달 (토스 API 요구사항)
      })
    });

    const tossData = await tossRes.json();

    // 토스 API 응답 확인
    if (!tossRes.ok) {
      // 토스 API가 에러를 반환한 경우
      console.error('[payment] 토스 승인 실패:', tossData);
      return res.status(400).json({
        success: false,
        error: tossData.message || '결제 승인에 실패했습니다.',
        code: tossData.code || 'UNKNOWN'
      });
    }

    // 결제 상태 확인 — "DONE"이어야 정상 완료
    if (tossData.status !== 'DONE') {
      return res.status(400).json({
        success: false,
        error: `결제가 완료되지 않았습니다. 상태: ${tossData.status}`
      });
    }

    // 금액 검증 — 프론트에서 보낸 금액과 실제 결제 금액이 일치하는지
    // 위변조 방지의 핵심: 해커가 금액을 줄여서 결제하는 것을 막는다
    if (tossData.totalAmount !== Number(amount)) {
      console.error(`[payment] 금액 불일치! 요청: ${amount}, 실제: ${tossData.totalAmount}`);
      return res.status(400).json({
        success: false,
        error: `결제 금액 불일치. 예상: ${amount}, 실제: ${tossData.totalAmount}`
      });
    }

    // 승인 통과 — 결제 성공 정보 반환
    console.log(`[payment] 결제 승인 완료 — orderId: ${orderId}, amount: ${tossData.totalAmount}, method: ${tossData.method}`);

    res.json({
      success: true,
      paymentKey: tossData.paymentKey,
      orderId: tossData.orderId,
      totalAmount: tossData.totalAmount,
      method: tossData.method,        // 카드, 계좌이체 등
      status: tossData.status,        // DONE
      approvedAt: tossData.approvedAt // 승인 시각
    });

  } catch (err) {
    console.error('[payment] 결제 승인 오류:', err);
    res.status(500).json({ success: false, error: '결제 승인 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
