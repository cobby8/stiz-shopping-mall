// 쇼핑몰 카테고리 재구성 마이그레이션 스크립트
// ---------------------------------------------
// 이유: 기존 27개 카테고리는 BRAND/CUSTOM 같은 내부 관점이라
//       고객이 이해하기 어려우므로 종목/용도 기준 10개로 통폐합한다.
// 방식: (1) DB 백업 → (2) 새 카테고리 10개(ID 100~109) INSERT
//       → (3) products.categoryId UPDATE → (4) 기존 카테고리 active=0
//       모든 작업은 트랜잭션으로 묶어 실패 시 롤백되도록 한다.

import Database from 'better-sqlite3';
import { copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// ESM 환경에서 프로젝트 루트 경로 계산 (dev/ 폴더의 상위)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const DB_PATH = resolve(ROOT, 'server/data/stiz.db');

const db = new Database(DB_PATH);

// -------------------------------------------------------------
// 1. DB 백업 — 마이그레이션은 돌이킬 수 없으므로 파일 복사로 스냅샷 확보
// -------------------------------------------------------------
const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const backupPath = `${DB_PATH}.bak-${date}`;
copyFileSync(DB_PATH, backupPath);
console.log('[1] 백업 완료:', backupPath);

// -------------------------------------------------------------
// 2. 새 카테고리 10개 정의 (ID 100~109)
//    기존 ID(1~57)와 충돌을 피하기 위해 100번대 사용
// -------------------------------------------------------------
const NEW_CATS = [
  { id: 100, slug: 'basketball',  name: '농구',         sortOrder: 1 },
  { id: 101, slug: 'soccer',      name: '축구',         sortOrder: 2 },
  { id: 102, slug: 'volleyball',  name: '배구',         sortOrder: 3 },
  { id: 103, slug: 'teamwear',    name: '팀웨어',       sortOrder: 4 },
  { id: 104, slug: 'compression', name: '컴프레션',     sortOrder: 5 },
  { id: 105, slug: 'practice',    name: '연습복',       sortOrder: 6 },
  { id: 106, slug: 'casual',      name: '캐주얼',       sortOrder: 7 },
  { id: 107, slug: 'accessories', name: '악세서리&용품', sortOrder: 8 },
  { id: 108, slug: 'md-picks',    name: 'MD제품',       sortOrder: 9 },
  { id: 109, slug: 'sale',        name: '시즌오프',     sortOrder: 10 },
];

// -------------------------------------------------------------
// 3. 매핑 테이블 (구 ID → 새 ID)
//    PM 기획서 Part 10 기준
// -------------------------------------------------------------
const MAPPING = {
  10: 100, 20: 100,                           // 농구
  57: 101, 21: 101,                           // 축구
  22: 102,                                    // 배구
  30: 103, 31: 103, 32: 103, 33: 103, 50: 103,// 팀웨어
  51: 104,                                    // 컴프레션
  52: 105,                                    // 연습복
  11: 106, 12: 106, 13: 106, 14: 106,         // 브랜드 의류(셔츠/바텀/후드/MTM)
  40: 106, 41: 106,                           // 캐주얼 의류/아우터
  53: 107, 54: 107,                           // 악세서리 + 용품
  55: 108,                                    // MD제품
  56: 109,                                    // 시즌오프
};

// 기존 카테고리 전체 ID 리스트 (부모 카테고리 1~4 포함)
// 마이그레이션 후 active=0 처리 대상
const OLD_CATEGORY_IDS = [
  1, 2, 3, 4,
  10, 11, 12, 13, 14,
  20, 21, 22,
  30, 31, 32, 33,
  40, 41,
  50, 51, 52, 53, 54, 55, 56, 57,
];

// -------------------------------------------------------------
// 4. 트랜잭션으로 일괄 실행
// -------------------------------------------------------------
const nowIso = new Date().toISOString();

const migrate = db.transaction(() => {
  // 4-0. slug UNIQUE 충돌 회피
  // 이유: 기존 부모 카테고리 id=3(slug='teamwear'), id=4(slug='casual') 가
  //       새 카테고리 103/106의 slug와 똑같아서 그대로 INSERT 하면
  //       UNIQUE 제약으로 IGNORE 되고, 그러면 FK 체크 시 해당 id가 없어서 실패한다.
  //       → 기존 카테고리의 slug를 'old-*' 로 선행 변경하여 충돌을 제거한다.
  const renameOldSlug = db.prepare(
    'UPDATE product_categories SET slug = ?, updatedAt = ? WHERE id = ?'
  );
  // 충돌 가능성이 있는 기존 부모 카테고리 slug 리네임
  // (basketball/soccer/volleyball 등은 기존 slug가 brand-* / custom-* 이라 충돌 없음)
  const renameTargets = [
    { id: 1, oldSlug: 'brand',    newSlug: 'old-brand' },
    { id: 2, oldSlug: 'custom',   newSlug: 'old-custom' },
    { id: 3, oldSlug: 'teamwear', newSlug: 'old-teamwear' },
    { id: 4, oldSlug: 'casual',   newSlug: 'old-casual' },
  ];
  for (const t of renameTargets) {
    const r = renameOldSlug.run(t.newSlug, nowIso, t.id);
    if (r.changes > 0) {
      console.log(`    slug 리네임: id=${t.id} '${t.oldSlug}' → '${t.newSlug}'`);
    }
  }

  // 4-1. 새 카테고리 10개 INSERT (이미 있으면 스킵)
  // product_categories 테이블은 name NOT NULL, 나머지는 NULL 허용이므로
  // createdAt/updatedAt도 명시적으로 넣어준다.
  const insertCat = db.prepare(`
    INSERT OR IGNORE INTO product_categories
      (id, name, slug, parentId, sortOrder, active, createdAt, updatedAt)
    VALUES (?, ?, ?, NULL, ?, 1, ?, ?)
  `);
  let inserted = 0;
  for (const cat of NEW_CATS) {
    const r = insertCat.run(cat.id, cat.name, cat.slug, cat.sortOrder, nowIso, nowIso);
    if (r.changes > 0) inserted += 1;
  }
  console.log(`[2] 새 카테고리 INSERT: ${inserted}/${NEW_CATS.length}건`);
  // 안전장치: 새 카테고리 10개가 모두 DB에 존재하는지 검증
  const existCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM product_categories WHERE id BETWEEN 100 AND 109'
  ).get().cnt;
  if (existCount !== NEW_CATS.length) {
    throw new Error(`새 카테고리가 ${NEW_CATS.length}개여야 하는데 ${existCount}개만 존재. 중단 후 롤백.`);
  }

  // 4-2. 상품의 categoryId를 새 카테고리로 이동
  const updateProduct = db.prepare(
    'UPDATE products SET categoryId = ?, updatedAt = ? WHERE categoryId = ?'
  );
  let totalMoved = 0;
  console.log('[3] 상품 카테고리 이동:');
  for (const [oldId, newId] of Object.entries(MAPPING)) {
    const result = updateProduct.run(Number(newId), nowIso, Number(oldId));
    if (result.changes > 0) {
      console.log(`    ${oldId} → ${newId}: ${result.changes}건`);
      totalMoved += result.changes;
    }
  }
  console.log(`    총 이동: ${totalMoved}건`);

  // 4-3. 기존 카테고리 비활성화 (삭제하지 않음 - 이력 보존)
  // 주문 이력/상품 이력에서 여전히 참조될 수 있으므로 soft delete 방식 채택
  const placeholders = OLD_CATEGORY_IDS.map(() => '?').join(',');
  const deactivate = db.prepare(
    `UPDATE product_categories SET active = 0, updatedAt = ? WHERE id IN (${placeholders})`
  );
  const deacResult = deactivate.run(nowIso, ...OLD_CATEGORY_IDS);
  console.log(`[4] 기존 카테고리 비활성화: ${deacResult.changes}건`);
});

