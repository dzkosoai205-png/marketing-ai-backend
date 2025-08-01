// ==========================================================
// File: controllers/ai.controller.js
// Phiên bản này đã được nâng cấp toàn diện cho cả 2 bộ não AI.
// ==========================================================

const Order = require('../models/order.model');
const Customer = require('../models/customer.model');
const DailyReport = require('../models/dailyReport.model.js');
const BusinessSettings = require('../models/businessSettings.model.js');
const FinancialEvent = require('../models/financialEvent.model.js');
const geminiService = require('../services/gemini.service');

// --- BỘ NÃO 1: PHÂN TÍCH BÁO CÁO KẾ TOÁN (NÂNG CẤP) ---
async function analyzeDailyReport(req, res) {
  console.log('🤖 [AI] Nhận được yêu cầu phân tích kế toán...');
  try {
    // Bước 1: Lấy tất cả dữ liệu cần thiết
    const [latestReport, settings, upcomingEvents, todaysOrders] = await Promise.all([
        DailyReport.findOne().sort({ report_date: -1 }),
        BusinessSettings.findOne({ shop_id: 'main_settings' }),
        FinancialEvent.find({ due_date: { $gte: new Date() }, is_paid: false }).sort({ due_date: 1 }),
        Order.find({ created_at_haravan: { $gte: new Date(new Date().setHours(0,0,0,0)) } })
    ]);

    if (!latestReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo nào để phân tích.' });
    }

    // Bước 2: Tạo một prompt toàn diện cho AI
    const prompt = `
      Là một Giám đốc Tài chính (CFO) ảo cho một cửa hàng nhỏ, hãy phân tích các dữ liệu sau và đưa ra một bản báo cáo tổng quan.
      
      Dữ liệu kinh doanh hôm nay:
      - Doanh thu: ${latestReport.total_revenue.toLocaleString('vi-VN')}đ
      - Lợi nhuận: ${latestReport.total_profit.toLocaleString('vi-VN')}đ
      - Ghi chú của chủ shop: ${latestReport.notes || 'Không có'}
      - Số đơn hàng hôm nay: ${todaysOrders.length}

      Dữ liệu vận hành hàng tháng:
      - Chi phí cố định (thuê, lương, etc.): ${((settings?.monthly_rent_cost || 0) + (settings?.monthly_staff_cost || 0) + (settings?.monthly_marketing_cost || 0) + (settings?.monthly_other_cost || 0)).toLocaleString('vi-VN')}đ
      - Mục tiêu lợi nhuận tháng: ${ (settings?.monthly_profit_target || 0).toLocaleString('vi-VN')}đ

      Các sự kiện chi tiền lớn sắp tới:
      ${JSON.stringify(upcomingEvents.map(e => ({name: e.event_name, amount: e.amount, due_date: e.due_date.toLocaleDateString('vi-VN')}))) }

      Dựa vào TOÀN BỘ dữ liệu trên, hãy trả về một đối tượng JSON duy nhất có cấu trúc:
      {
        "summary": "Tóm tắt (2-3 câu) về tình hình tài chính hôm nay, so sánh lợi nhuận với chi phí và mục tiêu.",
        "cash_flow_alert": {
          "has_alert": true, // true nếu có rủi ro, false nếu không
          "message": "Cảnh báo về dòng tiền nếu có sự kiện chi tiền lớn sắp tới mà lợi nhuận hiện tại không đủ để đáp ứng. Ví dụ: 'Cảnh báo: Bạn cần kiếm thêm X triệu trong Y ngày tới để thanh toán cho sự kiện Z.' Nếu không có rủi ro, hãy ghi 'Dòng tiền hiện tại ổn định.'"
        },
        "insights": [
          "Nhận định 1 về mối liên hệ giữa lợi nhuận hôm nay và mục tiêu tháng.",
          "Nhận định 2 về áp lực của các khoản chi sắp tới lên dòng tiền."
        ],
        "recommendations": [
          { 
            "action": "Đề xuất chiến lược cụ thể để đạt mục tiêu hoặc giải quyết cảnh báo dòng tiền.", 
            "details": "Chi tiết hành động (ví dụ: Tạo mã giảm giá 'SALE10' giảm 10% cho các sản phẩm bán chạy).", 
            "reason": "Lý do tại sao nên làm vậy." 
          },
          { 
            "action": "Đề xuất thứ hai.", 
            "details": "Chi tiết hành động.", 
            "reason": "Lý do."
          }
        ]
      }
    `;

    const analysisResultText = await geminiService.getAnalysisFromAI(prompt);
    const jsonString = analysisResultText.replace(/```json\n|```/g, '').trim();
    const analysisResultJson = JSON.parse(jsonString);
    res.status(200).json(analysisResultJson);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình phân tích AI Kế toán:', error);
    res.status(500).json({ message: 'Lỗi trong quá trình phân tích AI Kế toán.', error: error.message });
  }
}

// --- BỘ NÃO 2: PHÂN TÍCH DỮ LIỆU KHUYẾN MÃI (SỬA LỖI) ---
async function analyzePromoData(req, res) {
  console.log('🤖 [AI] Nhận được yêu cầu phân tích khuyến mãi...');
  try {
    const [orders, customers] = await Promise.all([
      Order.find({ financial_status: 'paid' }).sort({ created_at_haravan: -1 }).limit(200),
      Customer.find({}).sort({ total_spent: -1 }).limit(50)
    ]);

    const prompt = `
      Là một chuyên gia marketing e-commerce, hãy phân tích dữ liệu sau của một cửa hàng bán đồ anime và trả về một đối tượng JSON:
      - Dữ liệu 10 đơn hàng gần nhất có mã giảm giá: ${JSON.stringify(orders.filter(o => o.discount_codes.length > 0).slice(0, 10).map(o => ({total_price: o.total_price, discount_codes: o.discount_codes, customer_email: o.email})))}
      - Dữ liệu 5 khách hàng chi tiêu nhiều nhất: ${JSON.stringify(customers.slice(0, 5).map(c => ({total_spent: c.total_spent, orders_count: c.orders_count, email: c.email})))}

      Cấu trúc JSON trả về:
      {
        "insights": ["Nhận định 1 về loại mã giảm giá hiệu quả.", "Nhận định 2 về nhóm khách hàng phản ứng tốt với khuyến mãi."],
        "campaign_plan": {
          "event_name": "Chiến dịch cho ngày Sale Lớn sắp tới",
          "target_audience": "Mô tả nhóm khách hàng mục tiêu.",
          "suggestions": [
            { "code": "BIGSALE_CODE", "description": "Mô tả chi tiết mã.", "reason": "Lý do đề xuất." }
          ]
        },
        "ab_testing": [
          { "code": "TEST_CODE_A", "description": "Mô tả chi tiết mã thử nghiệm A.", "reason": "Lý do và giả thuyết thử nghiệm." }
        ]
      }
    `;

    const analysisResultText = await geminiService.getAnalysisFromAI(prompt);
    const jsonString = analysisResultText.replace(/```json\n|```/g, '').trim();
    const analysisResultJson = JSON.parse(jsonString);
    res.status(200).json(analysisResultJson);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình phân tích khuyến mãi:', error);
    res.status(500).json({ message: 'Lỗi trong quá trình phân tích khuyến mãi.', error: error.message });
  }
}

module.exports = {
  analyzeDailyReport,
  analyzePromoData
};
