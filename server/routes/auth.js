import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';

const router = express.Router();

// JWT 비밀키 - 환경변수에서 가져오거나 기본값 사용
// 비유: 암호 도장 - 이 도장으로 찍은 토큰만 진짜로 인정
const JWT_SECRET = process.env.JWT_SECRET || 'stiz-shop-secret-key-2026';
// 토큰 유효기간: 7일 (7일 후 다시 로그인 필요)
const JWT_EXPIRES_IN = '7d';

function getAdminScopes(user) {
    if (user.role !== 'admin') return [];
    if (Array.isArray(user.scopes) && user.scopes.length > 0) return user.scopes;
    return ['all'];
}

function getDefaultAdminPage(user) {
    if (user.role !== 'admin') return '';
    if (user.defaultPage) return user.defaultPage;

    const scopes = getAdminScopes(user);
    if (scopes.includes('all')) return 'admin-home.html';
    if (scopes.includes('design')) return 'admin-design.html';
    if (scopes.includes('cs')) return 'admin-cs.html';
    if (scopes.includes('production')) return 'admin-production.html';
    return 'admin-home.html';
}

// POST /api/auth/register - 회원가입
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // 필수 입력값 검증
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be 8+ characters' });
        }

        // 이메일 중복 확인
        const existing = db.findOne('users', 'email', email.toLowerCase());
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        // 비밀번호를 bcrypt로 해싱 (원본 비밀번호를 알 수 없게 암호화)
        // 비유: 비밀번호를 금고에 넣고 열쇠를 버리는 것 - 비교만 가능, 복원 불가
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 신규 사용자는 기본적으로 'customer' 역할
        const user = db.insert('users', {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            role: 'customer',           // 기본 역할: 고객 (admin은 시드 스크립트로만 생성)
            joinedAt: new Date().toISOString()
        });

        console.log(`[Auth] New user registered: ${user.email} (role: ${user.role})`);
        res.json({
            success: true,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error('[Auth] Register error:', error);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

// POST /api/auth/login - 로그인
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        // 이메일로 사용자 조회
        const user = db.findOne('users', 'email', email.toLowerCase());
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // bcrypt로 비밀번호 비교 (해싱된 비밀번호와 입력값 비교)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // JWT 토큰 생성 - 사용자 정보를 담은 "출입증" 발급
        // 비유: 놀이공원 입장 팔찌 - 이름/등급이 적혀있고 7일 후 만료
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                scopes: getAdminScopes(user),
                defaultPage: getDefaultAdminPage(user)
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        console.log(`[Auth] User logged in: ${user.email} (role: ${user.role})`);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,           // 역할 정보도 응답에 포함
                scopes: getAdminScopes(user),
                defaultPage: getDefaultAdminPage(user),
                joinedAt: user.joinedAt
            }
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

// GET /api/auth/me - 현재 로그인된 사용자 정보 조회 (토큰 검증용)
// 비유: "내 출입증이 아직 유효한가?" 확인하는 API
router.get('/me', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // 토큰에서 꺼낸 ID로 최신 사용자 정보 조회
        const user = db.findById('users', decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                scopes: getAdminScopes(user),
                defaultPage: getDefaultAdminPage(user),
                joinedAt: user.joinedAt
            }
        });
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
});

// JWT_SECRET을 다른 모듈에서도 사용할 수 있도록 내보냄
export { JWT_SECRET };
export default router;
