# STIZ 쇼핑몰 — 소비자 UX 점검 리포트

> 작성일: 2026-04-21
> 범위: 소비자 접점 HTML 페이지 전체 (admin-*는 제외)
> 대상 파일: index / list / detail / cart / basket / checkout / order / order_result / order-track / order-custom / login / join / myshop / custom / custom_2d / custom_3d / custom_mockup / bulk-order / lookbook / community / notice / inquiry / about

---

## 요약 (Executive Summary)

전반적으로 헤더/푸터를 `js/header_render.js`로 통합 주입하고, 리다이렉트 페이지(`basket`, `order`, `order-custom`)로 구 URL 호환성을 챙긴 **짜임새 있는 구조**입니다. 다만 소비자 관점에서 다음 세 가지가 가장 큰 마찰을 만듭니다.

1. **"디자인 랩"(custom.html/custom_2d/3d/mockup)이 사이트의 나머지 부분과 단절**되어 있음 — 자체 헤더를 쓰고, 장바구니·로그인·챗봇 일부에 접근할 수 없으며, `custom_2d.html`의 "ADD TO CART" 버튼은 **실제로 동작하지 않음**.
2. **로그인 상태 체크가 `auth.js` 로드 전에 실행**되는 인라인 스크립트가 `login.html`과 `myshop.html`에 있어, `ReferenceError`로 인해 "이미 로그인 → myshop 이동", "비로그인 → login 이동" 리다이렉트가 실패할 가능성이 높음.
3. **헤더 장바구니 뱃지가 대부분 페이지에서 "0"으로 고정** — `cart.js`가 포함되지 않은 페이지(list, about, community, notice, lookbook, inquiry, join, login, bulk-order)에서는 실제 장바구니 개수를 반영하지 못함.

이 외에 언어 혼용(한/영), 문의 메뉴 네이밍 불일치, 주문 완료 후 "내 주문 확인" 경로 부재 등 일상적인 UX 개선 포인트가 여럿 있습니다.

---

## 1. 공통 구조 — 헤더/푸터/스크립트 로드

### 1.1 표준 패턴 (OK)
- 대부분의 소비자 페이지는 `<header></header>` / `<footer></footer>` 빈 태그를 두고 `js/header_render.js`가 DOM 로드 시점에 채웁니다. 로고 컬러 전환(메인은 투명+흰로고, 하위는 흰배경+검은로고)도 자동 처리됩니다.
- GNB 4개 축: **STIZ / TEAMWEAR / STORE / COMMUNITY** + 우측 유틸(검색·유저·카트·모바일 메뉴). 모바일 메뉴도 별도 섹션으로 제공.
- 카테고리 리스트는 `/api/products/categories`에서 불러와 `sessionStorage`에 5분 캐시, 실패 시 정적 기본 메뉴 유지 — 합리적 폴백.

### 1.2 문제점

**A. custom.* 페이지는 헤더/푸터/cart.js 모두 미포함 (증거: `js/` 디렉터리 grep 결과)**
- `custom.html`, `custom_2d.html`, `custom_3d.html`, `custom_mockup.html` 네 페이지 모두 `header_render.js`·`cart.js`를 로드하지 않고 **자체 헤더**(로고 + "Exit Lab" 링크만)를 사용.
- 결과: 디자인 중 장바구니/로그인/마이페이지/다른 카테고리로 이동하려면 로고→홈 경유 필요.
- 의도적일 수 있으나(몰입형), "쇼핑 중 → 디자인 → 다시 쇼핑" 흐름에서 컨텍스트가 끊깁니다.

**B. cart.js 누락 페이지의 헤더 장바구니 뱃지가 고정 `"0"` (증거: `header_render.js:258` 하드코딩, 업데이트는 `cart.js:59` `header .bg-red-600`)**
- `cart.js`를 포함하지 않는 페이지: `community`, `bulk-order`, `about`, `notice`, `lookbook`, `login`, `list`, `join`, `inquiry`, `custom*` 전부.
- 위 페이지들에서 헤더 우측 카트 아이콘의 빨간 뱃지가 **항상 "0"으로 표시**되어, 담아둔 상품이 있어도 0으로 보이는 혼란.
- 해결: `header_render.js` 내부에서 카트 개수를 직접 읽거나(localStorage 'stiz_cart'), 공통 스크립트로 묶어 모든 페이지에 로드.

