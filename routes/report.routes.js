// ==========================================================
// File: routes/report.routes.js
// Nhiệm vụ: Định nghĩa "đường dẫn" (URL) cho API báo cáo.
// ==========================================================

const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');

// Định nghĩa route: Khi có yêu cầu POST đến '/reports/daily',
// nó sẽ được xử lý bởi hàm createOrUpdateDailyReport trong controller.
router.post('/reports/daily', reportController.createOrUpdateDailyReport);

module.exports = router;
