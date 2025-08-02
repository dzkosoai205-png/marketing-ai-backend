// ==========================================================
// File: controllers/masterAI.controller.js
// Nhiệm vụ: Xử lý logic AI để phân tích dữ liệu kinh doanh VÀ chat AI.
// PHIÊN BẢN HOÀN THIỆN: Phân tích nhóm bán chậm và tạo chiến dịch xả kho chi tiết.
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

// Lấy API Key từ biến môi trường
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let geminiModelInstance = null;

if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        geminiModelInstance = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        console.log("✅ Gemini model 'gemini-1.5-flash-latest' đã được khởi tạo thành công.");
    } catch (error) {
        console.error("❌ Lỗi khi khởi tạo Gemini AI Model:", error.message);
    }
} else {
    console.warn("Cảnh báo: Biến môi trường GEMINI_API_KEY chưa được thiết lập. Tính năng AI sẽ không hoạt động.");
}

const getProductCategorization = (product) => {
    let animeGenre = 'Anime/Series Khác';
    let productCategory = 'Loại Khác';
    if (product.haravan_collection_names && product.haravan_collection_names.length > 0) {
        const mainAnimeCollection = product.haravan_collection_names.find(colName => {
            const lowerColName = colName.toLowerCase();
            return !(lowerColName.includes('hàng có sẵn') || lowerColName.includes('bán chạy') || lowerColName.includes('hàng mới') || lowerColName.includes('all products') || lowerColName.includes('bộ sản phẩm') || lowerColName.includes('sản phẩm')) ;
        });
        if (mainAnimeCollection) {
            animeGenre = mainAnimeCollection.trim();
        } else if (product.haravan_collection_names.length > 0) {
            animeGenre = product.haravan_collection_names[0].trim();
        }
    } else {
        const animeGenreMatch = product.title.match(/\[(.*?)\]/);
        animeGenre = animeGenreMatch ? animeGenreMatch[1].trim() : 'Anime/Series Khác (từ tiêu đề)';
    }
    const predefinedCategories = ["Badge", "Huy hiệu", "Thẻ", "Đồ bông", "Móc khóa", "Mô hình", "Poster", "Artbook", "Áo", "Phụ kiện", "Gói", "Tượng", "Văn phòng phẩm", "Đồ chơi", "Standee", "Shikishi", "Block", "Fuwa", "Tapinui", "Nendoroid", "Figure", "Lookup"];
    const lowerCaseTitle = product.title.toLowerCase();
    for (const category of predefinedCategories) {
        if (lowerCaseTitle.includes(category.toLowerCase())) {
            productCategory = category;
            break;
        }
    }
    if (productCategory === 'Loại Khác' && product.product_type) {
        productCategory = product.product_type;
    }
    return { anime_genre: animeGenre, product_category: productCategory };
};

