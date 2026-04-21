/**
 * 손상된 주문 데이터 수정 스크립트 (일회성)
 *
 * 대상: createdAt / orderNumber가 깨진 ISO 8601 형식인 주문 2건
 *   - 건1: id 1775020459978, ORD-2030,000-001, createdAt 2030-,0-00T00:00:00.000Z
 *          → ORD-20250721-xxx / 2025-07-21T00:00:00.000Z (orderReceiptDate 기준 복구)
 *   - 건2: id 1775020464512, ORD-20243019-001, createdAt 2024-30-19T00:00:00.000Z
 *          → ORD-20240319-xxx / 2024-03-19T00:00:00.000Z (숫자 전치 3019→0319)
 *
 * 수정 필드 (각 건별 5개):
 *   - orders 테이블 컬럼: orderNumber, createdAt
 *   - orders.data JSON blob: orderNumber, createdAt, designRequestDate
 *
 * 사용법:
 *   node server/data/fix-corrupted-dates.js              (dry-run, DB 변경 없음)
 *   node server/data/fix-corrupted-dates.js --apply      (실제 DB 업데이트)
 *
 * 안전장치:
 *   - dry-run이 기본. --apply 플래그 없으면 DB UPDATE 실행 안 됨
 *   - apply 모드에서만 백업 파일 생성 (stiz.db.bak-corrupted-fix-YYYYMMDD)
 *   - 전체 작업을 트랜잭션으로 감싸서 중간 에러 시 ROLLBACK
 *   - 이미 깨지지 않은 값이면 해당 건 skip (재실행 안전)
 *   - orderNumber 충돌 시 -002, -003... 으로 증가하며 빈 번호 탐색
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'stiz.db');

// 실행 모드 확인 — --apply 없으면 dry-run
const args = process.argv.slice(2);
const isDryRun = !args.includes('--apply');

console.log('========================================');
console.log(`  ${isDryRun ? 'DRY-RUN' : 'APPLY'} 모드${isDryRun ? ' (DB 변경 없음)' : ' (DB 실제 업데이트)'}`);
console.log('========================================\n');

// ============================================================
// 수정 대상 — 하드코딩 (안전상 절대 동적 조회 금지)
// oldOrderNumber / oldCreatedAt은 검증용: 실제 DB 값과 일치하지 않으면 skip
// ============================================================
const FIXES = [
  {
    id: 1775020459978,
    oldOrderNumber: 'ORD-2030,000-001',
    newOrderPrefix: 'ORD-20250721', // 충돌 시 뒤 sequence만 올림
    oldCreatedAt: '2030-,0-00T00:00:00.000Z',
    newCreatedAt: '2025-07-21T00:00:00.000Z',
    reason: 'orderReceiptDate(2025-07-21) 기준 복구',
  },
  {
    id: 1775020464512,
    oldOrderNumber: 'ORD-20243019-001',
    newOrderPrefix: 'ORD-20240319',
    oldCreatedAt: '2024-30-19T00:00:00.000Z',
    newCreatedAt: '2024-03-19T00:00:00.000Z',
    reason: '숫자 전치(3019→0319), orderReceiptDate(2024-03-27)와 같은 월',
  },
];

// ============================================================
// 백업 (apply 모드에서만)
// ============================================================
if (!isDryRun) {
  // 백업 파일명: YYYYMMDD 포맷
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const backupPath = `${DB_PATH}.bak-corrupted-fix-${today}`;

  if (fs.existsSync(backupPath)) {
    console.log(`[경고] 백업 파일이 이미 존재: ${backupPath}`);
    console.log('       기존 백업을 덮어쓰지 않고 진행합니다.\n');
  } else {
    // fs.copyFileSync로 단순 복사 — 더 안전한 VACUUM INTO 대신 일관성 유지 목적
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`[백업] ${backupPath}\n`);
  }
}

// ============================================================
// DB 연결 (readonly는 dry-run이어도 false로 — UPDATE는 조건부)
// ============================================================
const db = new Database(DB_PATH);

// ============================================================
// 충돌 회피: 해당 prefix에서 비어있는 다음 sequence 찾기
// ============================================================
function findAvailableOrderNumber(prefix) {
  // 같은 prefix의 모든 번호를 가져와 seq 집합 구성
  const existing = db
    .prepare(`SELECT orderNumber FROM orders WHERE orderNumber LIKE ?`)
    .all(`${prefix}-%`)
    .map(r => r.orderNumber);

  const usedSeqs = new Set();
  for (const on of existing) {
    // 예: 'ORD-20250721-008' → '008'
    const m = on.match(/-(\d{3})$/);
    if (m) usedSeqs.add(parseInt(m[1], 10));
  }

  // 001부터 999까지 순차 탐색
  for (let i = 1; i <= 999; i++) {
    if (!usedSeqs.has(i)) {
      const seq = String(i).padStart(3, '0');
      return `${prefix}-${seq}`;
    }
  }
  throw new Error(`[${prefix}] 사용 가능한 sequence가 없음 (001~999 모두 점유)`);
}

// ============================================================
// 메인 처리 — 각 건별로 검증 + 계획 수립
// ============================================================
const plans = []; // { id, skip, reason, before, after }

for (const fix of FIXES) {
  // 1) 현재 DB 상태 조회
  const row = db.prepare('SELECT id, orderNumber, createdAt, data FROM orders WHERE id = ?').get(fix.id);

  if (!row) {
    plans.push({
      id: fix.id,
      skip: true,
      reason: 'DB에 해당 id의 주문 없음',
    });
    continue;
  }

  // 2) 이미 정상 상태인지 확인 (재실행 안전)
  if (row.orderNumber !== fix.oldOrderNumber || row.createdAt !== fix.oldCreatedAt) {
    plans.push({
      id: fix.id,
      skip: true,
      reason: `현재 값이 예상 손상값과 다름 (이미 수정됐거나 다른 상태) / DB: orderNumber='${row.orderNumber}', createdAt='${row.createdAt}'`,
    });
    continue;
  }

  // 3) data JSON 파싱
  let dataObj;
  try {
    dataObj = JSON.parse(row.data);
  } catch (e) {
    plans.push({
      id: fix.id,
      skip: true,
      reason: `data JSON.parse 실패: ${e.message}`,
    });
    continue;
  }

  // 4) 신규 orderNumber — 충돌 회피
  const newOrderNumber = findAvailableOrderNumber(fix.newOrderPrefix);
  const didConflict = newOrderNumber !== `${fix.newOrderPrefix}-001`;

  // 5) data JSON 필드 교체 (원본 다른 필드는 건드리지 않음)
  const newData = { ...dataObj };
  newData.orderNumber = newOrderNumber;
  newData.createdAt = fix.newCreatedAt;
  newData.designRequestDate = fix.newCreatedAt; // 기획 명세에 따라 createdAt과 동일

  plans.push({
    id: fix.id,
    skip: false,
    didConflict,
    reason: fix.reason,
    before: {
      orderNumber: row.orderNumber,
      createdAt: row.createdAt,
      dataOrderNumber: dataObj.orderNumber,
      dataCreatedAt: dataObj.createdAt,
      dataDesignRequestDate: dataObj.designRequestDate,
    },
    after: {
      orderNumber: newOrderNumber,
      createdAt: fix.newCreatedAt,
      dataOrderNumber: newOrderNumber,
      dataCreatedAt: fix.newCreatedAt,
      dataDesignRequestDate: fix.newCreatedAt,
    },
    newDataJSON: JSON.stringify(newData),
  });
}

// ============================================================
// Before/After 출력
// ============================================================
console.log('========================================');
console.log('  Before / After (수정 계획)');
console.log('========================================\n');

let applicableCount = 0;
let skipCount = 0;
let conflictCount = 0;

for (const p of plans) {
  console.log(`--- 주문 id: ${p.id} ---`);
  if (p.skip) {
    console.log(`  [SKIP] ${p.reason}\n`);
    skipCount++;
    continue;
  }
  applicableCount++;
  if (p.didConflict) conflictCount++;

  console.log(`  사유: ${p.reason}`);
  if (p.didConflict) {
    console.log(`  ⚠️  신규 번호 충돌 회피: ${p.after.orderNumber} (001은 이미 점유됨)`);
  }
  console.log('  Before:');
  console.log(`    orderNumber (col):           ${p.before.orderNumber}`);
  console.log(`    createdAt   (col):           ${p.before.createdAt}`);
  console.log(`    data.orderNumber:            ${p.before.dataOrderNumber}`);
  console.log(`    data.createdAt:              ${p.before.dataCreatedAt}`);
  console.log(`    data.designRequestDate:      ${p.before.dataDesignRequestDate}`);
  console.log('  After:');
  console.log(`    orderNumber (col):           ${p.after.orderNumber}`);
  console.log(`    createdAt   (col):           ${p.after.createdAt}`);
  console.log(`    data.orderNumber:            ${p.after.dataOrderNumber}`);
  console.log(`    data.createdAt:              ${p.after.dataCreatedAt}`);
  console.log(`    data.designRequestDate:      ${p.after.dataDesignRequestDate}`);
  console.log('');
}

// ============================================================
// DB 업데이트 (--apply 모드에서만, 트랜잭션)
// ============================================================
if (!isDryRun && applicableCount > 0) {
  console.log('========================================');
  console.log('  DB 업데이트 실행');
  console.log('========================================\n');

  const updateStmt = db.prepare(`
    UPDATE orders
    SET orderNumber = ?, createdAt = ?, data = ?
    WHERE id = ? AND orderNumber = ? AND createdAt = ?
  `);

  let updatedCount = 0;
  // 트랜잭션 — 중간 에러 시 자동 ROLLBACK
  const tx = db.transaction(() => {
    for (const p of plans) {
      if (p.skip) continue;
      // WHERE 절에 old 값 포함 → race condition 방지 + 한 번 더 안전장치
      const result = updateStmt.run(
        p.after.orderNumber,
        p.after.createdAt,
        p.newDataJSON,
        p.id,
        p.before.orderNumber,
        p.before.createdAt,
      );
      if (result.changes !== 1) {
        throw new Error(`[id ${p.id}] UPDATE 영향 row 수가 1이 아님 (${result.changes}) — 롤백`);
      }
      updatedCount++;
      console.log(`  ✓ id ${p.id}: ${p.before.orderNumber} → ${p.after.orderNumber}`);
    }
  });

  try {
    tx();
    console.log(`\n  완료: ${updatedCount}건 업데이트됨`);
  } catch (e) {
    console.error(`\n  [에러] 트랜잭션 롤백: ${e.message}`);
    db.close();
    process.exit(1);
  }
} else if (isDryRun && applicableCount > 0) {
  console.log('(dry-run 모드 — DB 변경 없음. --apply 옵션으로 실제 적용)\n');
}

// ============================================================
// 요약
// ============================================================
console.log('========================================');
console.log('  요약');
console.log('========================================');
console.log(`  대상: ${FIXES.length}건`);
console.log(`  수정 가능: ${applicableCount}건`);
console.log(`  스킵: ${skipCount}건`);
console.log(`  충돌 회피: ${conflictCount}건`);
console.log(`  모드: ${isDryRun ? 'DRY-RUN (변경 없음)' : 'APPLY (DB 업데이트됨)'}`);
console.log('========================================');

db.close();
