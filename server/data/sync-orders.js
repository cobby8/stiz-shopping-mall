/**
 * 스프레드시트 + 견적서 → DB 주문 상태 동기화 스크립트
 *
 * 비유: 엑셀에 적어둔 최신 진행 상황과 견적서의 배송완료 목록을
 *       웹사이트 DB에 반영하는 "동기화 도구"
 *
 * 사용법:
 *   node server/data/sync-orders.js --download                 (3개 탭 CSV 다운로드만)
 *   node server/data/sync-orders.js --dry-run                  (미리보기, DB 변경 없음)
 *   node server/data/sync-orders.js --apply                    (실제 DB 업데이트)
 *   node server/data/sync-orders.js --download --apply         (다운로드 + 적용 한 번에)
 *
 * 모듈 사용 (sheetSyncScheduler):
 *   import { runSync } from './sync-orders.js';
 *   await runSync({ download: true, apply: true });
 *   // returns { success, statusChanges, dateOnly, deliveryUpdates, error }
 *
 * 2단계 동작:
 *   Step 1: 3개 시트 탭(진행/완료(미수)/완료) → DB 상태 업데이트
 *   Step 2: 견적서 배송완료 목록 → DB delivered 처리
 *
 * 3개 탭 우선순위 (충돌 시 마지막이 우선):
 *   완료(미수) → 완료 → 진행
 *   (진행 탭이 마지막이지만, 같은 팀이 진행 탭에도 있으면 운영자가
 *    "아직 진행 중"이라 명시한 셈이므로 진행 status가 우선됨.
 *    실측에선 완료 탭에만 있고 진행 탭엔 없으면 자연히 완료가 적용)
 *
 * 보류 탭 제외 정책 (2026-04-29):
 *   보류 탭(gid=1148162040)은 sync 대상에서 완전 제외.
 *   DB의 hold 상태 주문(현재 17건)은 운영자가 수동으로 관리.
 *   → 보류 탭의 컬럼 어긋남 함정(E-21 후속)도 자동 회피.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'stiz.db');
const CSV_PATH = path.join(__dirname, 'spreadsheet_orders.csv');

// 4개 탭 다운로드 캐시 디렉토리 (--download 시 저장)
const TABS_DIR = path.join(__dirname, '_sync_tabs');

// ============================================================
// Google Sheets 3개 탭 정의 (보류 탭 제외, 2026-04-29)
// 비유: 하나의 엑셀 파일 안에 있는 3개의 시트(탭). 각 탭은 다른 의미를 가진다
//   - 진행: 작업 중인 주문 (status는 시트 내용으로 결정)
//   - 완료(미수): 출고 완료 + 입금 미완료 (status=delivered, paidDate 미반영)
//   - 완료: 출고 완료 + 입금 완료 (status=delivered, paidDate 반영)
//
// 보류 탭(gid=1148162040)은 sync 대상에서 제외:
//   - DB의 hold 주문 17건은 운영자가 수동 관리
//   - 보류 탭은 컬럼 구조가 다른 탭과 어긋나서(E-21) 함정 회피용
// ============================================================
const SHEET_BASE = 'https://docs.google.com/spreadsheets/d/1nKKsSwhEG5vl0XWXshQ34dajs7bc4_CpsVXml1QaBAw/export?format=csv';

// 처리 우선순위 순서: 완료(미수) → 완료 → 진행
// 같은 팀이 여러 탭에 있을 때, 마지막에 처리되는 탭의 status가 최종 적용됨
// (진행 탭이 마지막에 와야 운영자가 "아직 진행 중"이라 표시한 의도가 우선됨)
const SHEET_TABS = [
  { gid: '618544926',  name: '완료주문(미수)', file: 'completed_unpaid.csv', defaultStatus: 'delivered' },
  { gid: '1160190509', name: '완료주문',        file: 'completed.csv',         defaultStatus: 'delivered' },
  { gid: '0',          name: '진행주문',        file: 'progress.csv',          defaultStatus: null }, // null = 시트 내용으로 결정
];

// 실행 모드 표시 헬퍼 (CLI/모듈 양쪽에서 호출)
function logModeBanner(isDownload, isApply, isDryRun) {
  if (isDownload && !isApply && !isDryRun) {
    console.log('========================================');
    console.log('  DOWNLOAD 모드 (3개 탭 CSV 다운로드만)');
    console.log('========================================\n');
  } else if (isDryRun) {
    console.log('========================================');
    console.log('  DRY-RUN 모드 (DB 변경 없음)');
    console.log('========================================\n');
  } else {
    console.log('========================================');
    console.log('  APPLY 모드 (DB 실제 업데이트)');
    console.log('========================================\n');
  }
}

// ============================================================
// HTTPS GET (리다이렉트 자동 추적) — import-sheets.js fetchUrl 차용
// 비유: 링크 클릭 시 다른 주소로 넘어가는(redirect) 경우를 자동으로 따라감
// ============================================================
function fetchUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('리다이렉트 횟수 초과'));
    https.get(url, (res) => {
      // 301, 302 등 리다이렉트 응답이면 새 URL로 재요청
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      // 응답 데이터를 모아서 utf-8 문자열로 반환
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ============================================================
// 3개 탭 다운로드 → _sync_tabs/*.csv 저장
// 비유: 시트 3개를 각각 다운로드해서 디스크에 저장. 다음 sync 시 재사용 가능
// 보류 탭은 sync 대상이 아니므로 다운로드도 안 함 (2026-04-29 정책)
// ============================================================
async function downloadAllTabs() {
  // 캐시 디렉토리 생성 (없으면)
  if (!fs.existsSync(TABS_DIR)) {
    fs.mkdirSync(TABS_DIR, { recursive: true });
  }
  console.log(`다운로드 위치: ${TABS_DIR}\n`);

  for (const tab of SHEET_TABS) {
    const url = `${SHEET_BASE}&gid=${tab.gid}`;
    const outPath = path.join(TABS_DIR, tab.file);
    process.stdout.write(`  [${tab.name}] (gid=${tab.gid}) ... `);
    try {
      const csv = await fetchUrl(url);
      fs.writeFileSync(outPath, csv, 'utf-8');
      // 행 수 추정 (개행 기준, 헤더 1줄 제외)
      const lineCount = Math.max(0, csv.split('\n').length - 1);
      console.log(`OK (${csv.length.toLocaleString()}자, ~${lineCount}행)`);
    } catch (err) {
      console.log(`실패: ${err.message}`);
      throw err; // 한 탭이라도 실패하면 전체 중단 (부분 처리 방지)
    }
  }
  console.log('\n3개 탭 다운로드 완료.\n');
}

// ============================================================
// 수동 매핑: 시트 팀명 → DB 주문번호 (자동 매칭이 안 되는 28건)
// 비유: 시트에 "HAEBA 신규 축구"라고 적혀있지만 DB에는 "HAEBA 신규"로 저장됨
//       → 사람이 직접 "이건 이 주문이야"라고 연결해둔 리스트
// ============================================================
const MANUAL_SHEET_MAP = {
  // 가스공사 3건 (시트에 "유니폼" 접미사가 붙어서 자동 매칭 안 됨)
  '선수지급용 가스공사 시티에디션 유니폼': 'ORD-20260225-001',
  '구단 사입 가스공사 시티에디션 유니폼': 'ORD-20260303-001',
  '개인커스텀 가스공사 대구레트로 유니폼': 'ORD-20260202-001',
  // HAEBA 2건 (시트에 "축구/농구" 종목 접미사)
  'HAEBA 신규 축구': 'ORD-20260310-001',
  'HAEBA 신규 농구 상의만': 'ORD-20260310-003',
  // 퍼시픽 강서점 2건 (시트에 종목 접미사)
  '퍼시픽 강서점 축구': 'ORD-20260311-001',
  '퍼시픽 강서점 농구': 'ORD-20260311-002',
  // 방이중 2건 (시트에 "2026", "남자/여자" 접두사)
  '2026 방이중 남자농구': 'ORD-20260331-002',
  '방이중 여자농구': 'ORD-20260330-004',
  // 국민대 쿠바 1건 (시트에 "(KUBA)" 포함)
  '국민대 쿠바(KUBA) 슈팅셔츠': 'ORD-20260324-004',
  // 기타 확정 15건 (품목 키워드나 연도 접두사로 자동 매칭 실패)
  '2026 무야호(핑크)': 'ORD-20260210-003',
  'LG SAKERS 운정아카데미 유니폼': 'ORD-20260223-001',
  'LG SAKERS 운정아카데미 후드티': 'ORD-20260223-005',
  '선일여중 유니폼': 'ORD-20260309-001',
  '2026 군포당정중': 'ORD-20260313-005',
  '고려대 ZOO 양면 상의만': 'ORD-20260313-007',
  '2026 COSMO 긴팔슈팅셔츠': 'ORD-20260319-001',
  '구일중 남자 농구(화이트GUIL) 바지만': 'ORD-20260320-004',
  '서울시립대 싸이클론 긴팔슈팅저지': 'ORD-20260320-006',
  '서울시립대 싸이클론 농구': 'ORD-20260320-008',
  'SPAD 축구': 'ORD-20260320-010',
  '알파 ALPHA 상의만': 'ORD-20260324-002',
  '세종대 RUSH 상의만': 'ORD-20260327-008',
  '모빌 반팔티': 'ORD-20260316-002',
  // D카테고리 버그 수정 3건 (DB 팀명과 시트 팀명이 미묘하게 다름)
  '선일여자고등학교 유니폼': 'ORD-20260305-007',
  '서울대농구부 슈팅셔츠': 'ORD-20260305-008',
  '서울대 배구부 반팔티': 'ORD-20260331-003',
};

// ============================================================
// 레거시 상태 → 정규 상태 변환 맵
// 비유: 예전 용어를 최신 용어로 바꾸는 사전
// ============================================================
const LEGACY_STATUS_MAP = {
  'grading': 'work_instruction_received',
  'line_work': 'work_instruction_received',
  'payment_pending': 'order_received',
  'payment_done': 'payment_completed',
  'pending': 'consult_started',
  'processing': 'in_production',
};

// 정규 상태를 반환 (레거시면 변환, 아니면 그대로)
function normalizeStatus(status) {
  return LEGACY_STATUS_MAP[status] || status;
}

// 상태 순서 (숫자가 클수록 뒤 단계)
// 비유: 주문이 왼쪽에서 오른쪽으로 흐르는 파이프라인이라면, 역방향으로 가는 건 이상함
const STATUS_ORDER = {
  'consult_started': 1,
  'design_requested': 2,
  'draft_done': 3,
  'revision': 4,
  'design_confirmed': 5,
  'order_received': 6,
  'payment_completed': 7,
  'work_instruction_pending': 8,
  'work_instruction_sent': 9,
  'work_instruction_received': 10,
  'in_production': 11,
  'production_done': 12,
  'factory_released': 13,
  'warehouse_received': 14,
  'released': 15,
  'shipped': 16,
  'delivered': 17,
};

// 상태가 역행하는지 확인 (새 상태가 현재보다 앞 단계인 경우)
function isStatusRegression(currentStatus, newStatus) {
  const currentOrder = STATUS_ORDER[currentStatus] || 0;
  const newOrder = STATUS_ORDER[newStatus] || 0;
  return newOrder < currentOrder;
}

// ============================================================
// CSV 파싱 (import-sheets.js에서 가져온 검증된 로직)
// ============================================================

/** CSV 한 행을 필드 배열로 분리 (큰따옴표 안의 쉼표는 무시) */
function splitCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'; // 이스케이프된 큰따옴표
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** CSV 텍스트를 행 배열(각 행은 필드 배열)로 변환 */
function parseCSVToRows(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  // 한 글자씩 읽으면서 논리적 행을 분리
  // (큰따옴표 안의 줄바꿈은 같은 행의 일부)
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += '"';
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim() && current.trim() !== ',') lines.push(current);
      current = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.trim() && current.trim() !== ',') lines.push(current);

  // 첫 행은 헤더이므로 건너뛰고, 데이터 행만 필드 배열로 변환
  if (lines.length < 2) return [];

  const dataRows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCSVLine(lines[i]);
    // 빈 행 건너뛰기 (첫 번째 필드가 비어있으면 = 상담개시일 없음)
    if (fields[0] && fields[0].trim()) {
      dataRows.push(fields.map(f => f.trim()));
    }
  }
  return dataRows;
}

