/**
 * STIZ SHOP - 주문/결제 페이지
 * 비유: 마트 계산대 — 장바구니 내용을 확인하고, 정보 입력 후 결제를 진행한다.
 *
 * 결제 방식:
 *  - 토스페이먼츠: 카드/계좌이체/가상계좌/토스페이 등 PG 결제
 *  - 무통장 입금: 기존 계좌 안내 방식 (기본값)
 *
 * 토스페이먼츠 결제 흐름:
 *  1. 서버에서 clientKey를 받아 SDK 초기화
 *  2. tossPayments.requestPayment() → 토스 결제창 오픈
 *  3. 결제 성공 → successUrl로 리다이렉트 (paymentKey, orderId, amount 쿼리)
 *  4. 리다이렉트 후 서버에 POST /api/payment/confirm 으로 결제 승인 요청
 *  5. 서버가 토스 API로 확인 → 주문 생성 → 완료 화면
 *
 * 무통장 흐름:
 *  cart.js에서 데이터 → 주문자 정보 → POST /api/orders → 완료 (기존)
 */

const CHECKOUT_API = '/api/orders';

// 토스페이먼츠 설정 상태 — 서버에서 가져온다 (초기값: 미설정)
let tossConfig = { clientKey: '', enabled: false };
// 토스페이먼츠 SDK 인스턴스
let tossPayments = null;
let tossWidgets = null;

// 현재 선택된 결제 방법 ('bank' 또는 토스 결제 수단)
let selectedPayMethod = 'bank';

// ===== 페이지 초기화 =====
document.addEventListener('DOMContentLoaded', async () => {
  // 결제 성공 리다이렉트인지 확인 (토스페이먼츠에서 돌아온 경우)
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('status');

  if (paymentStatus === 'success') {
    // 토스 결제 성공 → 서버에 승인 요청
    await handleTossPaymentSuccess(urlParams);
    return; // 나머지 초기화 불필요
  }

  if (paymentStatus === 'fail') {
    // 토스 결제 실패/취소
    const errorMessage = urlParams.get('message') || '결제가 취소되었습니다.';
    alert(`결제 실패: ${errorMessage}`);
    // URL에서 쿼리 파라미터 제거 (깔끔하게)
    window.history.replaceState({}, '', 'checkout.html');
  }

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

  // 토스페이먼츠 설정 확인 — 서버에 키가 있으면 PG 결제 옵션 표시
  await checkTossConfig();
});

/**
 * 토스페이먼츠 설정 확인
 * 서버에 TOSS_CLIENT_KEY가 설정되어 있으면 PG 결제 옵션을 보여준다
 * 키가 없으면 무통장 입금만 표시 (기존과 동일)
 */
async function checkTossConfig() {
  try {
    const res = await fetch('/api/payment/config');
    const data = await res.json();

    if (data.success && data.enabled) {
      tossConfig = {
        clientKey: data.clientKey,
        enabled: true
      };

      // 토스페이먼츠 SDK 초기화
      // TossPayments 생성자에 clientKey를 넣으면 SDK가 준비된다
      if (window.TossPayments) {
        tossPayments = TossPayments(tossConfig.clientKey);
      }

      // PG 결제 수단 옵션들 표시
      const tossMethodsEl = document.getElementById('tossPayMethods');
      if (tossMethodsEl) tossMethodsEl.classList.remove('hidden');
    }
  } catch (err) {
    // 서버 오류 시 무통장만 표시 (graceful degradation)
    console.warn('[checkout] 토스페이먼츠 설정 확인 실패:', err.message);
  }
}

/**
 * 결제 방법 선택 UI 처리
 * 라디오 버튼 클릭 시 선택 상태 시각적 표시 + 계좌 정보 토글
 */
