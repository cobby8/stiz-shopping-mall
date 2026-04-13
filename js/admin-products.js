/**
 * STIZ 관리자 - 상품 관리 (admin-products.js)
 * Phase E-3: 상품 CRUD UI
 *
 * 비유: 상품 재고실의 관리 콘솔
 * - 상품 목록 조회 (필터/검색/페이지네이션)
 * - 상품 등록/수정/삭제 (모달 폼)
 * - 상태 토글 (판매중/숨김/보관)
 *
 * 의존: admin-common.js (API_BASE, adminFetch, checkAdminAuth, escapeHtml 등)
 */

// ============================================================
// 전역 상태
// ============================================================

// 현재 필터 조건 — 목록 조회 시 쿼리 파라미터로 전달
let currentFilters = {
    status: '',      // '' = 전체, 'active', 'draft', 'archived'
    type: '',        // '' = 전체, 'ready', 'custom'
    category: '',    // '' = 전체, 카테고리 ID
    search: '',      // 검색어
    page: 1,         // 현재 페이지
    limit: 30        // 페이지당 개수
};

// 카테고리 목록 캐시 — 필터 드롭다운 + 등록 폼에서 사용
let categoriesCache = [];

// ============================================================
// 초기화
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // 인증 확인 — 로그인 안 되어 있으면 로그인 페이지로 이동
    checkAdminAuth();

    // 필터 칩 클릭 이벤트 바인딩
    initFilterChips();

    // 검색어 입력 시 디바운스 적용 (300ms 후 자동 검색)
    const searchInput = document.getElementById('filter-search');
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentFilters.search = searchInput.value.trim();
            currentFilters.page = 1;
            loadProducts();
        }, 300);
    });

    // 카테고리 목록 로드 + 상품 목록 로드 (병렬)
    Promise.all([loadCategories(), loadProducts()]);
});

// ============================================================
// 필터 칩 UI
// ============================================================

/**
 * 필터 칩 클릭 이벤트 초기화
 * 비유: 라디오 버튼처럼 같은 그룹 내에서 하나만 선택 가능
 */
function initFilterChips() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filterType = chip.dataset.filter;  // 'status' 또는 'type'
            const value = chip.dataset.value;         // 선택 값

            // 같은 그룹의 다른 칩 비활성화
            document.querySelectorAll(`.filter-chip[data-filter="${filterType}"]`).forEach(c => {
                c.classList.remove('active');
            });
            chip.classList.add('active');

            // 필터 적용
            currentFilters[filterType] = value;
            currentFilters.page = 1;  // 필터 변경 시 첫 페이지로
            loadProducts();
        });
    });
}

/**
 * 카테고리 드롭다운 변경 시 호출
 */
function applyFilters() {
    currentFilters.category = document.getElementById('filter-category').value;
    currentFilters.page = 1;
    loadProducts();
}

// ============================================================
// 데이터 로드
// ============================================================

/**
 * 카테고리 목록 로드
 * 필터 드롭다운 + 등록/수정 폼의 카테고리 select에 채움
 */
async function loadCategories() {
    try {
        const res = await adminFetch('/api/products/categories');
        if (!res) return;
        const data = await res.json();

        if (data.success) {
            categoriesCache = data.categories || [];

            // 필터 드롭다운에 옵션 추가
            const filterSelect = document.getElementById('filter-category');
            const formSelect = document.getElementById('form-category');

            // 트리 구조를 평탄화 — 대분류 > 중분류 형태로 표시
            categoriesCache.forEach(parent => {
                // 대분류 옵션
                const opt1 = new Option(`${parent.name} (${parent.productCount})`, parent.id);
                filterSelect.appendChild(opt1.cloneNode(true));
                formSelect.appendChild(new Option(parent.name, parent.id));

                // 중분류 옵션 (들여쓰기로 구분)
                if (parent.children) {
                    parent.children.forEach(child => {
                        const opt2 = new Option(`  - ${child.name} (${child.productCount})`, child.id);
                        filterSelect.appendChild(opt2.cloneNode(true));
                        formSelect.appendChild(new Option(`  ${parent.name} > ${child.name}`, child.id));
                    });
                }
            });
        }
    } catch (error) {
        console.error('카테고리 로드 실패:', error);
    }
}

