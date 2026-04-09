/**
 * STIZ SHOP - 고객용 쇼핑몰 목록 페이지
 * 비유: 백화점 매장을 돌아다니며 진열대를 구경하는 것
 *
 * 기능: 상품 목록 조회, 카테고리 필터, 검색, 정렬, 페이지네이션
 * API: GET /api/products (서버에서 active 상품만 반환)
 */

// ===== 전역 상태 =====
// 현재 필터/페이지 상태를 한곳에서 관리 (장부 같은 역할)
const shopState = {
  products: [],      // 현재 표시 중인 상품 배열
  categories: [],    // 카테고리 목록 (필터용)
  page: 1,           // 현재 페이지 번호
  limit: 20,         // 한 번에 불러올 상품 수
  total: 0,          // 전체 상품 수
  totalPages: 0,     // 전체 페이지 수
  category: '',      // 선택된 카테고리 ID
  type: '',          // 'ready' 또는 'custom'
  search: '',        // 검색어
  sort: 'newest',    // 정렬 기준
  loading: false     // API 호출 중 여부 (중복 호출 방지)
};

// API 기본 주소 — 같은 서버에서 서빙하므로 상대 경로 사용
const API_BASE = '/api';

// ===== 페이지 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  // URL 파라미터에서 필터값 복원 (뒤로가기 시 상태 유지용)
  restoreFromURL();

  // 카테고리 목록 먼저 불러온 뒤 상품 로드
  loadCategories().then(() => loadProducts());

  // 이벤트 바인딩
  bindEvents();
});

/**
 * URL 파라미터에서 필터 상태 복원
 * 예: shop.html?category=3&type=custom&search=축구 → 해당 필터 자동 적용
 */
function restoreFromURL() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('category')) shopState.category = params.get('category');
  if (params.get('type')) shopState.type = params.get('type');
  if (params.get('search')) shopState.search = params.get('search');
  if (params.get('sort')) shopState.sort = params.get('sort');

  // UI에 값 반영
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortSelect = document.getElementById('sortSelect');

  if (searchInput && shopState.search) searchInput.value = shopState.search;
  if (typeFilter && shopState.type) typeFilter.value = shopState.type;
  if (sortSelect && shopState.sort) sortSelect.value = shopState.sort;
}

/**
 * 현재 필터 상태를 URL에 반영 (브라우저 히스토리 관리)
 * 뒤로가기/앞으로가기 시에도 필터가 유지됨
 */
function syncToURL() {
  const params = new URLSearchParams();

  if (shopState.category) params.set('category', shopState.category);
  if (shopState.type) params.set('type', shopState.type);
  if (shopState.search) params.set('search', shopState.search);
  if (shopState.sort !== 'newest') params.set('sort', shopState.sort);

  const queryStr = params.toString();
  const newURL = queryStr ? `shop.html?${queryStr}` : 'shop.html';
  // replaceState: 히스토리에 새 항목을 추가하지 않고 현재 URL만 교체
  history.replaceState(null, '', newURL);
}

// ===== 이벤트 바인딩 =====
function bindEvents() {
  // 검색: 엔터키 또는 300ms 디바운스로 실행
  const searchInput = document.getElementById('searchInput');
  let searchTimer = null;

  searchInput.addEventListener('input', () => {
    // 디바운스: 타이핑이 멈추고 300ms 후에 검색 (서버 부하 방지)
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      shopState.search = searchInput.value.trim();
      shopState.page = 1;
      shopState.products = [];
      syncToURL();
      loadProducts();
    }, 300);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      shopState.search = searchInput.value.trim();
      shopState.page = 1;
      shopState.products = [];
      syncToURL();
      loadProducts();
    }
  });

  // 타입 필터 변경
  document.getElementById('typeFilter').addEventListener('change', (e) => {
    shopState.type = e.target.value;
    shopState.page = 1;
    shopState.products = [];
    syncToURL();
    loadProducts();
  });

  // 정렬 변경
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    shopState.sort = e.target.value;
    shopState.page = 1;
    shopState.products = [];
    syncToURL();
    loadProducts();
  });
}

