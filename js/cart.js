/**
 * STIZ Shopping Cart Logic
 * Uses localStorage to simulate a database.
 */

const CART_KEY = 'stiz_cart';

// 1. Get Cart Data
function getCart() {
    const cart = localStorage.getItem(CART_KEY);
    return cart ? JSON.parse(cart) : [];
}

// 2. Add to Cart
function addToCart(product) {
    const cart = getCart();
    // Check if same product exists (logic can be improved for options)
    const existing = cart.find(item => item.id === product.id && item.size === product.size);

    if (existing) {
        existing.qty += parseInt(product.qty);
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            size: product.size,
            qty: parseInt(product.qty),
            addedAt: new Date().toISOString()
        });
    }

    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
    alert('Item added to cart!');
}

// 3. Update Cart Count in Header (if exists)
function updateCartCount() {
    const cart = getCart();
    const count = cart.reduce((acc, item) => acc + item.qty, 0);
    const badge = document.getElementById('cart-count');
    if (badge) {
        badge.innerText = count;
        badge.classList.remove('hidden');
        if (count === 0) badge.classList.add('hidden');
    }
}

// 4. Remove Item
function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart(); // Refresh UI
    updateCartCount();
}

// 5. Clear Cart
function clearCart() {
    localStorage.removeItem(CART_KEY);
    renderCart();
    updateCartCount();
}

// 6. Calculate Total
function getCartTotal() {
    const cart = getCart();
    return cart.reduce((total, item) => total + (item.price * item.qty), 0);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
});
