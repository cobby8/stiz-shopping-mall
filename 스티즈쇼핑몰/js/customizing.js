document.addEventListener('DOMContentLoaded', () => {
    // 1. Tab Switching Logic
    const tabs = document.querySelectorAll('.custom-tabs .btn');
    const mockupBase = document.getElementById('mockupBase');
    const mockupTexture = document.getElementById('mockupTexture');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');

            // Logic to switch mockup type (Placeholder for future mask switching)
            const sport = tab.dataset.tab;
            console.log(`Switched to ${sport}`);
            // In a real implementation, you would switch the mask-image here
            // e.g., mockupBase.style.maskImage = `url('images/${sport}_mask.png')`;
        });
    });

    // 2. Mockup Color Logic
    let currentColor = '#FFFFFF';

    function updateMockupColor(color) {
        currentColor = color;
        if (mockupBase) {
            mockupBase.style.backgroundColor = color;
        }
    }

    // Color Picker Logic
    const colorBtns = document.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.dataset.color;
            updateMockupColor(color);
        });
    });

    // 3. AI Chatbot Logic (RAG with Google Sheets)
    const chatInput = document.getElementById('chatInput');
    const btnSendChat = document.getElementById('btnSendChat');
    const chatMessages = document.getElementById('chatMessages');

    // Google Sheets CSV URL (Using CORS Proxy for local testing)
    const SHEET_CSV_URL = "https://api.allorigins.win/raw?url=" + encodeURIComponent("https://docs.google.com/spreadsheets/d/e/2PACX-1vRuw-YXOnj34lThT09vlCVC1GXAeZFPz3mVm-2bic9j-jMyvUmvjo9mfBwWU_UJdBEWRYMmilLckXS4/pub?gid=1760492833&single=true&output=csv");

    // Global Data Store
    let stizProductData = [];

    // Initialize Data
    fetchStizData();

    async function fetchStizData() {
        try {
            const response = await fetch(SHEET_CSV_URL);
            const text = await response.text();
            stizProductData = parseCSV(text);
            console.log("STIZ Data Loaded:", stizProductData.length, "items");
            addMessage("시스템: 최신 제품 데이터를 불러왔습니다. 무엇이든 물어보세요!", true);
        } catch (error) {
            console.error("Failed to fetch data:", error);
            addMessage("시스템: 데이터 로딩 실패. 기본 모드로 동작합니다.", true);
            // Fallback to static stizData if available
            if (typeof stizData !== 'undefined') {
                stizProductData = [...stizData.basketball, ...stizData.soccer, ...stizData.teamwear];
            }
        }
    }

    function parseCSV(csvText) {
        const lines = csvText.split(/\r?\n/);
        // Skip header row
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            // Simple CSV regex parser to handle quotes
            const row = [];
            let inQuote = false;
            let currentCell = '';

            for (let j = 0; j < lines[i].length; j++) {
                const char = lines[i][j];
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    row.push(currentCell.trim());
                    currentCell = '';
                } else {
                    currentCell += char;
                }
            }
            row.push(currentCell.trim());

            // Map CSV columns to Object (Based on analyzed structure)
            // 0: No, 1: Style/Fit, 2: Color, 3: Pattern, 4: Font, 5: Material, 6: Concept(Title), 7: RecFor, 8: Image
            if (row.length >= 8) {
                const name = row[0]; // e.g., 25FW_FO_005
                const concept = row[6].split(':')[0] || name; // Extract "Urban Border" from "Urban Border: ..."

                data.push({
                    name: `${name} (${concept})`,
                    features: [row[1], row[3], row[5]].filter(Boolean), // Style, Pattern, Material
                    price_range: "₩89,000 (예상)", // Default
                    recommended_for: row[7] || "모든 농구인",
                    keywords: [row[2], row[6], "basketball", "soccer", "teamwear"].join(' '), // Combine colors and concept for search
                    image: row[8]
                });
            }
        }
        return data;
    }

    function findRelevantProducts(userQuery) {
        const tokens = userQuery.toLowerCase().split(/\s+/).filter(t => t.length > 1); // Ignore single chars

        // Calculate score for each product
        const scoredProducts = stizProductData.map(product => {
            let score = 0;
            const searchableText = [
                product.name,
                ...product.features,
                product.keywords,
                product.recommended_for
            ].join(' ').toLowerCase();

            tokens.forEach(token => {
                if (searchableText.includes(token)) {
                    score += 1;
                }
            });

            return { product, score };
        });

        // Filter by score > 0 and sort by score descending
        return scoredProducts
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.product);
    }

    function addMessage(text, isBot = false, image = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isBot ? 'bot' : 'user'}`;
        msgDiv.style.marginBottom = '15px';
        msgDiv.style.textAlign = isBot ? 'left' : 'right';

        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.style.padding = '10px 15px';
        bubble.style.borderRadius = isBot ? '15px 15px 15px 0' : '15px 15px 0 15px';
        bubble.style.background = isBot ? 'white' : 'var(--primary-color)';
        bubble.style.color = isBot ? 'black' : 'white';
        bubble.style.display = 'inline-block';
        bubble.style.maxWidth = '80%';
        bubble.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';

        let content = text;
        if (image) {
            content += `<br><img src="${image}" style="max-width:100%; margin-top:10px; border-radius:5px;">`;
        }
        bubble.innerHTML = content; // Use innerHTML for image

        msgDiv.appendChild(bubble);
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function handleChat() {
        const text = chatInput.value.trim();
        if (!text) return;

        addMessage(text, false);
        chatInput.value = '';

        // 1. Keyword Extraction & Search
        const relevantProducts = findRelevantProducts(text);

        // 2. Response Generation
        setTimeout(() => {
            let response = "";
            let image = null;

            if (relevantProducts.length > 0) {
                const product = relevantProducts[0];
                response = `STIZ AI Designer: 고객님, 요청하신 스타일에 맞는 <b>[${product.name}]</b> 제품을 찾았습니다.<br><br>
                            - <b>특징:</b> ${product.features.join(', ')}<br>
                            - <b>추천 용도:</b> ${product.recommended_for}<br>
                            - <b>가격:</b> ${product.price_range}`;
                image = product.image;

                // Color change logic (Simple heuristic based on keywords in the product data)
                if (product.keywords.includes('레드') || product.keywords.includes('Red') || text.includes('레드')) updateMockupColor('#FF0000');
                else if (product.keywords.includes('블루') || product.keywords.includes('Blue') || text.includes('블루')) updateMockupColor('#0000FF');
                else if (product.keywords.includes('블랙') || product.keywords.includes('Black') || text.includes('블랙')) updateMockupColor('#000000');
                else if (product.keywords.includes('화이트') || product.keywords.includes('White') || text.includes('화이트')) updateMockupColor('#FFFFFF');
                else if (product.keywords.includes('골드') || product.keywords.includes('Gold') || text.includes('골드')) updateMockupColor('#D4AF37');

            } else {
                // No specific match, generic response or color change
                if (text.includes('레드') || text.includes('red')) {
                    response = "강렬한 레드 컬러는 팀의 에너지를 상징합니다. STIZ의 프리미엄 원단으로 제작된 레드 유니폼을 확인해보세요.";
                    updateMockupColor('#FF0000');
                } else if (text.includes('블루') || text.includes('blue')) {
                    response = "신뢰와 냉철함을 상징하는 블루 컬러입니다. 시원한 메쉬 소재와 잘 어울립니다.";
                    updateMockupColor('#0000FF');
                } else if (text.includes('블랙') || text.includes('black')) {
                    response = "강력하고 모던한 블랙 컬러입니다. 상대방을 압도하는 카리스마를 보여주세요.";
                    updateMockupColor('#000000');
                } else if (text.includes('화이트') || text.includes('white')) {
                    response = "깔끔하고 클래식한 화이트 컬러입니다. 어떤 로고와도 잘 어울리는 베이직한 선택입니다.";
                    updateMockupColor('#FFFFFF');
                } else if (text.includes('골드') || text.includes('gold')) {
                    response = "승리를 상징하는 골드 컬러입니다. 챔피언을 위한 특별한 선택이 될 것입니다.";
                    updateMockupColor('#D4AF37');
                } else {
                    response = "죄송합니다. 정확히 일치하는 제품을 찾지 못했습니다. 원하시는 스타일(예: '도시', '클래식', '블랙')을 다시 말씀해 주세요.";
                }
            }

            addMessage(response, true, image);
        }, 1000);
    }

    if (btnSendChat && chatInput) {
        btnSendChat.addEventListener('click', handleChat);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleChat();
        });
    }
});
