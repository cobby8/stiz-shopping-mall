/**
 * STIZ Shopping Mall Main Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('STIZ Main JS Loaded');

    if (logoBlack) logoBlack.classList.add('hidden');
}
        });
    }

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
});
