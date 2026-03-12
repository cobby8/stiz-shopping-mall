# STIZ Cafe24 이전 가이드

## 1. 개요

현재 STIZ 쇼핑몰은 정적 HTML + Node.js 백엔드 구조입니다.
Cafe24 스마트 디자인으로 이전하여 결제, 회원, 재고 관리를 Cafe24 플랫폼에서 처리합니다.

---

## 2. Cafe24 스마트 디자인 구조

```
skin/
├── index.html          → 메인 페이지
├── product/
│   ├── list.html       → 상품 목록
│   └── detail.html     → 상품 상세
├── order/
│   ├── basket.html     → 장바구니
│   ├── orderform.html  → 주문서
│   └── order_result.html → 주문 완료
├── member/
│   ├── login.html      → 로그인
│   ├── join.html       → 회원가입
│   └── mypage.html     → 마이페이지
├── board/
│   └── list.html       → 게시판 (공지, FAQ)
├── layout/
│   ├── header.html     → 공통 헤더
│   └── footer.html     → 공통 푸터
├── css/
│   └── style.css       → 커스텀 스타일
├── js/
│   ├── custom.js       → 커스텀 스크립트
│   ├── chatbot.js      → AI 챗봇
│   └── analytics.js    → 애널리틱스
└── img/
    └── ...             → 이미지 파일
```

---

## 3. 파일별 이전 매핑

| 현재 파일 | Cafe24 경로 | 주요 변환 작업 |
|-----------|-------------|---------------|
| `index.html` | `skin/index.html` | Cafe24 변수로 상품 데이터 교체 |
| `list.html` | `skin/product/list.html` | `{$product_list}` 모듈 사용 |
| `detail.html` | `skin/product/detail.html` | `{$product_name}`, `{$product_price}` 등 |
| `basket.html` | `skin/order/basket.html` | Cafe24 장바구니 모듈 사용 |
| `order.html` | `skin/order/orderform.html` | Cafe24 주문서 모듈 + PG 연동 |
| `order_result.html` | `skin/order/order_result.html` | `{$order_id}` 변수 사용 |
| `login.html` | `skin/member/login.html` | Cafe24 로그인 모듈 |
| `join.html` | `skin/member/join.html` | Cafe24 회원가입 모듈 |
| `myshop.html` | `skin/member/mypage.html` | Cafe24 마이페이지 모듈 |

---

## 4. Cafe24 변수 치환 예시

### 상품 목록 (list.html)
```html
<!-- 현재 (JS 기반) -->
<div id="product-grid"></div>
<script>renderProducts(getProductsByCategory(...))</script>

<!-- Cafe24 변환 -->
<div class="grid grid-cols-2 md:grid-cols-4 gap-6">
    <!--@start(product_list)--->
    <div class="group cursor-pointer">
        <a href="{$link_product_detail}">
            <div class="aspect-[3/4] bg-gray-100 overflow-hidden mb-3">
                <img src="{$image_medium}" alt="{$product_name}"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform">
            </div>
            <p class="text-[10px] text-gray-400 uppercase">{$category_name}</p>
            <h3 class="text-sm font-bold truncate">{$product_name}</h3>
            <p class="text-sm font-medium mt-1">{$product_price}</p>
        </a>
    </div>
    <!--@end(product_list)--->
</div>
```

### 상품 상세 (detail.html)
```html
<h1 class="text-2xl font-bold">{$product_name}</h1>
<p class="text-xl font-bold">{$product_price}</p>
<div>{$product_description}</div>

<!-- 옵션 선택 -->
{$product_option}

<!-- 장바구니/구매 버튼 -->
<a href="#" onclick="{$action_basket}">장바구니</a>
<a href="#" onclick="{$action_buy}">바로 구매</a>
```

---

## 5. 분리 호스팅이 필요한 기능

아래 기능은 Cafe24에서 직접 지원하지 않으므로 **별도 서버**에서 운영합니다.

### 5-1. AI Design Lab (커스텀 디자인)
- **호스팅**: Vercel 또는 AWS
- **파일**: `custom.html`, `custom_2d.html`, `custom_mockup.html`
- **서버**: `server/` 디렉토리 전체
- **연결**: Cafe24 메뉴에서 외부 링크로 연결
  ```html
  <a href="https://lab.stiz.co.kr/custom.html">Design Lab</a>
  ```

### 5-2. AI 챗봇
- `js/chatbot.js`를 Cafe24 스킨의 `js/` 폴더에 업로드
- Cafe24 `layout/footer.html`에서 스크립트 로드
- 상품 데이터는 Cafe24 API로 교체 필요

---

## 6. PG 결제 설정 (Cafe24)

Cafe24는 자체 PG 연동을 지원합니다:

1. **Cafe24 관리자** → 결제 설정 → PG사 선택
2. 지원 PG: 이니시스, KCP, 토스페이먼츠, 카카오페이, 네이버페이
3. 현재 PortOne 코드는 **Design Lab 별도 서버**에서만 사용
4. Cafe24 본 쇼핑몰 결제는 Cafe24 내장 모듈 사용

---

## 7. 이전 순서

### Step 1: 기본 스킨 세팅 (1주)
- [ ] Cafe24 쇼핑몰 개설
- [ ] 스마트 디자인 모드 활성화
- [ ] 기본 레이아웃 (header/footer) 적용
- [ ] Tailwind CSS CDN 추가
- [ ] 커스텀 폰트 (Pretendard) 설정

### Step 2: 상품 등록 (1주)
- [ ] 카테고리 생성 (Soccer, Basketball, Volleyball, Sportswear, KOGAS MD)
- [ ] 상품 30개+ 등록 (이름, 가격, 이미지, 옵션)
- [ ] 상품 상세 페이지 HTML 에디터로 설명 입력

### Step 3: 디자인 적용 (2주)
- [ ] 메인 페이지 스킨 작업
- [ ] 상품 목록/상세 스킨 작업
- [ ] 장바구니/주문 스킨 작업
- [ ] 회원/마이페이지 스킨 작업
- [ ] 모바일 반응형 확인

### Step 4: 기능 연동 (1주)
- [ ] PG 결제 설정 및 테스트
- [ ] 배송 정책 설정 (5만원 이상 무료배송)
- [ ] 카카오페이/네이버페이 설정
- [ ] Design Lab 외부 서버 배포 (Vercel)
- [ ] AI 챗봇 스크립트 적용

### Step 5: 런칭 (1주)
- [ ] 도메인 연결 (stiz.co.kr)
- [ ] SSL 인증서 확인
- [ ] GA4 / 네이버 애널리틱스 설정
- [ ] 테스트 주문 → 환불 → 전체 플로우 검증
- [ ] 공식 오픈

---

## 8. 도메인 및 인프라

| 항목 | 설정 |
|------|------|
| 메인 도메인 | `stiz.co.kr` → Cafe24 |
| 서브 도메인 | `lab.stiz.co.kr` → Design Lab 서버 |
| SSL | Cafe24 자동 (메인), Let's Encrypt (서브) |
| CDN | Cafe24 자체 CDN |
| 이미지 | Cafe24 이미지 호스팅 |

---

## 9. 체크리스트

- [ ] Cafe24 사업자 등록 완료
- [ ] 통신판매업 신고 완료
- [ ] 개인정보처리방침 페이지 작성
- [ ] 이용약관 페이지 작성
- [ ] 반품/교환 정책 페이지 작성
- [ ] 사업자 정보 표시 (footer)
- [ ] 에스크로 가입 (전자상거래법)
