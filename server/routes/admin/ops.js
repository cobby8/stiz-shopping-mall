/**
 * admin/ops.js — 관리자 운영 도메인 (D-92 계승 5차 분리)
 *
 * 라우트 2개:
 *   - GET /backup         수동 백업 실행
 *   - GET /activity-log   감사 로그 조회 (D-2)
 *
 * 마운트 패턴 (admin.js):
 *   router.use('/', opsRouter)
 *   - 이유: /backup 과 /activity-log 는 공통 prefix 없음 → 루트 마운트
 *   - sales-ops 4차와 동일한 C-8 convention
 *   - 내부 라우트는 절대경로(`/backup`, `/activity-log`)로 정의
 *
 * adminAuth 주의: server.js:124에서 전역 적용됨. 여기에 개별 부착 금지 (C-5, E-18).
 *
 * E-20 import 경로 규칙:
 *   - server/routes/admin/ 에서 server/backup.js, server/activityLog.js 까지 2단계 상위
 *   - `../../backup.js`, `../../activityLog.js` (1단계 `../xxx.js`는 에러)
 */

import express from 'express';
import { runBackup } from '../../backup.js';              // ⭐ E-20: 2단계 상위 (수동 백업 실행기)
import { logActivity, getActivityLogs } from '../../activityLog.js';  // ⭐ E-20: 2단계 상위 (D-2 감사 로그)

const router = express.Router();

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

export default router;
