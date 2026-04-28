# 고객 주문 플로우 기획서

> 작성일: 2026-04-06 | 수정일: 2026-04-06 | 작성자: planner-architect
> 목표: 고객이 직접 주문하는 전체 플로우 설계 (상품 선택 ~ 결제 ~ 시안 확인)
> 변경 이력: Part 0 (상품 카탈로그 관리) 추가, **Part 0-B (카페24 상품 연동) 추가**, Phase A 수정, 로드맵 재계산, ~~Part 8 (카페24 실제 상품 연동) 추가~~, **Part 8 전면 재설계: 자체 상품 등록/관리 시스템 (카페24 대체)**, **Part 9 추가: 통합 상품 시스템 (기성품+커스텀 통합, 주문 흐름 전면 변경)**

---

## Part 0: 상품 카탈로그 관리 시스템 (2026-04-06 추가)

### 0-1. 배경: 왜 바꿔야 하나?

기존 기획(D-33)에서는 상품/원단/구성/가격을 `product-catalog.js`에 하드코딩하는 방식이었습니다.

**비유: 식당 메뉴판**
- 기존 방식 = 메뉴판을 나무에 새겨놓은 것. 바꾸려면 개발자가 코드를 열어서 수정해야 함
- 새 방식 = 메뉴판을 화이트보드로 바꾸는 것. 사장님(관리자)이 직접 지우고 새로 쓸 수 있음

### 0-2. 현재 상태 조사 결과

| 항목 | 현재 상태 |
|------|----------|
| admin 상품 관리 메뉴 | **없음** — 주문/매출/고객/캘린더/CS/디자인/제작/출고만 있음 |
| DB products 테이블 | **없음** — 7개 테이블만 존재 (orders, customers, order_history, activity_log, sales_goals, order_templates, users) |
| 상품 관련 API | **없음** — server/routes에 admin/ai/auth/customers/orders만 존재 |
| product-data.js | 카페24 쇼핑몰용 하드코딩 데이터 (고객 커스텀 주문과는 별개) |
| 카페24 연동 | 쇼핑몰 상품은 카페24에서 관리. 커스텀 주문 카탈로그는 자체 시스템 필요 |

**결론:** 상품 카탈로그를 관리하는 시스템이 아예 없으므로 신규 구축 필요.

### 0-3. 방법 비교: A vs B vs C

#### 방법 A: DB 테이블 (정규화)

```
테이블 4개: sports, categories, fabrics, catalog_prices
각 테이블에 CRUD API + 관리자 UI
```

| 장점 | 단점 |
|------|------|
| 데이터 정합성 보장 (종목-품목 관계 등) | 테이블 4개 + API 12개 + UI 4개 = 작업량 큼 |
| 나중에 검색/필터/통계 가능 | STIZ 규모 대비 과도한 설계 (대포로 모기 잡기) |
| 관계형 데이터에 적합 | 초기 설정이 복잡 |

#### 방법 B: 설정 JSON (settings 테이블)

```
settings 테이블 1개: key='product_catalog', value=JSON (현재 product-catalog.js 내용 그대로)
관리자 UI에서 JSON 편집
```

| 장점 | 단점 |
|------|------|
| 테이블 1개면 충분 (또는 기존 테이블 활용) | JSON 직접 편집은 실수 위험 (따옴표 빠뜨리면 깨짐) |
| 구조 변경이 자유로움 | 개별 항목 수정이 불편 (전체를 한 번에 저장) |
| 가장 빠르게 구현 가능 | 비개발자가 JSON을 직접 다루기 어려움 |

#### 방법 C: 관리자 폼 + DB (추천)

```
settings 테이블 1개: key='product_catalog', value=JSON
BUT 관리자에게는 JSON을 보여주지 않고, 폼(입력 양식)으로 보여줌
```

| 장점 | 단점 |
|------|------|
| 관리자가 폼으로 쉽게 편집 (종목 추가 버튼, 가격 입력 칸) | 폼 UI 개발 시간 필요 (~1시간 추가) |
| DB 구조는 단순 (테이블 1개) | 복잡한 관계 표현에 한계 (충분하지만) |
| JSON 실수 방지 (폼이 자동으로 올바른 JSON 생성) | - |
| 나중에 테이블 분리도 가능 (점진적 확장) | - |

### 0-4. 추천: 방법 C (관리자 폼 + settings DB)

**왜 C인가?**

1. **STIZ는 소규모 업체** — 종목 5~6개, 품목 6~7개, 원단 3~4개 수준. 테이블 4개는 과잉
2. **변경 빈도 낮음** — 메뉴가 매일 바뀌는 게 아니라, 분기에 1~2번 정도
3. **비개발자가 관리** — JSON 편집은 위험, 폼이 안전
4. **확장 가능** — 나중에 규모가 커지면 테이블 분리 가능 (JSON을 파싱해서 마이그레이션)

**비유: 엑셀 vs ERP**
- 방법 A(DB 테이블) = ERP 시스템 도입 → 기능은 좋지만 소규모 업체에는 과함
- 방법 B(JSON 직접) = 메모장에 메뉴 적기 → 빠르지만 실수 위험
- 방법 C(폼+DB) = 엑셀 양식 → 칸에 맞춰 적으면 되니까 실수도 적고, 규모에 적합

### 0-5. 데이터 구조 설계

#### DB: settings 테이블 (신규 생성)

```sql
-- settings 테이블: 시스템 설정을 저장하는 범용 테이블
-- 비유: "시스템 환경설정 파일" — 각종 설정을 키-값으로 저장
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,       -- 설정 이름 (예: 'product_catalog')
  value TEXT NOT NULL,        -- 설정 값 (JSON 문자열)
  updatedAt TEXT,            -- 마지막 수정 시각
  updatedBy TEXT             -- 마지막 수정자
);
```

왜 settings 테이블인가? 상품 카탈로그만 아니라, 나중에 다른 설정(배송비 규칙, 할인 정책, 사이트 공지 등)도 같은 테이블에 저장할 수 있습니다. 비유하면 "시스템 환경설정 폴더"에 파일을 추가하는 것.

#### 저장할 JSON 구조 (key='product_catalog')

기존 `product-catalog.js`의 구조를 거의 그대로 유지하되, DB에 저장합니다:

```javascript
// settings 테이블에 key='product_catalog'로 저장되는 JSON 값
{
  // 종목 목록 — "어떤 스포츠?"
  sports: [
    { id: 'basketball', label: '농구', icon: 'sports_basketball', sortOrder: 1, active: true },
    { id: 'soccer', label: '축구', icon: 'sports_soccer', sortOrder: 2, active: true },
    { id: 'volleyball', label: '배구', icon: 'sports_volleyball', sortOrder: 3, active: true },
    { id: 'baseball', label: '야구', icon: 'sports_baseball', sortOrder: 4, active: true },
    { id: 'etc', label: '기타', icon: 'checkroom', sortOrder: 99, active: true },
  ],

  // 품목 목록 — "어떤 옷?"
  categories: [
    { id: 'uniform', label: '유니폼', description: '경기용 상하의 세트', sortOrder: 1, active: true },
    { id: 'shooting_shirt', label: '슈팅셔츠', description: '워밍업용 반팔', sortOrder: 2, active: true },
    { id: 'long_shooting', label: '긴팔슈팅저지', description: '긴팔 워밍업', sortOrder: 3, active: true },
    { id: 'hoodie', label: '후드집업', description: '팀 후드 집업', sortOrder: 4, active: true },
    { id: 'tshirt', label: '반팔티', description: '팀 반팔 티셔츠', sortOrder: 5, active: true },
    { id: 'etc', label: '기타', description: '기타 품목', sortOrder: 99, active: true },
  ],

  // 종목-품목 연결 — "이 스포츠에서 주문 가능한 옷 목록"
  // null이면 모든 품목 가능 (현재는 공통이므로 null)
  sportCategoryMap: null,
  // 나중에 종목별로 다르게 하려면:
  // { basketball: ['uniform', 'shooting_shirt', 'tshirt'], soccer: ['uniform', 'tshirt'] }

  // 원단 목록 — "어떤 천으로?"
  fabrics: [
    { id: 'basic', label: '기본원단 (승화전사)', priceMultiplier: 1.0, description: '가장 많이 사용하는 표준 원단', sortOrder: 1, active: true },
    { id: 'pro', label: '프로원단 (니트)', priceMultiplier: 1.4, description: '프로팀 수준의 고급 원단', sortOrder: 2, active: true },
    { id: 'etc', label: '기타', priceMultiplier: 1.0, description: '별도 상담', sortOrder: 99, active: true },
  ],

  // 구성 옵션 — "어떻게 만들까?"
  compositions: {
    homeAway: [
      { id: 'home', label: '홈만', multiplier: 1, sortOrder: 1, active: true },
      { id: 'away', label: '어웨이만', multiplier: 1, sortOrder: 2, active: true },
      { id: 'both', label: '홈+어웨이', multiplier: 2, sortOrder: 3, active: true },
    ],
    parts: [
      { id: 'set', label: '상의+하의 세트', multiplier: 1.0, sortOrder: 1, active: true },
      { id: 'top', label: '상의만', multiplier: 0.55, sortOrder: 2, active: true },
      { id: 'bottom', label: '하의만', multiplier: 0.45, sortOrder: 3, active: true },
    ],
    type: [
      { id: 'single', label: '단면', multiplier: 1.0, sortOrder: 1, active: true },
      { id: 'double', label: '양면', multiplier: 1.6, sortOrder: 2, active: true },
    ],
  },

  // 기본 단가 (원단=기본원단, 세트=상의+하의 기준, 1벌)
  basePrices: {
    uniform: 50000,
    shooting_shirt: 35000,
    long_shooting: 40000,
    hoodie: 45000,
    tshirt: 25000,
    etc: 0,   // 별도 상담 (0원 = "문의" 표시)
  },

  // 사이즈 옵션
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
}
```

**기존 대비 추가된 필드:**
- `sortOrder`: 표시 순서 (드래그앤드롭 정렬용)
- `active`: 비활성화 플래그 (삭제 대신 숨기기 — 기존 주문 데이터 보존)
- `sportCategoryMap`: 종목별 품목 연결 (현재는 null=공통)

### 0-6. 관리자 UI 설계

#### 진입점: admin 네비게이션에 "상품설정" 메뉴 추가

```
[주문관리] [매출분석] [고객관리] [상품설정] [캘린더] [쇼핑몰]
                                  ^^ 신규
```

#### 화면 구성: admin-catalog.html

**비유: 식당 메뉴판 편집 화면**

```
admin-catalog.html
┌─────────────────────────────────────────────────┐
│  상품 카탈로그 설정                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│                                                 │
│  [종목] [품목] [원단] [구성옵션] [가격]  ← 탭 메뉴  │
│  ─────────────────────────────────────           │
│                                                 │
│  [종목 탭 활성 시]                                │
│  ┌──────────────────────────────────┐           │
│  │ # │ 이름  │ 아이콘    │ 상태  │    │           │
│  │ 1 │ 농구  │ basketball│ 활성  │ [편집][삭제] │  │
│  │ 2 │ 축구  │ soccer   │ 활성  │ [편집][삭제] │  │
│  │ 3 │ 배구  │ volleyball│ 활성  │ [편집][삭제] │  │
│  │ ...                               │           │
│  └──────────────────────────────────┘           │
│  [+ 종목 추가]                                   │
│                                                 │
│  [가격 탭 활성 시]                                │
│  ┌──────────────────────────────────┐           │
│  │ 품목       │ 기본단가  │            │           │
│  │ 유니폼     │ 50,000원 │ [수정]     │           │
│  │ 슈팅셔츠   │ 35,000원 │ [수정]     │           │
│  │ ...                               │           │
│  └──────────────────────────────────┘           │
│  ┌──────────────────────────────────┐           │
│  │ 원단 배수                          │           │
│  │ 기본원단: x1.0 | 프로원단: x1.4    │           │
│  │ 구성 배수                          │           │
│  │ 상의+하의: x1.0 | 상의만: x0.55   │           │
│  │ 단면: x1.0 | 양면: x1.6           │           │
│  │ 홈+어웨이: x2                      │           │
│  └──────────────────────────────────┘           │
│                                                 │
│  [미리보기: 견적 시뮬레이션]                       │
│  농구 유니폼 / 기본원단 / 상의+하의 / 단면 /        │
│  홈+어웨이 / 15벌 = 1,500,000원                  │
│                                                 │
│  [저장]        마지막 수정: 2026-04-06 admin      │
└─────────────────────────────────────────────────┘
```

#### 편집 모달 (종목/품목/원단 공통 패턴)

```
┌─────────────────────────────────────┐
│  종목 편집                           │
│  ─────────────────────               │
│  이름:  [농구          ]             │
│  아이콘: [sports_basketball] [아이콘 찾기] │
│  순서:  [1             ]             │
│  상태:  (●) 활성  ( ) 비활성          │
│                                     │
│  [취소]              [저장]          │
└─────────────────────────────────────┘
```

### 0-7. 고객 주문 위자드와의 연동

**흐름: DB → API → 위자드 화면**

```
[관리자가 카탈로그 수정]
    ↓ 저장
[settings 테이블에 JSON 저장]
    ↓
[GET /api/catalog 호출]
    ↓
[고객 주문 위자드가 선택지 렌더링]
    ↓
[고객이 선택한 종목/품목/원단/구성으로 견적 계산]
```

**비유:** 관리자가 화이트보드에 메뉴를 적으면, 고객이 보는 키오스크(주문 위자드)에 자동으로 반영되는 것.

**기존 기획과 달라지는 점:**
- 기존: `product-catalog.js` 파일에서 직접 import → 변경 시 배포 필요
- 변경: `GET /api/catalog` API 호출 → 관리자가 수정하면 즉시 반영 (배포 불필요)

주문 위자드 코드는 기존 설계를 거의 그대로 유지합니다. 차이점은 데이터 소스만:

```javascript
// 기존 (product-catalog.js에서 직접 가져오기)
import { PRODUCT_CATALOG } from './product-catalog.js';

// 변경 (API에서 가져오기)
const response = await fetch('/api/catalog');
const PRODUCT_CATALOG = await response.json();
// 이후 로직은 동일
```

### 0-8. 가격 계산 로직 (변경 없음)

기존 Part 2의 견적 계산 로직과 동일합니다. 단가와 배수만 DB에서 읽어오는 것이 차이:

```
견적 = basePrices[품목] x fabrics[원단].priceMultiplier
       x compositions.parts[구성].multiplier
       x compositions.type[유형].multiplier
       x compositions.homeAway[홈어웨이].multiplier
       x 수량
```

관리자가 단가나 배수를 변경하면 다음 주문부터 새 가격이 적용됩니다.
기존 주문의 금액은 변경되지 않습니다 (주문 시점의 단가가 orders.data.items에 저장됨).

### 0-9. 기술 결정

| # | 결정 | 이유 |
|---|------|------|
| D-40 | 상품 카탈로그: settings 테이블 + 관리자 폼 UI (방법 C) | 소규모 업체, 변경 빈도 낮음, 비개발자 관리 가능 |
| D-41 | settings 테이블 범용 설계 (key-value) | 카탈로그 외 다른 설정도 재활용 가능 |
| D-42 | active 플래그로 삭제 대신 비활성화 | 기존 주문의 종목/품목 참조 무결성 보존 |

---

## Part 0-B: 카페24 상품 데이터 연동 (2026-04-06 추가)

### 0-B-1. 배경: 왜 필요한가?

STIZ는 카페24 쇼핑몰을 운영 중입니다. 카페24에 이미 등록된 상품 데이터(상품명, 가격, 옵션, 이미지 등)가 있는데, 이걸 STIZ 관리 시스템의 카탈로그에 간편하게 가져오고 싶은 것입니다.

**비유: 두 개의 메뉴판 동기화**
- 카페24 쇼핑몰 = "본점 메뉴판" (온라인 쇼핑몰에서 고객이 보는 상품)
- STIZ 관리 시스템 = "공장 주문서" (커스텀 주문 접수용 카탈로그)
- 현재 문제: 본점에서 메뉴를 바꿔도, 공장 주문서에는 수동으로 다시 적어야 함
- 해결: 본점 메뉴판에서 "가져오기" 버튼으로 공장 주문서에 옮기기

### 0-B-2. 현재 상태 조사 결과

| 항목 | 현재 상태 |
|------|----------|
| 카페24 API 키/설정 | **없음** — server/.env에 Google API Key만 있음. 카페24 OAuth 설정 미구현 |
| 카페24 연동 코드 | **없음** — CAFE24_MIGRATION_GUIDE.md(이전 가이드)만 존재. 실제 API 호출 코드 없음 |
| product-data.js | 카페24 쇼핑몰용 **Mock 데이터** (616줄). 실제 카페24 DB 연동 아님. id/name/price/category/sizes/colors/stock/images 구조 |
| 카페24 관리자 상품 관리 | 카페24 자체 관리자 페이지에서 상품 등록/수정. 엑셀 다운로드(CSV) 기능 기본 제공 |
| STIZ 카탈로그 | Part 0에서 설계한 settings 테이블 (종목/품목/원단/구성/가격) — 아직 미구현 |

### 0-B-3. 카페24 API vs 카페24 상품 구조 분석

#### 카페24 Admin API 상품 조회

```
엔드포인트: GET https://{mall_id}.cafe24api.com/api/v2/admin/products
인증: OAuth 2.0 (앱 등록 → Client ID/Secret → Access Token 발급)
```

**카페24 상품 데이터 구조 (주요 필드):**

```javascript
// 카페24 API 응답 예시 (추정)
{
  product_no: 123,                    // 상품 번호
  product_name: "STIZ Pro Basketball Jersey", // 상품명
  selling_price: 49000,               // 판매가
  supply_price: 30000,                // 공급가 (원가)
  retail_price: 55000,                // 소비자가
  product_code: "P000123",            // 상품 코드
  category: { category_no: 1, name: "Basketball" }, // 카테고리
  options: [                          // 옵션
    { option_name: "사이즈", option_value: ["S","M","L","XL","2XL"] },
    { option_name: "컬러", option_value: ["White","Black","Red"] },
  ],
  detail_image: "https://...",        // 상품 이미지 URL
  description: "...",                 // 상품 설명
  display: "T",                       // 진열 여부
  selling: "T",                       // 판매 여부
  created_date: "2025-01-15",         // 등록일
}
```

#### STIZ 카탈로그 구조 (Part 0 설계)

```javascript
// settings 테이블 key='product_catalog'
{
  sports: [{ id: 'basketball', label: '농구', ... }],
  categories: [{ id: 'uniform', label: '유니폼', ... }],
  fabrics: [{ id: 'basic', label: '기본원단', priceMultiplier: 1.0, ... }],
  compositions: { homeAway: [...], parts: [...], type: [...] },
  basePrices: { uniform: 50000, shooting_shirt: 35000, ... },
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
}
```

#### 두 구조의 핵심 차이

| 관점 | 카페24 상품 | STIZ 카탈로그 |
|------|-----------|-------------|
| **역할** | 완성된 상품 1개 = 1레코드 | 주문 "조합 옵션" (종목+품목+원단+구성) |
| **비유** | 식당의 "완성된 메뉴" (불고기 정식) | 식당의 "재료 목록" (고기, 밥, 반찬 종류) |
| **가격** | 상품당 고정 판매가 | 기본단가 x 원단배수 x 구성배수 = 동적 계산 |
| **옵션** | 사이즈/컬러 (완제품 옵션) | 홈/어웨이, 단면/양면, 상의/하의 (제작 옵션) |
| **상품명** | "STIZ Pro Basketball Jersey" | 종목(농구) + 품목(유니폼)으로 조합 |

**핵심 발견: 카페24 상품과 STIZ 카탈로그는 1:1 매핑이 안 됩니다.**
- 카페24 상품 = "완성품 카탈로그" (고객이 바로 구매)
- STIZ 카탈로그 = "커스텀 주문 옵션" (고객이 조합해서 주문)
- 이 둘은 **다른 목적**의 데이터입니다

### 0-B-4. 연동 방식 비교 및 추천

#### 방법 1: 카페24 Admin API 실시간 연동

```
관리자가 "카페24에서 가져오기" 클릭
  → 서버가 카페24 API 호출 (OAuth 인증)
  → 상품 목록 표시
  → 선택하여 STIZ 카탈로그에 추가
```

| 장점 | 단점 |
|------|------|
| 항상 최신 데이터 | **OAuth 앱 등록 필요** (카페24 개발자센터) |
| 자동화 가능 | **인증 토큰 관리** 필요 (만료/갱신) |
| 이미지 URL 등 자동 연결 | **카페24 API 호출 제한** 있을 수 있음 |
| | 카페24 서비스 장애 시 사용 불가 |
| | **구조 차이** 때문에 자동 매핑 한계 |

#### 방법 2: CSV/엑셀 가져오기

```
관리자가 카페24 관리자에서 "엑셀 다운로드" (기본 기능)
  → CSV 파일을 STIZ 관리 페이지에서 업로드
  → 파싱 → 미리보기 → 매핑 확인 → 카탈로그에 추가
```

| 장점 | 단점 |
|------|------|
| **카페24 API 키 불필요** | 수동 단계 (다운로드 → 업로드) |
| 카페24 의존 없음 (오프라인 작업) | 실시간 동기화 안 됨 |
| **구현이 가장 간단** (파일 파싱만) | 카페24 엑셀 형식 변경 시 파서 수정 필요 |
| 카페24 외 다른 소스(구글시트 등)에서도 가능 | |

#### 방법 3: 하이브리드 (API + CSV)

| 장점 | 단점 |
|------|------|
| 유연성 최대 | 두 방식 모두 구현해야 함 (작업량 2배) |
| 상황에 따라 선택 | 유지보수 부담 |

### 0-B-5. 추천: 방법 2 (CSV 가져오기) 우선, API 연동은 후순위

**왜 방법 2인가?**

1. **구조 차이가 큼** — 카페24 "완성 상품"과 STIZ "커스텀 옵션"은 근본적으로 다른 데이터. 자동 매핑보다 관리자가 직접 확인/수정하는 게 더 정확
2. **카페24 API 설정이 무거움** — OAuth 앱 등록, 토큰 발급/갱신, API 호출 제한 관리 등. 핵심 기능(주문 플로우) 완성이 먼저
3. **CSV는 이미 카페24에서 제공** — 카페24 관리자 > 상품 > 상품목록 > "엑셀 다운로드"가 기본 기능
4. **활용도가 더 넓음** — CSV 가져오기는 카페24뿐 아니라 구글시트, 다른 쇼핑몰에서도 사용 가능
5. **Phase A에 바로 추가 가능** — API 연동(Phase D급)보다 훨씬 빠르게 구현(~1시간)

**비유: 택배 vs 직배**
- API 연동 = 전용 배달 트럭 연결 (인프라 설치 필요, 한번 하면 자동)
- CSV 가져오기 = 택배로 보내기 (매번 수동이지만, 바로 가능)
- 현재 상품이 많지 않으므로(수십 개 수준), 택배로 충분. 전용 트럭은 나중에.

> **향후 확장 계획:** Phase D 이후에 카페24 API 연동(방법 1)을 추가할 수 있습니다.
> 그때는 CSV 가져오기의 "매핑 UI"를 재활용하면 되므로 낭비가 아닙니다.

### 0-B-6. 카페24 CSV → STIZ 카탈로그 매핑 설계

#### 카페24 엑셀 다운로드 파일 구조 (예상)

카페24 관리자에서 상품 목록을 엑셀로 다운로드하면 대략 다음 컬럼이 포함됩니다:

| 카페24 컬럼 | 예시 값 | 설명 |
|------------|---------|------|
| 상품번호 | P000123 | 카페24 내부 ID |
| 상품명 | STIZ Pro Basketball Jersey - Home | 상품 이름 |
| 판매가 | 49000 | 판매 가격 |
| 소비자가 | 55000 | 정가 |
| 공급가 | 30000 | 원가/매입가 |
| 카테고리 | Basketball | 상품 분류 |
| 옵션1 | 사이즈: S,M,L,XL,2XL | 옵션 정보 |
| 옵션2 | 컬러: White,Black,Red | 옵션 정보 |
| 재고 | 100 | 재고 수량 |
| 상품이미지 | https://... | 대표 이미지 URL |
| 진열상태 | 진열함 | 노출 여부 |

#### 매핑 테이블: 카페24 → STIZ

**자동 매핑 가능 (참고 정보로 활용):**

| 카페24 필드 | STIZ 활용 | 매핑 방식 |
|------------|----------|----------|
| 상품명 | 품목명 힌트 | 키워드 추출 (Jersey→유니폼, Hoodie→후드집업 등) |
| 판매가 | 기본단가 참고값 | 직접 복사 또는 참고만 |
| 카테고리 | 종목 힌트 | Basketball→농구, Soccer→축구 등 |
| 상품이미지 | 카탈로그 미리보기용 | URL 그대로 사용 |

**수동 매핑 필요 (관리자가 직접 지정):**

| STIZ 카탈로그 필드 | 이유 |
|-------------------|------|
| 종목 (sport) | 카페24 카테고리가 STIZ 종목과 다를 수 있음 |
| 품목 (category) | "Jersey"가 유니폼인지 슈팅셔츠인지 구분 불가 |
| 원단 (fabric) | 카페24에 원단 정보가 없음 (커스텀 제작 전용 개념) |
| 구성 옵션 (composition) | 카페24에 홈/어웨이, 단면/양면 개념이 없음 |
| 가격 배수 (multiplier) | STIZ 고유의 가격 체계 |

**결론:** 카페24 데이터는 "참고 정보"로 가져오고, STIZ 카탈로그 형식으로 변환하는 것은 관리자가 확인/수정해야 합니다.

### 0-B-7. 관리자 UI 설계: "CSV에서 가져오기" 기능

#### 진입점: admin-catalog.html에 버튼 추가

```
admin-catalog.html (상품 카탈로그 설정)
┌─────────────────────────────────────────────────┐
│  상품 카탈로그 설정                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│                                                 │
│  [종목] [품목] [원단] [구성옵션] [가격]  ← 기존 탭   │
│                                                 │
│  [+ CSV에서 가져오기]  ← 신규 버튼               │
│  ─────────────────────────────────────           │
│  ...기존 카탈로그 관리 UI...                       │
└─────────────────────────────────────────────────┘
```

#### CSV 가져오기 플로우 (3단계)

