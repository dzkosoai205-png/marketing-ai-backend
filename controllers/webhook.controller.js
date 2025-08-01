// ==========================================================
// File: controllers/webhook.controller.js
// Phiên bản này đã được nâng cấp với logic chống trùng lặp.
// ==========================================================

const Order = require('../models/order.model');
const Product = require('../models/product.model');
const AbandonedCheckout = require('../models/abandonedCheckout.model.js');

async function handleOrderWebhook(req, res) {
  try {
    const orderData = req.body;
    console.log(`📦 [Webhook] Nhận được dữ liệu cho đơn hàng ID: ${orderData.id}`);

    // Luôn cập nhật thông tin đơn hàng mới nhất từ Haravan
    const updatedOrder = await Order.findOneAndUpdate(
      { id: orderData.id },
      { $set: { ...orderData, created_at_haravan: orderData.created_at } },
      { upsert: true, new: true } // upsert: tạo nếu chưa có, new: trả về bản ghi sau khi update
    );
    console.log(`✅ [Webhook] Đã cập nhật/tạo mới đơn hàng ID: ${orderData.id}`);

    // --- LOGIC CHỐNG TRÙNG LẶP VÀ TRỪ KHO ---
    // Chỉ thực hiện khi đơn hàng đã thanh toán VÀ chưa từng bị trừ kho trước đây
    if (updatedOrder.financial_status === 'paid' && !updatedOrder.inventory_deducted && updatedOrder.line_items) {
      console.log(`💰 Đơn hàng ${updatedOrder.id} hợp lệ, bắt đầu trừ kho...`);
      
      const inventoryUpdates = updatedOrder.line_items.map(item => {
        return Product.updateOne(
          { 
            id: item.product_id, 
            'variants.id': item.variant_id 
          },
          { 
            $inc: { 'variants.$.inventory_quantity': -item.quantity } 
          }
        );
      });

      await Promise.all(inventoryUpdates);
      
      // BẬT CÔNG TẮC: Đánh dấu là đã trừ kho cho đơn hàng này
      updatedOrder.inventory_deducted = true;
      await updatedOrder.save();

      console.log(`✅ [Webhook] Đã trừ kho thành công cho đơn hàng ${updatedOrder.id}.`);
    } else if (updatedOrder.inventory_deducted) {
        console.log(ℹ️ [Webhook] Tồn kho cho đơn hàng ${updatedOrder.id} đã được trừ trước đó. Bỏ qua.`);
    } else {
        console.log(`⏳ [Webhook] Đơn hàng ${updatedOrder.id} chưa thanh toán hoặc không có sản phẩm. Chưa trừ kho.`);
    }
    
    res.status(200).send('Webhook received');

  } catch (error) {
    console.error('❌ [Webhook] Lỗi xử lý webhook đơn hàng:', error.message);
    res.status(500).send('Error processing webhook');
  }
}

async function handleAbandonedCheckoutWebhook(req, res) {
  // ... (Hàm này giữ nguyên, không thay đổi)
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

module.exports = {
  handleOrderWebhook,
  handleAbandonedCheckoutWebhook
};
