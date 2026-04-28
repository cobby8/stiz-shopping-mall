# STIZ 챗봇 전면 리뉴얼 기획설계 보고서

- 작성자: planner-architect
- 작성일: 2026-04-14
- 상태: 계획 수립 완료 (코드 미수정)
- 대상 파일: `js/chatbot.js`, `server/routes/ai.js`, 전 HTML 페이지 공통

---

## 0. 한 줄 요약 (바이브 코더용 비유)

> 지금 챗봇은 "메모장에 미리 적어둔 답만 읽어주는 자동응답기" 수준이고,
> 리뉴얼 후 챗봇은 "쇼핑몰 DB를 실시간으로 열어보고, 헷갈리면 AI한테 물어본 뒤 답해주는 매장 직원"이 됩니다.

---

## 1. 현재 상태 진단

### 1-1. chatbot.js 실태 (419줄)
- 초기화 + 말풍선 렌더링 + 규칙 기반 IF문 10개 + Gemini fallback — **모두 한 파일에 뭉쳐 있음**
- product-data.js(삭제된 레거시)에 **3개 함수 의존**:
  - `getBestSellers()` — line 263
  - `getNewArrivals()` — line 278
  - `getProductsByCategory()` — line 301
  - `typeof xxx === 'function'` 가드로 에러는 안 나지만, **인기/신상/카테고리 응답이 전부 빈 껍데기** (fallback 메시지만 나감)
- `/api/chat` Gemini fallback은 있으나, **대화 히스토리 미전송** (한 턴 한 턴 독립), **상품 실시간 데이터 미주입** (하드코딩된 시스템 프롬프트만)
- 사이즈표, 가격, 배송비 등 **FAQ 내용이 코드 상수로 박혀 있음** — 관리자 수정 불가
- UI는 **Tailwind + 커스텀 div**로 구성 (Material Symbols 미사용) — conventions 위반

### 1-2. 로드되는 페이지
19개 HTML 전부 (about, bulk-order, cart, checkout, community, custom*, index, inquiry, join, list, login, lookbook, myshop, notice, order-track, order_result)

### 1-3. 서버 `/api/chat` 실태 (ai.js)
- Gemini 2.5-flash 연동 완료
- 시스템 프롬프트에 회사 개요만 박아둠 — **실제 DB 상품/가격 미반영** (하드코딩 범위와 실제 DB가 어긋날 위험)
- history는 파라미터로 받지만 **사용 안 함** (대화 맥락 상실)
- 에러 시 200 + 폴백 메시지 (UX는 OK)

### 1-4. 연동 가능한 기존 API (조사 결과)
| API | 용도 | 챗봇 활용 |
|-----|------|----------|
| GET /api/products | 상품 목록 (정렬/필터) | 카테고리/신상/베스트 추천 |
| GET /api/products/categories | 카테고리 목록 | 카테고리 탐색 칩 |
| GET /api/products/featured | 피처드 상품 | "인기 상품" 응답 |
| GET /api/products/:id | 상품 상세 | 카드 렌더링 |
| GET /api/board?type=notice | 공지사항 | "이벤트" 질문 대응 |
| POST /api/board (requireAuth) | 문의 등록 | "상담원 연결" → 1:1 문의 전환 |
| GET /api/auth/me/orders (requireAuth) | 내 주문 | 로그인 시 "내 주문 조회" |
| GET /api/orders/track/:orderNumber | 주문 추적 | 주문번호 기반 조회 |
| GET /api/coupons/check | 쿠폰 확인 | "쿠폰 있나요?" 대응 |
| POST /api/chat (Gemini) | AI 폴백 | 자연어 질문 |

### 1-5. 프로젝트 컨벤션 체크
- **아이콘**: Material Symbols Outlined 필수 (C-2) — 현재 챗봇은 inline SVG 사용 → 위반
- **색상**: `var(--color-*)` CSS 변수 필수 (C-1) — 현재 `bg-black`, `bg-red-500` 하드코딩 → Tailwind 사용 중이라 일부 허용 범위이나 customer-facing 위젯은 CSS 변수 권장
- **바닐라 JS + ES6**, DOMContentLoaded 초기화 (C-4) — 현재 준수

---

## 2. A. 리뉴얼 컨셉

### 2-1. 문제점 진단 (3줄)
1. 상품 데이터가 끊겨서 추천이 빈 껍데기
2. FAQ가 코드에 박혀 있어 관리자가 못 고침
3. AI 폴백은 있으나 대화 맥락/실시간 데이터를 못 참조해서 "뜬구름" 답변

