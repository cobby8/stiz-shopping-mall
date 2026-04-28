# 챗봇 "티즈" 지식학습 K2 기획서

- 작성자: planner-architect
- 작성일: 2026-04-15
- 선행: K1 완료 (커밋 c8712a9, `server/data/knowledge/{company,policies,faq}.json` + `server/services/knowledge.js`)
- 대상 파일(예정):
  - `scripts/build-knowledge.js` (신규, repo 루트)
  - `server/data/knowledge/products.json` (신규, **.gitignore 권장**)
  - `server/services/knowledge.js` (확장)
  - `server/routes/ai.js` (확장)
  - `package.json` (신규 스크립트 등록)

---

## 0. 한 줄 요약 (바이브 코더용 비유)

> K1 이후 티즈는 **"회사 안내/정책 책자"** 를 들고 있는 점원입니다.
> K2 이후 티즈는 **"전체 상품 요약 카드(374장 요약본)"** 를 추가로 손에 쥐고, "농구 + 3~5만원" 같은 조건으로 즉시 10여 개 후보를 고를 수 있는 베테랑이 됩니다.
> **주의**: 요약 카드는 "참고가"일 뿐, 실제 가격/옵션 답변은 **여전히 실시간 DB 조회**로 확인합니다 (오답 방지).

---

## 1. DB 실제 현황 조사 결과 (⚠️ 설계 전제)

실제 `server/data/stiz.db` 쿼리로 확인한 수치입니다. 문서상 가정치가 아닌 **실측값** 기준으로 설계합니다.

### 1-1. 상품 규모
| 지표 | 값 | 비고 |
|------|----|----|
| products 전체 | 374개 | active 373 + archived 1 |
| type='custom' | 260개 (69%) | 커스텀 제작 상품 |
| type='ready' | 114개 (31%) | 기성품 |
| product_categories | 61개 | 트리형 (루트 20개 + 하위 41개) |
| product_options | 232행 / 45개 상품만 | **옵션 보유율 12%뿐** |
| product_images | 1,397장 | JSON에는 url 제외 (챗봇 불필요) |

### 1-2. ⚠️ 데이터 품질 이슈 (설계에 반영해야 함)

| 필드 | 상태 | 영향 |
|------|------|------|
| `keywords` | **0개가 채워짐** | 키워드 기반 필터 불가 → 카테고리/이름/customMeta로 대체 |
| `fabric` | **모두 공란 ("")** | 원단 필터 불가 → customMeta.subCategory에서 "어센틱/프로/베이직" 추출 |
| `sizes` (텍스트) | 2개만 (엉뚱한 값) | 실질 사용 안함 → `product_options` 테이블로 조회 |
| `customMeta` | **55개만 (15%)** | sport(농구23/축구10/배구4/팀웨어18), subCategory(베이직/프로/어센틱 등 14종) |
| `isConsultPrice=1` | **248개 (66%)** | 실제 가격 없는 상품 — "참고가" 표기 불가 |
| `price > 0` | 125개만 (34%) | 가격 필터 대상은 1/3에 불과 |
| `brand` | STIZ 271개 (단일) | 필터 축 의미 없음 |

### 1-3. 가격대 히스토그램 (active + price>0 기준 125개)

| 가격대 | 상품 수 |
|--------|--------|
| 0원 (문의가) | **248개** ← 이것들은 "가격문의"로 안내 |
| 2만원 미만 | 11 |
| 2~3만 | 10 |
| 3~4만 | 40 |
| 4~5만 | 14 |
| 5~7만 | 16 |
| 7~10만 | 25 |
| 10만+ | 9 |

### 1-4. 핵심 통찰

- **"농구 유니폼 3~5만원대 추천"** 질문은 실제로 `카테고리=농구(100) + price BETWEEN 30000 AND 50000` → 현재 DB에 **28개 중 일부** 히트 가능. ✅ 구현 가능
- **"승화전사 되는 품목"** 질문은 customMeta 15%만 분류되어 있어 **불완전 답변**이 될 가능성. K2에서는 "subCategory가 채워진 범위 안에서만 추천" + "불확실하면 상담원 안내" 원칙 필수.
- **"배구용품 뭐 있어?"** → 카테고리=배구(102) 4개만 존재. 리스트업 가능.
- **"커스텀 상품"** → type='custom' 260개. 나열은 너무 많음 → 카테고리별/sport별 집계 요약으로 응답.

