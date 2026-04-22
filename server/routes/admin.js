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
import { runBackup } from '../backup.js';  // 수동 백업 API용
import { logActivity, getActivityLogs } from '../activityLog.js';  // 관리자 활동 로그 (D-2)
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
// GET /api/admin/backup - 수동 백업 실행
// 비유: 관리자가 "지금 당장 금고에 복사본 넣어!" 버튼을 누르는 것
// ============================================================
router.get('/backup', async (req, res) => {
    try {
        const result = await runBackup();

        if (result.success) {
            // [D-2] 활동 로그 기록
            logActivity('backup_manual', {
                fileCount: result.files.length,
                timestamp: result.timestamp
            }, req.user);

            res.json({
                success: true,
                message: `${result.files.length}개 파일 백업 완료`,
                files: result.files,
                timestamp: result.timestamp
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || '백업 실행 중 오류 발생'
            });
        }
    } catch (error) {
        console.error('[Admin] Backup error:', error);
        res.status(500).json({ success: false, error: '백업 실행 실패' });
    }
});


// ============================================================
// GET /api/admin/activity-log - 최근 활동 로그 조회 (D-2)
// 비유: CCTV 녹화 영상을 최신순으로 되감아 보는 것
// 쿼리 파라미터:
//   - limit: 가져올 건수 (기본 50, 최대 200)
//   - action: 특정 액션만 필터 (예: order_status_change)
// ============================================================
router.get('/activity-log', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const action = req.query.action || null;

        const logs = getActivityLogs(limit, action);

        res.json({
            success: true,
            logs,
            total: logs.length
        });
    } catch (error) {
        console.error('[Admin] Activity log error:', error);
        res.status(500).json({ success: false, error: '활동 로그 조회 실패' });
    }
});

// ============================================================
// [C-3] 매출 목표 달성률 API
// 비유: "올해 목표 매출액"을 설정/조회하는 엔드포인트
// 데이터는 sales-goals.json에 연도별로 저장된다
// ============================================================

// GET /api/admin/sales-goals/:year — 해당 연도 매출 목표 조회
// 비유: "올해 목표가 뭐였지?" 확인
router.get('/sales-goals/:year', (req, res) => {
    try {
        const year = req.params.year;
        const goals = db.getAll('sales-goals');
        // 연도(id)가 일치하는 목표를 찾는다
        const goal = goals.find(g => g.id === year) || null;

        res.json({ success: true, goal });
    } catch (error) {
        console.error('[Admin] Sales goal GET error:', error);
        res.status(500).json({ success: false, error: '매출 목표 조회 실패' });
    }
});

// PUT /api/admin/sales-goals/:year — 해당 연도 매출 목표 저장/수정
// 비유: "올해 목표를 15억으로 설정" 저장
router.put('/sales-goals/:year', (req, res) => {
    try {
        const year = req.params.year;
        const { annualGoal, monthlyGoals } = req.body;

        // 연간 목표 금액은 필수
        if (annualGoal === undefined || annualGoal === null) {
            return res.status(400).json({ success: false, error: '연간 목표 금액은 필수입니다' });
        }

        const goals = db.getAll('sales-goals');
        const existingIndex = goals.findIndex(g => g.id === year);

        const goalData = {
            id: year,
            year: year,
            annualGoal: Number(annualGoal),
            // 월별 목표가 있으면 저장, 없으면 빈 객체
            monthlyGoals: monthlyGoals || {},
            updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            // 기존 목표 수정
            goals[existingIndex] = goalData;
        } else {
            // 새 목표 추가
            goals.push(goalData);
        }

        db.saveAll('sales-goals', goals);

        res.json({ success: true, goal: goalData });
    } catch (error) {
        console.error('[Admin] Sales goal PUT error:', error);
        res.status(500).json({ success: false, error: '매출 목표 저장 실패' });
    }
});

