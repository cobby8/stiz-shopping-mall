/**
 * 게시판 라우트 (board.js)
 * 공지사항(notice) + 1:1문의(inquiry)를 하나의 테이블(board_posts)로 관리
 * 비유: 학교 게시판 — 공지 코너는 누구나 열람, 질문 코너는 본인만 열람
 *
 * 엔드포인트:
 * - GET  /api/board          — 게시글 목록 (type 파라미터로 notice/inquiry 구분)
 * - GET  /api/board/:id      — 게시글 상세
 * - POST /api/board          — 게시글 작성 (로그인 필요)
 * - PUT  /api/admin/board/:id/answer — 관리자 답변
 * - DELETE /api/admin/board/:id      — 관리자 삭제
 */

import express from 'express';
import { database } from '../db-sqlite.js';
import { requireAuth, adminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// ============================================================
// GET /api/board — 게시글 목록
// ?type=notice → 공지사항 (공개, 누구나 볼 수 있음)
// ?type=inquiry → 문의 목록 (로그인 시 본인 것만, 관리자는 전체)
// ?page=1&limit=10 → 페이지네이션
// ============================================================
router.get('/board', (req, res) => {
    try {
        const { type, page = 1, limit = 10, search } = req.query;

        if (!type || !['notice', 'inquiry'].includes(type)) {
            return res.status(400).json({ success: false, error: 'type 파라미터 필수 (notice 또는 inquiry)' });
        }

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const offset = (pageNum - 1) * limitNum;

        // 기본 조건: 해당 boardType + 삭제되지 않은 글
        let conditions = "boardType = @type AND status = 'active'";
        const params = { type };

        // 문의 게시판: 로그인 사용자는 본인 글만, 관리자는 전체
        if (type === 'inquiry') {
            // JWT 토큰에서 사용자 정보 추출 (실패해도 에러 아님 — 비로그인 시 빈 목록)
            const user = extractUser(req);
            if (user && user.role === 'admin') {
                // 관리자: 전체 문의 볼 수 있음
            } else if (user) {
                // 일반 회원: 본인 글만
                conditions += ' AND userId = @userId';
                params.userId = user.id;
            } else {
                // 비로그인: 빈 목록 반환
                return res.json({ success: true, posts: [], total: 0, page: 1, totalPages: 0 });
            }
        }

        // 검색어가 있으면 제목/내용에서 LIKE 검색
        if (search) {
            conditions += ' AND (LOWER(title) LIKE @search OR LOWER(content) LIKE @search)';
            params.search = `%${search.toLowerCase()}%`;
        }

        // 전체 건수 조회 (페이지네이션 계산용)
        const countRow = database.prepare(
            `SELECT COUNT(*) as cnt FROM board_posts WHERE ${conditions}`
        ).get(params);
        const total = countRow.cnt;

        // 데이터 조회 (최신순 정렬)
        params._limit = limitNum;
        params._offset = offset;
        const posts = database.prepare(
            `SELECT id, boardType, title, authorName, isSecret, isAnswered, viewCount, createdAt
             FROM board_posts WHERE ${conditions}
             ORDER BY createdAt DESC LIMIT @_limit OFFSET @_offset`
        ).all(params);

        res.json({
            success: true,
            posts,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error('[Board] 목록 조회 실패:', error);
        res.status(500).json({ success: false, error: '게시글 목록 조회 실패' });
    }
});

// ============================================================
// GET /api/board/:id — 게시글 상세
// 공지: 누구나 열람 가능
// 문의: 본인 또는 관리자만 열람 가능
// ============================================================
router.get('/board/:id', (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const post = database.prepare(
            "SELECT * FROM board_posts WHERE id = ? AND status = 'active'"
        ).get(postId);

        if (!post) {
            return res.status(404).json({ success: false, error: '게시글을 찾을 수 없습니다.' });
        }

        // 문의글의 비밀글 접근 제한
        if (post.boardType === 'inquiry') {
            const user = extractUser(req);
            if (!user) {
                return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
            }
            // 본인 또는 관리자만 열람 가능
            if (user.role !== 'admin' && user.id !== post.userId) {
                return res.status(403).json({ success: false, error: '본인 글만 열람 가능합니다.' });
            }
        }

        // 조회수 증가
        database.prepare('UPDATE board_posts SET viewCount = viewCount + 1 WHERE id = ?').run(postId);

        res.json({ success: true, post });
    } catch (error) {
        console.error('[Board] 상세 조회 실패:', error);
        res.status(500).json({ success: false, error: '게시글 조회 실패' });
    }
});

// ============================================================
// POST /api/board — 게시글 작성 (로그인 필요)
// notice: 관리자만 작성 가능
// inquiry: 로그인한 회원 누구나 작성 가능
// ============================================================
router.post('/board', requireAuth, (req, res) => {
    try {
        const { boardType, title, content, isSecret } = req.body;
        const user = req.user;

        if (!boardType || !title || !content) {
            return res.status(400).json({ success: false, error: '게시판 유형, 제목, 내용은 필수입니다.' });
        }

        // 공지사항은 관리자만 작성 가능
        if (boardType === 'notice' && user.role !== 'admin') {
            return res.status(403).json({ success: false, error: '공지사항은 관리자만 작성할 수 있습니다.' });
        }

        const result = database.prepare(`
            INSERT INTO board_posts (boardType, title, content, authorName, authorEmail, userId, isSecret, createdAt, updatedAt)
            VALUES (@boardType, @title, @content, @authorName, @authorEmail, @userId, @isSecret, datetime('now'), datetime('now'))
        `).run({
            boardType,
            title: title.trim(),
            content: content.trim(),
            authorName: user.name || user.email,
            authorEmail: user.email,
            userId: user.id,
            isSecret: isSecret ? 1 : 0
        });

        console.log(`[Board] 게시글 작성: type=${boardType}, userId=${user.id}, id=${result.lastInsertRowid}`);
        res.json({
            success: true,
            post: { id: result.lastInsertRowid, boardType, title }
        });
    } catch (error) {
        console.error('[Board] 게시글 작성 실패:', error);
        res.status(500).json({ success: false, error: '게시글 작성 실패' });
    }
});

// ============================================================
// PUT /api/admin/board/:id/answer — 관리자 답변 (adminAuth 필요)
// 관리자가 문의에 답변을 달면 isAnswered=1로 변경
// ============================================================
router.put('/admin/board/:id/answer', adminAuth, (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const { answer } = req.body;

        if (!answer || !answer.trim()) {
            return res.status(400).json({ success: false, error: '답변 내용을 입력해주세요.' });
        }

        const post = database.prepare("SELECT * FROM board_posts WHERE id = ?").get(postId);
        if (!post) {
            return res.status(404).json({ success: false, error: '게시글을 찾을 수 없습니다.' });
        }

        database.prepare(`
            UPDATE board_posts SET answer = ?, isAnswered = 1, answeredAt = datetime('now'), updatedAt = datetime('now')
            WHERE id = ?
        `).run(answer.trim(), postId);

        console.log(`[Board] 관리자 답변: postId=${postId}, by=${req.user.email}`);
        res.json({ success: true, message: '답변이 등록되었습니다.' });
    } catch (error) {
        console.error('[Board] 답변 등록 실패:', error);
        res.status(500).json({ success: false, error: '답변 등록 실패' });
    }
});

// ============================================================
// DELETE /api/admin/board/:id — 관리자 삭제 (소프트 삭제)
// 실제로 DB에서 지우지 않고 status='deleted'로 변경
// ============================================================
router.delete('/admin/board/:id', adminAuth, (req, res) => {
    try {
        const postId = parseInt(req.params.id);

        const result = database.prepare(
            "UPDATE board_posts SET status = 'deleted', updatedAt = datetime('now') WHERE id = ?"
        ).run(postId);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: '게시글을 찾을 수 없습니다.' });
        }

        console.log(`[Board] 게시글 삭제: postId=${postId}, by=${req.user.email}`);
        res.json({ success: true, message: '게시글이 삭제되었습니다.' });
    } catch (error) {
        console.error('[Board] 삭제 실패:', error);
        res.status(500).json({ success: false, error: '삭제 실패' });
    }
});

// ============================================================
// 헬퍼: Authorization 헤더에서 JWT 토큰을 추출하여 사용자 정보 반환
// 에러가 나면 null 반환 (인증 필수가 아닌 엔드포인트에서 사용)
// ============================================================
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth.js';
import db from '../db.js';

function extractUser(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // DB에서 최신 정보 조회
        const user = db.findById('users', decoded.id);
        if (!user) return null;

        return { id: user.id, email: user.email, role: user.role, name: user.name };
    } catch {
        return null;
    }
}

export default router;
