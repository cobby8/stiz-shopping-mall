import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../')); // Serve frontend files from root

// Routes
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';
import { adminAuth } from './middleware/adminAuth.js';

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

// Start Server
app.listen(port, () => {
    console.log(`\nSTIZ Server running at http://localhost:${port}`);
    console.log(`  Routes: /api/auth, /api/orders, /api/admin, /api/generate`);
    console.log(`  DB: JSON file-based (./data/)`);
    console.log(`  Auth: JWT + bcrypt`);
    console.log(`  AI: ${process.env.GOOGLE_API_KEY ? 'Online' : 'Offline (No Key)'}\n`);
});
