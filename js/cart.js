/**
 * STIZ Shopping Cart Logic
 * Uses localStorage to simulate a database.
 */

const CART_KEY = 'stiz_cart';
const FREE_SHIPPING_THRESHOLD = 50000;
const SHIPPING_COST = 3000;

// 1. Get Cart Data
function getCart() {
    const cart = localStorage.getItem(CART_KEY);
    return cart ? JSON.parse(cart) : [];
}

// 2. Add to Cart
function addToCart(product) {
    const cart = getCart();
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
    alert('장바구니에 추가되었습니다!');
}

// 3. Update Cart Count in Header
function updateCartCount() {
    const cart = getCart();
    const count = cart.reduce((acc, item) => acc + item.qty, 0);
    // Update all cart badges (header may have one too)
    document.querySelectorAll('.cart-count-badge').forEach(badge => {
        badge.innerText = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    });
    // Also update the header badge rendered by header_render.js
    const headerBadge = document.querySelector('header .bg-red-600');
    if (headerBadge) {
        headerBadge.innerText = count;
        headerBadge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// 4. Update Item Quantity
function updateCartItemQty(index, newQty) {
    const cart = getCart();
    if (index < 0 || index >= cart.length) return;

    newQty = parseInt(newQty);
    if (newQty <= 0) {
        removeFromCart(index);
        return;
    }

    cart[index].qty = newQty;
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    if (typeof renderCart === 'function') renderCart();
    updateCartCount();
}

// 5. Remove Item
function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    if (typeof renderCart === 'function') renderCart();
    updateCartCount();
}

// 6. Clear Cart
function clearCart() {
    localStorage.removeItem(CART_KEY);
    if (typeof renderCart === 'function') renderCart();
    updateCartCount();
}

// 7. Calculate Subtotal
function getCartTotal() {
    const cart = getCart();
    return cart.reduce((total, item) => total + (item.price * item.qty), 0);
}

// 8. Calculate Shipping
function getShippingCost() {
    const subtotal = getCartTotal();
    if (subtotal === 0) return 0;
    return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
}

// 9. Calculate Grand Total
function getGrandTotal() {
    return getCartTotal() + getShippingCost();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
});
