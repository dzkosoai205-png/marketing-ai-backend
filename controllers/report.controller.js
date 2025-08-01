// ==========================================================
// File: controllers/report.controller.js
// Nhiệm vụ: Xử lý logic cho việc tạo và đọc báo cáo hàng ngày.
// ==========================================================

const DailyReport = require('../models/dailyReport.model.js');

/**
 * Controller để tạo hoặc cập nhật một báo cáo hàng ngày.
 */
async function createOrUpdateDailyReport(req, res) {
  try {
    // Lấy dữ liệu từ body của request mà frontend gửi lên
    const { total_revenue, total_profit, notes } = req.body;

    if (total_revenue === undefined || total_profit === undefined) {
      return res.status(400).json({ message: 'Thiếu thông tin doanh thu hoặc lợi nhuận.' });
    }

    // --- Xử lý ngày tháng theo múi giờ Việt Nam ---
    const now = new Date();
    const vietnamOffset = 7 * 60 * 60 * 1000;
    const nowInVietnam = new Date(now.getTime() + vietnamOffset);
    
    // Lấy ngày bắt đầu của hôm nay (00:00:00)
    const todayStart = new Date(nowInVietnam);
    todayStart.setUTCHours(0, 0, 0, 0);

    const reportData = {
        report_date: todayStart,
        total_revenue,
        total_profit,
        notes
    };

    // Tìm và cập nhật báo cáo cho ngày hôm nay.
    // Nếu chưa có, `upsert: true` sẽ tự động tạo mới.
    const savedReport = await DailyReport.findOneAndUpdate(
        { report_date: todayStart }, // Điều kiện tìm kiếm
        reportData, // Dữ liệu để cập nhật/tạo mới
        { upsert: true, new: true } // Tùy chọn
    );

    console.log(`✅ Đã lưu báo cáo cho ngày: ${todayStart.toLocaleDateString('vi-VN')}`);
    res.status(201).json({ message: 'Lưu báo cáo thành công!', report: savedReport });

  } catch (error) {
    console.error('❌ Lỗi khi lưu báo cáo hàng ngày:', error);
    res.status(500).json({ message: 'Lỗi khi lưu báo cáo hàng ngày.', error: error.message });
  }
}

module.exports = {
  createOrUpdateDailyReport
};