```
[1단계: 파일 업로드]
┌─────────────────────────────────────────────────┐
│  CSV에서 상품 가져오기                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│                                                 │
│  카페24 관리자에서 다운로드한 상품 엑셀 파일을         │
│  여기에 업로드해주세요.                             │
│                                                 │
│  ┌────────────────────────────────┐             │
│  │  파일을 드래그하거나              │             │
│  │  클릭하여 업로드                 │             │
│  │  (.csv, .xlsx 지원)             │             │
│  └────────────────────────────────┘             │
│                                                 │
│  다운로드 방법:                                    │
│  카페24 관리자 > 상품 > 상품목록 > [엑셀 다운로드]   │
│                                                 │
│  [취소]                     [다음: 미리보기 →]     │
└─────────────────────────────────────────────────┘

[2단계: 미리보기 + 매핑]
┌─────────────────────────────────────────────────┐
│  가져온 상품 미리보기 (총 15개 상품)                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│                                                 │
│  ☑ │ 카페24 상품명              │ 판매가   │ 카테고리  │
│  ──┼──────────────────────────┼────────┼────────│
│  ☑ │ STIZ Pro Basketball Jersey│ 49,000 │ Basketball│
│  ☑ │ Basketball Shorts - Pro   │ 35,000 │ Basketball│
│  ☐ │ STIZ Elite Soccer Kit     │ 55,000 │ Soccer   │
│  ☑ │ Goalkeeper Jersey - Pro   │ 65,000 │ Soccer   │
│  ...                                            │
│                                                 │
│  [전체 선택] [전체 해제]    선택된 상품: 12개       │
│                                                 │
│  [← 뒤로]              [다음: 매핑 확인 →]        │
└─────────────────────────────────────────────────┘

[3단계: 매핑 확인 + 저장]
┌─────────────────────────────────────────────────┐
│  카탈로그 매핑 확인                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│                                                 │
│  자동 추출된 매핑을 확인하고 수정해주세요.            │
│                                                 │
│  ■ 종목 (카페24 카테고리에서 추출)                  │
│  ┌────────────────────────────────────┐         │
│  │ Basketball → [농구 ▾]              │         │
│  │ Soccer     → [축구 ▾]              │         │
│  │ Volleyball → [+ 새 종목 추가]       │         │
│  └────────────────────────────────────┘         │
│                                                 │
│  ■ 품목 (카페24 상품명에서 키워드 추출)              │
│  ┌────────────────────────────────────┐         │
│  │ "Jersey"  → [유니폼 ▾]             │         │
│  │ "Shorts"  → [하의 ▾]               │         │
│  │ "Hoodie"  → [후드집업 ▾]            │         │
│  │ "Shooting"→ [슈팅셔츠 ▾]            │         │
│  └────────────────────────────────────┘         │
│                                                 │
│  ■ 기본단가 (카페24 판매가 참고)                    │
│  ┌────────────────────────────────────┐         │
│  │ 유니폼: [50,000]원 (카페24 참고: 49,000~65,000)│
│  │ 슈팅셔츠: [35,000]원 (카페24 참고: 38,000)    │
│  └────────────────────────────────────┘         │
│                                                 │
│  ⚠ 원단/구성옵션은 카페24에 없는 정보이므로          │
│    기존 카탈로그 설정을 유지합니다.                   │
│                                                 │
│  [← 뒤로]    [미리보기]    [카탈로그에 반영]        │
└─────────────────────────────────────────────────┘
```

**비유:** 이 과정은 "다른 가게의 메뉴판 사진을 찍어와서, 우리 가게 양식에 맞춰 옮겨 적는 것"과 같습니다. 사진(CSV)을 업로드하면, 시스템이 "이게 농구인 것 같고, 이건 유니폼인 것 같다"고 제안하지만, 최종 확인은 관리자가 합니다.

### 0-B-8. API 설계 (CSV 파싱)

| # | 엔드포인트 | 메서드 | 역할 | 인증 |
|---|-----------|--------|------|------|
| 1 | `/api/admin/catalog/import` | POST | CSV 파일 업로드 + 파싱 + 매핑 제안 반환 | 관리자 |

**요청:**
```
POST /api/admin/catalog/import
Content-Type: multipart/form-data
Body: { file: <CSV/XLSX 파일> }
```

**응답:**
```javascript
{
  success: true,
  totalRows: 15,
  // 파싱된 상품 목록
  products: [
    {
      rowIndex: 1,
      raw: { 상품명: "STIZ Pro Basketball Jersey", 판매가: 49000, 카테고리: "Basketball", ... },
      // 자동 매핑 제안
      suggestion: {
        sport: { id: 'basketball', label: '농구', confidence: 'high' },
        category: { id: 'uniform', label: '유니폼', confidence: 'medium' },
        basePrice: 49000,
      },
    },
    // ...
  ],
  // 발견된 새로운 값 (기존 카탈로그에 없는 것)
  newValues: {
    sports: ['Volleyball'],       // 새 종목 후보
    categories: ['Goalkeeper'],   // 새 품목 후보
  },
}
```

**자동 매핑 로직 (서버 측):**

```javascript
// 키워드 → STIZ 종목 매핑 테이블
const SPORT_KEYWORDS = {
  'basketball': 'basketball', 'basket': 'basketball', '농구': 'basketball',
  'soccer': 'soccer', 'football': 'soccer', '축구': 'soccer',
  'volleyball': 'volleyball', '배구': 'volleyball',
  'baseball': 'baseball', '야구': 'baseball',
};

// 키워드 → STIZ 품목 매핑 테이블
const CATEGORY_KEYWORDS = {
  'jersey': 'uniform', 'uniform': 'uniform', 'kit': 'uniform', '유니폼': 'uniform',
  'shooting': 'shooting_shirt', '슈팅': 'shooting_shirt',
  'hoodie': 'hoodie', '후드': 'hoodie',
  'tshirt': 'tshirt', 't-shirt': 'tshirt', '반팔': 'tshirt',
  'shorts': 'etc',  // 하의 단품은 '기타'로
};
```

이 매핑은 "제안"일 뿐이며, 관리자가 3단계에서 수정할 수 있습니다.

### 0-B-9. 카페24 API 연동 (향후 Phase E 후보)

> 현재는 CSV 가져오기만 구현합니다. 아래는 향후 참고용 설계입니다.

#### 필요한 준비 작업

