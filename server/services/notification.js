/**
 * 카카오 알림톡 발송 서비스 (SOLAPI)
 *
 * 역할: 주문 상태 변경 시 고객에게 카카오 알림톡을 보내는 서비스.
 * 비유: 택배 발송 후 "배송 시작" 문자가 자동으로 가는 것과 같다.
 *
 * 핵심 원칙:
 * 1. SOLAPI 키가 없으면 콘솔 로그만 출력 (개발 환경에서도 서버가 정상 동작)
 * 2. 알림 발송이 실패해도 주문 처리에 영향 없음 (try-catch로 감싸서 에러 삼킴)
 * 3. 모든 발송은 비동기 — 응답 지연 없음
 */

import { getTemplateByType } from './notification-templates.js';

// ============================================================
// SOLAPI 설정 확인
// 3개 환경변수가 모두 있어야 실제 발송 모드로 동작한다.
// 하나라도 없으면 "드라이런(dry-run)" 모드 — 콘솔 로그만 출력
// ============================================================
const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY || '';
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET || '';
const SOLAPI_SENDER = process.env.SOLAPI_SENDER_PHONE || '';

// 실제 발송 가능 여부 플래그
const isLive = !!(SOLAPI_API_KEY && SOLAPI_API_SECRET && SOLAPI_SENDER);

if (!isLive) {
    console.log('[Notification] SOLAPI 키 미설정 — 드라이런 모드 (콘솔 로그만 출력)');
}

/**
 * SOLAPI REST API로 알림톡/SMS 발송
 * 실제 SOLAPI v4 API 스펙에 맞춰 구현
 *
 * @param {string} to - 수신자 전화번호 (하이픈 포함 가능, 자동 제거)
 * @param {string} text - 발송할 메시지 본문
 * @returns {Promise<object>} - 발송 결과 (성공/실패 정보)
 */
async function sendSolapi(to, text) {
    // 전화번호에서 하이픈 제거 (010-1234-5678 → 01012345678)
    const cleanPhone = to.replace(/-/g, '');

    // SOLAPI v4 인증: HMAC-SHA256 서명 생성
    // crypto는 Node.js 내장 모듈이므로 별도 설치 불필요
    const { createHmac, randomBytes } = await import('crypto');
    const date = new Date().toISOString();
    const salt = randomBytes(32).toString('hex');
    const signature = createHmac('sha256', SOLAPI_API_SECRET)
        .update(date + salt)
        .digest('hex');

    const authorization = `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;

    // SOLAPI v4 메시지 발송 API 호출
    const response = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authorization
        },
        body: JSON.stringify({
            messages: [{
                to: cleanPhone,
                from: SOLAPI_SENDER,
                // 카카오 알림톡 채널이 설정되어 있으면 kakao 필드 추가
                // 현재는 SMS 폴백으로 동작 (알림톡 템플릿 등록 후 kakao 필드 추가 예정)
                text
            }]
        })
    });

    const result = await response.json();
    return result;
}

/**
 * 알림 발송 메인 함수
 * 이 함수를 라우트에서 호출한다.
 *
 * @param {string} type - 알림 유형 (order_created, design_confirmed, status_changed 등)
 * @param {object} order - 주문 데이터 (customer, orderNumber, items 등)
 * @param {object} extra - 추가 데이터 (fromStatus, toStatus, statusLabel 등)
 *
 * 사용 예시:
 *   sendNotification('order_created', savedOrder);
 *   sendNotification('status_changed', order, { fromStatus, toStatus, statusLabel });
 */
export async function sendNotification(type, order, extra = {}) {
    try {
        // 고객 전화번호가 없으면 발송 불가
        const phone = order.customer?.phone;
        if (!phone) {
            console.log(`[Notification] 전화번호 없음 — 발송 스킵 (${type}, ${order.orderNumber})`);
            return;
        }

        // 템플릿에서 메시지 본문 생성
        const template = getTemplateByType(type);
        if (!template) {
            console.log(`[Notification] 알 수 없는 알림 유형: ${type}`);
            return;
        }

        const message = template(order, extra);

        // 드라이런 모드: 콘솔에 로그만 출력
        if (!isLive) {
            console.log(`[Notification][DRY-RUN] ${type}`);
            console.log(`  수신: ${phone}`);
            console.log(`  내용:\n${message}`);
            return;
        }

        // 실제 SOLAPI 발송
        const result = await sendSolapi(phone, message);
        console.log(`[Notification] 발송 완료: ${type} → ${phone} (${order.orderNumber})`, result);
    } catch (error) {
        // 알림 실패가 주문 처리를 방해하면 안 된다 — 에러를 로그만 남기고 삼킨다
        console.error(`[Notification] 발송 실패 (무시됨): ${type}`, error.message);
    }
}

export default { sendNotification };