### 2-2. 새 챗봇 포지셔닝
**"구매 전 상담 + 주문 후 추적 + 모르면 상담원 연결"** 하이브리드

- 단순 Q&A ❌ → 리뉴얼 핵심이 아님
- 구매 도우미 ✅ (1차 목표) — 카테고리/사이즈/상품 추천
- 견적 상담 △ (2차) — Design Lab/커스텀 문의로 연결 (견적 자동 계산은 Out of Scope, custom.html로 유도)
- 주문 추적 ✅ (로그인 연동 + 주문번호 조회)
- 상담원 연결 ✅ (카톡/전화/1:1문의 전환)

### 2-3. UX 방향: **하이브리드 (버튼 우선 + 자연어 보조)**
- 첫 화면: 의도 분류 칩 6개 제시 (인기/신상/커스텀/배송/주문조회/상담원)
- 사용자가 칩 클릭 → 즉시 정확한 응답
- 자유 입력 → 키워드 매칭 후 폴백 시에만 Gemini 호출 (비용/속도 관리)
- 긴 응답은 **카드형**(상품, 주문 등) + **불릿형**(FAQ) 구분

**비유**: 쇼핑몰 1층 안내데스크 직원. 손님이 "저기요" 하면 먼저 "뭐 찾으세요?" 하고 버튼 메뉴판 보여줌. 자세한 건 눈으로 찾아서 데려다줌. 정말 모르면 "잠시만요, 본사에 물어볼게요"(Gemini).

---

## 3. B. 기능 범위 (MVP → 확장)

| # | 기능 | 우선순위 | 난이도 | MVP/확장 |
|---|------|---------|--------|---------|
| 1 | 상품 검색/추천 (카테고리·가격대) | P0 | 중 | MVP |
| 2 | 카테고리 탐색 (축구/농구/배구/야구) | P0 | 하 | MVP |
| 3 | 베스트/신상 (실제 API 연동) | P0 | 하 | MVP |
| 4 | 사이즈 추천표 (정적) | P0 | 하 | MVP |
| 5 | 배송/결제/교환환불 FAQ | P0 | 하 | MVP |
| 6 | 커스텀 주문 상담 (시안 요청 유도) | P0 | 하 | MVP |
| 7 | Gemini AI 자연어 폴백 | P0 | 중 | MVP |
| 8 | 상담원 연결 (카톡/전화/1:1문의) | P0 | 하 | MVP |
| 9 | 주문 조회 (비로그인: 주문번호+연락처) | P1 | 중 | 확장1 |
| 10 | 내 주문 조회 (로그인 연동) | P1 | 중 | 확장1 |
| 11 | 쿠폰 코드 확인 | P1 | 하 | 확장1 |
| 12 | 공지사항 (이벤트/이슈) 실시간 조회 | P1 | 하 | 확장1 |
| 13 | 대화 히스토리(세션) AI에 주입 | P1 | 중 | 확장1 |
| 14 | 사이즈 추천 AI 질문(키/몸무게→S/M/L) | P2 | 중 | 확장2 |
| 15 | 상품 상세에서 챗봇 자동 오픈(컨텍스트 주입) | P2 | 중 | 확장2 |
| 16 | 관리자 FAQ 편집 페이지 | P2 | 상 | 확장2 |
| 17 | 챗봇 대화 로그 분석(의도 top10) | P2 | 상 | 확장2 |

---

## 4. C. 아키텍처

### 4-1. 클라이언트 구조 (chatbot.js 분할)
한 파일에 뭉친 419줄을 **6개 책임**으로 논리 분리합니다. 파일은 1개로 유지하되, 섹션 주석으로 구분합니다 (바이브 코더 친화적).

**비유**: 한 방에 침대·책상·부엌을 몰아둔 원룸을 → 같은 집이지만 구역을 명확히 나눈 느낌.

```
js/chatbot.js (예상 550~700줄, 섹션 구조)
├─ [UI] 위젯 생성 (버튼/창/말풍선 템플릿)
├─ [STATE] 대화 세션 (messages 배열, 사용자 컨텍스트)
├─ [INTENT] 의도 분류 (키워드 → intent 태그)
├─ [HANDLERS] intent별 응답 함수 (products/faq/order/etc)
├─ [API] 서버 fetch 래퍼 (products, orders, chat)
└─ [BOOT] DOMContentLoaded 초기화
```

### 4-2. 서버 구조 (/api/chat 확장)
`server/routes/ai.js`의 `/chat`을 **의도 분류 + 컨텍스트 주입 + Gemini 호출** 3단계로 확장합니다.

