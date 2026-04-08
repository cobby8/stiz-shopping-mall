/**
 * 관리자 상품 카탈로그 편집 로직 (Part 7 가격/구성 고도화)
 *
 * 비유: 가격표 사전 편집기 — 종목+등급+패키지 조합별 고정가를 관리
 * 기존 "기본가 x 배수" 방식에서 "가격표 참조" 방식으로 변경됨
 *
 * 7탭 구조: 종목 / 품목 / 등급 / 패키지 / 가격표 / 마감+할인 / 사이즈
 *
 * 의존: admin-common.js (checkAdminAuth, adminFetch, escapeHtml, formatCurrency 등)
 */

// --- 전역 상태 ---
let catalog = null;         // 서버에서 받아온 카탈로그 데이터
let hasChanges = false;     // 변경 여부 추적
let currentTab = 'sports';  // 현재 활성 탭
let priceTableFilter = 'all'; // 가격표 탭의 종목 필터

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

// === 탭 별 렌더링 분기 (7탭) ===
function renderTab() {
    if (!catalog) return;
    const container = document.getElementById('tab-content');

    switch (currentTab) {
        case 'sports':        container.innerHTML = renderListSection(catalog.sports, 'sports', '종목'); break;
        case 'categories':    container.innerHTML = renderCategoriesSection(); break;
        case 'grades':        container.innerHTML = renderGradesSection(); break;
        case 'packages':      container.innerHTML = renderPackagesSection(); break;
        case 'priceTable':    container.innerHTML = renderPriceTableSection(); break;
        case 'finishDiscount': container.innerHTML = renderFinishDiscountSection(); break;
        case 'sizes':         container.innerHTML = renderSizesSection(); break;
    }
}

