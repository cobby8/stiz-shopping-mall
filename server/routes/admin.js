/**
 * 관리자 전용 API 라우트
 * Google Sheets 수동 관리를 대체하는 핵심 API
 *
 * 모든 엔드포인트에 adminAuth 미들웨어가 적용되어
 * 관리자 JWT 토큰이 없으면 접근 불가
 */

import express from 'express';
import db from '../db.js';
// normalizeStatus — normalizeOrderStatus(line 59) 내부에서 사용 (stats.js/orders.js가 이 파일의 normalizeOrderStatus를 import)
// (getCustomerStatus / STATUS_FLOW / STATUS_LABELS는 2026-04-22 orders 분리로 admin.js 본체에서는 사용처 없어져 import 제거)
import { normalizeStatus } from './orders.js';
// (runBackup은 2026-04-22 ops 5차 분리로 admin/ops.js로 이동)
// (logActivity / getActivityLogs는 2026-04-22 ops 5차 분리로 admin/ops.js로 이동
//  — orders.js / templates.js는 각자 `../../activityLog.js` 자체 import 중이라 영향 없음)
// (알림톡 관련 import는 2026-04-22 orders 분리 때 admin/orders.js로 이동됨 — PATCH /:id/status에서만 사용)
// 관리자 통계/분석 라우트 — 2026-04-22 admin.js에서 분리 (stats 도메인 6개 라우트)
// 비유: "통계 캐비닛"을 별도 미니 사무실로 옮긴 것. URL은 그대로 /api/admin/stats/*
import statsRouter from './admin/stats.js';
// 관리자 주문(orders) 라우트 — 2026-04-22 admin.js에서 분리 (orders 도메인 16개 라우트, D-90 2차)
// 비유: "주문 캐비닛"을 별도 미니 사무실로 옮긴 것. URL은 그대로 /api/admin/orders/*
import ordersRouter from './admin/orders.js';
// 관리자 주문 템플릿(templates) 라우트 — 2026-04-22 admin.js에서 분리 (templates 도메인 5개 라우트, D-90 3차)
// 비유: "문서 템플릿 캐비닛"을 별도 미니 사무실로 옮긴 것. URL은 그대로 /api/admin/templates/*
import templatesRouter from './admin/templates.js';
// 관리자 매출 운영(sales-ops) 라우트 — 2026-04-22 admin.js에서 분리 (sales-goals 2개 + reorder-candidates, D-90 4차)
// 비유: "매출 목표판 + 재주문 리드 보드"를 별도 미니 사무실로 옮긴 것.
// URL은 그대로 /api/admin/sales-goals/:year, /api/admin/reorder-candidates
// ⚠️ sales-goals와 reorder-candidates는 공통 prefix가 없어 `router.use('/', ...)` 패턴 사용
import salesOpsRouter from './admin/sales-ops.js';
// 관리자 운영(ops) 라우트 — 2026-04-22 admin.js에서 분리 (backup + activity-log, D-90 5차)
// 비유: "백업 버튼 + CCTV 감사 로그"를 별도 미니 사무실로 옮긴 것.
// URL은 그대로 /api/admin/backup, /api/admin/activity-log
// ⚠️ /backup과 /activity-log는 공통 prefix가 없어 `router.use('/', ...)` 루트 마운트 (C-8, sales-ops와 동일)
import opsRouter from './admin/ops.js';

const router = express.Router();

// /stats/* 하위 경로는 전부 statsRouter로 위임 (URL 변경 0)
// ⚠️ server.js:124에서 이미 adminAuth가 router-level로 적용됨 → 여기에 중복 부착 금지 (C-5)
router.use('/stats', statsRouter);
// /orders/* 하위 경로는 전부 ordersRouter로 위임 (URL 변경 0)
// ⚠️ 아래에 `/orders/*` 패턴 라우트를 절대 추가하지 말 것 — ordersRouter로 위임되므로 매칭 실패
router.use('/orders', ordersRouter);
// /templates/* 하위 경로는 전부 templatesRouter로 위임 (URL 변경 0)
// ⚠️ 아래에 `/templates/*` 패턴 라우트를 절대 추가하지 말 것 — templatesRouter로 위임되므로 매칭 실패
router.use('/templates', templatesRouter);
// sales-goals/:year, reorder-candidates는 공통 prefix가 없는 이종 경로라
// prefix 없이 루트에 마운트하고 salesOpsRouter 내부에서 절대경로로 정의한다.
// ⚠️ 아래에 `/sales-goals/*`, `/reorder-candidates` 라우트를 추가하지 말 것 — salesOpsRouter로 위임됨
router.use('/', salesOpsRouter);
// /backup, /activity-log도 동일한 루트 마운트 패턴 (C-8).
// opsRouter 내부에서 절대경로로 정의되어 있다.
// ⚠️ 아래에 `/backup`, `/activity-log` 라우트를 추가하지 말 것 — opsRouter로 위임됨
router.use('/', opsRouter);

