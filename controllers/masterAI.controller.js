// ==========================================================
// File: controllers/masterAI.controller.js
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
const ChatSession = require('../models/chatSession.model');

// Lấy API Key từ biến môi trường
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let geminiModelInstance = null;

if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // Sử dụng gemini-1.5-flash-latest hoặc gemini-2.0-flash tùy vào API Key của bạn
        geminiModelInstance = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        console.log("✅ Gemini model 'gemini-1.5-flash-latest' đã được khởi tạo thành công.");
    } catch (error) {
        console.error("❌ Lỗi khi khởi tạo Gemini AI Model:", error.message);
        console.warn("Cảnh báo: Tính năng AI sẽ không hoạt động do lỗi khởi tạo model.");
    }
} else {
    console.warn("Cảnh báo: Biến môi trường GEMINI_API_KEY chưa được thiết lập. Tính năng AI sẽ không hoạt động.");
}

const getProductCategorization = (product) => {
    let animeGenre = 'Anime/Series Khác';
    let productCategory = 'Loại Khác';

    // Ưu tiên từ haravan_collection_names
    if (product.haravan_collection_names && product.haravan_collection_names.length > 0) {
        const mainAnimeCollection = product.haravan_collection_names.find(colName => {
            const lowerColName = colName.toLowerCase();
            return !(lowerColName.includes('hàng có sẵn') || lowerColName.includes('bán chạy') || lowerColName.includes('hàng mới') || lowerColName.includes('all products') || lowerColName.includes('bộ sản phẩm') || lowerColName.includes('sản phẩm')) ;
        });

        if (mainAnimeCollection) {
            animeGenre = mainAnimeCollection.trim();
        } else if (product.haravan_collection_names.length > 0) {
            // Fallback nếu không tìm thấy collection chính, dùng cái đầu tiên
            animeGenre = product.haravan_collection_names[0].trim();
        }
    } else {
        // Nếu không có collection, thử trích xuất từ tiêu đề
        const animeGenreMatch = product.title.match(/\[(.*?)\]/);
        animeGenre = animeGenreMatch ? animeGenreMatch[1].trim() : 'Anime/Series Khác (từ tiêu đề)';
    }

    // Phân loại sản phẩm
    const predefinedCategories = ["Thẻ", "Đồ bông", "Móc khóa", "Mô hình", "Poster", "Artbook", "Áo", "Phụ kiện", "Gói", "Tượng", "Văn phòng phẩm", "Đồ chơi", "Standee", "Badge", "Shikishi", "Block", "Fuwa", "Tapinui", "Nendoroid", "Figure", "Lookup"];
    const lowerCaseTitle = product.title.toLowerCase();

    for (const category of predefinedCategories) {
        if (lowerCaseTitle.includes(category.toLowerCase())) {
            productCategory = category;
            break;
        }
    }
    // Fallback nếu không tìm thấy trong danh mục định sẵn
    if (productCategory === 'Loại Khác' && product.product_type) {
        productCategory = product.product_type;
    }
    if (productCategory === 'Loại Khác' && product.title.split(' ').length > 0) {
        productCategory = product.title.split(' ')[0].trim();
    }

    return { anime_genre: animeGenre, product_category: productCategory };
};