migrate();

// -------------------------------------------------------------
// 5. 검증 — 새 카테고리별 상품 분포 출력
// -------------------------------------------------------------
console.log('\n=== 마이그레이션 후 새 카테고리 분포 ===');
const newDist = db.prepare(`
  SELECT pc.id, pc.slug, pc.name, count(p.id) as cnt
  FROM product_categories pc
  LEFT JOIN products p ON p.categoryId = pc.id
  WHERE pc.id >= 100 AND pc.id < 110
  GROUP BY pc.id
  ORDER BY pc.sortOrder
`).all();
let sum = 0;
newDist.forEach(r => {
  console.log(`${r.id} | ${r.slug.padEnd(12)} | ${r.name.padEnd(12)} : ${r.cnt}개`);
  sum += r.cnt;
});
console.log(`합계: ${sum}개`);

// 고아 상품 체크: 새 카테고리(100~109)에 속하지 않은 상품
const orphaned = db.prepare(
  'SELECT COUNT(*) as cnt FROM products WHERE categoryId NOT BETWEEN 100 AND 109'
).get();
console.log(`\n고아 상품 (새 카테고리에 없는 상품): ${orphaned.cnt} ${orphaned.cnt === 0 ? 'OK' : '⚠️ 확인 필요'}`);

if (orphaned.cnt > 0) {
  const orphanList = db.prepare(
    'SELECT id, sku, name, categoryId FROM products WHERE categoryId NOT BETWEEN 100 AND 109 LIMIT 20'
  ).all();
  console.log('고아 상품 예시 (최대 20개):');
  orphanList.forEach(p => console.log(`  ${p.id} | ${p.sku} | ${p.name} | categoryId=${p.categoryId}`));
}

// 기존 카테고리 active 상태 확인
const stillActive = db.prepare(
  `SELECT id, slug, active FROM product_categories WHERE id IN (${OLD_CATEGORY_IDS.map(() => '?').join(',')}) AND active = 1`
).all(...OLD_CATEGORY_IDS);
console.log(`\n아직 active=1 인 기존 카테고리: ${stillActive.length}개 ${stillActive.length === 0 ? 'OK' : '⚠️'}`);

db.close();
console.log('\n완료');
