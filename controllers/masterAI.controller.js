// controllers/masterAI.controller.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const DailyReport = require('../models/DailyReport'); 
const BusinessSettings = require('../models/BusinessSettings');
const FinancialEvent = require('../models/FinancialEvent');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Customer = require('../models/Customer');
const AbandonedCheckout = require('../models/AbandonedCheckout');

// Lấy API Key từ biến môi trường
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// =========================================================================
// THAY ĐỔI CÁCH KHỞI TẠO MODEL ĐỂ TRÁNH ReferenceError
// =========================================================================
let geminiModelInstance = null; // Khai báo và khởi tạo giá trị mặc định là null

if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        geminiModelInstance = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
        console.log("✅ Gemini model 'gemini-2.0-flash' đã được khởi tạo thành công.");
    } catch (error) {
        console.error("❌ Lỗi khi khởi tạo Gemini AI Model:", error.message);
        console.warn("Cảnh báo: Tính năng AI sẽ không hoạt động do lỗi khởi tạo model.");
        // Giữ geminiModelInstance là null để hàm analyzeOverallBusiness có thể xử lý
    }
} else {
    console.warn("Cảnh báo: Biến môi trường GEMINI_API_KEY chưa được thiết lập. Tính năng AI sẽ không hoạt động.");
}

