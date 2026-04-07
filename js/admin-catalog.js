/**
 * 관리자 상품 카탈로그 편집 로직 (A-3)
 *
 * 비유: 식당 메뉴판 편집기 — 종목/품목/원단/구성/가격을 탭별로 편집하고 한 번에 저장
 *
 * 의존: admin-common.js (checkAdminAuth, adminFetch, escapeHtml, formatCurrency 등)
 */

// --- 전역 상태 ---
let catalog = null;         // 서버에서 받아온 카탈로그 데이터
let hasChanges = false;     // 변경 여부 추적 — 저장 버튼 활성화에 사용
let currentTab = 'sports';  // 현재 활성 탭

// --- 페이지 초기화 ---
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();   // 관리자 인증 확인 (admin-common.js)
    loadCatalog();      // 서버에서 카탈로그 데이터 불러오기
});

// === 데이터 로드 ===
async function loadCatalog() {
    try {
        const res = await adminFetch('/api/admin/catalog');
        if (!res) return;
        const json = await res.json();

        if (!json.success) {
            showToast(json.error || '카탈로그 로드 실패', 'error');
            return;
        }

        catalog = json.data;

        // 마지막 수정 정보 표시
        const updatedEl = document.getElementById('last-updated');
        if (json.updatedAt) {
            updatedEl.textContent = `마지막 수정: ${formatDateTime(json.updatedAt)} (${json.updatedBy || '-'})`;
        }

        // 탭 콘텐츠 렌더링 + 시뮬레이션 초기화
        renderTab();
        initSimulation();
    } catch (err) {
        console.error('카탈로그 로드 에러:', err);
        showToast('카탈로그를 불러올 수 없습니다.', 'error');
    }
}

// === 탭 전환 ===
function switchTab(tab) {
    currentTab = tab;
    // 탭 버튼 스타일 갱신
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    renderTab();
}

// === 탭 별 렌더링 분기 ===
function renderTab() {
    if (!catalog) return;
    const container = document.getElementById('tab-content');

    switch (currentTab) {
        case 'sports':      container.innerHTML = renderListSection(catalog.sports, 'sports', '종목'); break;
        case 'categories':  container.innerHTML = renderListSection(catalog.categories, 'categories', '품목'); break;
        case 'fabrics':     container.innerHTML = renderListSection(catalog.fabrics, 'fabrics', '원단'); break;
        case 'compositions': container.innerHTML = renderCompositionsSection(); break;
        case 'prices':      container.innerHTML = renderPricesSection(); break;
    }
}

