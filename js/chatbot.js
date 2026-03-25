/**
 * STIZ Chatbot V2 - Enhanced Rule-based + Product Integration
 * Integrates with product-data.js for recommendations.
 * Prepared for Gemini API migration (Phase 3-2).
 */

document.addEventListener('DOMContentLoaded', () => {
    initChatbot();
});

function initChatbot() {
    if (document.getElementById('stiz-chat-btn')) return;

    const body = document.body;
    const existingFabContainer = document.getElementById('floating-fab');

    const chatBtn = document.createElement('div');
    chatBtn.id = 'stiz-chat-btn';

    const baseClasses = 'w-48 py-3 text-center text-sm font-bold shadow-2xl transition-all flex items-center justify-center space-x-2 rounded-full border-2 border-white ring-1 ring-black/10 bg-black text-white hover:bg-gray-800 cursor-pointer group z-50';

    if (existingFabContainer) {
        chatBtn.className = baseClasses;
        existingFabContainer.appendChild(chatBtn);
    } else {
        chatBtn.className = `fixed bottom-8 right-6 ${baseClasses}`;
        body.appendChild(chatBtn);
    }

    chatBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <span>AI상담사 연결하기</span>
        <span class="absolute -top-1 -right-1 flex h-3 w-3">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
    `;

    const chatWindow = document.createElement('div');
    chatWindow.id = 'stiz-chat-window';
    chatWindow.className = 'fixed bottom-28 right-8 w-96 h-[500px] bg-white rounded-2xl shadow-2xl z-50 hidden flex flex-col overflow-hidden border border-gray-100 transform origin-bottom-right transition-all duration-300 scale-90 opacity-0';
    chatWindow.innerHTML = `
        <div class="bg-black text-white p-4 flex justify-between items-center shrink-0">
            <div class="flex items-center space-x-2">
                <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span class="font-bold">STIZ Assistant</span>
            </div>
            <button id="close-chat" class="hover:text-gray-300">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div id="chat-messages" class="flex-1 p-4 overflow-y-auto bg-gray-50 text-sm space-y-4">
            <div class="flex items-start space-x-2">
                <div class="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">AI</div>
                <div class="bg-white p-3 rounded-r-lg rounded-bl-lg shadow-sm border border-gray-100 max-w-[80%]">
                    안녕하세요! STIZ AI 상담사입니다.<br>
                    무엇을 도와드릴까요?
                    <div class="mt-3 flex flex-wrap gap-2">
                        <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">커스텀 제작</button>
                        <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">배송 안내</button>
                        <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">사이즈 추천</button>
                        <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">인기 상품</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="p-4 bg-white border-t border-gray-100 shrink-0">
            <form id="chat-form" class="flex space-x-2">
                <input type="text" id="chat-input" placeholder="메시지를 입력하세요..." class="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-black transition-colors">
                <button type="submit" class="bg-black text-white p-2 rounded-full hover:bg-gray-800 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                </button>
            </form>
        </div>
    `;

    if (!chatBtn.parentNode) body.appendChild(chatBtn);
    body.appendChild(chatWindow);

    // Toggle Chat
    const toggleChat = () => {
        chatWindow.classList.toggle('hidden');
        setTimeout(() => {
            if (!chatWindow.classList.contains('hidden')) {
                chatWindow.classList.remove('scale-90', 'opacity-0');
                chatWindow.classList.add('scale-100', 'opacity-100');
                document.getElementById('chat-input').focus();
            } else {
                chatWindow.classList.add('scale-90', 'opacity-0');
                chatWindow.classList.remove('scale-100', 'opacity-100');
            }
        }, 10);
    };

    window.toggleChatbot = toggleChat;
    chatBtn.addEventListener('click', toggleChat);
    document.getElementById('close-chat').addEventListener('click', toggleChat);

    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (text) {
            addUserMessage(text);
            processBotResponse(text);
            input.value = '';
        }
    });

    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('quick-reply')) {
            const text = e.target.innerText;
            addUserMessage(text);
            processBotResponse(text);
        }
    });
}

function addUserMessage(text) {
    const container = document.getElementById('chat-messages');
    const el = document.createElement('div');
    el.className = 'flex items-start space-x-2 justify-end';
    el.innerHTML = `
        <div class="bg-black text-white p-3 rounded-l-lg rounded-br-lg shadow-sm max-w-[80%]">
            ${escapeHtml(text)}
        </div>
    `;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function addBotMessage(html, delay = 600) {
    const container = document.getElementById('chat-messages');
    const loadingId = 'loading-' + Date.now();
    const loading = document.createElement('div');
    loading.id = loadingId;
    loading.className = 'flex items-start space-x-2';
    loading.innerHTML = `
        <div class="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">AI</div>
        <div class="bg-gray-100 p-3 rounded-r-lg rounded-bl-lg max-w-[80%] flex space-x-1 items-center h-10">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
        </div>
    `;
    container.appendChild(loading);
    container.scrollTop = container.scrollHeight;

    setTimeout(() => {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        const el = document.createElement('div');
        el.className = 'flex items-start space-x-2';
        el.innerHTML = `
            <div class="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">AI</div>
            <div class="bg-white p-3 rounded-r-lg rounded-bl-lg shadow-sm border border-gray-100 max-w-[90%] overflow-hidden">
                ${html}
            </div>
        `;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }, delay);
}

// Product card helper
function renderProductCard(product) {
    return `
        <div class="border border-gray-200 rounded-lg overflow-hidden mt-2">
            <img src="${product.image}" class="w-full h-28 object-cover" onerror="this.style.display='none'">
            <div class="p-3 bg-gray-50">
                <p class="text-[10px] text-gray-400 uppercase">${product.category}</p>
                <h4 class="font-bold text-xs mb-1">${product.name}</h4>
                <p class="text-xs text-red-600 font-bold mb-2">₩${product.price.toLocaleString()}</p>
                <a href="detail.html?id=${product.id}" class="block text-center border border-black rounded py-1.5 text-xs font-bold hover:bg-black hover:text-white transition-colors">View Product</a>
            </div>
        </div>
    `;
}

// Enhanced response logic
function processBotResponse(input) {
    const lower = input.toLowerCase();

    // Greetings
    if (/^(hi|hello|hey|안녕|반가|하이)/.test(lower)) {
        addBotMessage(`
            안녕하세요! STIZ입니다.
            <div class="mt-2 flex flex-wrap gap-2">
                <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">커스텀 제작</button>
                <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">인기 상품</button>
            </div>
        `);
        return;
    }

    // Custom Order
    if (lower.includes('custom') || lower.includes('견적') || lower.includes('제작') || lower.includes('커스텀')) {
        addBotMessage(`
            <p class="mb-2"><strong>커스텀 팀웨어 제작 안내</strong></p>
            <ul class="text-xs text-gray-600 space-y-1 mb-3">
                <li>- 최소 주문: 10벌 이상</li>
                <li>- 제작 기간: 3~4주</li>
                <li>- 10벌 이상 5% / 20벌 이상 10% / 50벌 이상 15% 할인</li>
            </ul>
            <a href="custom.html" class="block bg-black text-white text-center py-2 rounded text-xs font-bold hover:bg-gray-800 transition-colors">Design Lab 바로가기 &rarr;</a>
            <div class="mt-2">
                <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">견적 문의</button>
            </div>
        `);
        return;
    }

    // Delivery/Shipping
    if (lower.includes('delivery') || lower.includes('shipping') || lower.includes('배송') || lower.includes('기간') || lower.includes('택배')) {
        addBotMessage(`
            <p class="mb-2"><strong>배송 안내</strong></p>
            <div class="text-xs text-gray-600 space-y-1 mb-2">
                <p>- 커스텀 제품: 주문 후 3~4주</p>
                <p>- 기성품: 결제 후 2~3일 (영업일 기준)</p>
                <p>- <strong>5만원 이상 무료배송</strong> (미만 시 3,000원)</p>
                <p>- 반품: 7일 이내 무료 반품</p>
            </div>
        `);
        return;
    }

    // Size recommendation
    if (lower.includes('사이즈') || lower.includes('size') || lower.includes('치수') || lower.includes('핏')) {
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
            <p class="text-[10px] text-gray-400">* 단위: cm, 제품에 따라 차이가 있을 수 있습니다.</p>
        `);
        return;
    }

    // Best sellers / Popular
    if (lower.includes('인기') || lower.includes('best') || lower.includes('추천') || lower.includes('popular') || lower.includes('베스트')) {
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

    // New arrivals
    if (lower.includes('신상') || lower.includes('new') || lower.includes('새로') || lower.includes('최신')) {
        if (typeof getNewArrivals === 'function') {
            const newItems = getNewArrivals(2);
            if (newItems.length > 0) {
                let cards = '<p class="mb-1"><strong>신상품</strong></p>';
                newItems.forEach(p => { cards += renderProductCard(p); });
                addBotMessage(cards);
                return;
            }
        }
        addBotMessage('신상품을 확인해보세요! <a href="list.html" class="underline font-bold">전체 상품 보기</a>');
        return;
    }

    // Category search (basketball, soccer, etc.)
    const categories = {
        'basketball': '농구', 'soccer': '축구', 'volleyball': '배구',
        'baseball': '야구', '농구': '농구', '축구': '축구', '배구': '배구', '야구': '야구'
    };
    for (const [key, label] of Object.entries(categories)) {
        if (lower.includes(key)) {
            const catKey = ['농구', '축구', '배구', '야구'].includes(key)
                ? { '농구': 'basketball', '축구': 'soccer', '배구': 'volleyball', '야구': 'baseball' }[key]
                : key;
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
            return;
        }
    }

    // Price inquiry
    if (lower.includes('가격') || lower.includes('price') || lower.includes('얼마')) {
        addBotMessage(`
            <p class="mb-2"><strong>가격 안내</strong></p>
            <div class="text-xs text-gray-600 space-y-1">
                <p>- 기성 유니폼: ₩35,000 ~ ₩89,000</p>
                <p>- 커스텀 유니폼: ₩45,000 ~ ₩120,000</p>
                <p>- 단체 주문 시 할인 적용</p>
            </div>
            <div class="mt-2">
                <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">견적 문의</button>
            </div>
        `);
        return;
    }

    // Return/Exchange
    if (lower.includes('반품') || lower.includes('교환') || lower.includes('환불') || lower.includes('return') || lower.includes('exchange')) {
        addBotMessage(`
            <p class="mb-2"><strong>반품/교환 안내</strong></p>
            <div class="text-xs text-gray-600 space-y-1">
                <p>- 수령 후 7일 이내 무료 반품</p>
                <p>- 미착용, 택 제거 전 상태에 한함</p>
                <p>- 커스텀 제품은 반품 불가</p>
                <p>- 교환은 재고 상황에 따라 가능</p>
            </div>
        `);
        return;
    }

    // Contact
    if (lower.includes('연락') || lower.includes('전화') || lower.includes('contact') || lower.includes('문의') || lower.includes('카톡')) {
        addBotMessage(`
            <p class="mb-2"><strong>문의처</strong></p>
            <div class="text-xs text-gray-600 space-y-1">
                <p>- 카카오톡: @stiz</p>
                <p>- 이메일: info@stiz.co.kr</p>
                <p>- 전화: 02-1234-5678</p>
                <p>- 운영시간: 평일 10:00~18:00</p>
            </div>
        `);
        return;
    }

    // Fallback
    addBotMessage(`
        죄송합니다. 해당 질문은 아직 답변 준비 중입니다.
        <div class="mt-2 flex flex-wrap gap-2">
            <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">커스텀 제작</button>
            <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">배송 안내</button>
            <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">사이즈 추천</button>
            <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">인기 상품</button>
        </div>
    `);
}
