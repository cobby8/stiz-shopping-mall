/**
 * STIZ 커스텀 주문 위자드 로직 (v2 - 7단계, priceTable 참조 방식)
 *
 * 비유: 피자 주문 앱처럼 단계별로 옵션을 선택하면
 * 최종 주문이 만들어지는 시스템.
 *
 * 유니폼 흐름: 종목 → 품목(uniform) → 등급 → 패키지+옵션 → 견적+수량 → 주문자 → 확인
 * 팀웨어 흐름: 종목(teamwear) → 팀웨어 품목 → [3,4 스킵] → 견적+수량 → 주문자 → 확인
 *
 * 가격 계산: priceTable["{sport}_{grade}_{package}"] 직접 참조 (배수 곱하기 X)
 */

// 서버 API 주소 — 빈 문자열이면 현재 접속 호스트 기준 상대경로로 요청됨
// (LAN 내 다른 PC에서 192.168.x.x로 접속해도 호환)
const API_BASE = '';

// ===== 7단계 정의 (진행 표시줄용) =====
const STEPS = [
    { step: 1, label: '종목', icon: 'sports_soccer' },
    { step: 2, label: '품목', icon: 'checkroom' },
    { step: 3, label: '등급', icon: 'star' },        // 기존 "원단" → "등급"
    { step: 4, label: '구성', icon: 'tune' },         // 패키지 + 마감 + 할인
    { step: 5, label: '견적', icon: 'calculate' },    // 신규: 수량 + 견적 확인
    { step: 6, label: '정보', icon: 'person' },
    { step: 7, label: '확인', icon: 'fact_check' },
];

// ===== 전역 상태 객체 =====
// 위자드 전체에서 공유하는 "장바구니" 같은 역할
const state = {
    currentStep: 1,         // 현재 표시 중인 단계
    catalog: null,          // GET /api/catalog 응답 캐시
    selectedSport: null,    // 선택된 종목 ID
    selectedCategory: null, // 선택된 품목 ID
    selectedGrade: null,    // [신규] 선택된 등급 ID (basic/pro/authentic/reversible)
    selectedPackage: null,  // [신규] 선택된 패키지 ID (set/top/bottom/top2_bottom1/...)
    finish: {               // [신규] 마감 옵션
        top: null,          // sambong | armhole
        bottom: null,       // no_slit | slit
    },
    homeAway: 'home',       // 홈/어웨이 (기존 composition에서 분리)
    selectedDiscount: null,  // [신규] 적용 할인 ID (null = 할인없음)
    quantity: 1,            // 주문 수량
    estimate: 0,            // 모의 견적 금액
    unitPrice: 0,           // 단가
    customer: {             // 주문자 정보
        name: '',
        phone: '',
        teamName: '',
        email: '',
        address: '',
    },
    memo: '',               // 요청사항
    referenceFiles: [],     // 업로드된 참고 파일 URL 목록
    isSubmitting: false,    // 중복 제출 방지 플래그
};

// ===== 팀웨어 여부 판별 =====
// 팀웨어는 등급/패키지 선택 없이 품목 자체가 가격을 결정한다
function isTeamwear() {
    return state.selectedSport === 'teamwear';
}

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

        renderProgressBar();
        goToStep(1);
    } catch (err) {
        console.error('카탈로그 초기화 실패:', err);
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('error-screen').classList.remove('hidden');
    }
}

// ===== 진행 표시줄 렌더링 =====
// 7개의 원형 + 연결선으로 현재 진행도를 보여준다
// 팀웨어일 때는 스킵되는 단계(3,4)를 시각적으로 표시
function renderProgressBar() {
    const bar = document.getElementById('progress-bar');
    bar.innerHTML = '';

    // 팀웨어일 때 표시할 실제 단계만 필터링
    const visibleSteps = getVisibleSteps();

    visibleSteps.forEach((s, i) => {
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
            // 표시 번호는 보이는 순서로 (1,2,3... 팀웨어면 1,2,3,4,5)
            circle.textContent = i + 1;
        } else {
            // 미완료 단계: 회색 숫자
            circle.classList.add('inactive');
            circle.textContent = i + 1;
        }
        bar.appendChild(circle);

        // 마지막 단계 뒤에는 연결선 불필요
        if (i < visibleSteps.length - 1) {
            const line = document.createElement('div');
            line.className = 'step-line';
            line.classList.add(s.step < state.currentStep ? 'completed' : 'inactive');
            bar.appendChild(line);
        }
    });

    // 현재 단계 라벨 표시
    const current = STEPS.find(s => s.step === state.currentStep);
    document.getElementById('step-label').textContent = current
        ? `${current.label}`
        : '';
}

