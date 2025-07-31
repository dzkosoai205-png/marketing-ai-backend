// ==========================================================
// File: models/order.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một đơn hàng trong MongoDB.
// Phiên bản này đã sửa lỗi CastError.
// ==========================================================

const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // ID từ Haravan
    email: { type: String },
    phone: { type: String },
    customer_id: { type: Number },
    total_price: { type: Number, required: true },
    total_discounts: { type: Number, required: true },
    financial_status: { type: String },
    fulfillment_status: { type: String },
    
    // --- LỖI ĐÃ ĐƯỢC SỬA Ở ĐÂY ---
    // Thay đổi kiểu dữ liệu để chấp nhận cả các định dạng không đồng nhất từ Haravan
    // Điều này giúp ứng dụng không bị crash khi gặp dữ liệu lỗi.
    discount_codes: [mongoose.Schema.Types.Mixed],

    line_items: [{
        product_id: Number,
        variant_id: Number,
        title: String,
        quantity: Number,
        price: Number
    }],
    
    created_at_haravan: { type: Date } 
}, {
    timestamps: true
});

const Order = mongoose.model('Order', OrderSchema);
module.exports = Order;