// ============================================================
// GET /api/admin/reorder-candidates - 재주문 시기 도래 고객 목록 (B-3)
// 비유: "작년 이맘때 주문한 고객 중 올해 아직 안 온 사람" 명단을 자동으로 뽑아주는 것
// 미용실에서 "3개월 전에 오신 고객님, 슬슬 방문할 때 되셨어요" 알림과 같은 원리
// ============================================================
router.get('/reorder-candidates', (req, res) => {
    try {
        // --- 쿼리 파라미터 파싱 ---
        const range = parseInt(req.query.range) || 1;              // +-N개월 범위 (기본 1)
        const excludeOrdered = req.query.excludeOrdered !== 'false'; // 올해 이미 주문한 고객 제외 (기본 true)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        // --- 현재 날짜 기준으로 "작년 이맘때" 범위 계산 ---
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 1~12
        const currentYear = now.getFullYear();
        const lastYear = currentYear - 1;

        // 시작월/종료월 계산 (경계 처리: 1월이면 작년12월, 12월이면 다음해1월)
        // 비유: 달력에서 현재 월의 앞뒤 N칸을 칠하는 것
        let startMonth = currentMonth - range;
        let endMonth = currentMonth + range;
        let startYear = lastYear;
        let endYear = lastYear;

        // 월이 0 이하면 전년도로 넘김 (예: 1월-1 = 0 → 12월)
        if (startMonth <= 0) {
            startMonth += 12;
            startYear = lastYear - 1;
        }
        // 월이 12 초과면 다음해로 넘김 (예: 12월+1 = 13 → 1월)
        if (endMonth > 12) {
            endMonth -= 12;
            endYear = lastYear + 1;
        }

        // 범위의 시작일과 종료일을 문자열로 생성
        const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
        // 종료월의 마지막 날 계산 (다음달 1일에서 하루 빼기)
        const endMonthLastDay = new Date(endYear, endMonth, 0).getDate();
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endMonthLastDay).padStart(2, '0')}`;

        // 기간 라벨 생성 (프론트에 표시용)
        const periodLabel = `${startYear}년 ${startMonth}월~${endYear === startYear ? '' : endYear + '년 '}${endMonth}월`;

        // --- 주문 데이터에서 해당 기간의 주문 필터링 ---
        const allOrders = db.getAll('orders');
        const allCustomers = db.getAll('customers');

        // 고객 ID → 고객 정보 빠른 조회용 맵
        const customerMap = {};
        allCustomers.forEach(c => { customerMap[c.id] = c; });

        // 1단계: 작년 해당 기간 주문을 customerId별로 그룹핑
        // 비유: "작년 봄 주문 장부"에서 고객별로 묶는 것
        const lastYearOrdersByCustomer = {};
        allOrders.forEach(order => {
            if (!order.customerId) return;
            // 주문 기준일: 주문서접수일(orderReceiptDate) 우선, 없으면 생성일(createdAt)
            const orderDate = order.orderReceiptDate || order.createdAt;
            if (!orderDate) return;

            const dateOnly = orderDate.slice(0, 10); // "YYYY-MM-DD"
            // 해당 기간 내 주문인지 확인
            if (dateOnly >= startDate && dateOnly <= endDate) {
                if (!lastYearOrdersByCustomer[order.customerId]) {
                    lastYearOrdersByCustomer[order.customerId] = [];
                }
                lastYearOrdersByCustomer[order.customerId].push(order);
            }
        });

        // 2단계: 올해 주문한 고객 ID 집합 만들기 (제외 필터용)
        // 비유: "올해 이미 온 고객" 명부
        const thisYearStart = `${currentYear}-01-01`;
        const orderedThisYearSet = new Set();
        allOrders.forEach(order => {
            if (!order.customerId) return;
            const orderDate = order.orderReceiptDate || order.createdAt;
            if (!orderDate) return;
            const dateOnly = orderDate.slice(0, 10);
            if (dateOnly >= thisYearStart) {
                orderedThisYearSet.add(order.customerId);
            }
        });

        // 3단계: 후보 목록 생성 — 작년 해당 기간 주문 고객 중 조건에 맞는 고객 추출
        let candidates = [];
        let excludedCount = 0; // 올해 이미 주문하여 제외된 고객 수

        Object.entries(lastYearOrdersByCustomer).forEach(([customerId, orders]) => {
            const cid = isNaN(customerId) ? customerId : Number(customerId);
            const orderedThisYear = orderedThisYearSet.has(cid) || orderedThisYearSet.has(String(cid));

            // 올해 이미 주문한 고객 제외 옵션 처리
            if (orderedThisYear) {
                excludedCount++;
                if (excludeOrdered) return; // 제외 옵션이 켜져 있으면 건너뛰기
            }

            // 해당 고객의 작년 주문 중 가장 최근 + 가장 큰 금액 주문 찾기
            // 정렬: 날짜 내림차순
            orders.sort((a, b) => {
                const da = (a.orderReceiptDate || a.createdAt || '');
                const db2 = (b.orderReceiptDate || b.createdAt || '');
                return db2.localeCompare(da);
            });
            const latestOrder = orders[0];
            // 해당 기간 총 주문 금액 합산
            // 주문 금액은 payment 객체 안에 있음 (o.payment.totalAmount)
            const periodAmount = orders.reduce((sum, o) => sum + (o.payment?.totalAmount || 0), 0);

            // 고객 정보 보강 (customers.json에서 가져오기)
            const customer = customerMap[cid] || customerMap[String(cid)] || {};

            // 아이템 요약 텍스트 생성 (예: "축구 유니폼 외 2건")
            let lastOrderItems = '주문 내역 없음';
            if (latestOrder.items && latestOrder.items.length > 0) {
                const firstName = latestOrder.items[0].name || latestOrder.items[0].sport || '아이템';
                lastOrderItems = latestOrder.items.length === 1
                    ? firstName
                    : `${firstName} 외 ${latestOrder.items.length - 1}건`;
            }

            candidates.push({
                customerId: cid,
                name: customer.name || latestOrder.customer?.name || '미상',
                teamName: customer.teamName || latestOrder.customer?.teamName || '',
                phone: customer.phone || latestOrder.customer?.phone || '',
                lastOrderDate: (latestOrder.orderReceiptDate || latestOrder.createdAt || '').slice(0, 10),
                lastOrderItems: lastOrderItems,
                lastOrderAmount: periodAmount,
                totalOrders: customer.orderCount || orders.length,
                totalSpent: customer.totalSpent || periodAmount,
                orderedThisYear: orderedThisYear
            });
        });

        // 4단계: 금액 내림차순 정렬 (돈을 많이 쓴 고객부터 — 영업 효과 극대화)
        candidates.sort((a, b) => b.lastOrderAmount - a.lastOrderAmount);

        const totalCandidates = candidates.length;

        // 5단계: 페이지네이션 적용
        const totalPages = Math.ceil(totalCandidates / limit);
        const startIdx = (page - 1) * limit;
        const paginatedCandidates = candidates.slice(startIdx, startIdx + limit);

        res.json({
            success: true,
            candidates: paginatedCandidates,
            summary: {
                totalCandidates,
                excludedAlreadyOrdered: excludedCount,
                periodLabel,
                startDate,
                endDate
            },
            pagination: {
                page,
                limit,
                totalPages,
                total: totalCandidates
            }
        });
    } catch (error) {
        console.error('[Admin] Reorder candidates error:', error);
        res.status(500).json({ success: false, error: '재주문 후보 조회 실패' });
    }
});

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