// 팀웨어일 때 스킵되는 단계를 제외한 표시 목록
function getVisibleSteps() {
    if (isTeamwear()) {
        // 팀웨어: 3(등급), 4(구성) 스킵
        return STEPS.filter(s => s.step !== 3 && s.step !== 4);
    }
    return STEPS;
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
        case 3: renderGradeSelection(); break;     // 등급 선택 (유니폼 전용)
        case 4: renderPackageOptions(); break;      // 패키지 + 마감 + 할인
        case 5: renderEstimate(); break;            // 견적 + 수량
        case 6: renderCustomerInfo(); break;
        case 7: renderConfirmation(); break;
    }

    // 이전/다음 버튼 상태 업데이트
    updateNavButtons();

    // 상단으로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== 다음 단계로 이동 (팀웨어 스킵 로직 포함) =====
function goToNext() {
    if (!validateCurrentStep()) return;

    if (state.currentStep === 7) {
        // 7단계에서 "다음" = 주문 제출
        submitOrder();
        return;
    }

    let nextStep = state.currentStep + 1;

    // 팀웨어일 때: Step 2 → Step 5 (등급/구성 스킵)
    if (isTeamwear() && state.currentStep === 2) {
        nextStep = 5;
    }

    goToStep(nextStep);
}

// ===== 이전 단계로 이동 (팀웨어 스킵 로직 포함) =====
function goToPrev() {
    if (state.currentStep <= 1) return;

    let prevStep = state.currentStep - 1;

    // 팀웨어일 때: Step 5 → Step 2 (등급/구성 스킵)
    if (isTeamwear() && state.currentStep === 5) {
        prevStep = 2;
    }

    goToStep(prevStep);
}

// 네비 버튼 활성/비활성 + 텍스트 변경
function updateNavButtons() {
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const bottomNav = document.getElementById('bottom-nav');

    // 완료 화면에서는 네비 숨기기
    if (state.currentStep > 7) {
        bottomNav.classList.add('hidden');
        return;
    }
    bottomNav.classList.remove('hidden');

    // 1단계에서는 "이전" 비활성
    prevBtn.disabled = state.currentStep <= 1;

    // 7단계에서는 "다음"을 "주문하기"로 변경
    if (state.currentStep === 7) {
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
// 축구, 농구, 배구, 팀웨어 등 카탈로그의 종목을 카드 그리드로 표시
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
                state.selectedGrade = null;
                state.selectedPackage = null;
                state.finish = { top: null, bottom: null };
                state.selectedDiscount = null;
                updateCardSelection(grid, sport.id);
            }
        });
        grid.appendChild(card);
    });
}