function selectPayMethod(method) {
  selectedPayMethod = method;

  // 모든 옵션의 테두리 초기화
  document.querySelectorAll('.pay-method-option').forEach(el => {
    el.classList.remove('border-brand-black', 'bg-gray-50');
    el.classList.add('border-gray-200');
  });

  // 선택된 옵션 강조
  const selected = document.querySelector(`.pay-method-option[data-method="${method}"]`);
  if (selected) {
    selected.classList.remove('border-gray-200');
    selected.classList.add('border-brand-black', 'bg-gray-50');
  }

  // 라디오 버튼 체크 상태 동기화
  const radio = document.querySelector(`input[name="payMethod"][value="${method}"]`);
  if (radio) radio.checked = true;

  // 무통장 입금 계좌 정보 표시/숨김
  const bankInfo = document.getElementById('bankInfo');
  if (bankInfo) {
    bankInfo.style.display = method === 'bank' ? 'block' : 'none';
  }
}

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
 * 입력값 검증 — 주문 제출 전 필수값 체크
 * 실패 시 null 반환, 성공 시 정리된 데이터 반환
 */
function validateAndGetFormData() {
  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const email = document.getElementById('customerEmail').value.trim();
  const recipientName = document.getElementById('recipientName').value.trim();
  const address = document.getElementById('shippingAddress').value.trim();
  const addressDetail = document.getElementById('shippingDetail').value.trim();
  const memo = document.getElementById('orderMemo').value.trim();

  if (!name) {
    alert('이름을 입력해주세요.');
    document.getElementById('customerName').focus();
    return null;
  }
  if (!phone) {
    alert('연락처를 입력해주세요.');
    document.getElementById('customerPhone').focus();
    return null;
  }
  const phoneClean = phone.replace(/-/g, '');
  if (phoneClean.length < 10 || phoneClean.length > 11) {
    alert('올바른 연락처를 입력해주세요.');
    document.getElementById('customerPhone').focus();
    return null;
  }

  const cart = getCart();
  if (cart.length === 0) {
    alert('장바구니가 비어있습니다.');
    return null;
  }

  return { name, phone, email, recipientName, address, addressDetail, memo, cart };
}

/**
 * 주문 데이터 조립 — PG결제/무통장 공통
 */
function buildOrderData(formData, payMethod, extraPayInfo = {}) {
  const { name, phone, email, recipientName, address, addressDetail, memo, cart } = formData;

  const items = cart.map(item => ({
    name: item.name,
    sport: '',
    category: '',
    quantity: item.qty,
    price: item.price,
    size: item.size || 'FREE',
    image: item.image || ''
  }));

  const subtotal = getCartTotal();
  const shipping = getShippingCost();
  const total = getGrandTotal();

  // payMethod가 'bank'이면 무통장, 그 외(카드/계좌이체/토스페이 등)는 PG 결제
  const isBankTransfer = (payMethod === 'bank');

  return {
    customer: {
      name, phone,
      email: email || '',
      teamName: ''
    },
    items,
    total,
    shipping: {
      address: address ? `${address} ${addressDetail}`.trim() : '',
      recipientName: recipientName || name,
    },
    payment: {
      method: isBankTransfer ? 'bank_transfer' : payMethod,
      totalAmount: total,
      subtotal,
      shipping,
      ...extraPayInfo  // PG 결제 시 paymentKey 등 추가
    },
    customerMemo: memo,
    type: 'shop',
    // PG 결제 완료 시 바로 결제 확인 상태, 무통장은 입금 대기
    status: isBankTransfer ? 'consult_started' : 'design_requested'
  };
}

/**
 * 주문 제출 (핵심 함수) — 결제 방법에 따라 분기
 */
async function submitOrder() {
  const formData = validateAndGetFormData();
  if (!formData) return;

  if (selectedPayMethod === 'bank') {
    // 무통장 입금 — 기존 로직 그대로
    await processBankTransfer(formData);
  } else {
    // 토스페이먼츠 PG 결제 — 결제창 호출
    await processTossPayment(formData);
  }
}

/**
 * 토스페이먼츠 결제 처리
 * 비유: 토스 결제창을 열고, 결제가 끝나면 우리 페이지로 다시 돌아오는 것
 *
 * 흐름:
 *  1. 주문 정보를 localStorage에 임시 저장 (리다이렉트 후 복원용)
 *  2. tossPayments.requestPayment() → 토스 결제창 오픈
 *  3. 결제 성공 → successUrl로 리다이렉트 (자동)
 *  4. 리다이렉트 후 handleTossPaymentSuccess()에서 이어서 처리
 */
