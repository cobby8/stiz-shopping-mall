/**
 * SQLite 기반 DB 모듈 (db-sqlite.js)
 * 기존 db.js(JSON 파일)와 동일한 8개 함수를 SQLite로 구현한다.
 * 비유: 엑셀 파일 저장소를 진짜 데이터베이스로 교체하되,
 *       창구(함수 인터페이스)는 그대로 유지해서 다른 코드를 수정하지 않아도 되게 하는 것.
 *
 * [E-1] SQLite 마이그레이션 1~2단계 (2026-04-02)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'stiz.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// --- DB 연결 및 초기화 ---

// data 디렉토리 확보
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// DB 연결 (파일이 없으면 자동 생성)
const db = new Database(DB_PATH);

// WAL 모드: 읽기/쓰기 동시 성능 향상
db.pragma('journal_mode = WAL');

// 스키마 적용 (IF NOT EXISTS이므로 중복 실행 안전)
if (fs.existsSync(SCHEMA_PATH)) {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);
}

// --- 컬렉션 이름 → 테이블 이름 매핑 ---
// JSON 파일명에는 하이픈(-)을 쓰지만, SQL 테이블명에는 언더스코어(_)를 써야 한다
function tableName(collection) {
    const map = {
        'order-history': 'order_history',
        'activity-log': 'activity_log',
        'sales-goals': 'sales_goals',
    };
    return map[collection] || collection;
}

// --- JSON blob 컬렉션 판별 ---
// orders와 customers는 "인덱스 컬럼 + data(JSON blob)" 하이브리드 구조
// 나머지는 컬럼이 곧 데이터
function isJsonBlobCollection(collection) {
    return collection === 'orders' || collection === 'customers';
}

// --- orders 인덱스 컬럼 추출 ---
// 전체 주문 객체에서 자주 검색하는 필드만 뽑아 인덱스 컬럼에 저장
function extractOrderColumns(record) {
    return {
        id: record.id,
        orderNumber: record.orderNumber || null,
        status: record.status || 'design_requested',
        manager: record.manager || '',
        customerId: record.customerId || null,
        createdAt: record.createdAt || null,
        orderReceiptDate: record.orderReceiptDate || null,
        updatedAt: record.updatedAt || null,
    };
}

// --- customers 인덱스 컬럼 추출 ---
function extractCustomerColumns(record) {
    return {
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
    };
}

// =============================================================
// 1) getAll(collection) — 전체 데이터 읽기
// =============================================================
export function getAll(collection) {
    const tbl = tableName(collection);
    const rows = db.prepare(`SELECT * FROM ${tbl}`).all();

    if (isJsonBlobCollection(collection)) {
        // data 컬럼(JSON 문자열)을 파싱해서 원래 JS 객체로 복원
        return rows.map(row => JSON.parse(row.data));
    }

    // order_history, activity_log 등은 row 그대로 반환
    // 단, details가 JSON 문자열인 경우 파싱 시도
    if (collection === 'activity-log' || collection === 'activity_log') {
        return rows.map(row => {
            if (row.details && typeof row.details === 'string') {
                try { row.details = JSON.parse(row.details); } catch (e) { /* 문자열 그대로 */ }
            }
            return row;
        });
    }

    if (collection === 'sales-goals' || collection === 'sales_goals') {
        return rows.map(row => {
            if (row.monthlyGoals && typeof row.monthlyGoals === 'string') {
                try { row.monthlyGoals = JSON.parse(row.monthlyGoals); } catch (e) { /* 문자열 그대로 */ }
            }
            return row;
        });
    }

    return rows;
}

