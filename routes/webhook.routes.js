// ==========================================================
// File: routes/webhook.routes.js
// ==========================================================

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// Route cho đơn hàng
router.post('/webhook/order-update', webhookController.handleOrderWebhook);

// --- ROUTE MỚI ---
// Route để nhận webhook cho giỏ hàng bị bỏ quên
router.post('/webhook/abandoned-checkout', webhookController.handleAbandonedCheckoutWebhook);

module.exports = router;
