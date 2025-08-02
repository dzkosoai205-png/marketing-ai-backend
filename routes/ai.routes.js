// ==========================================================
// File: routes/ai.routes.js
// Nhiệm vụ: Định nghĩa "đường dẫn" (URL) cho API AI mới.
// ==========================================================

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

// Định nghĩa route: Khi có yêu cầu POST đến '/ai/analyze-report',
// nó sẽ được xử lý bởi hàm analyzeDailyReport trong controller.
router.post('/ai/analyze-report', aiController.analyzeDailyReport);

module.exports = router;