// ===== Step 2: 품목 선택 =====
// 유니폼 종목이면 "유니폼" 카드 1개만, 팀웨어면 팀웨어 품목 목록 표시
function renderCategorySelection() {
    const grid = document.getElementById('category-grid');
    grid.innerHTML = ''; // 종목 변경 시 항상 새로 그림

    const categories = (state.catalog.categories || []).filter(c => c.active);

    if (isTeamwear()) {
        // 팀웨어: group이 'teamwear' 또는 'casual'인 품목만 표시
        const teamwearCats = categories.filter(c => c.group === 'teamwear' || c.group === 'casual');
        if (teamwearCats.length === 0) {
            grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">등록된 팀웨어 품목이 없습니다.</p>';
            return;
        }

        teamwearCats.forEach(cat => {
            // 팀웨어는 품목별 고정가가 있으므로 가격 배지 표시
            const priceKey = `teamwear__${cat.id}`;
            const price = state.catalog.priceTable?.[priceKey];
            const badge = price ? `${price.toLocaleString('ko-KR')}원` : '';

            const card = createOptionCard({
                id: cat.id,
                label: cat.label,
                description: cat.description || '',
                badge: badge,
                icon: 'checkroom',
                selected: state.selectedCategory === cat.id,
                onClick: () => {
                    state.selectedCategory = cat.id;
                    updateCardSelection(grid, cat.id);
                }
            });
            grid.appendChild(card);
        });
    } else {
        // 유니폼 종목: "유니폼" 카드 1개만 표시
        const uniformCat = categories.find(c => c.group === 'uniform') || categories.find(c => c.id === 'uniform');
        if (uniformCat) {
            const card = createOptionCard({
                id: uniformCat.id,
                label: uniformCat.label,
                description: '커스텀 유니폼 제작',
                icon: 'checkroom',
                selected: state.selectedCategory === uniformCat.id,
                onClick: () => {
                    state.selectedCategory = uniformCat.id;
                    updateCardSelection(grid, uniformCat.id);
                }
            });
            grid.appendChild(card);
            // 유니폼은 1개뿐이므로 자동 선택
            if (!state.selectedCategory) {
                state.selectedCategory = uniformCat.id;
                card.classList.add('selected');
            }
        } else {
            grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">등록된 품목이 없습니다.</p>';
        }
    }
}

// ===== Step 3: 등급 선택 (유니폼 전용) =====
// sportGradeMap에서 해당 종목의 가능한 등급만 카드로 표시
function renderGradeSelection() {
    const grid = document.getElementById('grade-grid');
    grid.innerHTML = '';

    const grades = state.catalog.grades || [];
    const sportGradeMap = state.catalog.sportGradeMap || {};
    // 해당 종목에서 선택 가능한 등급 ID 목록
    const allowedGrades = sportGradeMap[state.selectedSport] || [];

    if (allowedGrades.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">이 종목에 등록된 등급이 없습니다.</p>';
        return;
    }

    allowedGrades.forEach(gradeId => {
        const grade = grades.find(g => g.id === gradeId);
        if (!grade || !grade.active) return;

        // 등급별 대표 가격 표시 (세트 가격 우선)
        const setKey = `${state.selectedSport}_${gradeId}_set`;
        const topKey = `${state.selectedSport}_${gradeId}_top`;
        const price = state.catalog.priceTable?.[setKey] || state.catalog.priceTable?.[topKey];
        const badge = price ? `${price.toLocaleString('ko-KR')}원~` : '';

        const card = createOptionCard({
            id: grade.id,
            label: grade.label,
            // 원단 이름을 설명으로 표시
            description: grade.fabric ? `원단: ${grade.fabric}` : '',
            badge: badge,
            icon: 'star',
            selected: state.selectedGrade === grade.id,
            onClick: () => {
                state.selectedGrade = grade.id;
                // 등급 변경 시 패키지 초기화
                state.selectedPackage = null;
                updateCardSelection(grid, grade.id);
            }
        });
        grid.appendChild(card);
    });
}

// ===== Step 4: 패키지 구성 + 마감 + 할인 (유니폼 전용) =====
function renderPackageOptions() {
    // --- 패키지 선택 ---
    renderPackageGrid();

    // --- 마감 옵션 렌더링 ---
    renderFinishOptions();

    // --- 홈/어웨이 ---
    renderHomeAwayOptions();

    // --- 할인 적용 ---
    renderDiscountOptions();
}

