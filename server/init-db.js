/**
 * SQLite DB 초기화 스크립트
 * - server/data/stiz.db 파일을 생성하고 schema.sql을 실행한다
 * - 이미 DB가 있으면 IF NOT EXISTS 덕분에 안전하게 재실행 가능
 * - 비유: 빈 엑셀 파일에 시트 이름과 열 제목을 미리 만들어두는 것
 *
 * 사용법: node server/init-db.js
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'stiz.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// data 디렉토리가 없으면 생성
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// DB 연결 (파일이 없으면 자동 생성됨)
const db = new Database(DB_PATH);

// WAL 모드 활성화 — 읽기/쓰기 동시 성능 향상
// 비유: 도서관에서 원본 책은 그대로 두고, 수정 내용을 별도 노트에 적는 방식
db.pragma('journal_mode = WAL');

// schema.sql 읽어서 실행
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

console.log('[init-db] SQLite DB 초기화 완료:', DB_PATH);
console.log('[init-db] 테이블 목록:');

// 생성된 테이블 확인
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(t => console.log(`  - ${t.name}`));

db.close();
