/**
 * Part 11 마이그레이션 스크립트
 * -------------------------------------------------
 * 왜 이 스크립트가 필요한가:
 *   stiz.kr 상품 완벽 재이전(Part 11)을 위해 DB 스키마를 확장한다.
 *   1) products 테이블에 6개 신규 컬럼 추가 (detailHtml/origin/brand/modelName/manufacturer/isConsultPrice)
 *   2) product_categories 테이블에 하위 카테고리 20개 INSERT (id 110~129)
 *
 * 안전 장치:
 *   - 실행 전 DB 파일을 backups/stiz.db.part11-{timestamp}.bak 으로 백업
 *   - ALTER TABLE 는 PRAGMA table_info 로 중복 실행 방지
 *   - 카테고리 INSERT 도 id 존재 확인 후 INSERT OR IGNORE
 *
 * 사용:
 *   node dev/migrate-part11.js
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB 경로: server/data/stiz.db (프로젝트 루트 기준)
const DB_PATH = path.resolve(__dirname, '..', 'server', 'data', 'stiz.db');
const BACKUP_DIR = path.resolve(__dirname, '..', 'server', 'data', 'backups');

// 1) DB 백업
// 비유: 수술 전에 환자의 CT 사진을 한 장 찍어두는 것. 문제 생기면 되돌릴 수 있다.
function backupDb() {
    if (!fs.existsSync(DB_PATH)) {
        throw new Error(`DB 파일 없음: ${DB_PATH}`);
    }
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `stiz.db.part11-${ts}.bak`);
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`[백업] ${backupPath}`);
    return backupPath;
}

// 2) 컬럼 존재 확인 (중복 ALTER 방지)
function hasColumn(db, table, col) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return rows.some(r => r.name === col);
}

// 3) products 테이블에 6개 컬럼 추가
function addProductColumns(db) {
    // [컬럼명, SQL 타입, 기본값]
    const cols = [
        ['detailHtml', 'TEXT', "''"],          // 상세 설명 HTML (이미지 포함)
        ['origin', 'TEXT', "''"],              // 원산지
        ['brand', 'TEXT', "''"],               // 브랜드
        ['modelName', 'TEXT', "''"],           // 모델명
        ['manufacturer', 'TEXT', "''"],        // 제조사
        ['isConsultPrice', 'INTEGER', '0'],    // 1이면 "상담 후 결제" 상품 (가격 0원과 구분)
    ];
    let added = 0;
    for (const [name, type, def] of cols) {
        if (hasColumn(db, 'products', name)) {
            console.log(`  [건너뜀] products.${name} 이미 존재`);
            continue;
        }
        db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type} DEFAULT ${def}`);
        console.log(`  [추가] products.${name} ${type}`);
        added++;
    }
    return added;
}

// 4) 하위 카테고리 20개 INSERT
// 기획설계(Part 11)에서 정의한 id 110~129
// 부모 카테고리는 migrate-categories.js 로 이미 재구성된 10개 (100~109)
const SUBCATEGORIES = [
    // 농구(100)
    { id: 110, name: '바스켓볼 헤리티지', slug: 'basketball-heritage', parentId: 100, sortOrder: 1 },
    { id: 111, name: '바스켓볼 프로', slug: 'basketball-pro', parentId: 100, sortOrder: 2 },
    { id: 112, name: '바스켓볼 리버서블', slug: 'basketball-reversible', parentId: 100, sortOrder: 3 },
    // 축구(101)
    { id: 113, name: '사커 2023', slug: 'soccer-2023', parentId: 101, sortOrder: 1 },
    { id: 114, name: '사커 2024', slug: 'soccer-2024', parentId: 101, sortOrder: 2 },
    // 팀웨어(103) — Part 11 기획에서는 103이 팀웨어로 정의됨
    { id: 115, name: '티셔츠', slug: 'teamwear-tshirt', parentId: 103, sortOrder: 1 },
    { id: 116, name: '슈팅 셔츠', slug: 'teamwear-shooting-shirt', parentId: 103, sortOrder: 2 },
    { id: 117, name: '슈팅 저지', slug: 'teamwear-shooting-jersey', parentId: 103, sortOrder: 3 },
    { id: 118, name: '트랙탑', slug: 'teamwear-tracktop', parentId: 103, sortOrder: 4 },
    { id: 119, name: '후드', slug: 'teamwear-hoodie', parentId: 103, sortOrder: 5 },
    // 컴프레션(104)
    { id: 120, name: '컴프레션 상의', slug: 'compression-top', parentId: 104, sortOrder: 1 },
    { id: 121, name: '컴프레션 암슬리브', slug: 'compression-arm', parentId: 104, sortOrder: 2 },
    { id: 122, name: '컴프레션 키즈', slug: 'compression-kids', parentId: 104, sortOrder: 3 },
    { id: 123, name: '컴프레션 하의', slug: 'compression-bottom', parentId: 104, sortOrder: 4 },
    // 캐주얼(106)
    { id: 124, name: '캐주얼 긴팔', slug: 'casual-long-sleeve', parentId: 106, sortOrder: 1 },
    { id: 125, name: '캐주얼 반팔', slug: 'casual-short-sleeve', parentId: 106, sortOrder: 2 },
    { id: 126, name: '캐주얼 팬츠', slug: 'casual-pants', parentId: 106, sortOrder: 3 },
    { id: 127, name: '캐주얼 쇼츠', slug: 'casual-shorts', parentId: 106, sortOrder: 4 },
    // MD(108)
    { id: 128, name: 'MD 상품', slug: 'md-products', parentId: 108, sortOrder: 1 },
    { id: 129, name: 'MD 주문제작', slug: 'md-custom-order', parentId: 108, sortOrder: 2 },
];

function insertSubcategories(db) {
    // INSERT OR IGNORE: id 가 이미 있으면 건너뜀 (재실행 안전)
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO product_categories
            (id, name, slug, parentId, sortOrder, active, createdAt, updatedAt)
        VALUES (@id, @name, @slug, @parentId, @sortOrder, 1, @now, @now)
    `);
    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    const tx = db.transaction((rows) => {
        for (const row of rows) {
            const info = stmt.run({ ...row, now });
            if (info.changes > 0) {
                inserted++;
                console.log(`  [INSERT] ${row.id} ${row.name} (parent=${row.parentId})`);
            } else {
                skipped++;
                console.log(`  [SKIP  ] ${row.id} 이미 존재`);
            }
        }
    });
    tx(SUBCATEGORIES);
    return { inserted, skipped };
}

// 5) 메인
function main() {
    console.log('[migrate-part11] 시작');
    console.log(`  DB: ${DB_PATH}`);

    // 백업
    backupDb();

    // DB 연결
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    try {
        console.log('\n[1] products 테이블 컬럼 추가');
        const added = addProductColumns(db);
        console.log(`  → ${added}개 컬럼 추가됨`);

        console.log('\n[2] 하위 카테고리 INSERT');
        const { inserted, skipped } = insertSubcategories(db);
        console.log(`  → INSERT ${inserted}개 / SKIP ${skipped}개`);

        // 검증: 현재 products 컬럼 목록
        console.log('\n[검증] products 컬럼 목록:');
        const cols = db.prepare('PRAGMA table_info(products)').all();
        for (const c of cols) {
            console.log(`  - ${c.name} ${c.type}`);
        }

        // 검증: 하위 카테고리 개수
        const subCount = db.prepare('SELECT COUNT(*) as n FROM product_categories WHERE parentId IS NOT NULL').get();
        console.log(`\n[검증] 하위 카테고리 총 개수: ${subCount.n}`);

        console.log('\n[완료] migrate-part11 성공');
    } finally {
        db.close();
    }
}

main();
