/**
 * DB 모듈 (db.js)
 * [E-1] SQLite 마이그레이션 5단계 — db-sqlite.js로 교체
 *
 * 비유: 건물의 모든 문(import)이 이 파일을 가리키고 있으므로,
 *       이 파일만 바꾸면 건물 내부(라우트)는 수정할 필요 없이
 *       자동으로 새로운 SQLite DB를 사용하게 된다.
 *
 * 롤백 방법: 이 파일 내용을 db-json.js 내용으로 되돌리면 원복
 */

// db-sqlite.js의 모든 함수를 그대로 내보낸다
export {
    getAll,
    saveAll,
    insert,
    findOne,
    findById,
    updateById,
    deleteById,
    findByFilter,
    database
} from './db-sqlite.js';

// default export도 그대로 전달
export { default } from './db-sqlite.js';
