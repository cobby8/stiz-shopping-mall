/**
 * STIZ Quick Quote Wizard Logic
 * Dependencies: product-data.js (PRICING_OPTIONS)
 */

document.addEventListener('DOMContentLoaded', () => {
    initQuoteWizard();
});

function initQuoteWizard() {
    renderOptions();
    updateQuote(); // Initial calc

    // Event Listeners
    document.getElementById('q-product').addEventListener('change', updateQuote);
    document.getElementById('q-quantity').addEventListener('input', updateQuote);
}

function renderOptions() {
    const container = document.getElementById('q-options-container');
    if (!container || !PRICING_OPTIONS) return;

    container.innerHTML = '';

    PRICING_OPTIONS.add_ons.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-black cursor-pointer transition-colors';
        div.onclick = (e) => {
            // Toggle check on div click (unless clicking the checkbox itself)
            if (e.target.type !== 'checkbox') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                updateQuote();
                updateOptionStyle(div, cb.checked);
            }
        };

        div.innerHTML = `
            <div class="flex items-center">
                <input type="checkbox" id="opt-${opt.id}" value="${opt.price}" class="w-4 h-4 text-black border-gray-300 rounded focus:ring-black" onchange="updateQuote()">
                <label for="opt-${opt.id}" class="ml-3 text-sm font-medium text-gray-700 cursor-pointer select-none">${opt.name}</label>
            </div>
            <span class="text-sm font-bold text-gray-500">+₩${opt.price.toLocaleString()}</span>
        `;
        container.appendChild(div);
    });
}

function updateOptionStyle(div, isChecked) {
    if (isChecked) {
        div.classList.add('border-black', 'bg-gray-50');
        div.classList.remove('border-gray-200');
    } else {
        div.classList.remove('border-black', 'bg-gray-50');
        div.classList.add('border-gray-200');
    }
}

function updateQuote() {
    // 1. Get Values
    const productEl = document.getElementById('q-product');
    const basePrice = parseInt(productEl.options[productEl.selectedIndex].dataset.price);
    const qty = parseInt(document.getElementById('q-quantity').value) || 0;

    // 2. Calculate Options
    let optionsTotal = 0;
    const activeOptions = [];
    const checkboxes = document.querySelectorAll('#q-options-container input[type="checkbox"]:checked');

    checkboxes.forEach(cb => {
        const price = parseInt(cb.value);
        optionsTotal += price;
        // Find name
        const label = cb.parentElement.querySelector('label').innerText;
        activeOptions.push({ name: label, price: price });
    });

    // 3. Discount Logic
    let discountRate = 0;
    let discountLabel = '';

    // Reverse loop to find highest applicable tier
    for (let i = PRICING_OPTIONS.discounts.length - 1; i >= 0; i--) {
        const tier = PRICING_OPTIONS.discounts[i];
        if (qty >= tier.min_qty) {
            discountRate = tier.rate;
            discountLabel = tier.label;
            break;
        }
    }

    // 4. Final Calculation
    const unitPrice = basePrice + optionsTotal;
    const subTotal = unitPrice * qty;
    const discountAmount = Math.round(subTotal * discountRate);
    const total = subTotal - discountAmount;

    // 5. Update UI (Receipt)

    // Date
    const today = new Date();
    document.getElementById('q-date').innerText = today.toLocaleDateString();

    // Base
    document.getElementById('r-base-price').innerText = `₩${basePrice.toLocaleString()}`;

    // Options List
    const optionsListEl = document.getElementById('r-options-list');
    if (activeOptions.length > 0) {
        optionsListEl.innerHTML = activeOptions.map(opt => `
            <div class="w-full flex justify-between text-gray-500 text-xs mb-1">
                <span>+ ${opt.name}</span>
                <span>₩${opt.price.toLocaleString()}</span>
            </div>
        `).join('');
        // Show container
        optionsListEl.parentElement.classList.remove('hidden');
    } else {
        optionsListEl.innerHTML = '<span class="text-gray-400 text-xs">No options selected</span>';
    }

    // Qty & Discount
    document.getElementById('r-qty').innerText = `${qty} ea`;

    const discountBadge = document.getElementById('q-discount-badge');
    const rDiscount = document.getElementById('r-discount');

    if (discountRate > 0) {
        discountBadge.innerHTML = `<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs font-bold">${discountLabel} Applied!</span>`;
        rDiscount.innerText = `- ₩${discountAmount.toLocaleString()}`;
        rDiscount.parentElement.classList.remove('hidden'); // Ensure visible
    } else {
        discountBadge.innerHTML = '';
        rDiscount.innerText = '- ₩0';
        rDiscount.parentElement.classList.add('text-gray-300'); // Dim if 0
    }

    // Total
    document.getElementById('r-total').innerText = `₩${total.toLocaleString()}`;
}

// Image Download Feature
function downloadQuote() {
    const card = document.getElementById('receipt-card');

    html2canvas(card, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `STIZ_Quote_${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
    });
}