// ============================================================
// === 공통 리스트 섹션 렌더링 (종목용) ===
// 비유: 메뉴 목록을 카드로 나열하고, 각 카드에 편집/토글/삭제 버튼 배치
// ============================================================
function renderListSection(items, sectionKey, label) {
    if (!items || items.length === 0) {
        return `<div class="text-center text-gray-400 py-12">${label} 항목이 없습니다.</div>`;
    }

    // sortOrder 기준 정렬
    const sorted = [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    let html = '<div class="space-y-3">';
    sorted.forEach((item) => {
        const inactiveClass = item.active ? '' : 'inactive';
        // 종목에는 아이콘 표시
        let extraInfo = '';
        if (sectionKey === 'sports' && item.icon) {
            extraInfo = `<span class="material-symbols-outlined text-gray-400 text-lg">${escapeHtml(item.icon)}</span>`;
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

// ============================================================
// === 품목 섹션 (그룹별 분류 표시) ===
// ============================================================
function renderCategoriesSection() {
    const categories = catalog.categories || [];
    if (categories.length === 0) {
        return '<div class="text-center text-gray-400 py-12">품목 항목이 없습니다.</div>';
    }

    // 그룹별 분류 (uniform / teamwear / casual)
    const groups = {
        uniform: { label: '유니폼', items: [] },
        teamwear: { label: '팀웨어', items: [] },
        casual: { label: '캐주얼', items: [] },
    };

    categories.forEach(cat => {
        const g = cat.group || 'uniform';
        if (!groups[g]) groups[g] = { label: g, items: [] };
        groups[g].items.push(cat);
    });

    let html = '';
    Object.entries(groups).forEach(([groupKey, group]) => {
        if (group.items.length === 0) return;
        const sorted = group.items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        html += `<div class="mb-6">
            <h3 class="font-bold text-sm mb-3 text-gray-700 flex items-center gap-2">
                ${group.label}
                <span class="text-xs text-gray-400 font-normal">(${sorted.length}개)</span>
            </h3>
            <div class="space-y-2">`;

        sorted.forEach(item => {
            const inactiveClass = item.active ? '' : 'inactive';
            html += `
            <div class="item-card ${inactiveClass}">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <span class="text-xs text-gray-300 w-6 text-center">${item.sortOrder || '-'}</span>
                    <span class="font-semibold text-sm truncate">${escapeHtml(item.label)}</span>
                    <span class="text-xs text-gray-400">${escapeHtml(item.group || '')}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <div class="toggle-switch ${item.active ? 'on' : ''}"
                         onclick="toggleActive('categories', '${item.id}')"></div>
                    <button onclick="openCategoryEditModal('${item.id}')"
                        class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                        <span class="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button onclick="deleteItem('categories', '${item.id}')"
                        class="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                </div>
            </div>`;
        });

        html += '</div></div>';
    });

    // 추가 버튼
    html += `
    <button onclick="openCategoryAddModal()"
        class="mt-4 flex items-center gap-2 text-sm font-semibold text-brand-red hover:text-red-700 transition-colors">
        <span class="material-symbols-outlined text-lg">add_circle</span>
        품목 추가
    </button>`;

    return html;
}

// ============================================================
// === 등급 섹션 (원단 정보 함께 표시) ===
// ============================================================
function renderGradesSection() {
    const grades = catalog.grades || [];
    if (grades.length === 0) {
        return '<div class="text-center text-gray-400 py-12">등급 항목이 없습니다.</div>';
    }

    const sorted = [...grades].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    let html = '<div class="space-y-3">';
    sorted.forEach(item => {
        const inactiveClass = item.active ? '' : 'inactive';
        // 등급에는 원단명 표시
        const fabricBadge = item.fabric
            ? `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">${escapeHtml(item.fabric)}</span>`
            : '';

        html += `
        <div class="item-card ${inactiveClass}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <span class="text-xs text-gray-300 w-6 text-center">${item.sortOrder || '-'}</span>
                <span class="font-semibold text-sm">${escapeHtml(item.label)}</span>
                ${fabricBadge}
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <div class="toggle-switch ${item.active ? 'on' : ''}"
                     onclick="toggleActive('grades', '${item.id}')"></div>
                <button onclick="openGradeEditModal('${item.id}')"
                    class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                    <span class="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onclick="deleteItem('grades', '${item.id}')"
                    class="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <span class="material-symbols-outlined text-lg">delete</span>
                </button>
            </div>
        </div>`;
    });
    html += '</div>';

    // 종목-등급 허용 조합 표시
    if (catalog.sportGradeMap) {
        html += `<div class="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 class="font-bold text-sm mb-3 text-gray-700">종목별 허용 등급</h4>
            <div class="space-y-2">`;

        Object.entries(catalog.sportGradeMap).forEach(([sportId, gradeIds]) => {
            const sportLabel = findLabel(catalog.sports, sportId);
            const gradeBadges = gradeIds.map(gId => {
                const gl = findLabel(catalog.grades, gId);
                return `<span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">${escapeHtml(gl)}</span>`;
            }).join(' ');
            html += `<div class="flex items-center gap-3">
                <span class="text-sm font-medium w-20">${escapeHtml(sportLabel)}</span>
                <div class="flex gap-1 flex-wrap">${gradeBadges}</div>
            </div>`;
        });

        html += '</div></div>';
    }

    html += `
    <button onclick="openGradeAddModal()"
        class="mt-4 flex items-center gap-2 text-sm font-semibold text-brand-red hover:text-red-700 transition-colors">
        <span class="material-symbols-outlined text-lg">add_circle</span>
        등급 추가
    </button>`;

    return html;
}

// ============================================================
// === 패키지 섹션 (상의/하의 벌수 표시) ===
// ============================================================
function renderPackagesSection() {
    const packages = catalog.packages || [];
    if (packages.length === 0) {
        return '<div class="text-center text-gray-400 py-12">패키지 항목이 없습니다.</div>';
    }

    const sorted = [...packages].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    let html = '<div class="space-y-3">';
    sorted.forEach(item => {
        const inactiveClass = item.active ? '' : 'inactive';
        // 상의/하의 벌수 뱃지
        const countBadge = `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            상의 ${item.topCount || 0}벌 + 하의 ${item.bottomCount || 0}벌
        </span>`;
        // 혼합 등급 표시 (양면 전용)
        const mixedBadge = item.mixedGrade
            ? `<span class="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded">혼합: ${escapeHtml(item.mixedGrade)}</span>`
            : '';

        html += `
        <div class="item-card ${inactiveClass}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <span class="text-xs text-gray-300 w-6 text-center">${item.sortOrder || '-'}</span>
                <span class="font-semibold text-sm">${escapeHtml(item.label)}</span>
                ${countBadge}
                ${mixedBadge}
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <div class="toggle-switch ${item.active ? 'on' : ''}"
                     onclick="toggleActive('packages', '${item.id}')"></div>
                <button onclick="openPackageEditModal('${item.id}')"
                    class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                    <span class="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onclick="deleteItem('packages', '${item.id}')"
                    class="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <span class="material-symbols-outlined text-lg">delete</span>
                </button>
            </div>
        </div>`;
    });
    html += '</div>';

    // 등급-패키지 허용 조합 표시
    if (catalog.gradePackageMap) {
        html += `<div class="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 class="font-bold text-sm mb-3 text-gray-700">등급별 허용 패키지</h4>
            <div class="space-y-2">`;

        Object.entries(catalog.gradePackageMap).forEach(([gradeId, pkgIds]) => {
            const gradeLabel = findLabel(catalog.grades, gradeId);
            const pkgBadges = pkgIds.map(pId => {
                const pl = findLabel(catalog.packages, pId);
                return `<span class="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">${escapeHtml(pl)}</span>`;
            }).join(' ');
            html += `<div class="flex items-center gap-3">
                <span class="text-sm font-medium w-20">${escapeHtml(gradeLabel)}</span>
                <div class="flex gap-1 flex-wrap">${pkgBadges}</div>
            </div>`;
        });

        html += '</div></div>';
    }

    html += `
    <button onclick="openPackageAddModal()"
        class="mt-4 flex items-center gap-2 text-sm font-semibold text-brand-red hover:text-red-700 transition-colors">
        <span class="material-symbols-outlined text-lg">add_circle</span>
        패키지 추가
    </button>`;

    return html;
}

// ============================================================
// === 가격표 섹션 (핵심! 매트릭스 테이블) ===
// 비유: 가격표 사전을 편집하는 곳. 종목별 필터로 원하는 가격표만 표시
// ============================================================
function renderPriceTableSection() {
    const priceTable = catalog.priceTable || {};
    const sports = (catalog.sports || []).filter(s => s.active);
    const grades = (catalog.grades || []).filter(g => g.active);
    const packages = (catalog.packages || []).filter(p => p.active);

    // --- 종목 필터 버튼 ---
    let html = '<div class="flex gap-2 mb-6 flex-wrap">';
    html += `<button class="filter-btn ${priceTableFilter === 'all' ? 'active' : ''}"
        onclick="setPriceTableFilter('all')">전체</button>`;
    sports.forEach(s => {
        html += `<button class="filter-btn ${priceTableFilter === s.id ? 'active' : ''}"
            onclick="setPriceTableFilter('${s.id}')">${escapeHtml(s.label)}</button>`;
    });
    html += '</div>';

    // --- 종목별 가격 매트릭스 ---
    sports.forEach(sport => {
        // 필터 적용
        if (priceTableFilter !== 'all' && priceTableFilter !== sport.id) return;

        if (sport.id === 'teamwear') {
            // 팀웨어: 품목별 단일 가격 테이블
            html += renderTeamwearPriceTable(priceTable);
        } else {
            // 유니폼: 등급 x 패키지 매트릭스
            html += renderUniformPriceMatrix(sport, grades, packages, priceTable);
        }
    });

    // 비어있을 때
    if (Object.keys(priceTable).length === 0) {
        html += '<div class="text-center text-gray-400 py-8">가격표가 비어있습니다. 종목/등급/패키지를 먼저 설정해주세요.</div>';
    }

    return html;
}

// 유니폼 가격 매트릭스 (종목 1개 기준)
function renderUniformPriceMatrix(sport, grades, packages, priceTable) {
    // 이 종목에서 허용되는 등급만 필터
    const allowedGrades = catalog.sportGradeMap?.[sport.id] || [];
    const filteredGrades = grades.filter(g => allowedGrades.includes(g.id));

    if (filteredGrades.length === 0) return '';

    let html = `<div class="mb-8">
        <h3 class="font-bold text-base mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg">${escapeHtml(sport.icon || 'sports')}</span>
            ${escapeHtml(sport.label)} 유니폼 가격표
        </h3>
        <div class="overflow-x-auto">
        <table class="price-matrix">
            <thead><tr>
                <th class="text-left">구성 \\ 등급</th>`;

    // 열 헤더: 등급
    filteredGrades.forEach(g => {
        html += `<th>${escapeHtml(g.label)}</th>`;
    });
    html += '</tr></thead><tbody>';

    // 각 패키지(행) x 등급(열)
    packages.forEach(pkg => {
        html += `<tr><td class="row-label">${escapeHtml(pkg.label)}</td>`;

        filteredGrades.forEach(grade => {
            // 이 등급에서 허용되는 패키지인지 확인
            const allowedPkgs = catalog.gradePackageMap?.[grade.id] || [];
            const key = `${sport.id}_${grade.id}_${pkg.id}`;
            const price = priceTable[key];

            if (!allowedPkgs.includes(pkg.id)) {
                // 허용되지 않는 조합 → 빈 셀
                html += '<td class="na">-</td>';
            } else if (price !== undefined && price !== null) {
                // 가격이 있는 셀 → 클릭하면 편집 가능
                html += `<td class="editable" onclick="editPriceCell(this, '${key}')">${formatCurrency(price)}</td>`;
            } else {
                // 허용은 되지만 가격 미설정 → 클릭하여 입력 가능
                html += `<td class="editable" onclick="editPriceCell(this, '${key}')" style="color:#f59e0b">미설정</td>`;
            }
        });

        html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
}

// 팀웨어 가격 테이블 (품목별 단일 가격)
function renderTeamwearPriceTable(priceTable) {
    const teamwearCats = (catalog.categories || []).filter(c =>
        (c.group === 'teamwear' || c.group === 'casual') && c.active
    ).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    if (teamwearCats.length === 0) return '';

    let html = `<div class="mb-8">
        <h3 class="font-bold text-base mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg">checkroom</span>
            팀웨어/캐주얼 가격표
        </h3>
        <div class="overflow-x-auto">
        <table class="price-matrix">
            <thead><tr>
                <th class="text-left">품목</th>
                <th>가격</th>
            </tr></thead><tbody>`;

    teamwearCats.forEach(cat => {
        // 팀웨어 키: "teamwear__{category}"
        const key = `teamwear__${cat.id}`;
        const price = priceTable[key];

        html += `<tr>
            <td class="row-label">${escapeHtml(cat.label)}</td>`;

        if (price !== undefined && price !== null) {
            html += `<td class="editable" onclick="editPriceCell(this, '${key}')">${formatCurrency(price)}</td>`;
        } else {
            html += `<td class="editable" onclick="editPriceCell(this, '${key}')" style="color:#f59e0b">미설정</td>`;
        }

        html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
}

// 가격 셀 인라인 편집 — 셀 클릭 시 input으로 교체
function editPriceCell(td, priceKey) {
    // 이미 편집 중이면 무시
    if (td.querySelector('input')) return;

    const currentPrice = catalog.priceTable?.[priceKey] || '';
    const originalHtml = td.innerHTML;

    td.innerHTML = `<input type="number" value="${currentPrice}" min="0" step="1000"
        onblur="savePriceCell(this, '${priceKey}')"
        onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.dataset.cancel='1';this.blur()}"
        autofocus>`;

    td.querySelector('input').focus();
    td.querySelector('input').select();
    // 원래 HTML 백업 (ESC로 취소 시 복원용)
    td.dataset.originalHtml = originalHtml;
}

// 가격 셀 저장
function savePriceCell(input, priceKey) {
    const td = input.parentElement;
    // ESC 취소 처리
    if (input.dataset.cancel === '1') {
        td.innerHTML = td.dataset.originalHtml || '-';
        return;
    }

    const newPrice = parseInt(input.value);
    if (!catalog.priceTable) catalog.priceTable = {};

    if (isNaN(newPrice) || newPrice <= 0) {
        // 가격 삭제 (빈 값 또는 0)
        delete catalog.priceTable[priceKey];
        td.innerHTML = '<span style="color:#f59e0b">미설정</span>';
    } else {
        catalog.priceTable[priceKey] = newPrice;
        td.innerHTML = formatCurrency(newPrice);
    }

    markChanged();
    updateSimulation();
}

// 가격표 종목 필터 변경
function setPriceTableFilter(filter) {
    priceTableFilter = filter;
    renderTab();
}

// ============================================================
// === 마감/할인 섹션 ===
// ============================================================
function renderFinishDiscountSection() {
    let html = '';

    // --- 마감 옵션 ---
    html += `<div class="mb-8">
        <h3 class="font-bold text-base mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg">content_cut</span>
            마감 옵션
            <span class="text-xs text-gray-400 font-normal">(가격 영향 없음, 제작 참고용)</span>
        </h3>`;

    const finishOptions = catalog.finishOptions || {};

    // 상의 마감
    html += '<div class="mb-4"><h4 class="text-sm font-semibold text-gray-600 mb-2">상의 마감</h4><div class="space-y-2">';
    (finishOptions.top || []).forEach(opt => {
        const inactiveClass = opt.active ? '' : 'inactive';
        html += `
        <div class="item-card ${inactiveClass}">
            <div class="flex items-center gap-3 flex-1">
                <span class="font-semibold text-sm">${escapeHtml(opt.label)}</span>
            </div>
            <div class="toggle-switch ${opt.active ? 'on' : ''}"
                 onclick="toggleFinishOption('top', '${opt.id}')"></div>
        </div>`;
    });
    html += '</div></div>';

    // 하의 마감
    html += '<div class="mb-4"><h4 class="text-sm font-semibold text-gray-600 mb-2">하의 마감</h4><div class="space-y-2">';
    (finishOptions.bottom || []).forEach(opt => {
        const inactiveClass = opt.active ? '' : 'inactive';
        html += `
        <div class="item-card ${inactiveClass}">
            <div class="flex items-center gap-3 flex-1">
                <span class="font-semibold text-sm">${escapeHtml(opt.label)}</span>
            </div>
            <div class="toggle-switch ${opt.active ? 'on' : ''}"
                 onclick="toggleFinishOption('bottom', '${opt.id}')"></div>
        </div>`;
    });
    html += '</div></div>';

    // --- 할인 정책 ---
    html += `<div class="mb-8">
        <h3 class="font-bold text-base mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg">discount</span>
            할인 정책
        </h3>
        <div class="space-y-3">`;

    (catalog.discounts || []).forEach(disc => {
        const inactiveClass = disc.active ? '' : 'inactive';
        // 할인 유형 뱃지
        const typeBadge = disc.type === 'percent'
            ? `<span class="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">${disc.value}% 할인</span>`
            : `<span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">별도 단가</span>`;

        html += `
        <div class="item-card ${inactiveClass}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <span class="font-semibold text-sm">${escapeHtml(disc.label)}</span>
                ${typeBadge}
                <span class="text-xs text-gray-400">${escapeHtml(disc.description || '')}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <div class="toggle-switch ${disc.active ? 'on' : ''}"
                     onclick="toggleDiscount('${disc.id}')"></div>
                <button onclick="openDiscountEditModal('${disc.id}')"
                    class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                    <span class="material-symbols-outlined text-lg">edit</span>
                </button>
            </div>
        </div>`;
    });

    html += '</div></div>';

    // 학교스포츠클럽 할인 가격표 미리보기
    if (catalog.discountPriceTable && Object.keys(catalog.discountPriceTable).length > 0) {
        html += `<div class="p-4 bg-blue-50 rounded-lg">
            <h4 class="font-bold text-sm mb-2 text-blue-700">학교스포츠클럽 할인 가격표</h4>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">`;

        Object.entries(catalog.discountPriceTable).forEach(([key, price]) => {
            // 키를 읽기 쉽게 변환 (basketball_basic_set → 농구 베이직 세트)
            const readable = makeReadableKey(key);
            html += `<div class="flex justify-between bg-white rounded px-3 py-1.5">
                <span class="text-gray-600">${escapeHtml(readable)}</span>
                <span class="font-mono font-semibold">${formatCurrency(price)}</span>
            </div>`;
        });

        html += '</div></div>';
    }

    return html;
}

// ============================================================
// === 사이즈 섹션 ===
// ============================================================
function renderSizesSection() {
    let html = '';

    // 기본 사이즈 목록
    html += `<div class="mb-6">
        <h3 class="font-bold text-base mb-3 text-gray-700">전체 사이즈 옵션</h3>
        <div class="flex flex-wrap gap-2">`;

    (catalog.sizes || []).forEach(size => {
        html += `<span class="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">${escapeHtml(size)}</span>`;
    });

    html += `</div>
        <div class="mt-3 flex items-center gap-2">
            <input id="new-size" type="text" placeholder="새 사이즈 (예: 6XL)" class="border rounded-lg px-3 py-1.5 text-sm w-40">
            <button onclick="addSize()" class="text-brand-red text-sm font-semibold hover:text-red-700 flex items-center gap-1">
                <span class="material-symbols-outlined text-base">add</span>추가
            </button>
        </div>
    </div>`;

    // 사이즈 프리셋
    if (catalog.sizePresets) {
        html += `<div class="mb-6">
            <h3 class="font-bold text-base mb-3 text-gray-700">사이즈 프리셋</h3>
            <div class="space-y-3">`;

        Object.entries(catalog.sizePresets).forEach(([presetId, sizes]) => {
            html += `<div class="item-card">
                <div class="flex-1">
                    <span class="font-semibold text-sm">${escapeHtml(presetId)}</span>
                    <div class="flex flex-wrap gap-1 mt-1">
                        ${sizes.map(s => `<span class="text-xs bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded">${escapeHtml(s)}</span>`).join('')}
                    </div>
                </div>
                <span class="text-xs text-gray-400">${sizes.length}개</span>
            </div>`;
        });

        html += '</div></div>';
    }

    // 품목별 사이즈 프리셋 매핑
    if (catalog.categorySizeMap) {
        html += `<div class="p-4 bg-gray-50 rounded-lg">
            <h4 class="font-bold text-sm mb-3 text-gray-700">품목별 사이즈 매핑</h4>
            <div class="space-y-2">`;

        Object.entries(catalog.categorySizeMap).forEach(([catId, presetId]) => {
            const catLabel = findLabel(catalog.categories, catId);
            html += `<div class="flex items-center gap-3">
                <span class="text-sm font-medium w-40">${escapeHtml(catLabel)}</span>
                <span class="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded">${escapeHtml(presetId)}</span>
            </div>`;
        });

        html += '</div><p class="text-xs text-gray-400 mt-2">* 매핑이 없는 품목은 "custom" 프리셋을 기본 사용합니다.</p></div>';
    }

    return html;
}

// ============================================================
// === 토글/삭제 함수들 ===
// ============================================================
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

function toggleFinishOption(part, optId) {
    const opts = catalog.finishOptions?.[part];
    if (!opts) return;
    const opt = opts.find(o => o.id === optId);
    if (opt) {
        opt.active = !opt.active;
        markChanged();
        renderTab();
    }
}

function toggleDiscount(discId) {
    const disc = (catalog.discounts || []).find(d => d.id === discId);
    if (disc) {
        disc.active = !disc.active;
        markChanged();
        renderTab();
    }
}

function deleteItem(sectionKey, itemId) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    catalog[sectionKey] = catalog[sectionKey].filter(i => i.id !== itemId);

    // 가격표에서도 관련 키 삭제
    if (sectionKey === 'sports' && catalog.priceTable) {
        Object.keys(catalog.priceTable).forEach(key => {
            if (key.startsWith(itemId + '_')) delete catalog.priceTable[key];
        });
    }

    markChanged();
    renderTab();
}

// ============================================================
// === 모달: 종목 추가/편집 ===
// ============================================================
function openAddModal(sectionKey) {
    // 종목 추가 전용
    const maxSort = Math.max(0, ...(catalog[sectionKey] || []).map(i => i.sortOrder || 0));

    showModal('종목 추가', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID (영문, 언더스코어)</span>
                <input id="modal-id" type="text" placeholder="예: futsal" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름 (한글)</span>
                <input id="modal-label" type="text" placeholder="예: 풋살" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">아이콘 (Material Symbols)</span>
                <input id="modal-icon" type="text" placeholder="예: sports_basketball" class="border rounded-lg px-3 py-2">
            </label>
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

        catalog[sectionKey].push({
            id, label, sortOrder, active: true,
            icon: document.getElementById('modal-icon')?.value.trim() || 'sports',
        });

        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

function openEditModal(sectionKey, itemId) {
    const item = catalog[sectionKey]?.find(i => i.id === itemId);
    if (!item) return;

    showModal('종목 편집', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID</span>
                <input id="modal-id" type="text" value="${escapeHtml(item.id)}" class="border rounded-lg px-3 py-2 bg-gray-50" readonly>
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" value="${escapeHtml(item.label || '')}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">아이콘</span>
                <input id="modal-icon" type="text" value="${escapeHtml(item.icon || '')}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">정렬 순서</span>
                <input id="modal-sort" type="number" value="${item.sortOrder || 1}" class="border rounded-lg px-3 py-2">
            </label>
        </div>
    `, () => {
        item.label = document.getElementById('modal-label').value.trim() || item.label;
        item.sortOrder = parseInt(document.getElementById('modal-sort').value) || item.sortOrder;
        item.icon = document.getElementById('modal-icon')?.value.trim() || item.icon;

        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

// ============================================================
// === 모달: 품목 추가/편집 ===
// ============================================================
function openCategoryAddModal() {
    const maxSort = Math.max(0, ...(catalog.categories || []).map(i => i.sortOrder || 0));

    showModal('품목 추가', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID (영문, 언더스코어)</span>
                <input id="modal-id" type="text" placeholder="예: shooting_vest" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름 (한글)</span>
                <input id="modal-label" type="text" placeholder="예: 슈팅 조끼" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">그룹</span>
                <select id="modal-group" class="border rounded-lg px-3 py-2">
                    <option value="uniform">유니폼</option>
                    <option value="teamwear">팀웨어</option>
                    <option value="casual">캐주얼</option>
                </select>
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
        if (catalog.categories.some(i => i.id === id)) { showToast('이미 존재하는 ID입니다.', 'error'); return false; }

        catalog.categories.push({
            id, label,
            group: document.getElementById('modal-group').value,
            sortOrder: parseInt(document.getElementById('modal-sort').value) || 1,
            active: true,
        });

        markChanged();
        renderTab();
        return true;
    });
}

function openCategoryEditModal(itemId) {
    const item = catalog.categories?.find(i => i.id === itemId);
    if (!item) return;

    showModal('품목 편집', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID</span>
                <input type="text" value="${escapeHtml(item.id)}" class="border rounded-lg px-3 py-2 bg-gray-50" readonly>
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" value="${escapeHtml(item.label)}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">그룹</span>
                <select id="modal-group" class="border rounded-lg px-3 py-2">
                    <option value="uniform" ${item.group === 'uniform' ? 'selected' : ''}>유니폼</option>
                    <option value="teamwear" ${item.group === 'teamwear' ? 'selected' : ''}>팀웨어</option>
                    <option value="casual" ${item.group === 'casual' ? 'selected' : ''}>캐주얼</option>
                </select>
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">정렬 순서</span>
                <input id="modal-sort" type="number" value="${item.sortOrder || 1}" class="border rounded-lg px-3 py-2">
            </label>
        </div>
    `, () => {
        item.label = document.getElementById('modal-label').value.trim() || item.label;
        item.group = document.getElementById('modal-group').value;
        item.sortOrder = parseInt(document.getElementById('modal-sort').value) || item.sortOrder;
        markChanged();
        renderTab();
        return true;
    });
}

// ============================================================
// === 모달: 등급 추가/편집 ===
// ============================================================
function openGradeAddModal() {
    const maxSort = Math.max(0, ...(catalog.grades || []).map(i => i.sortOrder || 0));

    showModal('등급 추가', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID (영문)</span>
                <input id="modal-id" type="text" placeholder="예: premium" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" placeholder="예: 프리미엄" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">원단명</span>
                <input id="modal-fabric" type="text" placeholder="예: 프리미엄메쉬" class="border rounded-lg px-3 py-2">
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
        if (catalog.grades.some(i => i.id === id)) { showToast('이미 존재하는 ID입니다.', 'error'); return false; }

        catalog.grades.push({
            id, label,
            fabric: document.getElementById('modal-fabric').value.trim() || '',
            sortOrder: parseInt(document.getElementById('modal-sort').value) || 1,
            active: true,
        });

        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

function openGradeEditModal(itemId) {
    const item = catalog.grades?.find(i => i.id === itemId);
    if (!item) return;

    showModal('등급 편집', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID</span>
                <input type="text" value="${escapeHtml(item.id)}" class="border rounded-lg px-3 py-2 bg-gray-50" readonly>
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" value="${escapeHtml(item.label)}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">원단명</span>
                <input id="modal-fabric" type="text" value="${escapeHtml(item.fabric || '')}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">정렬 순서</span>
                <input id="modal-sort" type="number" value="${item.sortOrder || 1}" class="border rounded-lg px-3 py-2">
            </label>
        </div>
    `, () => {
        item.label = document.getElementById('modal-label').value.trim() || item.label;
        item.fabric = document.getElementById('modal-fabric').value.trim();
        item.sortOrder = parseInt(document.getElementById('modal-sort').value) || item.sortOrder;
        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

// ============================================================
// === 모달: 패키지 추가/편집 ===
// ============================================================
function openPackageAddModal() {
    const maxSort = Math.max(0, ...(catalog.packages || []).map(i => i.sortOrder || 0));

    showModal('패키지 추가', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID (영문)</span>
                <input id="modal-id" type="text" placeholder="예: top3_bottom1" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" placeholder="예: 상의 3벌 + 하의 1벌" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">상의 벌수</span>
                <input id="modal-topcount" type="number" value="1" min="0" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">하의 벌수</span>
                <input id="modal-bottomcount" type="number" value="0" min="0" class="border rounded-lg px-3 py-2">
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
        if (catalog.packages.some(i => i.id === id)) { showToast('이미 존재하는 ID입니다.', 'error'); return false; }

        catalog.packages.push({
            id, label,
            topCount: parseInt(document.getElementById('modal-topcount').value) || 0,
            bottomCount: parseInt(document.getElementById('modal-bottomcount').value) || 0,
            sortOrder: parseInt(document.getElementById('modal-sort').value) || 1,
            active: true,
        });

        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

function openPackageEditModal(itemId) {
    const item = catalog.packages?.find(i => i.id === itemId);
    if (!item) return;

    showModal('패키지 편집', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">ID</span>
                <input type="text" value="${escapeHtml(item.id)}" class="border rounded-lg px-3 py-2 bg-gray-50" readonly>
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" value="${escapeHtml(item.label)}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">상의 벌수</span>
                <input id="modal-topcount" type="number" value="${item.topCount || 0}" min="0" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">하의 벌수</span>
                <input id="modal-bottomcount" type="number" value="${item.bottomCount || 0}" min="0" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">정렬 순서</span>
                <input id="modal-sort" type="number" value="${item.sortOrder || 1}" class="border rounded-lg px-3 py-2">
            </label>
        </div>
    `, () => {
        item.label = document.getElementById('modal-label').value.trim() || item.label;
        item.topCount = parseInt(document.getElementById('modal-topcount').value) || 0;
        item.bottomCount = parseInt(document.getElementById('modal-bottomcount').value) || 0;
        item.sortOrder = parseInt(document.getElementById('modal-sort').value) || item.sortOrder;
        markChanged();
        renderTab();
        initSimulation();
        return true;
    });
}

// ============================================================
// === 모달: 할인 편집 ===
// ============================================================
function openDiscountEditModal(discId) {
    const disc = (catalog.discounts || []).find(d => d.id === discId);
    if (!disc) return;

    showModal('할인 편집', `
        <div class="space-y-4">
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">이름</span>
                <input id="modal-label" type="text" value="${escapeHtml(disc.label)}" class="border rounded-lg px-3 py-2">
            </label>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">설명</span>
                <input id="modal-desc" type="text" value="${escapeHtml(disc.description || '')}" class="border rounded-lg px-3 py-2">
            </label>
            ${disc.type === 'percent' ? `
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-gray-600">할인율 (%)</span>
                <input id="modal-value" type="number" value="${disc.value || 0}" min="0" max="100" class="border rounded-lg px-3 py-2">
            </label>` : ''}
        </div>
    `, () => {
        disc.label = document.getElementById('modal-label').value.trim() || disc.label;
        disc.description = document.getElementById('modal-desc').value.trim();
        if (disc.type === 'percent') {
            disc.value = parseInt(document.getElementById('modal-value')?.value) || 0;
        }
        markChanged();
        renderTab();
        return true;
    });
}

// ============================================================
// === 사이즈 추가 ===
// ============================================================
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

// ============================================================
// === 모달 공통 ===
// ============================================================
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

    document.getElementById('modal-confirm-btn').onclick = () => {
        const result = onConfirm();
        if (result !== false) closeModal();
    };
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-container').innerHTML = '';
}

// ============================================================
// === 변경 추적 + 저장 ===
// ============================================================
function markChanged() {
    hasChanges = true;
    const btn = document.getElementById('btn-save');
    btn.classList.add('animate-pulse');
}

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

// ============================================================
// === 토스트 알림 ===
// ============================================================
function showToast(message, type = 'success') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============================================================
// === 견적 시뮬레이션 (새 가격표 참조 방식) ===
// 비유: 가격표 사전에서 키를 조립해서 가격을 찾는 것
// 키 형식: "{sport}_{grade}_{package}" (유니폼) 또는 "teamwear__{category}" (팀웨어)
// ============================================================
function initSimulation() {
    if (!catalog) return;

    // 종목 셀렉트
    const sports = (catalog.sports || []).filter(s => s.active);
    fillSelect('sim-sport', sports, 'label');

    // 홈/어웨이 셀렉트
    fillSelect('sim-homeaway', (catalog.homeAway || []).filter(h => h.active), 'label');

    // 종목 변경에 따라 등급/패키지 연쇄 갱신
    onSimSportChange();
}

// 종목 변경 시: 팀웨어면 등급/패키지 숨기고 품목 보이기, 아니면 등급 표시
function onSimSportChange() {
    if (!catalog) return;

    const sportId = document.getElementById('sim-sport')?.value;

    const gradeWrap = document.getElementById('sim-grade-wrap');
    const packageWrap = document.getElementById('sim-package-wrap');
    const teamwearWrap = document.getElementById('sim-teamwear-wrap');

    if (sportId === 'teamwear') {
        // 팀웨어: 등급/패키지 숨기고, 품목 보이기
        if (gradeWrap) gradeWrap.classList.add('hidden');
        if (packageWrap) packageWrap.classList.add('hidden');
        if (teamwearWrap) teamwearWrap.classList.remove('hidden');

        // 팀웨어 품목 채우기
        const teamwearCats = (catalog.categories || []).filter(c =>
            (c.group === 'teamwear' || c.group === 'casual') && c.active
        );
        fillSelect('sim-teamwear-cat', teamwearCats, 'label');
    } else {
        // 유니폼: 등급/패키지 보이기, 품목 숨기기
        if (gradeWrap) gradeWrap.classList.remove('hidden');
        if (packageWrap) packageWrap.classList.remove('hidden');
        if (teamwearWrap) teamwearWrap.classList.add('hidden');

        // 이 종목에서 허용되는 등급만 표시
        const allowedGrades = catalog.sportGradeMap?.[sportId] || [];
        const grades = (catalog.grades || []).filter(g => g.active && allowedGrades.includes(g.id));
        fillSelect('sim-grade', grades, 'label');

        onSimGradeChange();
    }

    updateSimulation();
}

// 등급 변경 시: 허용 패키지 갱신
function onSimGradeChange() {
    if (!catalog) return;

    const gradeId = document.getElementById('sim-grade')?.value;
    const allowedPkgs = catalog.gradePackageMap?.[gradeId] || [];
    const packages = (catalog.packages || []).filter(p => p.active && allowedPkgs.includes(p.id));
    fillSelect('sim-package', packages, 'label');

    updateSimulation();
}

// 견적 계산
function updateSimulation() {
    if (!catalog) return;

    const sportId = document.getElementById('sim-sport')?.value;
    const homeAwayId = document.getElementById('sim-homeaway')?.value;
    const qty = parseInt(document.getElementById('sim-qty')?.value) || 1;

    let priceKey = '';
    let detail = '';

    if (sportId === 'teamwear') {
        // 팀웨어: "teamwear__{category}"
        const catId = document.getElementById('sim-teamwear-cat')?.value;
        priceKey = `teamwear__${catId}`;
        const catLabel = findLabel(catalog.categories, catId);
        detail = `팀웨어 > ${catLabel}`;
    } else {
        // 유니폼: "{sport}_{grade}_{package}"
        const gradeId = document.getElementById('sim-grade')?.value;
        const packageId = document.getElementById('sim-package')?.value;
        priceKey = `${sportId}_${gradeId}_${packageId}`;
        const sportLabel = findLabel(catalog.sports, sportId);
        const gradeLabel = findLabel(catalog.grades, gradeId);
        const pkgLabel = findLabel(catalog.packages, packageId);
        detail = `${sportLabel} > ${gradeLabel} > ${pkgLabel}`;
    }

    // 가격표에서 단가 조회
    const unitPrice = catalog.priceTable?.[priceKey];
    // 홈/어웨이 배수
    const homeAwayMul = (catalog.homeAway || []).find(h => h.id === homeAwayId)?.multiplier || 1;
    const homeAwayLabel = findLabel(catalog.homeAway || catalog.compositions?.homeAway, homeAwayId);

    const resultEl = document.getElementById('sim-result');
    const detailEl = document.getElementById('sim-detail');

    if (unitPrice === undefined || unitPrice === null) {
        resultEl.textContent = '별도 상담';
        resultEl.className = 'text-xl font-bold text-amber-500';
        if (detailEl) detailEl.textContent = `${detail} (가격 미설정)`;
    } else {
        const total = unitPrice * homeAwayMul * qty;
        resultEl.textContent = formatCurrency(Math.round(total));
        resultEl.className = 'text-xl font-bold text-blue-600';
        if (detailEl) {
            detailEl.textContent = `${detail} | ${formatCurrency(unitPrice)} x ${homeAwayLabel} x ${qty}벌`;
        }
    }
}

function fillSelect(selectId, items, labelKey) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = items.map(i =>
        `<option value="${i.id}">${escapeHtml(i[labelKey] || i.id)}</option>`
    ).join('');
}

// ============================================================
// === 유틸리티 함수 ===
// ============================================================

// 배열에서 id로 label 찾기
function findLabel(items, id) {
    if (!items || !id) return id || '-';
    const item = items.find(i => i.id === id);
    return item ? item.label : id;
}

// 가격표 키를 읽기 쉬운 한글로 변환
// 예: "basketball_basic_set" → "농구 베이직 세트"
function makeReadableKey(key) {
    const parts = key.split('_');
    // 팀웨어 키: "teamwear__category_name"
    if (key.startsWith('teamwear__')) {
        const catId = key.replace('teamwear__', '');
        return '팀웨어 ' + findLabel(catalog.categories, catId);
    }
    // 유니폼 키: "{sport}_{grade}_{package}" — 3부분 이상
    if (parts.length >= 3) {
        const sportId = parts[0];
        const gradeId = parts[1];
        const pkgId = parts.slice(2).join('_'); // 패키지 id에 언더스코어 포함 가능
        return `${findLabel(catalog.sports, sportId)} ${findLabel(catalog.grades, gradeId)} ${findLabel(catalog.packages, pkgId)}`;
    }
    return key;
}

// ============================================================
// === CSV 가져오기 기능 (A-8) ===
// 비유: 다른 가게 메뉴판(CSV)을 가져와서 우리 양식에 맞게 옮겨 적는 3단계 과정
// Step 1: 파일 업로드 → Step 2: 미리보기+매핑 확인 → Step 3: 카탈로그에 반영
// ============================================================

// CSV 가져오기 상태 저장용
let csvImportState = {
    step: 1,
    serverData: null,
    selectedRows: [],
    sportMappings: {},
    categoryMappings: {},
    priceMappings: {},
};

// --- Step 1: CSV 가져오기 모달 열기 ---
function openCsvImportModal() {
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

function handleCsvDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadCsvFile(file);
}

function handleCsvFileSelect(event) {
    const file = event.target.files?.[0];
    if (file) uploadCsvFile(file);
}

async function uploadCsvFile(file) {
    if (!/\.(csv|xlsx?|xls)$/i.test(file.name)) {
        showToast('CSV 또는 Excel 파일만 업로드 가능합니다.', 'error');
        return;
    }

    const dropZone = document.getElementById('csv-drop-zone');
    const statusEl = document.getElementById('csv-upload-status');
    if (dropZone) dropZone.classList.add('hidden');
    if (statusEl) statusEl.classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const token = localStorage.getItem('adminToken');
        const res = await fetch('/api/admin/catalog/import', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        const json = await res.json();

        if (!json.success) {
            showToast(json.error || 'CSV 파싱 실패', 'error');
            renderCsvStep1();
            return;
        }

        csvImportState.serverData = json;
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

function csvToggleRow(idx, checked) {
    csvImportState.selectedRows[idx] = checked;
    updateCsvSelectedCount();
}

function csvToggleAll(checked) {
    csvImportState.selectedRows = csvImportState.selectedRows.map(() => checked);
    document.querySelectorAll('.csv-table tbody input[type="checkbox"]').forEach((cb) => {
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

// --- Step 3 준비 ---
function prepareCsvStep3() {
    const selectedCount = csvImportState.selectedRows.filter(Boolean).length;
    if (selectedCount === 0) {
        showToast('최소 1개 이상의 상품을 선택해주세요.', 'error');
        return;
    }

    const { products } = csvImportState.serverData;

    const sportSuggestions = new Map();
    const categorySuggestions = new Map();
    const priceByCategory = {};

    products.forEach((p, idx) => {
        if (!csvImportState.selectedRows[idx]) return;

        if (p.suggestion.sport.id) {
            const key = p.suggestion.sport.id;
            if (!sportSuggestions.has(key)) {
                sportSuggestions.set(key, p.suggestion.sport);
            }
        }

        if (p.suggestion.category.id) {
            const key = p.suggestion.category.id;
            if (!categorySuggestions.has(key)) {
                categorySuggestions.set(key, p.suggestion.category);
            }
            if (p.suggestion.basePrice > 0) {
                if (!priceByCategory[key]) priceByCategory[key] = [];
                priceByCategory[key].push(p.suggestion.basePrice);
            }
        }
    });

    csvImportState.sportMappings = {};
    sportSuggestions.forEach((val, key) => {
        csvImportState.sportMappings[key] = val.id;
    });

    csvImportState.categoryMappings = {};
    categorySuggestions.forEach((val, key) => {
        csvImportState.categoryMappings[key] = val.id;
    });

    csvImportState.priceMappings = {};
    Object.entries(priceByCategory).forEach(([catId, prices]) => {
        const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        csvImportState.priceMappings[catId] = avg;
    });

    renderCsvStep3(sportSuggestions, categorySuggestions, priceByCategory);
}

// --- Step 3: 매핑 확인 ---
function renderCsvStep3(sportSuggestions, categorySuggestions, priceByCategory) {
    csvImportState.step = 3;
    const container = document.getElementById('modal-container');

    const sportOptions = (catalog.sports || []).map(s =>
        `<option value="${s.id}">${escapeHtml(s.label)}</option>`
    ).join('') + '<option value="__new__">+ 새 종목 추가</option>';

    const categoryOptions = (catalog.categories || []).map(c =>
        `<option value="${c.id}">${escapeHtml(c.label)}</option>`
    ).join('') + '<option value="__new__">+ 새 품목 추가</option>';

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

    let priceRows = '';
    Object.entries(csvImportState.priceMappings).forEach(([catId, avgPrice]) => {
        const catLabel = findLabel(catalog.categories, catId);
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
                등급/패키지/가격표는 카페24에 없는 정보이므로 기존 카탈로그 설정을 유지합니다.
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
function applyCsvImport() {
    if (!catalog) {
        showToast('카탈로그 데이터가 없습니다. 페이지를 새로고침해주세요.', 'error');
        return;
    }

    let addedSports = 0;
    let addedCategories = 0;
    let updatedPrices = 0;

    // 1. 종목 병합
    Object.entries(csvImportState.sportMappings).forEach(([key, targetId]) => {
        if (targetId === '__new__') {
            const newId = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            if (!catalog.sports.some(s => s.id === newId)) {
                const maxSort = Math.max(0, ...catalog.sports.map(s => s.sortOrder || 0));
                catalog.sports.push({
                    id: newId, label: key, icon: 'sports',
                    sortOrder: maxSort + 1, active: true,
                });
                addedSports++;
            }
        }
    });

    // 2. 품목 병합
    Object.entries(csvImportState.categoryMappings).forEach(([key, targetId]) => {
        if (targetId === '__new__') {
            const newId = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            if (!catalog.categories.some(c => c.id === newId)) {
                const maxSort = Math.max(0, ...catalog.categories.map(c => c.sortOrder || 0));
                catalog.categories.push({
                    id: newId, label: key, group: 'teamwear',
                    description: 'CSV에서 가져옴',
                    sortOrder: maxSort + 1, active: true,
                });
                addedCategories++;
            }
        }
    });

    // 3. 가격은 priceTable에 직접 반영하지 않음 (CSV 가격은 카페24 판매가이므로 참고용)
    // 대신 사용자가 수동으로 가격표에 입력하도록 안내

    markChanged();
    renderTab();
    initSimulation();
    closeCsvModal();

    const parts = [];
    if (addedSports > 0) parts.push(`종목 ${addedSports}개 추가`);
    if (addedCategories > 0) parts.push(`품목 ${addedCategories}개 추가`);

    if (parts.length > 0) {
        showToast(`CSV 반영 완료: ${parts.join(', ')}. 저장 버튼을 눌러 확정하세요.`, 'success');
    } else {
        showToast('CSV 반영 완료. 변경 사항이 없습니다. (이미 동일한 데이터)', 'success');
    }
}

// --- 스텝 인디케이터 ---
function renderStepIndicator(currentStep) {
    const steps = [
        { num: 1, label: '업로드' },
        { num: 2, label: '미리보기' },
        { num: 3, label: '매핑 확인' },
    ];

    let html = '<div class="step-indicator">';
    steps.forEach((s, idx) => {
        const cls = s.num < currentStep ? 'done' : (s.num === currentStep ? 'active' : '');
        html += `<div class="step-dot ${cls}">${s.num < currentStep ? '<span class="material-symbols-outlined text-sm">check</span>' : s.num}</div>`;
        if (idx < steps.length - 1) {
            html += `<div class="step-line ${s.num < currentStep ? 'active' : ''}"></div>`;
        }
    });
    html += '</div>';
    return html;
}

function closeCsvModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-container').innerHTML = '';
}

function pickDisplayColumns(columns) {
    const priority = ['상품명', 'product_name', 'name', 'Name', '판매가', 'price', 'Price', '카테고리', 'category', 'Category', '분류', '상품번호'];
    const picked = [];
    priority.forEach(p => {
        if (columns.includes(p) && picked.length < 5) picked.push(p);
    });
    columns.forEach(c => {
        if (!picked.includes(c) && picked.length < 5) picked.push(c);
    });
    return picked;
}