**C. `cart.html`, `detail.html`의 스크립트 로드 순서 혼재 (증거: `cart.html:181-185`, `detail.html:507-513`)**
- `cart.html`: `cart.js`만 `defer` 없이 먼저, 나머지는 `defer`. `detail.html`: 전부 `defer` 없음.
- `cart.js:227`의 `DOMContentLoaded` 리스너가 등록된 이후에 `header_render.js`(defer)가 헤더를 주입하므로, **`updateCartCount()` 첫 호출 시 헤더 요소가 아직 없어** 뱃지 업데이트 실패. 대부분의 페이지에서 뱃지가 정확하지 않음.
- 해결: `header_render.js`의 `renderHeader()` 마지막에 `if (typeof updateCartCount === 'function') updateCartCount()` 호출.

**D. 푸터에 남은 `data-include="layout/footer.html"` 레거시 속성 (12개 파일)**
- `bulk-order, about, list, order-track, join, order_result, myshop, notice, lookbook, login, inquiry, community` — 실제로는 `header_render.js`가 내용을 덮어쓰므로 동작엔 영향 없지만, 읽는 사람을 혼란스럽게 함. 정리 권장.

---

## 2. 의도적 리다이렉트 페이지들 (정상)

다음 4개 파일은 구 URL 호환용으로 즉시 리다이렉트하는 껍데기. 의도된 설계이며 정상 동작:

| 파일 | 대상 | 증거 |
|---|---|---|
| `basket.html` | `cart.html` | `meta refresh` + `window.location.replace` (basket.html:6,12) |
| `order.html` | `checkout.html` | 동일 (order.html:6,12) |
| `order-custom.html` | `list.html?type=custom` | `window.location.replace` (order-custom.html:13). noscript 폴백 포함 |
| `admin-cs/design/production/shipping` | `admin.html?view=...` | admin용이지만 동일 패턴 |

---

## 3. 핵심 구매 플로우 — index → list → detail → cart → checkout → order_result

### 3.1 흐름 자체는 연결됨
- `index → detail`(카드 클릭): 정상
- `detail → cart`: "장바구니 담기"(기성품) 클릭 → `addToCartFromDetail()` → localStorage 저장 후 `alert('장바구니에 추가되었습니다!')` (cart.js:43)
- `cart → checkout`: "주문하기" → `goToCheckout()` → 빈 카트면 alert 후 차단, 아니면 `location.href='checkout.html'` (cart-page.js:203)
- `checkout → order_result`: 결제 완료 시 이동

### 3.2 문제점

**A. `detail.html`에서 "장바구니 담기" 클릭 후 피드백이 `alert`뿐 (detail.js 계열, cart.js:43)**
- 모바일에서는 alert이 괜찮을 수 있으나, PC에서 alert보다는 토스트/슬라이드-인 미니카트가 현대 이커머스 표준. 현재는 담은 후 페이지에 남아 추가 담기를 유도하는 장치가 "확인" 버튼밖에 없음.
- 개선: 토스트로 "장바구니에 담겼습니다 [바로가기 →]" 제공.

**B. `order_result.html`에 "내 주문 확인/추적" 링크가 없음 (order_result.html:99-108)**
- 주문 완료 후 CTA가 `Continue Shopping`(→ list.html) / `Back to Home`(→ index.html) 두 개뿐.
- 소비자가 방금 결제한 주문의 상세·진행 상황을 보고 싶을 때 이동할 곳이 없음. 일반 쇼핑몰이라면 "주문 상세 보기"(→ `order-track.html?orderNumber=...`) 또는 "내 주문함"(→ `myshop.html#orders`) 링크가 필수.
- 개선: 방금 생성된 `order.orderNumber`로 `order-track.html` 또는 `myshop.html` 딥링크 추가.

