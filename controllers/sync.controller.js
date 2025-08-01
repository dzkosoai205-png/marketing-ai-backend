// ==========================================================
// File: controllers/sync.controller.js
// Nhiệm vụ: Chứa logic chính để đồng bộ dữ liệu.
// ==========================================================

const haravanService = require('../services/haravan.service');
const Coupon = require('../models/coupon.model');
const Order = require('../models/order.model');
const Customer = require('../models/customer.model');
const Product = require('../models/product.model'); // <-- Dòng mới

/**
 * Controller để kích hoạt quá trình đồng bộ toàn bộ dữ liệu
 * từ Haravan về MongoDB.
 */
async function syncAllData(req, res) {
  console.log('🔄 Bắt đầu quá trình đồng bộ dữ liệu...');
  try {
    // --- Bước 1: Lấy dữ liệu mới nhất từ Haravan ---
    const [
        couponsFromHaravan, 
        ordersFromHaravan, 
        customersFromHaravan,
        productsFromHaravan // <-- Dòng mới
    ] = await Promise.all([
      haravanService.getDiscountCodes(),
      haravanService.getOrders(),
      haravanService.getCustomers(),
      haravanService.getProducts() // <-- Dòng mới
    ]);
    console.log(`- Đã lấy được: ${productsFromHaravan.length} sản phẩm, ${couponsFromHaravan.length} mã, ${ordersFromHaravan.length} đơn hàng, ${customersFromHaravan.length} khách hàng.`);

    // --- Bước 2: Đồng bộ Sản phẩm ---
    if (productsFromHaravan && productsFromHaravan.length > 0) {
      const productOps = productsFromHaravan.map(product => ({
        updateOne: {
          filter: { id: product.id },
          update: { 
            $set: product,
            // $setOnInsert chỉ hoạt động khi tạo mới document
            $setOnInsert: { is_new_product: true, first_imported_at: new Date() }
          },
          upsert: true
        }
      }));
      await Product.bulkWrite(productOps);
      console.log(`✅ Đã đồng bộ ${productsFromHaravan.length} sản phẩm.`);
    }

    // --- Bước 3: Đồng bộ Mã giảm giá ---
    if (couponsFromHaravan && couponsFromHaravan.length > 0) {
      const couponOps = couponsFromHaravan.map(coupon => ({
        updateOne: {
          filter: { id: coupon.id },
          update: { $set: coupon },
          upsert: true
        }
      }));
      await Coupon.bulkWrite(couponOps);
      console.log(`✅ Đã đồng bộ ${couponsFromHaravan.length} mã giảm giá.`);
    }

    // --- Bước 4: Đồng bộ Đơn hàng ---
    if (ordersFromHaravan && ordersFromHaravan.length > 0) {
      const orderOps = ordersFromHaravan.map(order => ({
        updateOne: {
          filter: { id: order.id },
          update: { $set: { ...order, created_at_haravan: order.created_at } },
          upsert: true
        }
      }));
      await Order.bulkWrite(orderOps);
      console.log(`✅ Đã đồng bộ ${ordersFromHaravan.length} đơn hàng.`);
    }

    // --- Bước 5: Đồng bộ Khách hàng ---
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
      syncedProducts: productsFromHaravan.length,
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
