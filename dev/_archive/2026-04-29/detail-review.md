# STIZ UI 디테일 리뷰 보고서

> 리뷰 일시: 2026-04-06 | 리뷰어: reviewer (Claude)
> 대상: 고객 쇼핑몰 프론트 전체 (HTML 15+ / JS 10+)

---

## 1. 텍스트/문구 (영어 잔재)

### 필수 수정 - title 태그 한글화

| 파일 | 현재 | 수정 제안 |
|------|------|----------|
| index.html:7 | `STIZ - Make Your Team Identity` | `STIZ - 팀의 정체성을 만드세요` |
| detail.html:7 | `STIZ - Product Detail` | `STIZ - 상품 상세` |
| login.html:8 | `STIZ - Login` | `STIZ - 로그인` |
| join.html:8 | `STIZ - Sign Up` | `STIZ - 회원가입` |
| myshop.html:8 | `STIZ - My Page` | `STIZ - 마이페이지` |
| notice.html:8 | `STIZ - Notice` | `STIZ - 공지사항` |
| inquiry.html:8 | `STIZ - Inquiry` | `STIZ - 1:1 문의` |
| community.html:7 | `STIZ - Community` | `STIZ - 커뮤니티` |
| lookbook.html:8 | `STIZ - Portfolio` | `STIZ - 포트폴리오` |
| order_result.html:8 | `STIZ - Order Complete` | `STIZ - 주문 완료` |
| custom.html:8 | `STIZ Design Lab` | `STIZ - 디자인 랩` |
| custom_2d.html | `STIZ - 2D Design Lab` | `STIZ - 2D 디자인 랩` |
| custom_3d.html | `STIZ - 3D Design Lab` | `STIZ - 3D 디자인 랩` |
| custom_mockup.html | `STIZ - Mockup Viewer` | `STIZ - 목업 뷰어` |
| list.html:8 | `STIZ - Team Wear & Sportswear` | `STIZ - 팀웨어 & 스포츠웨어` |

### 필수 수정 - meta description 한글화

| 파일:행 | 현재 | 수정 제안 |
|---------|------|----------|
| index.html:8 | `Professional custom teamwear and sportswear...` (영어) | `STIZ - 프로 커스텀 팀웨어 & 스포츠웨어. AI 기반 디자인 툴로 팀의 정체성을 만드세요.` |
| index.html:10 | `Professional Custom Teamwear & Design Lab...` (영어) | `프로 커스텀 팀웨어 & 디자인 랩. AI 기반 유니폼 디자인.` |
| index.html:57 | JSON-LD description 영어 | `프로 커스텀 팀웨어 & 스포츠웨어 디자인` |

### 필수 수정 - 본문 영어 잔재

| 파일:행 | 현재 | 수정 제안 |
|---------|------|----------|
| cart.html:49 | 브레드크럼 `HOME` | `홈` |
| cart.html:51 | 브레드크럼 `SHOP` | `쇼핑` |
| checkout.html:70 | 브레드크럼 `HOME` | `홈` |
| notice.html:68 | `Total 0 posts` | `전체 0건` |
| inquiry.html:57 | `Total 0 posts` | `전체 0건` |
| index.html:9 | og:title `STIZ - Make Your Team Identity` | `STIZ - 팀의 정체성을 만드세요` |
| login.html:11 | og:title `STIZ Login` | `STIZ - 로그인` |
| join.html:11 | og:title `STIZ Sign Up` | `STIZ - 회원가입` |
| myshop.html:11 | og:title `STIZ My Page` | `STIZ - 마이페이지` |
| notice.html:11 | og:title `STIZ Notice` | `STIZ - 공지사항` |
| inquiry.html:11 | og:title `STIZ Inquiry` | `STIZ - 1:1 문의` |
| community.html:10 | og:title `STIZ Community` | `STIZ - 커뮤니티` |
| lookbook.html:11 | og:title `STIZ Portfolio` | `STIZ - 포트폴리오` |
| order_result.html:11 | og:title `STIZ - Order Complete` | `STIZ - 주문 완료` |
| detail.html:10 | og:title `STIZ Product` | `STIZ - 상품 상세` |

---

## 2. 일관성 문제

### 필수 수정 - title 형식 통일

- about.html: `STIZ - 회사소개` (한글)
- cart.html: `STIZ SHOP - 장바구니` (SHOP 추가)
- checkout.html: `STIZ SHOP - 주문/결제` (SHOP 추가)
- 나머지: `STIZ - 영어`

**제안**: 모든 페이지를 `STIZ - 한글제목` 형식으로 통일

### 권장 수정 - 헤더 여백 중복

다음 파일에서 `<div class="h-20"></div>`가 2개 연속으로 들어가 있어 헤더 아래 여백이 과도함:
- login.html:43-44
- join.html:43-44
- myshop.html:80-81
- notice.html:46-47
- inquiry.html:46-47

about.html은 1개만 있어 정상. detail.html, list.html, cart.html, checkout.html도 1개만 있어 정상.

### 권장 수정 - 푸터 콘텐츠 불일치

| 위치 | 쇼핑 링크 | 고객지원 링크 |
|------|----------|-------------|
| index.html 인라인 푸터 | 축구/농구/배구/악세서리 (4개) | 자주묻는질문/문의하기/사이즈가이드/개인정보처리방침 (4개) |
| header_render.js 동적 푸터 | 축구/농구 (2개만) | 자주묻는질문/문의하기 (2개만) |

