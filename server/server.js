import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// __dirname 기준으로 .env 경로를 명시 — 어디서 실행해도 .env를 찾을 수 있다
const __filename_main = fileURLToPath(import.meta.url);
const __dirname_main = path.dirname(__filename_main);
dotenv.config({ path: path.join(__dirname_main, '.env') });

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
// __dirname: server/ 폴더 → 한 단계 위(프로젝트 루트)를 정적 파일로 서빙
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '..')));

// 업로드 파일 정적 서빙 — /uploads/designs/xxx.png 같은 URL로 직접 접근 가능 (A-4)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';
import customerRoutes from './routes/customers.js';
import catalogRoutes from './routes/catalog.js';      // 상품 카탈로그 API (A-2)
import uploadRoutes from './routes/upload.js';          // 파일 업로드 API (A-4)
import productRoutes from './routes/products.js';       // 상품 CRUD API (E-2)
import reviewRoutes from './routes/reviews.js';         // 상품 리뷰 API (F-4)
import cartRoutes from './routes/cart.js';               // 장바구니 서버 동기화 API (#3)
import paymentRoutes from './routes/payment.js';         // 토스페이먼츠 결제 API
import boardRoutes from './routes/board.js';               // 게시판 API (공지+문의)
import wishlistRoutes from './routes/wishlist.js';         // 위시리스트(찜) API
import couponRoutes from './routes/coupon.js';               // 쿠폰/적립금 API (#15)
import { adminAuth } from './middleware/adminAuth.js';
import { startBackupScheduler } from './backup.js';  // 데이터 자동 백업 모듈
import { database as sqliteDb } from './db-sqlite.js'; // settings 시딩용 직접 DB 접근
import fs from 'fs';  // CSV 파일 읽기용

app.get('/', (req, res) => {
    res.json({
        name: 'STIZ API Server',
        version: '2.1.0',
        endpoints: [
            'POST /api/auth/register',
            'POST /api/auth/login',
            'GET  /api/auth/me',
            'POST /api/orders',
            'GET  /api/orders',
            'GET  /api/orders/track/:orderNumber',
            'GET  /api/orders/:orderNumber',
            'GET  /api/admin/orders          (admin only)',
            'GET  /api/admin/orders/:id      (admin only)',
            'PUT  /api/admin/orders/:id      (admin only)',
            'PATCH /api/admin/orders/:id/status (admin only)',
            'GET  /api/admin/orders/:id/history (admin only)',
            'GET  /api/admin/stats           (admin only)',
            'GET  /api/admin/customers       (admin only)',
            'GET  /api/admin/customers/:id   (admin only)',
            'PUT  /api/admin/customers/:id   (admin only)',
            'POST /api/admin/customers/merge (admin only)',
            'GET  /api/admin/customers/stats/summary (admin only)',
            'GET  /api/admin/backup          (admin only)',
            'GET  /api/admin/reviews         (admin only)',
            'GET  /api/products/:id/reviews',
            'POST /api/products/:id/reviews  (login required)',
            'PUT  /api/reviews/:id           (login required)',
            'DELETE /api/reviews/:id         (login required)',
            'GET  /api/cart                 (login required)',
            'POST /api/cart                 (login required)',
            'DELETE /api/cart/:id           (login required)',
            'POST /api/cart/merge           (login required)',
            'GET  /api/payment/config',
            'POST /api/payment/confirm',
            'POST /api/generate',
            'GET  /api/auth/me/orders    (login required)',
            'PUT  /api/auth/me/profile   (login required)',
            'GET  /api/board?type=notice',
            'GET  /api/board?type=inquiry (login required)',
            'GET  /api/board/:id',
            'POST /api/board             (login required)',
            'PUT  /api/admin/board/:id/answer (admin only)',
            'DELETE /api/admin/board/:id  (admin only)',
            'GET  /api/wishlist          (login required)',
            'POST /api/wishlist          (login required)',
            'DELETE /api/wishlist/:productId (login required)',
            'GET  /api/coupons/check?code=xxx',
            'POST /api/admin/coupons      (admin only)',
            'GET  /api/admin/coupons       (admin only)',
            'POST /api/newsletter/subscribe',
            'POST /api/newsletter/unsubscribe',
            'GET  /api/auth/sns/status',
            'GET  /api/auth/kakao',
            'GET  /api/auth/kakao/callback',
            'GET  /api/auth/naver',
            'GET  /api/auth/naver/callback',
        ]
    });
});

// 기존 라우트
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/generate', aiRoutes);

// 리뷰 라우트 — /api/admin/reviews가 adminRoutes보다 먼저 매칭되어야 함
// reviewRoutes 내부에서 requireAuth/adminAuth를 개별 적용
app.use('/api', reviewRoutes);

// 관리자 전용 라우트 - adminAuth 미들웨어가 "보안 검색대" 역할
// adminAuth를 통과한 요청만 admin 라우트에 도달
app.use('/api/admin', adminAuth, adminRoutes);