---

## 2. 산출물 구조 (파일 경로 + 역할)

| 파일 경로 | 역할 | 신규/수정 |
|-----------|------|----------|
| `scripts/build-knowledge.js` | DB 읽기 → products.json 빌드. 수동/자동 실행 | **신규** |
| `server/data/knowledge/products.json` | 상품 374개 요약 + 통계 + 카테고리 트리 | **신규** (gitignore 권장) |
| `server/services/knowledge.js` | `searchProducts`, `getProductStats`, `classifyIntent` 확장 | 수정 |
| `server/routes/ai.js` | product intent일 때 `searchProducts()` 호출, `buildProductContext` 통합 | 수정 |
| `package.json` (루트) | `"build-knowledge": "node scripts/build-knowledge.js"` 추가 | 수정 |
| `.gitignore` | `server/data/knowledge/products.json` 추가 | 수정 (권장) |
| `.claude/knowledge/architecture.md` | A-14 또는 신규 항목으로 K2 구조 기록 | 수정 |
| `.claude/knowledge/decisions.md` | K2 설계 결정 3건 기록 | 수정 |

---

## 3. `products.json` JSON 스키마 (설계안)

```json
{
  "version": "k2-2026-04-15-1430",
  "builtAt": "2026-04-15T14:30:00.000Z",
  "stats": {
    "totalActive": 373,
    "byType": { "custom": 260, "ready": 114 },
    "withPrice": 125,
    "consultPrice": 248,
    "withCustomMeta": 55,
    "sportCounts": { "농구": 23, "축구": 10, "배구": 4, "팀웨어": 18 },
    "priceHistogram": {
      "under20k": 11, "20to30k": 10, "30to40k": 40,
      "40to50k": 14, "50to70k": 16, "70to100k": 25, "over100k": 9
    }
  },
  "categoryTree": [
    { "id": 100, "slug": "basketball", "name": "농구", "productCount": 33, "children": [
      { "id": 110, "slug": "basketball-heritage", "name": "바스켓볼 헤리티지", "productCount": 74 },
      { "id": 111, "slug": "basketball-pro", "name": "바스켓볼 프로", "productCount": 40 }
    ]},
    { "id": 101, "slug": "soccer", "name": "축구", "productCount": 10, "children": [...] },
    ...
  ],
  "items": [
    {
      "id": 1775725936458049,
      "type": "custom",
      "name": "농구 베이직 유니폼 상의 (삼봉마감)",
      "categoryId": 100,
      "categoryName": "농구",
      "price": 33000,
      "isConsultPrice": false,
      "sport": "농구",
      "subCategory": "베이직 유니폼",
      "hasOptions": true,
      "url": "/detail.html?id=1775725936458049"
    }
    // ... 373개
  ]
}
```

### 예상 파일 크기 계산
- 1건당 평균 ~280 byte (JSON, 공백 없음)
- 373건 × 280 = **약 105KB** (categoryTree + stats 포함 ~110KB)
- 메모리 캐시 문제 없음, Gemini 프롬프트에는 **전체 투입 금지** — 필터링된 상위 3~5개만 주입

### 포함하지 않는 필드 (의도적 배제)
- `description` (평균 111자 × 373 = 41KB 추가, 이름만으로 충분)
- `costPrice`, `clubPrice`, `wholesalePrice` (**내부가 노출 절대 금지**)
- `detailHtml` (긴 HTML, 용량 폭증)
- `product_images.url` (detail 페이지로 링크만)
- `cafe24Id`, `createdAt`, `updatedAt` (챗봇 불필요)

---

## 4. `scripts/build-knowledge.js` 설계

