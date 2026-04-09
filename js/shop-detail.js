/**
 * STIZ SHOP - 고객용 상품 상세 페이지
 * 비유: 매장에서 상품을 집어들고 자세히 살펴보는 것
 *
 * 기능: 상품 상세 조회, 이미지 갤러리, 사이즈 선택, 수량 조절, 장바구니 담기
 * API: GET /api/products/:id (상품 상세 + 이미지 + 옵션 + 관련 상품)
 */

// ===== 전역 상태 =====
const detailState = {
  product: null,       // 상품 데이터
  images: [],          // 이미지 배열
  options: {},         // 옵션 (sizes, colors 등)
  related: [],         // 관련 상품
  selectedSize: null,  // 선택된 사이즈
  selectedOption: null,// 선택된 옵션 객체 (추가금액 등)
  qty: 1               // 수량
};

const API_BASE = '/api';

// ===== 페이지 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  // URL에서 상품 ID 추출
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    // ID가 없으면 목록으로 리다이렉트
    alert('잘못된 접근입니다.');
    location.href = 'shop.html';
    return;
  }

  loadProductDetail(productId);
  bindTabEvents();
  bindQtyEvents();
});

// ===== 상품 상세 로드 =====
async function loadProductDetail(id) {
  try {
    const res = await fetch(`${API_BASE}/products/${id}`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || '상품을 찾을 수 없습니다.');
    }

    detailState.product = data.product;
    detailState.images = data.images || [];
    detailState.options = data.options || {};
    detailState.related = data.related || [];

    // 페이지 렌더링
    renderProductInfo();
    renderImageGallery();
    renderSizeOptions();
    renderDescription();
    renderRelated();
    updateTotalPrice();

    // 페이지 타이틀 업데이트
    document.title = `${data.product.name} - STIZ SHOP`;

  } catch (err) {
    console.error('[shop-detail] 상품 로드 실패:', err);
    document.querySelector('section').innerHTML = `
      <div class="text-center py-20">
        <span class="material-symbols-outlined text-6xl text-gray-300">error_outline</span>
        <p class="text-gray-500 mt-4 text-lg">상품을 찾을 수 없습니다</p>
        <a href="shop.html" class="inline-block mt-4 text-sm text-brand-red hover:underline">쇼핑몰로 돌아가기</a>
      </div>`;
  }
}

// ===== 상품 기본 정보 렌더링 =====
function renderProductInfo() {
  const p = detailState.product;

  // 브레드크럼에 상품명 표시
  document.getElementById('breadcrumbName').textContent = p.name;

  // 카테고리
  document.getElementById('categoryName').textContent = p.categoryName || '';

  // 타입 배지 (커스텀이면 표시)
  const badge = document.getElementById('typeBadge');
  if (p.type === 'custom') {
    badge.textContent = '커스텀';
    badge.className = 'text-xs px-2 py-0.5 rounded-full font-medium bg-brand-red text-white';
  }

  // 상품명
  document.getElementById('productName').textContent = p.name;
  document.getElementById('productNameEn').textContent = p.nameEn || '';

  // 가격 영역
  renderPriceArea(p);
}

/**
 * 가격 영역 렌더링
 * 기성품: 정가 + 클럽가(할인가)
 * 커스텀: "~기본가" + 옵션에 따라 변동 안내
 */
function renderPriceArea(product) {
  const area = document.getElementById('priceArea');
  const price = product.price || 0;

  if (product.type === 'custom') {
    area.innerHTML = `
      <p class="text-2xl font-bold text-brand-black">~${price.toLocaleString()}원</p>
      <p class="text-sm text-gray-400 mt-1">옵션에 따라 가격이 변동될 수 있습니다</p>
    `;
    return;
  }

  // 기성품: 클럽가가 있으면 할인 표시
  if (product.clubPrice && product.clubPrice < price) {
    const discountRate = Math.round((1 - product.clubPrice / price) * 100);
    area.innerHTML = `
      <div class="flex items-baseline gap-3">
        <span class="text-lg font-bold text-brand-red">${discountRate}%</span>
        <span class="text-2xl font-bold text-brand-black">${product.clubPrice.toLocaleString()}원</span>
      </div>
      <p class="text-sm text-gray-400 line-through mt-1">${price.toLocaleString()}원</p>
    `;
  } else {
    area.innerHTML = `<p class="text-2xl font-bold text-brand-black">${price.toLocaleString()}원</p>`;
  }
}