const analyzeOverallBusiness = async (req, res) => {
    console.log('🤖 [Master AI] Nhận được yêu cầu phân tích toàn diện...');
    if (!geminiModelInstance) {
        return res.status(503).json({ message: "Dịch vụ AI không khả dụng." });
    }
    const { report_date: selectedReportDateString } = req.body;
    if (!selectedReportDateString) {
        return res.status(400).json({ message: 'Thiếu tham số ngày báo cáo.' });
    }
    try {
        const queryDateForDailyReport = new Date(selectedReportDateString);
        queryDateForDailyReport.setUTCHours(0,0,0,0);

        const [ reportForAnalysis, settings, upcomingEvents, recentOrders, allProducts, allCustomers, abandonedCheckouts ] = await Promise.all([
            DailyReport.findOne({ report_date: queryDateForDailyReport }).lean(),
            BusinessSettings.findOne({ shop_id: 'main_settings' }).lean(),
            FinancialEvent.find({ due_date: { $gte: new Date() }, is_paid: false }).sort({ due_date: 1 }).lean(),
            Order.find({ created_at_haravan: { $gte: new Date(new Date().getTime() - 30*24*60*60*1000) } }).lean(),
            Product.find({}).lean(),
            Customer.find({}).sort({ total_spent: -1 }).lean(),
            AbandonedCheckout.find({ created_at_haravan: { $gte: new Date(new Date().getTime() - 7*24*60*60*1000) } }).lean()
        ]);

        let reportDataForAI = { total_revenue: 0, total_profit: 0, notes: "Không có báo cáo.", report_date: queryDateForDailyReport };
        if (reportForAnalysis) reportDataForAI = reportForAnalysis;

        const averageDailyRevenue = recentOrders.reduce((sum, order) => sum + order.total_price, 0) / 30;
        const soldProductIdsInRecentOrders = new Set(recentOrders.flatMap(o => o.line_items.map(li => li.product_id)));

        const productDetailsForAI = allProducts.map(p => {
            const { anime_genre, product_category } = getProductCategorization(p);
            let totalQuantitySoldRecentOfProduct = 0, totalInventory = 0, hasPositiveInventory = false;
            p.variants.forEach(v => {
                totalQuantitySoldRecentOfProduct += recentOrders.reduce((sum, order) => sum + (order.line_items.find(li => li.variant_id === v.id)?.quantity || 0), 0);
                totalInventory += (v.inventory_quantity || 0);
                if ((v.inventory_quantity || 0) > 0) hasPositiveInventory = true;
            });
            return {
                id: p.id, title: p.title, anime_genre, product_category,
                current_inventory: totalInventory,
                total_quantity_sold_recent: totalQuantitySoldRecentOfProduct,
                is_slow_seller: !soldProductIdsInRecentOrders.has(p.id) && hasPositiveInventory
            };
        });

        // ✨ THAY ĐỔI 1: TÌM NHÓM SẢN PHẨM BÁN CHẬM NHẤT ✨
        const slowSellerStatsByCategory = {};
        productDetailsForAI.filter(p => p.is_slow_seller).forEach(p => {
            const category = p.product_category;
            if (category === 'Loại Khác') return;
            if (!slowSellerStatsByCategory[category]) {
                slowSellerStatsByCategory[category] = { slow_product_count: 0, total_inventory: 0 };
            }
            slowSellerStatsByCategory[category].slow_product_count++;
            slowSellerStatsByCategory[category].total_inventory += p.current_inventory;
        });

        const slowestSellingCategory = Object.entries(slowSellerStatsByCategory)
            .sort(([, a], [, b]) => b.slow_product_count - a.slow_product_count || b.total_inventory - a.total_inventory)
            .slice(0, 1) // Lấy ra 1 nhóm tệ nhất
            .map(([category, stats]) => ({ category, ...stats }))[0]; // Lấy object đầu tiên

        const topBestsellers = productDetailsForAI.filter(p => p.current_inventory > 0 && !p.is_slow_seller).sort((a, b) => b.total_quantity_sold_recent - a.total_quantity_sold_recent).slice(0, 3).map(p => ({ title: p.title, reason: `Bán chạy (${p.total_quantity_sold_recent} sp/30 ngày)` }));
        const topPriorityProductsForMarketing = [...topBestsellers];
        
        // ✨ THAY ĐỔI 2: CẬP NHẬT PROMPT AI ✨
        const prompt = `
Bạn là một Giám đốc Marketing (CMO) thiên tài cho một cửa hàng bán đồ anime. Nhiệm vụ của bạn là phân tích dữ liệu và tạo ra các kế hoạch hành động marketing cực kỳ cụ thể, chi tiết và có thể triển khai ngay lập tức.

**Mục tiêu cốt lõi:**
1.  **Hành động cho sản phẩm bán chạy:** Đề xuất kế hoạch marketing cụ thể cho TỪNG sản phẩm trong danh sách "Sản phẩm ưu tiên".
2.  **Hành động cho hàng tồn kho:** Đề xuất MỘT chiến dịch xả kho chi tiết cho "Nhóm sản phẩm bán chậm nhất".

**Dữ liệu cung cấp:**
- **Báo cáo tài chính ngày ${reportDataForAI.report_date.toLocaleDateString('vi-VN')}**: Doanh thu ${reportDataForAI.total_revenue.toLocaleString('vi-VN')}đ, Lợi nhuận ${reportDataForAI.total_profit.toLocaleString('vi-VN')}đ.
- **Top 3 Sản phẩm Ưu tiên Marketing (Bán chạy):**
  - Đây là các sản phẩm đang có hiệu suất tốt, cần đẩy mạnh hơn.
  - ${JSON.stringify(topPriorityProductsForMarketing)}
- **Phân tích Hàng tồn kho:**
  - **Nhóm sản phẩm bán chậm nhất cần xả kho:** ${JSON.stringify(slowestSellingCategory || {category: "Không có", slow_product_count: 0, total_inventory: 0})}
- **Dữ liệu Khách hàng VIP:** ${JSON.stringify(allCustomers.slice(0, 2).map(c => ({name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), total_spent: c.total_spent})))}.

**HÃY CHỈ TRẢ VỀ MỘT ĐỐI TƯỢỢNG JSON HOÀN CHỈNH. KHÔNG THÊM GIẢI THÍCH BÊN NGOÀI.**

**CẤU TRÚC JSON MONG MUỐN:**
\`\`\`json
{
  "alerts": [
    { "type": "warning", "message": "Cảnh báo quan trọng nhất về tình hình kinh doanh, dòng tiền, tồn kho. Tối đa 1 cảnh báo." }
  ],
  "insights": [
    { "title": "Phân tích Nhanh", "description": "Nhận định tổng quan về hiệu suất kinh doanh hôm nay và cơ hội lớn nhất cho ngày mai." }
  ],
  "action_plan": [
    // ✨ THAY ĐỔI 3: YÊU CẦU CỤ THỂ CHO KẾ HOẠCH HÀNH ĐỘNG ✨
    // === PHẦN 1: Kế hoạch cho các sản phẩm bán chạy ===
    {
      "action": "Tăng cường quảng cáo cho sản phẩm [Tên Sản phẩm Ưu tiên 1]",
      "details": "Mô tả chi tiết kế hoạch marketing cho sản phẩm này. Ví dụ: Chạy quảng cáo video unbox trên Facebook, nhắm đến khách hàng đã tương tác với trang.",
      "priority": "High",
      "category": "Marketing"
    },
    {
      "action": "Tăng cường quảng cáo cho sản phẩm [Tên Sản phẩm Ưu tiên 2]",
      "details": "Mô tả chi tiết kế hoạch marketing cho sản phẩm này.",
      "priority": "High",
      "category": "Marketing"
    },
    // === PHẦN 2: Kế hoạch xả kho chi tiết ===
    {
      "action": "Xả kho nhóm sản phẩm [Tên Nhóm Bán Chậm Nhất]",
      "details": "Đề xuất một chiến dịch xả kho cụ thể. Ví dụ: 'Tạo mã giảm giá XAKHO[TênNhóm] giảm 40% cho tất cả sản phẩm thuộc nhóm [Tên Nhóm Bán Chậm Nhất]. Truyền thông bằng email đến toàn bộ khách hàng và đăng bài trên Facebook với caption kêu gọi hành động mạnh mẽ.'",
      "priority": "High",
      "category": "Marketing"
    },
    // === PHẦN 3: Kế hoạch chăm sóc khách hàng ===
    {
        "action": "Chăm sóc khách hàng VIP",
        "details": "Gửi email cá nhân hóa đến 2 khách hàng VIP hàng đầu, tặng mã giảm giá 15% cho đơn hàng tiếp theo (đảm bảo lợi nhuận vẫn đạt 30%).",
        "priority": "Medium",
        "category": "Customer"
    }
  ]
}
\`\`\`
`;
        const result = await geminiModelInstance.generateContent(prompt);
        const response = await result.response;
        const textResponse = response.text();
        console.log('Phản hồi RAW từ Gemini:', textResponse);
        let analysisResultJson;
        try {
            const jsonBlockMatch = textResponse.match(/```json\n([\s\S]*?)\n```/);
            const jsonString = jsonBlockMatch[1].trim();
            analysisResultJson = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('❌ Lỗi parsing JSON từ Gemini:', parseError.message);
            return res.status(500).json({ message: 'Lỗi parsing phản hồi AI.', rawResponse: textResponse });
        }
        await DailyReport.findOneAndUpdate(
            { report_date: queryDateForDailyReport },
            { $set: { ai_analysis_results: analysisResultJson } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`✅ Đã lưu kết quả phân tích AI.`);
        res.status(200).json(analysisResultJson);
    } catch (error) {
        console.error('❌ Lỗi trong quá trình phân tích toàn diện:', error);
        res.status(500).json({ message: 'Lỗi trong quá trình phân tích toàn diện.', error: error.message });
    }
}

const getDailyReportByDate = async (req, res) => {
    const dateParam = req.query.date;
    if (!dateParam) return res.status(400).json({ message: 'Thiếu tham số ngày (date).' });
    try {
        const queryDate = new Date(dateParam);
        queryDate.setHours(0, 0, 0, 0);
        const report = await DailyReport.findOne({ report_date: queryDate }).lean();
        if (!report) return res.status(404).json({ message: 'Không tìm thấy báo cáo.' });
        res.status(200).json(report);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy báo cáo.', error: error.message });
    }
};

const handleChat = async (req, res) => {
    if (!geminiModelInstance) return res.status(503).json({ message: "Dịch vụ AI không khả dụng." });
    const { sessionId, message, initialContext } = req.body;
    if (!sessionId || !message) return res.status(400).json({ message: "Thiếu sessionId hoặc tin nhắn." });
    try {
        let chatSessionDoc = await ChatSession.findOne({ sessionId });
        let history = chatSessionDoc ? chatSessionDoc.history : [];
        if (history.length === 0 && initialContext) {
            history.push({ role: 'user', parts: [{ text: 'Đây là bản phân tích kinh doanh của tôi, tóm tắt các điểm chính.' }] });
            history.push({ role: 'model', parts: [{ text: `Dĩ nhiên, đây là phân tích: \n\`\`\`json\n${JSON.stringify(initialContext, null, 2)}\n\`\`\`\n` }] });
        }
        if (!chatSessionDoc) chatSessionDoc = new ChatSession({ sessionId, history });
        const chat = geminiModelInstance.startChat({ history, generationConfig: { maxOutputTokens: 2048 } });
        const result = await chat.sendMessage(message);
        const modelResponseText = result.response.text();
        chatSessionDoc.history.push({ role: 'user', parts: [{ text: message }] });
        chatSessionDoc.history.push({ role: 'model', parts: [{ text: modelResponseText }] });
        await chatSessionDoc.save();
        res.status(200).json({ response: modelResponseText, sessionId });
    } catch (error) {
        res.status(500).json({ message: "Lỗi xử lý chat AI.", error: error.message });
    }
}

module.exports = {
    analyzeOverallBusiness,
    getDailyReportByDate,
    handleChat
};
