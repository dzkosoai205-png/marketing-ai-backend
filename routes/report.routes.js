// ==========================================================
// File: routes/reports.routes.js
// Nhiệm vụ: Định nghĩa các đường dẫn (URL) cho các báo cáo kinh doanh.
// ==========================================================

const express = require('express');
const router = express.Router();
const masterAIController = require('../controllers/masterAI.controller'); // Sử dụng lại controller AI

// Route để lưu báo cáo cuối ngày (đã có)
router.post('/reports/daily', async (req, res) => {
    // Logic lưu báo cáo này có thể nằm trực tiếp ở đây hoặc trỏ đến một controller khác
    // Để đơn giản, nếu bạn có DailyReport.create/findOneAndUpdate ở đây, giữ nguyên.
    // Nếu bạn có một controller riêng cho reports, hãy import nó.
    // Giả định bạn có một hàm để lưu báo cáo, ví dụ: reportsController.saveDailyReport
    
    // Nếu bạn đang lưu báo cáo trong handleMasterAiAnalysis, thì route này có thể là nơi gọi hàm đó
    // hoặc một hàm riêng chỉ để lưu. Để phù hợp với ProDashboard, chúng ta sẽ làm thế này:
    const { report_date, total_revenue, total_profit, notes } = req.body;
    try {
        const reportDateObj = new Date(report_date);
        reportDateObj.setHours(0,0,0,0); // Đảm bảo đầu ngày
        const updatedReport = await require('../models/dailyReport.model').findOneAndUpdate(
            { report_date: reportDateObj },
            { $set: { total_revenue, total_profit, notes, report_date: reportDateObj } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`✅ Đã lưu báo cáo cho ngày: ${new Date(updatedReport.report_date).toLocaleDateString('vi-VN')}`);
        res.status(200).json({ message: 'Báo cáo đã được lưu.', report: updatedReport });
    } catch (error) {
        console.error('❌ Lỗi khi lưu báo cáo ngày:', error);
        res.status(500).json({ message: 'Lỗi khi lưu báo cáo ngày.', error: error.message });
    }
});


// ==========================================================
// THÊM: Route mới để lấy báo cáo theo ngày
// ==========================================================
router.get('/reports/daily-by-date', masterAIController.getDailyReportByDate); // Trỏ đến hàm mới trong masterAI.controller.js
// ==========================================================
// THÊM: API MỚI để lấy tất cả báo cáo trong một tháng cụ thể
// ==========================================================
router.get('/reports/monthly', async (req, res) => {
    const { month, year } = req.query; // Ví dụ: ?month=8&year=2025

    if (!month || !year) {
        return res.status(400).json({ message: 'Missing month or year query parameter.' });
    }

    const targetMonth = parseInt(month, 10);
    const targetYear = parseInt(year, 10);

    if (isNaN(targetMonth) || isNaN(targetYear) || targetMonth < 1 || targetMonth > 12) {
        return res.status(400).json({ message: 'Invalid month or year format.' });
    }

    try {
        // Tạo ngày bắt đầu và kết thúc của tháng
        const startDate = new Date(targetYear, targetMonth - 1, 1); // Tháng trong JS là 0-11
        const endDate = new Date(targetYear, targetMonth, 0);       // Ngày 0 của tháng tiếp theo là ngày cuối cùng của tháng này

        // Truy vấn database để lấy tất cả báo cáo trong khoảng thời gian này
        const monthlyReports = await DailyReport.find({
            report_date: {
                $gte: startDate, // Lớn hơn hoặc bằng ngày bắt đầu
                $lte: endDate    // Nhỏ hơn hoặc bằng ngày kết thúc
            }
        }).sort({ report_date: 1 }); // Sắp xếp theo ngày để dễ xem

        console.log(`✅ Đã lấy ${monthlyReports.length} báo cáo cho tháng ${month}/${year}`);
        res.status(200).json(monthlyReports);
    } catch (error) {
        console.error('❌ Lỗi khi lấy báo cáo hàng tháng:', error);
        res.status(500).json({ message: 'Lỗi khi lấy báo cáo hàng tháng.', error: error.message });
    }
});

module.exports = router;