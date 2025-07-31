// ==========================================================
// File: routes/order.routes.js
// Nhiệm vụ: Định nghĩa các "đường dẫn" (URL) cho API đơn hàng.
// ==========================================================

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');

// Định nghĩa route: Khi có yêu cầu GET đến '/orders', 
// nó sẽ được xử lý bởi hàm getAllOrders trong controller.
router.get('/orders', orderController.getAllOrders);

module.exports = router;
