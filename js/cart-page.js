/**
 * STIZ SHOP - 장바구니 페이지 전용 렌더링
 * cart.js의 유틸 함수(getCart, updateCartItemQty, removeFromCart 등)를 재활용한다.
 * 이 파일은 cart.html 전용 UI 렌더링만 담당한다.
 */

// ===== 페이지 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  renderCart();         // 장바구니 아이템 렌더링
  bindCheckAllEvent();  // 전체 선택 체크박스 이벤트
});

/**
 * 장바구니 아이템 목록 렌더링
 * cart.js의 getCart()에서 localStorage 데이터를 가져와 화면에 뿌린다.
 */
function renderCart() {
  const cart = getCart();
  const container = document.getElementById('cartItems');
  const emptyMsg = document.getElementById('emptyCart');
  const checkoutBtn = document.getElementById('checkoutBtn');

  // 장바구니가 비어있으면 빈 메시지 표시
  if (cart.length === 0) {
    container.innerHTML = '';
    emptyMsg.classList.remove('hidden');
    checkoutBtn.disabled = true;
    updateSummary();
    return;
  }

  emptyMsg.classList.add('hidden');
  checkoutBtn.disabled = false;

  // 아이템 개수 표시
  document.getElementById('cartItemCount').textContent = `${cart.length}개의 상품`;

  // 각 아이템을 카드로 렌더링
  container.innerHTML = cart.map((item, index) => {
    // 이미지가 없으면 기본 플레이스홀더
    const imgSrc = item.image || `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="#f3f4f6"><rect width="200" height="200"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9ca3af" font-size="12">No Image</text></svg>')}`;

    return `
      <div class="flex items-start gap-4 py-5 border-b border-gray-100 cart-item" data-index="${index}">
        <!-- 체크박스 -->
        <input type="checkbox" class="item-check w-4 h-4 accent-brand-black mt-3 flex-shrink-0" checked data-index="${index}">

        <!-- 상품 이미지 -->
        <div class="w-20 h-20 md:w-24 md:h-24 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0">
          <img src="${imgSrc}" alt="${item.name}" class="w-full h-full object-cover">
        </div>

        <!-- 상품 정보 -->
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-medium truncate">${item.name}</h3>
          <p class="text-xs text-gray-400 mt-0.5">사이즈: ${item.size || 'FREE'}</p>
          <p class="text-sm font-bold mt-2">${item.price.toLocaleString()}원</p>

          <!-- 수량 조절 -->
          <div class="flex items-center gap-3 mt-3">
            <div class="flex items-center border border-gray-200 rounded-lg">
              <button onclick="changeItemQty(${index}, -1)"
                class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-brand-black transition-colors">
                <span class="material-symbols-outlined text-lg">remove</span>
              </button>
              <span class="w-10 h-8 flex items-center justify-center text-sm font-medium border-x border-gray-200">${item.qty}</span>
              <button onclick="changeItemQty(${index}, 1)"
                class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-brand-black transition-colors">
                <span class="material-symbols-outlined text-lg">add</span>
              </button>
            </div>
            <!-- 삭제 버튼 -->
            <button onclick="removeItem(${index})" class="text-gray-300 hover:text-brand-red transition-colors" title="삭제">
              <span class="material-symbols-outlined text-xl">delete</span>
            </button>
          </div>
        </div>

        <!-- 소계 (가격 x 수량) -->
        <div class="text-right flex-shrink-0 mt-2">
          <p class="text-sm font-bold">${(item.price * item.qty).toLocaleString()}원</p>
        </div>
      </div>
    `;
  }).join('');

  updateSummary();
}

/**
 * 주문 요약 금액 업데이트
 * cart.js의 getCartTotal(), getShippingCost(), getGrandTotal() 재활용
 */
