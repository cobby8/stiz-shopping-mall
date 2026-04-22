/**
 * STIZ 챗봇 "티즈" - Phase 1 MVP
 * --------------------------------------------------------------
 * 이 파일은 6개 논리 섹션으로 구성됩니다 (한 파일 유지, 섹션 주석으로 구분).
 *   [UI]       위젯/말풍선/칩 렌더링 DOM 함수
 *   [STATE]    대화 히스토리 + 로그인 상태 + 컨텍스트 캐시
 *   [INTENT]   키워드 기반 1차 의도 분류
 *   [HANDLERS] 의도별 응답 함수
 *   [API]      서버 fetch 래퍼
 *   [BOOT]     초기화 + 이벤트 바인딩
 * --------------------------------------------------------------
 * 설계 원칙:
 *   - 챗봇 이름은 "티즈" (STIZ의 캐릭터형 표기)
 *   - 아이콘은 Material Symbols Outlined 사용 (프로젝트 컨벤션 C-2)
 *   - AI 응답은 반드시 escapeHtml 처리 (XSS 방지)
 *   - 로그인 감지는 localStorage.token 기준
 *   - Gemini는 키워드 1차 필터 통과 시에만 호출 (비용/속도 억제)
 *   - history는 최근 4턴만 서버에 전송
 */

// ============================================================
// [STATE] 대화 세션 상태
// ============================================================
// 비유: 챗봇이 "방금 무슨 얘기까지 했지?"를 기억해두는 메모장.
const ChatState = {
    history: [],          // { role: 'user'|'model', text: string } 배열 (최근 8개 유지, 서버에는 4턴만 전송)
    categoryCache: null,  // /api/products/categories 응답 캐시 (한 세션에 한 번만 호출)
    isOpen: false
};

// 로그인 여부: auth.js가 관리하는 localStorage.token 기준
function isLoggedIn() {
    try {
        return !!localStorage.getItem('token');
    } catch (e) {
        return false;
    }
}

// ============================================================
// [UI] DOM 유틸리티 및 위젯 렌더링
// ============================================================

// HTML 이스케이프 - 사용자 입력/AI 응답을 안전하게 텍스트로 표시
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

// 사용자 말풍선 (우측 검정 버블)
function addUserMessage(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'flex items-start space-x-2 justify-end';
    el.innerHTML = `
        <div class="chat-user-bubble p-3 rounded-l-lg rounded-br-lg shadow-sm max-w-[80%]">
            ${escapeHtml(text)}
        </div>
    `;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

// 봇 말풍선 (좌측 티즈 아바타 + 흰 버블)
// html 파라미터는 이미 신뢰된 HTML이어야 합니다. AI 응답을 넣을 땐 반드시 escapeHtml 사전 처리.
function addBotMessage(html, delay = 500) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // 1) 타이핑 인디케이터 먼저 표시 (챗봇이 "생각 중"인 느낌)
    const loadingId = 'loading-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const loading = document.createElement('div');
    loading.id = loadingId;
    loading.className = 'flex items-start space-x-2';
    loading.innerHTML = `
        <div class="chat-bot-avatar">
            <span class="material-symbols-outlined" style="font-size:18px;">support_agent</span>
        </div>
        <div class="bg-gray-100 p-3 rounded-r-lg rounded-bl-lg max-w-[80%] flex space-x-1 items-center h-10">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0.1s"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div>
        </div>
    `;
    container.appendChild(loading);
    container.scrollTop = container.scrollHeight;

    // 2) delay 후 실제 메시지 교체
    setTimeout(() => {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        const el = document.createElement('div');
        el.className = 'flex items-start space-x-2';
        el.innerHTML = `
            <div class="chat-bot-avatar">
                <span class="material-symbols-outlined" style="font-size:18px;">support_agent</span>
            </div>
            <div class="bg-white p-3 rounded-r-lg rounded-bl-lg shadow-sm border border-gray-100 max-w-[90%] overflow-hidden">
                ${html}
            </div>
        `;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }, delay);
}

