// ==========================================================
// File: controllers/ai.controller.js (Cập nhật)
// Chứa cả 2 bộ não AI cho Kế toán và Khuyến mãi.
// ==========================================================
const Order = require('../models/order.model');
const Customer = require('../models/customer.model');
const DailyReport = require('../models/dailyReport.model.js');
const geminiService = require('../services/gemini.service');

// --- BỘ NÃO 1: PHÂN TÍCH BÁO CÁO KẾ TOÁN ---
async function analyzeDailyReport(req, res) {
  console.log('🤖 [AI] Nhận được yêu cầu phân tích báo cáo cuối ngày...');
  try {
    const latestReport = await DailyReport.findOne().sort({ createdAt: -1 });
    if (!latestReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo nào để phân tích.' });
    }
    const reportDate = new Date(latestReport.report_date);
    const nextDay = new Date(reportDate);
    nextDay.setDate(reportDate.getDate() + 1);
    const todaysOrders = await Order.find({ created_at_haravan: { $gte: reportDate, $lt: nextDay } });
    const topProducts = {};
    const usedCoupons = {};
    todaysOrders.forEach(order => {
        order.line_items.forEach(item => { topProducts[item.title] = (topProducts[item.title] || 0) + item.quantity; });
        order.discount_codes.forEach(coupon => { if (coupon && coupon.code) { usedCoupons[coupon.code] = (usedCoupons[coupon.code] || 0) + 1; }});
    });
    const prompt = `Là một chuyên gia phân tích kinh doanh, hãy phân tích kết quả kinh doanh hôm nay và đề xuất kế hoạch cho ngày mai. Dữ liệu: Doanh thu: ${latestReport.total_revenue.toLocaleString('vi-VN')}đ, Lợi nhuận: ${latestReport.total_profit.toLocaleString('vi-VN')}đ, Ghi chú: ${latestReport.notes || 'Không có'}, Top sản phẩm bán chạy: ${JSON.stringify(Object.entries(topProducts).sort((a, b) => b[1] - a[1]).slice(0, 5))}, Mã giảm giá đã dùng: ${JSON.stringify(usedCoupons)}. Trả về một đối tượng JSON có cấu trúc: {"summary": "Tóm tắt (2-3 câu) về tình hình kinh doanh hôm nay.", "insights": ["Nhận định 1 về doanh thu/lợi nhuận.", "Nhận định 2 về sản phẩm/mã giảm giá."],"recommendations": [{"action": "Đề xuất hành động 1.", "details": "Chi tiết hành động 1.", "reason": "Lý do." }, { "action": "Đề xuất hành động 2.", "details": "Chi tiết hành động 2.", "reason": "Lý do." }]}`;
    const analysisResultText = await geminiService.getAnalysisFromAI(prompt);
    const jsonString = analysisResultText.replace(/```json\n|```/g, '').trim();
    const analysisResultJson = JSON.parse(jsonString);
    res.status(200).json(analysisResultJson);
  } catch (error) {
    console.error('❌ Lỗi trong quá trình phân tích AI Kế toán:', error);
    res.status(500).json({ message: 'Lỗi trong quá trình phân tích AI Kế toán.', error: error.message });
  }
}

// --- BỘ NÃO 2: PHÂN TÍCH DỮ LIỆU KHUYẾN MÃI ---
async function analyzePromoData(req, res) {
  console.log('🤖 [AI] Nhận được yêu cầu phân tích khuyến mãi...');
  try {
    const [orders, customers] = await Promise.all([
      Order.find({ financial_status: 'paid' }).sort({ created_at_haravan: -1 }).limit(200),
      Customer.find({}).sort({ total_spent: -1 }).limit(50)
    ]);
    const prompt = `Là một chuyên gia marketing e-commerce, hãy phân tích dữ liệu sau của một cửa hàng bán đồ anime và trả về một đối tượng JSON: Dữ liệu 10 đơn hàng gần nhất có mã giảm giá: ${JSON.stringify(orders.filter(o => o.discount_codes.length > 0).slice(0, 10).map(o => ({total_price: o.total_price, discount_codes: o.discount_codes, customer_email: o.email})))}, Dữ liệu 5 khách hàng chi tiêu nhiều nhất: ${JSON.stringify(customers.slice(0, 5).map(c => ({total_spent: c.total_spent, orders_count: c.orders_count, email: c.email})))}. Cấu trúc JSON trả về: {"insights": ["Nhận định 1 về loại mã giảm giá hiệu quả.", "Nhận định 2 về nhóm khách hàng phản ứng tốt với khuyến mãi."],"campaign_plan": {"event_name": "Chiến dịch cho ngày Sale Lớn sắp tới","target_audience": "Mô tả nhóm khách hàng mục tiêu.","suggestions": [{ "code": "BIGSALE_CODE", "description": "Mô tả chi tiết mã.", "reason": "Lý do đề xuất." }]},"ab_testing": [{ "code": "TEST_CODE_A", "description": "Mô tả chi tiết mã thử nghiệm A.", "reason": "Lý do và giả thuyết thử nghiệm." }]}`;
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