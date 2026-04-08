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

// ============================================================
// === CSV 가져오기 기능 (A-8) ===
// 비유: 다른 가게 메뉴판(CSV)을 가져와서 우리 양식에 맞게 옮겨 적는 3단계 과정
// Step 1: 파일 업로드 → Step 2: 미리보기+매핑 확인 → Step 3: 카탈로그에 반영
// ============================================================

// CSV 가져오기 상태 저장용
let csvImportState = {
    step: 1,
    serverData: null,   // 서버에서 받은 파싱 결과 (products, columns, newValues)
    selectedRows: [],   // 체크된 행 인덱스 (boolean 배열)
    sportMappings: {},  // { 원본값: 선택된_STIZ_ID }
    categoryMappings: {},
    priceMappings: {},  // { 품목ID: 가격 }
};

// --- Step 1: CSV 가져오기 모달 열기 ---
function openCsvImportModal() {
    // 상태 초기화
    csvImportState = { step: 1, serverData: null, selectedRows: [], sportMappings: {}, categoryMappings: {}, priceMappings: {} };
    renderCsvStep1();
}

// Step 1 렌더: 파일 업로드 화면
function renderCsvStep1() {
    csvImportState.step = 1;
    const container = document.getElementById('modal-container');
    container.innerHTML = `
    <div class="modal-overlay" onclick="closeCsvModal(event)">
        <div class="modal-box wide" onclick="event.stopPropagation()">
            ${renderStepIndicator(1)}
            <h2 class="text-lg font-bold mb-2">CSV에서 상품 가져오기</h2>
            <p class="text-sm text-gray-500 mb-6">카페24 관리자에서 다운로드한 상품 엑셀 파일을 업로드해주세요.</p>

            <!-- 드래그 앤 드롭 영역 -->
            <div id="csv-drop-zone" class="drop-zone"
                 ondragover="event.preventDefault(); this.classList.add('dragover')"
                 ondragleave="this.classList.remove('dragover')"
                 ondrop="handleCsvDrop(event)"
                 onclick="document.getElementById('csv-file-input').click()">
                <span class="material-symbols-outlined text-4xl text-gray-300 mb-3 block">upload_file</span>
                <p class="text-sm font-semibold text-gray-600">파일을 드래그하거나 클릭하여 업로드</p>
                <p class="text-xs text-gray-400 mt-1">.csv, .xlsx, .xls 지원</p>
            </div>
            <input id="csv-file-input" type="file" accept=".csv,.xlsx,.xls" class="hidden" onchange="handleCsvFileSelect(event)">

            <!-- 업로드 진행 상태 (숨김) -->
            <div id="csv-upload-status" class="hidden mt-4 text-center">
                <span class="material-symbols-outlined text-2xl text-brand-red animate-spin">progress_activity</span>
                <p class="text-sm text-gray-500 mt-2">파일을 분석하고 있습니다...</p>
            </div>

            <div class="text-xs text-gray-400 mt-4 p-3 bg-gray-50 rounded-lg">
                <p class="font-semibold mb-1">다운로드 방법:</p>
                <p>카페24 관리자 > 상품 > 상품목록 > [엑셀 다운로드]</p>
            </div>

            <div class="flex justify-end gap-3 mt-6">
                <button onclick="closeCsvModal()" class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">취소</button>
            </div>
        </div>
    </div>`;
}

// 파일 드래그 앤 드롭 핸들러
function handleCsvDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadCsvFile(file);
}

// 파일 선택 핸들러
function handleCsvFileSelect(event) {
    const file = event.target.files?.[0];
    if (file) uploadCsvFile(file);
}

// 서버에 파일 업로드 + 파싱 요청
async function uploadCsvFile(file) {
    // 확장자 검증
    if (!/\.(csv|xlsx?|xls)$/i.test(file.name)) {
        showToast('CSV 또는 Excel 파일만 업로드 가능합니다.', 'error');
        return;
    }

    // 로딩 표시
    const dropZone = document.getElementById('csv-drop-zone');
    const statusEl = document.getElementById('csv-upload-status');
    if (dropZone) dropZone.classList.add('hidden');
    if (statusEl) statusEl.classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('file', file);

        // adminFetch는 JSON body 전용이므로 직접 fetch 사용
        const token = localStorage.getItem('adminToken');
        const res = await fetch('/api/admin/catalog/import', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        const json = await res.json();

        if (!json.success) {
            showToast(json.error || 'CSV 파싱 실패', 'error');
            renderCsvStep1(); // 다시 Step 1로
            return;
        }

        // 파싱 성공 → 상태 저장 후 Step 2로
        csvImportState.serverData = json;
        // 기본적으로 모든 행 선택
        csvImportState.selectedRows = new Array(json.products.length).fill(true);
        renderCsvStep2();
    } catch (err) {
        console.error('CSV 업로드 에러:', err);
        showToast('파일 업로드 중 오류가 발생했습니다.', 'error');
        renderCsvStep1();
    }
}

