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
        const statusLabel = p.status === 'active' ? '판매중' :
                            p.status === 'draft' ? '숨김' : '보관';

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
            alert(isEdit ? '상품이 수정되었습니다.' : '상품이 등록되었습니다.');
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
