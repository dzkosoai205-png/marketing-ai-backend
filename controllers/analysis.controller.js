// ==========================================================
// File: controllers/analysis.controller.js
// Phiên bản này đã sửa lỗi TypeError khi gọi hàm thời gian.
// ==========================================================

const Order = require('../models/order.model');
const Product = require('../models/product.model');
const { utcToZonedTime, zonedTimeToUtc, format } = require('date-fns-tz'); // <-- THAY ĐỔI CÁCH IMPORT

/**
 * Controller để phân tích và trả về báo cáo tài chính trong ngày.
 */
async function getDailyFinancials(req, res) {
  try {
    console.log('📊 Bắt đầu phân tích tài chính trong ngày...');
    
    // --- SỬA LỖI MÚI GIỜ ---
    const timeZone = 'Asia/Ho_Chi_Minh';
    const nowInVietnam = utcToZonedTime(new Date(), timeZone); // <-- SỬA CÁCH GỌI HÀM
    
    const todayStartInVietnam = new Date(nowInVietnam);
    todayStartInVietnam.setHours(0, 0, 0, 0);

    const todayEndInVietnam = new Date(nowInVietnam);
    todayEndInVietnam.setHours(23, 59, 59, 999);

    // Chuyển đổi về giờ UTC để truy vấn MongoDB
    const todayStartUtc = zonedTimeToUtc(todayStartInVietnam, timeZone); // <-- SỬA CÁCH GỌI HÀM
    const todayEndUtc = zonedTimeToUtc(todayEndInVietnam, timeZone); // <-- SỬA CÁCH GỌI HÀM

    console.log(`- Lấy đơn hàng từ ${format(todayStartInVietnam, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone })} đến ${format(todayEndInVietnam, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone })}`); // <-- SỬA CÁCH GỌI HÀM

    // Tìm tất cả các đơn hàng đã thanh toán trong ngày hôm nay (theo giờ Việt Nam)
    const todaysPaidOrders = await Order.find({
      financial_status: 'paid',
      created_at_haravan: {
        $gte: todayStartUtc,
        $lte: todayEndUtc
      }
    });

    if (todaysPaidOrders.length === 0) {
      return res.status(200).json({ 
        message: 'Không có đơn hàng nào được thanh toán hôm nay.',
        totalRevenue: 0,
        totalCOGS: 0,
        grossProfit: 0,
        cashRevenue: 0,
        transferRevenue: 0,
        orderCount: 0
      });
    }

    // Lấy danh sách tất cả variant ID từ các đơn hàng
    const variantIds = todaysPaidOrders.flatMap(order => 
      order.line_items.map(item => item.variant_id)
    );
    
    // Lấy thông tin sản phẩm (bao gồm giá vốn) từ database
    const productsInOrders = await Product.find({ 'variants.id': { $in: variantIds } });
    
    // Tạo một "map" để tra cứu giá vốn nhanh hơn
    const variantCostMap = new Map();
    productsInOrders.forEach(p => {
        p.variants.forEach(v => {
            // Chỉ thêm vào map nếu variant này có trong các đơn hàng hôm nay
            if (variantIds.includes(v.id)) {
                variantCostMap.set(v.id, v.cost || 0);
            }
        });
    });
    console.log(`- Đã tìm thấy giá vốn cho ${variantCostMap.size} loại sản phẩm.`);

    let totalRevenue = 0;
    let totalCOGS = 0; // Cost of Goods Sold - Giá vốn hàng bán
    let cashRevenue = 0;
    let transferRevenue = 0;

    todaysPaidOrders.forEach(order => {
      totalRevenue += order.total_price;

      // Phân loại doanh thu theo cổng thanh toán
      if (order.gateway === 'cod' || (order.gateway || '').toLowerCase().includes('tiền mặt')) {
          cashRevenue += order.total_price;
      } else {
          transferRevenue += order.total_price;
      }

      // Tính tổng giá vốn cho đơn hàng
      order.line_items.forEach(item => {
        const cost = variantCostMap.get(item.variant_id) || 0;
        if(cost === 0) {
            console.warn(`⚠️ Cảnh báo: Sản phẩm "${item.title}" (Variant ID: ${item.variant_id}) không có giá vốn. Lợi nhuận có thể không chính xác.`);
        }
        totalCOGS += cost * item.quantity;
      });
    });

    const grossProfit = totalRevenue - totalCOGS; // Lợi nhuận gộp

    console.log(`✅ Phân tích tài chính hoàn tất.`);
    res.status(200).json({
      totalRevenue,
      totalCOGS,
      grossProfit,
      cashRevenue,
      transferRevenue,
      orderCount: todaysPaidOrders.length
    });

  } catch (error) {
    console.error('❌ Lỗi khi phân tích tài chính:', error);
    res.status(500).json({ message: 'Lỗi khi phân tích tài chính.', error: error.message });
  }
}

module.exports = {
  getDailyFinancials
};