**C. `order_result.html`의 영·한 혼용 (order_result.html:58-107)**
- 타이틀·페이지 로고는 한국어(`STIZ - 주문 완료`)인데 본문은 전부 영어: `Thank you for your order!`, `Order Number`, `Shipping Address`, `Subtotal`, `Continue Shopping`, `Back to Home`.
- 주 고객층이 한국 팀 단체라면 어색함. 전체 한국어로 통일 권장.

**D. `order_result.html` 헤더 공백 스페이서 이중 사용 (order_result.html:44-45)**
- `<div class="h-20"></div>` 두 번. 의도 불명확한 더미 공백. 일관성 저해.

**E. 기성품과 커스텀의 detail 제출 플로우가 완전히 다름 (detail.html:177 vs :362)**
- 기성품(`ready`): "**장바구니 담기**" → cart/checkout 플로우
- 커스텀(`custom`): "**시안 요청하기**" → 서버 접수 → (아마도) 별도 확인 페이지
- 버튼 레이블·색상(브랜드블랙 vs 브랜드레드)으로 시각적 구분은 되지만, 사용자는 "이 버튼을 누르면 결제되는가, 요청만 들어가는가"가 헷갈릴 수 있음. "시안 요청하기" 버튼 옆에 **작게 "(결제 없이 견적 요청만 진행됩니다)"** 같은 헬퍼 문구 권장.

---

## 4. 커스텀 제작 플로우 — 가장 큰 UX 리스크

### 4.1 플로우 두 갈래가 공존
1. **셀프 서비스**: `custom.html` 허브 → `custom_2d.html` / `custom_3d.html` / `custom_mockup.html`
2. **요청 기반**: `list.html?type=custom` → `detail.html`(커스텀 상품) → "시안 요청하기"
3. **단체 주문**: `bulk-order.html` (견적 의뢰 폼)
4. **자유 시안 요청**: `inquiry.html` (메가메뉴에서는 "Free Design Request"로 표시)

네 가지 진입 경로가 모두 "디자인 맞춤"과 관련 있어 **사용자가 어디서 무엇을 해야 하는지 혼란**이 큼.

### 4.2 치명적 버그

**A. `custom_2d.html`의 "ADD TO CART" 버튼이 실제로 동작하지 않음 (custom_2d.html:303-306, 319-321)**
- 데스크탑 버튼:
  ```html
  <button class="w-full bg-black text-white py-4 font-bold ...">ADD TO CART</button>
  ```
  `onclick`, `id`, `class`(식별용) 모두 없음. `custom_2d.js`에서 이 버튼에 이벤트를 바인딩하는 코드 없음 (grep 확인: `addToCart` 문자열 없음).
- 모바일 버튼:
  ```html
  <button onclick="document.querySelector('[onclick*=addToCart], [onclick*=cart], .add-to-cart-btn, #add-to-cart')?.click()">
  ```
  찾으려는 셀렉터 중 어느 것도 현재 DOM에 존재하지 않음. 결과: **버튼 클릭 시 아무 일도 일어나지 않음**.
- 사용자 영향: 2D 에디터로 디자인을 한참 만든 뒤 장바구니에 담을 수 없음 → 이탈.
- 우선순위: **즉시 수정 필요**.

**B. `custom.html`의 언어가 전부 영어 (custom.html:82-173)**
- `CREATE YOUR IDENTITY`, `Start 2D Editor`, `Customize existing STIZ products...`, `Start 3D Design`, `NanoBanana AI Engine`, `Request Mockup`, `LAUNCH →`, `ENTER AI LAB →`, `VIRTUAL FIT →`
- 사이트 나머지는 한국어 주 사용. 메인 타깃이 한국 아마추어 팀이라면 언어 장벽.
- 특히 `NanoBanana AI Engine`은 내부 코드네임에 가까운 용어 — 소비자에게 무의미.

