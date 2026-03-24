/**
 * STIZ AI Size Recommender
 * Dependencies: product-data.js (SIZING_CHARTS)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Only init if we are on a page with product details (simplified check)
    if (document.querySelector('.page-detail') || document.location.href.includes('detail.html')) {
        initSizeRecommender();
    }
});

function initSizeRecommender() {
    console.log('STIZ AI Size Recommender Initialized');
    injectSizeModal();
    injectTriggerButton();
}

function injectTriggerButton() {
    // Find a suitable place to insert the button (e.g., near Size Selector)
    const sizeSelector = document.querySelector('select'); // Assumes first select is size
    if (!sizeSelector) return;

    const btn = document.createElement('button');
    btn.className = 'mt-2 text-xs font-bold text-brand-red underline hover:text-black flex items-center gap-1';
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        AI Size Recommendation
    `;
    btn.onclick = openSizeModal;

    sizeSelector.parentNode.insertBefore(btn, sizeSelector.nextSibling);
}

function injectSizeModal() {
    const modalHtml = `
        <div id="size-modal" class="fixed inset-0 bg-black/50 z-50 hidden flex items-center justify-center backdrop-blur-sm">
            <div class="bg-white w-full max-w-sm rounded-xl p-6 shadow-2xl transform transition-all scale-95 opacity-0" id="size-modal-content">
                <!-- Header -->
                <div class="flex justify-between items-center mb-6">
                    <h3 class="font-bold text-lg flex items-center">
                        <span class="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs mr-2">AI</span>
                        Size Recommender
                    </h3>
                    <button onclick="closeSizeModal()" class="text-gray-400 hover:text-black">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <!-- Step 1: Input -->
                <div id="size-step-1">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Height (cm)</label>
                            <input type="number" id="user-height" placeholder="175" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-black outline-none">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Weight (kg)</label>
                            <input type="number" id="user-weight" placeholder="70" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-black outline-none">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Preferred Fit</label>
                            <div class="flex space-x-2">
                                <button onclick="selectFit(this, 'tight')" class="fit-btn flex-1 border border-gray-300 rounded py-2 text-xs font-medium hover:border-black transition-colors">Tight</button>
                                <button onclick="selectFit(this, 'regular')" class="fit-btn flex-1 border border-black bg-black text-white rounded py-2 text-xs font-medium">Regular</button>
                                <button onclick="selectFit(this, 'loose')" class="fit-btn flex-1 border border-gray-300 rounded py-2 text-xs font-medium hover:border-black transition-colors">Loose</button>
                            </div>
                            <input type="hidden" id="user-fit" value="regular">
                        </div>
                    </div>
                    <button onclick="calculateSize()" class="w-full bg-black text-white mt-6 py-3 rounded-lg font-bold hover:bg-gray-800 transition-colors">
                        Find My Size
                    </button>
                </div>

                <!-- Step 2: Result -->
                <div id="size-step-2" class="hidden text-center py-4">
                    <p class="text-sm text-gray-500 mb-2">Based on your body data, we recommend:</p>
                    <div class="text-4xl font-black mb-2 animate-bounce" id="rec-size-label">L</div>
                    <p class="text-xs text-gray-400 mb-6">(KR Size: <span id="rec-size-kr">100</span>)</p>

                    <div class="bg-gray-50 p-3 rounded text-xs text-left text-gray-600 mb-6">
                        <p id="rec-comment">💡 <strong>Analysis:</strong> For 175cm/70kg, L size offers the best regular fit. Sleeve length will be perfect.</p>
                    </div>

                    <button onclick="closeSizeModal()" class="w-full border border-black text-black py-2 rounded-lg font-bold hover:bg-gray-50 transition-colors">
                        Close & Apply
                    </button>
                    <button onclick="resetSize()" class="mt-2 text-xs text-gray-400 hover:text-black underline">Try Again</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function openSizeModal() {
    const modal = document.getElementById('size-modal');
    const content = document.getElementById('size-modal-content');
    modal.classList.remove('hidden');
    // Animation
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeSizeModal() {
    const modal = document.getElementById('size-modal');
    const content = document.getElementById('size-modal-content');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        resetSize(); // Reset for next time
    }, 200);
}

function selectFit(btn, val) {
    document.querySelectorAll('.fit-btn').forEach(b => {
        b.classList.remove('bg-black', 'text-white', 'border-black');
        b.classList.add('border-gray-300', 'text-gray-900');
    });
    btn.classList.add('bg-black', 'text-white', 'border-black');
    btn.classList.remove('border-gray-300', 'text-gray-900');
    document.getElementById('user-fit').value = val;
}

function resetSize() {
    document.getElementById('size-step-1').classList.remove('hidden');
    document.getElementById('size-step-2').classList.add('hidden');
}

function calculateSize() {
    const height = parseInt(document.getElementById('user-height').value);
    const weight = parseInt(document.getElementById('user-weight').value);
    const fit = document.getElementById('user-fit').value;

    if (!height || !weight) {
        alert('Please enter both height and weight.');
        return;
    }

    // Logic relying on SIZING_CHARTS from product-data.js
    // Default to 'top' chart for MVP
    const chart = SIZING_CHARTS.top.ranges;

    // Find matching range
    let match = chart.find(r => height >= r.height_min && height <= r.height_max);

    // If no exact match, fallback logic (closest)
    if (!match) {
        if (height > 200) match = chart[chart.length - 1]; // Max
        else match = chart[0]; // Min
    }

    // Parse Size String "L (100)" -> Size: L, KR: 100
    // Simple logic for MVP demonstration
    let sizeStr = match.size; // "L (100)"
    let sizeMain = sizeStr.split(' ')[0]; // "L"
    let sizeKR = sizeStr.split('(')[1].replace(')', ''); // "100"

    // Fit Adjustment
    let comment = `For ${height}cm/${weight}kg, <strong>${sizeMain}</strong> is the standard recommendation.`;

    // Weight Check (If weight exceeds max for that height, upsizing)
    if (weight > match.weight_max) {
        // Logic to upsize in real app, simplified here
        comment += `<br><span class='text-red-500'>Note: Weight is slightly above average for this height. Consider sizing up if you prefer comfort.</span>`;
    }

    if (fit === 'tight') {
        comment += "<br>Since you prefer a <strong>Tight</strong> fit, this size will hug your body.";
    } else if (fit === 'loose') {
        comment += "<br>For a <strong>Loose</strong> fit, you might want to consider one size up.";
    }

    // Render Result
    document.getElementById('rec-size-label').innerText = sizeMain;
    document.getElementById('rec-size-kr').innerText = sizeKR;
    document.getElementById('rec-comment').innerHTML = comment;

    // Switch View
    document.getElementById('size-step-1').classList.add('hidden');
    document.getElementById('size-step-2').classList.remove('hidden');
}