async function analyzeOverallBusiness(req, res) {
    console.log('🤖 [Master AI] Nhận được yêu cầu phân tích toàn diện...');
    
    // =========================================================================
    // SỬ DỤNG geminiModelInstance THAY VÌ model VÀ KIỂM TRA TÍNH HỢP LỆ
    // =========================================================================
    if (!geminiModelInstance) { // <-- Lỗi của bạn ở đây, giờ đã sửa
        return res.status(503).json({ message: "Dịch vụ AI không khả dụng. Vui lòng kiểm tra cấu hình GEMINI_API_KEY và logs khởi tạo model." });
    }

    try {
        // ... (Bước 1: Lấy dữ liệu từ Database - Giữ nguyên) ...
        const [
            latestReport, 
            settings, 
            upcomingEvents, 
            recentOrders,
            allProducts,
            allCoupons,
            allCustomers,
            abandonedCheckouts
        ] = await Promise.all([
            DailyReport.findOne().sort({ report_date: -1 }),
            BusinessSettings.findOne({ shop_id: 'main_settings' }),
            FinancialEvent.find({ due_date: { $gte: new Date() }, is_paid: false }).sort({ due_date: 1 }),
            Order.find({ created_at_haravan: { $gte: new Date(new Date() - 30*24*60*60*1000) } }).lean(), // Thêm .lean()
            Product.find({}).lean(), 
            Coupon.find({}).lean(),
            Customer.find({}).sort({ total_spent: -1 }).lean(),
            AbandonedCheckout.find({ created_at_haravan: { $gte: new Date(new Date() - 7*24*60*60*1000) } }).lean()
        ]);

        if (!latestReport) {
            return res.status(404).json({ message: 'Không tìm thấy báo cáo nào để phân tích. Vui lòng nhập báo cáo cuối ngày trước.' });
        }

        // ... (Bước 2: Xử lý và tổng hợp dữ liệu chi tiết cho prompt - Giữ nguyên) ...
        const reportDate = new Date(latestReport.report_date);
        const nextDay = new Date(reportDate);
        nextDay.setDate(reportDate.getDate() + 1);
        const todaysOrders = recentOrders.filter(o => new Date(o.created_at_haravan) >= reportDate && new Date(o.created_at_haravan) < nextDay);
        
        const totalRecentRevenue = recentOrders.reduce((sum, order) => sum + order.total_price, 0);
        const daysInPeriod = 30; 
        const averageDailyRevenue = totalRecentRevenue / daysInPeriod;

        const todaysTopProducts = {};
        const todaysUsedCoupons = {};
        todaysOrders.forEach(order => {
            order.line_items.forEach(item => {
                todaysTopProducts[item.title] = (todaysTopProducts[item.title] || 0) + item.quantity;
            });
            order.discount_codes.forEach(coupon => {
                if (coupon && coupon.code) {
                    todaysUsedCoupons[coupon.code] = (todaysUsedCoupons[coupon.code] || 0) + 1;
                }
            });
        });

        const lowStockProducts = allProducts
            .filter(p => p.variants.some(v => v.inventory_quantity > 0 && v.inventory_quantity <= 5))
            .map(p => p.title)
            .slice(0, 5);
            
        const soldProductIds = new Set(recentOrders.flatMap(o => o.line_items.map(li => li.product_id)));
        const slowSellers = allProducts
            .filter(p => !soldProductIds.has(p.id) && p.variants.some(v => v.inventory_quantity > 0))
            .map(p => p.title)
            .slice(0, 5);

        const animePerformance = {}; 
        const productTypePerformanceByAnime = {}; 

        allProducts.forEach(product => {
            const animeGenreMatch = product.title.match(/\[(.*?)\]/);
            const animeGenre = animeGenreMatch ? animeGenreMatch[1].trim() : 'Không rõ Anime';
            const productTitleParts = product.title.split(' ');
            const productType = productTitleParts.length > 1 ? productTitleParts[0] : 'Không rõ loại'; 

            const productCreatedAt = new Date(product.created_at_haravan);
            const daysSinceCreation = Math.ceil((new Date() - productCreatedAt) / (1000 * 60 * 60 * 24));
            
            product.variants.forEach(variant => {
                const price = variant.price || 0;
                const cost = variant.cost || 0; // Cần thêm trường 'cost' vào Product Variant nếu có

                const quantitySoldRecent = recentOrders.reduce((sum, order) => {
                    const item = order.line_items.find(li => li.variant_id === variant.id);
                    return sum + (item ? item.quantity : 0);
                }, 0);

                const productRevenueRecent = quantitySoldRecent * price;

                if (!animePerformance[animeGenre]) {
                    animePerformance[animeGenre] = { total_revenue_recent: 0, total_quantity_recent: 0, products: [] };
                }
                animePerformance[animeGenre].total_revenue_recent += productRevenueRecent;
                animePerformance[animeGenre].total_quantity_recent += quantitySoldRecent;
                animePerformance[animeGenre].products.push({
                    title: product.title,
                    product_type: productType,
                    price: price,
                    inventory_quantity: variant.inventory_quantity,
                    quantity_sold_recent: quantitySoldRecent,
                    days_since_creation: daysSinceCreation,
                    is_slow_seller: slowSellers.includes(product.title)
                });

                if (!productTypePerformanceByAnime[animeGenre]) {
                    productTypePerformanceByAnime[animeGenre] = {};
                }
                if (!productTypePerformanceByAnime[animeGenre][productType]) {
                    productTypePerformanceByAnime[animeGenre][productType] = { total_revenue_recent: 0, total_quantity_recent: 0 };
                }
                productTypePerformanceByAnime[animeGenre][productType].total_revenue_recent += productRevenueRecent;
                productTypePerformanceByAnime[animeGenre][productType].total_quantity_recent += quantitySoldRecent;
            });
        });

        const productDetailsForAI = allProducts.map(p => {
            const animeGenreMatch = p.title.match(/\[(.*?)\]/);
            const animeGenre = animeGenreMatch ? animeGenreMatch[1].trim() : 'Không rõ Anime';
            const productTitleParts = p.title.split(' ');
            const productType = productTitleParts.length > 1 ? productTitleParts[0] : 'Không rõ loại'; 
            const productCreatedAt = new Date(p.created_at_haravan);
            const daysSinceCreation = Math.ceil((new Date() - productCreatedAt) / (1000 * 60 * 60 * 24));
            const totalQuantitySoldAllTime = recentOrders.reduce((sum, order) => {
                const item = order.line_items.find(li => li.product_id === p.id);
                return sum + (item ? item.quantity : 0);
            }, 0);
            const avgPrice = p.variants.reduce((sum, v) => sum + (v.price || 0), 0) / p.variants.length;
            const totalRevenueAllTime = totalQuantitySoldAllTime * avgPrice; 
            const isLowStock = lowStockProducts.includes(p.title);
            const isSlowSeller = slowSellers.includes(p.title);

            return {
                id: p.id,
                title: p.title,
                anime_genre: animeGenre,
                product_type: productType,
                current_inventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
                price: avgPrice,
                days_since_creation: daysSinceCreation,
                total_quantity_sold_all_time: totalQuantitySoldAllTime,
                total_revenue_all_time: totalRevenueAllTime,
                is_low_stock: isLowStock,
                is_slow_seller: isSlowSeller
            };
        });

        const customerDetailsForAI = allCustomers.map(c => ({
            id: c.id,
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            email: c.email,
            total_spent: c.total_spent,
            orders_count: c.orders_count
        }));
        
        // --- Bước 3: Tạo một PROMPT CHUYÊN SÂU cho AI (Yêu cầu JSON output) ---
        const prompt = `
Là một Giám đốc Vận hành (COO) và Giám đốc Marketing (CMO) cấp cao cho một cửa hàng thương mại điện tử chuyên bán đồ anime. Nhiệm vụ của bạn là phân tích toàn diện dữ liệu kinh doanh, đưa ra các đề xuất chiến lược chi tiết, có thể hành động được, nhằm tối ưu hóa doanh thu, lợi nhuận, và hiệu quả hoạt động marketing. Bạn cần xem xét cả tình hình tài chính, vận hành, tồn kho và hành vi khách hàng.
**Mục tiêu cốt lõi:**
- Phân tích sâu sắc dữ liệu để đưa ra các insight có giá trị.
- Đề xuất các hành động cụ thể, các mã giảm giá mới (hàng ngày và theo sự kiện), và các chiến dịch email marketing tự động.
- **Mọi đề xuất mã giảm giá cần được tính toán để ĐẢM BẢO LỢI NHUẬN TRÊN MỖI SẢN PHẨM TRUNG BÌNH LÀ 30% (biên lợi nhuận của bạn).** Nếu một đề xuất mã giảm giá làm giảm lợi nhuận dưới ngưỡng này, hãy giải thích rủi ro hoặc đề xuất cách bù đắp.

**Dữ liệu cung cấp:**
- **Báo cáo tài chính & kinh doanh (Hôm nay ${latestReport.report_date.toLocaleDateString('vi-VN')}):**
  - Doanh thu ${latestReport.total_revenue.toLocaleString('vi-VN')}đ, Lợi nhuận ${latestReport.total_profit.toLocaleString('vi-VN')}đ.
  - Chi phí cố định tháng (ước tính): ${((settings?.monthly_rent_cost || 0) + (settings?.monthly_staff_cost || 0) + (settings?.monthly_marketing_cost || 0) + (settings?.monthly_other_cost || 0)).toLocaleString('vi-VN')}đ.
  - Mục tiêu lợi nhuận tháng: ${(settings?.monthly_profit_target || 0).toLocaleString('vi-VN')}đ.
  - Doanh thu trung bình hàng ngày (30 ngày qua): ${averageDailyRevenue.toLocaleString('vi-VN')}đ.
  - Sự kiện chi tiền lớn sắp tới: ${JSON.stringify(upcomingEvents.map(e => ({name: e.event_name, amount: e.amount, due_date: e.due_date.toLocaleDateString('vi-VN'), days_left: Math.ceil((new Date(e.due_date) - new Date()) / (1000 * 60 * 60 * 24)) })))}.

- **Dữ liệu Vận hành & Tồn kho (Trong 30 ngày qua, cập nhật hôm nay):**
  - Top 5 sản phẩm bán chạy nhất HÔM NAY (số lượng): ${JSON.stringify(Object.entries(todaysTopProducts).sort((a, b) => b[1] - a[1]).slice(0, 5))}.
  - Các mã giảm giá đã được sử dụng HÔM NAY (số lượt): ${JSON.stringify(todaysUsedCoupons)}.
  - Top 5 sản phẩm sắp hết hàng (tồn kho <= 5, số lượng > 0): ${JSON.stringify(lowStockProducts)}.
  - Top 5 sản phẩm bán chậm (không bán được trong 30 ngày qua, còn tồn): ${JSON.stringify(slowSellers)}.
  - **Phân tích hiệu suất theo Anime (Tổng quan 30 ngày):** ${JSON.stringify(animePerformance)}.
  - **Phân tích hiệu suất theo Loại Sản phẩm trong từng Anime (Tổng quan 30 ngày):** ${JSON.stringify(productTypePerformanceByAnime)}.
  - **Chi tiết tất cả sản phẩm:** ${JSON.stringify(productDetailsForAI)}.

- **Dữ liệu Khuyến mãi & Khách hàng (Tổng thể và gần đây):**
  - Tổng số mã giảm giá đang có: ${allCoupons.length}.
  - Top 5 khách hàng chi tiêu nhiều nhất (theo tổng chi tiêu): ${JSON.stringify(allCustomers.slice(0, 5).map(c => ({name: c.first_name + ' ' + c.last_name, total_spent: c.total_spent})))}.
  - **Chi tiết tất cả khách hàng:** ${JSON.stringify(customerDetailsForAI)}.
  - Số lượng giỏ hàng bị bỏ quên trong 7 ngày qua: ${abandonedCheckouts.length}.
  - Biên lợi nhuận trung bình trên mỗi sản phẩm: 30%. (Đây là dữ liệu quan trọng cho các tính toán về mã giảm giá).

**PHÂN TÍCH CHUYÊN SÂU & ĐỀ XUẤT CÓ HÀNH ĐỘNG (Vui lòng trả về một đối tượng JSON CÓ CẤU TRÚC RÕ RÀNG VÀ CHÍNH XÁC SAU. Đảm bảo tất cả các trường đều phải có mặt và không rỗng. Nếu không có dữ liệu để phân tích sâu, hãy điền "N/A", "Không có dữ liệu", hoặc mảng rỗng [] và giải thích lý do ngắn gọn):**
\`\`\`json
{
  "alerts": [
    { 
      "type": "warning | info | critical", 
      "message": "Cảnh báo quan trọng nhất về tình hình kinh doanh, dòng tiền, tồn kho, doanh số. Ví dụ: 'Dòng tiền có thể gặp vấn đề nếu không đạt doanh thu X để bù đặp chi phí sắp tới Y.' Tối đa 2 cảnh báo." 
    }
  ],
  "insights": [
    { "title": "Tiêu đề Insight 1", "description": "Nhận định sâu sắc 1. Hãy tìm mối liên hệ giữa các bộ dữ liệu khác nhau (ví dụ: mã giảm giá X không hiệu quả trên sản phẩm Y bán chậm, khách hàng VIP không mua sản phẩm mới). Phân tích hiệu suất từng anime (nếu có dữ liệu đủ) và loại sản phẩm trong anime đó. Đưa ra lý do hoặc xu hướng rõ ràng." },
    { "title": "Tiêu đề Insight 2", "description": "Nhận định sâu sắc 2. Ví dụ: 'Anime [Tên Anime] đang có doanh số vượt trội, đặc biệt ở sản phẩm [Loại sản phẩm], cần đẩy mạnh marketing cho các sản phẩm liên quan'." },
    { "title": "Tiêu đề Insight 3", "description": "Nhận định sâu sắc 3. Ví dụ: 'Khách hàng VIP [Tên khách hàng] đã chi tiêu nhiều nhưng chưa tương tác với các ưu đãi mới nhất, cần cá nhân hóa marketing'." }
  ],
  "action_plan": [
    { 
      "action": "Tiêu đề hành động 1", 
      "details": "Mô tả chi tiết hành động 1 (ví dụ: 'Nhập thêm 50 sản phẩm X vì tồn kho thấp và bán chạy', 'Tạo chiến dịch xả hàng cho Y').",
      "priority": "High | Medium | Low",
      "category": "Inventory | Marketing | Financial | Customer"
    },
    { "action": "Tiêu đề hành động 2", "details": "Mô tả chi tiết hành động 2.", "priority": "High | Medium | Low", "category": "Inventory | Marketing | Financial | Customer" },
    { "action": "Tiêu đề hành động 3", "details": "Mô tả chi tiết hành động 3.", "priority": "High | Medium | Low", "category": "Inventory | Marketing | Financial | Customer" }
  ],
  "daily_coupon_suggestion": {
    "code": "MA_MOI_HANG_NGAY",
    "value": "Giá trị giảm giá (ví dụ: 10% hoặc 20000)", 
    "type": "percentage | fixed_amount | free_shipping",
    "min_order_value": "Giá trị đơn hàng tối thiểu để áp dụng (VD: 150000)",
    "target_product_titles": [], 
    "reason": "Giải thích lý do đề xuất mã này dựa trên hành vi khách hàng 2-3 ngày qua (ví dụ: sản phẩm bán chậm, giỏ hàng bị bỏ quên) VÀ TÍNH TOÁN RÕ RÀNG LỢI NHUẬN ĐỂ ĐẢM BẢO KHÔNG LỖ. VD: 'Mã giảm 10% trên đơn 200k sẽ giữ lợi nhuận ở 20%, kích thích mua hàng chậm. Nếu không thể duy trì 30% lợi nhuận, cần nêu rõ lợi nhuận dự kiến'."
  },
  "event_campaign_plan": {
    "event_name": "Tên sự kiện (ví dụ: Ngày Đôi 8/8, Trung Thu)",
    "date": "Ngày diễn ra sự kiện (ví dụ: 2025-08-08)",
    "theme": "Chủ đề chính của chiến dịch",
    "target_audience": "Đối tượng mục tiêu (ví dụ: Khách hàng VIP, Khách hàng mới, Khách hàng bỏ quên giỏ hàng)",
    "proposed_coupon": {
      "code": "MA_SU_KIEN",
      "value": "Giá trị giảm giá",
      "type": "percentage | fixed_amount | free_shipping",
      "min_order_value": "Giá trị đơn hàng tối thiểu",
      "target_customer_segments": [], 
      "reason": "Lý do đề xuất mã này dựa trên hành vi khách hàng 1 tháng gần nhất và mục tiêu lợi nhuận (30% trung bình). Đảm bảo mã không làm lỗ đơn hàng."
    },
    "promotion_channels": [ "Email", "Facebook Ads", "Website Banner" ],
    "key_messages": [ "Thông điệp chính 1", "Thông điệp chính 2" ]
  },
  "abandoned_cart_emails": [
    { 
      "customer_email": "email_khach_hang", 
      "subject": "Chủ đề email (ví dụ: Giỏ hàng của bạn đang chờ!)", 
      "body_snippet": "Đoạn nội dung chính của email, bao gồm lời nhắc, mã giảm giá đề xuất (ví dụ: MABOHANG, giảm X% hoặc Y VND), và kêu gọi hành động. Nhấn mạnh ưu đãi để kích thích mua hàng. Đảm bảo mã không làm lỗ đơn hàng với biên lợi nhuận 30%."
    }
  ],
  "anime_performance_summary": { 
    "overall_insights": "Phân tích tổng quan các anime nào đang bán tốt/yếu và lý do có thể (dựa trên sản phẩm, doanh thu, số lượng bán).",
    "detailed_breakdown": [
      {
        "anime_genre": "Tên Anime",
        "performance_summary": "Tóm tắt hiệu suất (tốt, trung bình, yếu), tổng doanh thu, tổng số lượng bán gần đây.",
        "product_type_performance": [ 
          {
            "product_type": "Đồ bông | Thẻ | Mô hình",
            "performance": "Tốt | Yếu",
            "recommendation": "Đề xuất nhập thêm / dừng nhập / đẩy hàng tồn với mã giảm giá (có tính toán lợi nhuận). Ví dụ: 'Dừng nhập đồ bông [Blue Lock] vì bán yếu dù đã tạo từ lâu và giá cao. Nên đẩy hàng tồn với mã FREESHIP'."
          }
        ]
      }
    ]
  },
  "customer_loyalty_strategies": [ 
    {
      "strategy_name": "Tên chiến lược (ví dụ: Gói quà tặng VIP, Ưu đãi sinh nhật)",
      "target_customers_segment": "Phân khúc khách hàng mục tiêu (ví dụ: Top 10 khách hàng chi tiêu nhiều nhất)",
      "details": "Mô tả chi tiết cách thực hiện, bao gồm mã giảm giá (nếu có, tính toán lợi nhuận), hoặc các ưu đãi đặc biệt để tăng lòng trung thành.",
      "estimated_impact": "Ước tính tác động (ví dụ: Tăng 10% tần suất mua hàng của nhóm khách VIP)."
    }
  ]
}
\`\`\`
**Hãy đảm bảo toàn bộ phản hồi là một JSON hợp lệ và tuân thủ cấu trúc trên. Không thêm bất kỳ văn bản giải thích nào bên ngoài khối JSON. Nếu có dữ liệu thiếu, hãy điền các trường là N/A hoặc [] nhưng vẫn giữ nguyên cấu trúc.**
        `;

        // =========================================================================
        // THAY ĐỔI: Sử dụng geminiModelInstance
        // =========================================================================
        const result = await geminiModelInstance.generateContent(prompt);
        const response = await result.response;
        const textResponse = response.text();

        console.log('Phản hồi RAW từ Gemini:', textResponse); 

        let analysisResultJson;
        try {
            const jsonString = textResponse.replace(/```json\n|```/g, '').trim();
            analysisResultJson = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('❌ Lỗi parsing JSON từ Gemini:', parseError.message);
            console.error('Phản hồi Gemini không phải JSON hợp lệ:', textResponse);
            return res.status(500).json({ message: 'Lỗi parsing phản hồi AI. Vui lòng kiểm tra định dạng output của AI.', rawResponse: textResponse });
        }

        res.status(200).json(analysisResultJson);

    } catch (error) {
        console.error('❌ Lỗi trong quá trình phân tích toàn diện:', error);
        res.status(500).json({ message: 'Lỗi trong quá trình phân tích toàn diện.', error: error.message });
    }
}

// Export hàm để có thể sử dụng trong router
module.exports = {
    analyzeOverallBusiness
};
