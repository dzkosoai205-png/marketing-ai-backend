// ==========================================================
// File: models/coupon.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một mã giảm giá trong MongoDB.
// ==========================================================

const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
    // Chúng ta sẽ lưu lại các trường quan trọng từ Haravan
    id: { type: Number, required: true, unique: true }, // ID từ Haravan
    code: { type: String, required: true },
    discount_type: { type: String, required: true }, // 'fixed_amount', 'percentage'
    value: { type: Number, required: true },
    starts_at: { type: Date },
    ends_at: { type: Date },
    usage_limit: { type: Number },
    // Thêm các trường khác nếu bạn cần phân tích sâu hơn
}, {
    timestamps: true // Tự động thêm 2 trường createdAt và updatedAt
});

// Tạo và xuất model để các file khác có thể sử dụng
const Coupon = mongoose.model('Coupon', CouponSchema);
module.exports = Coupon;