// 고객 관리 라우트 - 관리자 전용 (adminAuth 적용)
app.use('/api/admin/customers', adminAuth, customerRoutes);

// 카탈로그 라우트 — 공개 API + 관리자 API 모두 포함 (A-2)
// catalogRoutes 내부에서 adminAuth를 개별 적용 (공개 GET은 인증 불필요)
app.use('/api', catalogRoutes);

// 업로드 라우트 — 공개(reference) + 관리자(design/temp) 모두 포함 (A-4)
// uploadRoutes 내부에서 /upload/reference는 인증 불필요, /admin/upload/*는 adminAuth 경유
app.use('/api', uploadRoutes);

// 상품 라우트 — 공개(목록/상세/카테고리/추천) + 관리자(CRUD/이미지/카테고리관리) (E-2)
// productRoutes 내부에서 /admin/* 엔드포인트에 adminAuth를 개별 적용
app.use('/api', productRoutes);

// (reviewRoutes는 위에서 /api/admin보다 먼저 등록됨)

// 장바구니 라우트 — 로그인 사용자 전용 서버 동기화 (#3)
// cartRoutes 내부에서 requireAuth를 개별 적용
app.use('/api', cartRoutes);

// 결제 라우트 — PortOne PG 결제 인프라 (#1)
// config 엔드포인트는 공개, prepare/complete는 공개 (주문 시 호출)
app.use('/api', paymentRoutes);

// 게시판 라우트 — 공개(공지 목록) + 로그인(문의 작성) + 관리자(답변/삭제)
// boardRoutes 내부에서 requireAuth, adminAuth를 개별 적용
app.use('/api', boardRoutes);

// 위시리스트 라우트 — 로그인 사용자 전용
// wishlistRoutes 내부에서 requireAuth를 개별 적용
app.use('/api', wishlistRoutes);

// 쿠폰 라우트 — 공개(유효성 검증) + 관리자(생성/목록) (#15)
// couponRoutes 내부에서 adminAuth를 개별 적용
app.use('/api', couponRoutes);

// ============================================================
// 뉴스레터 구독 API (#18)
// 비유: 매장 입구의 "이메일 뉴스 신청서" — 이메일만 적으면 구독 완료
// 별도 라우트 파일 없이 server.js에 직접 정의 (2개 엔드포인트뿐이므로)
// ============================================================

// POST /api/newsletter/subscribe — 이메일 구독 신청
app.post('/api/newsletter/subscribe', (req, res) => {
    try {
        const { email } = req.body;

        // 이메일 형식 검증
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, error: '올바른 이메일을 입력해주세요.' });
        }

        const trimmedEmail = email.trim().toLowerCase();

        // 이미 구독 중인지 확인
        const existing = sqliteDb.prepare('SELECT * FROM newsletter_subscribers WHERE email = ?').get(trimmedEmail);
        if (existing) {
            // 구독 취소했던 사용자 → 다시 활성화
            if (!existing.isActive) {
                sqliteDb.prepare('UPDATE newsletter_subscribers SET isActive = 1 WHERE email = ?').run(trimmedEmail);
                return res.json({ success: true, message: '뉴스레터 구독이 다시 활성화되었습니다.' });
            }
            return res.json({ success: true, message: '이미 구독 중입니다.' });
        }

        // 신규 구독자 등록
        sqliteDb.prepare('INSERT INTO newsletter_subscribers (email) VALUES (?)').run(trimmedEmail);
        console.log(`[Newsletter] 신규 구독: ${trimmedEmail}`);
        res.json({ success: true, message: '뉴스레터 구독이 완료되었습니다!' });
    } catch (error) {
        console.error('[Newsletter] 구독 실패:', error);
        res.status(500).json({ success: false, error: '구독 처리 중 오류가 발생했습니다.' });
    }
});

// POST /api/newsletter/unsubscribe — 구독 취소
app.post('/api/newsletter/unsubscribe', (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: '이메일을 입력해주세요.' });
        }

        const trimmedEmail = email.trim().toLowerCase();
        const result = sqliteDb.prepare('UPDATE newsletter_subscribers SET isActive = 0 WHERE email = ? AND isActive = 1').run(trimmedEmail);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: '구독 내역을 찾을 수 없습니다.' });
        }

        console.log(`[Newsletter] 구독 취소: ${trimmedEmail}`);
        res.json({ success: true, message: '뉴스레터 구독이 취소되었습니다.' });
    } catch (error) {
        console.error('[Newsletter] 구독 취소 실패:', error);
        res.status(500).json({ success: false, error: '구독 취소 중 오류가 발생했습니다.' });
    }
});

