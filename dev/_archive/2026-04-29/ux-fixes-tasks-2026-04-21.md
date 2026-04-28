# STIZ UX 수정 작업 지시서 (Claude Code용)

> 작성일: 2026-04-21
> 기반 분석: [`dev/ux-audit-consumer-2026-04-21.md`](./ux-audit-consumer-2026-04-21.md)
> 이 문서는 **Claude Code에 업로드해서 바로 실행**할 수 있도록 각 과제에 파일 경로·현재 코드·교체 코드·검증 단계를 명시해둔 작업 지시서입니다.

---

## 📋 사용 방법 (How to Use)

이 파일을 Claude Code 세션에 업로드한 뒤 다음 중 하나를 입력:

| 명령 | Claude Code가 하는 일 |
|---|---|
| `P0 작업 실행해줘` | TASK-001 ~ TASK-003 (치명적 버그 3건) 수정 + 검증 |
| `P1 작업 실행해줘` | TASK-004 ~ TASK-008 (주요 마찰 5건) 수정 |
| `P2 작업 실행해줘` | TASK-009 ~ TASK-015 (완성도 개선) 수정 |
| `TASK-001 만 해줘` | 특정 과제만 수정 |
| `전체 작업 실행` | 모든 과제를 우선순위 순으로 처리 |
| `미리보기 (dry run)` | 파일을 바꾸지 않고 각 과제별로 적용될 diff만 출력 |

### 작업 원칙 (Claude Code가 지켜야 할 것)

1. **각 과제는 TASK-ID 순으로 처리**하고, 하나 완료할 때마다 수정된 파일 경로를 한 줄로 보고.
2. **수정 전 반드시 `Read` 도구로 해당 파일을 먼저 읽기** (라인 번호가 유효한지 확인).
3. `Edit` 도구의 `old_string`은 이 문서의 **"현재 코드"** 섹션과 완전히 일치해야 함. 불일치 시 파일을 다시 읽고 가장 근접한 부분으로 업데이트.
4. **한 과제당 최소 커밋 단위**로 작업. 한 번에 여러 파일을 고칠 때는 같은 과제 범위 내에서만.
5. 모든 과제 완료 후 **섹션 10의 검증 체크리스트** 실행.
6. 커밋 메시지는 `[UX] TASK-XXX: <한 줄 요약>` 형식으로, 사용자가 별도로 요청하지 않는 한 **커밋은 수행하지 않음** — 수정만 하고 사용자에게 리뷰 요청.

---

## 🗂️ 프로젝트 컨텍스트 (Project Context)

- **프로젝트 루트**: `stizshop/` (이 파일은 `dev/` 하위에 위치)
- **기술 스택**: HTML5 + Tailwind CSS (CDN) + Vanilla JS (ES6+), Node.js/Express 백엔드, SQLite + JSON
- **주요 공통 스크립트**:
  - `js/header_render.js` — 모든 소비자 페이지의 `<header></header>`, `<footer></footer>`를 DOMContentLoaded에 주입
  - `js/cart.js` — 장바구니 로직 (localStorage 키: `stiz_cart`)
  - `js/auth.js` — 인증 (localStorage 키: `stiz_token`, `stiz_user`)
- **제외 범위**: `admin-*.html` 은 손대지 말 것 (이 작업은 소비자 접점만)
- **레거시 리다이렉트 페이지**(건드리지 말 것): `basket.html`, `order.html`, `order-custom.html`

### 로컬 실행 (검증용)
```bash
# 정적 서빙
npx serve .
# 또는
python -m http.server 8080
```

---

## 🔴 P0 — 치명적 버그 (즉시 수정)

---

### TASK-001 · `custom_2d.html`의 "ADD TO CART" 버튼 동작 구현

**영향**: 2D 에디터에서 디자인한 뒤 장바구니에 담을 방법이 없어 이탈. 핵심 비즈니스 플로우 차단.

**파일**: `custom_2d.html`, `js/custom_2d.js`

#### 수정 1-A — `custom_2d.html` 데스크탑 버튼에 ID 부여

**파일**: `custom_2d.html`
**위치**: 약 303~306행

**현재 코드 (old_string)**:
```html
                    <button
                        class="w-full bg-black text-white py-4 font-bold tracking-wide hover:bg-gray-800 transition-colors">
                        ADD TO CART
                    </button>
```

**교체 (new_string)**:
```html
                    <button id="add-to-cart-desktop" onclick="addCustom2DToCart()"
                        class="w-full bg-black text-white py-4 font-bold tracking-wide hover:bg-gray-800 transition-colors">
                        장바구니 담기
                    </button>
```

#### 수정 1-B — `custom_2d.html` 모바일 버튼의 동적 셀렉터 제거

**파일**: `custom_2d.html`
**위치**: 약 319~321행

**현재 코드 (old_string)**:
```html
        <button onclick="document.querySelector('[onclick*=addToCart], [onclick*=cart], .add-to-cart-btn, #add-to-cart')?.click()" class="bg-black text-white px-6 py-2 rounded-lg text-sm font-bold">
            ADD TO CART
        </button>
```

**교체 (new_string)**:
```html
        <button id="add-to-cart-mobile" onclick="addCustom2DToCart()" class="bg-black text-white px-6 py-2 rounded-lg text-sm font-bold">
            장바구니 담기
        </button>
```

#### 수정 1-C — `custom_2d.html`에 `cart.js` 로드 추가

**파일**: `custom_2d.html`
**위치**: 약 324~326행 (스크립트 로드 블록)

**현재 코드 (old_string)**:
```html
    <!-- SVG 유니폼 템플릿 데이터 (custom_2d.js보다 먼저 로드해야 함) -->
    <script src="js/jersey-templates.js" defer></script>
    <script src="js/custom_2d.js" defer></script>
```

**교체 (new_string)**:
```html
    <!-- SVG 유니폼 템플릿 데이터 (custom_2d.js보다 먼저 로드해야 함) -->
    <script src="js/jersey-templates.js" defer></script>
    <script src="js/cart.js" defer></script>
    <script src="js/custom_2d.js" defer></script>
```

#### 수정 1-D — `js/custom_2d.js`에 `addCustom2DToCart()` 함수 추가

**파일**: `js/custom_2d.js`
**위치**: 파일 맨 끝에 추가 (기존 코드 바로 아래)

