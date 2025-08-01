// ==========================================================
// File: models/dailyReport.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một báo cáo kinh doanh hàng ngày.
// ==========================================================

const mongoose = require('mongoose');

const DailyReportSchema = new mongoose.Schema({
    // Ngày của báo cáo, sẽ là duy nhất
    report_date: { 
        type: Date, 
        required: true, 
        unique: true 
    },

    // Dữ liệu do người dùng nhập thủ công
    total_revenue: { 
        type: Number, 
        required: true 
    }, // Tổng doanh thu
    
    total_profit: { 
        type: Number, 
        required: true 
    }, // Tổng lợi nhuận

    // Ghi chú thêm của người dùng (nếu có)
    notes: {
        type: String
    }

}, {
    timestamps: true // Tự động thêm createdAt và updatedAt
});

const DailyReport = mongoose.model('DailyReport', DailyReportSchema);
module.exports = DailyReport;
