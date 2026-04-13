import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db, { database } from '../db.js';
// adminAuth.js에서 scope/페이지 결정 함수를 import (중복 제거)
import { getAdminScopes, getDefaultAdminPage, adminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// JWT 비밀키 - 환경변수에서 가져오거나 기본값 사용
// 비유: 암호 도장 - 이 도장으로 찍은 토큰만 진짜로 인정
const JWT_SECRET = process.env.JWT_SECRET || 'stiz-shop-secret-key-2026';
// 보안 경고: 환경변수가 없으면 기본 키를 사용하므로, 운영 환경에서는 반드시 설정 필요
if (!process.env.JWT_SECRET) {
    console.warn('[Auth] JWT_SECRET 환경변수가 설정되지 않았습니다. 기본 키를 사용합니다.');
}
// 토큰 유효기간: 7일 (7일 후 다시 로그인 필요)
const JWT_EXPIRES_IN = '7d';

// POST /api/auth/register - 회원가입
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

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
        // phone: 선택 입력이지만 있으면 저장 (주문 시 연락처로 활용)
        const user = db.insert('users', {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            phone: phone ? phone.trim() : '',
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

// ============================================================
// GET /api/auth/me/orders — 내 주문 내역 조회
// JWT 토큰의 사용자 이메일로 orders 테이블에서 검색
// 비유: 마이페이지에서 "내 주문 이력"을 서버에서 가져오는 것
// (기존에는 localStorage에서 읽었으나, 이제 서버 DB 기반으로 전환)
// ============================================================
router.get('/me/orders', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // 사용자 이메일로 주문 검색 — orders.data JSON 안의 customer.email과 매칭
        const user = db.findById('users', decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        // orders 테이블에서 customer.email이 일치하는 주문을 JSON_EXTRACT로 검색
        const rows = database.prepare(`
            SELECT data FROM orders
            WHERE json_extract(data, '$.customer.email') = ?
            ORDER BY createdAt DESC
        `).all(user.email);

        // JSON blob을 파싱하여 고객에게 필요한 필드만 추출
        const orders = rows.map(row => {
            const order = JSON.parse(row.data);
            return {
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                items: order.items || [],
                total: order.payment?.totalAmount || order.totalAmount || 0,
                customer: order.customer || {},
                createdAt: order.createdAt
            };
        });

        res.json({ success: true, orders });
    } catch (error) {
        console.error('[Auth] 내 주문 조회 실패:', error);
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
});

// ============================================================
// PUT /api/auth/me/profile — 내 프로필 수정 (이름, 전화번호)
// 비유: 마이페이지에서 "내 정보 수정" 버튼을 눌렀을 때
// ============================================================
router.put('/me/profile', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = db.findById('users', decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const { name, phone } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (phone !== undefined) updates.phone = phone.trim();

        const updated = db.updateById('users', decoded.id, updates);

        // localStorage와 동기화할 수 있도록 최신 정보 반환
        res.json({
            success: true,
            user: {
                id: updated.id,
                name: updated.name,
                email: updated.email,
                phone: updated.phone || '',
                role: updated.role,
                joinedAt: updated.joinedAt
            }
        });
    } catch (error) {
        console.error('[Auth] 프로필 수정 실패:', error);
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
});

// ============================================================
// 관리자 계정 관리 API (adminAuth 필요)
// 비유: "인사팀 전용 시스템" — 관리자만 접근 가능한 계정 CRUD
// ============================================================

// GET /api/auth/admin/users — 관리자 목록 조회
// 비밀번호 해시는 절대 반환하지 않는다 (보안)
router.get('/admin/users', adminAuth, (req, res) => {
    try {
        // database 객체로 직접 SQL 실행 — users 테이블 전체 조회
        const rows = database.prepare('SELECT id, email, name, role, scopes, joinedAt FROM users WHERE role = ?').all('admin');
        res.json({ success: true, users: rows });
    } catch (error) {
        console.error('[Auth] 관리자 목록 조회 실패:', error);
        res.status(500).json({ success: false, error: '관리자 목록 조회 실패' });
    }
});

// POST /api/auth/admin/users — 관리자 계정 생성
router.post('/admin/users', adminAuth, async (req, res) => {
    try {
        const { email, password, name, role, scopes } = req.body;

        // 필수 입력값 검증
        if (!email || !password || !name) {
            return res.status(400).json({ success: false, error: '이름, 이메일, 비밀번호는 필수입니다.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, error: '비밀번호는 8자 이상이어야 합니다.' });
        }

        // 이메일 중복 체크
        const existing = db.findOne('users', 'email', email.toLowerCase());
        if (existing) {
            return res.status(409).json({ success: false, error: '이미 등록된 이메일입니다.' });
        }

        // bcryptjs로 비밀번호 해싱 (원본 비밀번호 복원 불가)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // scopes 배열을 쉼표 구분 문자열로 변환하여 저장
        const scopesStr = Array.isArray(scopes) ? scopes.join(',') : (scopes || 'all');

        const user = db.insert('users', {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            role: role || 'admin',
            scopes: scopesStr,
            joinedAt: new Date().toISOString()
        });

        console.log(`[Auth] 관리자 계정 생성: ${user.email} (생성자: ${req.user.email})`);
        res.json({
            success: true,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, scopes: scopesStr, joinedAt: user.joinedAt }
        });
    } catch (error) {
        console.error('[Auth] 관리자 계정 생성 실패:', error);
        res.status(500).json({ success: false, error: '계정 생성 실패' });
    }
});

// PUT /api/auth/admin/users/:id — 관리자 계정 수정 (비밀번호 제외)
router.put('/admin/users/:id', adminAuth, (req, res) => {
    try {
        const targetId = parseInt(req.params.id);
        const { email, name, role, scopes } = req.body;

        // 자기 자신의 role 변경 방지 (실수로 관리자 권한을 잃는 것 방지)
        if (targetId === req.user.id && role && role !== req.user.role) {
            return res.status(400).json({ success: false, error: '자기 자신의 역할은 변경할 수 없습니다.' });
        }

        // 대상 사용자 존재 여부 확인
        const target = db.findById('users', targetId);
        if (!target) {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        // 이메일 변경 시 중복 체크
        if (email && email.toLowerCase() !== target.email) {
            const dup = db.findOne('users', 'email', email.toLowerCase());
            if (dup) {
                return res.status(409).json({ success: false, error: '이미 등록된 이메일입니다.' });
            }
        }

        // scopes 배열을 쉼표 구분 문자열로 변환
        const scopesStr = Array.isArray(scopes) ? scopes.join(',') : scopes;

        // 변경할 필드만 업데이트 (비밀번호는 별도 API로)
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (email !== undefined) updates.email = email.trim().toLowerCase();
        if (role !== undefined) updates.role = role;
        if (scopesStr !== undefined) updates.scopes = scopesStr;

        const updated = db.updateById('users', targetId, updates);

        console.log(`[Auth] 관리자 계정 수정: ID=${targetId} (수정자: ${req.user.email})`);
        res.json({
            success: true,
            user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, scopes: updated.scopes, joinedAt: updated.joinedAt }
        });
    } catch (error) {
        console.error('[Auth] 관리자 계정 수정 실패:', error);
        res.status(500).json({ success: false, error: '계정 수정 실패' });
    }
});

// PUT /api/auth/admin/users/:id/password — 비밀번호 변경
// 관리자가 다른 사람 비번 강제 변경: { newPassword }
// 자기 비번 변경: { currentPassword, newPassword }
router.put('/admin/users/:id/password', adminAuth, async (req, res) => {
    try {
        const targetId = parseInt(req.params.id);
        const { currentPassword, newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, error: '새 비밀번호는 8자 이상이어야 합니다.' });
        }

        const target = db.findById('users', targetId);
        if (!target) {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        // 자기 자신의 비밀번호 변경 시 현재 비밀번호 확인 필수
        if (targetId === req.user.id) {
            if (!currentPassword) {
                return res.status(400).json({ success: false, error: '현재 비밀번호를 입력해주세요.' });
            }
            const isMatch = await bcrypt.compare(currentPassword, target.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' });
            }
        }

        // 새 비밀번호 해싱 후 업데이트
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        db.updateById('users', targetId, { password: hashedPassword });

        console.log(`[Auth] 비밀번호 변경: ID=${targetId} (변경자: ${req.user.email})`);
        res.json({ success: true, message: '비밀번호가 변경되었습니다.' });
    } catch (error) {
        console.error('[Auth] 비밀번호 변경 실패:', error);
        res.status(500).json({ success: false, error: '비밀번호 변경 실패' });
    }
});

// DELETE /api/auth/admin/users/:id — 관리자 계정 삭제
router.delete('/admin/users/:id', adminAuth, (req, res) => {
    try {
        const targetId = parseInt(req.params.id);

        // 자기 자신 삭제 방지
        if (targetId === req.user.id) {
            return res.status(400).json({ success: false, error: '자기 자신은 삭제할 수 없습니다.' });
        }

        // 대상 확인
        const target = db.findById('users', targetId);
        if (!target) {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        // 마지막 관리자 삭제 방지 (최소 1명은 유지)
        const adminCount = database.prepare('SELECT COUNT(*) as cnt FROM users WHERE role = ?').get('admin');
        if (adminCount.cnt <= 1) {
            return res.status(400).json({ success: false, error: '마지막 관리자 계정은 삭제할 수 없습니다.' });
        }

        db.deleteById('users', targetId);

        console.log(`[Auth] 관리자 계정 삭제: ${target.email} (삭제자: ${req.user.email})`);
        res.json({ success: true, message: '계정이 삭제되었습니다.' });
    } catch (error) {
        console.error('[Auth] 관리자 계정 삭제 실패:', error);
        res.status(500).json({ success: false, error: '계정 삭제 실패' });
    }
});

// JWT_SECRET을 다른 모듈에서도 사용할 수 있도록 내보냄
export { JWT_SECRET };
export default router;