// --- Step 2: 미리보기 + 행 선택 ---
function renderCsvStep2() {
    csvImportState.step = 2;
    const { products, totalRows, columns } = csvImportState.serverData;
    const container = document.getElementById('modal-container');

    // 테이블에 표시할 주요 컬럼 결정 (최대 5개)
    const displayCols = pickDisplayColumns(columns);

    let tableHead = '<tr><th class="w-10"><input type="checkbox" checked onchange="csvToggleAll(this.checked)"></th>';
    displayCols.forEach(col => { tableHead += `<th>${escapeHtml(col)}</th>`; });
    tableHead += '<th>종목 제안</th><th>품목 제안</th></tr>';

    let tableBody = '';
    products.forEach((p, idx) => {
        const checked = csvImportState.selectedRows[idx] ? 'checked' : '';
        tableBody += `<tr><td><input type="checkbox" ${checked} onchange="csvToggleRow(${idx}, this.checked)"></td>`;
        displayCols.forEach(col => {
            const val = p.raw[col] ?? '';
            tableBody += `<td>${escapeHtml(String(val).substring(0, 50))}</td>`;
        });
        // 종목/품목 제안 표시
        const sportLabel = p.suggestion.sport.label || p.suggestion.sport.id || '-';
        const catLabel = p.suggestion.category.label || p.suggestion.category.id || '-';
        const sportBadge = p.suggestion.sport.confidence === 'high'
            ? `<span class="text-green-600 font-semibold text-xs">${escapeHtml(sportLabel)}</span>`
            : `<span class="text-gray-400 text-xs">${escapeHtml(sportLabel)}</span>`;
        const catBadge = p.suggestion.category.confidence === 'medium'
            ? `<span class="text-blue-600 font-semibold text-xs">${escapeHtml(catLabel)}</span>`
            : `<span class="text-gray-400 text-xs">${escapeHtml(catLabel)}</span>`;
        tableBody += `<td>${sportBadge}</td><td>${catBadge}</td></tr>`;
    });

    const selectedCount = csvImportState.selectedRows.filter(Boolean).length;

    container.innerHTML = `
    <div class="modal-overlay" onclick="closeCsvModal(event)">
        <div class="modal-box wide" onclick="event.stopPropagation()">
            ${renderStepIndicator(2)}
            <h2 class="text-lg font-bold mb-2">가져온 상품 미리보기</h2>
            <p class="text-sm text-gray-500 mb-4">총 ${totalRows}개 상품 중 카탈로그에 반영할 항목을 선택하세요.</p>

            <div style="max-height: 350px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px;">
                <table class="csv-table">
                    <thead>${tableHead}</thead>
                    <tbody>${tableBody}</tbody>
                </table>
            </div>

            <div class="flex items-center justify-between mt-4">
                <div class="flex gap-2">
                    <button onclick="csvSelectAll(true)" class="text-xs text-brand-red font-semibold hover:underline">전체 선택</button>
                    <button onclick="csvSelectAll(false)" class="text-xs text-gray-500 font-semibold hover:underline">전체 해제</button>
                </div>
                <span id="csv-selected-count" class="text-sm text-gray-500">선택된 상품: ${selectedCount}개</span>
            </div>

            <div class="flex justify-between mt-6">
                <button onclick="renderCsvStep1()" class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 flex items-center gap-1">
                    <span class="material-symbols-outlined text-base">arrow_back</span> 뒤로
                </button>
                <button onclick="prepareCsvStep3()" class="px-5 py-2 bg-brand-red text-white text-sm font-semibold rounded-lg hover:bg-red-700 flex items-center gap-1">
                    다음: 매핑 확인 <span class="material-symbols-outlined text-base">arrow_forward</span>
                </button>
            </div>
        </div>
    </div>`;
}

// 행 선택 토글
function csvToggleRow(idx, checked) {
    csvImportState.selectedRows[idx] = checked;
    updateCsvSelectedCount();
}

