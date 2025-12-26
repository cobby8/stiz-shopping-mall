# STIZ(스티즈) 쇼핑몰 리뉴얼 제안서

## 1. 사이트 구조도 (Sitemap)

사용자 경험(UX)을 최적화하고 4가지 주요 카테고리로의 접근성을 높이는 직관적인 구조입니다.

*   **Main (Home)**
    *   Hero Banner (브랜드 무드 비디오/이미지)
    *   Category Quick Link (커스텀 / 의류 / 가스공사 / 농구용품)
    *   Best Sellers / New Arrivals
    *   Instagram Feed (Social Proof)
*   **Customizing (커스텀 유니폼 - 주력)**
    *   종목 선택 (축구, 농구, 배구 등)
    *   **3D/2D Design Lab (커스텀 제작 툴)**
    *   제작 사례 갤러리 (Portfolio)
    *   단체 주문 가이드 / 견적 문의
*   **Shop (스포츠 의류 & 농구 용품)**
    *   기능성 웨어 (상의, 하의, 아우터)
    *   농구 용품 (몰텐 공, 보호대)
    *   필터: 종목별, 색상별, 가격대별
*   **KOGAS MD (한국가스공사 공식몰)**
    *   유니폼, 굿즈, 응원 도구
*   **Customer Care (고객센터)**
    *   AI 챗봇 상담 (24/7)
    *   공지사항 / Q&A / 리뷰
    *   제작 일정 안내

---

## 2. 기술 명세서 (Tech Stack)

Cafe24의 안정성을 기반으로 하되, 커스텀 및 AI 기능은 최신 프론트엔드 기술을 도입하여 차별화합니다.

### A. Core Platform (Cafe24 Smart Design)
*   **HTML5 / CSS3**: 웹표준 준수, 반응형 레이아웃 (Media Queries).
*   **JavaScript (ES6+)**: 주요 인터랙션 구동.
*   **Cafe24 Module**: 스마트 디자인 변수(`$product_name` 등) 적극 활용.

### B. Frontend Development (Advanced)
*   **Customizing Tool**:
    *   **Canvas API (Fabric.js)**: 2D 유니폼 디자인 (로고 배치, 텍스트 변형)의 경량화 및 빠른 렌더링.
    *   **Three.js (옵션)**: 프리미엄 라인을 위한 3D 착용 시뮬레이션 구현 (필요 시 도입).
*   **UI Framework**:
    *   **Tailwind CSS (CDN)**: 빠른 디자인 시스템 구축 및 유지보수 용이성 확보 (Cafe24 CSS와 충돌 방지 namespace 사용 권장).
    *   **Swiper.js**: 터치 친화적인 모바일 배너 및 상품 슬라이더.

### C. AI Integration (Chatbot)
*   **Interface**: React 기반의 별도 컴포넌트 또는 바닐라 JS로 구현된 채팅 위젯.
*   **Backend Interface**: AWS Lambda 또는 Python Flask 서버 (별도 호스팅)와 통신.
*   **Engine**: OpenAI API (GPT-4o) + LangChain (RAG 파이프라인). Vector DB(Pinecone 등)를 활용해 STIZ 상품 DB 및 FAQ 학습.

---

## 3. 화면 설계 (Wireframe Description)

### A. 메인 페이지 (Main Page)
*   **Concept**: "Minimal & Bold". 여백을 살리고 고해상도 이미지를 전면에 배치.
*   **Top GNB**: 투명 배경에 흰색 텍스트. 스크롤 시 화이트 배경으로 트랜지션. 메가 메뉴 적용.
*   **Section 1**: 풀스크린 비디오 배경. "Make Your Team Identify" 카피와 [디자인 시작하기] CTA 버튼 강조.
*   **Section 2**: 2x2 그리드 레이아웃으로 주요 카테고리(커스텀, 기성품, MD, 용품) 이미지 배치. 호버 시 줌인 효과.

### B. 커스텀 툴 (Design Lab)
*   **Layout**: 좌측 - 탭 메뉴(컬러, 패턴, 마킹, 엠블럼), 중앙 - 실시간 프리뷰(Canvas), 우측 - 선택 옵션 요약 및 단가표/주문하기.
*   **Interaction**: 사용자가 색상을 클릭하면 중앙 유니폼 색상이 즉시 변경(SVG path 조작 또는 이미지 합성). 드래그 앤 드롭으로 로고 위치 이동.

### C. 상품 상세 (Detail)
*   **Layout**: 좌측 썸네일(스티키), 우측 상품 정보 및 옵션.
*   **Feature**: 연관 상품 추천(Cross-selling). 챗봇에게 "이 유니폼 사이즈 추천해줘" 바로 묻기 버튼.

