// ==========================================================
// File: controllers/order.controller.js
// Nhiệm vụ: Lấy dữ liệu đơn hàng từ MongoDB.
// ==========================================================

const Order = require('../models/order.model'); // <-- Nạp model Order

/**
 * Controller để lấy và trả về danh sách đơn hàng từ database.
 */
async function getAllOrders(req, res) {
  try {
    // --- THAY ĐỔI CHÍNH ---
    // Tìm tất cả các đơn hàng trong database, sắp xếp theo ngày tạo mới nhất
    const orders = await Order.find({}).sort({ created_at_haravan: -1 });
    
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu đơn hàng từ database.', error: error.message });
  }
}

module.exports = {
  getAllOrders
};
