// ==========================================================
// File: controllers/sync.controller.js
// Nhiệm vụ: Chứa logic chính để đồng bộ dữ liệu.
// ==========================================================

const haravanService = require('../services/haravan.service');
const Coupon = require('../models/coupon.model');
const Order = require('../models/order.model');
const Customer = require('../models/customer.model');

/**
 * Controller để kích hoạt quá trình đồng bộ toàn bộ dữ liệu
 * từ Haravan về MongoDB.
 */
async function syncAllData(req, res) {
  console.log('  Bắt đầu quá trình đồng bộ dữ liệu...');
  try {
    // --- Bước 1: Lấy dữ liệu mới nhất từ Haravan ---
    const [couponsFromHaravan, ordersFromHaravan, customersFromHaravan] = await Promise.all([
      haravanService.getDiscountCodes(),
      haravanService.getOrders(),
      haravanService.getCustomers()
    ]);
    console.log(`- Đã lấy được: ${couponsFromHaravan.length} mã, ${ordersFromHaravan.length} đơn hàng, ${customersFromHaravan.length} khách hàng.`);

    // --- Bước 2: Đồng bộ Mã giảm giá ---
    if (couponsFromHaravan && couponsFromHaravan.length > 0) {
      const couponOps = couponsFromHaravan.map(coupon => ({
        updateOne: {
          filter: { id: coupon.id }, // Tìm mã giảm giá có cùng ID
          update: { $set: coupon }, // Cập nhật dữ liệu mới
          upsert: true // Nếu không tìm thấy, hãy tạo mới
        }
      }));
      await Coupon.bulkWrite(couponOps);
      console.log(`✅ Đã đồng bộ ${couponsFromHaravan.length} mã giảm giá.`);
    }

    // --- Bước 3: Đồng bộ Đơn hàng ---
    if (ordersFromHaravan && ordersFromHaravan.length > 0) {
      const orderOps = ordersFromHaravan.map(order => ({
        updateOne: {
          filter: { id: order.id },
          // Ánh xạ lại trường created_at để tránh trùng với Mongoose
          update: { $set: { ...order, created_at_haravan: order.created_at } },
          upsert: true
        }
      }));
      await Order.bulkWrite(orderOps);
      console.log(`✅ Đã đồng bộ ${ordersFromHaravan.length} đơn hàng.`);
    }

    // --- Bước 4: Đồng bộ Khách hàng ---
    if (customersFromHaravan && customersFromHaravan.length > 0) {
      const customerOps = customersFromHaravan.map(customer => ({
        updateOne: {
          filter: { id: customer.id },
          update: { $set: customer },
          upsert: true
        }
      }));
      await Customer.bulkWrite(customerOps);
      console.log(`✅ Đã đồng bộ ${customersFromHaravan.length} khách hàng.`);
    }

    res.status(200).json({
      message: '🎉 Đồng bộ dữ liệu thành công!',
      syncedCoupons: couponsFromHaravan.length,
      syncedOrders: ordersFromHaravan.length,
      syncedCustomers: customersFromHaravan.length,
    });

  } catch (error) {
    console.error('❌ Lỗi trong quá trình đồng bộ:', error);
    res.status(500).json({ message: 'Đồng bộ dữ liệu thất bại.', error: error.message });
  }
}

module.exports = {
  syncAllData
};
 