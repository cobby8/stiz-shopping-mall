/**
 * STIZ Authentication Logic
 * Simulates login state using localStorage.
 */

const AUTH_KEY = 'stiz_user';

// 1. Check Login Status
function isLoggedIn() {
    return !!localStorage.getItem(AUTH_KEY);
}

// 2. Get User Info
function getUser() {
    const user = localStorage.getItem(AUTH_KEY);
    return user ? JSON.parse(user) : null;
}

// 3. Login (Mock)
function login(email, password) {
    if (!email || !password) {
        alert('Please enter email and password.');
        return false;
    }

    // Mock user data
    const user = {
        name: 'STIZ Member',
        email: email,
        joinedAt: new Date().toISOString()
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return true;
}

// 4. Logout
function logout() {
    localStorage.removeItem(AUTH_KEY);
    location.href = 'index.html';
}

// 5. Update Header UI based on Auth State
function updateHeaderAuth() {
    const loginLink = document.getElementById('login-link');
    const joinLink = document.getElementById('join-link');
    const authContainer = document.getElementById('auth-links'); // Wrapper if exists

    if (isLoggedIn()) {
        const user = getUser();
        // If we have specific IDs
        if (loginLink) {
            loginLink.innerText = 'My Page';
            loginLink.href = 'myshop.html';
        }
        if (joinLink) {
            joinLink.innerText = 'Logout';
            joinLink.href = '#';
            joinLink.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateHeaderAuth();
});
