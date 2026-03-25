import express from 'express';
import db from '../db.js';

const router = express.Router();

// POST /api/orders - Create order
router.post('/', (req, res) => {
    try {
        const order = req.body;

        // Basic validation
        if (!order.customer || !order.customer.name || !order.customer.email) {
            return res.status(400).json({ success: false, error: 'Customer info required' });
        }
        if (!order.items || order.items.length === 0) {
            return res.status(400).json({ success: false, error: 'Cart is empty' });
        }
        if (!order.shipping || !order.shipping.address) {
            return res.status(400).json({ success: false, error: 'Shipping address required' });
        }

        order.status = 'pending';
        order.createdAt = new Date().toISOString();

        const saved = db.insert('orders', order);
        console.log(`[Order] New order: ${saved.orderNumber} (${saved.items.length} items, ₩${saved.total})`);

        res.json({
            success: true,
            orderNumber: saved.orderNumber,
            message: 'Order placed successfully'
        });
    } catch (error) {
        console.error('[Order] Error:', error);
        res.status(500).json({ success: false, error: 'Failed to process order' });
    }
});

// GET /api/orders - List orders
router.get('/', (req, res) => {
    const orders = db.getAll('orders');
    res.json({ success: true, orders });
});

// GET /api/orders/:id - Get order by order number
router.get('/:orderNumber', (req, res) => {
    const orders = db.getAll('orders');
    const order = orders.find(o => o.orderNumber === req.params.orderNumber);
    if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, order });
});

export default router;
