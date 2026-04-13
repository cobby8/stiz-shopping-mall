/**
 * STIZ LIST - 고객용 상품 목록 페이지 (list.html)
 * 비유: 백화점의 특정 매장에 들어가 진열대를 돌아다니는 것
 *
 * 기능: 상품 목록 조회, 카테고리/타입 필터, 검색, 정렬, 페이지네이션
 * API: GET /api/products, GET /api/products/categories
 *
 * 기존 js/shop.js의 API 호출 로직을 list.html 레이아웃에 맞춰 재작성.
 * URL 파라미터는 slug 기반(basketball, soccer 등)으로 받되,
 * 내부적으로는 categoryId로 API를 호출한다.
 */

// ===== 전역 상태 =====
const listState = {
  products: [],      // 현재 표시 중인 상품 배열
  categories: [],    // 네비게이션용 카테고리 (상단 탭) — 트리 구조 (children 포함)
  categoryMap: {},   // slug → { id, name, productCount, children? } 매핑 (빠른 조회용)
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  categorySlug: '',  // 현재 선택된 카테고리 slug ('' = 전체)
  categoryId: '',    // 해당 slug의 실제 DB id
  subCategorySlug: '', // 현재 선택된 하위 카테고리 slug ('' = 전체)
  subCategoryId: '',   // 하위 카테고리의 실제 DB id
  type: '',          // 'ready' | 'custom' | ''
  search: '',
  sort: 'newest',
  loading: false
};

const API_BASE = '/api';

// ===== URL 하위호환 맵 =====
// 기존 list.html에서 쓰던 오래된 slug → 새 카테고리 slug로 매핑
// 예: ?category=sportswear (구) → teamwear (신), ?category=kogas → md-picks
const LEGACY_SLUG_MAP = {
  // 기존 "Basketball"/"Soccer" 대소문자 차이
  'Basketball': 'basketball',
  'Soccer': 'soccer',
  'Volleyball': 'volleyball',
  // 구 스토어 카테고리 → 신 카테고리
  'sportswear': 'teamwear',      // 기능성 의류 → 팀웨어로 근사 매핑
  'kogas': 'md-picks',           // KOGAS MD → MD제품
  'all': ''                      // "all" → 전체
};

/**
 * URL slug를 실제 새 카테고리 slug로 정규화
 */
function normalizeSlug(rawSlug) {
  if (!rawSlug) return '';
  if (LEGACY_SLUG_MAP[rawSlug] !== undefined) return LEGACY_SLUG_MAP[rawSlug];
  return rawSlug;
}

// ===== 페이지 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  restoreFromURL();
  loadCategories().then(() => loadProducts());
  bindEvents();
});

/**
 * URL 파라미터 복원
 * 예: list.html?category=basketball&type=custom&sort=price_asc
 */
function restoreFromURL() {
  const params = new URLSearchParams(window.location.search);

  const rawCategory = params.get('category') || '';
  listState.categorySlug = normalizeSlug(rawCategory);

  // 하위 서브탭 slug 복원 (?sub=heritage 등)
  const rawSub = params.get('sub') || '';
  if (rawSub) listState.subCategorySlug = rawSub;

  const type = params.get('type') || '';
  // type=store 같은 과거 값은 그냥 빈 값으로 (기성/커스텀만 유효)
  if (type === 'ready' || type === 'custom') {
    listState.type = type;
  }

  if (params.get('search')) listState.search = params.get('search');
  if (params.get('sort')) listState.sort = params.get('sort');

  // UI 반영
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect && listState.sort) sortSelect.value = listState.sort;
}

/**
 * 현재 필터 → URL 반영 (history.replaceState로 페이지 리로드 없이)
 */
function syncToURL() {
  const params = new URLSearchParams();
  if (listState.categorySlug) params.set('category', listState.categorySlug);
  // 하위 서브탭이 선택되면 URL에도 반영
  if (listState.subCategorySlug) params.set('sub', listState.subCategorySlug);
  if (listState.type) params.set('type', listState.type);
  if (listState.search) params.set('search', listState.search);
  if (listState.sort && listState.sort !== 'newest') params.set('sort', listState.sort);
  const qs = params.toString();
  const newURL = qs ? `list.html?${qs}` : 'list.html';
  history.replaceState(null, '', newURL);
}

