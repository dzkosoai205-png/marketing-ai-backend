// ==========================================================
// File: routes/coupon.routes.js
// ==========================================================

const express = require('express');
const router = express.Router();
const couponController = require('../controllers/coupon.controller');

// Route để LẤY danh sách mã giảm giá
router.get('/coupons', couponController.getAllCoupons);

// --- ROUTE MỚI ---
// Route để TẠO một mã giảm giá mới
router.post('/coupons', couponController.createCoupon);

module.exports = router;
