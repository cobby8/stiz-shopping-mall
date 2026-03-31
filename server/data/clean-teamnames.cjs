/**
 * 팀명 정리 + 병합 스크립트
 *
 * 실행: node server/data/clean-teamnames.cjs
 *
 * 2단계로 동작:
 * 1. 각 고객의 teamName에서 순수 팀명만 추출 (cleanName)
 * 2. cleanName이 같은 고객들을 하나로 병합 + orders.json customerId 업데이트
 */

const fs = require('fs');
const path = require('path');

// === 데이터 파일 경로 ===
const DATA_DIR = path.join(__dirname);
const CUSTOMERS_PATH = path.join(DATA_DIR, 'customers.json');
const ORDERS_PATH = path.join(DATA_DIR, 'orders.json');

// === 수동 오버라이드: 자동 규칙으로 부족한 팀들의 최종 이름 매핑 ===
const MANUAL_OVERRIDES = {
  // 가스공사 관련 (모두 "한국가스공사"로)
  '가스공사': '한국가스공사',
  '한국가스공사': '한국가스공사',
  '모빌': '한국가스공사',  // 모빌은 가스공사 마스코트
  '가스공사 레플리카 유니폼': '한국가스공사',  // 온라인/대구매장 판매용

  'LG SAKERS 운정아카데미': 'LG세이커스 운정아카데미',

  // 스티즈 내부
  '스티즈 농구교실': '스티즈농구교실',
  '스티즈농구교실': '스티즈농구교실',

  // 퍼시픽 — 지점별로 분리 유지하되 이름 정규화
  '퍼시픽 메인': '퍼시픽 메인',
  '퍼시픽 강서점': '퍼시픽 강서점',
  '퍼시픽': '퍼시픽 메인',  // 지점 없으면 메인으로

  // 점프볼
  '점프볼': '점프볼',
};

/**
 * 팀명에서 순수 팀명만 추출하는 함수
 *
 * 처리 순서가 중요하다:
 * 1. 연도 제거 (앞/뒤)
 * 2. 주문유형 접두사 제거
 * 3. 이벤트 접두사 제거
 * 4. 괄호 안 색상/디자인/구성 정보 제거
 * 5. 구성 정보 제거 (상의만, 하의만 등)
 * 6. 색상 접미사 제거  <-- 품목보다 먼저!
 * 7. 소재/기타 설명 제거
 * 8. 품목/의류 접미사 제거
 * 9. 제품 설명 제거 (시티에디션 등)
 * 10. 스포츠 종목 제거
 * 11. "신규", "대표팀" 제거
 * 12. 최종 정리
 */