// ===== 카테고리 로드 =====
async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/products/categories`);
    const data = await res.json();
    if (!data.success) return;

    // 트리 구조로 받아짐 — 대분류(children 포함)
    // 대분류의 productCount에 하위 상품수를 합산하여 표시
    const rawList = data.categories || [];
    rawList.forEach(c => {
      // 하위 카테고리 상품 수를 대분류에 합산
      const childTotal = (c.children || []).reduce((sum, ch) => sum + (ch.productCount || 0), 0);
      c.totalProductCount = (c.productCount || 0) + childTotal;
    });
    // 상품이 하나도 없는 대분류 제외
    const list = rawList.filter(c => c.totalProductCount > 0);
    listState.categories = list;

    // slug → 카테고리 맵 구성 (대분류 + 하위 모두 등록)
    list.forEach(c => {
      listState.categoryMap[c.slug] = c;
      // 하위 카테고리도 맵에 등록 (서브탭 클릭 시 조회용)
      (c.children || []).forEach(ch => {
        listState.categoryMap[ch.slug] = ch;
      });
    });

    // URL의 slug가 실제 맵에 존재하는지 확인하여 categoryId 세팅
    if (listState.categorySlug) {
      const matched = listState.categoryMap[listState.categorySlug];
      if (matched) {
        // 하위 카테고리 slug로 들어온 경우 — parentId가 있으면 서브탭 선택 상태로
        if (matched.parentId) {
          const parent = list.find(c => c.id === matched.parentId);
          if (parent) {
            listState.categorySlug = parent.slug;
            listState.categoryId = parent.id;
            listState.subCategorySlug = matched.slug;
            listState.subCategoryId = matched.id;
          }
        } else {
          listState.categoryId = matched.id;
        }
      } else {
        listState.categorySlug = '';
        listState.categoryId = '';
      }
    }

    renderCategoryTabs();
  } catch (err) {
    console.error('[list] 카테고리 로드 실패:', err);
  }
}

/**
 * 상단 카테고리 필터 탭 렌더링
 * 대분류 탭 + 선택된 대분류의 하위 서브탭을 2줄 구조로 표시
 */
function renderCategoryTabs() {
  const wrapper = document.querySelector('.overflow-x-auto');
  if (!wrapper) return;

  // 대분류 탭 — "전체" + 상품 있는 대분류들
  const tabs = [
    { slug: '', name: 'All Products', totalProductCount: null },
    ...listState.categories
  ];

  // 대분류 탭 렌더링
  const mainTabsHtml = tabs.map(cat => {
    const isActive = cat.slug === listState.categorySlug;
    const activeClass = isActive
      ? 'bg-black text-white border-black'
      : 'bg-white text-gray-500 hover:text-black border-gray-200 hover:border-black';
    const count = cat.totalProductCount !== null ? ` (${cat.totalProductCount})` : '';
    return `
      <button data-slug="${cat.slug}"
              class="list-cat-btn px-4 py-2 rounded-full text-xs font-bold ${activeClass} transition-colors border whitespace-nowrap">
        ${cat.name}${count}
      </button>
    `;
  }).join('');

  // 하위 서브탭 — 선택된 대분류에 children이 있으면 표시
  let subTabsHtml = '';
  if (listState.categorySlug) {
    const parentCat = listState.categories.find(c => c.slug === listState.categorySlug);
    const children = parentCat?.children || [];
    if (children.length > 0) {
      // "전체" + 하위 카테고리들
      const subTabs = [
        { slug: '', name: '전체', productCount: null },
        ...children
      ];
      subTabsHtml = `
        <div class="flex space-x-2 mt-2" id="sub-category-tabs">
          ${subTabs.map(sub => {
            const isSubActive = sub.slug === listState.subCategorySlug;
            const subActiveClass = isSubActive
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-gray-50 text-gray-500 hover:text-black border-gray-200 hover:border-gray-400';
            const subCount = sub.productCount !== null ? ` (${sub.productCount})` : '';
            return `
              <button data-sub-slug="${sub.slug}"
                      class="list-sub-btn px-3 py-1.5 rounded-full text-xs font-medium ${subActiveClass} transition-colors border whitespace-nowrap">
                ${sub.name}${subCount}
              </button>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  // 기존 container(첫 번째 .flex)를 찾아서 전체 교체
  wrapper.innerHTML = `
    <div class="flex space-x-2">${mainTabsHtml}</div>
    ${subTabsHtml}
  `;

  // 대분류 탭 이벤트 바인딩
  wrapper.querySelectorAll('.list-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => selectCategory(btn.dataset.slug));
  });

  // 하위 서브탭 이벤트 바인딩
  wrapper.querySelectorAll('.list-sub-btn').forEach(btn => {
    btn.addEventListener('click', () => selectSubCategory(btn.dataset.subSlug));
  });

  // 페이지 타이틀 업데이트
  updatePageTitle();
}

/**
 * 대분류 카테고리 선택 핸들러
 * 대분류 변경 시 하위 서브탭 초기화
 */
function selectCategory(slug) {
  listState.categorySlug = slug;
  listState.categoryId = slug ? (listState.categoryMap[slug]?.id || '') : '';
  // 대분류가 바뀌면 서브탭 초기화
  listState.subCategorySlug = '';
  listState.subCategoryId = '';
  listState.page = 1;
  listState.products = [];
  syncToURL();
  renderCategoryTabs();
  loadProducts();
}

/**
 * 하위 서브탭 선택 핸들러
 * 서브탭 클릭 시 해당 하위 카테고리로 필터링
 */
function selectSubCategory(subSlug) {
  listState.subCategorySlug = subSlug;
  listState.subCategoryId = subSlug ? (listState.categoryMap[subSlug]?.id || '') : '';
  listState.page = 1;
  listState.products = [];
  syncToURL();
  renderCategoryTabs();
  loadProducts();
}

/**
 * 페이지 타이틀 (h2#page-title) 업데이트
 */
function updatePageTitle() {
  const titleEl = document.getElementById('page-title');
  if (!titleEl) return;

  if (listState.categorySlug && listState.categoryMap[listState.categorySlug]) {
    titleEl.textContent = listState.categoryMap[listState.categorySlug].name.toUpperCase();
  } else if (listState.type === 'custom') {
    titleEl.textContent = 'CUSTOM TEAMWEAR';
  } else if (listState.type === 'ready') {
    titleEl.textContent = 'READY TO WEAR';
  } else {
    titleEl.textContent = 'ALL PRODUCTS';
  }
}

// ===== 이벤트 바인딩 =====
function bindEvents() {
  // 정렬 변경
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      // list.html의 기존 옵션값(price-asc 등)을 API 값(price_asc)으로 변환
      const raw = e.target.value;
      const sortMap = {
        'newest': 'newest',
        'price-asc': 'price_asc',
        'price_asc': 'price_asc',
        'price-desc': 'price_desc',
        'price_desc': 'price_desc',
        'name': 'name'
      };
      listState.sort = sortMap[raw] || 'newest';
      listState.page = 1;
      listState.products = [];
      syncToURL();
      loadProducts();
    });
  }
}

// ===== 상품 로드 =====
async function loadProducts() {
  if (listState.loading) return;
  listState.loading = true;

  const grid = document.getElementById('product-grid');
  if (!grid) { listState.loading = false; return; }

  // 첫 페이지면 스켈레톤 표시
  if (listState.page === 1) {
    grid.innerHTML = renderSkeletons(8);
  }

  try {
    const params = new URLSearchParams({
      page: listState.page,
      limit: listState.limit,
      sort: listState.sort
    });
    // 서브탭 선택 시 하위 카테고리 ID로, 아니면 대분류 ID로 필터
    // API가 대분류 ID를 받으면 자동으로 하위 합집합을 반환 (D-89)
    const effectiveCategoryId = listState.subCategoryId || listState.categoryId;
    if (effectiveCategoryId) params.set('category', effectiveCategoryId);
    if (listState.type) params.set('type', listState.type);
    if (listState.search) params.set('search', listState.search);

    const res = await fetch(`${API_BASE}/products?${params}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '상품 로드 실패');

    listState.total = data.pagination.total;
    listState.totalPages = data.pagination.totalPages;

    if (listState.page === 1) {
      listState.products = data.products;
    } else {
      listState.products = [...listState.products, ...data.products];
    }

    renderProducts();
  } catch (err) {
    console.error('[list] 상품 로드 실패:', err);
    grid.innerHTML = `
      <div class="col-span-full text-center py-20 text-gray-400">
        <p class="text-lg">상품을 불러올 수 없습니다</p>
        <p class="text-sm mt-1">잠시 후 다시 시도해주세요</p>
      </div>`;
  } finally {
    listState.loading = false;
  }
}

