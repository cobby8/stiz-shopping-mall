/**
 * STIZ SHOP - 주문/결제 페이지
 * 비유: 마트 계산대 — 장바구니 내용을 확인하고, 정보 입력 후 결제를 진행한다.
 *
 * 흐름: cart.js에서 장바구니 데이터 가져오기 -> 주문자 정보 입력 -> POST /api/orders -> 완료 화면
 */

const CHECKOUT_API = '/api/orders';

// ===== 페이지 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  const cart = getCart();

  // 장바구니가 비어있으면 장바구니 페이지로 리다이렉트
  if (cart.length === 0) {
    alert('장바구니가 비어있습니다.');
    location.href = 'cart.html';
    return;
  }

  renderOrderItems();   // 주문 상품 목록 렌더링
  renderOrderSummary(); // 금액 요약 렌더링
  bindPhoneFormat();    // 전화번호 자동 하이픈
});

/**
 * 주문 상품 목록 렌더링 (사이드바)
 * 장바구니 아이템을 간략하게 보여준다
 */
function renderOrderItems() {
  const cart = getCart();
  const container = document.getElementById('orderItems');

  container.innerHTML = cart.map(item => {
    const imgSrc = item.image || `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="#f3f4f6"><rect width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9ca3af" font-size="10">No</text></svg>')}`;

    return `
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0">
          <img src="${imgSrc}" alt="${item.name}" class="w-full h-full object-cover">
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${item.name}</p>
          <p class="text-xs text-gray-400">${item.size || 'FREE'} / ${item.qty}개</p>
        </div>
        <p class="text-sm font-medium flex-shrink-0">${(item.price * item.qty).toLocaleString()}원</p>
      </div>
    `;
  }).join('');
}

/**
 * 금액 요약 렌더링
 * cart.js의 계산 함수들 재활용
 */
function renderOrderSummary() {
  const subtotal = getCartTotal();
  const shipping = getShippingCost();
  const total = getGrandTotal();

  document.getElementById('orderSubtotal').textContent = `${subtotal.toLocaleString()}원`;

  const shippingEl = document.getElementById('orderShipping');
  if (shipping === 0 && subtotal > 0) {
    shippingEl.textContent = '무료';
    shippingEl.className = 'font-medium text-green-600';
  } else {
    shippingEl.textContent = `${shipping.toLocaleString()}원`;
    shippingEl.className = 'font-medium';
  }

  document.getElementById('orderTotal').textContent = `${total.toLocaleString()}원`;
}

/**
 * 전화번호 입력 시 자동 하이픈 삽입
 * 01012345678 -> 010-1234-5678
 */
function bindPhoneFormat() {
  const phoneInput = document.getElementById('customerPhone');
  phoneInput.addEventListener('input', (e) => {
    // 숫자만 남기고 하이픈 자동 삽입
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 3 && val.length <= 7) {
      val = val.slice(0, 3) + '-' + val.slice(3);
    } else if (val.length > 7) {
      val = val.slice(0, 3) + '-' + val.slice(3, 7) + '-' + val.slice(7, 11);
    }
    e.target.value = val;
  });
}

/**
 * 주문 제출 (핵심 함수)
 * 입력값 검증 -> POST /api/orders -> 성공 시 완료 화면 표시 + 장바구니 비우기
 */
async function submitOrder() {
  // --- 1. 입력값 가져오기 ---
  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const email = document.getElementById('customerEmail').value.trim();
  const recipientName = document.getElementById('recipientName').value.trim();
  const address = document.getElementById('shippingAddress').value.trim();
  const addressDetail = document.getElementById('shippingDetail').value.trim();
  const memo = document.getElementById('orderMemo').value.trim();

  // --- 2. 필수 입력값 검증 ---
  if (!name) {
    alert('이름을 입력해주세요.');
    document.getElementById('customerName').focus();
    return;
  }
  if (!phone) {
    alert('연락처를 입력해주세요.');
    document.getElementById('customerPhone').focus();
    return;
  }
  // 전화번호 형식 검증 (하이픈 포함/미포함 모두 허용)
  const phoneClean = phone.replace(/-/g, '');
  if (phoneClean.length < 10 || phoneClean.length > 11) {
    alert('올바른 연락처를 입력해주세요.');
    document.getElementById('customerPhone').focus();
    return;
  }

  // --- 3. 장바구니 데이터를 주문 아이템으로 변환 ---
  const cart = getCart();
  if (cart.length === 0) {
    alert('장바구니가 비어있습니다.');
    return;
  }

  // POST /api/orders에 맞는 형식으로 변환
  const items = cart.map(item => ({
    name: item.name,
    sport: '',              // 기성품 주문이므로 빈값
    category: '',
    quantity: item.qty,
    price: item.price,
    size: item.size || 'FREE',
    image: item.image || ''
  }));

  const subtotal = getCartTotal();
  const shipping = getShippingCost();
  const total = getGrandTotal();

  // --- 4. 주문 데이터 조립 ---
  const orderData = {
    customer: {
      name: name,
      phone: phone,
      email: email || '',
      teamName: ''           // 기성품 주문에는 팀명 없음
    },
    items: items,
    total: total,
    // 배송 정보 (선택)
    shipping: {
      address: address ? `${address} ${addressDetail}`.trim() : '',
      recipientName: recipientName || name,
    },
    // 결제 정보
    payment: {
      method: 'bank_transfer',  // 무통장 입금
      totalAmount: total,
      subtotal: subtotal,
      shipping: shipping,
    },
    // 고객 메모
    customerMemo: memo,
    // 주문 타입 구분
    type: 'shop',              // 쇼핑몰 기성품 주문
    status: 'consult_started'  // 초기 상태 (입금 대기)
  };

  // --- 5. API 호출 ---
  const submitBtn = document.getElementById('submitOrder');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
    주문 처리 중...
  `;

  try {
    const res = await fetch(CHECKOUT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    const result = await res.json();

    if (!result.success) {
      throw new Error(result.error || '주문 처리에 실패했습니다.');
    }

    // --- 6. 주문 성공 ---
    // 장바구니 비우기
    clearCart();

    // 완료 화면에 주문 정보 표시
    document.getElementById('resultOrderNumber').textContent = result.orderNumber;
    document.getElementById('resultTotal').textContent = `${total.toLocaleString()}원`;

    // 폼 숨기고 완료 화면 표시
    document.getElementById('checkoutForm').classList.add('hidden');
    document.getElementById('orderComplete').classList.remove('hidden');

    // 페이지 최상단으로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    console.error('[checkout] 주문 실패:', err);
    alert(`주문에 실패했습니다.\n${err.message}`);

    // 버튼 복구
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
      <span class="material-symbols-outlined text-xl">check_circle</span>
      주문하기
    `;
  }
}

/**
 * 주문번호 복사 (완료 화면)
 */
function copyOrderNumber() {
  const orderNumber = document.getElementById('resultOrderNumber').textContent;
  navigator.clipboard.writeText(orderNumber).then(() => {
    alert('주문번호가 복사되었습니다!');
  }).catch(() => {
    prompt('아래 주문번호를 복사하세요:', orderNumber);
  });
}
