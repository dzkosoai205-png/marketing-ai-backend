// ==========================================================
// File: models/dailyReport.model.js (Sửa lỗi Default Date cho múi giờ)
// ==========================================================

const mongoose = require('mongoose');

const DailyReportSchema = new mongoose.Schema({
    report_date: { 
        type: Date, 
        required: true, 
        unique: true,
        // CẬP NHẬT: Không sử dụng default function tự động trên server nữa
        // mà sẽ đảm bảo ngày được chuẩn hóa từ controller/service trước khi lưu
    },

    total_revenue: { 
        type: Number, 
        required: true 
    },
    
    total_profit: { 
        type: Number, 
        required: true 
    },

    notes: {
        type: String
    },

    ai_analysis_results: { 
        type: mongoose.Schema.Types.Mixed, 
        default: null 
    }

}, {
    timestamps: true 
});

const DailyReport = mongoose.model('DailyReport', DailyReportSchema);
module.exports = DailyReport;