// ===== 이미지 갤러리 렌더링 =====
function renderImageGallery() {
  const mainImg = document.getElementById('mainImage');
  const thumbList = document.getElementById('thumbList');

  // 이미지가 없는 경우 — 기본 플레이스홀더
  if (detailState.images.length === 0) {
    const placeholder = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" fill="#f3f4f6"><rect width="600" height="600"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9ca3af" font-size="20">No Image</text></svg>')}`;
    mainImg.src = placeholder;
    return;
  }

  // 대표 이미지(isPrimary=1)를 메인에 표시
  const primary = detailState.images.find(img => img.isPrimary) || detailState.images[0];
  mainImg.src = primary.url;
  mainImg.alt = primary.alt || detailState.product.name;

  // 이미지가 2장 이상이면 썸네일 리스트 표시
  if (detailState.images.length > 1) {
    thumbList.innerHTML = detailState.images.map((img, idx) => `
      <button class="thumb-item flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden border-2 ${img === primary ? 'active border-brand-black' : 'border-gray-200'}"
              onclick="selectImage(${idx})">
        <img src="${img.url}" alt="${img.alt || ''}" class="w-full h-full object-cover">
      </button>
    `).join('');
  }
}

/**
 * 썸네일 클릭 시 메인 이미지 교체
 */
function selectImage(index) {
  const img = detailState.images[index];
  if (!img) return;

  document.getElementById('mainImage').src = img.url;

  // 썸네일 활성 상태 토글
  document.querySelectorAll('.thumb-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
    el.classList.toggle('border-brand-black', i === index);
    el.classList.toggle('border-gray-200', i !== index);
  });
}

// ===== 사이즈 옵션 렌더링 =====
function renderSizeOptions() {
  const sizeSection = document.getElementById('sizeSection');
  const sizeButtons = document.getElementById('sizeButtons');
  const sizes = detailState.options.sizes;

  // 사이즈 옵션이 없으면 섹션 숨김
  if (!sizes || sizes.length === 0) {
    sizeSection.classList.add('hidden');
    return;
  }

  sizeButtons.innerHTML = sizes.map(opt => {
    // 재고가 0이면 품절 처리
    const isOutOfStock = opt.stock !== null && opt.stock !== undefined && opt.stock <= 0;
    const classes = isOutOfStock ? 'size-btn out-of-stock' : 'size-btn';

    return `
      <button class="${classes} px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium transition-colors hover:border-brand-black"
              data-size="${opt.value}" data-price="${opt.additionalPrice || 0}" data-stock="${opt.stock ?? ''}"
              ${isOutOfStock ? 'disabled' : ''}
              onclick="selectSize(this)">
        ${opt.value}
        ${opt.additionalPrice ? `<span class="text-xs text-gray-400 ml-1">(+${opt.additionalPrice.toLocaleString()})</span>` : ''}
      </button>
    `;
  }).join('');
}

/**
 * 사이즈 선택 핸들러
 */
function selectSize(btn) {
  // 이전 선택 해제
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));

  // 새 선택 활성화
  btn.classList.add('selected');

  detailState.selectedSize = btn.dataset.size;
  detailState.selectedOption = {
    value: btn.dataset.size,
    additionalPrice: parseInt(btn.dataset.price) || 0
  };

  updateTotalPrice();
}

// ===== 수량 조절 =====
function bindQtyEvents() {
  const qtyInput = document.getElementById('qtyInput');
  qtyInput.addEventListener('change', () => {
    let val = parseInt(qtyInput.value) || 1;
    val = Math.max(1, Math.min(99, val));
    qtyInput.value = val;
    detailState.qty = val;
    updateTotalPrice();
  });
}

function changeQty(delta) {
  const qtyInput = document.getElementById('qtyInput');
  let newQty = (parseInt(qtyInput.value) || 1) + delta;
  newQty = Math.max(1, Math.min(99, newQty));
  qtyInput.value = newQty;
  detailState.qty = newQty;
  updateTotalPrice();
}

