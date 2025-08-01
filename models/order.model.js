// ==========================================================
// File: models/order.model.js
// Phiên bản này đã được nâng cấp để theo dõi trạng thái hủy/hoàn trả.
// ==========================================================

const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    email: { type: String },
    phone: { type: String },
    
    customer: {
        id: Number,
        first_name: String,
        last_name: String,
        email: String,
        phone: String
    },

    total_price: { type: Number, required: true },
    total_discounts: { type: Number, required: true },
    financial_status: { type: String }, // 'paid', 'pending', 'refunded'
    fulfillment_status: { type: String },
    
    discount_codes: [mongoose.Schema.Types.Mixed],

    line_items: [{
        product_id: Number,
        variant_id: Number,
        title: String,
        quantity: Number,
        price: Number
    }],
    
    created_at_haravan: { type: Date },
    cancelled_at: { type: Date, default: null }, // <-- Thêm trường ngày hủy

    inventory_deducted: { type: Boolean, default: false },

    // --- CÁC TRƯỜNG MỚI ĐỂ THEO DÕI ---
    is_cancelled: { type: Boolean, default: false },
    is_refunded: { type: Boolean, default: false }

}, {
    timestamps: true
});

const Order = mongoose.model('Order', OrderSchema);
module.exports = Order;