// ===== 카테고리 로드 =====
async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/products/categories`);
    const data = await res.json();

    if (!data.success) return;

    shopState.categories = data.categories;
    renderCategoryButtons(data.categories);
  } catch (err) {
    console.error('[shop] 카테고리 로드 실패:', err);
  }
}

/**
 * 카테고리 필터 버튼 렌더링
 * 대분류만 버튼으로 표시 (너무 많으면 화면이 복잡해짐)
 */
function renderCategoryButtons(categories) {
  const container = document.getElementById('categoryFilters');
  // "전체" 버튼은 이미 HTML에 있으므로 나머지만 추가
  categories.forEach(cat => {
    // 상품이 0개인 카테고리는 제외
    if (cat.productCount === 0 && (!cat.children || cat.children.every(c => c.productCount === 0))) return;

    const btn = document.createElement('button');
    btn.className = 'category-btn px-4 py-1.5 rounded-full text-sm border border-gray-200 transition-colors hover:bg-gray-100';
    btn.dataset.category = cat.id;
    // 카테고리명 + 상품 수 표시
    const totalCount = cat.productCount + (cat.children ? cat.children.reduce((s, c) => s + c.productCount, 0) : 0);
    btn.textContent = `${cat.name} (${totalCount})`;

    // 현재 선택된 카테고리면 활성 스타일
    if (String(shopState.category) === String(cat.id)) {
      btn.classList.add('active');
      // "전체" 버튼에서 active 제거
      container.querySelector('[data-category=""]').classList.remove('active');
    }

    btn.addEventListener('click', () => selectCategory(cat.id));
    container.appendChild(btn);
  });
}

/**
 * 카테고리 선택 핸들러
 */
function selectCategory(categoryId) {
  shopState.category = categoryId === shopState.category ? '' : categoryId;
  shopState.page = 1;
  shopState.products = [];
  syncToURL();

  // 버튼 활성 상태 토글
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.remove('active');
    if (String(btn.dataset.category) === String(shopState.category)) {
      btn.classList.add('active');
    }
  });

  // 카테고리 전체 선택 시 "전체" 버튼 활성화
  if (!shopState.category) {
    document.querySelector('.category-btn[data-category=""]').classList.add('active');
  }

  loadProducts();
}

// ===== 상품 로드 =====
async function loadProducts() {
  if (shopState.loading) return; // 중복 호출 방지
  shopState.loading = true;

  const grid = document.getElementById('productGrid');
  const spinner = document.getElementById('loadingSpinner');
  const emptyMsg = document.getElementById('emptyMessage');
  const loadMoreWrap = document.getElementById('loadMoreWrap');

  // 첫 페이지면 기존 내용 초기화 + 스켈레톤 표시
  if (shopState.page === 1) {
    grid.innerHTML = renderSkeletons(8);
  }

  spinner.classList.remove('hidden');
  emptyMsg.classList.add('hidden');
  loadMoreWrap.classList.add('hidden');

  try {
    // API 호출 — 필터, 정렬, 페이지네이션 파라미터 전달
    const params = new URLSearchParams({
      page: shopState.page,
      limit: shopState.limit,
      sort: shopState.sort
    });

    if (shopState.category) params.set('category', shopState.category);
    if (shopState.type) params.set('type', shopState.type);
    if (shopState.search) params.set('search', shopState.search);

    const res = await fetch(`${API_BASE}/products?${params}`);
    const data = await res.json();

    if (!data.success) throw new Error(data.error || '상품 로드 실패');

    // 상태 업데이트
    shopState.total = data.pagination.total;
    shopState.totalPages = data.pagination.totalPages;

    // 첫 페이지면 교체, 아니면 추가 (더보기)
    if (shopState.page === 1) {
      shopState.products = data.products;
    } else {
      shopState.products = [...shopState.products, ...data.products];
    }

    // 렌더링
    renderProducts();
    updateTotalCount();

    // 더보기 버튼 표시 여부
    if (shopState.page < shopState.totalPages) {
      loadMoreWrap.classList.remove('hidden');
    }

    // 빈 결과
    if (shopState.products.length === 0) {
      emptyMsg.classList.remove('hidden');
    }

  } catch (err) {
    console.error('[shop] 상품 로드 실패:', err);
    if (shopState.page === 1) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-20 text-gray-400">
          <span class="material-symbols-outlined text-5xl">error_outline</span>
          <p class="mt-3">상품을 불러올 수 없습니다</p>
          <p class="text-sm mt-1">잠시 후 다시 시도해주세요</p>
        </div>`;
    }
  } finally {
    shopState.loading = false;
    spinner.classList.add('hidden');
  }
}

// ===== 상품 그리드 렌더링 =====
function renderProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = shopState.products.map(product => createProductCard(product)).join('');
}

