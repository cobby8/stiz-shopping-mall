/**
 * STIZ 관리자 - 일정표 (캘린더) 페이지 JS
 * FullCalendar v6로 주문 납기일/접수일/출고일을 월별 캘린더에 표시
 *
 * 의존성:
 *   - FullCalendar v6 (index.global.min.js) — CDN으로 HTML에서 로드
 *   - admin-common.js — checkAdminAuth(), adminFetch() 등 공통 함수
 */

// ============================================================
// 전역 변수
// ============================================================

let calendar = null; // FullCalendar 인스턴스 — 나중에 refetch 등에 사용

// ============================================================
// 초기화 — 페이지 로드 시 실행
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 관리자 인증 확인 (미인증이면 로그인 페이지로 리다이렉트)
    checkAdminAuth();

    // 캘린더 생성
    initCalendar();

    // 필터 이벤트 바인딩 — 체크박스/드롭다운 변경 시 캘린더 새로고침
    bindFilterEvents();

    // 담당자 드롭다운 채우기 — 서버에서 주문 데이터의 담당자 목록 가져오기
    loadManagers();
});

// ============================================================
// FullCalendar 초기화
// 비유: 빈 벽 달력을 걸고, "이 API에서 포스트잇 데이터를 가져와라"고 알려주는 것
// ============================================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(calendarEl, {
        // --- 기본 설정 ---
        locale: 'ko',                    // 한국어 (월/요일 이름, 버튼 텍스트)
        initialView: 'dayGridMonth',     // 초기 뷰: 월간
        headerToolbar: {
            left: 'prev,next today',     // 좌측: 이전/다음/오늘 버튼
            center: 'title',             // 중앙: "2026년 4월" 같은 제목
            right: 'dayGridMonth,timeGridWeek' // 우측: 월간/주간 뷰 전환
        },
        buttonText: {
            today: '오늘',
            month: '월간',
            week: '주간'
        },
        height: 'auto',                  // 캘린더 높이를 내용에 맞게 자동 조절
        dayMaxEvents: 4,                 // 하루에 최대 4개 이벤트 표시, 초과 시 "+N more"
        navLinks: true,                  // 날짜 클릭 시 해당 일간 뷰로 이동

        // --- 이벤트 데이터 소스 ---
        // FullCalendar가 뷰 변경(월 이동 등) 시 자동으로 이 함수를 호출
        // fetchInfo에 start/end가 담겨있어서 서버에 해당 범위만 요청
        events: function(fetchInfo, successCallback, failureCallback) {
            fetchCalendarEvents(fetchInfo, successCallback, failureCallback);
        },

        // --- 이벤트 클릭: 주문 상세 페이지로 이동 ---
        eventClick: function(info) {
            const orderId = info.event.extendedProps.orderId;
            if (orderId) {
                // 새 탭이 아닌 같은 탭에서 이동 (관리자가 보통 단일 탭 사용)
                window.location.href = `admin-order.html?id=${orderId}`;
            }
        },

        // --- 이벤트 마우스 오버: 툴팁 표시 ---
        eventDidMount: function(info) {
            const props = info.event.extendedProps;
            const statusLabel = STATUS_LABELS[props.status] || props.status;
            let tooltipText = `${info.event.title}\n주문번호: ${props.orderNumber}\n상태: ${statusLabel}\n담당: ${props.manager}`;

            // 납기일 이벤트면 D-day 정보도 추가
            if (props.type === 'deadline' && props.dday !== undefined) {
                const ddayText = props.dday === 0 ? 'D-day'
                    : props.dday > 0 ? `D-${props.dday}`
                    : `D+${Math.abs(props.dday)} (초과)`;
                tooltipText += `\n납기: ${ddayText}`;
            }

            // 브라우저 기본 툴팁 사용 (별도 라이브러리 불필요)
            info.el.title = tooltipText;
        }
    });

    calendar.render();
}