// --- settings 테이블 초기 시딩 (A-1) ---
// 비유: 식당 오픈 전에 기본 메뉴판을 세팅하는 것. 이미 메뉴판이 있으면 건드리지 않음
// INSERT OR IGNORE: key가 이미 존재하면 무시하고 건너뜀
// --- 새 카탈로그 구조 (Part 7 가격/구성 고도화) ---
// 기존: 기본가 x 배수 = 가격 (계산기 방식)
// 변경: 종목+등급+패키지 조합별 고정가 (가격표 사전 방식)
const DEFAULT_PRODUCT_CATALOG = {
    // ===== 1. 종목 =====
    // 팀웨어를 별도 "종목"으로 분리 (종목 무관 품목이므로)
    sports: [
        { id: 'basketball', label: '농구', icon: 'sports_basketball', sortOrder: 1, active: true },
        { id: 'soccer', label: '축구', icon: 'sports_soccer', sortOrder: 2, active: true },
        { id: 'volleyball', label: '배구', icon: 'sports_volleyball', sortOrder: 3, active: true },
        { id: 'teamwear', label: '팀웨어', icon: 'checkroom', sortOrder: 4, active: true },
    ],

    // ===== 2. 등급 (기존 fabrics → grades로 개념 변경) =====
    // "원단"이 아니라 "등급"이 맞는 표현. 등급마다 원단이 정해져 있음
    grades: [
        { id: 'basic', label: '베이직', fabric: '플랫백메쉬+', sortOrder: 1, active: true },
        { id: 'pro', label: '프로', fabric: '컴포트헥사곤', sortOrder: 2, active: true },
        { id: 'authentic', label: '어센틱', fabric: '어센틱', sortOrder: 3, active: true },
        { id: 'reversible', label: '양면', fabric: '스퀘어메쉬', sortOrder: 4, active: true },
    ],

    // ===== 3. 품목 (그룹별 분류: uniform / teamwear / casual) =====
    categories: [
        // 유니폼 (종목에 따라 등급 제한)
        { id: 'uniform', label: '유니폼', group: 'uniform', sortOrder: 1, active: true },
        // 팀웨어 — 슈팅저지
        { id: 'shooting_halfzip_ss', label: '반집업 반팔 슈팅저지', group: 'teamwear', sortOrder: 10, active: true },
        { id: 'shooting_halfzip_ls', label: '반집업 긴팔 슈팅저지', group: 'teamwear', sortOrder: 11, active: true },
        { id: 'shooting_fullzip_ss', label: '풀집업 반팔 슈팅저지', group: 'teamwear', sortOrder: 12, active: true },
        { id: 'shooting_fullzip_ls', label: '풀집업 긴팔 슈팅저지', group: 'teamwear', sortOrder: 13, active: true },
        { id: 'shooting_pro_ls', label: '프로 긴팔 슈팅셔츠', group: 'teamwear', sortOrder: 14, active: true },
        // 팀웨어 — 전사티
        { id: 'sublim_basic', label: '베이직 반팔 전사티', group: 'teamwear', sortOrder: 20, active: true },
        { id: 'sublim_pro', label: '프로 반팔 전사티', group: 'teamwear', sortOrder: 21, active: true },
        { id: 'sublim_coolmesh', label: '쿨메쉬 반팔 전사티', group: 'teamwear', sortOrder: 22, active: true },
        // 팀웨어 — 트랙탑 웜업
        { id: 'tracktop_top', label: '트랙탑 웜업 상의', group: 'teamwear', sortOrder: 30, active: true },
        { id: 'tracktop_bottom', label: '트랙탑 웜업 하의', group: 'teamwear', sortOrder: 31, active: true },
        { id: 'tracktop_set', label: '트랙탑 웜업 세트', group: 'teamwear', sortOrder: 32, active: true },
        // 팀웨어 — 후드 웜업
        { id: 'hood_top', label: '후드 웜업 상의', group: 'teamwear', sortOrder: 40, active: true },
        { id: 'hood_bottom', label: '후드 웜업 하의', group: 'teamwear', sortOrder: 41, active: true },
        { id: 'hood_set', label: '후드 웜업 세트', group: 'teamwear', sortOrder: 42, active: true },
        // 캐주얼
        { id: 'casual_tee', label: '캐주얼 반팔티', group: 'casual', sortOrder: 50, active: true },
        { id: 'casual_hoodie_zip', label: '캐주얼 후드집업', group: 'casual', sortOrder: 51, active: true },
        { id: 'casual_hoodie', label: '캐주얼 후드티', group: 'casual', sortOrder: 52, active: true },
        { id: 'casual_mtm', label: '캐주얼 맨투맨', group: 'casual', sortOrder: 53, active: true },
    ],

    // ===== 4. 구성 패키지 (핵심 변경!) =====
    // 기존 compositions.parts(세트/상의/하의 3개) 대신
    // 구체적인 조합 목록. 가격은 priceTable에서 참조
    packages: [
        { id: 'top', label: '상의', topCount: 1, bottomCount: 0, sortOrder: 1, active: true },
        { id: 'bottom', label: '하의', topCount: 0, bottomCount: 1, sortOrder: 2, active: true },
        { id: 'set', label: '세트 (상의+하의)', topCount: 1, bottomCount: 1, sortOrder: 3, active: true },
        { id: 'top2_bottom1', label: '상의 2벌 + 하의 1벌', topCount: 2, bottomCount: 1, sortOrder: 4, active: true },
        { id: 'top2_bottom2', label: '상의 2벌 + 하의 2벌', topCount: 2, bottomCount: 2, sortOrder: 5, active: true },
        // 양면 전용 혼합 패키지
        { id: 'rev_top_basic_bottom', label: '양면 상의 + 베이직 하의', topCount: 1, bottomCount: 1, mixedGrade: 'basic', sortOrder: 10, active: true },
        { id: 'rev_top_pro_bottom', label: '양면 상의 + 프로 하의', topCount: 1, bottomCount: 1, mixedGrade: 'pro', sortOrder: 11, active: true },
        { id: 'rev_top_rev_bottom', label: '양면 상의 + 양면 하의', topCount: 1, bottomCount: 1, sortOrder: 12, active: true },
    ],

    // ===== 5. 가격표 (핵심 변경!) =====
    // 키 형식: "{sport}_{grade}_{package}" — 유니폼
    //          "teamwear__{category}" — 팀웨어 (등급 없이 품목이 가격 결정)
    priceTable: {
        // 농구 유니폼
        basketball_basic_top: 33000,
        basketball_basic_bottom: 33000,
        basketball_basic_set: 60000,
        basketball_basic_top2_bottom1: 80000,
        basketball_basic_top2_bottom2: 100000,
        basketball_pro_top: 38000,
        basketball_pro_bottom: 38000,
        basketball_pro_set: 70000,
        basketball_pro_top2_bottom1: 90000,
        basketball_pro_top2_bottom2: 110000,
        basketball_authentic_top: 50000,
        basketball_authentic_bottom: 50000,
        basketball_authentic_set: 90000,
        basketball_authentic_top2_bottom2: 160000,
        basketball_reversible_top: 40000,
        basketball_reversible_bottom: 40000,
        basketball_reversible_rev_top_basic_bottom: 70000,
        basketball_reversible_rev_top_pro_bottom: 75000,
        basketball_reversible_rev_top_rev_bottom: 80000,
        // 축구 유니폼
        soccer_basic_top: 33000,
        soccer_basic_bottom: 33000,
        soccer_basic_set: 60000,
        soccer_basic_top2_bottom1: 80000,
        soccer_basic_top2_bottom2: 100000,
        soccer_pro_top: 38000,
        soccer_pro_bottom: 38000,
        soccer_pro_set: 70000,
        soccer_pro_top2_bottom1: 90000,
        soccer_pro_top2_bottom2: 110000,
        // 배구 유니폼
        volleyball_pro_top: 38000,
        volleyball_pro_bottom: 38000,
        volleyball_pro_set: 70000,
        volleyball_pro_top2_bottom1: 90000,
        // 팀웨어 (종목/등급 무관, 품목이 가격 결정)
        teamwear__shooting_halfzip_ss: 45000,
        teamwear__shooting_halfzip_ls: 50000,
        teamwear__shooting_fullzip_ss: 50000,
        teamwear__shooting_fullzip_ls: 55000,
        teamwear__shooting_pro_ls: 40000,
        teamwear__sublim_basic: 30000,
        teamwear__sublim_pro: 35000,
        teamwear__sublim_coolmesh: 35000,
        teamwear__tracktop_top: 70000,
        teamwear__tracktop_bottom: 70000,
        teamwear__tracktop_set: 120000,
        teamwear__hood_top: 80000,
        teamwear__hood_bottom: 70000,
        teamwear__hood_set: 130000,
        teamwear__casual_tee: 38000,
        teamwear__casual_hoodie_zip: 75000,
        teamwear__casual_hoodie: 65000,
        teamwear__casual_mtm: 55000,
    },

    // ===== 6. 종목-등급 허용 조합 =====
    // 어떤 종목에서 어떤 등급을 선택할 수 있는지 제한
    sportGradeMap: {
        basketball: ['basic', 'pro', 'authentic', 'reversible'],
        soccer: ['basic', 'pro'],
        volleyball: ['pro'],
        // teamwear는 등급 선택 없음 (품목 자체가 가격 결정)
    },

    // ===== 7. 등급-패키지 허용 조합 =====
    gradePackageMap: {
        basic: ['top', 'bottom', 'set', 'top2_bottom1', 'top2_bottom2'],
        pro: ['top', 'bottom', 'set', 'top2_bottom1', 'top2_bottom2'],
        authentic: ['top', 'bottom', 'set', 'top2_bottom2'],
        reversible: ['top', 'bottom', 'rev_top_basic_bottom', 'rev_top_pro_bottom', 'rev_top_rev_bottom'],
    },

    // ===== 8. 마감 옵션 (가격 영향 없음, 제작 참고용) =====
    finishOptions: {
        top: [
            { id: 'sambong', label: '삼봉마감', sortOrder: 1, active: true },
            { id: 'armhole', label: '암홀립', sortOrder: 2, active: true },
        ],
        bottom: [
            { id: 'no_slit', label: '트임X', sortOrder: 1, active: true },
            { id: 'slit', label: '트임', sortOrder: 2, active: true },
        ],
    },

    // ===== 9. 할인 정책 =====
    discounts: [
        { id: 'school_sports_club', label: '학교스포츠클럽', type: 'fixed_price', active: true,
          description: '학교스포츠클럽 대상 특별 단가 적용' },
        { id: 'promo_10', label: '신학기 프로모션 10%', type: 'percent', value: 10, active: false,
          description: '신학기 프로모션 기간 10% 할인' },
        { id: 'promo_15', label: '신학기 프로모션 15%', type: 'percent', value: 15, active: false,
          description: '신학기 프로모션 기간 15% 할인' },
    ],

    // 학교스포츠클럽 전용 가격표 (할인 type='fixed_price'일 때 참조)
    discountPriceTable: {
        basketball_basic_top: 25000,
        basketball_basic_bottom: 25000,
        basketball_basic_set: 45000,
        basketball_basic_top2_bottom1: 65000,
        basketball_basic_top2_bottom2: 85000,
        basketball_pro_top: 30000,
        basketball_pro_bottom: 30000,
        basketball_pro_set: 50000,
        basketball_pro_top2_bottom1: 75000,
        basketball_pro_top2_bottom2: 95000,
        basketball_reversible_top: 35000,
        basketball_reversible_rev_top_basic_bottom: 55000,
        basketball_reversible_rev_top_pro_bottom: 60000,
    },

    // ===== 10. 사이즈 프리셋 (카테고리별 분리) =====
    sizePresets: {
        custom: ['5XS','4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL'],
        casual_standard: ['5XS','4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL'],
        casual_slim: ['XS','S','M','L','XL','2XL','3XL'],
        casual_hood: ['S','M','L','XL','2XL','3XL'],
        brand: ['S','M','L','XL','2XL','3XL'],
        volleyball_men: ['3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL'],
        volleyball_women: ['3XS','2XS','XS','S','M','L','XL','2XL'],
    },

    // 품목 → 사이즈 프리셋 연결
    categorySizeMap: {
        uniform: 'custom',
        casual_tee: 'casual_standard',
        casual_hoodie_zip: 'casual_hood',
        casual_hoodie: 'casual_hood',
        casual_mtm: 'casual_hood',
        // 나머지 팀웨어는 'custom' 기본
    },

    // ===== 11. 홈/어웨이 (기존 유지) =====
    homeAway: [
        { id: 'home', label: '홈만', multiplier: 1, sortOrder: 1, active: true },
        { id: 'away', label: '어웨이만', multiplier: 1, sortOrder: 2, active: true },
        { id: 'both', label: '홈+어웨이', multiplier: 2, sortOrder: 3, active: true },
    ],

    // ===== 하위 호환용 (기존 API 소비자가 참조할 수 있으므로 유지) =====
    fabrics: [],          // grades로 대체됨
    compositions: null,   // packages + homeAway로 대체됨
    basePrices: {},       // priceTable로 대체됨
    sizes: ['5XS','4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL'],
};

