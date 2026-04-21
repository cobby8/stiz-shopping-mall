/**
 * STIZ Shopping Cart Logic
 * 비유: 마트 장바구니 — 비로그인이면 손에 들고 다니고(localStorage),
 *       로그인하면 카운터에 맡길 수 있다(서버 동기화).
 *
 * 핵심 원칙:
 * - 비로그인 → 기존 localStorage 동작 그대로 (변경 없음)
 * - 로그인 → localStorage 변경할 때마다 서버에도 반영
 * - 로그인 시점에 localStorage 장바구니를 서버에 merge
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
    (typeof stizToast === 'function' ? stizToast('장바구니에 추가되었습니다', { type: 'success' }) : alert('장바구니에 추가되었습니다!'));

    // 로그인 상태면 서버에도 동기화 (백그라운드, 실패해도 무시)
    _syncAddToServer(product);
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
    const removed = cart[index]; // 삭제될 항목 정보 보관 (서버 동기화용)
    cart.splice(index, 1);
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    if (typeof renderCart === 'function') renderCart();
    updateCartCount();

    // 로그인 상태면 서버에서도 삭제 (백그라운드)
    if (removed) _syncRemoveFromServer(removed);
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

// ===== 서버 동기화 함수들 =====

// 로그인 여부 확인 헬퍼 — JWT 토큰이 있으면 로그인 상태
function _getAuthToken() {
    return localStorage.getItem('stiz_token');
}

// 서버 요청 공통 헬퍼 — Authorization 헤더 자동 부착
async function _cartFetch(url, options = {}) {
    const token = _getAuthToken();
    if (!token) return null; // 비로그인이면 서버 호출 안 함

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
    };

    try {
        const res = await fetch(url, { ...options, headers });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.warn('[cart] 서버 동기화 실패 (오프라인?):', err.message);
        return null; // 서버 오류 시 localStorage만으로 동작 (graceful degradation)
    }
}

/**
 * 서버에 장바구니 항목 추가/수량 변경
 * addToCart 호출 후 백그라운드로 서버에도 반영
 */
async function _syncAddToServer(product) {
    await _cartFetch('/api/cart', {
        method: 'POST',
        body: JSON.stringify({
            productId: product.id,
            name: product.name,
            price: product.price,
            size: product.size || '',
            qty: parseInt(product.qty) || 1,
            image: product.image || ''
        })
    });
}

/**
 * 서버에서 장바구니 항목 삭제
 * 서버의 cart_items.id를 알아야 하므로 productId+size로 찾아서 삭제
 */
async function _syncRemoveFromServer(item) {
    const token = _getAuthToken();
    if (!token) return;

    // 서버에서 내 장바구니 조회 → 해당 항목의 서버 ID 찾기
    const result = await _cartFetch('/api/cart');
    if (!result || !result.items) return;

    const serverItem = result.items.find(
        si => si.productId == item.id && (si.size || '') === (item.size || '')
    );
    if (serverItem) {
        await _cartFetch(`/api/cart/${serverItem.id}`, { method: 'DELETE' });
    }
}

/**
 * 로그인 시 localStorage 장바구니를 서버에 병합
 * auth.js의 로그인 성공 후 호출해야 한다
 * 병합 후 서버 장바구니를 localStorage에 동기화 (서버가 마스터)
 */
async function syncCartOnLogin() {
    const localCart = getCart();

    // 서버에 localStorage 장바구니 병합 요청
    const result = await _cartFetch('/api/cart/merge', {
        method: 'POST',
        body: JSON.stringify({ items: localCart })
    });

    if (result && result.items) {
        // 서버 장바구니를 localStorage에 동기화 (서버가 최종 진실)
        const syncedCart = result.items.map(item => ({
            id: item.productId,
            name: item.name,
            price: item.price,
            image: item.image,
            size: item.size || '',
            qty: item.qty,
            addedAt: item.createdAt
        }));
        localStorage.setItem(CART_KEY, JSON.stringify(syncedCart));
        updateCartCount();
    }
}

/**
 * 로그아웃 시 장바구니 처리
 * 서버 장바구니는 유지하되, localStorage만 비운다
 */
function clearCartOnLogout() {
    localStorage.removeItem(CART_KEY);
    updateCartCount();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
});
