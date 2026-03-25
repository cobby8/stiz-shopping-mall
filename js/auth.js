/**
 * STIZ Authentication Logic
 * Uses localStorage for client-side auth (Phase 2).
 * Server API endpoints prepared for JWT migration.
 */

const AUTH_KEY = 'stiz_user';
const USERS_KEY = 'stiz_users';

// API base URL (change for production)
const API_BASE = 'http://localhost:3000';

// 1. Check Login Status
function isLoggedIn() {
    return !!localStorage.getItem(AUTH_KEY);
}

// 2. Get Current User
function getUser() {
    const user = localStorage.getItem(AUTH_KEY);
    return user ? JSON.parse(user) : null;
}

// 3. Get All Registered Users (mock DB)
function getUsers() {
    const users = localStorage.getItem(USERS_KEY);
    return users ? JSON.parse(users) : [];
}

// 4. Register
function register(userData) {
    const { name, email, password } = userData;

    if (!name || name.trim().length < 2) {
        return { success: false, error: '이름을 2자 이상 입력해주세요.' };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, error: '올바른 이메일을 입력해주세요.' };
    }
    if (!password || password.length < 8) {
        return { success: false, error: '비밀번호는 8자 이상이어야 합니다.' };
    }

    const users = getUsers();
    if (users.find(u => u.email === email)) {
        return { success: false, error: '이미 가입된 이메일입니다.' };
    }

    const newUser = {
        id: Date.now(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password, // In production: hash this
        joinedAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    return { success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email } };
}

// 5. Login
function login(email, password) {
    if (!email || !password) {
        return { success: false, error: '이메일과 비밀번호를 입력해주세요.' };
    }

    const users = getUsers();
    const user = users.find(u => u.email === email.trim().toLowerCase() && u.password === password);

    if (!user) {
        return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
    }

    const sessionUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        joinedAt: user.joinedAt,
        loggedInAt: new Date().toISOString()
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(sessionUser));
    return { success: true, user: sessionUser };
}

// 6. Logout
function logout() {
    localStorage.removeItem(AUTH_KEY);
    location.href = 'index.html';
}

// 7. Update Header UI based on Auth State
function updateHeaderAuth() {
    const user = getUser();
    const loginLink = document.getElementById('login-link');
    const joinLink = document.getElementById('join-link');

    if (user && loginLink) {
        loginLink.innerText = 'My Page';
        loginLink.href = 'myshop.html';
    }
    if (user && joinLink) {
        joinLink.innerText = 'Logout';
        joinLink.href = '#';
        joinLink.onclick = (e) => {
            e.preventDefault();
            logout();
        };
    }
}

// 8. Get user's order history
function getUserOrders() {
    const user = getUser();
    if (!user) return [];
    const orders = JSON.parse(localStorage.getItem('stiz_orders') || '[]');
    return orders.filter(o => o.customer && o.customer.email === user.email);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateHeaderAuth();
});