/**
 * 상품 목록 로드 (관리자 API)
 * 필터 조건에 따라 서버에서 데이터를 가져와 테이블에 렌더링
 */
async function loadProducts() {
    const loadingArea = document.getElementById('loading-area');
    const emptyArea = document.getElementById('empty-area');
    const tableBody = document.getElementById('product-table-body');
    const paginationArea = document.getElementById('pagination-area');

    // 로딩 표시
    loadingArea.classList.remove('hidden');
    emptyArea.classList.add('hidden');
    tableBody.innerHTML = '';
    paginationArea.classList.add('hidden');

    try {
        // 쿼리 파라미터 조립
        const params = new URLSearchParams();
        if (currentFilters.status) params.set('status', currentFilters.status);
        if (currentFilters.type) params.set('type', currentFilters.type);
        if (currentFilters.category) params.set('category', currentFilters.category);
        if (currentFilters.search) params.set('search', currentFilters.search);
        params.set('page', currentFilters.page);
        params.set('limit', currentFilters.limit);

        const res = await adminFetch(`/api/admin/products?${params.toString()}`);
        if (!res) return;
        const data = await res.json();

        loadingArea.classList.add('hidden');

        if (!data.success) {
            emptyArea.classList.remove('hidden');
            return;
        }

        // 통계 카드 업데이트
        updateStats(data.statusCounts, data.pagination.total);

        // 상품이 없으면 빈 상태 표시
        if (!data.products || data.products.length === 0) {
            emptyArea.classList.remove('hidden');
            return;
        }

        // 테이블 렌더링
        renderProductTable(data.products, data.pagination);

        // 페이지네이션 렌더링
        renderPagination(data.pagination);

    } catch (error) {
        console.error('상품 목록 로드 실패:', error);
        loadingArea.classList.add('hidden');
        emptyArea.classList.remove('hidden');
    }
}

// ============================================================
// 렌더링
// ============================================================

/**
 * 통계 카드 숫자 업데이트
 * statusCounts: [{ status: 'active', count: 10 }, ...] 형태
 */
function updateStats(statusCounts, total) {
    const counts = {};
    (statusCounts || []).forEach(sc => { counts[sc.status] = sc.count; });

    document.getElementById('stat-total').textContent = total || 0;
    document.getElementById('stat-active').textContent = counts.active || 0;
    document.getElementById('stat-draft').textContent = counts.draft || 0;
    document.getElementById('stat-archived').textContent = counts.archived || 0;
}

/**
 * 상품 테이블 렌더링
 * 비유: 엑셀 시트에 상품을 한 줄씩 채워넣는 것
 */