**C. `custom.html`에서 "Request Mockup" 카드의 위치가 개념적으로 혼란 (custom.html:147-176)**
- 2D 에디터 / 3D AI 디자인과 **병렬로 "Request Mockup"** 카드가 놓여 있음. 하지만 목업은 "디자인을 한 뒤 그것을 가상 착용해보는" 단계이므로, 빈손으로 목업을 요청하는 건 의미가 모호.
- 개선안: 2D/3D 에디터 **다음 단계**로 목업을 배치하거나, "디자이너에게 무료 시안 요청" 같은 명확한 역할로 재정의.

**D. `custom.html`에서 cart/로그인/챗봇 일부 기능 접근 불가 (custom.html:63-71)**
- 자체 헤더: 로고(홈으로) + "Exit Lab"(홈으로)만 존재. 디자인 중 장바구니 확인, 로그인, 다른 상품 보기 전부 불가.
- 챗봇 위젯은 `custom.html:183`에서 로드하지만, `custom_2d.html`의 사이드바가 챗봇 FAB와 겹칠 가능성 확인 필요.

**E. `bulk-order.html`에서 `cart.js` 미포함 — 헤더 카트 뱃지 0 고정**
- 단체 주문 페이지는 커스텀 플로우 핵심인데, 동일 문제 발생.

---

## 5. 회원 / 마이페이지 플로우

### 5.1 치명적 버그 — 인라인 스크립트와 defer의 순서 불일치

**A. `login.html:110-114` — `isLoggedIn()` 호출이 `auth.js` 로드 전에 실행됨**
```html
<script src="js/auth.js" defer></script>
<script>
    if (isLoggedIn()) {      // ← auth.js가 아직 로드되지 않음
        location.href = 'myshop.html';
    }
    async function handleLogin() { ... }
</script>
```
- 인라인 `<script>`는 `defer` 외부 스크립트보다 먼저 실행됨. 따라서 `isLoggedIn`은 `undefined` → `ReferenceError`.
- 영향: 이미 로그인한 사용자가 `login.html`을 다시 열어도 myshop으로 튀지 않고 로그인 화면을 그대로 봄. 혼란 유발.
- 해결: 인라인 스크립트를 `DOMContentLoaded` 리스너 안으로 감싸거나, 체크 로직을 `auth.js`로 이동.

**B. `myshop.html:202-207` — 동일 패턴으로 더 심각**
```html
<script src="js/auth.js" defer></script>
<script>
    if (!isLoggedIn()) {
        location.href = 'login.html';
    }
    ...
</script>
```
- ReferenceError로 리다이렉트가 막히면 **비로그인 사용자도 마이페이지 UI가 잠시 보이고**, 이후 API 호출이 401을 반환하면서 화면이 빈 상태로 남음.
- 해결: 인라인 스크립트를 `window.addEventListener('DOMContentLoaded', ...)`로 감싸기.

### 5.2 페이지별 로그인 처리 정책이 일관되지 않음

| 페이지 | 비로그인 처리 | 비고 |
|---|---|---|
| `cart.html` | 회원가입 유도 배너만 표시 (line 64-78), 진입 허용 | localStorage 기반 |
| `checkout.html` | 동일(line 90 대 회원가입 배너) | 주문 가능 |
| `myshop.html` | hard redirect → `login.html` (의도대로면) | 위 5.1-B 버그로 실패 가능 |
| `order-track.html` | 로그인 불필요 (게스트 주문 조회 지원, 주문번호+전화번호 또는 이름+전화번호) | 의도적 — 좋은 설계 |

- 원칙은 합리적이지만, **비로그인으로 결제까지 가능한지 명확하지 않음**. 결제 후 `myshop.html`에 주문 이력이 남을지, 게스트로 결제한 경우 `order-track.html`을 써야 하는지 사용자 안내 부족.
- 개선: `checkout.html` 배너에 "비회원 결제 시 주문 조회는 주문번호+전화번호로만 가능합니다"처럼 사후 조회 경로를 미리 안내.

### 5.3 기타
- `login.html:67` — "비밀번호 찾기" 링크가 `alert('비밀번호 찾기는 준비 중입니다. 문의하기를 이용해주세요.')`. 실제 서비스에 오픈하려면 반드시 구현 또는 문의 링크로 직결 필요.
- `login.html:87,91` — Kakao/Naver SNS 로그인 버튼이 `disabled` + `opacity-40`. 비활성 처리는 깔끔하나 이용 가능 시점이 언제인지 안내 없음.