function updateSummary() {
  const subtotal = getCartTotal();
  const shipping = getShippingCost();
  const total = getGrandTotal();

  // 금액 표시 업데이트
  document.getElementById('summarySubtotal').textContent = `${subtotal.toLocaleString()}원`;
  document.getElementById('summaryTotal').textContent = `${total.toLocaleString()}원`;

  // 배송비 표시 (무료면 초록색)
  const shippingEl = document.getElementById('summaryShipping');
  if (subtotal === 0) {
    shippingEl.textContent = '0원';
    shippingEl.className = 'font-medium';
  } else if (shipping === 0) {
    shippingEl.textContent = '무료';
    shippingEl.className = 'font-medium text-green-600';
  } else {
    shippingEl.textContent = `${shipping.toLocaleString()}원`;
    shippingEl.className = 'font-medium';
  }

  // 무료배송 프로그레스 바
  const barWrap = document.getElementById('freeShippingBar');
  const barEl = document.getElementById('shippingProgress');
  const msgEl = document.getElementById('shippingMessage');

  if (subtotal > 0 && subtotal < 50000) {
    // 5만원 미만: 얼마 더 사면 무료배송인지 안내
    barWrap.classList.remove('hidden');
    const pct = Math.min((subtotal / 50000) * 100, 100);
    barEl.style.width = pct + '%';
    barEl.className = 'bg-brand-black h-1.5 rounded-full transition-all duration-300';
    const remaining = 50000 - subtotal;
    msgEl.textContent = `${remaining.toLocaleString()}원 더 구매 시 무료배송`;
    msgEl.className = 'text-xs text-gray-400 mt-1';
  } else if (subtotal >= 50000) {
    // 5만원 이상: 무료배송 달성
    barWrap.classList.remove('hidden');
    barEl.style.width = '100%';
    barEl.className = 'bg-green-500 h-1.5 rounded-full transition-all duration-300';
    msgEl.textContent = '무료배송이 적용됩니다!';
    msgEl.className = 'text-xs text-green-600 font-medium mt-1';
  } else {
    barWrap.classList.add('hidden');
  }

  // 아이템 개수 업데이트
  const cart = getCart();
  document.getElementById('cartItemCount').textContent = `${cart.length}개의 상품`;
}

/**
 * 수량 변경 (+-1)
 * cart.js의 updateCartItemQty를 호출하면 내부에서 renderCart도 자동 호출
 */
function changeItemQty(index, delta) {
  const cart = getCart();
  if (index < 0 || index >= cart.length) return;
  const newQty = cart[index].qty + delta;
  updateCartItemQty(index, newQty);
}

/**
 * 아이템 삭제
 * cart.js의 removeFromCart 호출 (내부에서 renderCart 자동 호출)
 */
function removeItem(index) {
  removeFromCart(index);
}

/**
 * 선택된 아이템 삭제
 * 체크된 아이템만 골라서 역순으로 삭제 (인덱스 꼬임 방지)
 */
function removeSelected() {
  const checks = document.querySelectorAll('.item-check:checked');
  if (checks.length === 0) {
    alert('삭제할 상품을 선택해주세요.');
    return;
  }

  if (!confirm(`${checks.length}개 상품을 삭제하시겠습니까?`)) return;

  // 역순으로 삭제해야 인덱스가 밀리지 않음
  const indices = Array.from(checks).map(c => parseInt(c.dataset.index)).sort((a, b) => b - a);
  const cart = getCart();
  indices.forEach(i => cart.splice(i, 1));
  localStorage.setItem('stiz_cart', JSON.stringify(cart));

  renderCart();
  updateCartCount(); // cart.js의 헤더 배지 업데이트
}

/**
 * 전체 선택 체크박스 이벤트
 */
function bindCheckAllEvent() {
  const checkAll = document.getElementById('checkAll');
  checkAll.addEventListener('change', () => {
    document.querySelectorAll('.item-check').forEach(c => {
      c.checked = checkAll.checked;
    });
  });
}

/**
 * 주문하기 (checkout 페이지로 이동)
 */
function goToCheckout() {
  const cart = getCart();
  if (cart.length === 0) {
    (typeof stizToast === 'function' ? stizToast('장바구니가 비어있습니다', { type: 'error' }) : alert('장바구니가 비어있습니다.'));
    return;
  }
  location.href = 'checkout.html';
}