function csvToggleAll(checked) {
    csvImportState.selectedRows = csvImportState.selectedRows.map(() => checked);
    // 체크박스 UI도 갱신
    document.querySelectorAll('.csv-table tbody input[type="checkbox"]').forEach((cb, idx) => {
        cb.checked = checked;
    });
    updateCsvSelectedCount();
}

function csvSelectAll(selected) {
    csvToggleAll(selected);
    const headerCb = document.querySelector('.csv-table thead input[type="checkbox"]');
    if (headerCb) headerCb.checked = selected;
}

function updateCsvSelectedCount() {
    const count = csvImportState.selectedRows.filter(Boolean).length;
    const el = document.getElementById('csv-selected-count');
    if (el) el.textContent = `선택된 상품: ${count}개`;
}

// --- Step 3 준비: 선택된 행에서 매핑 데이터 추출 ---
function prepareCsvStep3() {
    const selectedCount = csvImportState.selectedRows.filter(Boolean).length;
    if (selectedCount === 0) {
        showToast('최소 1개 이상의 상품을 선택해주세요.', 'error');
        return;
    }

    const { products } = csvImportState.serverData;

    // 선택된 행에서 고유한 종목/품목 제안 수집
    const sportSuggestions = new Map(); // { 원본키워드: { id, label, confidence } }
    const categorySuggestions = new Map();
    const priceByCategory = {}; // { 품목ID: [가격들] } — 평균 계산용

    products.forEach((p, idx) => {
        if (!csvImportState.selectedRows[idx]) return;

        // 종목 수집
        if (p.suggestion.sport.id) {
            const key = p.suggestion.sport.id;
            if (!sportSuggestions.has(key)) {
                sportSuggestions.set(key, p.suggestion.sport);
            }
        }

        // 품목 수집
        if (p.suggestion.category.id) {
            const key = p.suggestion.category.id;
            if (!categorySuggestions.has(key)) {
                categorySuggestions.set(key, p.suggestion.category);
            }
            // 가격 수집
            if (p.suggestion.basePrice > 0) {
                if (!priceByCategory[key]) priceByCategory[key] = [];
                priceByCategory[key].push(p.suggestion.basePrice);
            }
        }
    });

    // 기본 매핑 값 설정 (서버 제안 기반)
    csvImportState.sportMappings = {};
    sportSuggestions.forEach((val, key) => {
        csvImportState.sportMappings[key] = val.id;
    });

    csvImportState.categoryMappings = {};
    categorySuggestions.forEach((val, key) => {
        csvImportState.categoryMappings[key] = val.id;
    });

    // 가격: 각 품목별 평균값
    csvImportState.priceMappings = {};
    Object.entries(priceByCategory).forEach(([catId, prices]) => {
        const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        csvImportState.priceMappings[catId] = avg;
    });

    renderCsvStep3(sportSuggestions, categorySuggestions, priceByCategory);
}

