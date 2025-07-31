// ==========================================================
// File: routes/sync.routes.js
// Nhiệm vụ: Định nghĩa "đường dẫn" (URL) cho API đồng bộ.
// ==========================================================

const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync.controller');

// Định nghĩa route: Khi có yêu cầu POST đến '/sync', 
// nó sẽ được xử lý bởi hàm syncAllData trong controller.
router.post('/sync', syncController.syncAllData);

module.exports = router;
