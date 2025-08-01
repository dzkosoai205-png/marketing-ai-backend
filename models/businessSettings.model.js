// ==========================================================
// File: models/businessSettings.model.js
// Nhiệm vụ: Lưu trữ các chi phí cố định và mục tiêu kinh doanh.
// ==========================================================

const mongoose = require('mongoose');

const BusinessSettingsSchema = new mongoose.Schema({
    // Sẽ chỉ có một bản ghi duy nhất cho toàn bộ cửa hàng
    shop_id: { type: String, required: true, unique: true, default: 'main_settings' },

    // Các chi phí cố định hàng tháng
    monthly_rent_cost: { type: Number, default: 0 }, // Chi phí thuê mặt bằng
    monthly_staff_cost: { type: Number, default: 0 }, // Chi phí lương nhân viên
    monthly_marketing_cost: { type: Number, default: 0 }, // Chi phí marketing
    monthly_other_cost: { type: Number, default: 0 }, // Chi phí khác

    // Mục tiêu do người dùng hoặc AI đặt ra
    monthly_profit_target: { type: Number, default: 0 }, // Mục tiêu lợi nhuận tháng

}, {
    timestamps: true
});

const BusinessSettings = mongoose.model('BusinessSettings', BusinessSettingsSchema);
module.exports = BusinessSettings;
