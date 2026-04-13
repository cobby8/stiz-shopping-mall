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
    location.href = 'list.html';
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
    // images, options는 product 안에 포함되어 있음 (API 응답 구조)
    detailState.images = data.product.images || [];
    detailState.options = data.product.options || {};
    // 관련 상품은 최상위 relatedProducts 키에 있음
    detailState.related = data.relatedProducts || [];

    // 페이지 렌더링
    renderProductInfo();
    renderImageGallery();
    renderDescription();
    renderRelated();

    // 커스텀 상품이면 커스텀 패널 활성화, 기성품이면 기존 패널
    if (data.product.type === 'custom') {
      initCustomPanel();           // 커스텀 옵션 패널 초기화
    } else {
      renderSizeOptions();
      updateTotalPrice();
    }

    // 페이지 타이틀 업데이트
    document.title = `${data.product.name} - STIZ SHOP`;

  } catch (err) {
    console.error('[shop-detail] 상품 로드 실패:', err);
    document.querySelector('section').innerHTML = `
      <div class="text-center py-20">
        <span class="material-symbols-outlined text-6xl text-gray-300">error_outline</span>
        <p class="text-gray-500 mt-4 text-lg">상품을 찾을 수 없습니다</p>
        <a href="list.html" class="inline-block mt-4 text-sm text-brand-red hover:underline">쇼핑몰로 돌아가기</a>
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

  // 브랜드/원산지 표시 — 있으면 카테고리명 옆에 추가 정보
  const brandOriginParts = [];
  if (p.brand) brandOriginParts.push(p.brand);
  if (p.origin) brandOriginParts.push(`원산지: ${p.origin}`);
  if (brandOriginParts.length > 0) {
    const infoEl = document.getElementById('categoryName');
    infoEl.textContent = [p.categoryName, ...brandOriginParts].filter(Boolean).join(' · ');
  }

  // 가격 영역
  renderPriceArea(p);

  // 상담 후 결제 상품일 때 — 기성품 패널의 버튼을 "커스텀 주문하기"로 교체
  if (p.isConsultPrice === 1 && p.type !== 'custom') {
    const readyPanel = document.getElementById('readyPanel');
    if (readyPanel) {
      // 사이즈/수량/총금액 숨기고 상담 안내 버튼만 표시
      const sizeSection = document.getElementById('sizeSection');
      const qtySection = sizeSection?.parentElement?.querySelector('.mb-6:nth-child(2)');
      if (sizeSection) sizeSection.classList.add('hidden');

      // 총 금액 영역 숨기기
      const totalArea = readyPanel.querySelector('.bg-gray-50');
      if (totalArea) totalArea.classList.add('hidden');

      // 장바구니 버튼 → 커스텀 주문 버튼으로 교체
      const cartBtn = readyPanel.querySelector('button[onclick="addToCartFromDetail()"]');
      if (cartBtn) {
        cartBtn.outerHTML = `
          <a href="custom_mockup.html"
             class="flex-1 py-3.5 bg-brand-red text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-xl">design_services</span>
            커스텀 주문하기
          </a>`;
      }
    }
  }
}

/**
 * 가격 영역 렌더링
 * - 상담 후 결제(isConsultPrice=1): 가격 대신 "상담 후 결제" 배지
 * - 커스텀: "~기본가" + 옵션에 따라 변동 안내
 * - 기성품: 정가 + 클럽가(할인가)
 */
function renderPriceArea(product) {
  const area = document.getElementById('priceArea');
  const price = product.price || 0;

  // 상담 후 결제 상품 — 가격 대신 배지 표시
  if (product.isConsultPrice === 1) {
    area.innerHTML = `
      <span class="inline-block px-3 py-1.5 bg-amber-100 text-amber-800 text-sm font-bold rounded-full">상담 후 결제</span>
      <p class="text-sm text-gray-400 mt-2">가격은 상담을 통해 안내드립니다</p>
    `;
    return;
  }

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
// detailHtml이 있으면 카페24 상세페이지 HTML을 그대로 삽입 (이미지 포함)
// 없으면 기존 description 텍스트를 표시
function renderDescription() {
  const content = document.getElementById('descriptionContent');
  const p = detailState.product;

  // detailHtml 우선 — 카페24에서 가져온 상세 HTML (이미지들 포함)
  if (p.detailHtml && p.detailHtml.length > 10) {
    // ec-data-src → src 치환 (카페24 lazy-load 속성을 브라우저가 인식하도록)
    content.innerHTML = p.detailHtml.replace(/ec-data-src=/g, 'src=');
    // 상세 HTML 내 이미지에 반응형 스타일 적용
    content.querySelectorAll('img').forEach(img => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
    });
    return;
  }

  // detailHtml 없으면 텍스트 description 사용
  const desc = p.description;
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
      <a href="detail.html?id=${p.id}" class="block bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
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


// ==========================================================
// ===== 커스텀 상품 전용 로직 (B'-4) =====
// 비유: 피자 토핑처럼 등급/패키지/마감을 고르면 견적이 나오고,
//       주문자 정보를 입력하면 시안 요청이 접수되는 시스템
// ==========================================================

// 커스텀 전용 상태 — detailState와 별도로 관리
const customState = {
  catalog: null,         // GET /api/catalog 응답 캐시
  selectedGrade: null,   // 선택된 등급 ID
  selectedPackage: null, // 선택된 패키지 ID
  finishTop: null,       // 상의 마감 옵션
  finishBottom: null,    // 하의 마감 옵션
  qty: 1,                // 주문 수량
  unitPrice: 0,          // 단가
  totalEstimate: 0,      // 견적 총액
  isSubmitting: false,   // 중복 제출 방지
};

/**
 * 커스텀 패널 초기화
 * 1) 기성품 패널 숨기고 커스텀 패널 표시
 * 2) 카탈로그 API에서 priceTable + 옵션 데이터 가져오기
 * 3) customMeta에서 가능한 등급/패키지 필터링하여 버튼 렌더링
 */
async function initCustomPanel() {
  // 기성품 패널 숨기기, 커스텀 패널 보이기
  const readyPanel = document.getElementById('readyPanel');
  const customPanel = document.getElementById('customPanel');
  if (readyPanel) readyPanel.classList.add('hidden');
  if (customPanel) customPanel.classList.remove('hidden');

  try {
    // 카탈로그 데이터 로드 (priceTable, grades, packages 등)
    const res = await fetch(`${API_BASE}/catalog`);
    const json = await res.json();
    if (!json.success || !json.data) throw new Error('카탈로그 로드 실패');
    customState.catalog = json.data;

    // customMeta에서 이 상품이 지원하는 등급/패키지 목록 추출
    const meta = detailState.product.customMeta || {};

    // 등급 렌더링
    renderCustomGrades(meta);
    // 패키지는 등급 선택 후 렌더링
    // 마감 옵션은 패키지 선택 후 렌더링
    // 견적은 옵션 변경 시마다 자동 갱신

    // 수량 입력 이벤트
    const qtyInput = document.getElementById('customQtyInput');
    if (qtyInput) {
      qtyInput.addEventListener('change', () => {
        let val = parseInt(qtyInput.value) || 1;
        val = Math.max(1, Math.min(999, val));
        qtyInput.value = val;
        customState.qty = val;
        updateCustomEstimate();
      });
    }
  } catch (err) {
    console.error('[custom] 카탈로그 로드 실패:', err);
    // 카탈로그 없어도 기본 안내는 보여줌
    const gradeSection = document.getElementById('customGradeSection');
    if (gradeSection) {
      gradeSection.innerHTML = '<p class="text-sm text-gray-400">옵션을 불러올 수 없습니다. 시안 요청 시 요청사항에 원하는 옵션을 적어주세요.</p>';
    }
  }
}

/**
 * 등급 버튼 렌더링
 * customMeta.grades 배열이 있으면 해당 등급만, 없으면 sportGradeMap에서 필터
 */
function renderCustomGrades(meta) {
  const container = document.getElementById('customGradeButtons');
  if (!container || !customState.catalog) return;

  const allGrades = customState.catalog.grades || [];
  const sportGradeMap = customState.catalog.sportGradeMap || {};

  // customMeta.grades가 있으면 그것으로 필터, 없으면 sport 기반 필터
  // customMeta.sport: 이 상품이 속한 종목 (예: 'soccer', 'baseball')
  let allowedIds = meta.grades || [];
  if (allowedIds.length === 0 && meta.sport) {
    allowedIds = sportGradeMap[meta.sport] || [];
  }

  // 필터된 등급만 표시
  const filtered = allowedIds.length > 0
    ? allGrades.filter(g => allowedIds.includes(g.id))
    : allGrades;

  if (filtered.length === 0) {
    document.getElementById('customGradeSection').classList.add('hidden');
    return;
  }

  container.innerHTML = filtered.map(g => {
    // 세트 가격으로 대표 가격 배지 표시
    const sport = meta.sport || '';
    const setKey = `${sport}_${g.id}_set`;
    const topKey = `${sport}_${g.id}_top`;
    const price = customState.catalog.priceTable?.[setKey] || customState.catalog.priceTable?.[topKey];
    const badge = price ? `<span class="text-xs text-gray-400 ml-1">${price.toLocaleString()}원~</span>` : '';

    return `
      <button class="custom-opt-btn px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium transition-colors hover:border-brand-black"
              data-grade="${g.id}" onclick="selectCustomGrade(this)">
        ${g.label}${badge}
      </button>
    `;
  }).join('');
}

/**
 * 등급 선택 핸들러
 * 등급이 바뀌면 패키지 목록을 새로 렌더링
 */
function selectCustomGrade(btn) {
  // 등급 버튼 토글
  document.querySelectorAll('#customGradeButtons .custom-opt-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  customState.selectedGrade = btn.dataset.grade;
  // 패키지 초기화 후 렌더링
  customState.selectedPackage = null;
  customState.finishTop = null;
  customState.finishBottom = null;

  const meta = detailState.product.customMeta || {};
  renderCustomPackages(meta);
  clearCustomFinish();
  updateCustomEstimate();
}

/**
 * 패키지 버튼 렌더링
 * customMeta.packages 배열이 있으면 해당 패키지만, 없으면 gradePackageMap 기반
 */
function renderCustomPackages(meta) {
  const container = document.getElementById('customPackageButtons');
  const section = document.getElementById('customPackageSection');
  if (!container || !customState.catalog) return;

  const allPackages = customState.catalog.packages || [];
  const gradePackageMap = customState.catalog.gradePackageMap || {};

  // customMeta.packages가 있으면 우선, 없으면 등급 기반 필터
  let allowedIds = meta.packages || [];
  if (allowedIds.length === 0 && customState.selectedGrade) {
    allowedIds = gradePackageMap[customState.selectedGrade] || [];
  }

  const filtered = allowedIds.length > 0
    ? allPackages.filter(p => allowedIds.includes(p.id))
    : allPackages;

  if (filtered.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const sport = meta.sport || '';
  container.innerHTML = filtered.map(p => {
    // 이 등급+패키지의 가격 조회
    const priceKey = `${sport}_${customState.selectedGrade}_${p.id}`;
    const price = customState.catalog.priceTable?.[priceKey];
    const badge = price ? `<span class="text-xs text-gray-400 ml-1">${price.toLocaleString()}원</span>` : '';

    return `
      <button class="custom-opt-btn px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium transition-colors hover:border-brand-black"
              data-package="${p.id}" onclick="selectCustomPackage(this)">
        ${p.label}${badge}
      </button>
    `;
  }).join('');
}

/**
 * 패키지 선택 핸들러
 * 패키지가 바뀌면 마감 옵션을 렌더링하고 견적을 갱신
 */
function selectCustomPackage(btn) {
  document.querySelectorAll('#customPackageButtons .custom-opt-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  customState.selectedPackage = btn.dataset.package;
  customState.finishTop = null;
  customState.finishBottom = null;

  renderCustomFinish();
  updateCustomEstimate();
}

/**
 * 마감 옵션 렌더링
 * 패키지에 상의/하의가 포함되는지 판단하여 보여줌
 */
function renderCustomFinish() {
  const catalog = customState.catalog;
  if (!catalog) return;

  const finishOpts = catalog.finishOptions || {};
  const pkg = (catalog.packages || []).find(p => p.id === customState.selectedPackage);
  // 패키지가 상의/하의를 포함하는지 판단
  const hasTop = pkg ? (pkg.includesTop !== false) : true;
  const hasBottom = pkg ? (pkg.includesBottom !== false) : true;

  // 상의 마감
  const topSection = document.getElementById('customFinishTopSection');
  const topContainer = document.getElementById('customFinishTopButtons');
  const topOpts = finishOpts.top || [];
  if (hasTop && topOpts.length > 0) {
    topSection.classList.remove('hidden');
    topContainer.innerHTML = topOpts.map((opt, i) => `
      <button class="custom-opt-btn px-3 py-1.5 border border-gray-200 rounded-lg text-sm transition-colors hover:border-brand-black ${i === 0 ? 'selected' : ''}"
              data-finish="${opt.id}" onclick="selectCustomFinishTop(this)">
        ${opt.label}
      </button>
    `).join('');
    // 첫 번째 옵션 자동 선택
    customState.finishTop = topOpts[0]?.id || null;
  } else {
    topSection.classList.add('hidden');
  }

  // 하의 마감
  const bottomSection = document.getElementById('customFinishBottomSection');
  const bottomContainer = document.getElementById('customFinishBottomButtons');
  const bottomOpts = finishOpts.bottom || [];
  if (hasBottom && bottomOpts.length > 0) {
    bottomSection.classList.remove('hidden');
    bottomContainer.innerHTML = bottomOpts.map((opt, i) => `
      <button class="custom-opt-btn px-3 py-1.5 border border-gray-200 rounded-lg text-sm transition-colors hover:border-brand-black ${i === 0 ? 'selected' : ''}"
              data-finish="${opt.id}" onclick="selectCustomFinishBottom(this)">
        ${opt.label}
      </button>
    `).join('');
    customState.finishBottom = bottomOpts[0]?.id || null;
  } else {
    bottomSection.classList.add('hidden');
  }
}

/** 마감 옵션 영역 초기화 (등급 변경 시) */
function clearCustomFinish() {
  ['customFinishTopSection', 'customFinishBottomSection'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  document.getElementById('customPackageButtons').innerHTML = '';
}

function selectCustomFinishTop(btn) {
  document.querySelectorAll('#customFinishTopButtons .custom-opt-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  customState.finishTop = btn.dataset.finish;
}

function selectCustomFinishBottom(btn) {
  document.querySelectorAll('#customFinishBottomButtons .custom-opt-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  customState.finishBottom = btn.dataset.finish;
}

/**
 * 커스텀 수량 조절
 */
function changeCustomQty(delta) {
  const input = document.getElementById('customQtyInput');
  let newQty = (parseInt(input.value) || 1) + delta;
  newQty = Math.max(1, Math.min(999, newQty));
  input.value = newQty;
  customState.qty = newQty;
  updateCustomEstimate();
}

/**
 * 견적 갱신
 * priceTable에서 "{sport}_{grade}_{package}" 키로 단가를 찾아 수량과 곱함
 */
function updateCustomEstimate() {
  const catalog = customState.catalog;
  const meta = detailState.product?.customMeta || {};
  const sport = meta.sport || '';
  let unitPrice = 0;

  if (catalog && customState.selectedGrade && customState.selectedPackage) {
    // priceTable 키 생성: "{sport}_{grade}_{package}"
    const key = `${sport}_${customState.selectedGrade}_${customState.selectedPackage}`;
    unitPrice = catalog.priceTable?.[key] || 0;
  }

  customState.unitPrice = unitPrice;
  customState.totalEstimate = unitPrice * customState.qty;

  // UI 업데이트
  const totalEl = document.getElementById('customEstimateTotal');
  const detailEl = document.getElementById('customEstimateDetail');

  if (totalEl) {
    totalEl.textContent = customState.totalEstimate > 0
      ? `${customState.totalEstimate.toLocaleString()}원`
      : '옵션을 선택하세요';
  }

  if (detailEl) {
    if (unitPrice > 0) {
      detailEl.innerHTML = `
        <div class="flex justify-between">
          <span>단가</span>
          <span class="font-medium text-gray-700">${unitPrice.toLocaleString()}원</span>
        </div>
        <div class="flex justify-between">
          <span>수량</span>
          <span class="font-medium text-gray-700">${customState.qty}벌</span>
        </div>
      `;
    } else {
      detailEl.innerHTML = '';
    }
  }
}

/**
 * 시안 요청 제출
 * POST /api/orders에 커스텀 주문 데이터를 전송
 * 기존 order-custom.js의 submitOrder()와 동일한 데이터 구조
 */
async function submitCustomOrder() {
  if (customState.isSubmitting) return;

  // 필수 입력 검증
  const name = document.getElementById('customName')?.value?.trim();
  const phone = document.getElementById('customPhone')?.value?.trim();

  if (!name) {
    alert('이름을 입력해주세요.');
    document.getElementById('customOrdererDetails').open = true;
    document.getElementById('customName')?.focus();
    return;
  }
  if (!phone) {
    alert('연락처를 입력해주세요.');
    document.getElementById('customOrdererDetails').open = true;
    document.getElementById('customPhone')?.focus();
    return;
  }

  customState.isSubmitting = true;
  const btn = document.getElementById('customSubmitBtn');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined text-xl animate-spin">progress_activity</span> 처리 중...';
  btn.disabled = true;

  try {
    const p = detailState.product;
    const meta = p.customMeta || {};
    const catalog = customState.catalog;

    // 카탈로그에서 라벨 조회
    const gradeObj = (catalog?.grades || []).find(g => g.id === customState.selectedGrade);
    const pkgObj = (catalog?.packages || []).find(pk => pk.id === customState.selectedPackage);

    // 주문 아이템 구성 (order-custom.js와 동일 구조)
    const itemData = {
      name: p.name,
      sport: meta.sport || '',
      category: 'uniform',
      quantity: customState.qty,
      unitPrice: customState.unitPrice,
      method: 'sublimation',
      homeAway: 'home',
      // 커스텀 전용 필드
      grade: customState.selectedGrade || '',
      gradeLabel: gradeObj?.label || customState.selectedGrade || '',
      fabric: gradeObj?.fabric || '',
      package: customState.selectedPackage || '',
      packageLabel: pkgObj?.label || customState.selectedPackage || '',
      finish: {
        top: customState.finishTop,
        bottom: customState.finishBottom,
      },
      // 하위호환: composition 필드
      composition: {
        homeAway: 'home',
        parts: customState.selectedPackage || 'set',
        type: 'single',
      },
      totalAmount: customState.totalEstimate,
      // 상품 ID 참조 (어떤 상품에서 주문했는지 추적)
      productId: p.id,
    };

    const body = {
      customer: {
        name: name,
        phone: phone,
        teamName: document.getElementById('customTeam')?.value?.trim() || undefined,
      },
      items: [itemData],
      shipping: { address: '', desiredDate: '' },
      referenceFiles: [],
      customerMemo: document.getElementById('customMemo')?.value?.trim() || '',
      estimate: {
        totalAmount: customState.totalEstimate,
        unitPrice: customState.unitPrice,
        quantity: customState.qty,
      },
    };

    // POST /api/orders로 시안 요청 전송
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.success || data.orderNumber) {
      // 성공: 완료 안내
      alert(`시안 요청이 접수되었습니다!\n주문번호: ${data.orderNumber}\n\n확인 후 디자인 시안을 제작하여 연락드리겠습니다.`);
      // 주문 추적 페이지로 이동
      location.href = `order-track.html?orderNumber=${data.orderNumber}`;
    } else {
      throw new Error(data.error || '주문 접수에 실패했습니다.');
    }
  } catch (err) {
    console.error('[custom] 시안 요청 오류:', err);
    alert('시안 요청 중 오류가 발생했습니다: ' + err.message);
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    customState.isSubmitting = false;
  }
}