**비유**: "그냥 AI한테 떠넘기던 텔레마케터"를 → "질문 유형 파악 → 필요한 자료(상품 DB) 찾아서 → AI에 딱 맞게 넘기는 중개자"로.

새 엔드포인트 구조:
- `POST /api/chat` (기존, 시그니처 유지)
  - 입력: `{ message, history, context? }`
  - 처리: 의도 분류(lightweight) → 의도별로 DB에서 상품/공지 주입 → Gemini에 시스템 프롬프트 + history + 주입 컨텍스트 전달
  - 출력: `{ reply, source, intent?, cards?: [] }` (cards가 있으면 프론트가 상품 카드로 렌더)

### 4-3. 데이터 흐름 다이어그램 (텍스트)

```
[사용자 입력]
    ↓
[chatbot.js: INTENT 분류]
    ├─ 명확한 의도(카테고리/FAQ) → [HANDLERS] 직접 API 호출 → 즉시 응답
    │      └─ GET /api/products?category=soccer
    │      └─ GET /api/products/featured
    │      └─ GET /api/board?type=notice
    │      └─ GET /api/auth/me/orders (로그인 시)
    │
    └─ 불명확 → POST /api/chat (message + history)
                   ↓
              [서버 ai.js]
                   ├─ 의도 추정(간이 키워드)
                   ├─ DB 컨텍스트 주입(상품 5~10건 요약)
                   └─ Gemini 호출 → reply
                   ↓
              [프론트 렌더] (텍스트 + 선택적 cards)
```

### 4-4. product-data.js 완전 제거 전략
1. chatbot.js line 263/278/301의 `typeof getBestSellers === 'function'` 가드 블록 3곳을 **API 호출로 교체**
   - `getBestSellers(2)` → `fetch('/api/products/featured').then(r => r.json()).slice(0,2)`
   - `getNewArrivals(2)` → `fetch('/api/products?sort=new&limit=2')`
   - `getProductsByCategory(catKey)` → `fetch('/api/products?category=' + catKey + '&limit=2')`
2. 교체 후 product-data.js 자체는 이미 삭제 대상(tester 보고서). chatbot.js의 마지막 의존점이 사라지면 **레거시 완전 제거** 가능.

---

## 5. D. UI 설계

### 5-1. 위젯 위치/크기/색상
| 요소 | 현재 | 리뉴얼 |
|------|------|--------|
| 챗 버튼 위치 | `fixed bottom-8 right-6` 또는 `floating-fab` 컨테이너 | 동일 유지 (익숙함 유지) |
| 버튼 색상 | `bg-black text-white` + 빨간 핑 뱃지 | 동일 유지 |
| 창 크기 (모바일) | `w-[calc(100vw-2rem)] h-[70vh]` | 동일 유지 |
| 창 크기 (데스크탑) | `w-96 h-[500px]` | **w-[380px] h-[600px]** (카드 2장 + 입력창 여유) |
| 헤더 | 검정 바 + 상태 점 | 동일 + **"STIZ 상담사"** → **"STIZ 안내봇"** (AI 남용 방지) |

### 5-2. 말풍선 디자인
- 봇 아바타: 현재 "AI" 텍스트 원형 → **Material Symbols `support_agent` 아이콘** (C-2 준수)
- 말풍선 모서리: 현재 `rounded-r-lg rounded-bl-lg` 유지
- CSS 변수 도입: `var(--color-primary)`, `var(--color-bg-subtle)` 적용 (C-1 준수)

### 5-3. 빠른 응답 칩 (Quick Reply)
- **1차 칩 (초기 화면)**: 6개
  - 인기 상품 / 신상품 / 커스텀 제작 / 배송·교환 / 주문 조회 / 상담원 연결
- **2차 칩 (응답 내 후속)**: 상황별 2~3개
  - 예: "배송 안내" 응답 후 → [교환환불] [주문조회]
- 칩 스타일: `rounded-full px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200`

### 5-4. 상품 카드 렌더링
현재 `renderProductCard` 구조 유지하되 다음 개선:
- 가격 앞 아이콘: `<span class="material-symbols-outlined">sell</span>` (C-2)
- 이미지 onError 시 placeholder: 현재 `display:none` → **회색 박스 + 카테고리 텍스트** fallback
- CTA 버튼: "View Product" → **"상품 보기"** (한글화)

---

## 6. E. 구현 단계 (Phase)

### Phase 1 — MVP 리뉴얼 (P0 전체)
**목표**: product-data.js 의존 제거 + 실제 API 연동 + UI 컨벤션 준수

