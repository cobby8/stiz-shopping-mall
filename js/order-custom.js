/**
 * STIZ 커스텀 주문 위자드 로직
 *
 * 비유: 피자 주문 앱처럼 단계별로 옵션을 선택하면
 * 최종 주문이 만들어지는 시스템.
 * Step 1~6을 거치면서 state 객체에 선택값이 쌓이고,
 * 마지막에 서버로 전송된다.
 */

// 서버 API 주소
const API_BASE = 'http://localhost:4000';

// 단계 정의 (진행 표시줄용)
const STEPS = [
    { step: 1, label: '종목', icon: 'sports_soccer' },
    { step: 2, label: '품목', icon: 'checkroom' },
    { step: 3, label: '원단', icon: 'texture' },
    { step: 4, label: '구성', icon: 'tune' },
    { step: 5, label: '정보', icon: 'person' },
    { step: 6, label: '확인', icon: 'fact_check' },
];

// ===== 전역 상태 객체 =====
// 위자드 전체에서 공유하는 "장바구니" 같은 역할
const state = {
    currentStep: 1,        // 현재 표시 중인 단계
    catalog: null,         // GET /api/catalog 응답 캐시
    selectedSport: null,   // 선택된 종목 ID
    selectedCategory: null,// 선택된 품목 ID
    selectedFabric: null,  // 선택된 원단 ID
    composition: {         // 구성 옵션 기본값
        homeAway: 'home',
        parts: 'set',
        type: 'single',
    },
    quantity: 1,           // 주문 수량
    estimate: 0,           // 모의 견적 금액
    customer: {            // 주문자 정보
        name: '',
        phone: '',
        teamName: '',
        email: '',
        address: '',
    },
    memo: '',              // 요청사항
    referenceFiles: [],    // 업로드된 참고 파일 URL 목록
    isSubmitting: false,   // 중복 제출 방지 플래그
};

// ===== 초기화 =====
// 페이지 로드 시 카탈로그 데이터를 서버에서 가져온다
async function init() {
    try {
        const res = await fetch(`${API_BASE}/api/catalog`);
        if (!res.ok) throw new Error('카탈로그 로드 실패');
        const json = await res.json();
        state.catalog = json.data;

        // 로딩 화면 숨기고 첫 단계 표시
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('error-screen').classList.add('hidden');

        // 구성 옵션 기본값을 카탈로그 첫 번째 항목으로 설정
        if (state.catalog.compositions) {
            const ha = state.catalog.compositions.homeAway;
            const pt = state.catalog.compositions.parts;
            const tp = state.catalog.compositions.type;
            if (ha && ha.length > 0) state.composition.homeAway = ha[0].id;
            if (pt && pt.length > 0) state.composition.parts = pt[0].id;
            if (tp && tp.length > 0) state.composition.type = tp[0].id;
        }

        renderProgressBar();
        goToStep(1);
    } catch (err) {
        console.error('카탈로그 초기화 실패:', err);
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('error-screen').classList.remove('hidden');
    }
}

// ===== 진행 표시줄 렌더링 =====
// 6개의 원형 + 연결선으로 현재 진행도를 보여준다
function renderProgressBar() {
    const bar = document.getElementById('progress-bar');
    bar.innerHTML = '';

    STEPS.forEach((s, i) => {
        // 단계 원형
        const circle = document.createElement('div');
        circle.className = 'step-circle flex-shrink-0';

        if (s.step < state.currentStep) {
            // 완료된 단계: 체크마크
            circle.classList.add('completed');
            circle.innerHTML = '<span class="material-symbols-outlined text-lg">check</span>';
        } else if (s.step === state.currentStep) {
            // 현재 단계: 숫자 + 강조
            circle.classList.add('active');
            circle.textContent = s.step;
        } else {
            // 미완료 단계: 회색 숫자
            circle.classList.add('inactive');
            circle.textContent = s.step;
        }
        bar.appendChild(circle);

        // 마지막 단계 뒤에는 연결선 불필요
        if (i < STEPS.length - 1) {
            const line = document.createElement('div');
            line.className = 'step-line';
            line.classList.add(s.step < state.currentStep ? 'completed' : 'inactive');
            bar.appendChild(line);
        }
    });

    // 현재 단계 라벨 표시
    const current = STEPS.find(s => s.step === state.currentStep);
    document.getElementById('step-label').textContent = current
        ? `${current.step}단계: ${current.label}`
        : '';
}

