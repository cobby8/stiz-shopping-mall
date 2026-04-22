/**
 * 관리자 캘린더 API 라우트
 * admin.js에서 분리 (2026-04-22) — URL 변경 0, 동작 변경 0 (D-90/D-92 계승 6차)
 *
 * 비유: 관제실 벽 달력에 포스트잇(납기/접수/출고) 3종을 붙여주는 API.
 *       FullCalendar가 월/주 뷰를 바꿀 때마다 start~end 범위로 자동 호출한다.
 *
 * ⚠️ 주의:
 *  - server.js:124 `app.use('/api/admin', adminAuth, adminRoutes)`로 상위 adminAuth가 이미 적용됨 (C-5)
 *  - admin.js가 `router.use('/calendar', calendarRouter)`로 이 라우터를 마운트 → 최종 경로는 `/api/admin/calendar/*`
 *  - 개별 라우트에 adminAuth 중복 부착 금지 (E-18, C-5)
 *
 * E-20 import 경로 주의: server/routes/admin/ 기준 2단계 상위(../../)
 *   - db: ../../db.js
 *   - SPORT_LABELS: ../../constants/sport-labels.js (6차 신설 공유 모듈)
 *
 * 라우트 1개 (admin.js 원본 L133~L235에서 이동):
 *   GET /events → /api/admin/calendar/events  FullCalendar용 주문 이벤트 목록
 */

import express from 'express';
import db from '../../db.js';
// 종목 영문→한글 매핑 공유 모듈 — D-83 규칙 적용으로 서버 3곳 사본을 1곳으로 통합
import { SPORT_LABELS } from '../../constants/sport-labels.js';

const router = express.Router();

// ============================================================
// GET /api/admin/calendar/events - 캘린더용 주문 이벤트 목록
// 비유: 벽 달력에 붙일 포스트잇 데이터를 만들어주는 API
// FullCalendar가 월/주 뷰를 바꿀 때마다 start~end 범위로 자동 호출
// (admin.js L133~L235 원본 그대로 이동 — URL을 '/calendar/events' → '/events'로만 변경)
// ============================================================
router.get('/events', (req, res) => {
    try {
        const { start, end } = req.query;

        // start/end 필수 — FullCalendar가 자동으로 보내는 파라미터
        if (!start || !end) {
            return res.status(400).json({ success: false, error: 'start, end 파라미터 필수' });
        }

        const allOrders = db.getAll('orders');
        const events = []; // FullCalendar 이벤트 배열

        // 각 주문에서 최대 3개 이벤트(포스트잇)를 생성
        allOrders.forEach(order => {
            // 주문 기본 정보 — 이벤트 제목과 부가정보에 사용
            const teamName = order.customer?.teamName || order.customer?.name || '미지정';
            const sport = order.items?.[0]?.sport || '';
            // I-2: 상단 SPORT_LABELS 재사용 (파일 내 중복 제거됨) — 새 종목은 상단 1곳만 추가
            const sportLabel = sport ? (SPORT_LABELS[sport] || sport) : '';
            const title = sportLabel ? `${teamName} - ${sportLabel}` : teamName;

            // 공통 extendedProps — 프론트에서 필터/표시에 사용
            const baseProps = {
                orderNumber: order.orderNumber || order.id,
                status: order.status || 'unknown',
                teamName,
                manager: order.manager || '미지정',
                orderId: order.id
            };

            // --- 이벤트 1: 납기일 (가장 중요한 포스트잇) ---
            // 날짜 비교 시 substring(0,10)으로 날짜 부분만 추출 (시간대 차이로 인한 누락 방지)
            const deadlineDate = order.shipping?.desiredDate?.substring(0, 10);
            const startDate = start.substring(0, 10);
            const endDate = end.substring(0, 10);
            if (deadlineDate && deadlineDate >= startDate && deadlineDate <= endDate) {
                // D-day 계산 — 납기까지 남은 일수에 따라 색상 결정
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dday = Math.ceil((new Date(deadlineDate) - today) / (1000 * 60 * 60 * 24));

                let color;
                // 완료/취소 주문은 회색으로 통일
                if (order.status === 'delivered' || order.status === 'cancelled') {
                    color = '#9CA3AF'; // 회색
                } else if (dday <= 3) {
                    color = '#E63946'; // 빨강: 3일 이내 긴급
                } else if (dday <= 7) {
                    color = '#F59E0B'; // 주황: 7일 이내 주의
                } else {
                    color = '#10B981'; // 초록: 여유
                }

                events.push({
                    id: `${order.id}-deadline`,
                    title: `[납기] ${title}`,
                    start: deadlineDate,
                    color,
                    extendedProps: { ...baseProps, type: 'deadline', dday }
                });
            }

            // --- 이벤트 2: 접수일 (주문이 들어온 날) ---
            const receiptDate = order.orderReceiptDate || order.createdAt;
            // createdAt은 ISO 형식일 수 있으므로 날짜 부분만 추출
            const receiptDateStr = receiptDate ? receiptDate.substring(0, 10) : null;
            if (receiptDateStr && receiptDateStr >= startDate && receiptDateStr <= endDate) {
                const receiptColor = (order.status === 'delivered' || order.status === 'cancelled')
                    ? '#9CA3AF' : '#3B82F6'; // 파랑 또는 회색

                events.push({
                    id: `${order.id}-receipt`,
                    title: `[접수] ${title}`,
                    start: receiptDateStr,
                    color: receiptColor,
                    extendedProps: { ...baseProps, type: 'receipt' }
                });
            }

            // --- 이벤트 3: 출고일 (출고 예정/완료일) ---
            const releaseDate = order.shipping?.releaseDate?.substring(0, 10);
            if (releaseDate && releaseDate >= startDate && releaseDate <= endDate) {
                const releaseColor = (order.status === 'delivered' || order.status === 'cancelled')
                    ? '#9CA3AF' : '#8B5CF6'; // 보라 또는 회색

                events.push({
                    id: `${order.id}-release`,
                    title: `[출고] ${title}`,
                    start: releaseDate,
                    color: releaseColor,
                    extendedProps: { ...baseProps, type: 'release' }
                });
            }
        });

        console.log(`[Admin] Calendar events: ${events.length} events for ${start} ~ ${end}`);
        res.json(events); // FullCalendar는 배열을 직접 기대함

    } catch (error) {
        console.error('[Admin] Calendar events error:', error);
        res.status(500).json({ success: false, error: '캘린더 이벤트 조회 실패' });
    }
});

export default router;
