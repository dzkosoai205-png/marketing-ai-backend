// ==========================================================
// File: routes/masterAI.routes.js (File mới)
// ==========================================================
const express = require('express');
const router = express.Router();
const masterAIController = require('../controllers/masterAI.controller');

router.post('/ai/master-analysis', masterAIController.analyzeOverallBusiness);

module.exports = router;