---

## 6. 네비게이션 연결 지도

글로벌 헤더(`header_render.js:128~316`)에서 실제로 링크하는 페이지:

```
STIZ
  ├─ about.html (회사소개, #values, #contact 앵커)
  └─ lookbook.html

TEAMWEAR (메가메뉴)
  ├─ list.html?type=custom
  ├─ list.html?category=basketball/soccer/volleyball/teamwear
  ├─ custom.html (Smart Design Lab)
  └─ inquiry.html (Free Design Request)

STORE (드롭다운)
  ├─ list.html
  └─ list.html?category=casual/accessories/md-picks/sale

COMMUNITY
  ├─ community.html (+ ?tab=celeb/process/event)
  ├─ lookbook.html (포트폴리오)
  ├─ bulk-order.html (단체 주문)
  ├─ notice.html
  └─ inquiry.html (문의하기 Q&A)

우측 유틸
  ├─ 검색 버튼 (initSearchUI 바인딩)
  ├─ 유저 아이콘 → login.html (항상 login으로만, 로그인 상태여도 고정)
  └─ 카트 아이콘 → cart.html
```

### 6.1 문제점

**A. 유저 아이콘이 로그인 상태와 무관하게 항상 `login.html`로 고정 (header_render.js:247)**
- 이미 로그인한 사용자가 클릭해도 `login.html`로 가고, 거기서 또 `myshop.html`로 리다이렉트되는 2단계. 직접 `myshop.html`로 보내는 것이 자연스러움.
- 로그인 상태면 "마이페이지"·"로그아웃" 서브메뉴로 변형하는 것이 일반적 패턴.

**B. 검색 UI 존재 여부 / 동작 확인 필요**
- 헤더에 돋보기 아이콘은 있으나 `initSearchUI()`가 실제로 어떤 UI를 여는지 확인 필요(본 점검에서는 미확인). 검색어 입력 UI가 없으면 "검색 버튼이 아무 것도 안 함"으로 비칠 수 있음.

**C. `lookbook.html`이 두 메뉴에 중복 배치**
- STIZ 드롭다운에도, COMMUNITY 드롭다운에도 "포트폴리오/룩북". 좋은 접근성이지만 IA 상 역할이 애매 — 둘 중 하나로 통일해도 무방.

---

## 7. 용어·레이블 불일치

| 기능 | 나타나는 표현 | 출처 |
|---|---|---|
| 문의 | "문의하기 (Q&A)" (GNB) / "1:1 문의" (inquiry.html 타이틀) / "Free Design Request" (메가메뉴) / "문의하기" (inquiry.html 대체 링크) | header_render.js:231, inquiry.html:6, header_render.js:181 |
| 룩북 | "Lookbook" / "룩북 (Lookbook)" / "포트폴리오 (Lookbook)" / "포트폴리오" | header_render.js:145, 227, lookbook.html |
| 장바구니 | "장바구니" / "Basket" (URL) / "주문하기"(cart→checkout 버튼) / "cart"(URL) | cart.html:59, basket.html, cart.html:156 |
| 디자인 랩 | "Smart Design Lab" / "DESIGN LAB" / "Design Lab" / "디자인 랩"(페이지 타이틀) | header_render.js:175, custom.html:67, custom.html:8 |
| 커뮤니티 | "커뮤니티" / "매거진 (Magazine)" / "Celeb" / "이벤트 (Event)" | header_render.js:220-225 |

개선 원칙:
- 메인 레이블 = 한국어, 서브로 영문 병기 또는 그 반대로 **한 가지로 통일**.
- 특히 "문의"가 Q&A / 1:1 문의 / Free Design Request로 세 갈래인데, 사용자 입장에선 "어디서 뭘 물어봐야 하는지" 직관적이지 않음. 통합된 "문의" 허브 페이지에서 내용 분기가 자연스러움.

---

## 8. 빈 상태·에러 상태·피드백

