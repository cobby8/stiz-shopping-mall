/**
 * STIZ 주문 추적 페이지 로직
 *
 * 비유: 택배 조회 시스템과 같다.
 * 주문번호를 입력하면 서버 API에서 현재 상태를 가져와
 * 4단계 프로그레스 바 + 상세 타임라인으로 보여준다.
 */

// 서버 API 주소 (auth.js의 API_BASE와 동일)
const TRACK_API_BASE = 'http://localhost:4000';

// 고객에게 보여줄 4단계 정의
// step 번호와 라벨, 아이콘을 매핑한다
const PROGRESS_STEPS = [
    { step: 1, label: '시안 진행', icon: 'palette' },
    { step: 2, label: '제작 진행', icon: 'precision_manufacturing' },
    { step: 3, label: '배송 준비', icon: 'inventory_2' },
    { step: 4, label: '배송 완료', icon: 'check_circle' }
];

// 상태 배지 색상 매핑 (4단계별 색상)
const STATUS_BADGE_COLORS = {
    1: 'bg-yellow-100 text-yellow-800',  // 시안 = 노랑
    2: 'bg-blue-100 text-blue-800',      // 제작 = 파랑
    3: 'bg-purple-100 text-purple-800',  // 배송준비 = 보라
    4: 'bg-green-100 text-green-800'     // 완료 = 초록
};

/**
 * 주문 조회 메인 함수
 * 입력된 주문번호로 서버 API를 호출하고 결과를 화면에 렌더링한다.
 */
async function trackOrder() {
    const input = document.getElementById('order-number-input');
    const orderNumber = input.value.trim();
    const errorEl = document.getElementById('search-error');
    const loadingEl = document.getElementById('loading');
    const resultEl = document.getElementById('result-area');
    const notFoundEl = document.getElementById('not-found');

    // 입력값 초기화
    errorEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    notFoundEl.classList.add('hidden');

    // 유효성 검사: 빈 값 방지
    if (!orderNumber) {
        errorEl.textContent = '주문번호를 입력해주세요.';
        errorEl.classList.remove('hidden');
        input.focus();
        return;
    }

    // 로딩 표시
    loadingEl.classList.remove('hidden');

    try {
        // 서버 API 호출: 비로그인 주문 추적 엔드포인트
        const response = await fetch(`${TRACK_API_BASE}/api/orders/track/${encodeURIComponent(orderNumber)}`);
        const data = await response.json();

        // 로딩 숨기기
        loadingEl.classList.add('hidden');

        if (!response.ok || !data.success) {
            // 주문을 찾지 못한 경우
            notFoundEl.classList.remove('hidden');
            return;
        }

        // 조회 성공: 결과 렌더링
        renderResult(data.order);
        resultEl.classList.remove('hidden');

    } catch (error) {
        // 네트워크 오류 등
        loadingEl.classList.add('hidden');
        errorEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
        errorEl.classList.remove('hidden');
        console.error('[OrderTrack] Error:', error);
    }
}

/**
 * 조회 결과를 화면에 렌더링하는 함수
 * @param {Object} order - 서버에서 받은 주문 정보
 */
function renderResult(order) {
    // 1) 주문 기본 정보 표시
    document.getElementById('result-order-number').textContent = `#${order.orderNumber}`;
    document.getElementById('result-team-name').textContent = order.teamName || order.customerName || '주문 정보';

    // 상태 배지 표시
    const badge = document.getElementById('result-status-badge');
    const currentStep = order.customerStatus?.step || 0;
    const badgeColor = STATUS_BADGE_COLORS[currentStep] || 'bg-gray-100 text-gray-800';
    badge.className = `inline-block px-3 py-1 text-xs font-bold rounded-full ${badgeColor}`;
    badge.textContent = order.customerStatus?.label || order.statusLabel || '확인중';

    // 주문 아이템 요약
    const itemsEl = document.getElementById('result-items');
    if (order.items && order.items.length > 0) {
        const itemTexts = order.items.map(item => {
            // 종목과 수량을 함께 표시
            const sport = item.sport ? `[${getSportLabel(item.sport)}] ` : '';
            return `${sport}${item.name} ${item.quantity ? `x${item.quantity}` : ''}`;
        });
        itemsEl.textContent = itemTexts.join(' / ');
    } else {
        itemsEl.textContent = '';
    }

    // 2) 프로그레스 바 렌더링
    renderProgressBar(currentStep);

    // 3) 타임라인 렌더링
    renderTimeline(order.history || []);

    // 4) 배송 정보 (송장번호가 있을 때만 표시)
    const shippingEl = document.getElementById('shipping-info');
    if (order.trackingNumber) {
        document.getElementById('result-carrier').textContent = order.carrier || '미정';
        document.getElementById('result-tracking').textContent = order.trackingNumber;

        // 배송추적 링크 생성 (CJ대한통운 기본, 택배사별 분기 가능)
        const trackingLink = document.getElementById('tracking-link');
        trackingLink.href = getTrackingUrl(order.carrier, order.trackingNumber);

        shippingEl.classList.remove('hidden');
    } else {
        shippingEl.classList.add('hidden');
    }

    // 5) 희망 납기일 표시
    const desiredDateEl = document.getElementById('desired-date-info');
    if (order.desiredDate) {
        document.getElementById('result-desired-date').textContent =
            new Date(order.desiredDate).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        desiredDateEl.classList.remove('hidden');
    } else {
        desiredDateEl.classList.add('hidden');
    }
}