// 패키지 그리드: gradePackageMap 기반으로 선택 가능한 패키지만 표시
function renderPackageGrid() {
    const grid = document.getElementById('package-grid');
    grid.innerHTML = '';

    const packages = state.catalog.packages || [];
    const gradePackageMap = state.catalog.gradePackageMap || {};
    // 현재 등급에서 선택 가능한 패키지 ID 목록
    const allowedPackages = gradePackageMap[state.selectedGrade] || [];

    if (allowedPackages.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-4">이 등급에 등록된 패키지가 없습니다.</p>';
        return;
    }

    allowedPackages.forEach(pkgId => {
        const pkg = packages.find(p => p.id === pkgId);
        if (!pkg || !pkg.active) return;

        // 이 패키지의 가격 조회
        const priceKey = `${state.selectedSport}_${state.selectedGrade}_${pkgId}`;
        const price = state.catalog.priceTable?.[priceKey];
        const badge = price ? `${price.toLocaleString('ko-KR')}원` : '별도상담';

        const card = createOptionCard({
            id: pkg.id,
            label: pkg.label,
            description: '',
            badge: badge,
            icon: 'inventory_2',
            selected: state.selectedPackage === pkg.id,
            onClick: () => {
                state.selectedPackage = pkg.id;
                updateCardSelection(grid, pkg.id);
                // 패키지 변경 시 마감 옵션 표시 갱신
                renderFinishOptions();
            }
        });
        grid.appendChild(card);
    });
}

// 마감 옵션: 패키지에 상의/하의가 포함되어 있으면 해당 마감 옵션 표시
function renderFinishOptions() {
    const finishOpts = state.catalog.finishOptions || {};
    const packages = state.catalog.packages || [];
    const pkg = packages.find(p => p.id === state.selectedPackage);

    const topSection = document.getElementById('finish-top-section');
    const bottomSection = document.getElementById('finish-bottom-section');

    // 패키지에 상의가 포함되어 있으면 상의 마감 표시
    const hasTop = pkg && pkg.topCount > 0;
    const hasBottom = pkg && pkg.bottomCount > 0;

    if (hasTop && finishOpts.top && finishOpts.top.length > 0) {
        topSection.classList.remove('hidden');
        // 기본값 설정
        if (!state.finish.top) state.finish.top = finishOpts.top[0].id;
        renderToggleOptions(
            'finish-top-options',
            finishOpts.top.filter(o => o.active),
            state.finish.top,
            (id) => { state.finish.top = id; }
        );
    } else {
        topSection.classList.add('hidden');
        state.finish.top = null;
    }

    if (hasBottom && finishOpts.bottom && finishOpts.bottom.length > 0) {
        bottomSection.classList.remove('hidden');
        if (!state.finish.bottom) state.finish.bottom = finishOpts.bottom[0].id;
        renderToggleOptions(
            'finish-bottom-options',
            finishOpts.bottom.filter(o => o.active),
            state.finish.bottom,
            (id) => { state.finish.bottom = id; }
        );
    } else {
        bottomSection.classList.add('hidden');
        state.finish.bottom = null;
    }
}

// 홈/어웨이 옵션 렌더링
function renderHomeAwayOptions() {
    const homeAwayList = state.catalog.homeAway || [];
    if (homeAwayList.length === 0) return;

    // 기본값 설정
    if (!state.homeAway) state.homeAway = homeAwayList[0].id;

    renderToggleOptions(
        'homeaway-options',
        homeAwayList.filter(o => o.active),
        state.homeAway,
        (id) => { state.homeAway = id; }
    );
}

// 할인 옵션 렌더링: active인 할인만 체크박스로 표시
function renderDiscountOptions() {
    const container = document.getElementById('discount-options');
    const section = document.getElementById('discount-section');
    const discounts = (state.catalog.discounts || []).filter(d => d.active);

    if (discounts.length === 0) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    container.innerHTML = '';

    discounts.forEach(disc => {
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 transition-all';

        const checked = state.selectedDiscount === disc.id;
        label.innerHTML = `
            <input type="checkbox" name="discount" value="${escapeHtml(disc.id)}"
                ${checked ? 'checked' : ''}
                class="w-4 h-4 text-blue-600 rounded border-gray-300" />
            <div class="flex-1">
                <span class="text-sm font-semibold text-gray-900">${escapeHtml(disc.label)}</span>
                ${disc.description ? `<p class="text-xs text-gray-500">${escapeHtml(disc.description)}</p>` : ''}
            </div>
        `;

        // 체크박스 변경 이벤트: 단일 선택 (하나만 적용)
        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                state.selectedDiscount = disc.id;
                // 다른 체크박스 해제
                container.querySelectorAll('input[name="discount"]').forEach(cb => {
                    if (cb !== checkbox) cb.checked = false;
                });
            } else {
                state.selectedDiscount = null;
            }
        });

        container.appendChild(label);
    });
}

