/**
 * STIZ 관리자 — 챗봇 "티즈" FAQ 관리 (Phase 3B)
 *
 * 왜 이런 구조인가:
 *  - 바닐라 JS 단일 파일 (프레임워크 금지, admin-common.js의 adminFetch/escapeHtml/checkAdminAuth 재사용)
 *  - 이벤트 위임으로 tbody 한 곳에만 click 리스너 → 행 재렌더 시 리스너 누수 없음
 *  - 전역 state 하나로 목록/필터 상태 관리 → 렌더와 API 호출 분리
 *
 * 백엔드 (Phase 3A — routes/knowledge.js):
 *   GET    /api/admin/knowledge/faq             (?intent&needsReview&q)
 *   POST   /api/admin/knowledge/faq             (body: {intent,priority,keywords,questions,answer,source,needsReview})
 *   PUT    /api/admin/knowledge/faq/:id
 *   DELETE /api/admin/knowledge/faq/:id
 *   POST   /api/admin/knowledge/rebuild         (body: {target:'products'})
 */

// ============================================================
// 상수
// ============================================================

// 서버 검증 한도와 1:1 일치 (routes/knowledge.js L52~53)
const MAX_ANSWER_LEN = 2000;
const MAX_KEYWORDS = 20;

// intent 한글 라벨 (배지/드롭다운 공용)
const INTENT_LABELS = {
    custom: '제작문의',
    product: '상품문의',
    shipping: '배송',
    refund: '환불/교환',
    payment: '결제',
    company: '회사소개',
    member: '회원',
    coupon: '쿠폰'
};

// priority 한글 라벨
const PRIORITY_LABELS = {
    high: 'high',
    medium: 'medium',
    low: 'low'
};

// ============================================================
// 전역 상태
// ============================================================

// 왜 전역 state를 쓰는가:
// 서버 응답 원본을 한 곳에 두고, 수정 모달에서 id 조회 시 재호출 없이 읽기 위함
const state = {
    items: [],            // 서버가 반환한 현재 필터 적용된 FAQ 목록
    byIntent: {},         // intent별 개수 집계 (통계 표시용)
    version: 'unknown',   // faq.json version 필드
    filter: {
        intent: '',       // 빈 문자열 = 전체
        needsReview: false,
        q: ''
    }
};

// ============================================================
// 부팅
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 인증 체크 — 실패 시 admin-common.js가 자동 리다이렉트
    checkAdminAuth();

    // 이벤트 바인딩 먼저 걸고, 데이터 로드
    bindEvents();
    await loadFaqs();
});

// ============================================================
// API 호출 — 모두 adminFetch 사용 (JWT 자동 첨부 + 401/403 처리)
// ============================================================

/**
 * FAQ 목록 조회 + 필터 쿼리스트링 구성
 * 비유: "배송 관련 검수대기 FAQ만 보여줘" 같은 요청을 URL로 만들어 서버에 전달
 */
async function fetchFaqs() {
    // 필터 쿼리스트링 구성 — 값이 있을 때만 추가
    const params = new URLSearchParams();
    if (state.filter.intent) params.set('intent', state.filter.intent);
    if (state.filter.needsReview) params.set('needsReview', 'true');
    if (state.filter.q) params.set('q', state.filter.q);

    const qs = params.toString();
    const url = '/api/admin/knowledge/faq' + (qs ? '?' + qs : '');

    const res = await adminFetch(url);
    if (!res) return null; // 401/403 리다이렉트됨
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'FAQ 목록 조회 실패');
    return data;
}

async function createFaq(payload) {
    const res = await adminFetch('/api/admin/knowledge/faq', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    if (!res) return null;
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'FAQ 추가 실패');
    return data;
}