```js
// ESM 스크립트, repo 루트에서 `node scripts/build-knowledge.js`로 실행
// 비유: DB 창고에 들어가 주문표 374장을 한 장씩 읽고 A4 한 장 요약본으로 베껴적는 알바
import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH  = join(__dirname, '..', 'server', 'data', 'stiz.db');
const OUT_PATH = join(__dirname, '..', 'server', 'data', 'knowledge', 'products.json');

// ⚠️ 화이트리스트: 이 스크립트는 아래 테이블만 읽는다. 개인정보 테이블 접근 금지.
const ALLOWED_READ = ['products', 'product_categories', 'product_options'];
// 금지: orders, customers, users, user_mileage, wishlists, cart_items

function build() {
  const db = new Database(DB_PATH, { readonly: true });
  const t0 = Date.now();

  // 1) 카테고리 트리 빌드 (parentId 기반 재귀)
  // 2) active 상품 목록 + customMeta JSON 파싱 + 옵션 존재 여부 서브쿼리
  // 3) stats 집계 (가격 히스토그램, sport 분포 등)
  // 4) JSON 직렬화 + 파일 저장
  // 5) 로그: 처리 건수 / 파일 크기 / 소요 시간 / 이전 파일 대비 diff (신규/변경/삭제 카운트)

  const json = { version: ..., builtAt: ..., stats: ..., categoryTree: ..., items: ... };
  writeFileSync(OUT_PATH, JSON.stringify(json));

  console.log(`[build-knowledge] ✅ ${json.items.length}개 상품 요약 완료 (${size}KB, ${Date.now()-t0}ms)`);
}

build();
```

**설계 원칙**:
- DB 연결 `readonly: true` 강제 (쓰기 실수 방지)
- 민감 테이블 접근 시도 시 명시적 주석으로 금지 선언
- 실행 시 이전 `products.json`이 있으면 상품 수 diff 한 줄 출력 ("신규 3개 / 변경 12개 / 삭제 0개")
- 에러 발생 시 기존 파일 **보존** (임시 경로에 먼저 쓰고 atomic rename)

---

## 5. `server/services/knowledge.js` 확장 설계

```js
// 신규 추가 (기존 K1 5함수는 변경 없음)

let _products = null;

function _loadProducts() {
  try {
    _products = JSON.parse(readFileSync(join(KNOWLEDGE_DIR, 'products.json'), 'utf-8'));
    console.log(`[knowledge] 상품 요약 로드 — ${_products.items.length}개 (v${_products.version})`);
  } catch (e) {
    // products.json 없어도 서버는 동작해야 함 (K2 미적용 환경 호환)
    console.warn('[knowledge] products.json 없음 — 상품 검색 비활성');
    _products = { items: [], stats: {}, categoryTree: [] };
  }
}
_loadProducts();

// 신규 API 1: 상품 필터 검색 (메모리 배열 filter)
// 예: searchProducts({ sport:'농구', priceMin:30000, priceMax:50000, limit:3 })
export function searchProducts({ sport, categoryId, priceMin, priceMax, type, limit = 3 } = {}) {
  const items = _products.items.filter(p => {
    if (sport && p.sport !== sport) return false;
    if (categoryId && p.categoryId !== categoryId) return false;
    if (type && p.type !== type) return false;
    if (priceMin && (p.isConsultPrice || p.price < priceMin)) return false;
    if (priceMax && (p.isConsultPrice || p.price > priceMax)) return false;
    return true;
  });
  return items.slice(0, limit);
}

// 신규 API 2: 상품 통계 요약 (챗봇이 "배구용품 뭐 있어?"에 먼저 집계 제공)
export function getProductStats() {
  return _products.stats;
}

// 신규 API 3: 메시지 → 상품 검색 조건 파라미터 추출
// 예: "농구 3~5만원대 추천" → { sport:'농구', priceMin:30000, priceMax:50000 }
export function parseProductQuery(message) {
  const q = {};
  if (/농구/.test(message)) q.sport = '농구';
  else if (/축구/.test(message)) q.sport = '축구';
  else if (/배구/.test(message)) q.sport = '배구';
  // 가격 패턴: "3~5만", "5만원 이하", "10만 이상"
  const range = message.match(/(\d+)\s*~\s*(\d+)\s*만/);
  if (range) { q.priceMin = +range[1]*10000; q.priceMax = +range[2]*10000; }
  const under = message.match(/(\d+)\s*만\s*원?\s*이하/);
  if (under) q.priceMax = +under[1]*10000;
  const over = message.match(/(\d+)\s*만\s*원?\s*이상/);
  if (over) q.priceMin = +over[1]*10000;
  // type 힌트
  if (/기성|바로\s*배송|완제품/.test(message)) q.type = 'ready';
  if (/커스텀|제작|단체/.test(message)) q.type = 'custom';
  return q;
}

// 기존 classifyIntent 보강: 상품 필터 패턴을 감지하면 'product.filter' 같은 서브 intent 리턴
// (기존 intent 체계 호환 유지 — 'product'는 그대로 두고, parseProductQuery로 조건 있으면 필터 사용)
```