// I-2: 종목 영문→한글 매핑을 파일 상단 1곳에서 정의 (기존 2곳 중복 제거)
// 프론트 js/admin-common.js L45~60과 키세트 완전 동기화 — 새 종목 추가 시 양쪽 모두 업데이트 필요
// 비유: 관제실 서버 사무실 벽보 — 이 파일 안의 모든 라우트가 참조하는 단일 소스
const SPORT_LABELS = {
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

// (헬퍼 이동 기록:
//   - getRevenueDate: 2026-04-22 stats.js로 이동 (stats 도메인 전용)
//   - getLastStatusChangeAt: 2026-04-22 admin/orders.js로 이동 (orders 도메인 전용)
// )

function normalizeOrderStatus(order) {
    // 기본값을 먼저 배치하고, 원본 데이터가 덮어쓰도록 순서 수정
    // 이렇게 해야 원본에 값이 있으면 기본값 대신 원본이 우선됨
    return {
        ...order,
        status: normalizeStatus(order.status),
        workInstruction: {
            // 기본값 (원본에 해당 키가 없을 때만 적용)
            status: '',
            sentAt: '',
            receivedAt: '',
            sentBy: '',
            url: '',
            note: '',
            // 원본 데이터가 기본값을 덮어씀
            ...order.workInstruction
        }
    };
}


// ============================================================
// [D-2] 수동 백업 + 감사 로그 — 2026-04-22 admin/ops.js로 분리 (D-90 5차)
//  - GET /backup, GET /activity-log (2 라우트)
//  - URL은 그대로. 마운트 패턴: router.use('/', opsRouter) — C-8 루트 마운트 (sales-ops와 동일)
//  - ⚠️ 아래에 `/backup`, `/activity-log` 라우트를 추가하지 말 것 — opsRouter로 위임됨
// ============================================================

// ============================================================
// [C-3] 매출 목표 + [B-3] 재주문 후보 — 2026-04-22 admin/sales-ops.js로 분리 (D-90 4차)
//  - GET /sales-goals/:year, PUT /sales-goals/:year, GET /reorder-candidates (3 라우트)
//  - URL은 그대로. 마운트 패턴 특이: router.use('/', salesOpsRouter) — 공통 prefix 없음
//  - ⚠️ 아래에 `/sales-goals/*`, `/reorder-candidates` 라우트를 추가하지 말 것
// ============================================================


// ============================================================
// [D-5] 주문 템플릿 — 2026-04-22 admin/templates.js로 분리 (D-90 3차)
//  - GET / GET :id / POST / PUT :id / DELETE :id (5 라우트)
//  - URL은 그대로 /api/admin/templates/* (router.use('/templates', templatesRouter))
//  - ⚠️ 아래에 `/templates/*` 패턴 라우트를 추가하지 말 것 — templatesRouter로 위임되므로 매칭 실패
// ============================================================


// ============================================================
// GET /api/admin/calendar/events - 캘린더용 주문 이벤트 목록
// 비유: 벽 달력에 붙일 포스트잇 데이터를 만들어주는 API
// FullCalendar가 월/주 뷰를 바꿀 때마다 start~end 범위로 자동 호출
// ============================================================
router.get('/calendar/events', (req, res) => {
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

// 분리된 stats.js에서 import 사용 (2026-04-22 admin.js 분리 리팩토링)
// 비유: 지점(stats.js)에서 본사(admin.js)의 "상태 정규화 스티커"를 꺼내 쓰도록 문 열어놓은 것
export { normalizeOrderStatus };

export default router;
