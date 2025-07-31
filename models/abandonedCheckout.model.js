// ==========================================================
// File: models/abandonedCheckout.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một giỏ hàng bị bỏ quên.
// ==========================================================

const mongoose = require('mongoose');

const AbandonedCheckoutSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // ID từ Haravan
    email: { type: String },
    phone: { type: String },
    total_price: { type: Number },
    
    // Thông tin khách hàng liên quan
    customer: {
        id: Number,
        first_name: String,
        last_name: String,
    },

    // Lưu lại danh sách sản phẩm trong giỏ hàng
    line_items: [{
        product_id: Number,
        variant_id: Number,
        title: String,
        quantity: Number,
        price: Number
    }],

    // Trạng thái để theo dõi việc gửi email
    reminder_sent: { type: Boolean, default: false },
    
    // Ngày tạo giỏ hàng trên Haravan
    created_at_haravan: { type: Date } 
}, {
    timestamps: true
});

const AbandonedCheckout = mongoose.model('AbandonedCheckout', AbandonedCheckoutSchema);
module.exports = AbandonedCheckout;