async function updateFaq(id, payload) {
    const res = await adminFetch('/api/admin/knowledge/faq/' + encodeURIComponent(id), {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
    if (!res) return null;
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'FAQ 수정 실패');
    return data;
}

async function deleteFaq(id) {
    const res = await adminFetch('/api/admin/knowledge/faq/' + encodeURIComponent(id), {
        method: 'DELETE'
    });
    if (!res) return null;
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'FAQ 삭제 실패');
    return data;
}

async function rebuildKnowledge() {
    const res = await adminFetch('/api/admin/knowledge/rebuild', {
        method: 'POST',
        body: JSON.stringify({ target: 'products' })
    });
    if (!res) return null;
    // 재빌드는 성공/실패 모두 바디가 필요하므로 throw 안 하고 그대로 반환
    return await res.json();
}

// ============================================================
// 목록 로드 + 렌더
// ============================================================

async function loadFaqs() {
    try {
        const data = await fetchFaqs();
        if (!data) return; // 인증 실패로 리다이렉트됨

        state.items = Array.isArray(data.items) ? data.items : [];
        state.byIntent = data.byIntent || {};
        state.version = data.version || 'unknown';

        renderTable();
        renderStats();
    } catch (e) {
        console.error('[loadFaqs] 오류:', e);
        const tbody = document.getElementById('faq-tbody');
        // 에러 상태를 테이블에 직접 표시 — alert 남발 방지
        tbody.innerHTML = `
            <tr><td colspan="6" class="px-4 py-8 text-center text-sm text-red-600">
                <span class="material-symbols-outlined align-middle text-base">error</span>
                FAQ 목록을 불러올 수 없습니다: ${escapeHtml(e.message)}
            </td></tr>`;
    }
}

/**
 * 테이블 행 렌더
 * 보안: 모든 사용자 입력은 escapeHtml() 통과시켜 XSS 차단
 */