### 핵심 설계 판단
- `searchProducts`는 **메모리 filter만** 수행 — DB 쿼리 X (속도 + K1 원칙 유지)
- 필터링 결과는 이름/카테고리/참고가(있으면) + 상세 URL만 반환
- `isConsultPrice=true` 상품이 priceMin/priceMax 조건에 걸리면 **자동 제외** (참고가 없으니 필터 못함)
- 가격 답변은 여전히 `ai.js`의 **DB 실시간 조회** 경유 (K2 JSON은 후보 선별용일 뿐)

---

## 6. `server/routes/ai.js` 확장 설계

### 기존 `buildProductContext` vs K2 `searchProducts` 통합 전략

현재 `buildProductContext`는 **LIKE 쿼리**로 DB를 즉시 조회합니다. K2 도입 후 3가지 안:

| 안 | 설명 | 장 | 단 |
|---|-----|----|----|
| **A. K2 우선, LIKE 폴백** | `parseProductQuery` → `searchProducts` 결과 있으면 사용, 없으면 기존 LIKE | 구조 조건(가격/종목) 정확 매칭 | 애매한 질문은 여전히 LIKE |
| B. LIKE 우선, K2 폴백 | 기존 방식 그대로 + K2는 필터 질문에만 | 변화 최소 | 가격 필터 놓침 |
| C. 양쪽 합치기 (dedup) | 두 결과를 합쳐 최대 3개 | 커버리지 최대 | 복잡도↑ |

**추천: A (K2 우선)** — 사용자 기대에 가장 잘 맞고 구조 단순.

### ai.js 변경 지점 (수도코드)
```js
// 기존 PRODUCT_KEYWORDS 테스트는 유지
let productContext = '';
if (PRODUCT_KEYWORDS.test(message)) {
  // 1) K2: 구조 필터 쿼리 추출
  const q = parseProductQuery(message);
  const hasStructural = q.sport || q.priceMin || q.priceMax || q.type;
  if (hasStructural) {
    const hits = searchProducts({ ...q, limit: 3 });
    if (hits.length) {
      productContext = formatK2Context(hits); // 이름/카테고리/참고가/URL
    }
  }
  // 2) 폴백: 기존 LIKE 쿼리 (K2 0건일 때만)
  if (!productContext) {
    productContext = buildProductContext(message, 3);
  }
}
```

### formatK2Context 출력 예
```
현재 판매중인 관련 상품(참고용):
- [농구] 농구 베이직 유니폼 세트 / 참고가 33,000원 (상품ID: 1775725936458053)
- [농구] 농구 프로 유니폼 상의 2 + 하의 1 / 참고가 90,000원 (상품ID: 1775725936459302)
- [농구] 농구 어센틱 유니폼 세트 / 참고가 90,000원 (상품ID: 1775725936458049)
※ 실제 가격·재고는 상담원 확인 필요 (일부는 제작 방식별 차등)
```

---

## 7. 빌드 자동화 방안 (사용자 결정 필요)

