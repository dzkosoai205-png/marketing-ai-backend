// ==========================================================
// File: routes/social.routes.js
// PHIÊN BẢN NÂNG CẤP: Thêm route cho chức năng tạo kịch bản.
// ==========================================================

const express = require('express');
const router = express.Router();
const socialController = require('../controllers/social.controller');

// Route để tạo caption (đã có)
router.post('/social/generate-caption', socialController.generateCaptions);

// ✨ ROUTE MỚI: Route để tạo kịch bản TikTok
router.post('/social/generate-script', socialController.generateScripts);

module.exports = router;
