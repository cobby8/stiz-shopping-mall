/**
 * STIZ Chatbot (Rule-based)
 * Provides instant answers without external AI dependencies.
 */

document.addEventListener('DOMContentLoaded', () => {
    initChatbot();
});

function initChatbot() {
    // 1. Create Floating Button & Chat Window
    const body = document.body;

    // Check if there is an existing FAB container (e.g. in list.html)
    const existingFabContainer = document.getElementById('floating-fab');

    // Floating Button (Styled like "Request Free Mockup")
    const chatBtn = document.createElement('div');
    chatBtn.id = 'stiz-chat-btn';

    // Base classes (Pill shape, Black bg, etc.)
    const baseClasses = 'w-48 py-3 text-center text-sm font-bold shadow-2xl transition-all flex items-center justify-center space-x-2 rounded-full border-2 border-white ring-1 ring-black/10 bg-black text-white hover:bg-gray-800 cursor-pointer group z-50';

    if (existingFabContainer) {
        // If FAB container exists, append to it (stacks vertically)
        // Reset fixed positioning as the container handles it
        // Remove 'fixed bottom-8 right-6' if present in base class, but baseClasses variable doesn't have it.
        // It has z-50.
        chatBtn.className = baseClasses;
        existingFabContainer.appendChild(chatBtn);
    } else {
        // Standalone (e.g. index.html) - Use fixed positioning
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

    // Chat Window
    const chatWindow = document.createElement('div');
    chatWindow.id = 'stiz-chat-window';
    chatWindow.className = 'fixed bottom-28 right-8 w-96 h-[500px] bg-white rounded-2xl shadow-2xl z-50 hidden flex flex-col overflow-hidden border border-gray-100 transform origin-bottom-right transition-all duration-300 scale-90 opacity-0';
    chatWindow.innerHTML = `
        <!-- Header -->
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
        
        <!-- Messages Area -->
        <div id="chat-messages" class="flex-1 p-4 overflow-y-auto bg-gray-50 text-sm space-y-4">
            <!-- Initial Message -->
            <div class="flex items-start space-x-2">
                <div class="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">AI</div>
                <div class="bg-white p-3 rounded-r-lg rounded-bl-lg shadow-sm border border-gray-100 max-w-[80%]">
                    Hello! I'm STIZ A.I.<br>
                    How can I help you today?
                    <div class="mt-3 flex flex-wrap gap-2">
                        <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">Custom Order</button>
                        <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">Delivery</button>
                        <button class="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full text-xs font-bold quick-reply">Basketball</button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Input Area -->
        <div class="p-4 bg-white border-t border-gray-100 shrink-0">
            <form id="chat-form" class="flex space-x-2">
                <input type="text" id="chat-input" placeholder="Type a message..." class="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-black transition-colors">
                <button type="submit" class="bg-black text-white p-2 rounded-full hover:bg-gray-800 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                </button>
            </form>
        </div>
    `;

    body.appendChild(chatBtn);
    body.appendChild(chatWindow);

    // 2. Event Listeners

    // Toggle Chat
    const toggleChat = () => {
        chatWindow.classList.toggle('hidden');
        // Small delay to allow display:block to apply before opacity transition
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

    // Expose to window for external triggers (e.g. Header Search Button)
    window.toggleChatbot = toggleChat;

    chatBtn.addEventListener('click', toggleChat);
    document.getElementById('close-chat').addEventListener('click', toggleChat);

    // Send Message
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

    // Quick Replies
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
            ${text}
        </div>
    `;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

function addBotMessage(html, delay = 500) {
    const container = document.getElementById('chat-messages');

    // Loading indicator
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
        document.getElementById(loadingId).remove();

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

// 3. Rule-based Response Logic (The "Brain")
function processBotResponse(input) {
    const lower = input.toLowerCase();

    // Scenario 1: Custom Order
    if (lower.includes('custom') || lower.includes('견적') || lower.includes('제작')) {
        addBotMessage(`
            <p class="mb-2">For custom teamwear, you can use our <strong>Design Lab</strong>.</p>
            <p class="mb-3 text-gray-500 text-xs">If you need a bulk order quote (20+ items), please contact us directly.</p>
            <a href="/custom.html" class="block bg-black text-white text-center py-2 rounded text-xs font-bold hover:bg-gray-800 transition-colors">Start Designing &rarr;</a>
        `);
        return;
    }

    // Scenario 2: Delivery
    if (lower.includes('delivery') || lower.includes('shipping') || lower.includes('배송') || lower.includes('기간')) {
        addBotMessage(`
            <p><strong>Production Time:</strong></p>
            <ul class="list-disc leading-relaxed ml-4 mb-2">
                <li>Custom Gear: 3-4 Weeks</li>
                <li>In-stock Items: 2-3 Days</li>
            </ul>
        `);
        return;
    }

    // Scenario 3: Product Recommendation (Basketball)
    if (lower.includes('basketball') || lower.includes('농구')) {
        // Mock Product Card
        addBotMessage(`
            <p class="mb-2">Best Seller for Basketball:</p>
            <div class="border border-gray-200 rounded-lg overflow-hidden">
                <img src="https://images.unsplash.com/photo-1546519638-68e109498ee2?q=80&w=1790&auto=format&fit=crop" class="w-full h-32 object-cover">
                <div class="p-3 bg-gray-50">
                    <h4 class="font-bold text-xs mb-1">STIZ Pro Jersey</h4>
                    <p class="text-xs text-brand-red font-bold">₩ 49,000</p>
                    <a href="/detail.html?id=1" class="block mt-2 text-center border border-black rounded py-1 text-xs hover:bg-black hover:text-white transition-colors">View Product</a>
                </div>
            </div>
        `);
        return;
    }

    // Scenario 4: Greetings
    if (lower.includes('hi') || lower.includes('hello') || lower.includes('안녕')) {
        addBotMessage("Hello! STIZ crew here. Ready to play?");
        return;
    }

    // Fallback
    addBotMessage(`
        I'm still learning. Try asking about:
        <div class="mt-2 flex flex-wrap gap-2">
            <span class="text-xs bg-gray-100 px-2 py-1 rounded">Custom Order</span>
            <span class="text-xs bg-gray-100 px-2 py-1 rounded">Delivery</span>
        </div>
    `);
}