async function processTossPayment(formData) {
  if (!tossPayments || !tossConfig.enabled) {
    alert('PG 결제를 사용할 수 없습니다. 무통장 입금을 이용해주세요.');
    return;
  }

  const total = getGrandTotal();
  // 주문 ID: 영문+숫자, 최소 6자 ~ 최대 64자 (토스 규격)
  const orderId = 'STIZ_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  // 주문 버튼 비활성화
  setSubmitButtonLoading(true);

  try {
    // 리다이렉트 후에도 주문 정보를 복원할 수 있도록 localStorage에 임시 저장
    // 토스페이먼츠는 결제 후 페이지를 새로 불러오므로, 폼 데이터가 사라진다
    const pendingOrder = {
      formData,
      orderId,
      payMethod: selectedPayMethod,
      total,
      savedAt: Date.now()
    };
    localStorage.setItem('stiz_pending_order', JSON.stringify(pendingOrder));

    // 주문 상품명 조합 (첫 번째 상품 + 외 N건)
    const cart = getCart();
    let orderName = cart[0].name;
    if (cart.length > 1) {
      orderName += ` 외 ${cart.length - 1}건`;
    }

    // 토스페이먼츠 v1 결제창 호출
    // v1: tossPayments.requestPayment(method, params)
    // method가 첫 번째 인자, 나머지가 두 번째 인자
    await tossPayments.requestPayment(selectedPayMethod, {
      amount: total,
      orderId: orderId,
      orderName: orderName,
      customerName: formData.name,
      customerEmail: formData.email || undefined,
      successUrl: window.location.origin + '/checkout.html?status=success',
      failUrl: window.location.origin + '/checkout.html?status=fail',
    });

  } catch (err) {
    // 사용자가 결제창을 닫거나 오류 발생
    console.warn('[checkout] 토스 결제 취소/오류:', err);
    // 임시 저장 데이터 정리
    localStorage.removeItem('stiz_pending_order');

    if (err.code === 'USER_CANCEL' || err.code === 'PAY_PROCESS_CANCELED') {
      // 사용자가 직접 취소한 경우 — 알림 없이 조용히 처리
      // 사용자가 결제를 취소 — 조용히 처리
    } else if (err.message) {
      alert(`결제 처리 중 오류가 발생했습니다.\n${err.message}`);
    }
    setSubmitButtonLoading(false);
  }
}

/**
 * 토스페이먼츠 결제 성공 후 처리
 * successUrl로 리다이렉트된 후 실행되는 함수
 *
 * 흐름:
 *  1. URL에서 paymentKey, orderId, amount 추출
 *  2. localStorage에서 임시 저장한 주문 정보 복원
 *  3. 서버에 POST /api/payment/confirm 으로 결제 승인 요청
 *  4. 서버가 토스 API로 확인 후 주문 생성
 *  5. 주문 완료 화면 표시
 */
