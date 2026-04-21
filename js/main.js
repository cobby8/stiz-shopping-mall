/**
 * STIZ Shopping Mall Main Logic
 */

document.addEventListener('DOMContentLoaded', () => {
});

// Mobile Menu Toggle
const menuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');

if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });
}

// Local Include Loader (For Preview Only - Simulates Cafe24 imports)
// This is useful if we are running locally without a server to handle imports
const includes = document.querySelectorAll('[data-include]');
includes.forEach(async (el) => {
    const file = el.getAttribute('data-include');
    try {
        const response = await fetch(file);
        if (response.ok) {
            const html = await response.text();
            el.innerHTML = html;

            // Re-run scripts in included content
            const scripts = el.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
        } else {
            console.error(`Failed to load ${file}`);
        }
    } catch (e) {
        console.error(`Error loading ${file}:`, e);
    }
});

/**
 * STIZ 공통 토스트
 * - alert 대체: 사용자를 막지 않는 비차단 알림
 * - 사용: stizToast('장바구니에 추가되었습니다', { type: 'success' })
 */
function stizToast(message, options = {}) {
    // options 기본값 분해: 타입은 info/success/error, 지속시간 기본 2.5초
    const { type = 'info', duration = 2500 } = options;
    // 토스트 컨테이너(여러 개 쌓을 수 있도록 flex-column) — 없으면 1회 생성
    let wrap = document.getElementById('stiz-toast-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'stiz-toast-wrap';
        wrap.style.cssText = 'position:fixed;top:90px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(wrap);
    }
    // 실제 토스트 박스 DOM 생성 및 타입별 색상 결정
    const el = document.createElement('div');
    const bg = type === 'success' ? '#111' : type === 'error' ? '#E63946' : '#333';
    el.style.cssText = `background:${bg};color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);opacity:0;transform:translateY(-10px);transition:all .25s ease;`;
    el.textContent = message;
    wrap.appendChild(el);
    // 다음 프레임에 opacity/transform을 풀어 fade-in 애니메이션 발동
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    // duration 경과 후 fade-out → DOM 제거
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px)';
        setTimeout(() => el.remove(), 300);
    }, duration);
}