// INSERT OR REPLACE: 서버 재시작 시 항상 최신 카탈로그 구조로 덮어쓰기
// 관리자가 UI에서 수정한 값은 관리자 API(PUT)로 저장되므로 충돌 없음
// 주의: 관리자 수정 후 서버 재시작하면 여기 값으로 초기화됨 (운영 시 IGNORE로 변경 고려)
sqliteDb.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updatedAt, updatedBy)
    VALUES ('product_catalog', @value, @updatedAt, @updatedBy)
`).run({
    value: JSON.stringify(DEFAULT_PRODUCT_CATALOG),
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
});

// ============================================================
// Phase E-1: 상품 시스템 초기 시딩
// 비유: 새 매장 오픈 시 카테고리 팻말 달고, 상품을 진열하는 작업
// 서버 시작할 때 한 번만 실행 (테이블이 비어있을 때만 삽입)
// ============================================================

// --- CSV 파싱 헬퍼 ---
// 따옴표 안의 쉼표를 무시하고, 필드를 정확히 분리하는 함수
// 비유: 택배 상자의 내용물 목록에서 "콤마가 포함된 품명"을 올바르게 분리
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            // 따옴표 시작/종료 토글
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            // 따옴표 밖의 쉼표 = 필드 구분자
            fields.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current.trim()); // 마지막 필드
    return fields;
}

// --- 가격 문자열 → 숫자 변환 ---
// "85,000" → 85000, 빈값/비숫자 → 0
function parsePrice(str) {
    if (!str) return 0;
    const cleaned = str.replace(/,/g, '').replace(/"/g, '').trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
}

// --- 1) 카테고리 시딩: 대분류 4개 + 중분류 14개 ---
const catCount = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM product_categories').get().cnt;
if (catCount === 0) {
    console.log('[E-1] 상품 카테고리 시딩 시작...');

    // 대분류 4개 (parentId = NULL)
    const majors = [
        { id: 1, name: 'BRAND', slug: 'brand', sortOrder: 1 },
        { id: 2, name: 'CUSTOM', slug: 'custom', sortOrder: 2 },
        { id: 3, name: '팀웨어', slug: 'teamwear', sortOrder: 3 },
        { id: 4, name: '캐주얼', slug: 'casual', sortOrder: 4 },
    ];

    // 중분류 14개 (parentId = 대분류 id)
    const minors = [
        // BRAND 하위
        { id: 10, name: '농구의류', slug: 'brand-basketball', parentId: 1, sortOrder: 1 },
        { id: 11, name: 'SHIRTS', slug: 'brand-shirts', parentId: 1, sortOrder: 2 },
        { id: 12, name: 'BOTTOM', slug: 'brand-bottom', parentId: 1, sortOrder: 3 },
        { id: 13, name: 'HOODIE', slug: 'brand-hoodie', parentId: 1, sortOrder: 4 },
        { id: 14, name: 'MTM', slug: 'brand-mtm', parentId: 1, sortOrder: 5 },
        // CUSTOM 하위
        { id: 20, name: '농구', slug: 'custom-basketball', parentId: 2, sortOrder: 1 },
        { id: 21, name: '축구', slug: 'custom-soccer', parentId: 2, sortOrder: 2 },
        { id: 22, name: '배구', slug: 'custom-volleyball', parentId: 2, sortOrder: 3 },
        // 팀웨어 하위
        { id: 30, name: '슈팅저지', slug: 'teamwear-shooting', parentId: 3, sortOrder: 1 },
        { id: 31, name: '전사티', slug: 'teamwear-sublim', parentId: 3, sortOrder: 2 },
        { id: 32, name: '트랙탑 웜업', slug: 'teamwear-tracktop', parentId: 3, sortOrder: 3 },
        { id: 33, name: '후드 웜업', slug: 'teamwear-hood', parentId: 3, sortOrder: 4 },
        // 캐주얼 하위
        { id: 40, name: '캐주얼 의류', slug: 'casual-apparel', parentId: 4, sortOrder: 1 },
        { id: 41, name: '캐주얼 아우터', slug: 'casual-outer', parentId: 4, sortOrder: 2 },
    ];

    const now = new Date().toISOString();
    const insertCat = sqliteDb.prepare(`
        INSERT INTO product_categories (id, name, slug, parentId, sortOrder, active, createdAt, updatedAt)
        VALUES (@id, @name, @slug, @parentId, @sortOrder, 1, @now, @now)
    `);

    const seedCategories = sqliteDb.transaction(() => {
        for (const m of majors) {
            insertCat.run({ ...m, parentId: null, now });
        }
        for (const m of minors) {
            insertCat.run({ ...m, now });
        }
    });
    seedCategories();
    console.log(`[E-1] 카테고리 ${majors.length + minors.length}개 시딩 완료`);
}

// --- 2) 상품 시딩: CSV 파싱하여 products 테이블에 삽입 ---
const prodCount = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM products').get().cnt;
if (prodCount === 0) {
    const csvPath = path.join(__dirname, '..', 'dev', 'price-sheet.csv');
    if (fs.existsSync(csvPath)) {
        console.log('[E-1] 상품 CSV 파싱 시작...');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(l => l.trim());

        // 첫 줄 = 헤더 (건너뛰기)
        // CSV 컬럼 매핑 (0-based):
        // 0:대분류, 1:중분류, 2:소분류, 3:제품명, 4:영문제품명, 5:제품코드
        // 6:상품 간략설명, 8:제조원가, 9:학교스포츠클럽가격, 12:판매가
        // 25:도매가, 26:사이즈, 29:원단, 32:키워드

        // 중분류명 → categoryId 매핑 (CSV의 중분류 값에 맞춰)
        // 대분류가 CUSTOM인 경우 중분류(종목)로 매핑
        // 대분류가 BRAND인 경우 중분류로 매핑
        const brandCatMap = {
            '농구의류': 10, 'SHIRTS': 11, 'BOTTOM': 12, 'HOODIE': 13, 'MTM': 14,
        };
        const customCatMap = {
            '농구': 20, '축구': 21, '배구': 22,
        };
        // CUSTOM+팀웨어 → 소분류로 세부 카테고리 매핑
        const teamwearCatMap = {
            '슈팅저지 (반집업)': 30, '슈팅저지 (풀집업)': 30, '슈팅셔츠 (프로)': 30,
            '반팔 전사티': 31, '트랙탑 웜업': 32, '후드 웜업': 33,
            '캐주얼 반팔티': 40, '캐주얼 후드집업': 41, '캐주얼 후드티': 41, '캐주얼 맨투맨': 40,
        };

        const now = new Date().toISOString();
        const insertProd = sqliteDb.prepare(`
            INSERT INTO products (id, type, categoryId, name, nameEn, sku, description,
                price, costPrice, clubPrice, wholesalePrice,
                sizes, fabric, keywords, customMeta, status, sortOrder, createdAt, updatedAt)
            VALUES (@id, @type, @categoryId, @name, @nameEn, @sku, @description,
                @price, @costPrice, @clubPrice, @wholesalePrice,
                @sizes, @fabric, @keywords, @customMeta, 'active', @sortOrder, @now, @now)
        `);

        let insertedCount = 0;
        const seedProducts = sqliteDb.transaction(() => {
            for (let i = 1; i < lines.length; i++) {
                // 헤더 행(첫 번째 줄)이 2줄에 걸쳐 있으므로, 2번째 줄도 헤더면 건너뛰기
                const fields = parseCSVLine(lines[i]);
                const majorCat = fields[0]; // 대분류: BRAND 또는 CUSTOM
                if (!majorCat || (majorCat !== 'BRAND' && majorCat !== 'CUSTOM')) continue;

                const minorCat = fields[1]; // 중분류
                const subCat = fields[2];   // 소분류
                const prodName = fields[3]; // 제품명
                if (!prodName) continue;    // 제품명 없으면 건너뛰기

                // type 결정: BRAND → ready, CUSTOM → custom
                const type = majorCat === 'BRAND' ? 'ready' : 'custom';

                // categoryId 결정
                let categoryId = null;
                if (majorCat === 'BRAND') {
                    categoryId = brandCatMap[minorCat] || null;
                } else {
                    // CUSTOM: 중분류가 '팀웨어'면 소분류로 카테고리 결정
                    if (minorCat === '팀웨어') {
                        categoryId = teamwearCatMap[subCat] || 30; // 기본값: 슈팅저지
                    } else {
                        categoryId = customCatMap[minorCat] || null;
                    }
                }

                const nameEn = fields[4] || '';
                const sku = fields[5] || '';
                const description = fields[6] || '';
                const costPrice = parsePrice(fields[8]);
                const clubPrice = parsePrice(fields[9]);
                const price = parsePrice(fields[12]);
                const wholesalePrice = parsePrice(fields[25]);
                const sizes = fields[26] || '';
                const fabric = fields[29] || '';
                const keywords = fields[32] || '';

                // 커스텀 상품의 경우 소분류 정보를 customMeta에 저장
                const customMeta = type === 'custom'
                    ? JSON.stringify({ subCategory: subCat || '', sport: minorCat || '' })
                    : '{}';

                insertProd.run({
                    id: Date.now() * 1000 + i, // 고유 ID 생성 (타임스탬프 + 인덱스)
                    type, categoryId, name: prodName, nameEn, sku, description,
                    price, costPrice, clubPrice, wholesalePrice,
                    sizes, fabric, keywords, customMeta,
                    sortOrder: i, now,
                });
                insertedCount++;
            }
        });
        seedProducts();
        console.log(`[E-1] 상품 ${insertedCount}개 시딩 완료 (CSV 파싱)`);
    } else {
        console.log('[E-1] CSV 파일 미발견, 상품 시딩 건너뜀:', csvPath);
    }
}

// --- 3) 사이즈 옵션 시딩: 커스텀 상품에 사이즈 옵션 자동 생성 ---
const optCount = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM product_options').get().cnt;
if (optCount === 0) {
    console.log('[E-1] 사이즈 옵션 시딩 시작...');

    // 커스텀 상품 목록 조회 (사이즈가 있는 것만)
    const customProducts = sqliteDb.prepare(
        "SELECT id, sizes FROM products WHERE type = 'custom' AND sizes != ''"
    ).all();

    // 사이즈 범위 문자열을 개별 사이즈 배열로 변환
    // '5XS~5XL' → ['5XS','4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL']
    const ALL_SIZES = ['5XS','4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL'];

    function expandSizeRange(sizeStr) {
        if (!sizeStr) return [];
        // 여러 줄이나 구분자가 있으면 첫 번째 범위만 사용
        const firstLine = sizeStr.split('\n')[0].trim();
        // '스탠다드 : 5XS~5XL' 같은 접두어 제거
        const cleaned = firstLine.replace(/^[^:：]*[:：]\s*/, '').trim();
        // '~' 또는 '-'로 분리
        const parts = cleaned.split(/[~\-]/);
        if (parts.length === 2) {
            const start = parts[0].trim();
            const end = parts[1].trim();
            const startIdx = ALL_SIZES.indexOf(start);
            const endIdx = ALL_SIZES.indexOf(end);
            if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
                return ALL_SIZES.slice(startIdx, endIdx + 1);
            }
        }
        // 범위 파싱 실패 시 전체 반환
        return ALL_SIZES;
    }

    const insertOpt = sqliteDb.prepare(`
        INSERT INTO product_options (id, productId, optionType, optionValue, priceAdjust, stock, sortOrder, active)
        VALUES (@id, @productId, 'size', @optionValue, 0, -1, @sortOrder, 1)
    `);

    let optInserted = 0;
    const seedOptions = sqliteDb.transaction(() => {
        for (const prod of customProducts) {
            const sizes = expandSizeRange(prod.sizes);
            for (let j = 0; j < sizes.length; j++) {
                insertOpt.run({
                    id: prod.id + j + 1,  // 고유 ID
                    productId: prod.id,
                    optionValue: sizes[j],
                    sortOrder: j,
                });
                optInserted++;
            }
        }
    });
    seedOptions();
    console.log(`[E-1] 사이즈 옵션 ${optInserted}개 시딩 완료 (${customProducts.length}개 상품)`);
}

// ============================================================
// 미이전 카테고리 6개 시딩 (#16)
// 비유: 아직 빈 진열대만 준비해두는 것 — 상품은 관리자가 나중에 등록
// INSERT OR IGNORE: slug가 이미 있으면 건너뜀 (중복 안전)
// ============================================================
const seedCategories = sqliteDb.transaction(() => {
    const insertCat = sqliteDb.prepare(`
        INSERT OR IGNORE INTO product_categories (name, slug, parentId, sortOrder, active, createdAt, updatedAt)
        VALUES (?, ?, NULL, ?, 1, datetime('now'), datetime('now'))
    `);
    const newCats = [
        { name: 'MOLTEN', slug: 'molten', sort: 100 },
        { name: 'E-SPORTS', slug: 'esports', sort: 101 },
        { name: '잠스트', slug: 'zamst', sort: 102 },
        { name: '스킬즈', slug: 'skillz', sort: 103 },
        { name: '스포츠테이핑', slug: 'taping', sort: 104 },
        { name: '한국중고농구연맹', slug: 'kjbl', sort: 105 },
    ];
    let inserted = 0;
    for (const cat of newCats) {
        const result = insertCat.run(cat.name, cat.slug, cat.sort);
        if (result.changes > 0) inserted++;
    }
    if (inserted > 0) {
        console.log(`[#16] 미이전 카테고리 ${inserted}개 시딩 완료`);
    }
});
seedCategories();

