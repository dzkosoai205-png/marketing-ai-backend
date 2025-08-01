// ==========================================================
// File: routes/accounting.routes.js (File mới)
// ==========================================================
const express = require('express');
const router = express.Router();
const accountingController = require('../controllers/accounting.controller');

// Routes cho Cài đặt Kinh doanh (Chi phí, Mục tiêu)
router.get('/accounting/settings', accountingController.getBusinessSettings);
router.post('/accounting/settings', accountingController.saveBusinessSettings);

// Routes cho Sự kiện Chi tiền
router.get('/accounting/events', accountingController.getFinancialEvents);
router.post('/accounting/events', accountingController.addFinancialEvent);

module.exports = router;