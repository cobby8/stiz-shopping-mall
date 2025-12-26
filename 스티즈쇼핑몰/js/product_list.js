document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    // Google Sheets CSV URL (Using corsproxy.io)
    const SHEET_CSV_URL = "https://corsproxy.io/?" + encodeURIComponent("https://docs.google.com/spreadsheets/d/e/2PACX-1vRuw-YXOnj34lThT09vlCVC1GXAeZFPz3mVm-2bic9j-jMyvUmvjo9mfBwWU_UJdBEWRYMmilLckXS4/pub?gid=1760492833&single=true&output=csv");

    // Color Synonym Mapping (Korean ↔ English)
    const COLOR_SYNONYMS = {
        'red': ['빨강', '빨간', '빨간색', '레드', 'red'],
        'blue': ['파랑', '파란', '파란색', '블루', 'blue'],
        'black': ['검정', '검은', '검은색', '블랙', 'black'],
        'white': ['하양', '하얀', '하얀색', '화이트', 'white'],
        'yellow': ['노랑', '노란', '노란색', '옐로우', 'yellow'],
        'green': ['초록', '녹색', '그린', 'green'],
        'navy': ['네이비', 'navy'],
        'gray': ['회색', '그레이', 'gray', 'grey'],
        'orange': ['주황', '오렌지', 'orange'],
        'purple': ['보라', '퍼플', 'purple']
    };

    // Normalize color terms to include all synonyms
    function normalizeColorTerms(text) {
        let normalized = text.toLowerCase();
        for (const [key, synonyms] of Object.entries(COLOR_SYNONYMS)) {
            synonyms.forEach(syn => {
                if (normalized.includes(syn)) {
                    // Add all synonyms to the text for better matching
                    normalized += ' ' + synonyms.join(' ');
                }
            });
        }
        return normalized;
    }

    // DOM Elements
    const productGrid = document.getElementById('productGrid');
    const aiSearchInput = document.getElementById('aiSearchInput');
    const btnAiSearch = document.getElementById('btnAiSearch');
    const aiFeedback = document.getElementById('aiFeedback');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sortSelect');

    // State
    let allProducts = [];
    let currentCategory = 'all';
    let currentSort = 'newest';

    // --- Initialization ---
    console.log("=== Product List JS Loaded ===");
    console.log("Calling fetchProductData...");
    fetchProductData();

    // --- Event Listeners ---
    // Filter Buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            renderProducts();
        });
    });

    // Sort Select
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderProducts();
    });

    // AI Search
    btnAiSearch.addEventListener('click', handleAiSearch);
    aiSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAiSearch();
    });

    // --- Functions ---

    async function fetchProductData() {
        console.log("[fetchProductData] Starting...");
        try {
            console.log("[fetchProductData] Fetching from:", SHEET_CSV_URL);
            const response = await fetch(SHEET_CSV_URL);
            console.log("[fetchProductData] Response status:", response.status);
            const text = await response.text();
            console.log("[fetchProductData] Raw CSV (first 500 chars):", text.substring(0, 500));
            allProducts = parseCSV(text);
            console.log("[fetchProductData] Parsed Products Sample:", JSON.stringify(allProducts.slice(0, 3), null, 2));
            console.log("[fetchProductData] Total Products:", allProducts.length);
            renderProducts();
        } catch (error) {
            console.error("[fetchProductData] ERROR:", error);
            productGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: red;">
                <i class="fas fa-exclamation-triangle fa-2x"></i><br>
                데이터를 불러오는데 실패했습니다.<br>잠시 후 다시 시도해주세요.
            </div>`;
        }
    }

    function parseCSV(csvText) {
        const lines = csvText.split(/\r?\n/);
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

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

            // Map CSV columns (Same structure as customizing.js)
            if (row.length >= 8) {
                const name = row[0];
                const stylefit = row[1]; // Style/Fit
                const color = row[2]; // Color
                const pattern = row[3]; // Pattern
                const font = row[4]; // Font
                const material = row[5]; // Material
                const concept = row[6].split(':')[0] || name; // Concept/Mood
                const recommendedFor = row[7] || "모든 스포츠인";
                const imageUrl = row[8];

                // Determine Category based on keywords (Simple heuristic)
                let category = 'teamwear'; // Default
                const fullText = row.join(' ').toLowerCase();
                if (fullText.includes('basketball') || fullText.includes('농구')) category = 'basketball';
                else if (fullText.includes('soccer') || fullText.includes('축구')) category = 'soccer';

                // Build enhanced keywords with color normalization
                const rawKeywords = [name, stylefit, color, pattern, font, material, concept, recommendedFor, category].join(' ');
                const normalizedKeywords = normalizeColorTerms(rawKeywords);

                data.push({
                    id: i,
                    name: `${name} (${concept})`,
                    features: [stylefit, pattern, material].filter(Boolean),
                    price_range: "₩89,000", // Fixed for now
                    price_val: 89000, // For sorting
                    recommended_for: recommendedFor,
                    keywords: normalizedKeywords, // Enhanced with color synonyms
                    color: color, // Store original color
                    image: imageUrl,
                    category: category,
                    date: new Date() // Mock date
                });
            }
        }
        return data;
    }

    function handleAiSearch() {
        const query = aiSearchInput.value.trim();
        if (!query) {
            renderProducts(); // Reset
            aiFeedback.textContent = "";
            return;
        }

        // Token-based Search Logic with Color Normalization
        const normalizedQuery = normalizeColorTerms(query);
        const tokens = normalizedQuery.split(/\s+/).filter(t => t.length > 1);

        const scoredProducts = allProducts.map(product => {
            let score = 0;
            const searchableText = product.keywords; // Already normalized in parseCSV

            tokens.forEach(token => {
                if (searchableText.includes(token)) {
                    score += 1;
                    // Boost score if color match
                    if (product.color && product.color.toLowerCase().includes(token)) {
                        score += 2;
                    }
                }
            });

            return { product, score };
        });

        const filtered = scoredProducts
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.product);

        // Update UI
        aiFeedback.innerHTML = `<i class="fas fa-check-circle" style="color:green;"></i> AI가 <b>'${query}'</b>와(과) 관련된 제품 <b>${filtered.length}</b>개를 찾았습니다.`;
        renderProducts(filtered);
    }

    function renderProducts(productsToRender = null) {
        let products = productsToRender || allProducts;

        // Apply Category Filter (only if not AI searching)
        if (!productsToRender && currentCategory !== 'all') {
            products = products.filter(p => p.category === currentCategory);
        }

        // Apply Sorting
        if (currentSort === 'price_asc') {
            products.sort((a, b) => a.price_val - b.price_val);
        } else if (currentSort === 'price_desc') {
            products.sort((a, b) => b.price_val - a.price_val);
        }
        // 'newest' is default order from CSV usually

        // Render to DOM
        productGrid.innerHTML = '';

        if (products.length === 0) {
            productGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: #999;">
                검색 결과가 없습니다.
            </div>`;
            return;
        }

        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <div class="card-image">
                    <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/300x300?text=No+Image'">
                    <div class="card-overlay">
                        <button class="btn-view">상세보기</button>
                    </div>
                </div>
                <div class="card-info">
                    <div class="card-category">${product.category.toUpperCase()}</div>
                    <h3 class="card-title">${product.name}</h3>
                    <p class="card-price">${product.price_range}</p>
                    <div class="card-tags">
                        ${product.features.slice(0, 2).map(f => `<span>#${f.split(' ')[0]}</span>`).join('')}
                    </div>
                </div>
            `;
            productGrid.appendChild(card);
        });
    }
});
