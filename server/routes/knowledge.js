// ============================================================
// 챗봇 "티즈" 지식베이스 관리자 API (K3 — Phase 3A)
// ============================================================
// 비유: 운영팀이 "FAQ 매뉴얼북"을 직접 편집/추가/삭제/재빌드 하는 편집 데스크.
//       모든 엔드포인트는 /api/admin/knowledge/* 경로이며 server.js에서 adminAuth 적용됨.
//
// 엔드포인트(5):
//   GET    /faq            — 목록 + 필터 (intent/needsReview/q)
//   POST   /faq            — 신규 추가 (id 자동생성)
//   PUT    /faq/:id        — 수정
//   DELETE /faq/:id        — 하드 삭제 (soft delete 안 함)
//   POST   /rebuild        — K2 products.json 재빌드 (npm run build-knowledge)
//
// 보안 원칙:
//   1) 검증 실패 시 400 — faq.json에 저장 전에 막음
//   2) 재빌드는 고정 커맨드 + 동시실행차단 + 타임아웃60s + 로그크기제한64KB
//   3) 실패 시 faq.json 파일은 원자적 rename으로 보존됨 (knowledge.js 쪽 atomic write)
//   4) adminAuth는 server.js에서 mount 시 자동 적용 — 라우트 내부에서 별도 체크 불필요
// ============================================================

import express from 'express';
import { spawn } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRawFaq, writeFaq, reloadKnowledge, getKnowledgeInfo } from '../services/knowledge.js';
import { logActivity } from '../activityLog.js';

const router = express.Router();

// ------------------------------------------------------------
// 프로젝트 루트 절대경로 (rebuild spawn cwd로 사용)
// ------------------------------------------------------------
// 비유: "어느 디렉토리에서 명령을 실행할지" 지정하는 집주소.
// process.cwd()는 서버 기동 방식(예: `npm start --prefix server`)에 따라 달라지므로
// 이 파일(server/routes/knowledge.js)의 실제 경로 기준으로 프로젝트 루트를 정적으로 계산한다.
// - __filename: ...\server\routes\knowledge.js
// - __dirname:  ...\server\routes
// - PROJECT_ROOT: ...\stizshop  (routes → server → stizshop, 두 단계 위)
//
// build-knowledge 스크립트는 루트 package.json L9에만 정의되어 있으므로
// cwd를 PROJECT_ROOT로 고정해야 `npm run build-knowledge`가 정상 동작한다. (E-16 해결)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ------------------------------------------------------------
// 상수: intent 8종 + priority 3종 + id prefix 매핑
// ------------------------------------------------------------
// scratchpad 기획서 L91 참조. 프론트 드롭다운 옵션과 1:1 일치해야 함.
const VALID_INTENTS = Object.freeze([
    'custom', 'product', 'shipping', 'refund',
    'payment', 'company', 'member', 'coupon'
]);
const VALID_PRIORITIES = Object.freeze(['high', 'medium', 'low']);

// intent → id prefix (FAQ-<PREFIX>-NNN 형식)
// 예: shipping → SHIP → FAQ-SHIP-007
const INTENT_ID_PREFIX = Object.freeze({
    custom:   'CUSTOM',
    product:  'PRODUCT',
    shipping: 'SHIP',
    refund:   'REFUND',
    payment:  'PAY',
    company:  'COMPANY',
    member:   'MEMBER',
    coupon:   'COUPON'
});

// 검증 한도 (기획서 L111~117 참조)
const MAX_ANSWER_LEN = 2000;       // Gemini 프롬프트 안전 범위
const MAX_KEYWORDS   = 20;          // 키워드 배열 길이 상한

// 재빌드 동시실행 차단용 모듈 전역 플래그
// 비유: "회의실 사용중" 표지판. 누군가 재빌드 중이면 두 번째 요청은 409로 막음.
let _rebuilding = false;

// 재빌드 타임아웃(ms) + 로그 버퍼 상한
const REBUILD_TIMEOUT_MS = 60 * 1000;        // 60초 (통상 1~3초면 끝남)
const MAX_LOG_BYTES = 64 * 1024;             // stdout/stderr 각 64KB 상한

