// ==========================================================
// File: controllers/masterAI.controller.js (File mới)
// Bộ não AI Toàn diện, thay thế cho ai.controller.js cũ
// ==========================================================
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const DailyReport = require('../models/dailyReport.model.js');
const BusinessSettings = require('../models/businessSettings.model.js');
const FinancialEvent = require('../models/financialEvent.model.js');
const geminiService = require('../services/gemini.service');

async function analyzeOverallBusiness(req, res) {
  console.log('🤖 [Master AI] Nhận được yêu cầu phân tích toàn diện...');
  try {
    // Bước 1: Lấy tất cả dữ liệu cần thiết
    const [
        latestReport, 
        settings, 
        upcomingEvents, 
        recentOrders,
        allProducts
    ] = await Promise.all([
        DailyReport.findOne().sort({ report_date: -1 }),
        BusinessSettings.findOne({ shop_id: 'main_settings' }),
        FinancialEvent.find({ due_date: { $gte: new Date() }, is_paid: false }).sort({ due_date: 1 }),
        Order.find({ created_at_haravan: { $gte: new Date(new Date() - 30*24*60*60*1000) } }), // Lấy đơn trong 30 ngày qua
        Product.find({})
    ]);

    if (!latestReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo nào để phân tích.' });
    }

    // Xử lý dữ liệu tồn kho
    const inventoryStatus = allProducts.map(p => ({
        title: p.title,
        inventory: p.variants.reduce((acc, v) => acc + v.inventory_quantity, 0)
    }));
    const lowStockProducts = inventoryStatus.filter(p => p.inventory > 0 && p.inventory <= 5).slice(0, 5); // Cảnh báo tồn kho thấp (<= 5)
    
    // Tìm sản phẩm bán chậm (không bán được trong 30 ngày)
    const soldProductIds = new Set(recentOrders.flatMap(o => o.line_items.map(li => li.product_id)));
    const slowSellers = allProducts
        .filter(p => !soldProductIds.has(p.id) && p.variants.some(v => v.inventory_quantity > 0))
        .map(p => p.title)
        .slice(0, 5);

    // Bước 2: Tạo một prompt toàn diện cho AI
    const prompt = `
      Là một Giám đốc Vận hành (COO) ảo, hãy phân tích toàn diện dữ liệu của một cửa hàng bán đồ anime và trả về một đối tượng JSON.
      
      Dữ liệu Tài chính & Kinh doanh:
      - Báo cáo hôm nay: Doanh thu ${latestReport.total_revenue.toLocaleString('vi-VN')}đ, Lợi nhuận ${latestReport.total_profit.toLocaleString('vi-VN')}đ.
      - Chi phí cố định tháng: ${((settings?.monthly_rent_cost || 0) + (settings?.monthly_staff_cost || 0) + (settings?.monthly_marketing_cost || 0) + (settings?.monthly_other_cost || 0)).toLocaleString('vi-VN')}đ.
      - Mục tiêu lợi nhuận tháng: ${(settings?.monthly_profit_target || 0).toLocaleString('vi-VN')}đ.
      - Sự kiện chi tiền lớn sắp tới: ${JSON.stringify(upcomingEvents.map(e => ({name: e.event_name, amount: e.amount, due_date: e.due_date.toLocaleDateString('vi-VN')}))) }.

      Dữ liệu Vận hành & Tồn kho:
      - Top 5 sản phẩm sắp hết hàng (tồn kho <= 5): ${JSON.stringify(lowStockProducts)}.
      - Top 5 sản phẩm bán chậm (không bán được trong 30 ngày): ${JSON.stringify(slowSellers)}.

      Dựa vào TOÀN BỘ dữ liệu trên, hãy đưa ra:
      1.  **alerts**: Một mảng các cảnh báo quan trọng nhất (tối đa 2). Mỗi cảnh báo là một object có 'type' ('warning' hoặc 'info') và 'message'. Ưu tiên cảnh báo về dòng tiền và tồn kho.
      2.  **insights**: Một mảng gồm 2 nhận định sâu sắc về mối liên hệ giữa sản phẩm bán chạy/chậm và tình hình tài chính.
      3.  **action_plan**: Một mảng gồm 2 đề xuất hành động cụ thể cho ngày mai để giải quyết các cảnh báo và cải thiện kinh doanh. Mỗi đề xuất là một object có 'action' (tiêu đề) và 'details' (mô tả chi tiết).

      Cấu trúc JSON trả về phải là:
      {
        "alerts": [ { "type": "warning", "message": "Cảnh báo về dòng tiền hoặc tồn kho." } ],
        "insights": [ "Nhận định 1.", "Nhận định 2." ],
        "action_plan": [
          { "action": "Tiêu đề hành động 1", "details": "Mô tả chi tiết hành động 1, ví dụ: Nhập thêm hàng X, tạo mã giảm giá Y..." },
          { "action": "Tiêu đề hành động 2", "details": "Mô tả chi tiết hành động 2." }
        ]
      }
    `;

    const analysisResultText = await geminiService.getAnalysisFromAI(prompt);
    const jsonString = analysisResultText.replace(/```json\n|```/g, '').trim();
    const analysisResultJson = JSON.parse(jsonString);
    res.status(200).json(analysisResultJson);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình phân tích toàn diện:', error);
    res.status(500).json({ message: 'Lỗi trong quá trình phân tích toàn diện.', error: error.message });
  }
}

module.exports = {
  analyzeOverallBusiness
};