// ============================================================
// YYMMDD 날짜 파싱
// ============================================================
// YYMMDD 또는 YYYYMMDD → ISO 형식 "20YY-MM-DDT00:00:00.000Z" 반환
// 비유: 시트의 "260401" 같은 축약 날짜를 DB가 이해하는 표준 형식으로 변환
function parseDate(str) {
  if (!str || str.trim() === '') return null;
  const s = str.trim();
  if (s.length === 6) {
    const year = 2000 + parseInt(s.slice(0, 2), 10);
    const month = s.slice(2, 4);
    const day = s.slice(4, 6);
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }
  if (s.length === 8) {
    const year = parseInt(s.slice(0, 4), 10);
    const month = s.slice(4, 6);
    const day = s.slice(6, 8);
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }
  return null;
}

// ============================================================
// 시트 행에서 날짜 필드 6개를 추출
// 비유: 시트의 여러 열에 흩어진 날짜를 한 묶음으로 모으는 것
// ============================================================
function extractSheetDates(row) {
  return {
    createdAt: parseDate(row[0]),           // col0: 상담개시일
    designRequestDate: parseDate(row[1]),    // col1: 시안요청일
    orderReceiptDate: parseDate(row[21]),    // col21: 주문서 접수일
    desiredDate: parseDate(row[22]),         // col22: 희망납기
    releaseDate: parseDate(row[24]),         // col24: 출고일
    shippedDate: parseDate(row[26]),         // col26: 발송일
  };
}

