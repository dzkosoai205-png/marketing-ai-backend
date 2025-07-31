// ==========================================================
// File: models/customer.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một khách hàng trong MongoDB.
// ==========================================================

const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // ID từ Haravan
    email: { type: String },
    phone: { type: String },
    first_name: { type: String },
    last_name: { type: String },
    orders_count: { type: Number, default: 0 },
    total_spent: { type: Number, default: 0 },
    last_order_id: { type: Number },
    // Chúng ta có thể thêm các trường phân loại khách hàng ở đây sau
    // ví dụ: segment: { type: String, default: 'New' } // 'New', 'Regular', 'VIP'
}, {
    timestamps: true
});

const Customer = mongoose.model('Customer', CustomerSchema);
module.exports = Customer;
