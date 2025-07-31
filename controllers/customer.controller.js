// ==========================================================
// File: controllers/customer.controller.js
// Nhiệm vụ: Lấy dữ liệu khách hàng từ MongoDB.
// ==========================================================

const Customer = require('../models/customer.model'); // <-- Nạp model Customer

/**
 * Controller để lấy và trả về danh sách khách hàng từ database.
 */
async function getAllCustomers(req, res) {
  try {
    // --- THAY ĐỔI CHÍNH ---
    // Tìm tất cả khách hàng trong database
    const customers = await Customer.find({});
    
    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu khách hàng từ database.', error: error.message });
  }
}

module.exports = {
  getAllCustomers
};
