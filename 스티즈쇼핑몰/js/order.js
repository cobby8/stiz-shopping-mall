let currentStep = 1;
let orderData = {
    sport: '',
    style: '',
    quantity: 0
};

const prices = {
    soccer: 50000,
    baseball: 60000,
    basketball: 45000,
    teamwear: 85000,
    basic: 0,
    pro: 10000,
    elite: 20000
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showStep(1);

    // Check URL parameters for custom order
    const urlParams = new URLSearchParams(window.location.search);
    const sportParam = urlParams.get('sport');
    const styleParam = urlParams.get('style');

    if (sportParam) {
        // Auto-select sport
        selectSport(sportParam);

        if (styleParam) {
            // Auto-select style if provided
            setTimeout(() => {
                selectStyle(styleParam);
            }, 500); // Small delay to ensure transition
        }
    }
});

// Helper for Auto-selection
function selectSport(sport) {
    const card = document.querySelector(`.selection-card[onclick*="'${sport}'"]`);
    if (card) {
        card.click();
        nextStep(2);
    }
}

function selectStyle(style) {
    const card = document.querySelector(`.selection-card[onclick*="'${style}'"]`);
    if (card) {
        card.click();
        nextStep(3);
    }
}

function selectOption(element, category, value) {
    // Visual selection
    const cards = element.parentElement.querySelectorAll('.selection-card');
    cards.forEach(card => card.classList.remove('selected'));
    element.classList.add('selected');

    // Data update
    orderData[category] = value;
    calculatePrice();
}

function nextStep(step) {
    // Validation
    if (step === 2 && !orderData.sport) {
        alert('Please select a sport type.');
        return;
    }
    if (step === 3 && !orderData.style) {
        alert('Please select a style.');
        return;
    }
    if (step === 4) {
        const teamName = document.querySelector('input[placeholder="Enter your team name"]').value;
        if (!teamName) {
            alert('Please enter your team name.');
            return;
        }
        const qty = parseInt(document.getElementById('quantity').value) || 0;
        if (qty < 10) {
            alert('Minimum quantity is 10.');
            return;
        }
        orderData.teamName = teamName;
        updateReview();
    }

    showStep(step);
}

function prevStep(step) {
    showStep(step);
}

function showStep(step) {
    // Hide all sections
    document.querySelectorAll('.form-section').forEach(el => el.classList.remove('active'));
    // Show target section
    document.getElementById(`step${step}`).classList.add('active');

    // Update indicators
    document.querySelectorAll('.step').forEach(el => {
        const s = parseInt(el.dataset.step);
        if (s <= step) el.classList.add('active');
        else el.classList.remove('active');
    });

    currentStep = step;
}

function calculatePrice() {
    const qtyInput = document.getElementById('quantity');
    const qty = parseInt(qtyInput.value) || 0;
    orderData.quantity = qty;

    if (!orderData.sport) return;

    let unitPrice = prices[orderData.sport] + (prices[orderData.style] || 0);
    let total = unitPrice * qty;

    // Simple discount logic
    let discount = 0;
    if (qty >= 20) discount = total * 0.1; // 10% discount for 20+

    orderData.totalPrice = total - discount;

    document.getElementById('basePrice').innerText = unitPrice.toLocaleString() + ' KRW';
    document.getElementById('discount').innerText = '-' + discount.toLocaleString() + ' KRW';
    document.getElementById('totalPrice').innerText = orderData.totalPrice.toLocaleString() + ' KRW';
}

function updateReview() {
    document.getElementById('review-sport').innerText = orderData.sport.toUpperCase();
    document.getElementById('review-style').innerText = orderData.style.toUpperCase();
    document.getElementById('review-team').innerText = orderData.teamName;
    document.getElementById('review-qty').innerText = orderData.quantity + ' Units';
    document.getElementById('review-total').innerText = orderData.totalPrice.toLocaleString() + ' KRW';
}

function submitOrder() {
    // Mock API call
    const btn = document.querySelector('#step4 button');
    const originalText = btn.innerText;
    btn.innerText = 'Processing...';
    btn.disabled = true;

    setTimeout(() => {
        alert(`Thank you! Your order for ${orderData.teamName} has been submitted.\nWe will contact you shortly.`);
        location.reload(); // Reset for demo
    }, 1500);
}
