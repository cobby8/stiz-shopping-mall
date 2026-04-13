# STIZ UI 전수조사 보고서

> 점검일: 2026-04-06 | 점검자: tester | 서버: localhost:4000
> 전체 상품: 373개 (기성품 318, 커스텀 55) | 카테고리: 10개 (3개 비어있음)

---

## Critical (사용 불가)

### C-1. 메인 페이지(index.html) 상담후결제 상품이 "0원"으로 표시됨
- **위치**: index.html > BEST SELLERS / NEW ARRIVALS 섹션
- **원인**: `GET /api/products/featured` API의 SQL에 `isConsultPrice` 컬럼이 SELECT 목록에 빠져있음
- **현상**: `isConsultPrice=1`인 상품(가격 0원)이 "0원"으로 표시됨. "상담 후 결제" 배지가 아닌 `₩0`으로 보임
- **영향**: 고객이 모든 상품을 무료로 오해할 수 있음 (현재 대다수 상품이 isConsultPrice=1)
- **서버 파일**: `server/routes/products.js` GET /products/featured 라우트의 newest, recommended SQL 쿼리에 `p.isConsultPrice` 추가 필요
- **프론트**: `index.html` renderFeaturedGrid() 함수에서 isConsultPrice 분기 처리 추가 필요

### C-2. admin-products.html 상품 등록/수정 모달에 이미지 업로드 영역 없음
- **위치**: admin-products.html > 상품 등록/수정 모달 (id=modal-product)
- **현상**: 모달에 기본 정보(타입/카테고리/상품명/가격/사이즈 등)만 있고, 상품 이미지 업로드 영역이 전혀 없음
- **영향**: 관리자가 새 상품을 등록할 때 이미지를 첨부할 수 없음. 현재 상품 이미지는 카페24 스크래핑으로만 등록 가능
- **필요**: 모달 내 이미지 업로드 드래그앤드롭 영역 + 다중 이미지 업로드 + 대표이미지 선택 기능

---

## Warning (기능 이상)

### W-1. cart.html에 footer, chatbot.js, main.js가 누락됨
- **위치**: cart.html
- **현상**: `<footer>` 태그 자체가 없음. chatbot.js, main.js도 로드하지 않음
- **영향**: 장바구니 페이지에서 푸터가 보이지 않고, 챗봇 위젯도 없음. 다른 고객 페이지(index, list, detail)와 UX 불일치
- **비교**: checkout.html도 동일하게 footer/chatbot/main.js 없음

### W-2. 모든 고객 페이지에 h-20 스페이서가 2개 (총 160px 여백)
- **위치**: list.html, detail.html, cart.html, checkout.html, order-track.html
- **현상**: `<header></header>` 아래에 `<div class="h-20"></div>` 2개가 연속으로 있어 총 160px(약 10rem)의 상단 여백 발생
- **영향**: 헤더와 컨텐츠 사이에 과도한 빈 공간. index.html은 히어로 섹션이라 문제 없지만, 목록/상세 등에서는 빈 공간이 눈에 띔
- **확인 필요**: header_render.js가 주입하는 헤더의 실제 높이가 80px(h-20) 이상인지 확인 후, 스페이서를 1개로 줄이거나 CSS로 처리

### W-3. index.html 카테고리 카드 링크에 구 slug 사용 (sportswear, kogas)
- **위치**: index.html > WHAT WE OFFER 섹션 > Card 2, Card 3
- **현상**: 
  - Card 2: `list.html?category=sportswear` -> LEGACY_SLUG_MAP에서 `teamwear`로 매핑됨 (정상 동작하지만 불일치)
  - Card 3: `list.html?category=kogas` -> LEGACY_SLUG_MAP에서 `md-picks`로 매핑됨 (md-picks 카테고리는 현재 상품 0개!)
- **영향**: KOGAS MD 카드를 클릭하면 빈 목록이 보임

