/**
 * Simple JSON File Database
 * Reads/writes JSON files in ./data/ directory.
 * Suitable for MVP/prototyping. Replace with SQLite/MongoDB for production.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getFilePath(collection) {
    return path.join(DATA_DIR, `${collection}.json`);
}

// Read all records from a collection
export function getAll(collection) {
    const filePath = getFilePath(collection);
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
}

// Write all records to a collection
export function saveAll(collection, data) {
    const filePath = getFilePath(collection);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Add a record
export function insert(collection, record) {
    const data = getAll(collection);
    record.id = record.id || Date.now();
    data.push(record);
    saveAll(collection, data);
    return record;
}

// Find by field
export function findOne(collection, field, value) {
    const data = getAll(collection);
    return data.find(item => item[field] === value) || null;
}

// Find by ID
export function findById(collection, id) {
    return findOne(collection, 'id', id);
}

// Update a record by ID
export function updateById(collection, id, updates) {
    const data = getAll(collection);
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return null;
    data[index] = { ...data[index], ...updates };
    saveAll(collection, data);
    return data[index];
}

// Delete by ID
export function deleteById(collection, id) {
    const data = getAll(collection);
    const filtered = data.filter(item => item.id !== id);
    if (filtered.length === data.length) return false;
    saveAll(collection, filtered);
    return true;
}

/**
 * 필터 조건으로 레코드 검색 (관리자 주문 목록 등에서 사용)
 * 비유: 엑셀의 필터 기능처럼, 여러 조건을 동시에 걸어서 원하는 데이터만 추출
 *
 * @param {string} collection - 컬렉션 이름 (예: 'orders')
 * @param {object} filters - 필터 조건 { status: 'shipped', manager: '신경록' }
 * @param {object} options - 정렬/페이지네이션 { sortBy, sortOrder, page, limit, search }
 * @returns {{ data: array, total: number, page: number, totalPages: number }}
 */
export function findByFilter(collection, filters = {}, options = {}) {
    let data = getAll(collection);

    // 1) 필터 적용 - 각 필터 키에 해당하는 값이 일치하는 레코드만 남김
    Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;

        // 중첩 필드 지원 (예: 'customer.teamName' → customer 객체 안의 teamName)
        data = data.filter(item => {
            const keys = key.split('.');
            let val = item;
            for (const k of keys) {
                val = val?.[k];
            }
            return val === value;
        });
    });

    // 2) 텍스트 검색 - 팀명, 주문번호, 고객명에서 키워드 검색
    if (options.search) {
        const keyword = options.search.toLowerCase();
        data = data.filter(item =>
            (item.orderNumber || '').toLowerCase().includes(keyword) ||
            (item.customer?.name || '').toLowerCase().includes(keyword) ||
            (item.customer?.teamName || '').toLowerCase().includes(keyword) ||
            (item.memo || '').toLowerCase().includes(keyword)
        );
    }

    // 3) 전체 건수 (페이지네이션 전)
    const total = data.length;

    // 4) 정렬 - 기본값은 생성일 내림차순 (최신순)
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';
    data.sort((a, b) => {
        const aVal = a[sortBy] ?? '';
        const bVal = b[sortBy] ?? '';
        if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
    });

    // 5) 페이지네이션 - page와 limit으로 잘라서 반환
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 20;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    data = data.slice(start, start + limit);

    return { data, total, page, totalPages };
}

export default { getAll, saveAll, insert, findOne, findById, updateById, deleteById, findByFilter };