// ------------------------------------------------------------
// 유틸: 입력 검증
// ------------------------------------------------------------
// 반환: { ok:true, clean:{...} } 또는 { ok:false, error:"..." }
// clean에는 "신뢰할 수 있는" 값만 담아 반환 (undefined/null 정규화)
function validateFaqPayload(body) {
    if (!body || typeof body !== 'object') {
        return { ok: false, error: '요청 본문이 올바르지 않습니다.' };
    }

    const { intent, priority, keywords, questions, answer, source, needsReview } = body;

    // 1) intent — 8종 enum 체크
    if (!VALID_INTENTS.includes(intent)) {
        return { ok: false, error: `intent는 ${VALID_INTENTS.join('/')} 중 하나여야 합니다.` };
    }

    // 2) priority — 3종 enum 체크
    if (!VALID_PRIORITIES.includes(priority)) {
        return { ok: false, error: `priority는 ${VALID_PRIORITIES.join('/')} 중 하나여야 합니다.` };
    }

    // 3) questions — 배열 + 최소 1개 + 빈 문자열 금지
    if (!Array.isArray(questions) || questions.length === 0) {
        return { ok: false, error: 'questions는 1개 이상의 배열이어야 합니다.' };
    }
    const cleanQuestions = questions.map(q => (typeof q === 'string' ? q.trim() : ''));
    if (cleanQuestions.some(q => !q)) {
        return { ok: false, error: 'questions에 빈 문자열이 포함될 수 없습니다.' };
    }

    // 4) answer — 문자열 + 길이 제한
    if (typeof answer !== 'string' || !answer.trim()) {
        return { ok: false, error: 'answer는 비어있지 않은 문자열이어야 합니다.' };
    }
    if (answer.length > MAX_ANSWER_LEN) {
        return { ok: false, error: `answer는 최대 ${MAX_ANSWER_LEN}자까지 허용됩니다. (현재 ${answer.length}자)` };
    }

    // 5) keywords — 배열 + 상한 + 각 항목은 문자열
    if (!Array.isArray(keywords)) {
        return { ok: false, error: 'keywords는 배열이어야 합니다.' };
    }
    if (keywords.length > MAX_KEYWORDS) {
        return { ok: false, error: `keywords는 최대 ${MAX_KEYWORDS}개까지 허용됩니다.` };
    }
    const cleanKeywords = keywords
        .map(k => (typeof k === 'string' ? k.trim() : ''))
        .filter(Boolean);

    // 6) source — 선택 필드 (없으면 빈 문자열)
    const cleanSource = typeof source === 'string' ? source.trim() : '';

    // 7) needsReview — boolean 강제 (누락 시 false)
    const cleanNeedsReview = needsReview === true;

    return {
        ok: true,
        clean: {
            intent,
            priority,
            keywords: cleanKeywords,
            questions: cleanQuestions,
            answer: answer.trim(),
            source: cleanSource,
            needsReview: cleanNeedsReview
        }
    };
}

// ------------------------------------------------------------
// 유틸: intent별 다음 id 번호 생성
// ------------------------------------------------------------
// 예: intent='shipping', 기존 최대 SHIP-006 → 'FAQ-SHIP-007'
// 삭제된 번호(gap) 재사용하지 않음 — 히스토리 추적을 위해 단조 증가 유지
function generateNextId(intent, existingItems) {
    const prefix = INTENT_ID_PREFIX[intent];
    if (!prefix) throw new Error(`unknown intent: ${intent}`);

    // FAQ-<PREFIX>-NNN 형태에서 NNN 최대값 탐색
    // 주의: 동일 prefix의 다른 intent는 없지만(shipping→SHIP 유일),
    //       과거에 다른 intent로 쓰였다가 이동된 id가 있을 수 있으므로
    //       prefix 문자열로만 필터링 (현재 intent와 무관)
    const pattern = new RegExp(`^FAQ-${prefix}-(\\d+)$`);
    let maxNum = 0;
    for (const item of existingItems) {
        if (!item || typeof item.id !== 'string') continue;
        const m = item.id.match(pattern);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxNum) maxNum = n;
        }
    }
    const next = maxNum + 1;
    // 3자리 zero-padding (기존 ID 스타일 준수)
    const padded = next.toString().padStart(3, '0');
    return `FAQ-${prefix}-${padded}`;
}