### W-4. basket.html (구 장바구니)과 order.html (구 주문페이지)이 여전히 존재
- **위치**: basket.html, order.html
- **현상**: 
  - 새 장바구니: cart.html (cart-page.js), 새 주문: checkout.html (checkout.js)
  - 구 장바구니 basket.html + 구 주문 order.html이 여전히 파일로 존재
  - order.html 내부에서 `basket.html`로 리다이렉트하는 코드 잔존 (209행)
- **영향**: 직접적 영향은 없으나, 혼동 가능. 사용자가 실수로 구 URL에 접속할 수 있음

### W-5. 5개 구 페이지에서 product-data.js 여전히 로드
- **위치**: basket.html, custom.html, custom_2d.html, custom_3d.html, custom_mockup.html, lookbook.html, order_result.html
- **현상**: `<script src="js/product-data.js" defer></script>` 태그가 남아있음
- **영향**: product-data.js 파일이 존재하면 불필요한 616줄 JS가 로드됨. 삭제되었으면 404 에러 발생. 현재 파일이 존재하므로 불필요한 리소스 로딩

### W-6. index.html 푸터 저작권 연도가 "2024"
- **위치**: index.html 하단 푸터 289행, header_render.js renderFooter() 369행
- **현상**: `© 2024 STIZ Custom Teamwear` -- 현재 2026년
- **영향**: 사이트 관리 소홀 인상

### W-7. 빈 카테고리 3개가 네비게이션에서 숨겨지지만 푸터에 하드코딩
- **위치**: index.html 푸터, header_render.js 정적 메뉴
- **현상**: 컴프레션(104), MD제품(108), 시즌오프(109) 카테고리에 상품이 0개
- **영향**: 헤더 네비는 API 기반으로 자동 숨김 처리되지만, index.html 푸터의 SHOP 링크(Soccer, Basketball, Volleyball, Accessories)는 하드코딩되어 카테고리 변경 시 동기화 안 됨

---

## Info (개선 권장)

### I-1. index.html WHAT WE OFFER 카테고리 이미지가 Unsplash 외부 이미지
- **위치**: index.html > WHAT WE OFFER 섹션 (4개 카드)
- **현상**: 모두 `images.unsplash.com` URL 사용. 실제 STIZ 상품 이미지가 아닌 스톡 이미지
- **영향**: 전문성 인상 저하. 자체 촬영 이미지로 교체 권장

### I-2. 뉴스레터 JOIN 버튼 미동작
- **위치**: index.html 푸터 > NEWSLETTER, header_render.js renderFooter()
- **현상**: 이메일 입력 + JOIN 버튼이 있지만 클릭 시 아무 동작 없음 (이벤트 핸들러 없음)
- **영향**: 고객이 뉴스레터 구독 시도 시 혼란

### I-3. custom.html, custom_2d.html 등 디자인 랩 페이지가 legacy 상태
- **위치**: custom.html, custom_2d.html, custom_3d.html, custom_mockup.html
- **현상**: 이 페이지들은 Phase E 이전의 구 구조. 헤더 네비의 TEAMWEAR > 커스텀 디자인 랩 링크가 custom.html로 연결
- **영향**: 현재 커스텀 주문은 detail.html에서 inline으로 처리 (D-73). 디자인 랩 페이지의 역할이 모호해짐

### I-4. 검색 placeholder가 영어 ("Search products...")
- **위치**: header_render.js > initSearchUI() > search-input
- **현상**: 한국어 사이트인데 검색 입력란 placeholder가 "Search products..."로 영문
- **영향**: UX 일관성

### I-5. order-track.html에 product-data.js 미포함 (검색 동작 확인 필요)
- **위치**: order-track.html
- **현상**: 이 페이지의 검색은 이제 API 기반이므로 product-data.js가 없어도 정상. 다만 cart.js를 로드하는데 장바구니 기능이 이 페이지에서 필요한지 불명확