// ===== 단계 전환 =====
function goToStep(step) {
    state.currentStep = step;

    // 모든 step-content 숨기기
    document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));

    // 해당 단계 표시
    const target = document.getElementById(`step-${step}`);
    if (target) {
        target.classList.remove('hidden');
    }

    // 진행 표시줄 갱신
    renderProgressBar();

    // 각 단계별 렌더링 호출
    switch (step) {
        case 1: renderSportSelection(); break;
        case 2: renderCategorySelection(); break;
        case 3: renderFabricSelection(); break;
        case 4: renderComposition(); break;
        case 5: renderCustomerInfo(); break;
        case 6: renderConfirmation(); break;
    }

    // 이전/다음 버튼 상태 업데이트
    updateNavButtons();

    // 상단으로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 이전/다음 버튼 처리
function goToNext() {
    if (!validateCurrentStep()) return;

    if (state.currentStep === 6) {
        // 6단계에서 "다음" = 주문 제출
        submitOrder();
    } else {
        goToStep(state.currentStep + 1);
    }
}

function goToPrev() {
    if (state.currentStep > 1) {
        goToStep(state.currentStep - 1);
    }
}

// 네비 버튼 활성/비활성 + 텍스트 변경
function updateNavButtons() {
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const bottomNav = document.getElementById('bottom-nav');

    // 완료 화면에서는 네비 숨기기
    if (state.currentStep > 6) {
        bottomNav.classList.add('hidden');
        return;
    }
    bottomNav.classList.remove('hidden');

    // 1단계에서는 "이전" 비활성
    prevBtn.disabled = state.currentStep <= 1;

    // 6단계에서는 "다음"을 "주문하기"로 변경
    if (state.currentStep === 6) {
        nextBtn.innerHTML = `
            주문하기
            <span class="material-symbols-outlined text-lg">send</span>
        `;
    } else {
        nextBtn.innerHTML = `
            다음
            <span class="material-symbols-outlined text-lg">arrow_forward</span>
        `;
    }
}

// ===== Step 1: 종목 선택 =====
// 축구, 농구, 배구 등 카탈로그의 종목을 카드 그리드로 표시
function renderSportSelection() {
    const grid = document.getElementById('sport-grid');
    // 이미 렌더링된 경우 선택 상태만 갱신
    if (grid.children.length > 0) {
        updateCardSelection(grid, state.selectedSport);
        return;
    }

    const sports = (state.catalog.sports || []).filter(s => s.active);
    if (sports.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">등록된 종목이 없습니다.</p>';
        return;
    }

    sports.forEach(sport => {
        const card = createOptionCard({
            id: sport.id,
            label: sport.label,
            icon: sport.icon || 'sports',
            selected: state.selectedSport === sport.id,
            onClick: () => {
                state.selectedSport = sport.id;
                // 종목 변경 시 하위 선택 초기화
                state.selectedCategory = null;
                state.selectedFabric = null;
                updateCardSelection(grid, sport.id);
            }
        });
        grid.appendChild(card);
    });
}

// ===== Step 2: 품목 선택 =====
// 유니폼, 연습복, 패딩 등 카탈로그의 품목을 표시
function renderCategorySelection() {
    const grid = document.getElementById('category-grid');
    grid.innerHTML = ''; // 종목 변경 시 품목도 새로 그려야 하므로 항상 초기화

    const categories = (state.catalog.categories || []).filter(c => c.active);
    if (categories.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">등록된 품목이 없습니다.</p>';
        return;
    }

    categories.forEach(cat => {
        const card = createOptionCard({
            id: cat.id,
            label: cat.label,
            description: cat.description || '',
            icon: 'checkroom',
            selected: state.selectedCategory === cat.id,
            onClick: () => {
                state.selectedCategory = cat.id;
                updateCardSelection(grid, cat.id);
            }
        });
        grid.appendChild(card);
    });
}

// ===== Step 3: 원단 선택 =====
// 원단별 설명과 가격 배율 표시
function renderFabricSelection() {
    const grid = document.getElementById('fabric-grid');
    grid.innerHTML = '';

    const fabrics = (state.catalog.fabrics || []).filter(f => f.active);
    if (fabrics.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">등록된 원단이 없습니다.</p>';
        return;
    }

    fabrics.forEach(fabric => {
        // 가격 배율 표시 (1.0이면 "기본", 그 외는 +XX%)
        const priceTag = fabric.priceMultiplier === 1
            ? '기본가'
            : `+${Math.round((fabric.priceMultiplier - 1) * 100)}%`;

        const card = createOptionCard({
            id: fabric.id,
            label: fabric.label,
            description: fabric.description || '',
            badge: priceTag,
            icon: 'texture',
            selected: state.selectedFabric === fabric.id,
            onClick: () => {
                state.selectedFabric = fabric.id;
                updateCardSelection(grid, fabric.id);
            }
        });
        grid.appendChild(card);
    });
}

