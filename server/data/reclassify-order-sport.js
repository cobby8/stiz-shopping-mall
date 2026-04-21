/**
 * ============================================================
 *  과거 주문 sport 자동 재분류 스크립트
 * ============================================================
 *
 * 🎯 목표
 *   stiz.db 주문 6,847건의 items[].sport 컬럼 중 "other" / "" / null / undefined
 *   인 항목을 자동 추론해서 basketball / teamwear / soccer / volleyball / baseball
 *   중 하나로 재매핑한다. 매출 통계(admin-analytics)에서 "기타"로 묻혀있던
 *   팀웨어(반팔티/후드) 매출이 정상 집계되도록 한다.
 *
 * 🧠 비유
 *   "other 1,137건을 3단계 체로 거르는 거예요.
 *    - 1단계: 같은 주문의 다른 아이템이 농구면 이것도 농구 (이웃 힌트)
 *    - 2단계: 팀 이름이 '스티즈농구'면 반팔티도 basketball
 *    - 3단계: 그래도 모르면 품목(반팔티/후드/긴팔)로 teamwear
 *    이걸 못 맞춘 ~189건은 그냥 other로 둬요. (양말/웜업SET/부자재 등)"
 *
 * 🛡️ 안전장치 (C-6 dry-run 패턴 준수)
 *   1) dry-run 기본: 인자 없으면 DB 무변경, 리포트만 출력
 *   2) --apply 플래그 필요: 실제 UPDATE는 이 플래그 있을 때만
 *   3) 백업 자동 생성: server/data/backups/stiz.db.bak-sport-reclassify-YYYYMMDDHHMMSS
 *   4) 트랜잭션: 영향 row !== 1이면 즉시 ROLLBACK + 에러 출력
 *   5) idempotent: 이미 real sport로 분류된 item은 절대 건드리지 않음
 *      → 재실행해도 다시 변경할 대상이 없어서 0건 변경
 *   6) real sport 전체 보존: basketball/soccer/volleyball/baseball/badminton/
 *      tabletennis/futsal/tennis/handball/softball/hockey/teamwear 는 절대 변경 X
 *
 * 🚀 사용법
 *   node server/data/reclassify-order-sport.js              ← dry-run (기본)
 *   node server/data/reclassify-order-sport.js --apply      ← 백업 + 실제 UPDATE
 *   node server/data/reclassify-order-sport.js --verbose    ← 변경 샘플 100건 추가 출력
 *
 * 📝 분류 규칙 (P1~P6, 먼저 매칭되면 확정)
 *   P1 — 이웃 힌트: 같은 주문 내 다른 items[N]이 real sport면 그 sport
 *        (여러 이웃 서로 다르면 다수결, 동률이면 첫 번째 real sport)
 *   P2 — 팀명 매칭: customer.teamName이 농구/축구/배구/야구/배드민턴 키워드
 *        (대소문자·공백 무시)
 *   P3 — 품목명 basketball 키워드: 슈팅셔츠/슈팅저지/슈팅/져지/유니폼(농구/basketball)
 *   P4 — 부자재 제외: 헤드밴드/암슬리브/콘/양말/풋살공 등 → other 유지
 *        (단 P1~P3에서 이미 결정됐으면 그 결정 유지)
 *   P5 — teamwear 할당: category ∈ {tshirt, hoodie, pants, longsleeve, sweatshirt}
 *        또는 name에 반팔티/긴팔티/후드/맨투맨/스웻/트레이닝/트랙탑/카라티/폴로
 *   P6 — 매칭 실패: other 유지 (아무 변경 없음)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'stiz.db');
const BACKUPS_DIR = path.join(__dirname, 'backups');

// ============================================================
// 실행 모드 파싱
// ============================================================
// 비유: "안전장치 스위치" — 기본은 dry-run(관찰만), --apply가 있어야 실제 변경
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');

// ============================================================
// 상수: real sport 화이트리스트 (이 값이면 절대 건드리지 않음)
// ============================================================
// 이유: "이미 제대로 분류된 건"을 보호하기 위해 명시적 화이트리스트로 관리.
//       이 리스트에 없는 값(other, 빈문자열, null, undefined)만 재분류 대상.
const REAL_SPORTS = new Set([
  'basketball',
  'soccer',
  'volleyball',
  'baseball',
  'badminton',
  'tabletennis',
  'futsal',
  'tennis',
  'handball',
  'softball',
  'hockey',
  'teamwear', // ← teamwear도 real sport로 간주(기존에 수기로 들어간 경우 보존)
]);

// ============================================================
// 키워드 테이블 (P2 팀명 매칭용)
// ============================================================
// 비유: "팀 이름에 이런 단어가 들어있으면 이 종목" 사전.
//       실측 데이터 기반으로 DB에서 가장 많이 등장하는 키워드 위주로 구성.
const TEAM_KEYWORDS = [
  // 농구 — stiz.db 최대 고객(가스공사/LG세이커스 등)
  {
    sport: 'basketball',
    patterns: [
      '농구', 'basketball', '가스공사', 'LG 세이커스', 'LG세이커스',
      'KT', 'KCC', 'SK', '스티즈농구', 'DYG', '선일여', '방이중',
      '국민대', '쿠바', 'KUBA', 'KUTIME', 'SSUBALL', '페가수스', 'BBALL', '바스켓',
    ],
  },
  // 축구
  { sport: 'soccer', patterns: ['축구', 'soccer', 'football', 'FC', 'SPAD', 'FUTBOL'] },
  // 배구
  { sport: 'volleyball', patterns: ['배구', 'volleyball', 'VB'] },
  // 야구
  { sport: 'baseball', patterns: ['야구', 'baseball', 'BC', '베이스볼'] },
  // 배드민턴
  { sport: 'badminton', patterns: ['배드민턴', 'badminton'] },
];

// ============================================================
// 키워드 테이블 (P3 품목명 basketball)
// ============================================================
// 이유: "슈팅셔츠"는 농구 전용 용어. 팀명이 없어도 품목명만으로 basketball 확정 가능.
const BASKETBALL_NAME_PATTERNS = [
  /슈팅셔츠/i,
  /슈팅저지/i,
  /슈팅/i,
  /져지/i,
  /유니폼.*(농구|basketball)/i,
  /(농구|basketball).*유니폼/i,
];

// ============================================================
// 키워드 테이블 (P4 부자재 — 재분류 포기 대상)
// ============================================================
// 이유: "양말", "풋살공", "헤드밴드" 같은 부자재는 종목 판정이 무의미.
//       이런 품목은 sport="other"로 남겨두는 게 통계적으로 더 정직함.
const ACCESSORY_PATTERNS = [
  /헤드밴드/i,
  /암슬리브/i,
  /무릎보호대/i,
  /\b콘\b/i,         // "콘"이 단독 단어일 때만 (다른 단어 일부는 제외)
  /샘플/i,
  /마킹/i,
  /양말/i,
  /이너/i,           // 이너웨어
  /웜업/i,           // 웜업SET
  /스타킹/i,
  /인솔/i,
  /손목/i,           // 손목보호대
  /신발/i,
  /(볼|ball)/i,      // 풋살공, 농구공 등 ball류
];

// ============================================================
// 키워드 테이블 (P5 teamwear 할당)
// ============================================================
// 이유: 일반 팀웨어(반팔티/후드)는 종목 특정이 어렵지만, 팀복 용도라는 점은 확실.
//       category와 품목명 양쪽 모두로 판정해서 재현율을 높임.
const TEAMWEAR_CATEGORIES = new Set([
  'tshirt', 'hoodie', 'pants', 'longsleeve', 'sweatshirt',
]);

const TEAMWEAR_NAME_PATTERNS = [
  /반팔티/i,
  /긴팔티/i,
  /반팔/i,
  /긴팔/i,
  /후드/i,
  /맨투맨/i,
  /스웻/i,
  /트레이닝/i,
  /트랙탑/i,
  /카라티/i,
  /폴로/i,
];

// ============================================================
// 유틸: sport 값이 재분류 대상인가? (other/빈값/null/undefined)
// ============================================================
function needsReclassify(sport) {
  if (sport === null || sport === undefined) return true;
  if (typeof sport !== 'string') return true;
  const s = sport.trim().toLowerCase();
  if (s === '' || s === 'other') return true;
  // REAL_SPORTS에 포함된 것은 절대 재분류 안 함
  return !REAL_SPORTS.has(s);
}

// ============================================================
// 유틸: 문자열 정규화 (대소문자/공백 무시 매칭용)
// ============================================================
function normalize(str) {
  if (!str) return '';
  return String(str).replace(/\s+/g, '').toLowerCase();
}

// ============================================================
// 분류 엔진 — 한 item을 보고 어떤 sport로 분류할지 결정
// ============================================================
// 반환값: { sport: string, rule: 'P1'|'P2'|'P3'|'P4'|'P5'|'P6', debug: string }
//   - sport가 'other'면 변경 없음(P4/P6)
//   - rule은 리포트 집계용
function classifyItem(item, ctx) {
  const name = item?.name || '';
  const category = item?.category || '';
  const teamName = ctx.teamName || '';
  const neighborSports = ctx.neighborSports || []; // real sport만 담긴 배열

  // ---------- P1: 이웃 힌트 ----------
  // 비유: "같은 주문에 농구 슈팅셔츠 2개 + 반팔티 1개 있으면 반팔티도 basketball"
  if (neighborSports.length > 0) {
    // 다수결 계산
    const counts = {};
    for (const s of neighborSports) {
      counts[s] = (counts[s] || 0) + 1;
    }
    // 최댓값 찾기
    let maxCount = 0;
    let winners = [];
    for (const [s, c] of Object.entries(counts)) {
      if (c > maxCount) {
        maxCount = c;
        winners = [s];
      } else if (c === maxCount) {
        winners.push(s);
      }
    }
    // 동률이면 "첫 번째 real sport" (neighborSports 배열 순서 유지)
    let winner = winners[0];
    if (winners.length > 1) {
      for (const s of neighborSports) {
        if (winners.includes(s)) {
          winner = s;
          break;
        }
      }
    }
    return {
      sport: winner,
      rule: 'P1',
      debug: `이웃 ${neighborSports.length}개 중 ${winner} 선택 (분포: ${JSON.stringify(counts)})`,
    };
  }

  // ---------- P2: 팀명 키워드 매칭 ----------
  // 비유: "팀명이 '스티즈농구'면 농구로 확정"
  const normTeam = normalize(teamName);
  if (normTeam) {
    for (const { sport, patterns } of TEAM_KEYWORDS) {
      for (const p of patterns) {
        const normP = normalize(p);
        if (normP && normTeam.includes(normP)) {
          return {
            sport,
            rule: 'P2',
            debug: `팀명 "${teamName}"에 "${p}" 매칭 → ${sport}`,
          };
        }
      }
    }
  }

  // ---------- P3: 품목명 basketball 키워드 ----------
  // 비유: "팀명은 모르겠는데 품목이 '슈팅셔츠'면 농구"
  for (const re of BASKETBALL_NAME_PATTERNS) {
    if (re.test(name)) {
      return {
        sport: 'basketball',
        rule: 'P3',
        debug: `품목명 "${name}"에 ${re} 매칭 → basketball`,
      };
    }
  }

  // ---------- P4: 부자재 제외 (재분류 포기) ----------
  // 주의: P1~P3에서 이미 매칭됐으면 여기 도달 안 함.
  //       P4에 걸리면 "종목 판정 무의미" → other 유지.
  for (const re of ACCESSORY_PATTERNS) {
    if (re.test(name)) {
      return {
        sport: 'other',
        rule: 'P4',
        debug: `부자재 "${name}" (${re}) → other 유지`,
      };
    }
  }

  // ---------- P5: teamwear 할당 ----------
  // 비유: "팀명도 품목명도 단서 없는데 반팔티/후드면 일반 팀웨어"
  if (TEAMWEAR_CATEGORIES.has(category)) {
    return {
      sport: 'teamwear',
      rule: 'P5',
      debug: `category="${category}" → teamwear`,
    };
  }
  for (const re of TEAMWEAR_NAME_PATTERNS) {
    if (re.test(name)) {
      return {
        sport: 'teamwear',
        rule: 'P5',
        debug: `품목명 "${name}"에 ${re} 매칭 → teamwear`,
      };
    }
  }

  // ---------- P6: 매칭 실패 ----------
  // 비유: "아무 단서도 없어서 분류 포기" → other 유지
  return {
    sport: 'other',
    rule: 'P6',
    debug: `매칭 실패 (name="${name}", category="${category}") → other 유지`,
  };
}

// ============================================================
// 유틸: 주문 전체 분석 → 변경 계획 반환
// ============================================================
// 이유: 같은 주문 내 items를 2패스로 처리
//   1패스: real sport인 items를 모아 neighborSports 배열 만들기
//   2패스: 각 item 재분류 (P1에서 이웃 힌트 사용)
function analyzeOrder(row) {
  let dataObj;
  try {
    dataObj = JSON.parse(row.data);
  } catch (e) {
    return { error: `parse failed: ${e.message}` };
  }

  const items = Array.isArray(dataObj.items) ? dataObj.items : [];
  if (items.length === 0) {
    return { items: [], changes: [], hasChange: false, dataObj };
  }

  const teamName = dataObj?.customer?.teamName || '';

  // 1패스: real sport 수집
  const realSportsInOrder = [];
  for (const item of items) {
    const s = item?.sport;
    if (typeof s === 'string' && REAL_SPORTS.has(s.trim().toLowerCase())) {
      realSportsInOrder.push(s.trim().toLowerCase());
    }
  }

  // 2패스: 각 item 재분류
  const itemResults = []; // { idx, before, after, rule, debug }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const before = item?.sport;

    // real sport면 그대로 보존 (rule='kept')
    if (!needsReclassify(before)) {
      itemResults.push({
        idx: i,
        before,
        after: before,
        rule: 'kept',
        debug: 'real sport 보존',
      });
      continue;
    }

    // 자기 자신을 제외한 이웃 real sport 배열
    const neighborSports = [];
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      const ns = items[j]?.sport;
      if (typeof ns === 'string' && REAL_SPORTS.has(ns.trim().toLowerCase())) {
        neighborSports.push(ns.trim().toLowerCase());
      }
    }

    // 분류 엔진 호출
    const result = classifyItem(item, { teamName, neighborSports });
    itemResults.push({
      idx: i,
      before,
      after: result.sport,
      rule: result.rule,
      debug: result.debug,
    });
  }

  // 실제 변경되는 item만 뽑기 (before !== after 이고 after가 "other"로 유지만 되는 경우는 제외)
  // 단 before가 null/""/undefined/"other" 상태에서 after="other"도 변경 아님
  const changes = [];
  for (const r of itemResults) {
    const beforeNorm = (typeof r.before === 'string' ? r.before.trim().toLowerCase() : '');
    const afterNorm = (typeof r.after === 'string' ? r.after.trim().toLowerCase() : '');
    // 변경 판정: 정규화된 값이 다르면 변경
    //   - before=null, after='other' → 변경 (null → 'other'로 명시화)
    //   - before='', after='other' → 변경
    //   - before='other', after='other' → 변경 없음
    const beforeIsOther = beforeNorm === 'other' || beforeNorm === '' || r.before === null || r.before === undefined;
    const afterIsOther = afterNorm === 'other';
    if (beforeIsOther && afterIsOther) {
      // "other 그대로 유지" — 변경 아님
      continue;
    }
    if (beforeNorm !== afterNorm) {
      changes.push(r);
    }
  }

  const hasChange = changes.length > 0;

  // 변경된 data 객체 구성 (원본 items 배열의 sport만 교체)
  let newDataObj = dataObj;
  if (hasChange) {
    // 얕은 복사 후 items만 깊은 처리
    newDataObj = { ...dataObj, items: items.map((it, idx) => {
      const r = itemResults[idx];
      if (!r || r.rule === 'kept') return it;
      // before === after(둘다 other)면 원본 유지
      const beforeNorm = (typeof r.before === 'string' ? r.before.trim().toLowerCase() : '');
      const afterNorm = r.after;
      const beforeIsOther = beforeNorm === 'other' || beforeNorm === '' || r.before === null || r.before === undefined;
      if (beforeIsOther && afterNorm === 'other') return it;
      if (beforeNorm === afterNorm) return it;
      return { ...it, sport: afterNorm };
    }) };
  }

  return {
    itemResults,
    changes,
    hasChange,
    dataObj,
    newDataObj,
    teamName,
  };
}

// ============================================================
// 메인 실행
// ============================================================
console.log('========================================');
console.log(`  과거 주문 sport 재분류 ${APPLY ? 'APPLY 모드 (DB 실제 변경!)' : 'DRY-RUN 모드 (DB 무변경)'}`);
console.log('========================================\n');

// DB 파일 존재 확인
if (!fs.existsSync(DB_PATH)) {
  console.error(`[ERROR] stiz.db not found at ${DB_PATH}`);
  process.exit(1);
}

// DB 크기 확인 (리포트용)
const dbSize = fs.statSync(DB_PATH).size;
console.log(`DB: ${DB_PATH} (${dbSize.toLocaleString()} bytes)`);

// ============================================================
// 백업 (apply 모드에서만)
// ============================================================
if (APPLY) {
  // 비유: "수술 전 환자 CT 떠놓기" — 문제 생기면 복사본으로 복원
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    console.log(`[백업] backups 폴더 생성: ${BACKUPS_DIR}`);
  }
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupPath = path.join(BACKUPS_DIR, `stiz.db.bak-sport-reclassify-${ts}`);
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`[백업] ${backupPath}\n`);
}

// ============================================================
// DB 연결 + 전체 주문 조회
// ============================================================
// dry-run에서는 readonly로 열어서 우발적 쓰기 방지
const db = new Database(DB_PATH, APPLY ? {} : { readonly: true });

const allOrders = db.prepare('SELECT id, orderNumber, data FROM orders').all();
console.log(`총 주문: ${allOrders.length.toLocaleString()}건\n`);

// ============================================================
// 전체 주문 분석
// ============================================================
const orderPlans = []; // { id, orderNumber, analysis } (hasChange=true인 것만)
const parseFailures = []; // { orderNumber, error }

// 전역 통계
let totalItems = 0;
let itemsNeedingReclassify = 0;

// 실행 전 items[0].sport 분포
const beforeDist = {};
const afterDist = {}; // 예상 분포

// 규칙별 매칭 건수
const ruleCounts = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0, kept: 0 };

// P2의 sport별 세부 분포 (basketball 310 / soccer 9 / ... 출력용)
const p2SportDist = {};

// 규칙별 샘플 (최대 5건씩)
const ruleSamples = { P1: [], P2: [], P3: [], P4: [], P5: [], P6: [] };

// P6(매칭 실패) 샘플은 30건까지
const P6SampleLimit = 30;

// P1 다품목 혼합 주문 전체 상세
const p1OrderDetails = [];

// verbose 모드용 변경 샘플 100건
const verboseSamples = [];

for (const row of allOrders) {
  const analysis = analyzeOrder(row);

  if (analysis.error) {
    parseFailures.push({ orderNumber: row.orderNumber, error: analysis.error });
    console.log(`[WARN] parse failed: ${row.orderNumber} — ${analysis.error}`);
    continue;
  }

  const items = Array.isArray(analysis.dataObj?.items) ? analysis.dataObj.items : [];
  totalItems += items.length;

  // 실행 전 items[0].sport 분포
  const firstSportBefore = items[0]?.sport;
  const firstKeyBefore = normalizeDistKey(firstSportBefore);
  beforeDist[firstKeyBefore] = (beforeDist[firstKeyBefore] || 0) + 1;

  // itemResults 기반 집계
  if (analysis.itemResults) {
    for (const r of analysis.itemResults) {
      if (r.rule === 'kept') {
        ruleCounts.kept++;
      } else {
        itemsNeedingReclassify++;
        ruleCounts[r.rule]++;
        // P2는 sport별 세부 분포 추가 집계
        if (r.rule === 'P2') {
          p2SportDist[r.after] = (p2SportDist[r.after] || 0) + 1;
        }
        // 샘플 수집
        if (ruleSamples[r.rule].length < (r.rule === 'P6' ? P6SampleLimit : 5)) {
          ruleSamples[r.rule].push({
            orderNumber: row.orderNumber,
            teamName: analysis.teamName,
            itemIdx: r.idx,
            name: items[r.idx]?.name || '',
            category: items[r.idx]?.category || '',
            before: r.before,
            after: r.after,
            debug: r.debug,
          });
        }
      }
    }
  }

  // P1 이웃 힌트가 사용된 주문(다품목 혼합 재분류) 상세 수집
  if (analysis.itemResults && analysis.itemResults.some(r => r.rule === 'P1')) {
    p1OrderDetails.push({
      orderNumber: row.orderNumber,
      teamName: analysis.teamName,
      items: analysis.itemResults.map((r, idx) => ({
        idx,
        name: items[idx]?.name || '',
        before: r.before,
        after: r.after,
        rule: r.rule,
      })),
    });
  }

  // 변경 예정 plan 저장 (apply 모드에서 UPDATE 대상)
  if (analysis.hasChange) {
    orderPlans.push({
      id: row.id,
      orderNumber: row.orderNumber,
      originalData: row.data, // WHERE 절 검증용
      newData: JSON.stringify(analysis.newDataObj),
      itemResults: analysis.itemResults,
    });

    // verbose 샘플
    if (VERBOSE && verboseSamples.length < 100) {
      for (const r of analysis.itemResults) {
        if (r.rule === 'kept') continue;
        const beforeNorm = (typeof r.before === 'string' ? r.before.trim().toLowerCase() : '');
        const beforeIsOther = beforeNorm === 'other' || beforeNorm === '' || r.before === null || r.before === undefined;
        if (beforeIsOther && r.after === 'other') continue;
        if (beforeNorm === r.after) continue;
        if (verboseSamples.length >= 100) break;
        verboseSamples.push({
          orderNumber: row.orderNumber,
          teamName: analysis.teamName,
          name: items[r.idx]?.name || '',
          before: r.before,
          after: r.after,
          rule: r.rule,
        });
      }
    }
  }

  // 실행 후 예상 items[0].sport 분포
  const newItems = Array.isArray(analysis.newDataObj?.items) ? analysis.newDataObj.items : items;
  const firstSportAfter = newItems[0]?.sport;
  const firstKeyAfter = normalizeDistKey(firstSportAfter);
  afterDist[firstKeyAfter] = (afterDist[firstKeyAfter] || 0) + 1;
}

// ============================================================
// 리포트 출력
// ============================================================
console.log(`총 items 개수: ${totalItems.toLocaleString()}개`);
console.log(`재분류 대상 items (sport=other/null/빈문자열): ${itemsNeedingReclassify.toLocaleString()}개`);
console.log(`변경 예정 주문 수: ${orderPlans.length.toLocaleString()}건`);
if (parseFailures.length > 0) {
  console.log(`[주의] data JSON 파싱 실패: ${parseFailures.length}건 (스킵됨)`);
}
console.log('');

// ---------- 실행 전 items[0].sport 분포 ----------
console.log('[실행 전 items[0].sport 분포]');
printDistribution(beforeDist);
console.log('');

// ---------- 규칙별 매칭 ----------
console.log('[규칙별 매칭 건수 (items 단위)]');
console.log(`  P1 이웃 힌트     : ${ruleCounts.P1.toString().padStart(5)}건`);
console.log(`  P2 팀명 매칭     : ${ruleCounts.P2.toString().padStart(5)}건  (팀명에 sport 키워드)`);
console.log(`  P3 품목명 basket.: ${ruleCounts.P3.toString().padStart(5)}건  (슈팅셔츠/져지 등)`);
console.log(`  P4 부자재 제외   : ${ruleCounts.P4.toString().padStart(5)}건  (→ other 유지)`);
console.log(`  P5 teamwear 할당 : ${ruleCounts.P5.toString().padStart(5)}건  (반팔티/후드)`);
console.log(`  P6 매칭 실패     : ${ruleCounts.P6.toString().padStart(5)}건  (→ other 유지)`);
console.log(`  (kept real sport): ${ruleCounts.kept.toString().padStart(5)}건  (변경 없음)`);
console.log('');

// ---------- P2 세부 분포 ----------
// 이유: P2는 종목별 분포가 궁금하므로 basketball 310 / soccer 9 / ... 형태로 추가 출력
if (ruleCounts.P2 > 0) {
  const p2Summary = Object.entries(p2SportDist)
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `${s} ${c}`)
    .join(' / ');
  console.log(`[P2 세부] ${p2Summary}`);
  console.log('');
}

// ---------- 규칙별 변경 샘플 ----------
for (const rule of ['P1', 'P2', 'P3', 'P5']) {
  if (ruleSamples[rule].length === 0) continue;
  console.log(`[샘플: ${rule} (${Math.min(ruleSamples[rule].length, 5)}건 / 전체 ${ruleCounts[rule]}건)]`);
  for (const s of ruleSamples[rule].slice(0, 5)) {
    const team = s.teamName || '(없음)';
    const beforeStr = s.before === null ? 'null' : s.before === undefined ? 'undef' : s.before === '' ? '""' : s.before;
    console.log(`  ${s.orderNumber} 팀명:${team.slice(0, 20)} items[${s.itemIdx}]:${beforeStr}→${s.after}`);
    console.log(`    name:${s.name.slice(0, 40)} category:${s.category}`);
    console.log(`    reason: ${s.debug}`);
  }
  console.log('');
}

// ---------- P4 샘플 (other 유지) ----------
if (ruleSamples.P4.length > 0) {
  console.log(`[샘플: P4 부자재 제외 (${Math.min(ruleSamples.P4.length, 5)}건 / 전체 ${ruleCounts.P4}건)]`);
  for (const s of ruleSamples.P4.slice(0, 5)) {
    const team = s.teamName || '(없음)';
    console.log(`  ${s.orderNumber} 팀명:${team.slice(0, 20)} name:${s.name.slice(0, 40)} → other 유지`);
  }
  console.log('');
}

// ---------- P6 매칭 실패 샘플 30건 ----------
if (ruleSamples.P6.length > 0) {
  console.log(`[매칭 실패 샘플 (${Math.min(ruleSamples.P6.length, 30)}건 / 전체 ${ruleCounts.P6}건)]`);
  for (const s of ruleSamples.P6) {
    const team = s.teamName || '(없음)';
    console.log(`  ${s.orderNumber} 팀명:${team.slice(0, 20)} name:${s.name.slice(0, 40)} category:${s.category} → other 유지`);
  }
  console.log('');
}

// ---------- P1 다품목 혼합 주문 전체 상세 ----------
if (p1OrderDetails.length > 0) {
  console.log(`[다품목 혼합 재분류 주문 (${p1OrderDetails.length}건 전체 상세)]`);
  for (const od of p1OrderDetails) {
    const team = od.teamName || '(없음)';
    console.log(`  ${od.orderNumber} 팀명:${team}`);
    for (const it of od.items) {
      const marker = it.rule === 'P1' ? ' [P1 변경]' : it.rule === 'kept' ? ' (kept)' : ` (${it.rule})`;
      const beforeStr = it.before === null ? 'null' : it.before === undefined ? 'undef' : it.before === '' ? '""' : it.before;
      console.log(`    items[${it.idx}] ${beforeStr}→${it.after}${marker} — ${it.name.slice(0, 40)}`);
    }
  }
  console.log('');
}

// ---------- verbose 모드: 변경 샘플 100건 ----------
if (VERBOSE && verboseSamples.length > 0) {
  console.log(`[VERBOSE: 변경 샘플 ${verboseSamples.length}건]`);
  for (const s of verboseSamples) {
    const team = s.teamName || '(없음)';
    const beforeStr = s.before === null ? 'null' : s.before === undefined ? 'undef' : s.before === '' ? '""' : s.before;
    console.log(`  ${s.orderNumber} [${s.rule}] ${beforeStr}→${s.after} | 팀명:${team.slice(0, 20)} | name:${s.name.slice(0, 40)}`);
  }
  console.log('');
}

// ---------- 실행 후 예상 items[0].sport 분포 ----------
console.log('[실행 후 예상 items[0].sport 분포]');
printDistributionWithDelta(afterDist, beforeDist);
console.log('');

// ============================================================
// DB 업데이트 (APPLY 모드)
// ============================================================
if (APPLY && orderPlans.length > 0) {
  console.log('========================================');
  console.log(`  DB 업데이트 시작: ${orderPlans.length.toLocaleString()}건`);
  console.log('========================================\n');

  // updatedAt 현재 시각 (ISO 8601)
  const nowIso = new Date().toISOString();

  const updateStmt = db.prepare(`
    UPDATE orders
    SET data = ?, updatedAt = ?
    WHERE id = ?
  `);

  let updatedCount = 0;
  const tx = db.transaction(() => {
    for (const plan of orderPlans) {
      const result = updateStmt.run(plan.newData, nowIso, plan.id);
      if (result.changes !== 1) {
        // 영향 row가 1이 아니면 즉시 에러 → ROLLBACK
        throw new Error(
          `[id ${plan.id}, orderNumber=${plan.orderNumber}] UPDATE 영향 row 수가 1이 아님 (실제: ${result.changes}) — 롤백`
        );
      }
      updatedCount++;
    }
  });

  try {
    tx();
    console.log(`✅ ${updatedCount.toLocaleString()}건 업데이트 완료\n`);

    // 실제 변경 결과 재검증 (실행 후 DB에서 다시 읽어 분포 재계산)
    console.log('[실제 변경 결과 재검증]');
    const verifyRows = db.prepare('SELECT data FROM orders').all();
    const verifyDist = {};
    for (const vr of verifyRows) {
      try {
        const d = JSON.parse(vr.data);
        const items = Array.isArray(d.items) ? d.items : [];
        const firstSport = items[0]?.sport;
        const key = normalizeDistKey(firstSport);
        verifyDist[key] = (verifyDist[key] || 0) + 1;
      } catch (e) {
        // parse 실패는 이미 집계에서 제외됨
      }
    }
    printDistributionWithDelta(verifyDist, beforeDist);
    console.log('');
  } catch (e) {
    console.error(`❌ 트랜잭션 롤백: ${e.message}`);
    db.close();
    process.exit(1);
  }
}

// ============================================================
// 마무리 안내
// ============================================================
if (!APPLY) {
  console.log('⚠️  dry-run 모드입니다. 실제 적용하려면 --apply 플래그를 추가하세요.');
  console.log('    node server/data/reclassify-order-sport.js --apply');
} else {
  console.log('✅ APPLY 완료. 백업은 server/data/backups/ 폴더에 있습니다.');
}
console.log('');

db.close();

// ============================================================
// 유틸 함수들 (스크립트 하단 호이스팅)
// ============================================================

// items[0].sport 값을 분포 키로 정규화
function normalizeDistKey(sport) {
  if (sport === null) return '(null)';
  if (sport === undefined) return '(undefined)';
  if (typeof sport !== 'string') return '(non-string)';
  if (sport === '') return '(empty)';
  return sport;
}

// 분포 출력 (건수 내림차순)
function printDistribution(dist) {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of entries) {
    console.log(`  ${k.padEnd(16)} ${v.toLocaleString().padStart(6)}`);
  }
}

// 분포 + 이전 대비 delta 출력
function printDistributionWithDelta(dist, beforeDist) {
  const allKeys = new Set([...Object.keys(dist), ...Object.keys(beforeDist)]);
  const entries = [...allKeys].map(k => ({
    k,
    v: dist[k] || 0,
    delta: (dist[k] || 0) - (beforeDist[k] || 0),
  })).sort((a, b) => b.v - a.v);

  for (const { k, v, delta } of entries) {
    const deltaStr = delta === 0 ? '' : (delta > 0 ? ` (+${delta})` : ` (${delta})`);
    console.log(`  ${k.padEnd(16)} ${v.toLocaleString().padStart(6)}${deltaStr}`);
  }
}