// === 공통 리스트 섹션 렌더링 (종목/품목/원단) ===
// 비유: 메뉴 목록을 카드로 나열하고, 각 카드에 편집/토글/삭제 버튼 배치
function renderListSection(items, sectionKey, label) {
    if (!items || items.length === 0) {
        return `<div class="text-center text-gray-400 py-12">${label} 항목이 없습니다.</div>`;
    }

    // sortOrder 기준 정렬
    const sorted = [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    let html = '<div class="space-y-3">';
    sorted.forEach((item, idx) => {
        const inactiveClass = item.active ? '' : 'inactive';
        // 각 섹션별 표시 내용이 다름
        let extraInfo = '';
        if (sectionKey === 'sports' && item.icon) {
            extraInfo = `<span class="material-symbols-outlined text-gray-400 text-lg">${escapeHtml(item.icon)}</span>`;
        }
        if (sectionKey === 'categories' && item.description) {
            extraInfo = `<span class="text-xs text-gray-400">${escapeHtml(item.description)}</span>`;
        }
        if (sectionKey === 'fabrics') {
            extraInfo = `<span class="text-xs text-gray-400">x${item.priceMultiplier || 1.0}</span>`;
        }

        html += `
        <div class="item-card ${inactiveClass}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <span class="text-xs text-gray-300 w-6 text-center">${item.sortOrder || '-'}</span>
                ${extraInfo}
                <span class="font-semibold text-sm truncate">${escapeHtml(item.label || item.id)}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <div class="toggle-switch ${item.active ? 'on' : ''}"
                     onclick="toggleActive('${sectionKey}', '${item.id}')"
                     title="${item.active ? '활성' : '비활성'}"></div>
                <button onclick="openEditModal('${sectionKey}', '${item.id}')"
                    class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                    <span class="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onclick="deleteItem('${sectionKey}', '${item.id}')"
                    class="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <span class="material-symbols-outlined text-lg">delete</span>
                </button>
            </div>
        </div>`;
    });
    html += '</div>';

    // 추가 버튼
    html += `
    <button onclick="openAddModal('${sectionKey}')"
        class="mt-4 flex items-center gap-2 text-sm font-semibold text-brand-red hover:text-red-700 transition-colors">
        <span class="material-symbols-outlined text-lg">add_circle</span>
        ${label} 추가
    </button>`;

    return html;
}

// === 구성옵션 섹션 렌더링 ===
function renderCompositionsSection() {
    if (!catalog.compositions) return '<div class="text-gray-400">구성옵션 데이터가 없습니다.</div>';

    const sections = [
        { key: 'homeAway', label: '홈/어웨이', items: catalog.compositions.homeAway || [] },
        { key: 'parts', label: '구성 (상의/하의)', items: catalog.compositions.parts || [] },
        { key: 'type', label: '유형 (단면/양면)', items: catalog.compositions.type || [] },
    ];

    let html = '';
    sections.forEach(sec => {
        html += `<div class="mb-6">
            <h3 class="font-bold text-sm mb-3 text-gray-700">${sec.label}</h3>
            <div class="space-y-2">`;

        sec.items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(item => {
            const inactiveClass = item.active ? '' : 'inactive';
            html += `
            <div class="item-card ${inactiveClass}">
                <div class="flex items-center gap-3 flex-1">
                    <span class="text-xs text-gray-300 w-6 text-center">${item.sortOrder || '-'}</span>
                    <span class="font-semibold text-sm">${escapeHtml(item.label)}</span>
                    <span class="text-xs text-gray-400">x${item.multiplier}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <div class="toggle-switch ${item.active ? 'on' : ''}"
                         onclick="toggleCompositionActive('${sec.key}', '${item.id}')"></div>
                    <button onclick="openCompositionEditModal('${sec.key}', '${item.id}')"
                        class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                        <span class="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button onclick="deleteCompositionItem('${sec.key}', '${item.id}')"
                        class="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                </div>
            </div>`;
        });

        html += `</div>
            <button onclick="openCompositionAddModal('${sec.key}')"
                class="mt-2 flex items-center gap-2 text-sm font-semibold text-brand-red hover:text-red-700 transition-colors">
                <span class="material-symbols-outlined text-lg">add_circle</span>
                옵션 추가
            </button>
        </div>`;
    });

    return html;
}

// === 가격 섹션 렌더링 ===
function renderPricesSection() {
    const basePrices = catalog.basePrices || {};
    const categories = catalog.categories || [];

    let html = '<div class="space-y-6">';

    // 기본 단가 테이블
    html += `<div>
        <h3 class="font-bold text-sm mb-3 text-gray-700">기본 단가 (1벌, 기본원단, 상의+하의 세트 기준)</h3>
        <div class="space-y-2">`;

    categories.forEach(cat => {
        const price = basePrices[cat.id] || 0;
        html += `
        <div class="item-card">
            <span class="font-semibold text-sm flex-1">${escapeHtml(cat.label)}</span>
            <div class="flex items-center gap-2">
                <input type="number" value="${price}" min="0" step="1000"
                    onchange="updateBasePrice('${cat.id}', this.value)"
                    class="w-32 text-right border rounded-lg px-3 py-1.5 text-sm font-mono">
                <span class="text-xs text-gray-400">원</span>
            </div>
        </div>`;
    });

    html += '</div></div>';

    // 사이즈 목록
    html += `<div>
        <h3 class="font-bold text-sm mb-3 text-gray-700">사이즈 옵션</h3>
        <div class="flex flex-wrap gap-2">`;

    (catalog.sizes || []).forEach((size, idx) => {
        html += `<span class="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">${escapeHtml(size)}</span>`;
    });

    html += `</div>
        <div class="mt-3 flex items-center gap-2">
            <input id="new-size" type="text" placeholder="새 사이즈 (예: 5XL)" class="border rounded-lg px-3 py-1.5 text-sm w-40">
            <button onclick="addSize()" class="text-brand-red text-sm font-semibold hover:text-red-700 flex items-center gap-1">
                <span class="material-symbols-outlined text-base">add</span>추가
            </button>
        </div>
    </div>`;

    html += '</div>';
    return html;
}

// === 활성/비활성 토글 ===
function toggleActive(sectionKey, itemId) {
    const items = catalog[sectionKey];
    if (!items) return;
    const item = items.find(i => i.id === itemId);
    if (item) {
        item.active = !item.active;
        markChanged();
        renderTab();
    }
}

function toggleCompositionActive(subKey, itemId) {
    const items = catalog.compositions?.[subKey];
    if (!items) return;
    const item = items.find(i => i.id === itemId);
    if (item) {
        item.active = !item.active;
        markChanged();
        renderTab();
    }
}

// === 항목 삭제 ===
function deleteItem(sectionKey, itemId) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    catalog[sectionKey] = catalog[sectionKey].filter(i => i.id !== itemId);
    // 가격 섹션에서도 해당 키 삭제
    if (sectionKey === 'categories' && catalog.basePrices) {
        delete catalog.basePrices[itemId];
    }
    markChanged();
    renderTab();
}