// ============================================================
// 1) GET /faq — 목록 + 필터
// ============================================================
// 쿼리: ?intent=shipping&needsReview=true&q=배송
//  - intent: 해당 intent만 필터
//  - needsReview: 'true'/'false' 문자열로 받음
//  - q: questions[] 또는 answer에 부분 문자열 매칭 (대소문자 무시)
router.get('/faq', (req, res) => {
    try {
        const raw = getRawFaq();
        const items = Array.isArray(raw?.items) ? raw.items : [];

        const { intent, needsReview, q } = req.query;

        // 필터 체인: intent → needsReview → q
        let filtered = items;

        if (intent) {
            if (!VALID_INTENTS.includes(intent)) {
                return res.status(400).json({
                    success: false,
                    error: `intent 파라미터는 ${VALID_INTENTS.join('/')} 중 하나여야 합니다.`
                });
            }
            filtered = filtered.filter(it => it.intent === intent);
        }

        if (needsReview === 'true' || needsReview === 'false') {
            const flag = needsReview === 'true';
            filtered = filtered.filter(it => Boolean(it.needsReview) === flag);
        }

        if (q && typeof q === 'string' && q.trim()) {
            const needle = q.trim().toLowerCase();
            filtered = filtered.filter(it => {
                // questions[] 중 하나라도 매칭 or answer 매칭
                const inQuestions = Array.isArray(it.questions) &&
                    it.questions.some(qq => typeof qq === 'string' && qq.toLowerCase().includes(needle));
                const inAnswer = typeof it.answer === 'string' && it.answer.toLowerCase().includes(needle);
                return inQuestions || inAnswer;
            });
        }

        // byIntent 집계 (필터 후 결과 기준)
        const byIntent = {};
        for (const it of filtered) {
            if (!it.intent) continue;
            byIntent[it.intent] = (byIntent[it.intent] || 0) + 1;
        }

        return res.json({
            success: true,
            items: filtered,
            totalCount: filtered.length,
            byIntent,
            version: raw?.version || 'unknown'
        });
    } catch (e) {
        console.error('[knowledge/GET /faq] 오류:', e);
        return res.status(500).json({ success: false, error: 'FAQ 목록 조회 실패: ' + e.message });
    }
});

// ============================================================
// 2) POST /faq — 신규 FAQ 추가
// ============================================================
// id는 서버가 자동 생성 (body.id는 무시됨)
router.post('/faq', (req, res) => {
    try {
        const v = validateFaqPayload(req.body);
        if (!v.ok) {
            return res.status(400).json({ success: false, error: v.error });
        }

        const raw = getRawFaq();
        const items = Array.isArray(raw?.items) ? [...raw.items] : [];

        // id 자동 생성 (삭제 후 gap 허용, 단조 증가)
        const newId = generateNextId(v.clean.intent, items);
        const newItem = { id: newId, ...v.clean };

        // 새 배열 구성 → 파일 저장 + 캐시 리로드
        items.push(newItem);
        writeFaq(items);

        // 감사 로그 (activityLog는 비동기이며 예외 발생 안 함)
        logActivity('knowledge_faq_add', { id: newId, intent: v.clean.intent }, req.user || {});

        return res.json({ success: true, item: newItem });
    } catch (e) {
        console.error('[knowledge/POST /faq] 오류:', e);
        if (e.code === 'WRITE_BUSY') {
            return res.status(409).json({ success: false, error: e.message });
        }
        return res.status(500).json({ success: false, error: 'FAQ 추가 실패: ' + e.message });
    }
});