### 옵션 비교

| 방식 | 구현 난이도 | 운영 편의 | 지연 | 추천도 |
|------|-----------|----------|------|--------|
| 1. 수동 `npm run build-knowledge` | ★ | ☆☆ | 실행 즉시 | K2 초기 |
| 2. 관리자 페이지에 "챗봇 지식 재빌드" 버튼 | ★★ | ★★★ | 실행 즉시 | **장기 추천** |
| 3. 상품 추가/수정 API 훅 (auto-trigger) | ★★★ | ★★★ | 실시간 | 과잉 (건당 빈도 낮음) |
| 4. 서버 부팅 시 매번 빌드 | ★ | ★ | 부팅 시 | 위험 (DB 락 가능성) |
| 5. cron 매일 새벽 1회 | ★★ | ★★ | 최대 24h 지연 | 보조 안전망 |

### 추천안 (3단계 전개)

1. **K2 출시 시점**: 옵션 **1** (수동 실행) — 우선 빌드 품질 검증
2. **1주 실운영 검증 후**: 옵션 **2** (관리자 버튼) 추가 — `admin.html` 또는 `admin-products.html`에 "[챗봇 지식 재빌드]" 버튼 1개, POST /api/admin/rebuild-knowledge 엔드포인트가 `build-knowledge.js`를 exec
3. **장기 보조**: 옵션 **5** (cron) 추가 — 관리자가 깜빡해도 매일 1회 자동 갱신

**옵션 3(API 훅)은 비추** — 상품 등록 빈도가 낮고, 빌드 스크립트 예외 시 상품 저장 트랜잭션까지 영향받는 위험.

---

## 8. 실행 계획 (단계별)

| 순서 | 작업 | 담당 | 예상 | 선행 조건 |
|------|------|------|------|----------|
| 1 | `scripts/build-knowledge.js` 작성 + 1차 빌드 실행 (products.json 생성) | developer | 40분 | 사용자 Q 답변 |
| 2 | `package.json` (루트)에 `"build-knowledge"` 스크립트 등록 | developer | 5분 | 1단계 |
| 3 | `.gitignore`에 `server/data/knowledge/products.json` 추가 (옵션 Q5 참조) | developer | 2분 | 사용자 Q5 답변 |
| 4 | `knowledge.js` 확장: `_loadProducts`, `searchProducts`, `parseProductQuery`, `getProductStats` | developer | 40분 | 1단계 |
| 5 | `ai.js` 확장: K2 우선/LIKE 폴백 통합 | developer | 25분 | 4단계 |
| 6 | tester + reviewer 병렬 검증 (샘플 질문 5개 응답 확인) | tester+reviewer | 30분 | 5단계 |
| 7 | architecture.md A-15 추가 + decisions.md K2 결정 3건 기록 | pm | 10분 | 6단계 통과 |

**총 예상 시간: 2시간 30분** (최소) ~ 3시간 (자동화 옵션 2 포함 시 +40분)

### 병렬 가능
- 6단계의 tester와 reviewer는 **병렬** 실행 가능 (독립 검증)

---

## 9. 사용자 결정 대기 항목 (Q1~Q5)

### Q1. `searchProducts` 통합 전략 (섹션 6 참조)
- [ ] A. K2 우선, LIKE 폴백 ← **추천**
- [ ] B. LIKE 우선
- [ ] C. 양쪽 합치기

### Q2. 빌드 자동화 방식 (섹션 7 참조)
- [ ] 수동만 (`npm run build-knowledge`)
- [ ] 수동 + 관리자 버튼 ← **추천 (2단계 전개)**
- [ ] 수동 + 관리자 버튼 + cron 매일 1회
- [ ] 다른 방식: ________

### Q3. JSON에 포함할 필드 상세도
현재 설계: id, type, name, categoryId, categoryName, price, isConsultPrice, sport, subCategory, hasOptions, url
- [ ] 이대로 진행 ← **추천**
- [ ] `description` 포함 (+41KB, 111자 미리보기 제공)
- [ ] 추가로 포함하고 싶은 필드: ________