// 상품 카드 렌더링 (CTA = "상품 보기", 상세페이지 이동)
function renderProductCard(product) {
    // 서버 응답 필드 매핑: thumbnail / name / price / categoryName / id
    const name = escapeHtml(product.name || '상품');
    const category = escapeHtml(product.categoryName || product.category || '');
    const price = typeof product.price === 'number' ? product.price.toLocaleString() : (product.price || '문의');
    const thumb = product.thumbnail || product.image || '';
    const id = product.id;

    // 이미지가 없으면 회색 박스 + 카테고리 텍스트 fallback (onerror 처리)
    const imgHtml = thumb
        ? `<img src="${escapeHtml(thumb)}" class="w-full h-28 object-cover" alt="${name}" onerror="this.parentElement.innerHTML='<div class=&quot;w-full h-28 bg-gray-100 flex items-center justify-center text-xs text-gray-400&quot;>${category || '이미지 없음'}</div>'">`
        : `<div class="w-full h-28 bg-gray-100 flex items-center justify-center text-xs text-gray-400">${category || '이미지 없음'}</div>`;

    return `
        <div class="border border-gray-200 rounded-lg overflow-hidden mt-2">
            <div class="relative">${imgHtml}</div>
            <div class="p-3 bg-gray-50">
                <p class="text-[10px] text-gray-400 uppercase">${category}</p>
                <h4 class="font-bold text-xs mb-1 line-clamp-1">${name}</h4>
                <p class="text-xs font-bold mb-2 flex items-center gap-1" style="color:var(--stiz-chat-accent);">
                    <span class="material-symbols-outlined" style="font-size:14px;">sell</span>
                    ₩${price}
                </p>
                <a href="detail.html?id=${id}" class="block text-center border border-black rounded py-1.5 text-xs font-bold hover:bg-black hover:text-white transition-colors">
                    상품 보기
                </a>
            </div>
        </div>
    `;
}

