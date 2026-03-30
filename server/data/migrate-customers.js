/**
 * 고객 마이그레이션 스크립트
 * orders.json에서 고객 정보를 추출하여 customers.json을 생성한다.
 *
 * 동작 원리:
 * - 주문 데이터의 customer.teamName을 기준으로 고객을 그룹핑한다.
 *   (같은 팀명 = 같은 고객으로 판단)
 * - teamName이 없으면 customer.name + customer.phone 조합으로 구분한다.
 * - 각 고객에게 고유 customerId를 부여하고,
 *   orders.json의 해당 주문에도 customerId를 연결한다.
 *
 * 비유: 주문 장부에서 고객 명부를 따로 만드는 것.
 *       "이 주문은 어느 고객 것인지" 연결고리(customerId)를 달아준다.
 *
 * 실행: node server/data/migrate-customers.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 데이터 파일 경로
const ORDERS_PATH = path.join(__dirname, 'orders.json');
const CUSTOMERS_PATH = path.join(__dirname, 'customers.json');

// 주문 데이터 읽기
const orders = JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf-8'));
console.log(`[마이그레이션] 주문 ${orders.length}건 로드 완료`);

// 고객 그룹핑을 위한 맵 (키 → 고객 데이터)
// 키 = teamName이 있으면 teamName, 없으면 "name|phone"
const customerMap = new Map();

orders.forEach(order => {
    const c = order.customer || {};

    // 고객 식별 키 생성
    // teamName이 가장 신뢰도 높은 식별자 (같은 팀 = 같은 고객)
    const key = c.teamName
        ? c.teamName.trim()
        : `${(c.name || '').trim()}|${(c.phone || '').trim()}`;

    // 빈 키는 건너뛰기 (고객 정보 없는 주문)
    if (!key || key === '|') return;

    if (!customerMap.has(key)) {
        // 새 고객 생성
        customerMap.set(key, {
            id: Date.now() + Math.floor(Math.random() * 1000) + customerMap.size,
            name: c.name || '',
            phone: c.phone || '',
            email: c.email || '',
            teamName: c.teamName || '',
            dealType: c.dealType || '개인',
            // 주문 통계 (마이그레이션 시 계산)
            orderCount: 0,
            totalSpent: 0,
            // 연결된 주문 ID 목록
            orderIds: [],
            // 메모 (관리자가 나중에 추가)
            memo: '',
            createdAt: order.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    // 기존 고객에 주문 정보 누적
    const customer = customerMap.get(key);
    customer.orderCount++;
    customer.totalSpent += order.payment?.totalAmount || order.total || 0;
    customer.orderIds.push(order.id);

    // 더 최근 주문의 고객 정보로 업데이트 (최신 연락처가 정확할 가능성 높음)
    if (c.name) customer.name = c.name;
    if (c.phone) customer.phone = c.phone;
    if (c.email) customer.email = c.email;
    if (c.dealType) customer.dealType = c.dealType;
});

// Map → 배열로 변환
const customers = Array.from(customerMap.values());

// customers.json 저장
fs.writeFileSync(CUSTOMERS_PATH, JSON.stringify(customers, null, 2), 'utf-8');

// orders.json에 customerId 연결
let linkedCount = 0;
orders.forEach(order => {
    const c = order.customer || {};
    const key = c.teamName
        ? c.teamName.trim()
        : `${(c.name || '').trim()}|${(c.phone || '').trim()}`;

    if (key && key !== '|' && customerMap.has(key)) {
        order.customerId = customerMap.get(key).id;
        linkedCount++;
    }
});

// 업데이트된 orders.json 저장
fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2), 'utf-8');

// 결과 보고
console.log('\n========== 마이그레이션 결과 ==========');
console.log(`총 주문: ${orders.length}건`);
console.log(`생성된 고객: ${customers.length}명`);
console.log(`주문-고객 연결: ${linkedCount}건`);
console.log(`미연결 주문: ${orders.length - linkedCount}건`);

// 거래유형별 통계
const dealTypeCounts = {};
customers.forEach(c => {
    const dt = c.dealType || '미분류';
    dealTypeCounts[dt] = (dealTypeCounts[dt] || 0) + 1;
});
console.log(`\n거래유형별:`);
Object.entries(dealTypeCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}명`);
});

// 상위 5 고객 (주문 수 기준)
const topCustomers = [...customers].sort((a, b) => b.orderCount - a.orderCount).slice(0, 5);
console.log(`\n주문 상위 5 고객:`);
topCustomers.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.teamName || c.name} - ${c.orderCount}건, ₩${c.totalSpent.toLocaleString()}`);
});

console.log(`\n파일 저장 완료:`);
console.log(`  - ${CUSTOMERS_PATH}`);
console.log(`  - ${ORDERS_PATH} (customerId 추가)`);
console.log('======================================\n');