// ===== Step 5: 견적 확인 + 수량 =====
function renderEstimate() {
    // 수량 입력 동기화
    document.getElementById('quantity-input').value = state.quantity;

    // 선택 요약 표시
    renderEstimateSummary();

    // 견적 계산 및 표시
    updateEstimateDisplay();
}

// 선택 요약 박스 렌더링
function renderEstimateSummary() {
    const container = document.getElementById('estimate-summary');

    const sportLabel = findLabel(state.catalog.sports, state.selectedSport);

    let rows = '';
    rows += summaryRow('종목', sportLabel);

    if (isTeamwear()) {
        // 팀웨어: 품목만 표시
        const catLabel = findLabel(state.catalog.categories, state.selectedCategory);
        rows += summaryRow('품목', catLabel);
    } else {
        // 유니폼: 등급 + 패키지 + 마감 + 홈어웨이
        const gradeObj = (state.catalog.grades || []).find(g => g.id === state.selectedGrade);
        const gradeLabel = gradeObj ? `${gradeObj.label} (${gradeObj.fabric})` : state.selectedGrade;
        rows += summaryRow('등급', gradeLabel);

        const pkgLabel = findLabel(state.catalog.packages, state.selectedPackage);
        rows += summaryRow('패키지', pkgLabel);

        // 마감 옵션
        if (state.finish.top) {
            const topLabel = findLabel(state.catalog.finishOptions?.top, state.finish.top);
            rows += summaryRow('상의 마감', topLabel);
        }
        if (state.finish.bottom) {
            const bottomLabel = findLabel(state.catalog.finishOptions?.bottom, state.finish.bottom);
            rows += summaryRow('하의 마감', bottomLabel);
        }

        // 홈/어웨이
        const haLabel = findLabel(state.catalog.homeAway, state.homeAway);
        rows += summaryRow('홈/어웨이', haLabel);

        // 할인
        if (state.selectedDiscount) {
            const discLabel = findLabel(state.catalog.discounts, state.selectedDiscount);
            rows += summaryRow('할인', discLabel);
        }
    }

    container.innerHTML = `
        <h3 class="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-1">
            <span class="material-symbols-outlined text-lg">shopping_bag</span>
            선택 내역
        </h3>
        <div class="space-y-2 text-sm">${rows}</div>
    `;
}

// 요약 행 HTML 생성 (XSS 방지)
function summaryRow(label, value) {
    return `
        <div class="flex justify-between">
            <span class="text-gray-500">${escapeHtml(label)}</span>
            <span class="font-semibold text-gray-900">${escapeHtml(value || '-')}</span>
        </div>
    `;
}

// 라벨 찾기 유틸리티
function findLabel(arr, id) {
    if (!arr || !id) return id || '';
    const item = arr.find(x => x.id === id);
    return item ? item.label : id;
}

