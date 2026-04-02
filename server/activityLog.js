/**
 * 관리자 활동 로그 시스템 (D-2)
 * [E-1] SQLite 전환 — fs 직접 읽기/쓰기를 db-sqlite.js 함수로 교체
 *
 * 비유: CCTV 녹화처럼 관리자가 어떤 작업을 했는지 자동으로 기록하는 시스템
 * - 주문 상태 변경, 복제, 입금 확인 등 주요 액션을 시간순으로 저장
 * - 최대 1000건까지 보관 (초과 시 오래된 것부터 자동 삭제)
 * - 비동기 처리로 API 응답 속도에 영향을 주지 않음
 */

// SQLite DB 모듈에서 필요한 함수만 가져온다
// 기존에는 fs로 JSON 파일을 직접 읽고 썼지만, 이제 DB를 통해 관리한다
import { getAll, insert as dbInsert, database } from './db-sqlite.js';

// 최대 보관 건수 — 1000건 넘으면 가장 오래된 것부터 자동 삭제
const MAX_LOGS = 1000;

// 컬렉션 이름 (db-sqlite.js가 activity_log 테이블로 매핑)
const COLLECTION = 'activity-log';

/**
 * 활동 로그를 기록한다 (비동기 — 호출하는 쪽에서 await 없이 사용 가능)
 *
 * 비유: "업무일지에 한 줄 추가"하는 것. API 응답을 기다리지 않고 백그라운드에서 기록.
 *
 * @param {string} action - 액션 종류 (예: "order_status_change", "payment_confirm")
 * @param {object} details - 상세 정보 (자유 형식, 각 액션마다 다름)
 * @param {object} user - 사용자 정보 { id, name } (req.user에서 가져옴)
 *
 * action 종류:
 *   - order_status_change  : 주문 상태 변경
 *   - order_bulk_status    : 일괄 상태 변경
 *   - order_edit           : 주문 정보 수정
 *   - order_duplicate      : 주문 복제
 *   - payment_confirm      : 입금 확인
 *   - comment_add          : 코멘트 추가
 *   - backup_manual        : 수동 백업
 */
export function logActivity(action, details = {}, user = {}) {
    // setTimeout으로 비동기 처리 — API 응답을 지연시키지 않는다
    // 비유: 메모를 적는 동안 고객 응대는 계속 진행
    setTimeout(() => {
        try {
            // 새 로그 항목 생성
            const entry = {
                id: Date.now(),                              // 고유 ID (타임스탬프)
                action,                                       // 액션 종류
                details,                                      // 상세 정보 (주문번호, 변경 내용 등)
                userId: user.id || null,                      // 사용자 ID
                userName: user.name || '시스템',              // 사용자 이름
                timestamp: new Date().toISOString()           // 기록 시간
            };

            // SQLite DB에 INSERT
            dbInsert(COLLECTION, entry);

            // 최대 건수 초과 시 오래된 것 삭제
            // 비유: 서랍이 꽉 차면 맨 아래 서류부터 버림
            // timestamp 기준 오래된 순으로 정렬하여 MAX_LOGS 초과분 삭제
            const count = database.prepare('SELECT COUNT(*) as cnt FROM activity_log').get().cnt;
            if (count > MAX_LOGS) {
                // MAX_LOGS 건만 남기고 나머지(오래된 것) 삭제
                database.prepare(`
                    DELETE FROM activity_log WHERE id NOT IN (
                        SELECT id FROM activity_log ORDER BY timestamp DESC LIMIT ?
                    )
                `).run(MAX_LOGS);
            }
        } catch (err) {
            // 로그 기록 실패가 서비스 전체를 멈추면 안 되므로 에러만 출력
            console.error('[ActivityLog] 로그 기록 실패:', err.message);
        }
    }, 0);
}

/**
 * 최근 활동 로그를 조회한다
 *
 * @param {number} limit - 가져올 건수 (기본 50, 최대 200)
 * @param {string} action - 특정 액션만 필터 (선택사항)
 * @returns {Array} 로그 배열 (최신순)
 */
export function getActivityLogs(limit = 50, action = null) {
    // getAll로 전체 로그를 가져온다 (db-sqlite.js가 details JSON 파싱을 자동 처리)
    let logs = getAll(COLLECTION);

    // 최신순 정렬 (timestamp 내림차순)
    logs.sort((a, b) => {
        const aTime = a.timestamp || '';
        const bTime = b.timestamp || '';
        return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
    });

    // 액션 종류로 필터링 (예: order_status_change만 보기)
    if (action) {
        logs = logs.filter(log => log.action === action);
    }

    // 요청 건수만큼 잘라서 반환 (최대 200건 제한)
    const safeLimit = Math.min(Math.max(1, limit), 200);
    return logs.slice(0, safeLimit);
}

export default { logActivity, getActivityLogs };
