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

    // Tìm bản ghi đơn hàng hiện có trong DB (nếu có)
    const existingOrder = await Order.findOne({ id: orderData.id });

    // --- LOGIC MỚI: XỬ LÝ HỦY/HOÀN TRẢ ---
    const isCancelled = orderData.cancelled_at !== null;
    const isRefunded = orderData.financial_status === 'refunded';

    if ((isCancelled || isRefunded) && existingOrder && existingOrder.inventory_deducted) {
      console.log(`↩️ Đơn hàng ${orderData.id} đã bị hủy/hoàn trả, bắt đầu cộng lại kho...`);

      const inventoryRestores = orderData.line_items.map(item => {
        return Product.updateOne(
          { id: item.product_id, 'variants.id': item.variant_id },
          // Dùng $inc với số dương để cộng lại số lượng
          { $inc: { 'variants.$.inventory_quantity': item.quantity } }
        );
      });
      await Promise.all(inventoryRestores);

      // Cập nhật trạng thái trong DB để không cộng lại kho lần nữa
      existingOrder.inventory_deducted = false; // Tắt công tắc trừ kho
      existingOrder.is_cancelled = isCancelled;
      existingOrder.is_refunded = isRefunded;
      await existingOrder.save();
      
      console.log(`✅ [Webhook] Đã cộng lại tồn kho cho đơn hàng ${orderData.id}.`);
      return res.status(200).send('Webhook for cancelled/refunded order processed');
    }

    // --- LOGIC CŨ: XỬ LÝ ĐƠN HÀNG MỚI ---
    // Chỉ trừ kho khi đơn hàng được thanh toán VÀ chưa từng bị trừ kho
    if (orderData.financial_status === 'paid' && (!existingOrder || !existingOrder.inventory_deducted) && orderData.line_items) {
      console.log(`💰 Đơn hàng ${orderData.id} hợp lệ, bắt đầu trừ kho...`);
      
      const inventoryUpdates = orderData.line_items.map(item => {
        return Product.updateOne(
          { id: item.product_id, 'variants.id': item.variant_id },
          { $inc: { 'variants.$.inventory_quantity': -item.quantity } }
        );
      });
      await Promise.all(inventoryUpdates);
      
      // BẬT CÔNG TẮC: Đánh dấu là đã trừ kho cho đơn hàng này
      const updatedOrderInDB = await Order.findOneAndUpdate(
          { id: orderData.id },
          { $set: { ...orderData, created_at_haravan: orderData.created_at, inventory_deducted: true } },
          { upsert: true, new: true }
      );
      
      console.log(`✅ [Webhook] Đã trừ kho thành công cho đơn hàng ${updatedOrderInDB.id}.`);
      return res.status(200).send('Webhook for new paid order processed');
    }
    
    // --- LỖI ĐÃ ĐƯỢC SỬA Ở ĐÂY ---
    if (existingOrder && existingOrder.inventory_deducted) {
        console.log(`ℹ️ [Webhook] Tồn kho cho đơn hàng ${existingOrder.id} đã được trừ trước đó. Bỏ qua.`);
    } else {
        console.log(`⏳ [Webhook] Đơn hàng ${orderData.id} chưa thanh toán hoặc không có sản phẩm. Chưa trừ kho.`);
    }
    
    // Nếu không rơi vào các trường hợp trên, chỉ cập nhật thông tin đơn hàng
    await Order.findOneAndUpdate(
        { id: orderData.id },
        { $set: { ...orderData, created_at_haravan: orderData.created_at } },
        { upsert: true, new: true }
    );
    console.log(`ℹ️ [Webhook] Đã cập nhật thông tin cho đơn hàng ${orderData.id} (không thay đổi tồn kho).`);
    res.status(200).send('Webhook received and order data updated');

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
