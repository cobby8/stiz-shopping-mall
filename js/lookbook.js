/**
 * 룩북 갤러리 렌더링 + 필터 + 상세 모달
 * - lookbook-data.js의 데이터를 기반으로 카드를 동적 생성
 * - 종목별 필터, 카드 클릭 시 상세 모달 팝업
 */
(function () {
    'use strict';

    // 초기 표시 개수 (8개까지 보이고, 나머지는 "더보기"로)
    const INITIAL_SHOW_COUNT = 8;
    let currentFilter = 'all';  // 현재 선택된 필터
    let showAll = false;         // "더보기" 클릭 여부

    // --- 갤러리 렌더링 ---
    // 데이터 배열을 받아서 카드 그리드를 생성
    function renderGallery() {
        const container = document.getElementById('gallery-container');
        if (!container || typeof lookbookItems === 'undefined') return;

        // 필터 적용: 'all'이면 전부, 아니면 해당 종목만
        const filtered = currentFilter === 'all'
            ? lookbookItems
            : lookbookItems.filter(item => item.sport === currentFilter);

        // 표시할 아이템 수 결정
        const itemsToShow = showAll ? filtered : filtered.slice(0, INITIAL_SHOW_COUNT);

        container.innerHTML = '';

        if (filtered.length === 0) {
            container.innerHTML = '<p class="col-span-full text-center py-20 text-gray-400">해당 종목의 제작 사례가 없습니다.</p>';
            updateLoadMoreButton(0, 0);
            return;
        }

        // 각 아이템을 카드로 렌더링
        itemsToShow.forEach(item => {
            const card = document.createElement('div');
            // group: 호버 시 자식 요소에 애니메이션 전파 / cursor-pointer: 클릭 가능 표시
            card.className = 'group relative overflow-hidden rounded-lg cursor-pointer';
            card.onclick = () => openDetailModal(item.id);

            card.innerHTML = `
                <!-- 카드 이미지 (4:3 비율) -->
                <div class="aspect-[4/3] w-full bg-gray-100 overflow-hidden">
                    <img src="${item.image}" alt="${item.teamName}"
                        class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy">
                </div>
                <!-- 호버 오버레이: 팀명 + 종목 -->
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                    <span class="text-white font-bold text-lg">${item.teamName}</span>
                    <span class="text-gray-300 text-xs uppercase tracking-wider">${item.sportLabel} · ${item.year}</span>
                </div>
                <!-- 종목 배지 (항상 표시) -->
                <div class="absolute top-3 left-3">
                    <span class="bg-white/90 backdrop-blur-sm text-gray-900 text-[10px] font-bold px-2 py-1 rounded-full">${item.sportLabel}</span>
                </div>
            `;

            container.appendChild(card);
        });

        // "더보기" 버튼 표시/숨김
        updateLoadMoreButton(filtered.length, itemsToShow.length);
    }

    // --- "더보기" 버튼 제어 ---
    // 전체 아이템이 8개 초과이고, 아직 전부 표시하지 않았을 때만 버튼 표시
    function updateLoadMoreButton(totalCount, shownCount) {
        const btn = document.getElementById('load-more-btn');
        if (!btn) return;

        if (totalCount > INITIAL_SHOW_COUNT && !showAll) {
            btn.style.display = 'inline-block';
            btn.textContent = `더보기 (${shownCount}/${totalCount})`;
        } else {
            btn.style.display = 'none';
        }
    }

    // --- 필터 기능 ---
    // 종목 버튼 클릭 시 해당 종목만 필터링
    function filterBySport(sport) {
        currentFilter = sport;
        showAll = false;  // 필터 변경 시 "더보기" 초기화

        // 필터 버튼 활성/비활성 스타일 전환
        const buttons = document.querySelectorAll('#filter-bar button');
        buttons.forEach(btn => {
            btn.classList.remove('bg-black', 'text-white', 'border-black');
            btn.classList.add('bg-white', 'text-gray-500', 'border-gray-200');
        });
        const activeBtn = document.getElementById(`filter-${sport}`);
        if (activeBtn) {
            activeBtn.classList.remove('bg-white', 'text-gray-500', 'border-gray-200');
            activeBtn.classList.add('bg-black', 'text-white', 'border-black');
        }

        renderGallery();
    }

    // --- 상세 모달 ---
    // 카드 클릭 시 해당 아이템의 상세 정보를 모달로 표시
    function openDetailModal(id) {
        const item = lookbookItems.find(i => i.id === id);
        if (!item) return;

        const modal = document.getElementById('detail-modal');
        if (!modal) return;

        // 모달 내용 채우기
        document.getElementById('modal-image').src = item.image;
        document.getElementById('modal-image').alt = item.teamName;
        document.getElementById('modal-team').textContent = item.teamName;
        document.getElementById('modal-sport').textContent = `${item.sportLabel} · ${item.year}`;
        document.getElementById('modal-desc').textContent = item.description;

        // 사용 제품 목록을 태그 형태로 렌더링
        const productsEl = document.getElementById('modal-products');
        productsEl.innerHTML = item.products.map(p =>
            `<span class="inline-block bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full">${p}</span>`
        ).join(' ');

        // 모달 표시 + 배경 스크롤 방지
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
    }

    // 모달 닫기
    function closeDetailModal() {
        const modal = document.getElementById('detail-modal');
        if (!modal) return;

        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';  // 스크롤 복원
    }

    // "더보기" 클릭 핸들러
    function loadMore() {
        showAll = true;
        renderGallery();
    }

    // --- 전역 함수 등록 ---
    // HTML onclick에서 호출할 수 있도록 window에 등록
    window.filterBySport = filterBySport;
    window.openDetailModal = openDetailModal;
    window.closeDetailModal = closeDetailModal;
    window.loadMoreLookbook = loadMore;

    // --- 초기화 ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderGallery);
    } else {
        renderGallery();
    }
})();