// ===== Step 4: 구성 선택 + 견적 =====
function renderComposition() {
    // 홈/어웨이 옵션
    renderToggleOptions(
        'homeaway-options',
        state.catalog.compositions?.homeAway || [],
        state.composition.homeAway,
        (id) => { state.composition.homeAway = id; updateEstimateDisplay(); }
    );

    // 세트 구성 옵션
    renderToggleOptions(
        'parts-options',
        state.catalog.compositions?.parts || [],
        state.composition.parts,
        (id) => { state.composition.parts = id; updateEstimateDisplay(); }
    );

    // 주문 유형 옵션
    renderToggleOptions(
        'type-options',
        state.catalog.compositions?.type || [],
        state.composition.type,
        (id) => { state.composition.type = id; updateEstimateDisplay(); }
    );

    // 수량 입력 동기화
    document.getElementById('quantity-input').value = state.quantity;

    // 견적 계산 및 표시
    updateEstimateDisplay();
}

// 토글 버튼 그룹 렌더링 (홈/어웨이, 세트, 유형 공통)
function renderToggleOptions(containerId, options, selectedId, onSelect) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = opt.id === selectedId;
        btn.className = `px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
            isActive
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
        }`;
        btn.textContent = opt.label;
        btn.onclick = () => {
            onSelect(opt.id);
            // 버튼 그룹 갱신
            renderToggleOptions(containerId, options, opt.id, onSelect);
        };
        container.appendChild(btn);
    });
}

// 수량 변경 핸들러
function changeQuantity(delta) {
    const newVal = Math.max(1, state.quantity + delta);
    state.quantity = newVal;
    document.getElementById('quantity-input').value = newVal;
    updateEstimateDisplay();
}

function onQuantityChange(val) {
    const num = parseInt(val, 10);
    state.quantity = isNaN(num) || num < 1 ? 1 : num;
    document.getElementById('quantity-input').value = state.quantity;
    updateEstimateDisplay();
}

// ===== 견적 계산 =====
// 기본가 x 원단배율 x 구성배율들 x 수량 = 모의 견적
function calculateEstimate() {
    if (!state.catalog || !state.selectedCategory) return 0;

    // 기본가: 품목별 기본 가격
    const base = state.catalog.basePrices?.[state.selectedCategory] || 0;

    // 원단 가격 배율 (기본 1.0)
    const fabricMul = state.catalog.fabrics?.find(f => f.id === state.selectedFabric)?.priceMultiplier || 1;

    // 구성 배율들
    const homeAwayMul = state.catalog.compositions?.homeAway?.find(h => h.id === state.composition.homeAway)?.multiplier || 1;
    const partsMul = state.catalog.compositions?.parts?.find(p => p.id === state.composition.parts)?.multiplier || 1;
    const typeMul = state.catalog.compositions?.type?.find(t => t.id === state.composition.type)?.multiplier || 1;

    // 최종 계산: 모든 배율을 곱한 뒤 수량 곱하기
    state.estimate = Math.round(base * fabricMul * homeAwayMul * partsMul * typeMul * state.quantity);
    return state.estimate;
}

function updateEstimateDisplay() {
    const amount = calculateEstimate();
    const display = document.getElementById('estimate-display');
    if (display) {
        display.textContent = amount.toLocaleString('ko-KR') + '원';
    }
}

// ===== Step 5: 주문자 정보 =====
// 기존 입력값이 있으면 복원 (뒤로갔다 올 때)
function renderCustomerInfo() {
    document.getElementById('input-name').value = state.customer.name;
    document.getElementById('input-phone').value = state.customer.phone;
    document.getElementById('input-team').value = state.customer.teamName;
    document.getElementById('input-email').value = state.customer.email;
    document.getElementById('input-address').value = state.customer.address;
    document.getElementById('input-memo').value = state.memo;
}