function renderTable() {
    const tbody = document.getElementById('faq-tbody');
    const items = state.items;

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="px-4 py-12 text-center text-sm text-gray-500">
                <span class="material-symbols-outlined text-4xl text-gray-300 block mb-2">inbox</span>
                조건에 맞는 FAQ가 없습니다.
            </td></tr>`;
        return;
    }

    // 각 행은 data-id 속성으로 식별 — 이벤트 위임에서 사용
    const rows = items.map(item => {
        const id = item.id || '-';
        const intent = item.intent || 'unknown';
        const priority = item.priority || 'medium';
        const firstQuestion = Array.isArray(item.questions) && item.questions.length > 0
            ? item.questions[0]
            : '(질문 없음)';
        const extraQuestionCount = Array.isArray(item.questions) ? Math.max(0, item.questions.length - 1) : 0;
        const reviewBadge = item.needsReview
            ? '<span class="badge-review">검수 대기</span>'
            : '<span class="text-gray-300 text-xs">-</span>';

        return `
            <tr class="faq-row border-b border-gray-100" data-id="${escapeHtml(id)}">
                <td class="px-4 py-3 font-mono text-xs text-gray-600">${escapeHtml(id)}</td>
                <td class="px-4 py-3">
                    <span class="badge-intent badge-${escapeHtml(intent)}">${escapeHtml(INTENT_LABELS[intent] || intent)}</span>
                </td>
                <td class="px-4 py-3">
                    <div class="text-gray-900">${escapeHtml(firstQuestion)}</div>
                    ${extraQuestionCount > 0
                        ? `<div class="text-xs text-gray-400 mt-0.5">+${extraQuestionCount}개 유사질문</div>`
                        : ''}
                </td>
                <td class="px-4 py-3">
                    <span class="badge-priority badge-priority-${escapeHtml(priority)}">${escapeHtml(PRIORITY_LABELS[priority] || priority)}</span>
                </td>
                <td class="px-4 py-3 text-center">${reviewBadge}</td>
                <td class="px-4 py-3 text-center">
                    <button type="button" data-action="edit" data-id="${escapeHtml(id)}"
                        class="text-gray-500 hover:text-brand-red transition-colors px-1.5 py-1 rounded" title="수정 및 답변 확인">
                        <span class="material-symbols-outlined text-base align-middle">edit</span>
                    </button>
                    <button type="button" data-action="delete" data-id="${escapeHtml(id)}"
                        class="text-gray-500 hover:text-red-600 transition-colors px-1.5 py-1 rounded ml-1" title="삭제">
                        <span class="material-symbols-outlined text-base align-middle">delete</span>
                    </button>
                </td>
            </tr>`;
    });

    tbody.innerHTML = rows.join('');
}

/**
 * 통계 바 렌더
 * 왜 state.items를 직접 세는가: 서버가 반환한 필터링된 totalCount가 이미 들어있음.
 * needsReview 카운트는 필터 결과 기준으로 계산.
 *
 * 2026-04-24 add-only 확장:
 *  - 기존 "총/검수대기/버전" 한 줄은 그대로 유지
 *  - 아래에 intent별 chip 한 줄 추가 (서버 byIntent 집계를 UI에 노출)
 *  - chip은 버튼으로 만들어 클릭 시 해당 intent로 필터링 (filter-intent select value 변경 → change 이벤트 발화)
 *  - 기존 INTENT_LABELS(한글 매핑) + .badge-intent/.badge-{intent} CSS 재사용 → 색상 하드코딩 없음
 */
function renderStats() {
    const total = state.items.length;
    const needsReview = state.items.filter(it => it.needsReview).length;
    const filterLabel = state.filter.intent
        ? ` · intent=${state.filter.intent}`
        : '';

    const statsEl = document.getElementById('faq-stats');

    // 기존 통계 한 줄 — 값은 모두 숫자/상수이므로 XSS 위험 없음
    const summaryLine = `
        <div class="flex flex-wrap items-center gap-x-1">
            <span class="text-gray-900 font-semibold">총 ${total}개</span>
            <span class="text-gray-400 mx-2">|</span>
            <span>검수대기 <span class="text-amber-600 font-semibold">${needsReview}개</span></span>
            <span class="text-gray-400 mx-2">|</span>
            <span class="text-gray-500 text-xs">버전 ${escapeHtml(state.version)}${escapeHtml(filterLabel)}</span>
        </div>
    `;

    // intent chips — state.byIntent 객체를 순회
    // 왜 INTENT_LABELS 순서대로 도는가: 드롭다운과 동일한 순서로 노출해 일관성 유지
    // (byIntent에 없는 intent는 0건으로 표시하지 않고 skip — 서버가 내려준 것만)
    const currentIntent = state.filter.intent;
    const chipEntries = Object.keys(INTENT_LABELS)
        .filter(key => state.byIntent && typeof state.byIntent[key] === 'number' && state.byIntent[key] > 0)
        .map(key => {
            const label = INTENT_LABELS[key] || key;
            const count = state.byIntent[key];
            const isActive = currentIntent === key;
            // 활성 chip은 ring 강조 — 색상 하드코딩 금지, Tailwind 유틸만 사용
            const activeClass = isActive ? ' ring-2 ring-brand-red ring-offset-1' : '';
            // escapeHtml은 key/label 모두 안전하게 이스케이프 (INTENT_LABELS는 상수지만 방어적으로)
            return `
                <button type="button"
                    data-intent-chip="${escapeHtml(key)}"
                    aria-label="${escapeHtml(label)} intent로 필터링 (${count}건)"
                    aria-pressed="${isActive ? 'true' : 'false'}"
                    class="badge-intent badge-${escapeHtml(key)} cursor-pointer hover:opacity-80 transition-opacity${activeClass}"
                    style="padding: 3px 10px;">
                    ${escapeHtml(label)} ${count}
                </button>
            `;
        });

    // 전체(필터 해제) chip — 현재 intent 필터가 걸린 경우에만 노출
    const clearChip = currentIntent
        ? `
            <button type="button"
                data-intent-chip=""
                aria-label="intent 필터 해제"
                class="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                <span class="material-symbols-outlined" style="font-size:14px;">close</span>
                전체
            </button>
        `
        : '';

    const chipsLine = chipEntries.length > 0
        ? `<div class="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">${clearChip}${chipEntries.join('')}</div>`
        : '';

    statsEl.innerHTML = summaryLine + chipsLine;

    // chip 클릭 이벤트 — 기존 filter-intent select 값만 바꾸고 change 이벤트 발화
    // 이렇게 하면 bindEvents()의 기존 change 핸들러가 loadFaqs()를 호출 → 코드 중복 0
    statsEl.querySelectorAll('[data-intent-chip]').forEach(btn => {
        btn.addEventListener('click', () => {
            const intent = btn.getAttribute('data-intent-chip') || '';
            const select = document.getElementById('filter-intent');
            if (!select) return;
            select.value = intent;
            // dispatchEvent로 기존 change 핸들러 재사용
            select.dispatchEvent(new Event('change'));
        });
    });
}

// ============================================================
// 모달 — FAQ 추가/수정
// ============================================================

/**
 * 새 FAQ 추가 모달 열기 — 폼 초기화
 */
function openCreateModal() {
    document.getElementById('faq-modal-title').textContent = '새 FAQ';
    document.getElementById('form-id').value = '';
    document.getElementById('form-intent').value = 'custom';
    document.getElementById('form-priority').value = 'medium';
    document.getElementById('form-keywords').value = '';
    document.getElementById('form-questions').value = '';
    document.getElementById('form-answer').value = '';
    document.getElementById('form-source').value = '';
    document.getElementById('form-needs-review').checked = false;
    hideFormError();
    updateHints();

    document.getElementById('faq-modal').classList.remove('hidden');
    // 약간의 지연 후 첫 필드에 포커스 — 모달 fadeInUp 애니메이션 방해 방지
    setTimeout(() => document.getElementById('form-intent').focus(), 50);
}

/**
 * 수정 모달 열기 — state.items에서 id로 찾아 폼에 채움
 * 서버 재호출 없이 메모리의 데이터 사용 (목록과 동일 시점의 스냅샷)
 */
function openEditModal(id) {
    const item = state.items.find(it => it.id === id);
    if (!item) {
        alert('해당 FAQ를 찾을 수 없습니다. 목록을 새로고침합니다.');
        loadFaqs();
        return;
    }

    document.getElementById('faq-modal-title').textContent = 'FAQ 수정 — ' + item.id;
    document.getElementById('form-id').value = item.id;
    document.getElementById('form-intent').value = item.intent || 'custom';
    document.getElementById('form-priority').value = item.priority || 'medium';
    document.getElementById('form-keywords').value = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
    document.getElementById('form-questions').value = Array.isArray(item.questions) ? item.questions.join('\n') : '';
    document.getElementById('form-answer').value = item.answer || '';
    document.getElementById('form-source').value = item.source || '';
    document.getElementById('form-needs-review').checked = !!item.needsReview;
    hideFormError();
    updateHints();

    document.getElementById('faq-modal').classList.remove('hidden');
}

function closeFaqModal() {
    document.getElementById('faq-modal').classList.add('hidden');
}

function showFormError(msg) {
    const el = document.getElementById('form-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}
function hideFormError() {
    const el = document.getElementById('form-error');
    el.textContent = '';
    el.classList.add('hidden');
}

/**
 * 폼 submit 처리 — create/update 분기
 * 왜 파싱을 클라에서 하는가: 서버도 검증하지만, 사용자가 빠른 피드백을 받도록 먼저 체크
 */
async function submitForm(e) {
    e.preventDefault();
    hideFormError();

    const id = document.getElementById('form-id').value.trim();
    const intent = document.getElementById('form-intent').value;
    const priority = document.getElementById('form-priority').value;
    const keywordsRaw = document.getElementById('form-keywords').value;
    const questionsRaw = document.getElementById('form-questions').value;
    const answer = document.getElementById('form-answer').value;
    const source = document.getElementById('form-source').value.trim();
    const needsReview = document.getElementById('form-needs-review').checked;

    // keywords: 쉼표 → 배열 + trim + 빈 항목 제거
    const keywords = keywordsRaw
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);

    // questions: 줄바꿈 → 배열 + trim + 빈 항목 제거
    const questions = questionsRaw
        .split('\n')
        .map(q => q.trim())
        .filter(Boolean);

    // 클라이언트 선검증 (서버 검증과 동일 규칙)
    if (!intent) return showFormError('Intent를 선택해주세요.');
    if (!priority) return showFormError('Priority를 선택해주세요.');
    if (questions.length === 0) return showFormError('Questions에 최소 1개를 입력해주세요.');
    if (!answer.trim()) return showFormError('Answer를 입력해주세요.');
    if (answer.length > MAX_ANSWER_LEN) return showFormError(`Answer는 최대 ${MAX_ANSWER_LEN}자까지 허용됩니다. (현재 ${answer.length}자)`);
    if (keywords.length > MAX_KEYWORDS) return showFormError(`Keywords는 최대 ${MAX_KEYWORDS}개까지 허용됩니다.`);

    const payload = {
        intent,
        priority,
        keywords,
        questions,
        answer: answer.trim(),
        source,
        needsReview
    };

    // 버튼 disabled 처리
    const btn = document.getElementById('btn-form-submit');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
        if (id) {
            // 수정 모드
            await updateFaq(id, payload);
        } else {
            // 신규 모드 — 서버가 id 자동 생성
            await createFaq(payload);
        }
        closeFaqModal();
        await loadFaqs(); // 목록 재조회
    } catch (e) {
        console.error('[submitForm] 오류:', e);
        showFormError(e.message || '저장 중 오류가 발생했습니다.');
    } finally {
        btn.disabled = false;
        btn.textContent = '저장';
    }
}

// ============================================================
// 삭제 (2단계 확인)
// ============================================================

async function onDeleteClick(id) {
    // 1차 확인 — 상세 안내
    if (!confirm(`FAQ "${id}"를 삭제합니다.\n\n⚠️ 이 작업은 되돌릴 수 없습니다.\n챗봇 응답에서 즉시 제외됩니다.\n\n계속하시겠습니까?`)) {
        return;
    }
    // 2차 확인 — 실수 방지
    if (!confirm('정말 삭제하시겠습니까?')) {
        return;
    }

    try {
        await deleteFaq(id);
        await loadFaqs();
    } catch (e) {
        console.error('[deleteFaq] 오류:', e);
        alert('삭제 실패: ' + (e.message || '알 수 없는 오류'));
    }
}

// ============================================================
// 재빌드 (K2 products.json)
// ============================================================

function openRebuildModal(state) {
    const modal = document.getElementById('rebuild-modal');
    const statusEl = document.getElementById('rebuild-status');
    const logSection = document.getElementById('rebuild-log-section');
    const actions = document.getElementById('rebuild-actions');
    const closeBtn = document.getElementById('btn-rebuild-close');

    // 기본: 진행중 상태
    if (state === 'running') {
        statusEl.innerHTML = `
            <div class="flex items-center gap-3 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <span class="spinner" style="border-color: #2563eb; border-top-color: transparent;"></span>
                <span>재빌드 진행 중... (보통 1~3초 소요)</span>
            </div>`;
        logSection.classList.add('hidden');
        actions.classList.add('hidden');
        closeBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

function closeRebuildModal() {
    document.getElementById('rebuild-modal').classList.add('hidden');
}

async function onRebuildClick() {
    if (!confirm('챗봇의 상품 지식(K2)을 재빌드합니다.\n\n• 상품 DB의 373개 항목을 다시 분석합니다.\n• 통상 1~3초 소요되며, 완료 후 즉시 챗봇에 반영됩니다.\n\n진행하시겠습니까?')) {
        return;
    }

    const btnRebuild = document.getElementById('btn-rebuild');
    btnRebuild.disabled = true;
    btnRebuild.classList.add('opacity-60', 'cursor-not-allowed');

    openRebuildModal('running');

    try {
        const result = await rebuildKnowledge();
        if (!result) return; // 401/403

        const statusEl = document.getElementById('rebuild-status');
        const logSection = document.getElementById('rebuild-log-section');
        const logEl = document.getElementById('rebuild-log');
        const actions = document.getElementById('rebuild-actions');
        const closeBtn = document.getElementById('btn-rebuild-close');

        // 로그 표시 (stdout + stderr)
        const logText = [
            result.stdout ? '[stdout]\n' + result.stdout : '',
            result.stderr ? '\n[stderr]\n' + result.stderr : ''
        ].filter(Boolean).join('\n').trim();
        logEl.textContent = logText || '(로그 없음)';
        logSection.classList.remove('hidden');
        actions.classList.remove('hidden');
        closeBtn.classList.remove('hidden');

        if (result.success) {
            const duration = result.durationMs ? `${result.durationMs}ms` : '';
            const count = result.info?.productsCount ? `${result.info.productsCount}개 상품` : '';
            const detail = [duration, count].filter(Boolean).join(' · ');
            statusEl.innerHTML = `
                <div class="flex items-start gap-3 text-sm text-gray-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <span class="material-symbols-outlined text-green-600">check_circle</span>
                    <div>
                        <div class="font-semibold text-green-700">재빌드 완료</div>
                        <div class="text-xs text-gray-600 mt-0.5">${escapeHtml(detail)}</div>
                    </div>
                </div>`;
        } else {
            statusEl.innerHTML = `
                <div class="flex items-start gap-3 text-sm text-gray-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <span class="material-symbols-outlined text-red-600">error</span>
                    <div>
                        <div class="font-semibold text-red-700">재빌드 실패</div>
                        <div class="text-xs text-gray-700 mt-0.5">${escapeHtml(result.error || '알 수 없는 오류')}</div>
                    </div>
                </div>`;
        }
    } catch (e) {
        console.error('[rebuild] 오류:', e);
        const statusEl = document.getElementById('rebuild-status');
        const actions = document.getElementById('rebuild-actions');
        const closeBtn = document.getElementById('btn-rebuild-close');
        statusEl.innerHTML = `
            <div class="flex items-start gap-3 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <span class="material-symbols-outlined text-red-600">error</span>
                <div>
                    <div class="font-semibold text-red-700">재빌드 요청 실패</div>
                    <div class="text-xs text-gray-700 mt-0.5">${escapeHtml(e.message || String(e))}</div>
                </div>
            </div>`;
        actions.classList.remove('hidden');
        closeBtn.classList.remove('hidden');
    } finally {
        btnRebuild.disabled = false;
        btnRebuild.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

// ============================================================
// 폼 힌트 업데이트 (문자수/개수 표시)
// ============================================================

function updateHints() {
    // keywords 개수 표시
    const kwRaw = document.getElementById('form-keywords').value;
    const kwCount = kwRaw.split(',').map(s => s.trim()).filter(Boolean).length;
    const kwHint = document.getElementById('keywords-hint');
    kwHint.textContent = `키워드 ${kwCount}개${kwCount > MAX_KEYWORDS ? ' (상한 초과!)' : ''}`;
    kwHint.className = 'text-xs mt-1 ' + (kwCount > MAX_KEYWORDS ? 'text-red-600 font-semibold' : 'text-gray-500');

    // questions 개수 표시
    const qRaw = document.getElementById('form-questions').value;
    const qCount = qRaw.split('\n').map(s => s.trim()).filter(Boolean).length;
    const qHint = document.getElementById('questions-hint');
    qHint.textContent = `질문 ${qCount}개${qCount === 0 ? ' (최소 1개 필요)' : ''}`;
    qHint.className = 'text-xs mt-1 ' + (qCount === 0 ? 'text-red-600' : 'text-gray-500');

    // answer 문자수 표시
    const aLen = document.getElementById('form-answer').value.length;
    const aHint = document.getElementById('answer-hint');
    aHint.textContent = `${aLen} / ${MAX_ANSWER_LEN}자`;
    aHint.className = 'text-xs mt-1 ' + (aLen > MAX_ANSWER_LEN ? 'text-red-600 font-semibold' : 'text-gray-500');
}

// ============================================================
// 유틸: debounce (검색 input용)
// ============================================================

/**
 * debounce — 연속 호출 시 마지막 호출 기준 delay ms 후 1번만 실행
 * 왜 필요한가: 사용자가 타이핑할 때마다 API를 호출하면 낭비 → 300ms 멈춤 뒤에만 호출
 */
function debounce(fn, delay) {
    let timerId = null;
    return function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ============================================================
// 이벤트 바인딩 (한 곳에 모아둠)
// ============================================================

function bindEvents() {
    // 필터: intent 드롭다운
    document.getElementById('filter-intent').addEventListener('change', async (e) => {
        state.filter.intent = e.target.value;
        await loadFaqs();
    });

    // 필터: 검수대기 토글
    document.getElementById('filter-review').addEventListener('change', async (e) => {
        state.filter.needsReview = e.target.checked;
        await loadFaqs();
    });

    // 필터: 검색 input (300ms debounce)
    document.getElementById('filter-q').addEventListener('input', debounce(async (e) => {
        state.filter.q = e.target.value.trim();
        await loadFaqs();
    }, 300));

    // 새 FAQ 추가 버튼
    document.getElementById('btn-create').addEventListener('click', openCreateModal);

    // 재빌드 버튼
    document.getElementById('btn-rebuild').addEventListener('click', onRebuildClick);

    // 폼 submit
    document.getElementById('faq-form').addEventListener('submit', submitForm);

    // 폼 취소/닫기 버튼들
    document.getElementById('btn-form-cancel').addEventListener('click', closeFaqModal);
    document.getElementById('btn-modal-close').addEventListener('click', closeFaqModal);

    // 폼 입력 시 힌트 업데이트
    ['form-keywords', 'form-questions', 'form-answer'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateHints);
    });

    // tbody 이벤트 위임 (edit/delete 버튼)
    document.getElementById('faq-tbody').addEventListener('click', (e) => {
        // 가장 가까운 data-action 버튼 찾기 (아이콘 span 클릭도 처리)
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if (!id) return;

        if (action === 'edit') {
            openEditModal(id);
        } else if (action === 'delete') {
            onDeleteClick(id);
        }
    });

    // 재빌드 결과 모달 — 확인 버튼
    document.getElementById('btn-rebuild-done').addEventListener('click', closeRebuildModal);
    document.getElementById('btn-rebuild-close').addEventListener('click', closeRebuildModal);

    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const faqModal = document.getElementById('faq-modal');
        const rebuildModal = document.getElementById('rebuild-modal');
        // 재빌드 진행 중에는 ESC로 닫지 못하게 (close 버튼이 hidden인 상태)
        if (!faqModal.classList.contains('hidden')) {
            closeFaqModal();
        } else if (!rebuildModal.classList.contains('hidden') &&
                   !document.getElementById('btn-rebuild-close').classList.contains('hidden')) {
            closeRebuildModal();
        }
    });

    // 모달 바깥 클릭 시 닫기 (FAQ 모달만 — 재빌드 모달은 진행중 오작동 방지)
    document.getElementById('faq-modal').addEventListener('click', (e) => {
        // 모달 바깥(overlay) 클릭만 감지
        if (e.target.id === 'faq-modal') closeFaqModal();
    });
}