**추가할 코드**:
```javascript

/**
 * 2D 에디터에서 구성한 커스텀 유니폼을 장바구니에 담는다.
 * - Summary 패널(데스크탑)과 모바일 하단바 양쪽 버튼에서 호출됨
 * - Base Model명과 Total 가격은 DOM에서 읽어옴 (custom_2d.js가 이미 업데이트한 값)
 * - 캔버스 이미지는 dataURL로 저장하여 장바구니 썸네일로 활용
 */
function addCustom2DToCart() {
    // 1) Summary 정보 수집 (custom_2d.js가 이미 렌더링한 결과물을 읽는다)
    const modelName = document.getElementById('summary-model-name')?.innerText?.trim() || '커스텀 유니폼';
    const priceText = document.getElementById('summary-price')?.innerText || '0';
    const price = parseInt(priceText.replace(/[^\d]/g, ''), 10) || 0;

    // 2) 캔버스 스냅샷 (장바구니 썸네일)
    let thumbnail = 'images/placeholder.png';
    try {
        const canvasEl = document.querySelector('#c');
        if (canvasEl && typeof canvasEl.toDataURL === 'function') {
            thumbnail = canvasEl.toDataURL('image/png');
        }
    } catch (_) { /* dataURL 실패 시 기본 이미지 */ }

    // 3) 장바구니 ID — 커스텀 상품은 구성이 매번 다르므로 타임스탬프 기반 유니크 ID
    const customId = 'custom2d-' + Date.now();

    // 4) cart.js의 addToCart 호출
    if (typeof addToCart !== 'function') {
        alert('장바구니 스크립트를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
        return;
    }

    addToCart({
        id: customId,
        name: `[커스텀] ${modelName}`,
        price: price,
        image: thumbnail,
        size: 'CUSTOM',
        qty: 1
    });

    // 5) 담은 뒤 장바구니로 이동 여부 확인
    if (confirm('장바구니에 담았습니다. 바로 이동할까요?')) {
        location.href = 'cart.html';
    }
}
```

#### 검증 (Verification)
```bash
# 1) HTML이 잘 파싱되는지
node -e "const fs=require('fs');const h=fs.readFileSync('custom_2d.html','utf8');console.log(h.includes('add-to-cart-desktop')?'OK: desktop id':'FAIL');console.log(h.includes('add-to-cart-mobile')?'OK: mobile id':'FAIL');console.log(h.includes('cart.js')?'OK: cart.js loaded':'FAIL');"

# 2) 함수 존재 확인
node -e "const fs=require('fs');const j=fs.readFileSync('js/custom_2d.js','utf8');console.log(j.includes('function addCustom2DToCart')?'OK: function defined':'FAIL');"
```

**수동 확인**: 브라우저로 `custom_2d.html`을 열어 ADD TO CART 클릭 → "장바구니에 추가되었습니다!" alert → "바로 이동할까요?" 확인 → cart.html 이동 및 해당 아이템 표시.

---

### TASK-002 · `login.html` · `myshop.html`의 인라인 스크립트 DOMContentLoaded 래핑

**영향**: `auth.js`가 defer로 로드되는데 인라인 스크립트가 먼저 실행되어 `isLoggedIn()`이 `ReferenceError`. 로그인/비로그인 리다이렉트가 실패해 비로그인 사용자에게 마이페이지 골격이 잠깐 노출되거나, 로그인된 사용자가 login 페이지에 그대로 머무름.

#### 수정 2-A — `login.html`

**파일**: `login.html`
**위치**: 110~114행

**현재 코드 (old_string)**:
```html
    <script>
        // 이미 로그인된 상태면 마이페이지로 이동
        if (isLoggedIn()) {
            location.href = 'myshop.html';
        }
```

**교체 (new_string)**:
```html
    <script>
        // 이미 로그인된 상태면 마이페이지로 이동
        // auth.js가 defer로 로드되므로 DOMContentLoaded 이후에 실행해야 isLoggedIn이 정의됨
        window.addEventListener('DOMContentLoaded', () => {
            if (typeof isLoggedIn === 'function' && isLoggedIn()) {
                location.href = 'myshop.html';
            }
        });
```

#### 수정 2-B — `myshop.html`

**파일**: `myshop.html`
**위치**: 203~207행

**현재 코드 (old_string)**:
```html
    <script>
        // 로그인 안 되어 있으면 로그인 페이지로 이동
        if (!isLoggedIn()) {
            location.href = 'login.html';
        }
```

**교체 (new_string)**:
```html
    <script>
        // 로그인 안 되어 있으면 로그인 페이지로 이동
        // auth.js가 defer로 로드되므로 DOMContentLoaded 이후에 실행해야 isLoggedIn이 정의됨
        window.addEventListener('DOMContentLoaded', () => {
            if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
                location.href = 'login.html';
                return;
            }
            initMyshop();
        });

        function initMyshop() {
```

**추가 작업**: `myshop.html`의 인라인 스크립트 본문에서 **이후에 있는 기존 초기화 로직**(DOMContentLoaded 안에서 돌아가야 할 코드)을 `initMyshop()` 함수 안으로 옮겨야 합니다. 현재 파일에서 `getCustomerStep` 같은 함수 선언은 그대로 두되, 페이지 로드 시 자동 실행되어야 하는 코드(예: `loadOrders()`, `loadWishlist()`, 탭 초기화 등)를 모두 `initMyshop()` 안으로 이동. **파일을 `Read`로 전체 스캔한 뒤 직접 판단해서 배치하세요.** 기존 함수 선언들은 `}` 로 `initMyshop`을 닫기 **전**에 위치시키거나, 전역 함수로 유지하려면 `initMyshop` 함수 밖에 두면 됩니다.

> 보수적으로 하려면: 최소 변경으로 두 줄만 래핑해두고(위의 `old_string` → `new_string` 그대로), `initMyshop()` 호출은 일단 **제거**하여 아래 기존 코드가 그대로 전역에서 돌아가게 둬도 됩니다. 단, 그 경우 `function getCustomerStep...` 같은 함수들은 정상 정의되지만, 하단의 자동 실행 코드(있다면)도 전역에서 실행되므로 **비로그인 상태에서도 API 호출이 일어날 수 있음**. 이 트레이드오프를 판단해서 적용.

#### 검증
```bash
# 인라인 스크립트가 DOMContentLoaded로 감싸졌는지
node -e "const fs=require('fs');for(const f of ['login.html','myshop.html']){const h=fs.readFileSync(f,'utf8');const ok=h.includes(\"DOMContentLoaded', () => {\") && h.includes('typeof isLoggedIn');console.log(f+': '+(ok?'OK':'FAIL'))}"
```