### I-6. 관리자 리다이렉트 페이지 4개 (admin-design/cs/production/shipping)
- **위치**: admin-design.html, admin-cs.html, admin-production.html, admin-shipping.html
- **현상**: 모두 admin.html?view=xxx로 즉시 리다이렉트. 정상 동작 확인됨
- **영향**: 없음 (정상). 파트별 북마크 호환용으로 의도된 구조

---

## 정상 확인된 페이지

### 고객용 페이지
| 페이지 | HTTP | 스크립트 | API | 비고 |
|--------|------|---------|-----|------|
| index.html | 200 OK | 정상 로드 | /api/products/featured 200 OK | C-1 가격 표시 버그 |
| list.html | 200 OK | list.js 정상 | /api/products, /api/products/categories 200 OK | 카테고리 탭/서브탭/정렬/더보기 정상 |
| detail.html | 200 OK | detail.js 정상 | /api/products/:id 200 OK | 이미지갤러리/사이즈/수량/커스텀패널 정상 |
| cart.html | 200 OK | cart-page.js 정상 | localStorage 기반 | W-1 footer 없음 |
| checkout.html | 200 OK | checkout.js 정상 | POST /api/orders 200 OK | 입력검증/계좌정보 정상 |
| order-track.html | 200 OK | order-track.js 정상 | GET /api/orders/track 정상 | 주문추적 UI 정상 |
| order-custom.html | 200 OK | - | - | list.html?type=custom으로 리다이렉트 (정상) |

### 관리자 페이지
| 페이지 | HTTP | 스크립트 | 인증 | 비고 |
|--------|------|---------|------|------|
| admin-login.html | 200 OK | inline JS | POST /api/auth/login | 로그인폼/비밀번호토글 정상 |
| admin-home.html | 200 OK | admin-home.js | 인증 필요 | KPI/파트현황/납기임박 |
| admin.html | 200 OK | admin.js | 인증 필요 | 주문목록/상태탭/필터/CSV |
| admin-order.html | 200 OK | admin-order.js | 인증 필요 | 주문상세편집 |
| admin-products.html | 200 OK | admin-products.js | 인증 필요 | C-2 이미지업로드 없음 |
| admin-catalog.html | 200 OK | admin-catalog.js | 인증 필요 | 7탭(종목/품목/등급 등) |
| admin-analytics.html | 200 OK | admin-analytics.js | 인증 필요 | 매출분석 |
| admin-customers.html | 200 OK | admin-customers.js | 인증 필요 | 고객관리 |
| admin-calendar.html | 200 OK | admin-calendar.js | 인증 필요 | 일정표 |
| admin-settings.html | 200 OK | admin-settings.js | 인증 필요 | 계정관리 |

### 공통 점검 결과
| 점검 항목 | 결과 |
|-----------|------|
| 모든 페이지 200 OK 반환 | PASS (19/19 페이지) |
| JS 파일 문법 오류 (node --check) | PASS (31개 파일 전부 통과) |
| 하드코딩된 localhost:4000 | PASS (코드에 없음, 주석만 존재) |
| product-data.js 활성 참조 | WARN (7개 구 페이지에 잔존, 신규 페이지는 제거됨) |
| 히어로 이미지/로고 파일 존재 | PASS |
| 상품 이미지 HTTP 서빙 | PASS (uploads/ 경로 정상) |
| 네비게이션 링크 일관성 | PASS (헤더 API 동적 생성, 카테고리 slug 정상) |

---

## 종합 통계

| 등급 | 건수 |
|------|------|
| Critical | 2건 |
| Warning | 7건 |
| Info | 6건 |
| 정상 | 19/19 페이지 HTTP 200 |

**우선 수정 권장 순서**:
1. C-1: featured API에 isConsultPrice 추가 + index.html 가격 표시 분기 (고객 직접 노출)
2. C-2: admin-products 모달에 이미지 업로드 영역 추가 (관리자 핵심 기능)
3. W-1: cart.html/checkout.html에 footer + chatbot 추가
4. W-3: index.html KOGAS 카드 링크 수정 또는 카드 교체
5. W-6: 저작권 연도 2024 -> 2026 업데이트
