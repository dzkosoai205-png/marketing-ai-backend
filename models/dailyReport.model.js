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
        unique: true,
        // ==========================================================
        // THÊM: Giá trị mặc định là đầu ngày hiện tại
        // Đảm bảo mỗi ngày chỉ có một báo cáo duy nhất
        // ==========================================================
        default: () => {
            const now = new Date();
            now.setHours(0, 0, 0, 0); // Đặt giờ, phút, giây, mili giây về 0 để lấy đầu ngày
            return now;
        }
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
    },

    // ==========================================================
    // <-- THÊM: Trường để lưu trữ kết quả phân tích AI cho ngày này -->
    // ==========================================================
    ai_analysis_results: { 
        type: mongoose.Schema.Types.Mixed, // Lưu dưới dạng một đối tượng linh hoạt (JSON)
        default: null // Mặc định là null nếu chưa có phân tích AI
    }

}, {
    timestamps: true // Tự động thêm createdAt và updatedAt
});

const DailyReport = mongoose.model('DailyReport', DailyReportSchema);
module.exports = DailyReport;
