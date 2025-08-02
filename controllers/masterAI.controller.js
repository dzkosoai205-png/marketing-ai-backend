// ==========================================================
// File: controllers/masterAI.controller.js
// Nhiệm vụ: Xử lý logic AI để phân tích dữ liệu kinh doanh VÀ chat AI.
// PHIÊN BẢN NÂNG CẤP HOÀN CHỈNH: Biến AI thành một Cố vấn Chiến lược & Tăng trưởng.
// Tối ưu hóa: Gộp các lệnh gọi API để tránh lỗi quota và tăng hiệu quả.
// ==========================================================
const { GoogleGenerativeAI } = require('@google/generative-ai');
const DailyReport = require('../models/dailyReport.model');
const BusinessSettings = require('../models/businessSettings.model');
const FinancialEvent = require('../models/financialEvent.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Coupon = require('../models/coupon.model');
const Customer = require('../models/customer.model');
const AbandonedCheckout = require('../models/abandonedCheckout.model');
const ChatSession = require('../models/chatSession.model');


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let geminiModelInstance = null;

if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        geminiModelInstance = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        console.log("✅ Gemini model 'gemini-2.0-flash' đã được khởi tạo thành công.");
    } catch (error) {
        console.error("❌ Lỗi khi khởi tạo Gemini AI Model:", error.message);
    }
} else {
    console.warn("Cảnh báo: Biến môi trường GEMINI_API_KEY chưa được thiết lập.");
}

