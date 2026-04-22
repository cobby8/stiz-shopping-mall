/**
 * 관리자 통계/분석 API 라우트
 * admin.js에서 분리 (2026-04-22) — URL 변경 0, 동작 변경 0
 *
 * 비유: 관제실 서버 사무실의 "통계 캐비닛"을 별도 미니 사무실로 옮긴 것.
 *       캐비닛 열쇠(adminAuth)는 출입구(server.js:124)에 걸려 있어 이 파일에는 따로 안 붙임.
 *
 * ⚠️ 주의:
 *  - server.js:124 `app.use('/api/admin', adminAuth, adminRoutes)`로 상위 adminAuth가 이미 적용됨 (C-5)
 *  - admin.js가 `router.use('/stats', statsRouter)`로 이 라우터를 마운트 → 최종 경로는 `/api/admin/stats/*`
 *  - 개별 라우트에 adminAuth 중복 부착 금지 (E-18, C-5)
 *
 * 라우트 6개 (admin.js 원본 L713~L1287에서 이동):
 *   GET /              → /api/admin/stats          대시보드 요약 통계
 *   GET /monthly       → /api/admin/stats/monthly  월별 매출/주문수
 *   GET /staff         → /api/admin/stats/staff    담당자별 실적
 *   GET /top-customers → /api/admin/stats/top-customers  고객별 매출 랭킹
 *   GET /by-sport      → /api/admin/stats/by-sport 종목별 매출
 *   GET /margin        → /api/admin/stats/margin   마진 분석
 */

import express from 'express';
import db from '../../db.js';
// admin.js에서 공유되는 상태 정규화 헬퍼 — orders+stats+payment 3곳에서 사용
// 비유: "현상태 표기 정리 스티커" — 주문 데이터 형식을 통일하는 도우미
import { normalizeOrderStatus } from '../admin.js';
// orders.js의 getCustomerStatus — stats 루트 라우트(4단계 집계)에서 필요
import { getCustomerStatus } from '../orders.js';
// SPORT_LABELS — 종목 영문키 → 한글 라벨 매핑 공유 모듈 (D-90 6차로 추출)
// 비유: 예전에는 이 파일에 사전을 복붙해 뒀지만, 이제는 공용 도서관(constants/)에서 빌려 쓴다.
// ⚠️ D-83 규칙: 서버는 이 공유 모듈 1곳 + 프론트 js/admin-common.js 1곳 = 총 2곳 동기화
import { SPORT_LABELS } from '../../constants/sport-labels.js';

const router = express.Router();

// 매출 기준일 반환 (주문서접수일 우선, 없으면 상담개시일 폴백)
// 비유: "계약일"이 있으면 계약일 기준, 없으면 "상담일" 기준으로 매출 집계
// ⚠️ 이 헬퍼는 stats 도메인 전용 (admin.js 내 9회 사용 전부 stats 블록 내부) → stats.js로 이동
function getRevenueDate(order) {
    return order.orderReceiptDate || order.createdAt;
}