// ===== 총 금액 계산 =====
function updateTotalPrice() {
  const p = detailState.product;
  if (!p) return;

  // 기본가: 클럽가가 있으면 클럽가 기준
  let unitPrice = (p.clubPrice && p.clubPrice < p.price) ? p.clubPrice : (p.price || 0);

  // 사이즈 추가금액
  if (detailState.selectedOption) {
    unitPrice += detailState.selectedOption.additionalPrice;
  }

  const total = unitPrice * detailState.qty;
  document.getElementById('totalPrice').textContent = `${total.toLocaleString()}원`;
}

// ===== 장바구니 담기 =====
function addToCartFromDetail() {
  const p = detailState.product;
  if (!p) return;

  // 사이즈 옵션이 있는데 선택하지 않은 경우
  const sizes = detailState.options.sizes;
  if (sizes && sizes.length > 0 && !detailState.selectedSize) {
    alert('사이즈를 선택해주세요.');
    return;
  }

  // 기본가: 클럽가 우선
  let unitPrice = (p.clubPrice && p.clubPrice < p.price) ? p.clubPrice : (p.price || 0);
  if (detailState.selectedOption) {
    unitPrice += detailState.selectedOption.additionalPrice;
  }

  // 썸네일 이미지
  const thumbnail = detailState.images.length > 0
    ? (detailState.images.find(img => img.isPrimary) || detailState.images[0]).url
    : '';

  // cart.js의 addToCart 함수 호출
  addToCart({
    id: p.id,
    name: p.name + (detailState.selectedSize ? ` (${detailState.selectedSize})` : ''),
    price: unitPrice,
    image: thumbnail,
    size: detailState.selectedSize || 'FREE',
    qty: detailState.qty
  });
}

// ===== 상품 설명 렌더링 =====
function renderDescription() {
  const content = document.getElementById('descriptionContent');
  const desc = detailState.product.description;

  if (!desc) {
    content.innerHTML = '<p class="text-gray-400 py-8 text-center">상품 설명이 없습니다.</p>';
    return;
  }

  // 줄바꿈을 <br>로 변환 (간단한 텍스트 → HTML)
  content.innerHTML = desc.replace(/\n/g, '<br>');
}

// ===== 관련 상품 렌더링 =====
function renderRelated() {
  const grid = document.getElementById('relatedGrid');
  const section = document.getElementById('relatedSection');

  if (!detailState.related || detailState.related.length === 0) {
    section.classList.add('hidden');
    return;
  }

  grid.innerHTML = detailState.related.map(p => {
    const thumb = p.thumbnail
      ? p.thumbnail
      : `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" fill="%23f3f4f6"><rect width="400" height="400"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="14">No Image</text></svg>')}`;

    const price = p.price || 0;
    const priceText = p.type === 'custom'
      ? `~${price.toLocaleString()}원`
      : `${price.toLocaleString()}원`;

    return `
      <a href="shop-detail.html?id=${p.id}" class="block bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
        <div class="aspect-square overflow-hidden bg-gray-50">
          <img src="${thumb}" alt="${p.name}" class="w-full h-full object-cover" loading="lazy">
        </div>
        <div class="p-3">
          <p class="text-xs text-gray-400">${p.categoryName || ''}</p>
          <h3 class="text-sm font-medium line-clamp-2 mt-1">${p.name}</h3>
          <p class="text-sm font-bold mt-1">${priceText}</p>
        </div>
      </a>
    `;
  }).join('');
}

// ===== 탭 전환 =====
function bindTabEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      // 탭 버튼 활성 상태 토글
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active', 'text-gray-900');
        b.classList.add('text-gray-400');
      });
      btn.classList.add('active', 'text-gray-900');
      btn.classList.remove('text-gray-400');

      // 탭 내용 표시/숨김
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    });
  });
}

// ===== 공유하기 =====
function shareProduct() {
  const url = window.location.href;

  // Web Share API 지원 시 (주로 모바일)
  if (navigator.share) {
    navigator.share({
      title: detailState.product?.name || 'STIZ SHOP',
      url: url
    }).catch(() => {});
    return;
  }

  // 미지원 시 클립보드 복사
  navigator.clipboard.writeText(url).then(() => {
    alert('링크가 복사되었습니다!');
  }).catch(() => {
    // clipboard API도 안 되면 프롬프트로 대체
    prompt('아래 링크를 복사하세요:', url);
  });
}
