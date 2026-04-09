/**
 * STIZ 관리자 설정 페이지 JS (admin-settings.js)
 * 관리자 계정 CRUD (목록 조회, 추가, 수정, 비밀번호 변경, 삭제)
 *
 * 의존성: admin-common.js (checkAdminAuth, adminFetch, escapeHtml 등)
 */

// ============================================================
// 초기화
// ============================================================

// 페이지 로드 시 인증 확인 + 계정 목록 로드
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth(); // 관리자 인증 확인 (admin-common.js)
    loadUsers();      // 계정 목록 불러오기
});

// 현재 로그인한 관리자의 ID (자기 자신 판별용)
function getCurrentUserId() {
    const payload = getAdminPayload();
    return payload ? payload.id : null;
}

// ============================================================
// 계정 목록 조회 및 렌더링
// ============================================================

// 권한 범위를 읽기 쉬운 한글 배지로 변환
const SCOPE_LABELS = {
    all: '전체',
    design: '디자인',
    cs: 'CS',
    production: '제작',
    shipping: '출고'
};

async function loadUsers() {
    const tbody = document.getElementById('users-table-body');

    const response = await adminFetch('/api/auth/admin/users');
    if (!response) return; // 인증 실패 시 adminFetch가 리다이렉트 처리

    const data = await response.json();
    if (!data.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-gray-400">목록을 불러올 수 없습니다.</td></tr>';
        return;
    }

    const users = data.users;
    const myId = getCurrentUserId();

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-gray-400">등록된 관리자가 없습니다.</td></tr>';
        return;
    }

    // 테이블 행 렌더링
    tbody.innerHTML = users.map(user => {
        // scopes 파싱: 쉼표 구분 문자열 → 배지 배열
        const scopes = (user.scopes || 'all').split(',').map(s => s.trim()).filter(Boolean);
        const scopeBadges = scopes.map(s =>
            `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">${escapeHtml(SCOPE_LABELS[s] || s)}</span>`
        ).join(' ');

        // 역할 배지
        const roleBadge = user.role === 'admin'
            ? '<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold role-badge-admin">관리자</span>'
            : '<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold role-badge-staff">직원</span>';

        // 생성일 포맷
        const created = user.joinedAt ? formatDate(user.joinedAt) : '-';

        // 자기 자신 여부 표시
        const isSelf = user.id === myId;
        const selfBadge = isSelf ? ' <span class="text-xs text-blue-500 font-medium">(나)</span>' : '';

        // 관리 버튼: 수정, 비번변경, 삭제 (자기 자신은 삭제 불가)
        const actions = `
            <div class="flex items-center justify-center gap-1">
                <button onclick="openEditModal(${user.id})" title="수정" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors">
                    <span class="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onclick="openPasswordModal(${user.id}, '${escapeHtml(user.email)}', ${isSelf})" title="비밀번호 변경" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-amber-600 transition-colors">
                    <span class="material-symbols-outlined text-lg">key</span>
                </button>
                ${isSelf ? '' : `
                <button onclick="deleteUser(${user.id}, '${escapeHtml(user.name)}')" title="삭제" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-red-600 transition-colors">
                    <span class="material-symbols-outlined text-lg">delete</span>
                </button>`}
            </div>
        `;

        return `
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="py-3 font-medium text-gray-900">${escapeHtml(user.name)}${selfBadge}</td>
                <td class="py-3 text-gray-600">${escapeHtml(user.email)}</td>
                <td class="py-3">${roleBadge}</td>
                <td class="py-3">${scopeBadges}</td>
                <td class="py-3 text-gray-500">${created}</td>
                <td class="py-3">${actions}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// 계정 추가 모달
// ============================================================

function openAddModal() {
    // 폼 초기화
    document.getElementById('form-user-id').value = '';
    document.getElementById('form-name').value = '';
    document.getElementById('form-email').value = '';
    document.getElementById('form-password').value = '';
    document.getElementById('modal-title').textContent = '계정 추가';

    // 비밀번호 필드 표시 (추가 모드)
    document.getElementById('password-section').classList.remove('hidden');
    document.getElementById('form-password').required = true;

    // 권한 초기화: "전체" 체크
    document.getElementById('scope-all').checked = true;
    document.querySelectorAll('.scope-item').forEach(cb => { cb.checked = false; cb.disabled = true; });

    openModal('modal-user');
}

// ============================================================
// 계정 수정 모달
// ============================================================

async function openEditModal(userId) {
    // 목록에서 해당 유저 정보를 다시 가져옴
    const response = await adminFetch('/api/auth/admin/users');
    if (!response) return;
    const data = await response.json();
    const user = data.users.find(u => u.id === userId);
    if (!user) {
        alert('사용자를 찾을 수 없습니다.');
        return;
    }

    // 폼에 기존 값 채우기
    document.getElementById('form-user-id').value = user.id;
    document.getElementById('form-name').value = user.name || '';
    document.getElementById('form-email').value = user.email || '';
    document.getElementById('modal-title').textContent = '계정 수정';

    // 비밀번호 필드 숨기기 (수정 모드에서는 별도 API 사용)
    document.getElementById('password-section').classList.add('hidden');
    document.getElementById('form-password').required = false;

    // 권한 범위 체크박스 설정
    const scopes = (user.scopes || 'all').split(',').map(s => s.trim()).filter(Boolean);
    const scopeAllCb = document.getElementById('scope-all');
    const scopeItems = document.querySelectorAll('.scope-item');

    if (scopes.includes('all')) {
        scopeAllCb.checked = true;
        scopeItems.forEach(cb => { cb.checked = false; cb.disabled = true; });
    } else {
        scopeAllCb.checked = false;
        scopeItems.forEach(cb => {
            cb.disabled = false;
            cb.checked = scopes.includes(cb.value);
        });
    }

    openModal('modal-user');
}

// ============================================================
// 계정 저장 (추가 / 수정 공통)
// ============================================================

async function handleUserSubmit(e) {
    e.preventDefault();

    const userId = document.getElementById('form-user-id').value;
    const isEdit = !!userId;

    const name = document.getElementById('form-name').value.trim();
    const email = document.getElementById('form-email').value.trim();
    const password = document.getElementById('form-password').value;

    // 권한 범위 수집
    const scopes = getSelectedScopes();
    if (scopes.length === 0) {
        alert('권한을 최소 1개 이상 선택해주세요.');
        return;
    }

    // 추가 모드에서 비밀번호 필수 확인
    if (!isEdit && (!password || password.length < 8)) {
        alert('비밀번호는 8자 이상이어야 합니다.');
        return;
    }

    const body = { name, email, role: 'admin', scopes };

    if (isEdit) {
        // 수정 API 호출
        const response = await adminFetch(`/api/auth/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        if (!response) return;
        const data = await response.json();
        if (!data.success) {
            alert(data.error || '수정 실패');
            return;
        }
        alert('계정이 수정되었습니다.');
    } else {
        // 추가 API 호출
        body.password = password;
        const response = await adminFetch('/api/auth/admin/users', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!response) return;
        const data = await response.json();
        if (!data.success) {
            alert(data.error || '생성 실패');
            return;
        }
        alert('계정이 추가되었습니다.');
    }

    closeModal('modal-user');
    loadUsers(); // 목록 새로고침
}

