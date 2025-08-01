// ==========================================================
// File: routes/ai.routes.js
// Nhiệm vụ: Định nghĩa "đường dẫn" (URL) cho API AI.
// ==========================================================

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

// Định nghĩa route: Khi có yêu cầu POST đến '/ai/analyze',
// nó sẽ được xử lý bởi hàm analyzeBusinessData trong controller.
router.post('/ai/analyze', aiController.analyzeBusinessData);

module.exports = router;