**수동 확인**:
1. 비로그인 상태에서 `myshop.html` 직접 접근 → 즉시 `login.html`로 이동.
2. 로그인 상태에서 `login.html` 직접 접근 → 즉시 `myshop.html`로 이동.
3. 브라우저 콘솔에 `ReferenceError: isLoggedIn is not defined` 없음.

---

### TASK-003 · 헤더 장바구니 뱃지 전역 동기화

**영향**: `cart.js`를 로드하지 않는 페이지(`list`, `about`, `community`, `notice`, `lookbook`, `inquiry`, `join`, `login`, `bulk-order`, `custom*`)에서 헤더 카트 뱃지가 항상 "0"으로 표시됨. 담아둔 상품이 있어도 0으로 보이는 혼란.

**해결 방향**: `header_render.js` 자체가 localStorage에서 카트 개수를 직접 읽어 렌더 시 반영하도록 수정. 이렇게 하면 어떤 페이지에서든 헤더 뱃지가 정확해짐.

#### 수정 3-A — `js/header_render.js`에 자체 뱃지 업데이트 로직 추가

**파일**: `js/header_render.js`
**위치**: 약 316~328행 (`headerEl.innerHTML = html;` 직후, `initSearchUI();` 호출 앞/뒤)

**현재 코드 (old_string)**:
```javascript
    headerEl.innerHTML = html;

    // Re-attach mobile menu event
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // Search Functionality
    initSearchUI();
```

**교체 (new_string)**:
```javascript
    headerEl.innerHTML = html;

    // Re-attach mobile menu event
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // 카트 뱃지: cart.js가 없어도 localStorage에서 직접 읽어 초기값 반영
    // (cart.js가 로드된 페이지에서는 updateCartCount()가 이후 덮어쓰므로 충돌 없음)
    syncHeaderCartBadge();

    // Search Functionality
    initSearchUI();
```

#### 수정 3-B — 동일 파일 맨 아래(renderFooter 뒤)에 함수 추가

**파일**: `js/header_render.js`
**위치**: 파일 맨 끝

**추가할 코드**:
```javascript

/**
 * 헤더의 카트 뱃지를 localStorage('stiz_cart')에서 직접 계산해 반영한다.
 * cart.js가 없는 페이지에서도 정확한 개수가 보이도록 하는 보조 로직.
 */
function syncHeaderCartBadge() {
    try {
        const raw = localStorage.getItem('stiz_cart');
        const cart = raw ? JSON.parse(raw) : [];
        const count = Array.isArray(cart)
            ? cart.reduce((acc, it) => acc + (parseInt(it.qty, 10) || 0), 0)
            : 0;
        const badge = document.querySelector('header .bg-red-600');
        if (badge) {
            badge.innerText = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    } catch (e) {
        console.warn('[header] cart badge sync failed:', e);
    }
}
```

#### 수정 3-C — storage 이벤트로 다른 탭과도 동기화 (선택 사항, 권장)

**파일**: `js/header_render.js`
**위치**: `DOMContentLoaded` 최상단 리스너 블록 (5~11행)

**현재 코드 (old_string)**:
```javascript
document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderFooter();
    loadAnalytics();
    // SHOP 메뉴 카테고리를 비동기로 주입 (API 실패 시 기본 정적 메뉴 유지)
    injectShopCategories();
});
```

**교체 (new_string)**:
```javascript
document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderFooter();
    loadAnalytics();
    // SHOP 메뉴 카테고리를 비동기로 주입 (API 실패 시 기본 정적 메뉴 유지)
    injectShopCategories();
});

// 다른 탭에서 장바구니가 바뀌면(stiz_cart storage 이벤트) 이 탭의 뱃지도 갱신
window.addEventListener('storage', (e) => {
    if (e.key === 'stiz_cart' && typeof syncHeaderCartBadge === 'function') {
        syncHeaderCartBadge();
    }
});
```

#### 검증
```bash
# 함수 정의 확인
node -e "const fs=require('fs');const j=fs.readFileSync('js/header_render.js','utf8');console.log(j.includes('function syncHeaderCartBadge')?'OK':'FAIL');console.log(j.includes('syncHeaderCartBadge()')?'OK: called':'FAIL')"
```

**수동 확인**:
1. `cart.html`에서 상품을 담음 → 헤더 뱃지가 실제 개수 표시.
2. 새 탭에서 `about.html` 열기 → 헤더 뱃지가 0이 아닌 실제 개수 표시.
3. 한 탭에서 장바구니 수정 → 다른 탭의 뱃지도 자동 반영.

---

## 🟠 P1 — 주요 마찰 (빠르게 개선)

---

### TASK-004 · `order_result.html`에 "내 주문 확인" CTA 추가

**영향**: 결제 직후 자연스러운 다음 단계가 `Continue Shopping` / `Back to Home`뿐. 방금 만든 주문을 추적할 링크가 없어서 사용자가 바로 주문 진행 상태를 볼 수 없음.

**파일**: `order_result.html`
**위치**: 99~108행 (CTA 버튼 그룹)

**현재 코드 (old_string)**:
```html
            <div class="flex flex-col sm:flex-row gap-4 justify-center">
                <button onclick="location.href='list.html'"
                    class="bg-black text-white px-8 py-3 rounded font-bold hover:bg-gray-800 transition-colors uppercase">
                    Continue Shopping
                </button>
                <button onclick="location.href='index.html'"
                    class="border border-black px-8 py-3 rounded font-bold hover:bg-black hover:text-white transition-colors uppercase">
                    Back to Home
                </button>
            </div>
```

**교체 (new_string)**:
```html
            <div class="flex flex-col sm:flex-row gap-3 justify-center">
                <button id="btn-track-order" onclick="goToOrderTracking()"
                    class="bg-brand-red text-white px-8 py-3 rounded font-bold hover:bg-red-700 transition-colors uppercase">
                    주문 진행 확인
                </button>
                <button onclick="location.href='list.html'"
                    class="bg-black text-white px-8 py-3 rounded font-bold hover:bg-gray-800 transition-colors uppercase">
                    쇼핑 계속하기
                </button>
                <button onclick="location.href='index.html'"
                    class="border border-black px-8 py-3 rounded font-bold hover:bg-black hover:text-white transition-colors uppercase">
                    홈으로
                </button>
            </div>
```

#### 추가 4-B — `order_result.html` 인라인 스크립트 안에 헬퍼 함수 추가

**파일**: `order_result.html`
**위치**: 170~171행 (인라인 스크립트의 마지막 `});` 직전 또는 그 뒤)

