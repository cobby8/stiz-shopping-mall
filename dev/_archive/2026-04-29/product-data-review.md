# js/product-data.js 삭제 검토 보고서

**날짜**: 2026-04-15  
**조사자**: Claude Code  
**프로젝트**: STIZ 쇼핑몰 (C:\0. Programing\stizshop)

---

## 1. 파일 개요

### 현황
- **메인 브랜치**: `js/product-data.js` 파일 **존재하지 않음**
- **워크트리 옛 브랜치**: 4개 워크트리에서 찾음
  - `.claude/worktrees/adoring-rubin/js/product-data.js`
  - `.claude/worktrees/agent-aca63075/js/product-data.js`
  - `.claude/worktrees/agent-afce8737/js/product-data.js`
  - `.claude/worktrees/priceless-jang/js/product-data.js`

### 결론
메인 브랜치에서 이미 삭제 완료되었음. 추가 조사는 chatbot.js의 잔존 의존성 확인에 집중.

---

## 2. 참조 현황

### 2.1 HTML 파일 명시적 참조
**모든 메인 HTML 파일에서 주석으로 삭제 확인:**

```html
<!-- product-data.js 제거됨 — API 기반으로 전환 완료 -->
```

**확인된 파일:**
- index.html (줄 299)
- list.html (줄 98)
- custom.html
- custom_2d.html
- custom_3d.html
- custom_mockup.html
- detail.html
- lookbook.html
- order_result.html

**결론**: HTML 직접 참조 = **0건** (이전 tester 검증과 일치)

### 2.2 JavaScript 파일 참조 분석

#### 2.2.1 chatbot.js의 의존성
**파일**: `/c/0. Programing/stizshop/js/chatbot.js`

**함수 호출 3개 발견:**

| 줄 | 함수명 | 용도 | 상태 |
|---|---------|------|------|
| 263 | `getBestSellers(2)` | 인기상품 추천 | typeof 가드 있음 |
| 278 | `getNewArrivals(2)` | 신상품 추천 | typeof 가드 있음 |
| 301 | `getProductsByCategory(catKey)` | 카테고리별 상품 조회 | typeof 가드 있음 |

**코드 스니펫 (chatbot.js:263-273)**:
```javascript
// Best sellers / Popular
if (lower.includes('인기') || lower.includes('best') || lower.includes('추천') || ...) {
    if (typeof getBestSellers === 'function') {
        const best = getBestSellers(2);
        if (best.length > 0) {
            let cards = '<p class="mb-1"><strong>인기 상품 TOP 2</strong></p>';
            best.forEach(p => { cards += renderProductCard(p); });
            addBotMessage(cards);
            return;
        }
    }
    addBotMessage('인기 상품을 확인해보세요! <a href="list.html" class="underline font-bold">전체 상품 보기</a>');
    return;
}
```

**코드 스니펫 (chatbot.js:301-312)** - 카테고리 검색:
```javascript
if (typeof getProductsByCategory === 'function') {
    const items = getProductsByCategory(catKey).slice(0, 2);
    if (items.length > 0) {
        let cards = `<p class="mb-1"><strong>${label} 상품</strong></p>`;
        items.forEach(p => { cards += renderProductCard(p); });
        cards += `<a href="list.html?category=${catKey}" class="block mt-2 text-xs text-center text-gray-500 underline">더 보기 &rarr;</a>`;
        addBotMessage(cards);
        return;
    }
}
addBotMessage(`${label} 카테고리를 확인해보세요! <a href="list.html?category=${catKey}" class="underline font-bold">보기</a>`);
```

**Fallback 동작:**
- 함수가 정의되지 않으면 (typeof 검사 실패)
- 안내 링크만 표시 (상품 카드는 표시하지 않음)
- 기능 저하 발생 (타이핑 에러는 없음)

#### 2.2.2 다른 JS 파일 참조
**검색 결과:**
```
/c/0. Programing/stizshop/js/chatbot.js: * Integrates with product-data.js for recommendations.
/c/0. Programing/stizshop/js/chatbot.js:        if (typeof getNewArrivals === 'function') {
/c/0. Programing/stizshop/js/chatbot.js:            const newItems = getNewArrivals(2);
/c/0. Programing/stizshop/js/chatbot.js:        if (typeof getProductsByCategory === 'function') {
/c/0. Programing/stizshop/js/chatbot.js:            const items = getProductsByCategory(catKey).slice(0, 2);
/c/0. Programing/stizshop/js/chatbot.js:        if (typeof getBestSellers === 'function') {
/c/0. Programing/stizshop/js/chatbot.js:            const best = getBestSellers(2);
/c/0. Programing/stizshop/js/chatbot.js: * 서버의 Gemini 챗봇 API 호출
/c/0. Programing/stizshop/js/jersey-templates.js: // 전역 접근: product-data.js처럼 window 객체에 등록
```

**해석:**
- chatbot.js:1행 주석: "Integrates with product-data.js" (오래된 코멘트, 실제 의존은 함수만)
- jersey-templates.js: 언급만 있고 실제 import/호출 없음

---

## 3. chatbot.js 의존성 상세 분석