// Step 5를 떠날 때 입력값을 state에 저장
function collectCustomerInfo() {
    state.customer.name = document.getElementById('input-name').value.trim();
    state.customer.phone = document.getElementById('input-phone').value.trim();
    state.customer.teamName = document.getElementById('input-team').value.trim();
    state.customer.email = document.getElementById('input-email').value.trim();
    state.customer.address = document.getElementById('input-address').value.trim();
    state.memo = document.getElementById('input-memo').value.trim();
}

// ===== Step 6: 주문 확인 =====
// 지금까지 선택한 모든 내용을 요약하여 보여준다
function renderConfirmation() {
    // Step 5 입력값 수집
    collectCustomerInfo();

    const container = document.getElementById('confirmation-summary');
    const sportLabel = state.catalog.sports?.find(s => s.id === state.selectedSport)?.label || state.selectedSport;
    const categoryLabel = state.catalog.categories?.find(c => c.id === state.selectedCategory)?.label || state.selectedCategory;
    const fabricLabel = state.catalog.fabrics?.find(f => f.id === state.selectedFabric)?.label || state.selectedFabric;
    const homeAwayLabel = state.catalog.compositions?.homeAway?.find(h => h.id === state.composition.homeAway)?.label || state.composition.homeAway;
    const partsLabel = state.catalog.compositions?.parts?.find(p => p.id === state.composition.parts)?.label || state.composition.parts;
    const typeLabel = state.catalog.compositions?.type?.find(t => t.id === state.composition.type)?.label || state.composition.type;

    // 견적 계산 (최신값)
    calculateEstimate();

    container.innerHTML = `
        <!-- 상품 정보 -->
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <h3 class="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-1">
                <span class="material-symbols-outlined text-lg">shopping_bag</span>
                상품 정보
            </h3>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-gray-500">종목</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(sportLabel)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">품목</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(categoryLabel)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">원단</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(fabricLabel)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">구성</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(homeAwayLabel)} / ${escapeHtml(partsLabel)} / ${escapeHtml(typeLabel)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">수량</span>
                    <span class="font-semibold text-gray-900">${state.quantity}벌</span>
                </div>
            </div>
        </div>

        <!-- 주문자 정보 -->
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <h3 class="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-1">
                <span class="material-symbols-outlined text-lg">person</span>
                주문자 정보
            </h3>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-gray-500">이름</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(state.customer.name)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">연락처</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(state.customer.phone)}</span>
                </div>
                ${state.customer.teamName ? `
                <div class="flex justify-between">
                    <span class="text-gray-500">팀명</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(state.customer.teamName)}</span>
                </div>` : ''}
                ${state.customer.email ? `
                <div class="flex justify-between">
                    <span class="text-gray-500">이메일</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(state.customer.email)}</span>
                </div>` : ''}
                ${state.customer.address ? `
                <div class="flex justify-between">
                    <span class="text-gray-500">배송 주소</span>
                    <span class="font-semibold text-gray-900">${escapeHtml(state.customer.address)}</span>
                </div>` : ''}
                ${state.memo ? `
                <div class="flex justify-between">
                    <span class="text-gray-500">요청사항</span>
                    <span class="font-semibold text-gray-900 text-right max-w-[60%]">${escapeHtml(state.memo)}</span>
                </div>` : ''}
            </div>
        </div>

        <!-- 참고 파일 -->
        ${state.referenceFiles.length > 0 ? `
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <h3 class="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-1">
                <span class="material-symbols-outlined text-lg">attach_file</span>
                참고 파일 (${state.referenceFiles.length}개)
            </h3>
            <div class="flex flex-wrap gap-2">
                ${state.referenceFiles.map(url => `
                    <a href="${API_BASE}${url}" target="_blank" class="text-xs text-blue-600 underline">${url.split('/').pop()}</a>
                `).join('')}
            </div>
        </div>` : ''}

        <!-- 모의 견적 -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div class="flex justify-between items-center">
                <span class="text-sm font-semibold text-blue-800">모의 견적</span>
                <span class="text-xl font-bold text-blue-900">${state.estimate.toLocaleString('ko-KR')}원</span>
            </div>
            <p class="text-xs text-blue-500 mt-1">* 실제 금액은 디자인 확정 후 변동될 수 있습니다.</p>
        </div>
    `;
}