function cleanTeamName(rawName) {
  let name = rawName.trim();

  // 1. 연도 제거: 앞쪽 "2025 ", "2026 " + 뒤쪽 " 2026"
  name = name.replace(/^20\d{2}\s+/, '');
  name = name.replace(/\s+20\d{2}$/, '');

  // 2. 주문유형 접두사 제거 (가장 긴 것부터 매칭)
  const prefixes = [
    '선수지급용', '구단사입', '구단 사입', '개인커스텀',
    '온라인 판매용', '대구매장 판매용', '사입',
    '이벤트사 사입', '마포구농구협회장배'
  ];
  prefixes.sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length).trim();
      break;
    }
  }

  // 3. 이벤트 접두사 제거
  name = name.replace(/서울대배\s*(준우승|우승)\s*/g, '');

  // 4. 괄호 안 내용 제거 — 색상/디자인/구성/상태 관련만 제거
  //    팀명의 일부인 괄호는 유지: (KUBA), (남악점), (서울), (대전), (문승배팸), (FBI)
  const bracketPatterns = [
    /\(검[흰정]\)/g,
    /\(카툰\)/g, /\(DYG\)/g,
    /\(메인\s*\w+\)/g,
    /\(핑크[^)]*\)/g,
    /\(화이트[^)]*\)/g, /\(검정[^)]*\)/g,
    /\(초록[^)]*\)/g,
    /\(배송지연\)/g,
    /\(블루림\)/g,
    /\(WHITE\)/gi, /\(BLACK\)/gi, /\(YELLOW\)/gi,
    /\(MINT\)/gi, /\(RED\)/gi,
    /\(U넥->V넥 변경\)/g,
    /\(골키퍼\)/g,
    /\(연습복\)/g,
    /\(양면 상의\)/g, /\(양면 상하의\)/g,
    /\(농구\s*[가-힣]*\)/g,  // (농구 남색) 등
    /\(개인커스텀[^)]*\)/g,   // (개인커스텀 배송지연) 등
    /\(취미반\s*신규\)/g,      // (취미반 신규)
  ];
  for (const pat of bracketPatterns) {
    name = name.replace(pat, '');
  }

  // 5. 구성 정보 제거: "상의만", "하의만", "상의2 하의2" 등
  name = name.replace(/\s*\/\s*상하의\s*개별\s*주문$/i, '');
  name = name.replace(/\s+상하의\s*개별[^]*?$/i, '');
  // "상의만 1벌", "상의만", "하의만 2" 등을 한번에 처리
  name = name.replace(/\s+(상의만|하의만)(\s*\d+벌?)?$/i, '');
  name = name.replace(/\s+상의\s*\d+\s*하의\s*\d+$/i, '');
  name = name.replace(/\s+상의\s*\d+$/i, '');
  name = name.replace(/\s+하의\s*\d+$/i, '');
  name = name.replace(/\s+\d+벌$/i, '');
  name = name.replace(/\s+\d+세트$/i, '');
  name = name.replace(/\s+(단면|양면)\s+(상의|하의)\s*\d*$/i, '');
  name = name.replace(/\s+상의\s+한\s+벌$/i, '');
  name = name.replace(/\s+바지만$/i, '');
  name = name.replace(/\s+검정하의만$/i, '');
  name = name.replace(/\s+흰색상의만$/i, '');
  name = name.replace(/\s+개별주문$/i, '');

  // 6. 색상 접미사 제거 (품목 제거보다 먼저!)
  const colorSuffixes = [
    '남색', '검정', '핑크', '네이비', '흰색', '블랙에디션',
    'BLUE', 'BLACK', 'YELLOW', 'SKYBLUE', 'WHITE', 'RED', 'MINT',
  ];
  colorSuffixes.sort((a, b) => b.length - a.length);
  for (const color of colorSuffixes) {
    if (name.endsWith(color)) {
      name = name.slice(0, -color.length).trim();
      break;
    }
  }

  // 7. 소재/기타 설명 제거
  name = name.replace(/\s+쿨메쉬$/i, '');

  // 8~9. 제품 설명 + 품목 제거를 반복 적용
  //   "가스공사 어센틱 유니폼 마킹 없는 버전" 같이 제품설명+품목이 여러 겹인 경우를 처리
  const productDescs = [
    '시티에디션', '대구레트로', '페가수스', '어센틱',
    '신입사원', '마킹 없는 버전',
    '양우혁 그래픽', '신주영 그래픽', '벨란겔 그래픽', '정성우 그래픽',
    '홈&어웨이', '홈 레플리카', '어웨이 레플리카', '홈 어센틱', '어웨이 어센틱',
    '홈 어센틱 하의', '핑크',
    'KBL',
    '야구저지',
  ];
  productDescs.sort((a, b) => b.length - a.length);

  const productSuffixes = [
    '레플리카 유니폼', // "가스공사 레플리카 유니폼" 케이스
    '유니폼', '반팔티', '후드티', '후드집업', '긴팔슈팅셔츠', '긴팔슈팅저지',
    '긴팔 슈팅셔츠', '긴팔 슈팅저지',  // 공백 포함 버전
    '반팔슈팅저지', '반팔전사티', '슈팅셔츠', '슈팅저지', '슈팅후디 반팔',
    '슈팅후디 슬리브리스', '전사티셔츠', '연습복', '웜업SET', '웜업 세트',
    '웜업세트', '후드 셋업', '후드짚업 셋업', '트랙탑자켓', '하키티',
    '레플리카', '맨투맨', '티셔츠', '이너웨어', '반팔', '긴팔',
    '후디웜업', '일상복 하의', '반팔(슈팅복)',
    '스파바',  // "과기대 SPABA 스파바" -> "과기대 SPABA"
  ];
  productSuffixes.sort((a, b) => b.length - a.length);

  // 최대 3회 반복 (중첩된 설명/품목 제거)
  for (let round = 0; round < 3; round++) {
    let changed = false;

    // 제품 설명 제거 (indexOf 방식 — 중간 위치에서도 매칭)
    for (const desc of productDescs) {
      const idx = name.indexOf(desc);
      if (idx > 0) {
        name = name.slice(0, idx).trim();
        changed = true;
        break;
      }
    }

    // 품목 접미사 제거 (endsWith 방식)
    for (const suffix of productSuffixes) {
      if (name.endsWith(suffix)) {
        name = name.slice(0, -suffix.length).trim();
        changed = true;
        break;
      }
    }

    if (!changed) break;
  }

  // 10. 스포츠 종목 접미사 제거
  name = name.replace(/\s+신규\s+(농구|축구)$/i, '');
  name = name.replace(/\s+(농구|축구)$/i, '');

  // 11. "신규", "대표팀" 제거
  name = name.replace(/\s*신규\s*$/i, '');
  name = name.replace(/\s*대표팀\s*$/i, '');

  // 12. 최종 정리: 양쪽 공백, 연속 공백
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