**현재 코드 (old_string)**:
```javascript
            document.getElementById('result-total').innerText = '₩ ' + (order.total || 0).toLocaleString();
        });
    </script>
```

**교체 (new_string)**:
```javascript
            document.getElementById('result-total').innerText = '₩ ' + (order.total || 0).toLocaleString();
        });

        /**
         * "주문 진행 확인" 버튼: 로그인 상태면 myshop 주문 탭,
         * 비회원이면 order-track 페이지로 주문번호+연락처 프리필하여 이동
         */
        function goToOrderTracking() {
            const orderJson = localStorage.getItem('stiz_last_order');
            const token = localStorage.getItem('stiz_token');
            if (token) {
                location.href = 'myshop.html#orders';
                return;
            }
            if (orderJson) {
                try {
                    const o = JSON.parse(orderJson);
                    const params = new URLSearchParams();
                    if (o.orderNumber) params.set('orderNumber', o.orderNumber);
                    if (o.customer && o.customer.phone) params.set('phone', o.customer.phone);
                    location.href = 'order-track.html?' + params.toString();
                    return;
                } catch (_) { /* fall through */ }
            }
            location.href = 'order-track.html';
        }
    </script>
```

#### 검증
```bash
grep -q "goToOrderTracking" order_result.html && echo "OK: function added" || echo "FAIL"
grep -q "주문 진행 확인" order_result.html && echo "OK: button label" || echo "FAIL"
```

---

### TASK-005 · `order_result.html` 한국어 통일 및 더미 스페이서 제거

**영향**: 본문이 영어("Thank you for your order!", "Order Number", "Shipping Address", "Subtotal")와 한국어(타이틀)가 혼재. 더미 `<div class="h-20">`도 두 개 중복.

**파일**: `order_result.html`

#### 수정 5-A — 더미 스페이서 중복 제거

**위치**: 44~45행

**현재 코드 (old_string)**:
```html
    <!-- HEADER -->
    <header></header>
    <div class="h-20"></div>
    <div class="h-20"></div>
```

**교체 (new_string)**:
```html
    <!-- HEADER -->
    <header></header>
    <div class="h-20"></div>
```

#### 수정 5-B — 본문 한국어화

**위치**: 58~97행

**현재 코드 (old_string)**:
```html
            <h1 class="text-4xl font-bold mb-4">Thank you for your order!</h1>
            <p class="text-gray-500 mb-8" id="confirm-email-msg">
                Your order has been received and is being processed.
            </p>

            <!-- Order Number -->
            <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 w-full mb-8">
                <h3 class="text-sm font-bold text-gray-500 uppercase mb-2">Order Number</h3>
                <p class="text-2xl font-mono tracking-widest" id="result-order-number">#STIZ-0000-0000</p>
            </div>

            <!-- Order Details -->
            <div class="bg-white border border-gray-200 rounded-lg text-left mb-8">
                <div class="p-6 border-b border-gray-100">
                    <h3 class="font-bold text-sm mb-4">Order Items</h3>
                    <div id="result-items" class="space-y-3">
                        <!-- JS injected -->
                    </div>
                </div>

                <div class="p-6 border-b border-gray-100">
                    <h3 class="font-bold text-sm mb-3">Shipping Address</h3>
                    <p class="text-sm text-gray-600" id="result-address">-</p>
                </div>

                <div class="p-6">
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-500">Subtotal</span>
                        <span class="font-bold" id="result-subtotal">₩ 0</span>
                    </div>
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-500">Shipping</span>
                        <span id="result-shipping">₩ 0</span>
                    </div>
                    <div class="flex justify-between text-lg font-bold border-t border-gray-200 pt-3 mt-3">
                        <span>Total</span>
                        <span class="text-brand-red" id="result-total">₩ 0</span>
                    </div>
                </div>
            </div>
```

**교체 (new_string)**:
```html
            <h1 class="text-4xl font-bold mb-4">주문이 완료되었습니다</h1>
            <p class="text-gray-500 mb-8" id="confirm-email-msg">
                주문이 접수되어 처리 중입니다.
            </p>

            <!-- 주문 번호 -->
            <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 w-full mb-8">
                <h3 class="text-sm font-bold text-gray-500 uppercase mb-2">주문번호</h3>
                <p class="text-2xl font-mono tracking-widest" id="result-order-number">#STIZ-0000-0000</p>
            </div>

            <!-- 주문 상세 -->
            <div class="bg-white border border-gray-200 rounded-lg text-left mb-8">
                <div class="p-6 border-b border-gray-100">
                    <h3 class="font-bold text-sm mb-4">주문 상품</h3>
                    <div id="result-items" class="space-y-3">
                        <!-- JS injected -->
                    </div>
                </div>

                <div class="p-6 border-b border-gray-100">
                    <h3 class="font-bold text-sm mb-3">배송지</h3>
                    <p class="text-sm text-gray-600" id="result-address">-</p>
                </div>

                <div class="p-6">
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-500">상품 금액</span>
                        <span class="font-bold" id="result-subtotal">₩ 0</span>
                    </div>
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-500">배송비</span>
                        <span id="result-shipping">₩ 0</span>
                    </div>
                    <div class="flex justify-between text-lg font-bold border-t border-gray-200 pt-3 mt-3">
                        <span>총 결제 금액</span>
                        <span class="text-brand-red" id="result-total">₩ 0</span>
                    </div>
                </div>
            </div>
```

#### 수정 5-C — 이메일 확인 메시지도 한국어화

**위치**: 135~138행 (인라인 스크립트)

**현재 코드 (old_string)**:
```javascript
            if (order.customer && order.customer.email) {
                document.getElementById('confirm-email-msg').innerHTML =
                    `Your order has been received and is being processed. A confirmation will be sent to <span class="text-black font-bold">${order.customer.email}</span>.`;
            }
```

**교체 (new_string)**:
```javascript
            if (order.customer && order.customer.email) {
                document.getElementById('confirm-email-msg').innerHTML =
                    `주문이 접수되어 처리 중입니다. 확인 메일은 <span class="text-black font-bold">${order.customer.email}</span> 으로 발송됩니다.`;
            }
```

#### 수정 5-D — "FREE" 라벨 한국어화

**위치**: 168행

**현재 코드 (old_string)**:
```javascript
            document.getElementById('result-shipping').innerText = order.shippingCost === 0 ? 'FREE' : '₩ ' + (order.shippingCost || 0).toLocaleString();
```