/**
 * 상품 카드 HTML 생성
 * 한 장의 상품 카드 = 이미지 + 카테고리 + 상품명 + 가격
 */
function createProductCard(product) {
  // 썸네일 이미지: 없으면 플레이스홀더 표시
  const thumbnail = product.thumbnail
    ? product.thumbnail
    : `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" fill="%23f3f4f6"><rect width="400" height="400"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="16">No Image</text></svg>')}`;

  // 가격 포맷: 커스텀 상품은 "~" 접두사, 기성품은 할인가 표시
  const priceHTML = formatPrice(product);

  // 커스텀 상품 배지
  const typeBadge = product.type === 'custom'
    ? '<span class="absolute top-2 left-2 bg-brand-red text-white text-xs px-2 py-0.5 rounded-full font-medium">커스텀</span>'
    : '';

  return `
    <a href="shop-detail.html?id=${product.id}" class="product-card block bg-white rounded-xl overflow-hidden border border-gray-100">
      <!-- 상품 이미지 -->
      <div class="relative aspect-square overflow-hidden bg-gray-50">
        <img src="${thumbnail}" alt="${product.name}"
             class="w-full h-full object-cover" loading="lazy"
             onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" fill="%23f3f4f6"><rect width="400" height="400"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="16">No Image</text></svg>')}'">
        ${typeBadge}
      </div>

      <!-- 상품 정보 -->
      <div class="p-3 md:p-4">
        <!-- 카테고리명 (작은 글씨) -->
        <p class="text-xs text-gray-400 mb-1">${product.categoryName || ''}</p>
        <!-- 상품명 -->
        <h3 class="text-sm font-medium text-gray-900 line-clamp-2 leading-tight mb-2">${product.name}</h3>
        <!-- 가격 -->
        ${priceHTML}
      </div>
    </a>
  `;
}

/**
 * 가격 포맷팅 함수
 * - 기성품: 일반가 + 클럽가(할인가) 표시
 * - 커스텀: "~XX,XXX원" (가격 변동 가능 표시)
 */
function formatPrice(product) {
  const price = product.price || 0;

  if (product.type === 'custom') {
    // 커스텀: 기본 가격에 물결 표시 (옵션에 따라 변동)
    return `<p class="text-sm font-bold text-brand-black">~${price.toLocaleString()}원</p>`;
  }

  // 기성품: 클럽가가 있으면 할인 표시
  if (product.clubPrice && product.clubPrice < price) {
    const discountRate = Math.round((1 - product.clubPrice / price) * 100);
    return `
      <div class="flex items-center gap-2">
        <span class="text-sm font-bold text-brand-red">${discountRate}%</span>
        <span class="text-sm font-bold text-brand-black">${product.clubPrice.toLocaleString()}원</span>
      </div>
      <p class="text-xs text-gray-400 line-through">${price.toLocaleString()}원</p>
    `;
  }

  return `<p class="text-sm font-bold text-brand-black">${price.toLocaleString()}원</p>`;
}

// ===== 전체 상품 수 표시 =====
function updateTotalCount() {
  document.getElementById('totalCount').textContent = `전체 ${shopState.total.toLocaleString()}개 상품`;
}

// ===== 스켈레톤 로딩 UI =====
function renderSkeletons(count) {
  return Array(count).fill('').map(() => `
    <div class="rounded-xl overflow-hidden border border-gray-100">
      <div class="aspect-square skeleton"></div>
      <div class="p-3 md:p-4">
        <div class="h-3 w-16 skeleton rounded mb-2"></div>
        <div class="h-4 w-full skeleton rounded mb-2"></div>
        <div class="h-4 w-20 skeleton rounded"></div>
      </div>
    </div>
  `).join('');
}

// ===== 더보기 =====
function loadMore() {
  shopState.page++;
  loadProducts();
}

// ===== 필터 초기화 =====
function resetFilters() {
  shopState.category = '';
  shopState.type = '';
  shopState.search = '';
  shopState.sort = 'newest';
  shopState.page = 1;
  shopState.products = [];

  // UI 초기화
  document.getElementById('searchInput').value = '';
  document.getElementById('typeFilter').value = '';
  document.getElementById('sortSelect').value = 'newest';

  // 카테고리 버튼 초기화
  document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector('.category-btn[data-category=""]').classList.add('active');

  syncToURL();
  loadProducts();
}