### 8.1 구현 OK
- `cart.html:110-118`: 빈 장바구니 UI ("마음에 드는 상품을 담아보세요 + 쇼핑 계속하기")
- `detail.html`: 상품 로드 실패 시 에러 UI 렌더링 (detail.js 기반)
- `checkout.js:56`: 빈 카트로 체크아웃 진입 시 `location.href='cart.html'` 리다이렉트

### 8.2 개선 필요
- **`myshop.html`**: 주문/찜 API 실패 시 `console.warn`만 기록하고 UI에 피드백 없음. "주문 내역을 불러오지 못했습니다 [다시 시도]" 같은 문구 필요.
- **`order-track.html`**: 주문번호 오입력 시의 피드백 톤 확인 필요(본 점검에서 미확인).
- **결제 실패(`checkout.js:354`의 `failUrl: .../checkout.html?status=fail`)**: 실패 상태에서 사용자에게 보이는 UI가 별도 확인 필요.
- **`alert()` 의존**: `cart.js:43`, `cart-page.js:206` 등 핵심 플로우에서 `alert`를 씀. 브랜드 톤 일관성을 위해 토스트/모달 컴포넌트로 교체 권장.

---

## 9. 모바일·접근성

### 9.1 반응형 대응
- 대부분 페이지에서 Tailwind의 `md:` 브레이크포인트 활용. 헤더 모바일 메뉴, `custom_2d.html` 하단 고정 바 등 모바일 배려 흔적 있음.
- 그러나 `custom_2d.html`의 모바일 "ADD TO CART"는 동적 셀렉터에 의존 → **모바일에서도 동작 안 함**(4.2-A 참조).

### 9.2 접근성 포인트
- `login.html:51-57`은 `aria-label`을 정성껏 붙인 좋은 예.
- 반면 대부분의 페이지에서 아이콘-버튼(검색, 카트, 공유, 수량±)에 `aria-label`이 없음. 스크린리더 사용자에게 "버튼"으로만 읽힘.
- 이미지 `alt` 속성은 페이지마다 들쑥날쑥. 헤더 로고·메가메뉴 프로모 이미지(header_render.js:196)는 있지만, 상품 카드·히어로 이미지의 `alt`는 점검 필요.

---

## 10. 우선순위별 개선 제안

### 🔴 P0 — 즉시 수정 (기능이 깨지거나 사용자 이탈 직결)
1. **`custom_2d.html` "ADD TO CART" 동작 구현** — 데스크탑/모바일 둘 다 현재 무반응. (4.2-A)
2. **`login.html`·`myshop.html` 인라인 스크립트 → `DOMContentLoaded` 래핑** — 로그인 상태 체크 실패. (5.1)
3. **헤더 장바구니 뱃지 전역 업데이트** — `header_render.js` 끝에서 `updateCartCount()` 호출 + 모든 페이지에 `cart.js` 포함하거나, 헤더 렌더 시 localStorage 직접 읽기. (1.2-B/C)

### 🟠 P1 — 빠른 시일 내 개선 (주요 마찰)
4. **`order_result.html`에 "주문 추적/내 주문함" CTA 추가** — 결제 직후 자연스러운 다음 단계 제공. (3.2-B)
5. **`custom.html` 한국어화 + "Request Mockup" 포지셔닝 재검토** — 영어 전용 허브는 국내 팀웨어 시장에 어색. (4.2-B/C)
6. **헤더 유저 아이콘: 로그인 상태에서 myshop으로 직결** — 불필요한 2단계 제거. (6.1-A)
7. **"문의" 계열 용어 통일** — "1:1 문의 / Q&A / Free Design Request"를 하나의 명확한 IA로 재정리. (7)
8. **`custom.*` 페이지에 최소한의 글로벌 내비 복귀 링크 추가** — 장바구니/마이페이지/카테고리로 돌아갈 수 있도록. (1.2-A)