// ===== 견적 계산 (핵심: priceTable 직접 참조) =====
// 기존: basePrices[품목] x 배수들 x 수량
// 변경: priceTable["{sport}_{grade}_{package}"] x 홈어웨이배수 x 수량
function calculateEstimate() {
    if (!state.catalog) return 0;

    let unitPrice = 0;

    if (isTeamwear()) {
        // 팀웨어: "teamwear__{category}" 키로 직접 참조
        const key = `teamwear__${state.selectedCategory}`;
        unitPrice = state.catalog.priceTable?.[key] || 0;
    } else {
        // 유니폼: "{sport}_{grade}_{package}" 키로 참조
        const key = `${state.selectedSport}_${state.selectedGrade}_${state.selectedPackage}`;
        unitPrice = state.catalog.priceTable?.[key] || 0;

        // 할인 적용
        if (state.selectedDiscount && unitPrice > 0) {
            const disc = (state.catalog.discounts || []).find(d => d.id === state.selectedDiscount);
            if (disc) {
                if (disc.type === 'fixed_price') {
                    // 학교스포츠클럽: 별도 가격표에서 조회
                    const discKey = `${state.selectedSport}_${state.selectedGrade}_${state.selectedPackage}`;
                    const discPrice = state.catalog.discountPriceTable?.[discKey];
                    if (discPrice != null) unitPrice = discPrice;
                } else if (disc.type === 'percent' && disc.value) {
                    // 비율 할인
                    unitPrice = Math.round(unitPrice * (1 - disc.value / 100));
                }
            }
        }
    }

    // 홈/어웨이 배수 (팀웨어도 적용)
    const homeAwayObj = (state.catalog.homeAway || []).find(h => h.id === state.homeAway);
    const homeAwayMul = homeAwayObj?.multiplier || 1;

    // 최종 계산
    state.unitPrice = unitPrice;
    state.estimate = unitPrice * homeAwayMul * state.quantity;
    return state.estimate;
}

function updateEstimateDisplay() {
    const amount = calculateEstimate();
    const display = document.getElementById('estimate-display');
    const detail = document.getElementById('estimate-detail');

    if (display) {
        display.textContent = amount.toLocaleString('ko-KR') + '원';
    }

    // 견적 상세 표시
    if (detail) {
        const homeAwayObj = (state.catalog.homeAway || []).find(h => h.id === state.homeAway);
        const homeAwayMul = homeAwayObj?.multiplier || 1;

        if (state.unitPrice > 0) {
            let detailHtml = `
                <div class="flex justify-between text-sm">
                    <span class="text-blue-600">단가</span>
                    <span class="text-blue-800">${state.unitPrice.toLocaleString('ko-KR')}원</span>
                </div>
            `;
            if (!isTeamwear() && homeAwayMul > 1) {
                detailHtml += `
                    <div class="flex justify-between text-sm">
                        <span class="text-blue-600">홈+어웨이</span>
                        <span class="text-blue-800">x ${homeAwayMul}</span>
                    </div>
                `;
            }
            if (state.selectedDiscount) {
                const disc = (state.catalog.discounts || []).find(d => d.id === state.selectedDiscount);
                if (disc) {
                    detailHtml += `
                        <div class="flex justify-between text-sm">
                            <span class="text-green-600">할인</span>
                            <span class="text-green-700">${escapeHtml(disc.label)}</span>
                        </div>
                    `;
                }
            }
            detailHtml += `
                <div class="flex justify-between text-sm">
                    <span class="text-blue-600">수량</span>
                    <span class="text-blue-800">${state.quantity}벌</span>
                </div>
            `;
            detail.innerHTML = detailHtml;
        } else {
            // 가격표에 없는 조합
            detail.innerHTML = `
                <div class="text-sm text-amber-600 flex items-center gap-1">
                    <span class="material-symbols-outlined text-lg">info</span>
                    별도 상담이 필요한 조합입니다. 주문 접수 후 연락드리겠습니다.
                </div>
            `;
        }
    }
}

// 토글 버튼 그룹 렌더링 (홈/어웨이, 마감 공통)
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

// ===== Step 6: 주문자 정보 =====
// 기존 입력값이 있으면 복원 (뒤로갔다 올 때)
function renderCustomerInfo() {
    document.getElementById('input-name').value = state.customer.name;
    document.getElementById('input-phone').value = state.customer.phone;
    document.getElementById('input-team').value = state.customer.teamName;
    document.getElementById('input-email').value = state.customer.email;
    document.getElementById('input-address').value = state.customer.address;
    document.getElementById('input-memo').value = state.memo;
}

// Step 6를 떠날 때 입력값을 state에 저장
function collectCustomerInfo() {
    state.customer.name = document.getElementById('input-name').value.trim();
    state.customer.phone = document.getElementById('input-phone').value.trim();
    state.customer.teamName = document.getElementById('input-team').value.trim();
    state.customer.email = document.getElementById('input-email').value.trim();
    state.customer.address = document.getElementById('input-address').value.trim();
    state.memo = document.getElementById('input-memo').value.trim();
}

