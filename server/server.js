import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

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
import { adminAuth } from './middleware/adminAuth.js';
import { startBackupScheduler } from './backup.js';  // 데이터 자동 백업 모듈
import { database as sqliteDb } from './db-sqlite.js'; // settings 시딩용 직접 DB 접근

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
            'POST /api/generate',
        ]
    });
});

// 기존 라우트
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/generate', aiRoutes);

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