// 빠른 응답 칩(버튼) 그룹 렌더 - 배열의 각 항목은 {label, value?} 또는 문자열
function renderChips(items) {
    if (!items || !items.length) return '';
    const buttons = items.map(item => {
        const label = typeof item === 'string' ? item : item.label;
        const value = typeof item === 'string' ? item : (item.value || item.label);
        return `<button class="quick-reply bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
    }).join('');
    return `<div class="mt-3 flex flex-wrap gap-2">${buttons}</div>`;
}

// ============================================================
// [API] 서버 fetch 래퍼
// ============================================================
// 비유: 프론트가 서버(STIZ DB)에 "메뉴판 주세요" 주문하는 창구.

// 피처드(인기/신상) 상품 — newest / recommended 동시 반환
async function apiFeatured(limit = 4) {
    const r = await fetch(`/api/products/featured?limit=${limit}`);
    if (!r.ok) throw new Error('featured fetch failed');
    return r.json(); // { success, newest: [], recommended: [] }
}

// 카테고리 트리 (한 세션에 한 번만 호출하여 ChatState에 캐싱)
async function apiCategories() {
    if (ChatState.categoryCache) return ChatState.categoryCache;
    const r = await fetch('/api/products/categories');
    if (!r.ok) throw new Error('categories fetch failed');
    const data = await r.json();
    ChatState.categoryCache = data;
    return data;
}

// 카테고리 ID로 상품 목록 조회
async function apiProductsByCategory(categoryId, limit = 2) {
    const r = await fetch(`/api/products?category=${categoryId}&limit=${limit}`);
    if (!r.ok) throw new Error('products fetch failed');
    return r.json(); // { success, products: [], pagination, categories }
}

// Gemini 챗봇 호출 (history + context 포함)
async function apiChat(message) {
    // 서버에는 최근 4턴(= 8개 메시지)만 전송하여 토큰 낭비 방지
    const recent = ChatState.history.slice(-8);
    const r = await fetch('/api/generate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: recent })
    });
    if (!r.ok) throw new Error('chat fetch failed');
    return r.json(); // { reply, source }
}

// ============================================================
// [HANDLERS] 의도별 응답 함수
// ============================================================
// 각 핸들러는 의도가 매칭되면 addBotMessage를 호출하고 true를 반환.

// 초기 화면/인사말
function handleGreet() {
    const chips = renderChips([
        '인기 상품', '신상품', '카테고리 탐색', '주문 조회', '배송·결제', '상담원 연결'
    ]);
    addBotMessage(`안녕하세요! 티즈예요 👋<br>무엇을 도와드릴까요?${chips}`, 300);
    return true;
}

// 인기 상품 (recommended 우선, 없으면 newest로 폴백)
async function handlePopular() {
    try {
        const data = await apiFeatured(4);
        const list = (data.recommended && data.recommended.length ? data.recommended : data.newest || []).slice(0, 2);
        if (!list.length) {
            addBotMessage('아직 등록된 인기 상품이 없어요. <a href="list.html" class="underline font-bold">전체 상품 보기</a>');
            return true;
        }
        let cards = '<p class="mb-1"><strong>인기 상품 TOP 2</strong></p>';
        list.forEach(p => { cards += renderProductCard(p); });
        cards += renderChips(['신상품', '카테고리 탐색']);
        addBotMessage(cards);
    } catch (e) {
        addBotMessage('상품을 불러오지 못했어요. <a href="list.html" class="underline font-bold">전체 상품 보기</a>');
    }
    return true;
}

// 신상품
async function handleNewArrivals() {
    try {
        const data = await apiFeatured(4);
        const list = (data.newest || []).slice(0, 2);
        if (!list.length) {
            addBotMessage('신상품을 준비 중이에요. <a href="list.html" class="underline font-bold">전체 상품 보기</a>');
            return true;
        }
        let cards = '<p class="mb-1"><strong>방금 나온 신상품</strong></p>';
        list.forEach(p => { cards += renderProductCard(p); });
        cards += renderChips(['인기 상품', '카테고리 탐색']);
        addBotMessage(cards);
    } catch (e) {
        addBotMessage('상품을 불러오지 못했어요. <a href="list.html" class="underline font-bold">전체 상품 보기</a>');
    }
    return true;
}

// 카테고리 탐색 — 2차 칩 생성 (실제 categories API 기반)
async function handleCategoryBrowse() {
    try {
        const data = await apiCategories();
        const cats = (data.categories || []).slice(0, 8); // 최대 8개 대분류 노출
        if (!cats.length) {
            addBotMessage('카테고리를 불러오지 못했어요.');
            return true;
        }
        // 칩 value는 "cat:ID:NAME" 형식으로 인코딩 → INTENT에서 분기
        const chips = cats.map(c => ({
            label: c.name,
            value: `cat:${c.id}:${c.name}`
        }));
        addBotMessage(`<p class="mb-1"><strong>어떤 카테고리를 보여드릴까요?</strong></p>${renderChips(chips)}`);
    } catch (e) {
        addBotMessage('카테고리를 불러오지 못했어요.');
    }
    return true;
}

// 특정 카테고리의 상품 2개 카드 (value="cat:ID:NAME" 파싱해 호출)
async function handleCategoryPick(categoryId, categoryName) {
    try {
        const data = await apiProductsByCategory(categoryId, 2);
        const items = data.products || [];
        if (!items.length) {
            addBotMessage(`${escapeHtml(categoryName)} 카테고리에 등록된 상품이 없어요. <a href="list.html?category=${categoryId}" class="underline font-bold">전체 보기</a>`);
            return true;
        }
        let cards = `<p class="mb-1"><strong>${escapeHtml(categoryName)} 상품</strong></p>`;
        items.forEach(p => { cards += renderProductCard(p); });
        cards += `<a href="list.html?category=${categoryId}" class="block mt-2 text-xs text-center text-gray-500 underline">더 보기 →</a>`;
        addBotMessage(cards);
    } catch (e) {
        addBotMessage('상품을 불러오지 못했어요.');
    }
    return true;
}

// 주문 조회 (Phase 1은 단순 안내 + 링크만. 실제 조회 폼은 Phase 2)
function handleOrderLookup() {
    const loggedIn = isLoggedIn();
    if (loggedIn) {
        addBotMessage(`
            <p class="mb-2"><strong>내 주문 조회</strong></p>
            <p class="text-xs text-gray-600 mb-3">로그인된 상태예요. 마이페이지에서 주문 내역을 확인하실 수 있어요.</p>
            <a href="myshop.html" class="block bg-black text-white text-center py-2 rounded text-xs font-bold hover:bg-gray-800 transition-colors">마이페이지로 이동 →</a>
        `);
    } else {
        addBotMessage(`
            <p class="mb-2"><strong>주문 조회 안내</strong></p>
            <p class="text-xs text-gray-600 mb-3">비회원은 주문번호 + 이름으로 조회하실 수 있어요.</p>
            <a href="order-track.html" class="block bg-black text-white text-center py-2 rounded text-xs font-bold hover:bg-gray-800 transition-colors">주문 조회하기 →</a>
            <div class="mt-2 text-[11px] text-gray-500">로그인하시면 내 주문 전체 목록을 볼 수 있어요.</div>
        `);
    }
    return true;
}

// 배송/결제 안내
function handleShippingPayment() {
    addBotMessage(`
        <p class="mb-2"><strong>배송 및 결제 안내</strong></p>
        <div class="text-xs text-gray-600 space-y-1 mb-2">
            <p>• 기성품: 결제 후 2~3 영업일 이내 배송</p>
            <p>• 커스텀 제작: 2~3주 소요</p>
            <p>• <strong>5만원 이상 무료배송</strong> (미만 3,000원)</p>
            <p>• 결제 수단: 카드, 계좌이체, 간편결제</p>
            <p>• 반품/교환: 수령 후 7일 이내</p>
        </div>
        ${renderChips(['인기 상품', '주문 조회', '상담원 연결'])}
    `);
    return true;
}

// 상담원 연결
// 연락처·영업시간은 server/data/knowledge/company.json 과 동일 값으로 유지 (K1 통일)
function handleContact() {
    addBotMessage(`
        <p class="mb-2"><strong>상담원 연결</strong></p>
        <div class="text-xs text-gray-600 space-y-1 mb-3">
            <p>• 카카오톡: <strong>@stiz</strong></p>
            <p>• 이메일: order@stiz.kr</p>
            <p>• 전화: 070-4337-3000</p>
            <p>• 운영시간: 평일 09:00~18:00</p>
        </div>
        <a href="inquiry.html" class="block bg-black text-white text-center py-2 rounded text-xs font-bold hover:bg-gray-800 transition-colors">1:1 문의 작성하기 →</a>
    `);
    return true;
}

// 커스텀 제작
function handleCustom() {
    addBotMessage(`
        <p class="mb-2"><strong>커스텀 팀웨어 제작</strong></p>
        <ul class="text-xs text-gray-600 space-y-1 mb-3">
            <li>• 최소 주문: 10벌부터</li>
            <li>• 제작 기간: 2~3주</li>
            <li>• 15~29벌 5% / 30~99벌 10% / 100벌 이상 협의</li>
        </ul>
        <a href="custom.html" class="block bg-black text-white text-center py-2 rounded text-xs font-bold hover:bg-gray-800 transition-colors">Design Lab 바로가기 →</a>
        ${renderChips(['배송·결제', '상담원 연결'])}
    `);
    return true;
}

// 사이즈 추천표
function handleSize() {
    addBotMessage(`
        <p class="mb-2"><strong>사이즈 추천</strong></p>
        <table class="w-full text-xs border-collapse mb-2">
            <tr class="bg-gray-100"><th class="p-1.5 text-left">사이즈</th><th class="p-1.5">가슴</th><th class="p-1.5">총장</th></tr>
            <tr class="border-b"><td class="p-1.5 font-bold">S</td><td class="p-1.5 text-center">96</td><td class="p-1.5 text-center">66</td></tr>
            <tr class="border-b"><td class="p-1.5 font-bold">M</td><td class="p-1.5 text-center">100</td><td class="p-1.5 text-center">69</td></tr>
            <tr class="border-b"><td class="p-1.5 font-bold">L</td><td class="p-1.5 text-center">104</td><td class="p-1.5 text-center">72</td></tr>
            <tr class="border-b"><td class="p-1.5 font-bold">XL</td><td class="p-1.5 text-center">110</td><td class="p-1.5 text-center">75</td></tr>
            <tr><td class="p-1.5 font-bold">2XL</td><td class="p-1.5 text-center">116</td><td class="p-1.5 text-center">78</td></tr>
        </table>
        <p class="text-[10px] text-gray-400">* 단위: cm, 제품에 따라 차이가 있을 수 있어요.</p>
    `);
    return true;
}

// 반품/교환
function handleReturn() {
    addBotMessage(`
        <p class="mb-2"><strong>반품/교환 안내</strong></p>
        <div class="text-xs text-gray-600 space-y-1">
            <p>• 수령 후 7일 이내 무료 반품</p>
            <p>• 미착용, 택 제거 전 상태에 한함</p>
            <p>• 커스텀 제품은 반품 불가</p>
            <p>• 교환은 재고 상황에 따라 가능</p>
        </div>
    `);
    return true;
}

// Gemini AI 폴백 — 규칙 매칭 실패 시 호출
async function handleAIFallback(userInput) {
    const container = document.getElementById('chat-messages');
    if (!container) return true;

    // 타이핑 인디케이터 (addBotMessage의 delay 없이 직접 제어 — 응답 시간이 길 수 있음)
    const loadingId = 'ai-loading-' + Date.now();
    const loading = document.createElement('div');
    loading.id = loadingId;
    loading.className = 'flex items-start space-x-2';
    loading.innerHTML = `
        <div class="chat-bot-avatar">
            <span class="material-symbols-outlined" style="font-size:18px;">support_agent</span>
        </div>
        <div class="bg-gray-100 p-3 rounded-r-lg rounded-bl-lg max-w-[80%] flex space-x-1 items-center h-10">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0.1s"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div>
        </div>
    `;
    container.appendChild(loading);
    container.scrollTop = container.scrollHeight;

    try {
        const data = await apiChat(userInput);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        // AI 응답에 HTML 허용 금지 — 반드시 escapeHtml
        const safeReply = escapeHtml(data.reply || '답변을 준비하지 못했어요.');
        addBotMessage(safeReply, 0);

        // history에 누적 (model 턴)
        ChatState.history.push({ role: 'model', text: data.reply || '' });
        // 메모리 절약: 16개(8턴) 초과 시 앞부분 트림
        if (ChatState.history.length > 16) {
            ChatState.history = ChatState.history.slice(-16);
        }
    } catch (e) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        // 네트워크 오류 폴백: 상담원 연락처 안내
        addBotMessage(`
            <p>죄송해요, 지금은 답변을 준비하지 못했어요.</p>
            <div class="mt-2 text-xs text-gray-500">아래 창구로 연락 주세요:</div>
            <div class="text-xs text-gray-600 space-y-0.5 mb-2">
                <p>• 카카오톡: @stiz</p>
                <p>• 이메일: order@stiz.kr</p>
                <p>• 전화: 070-4337-3000</p>
            </div>
            ${renderChips(['인기 상품', '배송·결제', '상담원 연결'])}
        `, 0);
    }
    return true;
}

// ============================================================
// [INTENT] 키워드 기반 의도 분류 → 핸들러 호출
// ============================================================
// 비유: "손님 질문을 듣자마자 어느 부서로 넘길지" 판단하는 안내데스크.
// Gemini로 넘기기 전에 명확한 키워드는 먼저 잡아내어 비용/속도를 아낍니다.

async function routeIntent(rawInput) {
    const input = (rawInput || '').trim();
    if (!input) return;

    // user 턴을 history에 먼저 저장 (AI 폴백 시 서버로 전송됨)
    ChatState.history.push({ role: 'user', text: input });
    if (ChatState.history.length > 16) {
        ChatState.history = ChatState.history.slice(-16);
    }

    const lower = input.toLowerCase();

    // 0) 칩 특수 값 처리: "cat:ID:NAME" → 카테고리 선택
    if (input.startsWith('cat:')) {
        const parts = input.split(':');
        const catId = parseInt(parts[1], 10);
        const catName = parts.slice(2).join(':') || '선택한 카테고리';
        if (!Number.isNaN(catId)) {
            await handleCategoryPick(catId, catName);
            return;
        }
    }

    // 1) 인사
    if (/^(안녕|반가|하이|hi|hello|hey)/i.test(input)) {
        handleGreet();
        return;
    }

    // 2) 인기/베스트
    if (/(인기|베스트|best|추천|popular)/i.test(lower)) {
        await handlePopular();
        return;
    }

    // 3) 신상
    if (/(신상|신규|new|새로|최신)/i.test(lower)) {
        await handleNewArrivals();
        return;
    }

    // 4) 카테고리 탐색(일반)
    if (/(카테고리|종목|어떤\s*(상품|종목))/i.test(input)) {
        await handleCategoryBrowse();
        return;
    }

    // 5) 종목별 키워드 직답 (basketball/soccer 등) — categories API 캐시에서 매칭
    const sportKeywords = {
        '농구': ['농구', 'basketball'],
        '축구': ['축구', 'soccer', 'football'],
        '배구': ['배구', 'volleyball'],
        '야구': ['야구', 'baseball']
    };
    for (const [koName, kws] of Object.entries(sportKeywords)) {
        if (kws.some(k => lower.includes(k))) {
            try {
                const data = await apiCategories();
                // 대분류에서 이름 매칭
                const match = (data.categories || []).find(c => c.name.includes(koName));
                if (match) {
                    await handleCategoryPick(match.id, match.name);
                    return;
                }
            } catch (e) { /* 카테고리 매칭 실패 시 AI 폴백으로 넘어감 */ }
        }
    }

    // 6) 주문 조회
    if (/(주문\s*조회|주문\s*확인|배송\s*조회|내\s*주문|order)/i.test(input)) {
        handleOrderLookup();
        return;
    }

    // 7) 배송·결제
    if (/(배송|택배|결제|payment|shipping|delivery|기간)/i.test(lower)) {
        handleShippingPayment();
        return;
    }

    // 8) 반품/교환
    if (/(반품|교환|환불|return|exchange)/i.test(lower)) {
        handleReturn();
        return;
    }

    // 9) 사이즈
    if (/(사이즈|size|치수|핏)/i.test(lower)) {
        handleSize();
        return;
    }

    // 10) 커스텀 제작
    if (/(custom|커스텀|제작|견적|팀웨어|단체\s*주문)/i.test(lower)) {
        handleCustom();
        return;
    }

    // 11) 상담원 연결
    if (/(상담원|상담|연락|전화|카톡|문의|contact)/i.test(input)) {
        handleContact();
        return;
    }

    // 12) 매칭 실패 → Gemini AI 폴백
    await handleAIFallback(input);
}

// ============================================================
// [BOOT] DOMContentLoaded 초기화
// ============================================================

// CSS 변수 2개만 주요 색상으로 정의 (주색상/포인트)
// 나머지는 Tailwind 유틸리티 그대로 유지
const CHATBOT_STYLE = `
    <style>
        :root {
            --stiz-chat-primary: #000000;
            --stiz-chat-accent: #dc2626;
        }
        .chat-bot-avatar {
            width: 32px;
            height: 32px;
            background: var(--stiz-chat-primary);
            color: #fff;
            border-radius: 9999px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .chat-user-bubble {
            background: var(--stiz-chat-primary);
            color: #fff;
        }
        #stiz-chat-btn {
            background: var(--stiz-chat-primary);
        }
        #stiz-chat-header {
            background: var(--stiz-chat-primary);
        }
        #chat-send-btn {
            background: var(--stiz-chat-primary);
        }
        #stiz-chat-ping {
            background: var(--stiz-chat-accent);
        }
    </style>
