// ==========================================================
// File: controllers/webhook.controller.js
// Phiên bản này đã được nâng cấp để tự động trừ kho.
// ==========================================================

const Order = require('../models/order.model');
const Product = require('../models/product.model'); // <-- Dòng mới: Nạp model Product
const AbandonedCheckout = require('../models/abandonedCheckout.model.js');

/**
 * Controller để xử lý webhook cho sự kiện tạo/cập nhật đơn hàng.
 */
async function handleOrderWebhook(req, res) {
  try {
    const orderData = req.body;
    console.log(`📦 [Webhook] Nhận được dữ liệu cho đơn hàng ID: ${orderData.id}`);

    // Bước 1: Lưu hoặc cập nhật thông tin đơn hàng (như cũ)
    await Order.findOneAndUpdate(
      { id: orderData.id },
      { $set: { ...orderData, created_at_haravan: orderData.created_at } },
      { upsert: true, new: true }
    );
    console.log(`✅ [Webhook] Đã cập nhật/tạo mới đơn hàng ID: ${orderData.id}`);

    // --- BƯỚC 2: CẬP NHẬT TỒN KHO ---
    // Chỉ trừ kho cho các đơn hàng đã được thanh toán
    if (orderData.financial_status === 'paid' && orderData.line_items) {
      console.log(`💰 Đơn hàng ${orderData.id} đã thanh toán, bắt đầu trừ kho...`);
      
      // Tạo một mảng các thao tác cập nhật để thực hiện đồng thời
      const inventoryUpdates = orderData.line_items.map(item => {
        return Product.updateOne(
          // Điều kiện tìm kiếm: Tìm đúng sản phẩm và đúng phiên bản (variant)
          { 
            id: item.product_id, 
            'variants.id': item.variant_id 
          },
          // Thao tác cập nhật: Dùng $inc để trừ đi số lượng đã bán
          // Dấu "-" có nghĩa là trừ đi
          { 
            $inc: { 'variants.$.inventory_quantity': -item.quantity } 
          }
        );
      });

      // Thực thi tất cả các thao tác cập nhật cùng lúc
      await Promise.all(inventoryUpdates);
      console.log(`✅ [Webhook] Đã cập nhật tồn kho cho ${orderData.line_items.length} sản phẩm trong đơn hàng ${orderData.id}.`);
    }
    
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
