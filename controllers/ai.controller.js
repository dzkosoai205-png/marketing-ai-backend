// ==========================================================
// File: controllers/ai.controller.js
// Phiên bản này sử dụng prompt có cấu trúc để nhận về JSON.
// ==========================================================

const Order = require('../models/order.model');
const Customer = require('../models/customer.model');
const geminiService = require('../services/gemini.service');

async function analyzeBusinessData(req, res) {
  console.log('🤖 [AI] Nhận được yêu cầu phân tích...');
  try {
    const [orders, customers] = await Promise.all([
      Order.find({ financial_status: 'paid' }).sort({ created_at_haravan: -1 }).limit(100),
      Customer.find({}).sort({ total_spent: -1 }).limit(50)
    ]);

    // --- PROMPT MỚI, YÊU CẦU TRẢ VỀ JSON ---
    const prompt = `
      Là một chuyên gia phân tích dữ liệu e-commerce, hãy phân tích dữ liệu sau của một cửa hàng nhỏ:
      - Tổng số đơn hàng đã thanh toán trong giai đoạn này: ${orders.length}
      - Dữ liệu 5 đơn hàng gần nhất: ${JSON.stringify(orders.slice(0, 5).map(o => ({total_price: o.total_price, source_name: o.source_name, discount_codes: o.discount_codes})))}
      - Dữ liệu 5 khách hàng chi tiêu nhiều nhất: ${JSON.stringify(customers.slice(0, 5).map(c => ({total_spent: c.total_spent, orders_count: c.orders_count})))}

      Dựa vào dữ liệu trên, hãy trả về một đối tượng JSON duy nhất có cấu trúc như sau:
      {
        "insights": [
          "Nhận định 1 về hành vi khách hàng và hiệu quả của các mã giảm giá hiện tại.",
          "Nhận định 2 về xu hướng mua sắm và các sản phẩm/loại khuyến mãi được ưa chuộng.",
          "Nhận định 3 về phân khúc khách hàng tiềm năng."
        ],
        "campaign_plan": {
          "event_name": "Chiến dịch cho ngày Sale Lớn sắp tới (ví dụ: 8/8)",
          "target_audience": "Mô tả nhóm khách hàng mục tiêu (ví dụ: Khách hàng cũ, khách hàng có giá trị đơn hàng cao).",
          "suggestions": [
            {
              "code": "BIGSALE_CODE",
              "description": "Mô tả chi tiết mã (ví dụ: Giảm 15% (tối đa 50k) cho đơn từ 300k).",
              "reason": "Lý do đề xuất mã này cho chiến dịch (ví dụ: Thu hút traffic lớn, tăng giá trị giỏ hàng)."
            },
            {
              "code": "VIP_CODE",
              "description": "Mô tả chi tiết mã cho nhóm khách hàng đặc biệt.",
              "reason": "Lý do đề xuất mã này (ví dụ: Tri ân và tăng lòng trung thành)."
            }
          ]
        },
        "ab_testing": [
          {
            "code": "TEST_CODE_A",
            "description": "Mô tả chi tiết mã thử nghiệm A (ví dụ: Miễn phí vận chuyển cho đơn từ 200k).",
            "reason": "Lý do và giả thuyết của thử nghiệm này (ví dụ: Kiểm tra xem việc tăng nhẹ điều kiện freeship có giúp tăng AOV không)."
          },
          {
            "code": "TEST_CODE_B",
            "description": "Mô tả chi tiết mã thử nghiệm B (ví dụ: Giảm 10% khi mua từ 2 sản phẩm).",
            "reason": "Lý do và giả thuyết của thử nghiệm này (ví dụ: Thử nghiệm khuyến mãi theo số lượng để tăng số lượng sản phẩm/đơn)."
          }
        ]
      }
    `;

    const analysisResultText = await geminiService.getAnalysisFromAI(prompt);

    // Làm sạch và chuyển đổi văn bản trả về thành JSON
    const jsonString = analysisResultText.replace(/```json\n|```/g, '').trim();
    const analysisResultJson = JSON.parse(jsonString);

    res.status(200).json(analysisResultJson);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình phân tích AI:', error);
    res.status(500).json({ message: 'Lỗi trong quá trình phân tích AI.', error: error.message });
  }
}

module.exports = {
  analyzeBusinessData
};