**교체 (new_string)**:
```javascript
            document.getElementById('result-shipping').innerText = order.shippingCost === 0 ? '무료' : '₩ ' + (order.shippingCost || 0).toLocaleString();
```

#### 검증
```bash
# 영어 텍스트가 남아있지 않은지
! grep -qE "Thank you for your order|Order Number|Shipping Address|Subtotal|Continue Shopping|Back to Home" order_result.html && echo "OK: 영어 잔재 없음" || echo "FAIL: 영어 잔재"
```

---

### TASK-006 · `custom.html` 한국어화 및 "Request Mockup" 포지셔닝 개선

**영향**: 사이트 타깃은 한국 팀 단체인데 허브 페이지 본문이 전부 영어. `NanoBanana AI Engine` 같은 내부 코드네임 노출. "Request Mockup"이 2D/3D와 병렬로 놓여 개념 혼선.

**파일**: `custom.html`

#### 수정 6-A — 히어로 섹션 한국어화

**위치**: 82~87행

**현재 코드 (old_string)**:
```html
            <h1 class="text-5xl md:text-7xl font-black text-white mb-6 tracking-tighter loading-text">CREATE YOUR
                IDENTITY</h1>
            <p class="text-gray-400 text-lg md:text-xl mb-16 max-w-2xl mx-auto">
                STIZ Design Lab offers advanced tools to visualize your team's spirit. <br class="hidden md:block">
                Choose your preferred way to design.
            </p>
```

**교체 (new_string)**:
```html
            <h1 class="text-5xl md:text-7xl font-black text-white mb-6 tracking-tighter loading-text">우리 팀의<br>
                아이덴티티를 디자인하세요</h1>
            <p class="text-gray-400 text-lg md:text-xl mb-16 max-w-2xl mx-auto">
                STIZ 디자인 랩에서 팀의 색을 입혀보세요. <br class="hidden md:block">
                세 가지 방식 중 편한 방법으로 시작할 수 있어요.
            </p>
```

#### 수정 6-B — 2D 에디터 카드

**위치**: 110~115행

**현재 코드 (old_string)**:
```html
                        <h3 class="text-2xl font-bold text-white mb-2">Start 2D Editor</h3>
                        <p class="text-gray-400 text-sm mb-6">Customize existing STIZ products with logos, text, and
                            colors.</p>
                        <span
                            class="inline-block border border-gray-600 rounded-full px-4 py-1 text-xs text-gray-300 group-hover:bg-white group-hover:text-black group-hover:border-white transition-colors font-bold">LAUNCH
                            &rarr;</span>
```

**교체 (new_string)**:
```html
                        <h3 class="text-2xl font-bold text-white mb-2">2D 에디터로 직접 디자인</h3>
                        <p class="text-gray-400 text-sm mb-6">STIZ 유니폼 템플릿에 로고·텍스트·컬러를
                            바로 올려보세요.</p>
                        <span
                            class="inline-block border border-gray-600 rounded-full px-4 py-1 text-xs text-gray-300 group-hover:bg-white group-hover:text-black group-hover:border-white transition-colors font-bold">2D 에디터 시작 &rarr;</span>
```

#### 수정 6-C — 3D AI 디자인 카드

**위치**: 139~143행

**현재 코드 (old_string)**:
```html
                        <h3 class="text-2xl font-bold text-white mb-2">Start 3D Design</h3>
                        <p class="text-gray-400 text-sm mb-6">Create unique designs with NanoBanana AI Engine.</p>
                        <span
                            class="inline-block border border-gray-600 rounded-full px-4 py-1 text-xs text-gray-300 group-hover:bg-white group-hover:text-black group-hover:border-white transition-colors font-bold">ENTER
                            AI LAB &rarr;</span>
```

**교체 (new_string)**:
```html
                        <h3 class="text-2xl font-bold text-white mb-2">AI로 3D 시안 생성</h3>
                        <p class="text-gray-400 text-sm mb-6">키워드를 입력하면 AI가 유니폼 시안을
                            자동으로 제안해 드려요.</p>
                        <span
                            class="inline-block border border-gray-600 rounded-full px-4 py-1 text-xs text-gray-300 group-hover:bg-white group-hover:text-black group-hover:border-white transition-colors font-bold">AI 디자인 랩 &rarr;</span>
```

#### 수정 6-D — Mockup 카드 → "디자이너에게 무료 시안 요청"으로 재정의

**위치**: 169~174행

**현재 코드 (old_string)**:
```html
                        <h3 class="text-2xl font-bold text-white mb-2">Request Mockup</h3>
                        <p class="text-gray-400 text-sm mb-6">See your design on real models with AI virtual fitting.
                        </p>
                        <span
                            class="inline-block border border-gray-600 rounded-full px-4 py-1 text-xs text-gray-300 group-hover:bg-white group-hover:text-black group-hover:border-white transition-colors font-bold">VIRTUAL
                            FIT &rarr;</span>
```

**교체 (new_string)**:
```html
                        <h3 class="text-2xl font-bold text-white mb-2">디자이너에게 무료 시안 요청</h3>
                        <p class="text-gray-400 text-sm mb-6">직접 디자인이 부담스러우세요? 원하시는 분위기만
                            알려주시면 디자이너가 시안을 만들어 드려요.</p>
                        <span
                            class="inline-block border border-gray-600 rounded-full px-4 py-1 text-xs text-gray-300 group-hover:bg-white group-hover:text-black group-hover:border-white transition-colors font-bold">무료 시안 요청 &rarr;</span>
```

> ⚠️ **주의**: 이 카드의 `<a href>`는 현재 `custom_mockup.html`로 되어 있습니다(148행). 이 카드의 역할을 "시안 요청"으로 바꾸면 `inquiry.html`이 더 자연스럽습니다. 148행의 `href="custom_mockup.html"`을 `href="inquiry.html?source=custom"`로 변경하는 것도 함께 고려. **판단이 필요하므로 사용자에게 한 번 확인 후 진행.**

#### 검증
```bash
! grep -qE "CREATE YOUR IDENTITY|Start 2D Editor|NanoBanana|Request Mockup|LAUNCH|VIRTUAL FIT" custom.html && echo "OK" || echo "FAIL: 영어 잔재"
```

---

### TASK-007 · 헤더 유저 아이콘: 로그인 상태에서 myshop으로 직결

**영향**: 로그인한 사용자가 헤더 유저 아이콘을 눌러도 무조건 `login.html`로 가고, 거기서 다시 `myshop.html`로 리다이렉트되는 2단계. 자연스럽지 못함.