### Q4. customMeta 정리 부담
현재 customMeta는 **55개 상품(15%)만** 채워져 있습니다. 챗봇이 "농구 유니폼" 답변 정확도를 높이려면 customMeta.sport를 확장 필요:
- [ ] 지금 K2는 55개 기준으로 출시, 점진적 보강 ← **추천 (빠른 출시)**
- [ ] K2 출시 전에 농구/축구/배구 카테고리 상품의 customMeta 일괄 채움 (1~2시간 추가)
- [ ] 카테고리 이름으로 sport를 **자동 추론** (categoryId=100 → sport='농구' 자동 매핑)

### Q5. `products.json` Git 추적 여부
- [ ] **gitignore** — 빌드 결과물, 개발자마다 다를 수 있음 ← **추천**
- [ ] Git 추적 — 배포 시 빌드 불필요, 일관성 유지
- [ ] 스테이징만 별도 빌드 (배포 스크립트에 통합)

---

## 10. Developer 주의사항

1. **`server/data/stiz.db`는 `readonly: true`로만 연결** — 빌드 스크립트가 실수로 쓰지 않게
2. **orders / customers / users / user_mileage / wishlists / cart_items 절대 읽기 금지** — K1 원칙 동일
3. **JSON에 내부가 필드(`costPrice`, `clubPrice`, `wholesalePrice`) 절대 포함 금지** — 노출 시 비즈니스 리스크
4. **`products.json` 쓰기는 atomic**: 임시 파일(`products.json.tmp`)에 쓴 뒤 rename — 쓰기 중 크래시로 파일 깨짐 방지
5. **K1 함수 시그니처 변경 금지** — `buildSystemPrompt`, `classifyIntent` 등 기존 호출부 보호
6. **`searchProducts` 반환 형식은 K1 `findFaqByIntent`와 일관된 배열** — ai.js 통합 시 혼란 최소화
7. **`isConsultPrice=true` 상품은 가격 필터에서 무조건 제외** (참고가 없음)
8. **빌드 로그 출력 필수**: 처리 건수, 파일 크기, 소요 시간 → 사용자가 "성공했나?" 즉시 판단
9. **서버 `knowledge.js`에서 products.json 누락 시 fail-safe**: 빈 배열로 초기화, 서버 죽지 않게
10. **`parseProductQuery` 정규식 테스트**: "3~5만", "5만원 이하", "10만원 이상" 모두 커버 — 실패 케이스 최소 3개 tester가 확인

---

## 11. 완료 기준 (Definition of Done)

- [ ] `node scripts/build-knowledge.js` 실행 시 `products.json` 정상 생성 (~110KB)
- [ ] 서버 부팅 시 `[knowledge] 상품 요약 로드 — 373개` 로그 출력
- [ ] 챗봇 "농구 유니폼 3~5만원대 추천" → 농구 카테고리 3~5만원대 상품 1~3개 나열
- [ ] 챗봇 "배구용품 뭐 있어?" → 배구 카테고리 4개 중 참고가 있는 것 우선 소개
- [ ] 챗봇 "커스텀 상품 중에 뭐 있어요?" → stats 기반 "농구 23개 / 축구 10개 / 배구 4개 / 팀웨어 18개 분류됨, 대표적으로 ~" 요약 답변
- [ ] 민감 필드(`costPrice` 등) JSON에 **미포함** (reviewer 확인)
- [ ] K1 기능(FAQ/정책 답변) 회귀 테스트 통과
- [ ] knowledge 파일 갱신: architecture.md A-15 + decisions.md 3건

---

## 12. K3/K4와의 관계 (참고)

- **K3 (관리자 FAQ CMS)**: 이 단계에서 "챗봇 지식 재빌드" 버튼도 함께 관리자 UI에 편입 권장
- **K4 (RAG)**: 상품 수가 500개+로 늘거나 customMeta가 전체 상품의 80%+로 확장되면 검토. 그 전까지는 K2 메모리 filter로 충분.

---

_끝._