/**
 * 특수 팀명 규칙 적용
 * - 구일중: 남자/여자 -> "구일중" 통합
 * - 서울대 농구부: 공백 정규화
 * - 퍼시픽 산하 별도 팀: FC라티아스, 슈퍼몽키즈 분리 유지
 * - TEAM K(남악점): 초등부/중등부 통합
 * - 무야호: 괄호 제거 후 통합
 * - 스티즈농구교실: 지점별 분리 유지
 */
function applySpecialRules(cleanName) {
  // 구일중: 남자 농구, 여자농구 모두 "구일중"으로
  if (cleanName.startsWith('구일중')) return '구일중';

  // 서울대 농구부 / 서울대농구부 -> "서울대 농구부"
  if (cleanName === '서울대농구부' || cleanName === '서울대 농구부') return '서울대 농구부';

  // 퍼시픽(FC라티아스) / 퍼시픽(슈퍼몽키즈) — 별도 팀 유지
  if (cleanName.includes('FC라티아스')) return 'FC라티아스';
  if (cleanName.includes('슈퍼몽키즈')) return '슈퍼몽키즈';

  // TEAM K(남악점) 초등부/중등부 -> 같은 고객
  if (cleanName.startsWith('TEAM K(남악점)')) return 'TEAM K(남악점)';

  // 무야호 — 괄호 제거 후 남은 것 통합
  if (cleanName.startsWith('무야호')) return '무야호';

  // 스티즈농구교실 지점별 분리 유지
  if (cleanName.startsWith('스티즈농구교실') || cleanName === '스티즈 농구교실') {
    const match = cleanName.match(/(다산점|강남점|마포점|평내호평점)/);
    if (match) return '스티즈농구교실 ' + match[1];
    return '스티즈농구교실';
  }

  return cleanName;
}

/**
 * 메인 실행 함수
 */
