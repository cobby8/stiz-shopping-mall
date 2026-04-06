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

// Routes
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';
import customerRoutes from './routes/customers.js';
import { adminAuth } from './middleware/adminAuth.js';
import { startBackupScheduler } from './backup.js';  // 데이터 자동 백업 모듈

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