async function handleTossPaymentSuccess(urlParams) {
  const paymentKey = urlParams.get('paymentKey');
  const orderId = urlParams.get('orderId');
  const amount = parseInt(urlParams.get('amount'), 10);

  // 필수 파라미터 검증
  if (!paymentKey || !orderId || !amount) {
    alert('결제 정보가 올바르지 않습니다. 다시 시도해주세요.');
    window.location.href = 'checkout.html';
    return;
  }

  // localStorage에서 임시 저장한 주문 정보 복원
  let pendingOrder = null;
  try {
    const saved = localStorage.getItem('stiz_pending_order');
    if (saved) pendingOrder = JSON.parse(saved);
  } catch (e) {
    console.warn('[checkout] 임시 주문 정보 복원 실패:', e);
  }

  // 주문 폼 숨기고 로딩 표시
  const checkoutForm = document.getElementById('checkoutForm');
  if (checkoutForm) {
    checkoutForm.innerHTML = `
      <section class="max-w-xl mx-auto px-4 py-20 text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-brand-black mx-auto mb-4"></div>
        <p class="text-gray-600">결제를 확인하고 있습니다...</p>
      </section>
    `;
  }

  try {
    // 1. 서버에 결제 승인 요청 (서버가 토스 API로 최종 확인)
    const confirmRes = await fetch('/api/payment/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    const confirmData = await confirmRes.json();

    if (!confirmData.success) {
      throw new Error(confirmData.error || '결제 승인에 실패했습니다.');
    }

    // 2. 결제 승인 성공 → 주문 생성
    // pendingOrder가 있으면 상세 정보 사용, 없으면 최소 정보로 생성
    let orderData;
    if (pendingOrder && pendingOrder.formData) {
      orderData = buildOrderData(pendingOrder.formData, pendingOrder.payMethod, {
        paymentKey,
        orderId: orderId,
        tossOrderId: orderId,
        paid_amount: amount
      });
    } else {
      // 임시 저장 정보 없을 때 최소 주문 데이터
      orderData = {
        customer: { name: '결제 확인 필요', phone: '', email: '', teamName: '' },
        items: [],
        total: amount,
        shipping: { address: '', recipientName: '' },
        payment: {
          method: 'toss',
          totalAmount: amount,
          paymentKey,
          tossOrderId: orderId
        },
        customerMemo: '',
        type: 'shop',
        status: 'design_requested'
      };
    }

    const orderRes = await fetch(CHECKOUT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    const orderResult = await orderRes.json();

    if (!orderResult.success) {
      throw new Error(orderResult.error || '주문 처리에 실패했습니다.');
    }

    // 3. 주문 완료 — 장바구니 비우기 + 임시 데이터 정리
    clearCart();
    localStorage.removeItem('stiz_pending_order');

    // URL에서 쿼리 파라미터 제거
    window.history.replaceState({}, '', 'checkout.html');

    // 완료 화면 표시
    showOrderComplete(orderResult.orderNumber, amount, 'card');

  } catch (err) {
    console.error('[checkout] 결제 확인/주문 처리 실패:', err);
    alert(`결제는 완료되었으나 주문 처리에 실패했습니다.\n고객센터에 문의해주세요.\n\n주문ID: ${orderId}\n${err.message}`);
    // 임시 데이터 정리
    localStorage.removeItem('stiz_pending_order');
    window.history.replaceState({}, '', 'checkout.html');
  }
}

/**
 * 무통장 입금 처리 — 기존 로직 그대로
 */
async function processBankTransfer(formData) {
  setSubmitButtonLoading(true);

  try {
    const orderData = buildOrderData(formData, 'bank');

    const res = await fetch(CHECKOUT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    const result = await res.json();

    if (!result.success) {
      throw new Error(result.error || '주문 처리에 실패했습니다.');
    }

    // 주문 성공 → 장바구니 비우기 + 완료 화면
    clearCart();
    showOrderComplete(result.orderNumber, getGrandTotal(), 'bank');

  } catch (err) {
    console.error('[checkout] 주문 실패:', err);
    alert(`주문에 실패했습니다.\n${err.message}`);
    setSubmitButtonLoading(false);
  }
}

/**
 * 주문 완료 화면 표시
 * 결제 방법에 따라 다른 안내 문구 표시
 */
function showOrderComplete(orderNumber, total, method) {
  document.getElementById('resultOrderNumber').textContent = orderNumber;
  document.getElementById('resultTotal').textContent = `${total.toLocaleString()}원`;

  // 결제 방법에 따라 안내 문구 분기
  const subtitle = document.getElementById('resultSubtitle');
  const bankInfo = document.getElementById('resultBankInfo');
  const cardInfo = document.getElementById('resultCardInfo');

  if (method !== 'bank') {
    // PG 결제: 입금 안내 숨기고 결제 완료 표시
    subtitle.textContent = '결제가 정상 처리되었습니다.';
    if (bankInfo) bankInfo.classList.add('hidden');
    if (cardInfo) cardInfo.classList.remove('hidden');
  } else {
    // 무통장 입금: 계좌 안내 표시
    subtitle.textContent = '아래 계좌로 입금해주시면 주문이 확정됩니다.';
    if (bankInfo) bankInfo.classList.remove('hidden');
    if (cardInfo) cardInfo.classList.add('hidden');
  }

  // 폼 숨기고 완료 화면 표시
  document.getElementById('checkoutForm').classList.add('hidden');
  document.getElementById('orderComplete').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 주문 버튼 로딩 상태 토글
 */
function setSubmitButtonLoading(loading) {
  const submitBtn = document.getElementById('submitOrder');
  if (!submitBtn) return; // 리다이렉트 후에는 버튼이 없을 수 있음
  if (loading) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
      주문 처리 중...
    `;
  } else {
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