### 3.1 현재 구조
- **상태**: product-data.js 없어도 에러 발생 안 함 (typeof 가드)
- **영향**: 사용자가 채팅봇에서 다음 기능 호출 시 기능 저하
  - "인기상품" → 상품 카드 미표시, 링크만 표시
  - "신상품" → 상품 카드 미표시, 링크만 표시
  - "농구/축구/배구/야구" 카테고리 검색 → 상품 카드 미표시, 링크만 표시

### 3.2 Fallback API 분석
**현재 channelbot.js의 AI Fallback (줄 360-401):**

```javascript
try {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
    });
    // Gemini AI 응답 처리
} catch (e) {
    // 네트워크 에러 시 기존 Fallback
}
```

**API 경로**: `/api/chat` (Gemini AI 연동, 서버 구현)

### 3.3 상품 조회 API 대체 가능성

**서버 라우트 확인:** `/server/routes/products.js`

**공개 API (고객용, 인증 불필요):**

1. **GET /api/products** (줄 37-159)
   - 쿼리: `?category=1&type=ready&search=...&sort=newest&page=1&limit=20`
   - 반환: 상품 목록 (최대 100개)
   - **chatbot 용도**: 카테고리 필터링 가능
   
2. **GET /api/products/featured** (줄 207-250)
   - 반환: `{ success: true, newest, recommended }`
   - newest: 최신 상품 (등록일 DESC)
   - recommended: 추천 상품 (sortOrder ASC)
   - **chatbot 용도**: "신상품", "인기상품" 조회에 완벽 매칭
   
3. **GET /api/products/:id** (줄 258+)
   - 단일 상품 상세 조회
   - chatbot에 불필요

**결론**: API로 완전 대체 가능. 현재 list.js도 이미 `/api/products` + `/api/products/categories` 사용 중

---

## 4. 대체 수단

### 4.1 방안 A: API 기반 교체 (권장)
**chatbot.js를 다음과 같이 수정:**

```javascript
// 예: 신상품 조회
if (typeof getNewArrivals === 'function') {
    const newItems = getNewArrivals(2);
    ...
}

// 대체:
async function getChatbotNewArrivals(limit = 2) {
    try {
        const res = await fetch(`/api/products/featured?limit=${limit}`);
        if (res.ok) {
            const data = await res.json();
            return data.newest.slice(0, limit);
        }
    } catch (e) {}
    return [];
}

// 사용:
const newItems = await getChatbotNewArrivals(2);
```

**장점:**
- 실시간 DB 데이터 사용
- 별도 JS 파일 불필요
- list.js와 동일 아키텍처

**난이도**: 낮음 (3개 함수 → API 호출 3개로 교체)

### 4.2 방안 B: 현재 상태 유지
- product-data.js 없는 상태로 진행
- 기능 저하만 허용 (상품 카드 미표시)
- chatbot AI Fallback API 활용

**장점**: 수정 불필요

**단점**: 채팅봇 추천 기능 약화

---

## 5. 판정 및 권장 조치

### 최종 판정: **[A] 그냥 삭제 가능** (이미 삭제 완료)

### 근거:
1. **HTML 참조 = 0건**: 메인 브랜치 모든 HTML에서 제거 완료
2. **JS 참조 = chatbot.js만**: typeof 가드로 에러 방지
3. **워크트리**: 옛 브랜치에만 잔존 (메인에 영향 없음)

### 남은 선택사항 (필수 아님):

**Option 1: 아무것도 하지 않기 (현재 상태)**
- chatbot의 "인기상품", "신상품", "카테고리" 기능이 상품 카드만 안 보임
- AI Fallback API가 존재하므로 완전히 기능 불가는 아님

**Option 2: chatbot.js 마이그레이션 (권장)**
- 3개 함수를 `/api/products/featured` + `/api/products?category=...` API로 교체
- 난이도: 낮음
- 예상 시간: 30분 이내

---

## 6. 작업 예상 난이도

### 현황 (미마이그레이션 상태)
- **난이도**: 없음 (이미 삭제됨)
- **위험도**: 낮음 (typeof 가드로 runtime error 방지)
- **기능 영향**: 중간 (채팅봇 추천 기능 약화)

### 마이그레이션 (Option 2 선택 시)
- **난이도**: 낮음 ⭐⭐☆☆☆
- **변경 파일**: chatbot.js (1개)
- **변경 범위**: 3개 함수 호출 구간
- **테스트**: 채팅봇 3개 메뉴 테스트 필요
- **예상 시간**: 30분

### 기술 스택 확인
- 현재: `fetch()` 기반 비동기 처리 (이미 사용 중)
- API: RESTful JSON (이미 list.js에서 사용 중)
- 호환성: 모던 브라우저 지원

---

## 요약

| 항목 | 결과 |
|------|------|
| **파일 존재 여부** | 메인 브랜치에 없음 (이미 삭제) |
| **HTML 참조** | 0건 |
| **JS 참조** | chatbot.js:3개 (typeof 가드) |
| **에러 발생 가능성** | 없음 |
| **기능 영향** | 채팅봇 추천 UI 미표시 |
| **API 대체 가능** | 완전 가능 |
| **삭제 가능 여부** | ✅ 이미 삭제됨 |
| **권장 조치** | chatbot.js 마이그레이션 (선택사항) |

---

**보고서 작성 완료** | STIZ 개발팀 검토 대기
