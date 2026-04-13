/**
 * STIZ SHOP - 주문/결제 페이지
 * 비유: 마트 계산대 — 장바구니 내용을 확인하고, 정보 입력 후 결제를 진행한다.
 *
 * 결제 방식:
 *  - 카드 결제: PortOne(아임포트) SDK를 통해 PG 결제창 호출
 *  - 무통장 입금: 기존 계좌 안내 방식 (기본값)
 *
 * 흐름:
 *  카드: cart.js에서 데이터 → 주문자 정보 → PortOne 결제창 → 서버 검증 → 완료
 *  무통장: cart.js에서 데이터 → 주문자 정보 → POST /api/orders → 완료 (기존)
 */

const CHECKOUT_API = '/api/orders';

// PortOne 설정 상태 — 서버에서 가져온다 (초기값: 미설정)
let portOneConfig = { merchantId: '', configured: false };

// 현재 선택된 결제 방법 ('bank' 또는 'card')
let selectedPayMethod = 'bank';

// ===== 페이지 초기화 =====
document.addEventListener('DOMContentLoaded', async () => {
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

  // PortOne 설정 확인 — 서버에 키가 있으면 카드 결제 옵션 표시
  await checkPortOneConfig();
});

/**
 * PortOne 설정 확인
 * 서버에 PORTONE 키가 설정되어 있으면 카드 결제 옵션을 보여준다
 * 키가 없으면 무통장 입금만 표시 (기존과 동일)
 */
async function checkPortOneConfig() {
  try {
    const res = await fetch('/api/payment/config');
    const data = await res.json();

    if (data.success && data.configured) {
      portOneConfig = {
        merchantId: data.merchantId,
        configured: true
      };
      // 카드 결제 옵션 표시
      const cardOption = document.getElementById('payMethodCard');
      if (cardOption) cardOption.classList.remove('hidden');

      // PortOne SDK 초기화
      if (window.IMP) {
        window.IMP.init(portOneConfig.merchantId);
      }
    }
  } catch (err) {
    // 서버 오류 시 무통장만 표시 (graceful degradation)
    console.warn('[checkout] PortOne 설정 확인 실패:', err.message);
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
 * 주문 데이터 조립 — 카드/무통장 공통
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
      method: payMethod === 'card' ? 'card' : 'bank_transfer',
      totalAmount: total,
      subtotal,
      shipping,
      ...extraPayInfo  // 카드 결제 시 imp_uid, merchant_uid 등 추가
    },
    customerMemo: memo,
    type: 'shop',
    // 카드 결제 완료 시 바로 결제 확인 상태, 무통장은 입금 대기
    status: payMethod === 'card' ? 'design_requested' : 'consult_started'
  };
}

/**
 * 주문 제출 (핵심 함수) — 결제 방법에 따라 분기
 */
async function submitOrder() {
  const formData = validateAndGetFormData();
  if (!formData) return;

  if (selectedPayMethod === 'card') {
    await processCardPayment(formData);
  } else {
    await processBankTransfer(formData);
  }
}

/**
 * 카드 결제 처리 — PortOne 결제창 호출
 * 비유: 카드 결제기에 카드를 대면 결제창이 뜨고, 완료되면 서버에서 검증하는 것
 */
async function processCardPayment(formData) {
  const IMP = window.IMP;
  if (!IMP || !portOneConfig.configured) {
    alert('카드 결제를 사용할 수 없습니다. 무통장 입금을 이용해주세요.');
    return;
  }

  const total = getGrandTotal();
  const merchantUid = `order_${Date.now()}`;

  // 주문 버튼 비활성화
  setSubmitButtonLoading(true);

  try {
    // 1. 결제 사전 등록 — 서버에 "이 주문은 XX원" 기록 (위변조 방지)
    const prepareRes = await fetch('/api/payment/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant_uid: merchantUid, amount: total })
    });
    const prepareData = await prepareRes.json();
    if (!prepareData.success) {
      throw new Error(prepareData.error || '결제 사전 등록 실패');
    }

    // 2. PortOne 결제창 호출
    IMP.request_pay({
      pg: 'html5_inicis',          // PG사 (이니시스)
      pay_method: 'card',           // 결제 수단
      merchant_uid: merchantUid,    // 주문번호 (우리 시스템)
      name: '스티즈 주문',           // 결제창에 표시될 상품명
      amount: total,                // 결제 금액
      buyer_name: formData.name,
      buyer_tel: formData.phone,
      buyer_email: formData.email || undefined,
    }, async (rsp) => {
      if (rsp.success) {
        // 3. 결제 성공 → 서버에서 금액 검증
        try {
          const verifyRes = await fetch('/api/payment/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imp_uid: rsp.imp_uid,
              merchant_uid: rsp.merchant_uid,
              paid_amount: total
            })
          });
          const verifyData = await verifyRes.json();

          if (!verifyData.success) {
            throw new Error(verifyData.error || '결제 검증 실패');
          }

          // 4. 검증 통과 → 주문 생성
          const orderData = buildOrderData(formData, 'card', {
            imp_uid: rsp.imp_uid,
            merchant_uid: rsp.merchant_uid,
            paid_amount: total
          });

          const orderRes = await fetch(CHECKOUT_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
          });
          const orderResult = await orderRes.json();

          if (!orderResult.success) {
            throw new Error(orderResult.error || '주문 처리 실패');
          }

          // 5. 주문 완료
          clearCart();
          showOrderComplete(orderResult.orderNumber, total, 'card');

        } catch (err) {
          console.error('[checkout] 결제 검증/주문 실패:', err);
          alert(`결제는 완료되었으나 주문 처리에 실패했습니다.\n고객센터에 문의해주세요.\n\n결제번호: ${rsp.imp_uid}\n${err.message}`);
          setSubmitButtonLoading(false);
        }
      } else {
        // 결제 실패 또는 취소
        console.warn('[checkout] 결제 실패/취소:', rsp.error_msg);
        if (rsp.error_msg) {
          alert(`결제가 취소되었습니다.\n${rsp.error_msg}`);
        }
        setSubmitButtonLoading(false);
      }
    });
  } catch (err) {
    console.error('[checkout] 카드 결제 오류:', err);
    alert(`결제 처리 중 오류가 발생했습니다.\n${err.message}`);
    setSubmitButtonLoading(false);
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

  if (method === 'card') {
    // 카드 결제: 입금 안내 숨기고 결제 완료 표시
    subtitle.textContent = '카드 결제가 정상 처리되었습니다.';
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
