/**
 * 같은 팀 + 같은 날짜 + 같은 고객의 여러 주문을 1건으로 병합하는 스크립트
 *
 * 비유: 같은 식당에서 같은 날 주문한 7개 영수증을 1장으로 합치는 것.
 *       각 영수증의 메뉴(items)는 합친 영수증에 전부 들어가고, 총액도 합산.
 *
 * 병합 기준:
 *   - groupId가 같고 null이 아닌 주문들 → 하나로 병합
 *   - groupId가 없으면: teamName + createdAt(YYYY-MM-DD) + customer.name이 모두 같은 주문들
 *
 * 사용법: node dev/merge-group-orders.cjs
 */

const fs = require('fs');
const path = require('path');

// 파일 경로 설정
const ORDERS_PATH = path.join(__dirname, '..', 'server', 'data', 'orders.json');
const BACKUP_PATH = path.join(__dirname, '..', 'server', 'data', 'orders.json.pre-merge');

// 상태 우선순위 (숫자가 작을수록 초기 단계 = 진행이 덜 된 것)
const STATUS_PRIORITY = {
  'design_requested': 1,
  'draft_done': 2,
  'revision': 3,
  'design_confirmed': 4,
  'payment_pending': 5,
  'payment_done': 6,
  'grading': 7,
  'line_work': 8,
  'in_production': 9,
  'production_done': 10,
  'released': 11,
  'shipped': 12,
  'delivered': 13,
  'hold': 0,       // 보류는 가장 초기
  'cancelled': -1,  // 취소는 가장 초기
};

/**
 * 날짜 문자열에서 YYYY-MM-DD 부분만 추출
 * "2026-04-01T00:00:00.000Z" → "2026-04-01"
 */
function extractDate(dateStr) {
  if (!dateStr) return '';
  return dateStr.substring(0, 10);
}

/**
 * 그룹 키 생성: teamName + 날짜(YYYY-MM-DD) + 고객명
 * 이 3개가 모두 같은 주문들을 같은 그룹으로 묶는다
 */
function makeGroupKey(order) {
  // groupId가 있으면 groupId를 키로 사용 (최우선)
  if (order.groupId) {
    return `gid:${order.groupId}`;
  }
  // 없으면 teamName + 날짜 + 고객명 조합
  const team = order.customer?.teamName || '';
  const date = extractDate(order.createdAt);
  const name = order.customer?.name || '';
  return `${team}||${date}||${name}`;
}

/**
 * 두 상태 중 더 초기 단계(진행이 덜 된) 상태를 반환
 */
function getEarlierStatus(statusA, statusB) {
  const prioA = STATUS_PRIORITY[statusA] ?? 99;
  const prioB = STATUS_PRIORITY[statusB] ?? 99;
  return prioA <= prioB ? statusA : statusB;
}

// ============================================================
// 메인 로직
// ============================================================

console.log('=== 주문 병합 스크립트 시작 ===\n');

// 1. orders.json 읽기
const rawData = fs.readFileSync(ORDERS_PATH, 'utf-8');
const orders = JSON.parse(rawData);
console.log(`병합 전 전체 건수: ${orders.length}건`);

// 2. 백업 생성
fs.writeFileSync(BACKUP_PATH, rawData, 'utf-8');
console.log(`백업 완료: ${BACKUP_PATH}\n`);

// 3. 그룹핑: 같은 키를 가진 주문들끼리 묶기
const groups = new Map();
for (const order of orders) {
  const key = makeGroupKey(order);
  if (!groups.has(key)) {
    groups.set(key, []);
  }
  groups.get(key).push(order);
}

console.log(`그룹 수: ${groups.size}개`);

// 4. 병합 실행
const mergedOrders = [];
let mergedGroupCount = 0;   // 실제로 병합된 그룹 수
let removedCount = 0;       // 삭제된 주문 수

for (const [key, group] of groups) {
  // 1건짜리 그룹은 그대로 유지 (건드리지 않음)
  if (group.length === 1) {
    mergedOrders.push(group[0]);
    continue;
  }

  // 이미 items가 2개 이상인 주문이 그룹에 포함되어 있으면 건드리지 않음
  const alreadyMerged = group.some(o => o.items && o.items.length >= 2);
  if (alreadyMerged) {
    console.log(`  [건너뜀] "${key}" - 이미 병합된 주문 포함 (${group.length}건)`);
    mergedOrders.push(...group);
    continue;
  }

  // orderNumber 기준으로 정렬 → 가장 작은 것이 대표 주문
  group.sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''));

  const representative = group[0]; // 대표 주문 (깊은 복사하지 않고 직접 수정)

  // items 배열 합치기: 모든 주문의 items[0]을 대표 주문에 추가
  const allItems = [];
  let totalAmount = 0;
  let totalQuantity = 0;
  let earliestStatus = representative.status;

  for (const order of group) {
    // 각 주문의 첫 번째 아이템을 가져옴
    if (order.items && order.items[0]) {
      allItems.push(order.items[0]);
    }
    // 금액 합산
    totalAmount += (order.payment?.totalAmount || 0);
    totalQuantity += (order.payment?.quantity || 0);
    // 가장 초기 단계의 상태 선택
    earliestStatus = getEarlierStatus(earliestStatus, order.status);
  }

  // 대표 주문에 병합 결과 반영
  representative.items = allItems;
  representative.payment.totalAmount = totalAmount;
  representative.payment.quantity = totalQuantity;
  representative.status = earliestStatus;

  // 병합된 주문임을 표시 (나중에 추적용)
  representative._mergedFrom = group.map(o => o.orderNumber);
  representative._mergedCount = group.length;

  mergedOrders.push(representative);
  mergedGroupCount++;
  removedCount += group.length - 1;

  // 병합 내역 출력
  console.log(`  [병합] "${key}"`);
  console.log(`         ${group.length}건 → 1건 (대표: ${representative.orderNumber})`);
  console.log(`         items: ${allItems.length}개, 총액: ${totalAmount.toLocaleString()}원`);
  console.log(`         상태: ${earliestStatus}`);
  const details = group.map(o => `    - ${o.orderNumber}: ${o.items?.[0]?.name || '?'} (${o.detail || '-'})`);
  details.forEach(d => console.log(d));
  console.log('');
}

// 5. 결과 저장
fs.writeFileSync(ORDERS_PATH, JSON.stringify(mergedOrders, null, 2), 'utf-8');

// 6. 결과 요약
console.log('=== 병합 결과 ===');
console.log(`병합 전: ${orders.length}건`);
console.log(`병합된 그룹: ${mergedGroupCount}개`);
console.log(`삭제된 주문: ${removedCount}건`);
console.log(`병합 후: ${mergedOrders.length}건`);
console.log(`\n변화: ${orders.length}건 → ${mergedOrders.length}건 (${orders.length - mergedOrders.length}건 감소)`);
console.log('\n완료! orders.json이 업데이트되었습니다.');
