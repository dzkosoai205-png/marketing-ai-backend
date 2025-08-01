// ==========================================================
// File: controllers/analysis.controller.js
// Sửa lại để đọc giá vốn từ trường 'cost_price'.
// ==========================================================

const Order = require('../models/order.model');
const Product = require('../models/product.model');
const { utcToZonedTime, zonedTimeToUtc, format } = require('date-fns-tz');

async function getDailyFinancials(req, res) {
  try {
    console.log('📊 Bắt đầu phân tích tài chính trong ngày...');
    
    const timeZone = 'Asia/Ho_Chi_Minh';
    const nowInVietnam = utcToZonedTime(new Date(), timeZone);
    
    const todayStartInVietnam = new Date(nowInVietnam);
    todayStartInVietnam.setHours(0, 0, 0, 0);

    const todayEndInVietnam = new Date(nowInVietnam);
    todayEndInVietnam.setHours(23, 59, 59, 999);

    const todayStartUtc = zonedTimeToUtc(todayStartInVietnam, timeZone);
    const todayEndUtc = zonedTimeToUtc(todayEndInVietnam, timeZone);

    console.log(`- Lấy đơn hàng từ ${format(todayStartInVietnam, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone })} đến ${format(todayEndInVietnam, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone })}`);

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
                variantCostMap.set(v.id, v.cost_price || 0); // <-- SỬA LẠI TÊN TRƯỜNG
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