function deleteCompositionItem(subKey, itemId) {
    if (!confirm('이 옵션을 삭제하시겠습니까?')) return;
    catalog.compositions[subKey] = catalog.compositions[subKey].filter(i => i.id !== itemId);
    markChanged();
    renderTab();
}

// === 기본 단가 수정 ===
function updateBasePrice(categoryId, value) {
    if (!catalog.basePrices) catalog.basePrices = {};
    catalog.basePrices[categoryId] = parseInt(value) || 0;
    markChanged();
    updateSimulation();
}

// === 사이즈 추가 ===
function addSize() {
    const input = document.getElementById('new-size');
    const val = input.value.trim().toUpperCase();
    if (!val) return;
    if (!catalog.sizes) catalog.sizes = [];
    if (catalog.sizes.includes(val)) {
        showToast('이미 존재하는 사이즈입니다.', 'error');
        return;
    }
    catalog.sizes.push(val);
    input.value = '';
    markChanged();
    renderTab();
}

// === 모달: 종목/품목/원단 추가 ===
function openAddModal(sectionKey) {
    const labels = { sports: '종목', categories: '품목', fabrics: '원단' };
    const label = labels[sectionKey] || '항목';

    // 섹션별 추가 필드 결정
    let extraFields = '';
    if (sectionKey === 'sports') {
        extraFields = `
        <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-gray-600">아이콘 (Material Symbols)</span>
            <input id="modal-icon" type="text" placeholder="예: sports_basketball" class="border rounded-lg px-3 py-2">
        </label>`;
    }
    if (sectionKey === 'categories' || sectionKey === 'fabrics') {
        extraFields = `
        <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-gray-600">설명</span>
            <input id="modal-desc" type="text" placeholder="간단한 설명" class="border rounded-lg px-3 py-2">
        </label>`;
    }
    if (sectionKey === 'fabrics') {
        extraFields += `
        <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-gray-600">가격 배수</span>
            <input id="modal-multiplier" type="number" step="0.1" value="1.0" class="border rounded-lg px-3 py-2">
        </label>`;
    }

    const maxSort = Math.max(0, ...(catalog[sectionKey] || []).map(i => i.sortOrder || 0));

    showModal(`${label} 추가`, `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID (영문, 언더스코어)</span>
                <input id="modal-id" type="text" placeholder="예: futsal" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름 (한글)</span>
                <input id="modal-label" type="text" placeholder="예: 풋살" class="border rounded-lg px-3 py-2">
            </label>
            ${extraFields}
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">정렬 순서</span>
                <input id="modal-sort" type="number" value="${maxSort + 1}" class="border rounded-lg px-3 py-2">
            </label>
        </div>
    `, () => {
        const id = document.getElementById('modal-id').value.trim();
        const label = document.getElementById('modal-label').value.trim();
        const sortOrder = parseInt(document.getElementById('modal-sort').value) || 1;

        if (!id || !label) { showToast('ID와 이름은 필수입니다.', 'error'); return false; }
        if (catalog[sectionKey].some(i => i.id === id)) { showToast('이미 존재하는 ID입니다.', 'error'); return false; }

        const newItem = { id, label, sortOrder, active: true };

        if (sectionKey === 'sports') {
            newItem.icon = document.getElementById('modal-icon')?.value.trim() || 'checkroom';
        }
        if (sectionKey === 'categories') {
            newItem.description = document.getElementById('modal-desc')?.value.trim() || '';
        }
        if (sectionKey === 'fabrics') {
            newItem.description = document.getElementById('modal-desc')?.value.trim() || '';
            newItem.priceMultiplier = parseFloat(document.getElementById('modal-multiplier')?.value) || 1.0;
        }

        catalog[sectionKey].push(newItem);

        // 품목 추가 시 기본 단가도 0으로 초기화
        if (sectionKey === 'categories') {
            if (!catalog.basePrices) catalog.basePrices = {};
            catalog.basePrices[id] = 0;
        }

        markChanged();
        renderTab();
        initSimulation();
        return true; // 모달 닫기
    });
}

