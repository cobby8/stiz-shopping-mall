/**
 * 게시판 라우트 (board.js)
 * 공지사항(notice) + 1:1문의(inquiry) + 샘플 요청(sample)을 하나의 테이블(board_posts)로 관리
 * 비유: 학교 게시판 — 공지 코너는 누구나 열람, 질문 코너는 본인만 열람,
 *      샘플 요청은 "신청서함"처럼 관리자만 처리(4단계 진행)
 *
 * 엔드포인트:
 * - GET  /api/board          — 게시글 목록 (type 파라미터로 notice/inquiry/sample 구분)
 * - GET  /api/board/:id      — 게시글 상세
 * - POST /api/board          — 게시글 작성 (로그인 필요, type=sample이면 sampleData 검증)
 * - PUT  /api/admin/board/:id/answer       — 관리자 답변 (inquiry용)
 * - PUT  /api/admin/board/:id/sample-stage — 샘플 요청 진행 단계 변경 (관리자, 4단계)
 * - DELETE /api/admin/board/:id            — 관리자 삭제
 */

import express from 'express';
import { database } from '../db-sqlite.js';
import { requireAuth, adminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// ============================================================
// GET /api/board — 게시글 목록
// ?type=notice → 공지사항 (공개, 누구나 볼 수 있음)
// ?type=inquiry → 문의 목록 (로그인 시 본인 것만, 관리자는 전체)
// ?type=sample  → 샘플 요청 목록 (본인 또는 관리자만, inquiry와 동일한 권한 패턴)
// ?page=1&limit=10 → 페이지네이션
// ============================================================
router.get('/board', (req, res) => {
    try {
        const { type, page = 1, limit = 10, search } = req.query;

        if (!type || !['notice', 'inquiry', 'sample'].includes(type)) {
            return res.status(400).json({ success: false, error: 'type 파라미터 필수 (notice / inquiry / sample)' });
        }

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const offset = (pageNum - 1) * limitNum;

        // 기본 조건: 해당 boardType + 삭제되지 않은 글
        let conditions = "boardType = @type AND status = 'active'";
        const params = { type };

        // 문의/샘플 게시판: 로그인 사용자는 본인 글만, 관리자는 전체 (inquiry와 동일 패턴)
        if (type === 'inquiry' || type === 'sample') {
            // JWT 토큰에서 사용자 정보 추출 (실패해도 에러 아님 — 비로그인 시 빈 목록)
            const user = extractUser(req);
            if (user && user.role === 'admin') {
                // 관리자: 전체 볼 수 있음
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
        // 샘플 목록은 진행 단계/배송지를 list에서 바로 보여줘야 하므로 data 컬럼도 함께 조회
        params._limit = limitNum;
        params._offset = offset;
        const selectCols = type === 'sample'
            ? 'id, boardType, title, authorName, isSecret, isAnswered, viewCount, createdAt, data'
            : 'id, boardType, title, authorName, isSecret, isAnswered, viewCount, createdAt';
        const rows = database.prepare(
            `SELECT ${selectCols}
             FROM board_posts WHERE ${conditions}
             ORDER BY createdAt DESC LIMIT @_limit OFFSET @_offset`
        ).all(params);

        // 샘플 타입은 data 컬럼(JSON 문자열)을 객체로 펼쳐서 반환 — 프론트가 매번 파싱하지 않도록
        const posts = rows.map(r => {
            if (type === 'sample' && r.data) {
                try { return { ...r, data: JSON.parse(r.data) }; }
                catch { return { ...r, data: null }; }
            }
            return r;
        });

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

        // 문의글/샘플 요청은 본인 또는 관리자만 열람 가능 (배송지 등 민감 정보 포함)
        if (post.boardType === 'inquiry' || post.boardType === 'sample') {
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

        // 샘플 글은 data(JSON) 파싱해서 반환 — 프론트 처리 단순화
        if (post.boardType === 'sample' && post.data) {
            try { post.data = JSON.parse(post.data); } catch { post.data = null; }
        }

        res.json({ success: true, post });
    } catch (error) {
        console.error('[Board] 상세 조회 실패:', error);
        res.status(500).json({ success: false, error: '게시글 조회 실패' });
    }
});

// ============================================================
// POST /api/board/public — 비로그인 견적/문의 접수 (W-2)
// 단체주문 견적처럼 로그인 없이도 제출할 수 있는 공개 게시글 작성
// 비유: 가게 앞 의견함 — 누구나 넣을 수 있지만, 관리자만 확인 가능
// ============================================================
router.post('/board/public', (req, res) => {
    try {
        const { boardType, title, content, authorName, authorEmail, authorPhone } = req.body;

        if (!title || !content || !authorName) {
            return res.status(400).json({ success: false, error: '제목, 내용, 이름은 필수입니다.' });
        }

        const result = database.prepare(`
            INSERT INTO board_posts (boardType, title, content, authorName, authorEmail, userId, isSecret, createdAt, updatedAt)
            VALUES (@boardType, @title, @content, @authorName, @authorEmail, @userId, @isSecret, datetime('now'), datetime('now'))
        `).run({
            boardType: boardType || 'inquiry',
            title: title.trim(),
            content: content.trim(),
            authorName: authorName.trim(),
            authorEmail: (authorEmail || '').trim(),
            userId: null,           // 비로그인이므로 userId 없음
            isSecret: 1             // 비로그인 문의는 기본 비밀글
        });

        console.log(`[Board] 비로그인 게시글 접수: type=${boardType}, name=${authorName}, id=${result.lastInsertRowid}`);
        res.json({
            success: true,
            post: { id: result.lastInsertRowid, boardType, title }
        });
    } catch (error) {
        console.error('[Board] 비로그인 게시글 작성 실패:', error);
        res.status(500).json({ success: false, error: '게시글 작성 실패' });
    }
});

// ============================================================
// POST /api/board — 게시글 작성 (로그인 필요)
// notice: 관리자만 작성 가능
// inquiry: 로그인한 회원 누구나 작성 가능
// ============================================================
router.post('/board', requireAuth, (req, res) => {
    try {
        const { boardType, title, content, isSecret, sampleData } = req.body;
        const user = req.user;

        if (!boardType || !title || !content) {
            return res.status(400).json({ success: false, error: '게시판 유형, 제목, 내용은 필수입니다.' });
        }

        // 허용 타입 화이트리스트 — 임의 값으로 INSERT되는 것 차단
        if (!['notice', 'inquiry', 'sample'].includes(boardType)) {
            return res.status(400).json({ success: false, error: '허용되지 않은 게시판 유형입니다.' });
        }

        // 공지사항은 관리자만 작성 가능
        if (boardType === 'notice' && user.role !== 'admin') {
            return res.status(403).json({ success: false, error: '공지사항은 관리자만 작성할 수 있습니다.' });
        }

        // ────────── 샘플 요청 전용 검증 + 진행 상태 초기화 ──────────
        // 비유: 샘플은 "택배 신청서"라 받는 사람/주소가 빠지면 보낼 수 없으므로 입력을 엄격히 검증
        let dataJson = null;
        if (boardType === 'sample') {
            if (!sampleData || typeof sampleData !== 'object') {
                return res.status(400).json({ success: false, error: '샘플 요청 정보(sampleData)가 누락되었습니다.' });
            }
            const { sampleType, name, phone, postalCode, address, addressDetail, reason } = sampleData;

            // 샘플 종류 화이트리스트
            if (!['fabric', 'design', 'both'].includes(sampleType)) {
                return res.status(400).json({ success: false, error: '샘플 종류가 올바르지 않습니다.' });
            }
            // 받는 분 / 연락처 / 우편번호 / 주소 / 상세 주소 필수
            if (!name || !String(name).trim()) {
                return res.status(400).json({ success: false, error: '받는 분 이름을 입력해 주세요.' });
            }
            // 한국 휴대폰 번호 (010/011/016/017/018/019 + 7~8자리)
            const phoneDigits = String(phone || '').replace(/[^0-9]/g, '');
            if (!/^(01[016789])\d{7,8}$/.test(phoneDigits)) {
                return res.status(400).json({ success: false, error: '올바른 휴대폰 번호를 입력해 주세요.' });
            }
            // 우편번호 5자리
            if (!/^\d{5}$/.test(String(postalCode || ''))) {
                return res.status(400).json({ success: false, error: '우편번호는 5자리 숫자여야 합니다.' });
            }
            if (!address || !String(address).trim()) {
                return res.status(400).json({ success: false, error: '기본 주소를 입력해 주세요.' });
            }
            if (!addressDetail || !String(addressDetail).trim()) {
                return res.status(400).json({ success: false, error: '상세 주소를 입력해 주세요.' });
            }

            // sampleRequest JSON 페이로드 구성 — 4단계 진행 상태/타임스탬프/운송장/메모는 서버에서 초기화
            const nowIso = new Date().toISOString();
            const sampleRequest = {
                sampleType,                              // fabric / design / both
                shipping: {
                    name: String(name).trim(),
                    phone: phoneDigits,                  // 숫자만 저장 (표시 시 포매팅)
                    postalCode: String(postalCode).trim(),
                    address: String(address).trim(),
                    addressDetail: String(addressDetail).trim()
                },
                reason: reason ? String(reason).trim() : '',
                stage: 'requested',                      // 4단계: requested → reviewing → shipped → delivered
                requestedAt: nowIso,
                reviewedAt: null,
                shippedAt: null,
                deliveredAt: null,
                trackingNumber: null,
                memo: null
            };
            // data 컬럼은 단일 JSON 문자열. 향후 다른 타입도 같은 컬럼 재활용 가능하도록 sampleRequest 키로 감싼다
            dataJson = JSON.stringify({ sampleRequest });
        }

        const result = database.prepare(`
            INSERT INTO board_posts (boardType, title, content, authorName, authorEmail, userId, isSecret, data, createdAt, updatedAt)
            VALUES (@boardType, @title, @content, @authorName, @authorEmail, @userId, @isSecret, @data, datetime('now'), datetime('now'))
        `).run({
            boardType,
            title: title.trim(),
            content: content.trim(),
            authorName: user.name || user.email,
            authorEmail: user.email,
            userId: user.id,
            // 샘플 요청은 배송지 포함이라 강제 비밀글 (관리자/본인만 열람)
            isSecret: (boardType === 'sample' || isSecret) ? 1 : 0,
            data: dataJson
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
// PUT /api/admin/board/:id/sample-stage — 샘플 요청 진행 단계 변경 (관리자 전용)
// 비유: 택배 처리 진행 도장 — "접수 → 검토 → 발송 → 완료" 단계마다 도장을 찍는다.
//       발송 단계에서는 운송장 번호를 같이 입력해야 추적 가능.
// 요청 바디: { stage: 'reviewing' | 'shipped' | 'delivered', trackingNumber?, memo? }
// ============================================================
router.put('/admin/board/:id/sample-stage', adminAuth, (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const { stage, trackingNumber, memo } = req.body || {};

        const STAGES = ['requested', 'reviewing', 'shipped', 'delivered'];
        if (!STAGES.includes(stage)) {
            return res.status(400).json({ success: false, error: 'stage 값이 올바르지 않습니다.' });
        }

        const post = database.prepare("SELECT * FROM board_posts WHERE id = ? AND status = 'active'").get(postId);
        if (!post) {
            return res.status(404).json({ success: false, error: '게시글을 찾을 수 없습니다.' });
        }
        if (post.boardType !== 'sample') {
            return res.status(400).json({ success: false, error: '샘플 요청 게시글이 아닙니다.' });
        }

        // 기존 data 파싱 (없으면 빈 구조 보강 — 과거 데이터 안전)
        let data;
        try { data = JSON.parse(post.data || '{}'); } catch { data = {}; }
        const sr = data.sampleRequest || {};

        // 단계 변경 + 단계별 타임스탬프 기록 (역행 가능 — 운영 실수 복구용)
        const nowIso = new Date().toISOString();
        sr.stage = stage;
        if (stage === 'reviewing' && !sr.reviewedAt) sr.reviewedAt = nowIso;
        if (stage === 'shipped') {
            // 발송 단계는 운송장 번호 필수 입력
            if (!trackingNumber || !String(trackingNumber).trim()) {
                return res.status(400).json({ success: false, error: '발송 처리 시 운송장 번호를 입력해 주세요.' });
            }
            sr.trackingNumber = String(trackingNumber).trim();
            if (!sr.shippedAt) sr.shippedAt = nowIso;
        }
        if (stage === 'delivered' && !sr.deliveredAt) sr.deliveredAt = nowIso;

        // 운송장/메모는 단계와 무관하게 갱신 가능 (선택 입력)
        if (typeof trackingNumber === 'string' && trackingNumber.trim()) {
            sr.trackingNumber = String(trackingNumber).trim();
        }
        if (typeof memo === 'string') {
            sr.memo = memo;  // 빈 문자열 허용 (메모 삭제 의도)
        }

        data.sampleRequest = sr;

        database.prepare(
            "UPDATE board_posts SET data = ?, updatedAt = datetime('now') WHERE id = ?"
        ).run(JSON.stringify(data), postId);

        console.log(`[Board] 샘플 단계 변경: postId=${postId}, stage=${stage}, by=${req.user.email}`);
        res.json({ success: true, sampleRequest: sr });
    } catch (error) {
        console.error('[Board] 샘플 단계 변경 실패:', error);
        res.status(500).json({ success: false, error: '샘플 단계 변경 실패' });
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
