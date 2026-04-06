/**
 * 관리자 인증 미들웨어
 * 비유: 건물 입구의 보안 검색대 - "관리자 출입증(JWT 토큰)"이 있는 사람만 통과
 *
 * 동작 순서:
 * 1. 요청 헤더에서 JWT 토큰 추출
 * 2. 토큰이 유효한지 검증 (위조/만료 체크)
 * 3. 토큰 안의 role이 'admin'인지 확인
 * 4. 통과하면 req.user에 사용자 정보를 담아서 다음 단계로 전달
 */

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../routes/auth.js';
import db from '../db.js';

function getAdminScopes(user) {
    if (Array.isArray(user.scopes) && user.scopes.length > 0) return user.scopes;
    return ['all'];
}

function getDefaultAdminPage(user) {
    if (user.defaultPage) return user.defaultPage;
    const scopes = getAdminScopes(user);
    if (scopes.includes('all')) return 'admin-home.html';
    if (scopes.includes('design')) return 'admin-design.html';
    if (scopes.includes('cs')) return 'admin-cs.html';
    if (scopes.includes('production')) return 'admin-production.html';
    return 'admin-home.html';
}

// 관리자 전용 미들웨어 - admin.js 라우트 앞에 장착
export function adminAuth(req, res, next) {
    try {
        // 1) Authorization 헤더에서 토큰 꺼내기
        //    형식: "Bearer eyJhbGciOi..." → "Bearer " 뒷부분만 사용
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: '인증 토큰이 필요합니다. 로그인 후 다시 시도하세요.'
            });
        }

        const token = authHeader.split(' ')[1];

        // 2) 토큰 검증 - 위조되었거나 만료되었으면 에러
        const decoded = jwt.verify(token, JWT_SECRET);

        // 3) role이 admin인지 확인
        if (decoded.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: '관리자 권한이 필요합니다.'
            });
        }

        // 4) DB에서 최신 사용자 정보 확인 (토큰 발급 후 삭제되었을 수 있음)
        const user = db.findById('users', decoded.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: '유효하지 않은 관리자 계정입니다.'
            });
        }

        // 5) 검증 통과 - req.user에 사용자 정보 저장하고 다음으로
        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            scopes: getAdminScopes(user),
            defaultPage: getDefaultAdminPage(user)
        };

        next(); // 다음 미들웨어/라우트로 진행
    } catch (error) {
        // JWT 만료 또는 위조
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: '토큰이 만료되었습니다. 다시 로그인하세요.'
            });
        }
        return res.status(401).json({
            success: false,
            error: '유효하지 않은 토큰입니다.'
        });
    }
}

// 일반 로그인 확인 미들웨어 (고객/관리자 모두 통과)
// 비유: 로비 출입 - 직원증이면 누구든 통과
export function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: '인증 토큰이 필요합니다.'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            scopes: decoded.scopes || [],
            defaultPage: decoded.defaultPage || ''
        };

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: '유효하지 않은 토큰입니다.'
        });
    }
}

export function requireAdminScope(scope) {
    return function scopedAdminGuard(req, res, next) {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: '관리자 권한이 필요합니다.'
            });
        }

        const scopes = req.user.scopes || ['all'];
        if (scopes.includes('all') || scopes.includes(scope)) {
            return next();
        }

        return res.status(403).json({
            success: false,
            error: '해당 파트 권한이 없습니다.'
        });
    };
}

export default { adminAuth, requireAuth, requireAdminScope };
