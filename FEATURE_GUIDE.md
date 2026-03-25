# STIZ 쇼핑몰 — 기능 사용 가이드

> 이 문서는 STIZ 쇼핑몰의 모든 개발 기능을 설명합니다.
> 각 기능의 **사용법**, **코드 구조**, **커스터마이징 방법**을 포함합니다.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [상품 관리](#2-상품-관리)
3. [장바구니 시스템](#3-장바구니-시스템)
4. [주문/결제 프로세스](#4-주문결제-프로세스)
5. [회원 인증](#5-회원-인증)
6. [AI Design Lab](#6-ai-design-lab)
7. [AI 챗봇](#7-ai-챗봇)
8. [검색/필터/정렬](#8-검색필터정렬)
9. [애널리틱스](#9-애널리틱스)
10. [서버 백엔드](#10-서버-백엔드)

---

## 1. 프로젝트 개요

### 1-1. 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | HTML5, Tailwind CSS (CDN), Vanilla JavaScript (ES6+) |
| 디자인 도구 | Fabric.js (2D 캔버스 에디터) |
| 결제 | PortOne (아임포트) SDK |
| 주소 검색 | Daum Postcode API |
| AI | Google Gemini 2.5 Flash + Imagen 4.0 |
| 백엔드 | Node.js + Express.js |
| DB | JSON 파일 기반 (MVP용) |
| 분석 | Google Analytics 4, 네이버 애널리틱스 |

### 1-2. 폴더 구조

```
stizshop/
├── index.html                 # 메인 페이지
├── list.html                  # 상품 목록
├── detail.html                # 상품 상세
├── basket.html                # 장바구니
├── order.html                 # 주문/결제
├── order_result.html          # 주문 완료
├── login.html                 # 로그인
├── join.html                  # 회원가입
├── myshop.html                # 마이페이지
├── custom.html                # Design Lab 메인
├── custom_2d.html             # 2D 디자인 도구
├── custom_3d.html             # 3D 디자인 (플레이스홀더)
├── custom_mockup.html         # 시안 요청
├── notice.html                # 공지/FAQ
├── lookbook.html              # 룩북
├── inquiry.html               # 문의하기
├── css/
│   └── style.css              # 커스텀 스타일
├── js/
│   ├── product-data.js        # 상품 데이터 (Mock DB)
│   ├── cart.js                # 장바구니 로직
│   ├── auth.js                # 인증 로직
│   ├── chatbot.js             # AI 챗봇
│   ├── analytics.js           # 애널리틱스
│   ├── header_render.js       # 공통 헤더/푸터
│   ├── custom_2d.js           # 2D 디자인 도구
│   ├── custom.js              # 디자인 도구 (레거시)
│   ├── main.js                # 전역 초기화
│   └── mockup.js              # 시안 헬퍼
├── images/                    # 이미지 에셋
├── server/
│   ├── server.js              # Express 서버 진입점
│   ├── db.js                  # JSON 파일 DB
│   ├── .env.example           # 환경 변수 템플릿
│   ├── package.json
│   ├── routes/
│   │   ├── auth.js            # 인증 API
│   │   ├── orders.js          # 주문 API
│   │   └── ai.js              # AI 생성 API
│   └── data/                  # JSON DB 파일 (자동 생성)
├── FEATURE_GUIDE.md           # ← 이 문서
└── CAFE24_MIGRATION_GUIDE.md  # Cafe24 이전 가이드
```

### 1-3. 실행 방법

#### 프론트엔드만 실행 (정적 파일)
```bash
# 아무 HTTP 서버로 실행
npx serve .
# 또는
python -m http.server 8080
# 또는 VS Code Live Server 확장 사용

# 브라우저에서 http://localhost:8080 접속
```

> 프론트엔드는 AI 기능을 제외하고 **백엔드 없이 독립 동작**합니다.
> 장바구니, 인증, 주문 모두 localStorage 기반으로 작동합니다.

#### 백엔드 (AI Design Lab용)
```bash
cd server

# 환경 설정
cp .env.example .env
# .env 파일에 GOOGLE_API_KEY 입력

# 의존성 설치
npm install

# 개발 모드 (파일 변경 시 자동 재시작)
npm run dev

# 프로덕션
npm start
```

서버는 기본 포트 `3000`에서 실행됩니다.

---

## 2. 상품 관리

### 2-1. 데이터 구조

상품 데이터는 `js/product-data.js`에 JavaScript 배열로 정의되어 있습니다.

```javascript
{
    id: 1,                          // 고유 ID (숫자)
    name: "STIZ Pro Basketball Jersey", // 상품명
    price: 49000,                   // 가격 (원)
    category: "basketball",         // 카테고리
    type: "custom",                 // "custom" (팀웨어 제작) 또는 "store" (기성품)
    sizes: ["S", "M", "L", "XL", "2XL"], // 사이즈 옵션
    colors: ["White", "Black", "Red"],    // 색상 옵션
    stock: 100,                     // 재고 수량
    image: "이미지 URL",            // 대표 이미지
    images: ["URL1", "URL2"],       // 추가 이미지 (상세 페이지)
    description: "상품 설명",        // 상세 설명
    isNew: false,                   // 신상품 여부 (NEW 배지)
    isBest: true                    // 베스트셀러 여부 (BEST 배지)
}
```

### 2-2. 카테고리 분류

| 카테고리 | 설명 | 타입 |
|----------|------|------|
| `basketball` | 농구 유니폼 | custom |
| `soccer` | 축구 유니폼 | custom |
| `volleyball` | 배구 유니폼 | custom |
| `baseball` | 야구 유니폼 | custom |
| `teamwear` | 일반 팀웨어 | custom |
| `sportswear` | 스포츠웨어 (기성품) | store |
| `accessories` | 악세서리 | store |
| `kogas` | KOGAS MD 상품 | store |

### 2-3. 상품 추가 방법

`js/product-data.js`의 `products` 배열에 새 객체를 추가합니다:

```javascript
const products = [
    // 기존 상품들...

    // 새 상품 추가
    {
        id: 34,  // 기존 최대 ID + 1
        name: "New Team Hoodie",
        price: 65000,
        category: "teamwear",
        type: "store",
        sizes: ["M", "L", "XL"],
        colors: ["Black", "Gray"],
        stock: 50,
        image: "images/products/hoodie.jpg",
        images: ["images/products/hoodie.jpg", "images/products/hoodie_back.jpg"],
        description: "Premium cotton blend team hoodie.",
        isNew: true,
        isBest: false
    }
];
```

### 2-4. 조회 함수

```javascript
// 모든 상품
products

// ID로 조회
getProductById(1)

// 카테고리별 조회
getProductsByCategory("basketball")
getProductsByCategory("basketball", "custom")  // 카테고리 + 타입

// 베스트셀러 (기본 4개)
getBestSellers()
getBestSellers(8)  // 8개

// 신상품 (기본 4개)
getNewArrivals()
getNewArrivals(8)  // 8개
```

### 2-5. 이미지 관리

현재 이미지는 Unsplash URL을 사용합니다. 로컬 이미지로 전환 시:

```
images/products/
├── basketball/
│   ├── jersey-home.jpg
│   ├── jersey-away.jpg
│   └── shorts.jpg
├── soccer/
│   ├── jersey-home.jpg
│   └── jersey-away.jpg
└── ...
```

`image` 필드를 로컬 경로로 변경:
```javascript
image: "images/products/basketball/jersey-home.jpg"
```

---

## 3. 장바구니 시스템

### 3-1. 핵심 설정

파일: `js/cart.js`

```javascript
const CART_KEY = 'stiz_cart';             // localStorage 키
const FREE_SHIPPING_THRESHOLD = 50000;    // 무료 배송 기준 (₩50,000)
const SHIPPING_COST = 3000;               // 기본 배송비 (₩3,000)
```

### 3-2. API 함수

| 함수 | 설명 | 반환값 |
|------|------|--------|
| `getCart()` | 장바구니 전체 조회 | `[{id, name, price, image, size, qty, addedAt}]` |
| `addToCart(product)` | 장바구니에 추가 | void (alert 표시) |
| `removeFromCart(index)` | 인덱스로 제거 | void |
| `updateCartItemQty(index, qty)` | 수량 변경 | void |
| `clearCart()` | 전체 비우기 | void |
| `getCartTotal()` | 소계 계산 | 숫자 (원) |
| `getShippingCost()` | 배송비 계산 | `0` 또는 `3000` |
| `getGrandTotal()` | 총합 (소계+배송비) | 숫자 (원) |
| `updateCartCount()` | 헤더 배지 업데이트 | void |

### 3-3. 장바구니 추가 사용 예시

```javascript
// 상품 상세 페이지에서 장바구니 추가
addToCart({
    id: 1,
    name: "STIZ Pro Basketball Jersey",
    price: 49000,
    image: "이미지URL",
    size: "L",
    qty: 2
});
```

같은 `id` + `size` 조합이 이미 있으면 **수량만 증가**합니다.

### 3-4. 배송비 정책

```
주문 금액 < ₩50,000  → 배송비 ₩3,000
주문 금액 ≥ ₩50,000  → 무료 배송
장바구니 비어있음     → 배송비 ₩0
```

`basket.html`에서는 무료 배송까지 남은 금액을 프로그레스 바로 표시합니다.

### 3-5. localStorage 데이터 구조

```json
// localStorage 키: "stiz_cart"
[
    {
        "id": 1,
        "name": "STIZ Pro Basketball Jersey - Home",
        "price": 49000,
        "image": "...",
        "size": "L",
        "qty": 2,
        "addedAt": "2026-03-13T10:00:00.000Z"
    }
]
```

---

## 4. 주문/결제 프로세스

### 4-1. 주문 플로우

```
basket.html → order.html → [PG 결제] → order_result.html
  장바구니     주문서 작성     결제 처리     주문 완료
```

### 4-2. 주문서 입력 항목

| 섹션 | 필드 | 필수 | 검증 |
|------|------|------|------|
| 연락처 | 이름 | O | 2자 이상 |
| | 이메일 | O | 이메일 형식 |
| | 전화번호 | O | 10자리 이상 숫자 |
| 배송지 | 우편번호 | O | Daum API로 검색 |
| | 기본주소 | O | Daum API 자동입력 |
| | 상세주소 | X | |
| 배송메모 | 선택 | X | 5개 옵션 + 직접입력 |
| 결제방법 | 라디오 | O | card/transfer/vbank |
| 약관동의 | 체크박스 | O | |

### 4-3. 결제 수단

| 값 | 설명 | PortOne 매핑 |
|----|------|-------------|
| `card` | 신용/체크카드 | `card` |
| `transfer` | 계좌이체 | `trans` |
| `vbank` | 가상계좌 | `vbank` |

### 4-4. PortOne PG 결제 설정

파일: `order.html` 내 인라인 스크립트

```javascript
const PORTONE_CONFIG = {
    storeId: '',       // PortOne 상점 ID (admin.portone.io에서 확인)
    channelKey: '',    // PortOne 채널 키
    isTestMode: true,  // true = 테스트 모드
};
```

#### PortOne 설정 방법:

1. [admin.portone.io](https://admin.portone.io) 접속 → 회원가입
2. **상점 ID** 확인 (대시보드 → 상점 정보)
3. **채널 추가** → PG사 선택 (KG이니시스, NHN KCP 등)
4. **채널 키** 복사
5. `order.html`의 `PORTONE_CONFIG`에 입력
6. 테스트 결제 실행 → 정상 동작 확인 후 `isTestMode: false`

#### Mock 결제 (키 미설정 시):

PortOne 키가 비어있으면 자동으로 **Mock 결제** 처리됩니다:
- 실제 결제 없이 주문이 생성됨
- `paymentId: "mock_1710000000000"` 형태로 저장
- 개발/테스트 환경에서 사용

### 4-5. Daum 주소 검색

`order.html`에서 "주소 검색" 버튼 클릭 시 Daum Postcode API 팝업이 열립니다:

```javascript
function searchAddress() {
    new daum.Postcode({
        oncomplete: function(data) {
            document.getElementById('order-postcode').value = data.zonecode;
            document.getElementById('order-address').value = data.roadAddress || data.jibunAddress;
            document.getElementById('order-address-detail').focus();
        }
    }).open();
}
```

### 4-6. 주문 데이터 구조

```json
{
    "orderNumber": "STIZ-20260313-1234",
    "customer": {
        "name": "홍길동",
        "email": "hong@example.com",
        "phone": "010-1234-5678"
    },
    "shipping": {
        "postcode": "06234",
        "address": "서울특별시 강남구 테헤란로 123",
        "addressDetail": "4층 401호",
        "note": "문 앞에 놓아주세요"
    },
    "payment": "card",
    "paymentId": "imp_123456789",
    "status": "paid",
    "items": [
        { "id": 1, "name": "...", "price": 49000, "size": "L", "qty": 2 }
    ],
    "subtotal": 98000,
    "shippingCost": 0,
    "total": 98000,
    "createdAt": "2026-03-13T10:00:00.000Z"
}
```

### 4-7. 주문 번호 생성 규칙

```
STIZ-YYYYMMDD-XXXX
      ^^^^^^^^ ^^^^
      날짜     랜덤4자리
```

예: `STIZ-20260313-4821`

---

## 5. 회원 인증

### 5-1. 인증 구조

파일: `js/auth.js`

현재는 **localStorage 기반 Mock 인증**입니다.
서버 API 엔드포인트(`/api/auth/*`)도 준비되어 있어 JWT 전환이 가능합니다.

### 5-2. API 함수

| 함수 | 설명 | 반환값 |
|------|------|--------|
| `isLoggedIn()` | 로그인 여부 확인 | `boolean` |
| `getUser()` | 현재 사용자 정보 | `{id, name, email, joinedAt}` 또는 `null` |
| `register({name, email, password})` | 회원가입 | `{success, user}` 또는 `{success, error}` |
| `login(email, password)` | 로그인 | `{success, user}` 또는 `{success, error}` |
| `logout()` | 로그아웃 | void (index.html로 이동) |
| `getUserOrders()` | 주문 이력 조회 | `[orderData, ...]` |
| `updateHeaderAuth()` | 헤더 UI 업데이트 | void |

### 5-3. 검증 규칙

| 필드 | 규칙 | 에러 메시지 |
|------|------|------------|
| 이름 | 2자 이상 | "이름을 2자 이상 입력해주세요." |
| 이메일 | 이메일 형식 | "올바른 이메일을 입력해주세요." |
| 비밀번호 | 8자 이상 | "비밀번호는 8자 이상이어야 합니다." |
| 중복 이메일 | 기존 가입자 확인 | "이미 가입된 이메일입니다." |

### 5-4. 사용 예시

```javascript
// 회원가입
const result = register({
    name: "홍길동",
    email: "hong@example.com",
    password: "password123"
});

if (result.success) {
    console.log("가입 완료:", result.user);
} else {
    console.log("가입 실패:", result.error);
}

// 로그인
const loginResult = login("hong@example.com", "password123");

if (loginResult.success) {
    location.href = 'myshop.html';
}

// 로그인 확인
if (isLoggedIn()) {
    const user = getUser();
    console.log("환영합니다,", user.name);
}

// 주문 이력
const orders = getUserOrders();
console.log(`총 ${orders.length}건의 주문`);
```

### 5-5. localStorage 키

| 키 | 내용 |
|----|------|
| `stiz_user` | 현재 로그인된 사용자 |
| `stiz_users` | 모든 등록 사용자 목록 |
| `stiz_orders` | 모든 주문 데이터 |
| `stiz_last_order` | 마지막 주문 (결과 페이지용) |
| `stiz_cart` | 장바구니 데이터 |

### 5-6. 페이지별 인증 동작

| 페이지 | 동작 |
|--------|------|
| `login.html` | 이미 로그인 시 myshop.html로 리다이렉트 |
| `myshop.html` | 비로그인 시 login.html로 리다이렉트 |
| `order.html` | 로그인 없이도 주문 가능 (게스트 주문) |
| 헤더 | 로그인 시: Login→My Page, Join→Logout으로 변경 |

---

## 6. AI Design Lab

### 6-1. 2D 디자인 도구

파일: `js/custom_2d.js`, 페이지: `custom_2d.html`

Fabric.js 캔버스 기반 유니폼 디자인 도구입니다.

#### 지원 스포츠:

| 스포츠 | 템플릿 | 특징 |
|--------|--------|------|
| Soccer (축구) | 셔츠 + 반바지 | 칼라 디자인 |
| Basketball (농구) | 민소매 저지 | 넓은 암홀 |
| Volleyball (배구) | V넥 저지 | 스트라이프 가능 |
| Baseball (야구) | 버튼 셔츠 | 앞 여밈 라인 |

#### 디자인 기능:

```javascript
// 스포츠 템플릿 로드
loadLayeredProduct('soccer')    // 축구 템플릿
loadLayeredProduct('basketball') // 농구 템플릿

// 선수 번호 추가 (캔버스 중앙에 큰 숫자)
window.addPlayerNumber()
// → 기본값: "10", fontSize: 120

// 선수 이름 추가 (캔버스 상단에 텍스트)
window.addPlayerName()
// → 기본값: "PLAYER", charSpacing: 200

// 색상 변경
// 좌측 패널에서 Body Color, Trim Color, Collar Color 클릭
```

#### 레이어 구조:

```
Canvas
├── Body Layer (몸통)     → clipPath로 마스킹된 색상 영역
├── Sleeves Layer (소매)  → 포인트 색상 영역
├── Collar Layer (칼라)   → 칼라 색상 영역
├── Outline (외곽선)      → rgba(0,0,0,0.1) stroke
├── Player Number         → 편집 가능한 텍스트
└── Player Name           → 편집 가능한 텍스트
```

### 6-2. AI 이미지 생성

파일: `server/routes/ai.js`

AI 디자인 생성은 2단계로 동작합니다:

```
1단계: Gemini 2.5 Flash → 프롬프트 개선
2단계: Imagen 4.0       → 이미지 생성
```

#### AI 요청 흐름:

```javascript
// 프론트엔드에서 서버로 요청
fetch('http://localhost:3000/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        prompt: "Red and gold basketball jersey with dragon logo",
        type: "jersey"   // "jersey" 또는 "logo"
    })
});
```

#### AI 모드:

| type | AI 역할 | 출력 형태 |
|------|---------|----------|
| `logo` | 벡터 로고 디자이너 | 플랫 벡터 엠블럼 (흰 배경) |
| `jersey` | 3D 패션 디자이너 | 고스트 마네킹 유니폼 (흰 배경) |

#### Google API 키 설정:

```bash
# server/.env
GOOGLE_API_KEY=your-api-key-here
```

API 키 발급: [aistudio.google.com](https://aistudio.google.com/app/apikey)

> API 키가 없으면 Mock 이미지(플레이스홀더)가 반환됩니다.

---

## 7. AI 챗봇

파일: `js/chatbot.js`

### 7-1. 개요

한국어 규칙 기반 챗봇으로, 화면 우하단에 고정 표시됩니다.

### 7-2. 지원 주제

| 키워드 | 응답 내용 |
|--------|----------|
| 안녕, 하이, 헬로 | 환영 인사 + 빠른 답변 버튼 |
| 커스텀, 제작, 맞춤, 단체 | 커스텀 주문 안내 (최소 10장, 2~3주) |
| 배송, 배달, 택배 | 배송 정책 (2~3일, 5만원 무료배송) |
| 사이즈, 치수, 측정 | 사이즈표 (S~2XL) |
| 인기, 베스트, 추천 | 베스트셀러 상품 카드 4개 |
| 신상, 새로운, 최신 | 신상품 카드 4개 |
| 농구, 축구, 배구, 야구 등 | 해당 카테고리 상품 카드 |
| 가격, 얼마, 비용 | 가격대 안내 |
| 반품, 교환, 환불 | 반품/교환 정책 (7일 이내) |
| 연락, 전화, 이메일 | 연락처 정보 |

### 7-3. 상품 카드 표시

챗봇은 상품을 카드 형태로 보여줍니다:

```javascript
// 챗봇 내부에서 상품 카드 렌더링
renderProductCard(product)
// → 이미지, 카테고리, 상품명, 가격, "View Product" 링크
```

### 7-4. 챗봇 커스터마이징

새로운 응답 규칙 추가:

`js/chatbot.js`의 `processBotResponse(input)` 함수에 조건 추가:

```javascript
function processBotResponse(input) {
    const lower = input.toLowerCase();

    // 새 규칙 추가
    if (lower.includes('할인') || lower.includes('세일')) {
        return '현재 진행 중인 할인 이벤트는 없습니다. 프로모션 소식은 공지사항을 확인해주세요!';
    }

    // ... 기존 규칙들 ...
}
```

### 7-5. XSS 방지

사용자 입력은 `escapeHtml()` 함수로 이스케이프됩니다:

```javascript
function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
```

---

## 8. 검색/필터/정렬

### 8-1. 상품 검색

파일: `js/header_render.js`

헤더의 검색 아이콘 클릭 시 전체 화면 검색 오버레이가 표시됩니다.

**검색 대상:**
- 상품명 (`name`)
- 카테고리 (`category`)
- 설명 (`description`)

**검색 결과:** 최대 8개, 상품 카드로 표시

**키보드 지원:** ESC 키로 닫기

### 8-2. 카테고리 필터

파일: `list.html`

URL 파라미터로 카테고리를 필터링합니다:

```
list.html                    → 전체 상품
list.html?category=basketball → 농구 상품만
list.html?type=custom         → 커스텀(팀웨어) 상품만
list.html?category=soccer&type=custom → 축구 커스텀 상품
```

### 8-3. 정렬

| 옵션 | 설명 |
|------|------|
| latest (최신순) | ID 역순 (기본값) |
| price-low (가격 낮은순) | price 오름차순 |
| price-high (가격 높은순) | price 내림차순 |
| name (이름순) | name 알파벳순 |

---

## 9. 애널리틱스

파일: `js/analytics.js`

### 9-1. 설정

```javascript
// js/analytics.js 내부의 설정값 수정
const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';  // GA4 측정 ID
const NAVER_SITE_ID = 'your-naver-id';     // 네이버 애널리틱스 ID
```

#### GA4 측정 ID 발급:
1. [analytics.google.com](https://analytics.google.com) 접속
2. 관리 → 데이터 스트림 → 웹 스트림 생성
3. `G-XXXXXXXXXX` 형식의 측정 ID 복사

#### 네이버 애널리틱스 설정:
1. [analytics.naver.com](https://analytics.naver.com) 접속
2. 사이트 등록 → 사이트 ID 복사

### 9-2. 자동 로드

`header_render.js`에서 모든 페이지에 자동으로 `analytics.js`를 로드합니다.
별도 설정 없이 모든 페이지의 페이지뷰가 추적됩니다.

### 9-3. E-Commerce 이벤트 추적

```javascript
// 상품 조회 시
stizAnalytics.viewProduct({
    id: 1,
    name: "STIZ Pro Basketball Jersey",
    category: "basketball",
    price: 49000
});

// 장바구니 추가 시
stizAnalytics.addToCart(product, 2);

// 결제 시작 시
stizAnalytics.beginCheckout(cart, 98000);

// 구매 완료 시
stizAnalytics.purchase(orderData);
```

> 이 이벤트들은 아직 각 페이지에 자동 연동되어 있지 않습니다.
> 실제 운영 시 각 페이지의 해당 액션에 호출을 추가하세요.

### 9-4. 이벤트 연동 예시

`detail.html`에서 상품 조회 추적 추가:

```javascript
// 상품 상세 로드 시
document.addEventListener('DOMContentLoaded', () => {
    const product = getProductById(productId);
    if (product && window.stizAnalytics) {
        stizAnalytics.viewProduct(product);
    }
});
```

`basket.html`에서 결제 시작 추적:

```javascript
// 주문하기 버튼 클릭 시
function goToCheckout() {
    if (window.stizAnalytics) {
        stizAnalytics.beginCheckout(getCart(), getGrandTotal());
    }
    location.href = 'order.html';
}
```

---

## 10. 서버 백엔드

### 10-1. API 엔드포인트

| 메서드 | 경로 | 설명 | 요청 바디 |
|--------|------|------|----------|
| POST | `/api/auth/register` | 회원가입 | `{name, email, password}` |
| POST | `/api/auth/login` | 로그인 | `{email, password}` |
| POST | `/api/orders` | 주문 생성 | `{customer, items, shipping, ...}` |
| GET | `/api/orders` | 전체 주문 조회 | — |
| GET | `/api/orders/:orderNumber` | 주문 조회 | — |
| POST | `/api/generate` | AI 디자인 생성 | `{prompt, type}` |

### 10-2. 회원가입 API

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "홍길동",
    "email": "hong@example.com",
    "password": "password123"
  }'
```

응답:
```json
{
    "success": true,
    "user": { "id": 1710000000000, "name": "홍길동", "email": "hong@example.com" }
}
```

### 10-3. 로그인 API

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "hong@example.com",
    "password": "password123"
  }'
```

응답:
```json
{
    "success": true,
    "token": "mock-jwt-1710000000000-1710000000001",
    "user": { "id": 1710000000000, "name": "홍길동", "email": "hong@example.com" }
}
```

### 10-4. 주문 생성 API

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderNumber": "STIZ-20260313-1234",
    "customer": { "name": "홍길동", "email": "hong@example.com", "phone": "010-1234-5678" },
    "items": [{ "id": 1, "name": "Jersey", "price": 49000, "qty": 2 }],
    "shipping": { "address": "서울시 강남구", "postcode": "06234" },
    "total": 98000
  }'
```

### 10-5. JSON 파일 DB

파일: `server/db.js`

| 함수 | 설명 |
|------|------|
| `getAll(collection)` | 컬렉션 전체 조회 |
| `insert(collection, record)` | 레코드 추가 (자동 ID) |
| `findOne(collection, field, value)` | 필드 값으로 검색 |
| `findById(collection, id)` | ID로 검색 |
| `updateById(collection, id, updates)` | 업데이트 |
| `deleteById(collection, id)` | 삭제 |

데이터 저장 위치: `server/data/*.json`

```
server/data/
├── users.json    # 사용자 데이터
└── orders.json   # 주문 데이터
```

### 10-6. 환경 변수

파일: `server/.env.example`

```bash
PORT=3000                    # 서버 포트
GOOGLE_API_KEY=              # Google AI API 키
PORTONE_STORE_ID=            # PortOne 상점 ID
PORTONE_CHANNEL_KEY=         # PortOne 채널 키
PORTONE_API_SECRET=          # PortOne API 시크릿
JWT_SECRET=your-secret-key   # JWT 암호화 키
JWT_EXPIRES_IN=7d            # JWT 만료 기간
NODE_ENV=development         # 환경 모드
```

---

## 부록: 공통 컴포넌트

### 헤더 (header_render.js)

모든 페이지에서 `<header></header>` 태그에 자동으로 렌더링됩니다.

**네비게이션 구조:**
- STIZ (brand) → lookbook.html
- TEAMWEAR → 메가 메뉴 (Soccer, Basketball, Volleyball, Baseball, Custom Uniform)
- STORE → 메가 메뉴 (Sportswear, KOGAS MD, Accessories)
- COMMUNITY → 메가 메뉴 (Notice/FAQ, Inquiry, Lookbook)
- 검색, 로그인/마이페이지, 장바구니 아이콘

**메인 페이지 특성:**
- 초기: 투명 배경 + 흰색 텍스트
- 스크롤 시: 흰색 배경 + 검정 텍스트로 전환

### 푸터 (header_render.js)

모든 페이지에서 `<footer></footer>` 태그에 자동 렌더링됩니다.

**포함 정보:**
- 회사 정보 (STIZ, Seoul, Korea)
- 퀵 링크 (Shop, Support, Social)
- 저작권 표시

### 모바일 대응

- 768px 이하에서 햄버거 메뉴 활성화
- 네비게이션이 세로 슬라이드 패널로 변경
- 모든 기능 터치 친화적

---

## 부록: 트러블슈팅

### CORS 에러 (file:// 프로토콜)

로컬 파일로 직접 열면 CORS 에러가 발생합니다.
→ HTTP 서버(`npx serve .` 등)로 실행하세요.

### PortOne 결제 실패

1. 개발자 도구 콘솔에서 에러 확인
2. `PORTONE_CONFIG.storeId`와 `channelKey` 확인
3. PortOne 관리자에서 테스트 모드 활성화 확인
4. HTTPS 환경인지 확인 (일부 PG사는 HTTPS 필수)

### AI 생성 실패

1. `server/.env`의 `GOOGLE_API_KEY` 확인
2. 서버 콘솔에서 `[Image Gen] Failed:` 메시지 확인
3. Google AI Studio에서 API 키 할당량 확인
4. Imagen API 접근 권한 확인 (별도 신청 필요)

### 상품이 표시되지 않음

1. `js/product-data.js`가 페이지에 로드되었는지 확인
2. `<script src="js/product-data.js"></script>`가 다른 JS보다 **먼저** 로드되는지 확인
3. 브라우저 콘솔에서 `products` 변수 접근 가능 여부 확인