// ============================================================
// 비밀번호 변경 모달
// ============================================================

function openPasswordModal(userId, email, isSelf) {
    document.getElementById('pw-target-id').value = userId;
    document.getElementById('pw-target-label').textContent = `대상: ${email}`;
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
    document.getElementById('pw-current').value = '';

    // 자기 자신일 때만 현재 비밀번호 입력 필드 표시
    const currentSection = document.getElementById('current-pw-section');
    if (isSelf) {
        currentSection.classList.remove('hidden');
        document.getElementById('pw-current').required = true;
    } else {
        currentSection.classList.add('hidden');
        document.getElementById('pw-current').required = false;
    }

    openModal('modal-password');
}

async function handlePasswordSubmit(e) {
    e.preventDefault();

    const targetId = document.getElementById('pw-target-id').value;
    const newPassword = document.getElementById('pw-new').value;
    const confirmPassword = document.getElementById('pw-confirm').value;
    const currentPassword = document.getElementById('pw-current').value;

    // 비밀번호 확인 일치 여부
    if (newPassword !== confirmPassword) {
        alert('새 비밀번호와 확인이 일치하지 않습니다.');
        return;
    }

    if (newPassword.length < 8) {
        alert('비밀번호는 8자 이상이어야 합니다.');
        return;
    }

    // API 호출 바디 구성
    const body = { newPassword };
    if (currentPassword) {
        body.currentPassword = currentPassword;
    }

    const response = await adminFetch(`/api/auth/admin/users/${targetId}/password`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
    if (!response) return;

    const data = await response.json();
    if (!data.success) {
        alert(data.error || '비밀번호 변경 실패');
        return;
    }

    alert('비밀번호가 변경되었습니다.');
    closeModal('modal-password');
}

// ============================================================
// 계정 삭제
// ============================================================

async function deleteUser(userId, userName) {
    if (!confirm(`정말 "${userName}" 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
        return;
    }

    const response = await adminFetch(`/api/auth/admin/users/${userId}`, {
        method: 'DELETE'
    });
    if (!response) return;

    const data = await response.json();
    if (!data.success) {
        alert(data.error || '삭제 실패');
        return;
    }

    alert('계정이 삭제되었습니다.');
    loadUsers(); // 목록 새로고침
}

// ============================================================
// 유틸리티 함수
// ============================================================

// 모달 열기/닫기
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// 비밀번호 보기/숨기기 토글
function toggleFormPassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('.material-symbols-outlined');
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility_off';
    }
}

// "전체" 체크박스 핸들러: 전체 선택 시 개별 항목 비활성화
function handleScopeAll(checkbox) {
    const items = document.querySelectorAll('.scope-item');
    if (checkbox.checked) {
        items.forEach(cb => { cb.checked = false; cb.disabled = true; });
    } else {
        items.forEach(cb => { cb.disabled = false; });
    }
}

// 개별 권한 체크 시 "전체" 체크 해제
function handleScopeItem() {
    const allCb = document.getElementById('scope-all');
    const items = document.querySelectorAll('.scope-item');
    const anyChecked = Array.from(items).some(cb => cb.checked);
    if (anyChecked) {
        allCb.checked = false;
    }
}

// 선택된 권한 범위 배열 반환
function getSelectedScopes() {
    const allCb = document.getElementById('scope-all');
    if (allCb.checked) return ['all'];

    const items = document.querySelectorAll('.scope-item:checked');
    const scopes = Array.from(items).map(cb => cb.value);
    return scopes;
}
