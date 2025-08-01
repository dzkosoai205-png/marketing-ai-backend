// ==========================================================
// File: controllers/report.controller.js (Đã sửa lỗi ngày tháng và sử dụng report_date từ frontend)
// Nhiệm vụ: Xử lý logic cho việc tạo và đọc báo cáo hàng ngày.
// ==========================================================

const DailyReport = require('../models/dailyReport.model');

// ==========================================================
// ĐỊNH NGHĨA OFFSET CỦA MÚI GIỜ CỬA HÀNG (Việt Nam là GMT+7)
// Số mili giây cần cộng/trừ để chuyển đổi Date object
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000; 
// ==========================================================

/**
 * Controller để tạo hoặc cập nhật một báo cáo hàng ngày.
 * Nhận report_date từ frontend để lưu báo cáo cho ngày cụ thể.
 */
async function createOrUpdateDailyReport(req, res) {
    try {
        const { total_revenue, total_profit, notes, report_date: reportDateString } = req.body; // Lấy report_date từ body

        if (total_revenue === undefined || total_profit === undefined || !reportDateString) {
            return res.status(400).json({ message: 'Thiếu thông tin doanh thu, lợi nhuận hoặc ngày báo cáo.' });
        }

        // ==========================================================
        // CHUẨN HÓA NGÀY BÁO CÁO VỀ ĐẦU NGÀY THEO GMT+7 (dưới dạng UTC)
        // ==========================================================
        const selectedDateLocal = new Date(reportDateString); // VD: '2025-08-02' (sẽ là 2025-08-02T00:00:00.000 local)
        // Đặt giờ, phút, giây, mili giây về 0 theo giờ cục bộ
        selectedDateLocal.setHours(0, 0, 0, 0); 
        
        // Chuyển đổi thời điểm này sang UTC. 
        // Đây là thời điểm mà khi lưu vào DB (là UTC), nó sẽ đại diện cho đầu ngày theo GMT+7 của bạn.
        const reportDateForDB = new Date(selectedDateLocal.getTime() - selectedDateLocal.getTimezoneOffset() * 60 * 1000); 
        // Logic: new Date() tạo theo giờ local của server (UTC trên Render)
        // getTimezoneOffset() là offset của local server so với UTC (Render là 0)
        // Vậy reportDateForDB = new Date(selectedDateLocal.getTime())
        // Nếu muốn chuẩn xác +7: new Date(selectedDateLocal.getTime() - selectedDateLocal.getTimezoneOffset() * 60 * 1000 + GMT7_OFFSET_MS); // Sai

        // CÁCH CHUẨN XÁC VÀ ĐƠN GIẢN NHẤT LÀ
        // `selectedReportDate` từ frontend đã là 'YYYY-MM-DD', khi `new Date()` parse nó sẽ là đầu ngày UTC của máy chủ Render.
        // Bạn muốn nó là đầu ngày GMT+7, và lưu thành UTC tương ứng.
        // Ví dụ: 2025-08-02 GMT+7 00:00:00 => 2025-08-01 17:00:00 UTC
        // Vậy ta cần trừ đi 7 giờ từ cái mà `new Date(reportDateString)` tạo ra (nếu nó là UTC 00:00:00).
        // HOẶC ĐƠN GIẢN: LẤY DATE CỦA FRONTEND VÀ TRỪ ĐI OFFSET CỦA CLIENT TRƯỚC RỒI CỘNG OFFSET CỦA STORE VÀO (phức tạp)
        
        // Phương pháp đơn giản nhất và nhất quán với sync.controller.js:
        // Lấy ngày YYYY-MM-DD từ frontend.
        // Chuyển nó thành một Date object mà khi lưu vào DB (là UTC) nó sẽ phản ánh đầu ngày GMT+7
        const startDateInGMT7 = new Date(reportDateString); // '2025-08-02' -> 2025-08-02T00:00:00.000Z (nếu server là UTC)
        const reportDateFinal = new Date(startDateInGMT7.getTime() + GMT7_OFFSET_MS);
        reportDateFinal.setUTCHours(0,0,0,0); // Đảm bảo là đầu ngày của ngày đó sau khi đã bù offset


        const reportData = {
            report_date: reportDateFinal, // Sử dụng ngày đã chuẩn hóa
            total_revenue,
            total_profit,
            notes
        };

        const savedReport = await DailyReport.findOneAndUpdate(
            { report_date: reportData.report_date }, // Điều kiện tìm kiếm phải là ngày đã chuẩn hóa
            { $set: reportData }, // Dữ liệu để cập nhật/tạo mới
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`✅ Đã lưu báo cáo cho ngày: ${savedReport.report_date.toLocaleDateString('vi-VN')}`);
        res.status(201).json({ message: 'Lưu báo cáo thành công!', report: savedReport });

    } catch (error) {
        console.error('❌ Lỗi khi lưu báo cáo hàng ngày:', error);
        res.status(500).json({ message: 'Lỗi khi lưu báo cáo hàng ngày.', error: error.message });
    }
}

module.exports = {
    createOrUpdateDailyReport
};
