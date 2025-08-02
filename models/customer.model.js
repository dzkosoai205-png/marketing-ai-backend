// ==========================================================
// File: models/customer.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một khách hàng trong MongoDB, có phân nhóm.
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

    // --------------------------------------------------
    // Thông tin nhóm khách hàng (phân loại từ Haravan hoặc nội bộ)
    // --------------------------------------------------

    segment: { 
        type: String, 
        default: 'Uncategorized' // Hoặc: 'New', 'VIP', 'Regular', 'Loyal-Potential', 'One-Time', 'Abandoned', 'Cold'
    },

    haravan_segments: [{ 
        type: String // Tên các nhóm từ Haravan API (nếu có)
    }],

    last_segment_update: {
        type: Date, // Thời điểm cuối cùng nhóm khách được cập nhật
        default: Date.now
    }

}, {
    timestamps: true
});

const Customer = mongoose.model('Customer', CustomerSchema);
module.exports = Customer;
