// ==========================================================
// File: routes/customer.routes.js
// Nhiệm vụ: Định nghĩa các "đường dẫn" (URL) cho API khách hàng.
// ==========================================================

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');

// Định nghĩa route: Khi có yêu cầu GET đến '/customers', 
// nó sẽ được xử lý bởi hàm getAllCustomers trong controller.
router.get('/customers', customerController.getAllCustomers);

module.exports = router;