// ============================================================
// GET /api/admin/stats - 대시보드 통계
// 비유: Google Sheets 상단의 요약 행 (상태별 건수, 매출 합계 등)
// ============================================================
router.get('/', (req, res) => {
    try {
        const allOrders = db.getAll('orders');

        // 연도 파라미터: 기본값은 현재 연도 (예: 2026)
        // 비유: "올해 매출만 보기" — 연도 드롭다운에서 선택한 연도의 주문만 집계
        const year = req.query.year || new Date().getFullYear().toString();

        // 매출 기준일(orderReceiptDate) 기준으로 해당 연도 주문만 필터링
        // 폴백: orderReceiptDate가 없으면 createdAt(상담개시일) 사용
        const orders = allOrders.map(normalizeOrderStatus).filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // 1) 상태별 건수 - 고객용 4단계 기준으로 집계
        const statusCounts = {
            design: 0,        // 시안 진행중
            production: 0,    // 제작 진행중
            shipping: 0,      // 배송 준비중
            delivered: 0      // 배송완료
        };

        // 2) 상세 상태별 건수 (관리자용)
        const detailedStatusCounts = {};

        // 3) 담당자별 건수
        const managerCounts = {};

        // 4) 종목별 건수
        const sportCounts = {};

        // 4-b) 거래유형별 건수 (동호회, 대학동아리, 학원SC 등)
        const dealTypeCounts = {};

        // 5) 총 매출
        let totalRevenue = 0;

        // 6) 미수금 (결제일 없는 주문의 총금액 합산)
        // 비유: 물건은 보냈는데 아직 돈을 안 받은 금액 합계
        let unpaidAmount = 0;

        // 7) 보류 건수
        let holdCount = 0;

        orders.forEach(order => {
            // 4단계 집계
            const cs = getCustomerStatus(order.status);
            if (cs.step === 1) statusCounts.design++;
            else if (cs.step === 2) statusCounts.production++;
            else if (cs.step === 3) statusCounts.shipping++;
            else if (cs.step === 4) statusCounts.delivered++;

            // 상세 상태 집계
            const st = order.status || 'unknown';
            detailedStatusCounts[st] = (detailedStatusCounts[st] || 0) + 1;

            // 담당자 집계
            const mgr = order.manager || '미배정';
            managerCounts[mgr] = (managerCounts[mgr] || 0) + 1;

            // 종목 집계 (첫 번째 아이템 기준)
            const sport = order.items?.[0]?.sport || 'unknown';
            sportCounts[sport] = (sportCounts[sport] || 0) + 1;

            // 거래유형 집계 (customer.dealType 기준)
            const dealType = order.customer?.dealType || '미분류';
            dealTypeCounts[dealType] = (dealTypeCounts[dealType] || 0) + 1;

            // 매출 합산
            const orderAmount = order.payment?.totalAmount || order.total || 0;
            totalRevenue += orderAmount;

            // 미수금 집계: 결제일(paidDate)이 비어있고, 금액이 있는 주문
            if (!order.payment?.paidDate && orderAmount > 0 && order.status !== 'cancelled') {
                unpaidAmount += orderAmount;
            }

            // 보류 건수
            if (order.status === 'hold') holdCount++;
        });

        // 8) 고객별 미수금 집계 — 비유: "외상 장부"를 고객별로 정리한 것
        // paidDate가 없고, 금액이 있고, 취소가 아닌 주문을 고객별로 모아서 합산
        const unpaidByCustomerMap = {};
        orders.forEach(order => {
            const amount = order.payment?.totalAmount || 0;
            const paidDate = order.payment?.paidDate;
            if (!paidDate && amount > 0 && order.status !== 'cancelled') {
                // 고객명을 키로 사용 (같은 이름의 고객은 합산)
                const key = order.customer?.name || '미상';
                if (!unpaidByCustomerMap[key]) {
                    unpaidByCustomerMap[key] = {
                        customerName: order.customer?.name || '미상',
                        teamName: order.customer?.teamName || '-',
                        count: 0,
                        totalAmount: 0
                    };
                }
                unpaidByCustomerMap[key].count++;
                unpaidByCustomerMap[key].totalAmount += amount;
            }
        });

        // 금액 내림차순 정렬 후 상위 20명만 반환
        const unpaidByCustomer = Object.values(unpaidByCustomerMap)
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 20);

        // 미수금 건수 합계 (탭 표시용)
        const unpaidCount = orders.filter(o => {
            const amt = o.payment?.totalAmount || 0;
            return !o.payment?.paidDate && amt > 0 && o.status !== 'cancelled';
        }).length;

        res.json({
            success: true,
            stats: {
                year,                          // 선택된 연도 (프론트에서 표시용)
                totalOrders: orders.length,
                statusCounts,              // 4단계 요약
                detailedStatusCounts,      // 12단계 상세 (hold, cancelled 포함)
                managerCounts,             // 담당자별
                sportCounts,               // 종목별
                dealTypeCounts,            // 거래유형별
                totalRevenue,              // 총 매출
                unpaidAmount,              // 미수금 합계
                unpaidCount,               // 미수금 건수
                unpaidByCustomer,          // 고객별 미수금 TOP 20
                holdCount                  // 보류 건수
            }
        });
    } catch (error) {
        console.error('[Admin] Stats error:', error);
        res.status(500).json({ success: false, error: '통계 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats/monthly - 월별 매출/주문수 집계
// 비유: 매출 보고서를 월별로 나눠 차트에 그릴 데이터를 만드는 것
// ============================================================
router.get('/monthly', (req, res) => {
    try {
        const allOrders = db.getAll('orders');

        // 연도 파라미터: 기본값은 현재 연도
        const year = req.query.year || new Date().getFullYear().toString();

        // 해당 연도 주문만 필터링 (매출 기준일 = orderReceiptDate 우선)
        const orders = allOrders.filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // 1~12월 월별 데이터 초기화
        // 비유: 12칸짜리 빈 성적표를 먼저 만들어놓고, 주문을 하나씩 해당 월 칸에 넣기
        const monthly = [];
        for (let m = 1; m <= 12; m++) {
            monthly.push({ month: m, revenue: 0, orders: 0 });
        }

        // 각 주문을 해당 월에 집계
        orders.forEach(order => {
            // 매출 기준일에서 월 추출 (ISO 형식: "2025-11-04T00:00:00.000Z")
            const revenueDate = getRevenueDate(order);
            const monthStr = revenueDate.substring(5, 7); // "11" 같은 문자열
            const monthIdx = parseInt(monthStr, 10) - 1;      // 0부터 시작하는 인덱스
            if (monthIdx >= 0 && monthIdx < 12) {
                const amount = order.payment?.totalAmount || order.total || 0;
                monthly[monthIdx].revenue += amount;
                monthly[monthIdx].orders += 1;
            }
        });

        res.json({
            success: true,
            year,
            monthly
        });
    } catch (error) {
        console.error('[Admin] Monthly stats error:', error);
        res.status(500).json({ success: false, error: '월별 통계 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats/staff - 담당자별 실적 집계
// 비유: 직원별 성적표 — 누가 몇 건을 처리했고, 매출은 얼마이며, 완료율은 어떤지
// ============================================================
router.get('/staff', (req, res) => {
    try {
        const allOrders = db.getAll('orders');

        // 연도 파라미터: 기본값은 현재 연도
        const year = req.query.year || new Date().getFullYear().toString();

        // 해당 연도 주문만 필터 (매출 기준일 = orderReceiptDate 우선)
        const orders = allOrders.filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // 담당자별 집계 맵: { "김현서": { orders, revenue, delivered, totalDays, daysCount } }
        const staffMap = {};

        orders.forEach(order => {
            const name = order.manager || '미배정';

            // 담당자 데이터 초기화
            if (!staffMap[name]) {
                staffMap[name] = {
                    name,
                    orders: 0,        // 총 주문수
                    revenue: 0,       // 총 매출
                    delivered: 0,     // 배송완료 건수 (완료율 계산용)
                    totalDays: 0,     // 처리일 합계 (평균 계산용)
                    daysCount: 0      // 처리일을 계산할 수 있는 건수
                };
            }

            const staff = staffMap[name];
            staff.orders += 1;
            staff.revenue += order.payment?.totalAmount || order.total || 0;

            // 완료율: delivered 상태인 주문 비율
            if (order.status === 'delivered') {
                staff.delivered += 1;
            }

            // 평균 처리일: createdAt ~ shipping.shippedDate 또는 updatedAt(delivered)
            // 비유: 주문 접수일부터 배송완료일까지 며칠 걸렸는지 평균
            if (order.status === 'delivered' && order.createdAt) {
                const startDate = new Date(order.createdAt);
                // 배송일이 있으면 배송일, 없으면 updatedAt 사용
                const endDateStr = order.shipping?.shippedDate || order.updatedAt;
                if (endDateStr) {
                    const endDate = new Date(endDateStr);
                    const diffDays = Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
                    // 비정상 데이터 필터 (365일 이상은 제외)
                    if (diffDays <= 365) {
                        staff.totalDays += diffDays;
                        staff.daysCount += 1;
                    }
                }
            }
        });

        // 집계 결과를 배열로 변환 + 완료율/평균 처리일 계산
        const staff = Object.values(staffMap)
            .map(s => ({
                name: s.name,
                orders: s.orders,
                revenue: s.revenue,
                // 완료율: 배송완료 건수 / 전체 건수 (백분율, 소수점 1자리)
                completionRate: s.orders > 0
                    ? Math.round((s.delivered / s.orders) * 1000) / 10
                    : 0,
                // 평균 처리일: 처리일 합계 / 처리일 계산 가능 건수 (소수점 1자리)
                avgDays: s.daysCount > 0
                    ? Math.round((s.totalDays / s.daysCount) * 10) / 10
                    : null  // 데이터 없으면 null
            }))
            // 매출 내림차순 정렬 (가장 많이 번 담당자가 위에)
            .sort((a, b) => b.revenue - a.revenue);

        res.json({
            success: true,
            year,
            staff
        });
    } catch (error) {
        console.error('[Admin] Staff stats error:', error);
        res.status(500).json({ success: false, error: '담당자별 실적 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats/top-customers - 고객별 매출 랭킹 TOP 20
// 비유: VIP 고객 순위표 — 누가 가장 많이 주문하고 매출이 높은지 한눈에 파악
// ============================================================
router.get('/top-customers', (req, res) => {
    try {
        const allOrders = db.getAll('orders');
        const allCustomers = db.getAll('customers');

        // 연도 파라미터: 기본값은 현재 연도
        const year = req.query.year || new Date().getFullYear().toString();

        // 해당 연도 주문만 필터 (매출 기준일 = orderReceiptDate 우선)
        const orders = allOrders.filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // 고객별 매출 집계 맵
        // 키: customerId (없으면 고객명 fallback)
        // 비유: 고객마다 통장을 만들어서, 주문이 들어올 때마다 금액을 적어넣는 것
        const customerMap = {};

        orders.forEach(order => {
            // customerId가 있으면 우선 사용, 없으면 고객명으로 그룹핑
            const key = order.customerId || order.customer?.name || '미상';
            const amount = order.payment?.totalAmount || order.total || 0;

            if (!customerMap[key]) {
                customerMap[key] = {
                    customerId: order.customerId || null,
                    name: order.customer?.name || '미상',
                    teamName: order.customer?.teamName || '-',
                    dealType: order.customer?.dealType || '미분류',
                    orders: 0,           // 해당 연도 주문수
                    revenue: 0,          // 해당 연도 매출 합계
                    lastOrderDate: null   // 해당 연도 최근 주문일
                };
            }

            const c = customerMap[key];
            c.orders += 1;
            c.revenue += amount;

            // 최근 주문일 갱신 (매출 기준일 기준, 더 최신 날짜로 교체)
            const revenueDate = getRevenueDate(order);
            if (!c.lastOrderDate || revenueDate > c.lastOrderDate) {
                c.lastOrderDate = revenueDate;
            }
        });

        // customers.json에서 전체 주문수(orderCount) 가져와 재주문율 계산
        // 재주문율: 해당 고객의 총 주문 횟수가 2회 이상이면 "재주문 고객"
        // 비유: 단골 여부 — 한 번만 온 손님(1회)과 여러 번 온 단골(2회+)을 구분
        const result = Object.values(customerMap).map(c => {
            // customers.json에서 해당 고객의 전체 주문수 조회
            let totalOrderCount = c.orders; // 기본: 이번 연도 주문수
            if (c.customerId) {
                const customerRecord = allCustomers.find(cust => cust.id === c.customerId);
                if (customerRecord) {
                    totalOrderCount = customerRecord.orderCount || c.orders;
                }
            }

            return {
                ...c,
                // 재주문 여부: 전체 주문 2회 이상이면 true
                isRepeat: totalOrderCount >= 2,
                totalOrderCount  // 전체 기간 주문수 (참고용)
            };
        });

        // 매출 내림차순 정렬 후 TOP 20
        const topCustomers = result
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20);

        // 재주문 고객 비율 (전체 고객 중)
        const totalCustomerCount = Object.keys(customerMap).length;
        const repeatCount = result.filter(c => c.isRepeat).length;
        const repeatRate = totalCustomerCount > 0
            ? Math.round((repeatCount / totalCustomerCount) * 100)
            : 0;

        res.json({
            success: true,
            year,
            totalCustomers: totalCustomerCount,  // 해당 연도 주문한 총 고객수
            repeatCount,                          // 재주문 고객수 (2회+ 전체 기간)
            repeatRate,                           // 재주문율 (%)
            customers: topCustomers
        });
    } catch (error) {
        console.error('[Admin] Top customers stats error:', error);
        res.status(500).json({ success: false, error: '고객별 매출 랭킹 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats/by-sport - 종목별 매출 집계
// 비유: "농구팀 유니폼이 가장 잘 팔린다" 같은 종목별 매출 비교 데이터
// ============================================================
router.get('/by-sport', (req, res) => {
    try {
        const allOrders = db.getAll('orders');

        // 연도 파라미터: 기본값은 현재 연도
        const year = req.query.year || new Date().getFullYear().toString();

        // 해당 연도 주문만 필터 (매출 기준일 기준)
        const orders = allOrders.filter(order => {
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // 종목별 집계 맵 — 종목(sport)을 키로 주문수와 매출을 합산
        const sportMap = {};

        orders.forEach(order => {
            // 첫 번째 아이템의 종목을 기준으로 분류 (기존 sportCounts 로직과 동일)
            const sport = order.items?.[0]?.sport || 'unknown';
            const amount = order.payment?.totalAmount || order.total || 0;

            if (!sportMap[sport]) {
                sportMap[sport] = { orders: 0, revenue: 0 };
            }
            sportMap[sport].orders += 1;
            sportMap[sport].revenue += amount;
        });

        // SPORT_LABELS는 상단에서 공유 모듈(`../../constants/sport-labels.js`)에서 import (D-90 6차)

        // 배열로 변환 + 매출 내림차순 정렬
        const sports = Object.entries(sportMap)
            .map(([sport, data]) => ({
                sport,
                label: SPORT_LABELS[sport] || sport,  // 한글 라벨 (매핑 없으면 원본 그대로)
                orders: data.orders,
                revenue: data.revenue
            }))
            .sort((a, b) => b.revenue - a.revenue);

        res.json({
            success: true,
            year,
            sports
        });
    } catch (error) {
        console.error('[Admin] Sport stats error:', error);
        res.status(500).json({ success: false, error: '종목별 매출 조회 실패' });
    }
});

// ============================================================
// GET /api/admin/stats/margin - 수익률/마진 분석 통계
// 비유: "얼마나 팔았는가"가 아닌 "얼마나 남았는가"를 보여주는 엑스레이
// 원가 입력된 주문만 마진 계산, 미입력 주문은 원가 0으로 처리하되 입력률로 신뢰도 표시
// ============================================================
router.get('/margin', (req, res) => {
    try {
        const allOrders = db.getAll('orders');

        // 연도 파라미터: 기본값은 현재 연도
        const year = req.query.year || new Date().getFullYear().toString();

        // 해당 연도 주문만 필터 (매출 기준일 기준, 취소 제외)
        const orders = allOrders.filter(order => {
            if (order.status === 'cancelled') return false;
            const revenueDate = getRevenueDate(order);
            if (!revenueDate) return false;
            return revenueDate.startsWith(year);
        });

        // --- 전체 요약(summary) 집계 ---
        let totalRevenue = 0;   // 총 매출
        let totalCost = 0;      // 총 원가
        let ordersWithCost = 0; // 원가 입력된 주문 건수

        orders.forEach(order => {
            const amount = order.payment?.totalAmount || order.total || 0;
            const cost = order.payment?.totalCost || 0;
            totalRevenue += amount;
            totalCost += cost;
            // costPerUnit 또는 totalCost가 0보다 크면 "입력됨"으로 간주
            if (order.payment?.costPerUnit > 0 || order.payment?.totalCost > 0) {
                ordersWithCost++;
            }
        });

        const totalMargin = totalRevenue - totalCost;
        // 마진율: 매출이 0이면 0% (0으로 나누기 방지)
        const marginRate = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 1000) / 10 : 0;
        // 원가 입력률: 전체 주문 중 원가를 입력한 비율
        const costInputRate = orders.length > 0 ? Math.round((ordersWithCost / orders.length) * 1000) / 10 : 0;

        // --- 월별(monthly) 집계: 1~12월 ---
        // 비유: 12칸 성적표에 월별로 매출/원가/마진 기록
        const monthly = [];
        for (let m = 1; m <= 12; m++) {
            monthly.push({ month: m, revenue: 0, cost: 0, margin: 0, marginRate: 0 });
        }

        orders.forEach(order => {
            const revenueDate = getRevenueDate(order);
            const monthIdx = parseInt(revenueDate.substring(5, 7), 10) - 1;
            if (monthIdx >= 0 && monthIdx < 12) {
                const amount = order.payment?.totalAmount || order.total || 0;
                const cost = order.payment?.totalCost || 0;
                monthly[monthIdx].revenue += amount;
                monthly[monthIdx].cost += cost;
            }
        });

        // 월별 마진/마진율 계산
        monthly.forEach(m => {
            m.margin = m.revenue - m.cost;
            m.marginRate = m.revenue > 0 ? Math.round((m.margin / m.revenue) * 1000) / 10 : 0;
        });

        // --- 종목별(bySport) 집계 ---
        // SPORT_LABELS는 상단에서 공유 모듈(`../../constants/sport-labels.js`)에서 import (D-90 6차)

        const sportMap = {};
        orders.forEach(order => {
            const sport = order.items?.[0]?.sport || 'unknown';
            const amount = order.payment?.totalAmount || order.total || 0;
            const cost = order.payment?.totalCost || 0;

            if (!sportMap[sport]) sportMap[sport] = { revenue: 0, cost: 0, orders: 0 };
            sportMap[sport].revenue += amount;
            sportMap[sport].cost += cost;
            sportMap[sport].orders += 1;
        });

        const bySport = Object.entries(sportMap)
            .map(([sport, d]) => ({
                sport,
                label: SPORT_LABELS[sport] || sport,
                revenue: d.revenue,
                cost: d.cost,
                margin: d.revenue - d.cost,
                marginRate: d.revenue > 0 ? Math.round(((d.revenue - d.cost) / d.revenue) * 1000) / 10 : 0,
                orders: d.orders
            }))
            .sort((a, b) => b.revenue - a.revenue);

        // --- 고객별 TOP 10 (byCustomerTop10) 집계 ---
        // 비유: 매출 기여도가 높은 VIP 고객의 마진 분석
        const customerMap = {};
        orders.forEach(order => {
            const teamName = order.customer?.teamName || '미분류';
            const amount = order.payment?.totalAmount || order.total || 0;
            const cost = order.payment?.totalCost || 0;

            if (!customerMap[teamName]) customerMap[teamName] = { revenue: 0, cost: 0, orders: 0 };
            customerMap[teamName].revenue += amount;
            customerMap[teamName].cost += cost;
            customerMap[teamName].orders += 1;
        });

        const byCustomerTop10 = Object.entries(customerMap)
            .map(([teamName, d]) => ({
                teamName,
                revenue: d.revenue,
                cost: d.cost,
                margin: d.revenue - d.cost,
                marginRate: d.revenue > 0 ? Math.round(((d.revenue - d.cost) / d.revenue) * 1000) / 10 : 0,
                orders: d.orders
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        res.json({
            success: true,
            year,
            summary: {
                totalRevenue,
                totalCost,
                totalMargin,
                marginRate,
                costInputRate,
                ordersWithCost,
                ordersTotal: orders.length
            },
            monthly,
            bySport,
            byCustomerTop10
        });
    } catch (error) {
        console.error('[Admin] Margin stats error:', error);
        res.status(500).json({ success: false, error: '마진 분석 조회 실패' });
    }
});

export default router;
