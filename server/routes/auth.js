import express from 'express';
import db from '../db.js';

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be 8+ characters' });
        }

        const existing = db.findOne('users', 'email', email.toLowerCase());
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const user = db.insert('users', {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: password, // TODO: bcrypt hash in production
            joinedAt: new Date().toISOString()
        });

        console.log(`[Auth] New user registered: ${user.email}`);
        res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('[Auth] Register error:', error);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const users = db.getAll('users');
        const user = users.find(u => u.email === email.toLowerCase() && u.password === password);

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // TODO: Generate JWT token in production
        const token = 'mock-jwt-' + user.id + '-' + Date.now();
        console.log(`[Auth] User logged in: ${user.email}`);

        res.json({
            success: true,
            token: token,
            user: { id: user.id, name: user.name, email: user.email, joinedAt: user.joinedAt }
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

export default router;