### D. AI 챗봇 UI
*   **Position**: 우측 하단 플로팅 버튼 (STIZ 로고 아이콘).
*   **Window**: 모바일 메신저 스타일.
    *   *초기 화면*: "무엇을 도와드릴까요?" + 추천 키워드(견적 문의, 제작 기간, 사이즈 추천).
    *   *답변*: 텍스트 + 상품 카드(이미지, 가격, 링크) 형태의 Rich UI.

---

## 4. 구현 코드 예시 (Implementation Reference)

### A. 메가 메뉴 (Mega Menu) 구조 (HTML/CSS)
Cafe24의 레이아웃 안에서 작동하는 직관적인 메가 메뉴입니다.

```html
<!-- HTML Structure -->
<nav class="stiz-nav">
  <ul class="nav-list">
    <li class="nav-item has-mega">
      <a href="/category/custom">CUSTOMIZING</a>
      <div class="mega-menu">
        <div class="container">
          <div class="column">
            <h3>Sport Category</h3>
            <a href="#">Soccer</a>
            <a href="#">Basketball</a>
            <a href="#">Volleyball</a>
          </div>
          <div class="column">
            <h3>Featured</h3>
            <a href="#">Best Designs</a>
            <a href="#">Team Review</a>
          </div>
          <div class="column promo-image">
            <img src="/web/img/nav_promo_soccer.jpg" alt="New Season Kits">
          </div>
        </div>
      </div>
    </li>
    <li class="nav-item"><a href="/category/sportswear">SPORTSWEAR</a></li>
    <li class="nav-item"><a href="/category/kogas">KOGAS MD</a></li>
    <!-- ... -->
  </ul>
</nav>
```

```css
/* CSS (Minimalism) */
.stiz-nav { background: #fff; border-bottom: 1px solid #eee; }
.nav-list { display: flex; justify-content: center; gap: 40px; padding: 20px 0; }
.nav-item > a { font-weight: 700; color: #111; letter-spacing: 1px; text-decoration: none; }

/* Mega Menu Logic */
.mega-menu {
  display: none;
  position: absolute;
  top: 100%; left: 0; width: 100%;
  background: #fff; padding: 40px 0;
  box-shadow: 0 10px 20px rgba(0,0,0,0.05);
  z-index: 999;
}
.nav-item:hover .mega-menu { display: block; animation: slideDown 0.3s ease; }
.mega-menu .container { display: flex; max-width: 1200px; margin: 0 auto; gap: 60px; }

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### B. AI 챗봇 플로팅 버튼 및 초기화 (JavaScript)

```javascript
document.addEventListener('DOMContentLoaded', () => {
    const chatbotBtn = document.createElement('div');
    chatbotBtn.id = 'stiz-chatbot-trigger';
    chatbotBtn.innerHTML = `
        <div class="icon-wrapper">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="white">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
        </div>
        <span class="tooltip">AI 상담사에게 물어보세요!</span>
    `;
    
    document.body.appendChild(chatbotBtn);

    // Style Inject
    const style = document.createElement('style');
    style.textContent = `
        #stiz-chatbot-trigger {
            position: fixed; bottom: 30px; right: 30px;
            background: #000; width: 60px; height: 60px;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: transform 0.2s; z-index: 9999;
        }
        #stiz-chatbot-trigger:hover { transform: scale(1.1); }
        .tooltip { 
            position: absolute; right: 70px; background: #333; color: #fff; 
            padding: 5px 10px; border-radius: 4px; font-size: 12px; white-space: nowrap;
            opacity: 0; transition: opacity 0.3s; pointer-events: none;
        }
        #stiz-chatbot-trigger:hover .tooltip { opacity: 1; }
    `;
    document.head.appendChild(style);

    chatbotBtn.addEventListener('click', () => {
        // Toggle Chat Window Logic
        console.log("Open AI Chat Window");
        // window.openChatInterface(); // 추후 구현
    });
});
```

---

## 5. 추가 제안 (Additional Suggestions)

### A. 신뢰도 강화 (Trust Signals)
*   **실시간 주문 알림**: "방금 OO팀이 유니폼 제작을 시작했습니다"와 같은 토스트 팝업을 띄워 활성도를 보여줍니다 (FOMO 마케팅).
*   **Team Gallery 연동**: 인스타그램 해시태그(#STIZ)를 활용해 실제 팀들의 착용샷을 메인에 롤링하여 품질 신뢰도를 높입니다.

### B. SEO & Performance
*   **Open Graph (OG) Tag 최적화**: 카카오톡/SNS 공유 시 매력적인 썸네일과 설명이 나오도록 `layout.html` 헤더를 정비합니다.
*   **LCP (Largest Contentful Paint) 최적화**: 메인 배너 이미지는 `preload` 처리하고, 차세대 포맷(WebP)을 사용하여 로딩 속도를 0.5초 이내로 단축합니다.