// ===== 완료 화면 =====
function renderComplete(orderNumber) {
    state.currentStep = 7; // 네비 숨기기용

    // 모든 step 숨기기
    document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));

    // 완료 화면 표시
    document.getElementById('step-complete').classList.remove('hidden');
    document.getElementById('complete-order-number').textContent = `주문번호: ${orderNumber}`;

    // 네비 숨기기 + 진행 표시줄에 완료 표시
    updateNavButtons();
    document.getElementById('step-label').textContent = '주문 완료';

    // 진행 표시줄을 모두 완료 상태로
    const bar = document.getElementById('progress-bar');
    bar.querySelectorAll('.step-circle').forEach(c => {
        c.className = 'step-circle flex-shrink-0 completed';
        c.innerHTML = '<span class="material-symbols-outlined text-lg">check</span>';
    });
    bar.querySelectorAll('.step-line').forEach(l => {
        l.className = 'step-line completed';
    });
}

// ===== 파일 업로드 =====

// 드래그 앤 드롭 핸들러
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files);
    }
}

// 파일 선택 시 검증 후 업로드
async function handleFileSelect(files) {
    const MAX_FILES = 5;       // 최대 5개
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB

    // 이미 업로드된 수 체크
    if (state.referenceFiles.length >= MAX_FILES) {
        alert('파일은 최대 5개까지 첨부할 수 있습니다.');
        return;
    }

    for (const file of files) {
        // 수량 초과 체크
        if (state.referenceFiles.length >= MAX_FILES) {
            alert('파일은 최대 5개까지 첨부할 수 있습니다.');
            break;
        }

        // 크기 체크
        if (file.size > MAX_SIZE) {
            alert(`"${file.name}" 파일이 10MB를 초과합니다.`);
            continue;
        }

        // 업로드 실행
        await uploadFile(file);
    }

    // 파일 입력 초기화 (같은 파일 재선택 가능하게)
    document.getElementById('file-input').value = '';
}

// 서버에 파일 업로드
async function uploadFile(file) {
    const fileList = document.getElementById('file-list');

    // 업로드 중 임시 표시
    const tempEl = document.createElement('div');
    tempEl.className = 'flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm';
    tempEl.innerHTML = `
        <span class="material-symbols-outlined text-gray-400 animate-spin text-lg">progress_activity</span>
        <span class="text-gray-500 flex-1 truncate">${escapeHtml(file.name)}</span>
    `;
    fileList.appendChild(tempEl);

    try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_BASE}/api/upload/reference`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || '업로드 실패');
        }

        const data = await res.json();
        const fileUrl = data.file?.url || data.fileUrl;
        state.referenceFiles.push(fileUrl);

        // 성공 표시로 교체
        tempEl.innerHTML = `
            <span class="material-symbols-outlined text-green-500 text-lg">check_circle</span>
            <span class="text-gray-700 flex-1 truncate">${escapeHtml(file.name)}</span>
            <button onclick="removeFile(${state.referenceFiles.length - 1}, this.parentElement)"
                class="text-gray-400 hover:text-red-500">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
        `;
    } catch (err) {
        console.error('파일 업로드 오류:', err);
        // 실패 표시
        tempEl.innerHTML = `
            <span class="material-symbols-outlined text-red-500 text-lg">error</span>
            <span class="text-red-600 flex-1 truncate">${escapeHtml(file.name)} - ${escapeHtml(err.message)}</span>
            <button onclick="this.parentElement.remove()"
                class="text-gray-400 hover:text-red-500">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
        `;
    }
}

// 업로드된 파일 삭제
function removeFile(index, element) {
    state.referenceFiles.splice(index, 1);
    element.remove();
    // 인덱스가 바뀌므로 파일 목록 전체 재렌더링
    rerenderFileList();
}

// 파일 목록 재렌더링 (삭제 후 인덱스 동기화)
function rerenderFileList() {
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '';
    state.referenceFiles.forEach((url, i) => {
        const fileName = url.split('/').pop();
        const el = document.createElement('div');
        el.className = 'flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm';
        el.innerHTML = `
            <span class="material-symbols-outlined text-green-500 text-lg">check_circle</span>
            <span class="text-gray-700 flex-1 truncate">${escapeHtml(fileName)}</span>
            <button onclick="removeFile(${i}, this.parentElement)"
                class="text-gray-400 hover:text-red-500">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
        `;
        fileList.appendChild(el);
    });
}

// ===== 주문 제출 =====
async function submitOrder() {
    if (state.isSubmitting) return; // 중복 제출 방지
    state.isSubmitting = true;

    // 제출 버튼 로딩 표시
    const nextBtn = document.getElementById('btn-next');
    const originalHtml = nextBtn.innerHTML;
    nextBtn.innerHTML = `
        <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>
        처리 중...
    `;
    nextBtn.disabled = true;

    try {
        // 카탈로그에서 라벨 조회
        const categoryObj = state.catalog.categories?.find(c => c.id === state.selectedCategory);

        // POST /api/orders에 보낼 데이터 구성
        const body = {
            customer: {
                name: state.customer.name,
                phone: state.customer.phone,
                email: state.customer.email || undefined,
                teamName: state.customer.teamName || undefined,
            },
            items: [{
                name: categoryObj?.label || state.selectedCategory,
                sport: state.selectedSport,
                quantity: state.quantity,
                unitPrice: state.quantity > 0 ? Math.round(state.estimate / state.quantity) : 0,
                category: state.selectedCategory,
                method: 'sublimation',
                fabric: state.selectedFabric,
                composition: { ...state.composition },
            }],
            shipping: {
                address: state.customer.address || '',
                desiredDate: '',
            },
            referenceFiles: state.referenceFiles,
            customerMemo: state.memo,
            estimate: {
                totalAmount: state.estimate,
                unitPrice: state.quantity > 0 ? Math.round(state.estimate / state.quantity) : 0,
                quantity: state.quantity,
            },
        };

        const res = await fetch(`${API_BASE}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (data.success || data.orderNumber) {
            // 성공: 완료 화면으로 전환
            renderComplete(data.orderNumber);
        } else {
            throw new Error(data.error || '주문 접수에 실패했습니다.');
        }
    } catch (err) {
        console.error('주문 제출 오류:', err);
        alert('주문 접수 중 오류가 발생했습니다: ' + err.message);

        // 버튼 복원
        nextBtn.innerHTML = originalHtml;
        nextBtn.disabled = false;
        state.isSubmitting = false;
    }
}