// --- Step 3: 매핑 확인 + 카탈로그 반영 ---
function renderCsvStep3(sportSuggestions, categorySuggestions, priceByCategory) {
    csvImportState.step = 3;
    const container = document.getElementById('modal-container');

    // 종목 드롭다운 옵션 생성 (기존 카탈로그 종목 + "새로 추가")
    const sportOptions = (catalog.sports || []).map(s =>
        `<option value="${s.id}">${escapeHtml(s.label)}</option>`
    ).join('') + '<option value="__new__">+ 새 종목 추가</option>';

    // 품목 드롭다운 옵션
    const categoryOptions = (catalog.categories || []).map(c =>
        `<option value="${c.id}">${escapeHtml(c.label)}</option>`
    ).join('') + '<option value="__new__">+ 새 품목 추가</option>';

    // 종목 매핑 행
    let sportRows = '';
    sportSuggestions.forEach((suggestion, key) => {
        const selected = csvImportState.sportMappings[key] || '';
        sportRows += `
        <div class="mapping-row">
            <span class="text-sm font-medium w-40 shrink-0">${escapeHtml(key)}</span>
            <span class="material-symbols-outlined mapping-arrow">arrow_forward</span>
            <select onchange="csvImportState.sportMappings['${escapeHtml(key)}'] = this.value"
                class="border rounded-lg px-3 py-2 text-sm flex-1">
                ${sportOptions.replace(`value="${selected}"`, `value="${selected}" selected`)}
            </select>
        </div>`;
    });

    // 품목 매핑 행
    let categoryRows = '';
    categorySuggestions.forEach((suggestion, key) => {
        const selected = csvImportState.categoryMappings[key] || '';
        categoryRows += `
        <div class="mapping-row">
            <span class="text-sm font-medium w-40 shrink-0">${escapeHtml(suggestion.label || key)}</span>
            <span class="material-symbols-outlined mapping-arrow">arrow_forward</span>
            <select onchange="csvImportState.categoryMappings['${escapeHtml(key)}'] = this.value"
                class="border rounded-lg px-3 py-2 text-sm flex-1">
                ${categoryOptions.replace(`value="${selected}"`, `value="${selected}" selected`)}
            </select>
        </div>`;
    });

    // 가격 행
    let priceRows = '';
    Object.entries(csvImportState.priceMappings).forEach(([catId, avgPrice]) => {
        const catLabel = findCatalogLabel(catalog.categories, catId) || catId;
        const refPrices = priceByCategory[catId] || [];
        const minP = refPrices.length ? Math.min(...refPrices) : 0;
        const maxP = refPrices.length ? Math.max(...refPrices) : 0;
        priceRows += `
        <div class="mapping-row">
            <span class="text-sm font-medium w-40 shrink-0">${escapeHtml(catLabel)}</span>
            <div class="flex items-center gap-2 flex-1">
                <input type="number" value="${avgPrice}" min="0" step="1000"
                    onchange="csvImportState.priceMappings['${catId}'] = parseInt(this.value) || 0"
                    class="border rounded-lg px-3 py-2 text-sm w-32 text-right font-mono">
                <span class="text-xs text-gray-400">원</span>
                ${refPrices.length ? `<span class="text-xs text-gray-400 ml-2">(참고: ${formatCurrency(minP)}~${formatCurrency(maxP)})</span>` : ''}
            </div>
        </div>`;
    });

    const selectedCount = csvImportState.selectedRows.filter(Boolean).length;

    container.innerHTML = `
    <div class="modal-overlay" onclick="closeCsvModal(event)">
        <div class="modal-box wide" onclick="event.stopPropagation()">
            ${renderStepIndicator(3)}
            <h2 class="text-lg font-bold mb-2">카탈로그 매핑 확인</h2>
            <p class="text-sm text-gray-500 mb-4">자동 추출된 매핑을 확인하고 수정해주세요. (${selectedCount}개 상품 선택됨)</p>

            ${sportRows ? `
            <div class="mb-6">
                <h3 class="font-bold text-sm mb-2 flex items-center gap-1">
                    <span class="material-symbols-outlined text-base">sports_basketball</span>
                    종목 매핑
                </h3>
                ${sportRows}
            </div>` : ''}

            ${categoryRows ? `
            <div class="mb-6">
                <h3 class="font-bold text-sm mb-2 flex items-center gap-1">
                    <span class="material-symbols-outlined text-base">checkroom</span>
                    품목 매핑
                </h3>
                ${categoryRows}
            </div>` : ''}

            ${priceRows ? `
            <div class="mb-6">
                <h3 class="font-bold text-sm mb-2 flex items-center gap-1">
                    <span class="material-symbols-outlined text-base">payments</span>
                    기본단가 (카페24 판매가 참고)
                </h3>
                ${priceRows}
            </div>` : ''}

            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
                <span class="material-symbols-outlined text-base align-middle mr-1">info</span>
                원단/구성옵션은 카페24에 없는 정보이므로 기존 카탈로그 설정을 유지합니다.
            </div>

            <div class="flex justify-between mt-6">
                <button onclick="renderCsvStep2()" class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 flex items-center gap-1">
                    <span class="material-symbols-outlined text-base">arrow_back</span> 뒤로
                </button>
                <button onclick="applyCsvImport()" class="px-5 py-2 bg-brand-red text-white text-sm font-semibold rounded-lg hover:bg-red-700 flex items-center gap-1">
                    <span class="material-symbols-outlined text-base">check</span>
                    카탈로그에 반영
                </button>
            </div>
        </div>
    </div>`;
}