// ============================================================
// 3) PUT /faq/:id — 기존 FAQ 수정
// ============================================================
router.put('/faq/:id', (req, res) => {
    try {
        const targetId = req.params.id;
        if (!targetId) {
            return res.status(400).json({ success: false, error: 'id가 필요합니다.' });
        }

        const v = validateFaqPayload(req.body);
        if (!v.ok) {
            return res.status(400).json({ success: false, error: v.error });
        }

        const raw = getRawFaq();
        const items = Array.isArray(raw?.items) ? [...raw.items] : [];
        const idx = items.findIndex(it => it.id === targetId);

        if (idx === -1) {
            return res.status(404).json({ success: false, error: `FAQ ${targetId}를 찾을 수 없습니다.` });
        }

        // id는 유지, 나머지 필드는 v.clean으로 덮어쓰기 (body.id는 무시됨)
        const updatedItem = { id: targetId, ...v.clean };
        items[idx] = updatedItem;

        writeFaq(items);

        logActivity('knowledge_faq_update', { id: targetId, intent: v.clean.intent }, req.user || {});

        return res.json({ success: true, item: updatedItem });
    } catch (e) {
        console.error('[knowledge/PUT /faq/:id] 오류:', e);
        if (e.code === 'WRITE_BUSY') {
            return res.status(409).json({ success: false, error: e.message });
        }
        return res.status(500).json({ success: false, error: 'FAQ 수정 실패: ' + e.message });
    }
});

// ============================================================
// 4) DELETE /faq/:id — 하드 삭제 (복구 불가)
// ============================================================
router.delete('/faq/:id', (req, res) => {
    try {
        const targetId = req.params.id;
        if (!targetId) {
            return res.status(400).json({ success: false, error: 'id가 필요합니다.' });
        }

        const raw = getRawFaq();
        const items = Array.isArray(raw?.items) ? [...raw.items] : [];
        const idx = items.findIndex(it => it.id === targetId);

        if (idx === -1) {
            return res.status(404).json({ success: false, error: `FAQ ${targetId}를 찾을 수 없습니다.` });
        }

        // 배열에서 제거
        items.splice(idx, 1);

        writeFaq(items);

        logActivity('knowledge_faq_delete', { id: targetId }, req.user || {});

        return res.json({ success: true, deletedId: targetId });
    } catch (e) {
        console.error('[knowledge/DELETE /faq/:id] 오류:', e);
        if (e.code === 'WRITE_BUSY') {
            return res.status(409).json({ success: false, error: e.message });
        }
        return res.status(500).json({ success: false, error: 'FAQ 삭제 실패: ' + e.message });
    }
});