// ============================================================
// DB 현재 날짜와 시트 날짜를 비교하여 변경이 필요한 필드만 반환
// 비유: 두 개의 달력을 나란히 놓고, 다른 부분만 빨간 펜으로 표시하는 것
// ============================================================
function compareDates(dbData, sheetDates) {
  const changes = {};
  // 시트에 값이 있고, DB와 다른 경우만 변경 대상으로 포함
  if (sheetDates.createdAt && sheetDates.createdAt !== dbData.createdAt) {
    changes.createdAt = sheetDates.createdAt;
  }
  if (sheetDates.designRequestDate && sheetDates.designRequestDate !== dbData.designRequestDate) {
    changes.designRequestDate = sheetDates.designRequestDate;
  }
  if (sheetDates.orderReceiptDate && sheetDates.orderReceiptDate !== dbData.orderReceiptDate) {
    changes.orderReceiptDate = sheetDates.orderReceiptDate;
  }
  // shipping 하위 필드는 optional chaining으로 안전하게 접근
  if (sheetDates.desiredDate && sheetDates.desiredDate !== dbData.shipping?.desiredDate) {
    changes.desiredDate = sheetDates.desiredDate;
  }
  if (sheetDates.releaseDate && sheetDates.releaseDate !== dbData.shipping?.releaseDate) {
    changes.releaseDate = sheetDates.releaseDate;
  }
  if (sheetDates.shippedDate && sheetDates.shippedDate !== dbData.shipping?.shippedDate) {
    changes.shippedDate = sheetDates.shippedDate;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// ============================================================
// Step 1: 스프레드시트 상태 결정 로직
// 비유: 시트의 여러 컬럼을 종합하여 "이 주문의 진짜 상태"를 결정
// ============================================================
// 시트 Q열(col16, "진행")에서 N차수정/초안요청/초과수정 추출
// 비유: 운영자가 손으로 메모한 워크플로 라벨을 부가 정보로 보존
function extractRevisionStage(qValue) {
  if (!qValue) return null;
  if (qValue.includes('초안요청')) return '초안요청';
  if (qValue.includes('초과수정')) return '초과수정';
  // "1차수정", "2차수정", ... 패턴 매칭
  const match = qValue.match(/(\d+)차수정/);
  if (match) return `${match[1]}차수정`;
  return null;
}

// ============================================================
// determineStatusFromSheet — 시트 행에서 status + 부가 필드 결정
// 비유: 시트의 여러 컬럼을 종합해 "이 주문의 진짜 상태 + 디자인 단계 + 수정 차수"를 한 번에 결정
// 반환: { status, designSubStatus, revisionStage } 또는 null (매핑 불가)
//   - status: DB orders.status 컬럼 값
//   - designSubStatus: data.design.status (draft_done/revision_done/null)
//   - revisionStage: 운영 워크플로 라벨 (초안요청/N차수정/초과수정/null)
// ============================================================
function determineStatusFromSheet(row) {
  // row는 필드 배열 (인덱스로 접근)
  const 진행 = row[16] || '';        // col16: Q열 운영자 워크플로 라벨
  const 시안 = row[17] || '';        // col17: R열 시안 상태 (디자이너 최종)
  const 제작상황 = row[23] || '';    // col23: 제작상황
  const 출고일 = row[24] || '';      // col24: 출고일
  const 발송일 = row[26] || '';      // col26: 발송일

  // Q열에서 수정 차수 라벨 미리 추출 — design_requested 단계에서만 의미
  const revisionStage = extractRevisionStage(진행);

  // 발송일이 있으면 → 배송중 (revisionStage는 의미 없음 → null)
  if (발송일) return { status: 'shipped', designSubStatus: null, revisionStage: null };
  // 출고일이 있으면 → 출고
  if (출고일) return { status: 'released', designSubStatus: null, revisionStage: null };
  // 제작상황이 있으면 제작 단계에서 세분화
  if (제작상황) {
    if (제작상황.includes('생산완료')) return { status: 'production_done', designSubStatus: null, revisionStage: null };
    if (제작상황.includes('생산중')) return { status: 'in_production', designSubStatus: null, revisionStage: null };
    // "신 라인작업", "신 라인작업 완료" 모두 작업지시서 접수 단계
    if (제작상황.includes('라인작업')) return { status: 'work_instruction_received', designSubStatus: null, revisionStage: null };
    // 기타 제작상황도 작업지시서 접수로 처리
    return { status: 'work_instruction_received', designSubStatus: null, revisionStage: null };
  }
  // 시안 상태로 판단 — R열(디자이너 최종) 우선
  if (시안 === '디자인확정') return { status: 'design_confirmed', designSubStatus: 'confirmed', revisionStage: null };
  if (시안 === '초안완료') return { status: 'draft_done', designSubStatus: 'draft_done', revisionStage: null };
  if (시안 === '수정완료') return { status: 'draft_done', designSubStatus: 'revision_done', revisionStage: null };
  if (시안 === '작업중') return { status: 'design_requested', designSubStatus: null, revisionStage };

  // R열이 비어있고 Q열(운영자 라벨)에 정보가 있으면 design_requested 단계로 추정
  // 비유: 디자이너 최종 결과가 아직 없지만 운영자가 "1차수정"을 메모해놨다면 작업 진행 중
  if (revisionStage) return { status: 'design_requested', designSubStatus: null, revisionStage };

  return null; // 매핑 불가 → 변경하지 않음
}

// ============================================================
// 팀명 정규화 (매칭용)
// 비유: "다크 호스", "다크호스 ", "다크호스(추가)" 를 모두 "다크호스"로 통일
// ============================================================
function normalizeTeamName(name) {
  if (!name) return '';
  return name
    .replace(/\(.*?\)/g, '')  // 괄호 내용 제거
    .replace(/\s+/g, '')      // 공백 제거
    .toLowerCase()             // 소문자 변환
    .trim();
}

// ============================================================
// 시트 팀명에서 안전한 품목 키워드 제거 (매칭 성공률 향상용)
// 비유: "서울시립대 싸이클론 긴팔슈팅저지"에서 "긴팔슈팅저지"만 빼서
//       DB의 "서울시립대 싸이클론"과 매칭되도록 하는 것
// 주의: "농구", "축구", "여자", "남자"는 팀명 일부인 경우가 많아 제거하지 않음!
// ============================================================
function normalizeSheetTeamName(name) {
  let n = name.trim();
  // 긴 키워드부터 먼저 제거해야 "긴팔슈팅셔츠"가 "슈팅셔츠" 제거 전에 처리됨
  const safeKeywords = [
    '긴팔슈팅저지', '긴팔슈팅셔츠', '반팔전사티', '트랙탑자켓',
    '슈팅셔츠', '후드집업', '후드티', '반팔티', '유니폼',
    '상의2 하의2', '상의1 하의2', '상의2 하의1', '상의1 하의1',
    '단면 하의 1', '상의만', '하의만', '바지만',
    '웜업SET', '이너웨어', '연습복',
    '양면', '프로', '베이직', '두세트',
  ];
  for (const kw of safeKeywords) {
    // 정규식 특수문자 이스케이프 후 대소문자 무시하여 제거
    n = n.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  // "2026 " 접두사 제거 (연도 태그)
  n = n.replace(/^2026\s*/, '');
  // 여러 공백을 하나로 합치고 앞뒤 공백 제거
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// ============================================================
// Step 2: 견적서 배송완료 팀 목록
// ============================================================
// 수동 매핑: 견적서 팀명 → DB에 저장된 팀명 (자동 부분 매칭으로 안 되는 경우)
// 비유: "선일여고"라고 줄여 쓴 것을 DB의 정식 이름 "선일여자고등학교"로 연결
const MANUAL_TEAM_MAP = {
  '선일여고': '선일여자고등학교',
};

const deliveredTeams = [
  { name: '다크호스', date: '2026-03-20' },
  { name: '에이젝', date: '2026-03-20' },
  { name: '올림픽파크', date: '2026-03-23' },
  { name: '선일여중', date: '2026-03-23' },
  { name: '선일여고', date: '2026-03-23' },
  { name: 'BOB', date: '2026-03-23' },
  { name: '제이크루', date: '2026-03-23' },
  { name: '남양주 호구', date: '2026-03-24' },
  { name: '사천시청', date: '2026-03-24' },
  { name: 'RISE', date: '2026-03-25' },
  { name: '아리랑', date: '2026-03-25' },
  { name: '온에어', date: '2026-03-25' },
  { name: '명지고', date: '2026-03-26' },
  { name: 'MOLAR', date: '2026-03-26' },
  { name: 'META', date: '2026-03-26' },
  { name: '사이다', date: '2026-03-27' },
  { name: 'UNKNOWN', date: '2026-03-27' },
  { name: '가천대 ZOOT', date: '2026-03-27' },
  { name: '스포라운드', date: '2026-03-30' },
  { name: '브롱스', date: '2026-03-30' },
  { name: '부산치대', date: '2026-03-30' },
  { name: '완도', date: '2026-03-30' },
  { name: '서울대 농구부', date: '2026-03-30' },
  { name: '화진초', date: '2026-03-30' },
];

// ============================================================
// 메인 sync 함수 (모듈 export — 스케줄러 호출 + CLI 호환)
//
// options:
//   download: true → 시트 3개 탭 CSV를 _sync_tabs/로 다운로드
//   apply: true    → DB 실제 업데이트, false면 dry-run
//
// returns:
//   { success: bool, statusChanges: N, dateOnly: N, deliveryUpdates: N, error: string|null }
// ============================================================
export async function runSync(options = {}) {
  const isDownload = !!options.download;
  const isApply = !!options.apply;
  const isDryRun = !isApply;

  logModeBanner(isDownload, isApply, isDryRun);

  const result = { success: false, statusChanges: 0, dateOnly: 0, deliveryUpdates: 0, error: null };

// ── 1. 다운로드 단계 ──
// download=true이면 3개 탭을 _sync_tabs/에 저장
if (isDownload) {
  try {
    await downloadAllTabs();
  } catch (err) {
    console.error('다운로드 실패. 중단합니다:', err.message);
    result.error = `다운로드 실패: ${err.message}`;
    return result; // 모듈 호환: process.exit 대신 결과 반환
  }
}

// download만 단독 실행 → 다운로드만 하고 종료 (DB 안 건드림)
if (isDownload && !isApply && !isDryRun) {
  console.log('--download 만 실행됨. dry-run/apply는 별도로 호출하세요.');
  console.log('  예: node server/data/sync-orders.js --dry-run');
  result.success = true;
  return result;
}

// DB 연결
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// DB에서 활성 주문 조회 (delivered, cancelled 제외)
const activeOrders = db.prepare(
  "SELECT id, orderNumber, status, data FROM orders WHERE status NOT IN ('delivered','cancelled')"
).all().map(row => {
  const data = JSON.parse(row.data);
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    dbStatus: row.status,                     // DB에 저장된 현재 상태 (레거시일 수 있음)
    normalizedStatus: normalizeStatus(row.status), // 정규화된 상태
    teamName: data.customer?.teamName || '',  // 고객 팀명
    data: data,                               // 전체 주문 데이터 (업데이트 시 필요)
  };
});

console.log(`활성 주문 ${activeOrders.length}건 로드 완료\n`);

// ============================================================
// Step 1: 스프레드시트 CSV → 상태 업데이트 계산
// ============================================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Step 1: 스프레드시트 → DB 상태 업데이트');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ── CSV 소스 결정 (4개 탭 / 단일 레거시 자동 선택) ──
// 비유: 새 폴더(_sync_tabs)에 4개 파일이 있으면 그걸 쓰고,
//       없으면 옛 단일 파일(spreadsheet_orders.csv)로 fallback
let csvRows = [];
const tabsPresent = fs.existsSync(TABS_DIR) && SHEET_TABS.every(t => fs.existsSync(path.join(TABS_DIR, t.file)));

if (tabsPresent) {
  // 4개 탭 모드: 우선순위 순서대로 읽고, 각 row에 _tabContext 부착
  // 우선순위: 완료(미수) → 완료 → 보류 → 진행 (SHEET_TABS 순서)
  // 같은 팀이 여러 탭에 있을 때, 마지막 탭(진행)의 처리가 alreadyProcessed로 우선됨
  console.log('[3개 탭 모드] _sync_tabs/ 사용\n');
  for (const tab of SHEET_TABS) {
    const tabPath = path.join(TABS_DIR, tab.file);
    const tabText = fs.readFileSync(tabPath, 'utf-8');
    const tabRows = parseCSVToRows(tabText);
    // 각 row에 탭 컨텍스트 부착 (defaultStatus 적용 시 필요)
    for (const row of tabRows) {
      row._tabContext = tab; // {gid, name, defaultStatus, ...}
    }
    csvRows.push(...tabRows);
    console.log(`  ${tab.name.padEnd(15)} (gid=${tab.gid.padEnd(11)}) → ${tabRows.length}행`);
  }
  console.log(`\n총 ${csvRows.length}행 (3개 탭 합산)\n`);
} else {
  // 레거시 모드: spreadsheet_orders.csv 단일 파일 (이전 동작 그대로)
  // 비유: 옛 방식대로 한 파일만 처리. 호환성 유지용
  console.log('[레거시 모드] spreadsheet_orders.csv 단일 파일\n');
  console.log('  (3개 탭 사용하려면: node sync-orders.js --download)\n');
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  csvRows = parseCSVToRows(csvText);
  // 레거시 모드에선 _tabContext 없음 → 시트 내용으로 status 결정
  console.log(`CSV 데이터 행: ${csvRows.length}건\n`);
}

// 시트 행별로 DB 주문과 매칭
const step1Changes = [];     // 상태 변경 대상
const step1NoMatch = [];     // 매칭 실패
const step1SameStatus = [];  // 매칭됐지만 상태 동일 (변경 불필요)
const step1Regressed = [];   // 상태 역행 (안전상 제외)
const step1DateOnly = [];    // 상태는 같지만 날짜만 변경 필요
const alreadyProcessed = new Set(); // 같은 DB 주문이 중복 처리되지 않도록 방지

// 전체 주문 (delivered 포함) — C카테고리 스킵 판별용
const allOrdersForSkip = db.prepare(
  "SELECT orderNumber, status, data FROM orders"
).all().map(row => {
  const data = JSON.parse(row.data);
  return {
    orderNumber: row.orderNumber,
    status: row.status,
    teamName: data.customer?.teamName || '',
  };
});

for (const row of csvRows) {
  const sheetTeamName = row[2] || '';   // col2: 팀명
  // 탭 컨텍스트 (4개 탭 모드일 때만 부착됨, 레거시 모드는 undefined)
  const tabCtx = row._tabContext;
  // status 결정 우선순위:
  //   1) 탭 defaultStatus (delivered/hold) — 완료/완료(미수)/보류 탭
  //   2) 시트 내용 기반 determineStatusFromSheet — 진행 탭 또는 레거시
  // 비유: 탭 자체가 "이건 출고 완료다"라고 단정하는 경우(완료 탭)는
  //       시트 셀 값보다 탭 의미를 우선. 진행 탭은 셀 내용으로 판단.
  // 또한 완료/보류 탭의 행은 시트가 옛 날짜를 갖고 있을 수 있으므로
  // 날짜는 건드리지 않음 (skipDates 플래그). 진행 탭만 날짜 동기화.
  let sheetStatus;
  // 디자인 부가 정보 (Q열 + R열 분기) — 진행 탭에서만 채워지고, 완료/보류 탭은 null
  let designSubStatus = null;
  let revisionStage = null;
  let skipDates = false;
  if (tabCtx && tabCtx.defaultStatus) {
    sheetStatus = tabCtx.defaultStatus; // 'delivered' 또는 'hold'
    skipDates = true; // 완료/완료(미수)/보류 탭은 date 변경 금지
  } else {
    // 진행 탭: determineStatusFromSheet 객체 반환 → status + 디자인 부가 필드 분해
    const result = determineStatusFromSheet(row);
    if (result) {
      sheetStatus = result.status;
      designSubStatus = result.designSubStatus;
      revisionStage = result.revisionStage;
    } else {
      sheetStatus = null;
    }
  }

  // 상태 결정 불가능한 행은 건너뛰기
  if (!sheetStatus) continue;
  // 팀명이 비어있으면 건너뛰기
  if (!sheetTeamName.trim()) continue;

  // ── 0단계: 수동 매핑 테이블 우선 조회 ──
  // MANUAL_SHEET_MAP에 있으면 해당 주문번호로 바로 연결
  if (MANUAL_SHEET_MAP[sheetTeamName]) {
    const orderNum = MANUAL_SHEET_MAP[sheetTeamName];
    // 이미 처리된 주문이면 스킵 (시트에 같은 팀이 여러 행일 수 있음)
    if (alreadyProcessed.has(orderNum)) continue;
    const order = activeOrders.find(o => o.orderNumber === orderNum);
    if (order) {
      alreadyProcessed.add(orderNum);
      // 시트에서 날짜 추출 후 DB와 비교
      // 단, 완료/완료(미수)/보류 탭(skipDates)은 시트 날짜가 옛 데이터일 수 있어 무시
      const sheetDates = extractSheetDates(row);
      const dateChanges = skipDates ? null : compareDates(order.data, sheetDates);
      if (order.normalizedStatus === sheetStatus) {
        // 상태는 동일하지만, 날짜가 다르면 날짜만 업데이트 대상에 추가
        // 디자인 부가 필드(designSubStatus/revisionStage)도 함께 운반 — 동일 상태여도 디자인 단계 갱신 가능
        if (dateChanges) {
          step1DateOnly.push({ orderNumber: order.orderNumber, teamName: order.teamName, status: order.normalizedStatus, dateChanges, orderId: order.id, data: order.data, designSubStatus, revisionStage });
        } else if (designSubStatus || revisionStage) {
          // 상태/날짜는 그대로지만 디자인 부가 필드만 갱신할 가치가 있는 경우
          step1DateOnly.push({ orderNumber: order.orderNumber, teamName: order.teamName, status: order.normalizedStatus, dateChanges: null, orderId: order.id, data: order.data, designSubStatus, revisionStage });
        } else {
          step1SameStatus.push({ orderNumber: order.orderNumber, teamName: order.teamName, status: order.normalizedStatus });
        }
      } else if (order.normalizedStatus === 'hold' || order.dbStatus === 'hold') {
        step1Regressed.push({ orderNumber: order.orderNumber, teamName: order.teamName, currentStatus: order.normalizedStatus, newStatus: sheetStatus });
      } else if (isStatusRegression(order.normalizedStatus, sheetStatus)) {
        step1Regressed.push({ orderNumber: order.orderNumber, teamName: order.teamName, currentStatus: order.normalizedStatus, newStatus: sheetStatus });
      } else {
        step1Changes.push({ orderNumber: order.orderNumber, teamName: order.teamName, currentStatus: order.dbStatus, currentNormalized: order.normalizedStatus, newStatus: sheetStatus, orderId: order.id, data: order.data, dateChanges, designSubStatus, revisionStage });
      }
    }
    // 수동 매핑 주문이 activeOrders에 없으면 (이미 delivered 등) 무시
    continue;
  }

  // ── 1단계: 정확 매칭 (기존 로직 — 정규화된 팀명 비교) ──
  const normalizedSheet = normalizeTeamName(sheetTeamName);
  let matched = activeOrders.filter(order => {
    const normalizedDB = normalizeTeamName(order.teamName);
    return normalizedDB === normalizedSheet;
  });

  // ── 2단계: 키워드 제거 후 재매칭 (1단계 실패 시) ──
  if (matched.length === 0) {
    const cleaned = normalizeSheetTeamName(sheetTeamName);
    // 키워드 제거 결과가 원본과 다르고 비어있지 않을 때만 시도
    if (cleaned && cleaned !== sheetTeamName.trim()) {
      const normalizedCleaned = normalizeTeamName(cleaned);
      if (normalizedCleaned) {
        matched = activeOrders.filter(order => {
          const normalizedDB = normalizeTeamName(order.teamName);
          return normalizedDB === normalizedCleaned;
        });
      }
    }
  }

  // ── 3단계: 매칭 실패 처리 ──
  if (matched.length === 0) {
    // C카테고리: 해당 팀의 모든 DB 주문이 delivered이면 자동 스킵
    const normalizedForSkip = normalizeTeamName(sheetTeamName);
    const cleanedForSkip = normalizeTeamName(normalizeSheetTeamName(sheetTeamName));
    const allTeamOrders = allOrdersForSkip.filter(o => {
      const ndb = normalizeTeamName(o.teamName);
      return ndb === normalizedForSkip || (cleanedForSkip && ndb === cleanedForSkip);
    });
    if (allTeamOrders.length > 0 && allTeamOrders.every(o => o.status === 'delivered')) {
      // delivered만 있는 팀은 매칭 실패 목록에 넣지 않고 조용히 스킵
      continue;
    }
    step1NoMatch.push({ sheetTeamName, sheetStatus });
  } else {
    for (const order of matched) {
      // 중복 방지: 이미 처리된 주문번호는 스킵
      if (alreadyProcessed.has(order.orderNumber)) continue;
      alreadyProcessed.add(order.orderNumber);

      // 시트에서 날짜 추출 후 DB와 비교
      // 단, 완료/완료(미수)/보류 탭(skipDates)은 시트 날짜가 옛 데이터일 수 있어 무시
      const sheetDates = extractSheetDates(row);
      const dateChanges = skipDates ? null : compareDates(order.data, sheetDates);

      // 현재 DB 상태를 정규화해서 비교
      if (order.normalizedStatus !== sheetStatus) {
        // hold(보류) 상태는 절대 변경하지 않음 (수동 보류 해제만 허용)
        if (order.normalizedStatus === 'hold' || order.dbStatus === 'hold') {
          step1Regressed.push({
            orderNumber: order.orderNumber,
            teamName: order.teamName,
            currentStatus: order.normalizedStatus,
            newStatus: sheetStatus,
          });
          continue;
        }
        // 상태 역행 체크: 새 상태가 현재보다 앞 단계면 제외
        // (시트의 다른 주문과 잘못 매칭된 경우가 대부분)
        if (isStatusRegression(order.normalizedStatus, sheetStatus)) {
          step1Regressed.push({
            orderNumber: order.orderNumber,
            teamName: order.teamName,
            currentStatus: order.normalizedStatus,
            newStatus: sheetStatus,
          });
          continue; // 역행은 적용하지 않음
        }
        step1Changes.push({
          orderNumber: order.orderNumber,
          teamName: order.teamName,
          currentStatus: order.dbStatus,
          currentNormalized: order.normalizedStatus,
          newStatus: sheetStatus,
          orderId: order.id,
          data: order.data,
          dateChanges,  // 날짜 변경사항도 함께 저장
          designSubStatus,  // 디자인 상세 단계 (draft_done/revision_done/confirmed/null)
          revisionStage,    // 운영자 워크플로 라벨 (초안요청/N차수정/초과수정/null)
        });
      } else {
        // 상태는 동일하지만, 날짜가 다르거나 디자인 부가 필드가 새로 들어온 경우 업데이트 대상
        if (dateChanges) {
          step1DateOnly.push({
            orderNumber: order.orderNumber,
            teamName: order.teamName,
            status: order.normalizedStatus,
            dateChanges,
            orderId: order.id,
            data: order.data,
            designSubStatus,
            revisionStage,
          });
        } else if (designSubStatus || revisionStage) {
          // 상태/날짜는 그대로지만 디자인 부가 필드만 갱신할 가치가 있는 경우
          step1DateOnly.push({
            orderNumber: order.orderNumber,
            teamName: order.teamName,
            status: order.normalizedStatus,
            dateChanges: null,
            orderId: order.id,
            data: order.data,
            designSubStatus,
            revisionStage,
          });
        } else {
          step1SameStatus.push({
            orderNumber: order.orderNumber,
            teamName: order.teamName,
            status: order.normalizedStatus,
          });
        }
      }
    }
  }
}

// Step 1 중복 제거: 같은 주문에 여러 시트 행이 매칭되면 마지막(최신) 상태를 사용
// 비유: 시트에 "다크호스 유니폼"과 "다크호스 슈팅셔츠" 두 행이 있으면,
//       DB의 "다크호스" 주문이 두 번 매칭됨 → 마지막 매칭 결과만 사용
const step1Deduped = new Map();
for (const c of step1Changes) {
  step1Deduped.set(c.orderId, c); // 같은 orderId면 덮어쓰기 (마지막 것 유지)
}
const step1Unique = [...step1Deduped.values()];

// Step 1 결과 출력
console.log(`[상태 변경 대상: ${step1Unique.length}건]`);
if (step1Unique.length > 0) {
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('팀명'.padEnd(30) + '| 현재 상태'.padEnd(30) + '→ 새 상태'.padEnd(25) + '| 주문번호');
  console.log('─────────────────────────────────────────────────────────────────');
  for (const c of step1Unique) {
    const current = `${c.currentStatus}(${c.currentNormalized})`;
    console.log(
      `${c.teamName.padEnd(28)}| ${current.padEnd(28)}→ ${c.newStatus.padEnd(23)}| ${c.orderNumber}`
    );
  }
}

// 날짜만 업데이트 대상 출력
// dateChanges가 null인 경우(디자인 부가 필드만 갱신)도 포함되므로 안전 처리
console.log(`\n[날짜/디자인 부가 업데이트: ${step1DateOnly.length}건]`);
if (step1DateOnly.length > 0) {
  console.log('─────────────────────────────────────────────────────────────────');
  for (const d of step1DateOnly) {
    const dateFields = d.dateChanges ? Object.entries(d.dateChanges).map(([k, v]) => {
      // DB의 기존 값 찾기
      const oldVal = k.startsWith('desired') || k.startsWith('release') || k.startsWith('shipped')
        ? (d.data.shipping?.[k] || 'null')
        : (d.data[k] || 'null');
      return `${k}: ${oldVal} -> ${v}`;
    }).join(', ') : '';
    // 디자인 부가 필드도 함께 표시
    const designFields = [];
    if (d.designSubStatus) designFields.push(`design.status=${d.designSubStatus}`);
    if (d.revisionStage) designFields.push(`revisionStage=${d.revisionStage}`);
    const allFields = [dateFields, designFields.join(', ')].filter(Boolean).join(' | ');
    console.log(`  ${d.teamName} | ${allFields} | ${d.orderNumber}`);
  }
}

// 상태 변경 건 중 날짜도 함께 바뀌는 건 표시
const step1WithDates = step1Unique.filter(c => c.dateChanges);
if (step1WithDates.length > 0) {
  console.log(`\n[상태 변경 + 날짜 업데이트: ${step1WithDates.length}건]`);
  console.log('─────────────────────────────────────────────────────────────────');
  for (const c of step1WithDates) {
    const fields = Object.entries(c.dateChanges).map(([k, v]) => {
      const oldVal = k.startsWith('desired') || k.startsWith('release') || k.startsWith('shipped')
        ? (c.data.shipping?.[k] || 'null')
        : (c.data[k] || 'null');
      return `${k}: ${oldVal} -> ${v}`;
    }).join(', ');
    console.log(`  ${c.teamName} | ${fields} | ${c.orderNumber}`);
  }
}

console.log(`\n[상태 동일 (변경 불필요): ${step1SameStatus.length}건]`);

// 역행 목록 (중복 제거)
const uniqueRegressed = [...new Map(step1Regressed.map(r => [r.orderNumber, r])).values()];
console.log(`\n[상태 역행 (안전상 제외): ${uniqueRegressed.length}건]`);
if (uniqueRegressed.length > 0) {
  for (const r of uniqueRegressed) {
    console.log(`  - ${r.teamName} (${r.currentStatus} → ${r.newStatus}) | ${r.orderNumber}`);
  }
}

// 매칭 실패 목록 (중복 제거)
const uniqueNoMatch = [...new Map(step1NoMatch.map(m => [m.sheetTeamName, m])).values()];
console.log(`\n[매칭 실패: ${uniqueNoMatch.length}건 (시트에는 있지만 DB 활성 주문에 없음)]`);
if (uniqueNoMatch.length > 0) {
  for (const m of uniqueNoMatch) {
    console.log(`  - ${m.sheetTeamName} (시트 상태: ${m.sheetStatus})`);
  }
}

// ============================================================
// Step 2: 견적서 배송완료 목록 → delivered 처리
// ============================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Step 2: 견적서 → DB 배송완료(delivered) 처리');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const step2Changes = [];     // delivered 처리 대상
const step2NoMatch = [];     // 매칭 실패

for (const team of deliveredTeams) {
  // 수동 매핑이 있으면 해당 이름으로 먼저 검색
  const manualName = MANUAL_TEAM_MAP[team.name];
  const searchNames = manualName
    ? [normalizeTeamName(manualName)]                    // 수동 매핑 우선
    : [normalizeTeamName(team.name)];                    // 자동 부분 매칭

  // DB 활성 주문 중 팀명이 견적서 팀명을 "포함"하는 것 찾기 (부분 매칭)
  // 빈 문자열은 매칭 제외 (팀명이 없는 주문이 모든 팀과 매칭되는 버그 방지)
  const matched = activeOrders.filter(order => {
    const normalizedDB = normalizeTeamName(order.teamName);
    if (!normalizedDB) return false;
    // 모든 검색 이름에 대해 부분 매칭 시도
    return searchNames.some(searchName => {
      if (!searchName) return false;
      return normalizedDB.includes(searchName) || searchName.includes(normalizedDB);
    });
  });

  if (matched.length === 0) {
    step2NoMatch.push(team);
  } else {
    for (const order of matched) {
      // 이미 Step 1에서 변경 예정인 건도 delivered로 덮어쓰기
      // (견적서 기준이 최종)
      step2Changes.push({
        orderNumber: order.orderNumber,
        teamName: order.teamName,
        currentStatus: order.dbStatus,
        deliveredDate: team.date,
        matchedBy: team.name,
        orderId: order.id,
        data: order.data,
      });
    }
  }
}

// Step 2 결과 출력
console.log(`[배송완료 처리 대상: ${step2Changes.length}건]`);
if (step2Changes.length > 0) {
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('팀명'.padEnd(30) + '| 현재 상태'.padEnd(20) + '→ delivered' + '  | 배송일'.padEnd(15) + '| 주문번호');
  console.log('─────────────────────────────────────────────────────────────────');
  for (const c of step2Changes) {
    console.log(
      `${c.teamName.padEnd(28)}| ${c.currentStatus.padEnd(18)}→ delivered  | ${c.deliveredDate.padEnd(13)}| ${c.orderNumber}`
    );
  }
}

console.log(`\n[매칭 실패: ${step2NoMatch.length}건]`);
if (step2NoMatch.length > 0) {
  for (const m of step2NoMatch) {
    console.log(`  - ${m.name} (배송일: ${m.date})`);
  }
}

// ============================================================
// Step 1과 Step 2 중복 처리
// Step 2(delivered)가 Step 1보다 우선 → Step 1에서 중복 제거
// ============================================================
const step2OrderIds = new Set(step2Changes.map(c => c.orderId));
const step1Final = step1Unique.filter(c => !step2OrderIds.has(c.orderId));

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  최종 요약');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Step 1 상태 변경: ${step1Final.length}건 (견적서 중복 ${step1Unique.length - step1Final.length}건 제외)`);
console.log(`Step 1 날짜만:   ${step1DateOnly.length}건`);
console.log(`Step 2 배송완료:  ${step2Changes.length}건`);
console.log(`총 변경 예정:     ${step1Final.length + step1DateOnly.length + step2Changes.length}건\n`);

// ============================================================
// 실제 적용 (--apply 모드일 때만)
// ============================================================
if (!isDryRun) {
  // DB 백업
  const backupPath = DB_PATH + '.pre-sync';
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`DB 백업 완료: ${backupPath}\n`);

  // order_history에 이력 기록하는 prepared statement
  const insertHistory = db.prepare(`
    INSERT INTO order_history (id, orderId, orderNumber, fromStatus, toStatus, changedBy, createdAt, memo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // orders 업데이트 prepared statement
  const updateOrder = db.prepare(`
    UPDATE orders SET status = ?, data = ?, updatedAt = ? WHERE id = ?
  `);

  const now = new Date().toISOString();

  // 트랜잭션으로 일괄 처리 (중간에 실패하면 전체 롤백)
  const applyAll = db.transaction(() => {
    // Step 1 적용: 상태 변경 + 날짜 반영
    for (const c of step1Final) {
      const updatedData = { ...c.data, status: c.newStatus, updatedAt: now };

      // 날짜 변경사항이 있으면 data JSON에도 반영
      if (c.dateChanges) {
        if (c.dateChanges.createdAt) updatedData.createdAt = c.dateChanges.createdAt;
        if (c.dateChanges.designRequestDate) updatedData.designRequestDate = c.dateChanges.designRequestDate;
        if (c.dateChanges.orderReceiptDate) updatedData.orderReceiptDate = c.dateChanges.orderReceiptDate;
        if (c.dateChanges.desiredDate) {
          updatedData.shipping = updatedData.shipping || {};
          updatedData.shipping.desiredDate = c.dateChanges.desiredDate;
        }
        if (c.dateChanges.releaseDate) {
          updatedData.shipping = updatedData.shipping || {};
          updatedData.shipping.releaseDate = c.dateChanges.releaseDate;
        }
        if (c.dateChanges.shippedDate) {
          updatedData.shipping = updatedData.shipping || {};
          updatedData.shipping.shippedDate = c.dateChanges.shippedDate;
        }
      }

      // 디자인 부가 필드 갱신 — design.status (draft_done/revision_done/confirmed)
      // 비유: 시안 페이지에 "초안 완료" vs "수정 완료" 구분을 살리기 위한 부가 정보
      // 주의: revisionCount 등 기존 필드는 보존 (덮어쓰지 않고 부분 갱신)
      if (c.designSubStatus) {
        updatedData.design = { ...(updatedData.design || {}), status: c.designSubStatus };
      }
      // revisionStage: design_requested 단계에서만 의미 있음. 다른 상태로 진입하면 null로 정리
      if (c.newStatus === 'design_requested') {
        updatedData.revisionStage = c.revisionStage || null;
      } else if (c.newStatus === 'design_confirmed' || c.newStatus === 'draft_done') {
        // 시안 단계가 진전되면 운영자 워크플로 라벨은 의미 잃음 → 클리어
        updatedData.revisionStage = null;
      }

      updateOrder.run(c.newStatus, JSON.stringify(updatedData), now, c.orderId);

      // orderReceiptDate, createdAt 테이블 컬럼도 업데이트 (별도 컬럼이 있는 필드)
      if (c.dateChanges?.orderReceiptDate) {
        db.prepare('UPDATE orders SET orderReceiptDate = ? WHERE id = ?').run(c.dateChanges.orderReceiptDate, c.orderId);
      }
      if (c.dateChanges?.createdAt) {
        db.prepare('UPDATE orders SET createdAt = ? WHERE id = ?').run(c.dateChanges.createdAt, c.orderId);
      }

      // 이력 기록
      const historyId = Date.now() + Math.floor(Math.random() * 10000);
      insertHistory.run(
        historyId, c.orderId, c.orderNumber,
        c.currentStatus, c.newStatus,
        'sync-script', now,
        'CSV 동기화 자동 반영'
      );
    }

    // Step 1 날짜만 업데이트 (상태는 동일, 날짜 또는 디자인 부가 필드만 다른 건)
    // 비유: 같은 단계에 머물지만 "1차수정 → 2차수정" 처럼 안에서 진척이 있을 때 그 정보를 살림
    for (const d of step1DateOnly) {
      const updatedData = { ...d.data, updatedAt: now };
      // dateChanges가 null인 경우(부가 필드만 갱신)에도 안전하게 처리
      if (d.dateChanges) {
        if (d.dateChanges.createdAt) updatedData.createdAt = d.dateChanges.createdAt;
        if (d.dateChanges.designRequestDate) updatedData.designRequestDate = d.dateChanges.designRequestDate;
        if (d.dateChanges.orderReceiptDate) updatedData.orderReceiptDate = d.dateChanges.orderReceiptDate;
        if (d.dateChanges.desiredDate) {
          updatedData.shipping = updatedData.shipping || {};
          updatedData.shipping.desiredDate = d.dateChanges.desiredDate;
        }
        if (d.dateChanges.releaseDate) {
          updatedData.shipping = updatedData.shipping || {};
          updatedData.shipping.releaseDate = d.dateChanges.releaseDate;
        }
        if (d.dateChanges.shippedDate) {
          updatedData.shipping = updatedData.shipping || {};
          updatedData.shipping.shippedDate = d.dateChanges.shippedDate;
        }
      }
      // 디자인 부가 필드 갱신 — design.status (revisionCount/designer 등 기존 값 보존)
      if (d.designSubStatus) {
        updatedData.design = { ...(updatedData.design || {}), status: d.designSubStatus };
      }
      // revisionStage: design_requested 상태일 때만 의미 — 다른 상태면 클리어
      if (d.status === 'design_requested') {
        updatedData.revisionStage = d.revisionStage || null;
      } else if (d.status === 'design_confirmed' || d.status === 'draft_done') {
        updatedData.revisionStage = null;
      }
      // data JSON 업데이트 (상태는 그대로 유지)
      db.prepare('UPDATE orders SET data = ?, updatedAt = ? WHERE id = ?').run(
        JSON.stringify(updatedData), now, d.orderId
      );
      // 테이블 컬럼 업데이트 (dateChanges 있을 때만)
      if (d.dateChanges?.orderReceiptDate) {
        db.prepare('UPDATE orders SET orderReceiptDate = ? WHERE id = ?').run(d.dateChanges.orderReceiptDate, d.orderId);
      }
      if (d.dateChanges?.createdAt) {
        db.prepare('UPDATE orders SET createdAt = ? WHERE id = ?').run(d.dateChanges.createdAt, d.orderId);
      }
    }

    // Step 2 적용
    for (const c of step2Changes) {
      const updatedData = {
        ...c.data,
        status: 'delivered',
        updatedAt: now,
        shipping: {
          ...(c.data.shipping || {}),
          shippedDate: c.deliveredDate + 'T00:00:00.000Z',
        },
      };
      updateOrder.run('delivered', JSON.stringify(updatedData), now, c.orderId);

      // 이력 기록
      const historyId = Date.now() + Math.floor(Math.random() * 10000);
      insertHistory.run(
        historyId, c.orderId, c.orderNumber,
        c.currentStatus, 'delivered',
        'sync-script', now,
        '견적서 배송완료 반영 (' + c.deliveredDate + ')'
      );
    }
  });

  applyAll();
  console.log(`적용 완료! (Step1 상태: ${step1Final.length}건 + Step1 날짜: ${step1DateOnly.length}건 + Step2: ${step2Changes.length}건)`);

  // 결과 카운트 채우기 (스케줄러가 통계 표시용으로 사용)
  result.statusChanges = step1Final.length;
  result.dateOnly = step1DateOnly.length;
  result.deliveryUpdates = step2Changes.length;
} else {
  console.log('(dry-run 모드이므로 DB는 변경되지 않았습니다)');
  console.log('실제 적용하려면: node server/data/sync-orders.js --apply');

  // dry-run에서도 카운트는 채워서 운영자가 변경 예정량 파악 가능
  result.statusChanges = step1Final.length;
  result.dateOnly = step1DateOnly.length;
  result.deliveryUpdates = step2Changes.length;
}

db.close();
result.success = true;
return result;

} // runSync 함수 종료

// ============================================================
// CLI 호환 진입점
// 비유: 같은 함수를 두 가지 방법으로 부를 수 있다 — 모듈 import + 터미널 직접 실행
// node sync-orders.js --apply 처럼 직접 실행되면 아래 블록이 작동
// ============================================================
const args = process.argv.slice(2);
const __isDirectCli = (() => {
  // pathToFileURL: Windows 공백/한글 경로도 정확히 인코딩 (file:///C:/0.%20Programing/...)
  // 단순 문자열 치환은 인코딩이 안 맞아서 매칭 실패함 (디버깅으로 확인)
  if (!process.argv[1]) return false;
  try {
    const argvUrl = pathToFileURL(process.argv[1]).href;
    return import.meta.url === argvUrl;
  } catch {
    return false;
  }
})();

if (__isDirectCli) {
  // CLI 인자 파싱: --download / --apply / --dry-run
  const cliDownload = args.includes('--download');
  const cliApply = args.includes('--apply');
  // --dry-run은 명시적이지 않아도 --apply 없으면 기본 dry-run

  runSync({ download: cliDownload, apply: cliApply })
    .then((res) => {
      if (!res.success) {
        console.error('[sync-orders] 실패:', res.error);
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('[sync-orders] 예외:', err);
      process.exit(1);
    });
}
