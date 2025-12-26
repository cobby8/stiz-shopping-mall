document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesContainer = document.getElementById('chat-messages');

    // Viewer Elements
    const viewerPlaceholder = document.getElementById('viewer-placeholder');
    const generatedImage = document.getElementById('generated-image');
    const promptOverlay = document.getElementById('prompt-overlay');
    const promptTextStr = document.getElementById('prompt-text');

    // UI Elements
    const creditCountEl = document.getElementById('credit-count');

    // State
    let credits = parseInt(localStorage.getItem('stiz_credits')) || 3;
    let isGenerating = false;

    // Initialize UI
    updateCreditDisplay();

    // Event Listeners
    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    async function handleSend() {
        if (isGenerating) return;

        const prompt = chatInput.value.trim();
        if (!prompt) return;

        if (credits <= 0) {
            addMessage("You have run out of credits. Please upgrade to Pro to continue designing.", false);
            return;
        }

        // 1. User Message
        addMessage(prompt, true);
        chatInput.value = '';

        // 2. Start Generation State
        isGenerating = true;
        setViewerState('loading');

        // Add "Thinking" message
        const loadingMsgId = addMessage("Thinking...", false, true); // true = isThinking

        try {
            // 3. Call Backend API
            const response = await fetch('http://localhost:3000/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    type: 'custom_jersey' // Changed from 'soccer_kit' to allow dynamic sport selection via prompt
                })
            });

            const data = await response.json();

            // Remove "Thinking" message
            removeMessage(loadingMsgId);

            if (data.success) {
                // 4. Update UI with Result
                credits--;
                localStorage.setItem('stiz_credits', credits);
                updateCreditDisplay();

                // Show Image
                const imgLen = data.imageUrl ? data.imageUrl.length : 0;
                addMessage(`[System] Image Data Received! Size: ${Math.round(imgLen / 1024)} KB`, false);

                generatedImage.src = data.imageUrl; // URL from Server (Mock or Real)
                promptTextStr.textContent = `"${data.prompt_refined || prompt}"`;

                // Show AI Response
                const aiResponse = data.mock
                    ? `[MOCK] Generated a design for "${prompt}". (Server is running!)`
                    : `Here is a design based on "${prompt}". I've refined the details to match our production standards.`;

                addMessage(aiResponse, false);
                setViewerState('result');

            } else {
                throw new Error(data.error || 'Generation failed');
            }

        } catch (error) {
            console.error('Generation Error:', error);
            removeMessage(loadingMsgId);
            addMessage(`Sorry, I encountered an error: ${error.message}. Is the server running?`, false);
            setViewerState('placeholder');
        } finally {
            isGenerating = false;
        }
    }

    // Helper: Message UI
    function addMessage(text, isUser = false, isThinking = false) {
        const div = document.createElement('div');
        div.className = 'flex items-start ' + (isUser ? 'justify-end' : '');
        div.id = isThinking ? 'msg-thinking' : `msg-${Date.now()}`;

        let content = '';
        if (isUser) {
            content = `
                <div class="bg-black text-white rounded-lg p-3 text-sm max-w-[85%] shadow-md">
                    ${text}
                </div>
            `;
        } else {
            const loadingDots = isThinking ? '<span class="animate-pulse">...</span>' : '';
            content = `
                <div class="flex-shrink-0 mr-3">
                     <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">AI</div>
                </div>
                <div class="bg-gray-100 rounded-lg p-3 text-sm text-gray-700 max-w-[85%] shadow-sm leading-relaxed">
                    ${text} ${loadingDots}
                </div>
            `;
        }
        div.innerHTML = content;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return div.id;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // Helper: Viewer State
    function setViewerState(state) {
        if (state === 'loading') {
            viewerPlaceholder.classList.add('hidden');
            generatedImage.classList.add('hidden');
            promptOverlay.classList.remove('opacity-100');
            promptOverlay.classList.add('opacity-0');

            // Note: In a real app, we'd show a spinner on the viewer side too
            // But we already have the "Thinking" bubble in chat
        } else if (state === 'result') {
            viewerPlaceholder.classList.add('hidden');
            generatedImage.classList.remove('hidden');
            promptOverlay.classList.remove('opacity-0');
            promptOverlay.classList.add('opacity-100');

            // Animation reset
            generatedImage.classList.remove('translate-y-4', 'opacity-0');
        } else {
            // placeholder
            viewerPlaceholder.classList.remove('hidden');
            generatedImage.classList.add('hidden');
            promptOverlay.classList.add('opacity-0');
        }
    }

    function updateCreditDisplay() {
        creditCountEl.textContent = credits;
    }
});