// ============================================================
// API 호출 — 서버에서 캘린더 이벤트 가져오기
// FullCalendar가 뷰 변경 시 자동 호출하는 함수
// ============================================================
async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        // FullCalendar가 제공하는 start/end를 YYYY-MM-DD 형식으로 변환
        const start = fetchInfo.startStr.substring(0, 10);
        const end = fetchInfo.endStr.substring(0, 10);

        const response = await adminFetch(`/api/admin/calendar/events?start=${start}&end=${end}`);
        if (!response) return failureCallback(new Error('인증 실패'));

        const events = await response.json();

        // --- 프론트엔드 필터 적용 ---
        // 서버는 전체 이벤트를 보내고, 프론트에서 체크박스/드롭다운에 따라 걸러냄
        const filtered = applyFilters(events);

        successCallback(filtered);
    } catch (error) {
        console.error('[Calendar] 이벤트 로드 실패:', error);
        failureCallback(error);
    }
}

// ============================================================
// 필터 적용 — 체크박스/드롭다운 상태에 따라 이벤트 걸러내기
// 비유: 포스트잇 3종류(납기/접수/출고) 중 원하는 것만 벽에 붙이는 것
// ============================================================
function applyFilters(events) {
    // 이벤트 종류 체크박스 상태 확인
    const showDeadline = document.getElementById('filter-deadline').checked;
    const showReceipt = document.getElementById('filter-receipt').checked;
    const showRelease = document.getElementById('filter-release').checked;

    // 상태 필터: "진행중만" 선택 시 완료/취소 주문 제외
    const statusFilter = document.getElementById('filter-status').value;

    // 담당자 필터
    const managerFilter = document.getElementById('filter-manager').value;

    return events.filter(event => {
        const props = event.extendedProps;

        // 1) 이벤트 종류 필터
        if (props.type === 'deadline' && !showDeadline) return false;
        if (props.type === 'receipt' && !showReceipt) return false;
        if (props.type === 'release' && !showRelease) return false;

        // 2) 상태 필터: "진행중만"일 때 완료/취소 제외
        if (statusFilter === 'active') {
            if (props.status === 'delivered' || props.status === 'cancelled') return false;
        }

        // 3) 담당자 필터
        if (managerFilter && props.manager !== managerFilter) return false;

        return true;
    });
}

// ============================================================
// 필터 이벤트 바인딩 — 필터 변경 시 캘린더 데이터 새로고침
// ============================================================
function bindFilterEvents() {
    // 체크박스 3개 + 드롭다운 2개에 change 이벤트 연결
    const filterIds = ['filter-deadline', 'filter-receipt', 'filter-release', 'filter-status', 'filter-manager'];

    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                // refetchEvents()는 FullCalendar의 내장 메서드
                // events 함수를 다시 호출하여 데이터를 새로 가져오고 필터 적용
                calendar.refetchEvents();
            });
        }
    });
}

// ============================================================
// 담당자 목록 로드 — 드롭다운에 옵션 채우기
// 기존 주문 목록 API에서 담당자 정보를 가져옴
// ============================================================
async function loadManagers() {
    try {
        // 기존 stats API에 managerCounts가 포함되어 있음 (담당자별 주문 건수)
        // 비유: 주문 관리 페이지의 담당자 드롭다운과 동일한 데이터 소스 사용
        const response = await adminFetch('/api/admin/stats');
        if (!response) return;

        const data = await response.json();
        const select = document.getElementById('filter-manager');

        // managerCounts: { "김담당": 120, "박담당": 85, ... } 형태
        if (data.managerCounts) {
            // 건수 많은 순으로 정렬하여 옵션 추가
            const sorted = Object.entries(data.managerCounts)
                .sort((a, b) => b[1] - a[1]);

            sorted.forEach(([name, count]) => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = `${name} (${count}건)`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('[Calendar] 담당자 목록 로드 실패:', error);
    }
}