// ============================================================
// W-4: 게시판 초기 공지사항 시딩
// 비유: 새 가게를 열 때 안내문을 미리 붙여두는 것
// board_posts가 비어있을 때만 기본 공지 삽입 (중복 방지)
// ============================================================
{
    const boardCount = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM board_posts').get().cnt;
    if (boardCount === 0) {
        const defaultNotices = [
            {
                boardType: 'notice',
                title: 'STIZ 쇼핑몰에 오신 것을 환영합니다',
                content: 'STIZ는 프로급 스포츠 유니폼을 맞춤 제작하는 전문 브랜드입니다.\n\n커스텀 주문, 단체 주문, 기성품 구매까지 다양한 서비스를 제공합니다.\n\n문의사항은 1:1 문의를 이용해주세요.',
                authorName: 'STIZ'
            },
            {
                boardType: 'notice',
                title: '배송 안내',
                content: '• 주문 제작 상품: 디자인 확정 후 2~3주 소요\n• 기성품: 결제 확인 후 1~3일 이내 발송\n• 배송비: 5만원 이상 무료 (미만 3,000원)',
                authorName: 'STIZ'
            },
            {
                boardType: 'notice',
                title: '교환/반품 안내',
                content: '• 기성품: 수령 후 7일 이내 교환/반품 가능 (미착용, 택 부착 상태)\n• 커스텀 제작 상품: 주문 특성상 교환/반품 불가\n• 불량 상품: 수령 후 14일 이내 무조건 교환/환불',
                authorName: 'STIZ'
            }
        ];

        const insertNotice = sqliteDb.prepare(`
            INSERT INTO board_posts (boardType, title, content, authorName, authorEmail, userId, isSecret, status, createdAt, updatedAt)
            VALUES (@boardType, @title, @content, @authorName, 'admin@stiz.co.kr', NULL, 0, 'active', datetime('now'), datetime('now'))
        `);

        const seedNotices = sqliteDb.transaction(() => {
            for (const notice of defaultNotices) {
                insertNotice.run(notice);
            }
        });
        seedNotices();
        console.log(`[W-4] 기본 공지사항 ${defaultNotices.length}개 시딩 완료`);
    }
}

// W-5: 인코딩 깨진 상품 정리
// archived 상태라 고객에게 안 보이지만, DB 정리 차원에서 삭제
{
    const broken = sqliteDb.prepare("SELECT id, name FROM products WHERE id = 1775725936459379").get();
    if (broken) {
        sqliteDb.prepare("DELETE FROM products WHERE id = 1775725936459379").run();
        console.log(`[W-5] 인코딩 깨진 상품 삭제: id=${broken.id}`);
    }
}

// Start Server
app.listen(port, () => {
    console.log(`\nSTIZ Server running at http://localhost:${port}`);
    console.log(`  Routes: /api/auth, /api/orders, /api/admin, /api/admin/customers, /api/generate`);
    console.log(`  DB: SQLite (server/data/stiz.db)`);
    console.log(`  Auth: JWT + bcrypt`);
    console.log(`  AI: ${process.env.GOOGLE_API_KEY ? 'Online (Gemini)' : 'Offline (No GOOGLE_API_KEY)'}`);

    // 서버 시작 시 자동 백업 스케줄러 가동
    // 비유: 서버가 문을 열면 금고 관리인도 함께 출근하는 것
    startBackupScheduler();
    console.log('');
});