function main() {
  console.log('=== 팀명 정리 + 병합 스크립트 시작 ===\n');

  // --- 데이터 로드 ---
  const customers = JSON.parse(fs.readFileSync(CUSTOMERS_PATH, 'utf-8'));
  const orders = JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf-8'));

  console.log(`병합 전: 고객 ${customers.length}명, 주문 ${orders.length}건\n`);

  // --- 백업 생성 (최초 1회만, 이미 있으면 건너뛰기) ---
  if (!fs.existsSync(CUSTOMERS_PATH + '.bak')) {
    fs.writeFileSync(CUSTOMERS_PATH + '.bak', JSON.stringify(customers, null, 2));
    fs.writeFileSync(ORDERS_PATH + '.bak', JSON.stringify(orders, null, 2));
    console.log('백업 생성: customers.json.bak, orders.json.bak\n');
  } else {
    console.log('백업 이미 존재 (덮어쓰지 않음)\n');
  }

  // --- 0단계: 중복 ID 수정 ---
  // 마이그레이션에서 같은 ID가 여러 고객에 할당된 경우가 있음
  // 중복 ID를 가진 고객에게 고유 ID를 부여
  const seenIds = new Set();
  let fixedDupeIds = 0;
  for (const c of customers) {
    if (seenIds.has(c.id)) {
      const oldId = c.id;
      const newId = Date.now() + Math.floor(Math.random() * 100000) + fixedDupeIds;
      c.id = newId;
      // 이 고객에 연결된 주문의 customerId도 업데이트
      for (const order of orders) {
        if (order.customerId === oldId) {
          // orderIds로 매칭하여 올바른 고객의 주문만 업데이트
          if (c.orderIds && c.orderIds.includes(order.id)) {
            order.customerId = newId;
          }
        }
      }
      fixedDupeIds++;
    }
    seenIds.add(c.id);
  }
  if (fixedDupeIds > 0) {
    console.log(`중복 ID 수정: ${fixedDupeIds}건\n`);
  }

  // --- 1단계: 각 고객의 cleanName 추출 ---
  // 고객 객체에 직접 _originalName과 _cleanName을 붙여서 사용 (Map ID 충돌 방지)
  for (const c of customers) {
    c._originalName = c.teamName;

    let clean = cleanTeamName(c.teamName);
    clean = applySpecialRules(clean);

    // 수동 오버라이드 적용
    if (MANUAL_OVERRIDES[clean]) {
      clean = MANUAL_OVERRIDES[clean];
    }

    c._cleanName = clean;
  }

  // --- 디버그: 변경된 팀명만 출력 ---
  console.log('--- cleanName 매핑 (변경된 것만) ---');
  for (const c of customers) {
    if (c._originalName !== c._cleanName) {
      console.log(`  "${c._originalName}" -> "${c._cleanName}"`);
    }
  }
  console.log('');

  // --- 2단계: cleanName이 같은 고객들을 그룹으로 묶기 ---
  const groups = new Map(); // cleanName -> [customer, ...]

  for (const c of customers) {
    if (!groups.has(c._cleanName)) {
      groups.set(c._cleanName, []);
    }
    groups.get(c._cleanName).push(c);
  }

  // 병합이 필요한 그룹만 필터 (2명 이상)
  const mergeGroups = [...groups.entries()].filter(([, members]) => members.length > 1);

  console.log(`--- 병합 대상 그룹: ${mergeGroups.length}개 ---`);
  for (const [cleanName, members] of mergeGroups.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  "${cleanName}" (${members.length}건):`);
    for (const m of members) {
      console.log(`    - [${m.id}] "${m._originalName}" (주문 ${m.orderCount}건, ${m.name})`);
    }
  }
  console.log('');

  // --- 3단계: 병합 실행 ---
  const idRemap = new Map(); // oldId -> newId (대표 고객 ID)
  const removedCustomers = new Set(); // 제거할 고객 객체 참조

  for (const [cleanName, members] of groups.entries()) {
    if (members.length === 1) {
      // 단일 고객이라도 teamName을 cleanName으로 업데이트
      members[0].teamName = cleanName;
      continue;
    }

    // 대표 고객 선택: 주문수가 가장 많은 것, 같으면 가장 최근 updatedAt
    members.sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    const keeper = members[0]; // 대표 고객
    const absorbed = members.slice(1); // 흡수될 고객들

    // 대표 고객의 팀명을 정리된 이름으로 변경
    keeper.teamName = cleanName;

    for (const abs of absorbed) {
      // 연락처가 비어있으면 흡수 고객에서 가져오기
      if (!keeper.phone && abs.phone) keeper.phone = abs.phone;
      if (!keeper.email && abs.email) keeper.email = abs.email;

      // 주문 수/매출 합산
      keeper.orderCount += abs.orderCount;
      keeper.totalSpent += abs.totalSpent;

      // 주문 ID 합치기 (중복 제거)
      keeper.orderIds = [...new Set([...keeper.orderIds, ...abs.orderIds])];

      // 메모 합치기 (빈 메모 제외)
      if (abs.memo && abs.memo.trim()) {
        keeper.memo = keeper.memo
          ? keeper.memo + ' | ' + abs.memo.trim()
          : abs.memo.trim();
      }

      // 가장 최근 날짜로 updatedAt 갱신
      if (new Date(abs.updatedAt) > new Date(keeper.updatedAt)) {
        keeper.updatedAt = abs.updatedAt;
      }

      // ID 매핑 기록 (흡수된 고객의 ID -> 대표 고객 ID)
      idRemap.set(abs.id, keeper.id);
      removedCustomers.add(abs);
    }
  }

  // --- 4단계: 고객 목록에서 흡수된 고객 제거 ---
  // 객체 참조로 비교 (ID 중복 문제 방지)
  const newCustomers = customers.filter(c => !removedCustomers.has(c));

  // --- 5단계: orders.json의 customerId 업데이트 ---
  let remappedOrders = 0;
  for (const order of orders) {
    if (order.customerId && idRemap.has(order.customerId)) {
      order.customerId = idRemap.get(order.customerId);
      remappedOrders++;
    }
  }

  // --- 6단계: 임시 속성 제거 후 저장 ---
  for (const c of newCustomers) {
    delete c._originalName;
    delete c._cleanName;
  }

  fs.writeFileSync(CUSTOMERS_PATH, JSON.stringify(newCustomers, null, 2));
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2));

  // --- 무결성 검증 ---
  const savedCustomerIds = new Set(newCustomers.map(c => c.id));
  const orphanOrders = orders.filter(o => o.customerId && !savedCustomerIds.has(o.customerId));
  if (orphanOrders.length > 0) {
    console.log(`[경고] 고아 주문 ${orphanOrders.length}건 (고객 없는 주문)`);
  }

  // --- 결과 출력 ---
  console.log('=== 병합 결과 ===');
  console.log(`병합 전: ${customers.length}명 고객`);
  console.log(`병합 후: ${newCustomers.length}명 고객`);
  console.log(`제거된 중복: ${removedCustomers.size}건`);
  console.log(`주문 customerId 재매핑: ${remappedOrders}건`);
  console.log(`고아 주문: ${orphanOrders.length}건`);
  console.log('');

  // 주요 병합 그룹 상세 (건수 많은 순)
  console.log('--- 주요 병합 그룹 ---');
  for (const [cleanName, members] of mergeGroups.sort((a, b) => b[1].length - a[1].length)) {
    const origList = members.map(m => `"${m._originalName}"`).join(', ');
    console.log(`  ${members.length}건 -> "${cleanName}": ${origList}`);
  }

  console.log('\n=== 완료 ===');
}

main();