// --- 카탈로그에 반영 (병합) ---
// 비유: 통역이 끝난 메뉴를 우리 가게 메뉴판에 추가하는 마지막 단계
function applyCsvImport() {
    if (!catalog) {
        showToast('카탈로그 데이터가 없습니다. 페이지를 새로고침해주세요.', 'error');
        return;
    }

    let addedSports = 0;
    let addedCategories = 0;
    let updatedPrices = 0;

    // 1. 종목 병합 — 새 종목이 있으면 추가
    Object.entries(csvImportState.sportMappings).forEach(([key, targetId]) => {
        if (targetId === '__new__') {
            // 새 종목 추가: key를 ID로 사용
            const newId = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            if (!catalog.sports.some(s => s.id === newId)) {
                const maxSort = Math.max(0, ...catalog.sports.map(s => s.sortOrder || 0));
                catalog.sports.push({
                    id: newId,
                    label: key, // 원본 이름 그대로
                    icon: 'sports',
                    sortOrder: maxSort + 1,
                    active: true,
                });
                addedSports++;
            }
        }
        // 기존 종목 선택된 경우: 이미 카탈로그에 있으므로 추가 작업 불필요
    });

    // 2. 품목 병합 — 새 품목이 있으면 추가
    Object.entries(csvImportState.categoryMappings).forEach(([key, targetId]) => {
        if (targetId === '__new__') {
            const newId = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            if (!catalog.categories.some(c => c.id === newId)) {
                const maxSort = Math.max(0, ...catalog.categories.map(c => c.sortOrder || 0));
                catalog.categories.push({
                    id: newId,
                    label: key,
                    description: 'CSV에서 가져옴',
                    sortOrder: maxSort + 1,
                    active: true,
                });
                // 기본 단가도 초기화
                if (!catalog.basePrices) catalog.basePrices = {};
                catalog.basePrices[newId] = 0;
                addedCategories++;
            }
        }
    });

    // 3. 가격 업데이트 — 사용자가 입력한 가격으로 덮어쓰기
    Object.entries(csvImportState.priceMappings).forEach(([catId, price]) => {
        if (price > 0) {
            if (!catalog.basePrices) catalog.basePrices = {};
            // 기존 가격과 다를 때만 업데이트
            if (catalog.basePrices[catId] !== price) {
                catalog.basePrices[catId] = price;
                updatedPrices++;
            }
        }
    });

    // 변경 표시 + UI 갱신
    markChanged();
    renderTab();
    initSimulation();

    // 모달 닫기
    closeCsvModal();

    // 결과 알림
    const parts = [];
    if (addedSports > 0) parts.push(`종목 ${addedSports}개 추가`);
    if (addedCategories > 0) parts.push(`품목 ${addedCategories}개 추가`);
    if (updatedPrices > 0) parts.push(`가격 ${updatedPrices}개 업데이트`);

    if (parts.length > 0) {
        showToast(`CSV 반영 완료: ${parts.join(', ')}. 저장 버튼을 눌러 확정하세요.`, 'success');
    } else {
        showToast('CSV 반영 완료. 변경 사항이 없습니다. (이미 동일한 데이터)', 'success');
    }
}

// --- 스텝 인디케이터 렌더 ---
function renderStepIndicator(currentStep) {
    const steps = [
        { num: 1, label: '업로드' },
        { num: 2, label: '미리보기' },
        { num: 3, label: '매핑 확인' },
    ];

    let html = '<div class="step-indicator">';
    steps.forEach((s, idx) => {
        const cls = s.num < currentStep ? 'done' : (s.num === currentStep ? 'active' : '');
        const icon = s.num < currentStep ? 'check' : s.num;
        html += `<div class="step-dot ${cls}">${s.num < currentStep ? '<span class="material-symbols-outlined text-sm">check</span>' : s.num}</div>`;
        if (idx < steps.length - 1) {
            html += `<div class="step-line ${s.num < currentStep ? 'active' : ''}"></div>`;
        }
    });
    html += '</div>';
    return html;
}

// --- CSV 모달 닫기 ---
function closeCsvModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-container').innerHTML = '';
}

// --- 표시용 컬럼 선택 헬퍼 ---
// CSV 컬럼이 많을 때 주요 컬럼만 골라서 표시 (최대 5개)
function pickDisplayColumns(columns) {
    // 우선순위 키워드 (한글/영문 혼용 대응)
    const priority = ['상품명', 'product_name', 'name', 'Name', '판매가', 'price', 'Price', '카테고리', 'category', 'Category', '분류', '상품번호'];
    const picked = [];
    priority.forEach(p => {
        if (columns.includes(p) && picked.length < 5) picked.push(p);
    });
    // 부족하면 나머지 컬럼에서 채움
    columns.forEach(c => {
        if (!picked.includes(c) && picked.length < 5) picked.push(c);
    });
    return picked;
}

// --- 카탈로그에서 label 찾기 헬퍼 ---
function findCatalogLabel(items, id) {
    if (!items) return null;
    const item = items.find(i => i.id === id);
    return item ? item.label : null;
}
