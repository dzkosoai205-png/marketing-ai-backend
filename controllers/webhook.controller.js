// ==========================================================
// File: controllers/webhook.controller.js
// Phiên bản này chứa đầy đủ cả hai chức năng xử lý webhook.
// ==========================================================

const Order = require('../models/order.model');
const AbandonedCheckout = require('../models/abandonedCheckout.model.js');

/**
 * Controller để xử lý webhook cho sự kiện tạo/cập nhật đơn hàng.
 */
async function handleOrderWebhook(req, res) {
  try {
    const orderData = req.body;
    console.log(`📦 [Webhook] Nhận được dữ liệu cho đơn hàng ID: ${orderData.id}`);

    // Sử dụng findOneAndUpdate với upsert: true để cập nhật hoặc tạo mới.
    await Order.findOneAndUpdate(
      { id: orderData.id },
      { $set: { ...orderData, created_at_haravan: orderData.created_at } },
      { upsert: true, new: true }
    );

    console.log(`✅ [Webhook] Đã cập nhật/tạo mới đơn hàng ID: ${orderData.id}`);
    
    // Luôn trả về status 200 OK để Haravan biết bạn đã nhận được webhook thành công.
    res.status(200).send('Webhook received');

  } catch (error) {
    console.error('❌ [Webhook] Lỗi xử lý webhook đơn hàng:', error.message);
    res.status(500).send('Error processing webhook');
  }
}

/**
 * Controller để xử lý webhook cho giỏ hàng bị bỏ quên.
 */
async function handleAbandonedCheckoutWebhook(req, res) {
  try {
    const checkoutData = req.body;
    console.log(`🛒 [Webhook] Nhận được dữ liệu giỏ hàng bị bỏ quên ID: ${checkoutData.id}`);

    // Lưu hoặc cập nhật giỏ hàng vào database
    await AbandonedCheckout.findOneAndUpdate(
      { id: checkoutData.id },
      { $set: { ...checkoutData, created_at_haravan: checkoutData.created_at } },
      { upsert: true, new: true }
    );

    console.log(`✅ [Webhook] Đã lưu giỏ hàng bị bỏ quên ID: ${checkoutData.id}`);
    
    res.status(200).send('Webhook received');

  } catch (error) {
    console.error('❌ [Webhook] Lỗi xử lý webhook giỏ hàng bị bỏ quên:', error.message);
    res.status(500).send('Error processing webhook');
  }
}

// Xuất cả hai hàm ra để file route có thể sử dụng
module.exports = {
  handleOrderWebhook,
  handleAbandonedCheckoutWebhook
};
