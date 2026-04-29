/**
 * 시트 → DB 5분 자동 동기화 스케줄러
 *
 * 비유: 우체국이 5분마다 시트(편지함)를 확인해서 새 편지(주문 정보)를
 *      DB(주소록)에 자동 반영하는 자동 우편배달부.
 *      AUTO_SYNC_ENABLED=true 일 때만 출근, 첫 30초는 시동 시간(워밍업).
 *
 * 동작:
 *   - 서버 시작 → 30초 대기 → 첫 sync 실행 → 5분마다 반복
 *   - 이전 sync가 아직 진행 중이면 이번 사이클 스킵 (동시실행 방지)
 *   - 콘솔에 [SheetSync] 태그 로그 출력 + 통계 메모리 보관
 *
 * 환경변수:
 *   AUTO_SYNC_ENABLED=true  → 활성
 *   AUTO_SYNC_ENABLED=false (또는 미설정) → 비활성 (수동 CLI만 가능)
 *
 * 사용법:
 *   import { startScheduler, stopScheduler, getStats } from './sheetSyncScheduler.js';
 *   startScheduler(); // server.js에서 호출
 *
 * 운영 시나리오:
 *   1) AUTO_SYNC_ENABLED=false 로 시작 → 한 번 수동 검증
 *   2) 검증 OK 시 .env에서 true로 변경 후 서버 재기동
 *   3) 콘솔 로그 [SheetSync] 모니터링
 */

import { runSync } from '../data/sync-orders.js';

// ============================================================
// 상수
// ============================================================
// 5분 주기 (밀리초). 운영 검증 시 짧은 값으로 임시 변경 가능
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

// 서버 시작 후 첫 실행까지 30초 대기
// 이유: DB 시딩/스키마 마이그레이션이 완료된 후에 sync가 돌아야 안전
const FIRST_DELAY_MS = 30 * 1000;

// ============================================================
// 모듈 상태 (메모리)
// ============================================================
// 동시 실행 방지 플래그: 이전 sync가 끝나기 전 다음 사이클이 시작되면 스킵
let syncInProgress = false;

// setInterval 핸들 (stopScheduler에서 정리용)
let intervalHandle = null;

// 통계: 관리자 대시보드 또는 운영 모니터링용 (현재는 메모리 only)
const stats = {
  runs: 0,        // 총 실행 횟수
  successes: 0,   // 성공 횟수
  failures: 0,    // 실패 횟수
  lastRun: null,  // 마지막 실행 시각 (ISO 8601)
  lastError: null, // 마지막 에러 메시지
  lastResult: null, // 마지막 sync의 변경 카운트 ({statusChanges, dateOnly, deliveryUpdates})
};

// ============================================================
// 단일 sync 실행
// 비유: 우체부가 한 번 출동해서 편지함을 확인하고 돌아오는 사이클
// ============================================================
async function executeSync() {
  // 이전 sync가 아직 진행 중이면 건너뛰기 (DB 잠금/이중 처리 방지)
  if (syncInProgress) {
    console.warn('[SheetSync] 이전 sync 진행 중 — 이번 사이클 스킵');
    return;
  }
  syncInProgress = true;
  stats.runs++;

  try {
    // sync-orders.js의 runSync 호출 — download(시트 다시 받기) + apply(DB 적용)
    const result = await runSync({ download: true, apply: true });
    stats.lastRun = new Date().toISOString();

    if (result.success) {
      stats.successes++;
      stats.lastResult = {
        statusChanges: result.statusChanges,
        dateOnly: result.dateOnly,
        deliveryUpdates: result.deliveryUpdates,
      };
      // 성공 로그 — 변경 0건이어도 출력 (정상 작동 모니터링용)
      console.log(
        `[SheetSync] OK ${stats.lastRun} — ` +
        `상태 ${result.statusChanges}건 / 날짜 ${result.dateOnly}건 / 배송 ${result.deliveryUpdates}건`
      );
    } else {
      stats.failures++;
      stats.lastError = result.error;
      console.error(`[SheetSync] FAIL ${stats.lastRun}:`, result.error);
    }
  } catch (err) {
    // runSync 자체가 throw한 예외 (네트워크/DB 등 예측 불가 에러)
    stats.failures++;
    stats.lastError = err.message;
    stats.lastRun = new Date().toISOString();
    console.error(`[SheetSync] 예외 ${stats.lastRun}:`, err.message);
  } finally {
    // 어떤 경우든 플래그는 반드시 해제 (다음 사이클 진입 가능)
    syncInProgress = false;
  }
}

// ============================================================
// 스케줄러 시작
// 비유: 우체부에게 "지금부터 5분마다 출근해주세요"라고 지시하는 것
// 환경변수가 false 또는 미설정이면 출근하지 않음
// ============================================================
export function startScheduler() {
  // 안전 가드 1: 환경변수 명시적 true 일 때만 시작
  // (오타/미설정 시 자동 OFF — 운영 사고 방지)
  if (process.env.AUTO_SYNC_ENABLED !== 'true') {
    console.log('[SheetSync] AUTO_SYNC_ENABLED=true 아님 → 스케줄러 비활성');
    return;
  }

  // 안전 가드 2: 이미 시작된 경우 재시작 방지
  if (intervalHandle) {
    console.warn('[SheetSync] 이미 시작됨 — 중복 시작 무시');
    return;
  }

  console.log(
    `[SheetSync] 스케줄러 시작 — 첫 실행 ${FIRST_DELAY_MS / 1000}초 후, ` +
    `이후 ${SYNC_INTERVAL_MS / 60000}분마다 반복`
  );

  // 30초 후 첫 실행 + setInterval 시작
  setTimeout(() => {
    executeSync(); // 즉시 1회 (서버 부팅 직후 최신 상태 반영)
    intervalHandle = setInterval(executeSync, SYNC_INTERVAL_MS);
  }, FIRST_DELAY_MS);
}

// ============================================================
// 스케줄러 중지 (서버 graceful shutdown용 — 현재는 미사용이지만 안전망)
// ============================================================
export function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[SheetSync] 스케줄러 중지');
  }
}

// ============================================================
// 통계 조회 (관리자 대시보드 카드 또는 헬스체크용)
// 비유: 우체부의 출근부를 보는 것 — 몇 번 갔는지, 마지막 언제 갔는지
// ============================================================
export function getStats() {
  return {
    ...stats,
    syncInProgress,
    scheduled: !!intervalHandle,
    intervalMs: SYNC_INTERVAL_MS,
    enabled: process.env.AUTO_SYNC_ENABLED === 'true',
  };
}
