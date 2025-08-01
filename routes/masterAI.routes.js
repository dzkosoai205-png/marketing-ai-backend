// ==========================================================
// File: routes/masterAI.routes.js (Đã thêm route cho AI Chat)
// Nhiệm vụ: Định nghĩa các đường dẫn (URL) cho các API liên quan đến AI.
// ==========================================================

const express = require('express');
const router = express.Router();
// Import controller AI của bạn
const masterAIController = require('../controllers/masterAI.controller');

// Route cho phân tích kinh doanh toàn diện
router.post('/ai/master-analysis', masterAIController.analyzeOverallBusiness);

// ==========================================================
// THÊM: Route mới cho chức năng Chat AI trực tiếp
// ==========================================================
router.post('/ai/chat', masterAIController.handleChat); // Endpoint để gửi tin nhắn chat và nhận phản hồi

module.exports = router;