// ===== Step 7: 주문 확인 =====
// 지금까지 선택한 모든 내용을 요약하여 보여준다
function renderConfirmation() {
    // Step 6 입력값 수집
    collectCustomerInfo();

    const container = document.getElementById('confirmation-summary');
    const sportLabel = findLabel(state.catalog.sports, state.selectedSport);
    const categoryLabel = findLabel(state.catalog.categories, state.selectedCategory);

    // 견적 계산 (최신값)
    calculateEstimate();

    // 홈/어웨이
    const haLabel = findLabel(state.catalog.homeAway, state.homeAway);
    const homeAwayObj = (state.catalog.homeAway || []).find(h => h.id === state.homeAway);
    const homeAwayMul = homeAwayObj?.multiplier || 1;

    // --- 상품 정보 블록 ---
    let productRows = '';
    productRows += summaryRow('종목', sportLabel);

    if (isTeamwear()) {
        productRows += summaryRow('품목', categoryLabel);
    } else {
        const gradeObj = (state.catalog.grades || []).find(g => g.id === state.selectedGrade);
        const gradeLabel = gradeObj ? `${gradeObj.label} (${gradeObj.fabric})` : '';
        productRows += summaryRow('등급', gradeLabel);

        const pkgLabel = findLabel(state.catalog.packages, state.selectedPackage);
        productRows += summaryRow('패키지', pkgLabel);

        if (state.finish.top) {
            productRows += summaryRow('상의 마감', findLabel(state.catalog.finishOptions?.top, state.finish.top));
        }
        if (state.finish.bottom) {
            productRows += summaryRow('하의 마감', findLabel(state.catalog.finishOptions?.bottom, state.finish.bottom));
        }

        productRows += summaryRow('홈/어웨이', haLabel);

        if (state.selectedDiscount) {
            productRows += summaryRow('할인', findLabel(state.catalog.discounts, state.selectedDiscount));
        }
    }

    productRows += summaryRow('수량', `${state.quantity}벌`);

    // --- 주문자 정보 블록 ---
    let customerRows = '';
    customerRows += summaryRow('이름', state.customer.name);
    customerRows += summaryRow('연락처', state.customer.phone);
    if (state.customer.teamName) customerRows += summaryRow('팀명', state.customer.teamName);
    if (state.customer.email) customerRows += summaryRow('이메일', state.customer.email);
    if (state.customer.address) customerRows += summaryRow('배송 주소', state.customer.address);
    if (state.memo) customerRows += summaryRow('요청사항', state.memo);

    container.innerHTML = `
        <!-- 상품 정보 -->
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <h3 class="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-1">
                <span class="material-symbols-outlined text-lg">shopping_bag</span>
                상품 정보
            </h3>
            <div class="space-y-2 text-sm">${productRows}</div>
        </div>

        <!-- 주문자 정보 -->
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <h3 class="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-1">
                <span class="material-symbols-outlined text-lg">person</span>
                주문자 정보
            </h3>
            <div class="space-y-2 text-sm">${customerRows}</div>
        </div>

        ${state.referenceFiles.length > 0 ? `
        <!-- 참고 파일 -->
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <h3 class="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-1">
                <span class="material-symbols-outlined text-lg">attach_file</span>
                참고 파일 (${state.referenceFiles.length}개)
            </h3>
            <div class="flex flex-wrap gap-2">
                ${state.referenceFiles.map(url => `
                    <a href="${API_BASE}${url}" target="_blank" class="text-xs text-blue-600 underline">${escapeHtml(url.split('/').pop())}</a>
                `).join('')}
            </div>
        </div>` : ''}

        <!-- 모의 견적 -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div class="flex justify-between items-center">
                <span class="text-sm font-semibold text-blue-800">모의 견적</span>
                <span class="text-xl font-bold text-blue-900">${state.estimate.toLocaleString('ko-KR')}원</span>
            </div>
            ${state.unitPrice > 0 ? `
                <p class="text-xs text-blue-600 mt-1">
                    ${state.unitPrice.toLocaleString('ko-KR')}원/벌
                    ${homeAwayMul > 1 ? ` x ${homeAwayMul}(홈+어웨이)` : ''}
                    x ${state.quantity}벌
                </p>
            ` : ''}
            <p class="text-xs text-blue-500 mt-1">* 실제 금액은 디자인 확정 후 변동될 수 있습니다.</p>
        </div>
    `;
}