| 순서 | 작업 | 담당 | 선행 조건 | 예상 |
|------|------|------|----------|------|
| 1 | chatbot.js 섹션 재구성 (UI/STATE/INTENT/HANDLERS/API/BOOT) | developer | 없음 | 40분 |
| 2 | 3개 함수를 fetch로 교체 (featured/new/category) | developer | 1 | 30분 |
| 3 | 초기 칩 6개 + 2차 칩 구조 | developer | 1 | 20분 |
| 4 | Material Symbols 아이콘 적용 + 한글 버튼 | developer | 1 | 15분 |
| 5 | 서버 /api/chat에 history 주입 + 상품 컨텍스트 요약 주입 | developer | 1 | 30분 |
| 6 | tester (브라우저 실제 동작) + reviewer (코드 품질) 병렬 | tester, reviewer | 2~5 | 20분 |

**변경 파일**:
- `js/chatbot.js` (대폭 수정)
- `server/routes/ai.js` (/chat 핸들러 확장)
- 19개 HTML — **스크립트 로드 순서만 확인, 수정 없음**

**완료 기준**:
- [ ] "인기 상품" 클릭 → 실제 DB 상품 2개 카드로 표시
- [ ] "농구" 입력 → basketball 카테고리 상품 2개 카드
- [ ] "배송비" 입력 → FAQ 응답
- [ ] "아무 말이나" 입력 → Gemini 응답 + 이전 2~3턴 맥락 반영
- [ ] Material Symbols 아이콘 정상 렌더
- [ ] product-data.js 참조 0건 (Grep 확인)

---

### Phase 2 — 확장1 (P1 기능)
**목표**: 주문 조회 · 쿠폰 · 공지 · 히스토리 고도화

| 순서 | 작업 | 담당 | 선행 조건 | 예상 |
|------|------|------|----------|------|
| 1 | 주문번호 + 연락처 조회 핸들러 (GET /api/orders/track) | developer | Phase 1 완료 | 30분 |
| 2 | 로그인 상태 감지 → "내 주문" 칩 노출 (GET /api/auth/me/orders) | developer | 1 | 25분 |
| 3 | "이벤트/공지" intent → GET /api/board?type=notice 최신 3건 | developer | 1 | 20분 |
| 4 | 쿠폰 코드 입력 → /api/coupons/check 호출 후 표시 | developer | 1 | 20분 |
| 5 | 세션 히스토리 localStorage 저장(최근 10턴) + /api/chat에 전송 | developer | 1 | 25분 |
| 6 | tester 실측 | tester | 1~5 | 15분 |

**변경 파일**: `js/chatbot.js` 단독 (서버 변경 최소)

**완료 기준**:
- [ ] 비로그인: "주문조회" 칩 → 주문번호 + 이름/연락처 입력 폼 → 결과 카드
- [ ] 로그인: "내 주문" 최신 3건 카드
- [ ] "이벤트" 입력 → 공지 최신 3건
- [ ] "STIZ10" 입력 → 쿠폰 검증 결과 메시지
- [ ] 새로고침 후에도 직전 대화 3턴 유지 (localStorage)

---

### Phase 3 — 확장2 (P2 기능, 선택적)
**목표**: 상세 컨텍스트 주입 + 관리자 FAQ CMS + 로그 분석

| 순서 | 작업 | 담당 | 예상 |
|------|------|------|------|
| 1 | detail.html에서 상품 ID → 챗봇 컨텍스트에 주입 ("이 상품 문의" 버튼) | developer | 40분 |
| 2 | 사이즈 추천 AI 질문 플로우 (키/몸무게 → Gemini 추천) | developer | 45분 |
| 3 | 관리자 FAQ 편집 페이지 (admin-faq.html + settings DB) | planner-architect → developer | 2시간+ |
| 4 | 챗봇 대화 로그 저장 + 일일 top10 intent 리포트 | developer | 1시간+ |

**완료 기준**: Phase 3는 사용자 피드백 본 후 선택 진행 권장.

---

## 7. F. 리스크 · 고려사항

### 7-1. Gemini API 비용
- gemini-2.5-flash 기준 입력 1M 토큰 당 약 $0.075 (2026년 시점 기준 추정).
- **대응**:
  - 키워드 매칭으로 1차 필터 → Gemini 호출 **20% 이하**로 억제
  - 시스템 프롬프트 길이 최소화 (현재 1.2KB → 800B 목표)
  - history는 **최근 4턴**만 전송 (압축)

### 7-2. 응답 속도
- Gemini 평균 1.5~3초 — 답답할 수 있음.
- **대응**: 타이핑 인디케이터 유지 + "답변 준비 중..." 보조 문구 + 3초 초과 시 "조금만 더 기다려주세요"