/**
 * 4단계 프로그레스 바를 렌더링하는 함수
 * 비유: 지하철 노선도처럼 현재 어느 역에 있는지 보여준다.
 * @param {number} currentStep - 현재 단계 (1~4)
 */
function renderProgressBar(currentStep) {
    const container = document.getElementById('progress-bar');
    container.innerHTML = '';

    PROGRESS_STEPS.forEach(({ step, label, icon }) => {
        const div = document.createElement('div');
        div.className = 'progress-step';

        // 상태 판별: 완료 / 진행중 / 대기
        let state = 'waiting';
        if (step < currentStep) state = 'completed';
        else if (step === currentStep) state = 'active';

        // 상태에 따른 클래스 추가 (CSS에서 연결선 색상 결정)
        if (state === 'completed') div.classList.add('completed');
        if (state === 'active') div.classList.add('active');

        // 원형 아이콘 색상 결정
        let circleClass = 'bg-gray-200 text-gray-400';           // 대기: 회색
        if (state === 'completed') circleClass = 'bg-black text-white';  // 완료: 검정
        if (state === 'active') circleClass = 'bg-black text-white ring-4 ring-gray-200'; // 진행중: 검정 + 링

        div.innerHTML = `
            <div class="step-circle ${circleClass}">
                <span class="material-symbols-outlined" style="font-size: 20px;">${icon}</span>
            </div>
            <p class="text-xs mt-2 font-medium ${state === 'waiting' ? 'text-gray-400' : 'text-gray-900'}">${label}</p>
            <p class="text-[10px] mt-0.5 ${state === 'active' ? 'text-brand-red font-bold' : 'text-gray-400'}">
                ${state === 'completed' ? '완료' : state === 'active' ? '진행중' : ''}
            </p>
        `;

        container.appendChild(div);
    });
}

/**
 * 상태 변경 이력을 타임라인으로 렌더링하는 함수
 * 비유: 병원 진료 기록처럼 언제 무슨 일이 있었는지 시간순으로 보여준다.
 * @param {Array} history - 상태 변경 이력 배열
 */
function renderTimeline(history) {
    const container = document.getElementById('timeline');
    container.innerHTML = '';

    // 이력이 없으면 안내 메시지 표시
    if (history.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">아직 상세 이력이 없습니다.</p>';
        return;
    }

    history.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'timeline-item pb-4';

        // 날짜를 읽기 좋은 형식으로 변환
        const date = new Date(item.date);
        const dateStr = date.toLocaleDateString('ko-KR', {
            month: '2-digit', day: '2-digit'
        });
        const timeStr = date.toLocaleTimeString('ko-KR', {
            hour: '2-digit', minute: '2-digit'
        });

        div.innerHTML = `
            <div class="timeline-dot"></div>
            <div>
                <p class="text-sm font-bold">${item.status}</p>
                ${item.memo ? `<p class="text-xs text-gray-500 mt-0.5">${item.memo}</p>` : ''}
                <p class="text-xs text-gray-400 mt-1">${dateStr} ${timeStr}</p>
            </div>
        `;

        container.appendChild(div);
    });
}

/**
 * 종목 코드를 한글 라벨로 변환
 * @param {string} sport - 종목 코드 (basketball, soccer 등)
 * @returns {string} 한글 라벨
 */
function getSportLabel(sport) {
    const labels = {
        basketball: '농구',
        soccer: '축구',
        volleyball: '배구',
        baseball: '야구'
    };
    return labels[sport] || sport;
}

/**
 * 택배사별 배송추적 URL을 생성하는 함수
 * @param {string} carrier - 택배사명
 * @param {string} trackingNumber - 송장번호
 * @returns {string} 배송추적 URL
 */
function getTrackingUrl(carrier, trackingNumber) {
    // 주요 택배사별 추적 URL 매핑
    const urls = {
        'CJ대한통운': `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${trackingNumber}`,
        '한진택배': `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mession=&wblnum=${trackingNumber}`,
        '롯데택배': `https://www.lotteglogis.com/home/reservation/tracking/index?InvNo=${trackingNumber}`,
        '우체국': `https://service.epost.go.kr/trace.RetrieveDomRi498.comm?sid1=${trackingNumber}`,
        '로젠택배': `https://www.ilogen.com/web/personal/trace/${trackingNumber}`
    };
    return urls[carrier] || `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${trackingNumber}`;
}

/**
 * 페이지 초기화
 * - URL 파라미터에 주문번호가 있으면 자동 조회
 *   (myshop.html에서 "주문 추적" 버튼 클릭 시 사용)
 * - Enter 키로도 조회 가능
 */
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('order-number-input');

    // URL 파라미터에서 주문번호 추출: ?orderNumber=ORD-20260326-001
    const params = new URLSearchParams(window.location.search);
    const orderNumber = params.get('orderNumber');

    if (orderNumber) {
        // 자동 조회: myshop에서 넘어온 경우
        input.value = orderNumber;
        trackOrder();
    }

    // Enter 키로 조회
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            trackOrder();
        }
    });
});