**제안**: 동적 푸터(header_render.js)에도 배구/악세서리, 사이즈가이드/개인정보처리방침 추가하여 일치시킬 것

---

## 3. 네비게이션 문제

### 필수 수정 - 잘못된 링크 대상

| 파일:행 | 링크 텍스트 | 현재 href | 올바른 href |
|---------|-----------|----------|------------|
| index.html:268 | 자주묻는질문 | notice.html | 별도 FAQ 페이지 또는 notice.html?type=faq |
| index.html:269 | 문의하기 | notice.html | inquiry.html |
| index.html:270 | 사이즈 가이드 | notice.html | 별도 가이드 페이지 (없으면 notice.html 허용) |
| index.html:271 | 개인정보처리방침 | notice.html | 별도 privacy 페이지 (없으면 notice.html 허용) |
| login.html:68 | 비밀번호 찾기 | notice.html | 비밀번호 찾기 기능 (없으면 inquiry.html로 안내) |

**최소 수정**: "문의하기" 링크만이라도 inquiry.html로 변경. 나머지는 해당 페이지가 없으니 notice.html 유지 가능하나, 사용자 혼란 우려.

### 권장 수정 - 뉴스레터 구독 버튼 미연결

- index.html 인라인 푸터: `subscribeNewsletter()` 함수 연결됨 (정상)
- header_render.js 동적 푸터 (383행): 구독 버튼에 onclick 핸들러 없음. 클릭해도 아무 동작 안 함.
- **제안**: 동적 푸터의 구독 버튼에도 같은 API 호출 로직 추가

---

## 4. 반응형 (모바일)

전반적으로 양호. 주요 패턴:
- `grid-cols-2 md:grid-cols-4` (상품 그리드)
- `flex-col sm:flex-row` (버튼 배치)
- `hidden md:block` (데스크톱 전용)
- 모바일 메뉴 (hamburger + 슬라이드) 구현됨

### 권장 수정
- list.html의 floating FAB (`w-48` 고정폭)이 모바일에서 화면 대비 좀 넓을 수 있음. `sm:w-48 w-40` 등으로 조절 권장.

---

## 5. 접근성

### 권장 수정

| 파일:행 | 문제 | 제안 |
|---------|------|------|
| lookbook.html:134 | 모달 이미지 `alt=""` (빈 alt) | JS에서 동적으로 채우는 것이면 OK, 아니면 의미있는 alt 추가 |
| header_render.js:240 | 검색 버튼에 aria-label 없음 | `aria-label="검색"` 추가 |
| header_render.js:261 | 모바일 메뉴 버튼에 aria-label 없음 | `aria-label="메뉴 열기"` 추가 |
| login.html:66 | "로그인 유지" 체크박스에 id 없어 label 연결 미흡 | `id="rememberMe"` + `for` 연결 |

---

## 6. JS 코드 품질

### 권장 수정 - console.log 잔류

| 파일:행 | 내용 | 비고 |
|---------|------|------|
| js/checkout.js:365 | `console.log('[checkout] 사용자가 결제를 취소했습니다.')` | console.warn으로 변경 권장 |
| js/custom_2d.js:821 | `console.log('[STIZ] Design Lab V3.0...')` | 제거 또는 조건부 로깅 |
| js/instagram-feed.js:167 | `console.log('[Instagram] API 미설정...')` | console.warn으로 변경 권장 |

참고: console.error/console.warn은 디버깅에 유용하므로 유지해도 무방. console.log만 정리 권장.

### 서버 코드 TODO 잔류 (참고)

| 파일:행 | 내용 |
|---------|------|
| server/routes/auth.js:481 | `// TODO: 카카오 인가코드로 액세스 토큰 발급` |
| server/routes/auth.js:511 | `// TODO: 네이버 인가코드로 액세스 토큰 발급` |

SNS 로그인이 미구현 상태이므로 TODO 자체는 정상. 버튼은 disabled 상태로 표시되어 UX 문제 없음.

---

## 7. 기타 발견 사항

### 권장 수정 - about.html 법적 상호 누락

- 회사 정보 테이블의 상호명이 `STIZ (스티즈)`로만 표시
- 법적 상호인 `소명엔비씨(주)`가 about.html 본문에 없음 (푸터에만 존재)
- 사업자 정보 표시 의무상 본문에도 `소명엔비씨(주)` 병기 권장

### 참고 - 이미지 최적화

- index.html 카테고리 섹션: Unsplash 외부 이미지 4장 직접 링크
- 프로덕션 배포 시 로컬 이미지로 교체 필요 (CDN 의존성 제거)
- hero_bg.jpg preload 적용은 잘 되어 있음

---

## 우선순위 요약

### 필수 수정 (5건)
1. **index.html meta description/og:description 한글화** (SEO 직접 영향)
2. **title 태그 15개 한글화** (SEO + 브라우저 탭 표시)
3. **cart/checkout 브레드크럼 한글화** + notice/inquiry "Total posts" 한글화
4. **index.html 고객지원 링크 정리** (문의하기 -> inquiry.html)
5. **og:title 태그 14개 한글화** (소셜 공유 시 노출)

### 권장 수정 (7건)
6. 헤더 여백 h-20 중복 제거 (5개 파일)
7. 동적 푸터 쇼핑/고객지원 링크 일치시키기
8. 동적 푸터 뉴스레터 구독 onclick 연결
9. console.log 3건 정리
10. about.html 상호명 소명엔비씨(주) 병기
11. 접근성: aria-label 추가 (검색/메뉴 버튼)
12. login.html 비밀번호 찾기 링크 개선