1. **카페24 개발자센터 앱 등록** (https://developers.cafe24.com)
   - 앱 유형: "관리자용 앱"
   - 필요 권한: `mall.read_product` (상품 조회)
   - 결과: Client ID + Client Secret 발급

2. **OAuth 2.0 인증 플로우**
   ```
   [1] 관리자가 "카페24 연결" 버튼 클릭
   [2] 카페24 로그인 페이지로 리디렉트
   [3] 관리자가 권한 승인
   [4] 카페24가 Authorization Code 반환
   [5] 서버가 Code → Access Token 교환
   [6] Access Token을 DB에 저장 (settings 테이블 key='cafe24_token')
   [7] 이후 API 호출 시 Access Token 사용
   ```

3. **서버 구현 (프록시 API)**
   ```
   GET  /api/admin/cafe24/products     → 카페24 상품 목록 조회 (프록시)
   POST /api/admin/cafe24/connect      → OAuth 연결 시작
   GET  /api/admin/cafe24/callback     → OAuth 콜백 처리
   GET  /api/admin/cafe24/status       → 연결 상태 확인
   ```

4. **환경변수 추가**
   ```
   CAFE24_MALL_ID=stizshop
   CAFE24_CLIENT_ID=xxx
   CAFE24_CLIENT_SECRET=xxx
   ```

**비유:** API 연동은 "두 가게 사이에 전용 연결 통로를 만드는 것". 한번 만들어두면 자동으로 상품이 오가지만, 통로를 만드는 공사(OAuth 설정)가 필요합니다. CSV 가져오기는 "택배로 주고받는 것"이라 통로 없이도 바로 가능합니다.

### 0-B-10. 기술 결정

| # | 결정 | 이유 |
|---|------|------|
| D-43 | 카페24 연동: CSV 가져오기 우선, API 연동 후순위 | 구조 차이 큼, OAuth 설정 무거움, CSV는 이미 카페24에서 제공 |
| D-44 | CSV 매핑: 키워드 기반 자동 제안 + 관리자 수동 확인 | 1:1 매핑 불가, 관리자 확인이 가장 정확 |
| D-45 | CSV 파싱: 서버에서 처리 (클라이언트 X) | 대용량 파일 안정성, 보안, XLSX 파싱 라이브러리(xlsx) 서버에서 사용 |

---

## Part 1: 전체 플로우 다이어그램

### 비유로 이해하기

전체 플로우를 **맞춤 양복 주문**에 비유하면:

1. 양복 종류 선택 (정장? 캐주얼?) = **상품 선택**
2. 원단 선택 (울? 린넨?) = **원단 선택**
3. 셋트 구성 (상의+하의? 상의만?) = **구성 선택**
4. 예상 가격 확인 = **모의 견적**
5. 이름/연락처/배송지 작성 = **주문자 정보**
6. "이렇게 만들어주세요" 접수 = **시안 요청**
7. 디자이너가 스케치 보여줌 = **시안 확인**
8. "여기 좀 바꿔주세요" = **수정 요청**
9. "이거 확정!" = **디자인 확정**
10. 팀원별 사이즈표 작성 = **주문서 작성**
11. 결제 = **결제**

### Step별 상세 화면 구성

```
[Step 1] 상품 선택
  ┌─────────────────────────────────────┐
  │  어떤 종목인가요?                      │
  │  [농구] [축구] [배구] [기타]            │
  │                                     │
  │  어떤 품목을 원하시나요?                 │
  │  [유니폼] [슈팅셔츠] [긴팔슈팅저지]       │
  │  [후드집업] [반팔티] [기타]              │
  └─────────────────────────────────────┘
  → 다음 조건: 종목 + 품목 모두 선택

[Step 2] 원단 선택
  ┌─────────────────────────────────────┐
  │  원단을 선택해주세요                    │
  │  ┌──────────┐  ┌──────────┐         │
  │  │ 기본원단   │  │ 프로원단   │         │
  │  │ (승화전사) │  │ (니트)    │         │
  │  │ 50,000원~ │  │ 70,000원~ │         │
  │  └──────────┘  └──────────┘         │
  │  [기타 원단 직접 입력]                  │
  └─────────────────────────────────────┘
  → 다음 조건: 원단 선택 완료

[Step 3] 구성 선택
  ┌─────────────────────────────────────┐
  │  어떤 구성으로 제작할까요?               │
  │                                     │
  │  홈/어웨이: [홈만] [어웨이만] [홈+어웨이]  │
  │  구성:     [상의+하의] [상의만] [하의만]  │
  │  유형:     [단면] [양면]                │
  │  수량:     [  15  ] 벌                │
  │                                     │
  │  요약: 단면 상의+하의 홈+어웨이 15벌      │
  │        = 상의 30벌 + 하의 30벌          │
  └─────────────────────────────────────┘
  → 다음 조건: 구성 + 수량 입력 완료

[Step 4] 모의 견적
  ┌─────────────────────────────────────┐
  │  예상 견적                            │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━       │
  │  농구 유니폼 (기본원단)                  │
  │  단면 상의+하의 홈+어웨이                │
  │  15벌 x 50,000원 x 2(홈+어웨이)         │
  │  ────────────────────                │
  │  예상 금액: 1,500,000원               │
  │                                     │
  │  * 디자인 복잡도에 따라 변동될 수 있습니다  │
  │                                     │
  │  [← 수정하기]        [다음 단계 →]      │
  └─────────────────────────────────────┘
  → 다음 조건: "다음 단계" 클릭

[Step 5] 주문자 정보
  ┌─────────────────────────────────────┐
  │  주문자 정보                           │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━       │
  │  팀명:    [                    ]      │
  │  담당자:  [                    ]      │
  │  연락처:  [                    ]      │
  │  이메일:  [                    ]      │
  │  배송지:  [                    ]      │
  │                                     │
  │  참고파일 업로드 (선택)                  │
  │  ┌────────────────────┐             │
  │  │ 파일을 드래그하거나    │             │
  │  │ 클릭하여 업로드       │             │
  │  └────────────────────┘             │
  │  (팀 로고, 참고 이미지 등)               │
  │                                     │
  │  * 회원이면 자동 채움 / 비회원이면 직접 입력 │
  └─────────────────────────────────────┘
  → 다음 조건: 필수항목(팀명, 담당자, 연락처) 입력

[Step 6] 시안 요청 (최종 접수)
  ┌─────────────────────────────────────┐
  │  요청사항                             │
  │  ┌────────────────────────────┐     │
  │  │ (디자인 관련 요청사항 입력)    │     │
  │  │ 예: "작년 디자인에서 색상만    │     │
  │  │     빨강→파랑으로 변경"       │     │
  │  └────────────────────────────┘     │
  │                                     │
  │  주문 요약                            │
  │  - 종목: 농구                          │
  │  - 품목: 유니폼                        │
  │  - 원단: 기본원단                       │
  │  - 구성: 단면 상의+하의 홈+어웨이 15벌    │
  │  - 예상금액: 1,500,000원              │
  │  - 팀명: OOO                          │
  │                                     │
  │  [시안 요청하기]                        │
  └─────────────────────────────────────┘
  → 제출 시: 주문번호 발급 + status: design_requested
  → 결과 페이지: "주문번호 ORD-XXXXXXXX-XXX 접수되었습니다"
```

### 시안 확인/수정 플로우 (주문 후)

```
[Step 7~8] 시안 확인 (order-track.html 확장)
  ┌─────────────────────────────────────┐
  │  주문번호: ORD-20260406-001          │
  │  상태: 초안 완료 ✓                    │
  │                                     │
  │  ┌────────────────────────────┐     │
  │  │                            │     │
  │  │    [시안 이미지 미리보기]     │     │
  │  │                            │     │
  │  └────────────────────────────┘     │
  │                                     │
  │  [디자인 확정]    [수정 요청]          │
  └─────────────────────────────────────┘

[Step 9a] 수정 요청
  ┌─────────────────────────────────────┐
  │  수정 요청 (무료 수정 2회 중 1회 사용)   │
  │  ┌────────────────────────────┐     │
  │  │ 수정 내용 입력                │     │
  │  │ 예: "등번호 위치를 조금 위로"  │     │
  │  └────────────────────────────┘     │
  │  [참고파일 추가 업로드]                 │
  │  [수정 요청 보내기]                     │
  └─────────────────────────────────────┘
  → status: revision → 디자이너에게 알림
  → 디자이너 수정 완료 → draft_done → 고객 알림 → 반복

[Step 9b] 디자인 확정
  → status: design_confirmed

[Step 10] 주문서 작성 (배번/이름/사이즈)
  ┌─────────────────────────────────────┐
  │  주문서 작성 (팀원 정보 입력)           │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━       │
  │  | # | 배번 | 이름  | 상의  | 하의  |  │
  │  |---|------|------|-------|------|  │
  │  | 1 | 7    | 김OO | M     | M    |  │
  │  | 2 | 11   | 이OO | L     | M    |  │
  │  | 3 | 23   | 박OO | XL    | L    |  │
  │  | + 행 추가 |                       │
  │                                     │
  │  [임시 저장]         [주문서 제출]      │
  └─────────────────────────────────────┘
  → "미리 입력" 가능: 디자인 확정 전에도 작성/임시저장

[Step 11] 결제
  ┌─────────────────────────────────────┐
  │  결제                                │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━       │
  │  최종 금액: 1,500,000원               │
  │                                     │
  │  결제 방식:                           │
  │  (●) 무통장 입금                      │
  │  ( ) 카드 결제 (추후 지원)              │
  │                                     │
  │  입금 계좌: 국민은행 XXX-XXXX-XXXX     │
  │  예금주: (주)스티즈                     │
  │                                     │
  │  입금자명: [              ]            │
  │  [결제 완료 알림]                       │
  └─────────────────────────────────────┘
  → status: payment_completed
```

### Step 전환 조건 요약

| From | To | 조건 |
|------|-----|------|
| Step 1 | Step 2 | 종목 + 품목 선택 |
| Step 2 | Step 3 | 원단 선택 |
| Step 3 | Step 4 | 구성 + 수량 입력 |
| Step 4 | Step 5 | "다음 단계" 클릭 |
| Step 5 | Step 6 | 필수 정보 입력 완료 |
| Step 6 | 접수 완료 | "시안 요청" 제출 |
| 접수 완료 | Step 7 | 디자이너가 시안 업로드 (관리자 측) |
| Step 7 | Step 9a | "수정 요청" 클릭 |
| Step 7 | Step 9b | "디자인 확정" 클릭 |
| Step 9a | Step 7 | 디자이너 수정 완료 (루프) |
| Step 9b | Step 10 | 디자인 확정 완료 |
| Step 10 | Step 11 | 주문서 제출 |
| Step 11 | 완료 | 결제 확인 |

---

## Part 2: 데이터 설계

### 2-1. 기존 DB 구조와의 호환성 분석

현재 orders 테이블의 data JSON에 이미 다음 구조가 존재합니다:

```
orders.data = {
  id, orderNumber, status, groupId,
  customer: { name, email, phone, teamName, dealType },
  items: [{ name, sport, quantity, ... }],
  design: { status, revisionCount, designer, orderSheetUrl, designFileUrl },
  production: { status, factory, gradingDone },
  workInstruction: { status, sentAt, receivedAt, sentBy, url, note },
  shipping: { address, desiredDate, releaseDate, shippedDate, trackingNumber, carrier },
  payment: { totalAmount, unitPrice, quantity, paidDate, paymentType, transactionMethod, quoteUrl, autoQuote },
  manager, memo, createdAt, updatedAt, orderReceiptDate
}
```

**결론: 기존 구조를 거의 그대로 활용 가능. 새로 추가할 필드만 정리.**

### 2-2. 새로 추가할 필드

#### orders.data에 추가할 필드

```javascript
// items 배열 각 항목 확장 (기존: name, sport, quantity)
items: [{
  sport: '농구',              // 기존 필드
  category: '유니폼',         // [신규] 품목 종류
  fabric: '기본원단',          // [신규] 원단 종류
  composition: {             // [신규] 구성 정보
    homeAway: 'both',        // 'home' | 'away' | 'both'
    parts: 'set',            // 'set'(상하의) | 'top'(상의만) | 'bottom'(하의만)
    type: 'single',          // 'single'(단면) | 'double'(양면)
  },
  quantity: 15,              // 기존 필드 (벌 수)
  unitPrice: 50000,          // [신규] 단가 (견적 계산용)
  name: '농구 유니폼 기본원단', // 기존 필드 (자동 생성)
}],

// design 객체 확장
design: {
  status: 'requested',       // 기존
  revisionCount: 0,          // 기존
  maxFreeRevisions: 2,       // [신규] 무료 수정 횟수 한도
  designer: '',              // 기존
  designFileUrl: '',         // 기존 (시안 이미지 URL)
  orderSheetUrl: '',         // 기존
  draftFiles: [],            // [신규] 시안 파일 목록 (여러 장 가능)
  revisionHistory: [],       // [신규] 수정 요청 이력
                             //   [{ requestedAt, message, attachments, completedAt }]
},

// customer 객체 확장
customer: {
  name: '',                  // 기존
  email: '',                 // 기존
  phone: '',                 // 기존
  teamName: '',              // 기존
  dealType: '개인',           // 기존
  address: '',               // [신규] 배송 주소 (기존 shipping.address와 중복이지만 고객 마스터용)
},

// 주문서 데이터 (팀원별 배번/사이즈)
orderSheet: {                // [신규] 전체 블록
  members: [                 // 팀원 목록
    { number: '7', name: '김OO', topSize: 'M', bottomSize: 'M' },
    { number: '11', name: '이OO', topSize: 'L', bottomSize: 'M' },
  ],
  isDraft: true,             // 임시 저장 여부
  submittedAt: null,         // 제출 일시
},

// 참고 파일 (로고, 참고 이미지 등)
referenceFiles: [],          // [신규] [{url, originalName, uploadedAt}]

// 고객이 작성한 요청사항
customerMemo: '',            // [신규] 고객의 시안 요청 메모 (기존 memo는 관리자용)

// 견적 정보
estimate: {                  // [신규]
  subtotal: 0,               // 소계
  adjustments: [],           // 할인/추가 [{label, amount}]
  total: 0,                  // 최종 금액
  calculatedAt: '',          // 계산 시점
  isConfirmed: false,        // 관리자 확정 여부
},
```

#### DB 스키마 변경: 없음

현재 orders 테이블은 `data TEXT NOT NULL` (JSON blob)이므로, 위 필드들을 추가해도 스키마 변경이 필요 없습니다. 비유하면 "서류 봉투 안에 서류를 더 넣는 것"이라 봉투(테이블) 자체를 바꿀 필요가 없습니다.

### 2-3. 상품/원단/구성 마스터 데이터

**방식: DB 기반 (settings 테이블) + 관리자 편집 UI** (기존 D-33 → D-40으로 변경)

~~기존: JS 상수 파일 (product-catalog.js) — 개발자만 수정 가능~~
**변경: settings 테이블에 JSON으로 저장, 관리자가 폼 UI에서 직접 수정**

상세 구조는 **Part 0 (0-5, 0-6)** 참조.

주문 위자드에서는 `GET /api/catalog` API로 카탈로그를 가져와서 사용합니다.
`product-catalog.js` 파일은 생성하지 않습니다 (DB에서 직접 읽음).

### 2-4. 견적 계산 로직

```
견적 = 기본단가 x 원단배수 x 구성배수(상하의) x 유형배수(단면/양면) x 홈어웨이배수 x 수량

예시:
- 농구 유니폼, 기본원단, 상의+하의, 단면, 홈+어웨이, 15벌
- = 50,000 x 1.0 x 1.0 x 1.0 x 2 x 15
- = 1,500,000원
```

이 계산은 **모의 견적**(참고용)이며, 최종 금액은 관리자가 디자인 복잡도 등을 고려해 확정합니다.

---

## Part 3: API 설계

### 3-1. 새로 만들 API

비유: 식당에 새 주문 창구를 추가하는 것입니다.

| # | 엔드포인트 | 메서드 | 역할 | 인증 |
|---|-----------|--------|------|------|
| 1 | `/api/orders` | POST | 고객 주문 접수 (기존 확장) | 선택 (회원/비회원) |
| 2 | `/api/orders/track/:orderNumber` | GET | 주문 추적 (기존 확장: 시안 이미지 포함) | 없음 |
| 3 | `/api/orders/:orderNumber/design-confirm` | POST | 디자인 확정 | 주문자 검증 |
| 4 | `/api/orders/:orderNumber/revision` | POST | 수정 요청 | 주문자 검증 |
| 5 | `/api/orders/:orderNumber/order-sheet` | PUT | 주문서(배번/사이즈) 저장/수정 | 주문자 검증 |
| 6 | `/api/orders/:orderNumber/order-sheet` | GET | 주문서 조회 | 주문자 검증 |
| 7 | `/api/orders/:orderNumber/payment-notify` | POST | 입금 완료 알림 | 주문자 검증 |
| 8 | `/api/upload` | POST | 파일 업로드 (multer) | 선택 |
| 9 | `/api/catalog` | GET | 상품 카탈로그 조회 (고객용, active만) | 없음 |
| 10 | `/api/estimate` | POST | 모의 견적 계산 | 없음 |
| 11 | `/api/admin/catalog` | GET | 상품 카탈로그 전체 조회 (관리자용, 비활성 포함) | 관리자 |
| 12 | `/api/admin/catalog` | PUT | 상품 카탈로그 전체 저장 | 관리자 |
| 13 | `/api/admin/catalog/import` | POST | **CSV 파일 업로드 + 파싱 + 매핑 제안** (Part 0-B) | 관리자 |

### 3-2. 기존 API 수정

| API | 수정 내용 |
|-----|----------|
| `POST /api/orders` | items에 fabric/composition 추가 허용. customer.email 필수 완화 (비회원은 phone만으로 가능). shipping.address 필수 완화 (주문 시점엔 없을 수 있음) |
| `GET /api/orders/track/:orderNumber` | 응답에 design.draftFiles, design.revisionCount, design.maxFreeRevisions, orderSheet, estimate 추가 |
| `POST /api/admin/upload` (B-2에서 구현 예정) | 고객용 업로드도 같은 인프라 공유. 경로만 분리 (uploads/customer/ vs uploads/admin/) |

### 3-3. 주문자 검증 방식

비회원 주문이 가능해야 하므로, 주문자 검증은 두 가지 방식을 지원합니다:

1. **회원**: JWT 토큰의 userId와 주문의 customer 정보 매칭
2. **비회원**: 주문번호 + 연락처(phone) 조합으로 검증 (택배 조회처럼)

```
// 요청 헤더에 JWT가 있으면 회원 검증
// 없으면 body의 { orderNumber, phone }으로 비회원 검증
```

### 3-4. 파일 업로드 API 상세

```
POST /api/upload
- Content-Type: multipart/form-data
- 필드: file (단일 파일), category ('reference' | 'revision' | 'logo')
- 저장 위치: server/uploads/{category}/{YYYYMMDD}-{uuid}-{원본파일명}
- 응답: { success: true, url: '/uploads/reference/20260406-abc123-logo.png', originalName: 'logo.png' }
- 제한: 10MB, jpg/png/gif/pdf/ai/psd/svg 허용
```

---

## Part 4: 페이지/UI 설계

### 4-1. 필요한 HTML 페이지 목록

| 페이지 | 역할 | 신규/수정 |
|--------|------|----------|
| `admin-catalog.html` | 상품 카탈로그 관리 (관리자용) | **신규** |
| `order-custom.html` | 커스텀 주문 위자드 (Step 1~6) | **신규** |
| `order-result.html` | 주문 접수 완료 페이지 | 기존 확장 (또는 order_result.html 재활용) |
| `order-track.html` | 주문 추적 + 시안 확인 + 수정 요청 + 주문서 작성 (Step 7~11) | **수정** |
| `myshop.html` | 내 주문 목록 (로그인 회원용) | **수정** |

### 4-2. UI 방식: 위자드 (단계별 입력)

**왜 위자드인가?**
- 한 페이지에 모든 입력 필드를 보여주면 압도감이 큼 (비유: 서류 10장을 한꺼번에 주면 당황하지만, 한 장씩 주면 편함)
- 각 단계가 독립적이라 뒤로 가기/수정이 자연스러움
- 모바일에서도 작은 화면에 딱 맞는 분량

**구현 방식: 단일 HTML + JS로 단계 전환**
- SPA처럼 하나의 HTML 안에 6개 섹션을 두고 JS로 보이기/숨기기
- URL 해시로 현재 단계 표시 (예: `order-custom.html#step3`)
- 브라우저 뒤로가기로 이전 단계 복귀 가능

```html
<!-- order-custom.html 구조 (건물의 층별 안내도) -->
<div id="wizard">
  <div class="wizard-progress">  <!-- 상단 진행 표시줄 -->
    [1.상품] → [2.원단] → [3.구성] → [4.견적] → [5.정보] → [6.접수]
  </div>

  <section id="step1" class="wizard-step">...</section>  <!-- 각 층 -->
  <section id="step2" class="wizard-step hidden">...</section>
  <section id="step3" class="wizard-step hidden">...</section>
  <section id="step4" class="wizard-step hidden">...</section>
  <section id="step5" class="wizard-step hidden">...</section>
  <section id="step6" class="wizard-step hidden">...</section>
</div>
```

### 4-3. order-track.html 확장 (시안 확인/주문서/결제)

현재 order-track.html은 주문번호 입력 -> 4단계 진행상황 표시만 있음. 여기에 추가:

1. **시안 확인 탭**: design.draftFiles의 이미지 갤러리 + 확정/수정 버튼
2. **주문서 탭**: 팀원 배번/사이즈 입력 테이블 + 임시 저장
3. **결제 탭**: 결제 정보 + 입금 확인 요청

탭 구조로 표시하되, 현재 주문 상태에 따라 활성 탭이 자동 결정됩니다.

### 4-4. 모바일 반응형

고객 주문 페이지는 **모바일 퍼스트** 필수입니다 (관리자 페이지와 다름).
- 위자드 UI 자체가 모바일 친화적 (한 단계씩 보여주니까)
- Tailwind의 반응형 클래스 활용 (`sm:`, `md:`, `lg:`)
- 터치 친화적인 큰 버튼, 카드형 선택지

---

## Part 5: 구현 로드맵

### Phase 구분

전체를 3개 Phase로 나눕니다. 비유하면:
- **Phase A**: 식당 건물 짓기 (기반 인프라)
- **Phase B**: 주방+홀 세팅 (주문 플로우 본체)
- **Phase C**: 영업 시작 + 부가 서비스 (알림/결제/주문서)

### Phase A: 기반 인프라 (선행 조건)

| 순서 | 작업 | 담당 | 예상 시간 | 선행 조건 |
|------|------|------|----------|----------|
| A-1 | settings 테이블 생성 + 카탈로그 초기 데이터 시딩 | developer | 20분 | 없음 |
| A-2 | 카탈로그 API: GET /api/catalog (고객용) + GET/PUT /api/admin/catalog (관리자용) | developer | 30분 | A-1 |
| A-3 | admin-catalog.html + js/admin-catalog.js 생성 (카탈로그 관리 UI) | developer | 60분 | A-2 |
| A-4 | 파일 업로드 API + 인프라 (multer) | developer | 30분 | 없음 (A-1~3과 병렬 가능) |
| A-5 | POST /api/orders 확장 (items 필드 추가 허용) | developer | 20분 | A-2 |
| A-6 | GET /api/orders/track 확장 (시안/주문서 데이터 포함) | developer | 20분 | 없음 |
| **A-7** | **CSV 가져오기 API: POST /api/admin/catalog/import (파싱+매핑 제안)** | **developer** | **40분** | **A-2** |
| **A-8** | **admin-catalog.html에 "CSV에서 가져오기" UI 추가 (3단계 모달)** | **developer** | **40분** | **A-3, A-7** |
| -- | Phase A 검증 | tester | 20분 | A-1~8 |

소계: ~4.5시간 (기존 3시간 + CSV 가져오기 1.5시간)

**기존 대비 변경:**
- ~~A-1 product-catalog.js 생성~~ → settings 테이블 + 시딩
- A-2~3 신규: 카탈로그 API + 관리자 UI
- A-4~6: 기존 A-2~4에서 번호 밀림
- **A-7~8 신규: 카페24 CSV 가져오기 (Part 0-B)**

### Phase B: 주문 위자드 (핵심)

| 순서 | 작업 | 담당 | 예상 시간 | 선행 조건 |
|------|------|------|----------|----------|
| B-1 | order-custom.html + order-custom.js 생성 (위자드 UI) | developer | 60분 | A-2 (카탈로그 API) |
| B-2 | Step 1~3 구현 (상품/원단/구성 선택) | developer | 40분 | B-1 |
| B-3 | Step 4 구현 (모의 견적 계산) | developer | 20분 | B-2 |
| B-4 | Step 5~6 구현 (주문자 정보 + 시안 요청 제출) | developer | 40분 | B-3, A-4, A-5 |
| B-5 | order-result 페이지 연결 (접수 완료 화면) | developer | 15분 | B-4 |
| -- | Phase B 검증 | tester + reviewer | 20분 | B-1~5 |

소계: ~3시간

### Phase C: 시안 확인 + 주문서 + 결제 (주문 후 플로우)

| 순서 | 작업 | 담당 | 예상 시간 | 선행 조건 |
|------|------|------|----------|----------|
| C-1 | order-track.html 확장: 시안 확인 UI (이미지 갤러리 + 확정/수정 버튼) | developer | 40분 | A-4 |
| C-2 | 디자인 확정/수정 요청 API | developer | 30분 | C-1 |
| C-3 | 주문서(배번/사이즈) 입력 UI + 임시 저장 API | developer | 40분 | C-1 |
| C-4 | 결제 안내 UI + 입금 확인 요청 API | developer | 30분 | C-3 |
| C-5 | myshop.html 확장: 내 주문 목록에서 각 주문 클릭 시 order-track으로 이동 | developer | 20분 | C-1 |
| -- | Phase C 검증 | tester + reviewer | 20분 | C-1~5 |

소계: ~3시간

### Phase D: 알림 + 고도화 (후순위)

| 순서 | 작업 | 담당 | 예상 시간 | 선행 조건 |
|------|------|------|----------|----------|
| D-1 | 카카오 알림톡 연동 (SOLAPI) | developer | 60분 | C-2 |
| D-2 | 관리자 시안 업로드 시 자동 알림 트리거 | developer | 30분 | D-1 |
| D-3 | 결제 시스템 연동 (PortOne) | developer | 60분 | C-4 |
| D-4 | 비회원 주문 시 SMS 인증 | developer | 30분 | D-1 |

소계: ~3시간 (우선순위 낮음, 추후 진행)

### 전체 예상 시간

| Phase | 내용 | 예상 시간 | 변경 사항 |
|-------|------|----------|----------|
| A | 기반 인프라 + 상품 카탈로그 관리 + **CSV 가져오기** | **4.5시간** | +1.5시간 (카페24 CSV 연동 추가) |
| B | 주문 위자드 | 3시간 | 변경 없음 |
| C | 시안/주문서/결제 | 3시간 | 변경 없음 |
| D | 알림/고도화 | 3시간 (후순위) | 변경 없음 |
| (E) | *카페24 API 실시간 연동 (선택)* | *2시간 (선택)* | *신규 — 필요 시 추후* |
| **합계** | | **~13.5시간** (Phase A~C: 10.5시간) | 기존 12시간 대비 +1.5시간 |

**권장 실행 순서:** A(카탈로그 + CSV 가져오기) → B(위자드) → C(후속 플로우) → D(후순위) → E(선택)
Phase A에서 카탈로그 관리를 먼저 만들어야 위자드에서 선택지를 보여줄 수 있습니다.
CSV 가져오기(A-7~8)는 카탈로그 UI(A-3) 완성 후 바로 연결됩니다.

---

## Part 6: 카카오 알림톡 연동 계획

### 6-1. 알림 발송 시점 및 내용

| # | 시점 | 수신자 | 알림 내용 | status 변경 |
|---|------|--------|----------|------------|
| 1 | 주문 접수 | 고객 | "주문이 접수되었습니다. 주문번호: ORD-XXX" | → design_requested |
| 2 | 시안 완성 | 고객 | "시안이 완성되었습니다. 확인해주세요. [링크]" | → draft_done |
| 3 | 수정 요청 접수 | 관리자(디자이너) | "고객이 시안 수정을 요청했습니다. [링크]" | → revision |
| 4 | 디자인 확정 | 관리자 | "고객이 디자인을 확정했습니다. [링크]" | → design_confirmed |
| 5 | 주문서 제출 | 관리자 | "고객이 주문서(배번/사이즈)를 제출했습니다." | → order_received |
| 6 | 결제 확인 | 관리자 | "고객이 입금 완료를 알려왔습니다." | (결제 확인 대기) |
| 7 | 배송 출발 | 고객 | "주문하신 유니폼이 발송되었습니다. 송장번호: XXX" | → shipped |

### 6-2. SOLAPI 연동 방법 (개략)

**SOLAPI란?** 카카오 알림톡/친구톡/SMS를 보내주는 서비스입니다. 비유하면 "우체국 대행 서비스" — 우리가 편지를 쓰면 SOLAPI가 배달해줍니다.

```
연동 흐름:
1. SOLAPI 가입 + 카카오비즈니스 채널 등록
2. 알림톡 템플릿 등록 (카카오 검수 필요, 1~2일)
3. 서버에서 SOLAPI REST API 호출
```

**서버 구현 구조:**

```
server/
├── services/
│   └── notification.js    ← 알림 발송 서비스 (SOLAPI API 호출)
├── routes/
│   └── orders.js          ← 상태 변경 시 notification.js 호출
```

```javascript
// notification.js (개략)
// SOLAPI API를 통해 카카오 알림톡 발송
async function sendKakaoNotification(phone, templateId, variables) {
  // SOLAPI REST API 호출
  // POST https://api.solapi.com/messages/v4/send
  // 인증: API Key + Secret (환경변수)
}

// 사용 예시
sendKakaoNotification('010-1234-5678', 'DRAFT_DONE', {
  teamName: 'OOO팀',
  orderNumber: 'ORD-20260406-001',
  trackUrl: 'https://stiz.co.kr/order-track.html?order=ORD-20260406-001'
});
```

**필요한 알림톡 템플릿 (카카오 검수 대상):**

1. 주문 접수 완료
2. 시안 완성 알림
3. 수정 반영 완료
4. 결제 안내
5. 배송 출발 안내

### 6-3. 대체 방안 (Phase D 전까지)

카카오 알림톡 연동 전까지는 다음으로 대체합니다:
- **사이트 내 알림**: order-track.html에서 상태 변경 시 뱃지/배너 표시
- **이메일 알림**: nodemailer로 간단 이메일 발송 (SMTP만 있으면 됨)
- **수동 카톡**: 관리자가 직접 카카오톡 메시지 전송 (현재 방식 유지)

---

## 추가 고려사항

### 보안

1. **비회원 주문 보호**: 주문번호 + 연락처 조합 검증 (주문번호만으로 접근 불가)
2. **파일 업로드 보안**: 파일 확장자 화이트리스트 + 크기 제한 + 바이러스 스캔(선택)
3. **CSRF 방지**: 주문 제출 시 일회용 토큰 사용

### 성능

1. **이미지 최적화**: 시안 이미지 업로드 시 썸네일 자동 생성 (sharp 라이브러리)
2. **파일 저장**: 초기에는 로컬 디스크, 추후 클라우드(AWS S3 등) 전환 가능하도록 storage 모듈 분리

### 기존 기능과의 관계

1. **B-1 (관리자 주문 생성)**: 관리자가 전화로 받은 주문을 직접 입력하는 기능. 고객 주문 위자드와 별개이지만, 최종적으로 같은 orders 테이블에 저장
2. **B-2 (파일 업로드)**: 관리자용 파일 업로드와 고객용 파일 업로드가 같은 multer 인프라 공유
3. **order-track.html**: 현재는 "조회만" 가능. 여기에 "시안 확정/수정 요청/주문서 작성" 기능을 추가하므로, 가장 큰 변경이 필요한 페이지

---

## 기술 결정 요약

| # | 결정 | 이유 |
|---|------|------|
| D-32 | 주문 위자드: 단일 HTML + JS 단계 전환 | MPA 프로젝트 패턴 일관성, 가장 단순 |
| ~~D-33~~ | ~~상품 카탈로그: JS 상수 파일~~ | ~~변경 빈도 낮음, DB 복잡도 불필요~~ → **D-40으로 대체** |
| D-34 | 비회원 주문 검증: 주문번호 + 연락처 | 별도 인증 없이 택배 조회처럼 간편하게 |
| D-35 | 파일 업로드: 로컬 디스크 + multer | 초기엔 단순하게, 추후 클라우드 전환 가능 |
| D-36 | 알림: Phase D로 후순위, 사이트 내 알림 우선 | 외부 API 연동은 핵심 기능 완성 후 |
| D-37 | 주문서(배번/사이즈): orders.data.orderSheet에 저장 | 스키마 변경 불필요, JSON blob 활용 |
| D-38 | 견적: 클라이언트 계산 + 서버 검증 | 빠른 UX + 조작 방지 |
| D-39 | 모바일 반응형: 고객 페이지만 적용 (관리자는 PC 전용 유지) | D-20 결정과 일관 |
| D-40 | **상품 카탈로그: settings 테이블 + 관리자 폼 UI** | 소규모 업체, 비개발자 관리 가능, 점진적 확장 가능 |
| D-41 | **settings 테이블 범용 설계 (key-value)** | 카탈로그 외 다른 설정도 재활용 가능 |
| D-42 | **active 플래그로 삭제 대신 비활성화** | 기존 주문의 종목/품목 참조 무결성 보존 |
| D-43 | **카페24 연동: CSV 가져오기 우선, API 연동 후순위** | 구조 차이 큼, OAuth 무거움, CSV는 카페24 기본 제공 |
| D-44 | **CSV 매핑: 키워드 자동 제안 + 관리자 수동 확인** | 카페24 상품↔STIZ 카탈로그 1:1 매핑 불가, 관리자 확인이 정확 |
| D-45 | **CSV 파싱: 서버 처리 (xlsx 라이브러리)** | 대용량 안정성, 보안, XLSX 호환 |

---

## Part 7: 가격/구성 고도화 (2026-04-06 추가)

> 가격 시트(dev/price-sheet.csv)를 기준으로, 현재 주문 시스템의 구성 옵션과 가격 체계를 실제 영업에 맞게 고도화하는 기획.

### 7-1. 왜 바꿔야 하나? (현재 시스템의 한계)

**비유: 현재 시스템 = 피자 주문인데 "라지 사이즈"밖에 없는 상태**

현재 주문 위자드(order-custom.js)는 가격을 이렇게 계산합니다:

```
견적 = basePrices[품목] x 원단배수 x 구성배수 x 유형배수 x 홈어웨이배수 x 수량
```

이것은 "기본 가격에 곱하기 방식"입니다. 그런데 실제 가격 시트를 보면:

| 구성 | 실제 가격 | 현재 시스템 계산값 | 차이 |
|------|----------|-----------------|------|
| 농구 베이직 세트 (상의1+하의1) | **60,000원** | 50,000 x 1.0 = 50,000원 | -10,000 |
| 농구 베이직 상의 2 + 하의 1 | **80,000원** | **계산 불가!** (이 옵션이 없음) | N/A |
| 농구 프로 세트 | **70,000원** | 50,000 x 1.4 = 70,000원 | 일치(우연) |
| 양면 상의 + 베이직 하의 | **70,000원** | 50,000 x 1.6 x 1.0 = 80,000원 | +10,000 |
| 양면 상의 + 프로 하의 | **75,000원** | **계산 불가!** (혼합 등급 불가) | N/A |

**핵심 문제 5가지:**

1. **구성 옵션이 너무 단순**: "세트/상의만/하의만" 3개뿐. 실제로는 "상의 2벌 + 하의 1벌", "양면 상의 + 프로 하의" 같은 혼합 구성이 필요
2. **가격이 배수가 아니라 고정가**: 세트 60,000원은 "상의 33,000 + 하의 33,000 = 66,000"이 아니라, 별도의 세트 가격. 배수로 계산하면 실제와 안 맞음
3. **마감 옵션 없음**: 상의에 "삼봉마감 vs 암홀립", 하의에 "트임 vs 트임X" 선택이 없음 (가격은 같지만 원가와 상세가 다름)
4. **등급 간 혼합 불가**: 양면 상의 + 프로 하의처럼 다른 등급을 섞는 구성이 불가
5. **할인 체계 없음**: 학교스포츠클럽 가격, 신학기 프로모션 10%/15% 할인 적용 불가

### 7-2. 가격 시트 완전 분석

#### 대분류 구조

```
price-sheet.csv
├── BRAND (line 2~48): 완제품 고정가 — 페가수스, 오버글로우 등
│   ├── 농구의류: 유니폼(어센틱/레플리카), 슈팅셔츠, 웜업
│   ├── SHIRTS: 오버글로우 반팔티 (7종 x 화이트/블랙)
│   ├── BOTTOM: 숏팬츠
│   ├── HOODIE: 오버글로우 후디 (4종 x 화이트/블랙)
│   └── MTM: 오버글로우 맨투맨 (3종 x 화이트/블랙)
│
└── CUSTOM (line 49~107): 커스텀 제작 — 가격 체계 복잡
    ├── 농구 (4등급)
    │   ├── 베이직: 상의/하의/세트/상2하1/상2하2 (7행)
    │   ├── 프로: 상의/하의/세트/상2하1/상2하2 (7행)
    │   ├── 어센틱: 상의/하의/세트/상2하2 (4행)
    │   └── 양면: 상의/하의/양면+베이직하의/양면+프로하의/양면+양면하의 (5행)
    ├── 축구 (2등급)
    │   ├── 베이직: 상의/하의/세트/상2하1/상2하2 (5행)
    │   └── 프로: 상의/하의/세트/상2하1/상2하2 (5행)
    ├── 배구 (1등급)
    │   └── 프로: 상의/하의/세트/상2하1 (4행)
    └── 팀웨어 (별도 카테고리)
        ├── 슈팅저지: 반집업 반팔/긴팔, 풀집업 반팔/긴팔, 프로 긴팔 (5종)
        ├── 반팔 전사티: 베이직/프로/쿨메쉬 (3종)
        ├── 트랙탑 웜업: 상의/하의/세트 (3종)
        ├── 후드 웜업: 상의/하의/세트 (3종)
        └── 캐주얼: 반팔티/후드집업/후드티/맨투맨 (4종)
```

#### 가격표 정리 (CUSTOM 핵심)

**농구 유니폼 가격 (원/벌)**

| 구성 | 베이직 | 프로 | 어센틱 | 양면 |
|------|--------|------|--------|------|
| 상의 | 33,000 | 38,000 | 50,000 | 40,000 |
| 하의 | 33,000 | 38,000 | 50,000 | 40,000 |
| 세트 (상1+하1) | 60,000 | 70,000 | 90,000 | - |
| 상의2 + 하의1 | 80,000 | 90,000 | - | - |
| 상의2 + 하의2 | 100,000 | 110,000 | 160,000 | - |
| 양면상의 + 베이직하의 | - | - | - | 70,000 |
| 양면상의 + 프로하의 | - | - | - | 75,000 |
| 양면상의 + 양면하의 | - | - | - | 80,000 |

**축구 유니폼 가격**

| 구성 | 베이직 | 프로 |
|------|--------|------|
| 상의 | 33,000 | 38,000 |
| 하의 | 33,000 | 38,000 |
| 세트 | 60,000 | 70,000 |
| 상의2 + 하의1 | 80,000 | 90,000 |
| 상의2 + 하의2 | 100,000 | 110,000 |

**배구 유니폼 가격**

| 구성 | 프로 |
|------|------|
| 상의 | 38,000 |
| 하의 | 38,000 |
| 세트 | 70,000 |
| 상의2 + 하의1 | 90,000 |

**원단-등급 연결**

| 등급 | 원단명 | 비고 |
|------|--------|------|
| 베이직 | 플랫백메쉬+ | 가장 많이 사용 |
| 프로 | 컴포트헥사곤 | 고급 원단 |
| 어센틱 | 어센틱 | 선수지급용 |
| 양면 | 스퀘어메쉬 | 리버시블 전용 |

**마감 옵션 (가격 동일, 원가 다름)**

| 부위 | 옵션 A | 옵션 B |
|------|--------|--------|
| 상의 | 삼봉마감 (원가 10,000) | 암홀립 (원가 11,000) |
| 하의 | 트임X (원가 10,500) | 트임 (원가 12,000) |

**할인 체계**

| 할인 유형 | 적용 대상 | 할인율/가격 |
|----------|----------|-----------|
| 학교스포츠클럽 | 베이직/프로/양면 | 별도 고정가 (예: 베이직 세트 45,000원) |
| 신학기 프로모션 A | 베이직/프로 | 10% 할인 |
| 신학기 프로모션 B | 베이직/프로 | 15% 할인 |

**팀웨어 가격 (종목 구분 없음)**

| 품목 | 가격 | 원단 |
|------|------|------|
| 반집업 반팔 슈팅저지 | 45,000 | - |
| 반집업 긴팔 슈팅저지 | 50,000 | - |
| 풀집업 반팔 슈팅저지 | 50,000 | - |
| 풀집업 긴팔 슈팅저지 | 55,000 | - |
| 프로 긴팔 슈팅셔츠 | 40,000 | 컴포트헥사곤 |
| 베이직 반팔 전사티 | 30,000 | 플랫백메쉬+ |
| 프로 반팔 전사티 | 35,000 | 컴포트헥사곤 |
| 쿨메쉬 반팔 전사티 | 35,000 | 쿨메쉬 |
| 트랙탑 상의/하의 | 각 70,000 | 프리미엄메쉬 |
| 트랙탑 세트 | 120,000 | 프리미엄메쉬 |
| 후드 웜업 상의 | 80,000 | - |
| 후드 웜업 하의 | 70,000 | - |
| 후드 웜업 세트 | 130,000 | - |
| 캐주얼 반팔티 (코튼+) | 38,000 | 코튼+ |
| 캐주얼 후드집업 (기모) | 75,000 | 융기모 |
| 캐주얼 후드티 | 65,000 | - |
| 캐주얼 맨투맨 | 55,000 | - |

**사이즈 범위**

| 카테고리 | 사이즈 |
|---------|--------|
| 커스텀 유니폼/팀웨어 | 5XS ~ 5XL |
| 캐주얼 (코튼+) | 스탠다드 5XS~5XL, 슬림 XS~3XL |
| 캐주얼 (후드/맨투맨) | S~3XL 또는 M~3XL |
| 브랜드 | S~3XL |
| 배구 상의 (남/여) | 남 3XS~4XL / 여 3XS~2XL |

### 7-3. 갭 분석: 가격 시트 vs 현재 시스템

#### 현재 시스템에 있는 것 (유지)

| 항목 | 현재 구현 | 비고 |
|------|----------|------|
| 종목 선택 | basketball/soccer/volleyball/baseball/etc | OK |
| 품목 선택 | uniform/shooting_shirt/long_shooting/hoodie/tshirt/etc | 팀웨어 세분화 필요 |
| 원단 선택 | basic/pro/etc | 어센틱/양면/기타 원단 추가 필요 |
| 홈/어웨이 | home/away/both | OK |
| 수량 | 숫자 입력 | OK |
| 견적 표시 | 계산 결과 화면 표시 | OK (로직만 변경) |

#### 현재 시스템에 없는 것 (신규 필요)

| # | 항목 | 현재 | 가격 시트 | 영향도 |
|---|------|------|----------|--------|
| G-1 | **패키지 구성** | 세트/상의만/하의만 (3개) | 세트/상의/하의/상2하1/상2하2/양면+베이직하의/양면+프로하의/양면+양면하의 (8개+) | **높음** |
| G-2 | **가격표 참조 방식** | 배수 곱하기 | 구성별 고정가 테이블 | **높음** |
| G-3 | **등급(=원단) 세분화** | basic/pro/etc (3개) | basic/pro/authentic/reversible + 팀웨어별 원단 (7종+) | 중간 |
| G-4 | **마감 옵션** | 없음 | 삼봉/암홀립(상의), 트임/트임X(하의) | 낮음 (가격 동일) |
| G-5 | **할인 체계** | 없음 | 학교스포츠클럽, 신학기 프로모션 10%/15% | 중간 |
| G-6 | **팀웨어 카테고리** | hoodie/tshirt 정도 | 슈팅저지(4종)/전사티(3종)/트랙탑/후드웜업/캐주얼(4종) | 중간 |
| G-7 | **사이즈 다양화** | 고정 배열 | 커스텀/캐주얼/브랜드/배구 각각 다름 | 낮음 |
| G-8 | **브랜드 상품** | 없음 | 페가수스/오버글로우 완제품 (고정가) | 중간 |
| G-9 | **종목-등급 조합 제한** | 없음 (모든 조합 가능) | 농구만 어센틱/양면, 배구는 프로만 | 낮음 |

### 7-4. 새로운 카탈로그 데이터 구조 설계

**비유: 기존 구조가 "계산기"였다면, 새 구조는 "가격표 사전"입니다**

기존: `기본가 x 배수 x 배수 = 가격` (계산기로 곱하기)
변경: `종목 + 등급 + 구성을 찾으면 = 가격이 바로 나옴` (사전에서 찾기)

#### 카탈로그 JSON 구조 (settings 테이블 key='product_catalog')

```javascript
{
  // ===== 1. 종목 (기존 유지, 약간 확장) =====
  sports: [
    { id: 'basketball', label: '농구', icon: 'sports_basketball', sortOrder: 1, active: true },
    { id: 'soccer', label: '축구', icon: 'sports_soccer', sortOrder: 2, active: true },
    { id: 'volleyball', label: '배구', icon: 'sports_volleyball', sortOrder: 3, active: true },
    { id: 'teamwear', label: '팀웨어', icon: 'checkroom', sortOrder: 4, active: true },
    // 팀웨어를 별도 "종목"으로 분리 (종목 무관 품목이므로)
  ],

  // ===== 2. 등급 (기존 fabrics → grades로 개념 변경) =====
  // "원단"이 아니라 "등급"이 맞는 표현. 등급마다 원단이 정해져 있음
  grades: [
    { id: 'basic', label: '베이직', fabric: '플랫백메쉬+', sortOrder: 1, active: true },
    { id: 'pro', label: '프로', fabric: '컴포트헥사곤', sortOrder: 2, active: true },
    { id: 'authentic', label: '어센틱', fabric: '어센틱', sortOrder: 3, active: true },
    { id: 'reversible', label: '양면', fabric: '스퀘어메쉬', sortOrder: 4, active: true },
  ],

  // ===== 3. 품목 (기존 categories 확장) =====
  categories: [
    // --- 유니폼 (종목에 따라 등급 제한) ---
    { id: 'uniform', label: '유니폼', group: 'uniform', sortOrder: 1, active: true },
    // --- 팀웨어 (종목 무관) ---
    { id: 'shooting_halfzip_ss', label: '반집업 반팔 슈팅저지', group: 'teamwear', sortOrder: 10, active: true },
    { id: 'shooting_halfzip_ls', label: '반집업 긴팔 슈팅저지', group: 'teamwear', sortOrder: 11, active: true },
    { id: 'shooting_fullzip_ss', label: '풀집업 반팔 슈팅저지', group: 'teamwear', sortOrder: 12, active: true },
    { id: 'shooting_fullzip_ls', label: '풀집업 긴팔 슈팅저지', group: 'teamwear', sortOrder: 13, active: true },
    { id: 'shooting_pro_ls', label: '프로 긴팔 슈팅셔츠', group: 'teamwear', sortOrder: 14, active: true },
    { id: 'sublim_basic', label: '베이직 반팔 전사티', group: 'teamwear', sortOrder: 20, active: true },
    { id: 'sublim_pro', label: '프로 반팔 전사티', group: 'teamwear', sortOrder: 21, active: true },
    { id: 'sublim_coolmesh', label: '쿨메쉬 반팔 전사티', group: 'teamwear', sortOrder: 22, active: true },
    { id: 'tracktop_top', label: '트랙탑 웜업 상의', group: 'teamwear', sortOrder: 30, active: true },
    { id: 'tracktop_bottom', label: '트랙탑 웜업 하의', group: 'teamwear', sortOrder: 31, active: true },
    { id: 'tracktop_set', label: '트랙탑 웜업 세트', group: 'teamwear', sortOrder: 32, active: true },
    { id: 'hood_top', label: '후드 웜업 상의', group: 'teamwear', sortOrder: 40, active: true },
    { id: 'hood_bottom', label: '후드 웜업 하의', group: 'teamwear', sortOrder: 41, active: true },
    { id: 'hood_set', label: '후드 웜업 세트', group: 'teamwear', sortOrder: 42, active: true },
    { id: 'casual_tee', label: '캐주얼 반팔티', group: 'casual', sortOrder: 50, active: true },
    { id: 'casual_hoodie_zip', label: '캐주얼 후드집업', group: 'casual', sortOrder: 51, active: true },
    { id: 'casual_hoodie', label: '캐주얼 후드티', group: 'casual', sortOrder: 52, active: true },
    { id: 'casual_mtm', label: '캐주얼 맨투맨', group: 'casual', sortOrder: 53, active: true },
  ],

  // ===== 4. 구성 패키지 (핵심 변경!) =====
  // 기존: compositions.parts = [set, top, bottom] + multiplier
  // 변경: packages = 구체적인 조합 목록 (가격은 priceTable에서 참조)
  packages: [
    { id: 'top', label: '상의', topCount: 1, bottomCount: 0, sortOrder: 1, active: true },
    { id: 'bottom', label: '하의', topCount: 0, bottomCount: 1, sortOrder: 2, active: true },
    { id: 'set', label: '세트 (상의+하의)', topCount: 1, bottomCount: 1, sortOrder: 3, active: true },
    { id: 'top2_bottom1', label: '상의 2벌 + 하의 1벌', topCount: 2, bottomCount: 1, sortOrder: 4, active: true },
    { id: 'top2_bottom2', label: '상의 2벌 + 하의 2벌', topCount: 2, bottomCount: 2, sortOrder: 5, active: true },
    // 양면 전용 혼합 패키지
    { id: 'rev_top_basic_bottom', label: '양면 상의 + 베이직 하의', topCount: 1, bottomCount: 1, mixedGrade: 'basic', sortOrder: 10, active: true },
    { id: 'rev_top_pro_bottom', label: '양면 상의 + 프로 하의', topCount: 1, bottomCount: 1, mixedGrade: 'pro', sortOrder: 11, active: true },
    { id: 'rev_top_rev_bottom', label: '양면 상의 + 양면 하의', topCount: 1, bottomCount: 1, sortOrder: 12, active: true },
  ],

  // ===== 5. 가격표 (핵심 변경!) =====
  // 기존: basePrices + priceMultiplier (배수 곱하기)
  // 변경: 종목+등급+패키지 조합별 고정가
  //
  // 비유: 기존은 "기본가 x 배수 = 가격" 계산기 방식
  //       변경은 "이 조합을 찾으면 가격이 적혀있음" 사전 방식
  priceTable: {
    // 키 형식: "{sport}_{grade}_{package}"
    // 유니폼 가격
    "basketball_basic_top": 33000,
    "basketball_basic_bottom": 33000,
    "basketball_basic_set": 60000,
    "basketball_basic_top2_bottom1": 80000,
    "basketball_basic_top2_bottom2": 100000,

    "basketball_pro_top": 38000,
    "basketball_pro_bottom": 38000,
    "basketball_pro_set": 70000,
    "basketball_pro_top2_bottom1": 90000,
    "basketball_pro_top2_bottom2": 110000,

    "basketball_authentic_top": 50000,
    "basketball_authentic_bottom": 50000,
    "basketball_authentic_set": 90000,
    "basketball_authentic_top2_bottom2": 160000,

    "basketball_reversible_top": 40000,
    "basketball_reversible_bottom": 40000,
    "basketball_reversible_rev_top_basic_bottom": 70000,
    "basketball_reversible_rev_top_pro_bottom": 75000,
    "basketball_reversible_rev_top_rev_bottom": 80000,

    "soccer_basic_top": 33000,
    "soccer_basic_bottom": 33000,
    "soccer_basic_set": 60000,
    "soccer_basic_top2_bottom1": 80000,
    "soccer_basic_top2_bottom2": 100000,

    "soccer_pro_top": 38000,
    "soccer_pro_bottom": 38000,
    "soccer_pro_set": 70000,
    "soccer_pro_top2_bottom1": 90000,
    "soccer_pro_top2_bottom2": 110000,

    "volleyball_pro_top": 38000,
    "volleyball_pro_bottom": 38000,
    "volleyball_pro_set": 70000,
    "volleyball_pro_top2_bottom1": 90000,

    // 팀웨어 가격: 종목/등급 무관, 품목 자체가 가격 결정
    // 키 형식: "teamwear__{category}"
    "teamwear__shooting_halfzip_ss": 45000,
    "teamwear__shooting_halfzip_ls": 50000,
    "teamwear__shooting_fullzip_ss": 50000,
    "teamwear__shooting_fullzip_ls": 55000,
    "teamwear__shooting_pro_ls": 40000,
    "teamwear__sublim_basic": 30000,
    "teamwear__sublim_pro": 35000,
    "teamwear__sublim_coolmesh": 35000,
    "teamwear__tracktop_top": 70000,
    "teamwear__tracktop_bottom": 70000,
    "teamwear__tracktop_set": 120000,
    "teamwear__hood_top": 80000,
    "teamwear__hood_bottom": 70000,
    "teamwear__hood_set": 130000,
    "teamwear__casual_tee": 38000,
    "teamwear__casual_hoodie_zip": 75000,
    "teamwear__casual_hoodie": 65000,
    "teamwear__casual_mtm": 55000,
  },

  // ===== 6. 종목-등급 허용 조합 =====
  // 어떤 종목에서 어떤 등급을 선택할 수 있는지 제한
  sportGradeMap: {
    basketball: ['basic', 'pro', 'authentic', 'reversible'],
    soccer: ['basic', 'pro'],
    volleyball: ['pro'],
    // teamwear는 등급 선택 없음 (품목 자체가 가격 결정)
  },

  // ===== 7. 등급-패키지 허용 조합 =====
  // 어떤 등급에서 어떤 패키지를 선택할 수 있는지 제한
  gradePackageMap: {
    basic: ['top', 'bottom', 'set', 'top2_bottom1', 'top2_bottom2'],
    pro: ['top', 'bottom', 'set', 'top2_bottom1', 'top2_bottom2'],
    authentic: ['top', 'bottom', 'set', 'top2_bottom2'],
    reversible: ['top', 'bottom', 'rev_top_basic_bottom', 'rev_top_pro_bottom', 'rev_top_rev_bottom'],
  },

  // ===== 8. 마감 옵션 (선택사항, 가격에 영향 없음) =====
  finishOptions: {
    top: [
      { id: 'sambong', label: '삼봉마감', sortOrder: 1, active: true },
      { id: 'armhole', label: '암홀립', sortOrder: 2, active: true },
    ],
    bottom: [
      { id: 'no_slit', label: '트임X', sortOrder: 1, active: true },
      { id: 'slit', label: '트임', sortOrder: 2, active: true },
    ],
  },

  // ===== 9. 할인 정책 =====
  discounts: [
    { id: 'school_sports_club', label: '학교스포츠클럽', type: 'fixed_price', active: true,
      description: '학교스포츠클럽 대상 특별 단가 적용' },
    { id: 'promo_10', label: '신학기 프로모션 10%', type: 'percent', value: 10, active: false,
      description: '신학기 프로모션 기간 10% 할인' },
    { id: 'promo_15', label: '신학기 프로모션 15%', type: 'percent', value: 15, active: false,
      description: '신학기 프로모션 기간 15% 할인' },
  ],

  // 학교스포츠클럽 전용 가격표 (할인 type='fixed_price'일 때 사용)
  discountPriceTable: {
    "basketball_basic_top": 25000,
    "basketball_basic_bottom": 25000,
    "basketball_basic_set": 45000,
    "basketball_basic_top2_bottom1": 65000,
    "basketball_basic_top2_bottom2": 85000,
    "basketball_pro_top": 30000,
    "basketball_pro_bottom": 30000,
    "basketball_pro_set": 50000,
    "basketball_pro_top2_bottom1": 75000,
    "basketball_pro_top2_bottom2": 95000,
    "basketball_reversible_top": 35000,
    "basketball_reversible_rev_top_basic_bottom": 55000,
    "basketball_reversible_rev_top_pro_bottom": 60000,
    // ... 나머지 조합
  },

  // ===== 10. 사이즈 (카테고리별 분리) =====
  sizePresets: {
    custom: ['5XS','4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL'],
    casual_standard: ['5XS','4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL'],
    casual_slim: ['XS','S','M','L','XL','2XL','3XL'],
    casual_hood: ['S','M','L','XL','2XL','3XL'],
    brand: ['S','M','L','XL','2XL','3XL'],
    volleyball_men: ['3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL'],
    volleyball_women: ['3XS','2XS','XS','S','M','L','XL','2XL'],
  },

  // 품목 → 사이즈 프리셋 연결
  categorySizeMap: {
    uniform: 'custom',
    casual_tee: 'casual_standard',  // 스탠다드/슬림 두 종류 제공
    casual_hoodie_zip: 'casual_hood',
    casual_hoodie: 'casual_hood',
    casual_mtm: 'casual_hood',
    // 나머지 팀웨어: 'custom' 기본
  },

  // ===== 11. 홈/어웨이 (기존 유지) =====
  homeAway: [
    { id: 'home', label: '홈만', multiplier: 1, sortOrder: 1, active: true },
    { id: 'away', label: '어웨이만', multiplier: 1, sortOrder: 2, active: true },
    { id: 'both', label: '홈+어웨이', multiplier: 2, sortOrder: 3, active: true },
  ],
}
```

### 7-5. 새로운 견적 계산 로직

**기존 (배수 곱하기 방식):**
```
견적 = basePrices[품목] x fabricMul x partsMul x typeMul x homeAwayMul x 수량
```

**변경 (가격표 참조 방식):**
```javascript
function calculateEstimate(sport, grade, package, homeAway, quantity, discount) {
  // 1단계: 가격표에서 단가 찾기
  const key = `${sport}_${grade}_${package}`;
  let unitPrice = priceTable[key];

  // 팀웨어인 경우 별도 키 형식
  if (sport === 'teamwear') {
    unitPrice = priceTable[`teamwear__${category}`];
  }

  // 가격표에 없는 조합이면 "별도 상담"
  if (!unitPrice) return { price: 0, note: '별도 상담이 필요합니다' };

  // 2단계: 할인 적용
  if (discount) {
    if (discount.type === 'fixed_price') {
      unitPrice = discountPriceTable[key] || unitPrice;
    } else if (discount.type === 'percent') {
      unitPrice = Math.round(unitPrice * (1 - discount.value / 100));
    }
  }

  // 3단계: 홈/어웨이 배수 (세트류만 적용)
  const homeAwayMul = homeAway === 'both' ? 2 : 1;

  // 4단계: 최종 계산
  return {
    unitPrice: unitPrice,
    homeAwayMultiplier: homeAwayMul,
    quantity: quantity,
    total: unitPrice * homeAwayMul * quantity,
  };
}
```

**비유:**
- 기존 = 계산기에 숫자를 넣고 곱하기 (편리하지만 실제 가격과 안 맞을 수 있음)
- 변경 = 가격표 책에서 해당 페이지를 찾아서 가격을 읽기 (항상 정확)

### 7-6. 주문 위자드 흐름 변경 계획

#### 현재 6단계

```
Step 1: 종목 선택 → Step 2: 품목 선택 → Step 3: 원단 선택
→ Step 4: 구성+견적 → Step 5: 주문자정보 → Step 6: 확인+제출
```

#### 변경 후 7단계

```
Step 1: 종목 선택          ← 거의 동일 (팀웨어 추가)
Step 2: 품목 선택          ← 종목에 따라 다른 품목 표시 (유니폼 vs 팀웨어)
Step 3: 등급 선택 (신규!)   ← 기존 "원단 선택"을 "등급 선택"으로 변경
                             유니폼일 때만 표시 (팀웨어는 스킵)
Step 4: 패키지 구성        ← 핵심 변경! 등급에 따라 가능한 패키지 표시
                             + 마감 옵션 (삼봉/암홀립, 트임/트임X)
                             + 할인 적용
Step 5: 견적 확인          ← 가격표 참조 방식으로 표시
Step 6: 주문자 정보         ← 기존 동일
Step 7: 최종 확인 + 제출    ← 기존 동일
```

#### 단계별 상세 변경

**Step 1 (종목) 변경점:**
- "팀웨어" 종목 카드 추가
- 팀웨어 선택 시 Step 2에서 팀웨어 품목만 표시

**Step 2 (품목) 변경점:**
- 종목이 유니폼인 경우: "유니폼" 카드 1개만 표시 (등급은 Step 3에서)
- 종목이 팀웨어인 경우: 슈팅저지/전사티/트랙탑/후드웜업/캐주얼 그룹별 표시
- 팀웨어 선택 시 Step 3 스킵 → 바로 Step 5 (견적)로 이동

**Step 3 (등급) 변경점 (기존 "원단 선택" 대체):**
- sportGradeMap에서 해당 종목의 가능한 등급만 표시
- 각 등급 카드에 원단 이름 표시 (예: "베이직 (플랫백메쉬+)")
- 등급별 대표 가격 표시 (예: "세트 60,000원~")
- 팀웨어일 때는 이 단계를 자동 스킵

**Step 4 (패키지 구성) 핵심 변경:**
```
현재:
  [상의+하의 세트] [상의만] [하의만]  ← 3개 토글

변경:
  ┌─────────────────────────────────────────────┐
  │  패키지를 선택하세요                            │
  │                                             │
  │  [상의]  [하의]  [세트(상+하)]                  │
  │  [상의 2벌 + 하의 1벌]  [상의 2벌 + 하의 2벌]   │
  │                                             │
  │  (양면 등급일 때 추가 표시)                      │
  │  [양면상의 + 베이직하의]  [양면상의 + 프로하의]    │
  │  [양면상의 + 양면하의]                          │
  │                                             │
  │  마감 옵션 (선택)                              │
  │  상의: [삼봉마감] [암홀립]                       │
  │  하의: [트임X]   [트임]                         │
  │                                             │
  │  할인 적용 (해당 시)                            │
  │  [ ] 학교스포츠클럽                             │
  │                                             │
  │  홈/어웨이: [홈만] [어웨이만] [홈+어웨이]          │
  │  수량: [  15  ] 벌                            │
  │                                             │
  │  예상 단가: 60,000원/벌                        │
  │  예상 총액: 900,000원                          │
  └─────────────────────────────────────────────┘
```

**Step 5 (견적) 변경점:**
- 배수 계산 대신 priceTable에서 직접 조회
- 할인 적용 내역 표시
- "가격표에 없는 조합" → "별도 상담 필요" 메시지

### 7-7. orders.data.items 구조 변경

```javascript
// 기존 items 구조
items: [{
  sport: '농구',
  category: '유니폼',
  fabric: '기본원단',          // ← "등급"으로 개념 변경
  composition: {
    homeAway: 'both',
    parts: 'set',             // ← 3개 옵션만
    type: 'single',           // ← 단면/양면이 여기에 있었음
  },
  quantity: 15,
  unitPrice: 50000,
}]

// 변경 후 items 구조
items: [{
  sport: 'basketball',         // ID 사용 (라벨이 아닌)
  category: 'uniform',         // ID 사용
  grade: 'basic',              // [변경] fabric → grade
  gradeLabel: '베이직',         // 표시용 라벨
  fabric: '플랫백메쉬+',        // 실제 원단명 (grade에서 자동 결정)
  package: 'set',              // [변경] composition.parts+type → package
  packageLabel: '세트 (상의+하의)',
  finish: {                    // [신규] 마감 옵션
    top: 'sambong',            // 삼봉마감 | 암홀립
    bottom: 'no_slit',         // 트임X | 트임
  },
  homeAway: 'both',            // [이동] composition에서 최상위로
  discount: null,              // [신규] 적용된 할인 { id, label, type, value }
  quantity: 15,
  unitPrice: 60000,            // 가격표에서 조회한 단가
  totalAmount: 1800000,        // unitPrice x homeAwayMul x quantity
}]
```

### 7-8. 관리자 카탈로그 UI 변경

admin-catalog.html의 기존 5개 탭을 확장:

```
기존 탭: [종목] [품목] [원단] [구성옵션] [가격]

변경 탭: [종목] [품목] [등급] [패키지] [가격표] [마감] [할인] [사이즈]
```

핵심 변경은 **[가격표]** 탭:

```
┌─────────────────────────────────────────────────┐
│  [가격표] 탭                                      │
│                                                 │
│  종목 필터: [전체] [농구] [축구] [배구] [팀웨어]     │
│                                                 │
│  ■ 농구 유니폼 가격표                              │
│  ┌────────────────────────────────────────────┐ │
│  │ 구성＼등급     │ 베이직 │ 프로  │ 어센틱 │ 양면 │ │
│  │──────────────┼────────┼──────┼───────┼──── │ │
│  │ 상의          │ 33,000│38,000│50,000│40,000│ │
│  │ 하의          │ 33,000│38,000│50,000│40,000│ │
│  │ 세트          │ 60,000│70,000│90,000│  -  │ │
│  │ 상의2+하의1    │ 80,000│90,000│  -  │  -  │ │
│  │ 상의2+하의2    │100,000│110,000│160,000│ -  │ │
│  │ 양면+베이직하의 │  -   │  -  │  -  │70,000│ │
│  │ 양면+프로하의   │  -   │  -  │  -  │75,000│ │
│  │ 양면+양면하의   │  -   │  -  │  -  │80,000│ │
│  └────────────────────────────────────────────┘ │
│  [셀 클릭하여 가격 수정]  "-"는 해당 조합 불가       │
│                                                 │
│  ■ 팀웨어 가격표                                  │
│  ┌──────────────────────────────┐              │
│  │ 품목              │ 가격     │               │
│  │ 반집업 반팔 슈팅저지 │ 45,000 │              │
│  │ ...               │ ...    │              │
│  └──────────────────────────────┘              │
│                                                 │
│  [견적 시뮬레이션]                                │
│  농구 / 프로 / 세트 / 홈+어웨이 / 15벌             │
│  = 70,000 x 2 x 15 = 2,100,000원               │
│                                                 │
│  [저장]                                          │
└─────────────────────────────────────────────────┘
```

### 7-9. 브랜드 상품 처리 방안

가격 시트의 BRAND 영역(line 2~48)은 현재 주문 시스템과 **별개**입니다:

| 구분 | BRAND | CUSTOM |
|------|-------|--------|
| 성격 | 완제품 (고정 디자인) | 커스텀 제작 (디자인 주문) |
| 판매처 | 카페24 쇼핑몰 (list.html) | 주문 위자드 (order-custom.html) |
| 가격 | 고정가 (85,000/55,000원) | 구성별 변동가 |
| 사이즈 | S~3XL | 5XS~5XL |

**결론:** BRAND 상품은 이번 고도화 범위에서 제외. 카페24 쇼핑몰의 기존 product-data.js에서 관리하는 것이 적합. 추후 필요 시 카탈로그에 "브랜드" 카테고리를 추가할 수 있음.

### 7-10. 수정 파일 목록 + 실행 계획

#### 수정 대상 파일

| 파일 경로 | 역할 | 신규/수정 | 변경 내용 |
|----------|------|----------|----------|
| server/server.js | 카탈로그 시딩 데이터 | 수정 | 초기 시딩 JSON을 새 구조로 교체 |
| server/routes/catalog.js | 카탈로그 API | 수정 | 응답 구조 변경 없음 (JSON 통째로 반환) |
| js/admin-catalog.js | 카탈로그 관리 UI | 수정(대) | 5탭 → 8탭, 가격표 매트릭스 편집 UI |
| admin-catalog.html | 카탈로그 관리 HTML | 수정(중) | 탭 추가, 가격표 테이블 템플릿 |
| js/order-custom.js | 주문 위자드 로직 | 수정(대) | 7단계 흐름, 가격표 참조 견적 |
| order-custom.html | 주문 위자드 HTML | 수정(중) | Step 3 변경, Step 4 확장, Step 7 추가 |

#### 실행 계획

| 순서 | 작업 | 담당 | 선행 조건 | 예상 시간 |
|------|------|------|----------|----------|
| 1 | 카탈로그 JSON 구조 교체: 시딩 데이터를 새 구조로 변경 (server.js) | developer | 없음 | 30분 |
| 2 | 관리자 가격표 UI: admin-catalog 탭 확장 + 매트릭스 편집 | developer | 1 | 2시간 |
| 3 | 주문 위자드 흐름 변경: 7단계 + 가격표 참조 견적 | developer | 1 | 2시간 |
| 4 | 기존 주문 호환성: orders.data.items 구조 변경이 기존 주문 표시에 영향 없는지 확인 | tester | 2, 3 | 30분 |
| 5 | 통합 테스트: 주문 생성 → 가격 확인 → 관리자 조회 | tester + reviewer (병렬) | 4 | 1시간 |

**총 예상 시간: 약 6시간**

### 7-11. 기술 결정

| # | 결정 | 이유 |
|---|------|------|
| D-46 | 가격 체계: 배수 곱하기 → 가격표 참조 방식 | 실제 가격이 배수로 안 맞음. 세트 60,000 != 상의 33,000 + 하의 33,000 |
| D-47 | 원단→등급 개념 변경: fabrics → grades | 원단은 등급에 종속(베이직=플랫백메쉬+). "등급 선택"이 고객에게 직관적 |
| D-48 | 구성→패키지 변경: parts+type → packages | "상의2+하의1" 같은 구체적 조합이 가격표의 단위. 배수 조합이 아님 |
| D-49 | 가격표 키: "{sport}_{grade}_{package}" | 3차원 매트릭스의 자연스러운 평탄화. 관리자가 직접 편집 가능 |
| D-50 | 팀웨어를 종목으로 분리 | 팀웨어는 종목/등급 구분 없이 품목 자체가 가격 결정. 유니폼과 다른 흐름 |
| D-51 | 마감 옵션: 가격에 영향 없음, 기록용 | 삼봉/암홀립은 판매가 동일. 원가만 다르므로 제작 참고용으로 기록 |
| D-52 | 할인: 학교스포츠클럽=별도 가격표, 프로모션=% 할인 | 학교스포츠클럽은 구성별 별도 단가, 프로모션은 단순 비율 할인 |
| D-53 | 브랜드 상품: 이번 범위 제외 | 완제품은 카페24 쇼핑몰에서 관리. 커스텀 주문과 채널이 다름 |
| D-54 | 기존 주문 하위호환: items 구조 변경되어도 기존 주문 표시에 영향 없음 | data JSON blob이라 새 필드 추가/변경해도 기존 데이터는 그대로 유지 |

### 7-12. 주의사항 (developer 필독)

1. **기존 주문 깨뜨리지 말 것**: 새 카탈로그 구조는 새 주문에만 적용. 기존 orders.data.items의 fabric/composition 필드를 읽는 코드(admin.js, admin-order.js)가 있다면 하위호환 처리 필요
2. **priceTable에 없는 조합 = "별도 상담"**: 모든 조합에 가격이 있는 게 아님. null/undefined 처리 필수
3. **팀웨어 흐름이 유니폼과 다름**: 팀웨어 선택 시 등급/패키지 단계를 스킵해야 함. 조건부 단계 이동 로직 필요
4. **할인은 관리자가 활성화**: discounts[].active 플래그로 프로모션 ON/OFF. 고객 위자드에서 active인 할인만 표시
5. **가격 시트의 "축구 프로 없애야함" 메모**: 축구 프로 상의 행의 원가 열에 "축구 프로 없애야함"이라는 메모가 있음. 일단 데이터에는 포함하되, 관리자가 active:false로 비활성화할 수 있도록 처리
6. **가격 시트의 "쿨메쉬 없애자고 하심" 메모**: 쿨메쉬 반팔 전사티도 비활성화 후보. active 플래그로 처리
7. **양면 하의 가격 "확인후 연락"**: 양면 하의 단품의 원가가 "확인후 연락"으로 되어있음. 판매가 40,000원은 설정하되, 원가 정보 참고용 메모 필요

---


## Part 8: 자체 상품 등록/관리 시스템 (2026-04-06 전면 재설계)

> 카페24(stiz.kr)를 대체하는 완전한 자체 상품 관리 시스템.
> 카페24는 앞으로 사용하지 않으므로, STIZ 사이트에서 상품 등록/관리/진열/판매까지 모두 처리한다.
> 기존 Part 8(카페24 연동)을 폐기하고 "자체 독립 시스템"으로 전면 교체.

### 8-1. 배경: 왜 자체 시스템인가?

**비유: 임대 매장에서 자기 건물로 이사**

- 기존 = 카페24라는 "임대 매장"에서 장사. 월세(수수료)도 내고, 인테리어(디자인)도 마음대로 못 바꿈
- 새 방향 = "자기 건물"(STIZ 자체 사이트)에서 직접 장사. 상품 등록, 진열, 결제, 배송 모두 자체 처리
- 핵심 변화: 카페24는 "데이터 가져올 곳"이 아니라, "이전할 데이터가 있는 곳"

**현재 상태:**
| 항목 | 현재 | 목표 |
|------|------|------|
| 상품 등록 | 카페24 관리자에서 등록 | STIZ 관리자에서 직접 등록 |
| 상품 진열 | 카페24 쇼핑몰 (stiz.kr) | STIZ 자체 쇼핑몰 페이지 (list.html, detail.html) |
| 결제 | 카페24 PG | 자체 PG 연동 (Part 9 후보) 또는 계좌이체 |
| 고객 회원 | 카페24 회원 시스템 | STIZ 자체 인증 (이미 있음: auth.js) |
| 주문 관리 | 카페24 주문 + STIZ 주문(커스텀) | STIZ 통합 주문 관리 |
| 상품 데이터 | product-data.js (31개 Mock) | DB products 테이블 (수백 개 실제 상품) |

### 8-2. 전체 아키텍처 (Part 1)

**비유: 건물 전체 안내도**

```
                        +-------------------------+
                        |     관리자 (사장님)        |
                        |  admin-products.html     |
                        |  상품 등록/수정/삭제       |
                        |  카테고리 관리             |
                        |  이미지 업로드             |
                        |  재고 관리                |
                        +-----------+-------------+
                                    | API
                        +-----------v-------------+
                        |      서버 (Express)       |
                        |  routes/products.js      |
                        |  products 테이블 (SQLite) |
                        |  product_categories 테이블|
                        |  product_images 테이블    |
                        |  uploads/products/ 폴더  |
                        +-----------+-------------+
                                    | API
           +------------------------v------------------------+
           |              고객 (쇼핑몰 프론트)                  |
           |                                                 |
           |  list.html          detail.html     basket.html |
           |  (카테고리별 목록)   (상품 상세)      (장바구니)    |
           |        |                |                |      |
           |        +----------------+----------------+      |
           |                         v                       |
           |              order.html (주문/결제)               |
           |              - 기성품: 바로 구매                   |
           |              - 커스텀: 시안 요청 (기존 흐름)        |
           +-------------------------------------------------+
```

**두 가지 구매 경로:**
| 구매 유형 | 흐름 | 예시 |
|----------|------|------|
| 기성품 구매 | 상품 목록 - 상세 - 사이즈/수량 선택 - 장바구니 - 결제 | 오버글로우 후디, 페가수스 저지 |
| 커스텀 주문 | custom.html - 주문 위자드 - 시안 요청 - 시안 확인 - 결제 | 팀 유니폼 제작 (기존 Part 1~6 흐름) |

### 8-3. DB 설계 (Part 2)

**비유: 엑셀 파일 저장소의 시트 구조**

기존 Part 8에서는 settings 테이블에 JSON으로 저장했지만, 카페24를 완전히 대체하려면 상품 수가 수백 개로 늘어나고, 이미지/옵션/재고 등 복잡한 데이터를 다뤄야 합니다.

**결정 변경: settings JSON --> 전용 테이블 (D-55 폐기, D-60 신설)**

| 비교 | settings JSON (기존 Part 8) | 전용 테이블 (새 Part 8) |
|------|---------------------------|----------------------|
| 상품 수 | 47개 (BRAND만) | 수백 개 (전체 카테고리) |
| 이미지 | URL 1개 | 여러 장 업로드 + 순서 관리 |
| 옵션 | 사이즈만 | 사이즈 + 색상 + 조합별 재고 |
| 검색 | 전체 JSON 로드 - JS 필터 | SQL WHERE 절로 빠른 검색 |
| 재고 | 불필요 | 필요 (실제 판매) |
| 카테고리 | 고정 7개 | 관리자가 자유 추가/수정 |

#### 테이블 1: product_categories (카테고리 = "매장의 코너/구역")

```sql
CREATE TABLE product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- "농구의류", "SHIRTS" 등
  slug TEXT UNIQUE NOT NULL,       -- URL용: "basketball", "shirts"
  parentId INTEGER,                -- 상위 카테고리 (대분류/중분류)
  sortOrder INTEGER DEFAULT 0,     -- 진열 순서
  isActive INTEGER DEFAULT 1,      -- 1=표시, 0=숨김
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (parentId) REFERENCES product_categories(id)
);
```

**초기 카테고리 (카페24 20개 - STIZ 정리):**

| 대분류 | 중분류 (slug) | 카페24 대응 |
|--------|-------------|------------|
| 스포츠웨어 | 농구의류 (basketball) | BASKETBALL |
| 스포츠웨어 | 축구의류 (soccer) | SOCCER |
| 스포츠웨어 | 팀웨어 (teamwear) | TEAMWEAR |
| 스포츠웨어 | 컴프레션 (compression) | 컴프레션 |
| 스포츠웨어 | 연습복 (practice) | 연습복 |
| 캐주얼 | 티셔츠 (shirts) | SHIRTS |
| 캐주얼 | 후디 (hoodie) | HOODIE |
| 캐주얼 | 맨투맨 (mtm) | MTM |
| 캐주얼 | 하의 (bottom) | BOTTOM |
| 용품 | 악세서리 (accessories) | 악세서리 |
| 용품 | 스포츠용품 (equipment) | 용품 |
| 기획전 | MD제품 (md-picks) | MD제품 |
| 기획전 | 시즌오프 (sale) | 시즌오프 |
| 파트너 | MOLTEN (molten) | MOLTEN |
| 파트너 | 잠스트 (zamst) | 잠스트 |
| 파트너 | 단체결제 (bulk-order) | 단체결제 |

#### 테이블 2: products (상품 = "진열장의 개별 상품")

```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productCode TEXT UNIQUE NOT NULL,  -- STIZ 제품코드 (PGS25T1BAL001)
  name TEXT NOT NULL,                -- 한글 상품명
  nameEn TEXT,                       -- 영문 상품명
  description TEXT,                  -- 상품 간략 설명
  detailHtml TEXT,                   -- 상세 설명 (HTML, 상세페이지)
  categoryId INTEGER NOT NULL,       -- 카테고리 FK
  brand TEXT DEFAULT 'stiz',         -- 브랜드: stiz/pegasus/overglow/molten 등

  -- 가격 정보
  retailPrice INTEGER,               -- 판매가
  costPrice INTEGER,                 -- 원가 (관리자 전용)
  wholesalePrice INTEGER,            -- 도매가
  schoolSportsPrice INTEGER,         -- 학교스포츠클럽가
  discountRate INTEGER DEFAULT 0,    -- 할인율 (%)
  discountPrice INTEGER,             -- 할인가 (자동 계산 또는 수동)

  -- 상태
  status TEXT DEFAULT 'draft',       -- draft/active/soldout/hidden
  isNew INTEGER DEFAULT 0,           -- 신상품 배지
  isBest INTEGER DEFAULT 0,          -- 베스트 배지
  isFeatured INTEGER DEFAULT 0,      -- 메인 추천

  -- 메타
  fabric TEXT,                       -- 원단 정보
  keywords TEXT,                     -- 검색 키워드 (JSON 배열)
  sortOrder INTEGER DEFAULT 0,       -- 진열 순서
  viewCount INTEGER DEFAULT 0,       -- 조회수
  salesCount INTEGER DEFAULT 0,      -- 판매수

  -- 배송
  shippingFee INTEGER DEFAULT 0,     -- 배송비 (0=무료)
  shippingInfo TEXT,                 -- 배송 안내 텍스트

  -- 타임스탬프
  releasedAt TEXT,                   -- 출시일
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (categoryId) REFERENCES product_categories(id)
);

-- 검색 성능을 위한 인덱스
CREATE INDEX idx_products_category ON products(categoryId);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_brand ON products(brand);
```

#### 테이블 3: product_options (옵션 = "사이즈/색상 조합")

```sql
CREATE TABLE product_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productId INTEGER NOT NULL,
  optionType TEXT NOT NULL,          -- 'size' 또는 'color'
  optionValue TEXT NOT NULL,         -- 'L', 'XL', 'Black', 'White' 등
  stock INTEGER DEFAULT 0,           -- 해당 옵션의 재고
  additionalPrice INTEGER DEFAULT 0, -- 추가 금액 (특수 사이즈 등)
  sortOrder INTEGER DEFAULT 0,
  isActive INTEGER DEFAULT 1,
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_options_product ON product_options(productId);
```

#### 테이블 4: product_images (이미지 = "상품 사진첩")

```sql
CREATE TABLE product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productId INTEGER NOT NULL,
  imageUrl TEXT NOT NULL,            -- /uploads/products/PGS25T1BAL001_1.jpg
  imageType TEXT DEFAULT 'gallery',  -- 'thumbnail' (대표) / 'gallery' (갤러리) / 'detail' (상세)
  sortOrder INTEGER DEFAULT 0,       -- 표시 순서
  altText TEXT,                      -- 이미지 설명 (접근성)
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_images_product ON product_images(productId);
```

#### 왜 4개 테이블인가?

| 테이블 | 없으면 어떻게 되나? | 비유 |
|--------|------------------|------|
| product_categories | 모든 상품이 한 더미. 분류 불가 | 서점에서 장르 구분 없이 책을 쌓아놓은 것 |
| products | 상품 자체가 없음 | 빈 진열장 |
| product_options | 사이즈/색상별 재고 관리 불가 | "L 사이즈 재고가 있나요?" 에 답 못 함 |
| product_images | 상품 사진이 1장뿐. 여러 각도/상세 불가 | 카탈로그에 대표 사진 1장만 있는 것 |

### 8-4. API 설계 (Part 3)

**비유: 매장의 "주문 창구"**

#### 공개 API (고객용 - 인증 불필요)

| # | 메서드 | 엔드포인트 | 역할 | 비고 |
|---|--------|-----------|------|------|
| 1 | GET | `/api/products` | 상품 목록 (active만) | 필터: ?category=basketball&brand=pegasus&sort=newest&page=1&limit=20 |
| 2 | GET | `/api/products/:productCode` | 상품 상세 (이미지+옵션 포함) | URL 파라미터로 제품코드 사용 |
| 3 | GET | `/api/products/categories` | 카테고리 목록 (isActive만) | 트리 구조로 반환 |
| 4 | GET | `/api/products/featured` | 메인 추천 상품 | index.html 베스트셀러/신상품용 |

#### 관리자 API (인증 필요)

| # | 메서드 | 엔드포인트 | 역할 | 비고 |
|---|--------|-----------|------|------|
| 5 | GET | `/api/admin/products` | 전체 상품 목록 (전 상태, 원가 포함) | 관리자 상품 목록 |
| 6 | POST | `/api/admin/products` | 상품 신규 등록 | multipart/form-data (이미지 포함) |
| 7 | PUT | `/api/admin/products/:id` | 상품 수정 | 부분 수정 가능 |
| 8 | DELETE | `/api/admin/products/:id` | 상품 삭제 (soft delete - hidden) | 실제 삭제 아님 |
| 9 | POST | `/api/admin/products/:id/images` | 이미지 업로드 | 여러 장 한번에 |
| 10 | DELETE | `/api/admin/products/:id/images/:imageId` | 이미지 삭제 | 개별 삭제 |
| 11 | PUT | `/api/admin/products/:id/images/order` | 이미지 순서 변경 | sortOrder 업데이트 |
| 12 | GET | `/api/admin/products/categories` | 카테고리 전체 (비활성 포함) | 관리자용 |
| 13 | POST | `/api/admin/products/categories` | 카테고리 추가 | |
| 14 | PUT | `/api/admin/products/categories/:id` | 카테고리 수정 | |
| 15 | DELETE | `/api/admin/products/categories/:id` | 카테고리 삭제 | 하위 상품 있으면 거부 |
| 16 | POST | `/api/admin/products/import` | CSV 일괄 가져오기 | price-sheet.csv 파싱 |
| 17 | PATCH | `/api/admin/products/:id/status` | 상태 변경 (active/hidden/soldout) | 빠른 토글 |

#### API 응답 예시

**GET /api/products?category=basketball (공개 - 고객용)**
```javascript
{
  products: [
    {
      id: 1,
      productCode: "PGS25T1BAL001",
      name: "페가수스 어센틱 홈",
      nameEn: "25/26 PGS HOME AUTHENTIC JSY",
      description: "25/26 시즌 페가수스 홈 유니폼 선수지급용",
      categoryId: 1,
      categoryName: "농구의류",
      brand: "pegasus",
      retailPrice: 85000,
      discountRate: 0,
      discountPrice: null,
      isNew: true,
      isBest: false,
      thumbnail: "/uploads/products/PGS25T1BAL001_thumb.jpg",
      // 원가/도매가 절대 미포함
    }
  ],
  pagination: { page: 1, limit: 20, total: 47, totalPages: 3 },
  categories: [
    { id: 1, name: "농구의류", slug: "basketball", count: 12 }
  ]
}
```

**GET /api/products/PGS25T1BAL001 (공개 - 상세)**
```javascript
{
  product: {
    id: 1,
    productCode: "PGS25T1BAL001",
    name: "페가수스 어센틱 홈",
    nameEn: "25/26 PGS HOME AUTHENTIC JSY",
    description: "25/26 시즌 페가수스 홈 유니폼 선수지급용",
    detailHtml: "<div>...</div>",
    category: { id: 1, name: "농구의류", slug: "basketball" },
    brand: "pegasus",
    retailPrice: 85000,
    discountRate: 0,
    discountPrice: null,
    fabric: "어센틱",
    shippingFee: 0,
    shippingInfo: "주문 후 2~3일 이내 출고",
    options: {
      sizes: [
        { value: "S", stock: 10, additionalPrice: 0 },
        { value: "M", stock: 15, additionalPrice: 0 },
        { value: "L", stock: 20, additionalPrice: 0 },
        { value: "XL", stock: 8, additionalPrice: 0 },
        { value: "2XL", stock: 5, additionalPrice: 2000 },
        { value: "3XL", stock: 3, additionalPrice: 2000 }
      ],
      colors: [
        { value: "White", stock: 30, additionalPrice: 0 },
        { value: "Navy", stock: 25, additionalPrice: 0 }
      ]
    },
    images: [
      { id: 1, url: "/uploads/products/PGS25T1BAL001_1.jpg", type: "thumbnail" },
      { id: 2, url: "/uploads/products/PGS25T1BAL001_2.jpg", type: "gallery" },
      { id: 3, url: "/uploads/products/PGS25T1BAL001_3.jpg", type: "gallery" }
    ],
    viewCount: 234,
    salesCount: 45,
    releasedAt: "2026-03-01",
    isNew: true,
    isBest: false
  },
  relatedProducts: [ /* 같은 카테고리 상품 4개 */ ]
}
```

### 8-5. 관리자 UI 설계 (Part 4)

**비유: 매장 뒤편의 재고 관리실**

기존 admin-catalog.html은 "커스텀 주문 카탈로그 설정"이므로, 상품 관리는 별도 페이지로 분리.

#### 새 페이지: admin-products.html

```
admin-products.html -- 상품 관리
+--------------------------------------------------------------+
|  [주문관리] [매출분석] [고객관리] [상품관리] [카탈로그설정]       |
|  ============================================================ |
|                                                              |
|  상품 관리                                      [+ 상품 등록]  |
|  ------                                                      |
|                                                              |
|  검색: [________________________] [검색]                      |
|  필터: [전체 카테고리 v] [전체 브랜드 v] [전체 상태 v]           |
|  정렬: [최신순 v]                                             |
|                                                              |
|  +-----+------------+--------------+-------+------+------+  |
|  | 사진 | 제품코드     | 상품명        | 판매가 | 재고 | 상태 |  |
|  +-----+------------+--------------+-------+------+------+  |
|  |[img] |PGS25T1BAL001|페가수스 어센틱홈|85,000 | 61  |판매중|  |
|  |[img] |OVG25FWHD001 |OG 칵투스 후디  |  -    |  0  | 임시 |  |
|  | ...                                                  |  |
|  +------------------------------------------------------+  |
|                                                              |
|  << 1 2 3 >> | 전체 102개 상품                                |
|                                                              |
|  [CSV 가져오기] [CSV 내보내기] [선택 상태 변경]                  |
+--------------------------------------------------------------+
```

#### 상품 등록/수정 폼 (모달 또는 별도 페이지)

```
상품 등록
+--------------------------------------------------------------+
|  * 기본 정보                                                  |
|  제품코드*: [PGS25T1BAL001    ]  (자동생성 or 직접입력)         |
|  상품명*:   [페가수스 어센틱 홈  ]                               |
|  영문명:    [25/26 PGS HOME AUTHENTIC JSY]                    |
|  브랜드*:   [pegasus v]                                       |
|  카테고리*: [농구의류 v]                                       |
|  간략설명:  [25/26 시즌 페가수스 홈 유니폼...       ]            |
|                                                              |
|  * 가격                                                      |
|  판매가*:       [85,000]원                                    |
|  원가:          [     ]원 (관리자만 표시)                       |
|  도매가:        [59,500]원                                    |
|  학교스포츠클럽: [     ]원                                     |
|  할인율:        [   ]%  -> 할인가: [자동 계산]원                 |
|                                                              |
|  * 옵션 (사이즈/색상)                                         |
|  사이즈: [v]S [v]M [v]L [v]XL [v]2XL [v]3XL                  |
|          각 사이즈별 재고: S[10] M[15] L[20] XL[8]             |
|  색상:   [+ 색상 추가]                                        |
|          White [재고: 30]  Navy [재고: 25]                     |
|  * 2XL 이상 추가금: [2,000]원                                 |
|                                                              |
|  * 이미지                                                    |
|  +------+ +------+ +------+ +------------+                   |
|  | [대표] | | [+2] | | [+3] | | + 이미지    |                   |
|  | 사진  | | 사진  | | 사진  | |  드래그드롭 |                   |
|  +------+ +------+ +------+ +------------+                   |
|  * 첫 번째 이미지가 대표 이미지 (드래그로 순서 변경)              |
|                                                              |
|  * 상세 설명                                                  |
|  [----------------------------------------]                  |
|  | 간단한 에디터 (textarea + 이미지 삽입)     |                  |
|  | 또는 상세 이미지 업로드 (카페24 방식)       |                  |
|  [----------------------------------------]                  |
|                                                              |
|  * 배송                                                      |
|  배송비: [0]원 (0=무료배송)                                    |
|  배송안내: [주문 후 2~3일 이내 출고          ]                  |
|                                                              |
|  * 진열 설정                                                  |
|  상태: [판매중 v] (임시저장/판매중/품절/숨김)                     |
|  배지: [ ]신상품  [ ]베스트  [ ]메인추천                         |
|  진열순서: [0] (숫자가 작을수록 앞에)                            |
|                                                              |
|  원단: [어센틱     ]                                          |
|  키워드: [#스티즈 #농구유니폼 #페가수스 ...]                    |
|                                                              |
|                              [임시저장] [등록/수정]             |
+--------------------------------------------------------------+
```

#### 카테고리 관리 (admin-products.html 내 서브탭)

```
카테고리 관리
+------------------------------------------+
|  [상품 목록] [카테고리 관리]               |
|                                          |
|  > 스포츠웨어                             |
|    +-- 농구의류 (12개 상품)  [수정] [숨김]  |
|    +-- 축구의류 (8개 상품)   [수정] [숨김]  |
|    +-- 팀웨어 (15개 상품)    [수정] [숨김]  |
|    +-- 컴프레션 (5개 상품)   [수정] [숨김]  |
|  > 캐주얼                                |
|    +-- 티셔츠 (20개 상품)    [수정] [숨김]  |
|    +-- 후디 (8개 상품)       [수정] [숨김]  |
|  > 용품                                  |
|    +-- 악세서리 (4개 상품)   [수정] [숨김]  |
|                                          |
|  [+ 대분류 추가] [+ 중분류 추가]           |
+------------------------------------------+
```

### 8-6. 고객용 쇼핑 페이지 설계 (Part 5)

**비유: 매장의 진열장과 계산대**

기존 list.html, detail.html을 API 기반으로 교체.

#### list.html (상품 목록) 변경

**Before:** product-data.js 에서 하드코딩된 배열을 읽음
**After:** `/api/products?category={slug}` API 호출

```
list.html -- 상품 목록
+--------------------------------------------------------------+
|  +------------------------------------------+                |
|  | 카테고리 사이드바 (또는 상단 탭)            |                |
|  |  전체 | 농구의류 | 축구의류 | 팀웨어 |      |                |
|  |  티셔츠 | 후디 | 맨투맨 | 하의 | ...       |                |
|  +------------------------------------------+                |
|                                                              |
|  정렬: [최신순 v]  필터: [전체 브랜드 v]                        |
|                                                              |
|  +------+ +------+ +------+ +------+                         |
|  |[사진] | |[사진] | |[사진] | |[사진] |                         |
|  |[NEW]  | |[BEST]| |      | |[SALE]|                         |
|  |상품명 | |상품명 | |상품명 | |상품명 |                         |
|  |85,000 | |55,000| |38,000| |~~70K~~|                        |
|  |원     | |원    | |원    | |56,000|                         |
|  +------+ +------+ +------+ +------+                         |
|                                                              |
|  [더 보기] (무한 스크롤 또는 페이지네이션)                       |
+--------------------------------------------------------------+
```

#### detail.html (상품 상세) 변경

**Before:** URL 파라미터 id로 product-data.js에서 찾음
**After:** URL `/detail.html?code=PGS25T1BAL001` -> API 호출

```
detail.html -- 상품 상세
+--------------------------------------------------------------+
|  카테고리 > 농구의류 > 페가수스 어센틱 홈                        |
|                                                              |
|  +--------------------+  상품명: 페가수스 어센틱 홈             |
|  |                    |  영문명: 25/26 PGS HOME AUTHENTIC JSY |
|  |   [메인 이미지]      |  --------                            |
|  |                    |  판매가: 85,000원                     |
|  |                    |  (할인시: ~~85,000~~ -> 68,000원)      |
|  +--------------------+                                      |
|  |[썸1][썸2][썸3][썸4] |  사이즈: [S] [M] [L] [XL] [2XL]     |
|  +--------------------+  * 2XL 이상 +2,000원                 |
|                          색상: [White v]                     |
|                          수량: [-] [1] [+]                   |
|                                                              |
|                          [장바구니 담기] [바로 구매]             |
|                          --------                            |
|                          배송: 무료배송 | 2~3일 내 출고         |
|                          원단: 어센틱                          |
|                                                              |
|  ============================================================|
|  [상세정보] [사이즈가이드] [배송/교환]                           |
|                                                              |
|  [상세 이미지/설명 영역]                                       |
|                                                              |
|  ============================================================|
|  관련 상품                                                    |
|  +------+ +------+ +------+ +------+                         |
|  | 관련1 | | 관련2 | | 관련3 | | 관련4 |                         |
|  +------+ +------+ +------+ +------+                         |
+--------------------------------------------------------------+
```

#### 장바구니 + 구매 흐름

기성품 구매는 커스텀 주문과 다른 흐름:

| 단계 | 기성품 | 커스텀 |
|------|--------|--------|
| 1 | 상품 선택 (list - detail) | 커스텀 허브 (custom.html) |
| 2 | 사이즈/색상/수량 선택 | 주문 위자드 (종목/품목/옵션) |
| 3 | 장바구니 (basket.html) | 시안 요청 제출 |
| 4 | 주문서 작성 (order.html) | 시안 확인/수정 |
| 5 | 결제 (계좌이체 or PG) | 결제 |
| 6 | 주문 완료 | 제작 시작 |

**장바구니 데이터 구조 (localStorage):**
```javascript
// 기존 cart.js를 확장
{
  items: [
    {
      type: "product",              // "product" (기성품) vs "custom" (커스텀)
      productId: 1,
      productCode: "PGS25T1BAL001",
      name: "페가수스 어센틱 홈",
      size: "L",
      color: "White",
      quantity: 2,
      unitPrice: 85000,
      additionalPrice: 0,           // 사이즈 추가금
      thumbnail: "/uploads/products/PGS25T1BAL001_thumb.jpg"
    }
  ]
}
```

### 8-7. 기존 코드 연결 지점 + 변경 영향도

#### 기존 Part 8과의 차이 (영향 범위 확대)

| 항목 | 기존 Part 8 (카페24 연동) | 새 Part 8 (자체 시스템) |
|------|------------------------|----------------------|
| DB | settings 1개 키 추가 | 테이블 4개 신규 (products, product_categories, product_options, product_images) |
| API | 4개 엔드포인트 | 17개 엔드포인트 |
| 서버 파일 | catalog.js에 추가 | products.js 신규 라우트 파일 |
| 관리자 UI | admin-catalog에 탭 추가 | admin-products.html + admin-products.js 신규 |
| 고객 UI | product-data.js API 교체만 | list.html, detail.html 전면 리빌드 |
| 장바구니 | 변경 없음 | basket.html cart.js 전면 수정 |
| 이미지 | URL만 저장 | 파일 업로드 + 저장 + 서빙 |
| 네비게이션 | 변경 없음 | 관리자 메뉴에 "상품관리" 추가 |

#### 파일별 변경 상세

| 파일 경로 | 역할 | 신규/수정 | 작업량 |
|----------|------|----------|-------|
| server/routes/products.js | 상품 CRUD + 카테고리 + 이미지 API | 신규 | 대 |
| server/server.js | products 라우트 등록 | 수정 | 소 |
| server/db-sqlite.js | products 관련 테이블 생성 마이그레이션 | 수정 | 중 |
| admin-products.html | 관리자 상품 관리 페이지 | 신규 | 대 |
| js/admin-products.js | 상품 관리 로직 (CRUD + 이미지 업로드) | 신규 | 대 |
| list.html | API 기반 상품 목록 (기존 product-data.js 의존 제거) | 수정(전면) | 대 |
| detail.html | API 기반 상품 상세 | 수정(전면) | 대 |
| basket.html | 기성품 장바구니 항목 지원 | 수정 | 중 |
| js/cart.js | 상품 참조를 API 기반으로 변경 | 수정 | 중 |
| js/product-data.js | 폐기 (API로 대체) 또는 폴백 유지 | 수정/폐기 | 소 |
| index.html | 베스트셀러/신상품 섹션을 API 호출로 변경 | 수정 | 중 |
| admin*.html (5개) | 네비에 "상품관리" 링크 추가 | 수정 | 소 |
| order.html | 기성품 주문 처리 흐름 추가 | 수정 | 중 |

### 8-8. 커스텀 주문 vs 기성품 구매 통합

**비유: 같은 식당에서 "정식 메뉴"와 "셰프 특별 주문"을 모두 받는 것**

| 구분 | 기성품 (정식 메뉴) | 커스텀 (셰프 특별 주문) |
|------|------------------|---------------------|
| 입구 | list.html / detail.html | custom.html / order-custom.html |
| 선택 | 사이즈/색상 고르기 | 종목/품목/원단/디자인 설정 |
| 가격 | 고정가 (DB에 저장) | 견적 (가격표 참조 자동 계산) |
| 결제 시점 | 주문 즉시 | 시안 확정 후 |
| 제작 | 재고에서 출고 | 신규 제작 |
| DB 저장 | orders 테이블 (type: "product") | orders 테이블 (type: "custom") |

**orders 테이블 확장:**
```javascript
// 기존 주문 데이터에 type 필드 추가
{
  orderNumber: "ORD-20260406-001",
  type: "product",                    // "product" 또는 "custom"
  items: [
    {
      productId: 1,
      productCode: "PGS25T1BAL001",
      name: "페가수스 어센틱 홈",
      size: "L",
      color: "White",
      quantity: 2,
      unitPrice: 85000,
      subtotal: 170000
    }
  ],
  // ... 기존 주문 필드 (customer, payment, status 등)
}
```

### 8-9. 기존 D-55~D-59 폐기 + 새 기술 결정

기존 Part 8의 기술 결정(D-55~59)은 "카페24 연동" 전제였으므로 폐기하고, 자체 시스템에 맞는 새 결정으로 교체.

| # | 결정 | 이유 | 대체 |
|---|------|------|------|
| ~~D-55~~ | ~~settings store_products 키~~ | 47개 전용이었으나, 수백 개+이미지 관리 불가 | D-60 |
| ~~D-56~~ | ~~price-sheet BRAND 초기 데이터~~ | 여전히 초기 시딩용으로는 유효하나, 역할 축소 | D-61 |
| ~~D-57~~ | ~~수동 가져오기~~ | 카페24 동기화 불필요 (자체 등록) | D-62 |
| ~~D-58~~ | ~~product-data.js API 동적 로드~~ | 방향은 동일하나 범위 확대 | D-63 |
| ~~D-59~~ | ~~카페24 API 보류~~ | 카페24 자체를 사용 안 하므로 삭제 | 삭제 |

**새 기술 결정:**

| # | 결정 | 이유 |
|---|------|------|
| D-60 | 상품 저장소: 전용 테이블 4개 (products, product_categories, product_options, product_images) | 카페24 대체로 수백 개 상품+이미지+옵션+재고 관리 필요. settings JSON으로는 한계 |
| D-61 | 초기 데이터: price-sheet.csv BRAND 47개를 products 테이블에 시딩 | 빈 상태보다 기존 데이터로 시작하면 테스트/검증 용이. CSV 파서 재활용 |
| D-62 | 상품 등록: 관리자 직접 등록 (폼 UI) | 카페24 동기화 불필요. 관리자가 STIZ 시스템에서 직접 등록/수정 |
| D-63 | product-data.js 폐기 -> /api/products API | 하드코딩 Mock 데이터를 DB 기반 API로 완전 대체. list.html, detail.html 등 전면 수정 |
| D-64 | 이미지: 서버 로컬 업로드 (/uploads/products/) | 카페24 CDN 의존 제거. 기존 upload.js 인프라 활용. 향후 S3/Cloudflare 마이그레이션 가능 |
| D-65 | 관리자 UI: admin-products.html 별도 페이지 | admin-catalog.html은 커스텀 주문 카탈로그 전용으로 유지. 상품 관리는 역할이 다르므로 분리 |
| D-66 | 상세 설명: textarea + 이미지 업로드 (리치 에디터 보류) | Quill 등 리치 에디터는 복잡성 증가. 우선 textarea로 시작, 필요시 추가 |
| D-67 | 결제: 계좌이체 우선, PG 연동은 Phase F 후보 | PG 연동은 별도 계약/개발 필요. 기성품 주문은 소량이므로 계좌이체로 시작 |
| D-68 | 주문 통합: orders 테이블에 type 필드 추가 (product/custom) | 기존 주문 관리 시스템을 그대로 활용. 관리자가 한 곳에서 전체 주문 관리 |

### 8-10. 구현 로드맵 (Part 6)

총 7단계, 예상 총 시간: 약 15~18시간

| 순서 | 작업 | 담당 | 선행 조건 | 예상 시간 | 비고 |
|------|------|------|----------|----------|------|
| **1** | **DB 마이그레이션**: products/categories/options/images 4개 테이블 생성 + price-sheet 초기 시딩 | developer | 없음 | 2시간 | db-sqlite.js에 테이블 추가 |
| **2** | **상품 API**: products.js 라우트 (공개 4개 + 관리자 13개 = 17개 엔드포인트) | developer | 1 | 3시간 | CRUD + 이미지 업로드 + CSV import |
| **3** | **관리자 상품 관리 UI**: admin-products.html + admin-products.js (상품 목록/등록/수정/삭제 + 카테고리 관리) | developer | 2 | 4시간 | 폼 UI + 이미지 드래그앤드롭 |
| **4** | **고객 쇼핑 페이지**: list.html + detail.html API 기반 전면 리빌드 | developer | 2 | 3시간 | product-data.js 의존 제거 |
| **5** | **장바구니 + 주문 연동**: basket.html/cart.js 기성품 지원 + order.html 기성품 주문 흐름 | developer | 4 | 2시간 | orders type 필드 추가 |
| **6** | **통합 테스트** | tester + reviewer (병렬) | 3, 4, 5 | 1.5시간 | 등록->진열->구매->주문 전체 흐름 |
| **7** | **네비/메인 연결**: index.html 베스트셀러/신상품 API 연동 + admin 네비 "상품관리" 추가 | developer | 6 | 1.5시간 | 마무리 |

**단계별 상세:**

- Step 1~2는 순차 (DB가 있어야 API 가능)
- Step 3, 4는 병렬 가능 (관리자 UI와 고객 UI는 독립)
- Step 5는 Step 4 이후 (상품 상세 페이지가 있어야 장바구니 연동)
- Step 6은 Step 3, 4, 5 모두 완료 후
- Step 7은 Step 6 통과 후

```
[1: DB] -> [2: API] -> [3: 관리자 UI] ------------------+
                    +-> [4: 고객 UI] -> [5: 장바구니] ----+-> [6: 테스트] -> [7: 마무리]
```

### 8-11. 카페24 데이터 이전 (마이그레이션) 계획

카페24에서 가져올 데이터:

| 데이터 | 방법 | 우선순위 |
|--------|------|---------|
| 상품 기본 정보 (이름/가격/설명) | price-sheet.csv 파싱 (47개 BRAND) | 즉시 (Step 1에서 시딩) |
| 추가 상품 (유통 브랜드 등) | 카페24 관리자에서 CSV 다운로드 -> import API | Step 3 완료 후 |
| 상품 이미지 | 카페24에서 이미지 다운로드 -> 로컬 업로드 | Step 3 완료 후 (수동) |
| 상세페이지 HTML | 카페24 상품 상세 페이지에서 HTML 추출 | 단계적 이전 |
| 고객 리뷰 | 카페24에서 별도 추출 (없으면 포기) | 낮음 |
| 주문 이력 | 이미 STIZ 시스템에 있음 (orders 테이블) | 불필요 |

**price-sheet.csv 파싱 재활용:**
기존 catalog.js의 CSV 파서 로직(XLSX 라이브러리)을 products.js import API에서 재활용.
BRAND 행 -> products 테이블, 중분류 -> product_categories 자동 매핑.

### 8-12. 주의사항 (developer 필독)

1. **DB 마이그레이션 시 기존 테이블 건드리지 않기**: products 관련 4개 테이블만 CREATE. orders/customers 등 기존 테이블 수정은 Step 5에서만
2. **이미지 업로드는 기존 upload.js 인프라 활용**: server/routes/upload.js + server/uploads/ 폴더 구조를 재사용. 상품 이미지는 /uploads/products/ 하위에 저장
3. **product-data.js 의존 파일 전수 조사**: list.html, detail.html, index.html, basket.html, cart.js, chatbot.js, header_render.js 에서 `products` 변수 참조 확인 필수
4. **가격 필드의 쉼표 처리**: CSV에서 "85,000" -> 85000 정수 변환. 빈 값은 null
5. **사이즈 범위 파싱**: "S~3XL" -> ["S","M","L","XL","2XL","3XL"]. "5XS~5XL"도 처리 필요
6. **원가(costPrice)는 관리자 API에서만**: 공개 API 응답에서 costPrice, wholesalePrice 절대 미포함
7. **이미지 없는 상품**: CSS 이니셜 플레이스홀더 (브랜드 첫 글자 + 배경색) 또는 기본 이미지 사용
8. **카테고리 삭제 시 하위 상품 확인**: 해당 카테고리에 상품이 있으면 삭제 거부 -> 에러 메시지 표시
9. **orders 테이블 type 필드**: 기존 주문은 모두 type='custom'으로 간주. 새 기성품 주문만 type='product'
10. **관리자 네비 "상품관리" 추가**: admin.html, admin-analytics.html, admin-catalog.html, admin-customers.html 등 기존 관리자 페이지 네비에 링크 추가

---

## Part 9: 통합 상품 시스템 -- 기성품 + 커스텀 통합 (2026-04-06 추가)

> 핵심 전환: "종목 선택 방식"에서 "디자인된 상품을 선택하는 방식"으로 커스텀 주문 흐름을 전면 변경.
> 기성품과 커스텀 상품을 하나의 products 테이블에서 관리하고, 고객이 같은 쇼핑 경험으로 두 가지를 모두 이용.

### 9-1. 왜 바꿔야 하나? (핵심 비유)

**기존 방식 = 빈 캔버스에 그림 그려달라고 요청하는 것**

```
고객: "농구 유니폼 만들어주세요"
STIZ: "종목은요? 등급은요? 패키지는요?"
고객: (추상적인 선택을 6단계나 해야 함)
STIZ: (0에서부터 디자인 시작)
```

- 고객은 "뭘 고르는 건지" 감이 안 잡힘 (베이직? 프로? 차이가 뭐지?)
- 완성된 모습을 상상할 수 없음
- 디자이너는 매번 백지에서 시작

**변경 방식 = 갤러리에서 마음에 드는 그림을 고르는 것**

```
고객: (쇼핑몰을 둘러보다가) "이 디자인 좋네요!"
STIZ: "네, 이 디자인으로 팀명/색상만 알려주세요"
고객: (눈에 보이는 디자인을 선택 + 간단한 커스터마이즈)
STIZ: (기존 디자인을 기반으로 빠르게 수정)
```

- 고객은 "이게 내 유니폼이 되는구나" 바로 감이 옴
- 이미 완성된 디자인 템플릿이므로 작업 시간 절약
- 기성품도 커스텀도 같은 쇼핑 경험

### 9-2. 핵심 개념 변경

#### products 테이블에 type 필드 추가

**비유: 식당의 메뉴판에 "정식"과 "주문제작 케이크"가 함께 있는 것**

| type | 의미 | 고객 경험 | 예시 |
|------|------|----------|------|
| `ready` | 기성품 | 사이즈/색상 선택 -> 장바구니 -> 결제 | 오버글로우 후디, 페가수스 저지 |
| `custom` | 커스텀 템플릿 | 상품 선택 -> 옵션(등급/패키지) -> 참고사항 -> 시안 요청 | "농구 베이직 유니폼 A타입", "축구 프로 유니폼 B타입" |

**핵심: 모든 상품이 하나의 products 테이블에 등록된다.**

기존에는:
- 기성품 = products 테이블 (Part 8)
- 커스텀 = settings 테이블의 product_catalog JSON (Part 0 + Part 7)

변경 후:
- 기성품 + 커스텀 = **모두 products 테이블** (type으로 구분)

#### 커스텀 상품이란?

**비유: 인테리어 업체의 "시공 사례집"**

커스텀 상품 = 관리자(디자이너)가 미리 만들어놓은 "디자인 템플릿"

```
예시:
- "농구 베이직 유니폼 - A타입" (시안 이미지: 파란색 기본 디자인)
- "농구 프로 유니폼 - 스트라이프" (시안 이미지: 줄무늬 디자인)
- "축구 베이직 유니폼 - 클래식" (시안 이미지: 심플한 디자인)
```

고객은 이 "시공 사례"를 보고 마음에 드는 걸 선택한 뒤, "우리 팀에 맞게 수정해주세요"라고 요청.

### 9-3. 통합 아키텍처 (Part 1)

**비유: 하나의 매장에 "기성복 코너"와 "맞춤복 코너"가 함께 있는 백화점**

```
                    +-------------------------------+
                    |     관리자 (사장님)              |
                    |  admin-products.html           |
                    |  - 기성품 등록 (type: ready)     |
                    |  - 커스텀 템플릿 등록 (type: custom) |
                    |  - 카테고리/이미지/옵션 관리      |
                    +---------------+---------------+
                                    | API
                    +---------------v---------------+
                    |         서버 (Express)          |
                    |  routes/products.js             |
                    |  products 테이블 (통합!)         |
                    |  product_categories 테이블       |
                    |  product_images 테이블           |
                    |  product_options 테이블          |
                    +---------------+---------------+
                                    | API
         +--------------------------v--------------------------+
         |                 고객 쇼핑 페이지                      |
         |                                                    |
         |  list.html              detail.html                |
         |  (기성품+커스텀 함께 진열) (상품 상세)                  |
         |       |                      |                     |
         |       +----------+-----------+                     |
         |                  |                                 |
         |          type에 따라 분기                            |
         |                  |                                 |
         |    +-------------+-------------+                   |
         |    |                           |                   |
         |    v                           v                   |
         |  [ready]                     [custom]              |
         |  사이즈/색상 선택              옵션 선택              |
         |  수량                          (등급/패키지/마감)    |
         |  장바구니                       참고사항/파일 업로드   |
         |  결제                           주문자 정보           |
         |    |                           시안 요청 제출        |
         |    v                           |                   |
         |  order.html                    v                   |
         |  (기성품 주문/결제)           order-track.html       |
         |                              (시안확인/주문서/결제)   |
         +-------------------------------------------------+
```

### 9-4. DB 설계 업데이트 (Part 2)

#### products 테이블 변경: type 필드 + 커스텀 전용 필드

**기존 Part 8의 products 테이블에 추가할 필드:**

```sql
-- products 테이블에 추가되는 커스텀 전용 필드
ALTER TABLE products ADD COLUMN type TEXT DEFAULT 'ready';
  -- 'ready' = 기성품, 'custom' = 커스텀 템플릿

-- 커스텀 전용 메타데이터 (JSON blob)
ALTER TABLE products ADD COLUMN customMeta TEXT;
  -- 커스텀 상품일 때만 사용. JSON 형식:
  -- {
  --   "sport": "basketball",       -- 종목 (카테고리와 별도로 종목 정보 보존)
  --   "defaultGrade": "basic",     -- 기본 등급 (null이면 고객이 선택)
  --   "availableGrades": ["basic", "pro"],  -- 선택 가능한 등급
  --   "availablePackages": ["top", "bottom", "set", "top2_bottom1"],  -- 선택 가능한 패키지
  --   "availableFinish": true,     -- 마감 옵션 표시 여부
  --   "priceSource": "priceTable", -- 가격 출처: "priceTable" (카탈로그 참조) 또는 "fixed" (상품 자체 가격)
  -- }
```

**왜 customMeta를 JSON으로?**

비유: "맞춤복 주문서에 추가로 적는 특이사항"
- 기성품(ready)에는 이 칸이 비어있음 (특이사항 없음)
- 커스텀(custom)에만 "가능한 등급/패키지" 같은 추가 정보가 필요
- JSON이므로 기존 products 테이블 스키마를 건드리지 않음

#### priceTable과의 관계

**두 가지 가격 체계가 공존:**

| 상품 type | 가격 결정 방식 | 비유 |
|-----------|-------------|------|
| ready (기성품) | `products.retailPrice` 직접 사용 | 가격표에 적힌 정가 |
| custom (priceSource: "priceTable") | `settings.product_catalog.priceTable`에서 조회 | 맞춤복 원단/구성별 가격표 |
| custom (priceSource: "fixed") | `products.retailPrice` 사용 (특수 상품) | 특별 할인가 고정 상품 |

**priceTable은 유지한다.**

기존 Part 7에서 설계한 `settings` 테이블의 `product_catalog` JSON (priceTable, grades, packages 등)은 그대로 유지.
커스텀 상품의 가격은 여전히 priceTable에서 "종목 + 등급 + 패키지" 조합으로 조회.

**차이점:**
- 기존: 고객이 "종목 -> 등급 -> 패키지"를 처음부터 선택
- 변경: 상품(템플릿)을 먼저 선택하면, 해당 상품의 `customMeta.availableGrades/Packages`로 선택지가 좁혀짐

#### orders.data.items 구조 변경

```javascript
// 변경 후 주문 아이템 구조
items: [{
  // == 공통 (기성품 + 커스텀) ==
  productId: 42,                   // [신규] products 테이블 FK
  productCode: "STIZ-BBALL-A001",  // [신규] 상품 코드
  productName: "농구 베이직 유니폼 - A타입",
  type: "custom",                  // [신규] "ready" 또는 "custom"

  // == 기성품(ready) 전용 ==
  selectedOptions: {               // [신규] 기성품의 사이즈/색상
    size: "L",
    color: "Navy",
  },

  // == 커스텀(custom) 전용 (기존 Part 7 구조 유지 + productId 추가) ==
  sport: "basketball",
  category: "uniform",
  grade: "basic",
  gradeLabel: "베이직",
  fabric: "플랫백메쉬+",
  package: "set",
  packageLabel: "세트 (상의+하의)",
  finish: { top: "sambong", bottom: "no_slit" },
  homeAway: "both",
  discount: null,

  // == 공통 ==
  quantity: 15,
  unitPrice: 60000,
  totalAmount: 1800000,
}]
```

### 9-5. 새로운 주문 흐름 (Part 3)

#### 고객 쇼핑 경험: 통합 흐름

**비유: 백화점에서 기성복과 맞춤복을 한 매장에서 쇼핑하는 것**

```
[1단계] 상품 목록 브라우징 (list.html)
  ┌─────────────────────────────────────────────────────────┐
  │  STIZ 스포츠웨어                                         │
  │                                                         │
  │  카테고리: [전체] [농구] [축구] [배구] [팀웨어] [캐주얼]    │
  │  필터:    [기성품] [커스텀] [전체]                         │
  │                                                         │
  │  +----------+ +----------+ +----------+ +----------+    │
  │  | [사진]    | | [사진]    | | [사진]    | | [사진]    |    │
  │  | [CUSTOM] | | [CUSTOM] | | [NEW]    | | [BEST]   |    │
  │  | 농구 베이직| | 축구 프로  | | OG 후디  | | 페가수스  |    │
  │  | A타입     | | 스트라이프 | |          | | 어센틱홈  |    │
  │  | 60,000원~ | | 70,000원~ | | 65,000원 | | 85,000원 |    │
  │  | (커스텀)  | | (커스텀)  | | (기성품)  | | (기성품)  |    │
  │  +----------+ +----------+ +----------+ +----------+    │
  │                                                         │
  │  * 커스텀 상품은 "~" 표시 (구성에 따라 가격 변동)            │
  │  * 커스텀 배지와 기성품이 함께 진열됨                       │
  └─────────────────────────────────────────────────────────┘

[2단계] 상품 상세 (detail.html)
  → URL: detail.html?code=STIZ-BBALL-A001

  ┌─────────────────────────────────────────────────────────┐
  │  카테고리 > 농구 > 커스텀 유니폼                           │
  │                                                         │
  │  +--------------------+  농구 베이직 유니폼 - A타입        │
  │  |                    |  ──────────                      │
  │  |  [디자인 시안 이미지] |  타입: 커스텀 제작               │
  │  |  (여러 각도)        |  기본 가격: 60,000원~/벌 (세트)   │
  │  |                    |                                 │
  │  +--------------------+  "우리 베스트셀러 디자인입니다.     │
  │  | [앞면] [뒷면] [상세]|   깔끔한 라인과 심플한 배색이       │
  │  +--------------------+   특징인 클래식 디자인."           │
  │                                                         │
  │  ── 기성품이면 여기서 바로 ──                              │
  │  사이즈: [S] [M] [L] [XL]                               │
  │  수량: [1]                                              │
  │  [장바구니] [바로 구매]                                    │
  │                                                         │
  │  ── 커스텀이면 여기서 옵션 선택 ──                         │
  │  [커스텀 주문하기 >]  ← 클릭 시 커스텀 옵션 영역 펼침      │
  │                                                         │
  └─────────────────────────────────────────────────────────┘

[3단계-A] 기성품 주문 (기존 Part 8 흐름 그대로)
  detail.html → 사이즈/색상/수량 → 장바구니(basket.html) → 결제(order.html)

[3단계-B] 커스텀 주문 (새 흐름! -- detail.html 내에서 진행)
  ┌─────────────────────────────────────────────────────────┐
  │  커스텀 주문 옵션                                         │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                        │
  │                                                         │
  │  1. 등급 선택                                            │
  │  ┌──────────┐  ┌──────────┐                             │
  │  │ ● 베이직  │  │   프로    │                             │
  │  │ 플랫백메쉬+│  │ 컴포트헥사곤│                            │
  │  │ 세트 60,000│  │ 세트 70,000│                            │
  │  └──────────┘  └──────────┘                             │
  │  * 상품에 따라 선택 가능 등급이 제한됨                      │
  │  * defaultGrade가 있으면 미리 선택됨                       │
  │                                                         │
  │  2. 패키지 선택                                           │
  │  [상의] [하의] [● 세트] [상의2+하의1] [상의2+하의2]         │
  │                                                         │
  │  3. 마감 옵션 (선택)                                      │
  │  상의: [● 삼봉마감] [암홀립]                               │
  │  하의: [● 트임X] [트임]                                    │
  │                                                         │
  │  4. 홈/어웨이                                             │
  │  [홈만] [어웨이만] [● 홈+어웨이]                            │
  │                                                         │
  │  5. 수량: [  15  ] 벌                                    │
  │                                                         │
  │  6. 할인 (해당 시)                                        │
  │  [ ] 학교스포츠클럽                                        │
  │                                                         │
  │  ── 견적 ──                                              │
  │  단가: 60,000원/벌 (베이직 세트)                           │
  │  홈+어웨이: x2                                            │
  │  수량: x15                                               │
  │  예상 총액: 1,800,000원                                   │
  │                                                         │
  │  [다음: 주문 정보 입력 >]                                  │
  └─────────────────────────────────────────────────────────┘

[4단계-B] 주문자 정보 + 참고사항 (detail.html 내 또는 별도 모달/섹션)
  ┌─────────────────────────────────────────────────────────┐
  │  주문자 정보                                              │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                        │
  │  팀명*:    [                    ]                        │
  │  담당자*:  [                    ]                        │
  │  연락처*:  [                    ]                        │
  │  이메일:   [                    ]                        │
  │                                                         │
  │  참고 요청사항                                            │
  │  ┌──────────────────────────────┐                       │
  │  │ "팀명은 STIZ, 메인 컬러 네이비, │                       │
  │  │  서브 컬러 화이트로 해주세요.   │                       │
  │  │  등번호는 추후 전달드리겠습니다" │                       │
  │  └──────────────────────────────┘                       │
  │                                                         │
  │  참고파일 업로드 (선택)                                    │
  │  [+ 파일 추가] (로고, 참고 이미지 등)                      │
  │                                                         │
  │  ── 주문 요약 ──                                          │
  │  상품: 농구 베이직 유니폼 - A타입                           │
  │  등급: 베이직 / 패키지: 세트 / 홈+어웨이 / 15벌             │
  │  예상 금액: 1,800,000원                                   │
  │                                                         │
  │  [시안 요청하기]                                           │
  └─────────────────────────────────────────────────────────┘

[5단계-B] 접수 완료 → 이후 기존 Part 1 Step 7~11 흐름
  시안 확인 → 수정 요청 → 디자인 확정 → 주문서(배번/사이즈) → 결제
```

### 9-6. 페이지/UI 흐름 변경 (Part 3)

#### 어떤 페이지가 필요한가?

| 페이지 | 역할 | 변경 내용 | 비유 |
|--------|------|----------|------|
| `list.html` | 통합 상품 목록 | type 필터 추가, 커스텀 배지 표시, 가격에 "~" 표시 | 백화점 1층 안내 |
| `detail.html` | 통합 상품 상세 | type에 따라 분기: ready=기존, custom=옵션 선택 UI 내장 | 상품 앞의 가격표+주문서 |
| `basket.html` | 장바구니 | 기성품만 담김. 커스텀은 장바구니 안 거침 | 쇼핑카트 |
| `order.html` | 기성품 결제 | 기존 Part 8 흐름 유지 | 계산대 |
| `order-track.html` | 커스텀 후속 (시안/주문서/결제) | 기존 Part 1 Step 7~11 유지 | 맞춤복 가봉실 |
| `admin-products.html` | 관리자 상품 관리 | type 선택 추가, 커스텀 전용 옵션 편집 UI | 창고 관리실 |

#### order-custom.html의 운명: **폐기 (또는 리다이렉트)**

**기존 order-custom.html (7단계 위자드):**
```
종목 → 품목 → 등급 → 패키지 → 견적 → 주문자 → 제출
```

**이 흐름이 불필요해지는 이유:**
1. "종목/품목" 선택 = 이제 상품 목록(list.html)에서 상품을 "클릭"하는 것으로 대체
2. "등급/패키지" 선택 = detail.html 내의 커스텀 옵션 섹션으로 이동
3. "견적/주문자/제출" = detail.html 내에서 처리

**결정: order-custom.html은 list.html?type=custom으로 리다이렉트**

기존 링크를 타고 들어오는 고객을 위해, order-custom.html에 접속하면 커스텀 상품 목록으로 자동 이동시킴.

```javascript
// order-custom.html 리다이렉트 처리
window.location.href = '/list.html?type=custom';
```

#### detail.html의 확장

**비유: 기존에는 "진열장 유리 너머로만 보는 매장"이었다면, 이제는 "터치해서 주문까지 가능한 키오스크"**

detail.html이 두 가지 모드를 가짐:

| 모드 | 표시 내용 | 하단 액션 |
|------|----------|----------|
| ready | 이미지 갤러리 + 옵션(사이즈/색상) + 수량 | [장바구니] [바로 구매] |
| custom | 이미지 갤러리 + 커스텀 옵션 패널 (등급/패키지/마감/수량/견적) + 주문자 정보 | [시안 요청하기] |

구현 방식:
- API로 상품 상세를 불러올 때 `product.type`을 확인
- type === 'ready' → 기존 기성품 UI 표시
- type === 'custom' → 커스텀 옵션 패널 표시 (기존 order-custom.js의 Step 3~7 로직을 detail.html에 통합)

### 9-7. 기존 기획 업데이트 사항 (Part 4)

#### 유지할 것 (변경 없음)

| 기존 기획 | 상태 | 이유 |
|----------|------|------|
| Part 0: settings 테이블 + product_catalog JSON | **유지** | priceTable, grades, packages 등 커스텀 가격 체계 그대로 사용 |
| Part 1 Step 7~11: 시안 확인/주문서/결제 | **유지** | 커스텀 주문 접수 이후 흐름은 동일 |
| Part 2: orders.data 구조 | **유지 + 확장** | items에 productId/productCode/type 추가 |
| Part 3: API (주문/추적/시안/주문서/결제) | **유지** | 기존 API 그대로 사용 |
| Part 6: 카카오 알림톡 | **유지** | 알림 트리거 시점 동일 |
| Part 7: 가격/구성 고도화 | **유지** | priceTable 참조 방식, 할인 체계 그대로 |
| Part 8: 자체 상품 시스템 (4테이블 + 17 API) | **유지 + 확장** | products 테이블에 type/customMeta 추가 |

#### 변경할 것

| 기존 기획 | 변경 내용 | 영향도 |
|----------|----------|--------|
| Part 1 Step 1~6 (위자드 6단계) | **폐기** → detail.html 내 커스텀 옵션으로 대체 | 높음 |
| Part 4: order-custom.html | **폐기** → list.html 리다이렉트 | 높음 |
| Part 5: Phase B (주문 위자드) | **대폭 변경** → detail.html 커스텀 모드 구현으로 대체 | 높음 |
| Part 7 Step 3 (위자드 7단계) | **폐기** → detail.html에 통합 | 중간 |
| Part 8: products 테이블 | type + customMeta 필드 추가 | 낮음 (DDL만) |
| Part 8: admin-products.html | 커스텀 상품 등록 옵션 추가 | 중간 |
| Part 8: list.html | type 필터 + 커스텀 배지 + 가격 "~" 표시 | 낮음 |
| Part 8: detail.html | type별 분기 + 커스텀 옵션 패널 | 높음 |

#### admin-catalog.html vs admin-products.html 관계 정리

**혼동 포인트: "카탈로그 설정"과 "상품 관리"는 다른 것**

| 페이지 | 역할 | 비유 |
|--------|------|------|
| admin-catalog.html | 커스텀 주문의 "규칙" 설정: 등급/패키지/가격표/할인 | 맞춤복 가격표 관리 |
| admin-products.html | 실제 "상품" 등록/관리: 기성품 + 커스텀 템플릿 | 매장 진열 상품 관리 |

이 두 개는 **별도로 유지**. 하나로 합치면 오히려 복잡해짐.
- admin-catalog.html: "베이직 세트가 60,000원"이라는 가격 규칙 관리
- admin-products.html: "농구 베이직 유니폼 A타입"이라는 구체적 상품 등록 (이미지, 설명, 어떤 등급/패키지 가능한지)

### 9-8. 관리자 커스텀 상품 등록 UI

**기존 admin-products.html 등록 폼에 추가:**

```
상품 등록
+--------------------------------------------------------------+
|  * 상품 타입                                                  |
|  (● ) 기성품 (바로 구매)    ( ) 커스텀 템플릿 (시안 요청)        |
|                                                              |
|  === 타입이 "커스텀 템플릿"일 때 추가 표시 ===                  |
|                                                              |
|  * 커스텀 옵션 설정                                            |
|  종목: [농구 v]                                               |
|  기본 등급: [없음(고객 선택) v] / [베이직 v] / [프로 v]          |
|  선택 가능 등급: [v]베이직 [v]프로 [ ]어센틱 [ ]양면             |
|  선택 가능 패키지: [v]상의 [v]하의 [v]세트 [v]상2하1 [ ]상2하2   |
|  마감 옵션 표시: [v] (삼봉/암홀립, 트임/트임X)                   |
|  가격 출처: (● ) 카탈로그 가격표 (priceTable)                   |
|             ( ) 상품 직접 가격 (retailPrice)                   |
|                                                              |
|  * 대표 이미지 (디자인 시안)                                    |
|  +------+ +------+ +------+                                  |
|  | [앞면] | | [뒷면] | | [상세] |                                  |
|  +------+ +------+ +------+                                  |
|  * 고객이 "이게 내 유니폼이 되는구나" 볼 수 있는 시안 이미지      |
|                                                              |
+--------------------------------------------------------------+
```

### 9-9. 구현 로드맵 재계산 (Part 5)

#### 기존 Phase 구조 vs 변경

**기존:**
```
Phase A: 카탈로그 인프라 (settings + API + 관리자 UI)     4.5h
Phase B: 주문 위자드 (order-custom.html 6단계)           3h    ← 폐기
Phase C: 시안/주문서/결제 (order-track.html)              3h
Phase D: 알림/고도화                                     3h
Phase E: 상품 시스템 (Part 8, 4테이블 17API)              15~18h
```

**변경 후:**
```
Phase A : 카탈로그 인프라 (유지)                          4.5h  (변경 없음)
Phase E : 상품 시스템 + 통합 (Part 8 확장)                17~20h (type/customMeta 추가)
Phase B': 통합 쇼핑 흐름 (detail.html 커스텀 모드)         4h    (위자드 대체)
Phase C : 시안/주문서/결제 (유지)                          3h    (변경 없음)
Phase D : 알림/고도화 (유지)                              3h    (변경 없음)
```

#### 변경 Phase B' 상세: 통합 쇼핑 흐름

| 순서 | 작업 | 담당 | 예상 시간 | 선행 조건 |
|------|------|------|----------|----------|
| B'-1 | products 테이블에 type + customMeta 필드 추가 | developer | 20분 | Phase E 완료 |
| B'-2 | admin-products.html에 커스텀 상품 등록 UI 추가 (타입 선택, customMeta 편집) | developer | 60분 | B'-1 |
| B'-3 | list.html에 type 필터 + 커스텀 배지 + "~" 가격 표시 | developer | 30분 | B'-1 |
| B'-4 | detail.html 커스텀 모드 구현 (등급/패키지/마감/견적/주문자/시안 요청) | developer | 90분 | B'-1, Phase A |
| B'-5 | order-custom.html을 list.html?type=custom으로 리다이렉트 | developer | 5분 | B'-3 |
| B'-6 | 커스텀 시안 요청 -> orders 테이블 저장 연결 (POST /api/orders 확장) | developer | 30분 | B'-4 |
| -- | Phase B' 검증 | tester + reviewer (병렬) | 30분 | B'-1~6 |

**소계: ~4.5시간** (기존 Phase B 3시간 대비 +1.5시간, 하지만 위자드 7단계 전체를 다시 만들 필요 없음)

#### 전체 로드맵

| Phase | 내용 | 예상 시간 | 순서 | 비고 |
|-------|------|----------|------|------|
| A | 카탈로그 인프라 (Part 0 + 7) | 4.5시간 | 1번째 | **완료됨** |
| E | 상품 시스템 (Part 8 + type 확장) | 17~20시간 | 2번째 | 4테이블+17API+관리자UI+고객UI |
| B' | 통합 쇼핑 흐름 (Part 9 핵심) | 4.5시간 | 3번째 | detail.html 커스텀 모드 |
| C | 시안/주문서/결제 | 3시간 | 4번째 | 변경 없음 |
| D | 알림/고도화 | 3시간 | 5번째 (후순위) | 변경 없음 |
| **합계** | | **~32~35시간** | | Phase A~C: 29~32시간 |

**권장 실행 순서:**
1. Phase A (카탈로그) -- 이미 완료
2. Phase E (상품 시스템) -- Part 8의 7단계 작업
3. **Phase B' (통합 쇼핑 흐름)** -- Part 9 핵심, Phase E 이후 바로
4. Phase C (시안/주문서/결제) -- Phase B' 이후
5. Phase D (알림/고도화) -- 후순위

### 9-10. 커스텀 상품 시딩 데이터 (초기 등록 예시)

Phase E 완료 후, 관리자가 등록할 커스텀 상품 예시:

| # | 상품명 | 카테고리 | type | 종목 | 가능 등급 | 가능 패키지 | 대표 이미지 |
|---|--------|---------|------|------|----------|-----------|------------|
| 1 | 농구 베이직 유니폼 - A타입 | 농구의류 | custom | basketball | basic, pro | 전체 | 심플 디자인 시안 |
| 2 | 농구 베이직 유니폼 - B타입 | 농구의류 | custom | basketball | basic, pro | 전체 | 스트라이프 디자인 시안 |
| 3 | 농구 프로 유니폼 - 프리미엄 | 농구의류 | custom | basketball | pro, authentic | 전체 | 프리미엄 디자인 시안 |
| 4 | 축구 베이직 유니폼 - 클래식 | 축구의류 | custom | soccer | basic, pro | 전체 | 클래식 축구 시안 |
| 5 | 축구 프로 유니폼 - 모던 | 축구의류 | custom | soccer | pro | 전체 | 모던 디자인 시안 |
| 6 | 배구 프로 유니폼 - 스탠다드 | 배구의류 | custom | volleyball | pro | top,bottom,set,top2_bottom1 | 배구 시안 |

**시안 이미지는 STIZ 디자이너가 준비해야 함.** 초기에는 기존 작업물에서 대표적인 디자인을 5~10개 추려서 등록.

### 9-11. 기술 결정

| # | 결정 | 이유 |
|---|------|------|
| D-69 | 기성품+커스텀 통합: products 테이블의 type 필드로 구분 | 별도 테이블보다 단순. 고객이 같은 목록에서 두 종류를 함께 브라우징 |
| D-70 | 커스텀 메타: customMeta JSON 필드 | 커스텀 전용 데이터(가능한 등급/패키지)를 별도 테이블 없이 저장. 스키마 변경 최소화 |
| D-71 | priceTable 유지: settings 테이블의 카탈로그 JSON | 커스텀 가격은 여전히 "종목+등급+패키지" 조합 가격표. 상품별 고정가가 아님 |
| D-72 | order-custom.html 폐기: list.html 리다이렉트 | "종목 선택 위자드"가 불필요해짐. 상품 선택이 곧 종목/품목 선택 |
| D-73 | 커스텀 주문 UI: detail.html 내 inline | 별도 페이지(order-custom.html)보다 "상품을 보면서 주문"이 자연스러움 |
| D-74 | admin-catalog + admin-products 분리 유지 | 가격 규칙 관리와 상품 등록은 성격이 다름. 합치면 UI 복잡성 증가 |

### 9-12. 주의사항 (developer 필독)

1. **Phase E (Part 8) 먼저 완료해야 함**: Part 9는 products 테이블이 존재해야 구현 가능. Phase E 이후에 Phase B' 진행
2. **기존 order-custom.js 로직 재활용**: 위자드는 폐기하지만, 견적 계산 로직(priceTable 조회, 할인 적용)은 detail.html에서 그대로 사용. 함수만 분리해서 import
3. **detail.html이 커짐**: ready 모드 + custom 모드를 모두 담으므로, 모드별 섹션을 명확히 분리. hidden 클래스로 토글
4. **list.html 카드에 type 표시**: 기성품은 정확한 가격, 커스텀은 "60,000원~" (최소 가격 + "~"). 커스텀 배지(CUSTOM 태그) 표시
5. **커스텀 상품의 retailPrice**: priceTable의 최소 가격(세트 기준)을 retailPrice에 저장. 목록에서 참고용으로 표시
6. **customMeta.availableGrades가 비어있으면**: 해당 종목의 모든 등급 표시 (sportGradeMap에서 조회)
7. **기존 주문 하위호환**: items에 productId가 없는 기존 주문도 정상 표시되어야 함. productId는 optional
8. **시안 이미지 없는 커스텀 상품**: 이미지가 없으면 등록 불가로 제한 (커스텀 상품의 핵심은 "보여주는 디자인")
9. **order-custom.html 리다이렉트**: 기존 북마크/링크 대비. 간단한 JS redirect로 처리하되, URL 파라미터가 있으면 무시해도 됨

---

## Part 10: 쇼핑몰 API 전환 + 카테고리 재구성 (2026-04-06 추가)

> 카페24 상품 261개가 DB에 등록됐지만, 기존 쇼핑몰 페이지(index/list/detail)는 여전히 하드코딩 33개만 표시.
> 동시에 카테고리 구조가 "내부 관점(brand/custom)"으로 짜여 있어 고객 관점으로 정리가 필요함.

### 10-1. 문제 요약 (현재 상황)

**비유**: 새 창고(DB)에 물건 363개를 쌓았는데, 매장 진열대(index/list/detail)는 아직 옛날 카탈로그(product-data.js) 33개만 보여주고 있음. 창고와 매장이 연결 안 된 상태.

| 구분 | 파일 | 데이터 소스 | 표시 상품 | 상태 |
|------|------|-----------|---------|------|
| 메인 | `index.html` | `js/product-data.js` | 33개 (하드코딩) | 전환 필요 |
| 목록 | `list.html` | `js/product-data.js` | 33개 (하드코딩) | 전환 필요 |
| 상세 | `detail.html` | `js/product-data.js` | 33개 (하드코딩) | 전환 필요 |
| 네비 | `js/header_render.js` | 하드코딩 메뉴 | TEAMWEAR/STORE | 동적화 필요 |
| 신규 목록 | `shop.html` | `GET /api/products` | 363개 (DB) | 정상 |
| 신규 상세 | `shop-detail.html` | `GET /api/products/:id` | 363개 (DB) | 정상 |

**현재 DB 상품 분포 (363개 / categoryId 기준):**
- 농구의류(10): 124 — 카페24 이전분(basketball 114) + 커스텀 저지 시안 10
- 축구의류(57): 33 — 카페24 이전분 전부
- TEAMWEAR(50): 48, 컴프레션(51): 18, 연습복(52): 12 — 카페24 팀웨어 하위
- MD제품(55): 19, 악세서리(53): 4, 용품(54): 4 — 카페24 비의류
- SHIRTS(11)/BOTTOM(12)/HOODIE(13)/MTM(14): 27/5/8/6 — BRAND 초기 시딩
- 커스텀 농구(20)/축구(21)/배구(22): 23/10/4 — Phase E-4 시딩
- 팀웨어 하위(30~33): 슈팅저지/전사티/트랙탑/후드 각 3~5 — 소량
- 캐주얼(40/41): 각 2 — 소량

**이 분포의 문제:**
- `농구의류(10)` 아래에 "카페24에서 긁어온 brand 농구 114개"와 "자체 커스텀 저지 시안 10개"가 섞여 있음 → 고객은 브랜드 기성품 사러 왔는데 커스텀 시안이 튀어나옴
- `cafe24-*` 슬러그와 `brand-*` 슬러그가 공존하여 사람이 봐도 헷갈림
- 대분류 `BRAND`/`CUSTOM`/`팀웨어`/`캐주얼` — BRAND vs CUSTOM은 "판매 방식"이지 "상품 종류"가 아님. 고객이 "농구 사러 왔는데 BRAND에 있는지 CUSTOM에 있는지" 모름

---

### 10-2. 통합 전략 결정 (핵심 방향)

**선택한 방식: "기존 페이지 내용을 shop 로직으로 교체" (하이브리드)**

세 가지 옵션을 비교하고 최종 결정:

| 옵션 | 방식 | 장점 | 단점 | 채택 |
|------|------|------|------|------|
| A. 리다이렉트 | `list.html` → `shop.html` 강제 이동 | 가장 단순 | 기존 URL/SEO 깨짐, 북마크 무효화 | 탈락 |
| B. 파일 이름 교체 | `shop.html`을 `list.html`로 rename | 기존 링크 유지 | detail도 같이 해야 함, 혼란 | 탈락 |
| C. 로직 이식 | `list.html`/`detail.html`의 `<main>`만 `shop.*` 방식으로 교체 | URL 유지 + DB 연결 + 디자인 개선 여지 | 약간의 작업량 | **채택** |

**결정: 옵션 C**
- `list.html` 은 URL을 유지하되 내부 스크립트를 `shop.js`처럼 API 기반으로 교체한다.
- `detail.html` 도 마찬가지로 `shop-detail.js` 로직으로 교체한다.
- `shop.html` / `shop-detail.html` 은 **삭제하고**, 두 파일의 로직을 `list.html` / `detail.html` 로 흡수한다. (중복 유지 금지)
- `index.html` 은 랜딩 페이지 역할이 있으므로 완전 교체하지 않고 "추천 상품 섹션만" `/api/products/featured` 로 전환한다.
- `product-data.js` 는 최종 삭제. 단, `header_render.js` 의 검색 기능이 `products` 전역 배열을 참조하고 있으므로 같이 수정한다.

**비유**: 옛날 진열대를 새 진열대로 교체하는데, 매장 간판(URL)과 매장 위치는 그대로 둠. 안쪽 진열 시스템만 창고(DB)랑 직접 연결되는 자동 컨베이어 벨트로 바꿈.

---

### 10-3. 카테고리 재구성 (고객 관점으로)

**현재 (내부 관점, 27개):**
```
[대분류] BRAND / CUSTOM / 팀웨어 / 캐주얼
  BRAND: 농구의류, SHIRTS, BOTTOM, HOODIE, MTM, 축구의류
  CUSTOM: 농구, 축구, 배구
  팀웨어: 슈팅저지, 전사티, 트랙탑 웜업, 후드 웜업, TEAMWEAR, 컴프레션, 연습복
  캐주얼: 캐주얼 의류, 캐주얼 아우터, 악세서리, 용품, MD제품, 시즌오프
```

**개편안 (고객 관점, 10개 + 하위 세분화):**
```
[대분류] — 쇼핑몰 네비게이션에 노출되는 것
1. 농구 (BASKETBALL)
2. 축구 (SOCCER)
3. 배구 (VOLLEYBALL)
4. 팀웨어 (TEAMWEAR)       ← 슈팅저지, 전사티, 트랙탑, 후드, TEAMWEAR
5. 컴프레션 (COMPRESSION)
6. 연습복 (PRACTICE)
7. 캐주얼 (CASUAL)          ← 캐주얼 의류, 아우터, MTM, HOODIE, SHIRTS, BOTTOM
8. 악세서리 & 용품 (GEAR)   ← 악세서리 + 용품 통합
9. MD 제품 (MD PICKS)
10. 시즌오프 (SALE)
```

**내부 type 필드는 유지:**
- `product.type = 'ready'` 또는 `'custom'` — 이건 "판매 방식"의 구분이지 카테고리가 아니므로 그대로 DB 컬럼에 유지.
- 고객 관점 카테고리는 위 10개, 각 카테고리 안에서 "기성품 / 커스텀 제작" 필터 버튼으로 type을 토글.

**매핑표 (현재 categoryId → 새 categoryId):**

| 현재 ID | 현재 이름 | 상품 수 | 새 ID | 새 이름 | 비고 |
|---------|---------|--------|---------|---------|------|
| 10 | 농구의류 | 124 | 100 | 농구 | brand+cafe24 통합 |
| 20 | 농구 (custom) | 23 | 100 | 농구 | 같은 카테고리, type=custom |
| 57 | 축구의류 | 33 | 101 | 축구 | |
| 21 | 축구 (custom) | 10 | 101 | 축구 | |
| 22 | 배구 (custom) | 4 | 102 | 배구 | |
| 30 | 슈팅저지 | 5 | 103 | 팀웨어 | 팀웨어 하위 통합 |
| 31 | 전사티 | 3 | 103 | 팀웨어 | |
| 32 | 트랙탑 웜업 | 3 | 103 | 팀웨어 | |
| 33 | 후드 웜업 | 3 | 103 | 팀웨어 | |
| 50 | cafe24 TEAMWEAR | 48 | 103 | 팀웨어 | |
| 51 | 컴프레션 | 18 | 104 | 컴프레션 | |
| 52 | 연습복 | 12 | 105 | 연습복 | |
| 40 | 캐주얼 의류 | 2 | 106 | 캐주얼 | |
| 41 | 캐주얼 아우터 | 2 | 106 | 캐주얼 | |
| 11 | SHIRTS | 27 | 106 | 캐주얼 | brand 캐주얼 흡수 |
| 12 | BOTTOM | 5 | 106 | 캐주얼 | |
| 13 | HOODIE | 8 | 106 | 캐주얼 | |
| 14 | MTM | 6 | 106 | 캐주얼 | |
| 53 | 악세서리 | 4 | 107 | 악세서리&용품 | |
| 54 | 용품 | 4 | 107 | 악세서리&용품 | |
| 55 | MD제품 | 19 | 108 | MD제품 | |
| 56 | 시즌오프 | 0 | 109 | 시즌오프 | 빈 카테고리 |

**결과 예상 분포:**
- 농구 147, 축구 43, 배구 4, 팀웨어 62, 컴프레션 18, 연습복 12, 캐주얼 50, 악세서리&용품 8, MD제품 19, 시즌오프 0 = **363개 그대로**

**주의 — 기존 대분류(1~4번 BRAND/CUSTOM/팀웨어/캐주얼)는 어떻게?**
- 관리자 UI(admin-products)에서는 여전히 필요할 수 있음 → **소프트 처리**: 기존 대분류 4개는 active=0 (비활성) 처리하고, 새 대분류 10개를 parentId=null 로 추가.
- 하위 카테고리들은 `parentId` 를 새 대분류로 갱신 + 대부분의 상품은 직접 새 대분류에 매핑.

**마이그레이션 스크립트 필요: `dev/migrate-categories.js`**
- 새 카테고리 10개 INSERT (id 100~109)
- 기존 상품 363개의 categoryId UPDATE (매핑표 기준)
- 기존 카테고리 1~57번은 active=0 으로 비활성
- 트랜잭션으로 묶어서 실패 시 롤백

---

### 10-4. 네비게이션 동적 생성 설계

**현재 (하드코딩):**
- `STIZ` / `TEAMWEAR` / `STORE` / `COMMUNITY` 4개 메인 메뉴
- TEAMWEAR 메가메뉴: 농구/축구/배구/트레이닝 하드코딩
- STORE 드롭다운: Apparel/Equipment/KOGAS 하드코딩

**개편안 (DB 연동):**
- 메인 메뉴 구조 유지: `STIZ` / `SHOP` / `CUSTOM` / `COMMUNITY`
  - `STIZ` — 브랜드 스토리, 룩북 (정적, 하드코딩 유지)
  - `SHOP` — DB 카테고리 기반 메가메뉴 (동적)
  - `CUSTOM` — 커스텀 제작 안내 + Smart Design Lab (정적, 하드코딩 유지)
  - `COMMUNITY` — 공지, 문의, 리뷰 (정적, 하드코딩 유지)
- SHOP 메가메뉴는 `GET /api/products/categories` 로 받아온 대분류 10개를 2열 그리드로 표시
- 각 항목 클릭 → `list.html?category={id}` 이동
- 카테고리명 오른쪽에 상품 수 뱃지 표시 `(147)`
- 로딩 시 skeleton으로 3열 placeholder 표시

**구현 방식:**
- `header_render.js` 에서 `renderHeader()` 호출 후 비동기로 `loadShopMenu()` 실행
- 카테고리 로드 전에는 SHOP 드롭다운에 "Loading..." placeholder
- `sessionStorage` 에 카테고리 트리 캐싱 (같은 세션 내 재호출 방지)
- `product-data.js` 는 삭제되므로, 기존 `initSearchUI()` 의 `products` 전역 참조도 `/api/products?search=` API 호출로 교체

**비유**: 기존 네비는 "종이에 쓴 메뉴판"이었다면, 새 네비는 "식당 주방(DB)과 연결된 전자 메뉴판". 창고에 상품을 추가/삭제하면 메뉴판이 자동으로 갱신됨.

---

### 10-5. 페이지별 전환 상세

#### 10-5-1. index.html (메인 랜딩)

**유지할 것 (랜딩 디자인):**
- Hero 배너 영상/이미지
- 브랜드 스토리 섹션
- Instagram 피드 (`instagram-feed.js`)
- FOMO 토스트
- 룩북 미리보기

**교체할 것:**
- "베스트셀러" 섹션: `product-data.js` 의 `isBest:true` 하드코딩 → `GET /api/products/featured?limit=8`
- "신상품" 섹션: 동일하게 `GET /api/products/featured?sort=newest&limit=8`
- 상품 카드 렌더 함수: `shop.js` 의 `createProductCard()` 재사용

**새 카드 디자인 주의:**
- 썸네일: `product.thumbnail` 없으면 No Image placeholder
- 링크: `detail.html?id=${id}` (URL 유지, `shop-detail.html` 아님)
- 가격 포맷: `shop.js` 의 `formatPrice()` 재사용 (커스텀은 `~` 접두사)

#### 10-5-2. list.html (상품 목록)

**통째로 교체**: `<main>` 내부를 `shop.html` 의 `<main>` 구조로 대체. URL 파라미터 호환성 유지.

| 기존 URL | 새 동작 |
|---------|---------|
| `list.html?type=custom` | 커스텀 탭 활성화 (filter.type='custom') |
| `list.html?type=custom&category=basketball` | 카테고리=농구(100) + type=custom |
| `list.html?type=store` | 기성품 탭 활성화 (filter.type='ready') |
| `list.html?category=soccer` | 카테고리=축구(101) 선택 |

- 기존 `category=basketball/soccer/volleyball/teamwear/sportswear/accessories/kogas` 7개 슬러그는 새 카테고리 ID로 리디렉션 테이블 필요:
  ```
  basketball  → 100
  soccer      → 101
  volleyball  → 102
  teamwear    → 103
  sportswear  → 104 (컴프레션)
  accessories → 107
  kogas       → 108 (MD)
  ```
- 카테고리 탭 버튼: 하드코딩 6개 → `/api/products/categories` 응답으로 동적 생성 (대분류 10개 + "전체")
- 스크립트: `js/product-data.js` 제거, `js/shop.js` 로직을 `js/list.js` 로 복사 (또는 `shop.js` 그대로 사용하고 `list.html` 에서 import)

#### 10-5-3. detail.html (상품 상세)

**통째로 교체**: `shop-detail.js` 로직을 `detail.js` 로 복사/이관.
- URL: `detail.html?id=123` — 숫자 ID 그대로 사용
- 기존 하드코딩 상품은 `product-data.js` 에서 ID 1~33 이었으므로 DB id 와 충돌 가능성 있음 → DB의 products.id 는 자동증가이므로 1~363 사용 중. 하드코딩 33개와 DB 상품이 같은 ID 공간에 있음.
- 기존 `detail.html?id=1` 같은 링크가 이제 DB상의 id=1 (다른 상품)을 가리키게 됨. **의도된 변경**으로 수용. (기존 북마크는 깨짐)
- "관련 상품" 섹션: `/api/products?category={같은카테고리}&limit=4` 호출
- 장바구니 담기 버튼: 기존 `cart.js` 와 연동 필요 (cart는 이미 `shop-detail.js` 와 연동되고 있으므로 로직 재사용)

#### 10-5-4. shop.html / shop-detail.html

**삭제**: 로직을 list/detail 로 이관한 뒤 파일은 제거. 혼란 방지.
- 단, 이관 후 **충분히 테스트 통과할 때까지는 남겨둠** → 로드맵에서 단계 분리

---

### 10-6. 실행 로드맵 (총 예상 6~8시간)

**전제**: Phase E (Part 8) 까지 완료된 상태에서 시작. DB에 products 363개 + `/api/products` 동작 확인.

| 순서 | 작업 | 담당 | 예상 | 선행 | 병렬 여부 |
|------|------|------|------|------|---------|
| 1 | 카테고리 재구성 마이그레이션 스크립트 작성+실행 (`dev/migrate-categories.js`) | developer | 60분 | 없음 | 단독 |
| 2 | 마이그레이션 결과 검증 (카테고리 10개, 상품 재배치 확인) | tester | 15분 | 1 | 단독 |
| 3 | `header_render.js` SHOP 메가메뉴 동적화 (`/api/products/categories` 호출) | developer | 60분 | 2 | 5와 병렬 |
| 4 | `initSearchUI()` 의 `products` 전역 참조를 API 호출로 교체 | developer | 30분 | 2 | 5와 병렬 |
| 5 | `list.html` 본문 교체: `shop.html` 구조+스크립트 이관, URL 파라미터 호환 맵 추가 | developer | 90분 | 2 | 3,4와 병렬 |
| 6 | `detail.html` 본문 교체: `shop-detail.html` 로직 이관 | developer | 60분 | 2 | 5와 순차 (같은 개발자면) |
| 7 | `index.html` 베스트/신상 섹션만 `/api/products/featured` 로 교체 | developer | 45분 | 6 | 단독 |
| 8 | 통합 테스트: 전 페이지에서 상품 표시, 카테고리 필터, 검색, 장바구니 동작 확인 | tester + reviewer | 45분 | 7 | 병렬 |
| 9 | `product-data.js`, `shop.html`, `shop-detail.html` 삭제 + 참조 제거 | developer | 20분 | 8 (통과 후) | 단독 |

**단계 2, 8 사이 커밋 2회:**
- 커밋 1: 카테고리 재구성 (단계 1~2)
- 커밋 2: API 전환 전체 (단계 3~9)

---

### 10-7. 수정 파일 목록

| 파일 경로 | 역할 | 신규/수정/삭제 |
|----------|------|--------------|
| `dev/migrate-categories.js` | 카테고리 재구성 마이그레이션 | 신규 |
| `server/data/stiz.db` | product_categories +10개, products.categoryId 일괄 UPDATE | 수정 (트랜잭션) |
| `js/header_render.js` | SHOP 메가메뉴 동적 생성, initSearchUI API 전환 | 수정 |
| `list.html` | `<main>` 내부를 shop 구조로 교체, script src 변경 | 수정 |
| `js/list.js` | shop.js 로직 이관 + URL 파라미터 호환 맵 | 신규 (shop.js 기반) |
| `detail.html` | `<main>` 내부를 shop-detail 구조로 교체 | 수정 |
| `js/detail.js` | shop-detail.js 로직 이관 | 신규 (shop-detail.js 기반) |
| `index.html` | 베스트셀러/신상품 섹션만 API fetch로 교체 | 수정 |
| `js/main.js` | `products` 참조 부분이 있으면 API 호출로 교체 | 수정 (있는 경우) |
| `js/product-data.js` | 삭제 | 삭제 |
| `shop.html` | 삭제 (list.html에 통합 후) | 삭제 |
| `shop-detail.html` | 삭제 (detail.html에 통합 후) | 삭제 |
| `js/shop.js` | 삭제 (list.js에 통합 후) | 삭제 |
| `js/shop-detail.js` | 삭제 (detail.js에 통합 후) | 삭제 |

**product-data.js 참조 확인 필요 파일 (작업 전 grep):**
- `list.html`, `detail.html`, `index.html`, `header_render.js`, `main.js`, `fomo-toast.js`, `lookbook.js`, `analytics.js` 등 — script 태그/전역 `products` 사용 여부 확인 후 전부 제거

---

### 10-8. developer 주의사항

1. **카테고리 마이그레이션은 백업 필수**: 스크립트 실행 전에 `server/data/stiz.db` 를 `stiz.db.bak-{날짜}` 로 복사. 롤백 경로 확보.
2. **새 카테고리 ID 번호 100~109 사용**: 기존 ID (1~57)와 겹치지 않도록. 관리자 UI에서도 자동으로 보이게 됨.
3. **기존 카테고리 1~57 삭제 금지, active=0 비활성만**: 과거 주문의 카테고리 참조가 깨지지 않도록. 고객 쇼핑몰에는 안 보이고, 관리자에서도 "비활성" 탭에만 표시.
4. **URL 하위호환**: `list.html?category=basketball` → JS에서 슬러그 감지 시 새 ID로 리라우팅. 기존 메일/블로그 링크 보존.
5. **shop.html 삭제는 통합 테스트 통과 후**: 마지막 단계. 먼저 list/detail 에 이관하고 충분히 테스트한 다음 삭제.
6. **detail.html ID 충돌 주의**: 기존 product-data.js 의 ID와 DB의 id가 겹침. 예: `detail.html?id=1` 이 이전에는 "STIZ Pro Basketball Jersey - Home"(하드코딩)이었지만 이제는 DB의 id=1 상품. **사용자에게 미리 알림** — 기존 북마크는 깨질 수 있음.
7. **SHOP 메가메뉴 캐시**: 매번 API 호출하면 페이지 이동마다 네트워크 낭비. `sessionStorage` 에 5분 TTL 로 캐싱.
8. **검색 API**: `initSearchUI` 에서 입력 시마다 API 호출하면 서버 부담 → 300ms 디바운스 + 최소 2글자 유지.
9. **이미지 경로 호환**: 카페24 이전 상품 이미지는 `/uploads/products/cafe24/{id}/...` 경로. 이미 shop-detail.js가 정상 동작 중이므로 같은 패턴 재사용.
10. **빈 카테고리 처리**: 시즌오프(109) 등 상품 0개 카테고리는 네비 메가메뉴에서 숨김 (상품 수 0이면 li 생략).

---

### 10-9. 기술 결정 (decisions.md 반영 예정)

| # | 결정 | 이유 |
|---|------|------|
| D-79 | 페이지 파일 교체 방식 (옵션 C): URL 유지 + 본문 이식 | 리다이렉트/rename 는 SEO·링크 깨짐, 옵션 C가 이식 작업량은 있지만 사용자 경험 무손실 |
| D-80 | 카테고리 재구성: 대분류 10개 고객 관점 | 기존 BRAND/CUSTOM 대분류는 "판매 방식" 이라 고객이 이해 못함. 종목/용도 기준으로 재편 |
| D-81 | 내부 구분은 products.type (ready/custom) 유지 | 카테고리에 녹이지 말고 필터 탭으로 분리 — 한 농구 카테고리 안에서 "기성 / 맞춤" 토글 |
| D-82 | 기존 카테고리 비활성만 (삭제 금지) | 주문 이력의 categoryId 참조 보존. active=0 으로 쇼핑몰·네비에서만 숨김 |
| D-83 | SHOP 메가메뉴: DB 드리븐 + sessionStorage 5분 캐시 | 관리자가 카테고리 추가 시 새 세션부터 자동 반영, 성능과 실시간성 균형 |
| D-84 | URL 하위호환: 슬러그 → ID 리라우팅 맵 | `list.html?category=basketball` 같은 기존 링크 보존 |
| D-85 | `shop.html` / `shop-detail.html` 최종 삭제 | 중복 유지 금지. 테스트 통과 후 완전 제거 |

---

### 10-10. 바이브 코더용 요약 (3줄 설명)

1. **지금 상황**: 창고(DB)에 363개 상품이 있는데, 매장(index/list/detail)은 옛날 카탈로그 33개만 보여주고 있음. 창고와 매장이 끊겨 있음.
2. **할 일**: 매장 진열대 로직을 창고랑 연결 (shop.html의 로직을 list.html/detail.html에 이식). 동시에 카테고리 이름을 "BRAND/CUSTOM" 같은 내부 용어에서 "농구/축구/배구" 같은 고객 용어로 바꿈.
3. **결과**: 네비게이션 SHOP 메뉴에서 카테고리 10개가 자동으로 나오고, 각 페이지에서 DB의 363개 상품이 바로 노출됨. 관리자가 admin-products 에서 상품을 추가하면 쇼핑몰에 즉시 반영됨.

---

## Part 11. stiz.kr 상품 완벽 재이전 (2026-04-06 기획)

### 11-1. 배경: 지금 뭐가 잘못됐나

첫 번째 이전(Part 10까지)에서 261개 상품을 가져오긴 했지만, **3가지 치명적 문제**가 있다.

비유로 설명하자면, 원본(stiz.kr)이라는 본점이 있고 우리는 신축 지점(stizshop)으로 이사 중인데, 지금 상태는:

1. **가격표가 엉터리**. 본점 쇼윈도에는 "가격 문의"라고 붙어있는데, 우리가 옮긴 가격표에는 "49,500원"이라고 써있다. 왜냐하면 스크래퍼가 쇼윈도 안쪽의 **페이스북 공유용 숨은 라벨**(meta 태그 `product:price:amount`)을 읽었기 때문. 그 숨은 라벨은 실제 판매가가 아니라 마케팅용 숫자였다.
2. **매대 구조가 한 층짜리**. 본점은 "농구 → 헤리티지 시리즈 / 프로 시리즈 / 리버시블" 같은 **2단 선반**인데, 우리는 "농구" 한 칸에 147개를 몽땅 쌓아놨다. 고객이 원하는 시리즈를 찾을 수 없다.
3. **상품 설명서가 텅 빔**. 본점 상품 태그에는 "원산지 / 제조사 / 브랜드 / 상세 이미지 10장"이 있는데, 우리는 간단한 `description` 한 줄만 가져왔다. 상세페이지를 열어도 보여줄 게 없다.

이번 Part 11의 목표는 **본점과 100% 똑같이 복제**하는 것.

#### 발견된 데이터 원천 (schema.org JSON-LD)

카페24의 모든 상품 상세페이지에는 `<script type="application/ld+json">` 블록이 숨어있고, 그 안에 진짜 정보가 들어있다. 이게 Google·Facebook용 **진짜 메타데이터**라 할인 숫자가 섞이지 않는다.

```json
{
  "@type": "Product",
  "name": "진짜 상품명 (og:title보다 정확)",
  "description": "진짜 상세 설명",
  "brand": { "name": "STIZ" },
  "offers": {
    "price": "상담 후 결제",   // ← 숫자가 아니라 문자열일 수도 있음!
    "priceCurrency": "KRW"
  }
}
```

`price`가 숫자면 그대로 저장, 문자열이면 `isConsultPrice=1` 플래그를 세우고 `price=NULL`로 둔다. 프론트에서는 이 플래그를 보고 "상담 후 결제" 배지를 렌더링.

---

### 11-2. 목표와 결과물

목표: **stiz.kr 상품 정보 100% 동기화**. 가격/카테고리 트리/상세페이지/메타정보(원산지·브랜드·사이즈) 전부 정확하게.

결과물:
- `products` 테이블에 6개 컬럼 추가 (detailHtml, origin, brand, modelName, manufacturer, isConsultPrice)
- `product_categories` 에 하위 카테고리 약 25개 추가 (id 110~134)
- 스크래퍼 재작성본 `dev/scrape-cafe24-v2.js`
- 상세 이미지 다운로더 확장 (본문 이미지 수십 장 추가 다운로드)
- DB 재 import (기존 261개 UPDATE, 신규 없으면 추가)
- 프론트 렌더링 3곳 수정 (list 하위탭, detail 상세 HTML 표시, 가격 "상담 후 결제" 처리)

---

### 11-3. DB 스키마 변경 (Part 1)

비유: 상품 태그(products 테이블)에 **빈 칸 6개**를 새로 뚫는 작업. 기존 데이터는 그대로.

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `detailHtml` | TEXT | `''` | 카페24 상세설명 영역 HTML 전체. 이미지 URL은 로컬 경로로 치환된 상태로 저장. |
| `origin` | TEXT | `''` | 원산지 (예: "대한민국", "베트남") |
| `brand` | TEXT | `''` | 브랜드명 (schema.org `brand.name`, 보통 "STIZ") |
| `modelName` | TEXT | `''` | 모델명 (상품정보고시의 "모델명") |
| `manufacturer` | TEXT | `''` | 제조사 (상품정보고시의 "제조사") |
| `isConsultPrice` | INTEGER | 0 | 1이면 "상담 후 결제", price는 0/NULL 의미 없음 |

#### 마이그레이션 방식

SQLite는 `ALTER TABLE ... ADD COLUMN` 을 지원하므로, 새 테이블을 만들 필요 없이 6줄짜리 ALTER로 끝난다. 기존 361개 행은 새 컬럼이 자동으로 빈 값으로 채워진다. 그 후 재 import 때 값이 채워짐.

파일: `dev/migrate-products-schema-v2.js` (신규)

```js
// 비유: 엑셀 시트 맨 오른쪽에 빈 열 6개 추가
db.exec(`
  ALTER TABLE products ADD COLUMN detailHtml TEXT DEFAULT '';
  ALTER TABLE products ADD COLUMN origin TEXT DEFAULT '';
  ALTER TABLE products ADD COLUMN brand TEXT DEFAULT '';
  ALTER TABLE products ADD COLUMN modelName TEXT DEFAULT '';
  ALTER TABLE products ADD COLUMN manufacturer TEXT DEFAULT '';
  ALTER TABLE products ADD COLUMN isConsultPrice INTEGER DEFAULT 0;
`);
```

또한 `server/schema.sql` 에도 동일한 컬럼을 **정식 추가**한다. 이래야 새 환경에서 DB를 처음 만들 때도 컬럼이 바로 생김. (마이그레이션 스크립트 + schema.sql 동시 업데이트가 원칙.)

---

### 11-4. 카테고리 트리 재구축 (Part 2)

현재: 대분류 10개(100~109)만 존재, 하위 없음.
목표: 대분류는 그대로 두고 **하위 25개**(id 110~134)를 parentId 로 연결.

비유: 백화점 층 안내도에 "2층 여성복"만 써있던 걸 "2층 여성복 → 캐주얼/정장/아우터" 로 세분화하는 것. 층 번호(100~109)는 그대로 유지.

#### 하위 카테고리 매핑표 (stiz.kr 기준)

| 새 id | 새 slug | 새 이름 | 부모 id | stiz.kr cate_no |
|------|---------|--------|---------|----------------|
| 110 | basketball-heritage | 헤리티지 시리즈 | 100 농구 | 261 |
| 111 | basketball-pro | 프로 시리즈 | 100 농구 | 266 |
| 112 | basketball-reversible | 리버시블 시리즈 | 100 농구 | 196 |
| 113 | soccer-2023 | 2023 시즌 | 101 축구 | 263 |
| 114 | soccer-2024 | 2024 시즌 | 101 축구 | 268 |
| 115 | teamwear-tshirt | 반팔 티셔츠 | 103 팀웨어 | 204 |
| 116 | teamwear-shooting-shirt | 슈팅 셔츠 | 103 팀웨어 | 201 |
| 117 | teamwear-shooting-jersey | 슈팅 저지 | 103 팀웨어 | 200 |
| 118 | teamwear-tracktop | 트랙탑·웜업 | 103 팀웨어 | 203 |
| 119 | teamwear-hoodie | 후디·맨투맨 | 103 팀웨어 | 284 |
| 120 | compression-top | 컴프레션 상의 | 104 컴프레션 | 210 |
| 121 | compression-arm | 암슬리브 | 104 컴프레션 | 217 |
| 122 | compression-kids | 컴프레션 키즈 | 104 컴프레션 | 265 |
| 123 | compression-bottom | 컴프레션 하의 | 104 컴프레션 | 211 |
| 124 | casual-long-sleeve | 긴팔 티셔츠 | 106 캐주얼 | 212 |
| 125 | casual-short-sleeve | 반팔 티셔츠 | 106 캐주얼 | 216 |
| 126 | casual-pants | 팬츠 | 106 캐주얼 | 232 |
| 127 | casual-shorts | 쇼츠 | 106 캐주얼 | 233 |
| 128 | md-products | MD 제품 | 108 MD제품 | 254 |
| 129 | md-custom-order | 주문 제작 | 108 MD제품 | 259 |

20개 시작 — 스크래핑 중 새 하위 카테고리가 발견되면 130~134 범위에서 확장한다. (여유분 5칸)

#### 주의: 기존 parent 카테고리(100~109)는 건드리지 않음

고객이 "농구" 탭을 누르면 3개 시리즈(110/111/112) 전부를 묶어서 보여줘야 한다. 즉 **parent 카테고리는 사라지는 게 아니라 "가상 합집합"** 역할을 한다. 백엔드 API에서 `categoryId=100` 쿼리를 받으면 "100 또는 parentId=100"으로 해석하면 된다.

SQL 비유:
```sql
-- 농구 전체 (100 + 하위)
SELECT * FROM products
WHERE categoryId = 100
   OR categoryId IN (SELECT id FROM product_categories WHERE parentId = 100)
```

파일: `dev/migrate-subcategories.js` (신규)

---

### 11-5. 스크래퍼 재작성 (Part 3)

기존 `dev/scrape-cafe24.js`는 **정규식 기반**이었다. 그것 대신:
- **schema.org JSON-LD** 를 1순위 데이터 원천으로
- 카페24 상품정보고시 테이블(`#xans-product-addition` 또는 `.xans-product-addition` 영역) 파싱
- 상세 설명 영역(`#prdDetail`, `.xans-product-detail`, `.cont` 등 후보) 전체 HTML 추출

새 파일: `dev/scrape-cafe24-v2.js` (기존 v1 은 백업 참고용으로 남김)

#### 파싱 전략 (우선순위)

1. **상품명**: schema.org JSON-LD `name` → 없으면 og:title → fallback 정규식
2. **설명**: schema.org `description` → og:description
3. **가격**:
   ```js
   const raw = jsonLd?.offers?.price;
   if (typeof raw === 'number' || /^\d+$/.test(raw)) {
     price = parseInt(raw, 10);
     isConsultPrice = 0;
   } else {
     price = 0;
     isConsultPrice = 1;   // "상담 후 결제" 등
   }
   ```
4. **브랜드**: `jsonLd.brand.name` 또는 `jsonLd.brand` (string)
5. **원산지/모델명/제조사**: 상품정보고시 테이블에서 키-값 추출
   - 카페24 공통 영역: `<table ... class="xans-product-addition">` 또는 `.product_info_area`
   - `<th>원산지</th><td>대한민국</td>` 패턴
6. **사이즈**: `<select name="option1">` 의 `<option>` 값 리스트 (기존 로직 유지)
7. **상세페이지 HTML**: 다음 셀렉터를 순서대로 시도
   1. `#prdDetail .cont`
   2. `.xans-product-detail`
   3. `div[style*="text-align"]` 중 가장 큰 블록 (휴리스틱)
8. **상세 이미지**: 기존 `data-src` 정규식 유지 + 상세 HTML 영역 내부의 `<img src>` 도 수집

#### 하위 카테고리 순회

기존 스크래퍼는 대분류 cate_no 11개만 돌았다. v2는 **상위 카테고리 페이지에서 하위 카테고리 링크를 먼저 추출** 후 각각 순회한다:

```
/product/list.html?cate_no=191  (BASKETBALL 상위)
  → 페이지 내 "xans-product-headcategory" 블록에서
    /product/list.html?cate_no=261 (heritage)
    /product/list.html?cate_no=266 (pro)
    /product/list.html?cate_no=196 (reversible) 링크 발견
```

파싱 대상: `<ul class="xans-product-displaycategory">` 또는 `.menuCategory` 내부 `<a href="?cate_no=XXX">`.

발견한 cate_no 는 11-4의 매핑표와 대조 → 우리 DB의 `childCategoryId` 기록.

#### JSON 출력 스키마 (v2)

```json
{
  "cafe24Id": 1234,
  "sku": "CAFE24-1234",
  "name": "페가수스 홈 유니폼",
  "description": "...",
  "price": 49500,
  "isConsultPrice": 0,
  "brand": "STIZ",
  "origin": "대한민국",
  "modelName": "PGS25T1BAL001",
  "manufacturer": "스티즈",
  "parentCategoryId": 100,
  "childCategoryId": 110,
  "parentCategorySlug": "basketball",
  "childCategorySlug": "basketball-heritage",
  "mainImage": "https://.../main.jpg",
  "detailImages": ["https://.../1.jpg", "..."],
  "detailHtmlRaw": "<div>...</div>",
  "options": [{"type":"사이즈","value":"M"}, ...]
}
```

---

### 11-6. 이미지 다운로드 확장 (Part 4)

기존 `download-cafe24-images.js` 는 `mainImage + detailImages` 만 다운로드. v2 스크래퍼가 수집하는 **detailHtmlRaw 안의 이미지**는 별도로 처리해야 한다.

비유: 상품 카탈로그 1장만 복사하던 걸, **책자 전체(20페이지)를 페이지별로 복사**하는 수준으로 확장.

#### 신규: `dev/download-cafe24-images-v2.js`

동작:
1. JSON 로드 후 각 상품마다:
   - `detailHtmlRaw` 안의 모든 `<img src="...">` URL 추출
   - `mainImage`, `detailImages`, detailHtml 이미지 모두 합쳐 유니크 리스트
   - `server/uploads/products/cafe24/{id}/` 에 저장 (main.jpg, detail-N.ext, body-N.ext)
2. **HTML 경로 치환**: detailHtmlRaw 안의 카페24 CDN URL 을 로컬 경로로 **일괄 replace** → `detailHtml` 로 저장
3. JSON 에 `mainImageLocal`, `detailImagesLocal`, `detailHtml` (치환 완료본) 기록

치환 예:
```
//cafe24.poxo.com/ec-product-detail/...big/abc.jpg
→ /uploads/products/cafe24/1234/body-5.jpg
```

이래야 프론트에서 `innerHTML = product.detailHtml` 로 그대로 렌더링해도 이미지가 **우리 서버에서** 로드된다. 나중에 카페24 계약 끝나도 안전.

#### 보안·용량 주의

- 한 상품 상세페이지에 이미지 30장+가 흔함 → 261개 × 30 ≈ **7,830장** 예상. 디스크 약 500MB~1GB.
- 다운로드에 1~2시간 예상 (200ms 딜레이 × 7800).
- **HTML sanitize**: detailHtml 을 그대로 innerHTML 에 넣으므로 XSS 위험. 카페24 원본을 신뢰하더라도 `<script>` 태그는 파싱 단계에서 제거 권장. 간단한 정규식 `/<script[^>]*>[\s\S]*?<\/script>/gi → ''` 로 충분.

---

### 11-7. DB 재 import (Part 5)

기존 `import-cafe24.js` 확장본: `dev/import-cafe24-v2.js` 신규.

변경점:
- `UPDATE products SET ...` 에 신규 6개 컬럼 포함
- `categoryId` 는 **childCategoryId 우선**, 없으면 parentCategoryId
- `cafe24Id` 기준 UPSERT: 이미 있으면 UPDATE, 없으면 INSERT (기존과 동일)
- 이미지는 기존과 동일하게 **DELETE → INSERT** (재실행 안전)
- 옵션도 동일하게 DELETE → INSERT

삭제 정책: **기존 261개 삭제 금지**. cafe24Id 로 매칭해서 UPDATE 하는 것이 원칙 — 주문 이력(`order_items.productId`)이 FK 로 참조 중이라 삭제하면 위험.

실행 순서:
1. DB 백업: `cp server/data/stiz.db server/data/stiz.db.bak-20260406`
2. `node dev/migrate-products-schema-v2.js` — 컬럼 6개 추가
3. `node dev/migrate-subcategories.js` — 하위 카테고리 20개 삽입
4. `node dev/scrape-cafe24-v2.js` — stiz.kr 전체 재스크래핑 (약 40분)
5. `node dev/download-cafe24-images-v2.js` — 이미지 재다운로드 (약 1~2시간)
6. `node dev/import-cafe24-v2.js` — DB 반영
7. 검증 쿼리 몇 가지로 결과 확인

검증 체크리스트 (tester 참고):
- [ ] `SELECT COUNT(*) FROM products WHERE detailHtml != ''` → 250+
- [ ] `SELECT COUNT(*) FROM products WHERE isConsultPrice = 1` → 0보다 큼 (실제로 상담 상품이 존재해야)
- [ ] `SELECT COUNT(*) FROM products WHERE origin != ''` → 250+
- [ ] `SELECT COUNT(*) FROM product_categories WHERE parentId IS NOT NULL` → 20
- [ ] 무작위 5개 상품 수동 비교 (stiz.kr 원본 vs DB 값)

---

### 11-8. 프론트 반영 (Part 6)

#### detail.html / js/detail.js

- 가격 렌더링 분기:
  ```js
  if (product.isConsultPrice) {
    priceEl.innerHTML = '<span class="consult-badge">상담 후 결제</span>';
  } else {
    priceEl.textContent = product.price.toLocaleString() + '원';
  }
  ```
- 상세 HTML 주입:
  ```js
  detailAreaEl.innerHTML = product.detailHtml || '';
  ```
- 상품정보고시 박스 추가: 원산지/브랜드/모델명/제조사 4줄 테이블

#### list.html / js/list.js

- URL: `list.html?category=basketball` → 농구 전체 (100 + 하위)
- URL: `list.html?category=basketball&sub=heritage` → 헤리티지만
- 상단에 **하위 카테고리 탭** 렌더링: parent 카테고리 선택 시 하위 3~5개 탭 자동 표시
- 하위가 없는 카테고리(배구 등)는 탭 영역 숨김

#### API: server/routes/products.js

- `GET /api/products?categoryId=100` → parent 처리 로직 추가 (100 + parentId=100 합집합)
- `GET /api/products/:id` → 응답에 6개 신규 컬럼 포함
- `GET /api/products/categories` → parent + children 중첩 구조로 반환

기존 product-data.js 기반 33개 카탈로그는 이미 Part 10 에서 제거 예정 — Part 11 과 의존 관계 없음.

---

### 11-9. 수정/신규 파일 목록

| 파일 | 역할 | 구분 |
|------|------|------|
| `server/schema.sql` | products 컬럼 6개 정식 추가 | 수정 |
| `dev/migrate-products-schema-v2.js` | ALTER TABLE 실행 | 신규 |
| `dev/migrate-subcategories.js` | 하위 카테고리 20개 삽입 | 신규 |
| `dev/scrape-cafe24-v2.js` | schema.org JSON-LD + 상품정보고시 + 상세 HTML 추출 | 신규 |
| `dev/download-cafe24-images-v2.js` | 이미지 일괄 다운로드 + detailHtml URL 치환 | 신규 |
| `dev/import-cafe24-v2.js` | UPSERT with 신규 컬럼 | 신규 |
| `dev/cafe24-products-v2.json` | 스크래핑 중간 산출물 | 신규 (생성물) |
| `server/routes/products.js` | categoryId parent 합집합 + 응답 컬럼 확장 | 수정 |
| `js/detail.js` | 가격 분기 + 상세 HTML 주입 + 상품정보고시 | 수정 |
| `js/list.js` | 하위 카테고리 탭 렌더링 | 수정 |
| `detail.html` | 상품정보고시/상세 영역 DOM 추가 | 수정 |
| `list.html` | 하위 탭 컨테이너 추가 | 수정 |
| `.claude/knowledge/decisions.md` | D-86 ~ D-91 기록 | 수정 |
| `.claude/knowledge/architecture.md` | products 컬럼 변경 반영 | 수정 |

기존 v1 스크립트(`scrape-cafe24.js`, `download-cafe24-images.js`, `import-cafe24.js`)는 **삭제하지 않고 보존**. 롤백 참조용.

---

### 11-10. 실행 계획 (7단계)

| 순서 | 작업 | 담당 | 선행 | 예상 |
|------|------|------|------|------|
| 1 | DB 백업 + 스키마 확장 + 하위 카테고리 마이그레이션 | developer | - | 20분 |
| 2 | 마이그레이션 검증 (컬럼/카테고리 존재 확인) | tester | 1 | 5분 |
| 3 | scrape-cafe24-v2.js 작성 + 5개 상품 샘플 테스트 | developer | 2 | 1.5시간 |
| 4 | 전체 스크래핑 + 이미지 다운로드 실행 | developer | 3 | 2~3시간 (자동) |
| 5 | import-cafe24-v2.js 작성 + 실행 | developer | 4 | 40분 |
| 6 | 프론트 수정 (detail/list/api 3파일) | developer | 5 | 1.5시간 |
| 7 | 통합 테스트 + 코드 리뷰 (병렬) | tester + reviewer | 6 | 30분 |

**총 예상**: 6~8시간 (그중 자동 실행 2~3시간 포함).

**병렬 가능**: 3단계의 스크래퍼 개발은 6단계 프론트 설계와 부분적으로 병렬 가능. 하지만 바이브 코더 작업 흐름상 순차로 진행 권장.

**중간 커밋 포인트**:
- 커밋 1: 단계 1~2 (스키마 + 카테고리 마이그레이션)
- 커밋 2: 단계 3 (스크래퍼 v2 작성 + 샘플 검증)
- 커밋 3: 단계 4~5 (전체 재이전 데이터 반영)
- 커밋 4: 단계 6~7 (프론트 + 검증 통과)

---

### 11-11. 기술 결정 (decisions.md 반영 예정)

| # | 결정 | 이유 |
|---|------|------|
| D-86 | schema.org JSON-LD 를 1순위 데이터 원천 | og meta 와 product:price 는 마케팅용/할인용이 섞여있어 부정확. JSON-LD 는 Google/Facebook 공식 스펙이라 정확도 가장 높음 |
| D-87 | 가격 필드에 `isConsultPrice` 플래그 추가 | "상담 후 결제" 를 0 원으로 저장하면 무료 상품과 구분 불가. boolean 플래그가 UI 렌더링에도 유리 |
| D-88 | 하위 카테고리는 id 110~134 신규 부여, parentId 연결 | 기존 100~109 대분류는 그대로 두고 트리 구조로 확장. 주문 이력 FK 안 깨짐 |
| D-89 | categoryId parent 합집합 조회 규칙 | 고객이 "농구" 탭 누르면 하위 시리즈 전부 보여야 함. API 한 곳에서만 처리하면 프론트는 단순 유지 |
| D-90 | detailHtml 은 카페24 원본 HTML 을 로컬 이미지 경로로 치환해서 저장 | 서버 측 치환 1회로 끝내고 프론트는 innerHTML 만 하면 됨. 카페24 계약 종료 이후에도 이미지 표시 보장 |
| D-91 | 기존 v1 스크래퍼/import 스크립트 보존 (삭제 금지) | 롤백 참조용. 신규는 `-v2` 접미사로 구분 |

---

### 11-12. developer 주의사항 (중요)

1. **DB 백업 필수**: 1단계 시작 전 `cp server/data/stiz.db server/data/stiz.db.bak-20260406` — 이미지 다운로드는 2시간짜리 작업이라 한 번 실패하면 뼈아픔.
2. **ALTER TABLE은 재실행 금지**: 이미 컬럼이 있으면 에러. 스크립트 상단에 `PRAGMA table_info(products)` 로 컬럼 존재 확인 후 조건부 실행.
3. **schema.sql 동시 업데이트 필수**: 마이그레이션 스크립트만 업데이트하면 새 환경 초기화 때 컬럼이 빠진다. 두 곳 동기화가 규칙.
4. **카페24 원본 상품이 삭제된 경우**: 스크래퍼 실행 시 기존 DB 에 있는데 원본에 없는 상품 발견 가능. 이 경우 **삭제 대신 `status='archived'` 로 표시**. 주문 이력 보존.
5. **isConsultPrice 감지 오판 방지**: price 가 숫자형 문자열("49500")도 숫자로 취급해야 함. `/^\d+$/.test(raw)` 로 엄격하게.
6. **상품정보고시 파싱 불안정**: 카페24 상품마다 테이블 구조가 다를 수 있음. 원산지/모델명/제조사가 비어도 에러가 아닌 **빈 문자열**로 저장.
7. **detailHtml sanitize**: `<script>` 태그는 반드시 제거. XSS 위험보다 카페24 측 스크립트(상품 추천 위젯 등)가 우리 페이지에서 오작동할 가능성이 더 큼.
8. **이미지 URL 치환 순서**: 긴 URL 먼저, 짧은 URL 나중. 안 그러면 중복 치환. `urls.sort((a,b) => b.length - a.length)` 필수.
9. **하위 카테고리 상품 분포 확인**: 스크래핑 완료 후 "헤리티지 0개, 프로 0개" 같은 불균형이 있으면 **스크래퍼의 서브카테고리 발견 로직이 실패한 것**. 즉시 중단하고 원인 파악.
10. **5개 샘플 테스트 필수**: 전체 돌리기 전에 **농구/축구/팀웨어/컴프레션/MD 각 1개씩** 5개만 먼저 돌려서 JSON 을 눈으로 검수. 2시간 낭비 방지.
11. **detailHtml 용량 주의**: 상품당 수 KB ~ 수십 KB. 261개 × 평균 20KB = 약 5MB. DB 크기 증가분은 괜찮지만 `/api/products` 목록 API 에는 detailHtml 제외 (select 명시). 상세 조회 API 에서만 반환.
12. **하위 탭 URL 파라미터 이름**: `sub=heritage` vs `child=heritage` vs `series=heritage` 혼용 금지. `sub` 로 통일.

---

### 11-13. 바이브 코더용 요약 (3줄 설명)

1. **지금 상황**: 지난번 이전에서 가격은 할인용 숫자를 잘못 가져왔고, 카테고리는 층만 있고 선반이 없고, 상세페이지는 텅 비었음. 본점(stiz.kr)과 지점(우리 DB)이 많이 다름.
2. **할 일**: (1) 상품 테이블에 빈 칸 6개 추가, (2) 카테고리 선반 20개 신설, (3) 스크래퍼를 schema.org 기반으로 다시 만들어서 진짜 정보(가격·원산지·상세 HTML·이미지 수십 장)를 전부 가져옴, (4) 이미지 7천 장 다운로드, (5) DB 재 import, (6) 프론트에서 "상담 후 결제" 배지 + 상세 HTML + 하위 탭 렌더링.
3. **결과**: stiz.kr 를 열고 나란히 비교해도 구분 안 될 정도로 똑같은 상품 정보가 우리 쇼핑몰에 표시됨. 고객이 "농구 → 헤리티지 시리즈" 로 드릴다운 가능. 카페24 계약 종료해도 이미지/설명 전부 자체 서버에서 서비스 가능.