**파일**: `js/header_render.js`

#### 수정 7-A — 유저 아이콘 href 제거하고 동적 핸들러 연결

**위치**: 246~251행

**현재 코드 (old_string)**:
```html
            <!-- User -->
            <a href="login.html" class="hover:opacity-70">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            </a>
```

**교체 (new_string)**:
```html
            <!-- User: 로그인 상태면 마이페이지, 아니면 로그인 페이지로 -->
            <a href="#" onclick="goToUserPage(event)" class="hover:opacity-70" aria-label="내 계정">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            </a>
```

#### 수정 7-B — 같은 파일 맨 아래에 함수 추가

**파일**: `js/header_render.js`
**위치**: 파일 끝

**추가할 코드**:
```javascript

/**
 * 헤더 유저 아이콘 클릭: stiz_token이 있으면 myshop으로, 없으면 login으로.
 * auth.js가 없는 페이지에서도 동작하도록 localStorage 직접 읽기.
 */
function goToUserPage(e) {
    if (e && e.preventDefault) e.preventDefault();
    const token = localStorage.getItem('stiz_token');
    location.href = token ? 'myshop.html' : 'login.html';
}
```

#### 검증
```bash
grep -q "goToUserPage" js/header_render.js && echo "OK" || echo "FAIL"
```

---

### TASK-008 · 커스텀 페이지에 글로벌 네비 복귀 링크 추가

**영향**: `custom.html` / `custom_2d.html` / `custom_3d.html` / `custom_mockup.html`에서 장바구니·마이페이지·다른 카테고리로 돌아갈 버튼이 로고(홈) + "Exit Lab" 외에 없음.

**방침**: 기존 자체 헤더는 유지하되(몰입감 보존), **"장바구니" 아이콘만 추가**하고 나머지 내비는 "Exit Lab" → `index.html` 경유로 유지.

#### 수정 8-A — `custom.html` 헤더에 장바구니 링크 추가

**파일**: `custom.html`
**위치**: 63~71행

**현재 코드 (old_string)**:
```html
    <!-- Header -->
    <header class="bg-black text-white border-b border-gray-800">
        <div class="container mx-auto px-6 h-20 flex items-center justify-between">
            <a href="index.html" class="flex items-center space-x-2">
                <img src="images/logo_white.png" alt="STIZ" class="h-6">
                <span class="text-white text-lg font-bold tracking-tighter">DESIGN LAB</span>
            </a>
            <a href="index.html" class="text-gray-400 hover:text-white transition-colors">Exit Lab</a>
        </div>
    </header>
```

**교체 (new_string)**:
```html
    <!-- Header -->
    <header class="bg-black text-white border-b border-gray-800">
        <div class="container mx-auto px-6 h-20 flex items-center justify-between">
            <a href="index.html" class="flex items-center space-x-2">
                <img src="images/logo_white.png" alt="STIZ" class="h-6">
                <span class="text-white text-lg font-bold tracking-tighter">DESIGN LAB</span>
            </a>
            <div class="flex items-center space-x-6">
                <a href="cart.html" class="text-gray-400 hover:text-white transition-colors text-sm" aria-label="장바구니">장바구니</a>
                <a href="myshop.html" class="text-gray-400 hover:text-white transition-colors text-sm" aria-label="마이페이지">마이페이지</a>
                <a href="index.html" class="text-gray-400 hover:text-white transition-colors">Exit Lab</a>
            </div>
        </div>
    </header>
```

#### 수정 8-B ~ 8-D — `custom_2d.html`, `custom_3d.html`, `custom_mockup.html`에도 동일 패턴 적용

각 파일의 `<header>` 영역을 `Read`로 먼저 확인하고, 우측에 "장바구니"와 "마이페이지" 링크를 "Exit Lab"과 같은 스타일로 추가. HTML 구조가 조금씩 다를 수 있으니 **기존 디자인 톤을 해치지 않는 범위에서만** 추가하고, 애매하면 건너뛰고 다음 과제로 이동한 뒤 사용자에게 보고.

#### 검증
```bash
grep -q 'href="cart.html"' custom.html && echo "OK: custom.html" || echo "FAIL"
```

---

## 🟡 P2 — 완성도 개선

---

### TASK-009 · `alert()` → 토스트 컴포넌트로 교체

**영향**: `cart.js:43`, `cart-page.js:206` 등 장바구니 관련 피드백이 브라우저 기본 `alert`. 브랜드 톤 저해, 모바일에서 UX 끊김.

**접근**: 이 과제는 **범위가 크고 판단이 필요**하므로, 먼저 **공통 토스트 함수**를 하나 만들고 `cart.js`에 있는 2개 alert만 교체하는 **최소 변경**으로 시작.

#### 수정 9-A — `js/main.js`(또는 없으면 신규 `js/toast.js`)에 공통 토스트 추가

**파일**: `js/main.js` (존재 여부 `Read`로 확인 후 없으면 `js/toast.js` 신규 생성)

**추가할 코드**:
```javascript

/**
 * STIZ 공통 토스트
 * - alert 대체: 사용자를 막지 않는 비차단 알림
 * - 사용: stizToast('장바구니에 추가되었습니다', { type: 'success' })
 */
function stizToast(message, options = {}) {
    const { type = 'info', duration = 2500 } = options;
    let wrap = document.getElementById('stiz-toast-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'stiz-toast-wrap';
        wrap.style.cssText = 'position:fixed;top:90px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    const bg = type === 'success' ? '#111' : type === 'error' ? '#E63946' : '#333';
    el.style.cssText = `background:${bg};color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);opacity:0;transform:translateY(-10px);transition:all .25s ease;`;
    el.textContent = message;
    wrap.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px)';
        setTimeout(() => el.remove(), 300);
    }, duration);
}
```

#### 수정 9-B — `js/cart.js`의 `alert` 교체

**파일**: `js/cart.js`
**위치**: 43행

**현재 코드 (old_string)**:
```javascript
    alert('장바구니에 추가되었습니다!');
```

**교체 (new_string)**:
```javascript
    (typeof stizToast === 'function' ? stizToast('장바구니에 추가되었습니다', { type: 'success' }) : alert('장바구니에 추가되었습니다!'));
```

#### 수정 9-C — `js/cart-page.js`의 `alert` 교체

**파일**: `js/cart-page.js`
**위치**: 206행

**현재 코드 (old_string)**:
```javascript
    alert('장바구니가 비어있습니다.');
```

