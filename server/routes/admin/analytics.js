/**
 * 관리자 분석(analytics) API 라우트
 *
 * 비유: 시트의 "일별매출현황" 탭을 DB로부터 자동 계산해주는 미니 사무실.
 *      운영자가 시트의 일별매출현황(2026일별매출현황 탭)과 DB 집계를 비교해서
 *      차이를 검증할 때 사용한다.
 *
 * ⚠️ 주의:
 *   - server.js:144 `app.use('/api/admin', adminAuth, adminRoutes)`로 상위 adminAuth 자동 적용 (C-5)
 *   - admin.js가 `router.use('/analytics', analyticsRouter)`로 마운트 → 최종 경로 `/api/admin/analytics/*`
 *   - 개별 라우트에 adminAuth 중복 부착 금지
 *
 * 라우트:
 *   GET /daily-revenue?from=YYYY-MM-DD&to=YYYY-MM-DD → 일별 매출/주문수/미수금 집계
 */

import express from 'express';
// db-sqlite.js의 database export — JSON.extract / 집계 SQL 직접 실행용
// (db.js의 8개 함수 인터페이스로는 GROUP BY 못 함)
import { database as sqliteDb } from '../../db-sqlite.js';

const router = express.Router();

// ============================================================
// GET /api/admin/analytics/daily-revenue
//
// 비유: 시트 "2026일별매출현황" 탭을 DB가 직접 계산해서 보여주는 것.
//      운영자가 from/to로 조회 기간을 지정하면 일자별 row를 반환.
//
// 쿼리:
//   from (선택): 시작일 YYYY-MM-DD
//   to   (선택): 종료일 YYYY-MM-DD
//
// 응답:
//   {
//     success: true,
//     data: [
//       { date: '2026-04-15', orderCount: 5, totalRevenue: 1500000, unpaid: 200000 },
//       ...
//     ]
//   }
//
// 정의:
//   - 매출 기준일: orders.orderReceiptDate (주문서 접수일) — 컬럼 직접 참조
//   - 매출액: data.payment.totalAmount 합계
//   - 미수금: paidDate가 NULL 또는 '' (빈 문자열 — 실측 빈 문자열 케이스 존재)
//            AND status != 'cancelled'
// ============================================================
router.get('/daily-revenue', (req, res) => {
    try {
        const { from, to } = req.query;

        // SQL 동적 조립: from/to가 있을 때만 WHERE 조건 추가
        // 비유: 검색 폼에서 "시작일/종료일을 빈 칸으로 두면 전체"인 것과 같음
        const whereParts = [
            "orderReceiptDate IS NOT NULL",
            "orderReceiptDate != ''",
        ];
        const params = [];

        // from/to는 substr(orderReceiptDate, 1, 10) 형태로 비교
        // (orderReceiptDate는 ISO 8601 "2026-04-15T00:00:00.000Z" 형태이므로 앞 10자가 YYYY-MM-DD)
        if (from) {
            whereParts.push("substr(orderReceiptDate, 1, 10) >= ?");
            params.push(from);
        }
        if (to) {
            whereParts.push("substr(orderReceiptDate, 1, 10) <= ?");
            params.push(to);
        }

        // 일별 집계 SQL
        // - GROUP BY: 날짜(YYYY-MM-DD)
        // - totalRevenue: data.payment.totalAmount 합계 (NULL 안전: COALESCE)
        // - unpaid: paidDate가 NULL 또는 '' 이고 cancelled 아닌 건의 totalAmount 합계
        const sql = `
            SELECT
                substr(orderReceiptDate, 1, 10) AS date,
                COUNT(*) AS orderCount,
                COALESCE(SUM(CAST(json_extract(data, '$.payment.totalAmount') AS INTEGER)), 0) AS totalRevenue,
                COALESCE(SUM(
                    CASE
                        WHEN (json_extract(data, '$.payment.paidDate') IS NULL
                              OR json_extract(data, '$.payment.paidDate') = '')
                             AND status != 'cancelled'
                        THEN CAST(json_extract(data, '$.payment.totalAmount') AS INTEGER)
                        ELSE 0
                    END
                ), 0) AS unpaid
            FROM orders
            WHERE ${whereParts.join(' AND ')}
            GROUP BY substr(orderReceiptDate, 1, 10)
            ORDER BY date DESC
        `;

        const rows = sqliteDb.prepare(sql).all(...params);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[analytics/daily-revenue] 실패:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
