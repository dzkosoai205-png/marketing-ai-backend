// ==========================================================
// File: controllers/masterAI.controller.js (Đã thêm chức năng AI Chat trực tiếp)
// Nhiệm vụ: Xử lý logic AI để phân tích dữ liệu kinh doanh VÀ chat AI.
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
const ChatSession = require('../models/chatSession.model'); // <-- THÊM: Import ChatSession Model

// Lấy API Key từ biến môi trường
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let geminiModelInstance = null; 

if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        geminiModelInstance = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
        console.log("✅ Gemini model 'gemini-2.0-flash' đã được khởi tạo thành công.");
    } catch (error) {
        console.error("❌ Lỗi khi khởi tạo Gemini AI Model:", error.message);
        console.warn("Cảnh báo: Tính năng AI sẽ không hoạt động do lỗi khởi tạo model.");
    }
} else {
    console.warn("Cảnh báo: Biến môi trường GEMINI_API_KEY chưa được thiết lập. Tính năng AI sẽ không hoạt động.");
}

// =========================================================================
// Hàm trợ giúp để lấy thông tin phân loại sản phẩm (tận dụng Haravan Collections)
// =========================================================================
const getProductCategorization = (product) => {
    let animeGenre = 'Anime/Series Khác'; 
    let productCategory = 'Loại Khác'; 

    if (product.haravan_collection_names && product.haravan_collection_names.length > 0) {
        const mainAnimeCollection = product.haravan_collection_names.find(colName => {
            const lowerColName = colName.toLowerCase();
            return !(lowerColName.includes('hàng có sẵn') || lowerColName.includes('bán chạy') || lowerColName.includes('hàng mới') || lowerColName.includes('all products')); 
        });

        if (mainAnimeCollection) {
            animeGenre = mainAnimeCollection.trim();
        } else {
            animeGenre = product.haravan_collection_names[0].trim();
        }
    } else {
        const animeGenreMatch = product.title.match(/\[(.*?)\]/);
        animeGenre = animeGenreMatch ? animeGenreMatch[1].trim() : 'Anime/Series Khác (từ tiêu đề)';
    }

    const predefinedCategories = ["Thẻ", "Đồ bông", "Móc khóa", "Mô hình", "Poster", "Artbook", "Áo", "Phụ kiện", "Gói", "Tượng", "Văn phòng phẩm", "Đồ chơi"]; 
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
    if (productCategory === 'Loại Khác' && product.title.split(' ').length > 0) {
        productCategory = product.title.split(' ')[0].trim();
    }

    return { anime_genre: animeGenre, product_category: productCategory };
};