// ==========================================================
// HÀM PHÂN TÍCH KINH DOANH CHÍNH (ĐÃ TỐI ƯU HÓA)
// ==========================================================
const analyzeOverallBusiness = async (req, res) => {
    console.log('🤖 [Strategic AI] Nhận được yêu cầu phân tích chiến lược chuyên sâu...');
    if (!geminiModelInstance) {
        return res.status(503).json({ message: "Dịch vụ AI không khả dụng." });
    }

    const { report_date: selectedReportDateString } = req.body;
    if (!selectedReportDateString) {
        return res.status(400).json({ message: 'Thiếu tham số ngày báo cáo (report_date).' });
    }

    try {
        // BƯỚC 1: LẤY DỮ LIỆU THÔ
        const queryDateForDailyReport = new Date(selectedReportDateString);
        queryDateForDailyReport.setUTCHours(0, 0, 0, 0);

        const [
            reportForAnalysis, settings, upcomingEvents, recentOrders, allProducts,
            allCoupons, allCustomers, abandonedCheckouts
        ] = await Promise.all([
            DailyReport.findOne({ report_date: queryDateForDailyReport }).lean(),
            BusinessSettings.findOne({ shop_id: 'main_settings' }).lean(),
            FinancialEvent.find({ due_date: { $gte: new Date() }, is_paid: false }).sort({ due_date: 1 }).lean(),
            Order.find({ created_at_haravan: { $gte: new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000) } }).lean(),
            Product.find({}).lean(),
            Coupon.find({}).lean(),
            Customer.find({}).sort({ total_spent: -1 }).lean(),
            AbandonedCheckout.find({ created_at_haravan: { $gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000) } }).lean()
        ]);

        // BƯỚC 2: LÀM GIÀU DỮ LIỆU (TRƯỚC KHI GỬI CHO AI)
        const customerDetailsForAI = allCustomers.map(c => {
            const lastOrderDate = c.last_order_name ? new Date(c.updated_at) : null;
            const daysSinceLastOrder = lastOrderDate ? Math.ceil((new Date() - lastOrderDate) / (1000 * 60 * 60 * 24)) : null;
            return {
                id: c.id,
                name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
                total_spent: c.total_spent,
                orders_count: c.orders_count,
                membership_tier: c.haravan_segments && c.haravan_segments.length > 0 ? c.haravan_segments[0] : 'Thành viên mới',
                days_since_last_order: daysSinceLastOrder,
                behavioral_segment: daysSinceLastOrder === null ? 'New' : (daysSinceLastOrder > 90 ? 'At Risk' : 'Active')
            };
        });

        const productDetailsForAI = allProducts.map(p => {
            let totalInventory = 0;
            let totalCost = 0;
            p.variants.forEach(v => {
                totalInventory += (v.inventory_quantity || 0);
                totalCost += (v.inventory_quantity || 0) * (v.cost || 0);
            });
            const quantitySoldRecent = recentOrders.reduce((sum, order) => {
                const item = order.line_items.find(li => li.product_id === p.id);
                return sum + (item ? item.quantity : 0);
            }, 0);
            return {
                id: p.id,
                title: p.title, // Gửi tiêu đề thô
                haravan_collections: p.haravan_collection_names || [], // Gửi collection thô
                current_inventory: totalInventory,
                total_inventory_cost: totalCost,
                quantity_sold_recent: quantitySoldRecent,
                is_slow_seller: quantitySoldRecent === 0 && totalInventory > 0
            };
        });

        const abandonedCheckoutsForAI = abandonedCheckouts.slice(0, 5).map(ac => ({
            customer_email: ac.email,
            total_price: ac.total_price,
            items: ac.line_items.map(item => ({ title: item.title, quantity: item.quantity }))
        }));

        const existingCouponsForAI = allCoupons.map(c => ({
            code: c.code,
            type: c.discount_type,
            value: c.value
        }));
        
        const reportDataForAI = reportForAnalysis || { total_revenue: 0, total_profit: 0, notes: "Không có báo cáo." };


        // ==========================================================
        // PROMPT NÂNG CẤP - GỘP 2 NHIỆM VỤ VÀO 1
        // ==========================================================
        const prompt = `
Bạn là một Cố vấn Chiến lược & Tăng trưởng (Strategic Advisor & Growth Hacker) cho một cửa hàng e-commerce chuyên về đồ anime. Vai trò của bạn là **TƯ VẤN, ĐỊNH HƯỚNG và XÂY DỰNG KẾ HOẠCH HÀNH ĐỘNG**. Bạn phải suy nghĩ sâu, kết nối các điểm dữ liệu rời rạc để tạo ra một bức tranh toàn cảnh và đưa ra những chiến lược có tính đột phá, khả thi cao.

**BƯỚC ĐẦU TIÊN TRONG SUY NGHĨ CỦA BẠN (QUAN TRỌNG):**
Trước khi phân tích, hãy tự phân loại các sản phẩm trong 'dữ liệu sản phẩm' được cung cấp. Với mỗi sản phẩm, hãy xác định **anime_genre** (tên series, ví dụ: "Jujutsu Kaisen") và **product_category** (loại sản phẩm, ví dụ: "Móc khóa", "Figure"). Sử dụng 'title' và 'haravan_collections' để làm việc này. Toàn bộ phân tích sau đó phải dựa trên kết quả phân loại này.

**BỐI CẢNH:**
- **Cửa hàng:** Chuyên bán đồ anime.
- **Nền tảng:** Haravan, có hệ thống phân hạng thành viên tự động.
- **Mục tiêu:** Tối đa hóa lợi nhuận, tăng trưởng bền vững.
- **Ràng buộc:** Mọi đề xuất khuyến mãi phải đảm bảo biên lợi nhuận trung bình là 30%. Nếu giảm, phải nêu rõ rủi ro và cách bù đắp.

**NHIỆM VỤ:**
Dựa trên toàn bộ dữ liệu, hãy trả lời các câu hỏi chiến lược sau và trình bày kết quả dưới dạng một đối tượng JSON duy nhất.

**CÁC CÂU HỎI CHIẾN LƯỢC:**
1.  **Sức khỏe tổng thể:** Tình hình kinh doanh hiện tại ra sao? Đâu là điểm sáng và rủi ro lớn nhất?
2.  **Dòng tiền:** Có lành mạnh không? Các khoản chi sắp tới có đáng lo không? Cần làm gì ngay?
3.  **Sản phẩm:** Danh mục sản phẩm có "khỏe" không? Đâu là "ngôi sao", "con bò sữa", "dấu hỏi" và "gánh nặng"?
4.  **Khách hàng:** Vòng đời khách hàng đang ở đâu? Phân khúc nào giá trị nhất? Phân khúc nào bị bỏ quên?
5.  **Cơ hội tăng trưởng:** Đâu là 2-3 cơ hội lớn nhất trong 30 ngày tới?

---
**DỮ LIỆU ĐẦU VÀO:**

- **Dữ liệu tài chính & mục tiêu:**
  - Báo cáo ngày ${new Date(selectedReportDateString).toLocaleDateString('vi-VN')}: Doanh thu ${reportDataForAI.total_revenue.toLocaleString('vi-VN')}đ, Lợi nhuận ${reportDataForAI.total_profit.toLocaleString('vi-VN')}đ.
  - Ghi chú từ chủ shop: "${reportDataForAI.notes}"
  - Chi phí cố định tháng (ước tính): ${((settings?.monthly_rent_cost || 0) + (settings?.monthly_staff_cost || 0) + (settings?.monthly_marketing_cost || 0) + (settings?.monthly_other_cost || 0)).toLocaleString('vi-VN')}đ.
  - Mục tiêu lợi nhuận tháng: ${(settings?.monthly_profit_target || 0).toLocaleString('vi-VN')}đ.
  - Các khoản chi lớn sắp tới: ${JSON.stringify(upcomingEvents.map(e => ({ name: e.event_name, amount: e.amount, due_date: e.due_date.toLocaleDateString('vi-VN') })))}.

- **Dữ liệu sản phẩm (THÔ - cần bạn tự phân loại):**
  - Chi tiết toàn bộ sản phẩm (bao gồm title, haravan_collections, tồn kho, vốn tồn kho, số lượng bán gần đây, tình trạng bán chậm): ${JSON.stringify(productDetailsForAI)}.

- **Dữ liệu khách hàng (đã làm giàu):**
  - Chi tiết toàn bộ khách hàng (bao gồm hạng thành viên, số ngày từ lần mua cuối, phân khúc hành vi): ${JSON.stringify(customerDetailsForAI)}.

- **Dữ liệu phễu bán hàng & marketing:**
  - Chi tiết 5 giỏ hàng bị bỏ quên có giá trị cao nhất (7 ngày qua): ${JSON.stringify(abandonedCheckoutsForAI)}.
  - Danh sách các mã coupon đang có: ${JSON.stringify(existingCouponsForAI)}.

---
**YÊU CẦU ĐẦU RA: MỘT ĐỐI TƯỢNG JSON HOÀN CHỈNH. KHÔNG THÊM BẤT KỲ VĂN BẢN NÀO BÊN NGOÀI KHỐI JSON.**

\`\`\`json
{
  "strategic_summary": {
    "report_date": "${new Date(selectedReportDateString).toLocaleDateString('vi-VN')}",
    "headline": "Tiêu đề chính tóm tắt toàn bộ tình hình trong một câu. Ví dụ: 'Doanh thu ổn định nhưng rủi ro dòng tiền và hàng tồn kho cần xử lý ngay'.",
    "overall_health_score": "Đánh giá sức khỏe tổng thể trên thang điểm 10 (ví dụ: 7.5/10).",
    "key_highlight": "Điểm sáng lớn nhất cần phát huy. Ví dụ: 'Nhóm sản phẩm Jujutsu Kaisen đang là cỗ máy kiếm tiền chính.'",
    "critical_risk": "Rủi ro lớn nhất cần giải quyết. Ví dụ: 'Lượng hàng tồn kho bán chậm trị giá X VND đang đè nặng lên dòng tiền.'"
  },
  "deep_dive_analysis": [
    {
      "area": "Financial Health & Cash Flow",
      "insight": "Phân tích sâu về dòng tiền. So sánh doanh thu trung bình với chi phí sắp tới. Đưa ra kết luận về sự an toàn tài chính trong 30 ngày tới.",
      "recommendation": "Đề xuất cụ thể để cải thiện. Ví dụ: 'Cần tăng doanh thu hàng ngày thêm X VND hoặc trì hoãn khoản chi Y.'"
    },
    {
      "area": "Product Portfolio Performance",
      "insight": "Xác định các nhóm sản phẩm 'Ngôi sao', 'Con bò sữa', 'Dấu hỏi', 'Gánh nặng'. Phân tích nhóm anime_genre nào đang hoạt động hiệu quả nhất và loại product_category nào đang yếu thế trong nhóm đó.",
      "recommendation": "Đề xuất chiến lược cho từng nhóm. Ví dụ: 'Nhân đôi ngân sách marketing cho các sản phẩm Jujutsu Kaisen. Tạo combo xả hàng cho các sản phẩm bán chậm.'"
    },
    {
      "area": "Customer Lifecycle & CRM",
      "insight": "Phân tích hiệu quả của việc giữ chân khách hàng. Hạng thành viên nào có giá trị vòng đời cao nhất? Có bao nhiêu khách hàng đang trong trạng thái 'At Risk' (có nguy cơ rời bỏ)?",
      "recommendation": "Đề xuất chiến dịch cho từng giai đoạn. Ví dụ: 'Tạo chiến dịch 'We miss you' với ưu đãi đặc biệt cho nhóm 'At Risk'. Triển khai chương trình giới thiệu bạn bè cho nhóm khách hàng trung thành.'"
    }
  ],
  "actionable_growth_plan": {
    "title": "Kế hoạch Tăng trưởng 30 Ngày Tới",
    "initiatives": [
      {
        "priority": "Critical (Ưu tiên 1)",
        "initiative_name": "Giải quyết hàng tồn kho & Tối ưu dòng tiền",
        "description": "Chiến dịch cụ thể để xử lý các sản phẩm 'Gánh nặng' đã xác định ở trên.",
        "steps": [
          "Bước 1: Tạo chương trình 'Flash Sale cuối tuần' cho 5 sản phẩm bán chậm nhất, giảm giá X% (tính toán để vẫn hòa vốn hoặc lỗ tối thiểu).",
          "Bước 2: Tạo các 'Combo Bí Ẩn' gồm 1 sản phẩm bán chạy + 1 sản phẩm bán chậm với giá ưu đãi.",
          "Bước 3: Liên hệ các khách hàng đã từng mua sản phẩm tương tự để giới thiệu trực tiếp."
        ],
        "kpi": "Giảm 50% giá trị tồn kho của các sản phẩm bán chậm trong 2 tuần. Thu về tối thiểu Y VND tiền mặt."
      },
      {
        "priority": "High (Ưu tiên 2)",
        "initiative_name": "Chiến dịch giữ chân khách hàng 'At Risk'",
        "description": "Tái kích hoạt các khách hàng đã không mua sắm trong hơn 90 ngày.",
        "steps": [
          "Bước 1: Gửi email cá nhân hóa với tiêu đề '[Tên khách hàng], đã lâu không gặp! Shop có quà cho bạn nè'.",
          "Bước 2: Tặng một mã giảm giá 15% không yêu cầu giá trị đơn hàng tối thiểu, chỉ dành riêng cho họ.",
          "Bước 3: Giới thiệu các sản phẩm mới thuộc anime_genre mà họ từng mua."
        ],
        "kpi": "Tỷ lệ mở email > 25%. Tỷ lệ chuyển đổi từ chiến dịch > 5%."
      },
      {
        "priority": "Medium (Ưu tiên 3)",
        "initiative_name": "Tối ưu Phễu bán hàng - Cứu giỏ hàng",
        "description": "Triển khai chiến dịch tự động để cứu các giỏ hàng bị bỏ quên có giá trị cao.",
        "steps": [
          "Bước 1: Thiết lập luồng email tự động gửi sau 2 giờ khách bỏ quên giỏ hàng.",
          "Bước 2: Email đầu tiên chỉ nhắc nhở. Email thứ hai sau 24 giờ sẽ kèm mã giảm giá 10% hoặc freeship.",
          "Bước 3: Test A/B tiêu đề email để tìm ra câu chữ hiệu quả nhất."
        ],
        "kpi": "Tăng tỷ lệ cứu giỏ hàng thành công lên 15%."
      }
    ]
  }
}
\`\`\`
`;

        // BƯỚC 3: GỌI AI VÀ XỬ LÝ KẾT QUẢ
        const result = await geminiModelInstance.generateContent(prompt);
        const response = await result.response;
        const textResponse = response.text();
        
        console.log('Phản hồi RAW từ Cố vấn Chiến lược AI:', textResponse);

        let analysisResultJson;
        try {
            // Cải thiện khả năng parse JSON, ưu tiên tìm khối ```json
            const jsonBlockMatch = textResponse.match(/```json\n([\s\S]*?)\n```/);
            if (jsonBlockMatch && jsonBlockMatch[1]) {
                const jsonString = jsonBlockMatch[1].trim();
                analysisResultJson = JSON.parse(jsonString);
            } else {
                // Fallback nếu không có khối ```json, thử parse toàn bộ
                analysisResultJson = JSON.parse(textResponse);
            }
        } catch (parseError) {
            console.error('❌ Lỗi parsing JSON từ Cố vấn Chiến lược AI:', parseError.message);
            return res.status(500).json({
                message: 'Lỗi parsing phản hồi AI. Phản hồi không phải là JSON hợp lệ.',
                rawResponse: textResponse
            });
        }

        // BƯỚC 4: LƯU KẾT QUẢ VÀO DB
        await DailyReport.findOneAndUpdate(
            { report_date: queryDateForDailyReport },
            { $set: { ai_analysis_results: analysisResultJson } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`✅ [Strategic AI] Đã lưu kết quả phân tích chiến lược vào báo cáo ngày ${queryDateForDailyReport.toLocaleDateString('vi-VN')}.`);

        res.status(200).json(analysisResultJson);

    } catch (error) {
        console.error('❌ Lỗi trong quá trình phân tích chiến lược:', error);
        // Phân tích lỗi cụ thể hơn từ Google
        if (error.message && error.message.includes('429')) {
             return res.status(429).json({ message: 'Lỗi từ Gemini: Vượt quá giới hạn truy cập (rate limit). Có thể do prompt quá lớn. Vui lòng thử lại sau hoặc giảm phạm vi dữ liệu.', error: error.message });
        }
        res.status(500).json({ message: 'Lỗi trong quá trình phân tích chiến lược.', error: error.message });
    }
}

