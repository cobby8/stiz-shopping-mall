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
// 관리자 캘린더(calendar) 라우트 — 2026-04-22 admin.js에서 분리 (calendar/events, D-90 6차)
// 비유: "벽 달력 포스트잇 서비스"를 별도 미니 사무실로 옮긴 것.
// URL은 그대로 /api/admin/calendar/events — prefix 통합 마운트(향후 /calendar/* 확장 대비)
import calendarRouter from './admin/calendar.js';

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
// /calendar/* 하위 경로는 전부 calendarRouter로 위임 (URL 변경 0)
// ⚠️ 아래에 `/calendar/*` 패턴 라우트를 절대 추가하지 말 것 — calendarRouter로 위임되므로 매칭 실패
router.use('/calendar', calendarRouter);

// (SPORT_LABELS는 2026-04-22 D-90 6차 분리로 `server/constants/sport-labels.js`로 이동
//  — 서버 3곳 중복을 1곳 단일 소스로 통합 (D-83). calendar.js / stats.js가 각자 import 사용.
//  프론트는 여전히 js/admin-common.js에 별도 존재 → 새 종목 추가 시 2곳 동기화 필요.)

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
// [E-1] 캘린더 — 2026-04-22 admin/calendar.js로 분리 (D-90 6차)
//  - GET /calendar/events (1 라우트)
//  - URL은 그대로. 마운트 패턴: router.use('/calendar', calendarRouter) — prefix 통합 (stats/orders/templates와 동일)
//  - ⚠️ 아래에 `/calendar/*` 패턴 라우트를 추가하지 말 것 — calendarRouter로 위임됨
// ============================================================

// 분리된 stats.js에서 import 사용 (2026-04-22 admin.js 분리 리팩토링)
// 비유: 지점(stats.js)에서 본사(admin.js)의 "상태 정규화 스티커"를 꺼내 쓰도록 문 열어놓은 것
export { normalizeOrderStatus };

export default router;