`;

// Material Symbols 폰트 링크가 <head>에 없는 페이지에서도
// 챗봇 아이콘(chat/send/close/support_agent/sell)이 원시 텍스트로
// 노출되지 않도록, 초기화 시 존재 여부를 확인하고 없으면 주입한다.
// (join/login/custom/custom_3d/order_result 5개 HTML 대응)
function ensureMaterialSymbolsFont() {
    // 이미 어떤 형태로든 Material Symbols Outlined 링크가 있으면 스킵
    // (opsz/wght 파라미터 변형까지 href*= 로 포괄 매칭)
    const existing = document.querySelector('link[href*="Material+Symbols+Outlined"]');
    if (existing) return;

    // 없으면 기존 HTML들(index.html 등 17+ 파일)이 쓰는 표준 URL과 동일하게 주입
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
    document.head.appendChild(link);
}

function initChatbot() {
    // 중복 초기화 방지
    if (document.getElementById('stiz-chat-btn')) return;

    // 폰트 링크 보장 (누락된 페이지에서도 아이콘이 깨지지 않도록 최상단에서 호출)
    ensureMaterialSymbolsFont();

    // CSS 변수 주입
    document.head.insertAdjacentHTML('beforeend', CHATBOT_STYLE);

    const body = document.body;
    const existingFabContainer = document.getElementById('floating-fab');

    // 1) 챗 버튼 (우하단 떠 있는 버블)
    const chatBtn = document.createElement('div');
    chatBtn.id = 'stiz-chat-btn';
    const baseClasses = 'w-48 py-3 text-center text-sm font-bold shadow-2xl transition-all flex items-center justify-center space-x-2 rounded-full border-2 border-white ring-1 ring-black/10 text-white hover:bg-gray-800 cursor-pointer group z-50';
    if (existingFabContainer) {
        chatBtn.className = baseClasses;
        existingFabContainer.appendChild(chatBtn);
    } else {
        chatBtn.className = `fixed bottom-8 right-6 ${baseClasses}`;
        body.appendChild(chatBtn);
    }
    chatBtn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:18px;">chat</span>
        <span>티즈에게 물어보기</span>
        <span class="absolute -top-1 -right-1 flex h-3 w-3">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background:var(--stiz-chat-accent);"></span>
          <span id="stiz-chat-ping" class="relative inline-flex rounded-full h-3 w-3"></span>
        </span>
    `;

    // 2) 챗 창
    const chatWindow = document.createElement('div');
    chatWindow.id = 'stiz-chat-window';
    // 모바일: 좌우 여백 포함 풀폭 / 데스크탑: 380x600
    chatWindow.className = 'fixed bottom-28 right-4 sm:right-8 w-[calc(100vw-2rem)] sm:w-[380px] h-[70vh] sm:h-[600px] bg-white rounded-2xl shadow-2xl z-50 hidden flex flex-col overflow-hidden border border-gray-100 transform origin-bottom-right transition-all duration-300 scale-90 opacity-0';
    chatWindow.innerHTML = `
        <div id="stiz-chat-header" class="text-white p-4 flex justify-between items-center shrink-0">
            <div class="flex items-center space-x-2">
                <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span class="font-bold">티즈 · STIZ 상담봇</span>
            </div>
            <button id="close-chat" class="hover:text-gray-300" aria-label="닫기">
                <span class="material-symbols-outlined" style="font-size:22px;">close</span>
            </button>
        </div>
        <div id="chat-messages" class="flex-1 p-4 overflow-y-auto bg-gray-50 text-sm space-y-4"></div>
        <div class="p-4 bg-white border-t border-gray-100 shrink-0">
            <form id="chat-form" class="flex space-x-2">
                <input type="text" id="chat-input" placeholder="메시지를 입력하세요..." autocomplete="off" class="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-black transition-colors">
                <button id="chat-send-btn" type="submit" class="text-white p-2 rounded-full hover:bg-gray-800 transition-colors" aria-label="전송">
                    <span class="material-symbols-outlined" style="font-size:20px;">send</span>
                </button>
            </form>
        </div>
    `;
    body.appendChild(chatWindow);

    // 3) 창 토글
    const toggleChat = () => {
        ChatState.isOpen = !ChatState.isOpen;
        chatWindow.classList.toggle('hidden');
        setTimeout(() => {
            if (!chatWindow.classList.contains('hidden')) {
                chatWindow.classList.remove('scale-90', 'opacity-0');
                chatWindow.classList.add('scale-100', 'opacity-100');
                const input = document.getElementById('chat-input');
                if (input) input.focus();
                // 처음 열 때만 인사 메시지 표시
                const msgs = document.getElementById('chat-messages');
                if (msgs && !msgs.dataset.greeted) {
                    msgs.dataset.greeted = '1';
                    handleGreet();
                }
            } else {
                chatWindow.classList.add('scale-90', 'opacity-0');
                chatWindow.classList.remove('scale-100', 'opacity-100');
            }
        }, 10);
    };

    window.toggleChatbot = toggleChat;
    chatBtn.addEventListener('click', toggleChat);
    document.getElementById('close-chat').addEventListener('click', toggleChat);

    // 4) 폼 제출 — 사용자 입력 처리
    document.getElementById('chat-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;
        addUserMessage(text);
        input.value = '';
        await routeIntent(text);
    });

    // 5) 빠른 응답 칩 클릭 — data-value 우선, 없으면 텍스트 사용
    document.body.addEventListener('click', async (e) => {
        const chip = e.target.closest('.quick-reply');
        if (!chip) return;
        const raw = chip.dataset.value || chip.innerText.trim();
        // 칩 값이 "cat:..." 이면 라벨(보여지는 이름)을 유저 말풍선으로 표시
        const displayLabel = raw.startsWith('cat:') ? (raw.split(':').slice(2).join(':') || raw) : raw;
        addUserMessage(displayLabel);
        await routeIntent(raw);
    });
}

// DOM 준비 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    initChatbot();
});
