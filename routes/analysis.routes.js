// ==========================================================
// File: routes/analysis.routes.js
// Nhiệm vụ: Định nghĩa các "đường dẫn" (URL) cho API phân tích.
// ==========================================================

const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysis.controller');

// Định nghĩa route: Khi có yêu cầu GET đến '/analysis/daily-financials',
// nó sẽ được xử lý bởi hàm getDailyFinancials trong controller.
router.get('/analysis/daily-financials', analysisController.getDailyFinancials);

module.exports = router;