function renderProductTable(products, pagination) {
    const tableBody = document.getElementById('product-table-body');
    const startIdx = (pagination.page - 1) * pagination.limit;

    tableBody.innerHTML = products.map((p, i) => {
        // 상태 배지 클래스 결정
        const statusClass = p.status === 'active' ? 'status-active' :
                            p.status === 'draft' ? 'status-draft' : 'status-archived';
        // draft 상태에 "비공개" 배지 + 안내 텍스트 추가 (W-3)
        const statusLabel = p.status === 'active' ? '판매중' :
                            p.status === 'draft' ? '비공개' : '보관';

        // 타입 배지
        const typeClass = p.type === 'ready' ? 'type-ready' : 'type-custom';
        const typeLabel = p.type === 'ready' ? '기성품' : '커스텀';

        // 썸네일 — 이미지가 없으면 아이콘으로 대체
        const thumbHtml = p.thumbnail
            ? `<img src="${API_BASE}${escapeHtml(p.thumbnail)}" alt="" class="w-10 h-10 rounded-lg object-cover">`
            : `<div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                 <span class="material-symbols-outlined text-gray-300 text-lg">image</span>
               </div>`;

        // 가격 표시 — 커스텀이면 "~" 접두어
        const priceDisplay = p.price > 0
            ? (p.type === 'custom' ? '~' : '') + formatCurrency(p.price)
            : '-';
        const costDisplay = p.costPrice > 0 ? formatCurrency(p.costPrice) : '-';

        return `
            <tr class="product-row border-b border-gray-100" data-id="${p.id}">
                <td class="px-4 py-3 text-gray-400 text-xs">${startIdx + i + 1}</td>
                <td class="px-4 py-3">${thumbHtml}</td>
                <td class="px-4 py-3">
                    <p class="font-medium text-sm">${escapeHtml(p.name)}</p>
                    ${p.sku ? `<p class="text-xs text-gray-400 mt-0.5">${escapeHtml(p.sku)}</p>` : ''}
                </td>
                <td class="px-4 py-3">
                    <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${typeClass}">${typeLabel}</span>
                </td>
                <td class="px-4 py-3 text-xs text-gray-600">${escapeHtml(p.categoryName || '-')}</td>
                <td class="px-4 py-3 text-right text-sm font-medium">${priceDisplay}</td>
                <td class="px-4 py-3 text-right text-sm text-gray-500">${costDisplay}</td>
                <td class="px-4 py-3 text-center">
                    <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}">${statusLabel}</span>
                    ${p.status === 'draft' ? '<p class="text-[10px] text-gray-400 mt-0.5">고객에게 미노출</p>' : ''}
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <!-- 수정 버튼 -->
                        <button onclick="openEditModal(${p.id})" title="수정"
                            class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700">
                            <span class="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <!-- 상태 토글 버튼 (판매중 <-> 숨김) -->
                        <button onclick="toggleStatus(${p.id}, '${p.status}')" title="상태 변경"
                            class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700">
                            <span class="material-symbols-outlined text-lg">${p.status === 'active' ? 'visibility_off' : 'visibility'}</span>
                        </button>
                        <!-- 삭제(보관) 버튼 -->
                        <button onclick="archiveProduct(${p.id}, '${escapeHtml(p.name)}')" title="보관(삭제)"
                            class="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                            <span class="material-symbols-outlined text-lg">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 페이지네이션 렌더링
 * 비유: 책의 페이지 번호판 — 현재 위치와 전체 페이지 표시
 */
function renderPagination(pagination) {
    const area = document.getElementById('pagination-area');
    const info = document.getElementById('pagination-info');
    const buttons = document.getElementById('pagination-buttons');

    if (pagination.totalPages <= 1) {
        area.classList.add('hidden');
        return;
    }

    area.classList.remove('hidden');

    // 정보 텍스트: "1-30 / 총 120개"
    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    info.textContent = `${start}-${end} / 총 ${pagination.total}개`;

    // 페이지 버튼 생성
    let html = '';

    // 이전 버튼
    if (pagination.page > 1) {
        html += `<button onclick="goToPage(${pagination.page - 1})" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">이전</button>`;
    }

    // 페이지 번호 (최대 5개 표시)
    const maxButtons = 5;
    let startPage = Math.max(1, pagination.page - Math.floor(maxButtons / 2));
    let endPage = Math.min(pagination.totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
        const isActive = p === pagination.page;
        html += `<button onclick="goToPage(${p})"
            class="px-3 py-1.5 text-sm rounded-lg ${isActive ? 'bg-brand-black text-white' : 'border border-gray-300 hover:bg-gray-50'}">${p}</button>`;
    }

    // 다음 버튼
    if (pagination.page < pagination.totalPages) {
        html += `<button onclick="goToPage(${pagination.page + 1})" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">다음</button>`;
    }

    buttons.innerHTML = html;
}

/**
 * 페이지 이동
 */
function goToPage(page) {
    currentFilters.page = page;
    loadProducts();
    // 테이블 상단으로 스크롤
    document.getElementById('product-table-body').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// 모달: 상품 등록/수정
// ============================================================

/**
 * 등록 모달 열기
 * 비유: 빈 신규 상품 카드를 꺼내서 작성 시작
 */
function openCreateModal() {
    document.getElementById('modal-title').textContent = '상품 등록';
    document.getElementById('btn-submit').textContent = '등록하기';
    document.getElementById('form-product-id').value = '';

    // 폼 초기화
    document.getElementById('product-form').reset();
    document.getElementById('form-status').value = 'draft';

    // 이미지 상태 초기화
    resetImageState();

    // 모달 표시
    document.getElementById('modal-product').classList.remove('hidden');
}

/**
 * 수정 모달 열기
 * 서버에서 상품 상세 정보를 가져와 폼에 채움
 */
async function openEditModal(productId) {
    try {
        // 관리자 API로 전체 정보 조회 (원가 포함)
        const res = await adminFetch(`/api/admin/products?search=&limit=200`);
        if (!res) return;
        const data = await res.json();

        // ID로 해당 상품 찾기
        const product = data.products.find(p => p.id === productId);
        if (!product) {
            alert('상품을 찾을 수 없습니다.');
            return;
        }

        // 모달 제목 변경
        document.getElementById('modal-title').textContent = '상품 수정';
        document.getElementById('btn-submit').textContent = '수정하기';
        document.getElementById('form-product-id').value = product.id;

        // 폼에 기존 값 채우기
        const typeRadio = document.querySelector(`input[name="product-type"][value="${product.type}"]`);
        if (typeRadio) typeRadio.checked = true;

        document.getElementById('form-category').value = product.categoryId || '';
        document.getElementById('form-name').value = product.name || '';
        document.getElementById('form-nameEn').value = product.nameEn || '';
        document.getElementById('form-sku').value = product.sku || '';
        document.getElementById('form-fabric').value = product.fabric || '';
        document.getElementById('form-description').value = product.description || '';
        document.getElementById('form-price').value = product.price || 0;
        document.getElementById('form-costPrice').value = product.costPrice || 0;
        document.getElementById('form-clubPrice').value = product.clubPrice || 0;
        document.getElementById('form-wholesalePrice').value = product.wholesalePrice || 0;
        document.getElementById('form-sizes').value = product.sizes || '';
        document.getElementById('form-keywords').value = product.keywords || '';
        document.getElementById('form-status').value = product.status || 'draft';
        document.getElementById('form-sortOrder').value = product.sortOrder || 0;

        // 기존 이미지 로드 — 수정 모드에서 서버에 저장된 이미지를 미리보기로 표시
        resetImageState();
        await loadExistingImages(product.id);

        // 모달 표시
        document.getElementById('modal-product').classList.remove('hidden');

    } catch (error) {
        console.error('상품 상세 로드 실패:', error);
        alert('상품 정보를 불러오지 못했습니다.');
    }
}

/**
 * 모달 닫기
 */
function closeModal() {
    document.getElementById('modal-product').classList.add('hidden');
}

/**
 * 상품 등록/수정 폼 제출 처리
 * 비유: 작성한 상품 카드를 제출하면 서버(재고실)에 반영
 */
async function handleProductSubmit(event) {
    event.preventDefault();

    const productId = document.getElementById('form-product-id').value;
    const isEdit = !!productId;  // ID가 있으면 수정 모드

    // 폼 데이터 수집
    const body = {
        type: document.querySelector('input[name="product-type"]:checked').value,
        categoryId: document.getElementById('form-category').value,
        name: document.getElementById('form-name').value.trim(),
        nameEn: document.getElementById('form-nameEn').value.trim(),
        sku: document.getElementById('form-sku').value.trim(),
        fabric: document.getElementById('form-fabric').value.trim(),
        description: document.getElementById('form-description').value.trim(),
        price: parseInt(document.getElementById('form-price').value) || 0,
        costPrice: parseInt(document.getElementById('form-costPrice').value) || 0,
        clubPrice: parseInt(document.getElementById('form-clubPrice').value) || 0,
        wholesalePrice: parseInt(document.getElementById('form-wholesalePrice').value) || 0,
        sizes: document.getElementById('form-sizes').value.trim(),
        keywords: document.getElementById('form-keywords').value.trim(),
        status: document.getElementById('form-status').value,
        sortOrder: parseInt(document.getElementById('form-sortOrder').value) || 0
    };

    // 필수 값 검증
    if (!body.name) {
        alert('상품명을 입력해주세요.');
        return;
    }
    if (!body.categoryId) {
        alert('카테고리를 선택해주세요.');
        return;
    }

    // 제출 버튼 비활성화 (중복 클릭 방지)
    const submitBtn = document.getElementById('btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
        const url = isEdit ? `/api/admin/products/${productId}` : '/api/admin/products';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await adminFetch(url, {
            method,
            body: JSON.stringify(body)
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            // 상품 저장 성공 후 새 이미지가 있으면 업로드
            const savedId = isEdit ? productId : data.product?.id;
            if (savedId) {
                await uploadPendingImages(savedId);
            }
            // 등록 성공 시 draft 상태 안내 포함 (W-3)
            // 비유: 새 상품은 "비공개 창고"에 먼저 들어가고, 관리자가 직접 "매장 진열"로 바꿔야 고객에게 보임
            if (isEdit) {
                alert('상품이 수정되었습니다.');
            } else {
                alert('상품이 등록되었습니다.\n\n현재 \'숨김(초안)\' 상태입니다.\n쇼핑몰에 노출하려면 상태를 \'판매중\'으로 변경하세요.');
            }
            closeModal();
            loadProducts();  // 목록 새로고침
        } else {
            alert(data.error || '처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('상품 저장 실패:', error);
        alert('서버 오류가 발생했습니다.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? '수정하기' : '등록하기';
    }
}

// ============================================================
// 상태 변경 / 삭제
// ============================================================

/**
 * 상태 빠른 토글 (판매중 <-> 숨김)
 * 비유: 상품 진열 스위치 — 켜면 매장에 나오고, 끄면 숨김
 */
async function toggleStatus(productId, currentStatus) {
    // active -> draft, 그 외 -> active
    const newStatus = currentStatus === 'active' ? 'draft' : 'active';
    const label = newStatus === 'active' ? '판매중' : '숨김';

    if (!confirm(`이 상품을 "${label}" 상태로 변경하시겠습니까?`)) return;

    try {
        const res = await adminFetch(`/api/admin/products/${productId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            loadProducts();  // 목록 새로고침
        } else {
            alert(data.error || '상태 변경에 실패했습니다.');
        }
    } catch (error) {
        console.error('상태 변경 실패:', error);
        alert('서버 오류가 발생했습니다.');
    }
}

/**
 * 상품 보관(소프트 삭제)
 * 비유: 상품을 매장에서 치우되 창고에 보관 — 완전 삭제는 아님
 */
async function archiveProduct(productId, productName) {
    if (!confirm(`"${productName}" 상품을 보관(삭제) 처리하시겠습니까?\n\n보관된 상품은 목록에서 숨겨지지만 데이터는 유지됩니다.`)) {
        return;
    }

    try {
        const res = await adminFetch(`/api/admin/products/${productId}`, {
            method: 'DELETE'
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            loadProducts();  // 목록 새로고침
        } else {
            alert(data.error || '삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('상품 삭제 실패:', error);
        alert('서버 오류가 발생했습니다.');
    }
}

// ============================================================
// 이미지 업로드 관련
// ============================================================

// 이미지 상태: 새로 추가할 파일 + 서버에 이미 있는 이미지
let pendingImages = [];       // 새로 선택한 File 객체 배열
let existingImages = [];      // 서버에 있는 기존 이미지 [{id, url, isPrimary}]
let pendingDetailImages = []; // 상세페이지용 새 파일
let existingDetailImages = [];// 서버에 있는 상세페이지 이미지
let primaryImageIndex = 0;    // 대표 이미지 인덱스 (기존+신규 통합)

/**
 * 이미지 상태 초기화 — 모달 열 때마다 호출
 */
function resetImageState() {
    pendingImages = [];
    existingImages = [];
    pendingDetailImages = [];
    existingDetailImages = [];
    primaryImageIndex = 0;
    renderImagePreviews();
    renderDetailImagePreviews();
}

/**
 * 수정 모드에서 기존 이미지 로드
 * GET /api/products/:id 의 images 배열을 가져와서 미리보기에 표시
 */
async function loadExistingImages(productId) {
    try {
        const res = await fetch(`/api/products/${productId}`);
        const data = await res.json();
        if (!data.success || !data.product) return;

        const allImages = data.product.images || [];
        // type이 'detail'이면 상세페이지 이미지, 나머지는 일반 이미지
        existingImages = allImages.filter(img => img.type !== 'detail');
        existingDetailImages = allImages.filter(img => img.type === 'detail');

        // 대표 이미지 인덱스 찾기
        const primaryIdx = existingImages.findIndex(img => img.isPrimary === 1);
        if (primaryIdx >= 0) primaryImageIndex = primaryIdx;

        renderImagePreviews();
        renderDetailImagePreviews();
    } catch (err) {
        console.error('기존 이미지 로드 실패:', err);
    }
}

/**
 * 이미지 미리보기 렌더링 — 기존 이미지 + 새로 선택한 파일을 합쳐서 표시
 */
function renderImagePreviews() {
    const grid = document.getElementById('image-preview-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 기존 이미지 먼저
    existingImages.forEach((img, i) => {
        grid.appendChild(createImagePreviewCard(img.url, i, true, img.id, i === primaryImageIndex));
    });

    // 새로 선택한 파일
    pendingImages.forEach((file, i) => {
        const url = URL.createObjectURL(file);
        const idx = existingImages.length + i;
        grid.appendChild(createImagePreviewCard(url, idx, false, null, idx === primaryImageIndex));
    });
}

/**
 * 이미지 미리보기 카드 생성
 * 라디오 버튼으로 대표 이미지 선택, X 버튼으로 삭제
 */
function createImagePreviewCard(src, index, isExisting, imageId, isPrimary) {
    const card = document.createElement('div');
    card.className = 'relative group rounded-lg overflow-hidden border border-gray-200';

    card.innerHTML = `
        <img src="${src}" alt="상품 이미지" class="w-full aspect-square object-cover">
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors"></div>
        <!-- 삭제 버튼 -->
        <button type="button" onclick="removeImage(${index}, ${isExisting}, ${imageId || 'null'})"
                class="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="material-symbols-outlined text-sm">close</span>
        </button>
        <!-- 대표 이미지 라디오 -->
        <label class="absolute bottom-1 left-1 flex items-center gap-1 bg-white/90 rounded px-1.5 py-0.5 text-xs cursor-pointer">
            <input type="radio" name="primary-image" ${isPrimary ? 'checked' : ''}
                   onchange="setPrimaryImage(${index})" class="accent-brand-red">
            <span>${isPrimary ? '대표' : '선택'}</span>
        </label>
    `;

    return card;
}

/**
 * 대표 이미지 설정
 */
function setPrimaryImage(index) {
    primaryImageIndex = index;
    renderImagePreviews();
}

/**
 * 이미지 삭제 — 기존 이미지면 서버에서도 삭제, 새 파일이면 배열에서 제거
 */
async function removeImage(index, isExisting, imageId) {
    if (isExisting && imageId) {
        // 서버에서 삭제
        const productId = document.getElementById('form-product-id').value;
        if (productId && confirm('이 이미지를 삭제하시겠습니까?')) {
            try {
                const res = await adminFetch(`/api/admin/products/${productId}/images/${imageId}`, { method: 'DELETE' });
                if (res) {
                    existingImages = existingImages.filter(img => img.id !== imageId);
                    if (primaryImageIndex >= existingImages.length + pendingImages.length) {
                        primaryImageIndex = 0;
                    }
                    renderImagePreviews();
                }
            } catch (err) {
                console.error('이미지 삭제 실패:', err);
            }
        }
    } else {
        // 새로 추가한 파일 제거
        const pendingIdx = index - existingImages.length;
        pendingImages.splice(pendingIdx, 1);
        if (primaryImageIndex >= existingImages.length + pendingImages.length) {
            primaryImageIndex = 0;
        }
        renderImagePreviews();
    }
}

/**
 * 상세페이지 이미지 미리보기 렌더링
 */
function renderDetailImagePreviews() {
    const grid = document.getElementById('detail-image-preview-grid');
    if (!grid) return;
    grid.innerHTML = '';

    existingDetailImages.forEach((img, i) => {
        const card = document.createElement('div');
        card.className = 'relative group rounded-lg overflow-hidden border border-gray-200';
        card.innerHTML = `
            <img src="${img.url}" alt="상세 이미지" class="w-full aspect-square object-cover">
            <button type="button" onclick="removeDetailImage(${i}, true, ${img.id})"
                    class="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;
        grid.appendChild(card);
    });

    pendingDetailImages.forEach((file, i) => {
        const card = document.createElement('div');
        card.className = 'relative group rounded-lg overflow-hidden border border-gray-200';
        card.innerHTML = `
            <img src="${URL.createObjectURL(file)}" alt="상세 이미지" class="w-full aspect-square object-cover">
            <button type="button" onclick="removeDetailImage(${i}, false, null)"
                    class="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;
        grid.appendChild(card);
    });
}

/**
 * 상세 이미지 삭제
 */
async function removeDetailImage(index, isExisting, imageId) {
    if (isExisting && imageId) {
        const productId = document.getElementById('form-product-id').value;
        if (productId && confirm('이 상세 이미지를 삭제하시겠습니까?')) {
            try {
                const res = await adminFetch(`/api/admin/products/${productId}/images/${imageId}`, { method: 'DELETE' });
                if (res) {
                    existingDetailImages = existingDetailImages.filter(img => img.id !== imageId);
                    renderDetailImagePreviews();
                }
            } catch (err) {
                console.error('상세 이미지 삭제 실패:', err);
            }
        }
    } else {
        pendingDetailImages.splice(index, 1);
        renderDetailImagePreviews();
    }
}

/**
 * 상품 저장 후 대기 중인 이미지 파일을 서버에 업로드
 * POST /api/admin/products/:id/images (FormData)
 */
async function uploadPendingImages(productId) {
    // 일반 상품 이미지 업로드
    if (pendingImages.length > 0) {
        const formData = new FormData();
        pendingImages.forEach(file => formData.append('images', file));
        // 대표 이미지 인덱스 — 새 파일 중에서의 상대 인덱스
        const primaryInPending = primaryImageIndex - existingImages.length;
        if (primaryInPending >= 0 && primaryInPending < pendingImages.length) {
            formData.append('primaryIndex', primaryInPending);
        }

        try {
            const res = await adminFetch(`/api/admin/products/${productId}/images`, {
                method: 'POST',
                body: formData
            });
            if (res) {
                const data = await res.json();
                if (!data.success) console.warn('이미지 업로드 부분 실패:', data.error);
            }
        } catch (err) {
            console.error('상품 이미지 업로드 실패:', err);
        }
    }

    // 기존 이미지 중 대표가 변경된 경우 — 서버에 대표 이미지 업데이트
    if (existingImages.length > 0 && primaryImageIndex < existingImages.length) {
        const primaryImg = existingImages[primaryImageIndex];
        if (primaryImg && !primaryImg.isPrimary) {
            try {
                const productId2 = document.getElementById('form-product-id').value;
                if (productId2) {
                    // 순서 변경 API로 대표 이미지 설정
                    const orderData = existingImages.map((img, i) => ({
                        id: img.id,
                        sortOrder: i,
                        isPrimary: i === primaryImageIndex ? 1 : 0
                    }));
                    await adminFetch(`/api/admin/products/${productId2}/images/order`, {
                        method: 'PUT',
                        body: JSON.stringify({ images: orderData })
                    });
                }
            } catch (err) {
                console.error('대표 이미지 설정 실패:', err);
            }
        }
    }

    // 상세페이지 이미지 업로드
    if (pendingDetailImages.length > 0) {
        const formData = new FormData();
        pendingDetailImages.forEach(file => formData.append('images', file));
        formData.append('type', 'detail');

        try {
            const res = await adminFetch(`/api/admin/products/${productId}/images`, {
                method: 'POST',
                body: formData
            });
            if (res) {
                const data = await res.json();
                if (!data.success) console.warn('상세 이미지 업로드 부분 실패:', data.error);
            }
        } catch (err) {
            console.error('상세 이미지 업로드 실패:', err);
        }
    }
}

// ============================================================
// 드래그앤드롭 / 파일 선택 이벤트 바인딩
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // 일반 이미지 파일 선택
    const fileInput = document.getElementById('image-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            addPendingImages(files, 'product');
            e.target.value = ''; // 같은 파일 재선택 가능하도록 초기화
        });
    }

    // 상세 이미지 파일 선택
    const detailFileInput = document.getElementById('detail-image-file-input');
    if (detailFileInput) {
        detailFileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            addPendingImages(files, 'detail');
            e.target.value = '';
        });
    }

    // 드래그앤드롭 — 일반 이미지
    const dropZone = document.getElementById('image-drop-zone');
    if (dropZone) {
        setupDropZone(dropZone, 'product');
    }

    // 드래그앤드롭 — 상세 이미지
    const detailDropZone = document.getElementById('detail-image-drop-zone');
    if (detailDropZone) {
        setupDropZone(detailDropZone, 'detail');
    }
});

/**
 * 드래그앤드롭 영역 이벤트 바인딩
 */
function setupDropZone(zone, type) {
    ['dragenter', 'dragover'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            zone.classList.add('border-brand-black', 'bg-gray-50');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            zone.classList.remove('border-brand-black', 'bg-gray-50');
        });
    });

    zone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        addPendingImages(files, type);
    });
}

/**
 * 파일 유효성 검사 후 대기열에 추가
 */
function addPendingImages(files, type) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const maxCount = 10;

    const targetArr = type === 'detail' ? pendingDetailImages : pendingImages;
    const existingArr = type === 'detail' ? existingDetailImages : existingImages;
    const currentTotal = existingArr.length + targetArr.length;

    for (const file of files) {
        if (currentTotal + targetArr.length - (type === 'detail' ? pendingDetailImages.length : pendingImages.length) + 1 > maxCount) {
            alert(`최대 ${maxCount}장까지 업로드 가능합니다.`);
            break;
        }
        if (file.size > maxSize) {
            alert(`"${file.name}"이 5MB를 초과합니다. 건너뜁니다.`);
            continue;
        }
        targetArr.push(file);
    }

    if (type === 'detail') {
        renderDetailImagePreviews();
    } else {
        renderImagePreviews();
    }
}
