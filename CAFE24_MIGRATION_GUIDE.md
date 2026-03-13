# STIZ Cafe24 이전 및 연동 상세 가이드

> Cafe24 스마트 디자인으로 STIZ 쇼핑몰을 이전하기 위한 **완전한 실행 매뉴얼**입니다.
> 각 단계별 코드 예시, 설정 방법, 체크리스트를 포함합니다.

---

## 목차

1. [개요 및 이전 전략](#1-개요-및-이전-전략)
2. [Cafe24 스마트 디자인 구조](#2-cafe24-스마트-디자인-구조)
3. [파일별 이전 매핑](#3-파일별-이전-매핑)
4. [페이지별 변환 코드](#4-페이지별-변환-코드)
5. [Cafe24 모듈 변수 참조표](#5-cafe24-모듈-변수-참조표)
6. [스마트 디자인 에디터 사용법](#6-스마트-디자인-에디터-사용법)
7. [PG 결제 설정](#7-pg-결제-설정)
8. [Design Lab 외부 서버 배포](#8-design-lab-외부-서버-배포)
9. [챗봇 연동](#9-챗봇-연동)
10. [애널리틱스 연동](#10-애널리틱스-연동)
11. [Cafe24 API 활용](#11-cafe24-api-활용)
12. [도메인/SSL/CDN 설정](#12-도메인sslcdn-설정)
13. [이전 실행 순서](#13-이전-실행-순서)
14. [런칭 전 체크리스트](#14-런칭-전-체크리스트)

---

## 1. 개요 및 이전 전략

### 1-1. 현재 구조 vs Cafe24 구조

| 항목 | 현재 | Cafe24 이전 후 |
|------|------|---------------|
| 상품 관리 | `product-data.js` (하드코딩) | Cafe24 관리자에서 등록 |
| 장바구니 | `localStorage` 기반 | Cafe24 내장 장바구니 |
| 결제 | PortOne Mock | Cafe24 내장 PG |
| 회원 관리 | `localStorage` 기반 | Cafe24 회원 시스템 |
| 주문 관리 | `localStorage` 기반 | Cafe24 주문 관리 |
| 배송 관리 | 수동 | Cafe24 배송 추적 |
| Design Lab | Node.js 서버 | **별도 서버 유지** (Vercel) |
| AI 챗봇 | `chatbot.js` | Cafe24 스킨에 스크립트 삽입 |

### 1-2. 이전 범위

**Cafe24로 이전하는 기능:**
- 상품 등록/관리/표시
- 장바구니/주문/결제
- 회원가입/로그인/마이페이지
- 배송 관리
- 게시판 (공지, FAQ)

**별도 서버에서 유지하는 기능:**
- AI Design Lab (custom.html, custom_2d.html)
- AI 이미지 생성 (server/routes/ai.js)
- Node.js 백엔드 전체

---

## 2. Cafe24 스마트 디자인 구조

```
skin/
├── index.html                  # 메인 페이지
├── product/
│   ├── list.html               # 상품 목록
│   └── detail.html             # 상품 상세
├── order/
│   ├── basket.html             # 장바구니
│   ├── orderform.html          # 주문서 작성
│   └── order_result.html       # 주문 완료
├── member/
│   ├── login.html              # 로그인
│   ├── join_step.html          # 회원가입 (약관)
│   ├── join.html               # 회원가입 (정보 입력)
│   └── mypage.html             # 마이페이지
├── board/
│   ├── list.html               # 게시판 목록
│   └── view.html               # 게시판 상세
├── layout/
│   ├── header.html             # 공통 헤더 (모든 페이지 자동 포함)
│   └── footer.html             # 공통 푸터 (모든 페이지 자동 포함)
├── css/
│   └── style.css               # 커스텀 CSS
├── js/
│   ├── custom.js               # 커스텀 JavaScript
│   ├── chatbot.js              # AI 챗봇
│   └── analytics.js            # 애널리틱스
└── img/
    ├── logo_white.png          # 로고
    ├── logo_black.png
    └── ...
```

> **참고:** Cafe24 스마트 디자인에서 `layout/header.html`과 `layout/footer.html`은
> 모든 페이지에 **자동으로 포함**됩니다. 별도의 include 처리가 필요 없습니다.

---

## 3. 파일별 이전 매핑

| 현재 파일 | Cafe24 경로 | 주요 변환 작업 |
|-----------|-------------|---------------|
| `index.html` | `skin/index.html` | JS 렌더링 → Cafe24 모듈 변수 |
| `list.html` | `skin/product/list.html` | `getProductsByCategory()` → `{$product_list}` 모듈 |
| `detail.html` | `skin/product/detail.html` | `getProductById()` → `{$product_name}` 등 변수 |
| `basket.html` | `skin/order/basket.html` | `cart.js` → Cafe24 장바구니 모듈 |
| `order.html` | `skin/order/orderform.html` | PortOne → Cafe24 내장 PG |
| `order_result.html` | `skin/order/order_result.html` | localStorage → `{$order_id}` 변수 |
| `login.html` | `skin/member/login.html` | `auth.js` → Cafe24 로그인 모듈 |
| `join.html` | `skin/member/join.html` | `register()` → Cafe24 회원가입 모듈 |
| `myshop.html` | `skin/member/mypage.html` | localStorage → Cafe24 마이페이지 |
| `notice.html` | `skin/board/list.html` | 정적 HTML → Cafe24 게시판 모듈 |
| `js/header_render.js` | `skin/layout/header.html` | JS 렌더링 → Cafe24 레이아웃 파일 |
| `css/style.css` | `skin/css/style.css` | 그대로 업로드 |
| `js/chatbot.js` | `skin/js/chatbot.js` | 그대로 업로드 (상품 데이터 연동 수정) |
| `js/analytics.js` | `skin/js/analytics.js` | 그대로 업로드 |

### 제거되는 파일 (Cafe24에서 불필요)

| 파일 | 이유 |
|------|------|
| `js/product-data.js` | Cafe24 DB로 대체 |
| `js/cart.js` | Cafe24 장바구니로 대체 |
| `js/auth.js` | Cafe24 회원 시스템으로 대체 |
| `js/main.js` | header_render.js 종속 기능 → Cafe24 레이아웃 |
| `js/header_render.js` | Cafe24 layout/header.html로 대체 |
| `server/` 전체 | Design Lab 전용 서버로 분리 |

---

## 4. 페이지별 변환 코드

### 4-1. 메인 페이지 (index.html → skin/index.html)

#### 헤더 — Cafe24 레이아웃 자동 포함

현재 header_render.js로 동적 렌더링하는 헤더를 Cafe24 layout/header.html에 작성합니다.

```html
<!-- skin/layout/header.html -->
<header class="fixed w-full z-50 transition-all duration-300 bg-white text-black shadow-sm">
    <div class="container mx-auto px-6 h-20 flex items-center justify-between">
        <!-- 로고 -->
        <a href="/" class="z-50">
            <img src="/skin/img/logo_black.png" alt="STIZ" class="h-8 md:h-10">
        </a>

        <!-- 네비게이션 -->
        <nav class="hidden lg:flex items-center gap-10">
            <a href="/product/list.html?cate_no=1" class="text-sm font-bold tracking-wider hover:text-red-600">TEAMWEAR</a>
            <a href="/product/list.html?cate_no=2" class="text-sm font-bold tracking-wider hover:text-red-600">STORE</a>
            <a href="/board/list.html?board_no=1" class="text-sm font-bold tracking-wider hover:text-red-600">COMMUNITY</a>
        </nav>

        <!-- 유틸리티 -->
        <div class="flex items-center gap-6">
            <!-- 검색 -->
            <a href="/search.html" class="hover:text-red-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </a>

            <!-- 로그인/마이페이지 -->
            <!--@if({$logged_in}||)-->
            <a href="/member/mypage.html" class="text-sm font-medium">My Page</a>
            <!--@end--->
            <!--@unless({$logged_in}||)-->
            <a href="/member/login.html" class="text-sm font-medium">Login</a>
            <!--@end--->

            <!-- 장바구니 -->
            <a href="/order/basket.html" class="relative">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
                </svg>
                <span class="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">{$basket_count}</span>
            </a>
        </div>
    </div>
</header>
<div class="h-20"></div>
```

#### 히어로 섹션 — 그대로 유지

```html
<!-- skin/index.html -->
<!-- Hero (Cafe24 변수 불필요 — 정적 콘텐츠) -->
<section class="relative h-screen flex items-center justify-center overflow-hidden">
    <img src="/skin/img/hero_bg.jpg" class="absolute inset-0 w-full h-full object-cover">
    <div class="absolute inset-0 bg-black/50"></div>
    <div class="relative z-10 text-center text-white">
        <h1 class="text-5xl md:text-7xl font-black tracking-tighter mb-6">DESIGN YOUR GAME</h1>
        <p class="text-lg md:text-xl text-gray-300 mb-8">Premium Custom Sportswear</p>
        <a href="/product/list.html?cate_no=1" class="inline-block border-2 border-white text-white px-8 py-3 font-bold hover:bg-white hover:text-black transition-all">
            SHOP NOW
        </a>
    </div>
</section>
```

#### 베스트셀러 — Cafe24 상품 모듈

```html
<!-- 현재: JS로 getBestSellers() 호출 -->
<!-- Cafe24 변환: 진열 모듈 사용 -->

<section class="py-20">
    <h2 class="text-3xl font-black text-center mb-12">BEST SELLERS</h2>
    <div class="container mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <!--@start(main_product_list_1)--->
        <div class="group cursor-pointer">
            <a href="{$link_product_detail}">
                <div class="aspect-[3/4] bg-gray-100 overflow-hidden mb-3 rounded-lg">
                    <img src="{$image_medium}" alt="{$product_name}"
                         class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                </div>
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">{$category_name}</p>
                <h3 class="text-sm font-bold truncate mt-1">{$product_name}</h3>
                <div class="flex items-center gap-2 mt-1">
                    <!--@if({$display_discount}||)-->
                    <span class="text-xs text-gray-400 line-through">{$product_price}</span>
                    <!--@end--->
                    <span class="text-sm font-bold text-red-600">{$product_sale_price}</span>
                </div>
            </a>
        </div>
        <!--@end(main_product_list_1)--->
    </div>
</section>
```

> **설정:** Cafe24 관리자 → 상품 → 메인 진열 관리 → "main_product_list_1" 그룹에 베스트셀러 상품 배치

### 4-2. 상품 목록 (list.html → skin/product/list.html)

```html
<!-- skin/product/list.html -->

<!-- 카테고리 제목 -->
<div class="container mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold mb-2">{$category_name}</h1>
    <p class="text-gray-500 text-sm mb-8">{$category_product_count}개의 상품</p>

    <!-- 정렬 -->
    <div class="flex justify-end mb-6">
        <select onchange="location.href=this.value" class="border border-gray-300 rounded px-4 py-2 text-sm">
            <option value="{$link_sort_date}" {$sort_date_selected}>최신순</option>
            <option value="{$link_sort_price_asc}" {$sort_price_asc_selected}>가격 낮은순</option>
            <option value="{$link_sort_price_desc}" {$sort_price_desc_selected}>가격 높은순</option>
            <option value="{$link_sort_name}" {$sort_name_selected}>이름순</option>
        </select>
    </div>

    <!-- 상품 그리드 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <!--@start(product_list)--->
        <div class="group cursor-pointer">
            <a href="{$link_product_detail}">
                <div class="aspect-[3/4] bg-gray-100 overflow-hidden mb-3 rounded-lg relative">
                    <img src="{$image_medium}" alt="{$product_name}"
                         class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                    <!--@if({$is_new}||)-->
                    <span class="absolute top-2 left-2 bg-black text-white text-[10px] px-2 py-1 font-bold">NEW</span>
                    <!--@end--->
                    <!--@if({$is_best}||)-->
                    <span class="absolute top-2 right-2 bg-red-600 text-white text-[10px] px-2 py-1 font-bold">BEST</span>
                    <!--@end--->
                </div>
                <p class="text-[10px] text-gray-400 uppercase">{$category_name}</p>
                <h3 class="text-sm font-bold truncate">{$product_name}</h3>
                <p class="text-sm font-bold mt-1">{$product_sale_price}</p>
            </a>
        </div>
        <!--@end(product_list)--->
    </div>

    <!-- 페이지네이션 -->
    <div class="flex justify-center mt-12 gap-2">
        {$pagination}
    </div>
</div>
```

### 4-3. 상품 상세 (detail.html → skin/product/detail.html)

```html
<!-- skin/product/detail.html -->
<div class="container mx-auto px-6 py-12">
    <div class="flex flex-col lg:flex-row gap-12">

        <!-- 이미지 갤러리 -->
        <div class="flex-1">
            <div class="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-4">
                <img src="{$image_big}" id="main-image" class="w-full h-full object-cover">
            </div>
            <div class="grid grid-cols-4 gap-2">
                <!--@start(product_image_list)--->
                <div class="aspect-square bg-gray-100 rounded overflow-hidden cursor-pointer"
                     onclick="document.getElementById('main-image').src='{$image_big}'">
                    <img src="{$image_tiny}" class="w-full h-full object-cover">
                </div>
                <!--@end(product_image_list)--->
            </div>
        </div>

        <!-- 상품 정보 -->
        <div class="flex-1 lg:max-w-md">
            <p class="text-xs text-gray-400 uppercase mb-2">{$category_name}</p>
            <h1 class="text-2xl font-bold mb-4">{$product_name}</h1>

            <!-- 가격 -->
            <!--@if({$display_discount}||)-->
            <p class="text-gray-400 line-through text-sm">{$product_price}</p>
            <!--@end--->
            <p class="text-xl font-bold text-red-600 mb-6">{$product_sale_price}</p>

            <!-- 옵션 (사이즈/색상) -->
            <div class="mb-6">
                {$product_option}
            </div>

            <!-- 수량 -->
            <div class="mb-6">
                {$product_quantity}
            </div>

            <!-- 버튼 -->
            <div class="space-y-3">
                <button onclick="{$action_basket}"
                    class="w-full py-4 border-2 border-black text-black font-bold hover:bg-black hover:text-white transition-colors">
                    ADD TO CART
                </button>
                <button onclick="{$action_buy}"
                    class="w-full py-4 bg-red-600 text-white font-bold hover:bg-red-700 transition-colors">
                    BUY NOW
                </button>
            </div>

            <!-- 배송 정보 -->
            <div class="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
                <p>배송비: 3,000원 (50,000원 이상 무료배송)</p>
                <p>배송 기간: 결제 후 2~3 영업일</p>
            </div>

            <!-- 상세 설명 탭 -->
            <div class="mt-8 border-t pt-6">
                <div class="flex border-b">
                    <button class="px-4 py-2 text-sm font-bold border-b-2 border-black" onclick="showTab('desc')">Description</button>
                    <button class="px-4 py-2 text-sm text-gray-400" onclick="showTab('shipping')">Shipping</button>
                    <button class="px-4 py-2 text-sm text-gray-400" onclick="showTab('reviews')">Reviews</button>
                </div>
                <div id="tab-desc" class="py-4">
                    {$product_detail}
                </div>
            </div>
        </div>
    </div>
</div>
```

### 4-4. 장바구니 (basket.html → skin/order/basket.html)

```html
<!-- skin/order/basket.html -->
<div class="container mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold mb-10">SHOPPING BAG</h1>

    <!--@if({$basket_count}||0)-->
    <p class="text-center text-gray-500 py-20">장바구니가 비어있습니다.</p>
    <!--@end--->

    <!--@unless({$basket_count}||0)-->
    <form action="" method="post">
        <table class="w-full">
            <thead class="border-b-2 border-black">
                <tr>
                    <th class="py-3 text-left text-sm">상품</th>
                    <th class="py-3 text-center text-sm w-32">수량</th>
                    <th class="py-3 text-right text-sm w-32">금액</th>
                    <th class="py-3 text-center text-sm w-20">삭제</th>
                </tr>
            </thead>
            <tbody>
                <!--@start(basket_list)--->
                <tr class="border-b">
                    <td class="py-4">
                        <div class="flex items-center gap-4">
                            <img src="{$image_tiny}" class="w-20 h-20 object-cover rounded">
                            <div>
                                <p class="font-bold text-sm">{$product_name}</p>
                                <p class="text-xs text-gray-500">{$option_value}</p>
                            </div>
                        </div>
                    </td>
                    <td class="py-4 text-center">
                        {$quantity_control}
                    </td>
                    <td class="py-4 text-right font-bold">{$total_product_price}</td>
                    <td class="py-4 text-center">
                        <button onclick="{$action_delete}" class="text-gray-400 hover:text-red-600">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </td>
                </tr>
                <!--@end(basket_list)--->
            </tbody>
        </table>

        <!-- 합계 -->
        <div class="mt-8 bg-gray-50 p-8 rounded-lg max-w-md ml-auto">
            <div class="space-y-3 text-sm">
                <div class="flex justify-between">
                    <span>상품 합계</span>
                    <span class="font-bold">{$total_product_price}</span>
                </div>
                <div class="flex justify-between">
                    <span>배송비</span>
                    <span class="font-bold">{$shipping_fee}</span>
                </div>
                <div class="flex justify-between border-t pt-3 text-lg">
                    <span class="font-bold">총 결제금액</span>
                    <span class="font-bold text-red-600">{$total_order_price}</span>
                </div>
            </div>
            <button onclick="{$action_order}"
                class="w-full mt-6 py-4 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">
                ORDER NOW
            </button>
        </div>
    </form>
    <!--@end--->
</div>
```

### 4-5. 주문서 (order.html → skin/order/orderform.html)

Cafe24 주문서는 내장 모듈이 대부분의 기능을 처리합니다.
스타일만 커스터마이징합니다.

```html
<!-- skin/order/orderform.html -->
<div class="container mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold mb-10">CHECKOUT</h1>

    <form action="" method="post">
        <div class="flex flex-col lg:flex-row gap-12">
            <div class="flex-1 space-y-8">
                <!-- 배송지 정보 (Cafe24 모듈) -->
                <div class="bg-white p-6 border border-gray-200 rounded-lg">
                    <h2 class="text-xl font-bold mb-4">배송 정보</h2>
                    {$order_receiver}
                    <!-- Cafe24가 이름, 전화번호, 주소 입력 폼을 자동 생성 -->
                </div>

                <!-- 결제 방법 (Cafe24 모듈) -->
                <div class="bg-white p-6 border border-gray-200 rounded-lg">
                    <h2 class="text-xl font-bold mb-4">결제 방법</h2>
                    {$order_payment}
                    <!-- Cafe24가 PG 결제 옵션을 자동 생성 -->
                </div>

                <!-- 약관 동의 (Cafe24 모듈) -->
                <div>
                    {$order_agreement}
                </div>

                <!-- 결제 버튼 -->
                <button type="submit" onclick="{$action_order_submit}"
                    class="w-full bg-red-600 text-white py-4 font-bold rounded-lg hover:bg-red-700 text-lg">
                    PAY NOW
                </button>
            </div>

            <!-- 주문 요약 사이드바 -->
            <div class="w-full lg:w-96">
                <div class="bg-gray-50 p-8 rounded-lg sticky top-24">
                    <h2 class="font-bold text-lg mb-6">주문 상품</h2>
                    <!--@start(order_product_list)--->
                    <div class="flex items-center gap-4 mb-4">
                        <img src="{$image_tiny}" class="w-12 h-12 object-cover rounded">
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold truncate">{$product_name}</p>
                            <p class="text-[10px] text-gray-500">{$option_value} / {$quantity}개</p>
                        </div>
                        <span class="text-xs font-bold">{$total_product_price}</span>
                    </div>
                    <!--@end(order_product_list)--->

                    <div class="border-t pt-4 mt-4 flex justify-between">
                        <span class="font-bold text-lg">Total</span>
                        <span class="font-bold text-xl text-red-600">{$total_order_price}</span>
                    </div>
                </div>
            </div>
        </div>
    </form>
</div>
```

### 4-6. 로그인 (login.html → skin/member/login.html)

```html
<!-- skin/member/login.html -->
<div class="min-h-screen flex items-center justify-center px-6">
    <div class="w-full max-w-md">
        <h1 class="text-3xl font-black text-center mb-8">LOGIN</h1>

        <form action="" method="post">
            <div class="space-y-4">
                <div>
                    <input type="email" name="{$input_id}" placeholder="Email address"
                        class="w-full border border-gray-300 rounded px-4 py-3 text-sm focus:border-black focus:outline-none">
                </div>
                <div>
                    <input type="password" name="{$input_password}" placeholder="Password"
                        class="w-full border border-gray-300 rounded px-4 py-3 text-sm focus:border-black focus:outline-none">
                </div>

                <!-- 에러 메시지 -->
                <!--@if({$login_error}||)-->
                <p class="text-sm text-red-500">{$login_error_message}</p>
                <!--@end--->

                <button type="submit" onclick="{$action_login}"
                    class="w-full bg-black text-white py-3 font-bold hover:bg-gray-800 transition-colors">
                    LOGIN
                </button>
            </div>
        </form>

        <div class="mt-6 text-center text-sm text-gray-500">
            <a href="/member/join_step.html" class="font-bold text-black hover:underline">회원가입</a>
            <span class="mx-2">|</span>
            <a href="/member/find_id.html" class="hover:underline">아이디 찾기</a>
            <span class="mx-2">|</span>
            <a href="/member/find_password.html" class="hover:underline">비밀번호 찾기</a>
        </div>
    </div>
</div>
```

---

## 5. Cafe24 모듈 변수 참조표

### 5-1. 상품 관련 변수

| 변수 | 설명 | 사용 위치 |
|------|------|----------|
| `{$product_name}` | 상품명 | 목록, 상세 |
| `{$product_price}` | 판매가 (정가) | 상세 |
| `{$product_sale_price}` | 할인가 | 목록, 상세 |
| `{$image_big}` | 대형 이미지 (500px+) | 상세 |
| `{$image_medium}` | 중형 이미지 (300px) | 목록 |
| `{$image_tiny}` | 소형 이미지 (100px) | 장바구니 |
| `{$product_description}` | 간략 설명 | 목록 |
| `{$product_detail}` | 상세 설명 (HTML) | 상세 |
| `{$product_option}` | 옵션 선택 UI (사이즈/색상) | 상세 |
| `{$product_quantity}` | 수량 선택 UI | 상세 |
| `{$link_product_detail}` | 상세 페이지 링크 | 목록 |
| `{$category_name}` | 카테고리명 | 목록, 상세 |
| `{$is_new}` | 신상품 여부 | 목록 |
| `{$is_best}` | 베스트 여부 | 목록 |
| `{$display_discount}` | 할인 표시 여부 | 목록, 상세 |

### 5-2. 장바구니/주문 변수

| 변수 | 설명 |
|------|------|
| `{$basket_count}` | 장바구니 상품 수 |
| `{$option_value}` | 선택한 옵션값 |
| `{$quantity}` | 수량 |
| `{$quantity_control}` | 수량 증감 UI |
| `{$total_product_price}` | 상품별 합계 |
| `{$shipping_fee}` | 배송비 |
| `{$total_order_price}` | 총 결제금액 |
| `{$action_basket}` | 장바구니 추가 액션 |
| `{$action_buy}` | 바로 구매 액션 |
| `{$action_delete}` | 장바구니 삭제 액션 |
| `{$action_order}` | 주문하기 액션 |

### 5-3. 회원 변수

| 변수 | 설명 |
|------|------|
| `{$logged_in}` | 로그인 여부 |
| `{$member_name}` | 회원 이름 |
| `{$member_email}` | 회원 이메일 |
| `{$input_id}` | 로그인 ID 입력 name |
| `{$input_password}` | 비밀번호 입력 name |
| `{$action_login}` | 로그인 액션 |
| `{$action_logout}` | 로그아웃 액션 |

### 5-4. 주문 완료 변수

| 변수 | 설명 |
|------|------|
| `{$order_id}` | 주문번호 |
| `{$order_date}` | 주문일시 |
| `{$order_total_price}` | 결제 금액 |
| `{$order_receiver_name}` | 수령인 |
| `{$order_receiver_address}` | 배송 주소 |

### 5-5. Cafe24 조건문/반복문

```html
<!-- 조건문 -->
<!--@if({$변수}||비교값)-->
    조건이 참일 때 표시
<!--@end--->

<!--@unless({$변수}||비교값)-->
    조건이 거짓일 때 표시
<!--@end--->

<!-- 반복문 (모듈 영역) -->
<!--@start(모듈명)--->
    반복되는 HTML
<!--@end(모듈명)--->
```

---

## 6. 스마트 디자인 에디터 사용법

### 6-1. 접근 방법

1. Cafe24 관리자 로그인
2. **디자인** → **스마트 디자인 편집** 클릭
3. 좌측 파일 트리에서 편집할 파일 선택

### 6-2. 파일 업로드

1. 스마트 디자인 에디터 상단 **파일 업로드** 클릭
2. CSS, JS, 이미지 파일 업로드
3. 업로드 경로:
   - CSS: `skin/css/`
   - JS: `skin/js/`
   - 이미지: `skin/img/`

### 6-3. Tailwind CSS 적용

`skin/layout/header.html` 상단에 추가:

```html
<!-- Tailwind CSS CDN -->
<script src="https://cdn.tailwindcss.com"></script>
<script>
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    brand: {
                        black: '#111111',
                        red: '#E63946',
                    }
                },
                fontFamily: {
                    sans: ['Pretendard', 'Inter', 'sans-serif'],
                }
            }
        }
    }
</script>

<!-- Pretendard 폰트 -->
<link rel="stylesheet" as="style" crossorigin
    href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />

<!-- 커스텀 CSS -->
<link rel="stylesheet" href="/skin/css/style.css">
```

> **주의:** Tailwind CDN은 개발 편의를 위한 것입니다.
> 프로덕션에서는 빌드된 CSS 파일을 사용하는 것이 성능에 유리합니다.

### 6-4. 커스텀 JS 적용

`skin/layout/footer.html` 하단에 추가:

```html
<!-- 챗봇 -->
<script src="/skin/js/chatbot.js"></script>

<!-- 애널리틱스 -->
<script src="/skin/js/analytics.js"></script>

<!-- 커스텀 스크립트 -->
<script src="/skin/js/custom.js"></script>
```

### 6-5. 모듈 배치

Cafe24 스마트 디자인에서 모듈을 배치하려면:

1. 에디터 우측 **모듈 관리** 패널 열기
2. 원하는 모듈 검색 (예: "상품 목록")
3. HTML에 모듈 코드 삽입
4. `<!--@start(모듈명)--->` ~ `<!--@end(모듈명)--->` 사이에 디자인

---

## 7. PG 결제 설정

### 7-1. Cafe24 내장 PG (본 쇼핑몰)

Cafe24는 자체 PG 연동을 지원합니다. 별도의 PortOne 코드가 **필요 없습니다**.

#### 설정 방법:

1. **Cafe24 관리자** → **쇼핑몰 설정** → **결제 설정**
2. **PG사 선택** (택 1):
   - KG이니시스 (국내 가장 많이 사용)
   - NHN KCP
   - 토스페이먼츠
   - 나이스페이
3. **사업자 정보 입력** → PG사 심사 → 승인
4. **간편결제 추가** (선택):
   - 카카오페이
   - 네이버페이
   - 토스페이
5. **테스트 결제** → 정상 동작 확인 → 실 결제 전환

#### 배송비 설정:

1. **쇼핑몰 설정** → **배송 설정**
2. 기본 배송비: **3,000원**
3. 무료 배송 기준: **50,000원 이상**
4. 배송 방법: 택배 (CJ대한통운, 한진 등)

### 7-2. PortOne (Design Lab 전용)

Design Lab 별도 서버에서 커스텀 주문을 받을 경우 PortOne을 사용합니다.

설정은 `order.html`의 `PORTONE_CONFIG`에서 관리합니다.
자세한 설정 방법은 `FEATURE_GUIDE.md`의 4-4절을 참고하세요.

---

## 8. Design Lab 외부 서버 배포

AI Design Lab은 Cafe24에서 지원하지 않는 Node.js 기능을 사용하므로
**별도 서버**에서 호스팅해야 합니다.

### 8-1. Vercel 배포 (권장)

#### 프로젝트 구조 분리:

```
stiz-design-lab/             # 별도 레포지토리
├── public/
│   ├── custom.html
│   ├── custom_2d.html
│   ├── custom_mockup.html
│   ├── css/style.css
│   ├── js/
│   │   ├── custom_2d.js
│   │   ├── custom.js
│   │   └── chatbot.js
│   └── images/
├── api/                     # Vercel Serverless Functions
│   └── generate.js          # AI 생성 API
├── vercel.json
└── package.json
```

#### vercel.json 설정:

```json
{
    "version": 2,
    "builds": [
        { "src": "api/**/*.js", "use": "@vercel/node" },
        { "src": "public/**", "use": "@vercel/static" }
    ],
    "routes": [
        { "src": "/api/(.*)", "dest": "/api/$1" },
        { "src": "/(.*)", "dest": "/public/$1" }
    ],
    "env": {
        "GOOGLE_API_KEY": "@google-api-key"
    }
}
```

#### 배포 명령:

```bash
# Vercel CLI 설치
npm i -g vercel

# 배포
vercel

# 환경 변수 설정
vercel env add GOOGLE_API_KEY
```

#### CORS 설정 (API):

```javascript
// api/generate.js
export default function handler(req, res) {
    // CORS 허용 (Cafe24 도메인)
    res.setHeader('Access-Control-Allow-Origin', 'https://stiz.co.kr');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // AI 생성 로직...
}
```

### 8-2. Cafe24에서 Design Lab 링크 연결

```html
<!-- skin/layout/header.html 네비게이션 -->
<a href="https://lab.stiz.co.kr/custom.html"
   target="_blank"
   class="text-sm font-bold tracking-wider hover:text-red-600">
    DESIGN LAB
</a>
```

### 8-3. 도메인 설정

| 도메인 | 용도 | 호스팅 |
|--------|------|--------|
| `stiz.co.kr` | 메인 쇼핑몰 | Cafe24 |
| `lab.stiz.co.kr` | Design Lab | Vercel |

DNS 설정:
```
stiz.co.kr       → Cafe24 서버 IP (CNAME)
lab.stiz.co.kr   → cname.vercel-dns.com (CNAME)
```

---

## 9. 챗봇 연동

### 9-1. Cafe24 환경에서 챗봇 적용

`js/chatbot.js`를 Cafe24 스킨에 업로드하고 footer에서 로드합니다.

#### 수정 필요 사항:

현재 `chatbot.js`는 `product-data.js`의 함수를 사용합니다.
Cafe24 환경에서는 이 함수들이 없으므로 **수정이 필요**합니다.

#### 방법 1: 정적 응답만 사용

`processBotResponse()` 함수에서 상품 조회 부분을 제거하고
정적 텍스트 응답만 남깁니다.

#### 방법 2: Cafe24 API로 상품 조회

```javascript
// chatbot.js 내부 수정
async function getProductsFromCafe24(category) {
    const response = await fetch(`/exec/front/Product/ApiProductList?cate_no=${category}&limit=4`);
    const data = await response.json();
    return data.products;
}
```

#### 방법 3: Design Lab 서버를 통한 AI 챗봇

```javascript
// Gemini API를 활용한 자연어 처리
async function processBotResponseAI(input) {
    const response = await fetch('https://lab.stiz.co.kr/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
    });
    const data = await response.json();
    return data.reply;
}
```

---

## 10. 애널리틱스 연동

### 10-1. GA4 설정

`js/analytics.js`의 `GA_MEASUREMENT_ID`에 GA4 측정 ID를 입력합니다.

```javascript
const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';
```

Cafe24 스킨의 `skin/layout/footer.html`에서 스크립트 로드:

```html
<script src="/skin/js/analytics.js"></script>
```

### 10-2. 네이버 애널리틱스

```javascript
const NAVER_SITE_ID = 'your-naver-analytics-id';
```

### 10-3. Cafe24 전용 전환 추적

Cafe24 주문 완료 페이지(`skin/order/order_result.html`)에 전환 추적 코드 추가:

```html
<script>
    // GA4 구매 완료 이벤트
    if (window.gtag) {
        gtag('event', 'purchase', {
            transaction_id: '{$order_id}',
            value: {$order_total_price_raw},
            currency: 'KRW',
            shipping: {$shipping_fee_raw}
        });
    }

    // 네이버 전환 추적
    if (typeof wcs !== 'undefined') {
        var _nasa = {};
        _nasa['cnv'] = wcs.cnv('1', '{$order_total_price_raw}');
    }
</script>
```

### 10-4. 네이버 쇼핑 EP (선택)

네이버 쇼핑에 상품을 노출하려면 EP(Engine Page) 설정이 필요합니다:

1. Cafe24 관리자 → **마케팅** → **네이버 쇼핑**
2. EP 자동 생성 설정
3. 네이버 쇼핑 센터에서 EP URL 등록

---

## 11. Cafe24 API 활용

Cafe24는 REST API를 제공합니다. 프론트엔드 JavaScript에서 호출 가능합니다.

### 11-1. 상품 조회 API

```javascript
// 카테고리별 상품 목록
fetch('/exec/front/Product/ApiProductList?cate_no=1&limit=10')
    .then(res => res.json())
    .then(data => {
        console.log(data.products);
    });
```

### 11-2. 장바구니 API

```javascript
// 장바구니 추가
fetch('/exec/front/Cart/Add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'product_no=123&quantity=1&option_value=L'
});

// 장바구니 조회
fetch('/exec/front/Cart/CartList')
    .then(res => res.json())
    .then(data => console.log(data));
```

### 11-3. 회원 정보 API

```javascript
// 로그인 상태 확인
fetch('/exec/front/Member/CheckLogin')
    .then(res => res.json())
    .then(data => {
        if (data.logged_in) {
            console.log('회원:', data.member_name);
        }
    });
```

> **주의:** Cafe24 프론트 API는 공식 문서가 제한적이며,
> 버전에 따라 엔드포인트가 다를 수 있습니다.
> Cafe24 개발자 센터([developers.cafe24.com](https://developers.cafe24.com))에서
> 최신 API 문서를 확인하세요.

---

## 12. 도메인/SSL/CDN 설정

### 12-1. 도메인 연결

1. **도메인 구매**: 가비아, 후이즈 등에서 `stiz.co.kr` 구매
2. **네임서버 설정**: Cafe24 네임서버로 변경
   ```
   ns1.cafe24.com
   ns2.cafe24.com
   ns3.cafe24.com
   ```
3. **Cafe24 관리자** → **기본 설정** → **도메인 관리** → 도메인 추가

### 12-2. SSL 인증서

- **메인 도메인 (stiz.co.kr)**: Cafe24 무료 SSL 자동 적용
- **서브 도메인 (lab.stiz.co.kr)**: Vercel 자동 SSL (Let's Encrypt)

### 12-3. CDN

Cafe24는 자체 CDN을 제공합니다.
이미지, CSS, JS 파일이 자동으로 CDN을 통해 배포됩니다.

#### 이미지 최적화:
- Cafe24에 업로드한 이미지는 자동으로 3가지 사이즈로 생성됨
  - `{$image_big}` — 원본/대형
  - `{$image_medium}` — 중형 (목록용)
  - `{$image_tiny}` — 소형 (장바구니용)

---

## 13. 이전 실행 순서

### Step 1: 기본 설정 (1주)

| 작업 | 세부 내용 | 완료 |
|------|----------|------|
| Cafe24 쇼핑몰 개설 | [cafe24.com](https://cafe24.com) 가입 → 무료 개설 | [ ] |
| 스마트 디자인 활성화 | 디자인 → 스마트디자인 편집 활성화 | [ ] |
| Tailwind CSS CDN 추가 | layout/header.html에 스크립트 태그 추가 | [ ] |
| Pretendard 폰트 추가 | layout/header.html에 link 태그 추가 | [ ] |
| style.css 업로드 | skin/css/style.css에 업로드 | [ ] |
| 이미지 업로드 | logo, hero_bg 등 skin/img/에 업로드 | [ ] |
| 레이아웃 작성 | layout/header.html, layout/footer.html 작성 | [ ] |

### Step 2: 상품 등록 (1주)

| 작업 | 세부 내용 | 완료 |
|------|----------|------|
| 카테고리 생성 | Basketball, Soccer, Volleyball, Baseball, Sportswear, KOGAS | [ ] |
| 상품 등록 (30개+) | 상품명, 가격, 이미지, 옵션(사이즈/색상) | [ ] |
| 상품 상세 HTML | 각 상품의 상세 설명 HTML 에디터로 입력 | [ ] |
| 메인 진열 설정 | 베스트셀러, 신상품 그룹 배치 | [ ] |
| 옵션 설정 | 사이즈(S~2XL), 색상 옵션 설정 | [ ] |

### Step 3: 스킨 디자인 (2주)

| 작업 | 세부 내용 | 완료 |
|------|----------|------|
| 메인 페이지 | 히어로, 베스트셀러, 신상품, CTA 배너 | [ ] |
| 상품 목록 | 카테고리 필터, 정렬, 그리드 레이아웃 | [ ] |
| 상품 상세 | 이미지 갤러리, 옵션 선택, 탭 UI | [ ] |
| 장바구니 | 수량 조절, 합계, 주문 버튼 | [ ] |
| 주문서 | 배송지, 결제 방법, 약관 | [ ] |
| 주문 완료 | 주문번호, 배송 정보 | [ ] |
| 로그인/가입 | 로그인 폼, 회원가입 폼 | [ ] |
| 마이페이지 | 주문 이력, 프로필 | [ ] |
| 모바일 반응형 | 전 페이지 모바일 확인 | [ ] |

### Step 4: 기능 연동 (1주)

| 작업 | 세부 내용 | 완료 |
|------|----------|------|
| PG 결제 설정 | 이니시스/KCP 신청 → 테스트 결제 | [ ] |
| 간편결제 설정 | 카카오페이, 네이버페이 연동 | [ ] |
| 배송비 설정 | 3,000원 / 50,000원 이상 무료 | [ ] |
| Design Lab 배포 | Vercel에 별도 서버 배포 | [ ] |
| 챗봇 스크립트 적용 | chatbot.js 업로드 + footer 연동 | [ ] |
| 애널리틱스 설정 | GA4 + 네이버 애널리틱스 | [ ] |

### Step 5: 런칭 (1주)

| 작업 | 세부 내용 | 완료 |
|------|----------|------|
| 도메인 연결 | stiz.co.kr → Cafe24 | [ ] |
| SSL 확인 | HTTPS 정상 동작 확인 | [ ] |
| 테스트 주문 | 전체 플로우 (주문→결제→확인) | [ ] |
| 모바일 테스트 | iOS + Android 브라우저 테스트 | [ ] |
| 법적 페이지 확인 | 이용약관, 개인정보처리방침 | [ ] |
| 공식 오픈 | 도메인 전환 + 홍보 시작 | [ ] |

---

## 14. 런칭 전 체크리스트

### 14-1. 법적 요건

| 항목 | 필수 | 완료 |
|------|------|------|
| 사업자 등록증 | O | [ ] |
| 통신판매업 신고 | O | [ ] |
| 개인정보처리방침 페이지 | O | [ ] |
| 이용약관 페이지 | O | [ ] |
| 반품/교환 정책 명시 | O | [ ] |
| 사업자 정보 표시 (푸터) | O | [ ] |
| 에스크로 가입 | O | [ ] |
| 구매안전서비스 가입 | 권장 | [ ] |

### 14-2. 기술 확인

| 항목 | 체크 |
|------|------|
| 모든 페이지 HTTPS 접속 확인 | [ ] |
| 모바일 반응형 정상 동작 | [ ] |
| 카드 결제 테스트 (실제 결제 → 환불) | [ ] |
| 회원가입 → 로그인 → 주문 전체 플로우 | [ ] |
| 검색 기능 정상 동작 | [ ] |
| 장바구니 추가/삭제/수량 변경 | [ ] |
| 주문 완료 메일 발송 | [ ] |
| Design Lab 외부 링크 정상 접속 | [ ] |
| 챗봇 정상 동작 | [ ] |
| GA4 데이터 수집 확인 | [ ] |
| Favicon, OG 이미지 설정 | [ ] |
| 404 에러 페이지 커스텀 | [ ] |

### 14-3. SEO 설정

| 항목 | 체크 |
|------|------|
| 메타 title / description 설정 | [ ] |
| OG 태그 설정 (SNS 공유용) | [ ] |
| 네이버 서치어드바이저 등록 | [ ] |
| Google Search Console 등록 | [ ] |
| sitemap.xml 제출 | [ ] |
| robots.txt 확인 | [ ] |

### 14-4. 마케팅 채널

| 항목 | 체크 |
|------|------|
| 네이버 쇼핑 EP 등록 | [ ] |
| 카카오 비즈니스 채널 개설 | [ ] |
| 인스타그램 비즈니스 계정 연동 | [ ] |
| 구글 판매자 센터 등록 | [ ] |

---

## 부록: 도메인 및 인프라 요약

| 항목 | 설정 |
|------|------|
| 메인 도메인 | `stiz.co.kr` → Cafe24 |
| 서브 도메인 | `lab.stiz.co.kr` → Vercel (Design Lab) |
| SSL | Cafe24 자동 (메인), Vercel 자동 (서브) |
| CDN | Cafe24 자체 CDN |
| 이미지 | Cafe24 이미지 호스팅 |
| AI 서버 | Vercel Serverless Functions |
| DB | Cafe24 내장 (상품/주문/회원), Vercel용 별도 없음 |

---

## 부록: 자주 묻는 질문

### Q1: Cafe24 무료 플랜으로 충분한가요?

Cafe24 무료 플랜에서도 스마트 디자인, PG 결제, 상품 등록이 가능합니다.
다만 상품 수 제한(300개), 용량 제한(200MB), 일부 기능 제한이 있습니다.
초기에는 무료 플랜으로 시작하고, 트래픽 증가 시 유료 전환하세요.

### Q2: Design Lab을 Cafe24 안에서 운영할 수 없나요?

Cafe24는 서버 사이드 JavaScript(Node.js)를 지원하지 않습니다.
AI 생성 기능(Gemini/Imagen API 호출)은 별도 서버가 필수입니다.
단, 2D 디자인 도구(Fabric.js)는 클라이언트 사이드이므로
AI 생성 없이 캔버스 편집만 할 경우 Cafe24에서도 가능합니다.

### Q3: 기존 상품 데이터를 Cafe24에 일괄 등록할 수 있나요?

Cafe24 관리자에서 **엑셀 일괄 등록** 기능을 제공합니다.
`product-data.js`의 데이터를 엑셀 양식에 맞춰 변환 후 업로드하세요.

### Q4: PortOne 결제 코드를 완전히 제거해야 하나요?

메인 쇼핑몰(Cafe24)에서는 Cafe24 내장 PG를 사용하므로
PortOne 코드가 필요 없습니다.
Design Lab 별도 서버에서 커스텀 주문을 받으려면 PortOne을 유지하세요.

### Q5: 이전 기간은 얼마나 걸리나요?

스킨 디자인 경험에 따라 다르지만,
전체 이전에 약 **5~6주**가 소요됩니다.
가장 시간이 많이 드는 작업은 스킨 디자인(2주)과 상품 등록(1주)입니다.
