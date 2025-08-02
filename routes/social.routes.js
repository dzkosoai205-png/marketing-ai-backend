// ==========================================================
// File: routes/social.routes.js
// Nhiệm vụ: Định nghĩa "đường dẫn" (URL) cho các API social media.
// ==========================================================

const express = require('express');
const router = express.Router();
const socialController = require('../controllers/social.controller');

// Định nghĩa route: Khi có yêu cầu POST đến '/social/generate-caption',
// nó sẽ được xử lý bởi hàm generateCaptions trong controller.
router.post('/social/generate-caption', socialController.generateCaptions);

module.exports = router;