// ===== 입력 검증 =====
// 각 단계에서 "다음"을 누를 때 필수값 확인
function validateCurrentStep() {
    switch (state.currentStep) {
        case 1:
            if (!state.selectedSport) {
                alert('종목을 선택해주세요.');
                return false;
            }
            return true;

        case 2:
            if (!state.selectedCategory) {
                alert('품목을 선택해주세요.');
                return false;
            }
            return true;

        case 3:
            if (!state.selectedFabric) {
                alert('원단을 선택해주세요.');
                return false;
            }
            return true;

        case 4:
            if (state.quantity < 1) {
                alert('수량은 1 이상이어야 합니다.');
                return false;
            }
            return true;

        case 5:
            // Step 5를 떠나기 전에 입력값 수집
            collectCustomerInfo();
            if (!state.customer.name) {
                alert('이름을 입력해주세요.');
                document.getElementById('input-name').focus();
                return false;
            }
            if (!state.customer.phone) {
                alert('연락처를 입력해주세요.');
                document.getElementById('input-phone').focus();
                return false;
            }
            return true;

        default:
            return true;
    }
}

// ===== 공통 유틸리티 =====

// 옵션 카드 생성 (종목/품목/원단 공통)
function createOptionCard({ id, label, description, icon, badge, selected, onClick }) {
    const card = document.createElement('div');
    card.className = `card-option bg-white rounded-xl border-2 border-gray-200 p-4 ${selected ? 'selected' : ''}`;
    card.dataset.id = id;
    card.onclick = onClick;

    card.innerHTML = `
        <!-- 선택 체크마크 -->
        <div class="check-badge absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full items-center justify-center">
            <span class="material-symbols-outlined text-white text-sm">check</span>
        </div>
        <!-- 아이콘 -->
        <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-2xl text-gray-400">${icon}</span>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-gray-900 text-sm">${escapeHtml(label)}</p>
                ${description ? `<p class="text-xs text-gray-400 mt-0.5 truncate">${escapeHtml(description)}</p>` : ''}
            </div>
            ${badge ? `<span class="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">${escapeHtml(badge)}</span>` : ''}
        </div>
    `;
    return card;
}

// 카드 선택 상태 일괄 갱신
function updateCardSelection(container, selectedId) {
    container.querySelectorAll('.card-option').forEach(card => {
        if (card.dataset.id === selectedId) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

// XSS 방지를 위한 HTML 이스케이프
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== 페이지 로드 시 초기화 =====
document.addEventListener('DOMContentLoaded', init);