**교체 (new_string)**:
```javascript
    (typeof stizToast === 'function' ? stizToast('장바구니가 비어있습니다', { type: 'error' }) : alert('장바구니가 비어있습니다.'));
```

---

### TASK-010 · 푸터의 `data-include="layout/footer.html"` 레거시 속성 제거

**영향**: 실제 동작엔 영향 없지만, 12개 파일에 남은 더미 속성으로 코드 리더가 혼란스러움.

**대상 파일** (각각 동일한 제거 작업 반복):
`bulk-order.html`, `about.html`, `list.html`, `order-track.html`, `join.html`, `order_result.html`, `myshop.html`, `notice.html`, `lookbook.html`, `login.html`, `inquiry.html`, `community.html`

**패턴 (old_string)**:
```html
<footer class="bg-black text-white" data-include="layout/footer.html"></footer>
```

**교체 (new_string)**:
```html
<footer class="bg-black text-white"></footer>
```

> 각 파일별로 `Edit` 실행. `replace_all`은 쓰지 말 것(파일마다 별개의 맥락일 수 있으니).

#### 검증
```bash
# 모든 파일에서 레거시 속성이 사라졌는지
! grep -r 'data-include="layout/footer.html"' --include="*.html" . && echo "OK: 모두 제거됨" || echo "FAIL"
```

---

### TASK-011 · `login.html` 비밀번호 찾기 안내 개선

**파일**: `login.html`
**위치**: 67행

**현재 코드 (old_string)**:
```html
                <a href="javascript:void(0)" onclick="alert('비밀번호 찾기는 준비 중입니다. 문의하기를 이용해주세요.')" class="underline">비밀번호 찾기</a>
```

**교체 (new_string)**:
```html
                <a href="inquiry.html?topic=password-reset" class="underline">비밀번호 찾기</a>
```

> `inquiry.html`에서 `URLSearchParams`의 `topic` 파라미터를 읽어 문의 유형을 "비밀번호 재설정"으로 프리셀렉트하는 작업은 TASK-011-B로 별도 분리해서, 필요 시 추가 진행.

---

### TASK-012 · `lookbook.html` 중복 배치 정리 (STIZ 드롭다운에서 제거)

**영향**: 룩북이 STIZ 드롭다운과 COMMUNITY 드롭다운 양쪽에 노출되어 IA 혼란.

**파일**: `js/header_render.js`
**위치**: 145행

**현재 코드 (old_string)**:
```html
                    <a href="about.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">회사소개</a>
                    <a href="about.html#values" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">가치 (Values)</a>
                    <a href="lookbook.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">룩북 (Lookbook)</a>
                    <a href="about.html#contact" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">오시는 길</a>
```

**교체 (new_string)**:
```html
                    <a href="about.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">회사소개</a>
                    <a href="about.html#values" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">가치 (Values)</a>
                    <a href="about.html#contact" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">오시는 길</a>
```

(룩북은 COMMUNITY → "포트폴리오 (Lookbook)"에만 남김. 227행)

---

### TASK-013 · 아이콘 버튼 `aria-label` 일관 부착

**영향**: 접근성. 스크린리더 사용자가 아이콘의 용도를 파악 불가.

**파일**: `js/header_render.js`
**위치**: 239~245행 (검색 버튼), 253~259행 (카트 링크)

#### 수정 13-A — 검색 버튼

**현재 코드 (old_string)**:
```html
             <button class="hover:opacity-70">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </button>
```

**교체 (new_string)**:
```html
             <button class="hover:opacity-70" aria-label="상품 검색">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </button>
```

#### 수정 13-B — 카트 링크

**현재 코드 (old_string)**:
```html
            <!-- Cart (장바구니 아이콘 + 배지) -->
            <a href="cart.html" class="hover:opacity-70 relative">
```

**교체 (new_string)**:
```html
            <!-- Cart (장바구니 아이콘 + 배지) -->
            <a href="cart.html" class="hover:opacity-70 relative" aria-label="장바구니">
```

#### 수정 13-C — 모바일 메뉴 버튼

**현재 코드 (old_string)**:
```html
             <button id="mobile-menu-btn" class="md:hidden hover:opacity-70">
```

**교체 (new_string)**:
```html
             <button id="mobile-menu-btn" class="md:hidden hover:opacity-70" aria-label="메뉴 열기">
```

---

### TASK-014 · `checkout.html`에 비회원 결제 후 조회 안내 추가

**영향**: 비회원이 결제 시 나중에 주문 조회를 어떻게 하는지 안내 없음.

**파일**: `checkout.html`
**위치**: 비로그인 회원가입 배너 영역(약 90행 근방). 먼저 `Read`로 정확한 위치 확인 필요.

**추가할 안내 (회원가입 배너 아래 또는 배너 내부)**:
```html
<p class="text-xs text-blue-500 mt-2">
    ※ 비회원으로 결제 시, 주문 조회는 <a href="order-track.html" class="underline font-bold">주문 조회 페이지</a>에서 주문번호+연락처로 가능합니다.
</p>
```

> 이 과제는 정확한 삽입 위치가 유동적이니, 먼저 `Read`로 확인 후 사용자에게 위치안(배너 안 vs 아래) 간단 확인 권장.

---

### TASK-015 · "문의" 용어 통일 점진 정리

**영향**: `1:1 문의 / Q&A / Free Design Request` 세 갈래 혼재.

**접근**: 이 과제는 IA 차원이라 **단일 Edit으로 해결되지 않음**. 다음 세 곳의 표기를 **"문의" 하나로 통일**하는 작업만 수행:

| 파일 | 위치 | 현재 | 통일안 |
|---|---|---|---|
| `inquiry.html` | `<title>` | `STIZ - 1:1 문의` | `STIZ - 문의하기` |
| `js/header_render.js` | 231행 | `문의하기 (Q&A)` | `문의하기` |
| `js/header_render.js` | 181~185행 | `Free Design Request` / `디자이너 무료 시안 요청` | `디자이너 무료 시안 요청` (영어 부제 제거, 한국어로만) |

구체 수정은 생략하지만 `Edit` 세 번으로 충분.

---

## ✅ 섹션 10 · 최종 검증 체크리스트

모든 과제 완료 후 다음을 실행해 회귀 여부를 점검하세요.

### 10-A · 자동 검증 스크립트

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."   # 프로젝트 루트로 이동

