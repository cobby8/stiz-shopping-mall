/**
 * JSON → SQLite 마이그레이션 스크립트
 * E-1 SQLite 마이그레이션 3단계
 *
 * 비유: 엑셀 파일(JSON) 6개의 데이터를 진짜 데이터베이스(SQLite)로 옮기는 이사 작업
 * - 기존 JSON 파일은 삭제하지 않고 보존 (문제 시 롤백 가능)
 * - 트랜잭션으로 일괄 처리 (중간에 실패하면 전부 취소)
 *
 * 사용법: node server/migrate-to-sqlite.js
 * 선행 조건: node server/init-db.js 로 테이블이 이미 생성되어 있어야 함
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'stiz.db');
const DATA_DIR = path.join(__dirname, 'data');

// --- DB 연결 ---
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// --- 유틸 함수: JSON 파일 읽기 ---
function readJsonFile(filename) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.log(`  [스킵] ${filename} — 파일이 없음`);
        return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    console.log(`  [읽기] ${filename} — ${data.length}건`);
    return data;
}

// ========================================
// 1) orders 마이그레이션
// 하이브리드 구조: 인덱스 컬럼(검색용) + data(전체 JSON blob)
// ========================================
function migrateOrders() {
    const orders = readJsonFile('orders.json');
    if (!orders) return 0;

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO orders (id, orderNumber, status, manager, customerId, createdAt, orderReceiptDate, updatedAt, data)
        VALUES (@id, @orderNumber, @status, @manager, @customerId, @createdAt, @orderReceiptDate, @updatedAt, @data)
    `);

    for (const record of orders) {
        stmt.run({
            id: record.id,
            orderNumber: record.orderNumber || null,
            status: record.status || 'design_requested',
            manager: record.manager || '',
            customerId: record.customerId || null,
            createdAt: record.createdAt || null,
            orderReceiptDate: record.orderReceiptDate || null,
            updatedAt: record.updatedAt || null,
            data: JSON.stringify(record),  // 전체 객체를 JSON 문자열로 저장
        });
    }

    return orders.length;
}

// ========================================
// 2) customers 마이그레이션
// 하이브리드 구조: 인덱스 컬럼 + data(전체 JSON blob)
// ========================================
function migrateCustomers() {
    const customers = readJsonFile('customers.json');
    if (!customers) return 0;

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO customers (id, name, phone, email, teamName, dealType, orderCount, totalSpent, createdAt, updatedAt, data)
        VALUES (@id, @name, @phone, @email, @teamName, @dealType, @orderCount, @totalSpent, @createdAt, @updatedAt, @data)
    `);

    for (const record of customers) {
        stmt.run({
            id: record.id,
            name: record.name || '',
            phone: record.phone || '',
            email: record.email || '',
            teamName: record.teamName || '',
            dealType: record.dealType || '',
            orderCount: record.orderCount || 0,
            totalSpent: record.totalSpent || 0,
            createdAt: record.createdAt || null,
            updatedAt: record.updatedAt || null,
            data: JSON.stringify(record),
        });
    }

    return customers.length;
}

// ========================================
// 3) order_history 마이그레이션
// 플랫 구조: 컬럼이 곧 데이터 (JSON blob 없음)
// ========================================
function migrateOrderHistory() {
    const history = readJsonFile('order-history.json');
    if (!history) return 0;

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO order_history (id, orderId, orderNumber, fromStatus, toStatus, changedBy, memo, createdAt)
        VALUES (@id, @orderId, @orderNumber, @fromStatus, @toStatus, @changedBy, @memo, @createdAt)
    `);

    for (const record of history) {
        stmt.run({
            id: record.id,
            orderId: record.orderId || null,
            orderNumber: record.orderNumber || null,
            fromStatus: record.fromStatus || null,
            toStatus: record.toStatus || null,
            changedBy: record.changedBy || null,
            memo: record.memo || '',
            createdAt: record.createdAt || null,
        });
    }

    return history.length;
}

// ========================================
// 4) activity_log 마이그레이션
// 플랫 구조: details만 JSON 문자열로 저장
// ========================================
function migrateActivityLog() {
    const logs = readJsonFile('activity-log.json');
    if (!logs) return 0;

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO activity_log (id, action, details, userId, userName, timestamp)
        VALUES (@id, @action, @details, @userId, @userName, @timestamp)
    `);

    for (const record of logs) {
        stmt.run({
            id: record.id,
            action: record.action || null,
            // details가 객체면 JSON 문자열로 변환, 이미 문자열이면 그대로
            details: typeof record.details === 'object' ? JSON.stringify(record.details) : (record.details || null),
            userId: record.userId || null,
            userName: record.userName || null,
            timestamp: record.timestamp || null,
        });
    }

    return logs.length;
}

// ========================================
// 5) sales_goals 마이그레이션
// id가 연도 문자열 (예: "2026"), monthlyGoals는 JSON 문자열
// ========================================
function migrateSalesGoals() {
    const goals = readJsonFile('sales-goals.json');
    if (!goals) return 0;

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO sales_goals (id, year, annualGoal, monthlyGoals, updatedAt)
        VALUES (@id, @year, @annualGoal, @monthlyGoals, @updatedAt)
    `);

    for (const record of goals) {
        stmt.run({
            id: record.id,
            year: record.year || null,
            annualGoal: record.annualGoal || 0,
            // monthlyGoals가 객체면 JSON 문자열로 변환
            monthlyGoals: typeof record.monthlyGoals === 'object' ? JSON.stringify(record.monthlyGoals) : (record.monthlyGoals || '{}'),
            updatedAt: record.updatedAt || null,
        });
    }

    return goals.length;
}

// ========================================
// 6) users 마이그레이션
// 플랫 구조
// ========================================
function migrateUsers() {
    const users = readJsonFile('users.json');
    if (!users) return 0;

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO users (id, name, email, password, role, joinedAt)
        VALUES (@id, @name, @email, @password, @role, @joinedAt)
    `);

    for (const record of users) {
        stmt.run({
            id: record.id,
            name: record.name || null,
            email: record.email || null,
            password: record.password || null,
            role: record.role || 'customer',
            joinedAt: record.joinedAt || null,
        });
    }

    return users.length;
}

// ========================================
// 메인 실행: 전체를 하나의 트랜잭션으로 묶기
// 비유: 이사할 때 짐을 하나씩 옮기다가 실패하면 전부 원래 위치로 돌리는 것
// ========================================
console.log('=== JSON → SQLite 마이그레이션 시작 ===\n');

const startTime = Date.now();

// 트랜잭션으로 묶어서 성능 + 원자성 보장
const migrate = db.transaction(() => {
    // 기존 데이터가 있으면 삭제 (재실행 안전성)
    console.log('[정리] 기존 테이블 데이터 삭제...');
    db.prepare('DELETE FROM orders').run();
    db.prepare('DELETE FROM customers').run();
    db.prepare('DELETE FROM order_history').run();
    db.prepare('DELETE FROM activity_log').run();
    db.prepare('DELETE FROM sales_goals').run();
    db.prepare('DELETE FROM users').run();
    console.log('');

    // 각 컬렉션별 마이그레이션 실행
    console.log('[1/6] orders 마이그레이션');
    const ordersCount = migrateOrders();
    console.log(`  -> ${ordersCount}건 완료\n`);

    console.log('[2/6] customers 마이그레이션');
    const customersCount = migrateCustomers();
    console.log(`  -> ${customersCount}건 완료\n`);

    console.log('[3/6] order_history 마이그레이션');
    const historyCount = migrateOrderHistory();
    console.log(`  -> ${historyCount}건 완료\n`);

    console.log('[4/6] activity_log 마이그레이션');
    const activityCount = migrateActivityLog();
    console.log(`  -> ${activityCount}건 완료\n`);

    console.log('[5/6] sales_goals 마이그레이션');
    const goalsCount = migrateSalesGoals();
    console.log(`  -> ${goalsCount}건 완료\n`);

    console.log('[6/6] users 마이그레이션');
    const usersCount = migrateUsers();
    console.log(`  -> ${usersCount}건 완료\n`);

    return { ordersCount, customersCount, historyCount, activityCount, goalsCount, usersCount };
});

try {
    const result = migrate();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('=== 마이그레이션 완료 ===');
    console.log(`  소요 시간: ${elapsed}초`);
    console.log(`  orders: ${result.ordersCount}건`);
    console.log(`  customers: ${result.customersCount}건`);
    console.log(`  order_history: ${result.historyCount}건`);
    console.log(`  activity_log: ${result.activityCount}건`);
    console.log(`  sales_goals: ${result.goalsCount}건`);
    console.log(`  users: ${result.usersCount}건`);
    console.log(`\n  DB 파일: ${DB_PATH}`);
    console.log('  기존 JSON 파일은 삭제하지 않고 보존됨 (롤백용)');
} catch (error) {
    console.error('\n[에러] 마이그레이션 실패 — 모든 변경이 롤백되었습니다.');
    console.error('  원인:', error.message);
    process.exit(1);
} finally {
    db.close();
}
