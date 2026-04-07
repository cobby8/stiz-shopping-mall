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
const DEFAULT_PRODUCT_CATALOG = {
    sports: [
        { id: 'basketball', label: '농구', icon: 'sports_basketball', sortOrder: 1, active: true },
        { id: 'soccer', label: '축구', icon: 'sports_soccer', sortOrder: 2, active: true },
        { id: 'volleyball', label: '배구', icon: 'sports_volleyball', sortOrder: 3, active: true },
        { id: 'baseball', label: '야구', icon: 'sports_baseball', sortOrder: 4, active: true },
        { id: 'etc', label: '기타', icon: 'checkroom', sortOrder: 99, active: true },
    ],
    categories: [
        { id: 'uniform', label: '유니폼', description: '경기용 상하의 세트', sortOrder: 1, active: true },
        { id: 'shooting_shirt', label: '슈팅셔츠', description: '워밍업용 반팔', sortOrder: 2, active: true },
        { id: 'long_shooting', label: '긴팔슈팅저지', description: '긴팔 워밍업', sortOrder: 3, active: true },
        { id: 'hoodie', label: '후드집업', description: '팀 후드 집업', sortOrder: 4, active: true },
        { id: 'tshirt', label: '반팔티', description: '팀 반팔 티셔츠', sortOrder: 5, active: true },
        { id: 'etc', label: '기타', description: '기타 품목', sortOrder: 99, active: true },
    ],
    sportCategoryMap: null,
    fabrics: [
        { id: 'basic', label: '기본원단 (승화전사)', priceMultiplier: 1.0, description: '가장 많이 사용하는 표준 원단', sortOrder: 1, active: true },
        { id: 'pro', label: '프로원단 (니트)', priceMultiplier: 1.4, description: '프로팀 수준의 고급 원단', sortOrder: 2, active: true },
        { id: 'etc', label: '기타', priceMultiplier: 1.0, description: '별도 상담', sortOrder: 99, active: true },
    ],
    compositions: {
        homeAway: [
            { id: 'home', label: '홈만', multiplier: 1, sortOrder: 1, active: true },
            { id: 'away', label: '어웨이만', multiplier: 1, sortOrder: 2, active: true },
            { id: 'both', label: '홈+어웨이', multiplier: 2, sortOrder: 3, active: true },
        ],
        parts: [
            { id: 'set', label: '상의+하의 세트', multiplier: 1.0, sortOrder: 1, active: true },
            { id: 'top', label: '상의만', multiplier: 0.55, sortOrder: 2, active: true },
            { id: 'bottom', label: '하의만', multiplier: 0.45, sortOrder: 3, active: true },
        ],
        type: [
            { id: 'single', label: '단면', multiplier: 1.0, sortOrder: 1, active: true },
            { id: 'double', label: '양면', multiplier: 1.6, sortOrder: 2, active: true },
        ],
    },
    basePrices: {
        uniform: 50000,
        shooting_shirt: 35000,
        long_shooting: 40000,
        hoodie: 45000,
        tshirt: 25000,
        etc: 0,
    },
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
};

sqliteDb.prepare(`
    INSERT OR IGNORE INTO settings (key, value, updatedAt, updatedBy)
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