echo "=== TASK-001 · custom_2d ADD TO CART 배선 ==="
grep -q "addCustom2DToCart" custom_2d.html && echo "  [OK] button onclick" || echo "  [FAIL]"
grep -q "function addCustom2DToCart" js/custom_2d.js && echo "  [OK] function" || echo "  [FAIL]"
grep -q '<script src="js/cart.js"' custom_2d.html && echo "  [OK] cart.js loaded" || echo "  [FAIL]"

echo "=== TASK-002 · DOMContentLoaded 래핑 ==="
for f in login.html myshop.html; do
  grep -q "DOMContentLoaded', () => {" "$f" && grep -q "typeof isLoggedIn" "$f" && echo "  [OK] $f" || echo "  [FAIL] $f"
done

echo "=== TASK-003 · 헤더 카트 뱃지 동기화 ==="
grep -q "function syncHeaderCartBadge" js/header_render.js && echo "  [OK] function" || echo "  [FAIL]"
grep -q "syncHeaderCartBadge()" js/header_render.js && echo "  [OK] called" || echo "  [FAIL]"

echo "=== TASK-004 · 주문 추적 CTA ==="
grep -q "goToOrderTracking" order_result.html && echo "  [OK]" || echo "  [FAIL]"

echo "=== TASK-005 · order_result 한국어화 ==="
! grep -qE "Thank you for your order|Order Number|Shipping Address|Continue Shopping" order_result.html && echo "  [OK]" || echo "  [FAIL: 영어 잔재]"

echo "=== TASK-006 · custom.html 한국어화 ==="
! grep -qE "CREATE YOUR IDENTITY|NanoBanana|Start 2D Editor|Request Mockup" custom.html && echo "  [OK]" || echo "  [FAIL: 영어 잔재]"

echo "=== TASK-007 · 유저 아이콘 라우팅 ==="
grep -q "goToUserPage" js/header_render.js && echo "  [OK]" || echo "  [FAIL]"

echo "=== TASK-010 · 레거시 data-include 제거 ==="
! grep -rq 'data-include="layout/footer.html"' --include="*.html" . && echo "  [OK]" || echo "  [FAIL]"

echo "=== TASK-013 · aria-label ==="
grep -q 'aria-label="상품 검색"' js/header_render.js && echo "  [OK] search" || echo "  [FAIL]"
grep -q 'aria-label="장바구니"' js/header_render.js && echo "  [OK] cart" || echo "  [FAIL]"

echo ""
echo "자동 검증 완료. 수동 확인 항목은 아래 체크리스트 참고."
```

### 10-B · 수동 회귀 체크리스트

로컬에서 `npx serve .` 또는 `python -m http.server 8080` 실행 후:

- [ ] `index.html` → 헤더의 카트 뱃지가 담긴 개수대로 표시
- [ ] `custom_2d.html` → 디자인 후 "장바구니 담기" 클릭 → alert → 이동 → cart.html에서 아이템 확인
- [ ] 비로그인 상태에서 `myshop.html` 직접 접근 → `login.html`로 리다이렉트됨
- [ ] 로그인 상태에서 `login.html` 직접 접근 → `myshop.html`로 리다이렉트됨
- [ ] 헤더 유저 아이콘 클릭: 로그인 상태면 myshop, 아니면 login으로 감
- [ ] `order_result.html`에서 "주문 진행 확인" 클릭 → 로그인 시 myshop#orders, 비회원 시 order-track으로 주문번호 프리필되어 이동
- [ ] `order_result.html` 본문에 영어 잔재 없음
- [ ] `custom.html` 본문에 영어 잔재 없음, "Request Mockup" 카드 제목이 "디자이너에게 무료 시안 요청"
- [ ] `custom.html` 상단에 장바구니/마이페이지 링크 노출
- [ ] 브라우저 콘솔에 `ReferenceError` 없음
- [ ] 장바구니에 상품 담은 뒤 다른 페이지(about, notice 등) 이동 → 헤더 뱃지 유지
- [ ] 두 탭에서 장바구니 수정 → 다른 탭 뱃지도 갱신됨

### 10-C · 진행 보고 형식 (Claude Code가 사용자에게 보고할 포맷)

```
## 작업 완료 요약
- ✅ TASK-001: custom_2d.html ADD TO CART 배선 (파일 3개 수정)
- ✅ TASK-002: login/myshop DOMContentLoaded 래핑
- ⚠️  TASK-006-D: Mockup 카드 href 변경은 사용자 확인 대기
- ❌ TASK-011-B: inquiry.html topic 파라미터 처리 미구현 (별도 과제로 전환 필요)

## 수정된 파일
- custom_2d.html
- js/custom_2d.js
- login.html
- myshop.html
- js/header_render.js
- order_result.html
- custom.html
- js/cart.js
- js/cart-page.js
- js/main.js (또는 js/toast.js 신규)

## 남은 이슈
- ... (자동 검증 FAIL 항목 + 사용자 판단이 필요했던 항목 요약)

## 커밋 여부
커밋은 요청하지 않으셨으므로 작업만 완료했습니다. 리뷰 후 별도 지시 부탁드립니다.
```

---

## 📎 부록 A · 참고 자료
- [`dev/ux-audit-consumer-2026-04-21.md`](./ux-audit-consumer-2026-04-21.md) — 이 지시서의 기반 UX 점검 리포트
- [`FEATURE_GUIDE.md`](../FEATURE_GUIDE.md) — 기능 전체 가이드 (스택·폴더 구조)
- [`STIZ_Renewal_Proposal.md`](../STIZ_Renewal_Proposal.md) — 리뉴얼 제안서
- [`CAFE24_MIGRATION_GUIDE.md`](../CAFE24_MIGRATION_GUIDE.md) — Cafe24 이전 가이드

## 📎 부록 B · 작업 시 주의사항

- **기존 주석 스타일을 따를 것**: 이 프로젝트는 한국어 주석에 "비유" 섹션을 자주 씀. 신규 함수를 추가할 때 스타일 맞추기.
- **Tailwind 클래스 순서**: 기존 파일의 관례를 따르기 (레이아웃 → 크기 → 색상 → hover/focus).
- **영어/한국어 혼용**: 기존 코드에 `Total`, `Summary`처럼 남아있는 UI 영어 단어가 있어도 이 작업 범위 밖이면 건드리지 않기.
- **리다이렉트 페이지 절대 건드리지 않기**: `basket.html`, `order.html`, `order-custom.html`은 의도적으로 얇게 유지되어 있음.
- **admin-\* 페이지는 범위 밖**: 이번 작업은 소비자 접점만.

---

*작성: STIZ UX 점검팀 · 2026-04-21*