// =============================================================
// 2) saveAll(collection, data) — 전체 데이터 덮어쓰기 (트랜잭션)
// 비유: 엑셀 시트 전체를 지우고 새 데이터로 다시 채우는 것
// =============================================================
export function saveAll(collection, data) {
    const tbl = tableName(collection);

    const transaction = db.transaction((records) => {
        // 기존 데이터 전부 삭제
        db.prepare(`DELETE FROM ${tbl}`).run();

        if (isJsonBlobCollection(collection)) {
            // orders/customers: 인덱스 컬럼 + data(JSON)
            if (collection === 'orders') {
                const stmt = db.prepare(`
                    INSERT INTO orders (id, orderNumber, status, manager, customerId, createdAt, orderReceiptDate, updatedAt, data)
                    VALUES (@id, @orderNumber, @status, @manager, @customerId, @createdAt, @orderReceiptDate, @updatedAt, @data)
                `);
                for (const record of records) {
                    const cols = extractOrderColumns(record);
                    cols.data = JSON.stringify(record);
                    stmt.run(cols);
                }
            } else if (collection === 'customers') {
                const stmt = db.prepare(`
                    INSERT INTO customers (id, name, phone, email, teamName, dealType, orderCount, totalSpent, createdAt, updatedAt, data)
                    VALUES (@id, @name, @phone, @email, @teamName, @dealType, @orderCount, @totalSpent, @createdAt, @updatedAt, @data)
                `);
                for (const record of records) {
                    const cols = extractCustomerColumns(record);
                    cols.data = JSON.stringify(record);
                    stmt.run(cols);
                }
            }
        } else if (tbl === 'order_history') {
            const stmt = db.prepare(`
                INSERT INTO order_history (id, orderId, orderNumber, fromStatus, toStatus, changedBy, memo, createdAt)
                VALUES (@id, @orderId, @orderNumber, @fromStatus, @toStatus, @changedBy, @memo, @createdAt)
            `);
            for (const record of records) {
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
        } else if (tbl === 'activity_log') {
            const stmt = db.prepare(`
                INSERT INTO activity_log (id, action, details, userId, userName, timestamp)
                VALUES (@id, @action, @details, @userId, @userName, @timestamp)
            `);
            for (const record of records) {
                stmt.run({
                    id: record.id,
                    action: record.action || null,
                    details: typeof record.details === 'object' ? JSON.stringify(record.details) : (record.details || null),
                    userId: record.userId || null,
                    userName: record.userName || null,
                    timestamp: record.timestamp || null,
                });
            }
        } else if (tbl === 'sales_goals') {
            const stmt = db.prepare(`
                INSERT INTO sales_goals (id, year, annualGoal, monthlyGoals, updatedAt)
                VALUES (@id, @year, @annualGoal, @monthlyGoals, @updatedAt)
            `);
            for (const record of records) {
                stmt.run({
                    id: record.id,
                    year: record.year || null,
                    annualGoal: record.annualGoal || 0,
                    monthlyGoals: typeof record.monthlyGoals === 'object' ? JSON.stringify(record.monthlyGoals) : (record.monthlyGoals || '{}'),
                    updatedAt: record.updatedAt || null,
                });
            }
        } else if (tbl === 'users') {
            const stmt = db.prepare(`
                INSERT INTO users (id, name, email, password, role, joinedAt)
                VALUES (@id, @name, @email, @password, @role, @joinedAt)
            `);
            for (const record of records) {
                stmt.run({
                    id: record.id,
                    name: record.name || null,
                    email: record.email || null,
                    password: record.password || null,
                    role: record.role || 'customer',
                    joinedAt: record.joinedAt || null,
                });
            }
        }
    });

    transaction(data);
}

// =============================================================
// 3) insert(collection, record) — 레코드 1건 추가
// =============================================================
export function insert(collection, record) {
    const tbl = tableName(collection);

    // 기존 db.js와 동일한 ID 생성 방식 유지
    record.id = record.id || Date.now();

    if (isJsonBlobCollection(collection)) {
        if (collection === 'orders') {
            const cols = extractOrderColumns(record);
            cols.data = JSON.stringify(record);
            db.prepare(`
                INSERT INTO orders (id, orderNumber, status, manager, customerId, createdAt, orderReceiptDate, updatedAt, data)
                VALUES (@id, @orderNumber, @status, @manager, @customerId, @createdAt, @orderReceiptDate, @updatedAt, @data)
            `).run(cols);
        } else if (collection === 'customers') {
            const cols = extractCustomerColumns(record);
            cols.data = JSON.stringify(record);
            db.prepare(`
                INSERT INTO customers (id, name, phone, email, teamName, dealType, orderCount, totalSpent, createdAt, updatedAt, data)
                VALUES (@id, @name, @phone, @email, @teamName, @dealType, @orderCount, @totalSpent, @createdAt, @updatedAt, @data)
            `).run(cols);
        }
    } else if (tbl === 'order_history') {
        db.prepare(`
            INSERT INTO order_history (id, orderId, orderNumber, fromStatus, toStatus, changedBy, memo, createdAt)
            VALUES (@id, @orderId, @orderNumber, @fromStatus, @toStatus, @changedBy, @memo, @createdAt)
        `).run({
            id: record.id,
            orderId: record.orderId || null,
            orderNumber: record.orderNumber || null,
            fromStatus: record.fromStatus || null,
            toStatus: record.toStatus || null,
            changedBy: record.changedBy || null,
            memo: record.memo || '',
            createdAt: record.createdAt || null,
        });
    } else if (tbl === 'activity_log') {
        db.prepare(`
            INSERT INTO activity_log (id, action, details, userId, userName, timestamp)
            VALUES (@id, @action, @details, @userId, @userName, @timestamp)
        `).run({
            id: record.id,
            action: record.action || null,
            details: typeof record.details === 'object' ? JSON.stringify(record.details) : (record.details || null),
            userId: record.userId || null,
            userName: record.userName || null,
            timestamp: record.timestamp || null,
        });
    } else if (tbl === 'sales_goals') {
        db.prepare(`
            INSERT INTO sales_goals (id, year, annualGoal, monthlyGoals, updatedAt)
            VALUES (@id, @year, @annualGoal, @monthlyGoals, @updatedAt)
        `).run({
            id: record.id,
            year: record.year || null,
            annualGoal: record.annualGoal || 0,
            monthlyGoals: typeof record.monthlyGoals === 'object' ? JSON.stringify(record.monthlyGoals) : (record.monthlyGoals || '{}'),
            updatedAt: record.updatedAt || null,
        });
    } else if (tbl === 'users') {
        db.prepare(`
            INSERT INTO users (id, name, email, password, role, joinedAt)
            VALUES (@id, @name, @email, @password, @role, @joinedAt)
        `).run({
            id: record.id,
            name: record.name || null,
            email: record.email || null,
            password: record.password || null,
            role: record.role || 'customer',
            joinedAt: record.joinedAt || null,
        });
    }

    return record;
}

// =============================================================
// 4) findOne(collection, field, value) — 필드 기준 1건 조회
// =============================================================
export function findOne(collection, field, value) {
    const tbl = tableName(collection);

    if (isJsonBlobCollection(collection)) {
        // 인덱스 컬럼에 해당 필드가 있으면 직접 WHERE, 아니면 JSON_EXTRACT 사용
        const indexCols = collection === 'orders'
            ? ['id', 'orderNumber', 'status', 'manager', 'customerId', 'createdAt', 'orderReceiptDate', 'updatedAt']
            : ['id', 'name', 'phone', 'email', 'teamName', 'dealType', 'orderCount', 'totalSpent', 'createdAt', 'updatedAt'];

        let row;
        if (indexCols.includes(field)) {
            row = db.prepare(`SELECT data FROM ${tbl} WHERE ${field} = ? LIMIT 1`).get(value);
        } else {
            // 중첩 필드는 JSON blob에서 추출
            row = db.prepare(`SELECT data FROM ${tbl} WHERE json_extract(data, '$.' || ?) = ? LIMIT 1`).get(field, value);
        }
        return row ? JSON.parse(row.data) : null;
    }

    // 비-JSON 테이블은 직접 컬럼 WHERE
    const row = db.prepare(`SELECT * FROM ${tbl} WHERE ${field} = ? LIMIT 1`).get(value);
    if (!row) return null;

    // activity_log의 details JSON 파싱
    if (tbl === 'activity_log' && row.details && typeof row.details === 'string') {
        try { row.details = JSON.parse(row.details); } catch (e) { /* 그대로 */ }
    }
    if (tbl === 'sales_goals' && row.monthlyGoals && typeof row.monthlyGoals === 'string') {
        try { row.monthlyGoals = JSON.parse(row.monthlyGoals); } catch (e) { /* 그대로 */ }
    }

    return row;
}

// =============================================================
// 5) findById(collection, id) — ID로 1건 조회
// =============================================================
export function findById(collection, id) {
    return findOne(collection, 'id', id);
}

// =============================================================
// 6) updateById(collection, id, updates) — ID로 부분 수정
// 비유: 서류를 꺼내서 일부 내용을 수정한 뒤 다시 넣는 것
// 기존 데이터를 읽고 → JS에서 병합 → 다시 UPDATE
// =============================================================
export function updateById(collection, id, updates) {
    const tbl = tableName(collection);

    if (isJsonBlobCollection(collection)) {
        // 기존 데이터 읽기
        const row = db.prepare(`SELECT data FROM ${tbl} WHERE id = ?`).get(id);
        if (!row) return null;

        // JS에서 병합 (기존 db.js의 { ...data[index], ...updates } 패턴과 동일)
        const existing = JSON.parse(row.data);
        const merged = { ...existing, ...updates };

        // 인덱스 컬럼 + data 모두 업데이트
        if (collection === 'orders') {
            const cols = extractOrderColumns(merged);
            cols.data = JSON.stringify(merged);
            cols.whereId = id; // WHERE 조건용
            db.prepare(`
                UPDATE orders SET
                    orderNumber = @orderNumber, status = @status, manager = @manager,
                    customerId = @customerId, createdAt = @createdAt,
                    orderReceiptDate = @orderReceiptDate, updatedAt = @updatedAt, data = @data
                WHERE id = @whereId
            `).run(cols);
        } else if (collection === 'customers') {
            const cols = extractCustomerColumns(merged);
            cols.data = JSON.stringify(merged);
            cols.whereId = id;
            db.prepare(`
                UPDATE customers SET
                    name = @name, phone = @phone, email = @email, teamName = @teamName,
                    dealType = @dealType, orderCount = @orderCount, totalSpent = @totalSpent,
                    createdAt = @createdAt, updatedAt = @updatedAt, data = @data
                WHERE id = @whereId
            `).run(cols);
        }

        return merged;
    }

    // 비-JSON 테이블: 기존 row 읽고 병합 후 전체 UPDATE
    const existing = db.prepare(`SELECT * FROM ${tbl} WHERE id = ?`).get(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates };

    if (tbl === 'order_history') {
        db.prepare(`
            UPDATE order_history SET
                orderId = @orderId, orderNumber = @orderNumber, fromStatus = @fromStatus,
                toStatus = @toStatus, changedBy = @changedBy, memo = @memo, createdAt = @createdAt
            WHERE id = @id
        `).run({
            id: merged.id,
            orderId: merged.orderId || null,
            orderNumber: merged.orderNumber || null,
            fromStatus: merged.fromStatus || null,
            toStatus: merged.toStatus || null,
            changedBy: merged.changedBy || null,
            memo: merged.memo || '',
            createdAt: merged.createdAt || null,
        });
    } else if (tbl === 'activity_log') {
        db.prepare(`
            UPDATE activity_log SET
                action = @action, details = @details, userId = @userId,
                userName = @userName, timestamp = @timestamp
            WHERE id = @id
        `).run({
            id: merged.id,
            action: merged.action || null,
            details: typeof merged.details === 'object' ? JSON.stringify(merged.details) : (merged.details || null),
            userId: merged.userId || null,
            userName: merged.userName || null,
            timestamp: merged.timestamp || null,
        });
    } else if (tbl === 'sales_goals') {
        db.prepare(`
            UPDATE sales_goals SET
                year = @year, annualGoal = @annualGoal, monthlyGoals = @monthlyGoals, updatedAt = @updatedAt
            WHERE id = @id
        `).run({
            id: merged.id,
            year: merged.year || null,
            annualGoal: merged.annualGoal || 0,
            monthlyGoals: typeof merged.monthlyGoals === 'object' ? JSON.stringify(merged.monthlyGoals) : (merged.monthlyGoals || '{}'),
            updatedAt: merged.updatedAt || null,
        });
    } else if (tbl === 'users') {
        db.prepare(`
            UPDATE users SET
                name = @name, email = @email, password = @password, role = @role, joinedAt = @joinedAt
            WHERE id = @id
        `).run({
            id: merged.id,
            name: merged.name || null,
            email: merged.email || null,
            password: merged.password || null,
            role: merged.role || 'customer',
            joinedAt: merged.joinedAt || null,
        });
    }

    return merged;
}

// =============================================================
// 7) deleteById(collection, id) — ID로 삭제
// =============================================================
export function deleteById(collection, id) {
    const tbl = tableName(collection);
    const result = db.prepare(`DELETE FROM ${tbl} WHERE id = ?`).run(id);
    // changes: 실제 삭제된 행 수. 0이면 해당 ID가 없었다는 뜻
    return result.changes > 0;
}

// =============================================================
// 8) findByFilter(collection, filters, options) — 복합 필터+정렬+페이지네이션
// 기존 db.js의 findByFilter와 100% 동일한 동작을 SQL로 구현
// 비유: 엑셀의 고급 필터 기능을 SQL WHERE 절로 변환하는 것
// =============================================================
export function findByFilter(collection, filters = {}, options = {}) {
    const tbl = tableName(collection);

    // orders/customers의 인덱스 컬럼 목록 (SQL WHERE에 직접 사용 가능한 필드)
    const orderIndexCols = ['id', 'orderNumber', 'status', 'manager', 'customerId', 'createdAt', 'orderReceiptDate', 'updatedAt'];
    const customerIndexCols = ['id', 'name', 'phone', 'email', 'teamName', 'dealType', 'orderCount', 'totalSpent', 'createdAt', 'updatedAt'];

    const conditions = [];  // WHERE 절 조건들
    const params = {};      // 바인딩 파라미터

    // --- 필터 조건 처리 ---
    Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;

        const paramKey = key.replace(/\./g, '_');  // dot notation을 언더스코어로 (SQL 파라미터 호환)

        if (isJsonBlobCollection(collection)) {
            const indexCols = collection === 'orders' ? orderIndexCols : customerIndexCols;

            if (indexCols.includes(key)) {
                // 인덱스 컬럼: 직접 WHERE
                conditions.push(`${key} = @${paramKey}`);
                params[paramKey] = value;
            } else if (key.includes('.')) {
                // 중첩 필드 (예: 'customer.dealType') → JSON_EXTRACT
                // dot notation을 SQLite JSON 경로로 변환: 'customer.dealType' → '$.customer.dealType'
                const jsonPath = '$.' + key;
                conditions.push(`json_extract(data, '${jsonPath}') = @${paramKey}`);
                params[paramKey] = value;
            } else {
                // data JSON 내 최상위 필드
                conditions.push(`json_extract(data, '$.${key}') = @${paramKey}`);
                params[paramKey] = value;
            }
        } else {
            // 비-JSON 테이블: 직접 컬럼 WHERE
            conditions.push(`${key} = @${paramKey}`);
            params[paramKey] = value;
        }
    });

    // --- 날짜 범위 필터 ---
    // 비유: 달력에서 "이 기간 주문만 보기"
    // orders: orderReceiptDate 우선, 없으면 createdAt 폴백
    if (options.dateFrom) {
        if (collection === 'orders') {
            // COALESCE: 첫 번째 NULL이 아닌 값 사용 (orderReceiptDate 우선)
            conditions.push(`COALESCE(orderReceiptDate, createdAt) >= @dateFrom`);
        } else {
            conditions.push(`createdAt >= @dateFrom`);
        }
        params.dateFrom = options.dateFrom;
    }
    if (options.dateTo) {
        // dateTo의 끝: 해당 날짜 23:59:59까지 포함 → +1일 미만
        const to = new Date(options.dateTo);
        to.setDate(to.getDate() + 1);
        const toStr = to.toISOString().split('T')[0];  // YYYY-MM-DD 형식

        if (collection === 'orders') {
            conditions.push(`COALESCE(orderReceiptDate, createdAt) < @dateTo`);
        } else {
            conditions.push(`createdAt < @dateTo`);
        }
        params.dateTo = toStr;
    }

    // --- 금액 범위 필터 ---
    // orders의 payment.totalAmount는 JSON blob 안에 있으므로 JSON_EXTRACT 사용
    if (options.amountMin) {
        conditions.push(`CAST(json_extract(data, '$.payment.totalAmount') AS REAL) >= @amountMin`);
        params.amountMin = parseFloat(options.amountMin);
    }
    if (options.amountMax) {
        conditions.push(`CAST(json_extract(data, '$.payment.totalAmount') AS REAL) <= @amountMax`);
        params.amountMax = parseFloat(options.amountMax);
    }

    // --- 상태 제외 필터 ---
    // 비유: "배송완료/취소 주문은 빼고 보기"
    if (options.excludeStatuses && Array.isArray(options.excludeStatuses) && options.excludeStatuses.length > 0) {
        // IN 절에 동적 파라미터 바인딩: 각 상태를 개별 파라미터로 설정
        const excludePlaceholders = options.excludeStatuses.map((s, i) => {
            const key = `excl_${i}`;
            params[key] = s;
            return `@${key}`;
        });
        conditions.push(`status NOT IN (${excludePlaceholders.join(', ')})`);
    }

    // --- 텍스트 검색 ---
    // orders: orderNumber, customer.name, customer.teamName, memo에서 검색
    if (options.search) {
        const keyword = `%${options.search.toLowerCase()}%`;
        params.searchKeyword = keyword;

        if (collection === 'orders') {
            conditions.push(`(
                LOWER(orderNumber) LIKE @searchKeyword
                OR LOWER(json_extract(data, '$.customer.name')) LIKE @searchKeyword
                OR LOWER(json_extract(data, '$.customer.teamName')) LIKE @searchKeyword
                OR LOWER(json_extract(data, '$.memo')) LIKE @searchKeyword
            )`);
        } else if (collection === 'customers') {
            conditions.push(`(
                LOWER(name) LIKE @searchKeyword
                OR LOWER(teamName) LIKE @searchKeyword
                OR LOWER(phone) LIKE @searchKeyword
                OR LOWER(email) LIKE @searchKeyword
            )`);
        }
    }

    // --- WHERE 절 조합 ---
    const whereClause = conditions.length > 0
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

    // --- 정렬 ---
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = (options.sortOrder || 'desc').toUpperCase();
    // 정렬 필드가 인덱스 컬럼인지 확인하여 직접 사용 또는 JSON_EXTRACT
    let orderClause;
    if (isJsonBlobCollection(collection)) {
        const indexCols = collection === 'orders' ? orderIndexCols : customerIndexCols;
        if (indexCols.includes(sortBy)) {
            orderClause = `ORDER BY ${sortBy} ${sortOrder}`;
        } else {
            orderClause = `ORDER BY json_extract(data, '$.${sortBy}') ${sortOrder}`;
        }
    } else {
        orderClause = `ORDER BY ${sortBy} ${sortOrder}`;
    }

    // --- 전체 건수 쿼리 (페이지네이션 계산용) ---
    const countSql = `SELECT COUNT(*) as cnt FROM ${tbl} ${whereClause}`;
    const countResult = db.prepare(countSql).get(params);
    const total = countResult.cnt;

    // --- 페이지네이션 ---
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 20;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // --- 데이터 쿼리 ---
    const dataSql = `SELECT * FROM ${tbl} ${whereClause} ${orderClause} LIMIT @_limit OFFSET @_offset`;
    params._limit = limit;
    params._offset = offset;
    const rows = db.prepare(dataSql).all(params);

    // --- 결과 변환 ---
    let data;
    if (isJsonBlobCollection(collection)) {
        data = rows.map(row => JSON.parse(row.data));
    } else {
        data = rows;
    }

    return { data, total, page, totalPages };
}

// --- DB 인스턴스 내보내기 (백업, 마이그레이션 등에서 직접 사용) ---
export { db as database };

export default { getAll, saveAll, insert, findOne, findById, updateById, deleteById, findByFilter };