async function analyzeOverallBusiness(req, res) {
    console.log('🤖 [Master AI] Nhận được yêu cầu phân tích toàn diện...');
    
    if (!geminiModelInstance) {
        return res.status(503).json({ message: "Dịch vụ AI không khả dụng. Vui lòng kiểm tra cấu hình GEMINI_API_KEY và logs khởi tạo model." });
    }

    try {
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
            DailyReport.findOne().sort({ report_date: -1 }).lean(), 
            BusinessSettings.findOne({ shop_id: 'main_settings' }).lean(),
            FinancialEvent.find({ due_date: { $gte: new Date() }, is_paid: false }).sort({ due_date: 1 }).lean(),
            Order.find({ created_at_haravan: { $gte: new Date(new Date() - 30*24*60*60*1000) } }).lean(),
            Product.find({}).lean(), // Lấy dữ liệu sản phẩm đầy đủ từ DB
            Coupon.find({}).lean(),
            Customer.find({}).sort({ total_spent: -1 }).lean(),
            AbandonedCheckout.find({ created_at_haravan: { $gte: new Date(new Date() - 7*24*60*60*1000) } }).lean()
        ]);

        if (!latestReport || !latestReport.total_revenue || !latestReport.total_profit) {
            console.warn('⚠️ [Master AI] Không tìm thấy báo cáo hoặc dữ liệu báo cáo không đầy đủ.');
            return res.status(404).json({ message: 'Không tìm thấy báo cáo cuối ngày để phân tích hoặc báo cáo thiếu dữ liệu doanh thu/lợi nhuận. Vui lòng đảm bảo báo cáo cuối ngày đã được nhập.' });
        }

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
            
        const soldProductIdsInRecentOrders = new Set(recentOrders.flatMap(o => o.line_items.map(li => li.product_id)));
        const slowSellers = allProducts
            .filter(p => !soldProductIdsInRecentOrders.has(p.id) && p.variants.some(v => v.inventory_quantity > 0))
            .map(p => p.title)
            .slice(0, 5);

        // --- Phân tích hiệu suất theo Nhóm sản phẩm / Anime và loại sản phẩm ---
        const groupPerformance = {}; 
        const productTypePerformanceByGroup = {}; 

        allProducts.forEach(product => {
            const { anime_genre, product_category } = getProductCategorization(product); 

            product.anime_genre = anime_genre;
            product.product_category = product_category;

            const productCreatedAt = new Date(product.created_at_haravan);
            const daysSinceCreation = Math.ceil((new Date() - productCreatedAt) / (1000 * 60 * 60 * 24));
            
            product.variants.forEach(variant => {
                const price = variant.price || 0;
                const cost = variant.cost || 0; 

                const quantitySoldRecent = recentOrders.reduce((sum, order) => {
                    const item = order.line_items.find(li => li.variant_id === variant.id);
                    return sum + (item ? item.quantity : 0);
                }, 0);

                const productRevenueRecent = quantitySoldRecent * price;
                const productProfitRecent = quantitySoldRecent * (price - cost); 

                if (!groupPerformance[product.anime_genre]) { 
                    groupPerformance[product.anime_genre] = { 
                        total_revenue_recent: 0, 
                        total_profit_recent: 0, 
                        total_quantity_recent: 0, 
                        total_products: 0,
                        product_types_summary: {} 
                    };
                }
                groupPerformance[product.anime_genre].total_revenue_recent += productRevenueRecent;
                groupPerformance[product.anime_genre].total_profit_recent += productProfitRecent;
                groupPerformance[product.anime_genre].total_quantity_recent += quantitySoldRecent;
                groupPerformance[product.anime_genre].total_products += 1; 

                if (!productTypePerformanceByGroup[product.anime_genre]) {
                    productTypePerformanceByGroup[product.anime_genre] = {};
                }
                if (!productTypePerformanceByGroup[product.anime_genre][product.product_category]) {
                    productTypePerformanceByGroup[product.anime_genre][product.product_category] = { 
                        total_revenue_recent: 0, 
                        total_profit_recent: 0, 
                        total_quantity_recent: 0, 
                        product_count: 0 
                    };
                }
                productTypePerformanceByGroup[product.anime_genre][product.product_category].total_revenue_recent += productRevenueRecent;
                productTypePerformanceByGroup[product.anime_genre][product.product_category].total_profit_recent += productProfitRecent;
                productTypePerformanceByGroup[product.anime_genre][product.product_category].total_quantity_recent += quantitySoldRecent;
                productTypePerformanceByGroup[product.anime_genre][product.product_category].product_count += 1;

                if (!groupPerformance[product.anime_genre].product_types_summary[product.product_category]) {
                    groupPerformance[product.anime_genre].product_types_summary[product.product_category] = { 
                        total_revenue_recent: 0, 
                        total_profit_recent: 0, 
                        total_quantity_recent: 0, 
                        product_count: 0 
                    };
                }
                groupPerformance[product.anime_genre].product_types_summary[product.product_category].total_revenue_recent += productRevenueRecent;
                groupPerformance[product.anime_genre].product_types_summary[product_category].total_profit_recent += productProfitRecent;
                groupPerformance[product.anime_genre].product_types_summary[product_category].total_quantity_recent += quantitySoldRecent;
                groupPerformance[product.anime_genre].product_types_summary[product_category].product_count += 1;
            });
        });

        const productDetailsForAI = allProducts.map(p => {
            const { anime_genre, product_category } = getProductCategorization(p);
            const productCreatedAt = new Date(p.created_at_haravan);
            const daysSinceCreation = Math.ceil((new Date() - productCreatedAt) / (1000 * 60 * 60 * 24));
            
            const totalQuantitySoldRecentOfProduct = recentOrders.reduce((sum, order) => {
                const item = order.line_items.find(li => li.product_id === p.id);
                return sum + (item ? item.quantity : 0);
            }, 0);

            const totalVariantPrice = p.variants.reduce((sum, v) => sum + (v.price || 0), 0); 
            const totalVariantCost = p.variants.reduce((sum, v) => sum + (v.cost || 0), 0); 
            const avgPrice = p.variants.length > 0 ? (totalVariantPrice / p.variants.length) : 0;
            const avgCost = p.variants.length > 0 ? (totalVariantCost / p.variants.length) : 0;
            
            const totalRevenueRecentOfProduct = totalQuantitySoldRecentOfProduct * avgPrice;
            const totalProfitRecentOfProduct = totalQuantitySoldRecentOfProduct * (avgPrice - avgCost);

            const isLowStock = lowStockProducts.includes(p.title);
            const isSlowSeller = slowSellers.includes(p.title);

            return {
                id: p.id,
                title: p.title,
                anime_genre: anime_genre, 
                product_category: product_category, 
                haravan_collection_names: p.haravan_collection_names || [], 
                current_inventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
                price: avgPrice,
                cost: avgCost,
                days_since_creation: daysSinceCreation,
                total_quantity_sold_recent: totalQuantitySoldRecentOfProduct,
                total_revenue_recent: totalRevenueRecentOfProduct,         
                total_profit_recent: totalProfitRecentOfProduct,           
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
  - Sự kiện chi tiền lớn sắp tới: ${JSON.stringify(upcomingEvents.map(e => ({
      name: e.event_name, 
      amount: e.amount, 
      due_date: e.due_date.toLocaleDateString('vi-VN'), 
      days_left: Math.ceil((new Date(e.due_date) - new Date()) / (1000 * 60 * 60 * 24)) 
    })))}.
  - **Phân tích tài chính cho Sự kiện sắp tới:**
    - Tổng chi phí sắp tới: ${upcomingEvents.reduce((sum, e) => sum + e.amount, 0).toLocaleString('vi-VN')}đ.
    - Doanh thu cần kiếm thêm mỗi ngày để đủ chi phí (nếu doanh thu trung bình hiện tại không đủ): 
      ${(upcomingEvents.length > 0 && upcomingEvents[0].days_left > 0 && upcomingEvents.reduce((sum, e) => sum + e.amount, 0) > (averageDailyRevenue * upcomingEvents[0].days_left)) 
        ? ((upcomingEvents.reduce((sum, e) => sum + e.amount, 0) - (averageDailyRevenue * upcomingEvents[0].days_left)) / upcomingEvents[0].days_left).toLocaleString('vi-VN') + 'đ/ngày' 
        : 'Không cần lo lắng dựa trên doanh thu hiện tại hoặc không có sự kiện.'}.

- **Dữ liệu Vận hành & Tồn kho (Trong 30 ngày qua, cập nhật hôm nay):**
  - Top 5 sản phẩm bán chạy nhất HÔM NAY (số lượng): ${JSON.stringify(Object.entries(todaysTopProducts).sort((a, b) => b[1] - a[1]).slice(0, 5))}.
  - Các mã giảm giá đã được sử dụng HÔM NAY (số lượt): ${JSON.stringify(todaysUsedCoupons)}.
  - Top 5 sản phẩm bán chậm (không bán được trong 30 ngày qua, còn tồn): ${JSON.stringify(slowSellers)}.
  - **Phân tích hiệu suất theo Nhóm sản phẩm (từ Haravan Collections - Tổng quan 30 ngày):** ${JSON.stringify(Object.entries(groupPerformance).map(([group, data]) => ({ group, ...data })))}.
  - **Phân tích hiệu suất theo Loại Sản phẩm trong từng Nhóm sản phẩm (Tổng quan 30 ngày):** ${JSON.stringify(Object.entries(productTypePerformanceByGroup).map(([group, types]) => ({ group, types: Object.entries(types).map(([type, data]) => ({ type, ...data })) })))}.
  - **Chi tiết tất cả sản phẩm (bao gồm product_group, product_category, haravan_collection_names, giá, giá vốn, ngày tạo, số lượng bán trong 30 ngày, doanh thu, lợi nhuận, tồn kho, bán chậm):** ${JSON.stringify(productDetailsForAI)}.

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
      "message": "Cảnh báo quan trọng nhất về tình hình kinh doanh, dòng tiền, tồn kho, doanh số. Ví dụ: 'Dòng tiền có thể gặp vấn đề nếu không đạt doanh thu X để bù đắp chi phí sắp tới Y.' Tối đa 2 cảnh báo." 
    }
  ],
  "insights": [
    { "title": "Tiêu đề Insight 1", "description": "Nhận định sâu sắc 1. Hãy tìm mối liên hệ giữa các bộ dữ liệu khác nhau (ví dụ: mã giảm giá X không hiệu quả trên sản phẩm Y bán chậm, khách hàng VIP không mua sản phẩm mới). Phân tích hiệu suất từng nhóm sản phẩm (từ haravan_collection_names) và loại sản phẩm trong nhóm đó. Đưa ra lý do hoặc xu hướng rõ ràng." },
    { "title": "Tiêu đề Insight 2", "description": "Nhận định sâu sắc 2. Ví dụ: 'Nhóm sản phẩm [Tên Nhóm] đang có doanh số vượt trội, đặc biệt ở sản phẩm [Loại sản phẩm], cần đẩy mạnh marketing cho các sản phẩm liên quan'." },
    { "title": "Tiêu đề Insight 3", "description": "Nhận định sâu sắc 3. Ví dụ: 'Khách hàng VIP [Tên khách hàng] đã chi tiêu nhiều nhưng chưa tương tác với các ưu đãi mới nhất, cần cá nhân hóa marketing'." },
    { "title": "Insight 4: Phân tích Dòng tiền sự kiện sắp tới", "description": "Dựa trên doanh thu trung bình hiện tại và chi phí cố định/sự kiện sắp tới, phân tích khả năng đạt mục tiêu tài chính và đề xuất doanh thu cần thiết hàng ngày để bù đắp. Nếu thiếu, hãy nêu rõ rủi ro và cần tập trung vào sản phẩm nào (bán chạy/yếu) để bù đắp."}
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
    "target_product_titles": [], // Danh sách TÊN sản phẩm cụ thể nếu mã chỉ áp dụng cho một số sản phẩm (nếu không, để trống)
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
    "overall_insights": "Phân tích tổng quan các nhóm sản phẩm (từ haravan_collection_names) nào đang bán tốt/yếu và lý do có thể (dựa trên sản phẩm, doanh thu, số lượng bán).",
    "detailed_breakdown": [
      {
        "product_group": "Tên Nhóm sản phẩm (từ Haravan Collection)",
        "performance_summary": "Tóm tắt hiệu suất (tốt, trung bình, yếu), tổng doanh thu, tổng số lượng bán gần đây.",
        "product_type_performance": [ 
          {
            "product_type": "Đồ bông | Thẻ | Mô hình",
            "performance": "Tốt | Yếu",
            "recommendation": "Đề xuất nhập thêm / dừng nhập / đẩy hàng tồn với mã giảm giá (có tính toán lợi nhuận). Ví dụ: 'Dừng nhập đồ bông [Tên Nhóm] vì bán yếu dù đã tạo từ lâu và giá cao. Nên đẩy hàng tồn với mã FREESHIP'."
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