// === 모달: 종목/품목/원단 편집 ===
function openEditModal(sectionKey, itemId) {
    const item = catalog[sectionKey]?.find(i => i.id === itemId);
    if (!item) return;

    const labels = { sports: '종목', categories: '품목', fabrics: '원단' };
    const label = labels[sectionKey] || '항목';

    let extraFields = '';
    if (sectionKey === 'sports') {
        extraFields = `
        <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-gray-600">아이콘</span>
            <input id="modal-icon" type="text" value="${escapeHtml(item.icon || '')}" class="border rounded-lg px-3 py-2">
        </label>`;
    }
    if (sectionKey === 'categories' || sectionKey === 'fabrics') {
        extraFields = `
        <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-gray-600">설명</span>
            <input id="modal-desc" type="text" value="${escapeHtml(item.description || '')}" class="border rounded-lg px-3 py-2">
        </label>`;
    }
    if (sectionKey === 'fabrics') {
        extraFields += `
        <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-gray-600">가격 배수</span>
            <input id="modal-multiplier" type="number" step="0.1" value="${item.priceMultiplier || 1.0}" class="border rounded-lg px-3 py-2">
        </label>`;
    }

    showModal(`${label} 편집`, `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID</span>
                <input id="modal-id" type="text" value="${escapeHtml(item.id)}" class="border rounded-lg px-3 py-2 bg-gray-50" readonly>
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" value="${escapeHtml(item.label || '')}" class="border rounded-lg px-3 py-2">
            </label>
            ${extraFields}
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">정렬 순서</span>
                <input id="modal-sort" type="number" value="${item.sortOrder || 1}" class="border rounded-lg px-3 py-2">
            </label>
        </div>
    `, () => {
        item.label = document.getElementById('modal-label').value.trim() || item.label;
        item.sortOrder = parseInt(document.getElementById('modal-sort').value) || item.sortOrder;

        if (sectionKey === 'sports') {
            item.icon = document.getElementById('modal-icon')?.value.trim() || item.icon;
        }
        if (sectionKey === 'categories' || sectionKey === 'fabrics') {
            item.description = document.getElementById('modal-desc')?.value.trim() ?? item.description;
        }
        if (sectionKey === 'fabrics') {
            item.priceMultiplier = parseFloat(document.getElementById('modal-multiplier')?.value) || item.priceMultiplier;
        }

        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

// === 모달: 구성옵션 추가 ===
function openCompositionAddModal(subKey) {
    const maxSort = Math.max(0, ...(catalog.compositions[subKey] || []).map(i => i.sortOrder || 0));

    showModal('구성옵션 추가', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID</span>
                <input id="modal-id" type="text" placeholder="예: triple" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" placeholder="예: 3벌 세트" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">배수</span>
                <input id="modal-multiplier" type="number" step="0.1" value="1.0" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">정렬 순서</span>
                <input id="modal-sort" type="number" value="${maxSort + 1}" class="border rounded-lg px-3 py-2">
            </label>
        </div>
    `, () => {
        const id = document.getElementById('modal-id').value.trim();
        const label = document.getElementById('modal-label').value.trim();
        if (!id || !label) { showToast('ID와 이름은 필수입니다.', 'error'); return false; }

        catalog.compositions[subKey].push({
            id,
            label,
            multiplier: parseFloat(document.getElementById('modal-multiplier').value) || 1.0,
            sortOrder: parseInt(document.getElementById('modal-sort').value) || 1,
            active: true,
        });
        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

// === 모달: 구성옵션 편집 ===
function openCompositionEditModal(subKey, itemId) {
    const item = catalog.compositions[subKey]?.find(i => i.id === itemId);
    if (!item) return;

    showModal('구성옵션 편집', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID</span>
                <input id="modal-id" type="text" value="${escapeHtml(item.id)}" class="border rounded-lg px-3 py-2 bg-gray-50" readonly>
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" value="${escapeHtml(item.label)}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">배수</span>
                <input id="modal-multiplier" type="number" step="0.1" value="${item.multiplier}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">정렬 순서</span>
                <input id="modal-sort" type="number" value="${item.sortOrder || 1}" class="border rounded-lg px-3 py-2">
            </label>
        </div>
    `, () => {
        item.label = document.getElementById('modal-label').value.trim() || item.label;
        item.multiplier = parseFloat(document.getElementById('modal-multiplier').value) || item.multiplier;
        item.sortOrder = parseInt(document.getElementById('modal-sort').value) || item.sortOrder;
        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

// === 모달 공통 ===
function showModal(title, bodyHtml, onConfirm) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal-box" onclick="event.stopPropagation()">
            <h2 class="text-lg font-bold mb-4">${title}</h2>
            ${bodyHtml}
            <div class="flex justify-end gap-3 mt-6">
                <button onclick="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">취소</button>
                <button id="modal-confirm-btn" class="px-5 py-2 bg-brand-red text-white text-sm font-semibold rounded-lg hover:bg-red-700">확인</button>
            </div>
        </div>
    </div>`;

    // 확인 버튼 클릭 핸들러
    document.getElementById('modal-confirm-btn').onclick = () => {
        const result = onConfirm();
        if (result !== false) closeModal();
    };
}

function closeModal(event) {
    // 오버레이 클릭 시 닫기 (내부 박스 클릭은 stopPropagation으로 차단됨)
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-container').innerHTML = '';
}

// === 변경 추적 ===
function markChanged() {
    hasChanges = true;
    const btn = document.getElementById('btn-save');
    // 변경 사항이 있으면 저장 버튼 강조
    btn.classList.add('animate-pulse');
}

// === 저장 (PUT /api/admin/catalog) ===
async function saveCatalog() {
    if (!catalog) return;

    try {
        const res = await adminFetch('/api/admin/catalog', {
            method: 'PUT',
            body: JSON.stringify(catalog),
        });

        if (!res) return;
        const json = await res.json();

        if (json.success) {
            hasChanges = false;
            document.getElementById('btn-save').classList.remove('animate-pulse');
            // 수정 정보 갱신
            const updatedEl = document.getElementById('last-updated');
            updatedEl.textContent = `마지막 수정: ${formatDateTime(json.updatedAt)} (${json.updatedBy || '-'})`;
            showToast('카탈로그가 저장되었습니다.', 'success');
        } else {
            showToast(json.error || '저장 실패', 'error');
        }
    } catch (err) {
        console.error('카탈로그 저장 에러:', err);
        showToast('저장 중 오류가 발생했습니다.', 'error');
    }
}

// === 토스트 알림 ===
function showToast(message, type = 'success') {
    // 기존 토스트 제거
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // 3초 후 자동 제거
    setTimeout(() => toast.remove(), 3000);
}

// === 견적 시뮬레이션 ===
function initSimulation() {
    if (!catalog) return;

    // 각 셀렉트 박스에 옵션 채우기
    fillSelect('sim-category', catalog.categories?.filter(c => c.active) || [], 'label');
    fillSelect('sim-fabric', catalog.fabrics?.filter(f => f.active) || [], 'label');
    fillSelect('sim-parts', catalog.compositions?.parts?.filter(p => p.active) || [], 'label');
    fillSelect('sim-type', catalog.compositions?.type?.filter(t => t.active) || [], 'label');
    fillSelect('sim-homeaway', catalog.compositions?.homeAway?.filter(h => h.active) || [], 'label');

    updateSimulation();
}

function fillSelect(selectId, items, labelKey) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = items.map(i => `<option value="${i.id}">${escapeHtml(i[labelKey] || i.id)}</option>`).join('');
}

function updateSimulation() {
    if (!catalog) return;

    const categoryId = document.getElementById('sim-category')?.value;
    const fabricId = document.getElementById('sim-fabric')?.value;
    const partsId = document.getElementById('sim-parts')?.value;
    const typeId = document.getElementById('sim-type')?.value;
    const homeAwayId = document.getElementById('sim-homeaway')?.value;
    const qty = parseInt(document.getElementById('sim-qty')?.value) || 1;

    // 각 배수 찾기
    const basePrice = catalog.basePrices?.[categoryId] || 0;
    const fabricMul = catalog.fabrics?.find(f => f.id === fabricId)?.priceMultiplier || 1;
    const partsMul = catalog.compositions?.parts?.find(p => p.id === partsId)?.multiplier || 1;
    const typeMul = catalog.compositions?.type?.find(t => t.id === typeId)?.multiplier || 1;
    const homeAwayMul = catalog.compositions?.homeAway?.find(h => h.id === homeAwayId)?.multiplier || 1;

    // 견적 = 기본단가 x 원단배수 x 구성배수 x 유형배수 x 홈어웨이배수 x 수량
    const total = basePrice * fabricMul * partsMul * typeMul * homeAwayMul * qty;

    const resultEl = document.getElementById('sim-result');
    if (basePrice === 0) {
        resultEl.textContent = '별도 상담';
    } else {
        resultEl.textContent = formatCurrency(Math.round(total));
    }
}
