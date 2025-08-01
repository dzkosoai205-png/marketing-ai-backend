// ==========================================================
// File: controllers/analysis.controller.js
// Phiên bản này đã loại bỏ date-fns-tz và đơn giản hóa logic.
// ==========================================================

const Order = require('../models/order.model');
const Product = require('../models/product.model');

/**
 * Controller để phân tích và trả về báo cáo tài chính trong ngày.
 */
async function getDailyFinancials(req, res) {
  try {
    console.log('📊 Bắt đầu phân tích tài chính trong ngày...');
    
    // --- LOGIC MỚI: TÍNH TOÁN MÚI GIỜ ĐƠN GIẢN HƠN ---
    const now = new Date();
    // Tạo ngày hôm nay theo giờ Việt Nam (UTC+7)
    // new Date() là giờ UTC, getTime() trả về mili giây từ 1/1/1970 UTC.
    // 7 * 60 * 60 * 1000 là 7 giờ tính bằng mili giây.
    const todayInVietnam = new Date(now.getTime() + (7 * 60 * 60 * 1000));

    // Đặt thời gian về đầu ngày (00:00:00) theo giờ Việt Nam
    const todayStart = new Date(todayInVietnam);
    todayStart.setUTCHours(0, 0, 0, 0);

    // Đặt thời gian về cuối ngày (23:59:59) theo giờ Việt Nam
    const todayEnd = new Date(todayInVietnam);
    todayEnd.setUTCHours(23, 59, 59, 999);
    
    console.log(`- Lấy đơn hàng từ ${todayStart.toISOString()} đến ${todayEnd.toISOString()} (UTC)`);

    // Tìm tất cả các đơn hàng đã thanh toán trong ngày hôm nay
    const todaysPaidOrders = await Order.find({
      financial_status: 'paid',
      created_at_haravan: {
        $gte: todayStart,
        $lte: todayEnd
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