// =========================================================================
// HÀM ĐỂ LẤY BÁO CÁO HÀNG NGÀY THEO NGÀY
// =========================================================================
const getDailyReportByDate = async (req, res) => {
    const dateParam = req.query.date;

    if (!dateParam) {
        return res.status(400).json({ message: 'Thiếu tham số ngày (date).' });
    }

    try {
        const queryDate = new Date(dateParam);
        queryDate.setUTCHours(0,0,0,0);

        const report = await DailyReport.findOne({ report_date: queryDate }).lean();

        if (!report) {
            return res.status(404).json({ message: 'Không tìm thấy báo cáo cho ngày này.' });
        }

        res.status(200).json(report);
    } catch (error) {
        console.error('❌ Lỗi khi lấy báo cáo theo ngày:', error);
        res.status(500).json({ message: 'Lỗi khi lấy báo cáo theo ngày.', error: error.message });
    }
};

// =========================================================================
// HÀM XỬ LÝ AI CHAT TRỰC TIẾP
// =========================================================================
const handleChat = async (req, res) => {
    console.log('💬 [AI Chat] Nhận được tin nhắn mới...');
    if (!geminiModelInstance) {
        return res.status(503).json({ message: "Dịch vụ AI không khả dụng. Vui lòng kiểm tra cấu hình GEMINI_API_KEY." });
    }

    const { sessionId, message, initialContext } = req.body;

    if (!sessionId || !message) {
        return res.status(400).json({ message: "Thiếu sessionId hoặc tin nhắn." });
    }

    try {
        let chatSessionDoc = await ChatSession.findOne({ sessionId });
        let history = [];

        if (chatSessionDoc) {
            history = chatSessionDoc.history;
            console.log(`💬 [AI Chat] Đã tải lịch sử cho session ${sessionId} (${history.length} tin nhắn).`);
        } else {
            if (initialContext) {
                history.push({
                    role: 'user',
                    parts: [{ text: `Bắt đầu phiên tư vấn. Dưới đây là bối cảnh từ bản phân tích kinh doanh mà bạn đã tạo. Hãy đóng vai trò là cố vấn chiến lược và trả lời các câu hỏi của tôi dựa trên dữ liệu này.` }]
                });
                history.push({
                    role: 'model',
                    parts: [{ text: `Rất sẵn lòng. Tôi đã xem xét bản phân tích chi tiết: \n\`\`\`json\n${JSON.stringify(initialContext, null, 2)}\n\`\`\`\n. Bạn muốn đi sâu vào vấn đề nào đầu tiên?` }]
                });
                console.log(`💬 [AI Chat] Tạo session mới ${sessionId} với context ban đầu.`);
            } else {
                console.log(`💬 [AI Chat] Tạo session mới ${sessionId} (không có context ban đầu).`);
            }
            chatSessionDoc = new ChatSession({ sessionId, history });
        }

        const chat = geminiModelInstance.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 2048,
            },
        });

        const result = await chat.sendMessage(message);
        const modelResponseText = result.response.text();

        chatSessionDoc.history.push({ role: 'user', parts: [{ text: message }] });
        chatSessionDoc.history.push({ role: 'model', parts: [{ text: modelResponseText }] });
        chatSessionDoc.lastActivity = new Date();
        await chatSessionDoc.save();

        console.log(`💬 [AI Chat] Trả lời cho session ${sessionId}: ${modelResponseText.substring(0, 50)}...`);
        res.status(200).json({ response: modelResponseText, sessionId: sessionId });

    } catch (error) {
        console.error('❌ [AI Chat] Lỗi xử lý chat:', error);
        res.status(500).json({ message: "Lỗi trong quá trình xử lý chat AI.", error: error.message, sessionId: sessionId });
    }
}

module.exports = {
    analyzeOverallBusiness,
    getDailyReportByDate,
    handleChat
};

