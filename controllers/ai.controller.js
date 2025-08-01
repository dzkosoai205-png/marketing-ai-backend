// ==========================================================
// File: controllers/ai.controller.js
// Nhiệm vụ: Nhận báo cáo, tạo prompt và gọi service AI.
// ==========================================================

const DailyReport = require('../models/dailyReport.model.js');
const Order = require('../models/order.model');
const geminiService = require('../services/gemini.service');

/**
 * Controller để phân tích báo cáo hàng ngày và dữ liệu liên quan.
 */
async function analyzeDailyReport(req, res) {
  console.log('🤖 [AI] Nhận được yêu cầu phân tích báo cáo cuối ngày...');
  try {
    // --- Bước 1: Lấy báo cáo mới nhất bạn vừa nhập ---
    // Sắp xếp theo ngày tạo giảm dần và lấy cái đầu tiên
    const latestReport = await DailyReport.findOne().sort({ createdAt: -1 });

    if (!latestReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo nào để phân tích. Vui lòng nhập báo cáo cuối ngày trước.' });
    }

    // --- Bước 2: Lấy dữ liệu đơn hàng trong ngày để phân tích chi tiết ---
    const reportDate = new Date(latestReport.report_date);
    const nextDay = new Date(reportDate);
    nextDay.setDate(reportDate.getDate() + 1);

    const todaysOrders = await Order.find({
      created_at_haravan: {
        $gte: reportDate,
        $lt: nextDay
      }
    });

    // Trích xuất thông tin quan trọng từ các đơn hàng
    const topProducts = {};
    const usedCoupons = {};
    todaysOrders.forEach(order => {
        order.line_items.forEach(item => {
            topProducts[item.title] = (topProducts[item.title] || 0) + item.quantity;
        });
        order.discount_codes.forEach(coupon => {
            if (coupon && coupon.code) {
                usedCoupons[coupon.code] = (usedCoupons[coupon.code] || 0) + 1;
            }
        });
    });

    // --- Bước 3: Tạo một câu lệnh (prompt) thông minh cho AI ---
    const prompt = `
      Là một chuyên gia phân tích kinh doanh cho một cửa hàng nhỏ, hãy phân tích kết quả kinh doanh của ngày hôm nay và đề xuất kế hoạch cho ngày mai.
      
      Dữ liệu kinh doanh hôm nay:
      - Tổng Doanh thu: ${latestReport.total_revenue.toLocaleString('vi-VN')}đ
      - Tổng Lợi nhuận: ${latestReport.total_profit.toLocaleString('vi-VN')}đ
      - Ghi chú: ${latestReport.notes || 'Không có'}
      - Top 5 sản phẩm bán chạy nhất hôm nay: ${JSON.stringify(Object.entries(topProducts).sort((a, b) => b[1] - a[1]).slice(0, 5))}
      - Các mã giảm giá đã được sử dụng: ${JSON.stringify(usedCoupons)}

      Dựa vào dữ liệu trên, hãy trả về một đối tượng JSON duy nhất có cấu trúc như sau:
      {
        "summary": "Một đoạn tóm tắt ngắn gọn (2-3 câu) về tình hình kinh doanh của ngày hôm nay.",
        "insights": [
          "Nhận định 1: Về mối liên hệ giữa doanh thu và các sản phẩm bán chạy.",
          "Nhận định 2: Về hiệu quả của các mã giảm giá đã được sử dụng."
        ],
        "recommendations": [
          {
            "action": "Đề xuất hành động cụ thể cho ngày mai (ví dụ: Tạo mã giảm giá mới).",
            "details": "Mô tả chi tiết hành động (ví dụ: Tạo mã 'SALE_TOMORROW' giảm 15% cho sản phẩm X).",
            "reason": "Lý do tại sao nên thực hiện hành động này (ví dụ: Để thúc đẩy doanh số cho sản phẩm Y đang bán chậm)."
          },
          {
            "action": "Đề xuất hành động thứ hai (ví dụ: Đẩy mạnh truyền thông).",
            "details": "Mô tả chi tiết hành động (ví dụ: Đăng bài về sản phẩm Z đang hot lên Facebook).",
            "reason": "Lý do tại sao nên thực hiện hành động này."
          }
        ]
      }
    `;

    // Bước 4: Gọi service để gửi prompt đến Gemini
    const analysisResultText = await geminiService.getAnalysisFromAI(prompt);

    // Làm sạch và chuyển đổi văn bản trả về thành JSON
    const jsonString = analysisResultText.replace(/```json\n|```/g, '').trim();
    const analysisResultJson = JSON.parse(jsonString);

    // Bước 5: Trả kết quả về cho frontend
    res.status(200).json(analysisResultJson);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình phân tích AI:', error);
    res.status(500).json({ message: 'Lỗi trong quá trình phân tích AI.', error: error.message });
  }
}

module.exports = {
  analyzeDailyReport
};