// ============================================================
// 5) POST /rebuild — K2 products.json 재빌드 (npm run build-knowledge)
// ============================================================
// 보안 가드 6종 (scratchpad L121~134 설계):
//   1) _rebuilding 플래그 → 동시 실행 차단 (409)
//   2) spawn 인자 하드코딩 — 사용자 입력을 쉘에 붙이지 않음
//   3) stdout/stderr 각 64KB 상한
//   4) close 이벤트/timeout 시 플래그 해제 보장
//   5) exit 0 → reloadKnowledge() 호출 + 200
//   6) exit≠0 → 500 + 로그 반환
router.post('/rebuild', (req, res) => {
    // body의 target은 문서화용 (현재는 products만 지원) — 확장 여지를 위해 받기만 함
    const target = (req.body && req.body.target) || 'products';
    if (target !== 'products') {
        return res.status(400).json({
            success: false,
            error: 'target은 "products"만 지원됩니다. (K1은 파일 저장 시 즉시 반영됨)'
        });
    }

    // 가드 1: 이미 진행 중이면 409
    if (_rebuilding) {
        return res.status(409).json({
            success: false,
            error: '이미 재빌드 진행 중입니다. 잠시 후 다시 시도하세요.'
        });
    }
    _rebuilding = true;
    const startedAt = Date.now();

    // 가드 2: 고정 커맨드 + 고정 인자 배열 (쉘 인젝션 원천 차단)
    // Windows에서 npm은 npm.cmd로 해석되므로 shell:true 필요 (옵션 설명용)
    // cwd는 PROJECT_ROOT(이 파일 기준 정적 계산)로 고정 — process.cwd()는 기동 방식에 따라
    // server/ 로 설정될 수 있어 "Missing script: build-knowledge" 에러가 났었음 (E-16)
    const child = spawn('npm', ['run', 'build-knowledge'], {
        cwd: PROJECT_ROOT,
        shell: true,
        timeout: REBUILD_TIMEOUT_MS,
        // windowsHide:true — 자식 프로세스 콘솔 창이 뜨지 않도록
        windowsHide: true
    });

    // 가드 3: stdout/stderr 버퍼 상한 (64KB 초과분은 잘림)
    // Buffer.concat으로 모은 뒤 slice — 무한 로그로 메모리 폭주 방지
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout.on('data', (chunk) => {
        if (stdoutBytes < MAX_LOG_BYTES) {
            const remain = MAX_LOG_BYTES - stdoutBytes;
            const take = chunk.length <= remain ? chunk : chunk.slice(0, remain);
            stdoutChunks.push(take);
            stdoutBytes += take.length;
        }
    });

    child.stderr.on('data', (chunk) => {
        if (stderrBytes < MAX_LOG_BYTES) {
            const remain = MAX_LOG_BYTES - stderrBytes;
            const take = chunk.length <= remain ? chunk : chunk.slice(0, remain);
            stderrChunks.push(take);
            stderrBytes += take.length;
        }
    });

    // error 이벤트(spawn 실패 등) — close보다 먼저 올 수 있음
    let errored = false;
    child.on('error', (err) => {
        errored = true;
        _rebuilding = false;
        const durationMs = Date.now() - startedAt;
        console.error('[knowledge/rebuild] spawn error:', err);
        logActivity('knowledge_rebuild', {
            success: false,
            duration: durationMs,
            error: err.message
        }, req.user || {});
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: '재빌드 실행 실패: ' + err.message,
                durationMs
            });
        }
    });

    // 가드 4: close 이벤트 — 항상 플래그 해제 + 응답
    child.on('close', (code, signal) => {
        if (errored) return; // error 이벤트에서 이미 응답함
        _rebuilding = false;

        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        const durationMs = Date.now() - startedAt;

        // 타임아웃 감지: signal이 'SIGTERM'이면 timeout으로 간주 (Node spawn timeout 동작)
        const timedOut = signal === 'SIGTERM' && durationMs >= REBUILD_TIMEOUT_MS - 500;

        // 가드 5: exit 0 → 성공 + reloadKnowledge()
        if (code === 0) {
            try {
                const info = reloadKnowledge();
                logActivity('knowledge_rebuild', {
                    success: true,
                    duration: durationMs,
                    productsCount: info.productsCount
                }, req.user || {});
                return res.json({
                    success: true,
                    stdout,
                    stderr,
                    durationMs,
                    info
                });
            } catch (reloadErr) {
                // 빌드는 성공했지만 리로드 실패 — 로그 남기고 부분 성공 응답
                console.error('[knowledge/rebuild] reload 실패:', reloadErr);
                logActivity('knowledge_rebuild', {
                    success: false,
                    duration: durationMs,
                    error: 'reload 실패: ' + reloadErr.message
                }, req.user || {});
                return res.status(500).json({
                    success: false,
                    error: '빌드는 성공했으나 메모리 리로드 실패: ' + reloadErr.message,
                    stdout,
                    stderr,
                    durationMs
                });
            }
        }

        // 가드 6: exit≠0 → 실패
        const errMsg = timedOut
            ? `재빌드 타임아웃 (${REBUILD_TIMEOUT_MS / 1000}초 초과)`
            : `재빌드 프로세스 종료 (exit code ${code})`;
        logActivity('knowledge_rebuild', {
            success: false,
            duration: durationMs,
            error: errMsg,
            exitCode: code
        }, req.user || {});
        return res.status(500).json({
            success: false,
            error: errMsg,
            stdout,
            stderr,
            durationMs,
            exitCode: code
        });
    });
});

export default router;