### 7-3. 오답/환각(Hallucination)
- AI가 없는 상품/가격을 지어낼 위험.
- **대응**:
  - 시스템 프롬프트에 **"확신 없는 상품/가격은 답하지 말고 custom.html로 유도"** 명시
  - 실시간 상품 목록을 컨텍스트로 주입해 "현재 판매 중인 것만"으로 범위 제한
  - 오답 1회당 비즈니스 리스크 큼 → 베타 기간 **AI 응답에 ⚠️ 뱃지**

### 7-4. 개인정보 처리
- 주문 조회 시 이름/연락처/주문번호 입력 — **Gemini에 전송 금지** (서버 /api/orders/track 직결).
- 대화 히스토리 localStorage 저장 — 개인정보 포함 가능성 → **이름/연락처 마스킹 후 저장**.

---

## 8. G. 결정 필요 사항 (사용자 확인 Q)

1. **Q1. 챗봇 이름/톤 확정**
   - 현재: "STIZ Assistant" / "AI 상담사"
   - 후보: ① "STIZ 안내봇" (AI 티 감춤) / ② "STIZ AI 상담사" (현행 유지) / ③ 기타?
2. **Q2. Phase 범위 결정**
   - Phase 1만? 아니면 Phase 1+2까지 묶어서?
3. **Q3. 주문 조회 포함 여부**
   - 비로그인 주문 조회는 개인정보 노출 리스크 있음. 마이페이지로만 유도 vs 챗봇에서도 허용?
4. **Q4. Gemini 호출 제한**
   - 비용 걱정되면 "하루 N회 이상 호출 시 FAQ로만 응답" 제한 둘지?
5. **Q5. 관리자 FAQ CMS (Phase 3)**
   - 지금 만들지, 아니면 코드에 당분간 박아두고 나중에 분리할지?
6. **Q6. CSS 변수 전면 도입**
   - 현재 Tailwind 하드코딩 색상을 CSS 변수로 바꿀지 (C-1 엄격 적용) vs 챗봇은 예외?
7. **Q7. 상품 카드 CTA**
   - "상품 보기" / "자세히" / "장바구니 담기" 중 어느 것을 메인 CTA로?

---

## 9. architecture.md / decisions.md 후보 항목 (제안만, 기록 X)

### architecture.md 후보
- **[A-14] 챗봇 리뉴얼 아키텍처 (2026-04-14)**
  - chatbot.js 6섹션 분할 (UI/STATE/INTENT/HANDLERS/API/BOOT)
  - product-data.js 의존 제거, 실제 REST API 연동
  - /api/chat 확장: 의도 분류 + 상품 컨텍스트 주입 + history 4턴

### decisions.md 후보
- **[D-N] 챗봇을 규칙+AI 하이브리드로 유지 결정**
  - 결정: 의도 칩 우선, 폴백만 Gemini
  - 이유: 비용 억제 + 응답 속도 + 환각 리스크
  - 대안: 풀 AI(모든 질문 Gemini) — 거부 (비용/속도/정확성)
- **[D-N+1] chatbot.js 단일 파일 유지 결정**
  - 결정: ES Module 분할 대신 섹션 주석으로 논리 분리
  - 이유: 프론트는 전역 스크립트 로드 방식(C-4), 번들러 없음, 바이브 코더 유지보수 용이

---

## 10. developer 주의사항 (Phase 1 구현 시)

- ⚠️ **HTML 19개 스크립트 로드 순서 확인**: chatbot.js는 `</body>` 직전 로드되는지 각 페이지 점검 (현재 일부만 로드)
- ⚠️ **product-data.js 제거 순서**: chatbot.js의 의존 3곳을 먼저 교체한 뒤, 별도 작업에서 파일 자체 삭제
- ⚠️ **Gemini API 키**: server/.env의 `GOOGLE_API_KEY` 존재 확인. 없으면 현재 fallback 메시지로 자동 대응됨
- ⚠️ **/api/products 응답 형식**: { products: [...] } vs [...] 중 실제 구조 확인 후 매핑
- ⚠️ **로그인 상태 감지**: js/auth.js의 전역 상태(localStorage.token)로 판별, window.currentUser 의존 금지
- ⚠️ **CSS 변수 적용**: Tailwind 내부 색상은 유지해도 되지만, 새로 추가하는 커스텀 스타일은 `var(--color-*)` 사용
- ⚠️ **메시지 XSS**: escapeHtml 현재 사용 중 — AI 응답은 HTML 허용 금지, 순수 텍스트만 렌더(현재 `escapeHtml(data.reply)` 유지)

---

끝.
