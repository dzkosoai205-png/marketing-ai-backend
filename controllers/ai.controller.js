// ==========================================================
// File: controllers/ai.controller.js
// Nhiệm vụ: Chuẩn bị dữ liệu, tạo prompt và gọi service AI.
// ==========================================================

const Order = require('../models/order.model');
const Customer = require('../models/customer.model');
const geminiService = require('../services/gemini.service');

/**
 * Controller để nhận yêu cầu phân tích, xử lý và trả về kết quả từ AI.
 */
async function analyzeBusinessData(req, res) {
  console.log('🤖 [AI] Nhận được yêu cầu phân tích...');
  try {
    // Bước 1: Lấy toàn bộ dữ liệu cần thiết từ database
    const [orders, customers] = await Promise.all([
      Order.find({ financial_status: 'paid' }).sort({ created_at_haravan: -1 }).limit(100), // Lấy 100 đơn hàng gần nhất
      Customer.find({}).sort({ total_spent: -1 }).limit(50) // Lấy 50 khách hàng chi tiêu nhiều nhất
    ]);

    // Bước 2: Tạo một câu lệnh (prompt) chi tiết cho AI
    const prompt = `
      Là một chuyên gia phân tích dữ liệu bán lẻ cho một cửa hàng nhỏ, hãy phân tích dữ liệu sau:
      - Tổng số đơn hàng đã thanh toán: ${orders.length}
      - Tổng số khách hàng: ${customers.length}
      - Dữ liệu 5 đơn hàng gần nhất: ${JSON.stringify(orders.slice(0, 5), null, 2)}
      - Dữ liệu 5 khách hàng chi tiêu nhiều nhất: ${JSON.stringify(customers.slice(0, 5), null, 2)}

      Dựa vào dữ liệu trên, hãy đưa ra:
      1. **Ba (3) nhận định chính** về hành vi mua sắm của khách hàng.
      2. **Hai (2) đề xuất chiến lược cụ thể** cho tháng tới.
      3. **Hai (2) mã giảm giá thử nghiệm (A/B testing)** mà tôi có thể tạo ra, bao gồm: code, loại giảm giá, giá trị, và lý do tại sao nên thử nghiệm mã đó.

      Hãy trình bày kết quả dưới dạng markdown rõ ràng.
    `;

    // Bước 3: Gọi service để gửi prompt đến Gemini
    const analysisResult = await geminiService.getAnalysisFromAI(prompt);

    // Bước 4: Trả kết quả về cho frontend
    res.status(200).json({ analysis: analysisResult });

  } catch (error) {
    res.status(500).json({ message: 'Lỗi trong quá trình phân tích AI.', error: error.message });
  }
}

module.exports = {
  analyzeBusinessData
};