### 🟡 P2 — 개선 권장 (완성도)
9. **`alert()` → 토스트/미니카트로 교체**. (3.2-A, 8.2)
10. **`order_result.html` 영·한 혼용 정리** + 더미 `<div class="h-20">` 제거. (3.2-C/D)
11. **로그인·결제 실패 시 사용자 피드백 톤 정돈** (8.2)
12. **아이콘 버튼 `aria-label` 일관 부착** (9.2)
13. **푸터의 `data-include="layout/footer.html"` 레거시 속성 12개 파일에서 제거**. (1.2-D)
14. **`login.html`의 비밀번호 찾기 / SNS 로그인 상태 안내 개선**. (5.3)
15. **`lookbook.html`의 STIZ/COMMUNITY 중복 배치 정리**. (6.1-C)

### 🟢 P3 — 선택적 개선
16. **검색 UI 확인 및 강화** — `initSearchUI()` 실제 동작 점검.
17. **구 URL 리다이렉트 페이지들**은 현 상태 유지 OK — 단 `order-custom.html`에서 폐기된 7단계 위자드의 흔적이 `dev/` 문서에 남아 있으니 마이그레이션이 완료되었는지 확인 권장.

---

## 11. 페이지별 상태 요약

| 페이지 | 헤더 | cart.js | 주요 상태 |
|---|---|---|---|
| index.html | ✅ | ✅ | OK |
| list.html | ✅ | ❌ 누락 | 카트 뱃지 0 고정 |
| detail.html | ✅ (defer 없음) | ✅ | 카트 뱃지 초기화 타이밍 문제 가능 |
| cart.html | ✅ | ✅ | OK |
| basket.html | — | — | 의도적 리다이렉트 |
| checkout.html | ✅ | ✅ | OK |
| order.html | — | — | 의도적 리다이렉트 |
| order_result.html | ✅ | ✅ | 영·한 혼용, 다음 단계 CTA 부재 |
| order-track.html | ✅ | ✅ | 게스트 조회 잘 설계됨 |
| order-custom.html | — | — | 의도적 리다이렉트 |
| login.html | ✅ | ❌ | 인라인 스크립트 타이밍 버그 |
| join.html | ✅ | ❌ | 카트 뱃지 0 고정 |
| myshop.html | ✅ | ✅ | 인라인 스크립트 타이밍 버그, API 실패 피드백 미흡 |
| custom.html | ⚠️ 자체 헤더 | ❌ | 영어 전용, 내비 단절 |
| custom_2d.html | ⚠️ 자체 헤더 | ❌ | **ADD TO CART 미동작**, 내비 단절 |
| custom_3d.html | ⚠️ 자체 헤더 | ❌ | 제출 경로 확인 필요 |
| custom_mockup.html | ⚠️ 자체 헤더 | ❌ | 내비 단절 |
| bulk-order.html | ✅ | ❌ | 카트 뱃지 0 고정 |
| lookbook.html | ✅ | ❌ | 카트 뱃지 0 고정, 메뉴 중복 배치 |
| community.html | ✅ | ❌ | 카트 뱃지 0 고정 |
| notice.html | ✅ | ❌ | 카트 뱃지 0 고정 |
| inquiry.html | ✅ | ❌ | 카트 뱃지 0 고정, "문의" 용어 불일치 |
| about.html | ✅ | ❌ | 카트 뱃지 0 고정 |

**범례**: ✅ 정상 · ❌ 스크립트 누락 · ⚠️ 독립 구조 · — 리다이렉트 페이지

---

## 참고 자료
- [STIZ_Renewal_Proposal.md](../STIZ_Renewal_Proposal.md) — 기획 방향
- [FEATURE_GUIDE.md](../FEATURE_GUIDE.md) — 기능 가이드
- [CAFE24_MIGRATION_GUIDE.md](../CAFE24_MIGRATION_GUIDE.md) — Cafe24 이전 가이드
- `dev/site-review-bugs.md`, `dev/site-review-features.md`, `dev/site-review-logic.md`, `dev/ui-audit.md` — 이전 개발팀 점검 기록

---

*이 리포트는 소비자 접점 HTML/JS 코드 기반의 정적 분석으로, 실제 브라우저에서 클릭·결제까지 진행하는 동적 테스트가 추가로 필요할 수 있습니다. 특히 P0 항목은 실제 환경에서 재현 확인 권장.*
