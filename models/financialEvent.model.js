// ==========================================================
// File: models/financialEvent.model.js
// Nhiệm vụ: Lưu trữ các sự kiện thanh toán trong tương lai.
// ==========================================================

const mongoose = require('mongoose');

const FinancialEventSchema = new mongoose.Schema({
    event_name: { type: String, required: true }, // Ví dụ: "Thanh toán 100tr tiền hàng Blue Lock"
    amount: { type: Number, required: true }, // Số tiền cần thanh toán (luôn là số âm)
    due_date: { type: Date, required: true }, // Ngày cần thanh toán
    is_paid: { type: Boolean, default: false } // Trạng thái đã thanh toán hay chưa
}, {
    timestamps: true
});

const FinancialEvent = mongoose.model('FinancialEvent', FinancialEventSchema);
module.exports = FinancialEvent;