const analyzeOverallBusiness = async (req, res) => {
    console.log('🤖 [Master AI] Nhận được yêu cầu phân tích toàn diện...');

    if (!geminiModelInstance) {
        return res.status(503).json({ message: "Dịch vụ AI không khả dụng. Vui lòng kiểm tra cấu hình GEMINI_API_KEY và logs khởi tạo model." });
    }

    const { report_date: selectedReportDateString } = req.body;

    if (!selectedReportDateString) {
        return res.status(400).json({ message: 'Thiếu tham số ngày báo cáo (report_date) trong yêu cầu phân tích AI.' });
    }

    try {
        // =========================================================================
        // Chuẩn hóa ngày truy vấn DailyReport về đầu ngày theo GMT+7 (dưới dạng UTC)
        // Đây là biến chúng ta sẽ sử dụng cho các truy vấn theo ngày báo cáo
        // =========================================================================
        const queryDateForDailyReport = new Date(selectedReportDateString); // VD: '2025-08-02'
        queryDateForDailyReport.setUTCHours(0,0,0,0); // Đặt giờ UTC về 0 để khớp với cách lưu trong DB


        const [
            reportForAnalysis,
            settings,
            upcomingEvents,
            recentOrders, // Lấy orders từ Haravan, created_at_haravan đã được điều chỉnh +7 giờ
            allProducts,
            allCoupons,
            allCustomers,
            abandonedCheckouts
        ] = await Promise.all([
            DailyReport.findOne({ report_date: queryDateForDailyReport }).lean(), // Truy vấn báo cáo của ngày được chọn
            BusinessSettings.findOne({ shop_id: 'main_settings' }).lean(),
            FinancialEvent.find({ due_date: { $gte: new Date() }, is_paid: false }).sort({ due_date: 1 }).lean(),
            Order.find({ created_at_haravan: { $gte: new Date(new Date().getTime() - 30*24*60*60*1000) } }).lean(), // Lấy orders 30 ngày, đã +7 giờ
            Product.find({}).lean(),
            Coupon.find({}).lean(),
            Customer.find({}).sort({ total_spent: -1 }).lean(),
            AbandonedCheckout.find({ created_at_haravan: { $gte: new Date(new Date().getTime() - 7*24*60*60*1000) } }).lean()
        ]);

        let reportDataForAI = {
            total_revenue: 0,
            total_profit: 0,
            notes: "Không có báo cáo kinh doanh được nhập cho ngày này.",
            report_date: queryDateForDailyReport // Ngày đã chuẩn hóa cho báo cáo
        };
        if (reportForAnalysis) {
            reportDataForAI = reportForAnalysis;
            console.log(`✅ [Master AI] Đã tìm thấy báo cáo cho ngày ${reportDataForAI.report_date.toLocaleDateString('vi-VN')} để phân tích.`);
        } else {
            console.warn(`⚠️ [Master AI] Không tìm thấy báo cáo cho ngày ${new Date(selectedReportDateString).toLocaleDateString('vi-VN')}. AI sẽ phân tích với dữ liệu báo cáo 0.`);
        }

        // =========================================================================
        // Điều chỉnh logic lọc đơn hàng để khớp với ngày đã được điều chỉnh +7 giờ
        // =========================================================================
        const startOfSelectedDayAdjusted = new Date(selectedReportDateString);
        startOfSelectedDayAdjusted.setUTCHours(0,0,0,0); // Đầu ngày UTC cho ngày được chọn

        const endOfSelectedDayAdjusted = new Date(selectedReportDateString);
        endOfSelectedDayAdjusted.setUTCHours(23,59,59,999); // Cuối ngày UTC cho ngày được chọn

        // Lọc todaysOrders dựa trên created_at_haravan (đã là +7 giờ) và các mốc thời gian UTC đã chuẩn hóa
        const todaysOrders = recentOrders.filter(o => {
            const orderCreatedAt = new Date(o.created_at_haravan); // Đã là Date object mang giá trị UTC đã +7 giờ
            return orderCreatedAt.getUTCFullYear() === startOfSelectedDayAdjusted.getUTCFullYear() &&
                   orderCreatedAt.getUTCMonth() === startOfSelectedDayAdjusted.getUTCMonth() &&
                   orderCreatedAt.getUTCDate() === startOfSelectedDayAdjusted.getUTCDate();
        });


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

        const groupPerformance = {};
        const productTypePerformanceByGroup = {};

        allProducts.forEach(product => {
            const { anime_genre, product_category } = getProductCategorization(product);

            // Gán lại để sử dụng sau này cho AI
            product.anime_genre = anime_genre;
            product.product_category = product_category;

            const productCreatedAt = new Date(product.created_at_haravan);
            const daysSinceCreation = Math.ceil((new Date().getTime() - productCreatedAt.getTime()) / (1000 * 60 * 60 * 24));

            product.variants.forEach(variant => {
                const price = variant.price || 0;
                const cost = variant.cost || 0;

                const quantitySoldRecent = recentOrders.reduce((sum, order) => {
                    const item = order.line_items.find(li => li.variant_id === variant.id);
                    return sum + (item ? item.quantity : 0);
                }, 0);

                const productRevenueRecent = quantitySoldRecent * price;
                const productProfitRecent = quantitySoldRecent * (price - cost);

                // Tổng hợp theo Nhóm sản phẩm (Anime Genre)
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

                // Tổng hợp theo Loại sản phẩm trong từng Nhóm (cho detailed_breakdown)
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

                // Tổng hợp cho summary bên trong groupPerformance
                if (!groupPerformance[product.anime_genre].product_types_summary[product.product_category]) {
                    groupPerformance[product.anime_genre].product_types_summary[product.product_category] = {
                        total_revenue_recent: 0,
                        total_profit_recent: 0,
                        total_quantity_recent: 0,
                        product_count: 0
                    };
                }
                groupPerformance[product.anime_genre].product_types_summary[product.product_category].total_revenue_recent += productRevenueRecent;
                groupPerformance[product.anime_genre].product_types_summary[product.product_category].total_profit_recent += productProfitRecent;
                groupPerformance[product.anime_genre].product_types_summary[product.product_category].total_quantity_recent += quantitySoldRecent; // Sử dụng product.product_category
                groupPerformance[product.anime_genre].product_types_summary[product.product_category].product_count += 1; // Sử dụng product.product_category
            });
        });

        // Chuẩn bị dữ liệu chi tiết sản phẩm cho AI (tính toán lại để đảm bảo chính xác)
        const productDetailsForAI = allProducts.map(p => {
            const { anime_genre, product_category } = getProductCategorization(p);
            const productCreatedAt = new Date(p.created_at_haravan);
            const daysSinceCreation = Math.ceil((new Date().getTime() - productCreatedAt.getTime()) / (1000 * 60 * 60 * 24));

            let totalQuantitySoldRecentOfProduct = 0;
            let productTotalRevenueRecent = 0;
            let productTotalProfitRecent = 0;
            let totalInventory = 0;
            let hasPositiveInventory = false;

            p.variants.forEach(v => {
                const variantQuantitySold = recentOrders.reduce((sum, order) => {
                    const item = order.line_items.find(li => li.variant_id === v.id);
                    return sum + (item ? item.quantity : 0);
                }, 0);
                totalQuantitySoldRecentOfProduct += variantQuantitySold;
                productTotalRevenueRecent += variantQuantitySold * (v.price || 0);
                productTotalProfitRecent += variantQuantitySold * ((v.price || 0) - (v.cost || 0));
                totalInventory += (v.inventory_quantity || 0);
                if ((v.inventory_quantity || 0) > 0) hasPositiveInventory = true;
            });

            const isLowStock = totalInventory > 0 && totalInventory <= 5;
            const isSlowSeller = !soldProductIdsInRecentOrders.has(p.id) && hasPositiveInventory;

            return {
                id: p.id,
                title: p.title,
                anime_genre: anime_genre,
                product_category: product_category,
                haravan_collection_names: p.haravan_collection_names || [],
                current_inventory: totalInventory,
                avg_price: p.variants.length > 0 ? p.variants.reduce((sum, v) => sum + (v.price || 0), 0) / p.variants.length : 0,
                avg_cost: p.variants.length > 0 ? p.variants.reduce((sum, v) => sum + (v.cost || 0), 0) / p.variants.length : 0,
                days_since_creation: daysSinceCreation,
                total_quantity_sold_recent: totalQuantitySoldRecentOfProduct,
                total_revenue_recent: productTotalRevenueRecent,
                total_profit_recent: productTotalProfitRecent,
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

        // ==========================================================
        // PROMPT CHO GEMINI AI (Đã được tinh chỉnh)
        // ==========================================================
        const prompt = `
Bạn là một Giám đốc Vận hành (COO) và Giám đốc Marketing (CMO) cấp cao cho một cửa hàng thương mại điện tử chuyên bán đồ anime. Nhiệm vụ của bạn là phân tích toàn diện dữ liệu kinh doanh, đưa ra các đề xuất chiến lược chi tiết, có thể hành động được, nhằm tối ưu hóa doanh thu, lợi nhuận, và hiệu quả hoạt động marketing. Bạn cần xem xét cả tình hình tài chính, vận hành, tồn kho và hành vi khách hàng.

**Mục tiêu cốt lõi:**
- Phân tích sâu sắc dữ liệu để đưa ra các insight có giá trị, các mối liên hệ giữa các bộ dữ liệu.
- Đề xuất các hành động cụ thể, các mã giảm giá mới (hàng ngày và theo sự kiện), và các chiến dịch email marketing tự động.
- **Mọi đề xuất mã giảm giá cần được tính toán để ĐẢM BẢO LỢI NHUẬN TRÊN MỖI SẢN PHẨM TRUNG BÌNH LÀ 30% (biên lợi nhuận của bạn).** Nếu một đề xuất mã giảm giá làm giảm lợi nhuận dưới ngưỡng này, hãy giải thích rủi ro hoặc đề xuất cách bù đắp.

**Dữ liệu cung cấp:**
- **Báo cáo tài chính & kinh doanh (Ngày ${reportDataForAI.report_date.toLocaleDateString('vi-VN')}):**
  - Doanh thu ${reportDataForAI.total_revenue.toLocaleString('vi-VN')}đ, Lợi nhuận ${reportDataForAI.total_profit.toLocaleString('vi-VN')}đ.
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
  - **Phân tích hiệu suất theo Nhóm sản phẩm (từ Haravan Collections - Tổng quan 30 ngày):** ${JSON.stringify(Object.entries(groupPerformance).map(([group, data]) => ({
      group,
      total_revenue_recent: data.total_revenue_recent,
      total_profit_recent: data.total_profit_recent,
      total_quantity_recent: data.total_quantity_recent,
      total_products: data.total_products,
      // Hiển thị chỉ 3 loại sản phẩm hàng đầu trong mỗi nhóm để giảm độ phức tạp
      product_types_summary: Object.entries(data.product_types_summary)
                                   .sort(([, a], [, b]) => b.total_revenue_recent - a.total_revenue_recent)
                                   .slice(0, 3) // Giới hạn 3 loại sản phẩm hàng đầu
                                   .map(([type, typeData]) => ({ type, ...typeData }))
    })))}.
  - **Chi tiết tất cả sản phẩm (bao gồm product_group, product_category, haravan_collection_names, avg_price, avg_cost, ngày tạo, số lượng bán trong 30 ngày, doanh thu, lợi nhuận, tồn kho, bán chậm):** ${JSON.stringify(productDetailsForAI)}.

- **Dữ liệu Khuyến mãi & Khách hàng (Tổng thể và gần đây):**
  - Tổng số mã giảm giá đang có: ${allCoupons.length}.
  - Top 5 khách hàng chi tiêu nhiều nhất (theo tổng chi tiêu): ${JSON.stringify(allCustomers.slice(0, 5).map(c => ({name: c.first_name + ' ' + c.last_name, total_spent: c.total_spent})))}.
  - **Chi tiết tất cả khách hàng:** ${JSON.stringify(customerDetailsForAI)}.
  - Số lượng giỏ hàng bị bỏ quên trong 7 ngày qua: ${abandonedCheckouts.length}.
  - Biên lợi nhuận trung bình trên mỗi sản phẩm: 30%. (Đây là dữ liệu quan trọng cho các tính toán về mã giảm giá).

**HÃY CHỈ TRẢ VỀ MỘT ĐỐI TƯỢNG JSON HOÀN CHỈNH. KHÔNG THÊM BẤT KỲ VĂN BẢN GIỚI THIỆU, KẾT LUẬN HOẶC GIẢI THÍCH NÀO BÊN NGOÀI KHỐI JSON NÀY. ĐẢM BẢO JSON HỢP LỆ, CÓ DẤU PHẨY ĐẦY ĐỦ VÀ CÚ PHÁP CHÍNH XÁC.**

**CẤU TRÚC JSON MONG MUỐN:**
\`\`\`json
{
  "alerts": [
    {
      "type": "warning | info | critical",
      "message": "Cảnh báo quan trọng nhất về tình hình kinh doanh, dòng tiền, tồn kho, doanh số. Ví dụ: 'Dòng tiền có thể gặp vấn đề nếu không đạt doanh thu X để bù đắp chi phí sắp tới Y.' Tối đa 2 cảnh báo, ưu tiên critical hoặc warning."
    }
  ],
  "insights": [
    { "title": "Tiêu đề Insight 1", "description": "Nhận định sâu sắc 1. Tìm mối liên hệ giữa các bộ dữ liệu khác nhau. Phân tích hiệu suất từng nhóm sản phẩm (từ haravan_collection_names) và loại sản phẩm trong nhóm đó. Đưa ra lý do hoặc xu hướng rõ ràng." },
    { "title": "Tiêu đề Insight 2", "description": "Nhận định sâu sắc 2. Ví dụ: 'Nhóm sản phẩm [Tên Nhóm] đang có doanh số vượt trội, cần đẩy mạnh marketing'." },
    { "title": "Tiêu đề Insight 3", "description": "Nhận định sâu sắc 3. Ví dụ: 'Khách hàng VIP [Tên khách hàng] đã chi tiêu nhiều nhưng chưa tương tác với các ưu đãi mới nhất, cần cá nhân hóa marketing'." },
    { "title": "Insight 4: Phân tích Dòng tiền sự kiện sắp tới", "description": "Dựa trên doanh thu trung bình hiện tại và chi phí cố định/sự kiện sắp tới, phân tích khả năng đạt mục tiêu tài chính và đề xuất doanh thu cần thiết hàng ngày để bù đắp. Nếu thiếu, nêu rõ rủi ro và cần tập trung vào sản phẩm nào (bán chạy/yếu) để bù đắp."}
  ],
  "action_plan": [
    {
      "action": "Tiêu đề hành động 1",
      "details": "Mô tả chi tiết hành động 1 (ví dụ: 'Nhập thêm 50 sản phẩm X vì tồn kho thấp và bán chạy', 'Tạo chiến dịch xả hàng cho Y').",
      "priority": "High | Medium | Low",
      "category": "Inventory | Marketing | Financial | Customer | Product"
    },
    { "action": "Tiêu đề hành động 2", "details": "Mô tả chi tiết hành động 2.", "priority": "High | Medium | Low", "category": "Inventory | Marketing | Financial | Customer | Product" },
    { "action": "Tiêu đề hành động 3", "details": "Mô tả chi tiết hành động 3.", "priority": "High | Medium | Low", "category": "Inventory | Marketing | Financial | Customer | Product" }
  ],
  "daily_coupon_suggestion": {
    "code": "MA_MOI_HANG_NGAY",
    "value": "Giá trị giảm giá (ví dụ: 10% hoặc 20000)",
    "type": "percentage | fixed_amount | free_shipping",
    "min_order_value": "Giá trị đơn hàng tối thiểu để áp dụng (VD: 150000)",
    "target_product_titles": [], // Danh sách TÊN sản phẩm cụ thể nếu mã chỉ áp dụng cho một số sản phẩm (nếu không, để trống)
    "reason": "Giải thích lý do đề xuất mã này dựa trên hành vi khách hàng 2-3 ngày qua (ví dụ: sản phẩm bán chậm, giỏ hàng bị bỏ quên) VÀ TÍNH TOÁN RÕ RÀNG LỢI NHUẬN ĐỂ ĐẢM BẢO KHÔNG LỖ (biên lợi nhuận trung bình 30%). VD: 'Mã giảm 10% trên đơn 200k sẽ giữ lợi nhuận ở 20%, kích thích mua hàng chậm. Nếu không thể duy trì 30% lợi nhuận, cần nêu rõ lợi nhuận dự kiến'."
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
      "customer_email": "email_khach_hang_bo_quen", // Hoặc "N/A" nếu không có
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
        "product_type_performance": [ // Danh sách các loại sản phẩm chính trong nhóm
          {
            "product_type": "Tên Loại Sản phẩm (VD: Thẻ, Mô hình, Standee)",
            "performance": "Tốt | Yếu | Trung bình",
            "recommendation": "Đề xuất cụ thể và ngắn gọn. Ví dụ: 'Nhập thêm / dừng nhập / đẩy hàng tồn với mã giảm giá (có tính toán lợi nhuận).'"
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
      "estimated_impact": "Ước tính tác động (ví dụ: Tăng 20% tỷ lệ quay lại mua hàng của nhóm khách VIP)."
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
            // Trích xuất khối JSON một cách an toàn bằng regex
            const jsonBlockMatch = textResponse.match(/```json\n([\s\S]*?)\n```/);

            if (!jsonBlockMatch || jsonBlockMatch.length < 2) {
                // Nếu không tìm thấy khối JSON hoặc nội dung trống bên trong markers
                console.error('❌ Phản hồi Gemini không chứa khối JSON hợp lệ được bọc bởi ```json```.');
                return res.status(500).json({
                    message: 'Phản hồi AI không đúng định dạng. Gemini không trả về JSON mong muốn hoặc định dạng bị sai.',
                    rawResponse: textResponse // Gửi phản hồi thô về frontend để debug
                });
            }

            const jsonString = jsonBlockMatch[1].trim(); // Lấy nội dung bên trong capturing group và loại bỏ khoảng trắng

            // Debugging: Kiểm tra chuỗi JSON trước khi parse
            // console.log('Extracted JSON String:', jsonString);

            analysisResultJson = JSON.parse(jsonString); // Phân tích cú pháp JSON đã trích xuất

        } catch (parseError) {
            console.error('❌ Lỗi parsing JSON từ Gemini (kiểm tra cú pháp JSON):', parseError.message);
            console.error('Phản hồi Gemini không phải JSON hợp lệ sau khi trích xuất:', textResponse); // Log toàn bộ phản hồi thô
            return res.status(500).json({
                message: 'Lỗi parsing phản hồi AI. Vui lòng kiểm tra cú pháp JSON của AI (có thể do thiếu dấu phẩy, dấu ngoặc).',
                rawResponse: textResponse // Gửi phản hồi thô về frontend để debug
            });
        }

        await DailyReport.findOneAndUpdate(
            { report_date: queryDateForDailyReport }, // Đảm bảo sử dụng đúng biến đã định nghĩa
            { $set: { ai_analysis_results: analysisResultJson } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`✅ [Master AI] Đã lưu kết quả phân tích AI vào báo cáo ngày ${queryDateForDailyReport.toLocaleDateString('vi-VN')}.`);


        res.status(200).json(analysisResultJson);

    } catch (error) {
        console.error('❌ Lỗi trong quá trình phân tích toàn diện:', error);
        res.status(500).json({ message: 'Lỗi trong quá trình phân tích toàn diện.', error: error.message });
    }
}

// =========================================================================
// Hàm để lấy báo cáo hàng ngày theo ngày
// =========================================================================
const getDailyReportByDate = async (req, res) => {
    const dateParam = req.query.date;

    if (!dateParam) {
        return res.status(400).json({ message: 'Thiếu tham số ngày (date).' });
    }

    try {
        const queryDate = new Date(dateParam);
        queryDate.setHours(0,0,0,0);

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
// Hàm xử lý AI Chat trực tiếp
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
        // 1. Tải lịch sử chat từ MongoDB hoặc tạo phiên mới
        let chatSessionDoc = await ChatSession.findOne({ sessionId });
        let history = [];

        if (chatSessionDoc) {
            history = chatSessionDoc.history;
            console.log(`💬 [AI Chat] Đã tải lịch sử cho session ${sessionId} (${history.length} tin nhắn).`);
        } else {
            // Nếu là phiên mới, và có initialContext (ví dụ: kết quả phân tích Master AI)
            if (initialContext) {
                // Thêm context ban đầu vào lịch sử chat
                history.push({
                    role: 'user',
                    parts: [{ text: 'Chào AI, tôi vừa nhận được một bản phân tích kinh doanh. Bạn có thể cho tôi biết thêm chi tiết về nó không?' }]
                });
                history.push({
                    role: 'model',
                    parts: [{ text: `Dưới đây là phân tích tổng hợp mà tôi vừa cung cấp: \n\`\`\`json\n${JSON.stringify(initialContext, null, 2)}\n\`\`\`\n` }]
                });
                console.log(`💬 [AI Chat] Tạo session mới ${sessionId} với context ban đầu.`);
            } else {
                console.log(`💬 [AI Chat] Tạo session mới ${sessionId} (không có context ban đầu).`);
            }
            chatSessionDoc = new ChatSession({ sessionId, history });
        }

        // 2. Khởi tạo ChatSession của Gemini với lịch sử
        const chat = geminiModelInstance.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 2048,
            },
        });

        // 3. Gửi tin nhắn của người dùng và nhận phản hồi
        const result = await chat.sendMessage(message);
        const modelResponseText = result.response.text();

        // 4. Cập nhật lịch sử chat và lưu vào DB
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


// Export tất cả các hàm để có thể sử dụng trong router
module.exports = {
    analyzeOverallBusiness,
    getDailyReportByDate,
    handleChat
};
