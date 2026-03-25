/**
 * FOMO 토스트 알림 모듈
 * - 실시간 주문 알림을 가짜로 보여줘서 구매 욕구를 자극하는 마케팅 기법
 * - 독립 모듈이라 어떤 페이지에든 script 한 줄로 붙일 수 있음
 */
(function () {
    'use strict';

    // --- Mock 데이터 ---
    // 랜덤으로 조합해서 "방금 OO팀이 XX를 주문했습니다" 메시지를 생성
    const teamNames = [
        'FC 서울 주니어', 'KOGAS 페가수스', '한양대 농구부', '강남 배구 클럽',
        '인천 유나이티드 U-18', '서울 썬더스', '부산 이글스', '대전 스파크스',
        '광주 FC 아카데미', '수원 블루윙즈 유스', '제주 드래곤즈', '성균관대 배구부'
    ];

    const productTypes = [
        '축구 유니폼 세트', '농구 저지', '배구 유니폼', '트레이닝 키트',
        '커스텀 져지 디자인', '어웨이 유니폼', '골키퍼 키트', '팀 트레이닝복',
        '윈드브레이커 세트', '팀 점퍼'
    ];

    const actions = [
        '제작을 시작했습니다',
        '팀 키트를 주문했습니다',
        '커스텀 디자인을 완료했습니다',
        '견적을 요청했습니다',
        '단체 주문을 접수했습니다'
    ];

    // 시간 표현 (몇 분 전, 방금 등)
    const timeLabels = [
        '방금', '1분 전', '2분 전', '3분 전', '5분 전', '10분 전'
    ];

    // --- 유틸 함수 ---
    // 배열에서 랜덤 항목 하나를 뽑아주는 헬퍼
    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // min~max 사이 랜덤 정수 반환
    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // --- 토스트 생성 ---
    // 랜덤 데이터를 조합해 토스트 메시지를 만들고 화면에 표시
    function showToast() {
        // 이미 토스트가 표시 중이면 무시 (중복 방지)
        if (document.getElementById('fomo-toast')) return;

        const team = pickRandom(teamNames);
        const product = pickRandom(productTypes);
        const action = pickRandom(actions);
        const time = pickRandom(timeLabels);

        // 토스트 컨테이너 생성 (Tailwind 클래스로만 스타일링)
        const toast = document.createElement('div');
        toast.id = 'fomo-toast';
        // fixed: 화면에 고정 / left-6 bottom-24: 좌측 하단 / z-40: 챗봇(z-50)보다 아래
        // translate-x: 슬라이드인 애니메이션용 초기 위치 (화면 밖)
        toast.className = [
            'fixed left-6 bottom-24 z-40',
            'max-w-sm max-w-[calc(100vw-3rem)]',
            'bg-white rounded-xl shadow-2xl border border-gray-100',
            'p-4 flex items-start gap-3',
            'transition-all duration-500 ease-out',
            '-translate-x-[120%] opacity-0'
        ].join(' ');

        toast.innerHTML = `
            <!-- 아이콘: 쇼핑백 모양으로 주문 느낌을 줌 -->
            <div class="flex-shrink-0 w-10 h-10 bg-black rounded-full flex items-center justify-center">
                <span class="material-symbols-outlined text-white text-lg">shopping_bag</span>
            </div>
            <div class="flex-1 min-w-0">
                <!-- 팀명 + 액션 (메인 메시지) -->
                <p class="text-sm font-bold text-gray-900 truncate">${team}</p>
                <p class="text-xs text-gray-600 mt-0.5">${product} ${action}</p>
                <!-- 시간 표시 (신뢰감 부여) -->
                <p class="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[10px]">schedule</span>
                    ${time}
                </p>
            </div>
            <!-- 닫기 버튼 -->
            <button onclick="document.getElementById('fomo-toast')?.remove()"
                class="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors">
                <span class="material-symbols-outlined text-base">close</span>
            </button>
        `;

        document.body.appendChild(toast);

        // 슬라이드인: 약간의 지연 후 화면 안으로 이동
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.remove('-translate-x-[120%]', 'opacity-0');
                toast.classList.add('translate-x-0', 'opacity-100');
            });
        });

        // 3~5초 후 슬라이드아웃
        const displayTime = randomBetween(3000, 5000);
        setTimeout(() => {
            toast.classList.remove('translate-x-0', 'opacity-100');
            toast.classList.add('-translate-x-[120%]', 'opacity-0');

            // 애니메이션 끝나면 DOM에서 제거
            setTimeout(() => {
                toast.remove();
            }, 500);
        }, displayTime);
    }

    // --- 타이머 시작 ---
    // 페이지 로드 5초 후 첫 토스트, 이후 15~30초 랜덤 간격으로 반복
    function startFomoLoop() {
        // 첫 토스트: 5초 후
        setTimeout(() => {
            showToast();
            scheduleNext();
        }, 5000);
    }

    // 다음 토스트를 15~30초 랜덤 간격으로 예약
    function scheduleNext() {
        const delay = randomBetween(15000, 30000);
        setTimeout(() => {
            showToast();
            scheduleNext(); // 재귀적으로 계속 반복
        }, delay);
    }

    // --- 초기화 ---
    // DOM이 준비되면 자동으로 FOMO 루프 시작
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startFomoLoop);
    } else {
        startFomoLoop();
    }
})();
