/**
 * admin/sales-ops.js — 관리자 매출 운영 도메인 (D-92에 이은 4차 분리)
 *
 * 라우트 3개:
 *   - GET  /sales-goals/:year         매출 목표 조회
 *   - PUT  /sales-goals/:year         매출 목표 저장/수정
 *   - GET  /reorder-candidates        재주문 후보 명단 (B-3)
 *
 * 마운트 패턴 (admin.js):
 *   router.use('/', salesOpsRouter)
 *   - 이유: sales-goals/:year 와 reorder-candidates 는 공통 prefix 없음
 *   - stats/orders/templates 와 달리 prefix 마운트 불가 → 내부 경로를 절대경로로 정의
 *
 * adminAuth 주의: server.js:124에서 전역 적용됨. 여기에 개별 부착 금지 (C-5, E-18).
 *
 * E-20 import 경로 규칙 (3차에서 1차 회피 성공한 패턴):
 *   - server/routes/admin/ 에서 server/db.js 까지 2단계 상위 → `../../db.js`
 *   - 의존: db 단독 (normalizeOrderStatus / SPORT_LABELS / logActivity 전부 불필요)
 */

import express from 'express';
import db from '../../db.js';  // ⭐ E-20: 2단계 상위 (1단계 `../db.js`는 에러)

const router = express.Router();

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

export default router;
