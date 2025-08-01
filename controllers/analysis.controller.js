// ==========================================================
// File: controllers/analysis.controller.js
// Phiên bản này đã loại bỏ date-fns-tz và tính giờ thủ công.
// ==========================================================

const Order = require('../models/order.model');
const Product = require('../models/product.model');

async function getDailyFinancials(req, res) {
  try {
    console.log('📊 Bắt đầu phân tích tài chính trong ngày...');
    
    // --- TÍNH TOÁN MÚI GIỜ VIỆT NAM THỦ CÔNG ---
    const now = new Date(); // Lấy giờ UTC hiện tại của server
    const vietnamOffset = 7 * 60 * 60 * 1000; // 7 giờ tính bằng mili giây
    
    // Tạo một đối tượng Date mới cho giờ Việt Nam
    const nowInVietnam = new Date(now.getTime() + vietnamOffset);

    // Đặt giờ về đầu ngày (00:00:00) theo giờ Việt Nam
    const todayStartInVietnam = new Date(nowInVietnam);
    todayStartInVietnam.setUTCHours(0, 0, 0, 0);

    // Đặt giờ về cuối ngày (23:59:59) theo giờ Việt Nam
    const todayEndInVietnam = new Date(nowInVietnam);
    todayEndInVietnam.setUTCHours(23, 59, 59, 999);

    console.log(`- Lấy đơn hàng trong khoảng UTC: ${todayStartInVietnam.toISOString()} đến ${todayEndInVietnam.toISOString()}`);

    // Tìm tất cả các đơn hàng đã thanh toán trong ngày hôm nay
    // Dữ liệu created_at_haravan trong DB được lưu dưới dạng UTC, nên so sánh trực tiếp
    const todaysPaidOrders = await Order.find({
      financial_status: 'paid',
      created_at_haravan: {
        $gte: todayStartInVietnam,
        $lte: todayEndInVietnam
      }
    });

    if (todaysPaidOrders.length === 0) {
      return res.status(200).json({ 
        message: 'Không có đơn hàng nào được thanh toán hôm nay.',
        totalRevenue: 0, totalCOGS: 0, grossProfit: 0,
        cashRevenue: 0, transferRevenue: 0, orderCount: 0
      });
    }

    const variantIds = todaysPaidOrders.flatMap(order => 
      order.line_items.map(item => item.variant_id)
    );
    
    const productsInOrders = await Product.find({ 'variants.id': { $in: variantIds } });
    
    const variantCostMap = new Map();
    productsInOrders.forEach(p => {
        p.variants.forEach(v => {
            if (variantIds.includes(v.id)) {
                variantCostMap.set(v.id, v.cost_price || 0);
            }
        });
    });
    console.log(`- Đã tìm thấy giá vốn cho ${variantCostMap.size} loại sản phẩm.`);

    let totalRevenue = 0;
    let totalCOGS = 0;
    let cashRevenue = 0;
    let transferRevenue = 0;

    todaysPaidOrders.forEach(order => {
      totalRevenue += order.total_price;

      if (order.gateway === 'cod' || (order.gateway || '').toLowerCase().includes('tiền mặt')) {
          cashRevenue += order.total_price;
      } else {
          transferRevenue += order.total_price;
      }

      order.line_items.forEach(item => {
        const cost = variantCostMap.get(item.variant_id) || 0;
        if(cost === 0) {
            console.warn(`⚠️ Cảnh báo: Sản phẩm "${item.title}" (Variant ID: ${item.variant_id}) không có giá vốn.`);
        }
        totalCOGS += cost * item.quantity;
      });
    });

    const grossProfit = totalRevenue - totalCOGS;

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