// ===== 상품 그리드 렌더링 =====
function renderProducts() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  if (!listState.products.length) {
    grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-400">No products found in this category.</div>';
    return;
  }

  grid.innerHTML = listState.products.map(p => createCard(p)).join('');
}

/**
 * 상품 카드 HTML 생성 — 기존 list.html의 카드 디자인을 그대로 유지
 */
function createCard(p) {
  const isCustom = p.type === 'custom';
  const thumb = p.thumbnail
    || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%23f3f4f6"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20" fill="%239ca3af">No Image</text></svg>';

  const categoryLabel = (p.categoryName || '').toUpperCase();

  // 상담 후 결제 상품은 가격 대신 배지 표시
  let mainPrice, origPrice = '';
  if (p.isConsultPrice === 1) {
    mainPrice = `<span class="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">상담 후 결제</span>`;
  } else {
    const priceLabel = isCustom
      ? `~₩${(p.price || 0).toLocaleString()}`
      : `₩${(p.price || 0).toLocaleString()}`;
    const hasClubPrice = !isCustom && p.clubPrice && p.clubPrice < p.price;
    mainPrice = hasClubPrice ? `₩${p.clubPrice.toLocaleString()}` : priceLabel;
    origPrice = hasClubPrice ? `<span class="text-[10px] text-gray-400 line-through ml-1">₩${p.price.toLocaleString()}</span>` : '';
  }

  return `
    <div class="group relative">
      <div class="aspect-[3/4] w-full bg-gray-100 overflow-hidden relative cursor-pointer"
           onclick="location.href='detail.html?id=${p.id}'">
        <img src="${thumb}" alt="${p.name}"
             class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
             loading="lazy"
             onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22><rect width=%22400%22 height=%22400%22 fill=%22%23f3f4f6%22/></svg>'">

        <!-- 호버 오버레이: 상세 보기 -->
        <div class="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur-sm p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <button onclick="event.stopPropagation(); location.href='detail.html?id=${p.id}'"
                  class="w-full ${isCustom ? 'bg-blue-600' : 'bg-black'} text-white text-xs font-bold py-3 uppercase tracking-wider hover:opacity-90">
            ${isCustom ? 'Get Estimate' : 'View Detail'}
          </button>
        </div>

        <!-- 타입 배지 -->
        <div class="absolute top-2 left-2">
          <span class="text-[10px] font-bold px-2 py-1 rounded-sm ${isCustom ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
            ${isCustom ? 'CUSTOM' : 'STORE'}
          </span>
        </div>
      </div>
      <div class="pt-3">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">${categoryLabel}</p>
        <h3 class="text-xs font-bold text-gray-900 truncate cursor-pointer hover:underline"
            onclick="location.href='detail.html?id=${p.id}'">${escapeHtml(p.name)}</h3>
        <p class="text-xs font-medium mt-1">${mainPrice}${origPrice}</p>
      </div>
    </div>
  `;
}

// ===== 유틸 =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function renderSkeletons(count) {
  return Array(count).fill('').map(() => `
    <div class="group">
      <div class="aspect-[3/4] w-full bg-gray-100 animate-pulse rounded"></div>
      <div class="pt-3">
        <div class="h-2 w-16 bg-gray-100 animate-pulse rounded mb-2"></div>
        <div class="h-3 w-full bg-gray-100 animate-pulse rounded mb-2"></div>
        <div class="h-3 w-20 bg-gray-100 animate-pulse rounded"></div>
      </div>
    </div>
  `).join('');
}