// ===== 완료 화면 =====
function renderComplete(orderNumber) {
    state.currentStep = 8; // 네비 숨기기용

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
        if (state.referenceFiles.length >= MAX_FILES) {
            alert('파일은 최대 5개까지 첨부할 수 있습니다.');
            break;
        }
        if (file.size > MAX_SIZE) {
            alert(`"${file.name}" 파일이 10MB를 초과합니다.`);
            continue;
        }
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
        const gradeObj = (state.catalog.grades || []).find(g => g.id === state.selectedGrade);
        const pkgObj = (state.catalog.packages || []).find(p => p.id === state.selectedPackage);

        // 홈/어웨이
        const homeAwayObj = (state.catalog.homeAway || []).find(h => h.id === state.homeAway);
        const homeAwayMul = homeAwayObj?.multiplier || 1;

        // POST /api/orders에 보낼 데이터 구성 (v2 구조)
        const itemData = {
            name: categoryObj?.label || state.selectedCategory,
            sport: state.selectedSport,
            category: state.selectedCategory,
            quantity: state.quantity,
            unitPrice: state.unitPrice,
            method: 'sublimation',
            homeAway: state.homeAway,
        };

        // 유니폼 전용 필드
        if (!isTeamwear()) {
            itemData.grade = state.selectedGrade;
            itemData.gradeLabel = gradeObj?.label || state.selectedGrade;
            itemData.fabric = gradeObj?.fabric || '';
            itemData.package = state.selectedPackage;
            itemData.packageLabel = pkgObj?.label || state.selectedPackage;
            itemData.finish = { ...state.finish };

            if (state.selectedDiscount) {
                const disc = (state.catalog.discounts || []).find(d => d.id === state.selectedDiscount);
                if (disc) {
                    itemData.discount = { id: disc.id, label: disc.label, type: disc.type, value: disc.value || null };
                }
            }

            // 하위호환: 기존 코드가 읽을 수 있도록 composition도 포함
            itemData.composition = {
                homeAway: state.homeAway,
                parts: state.selectedPackage,
                type: 'single',
            };
        }

        itemData.totalAmount = state.unitPrice * homeAwayMul * state.quantity;

        const body = {
            customer: {
                name: state.customer.name,
                phone: state.customer.phone,
                email: state.customer.email || undefined,
                teamName: state.customer.teamName || undefined,
            },
            items: [itemData],
            shipping: {
                address: state.customer.address || '',
                desiredDate: '',
            },
            referenceFiles: state.referenceFiles,
            customerMemo: state.memo,
            estimate: {
                totalAmount: state.estimate,
                unitPrice: state.unitPrice,
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
            renderComplete(data.orderNumber);
        } else {
            throw new Error(data.error || '주문 접수에 실패했습니다.');
        }
    } catch (err) {
        console.error('주문 제출 오류:', err);
        alert('주문 접수 중 오류가 발생했습니다: ' + err.message);

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
            // 등급 선택 (팀웨어는 이 단계를 거치지 않음)
            if (!state.selectedGrade) {
                alert('등급을 선택해주세요.');
                return false;
            }
            return true;

        case 4:
            // 패키지 선택
            if (!state.selectedPackage) {
                alert('패키지 구성을 선택해주세요.');
                return false;
            }
            return true;

        case 5:
            if (state.quantity < 1) {
                alert('수량은 1 이상이어야 합니다.');
                return false;
            }
            return true;

        case 6:
            // 주문자 정보 검증
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

// 옵션 카드 생성 (종목/품목/등급/패키지 공통)
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
            ${badge ? `<span class="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap">${escapeHtml(badge)}</span>` : ''}
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
