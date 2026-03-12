import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import aiRoutes from './routes/ai.js';

app.get('/', (req, res) => {
    res.json({
        name: 'STIZ API Server',
        version: '2.0.0',
        endpoints: [
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/orders',
            'GET  /api/orders',
            'GET  /api/orders/:orderNumber',
            'POST /api/generate',
        ]
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/generate', aiRoutes);

// Start Server
app.listen(port, () => {
    console.log(`\nSTIZ Server running at http://localhost:${port}`);
    console.log(`  Routes: /api/auth, /api/orders, /api/generate`);
    console.log(`  DB: JSON file-based (./data/)`);
    console.log(`  AI: ${process.env.GOOGLE_API_KEY ? 'Online' : 'Offline (No Key)'}\n`);
});
