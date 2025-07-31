// ==========================================================
// File: controllers/coupon.controller.js
// Phiên bản này chứa đầy đủ cả hai chức năng Lấy và Tạo mã.
// ==========================================================

const haravanService = require('../services/haravan.service');
const Coupon = require('../models/coupon.model');

/**
 * Controller để lấy và trả về danh sách mã giảm giá từ database.
 */
async function getAllCoupons(req, res) {
  try {
    // Tìm tất cả các document trong collection 'coupons'
    const coupons = await Coupon.find({});
    res.status(200).json(coupons);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu mã giảm giá từ database.', error: error.message });
  }
}

/**
 * Controller để xử lý yêu cầu tạo mã giảm giá mới.
 */
async function createCoupon(req, res) {
  try {
    // Lấy dữ liệu mã cần tạo từ body của request
    const couponDataFromRequest = req.body;

    if (!couponDataFromRequest || !couponDataFromRequest.code) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ, thiếu mã code.' });
    }

    // Bước 1: Gọi service để tạo mã trên Haravan
    console.log(`⚡️ Đang tạo mã "${couponDataFromRequest.code}" trên Haravan...`);
    const newCouponFromHaravan = await haravanService.createDiscountCode(couponDataFromRequest);
    console.log(`✅ Đã tạo mã thành công trên Haravan, ID: ${newCouponFromHaravan.id}`);

    // Bước 2: Lưu mã vừa tạo vào database của chúng ta để đồng bộ
    // Dùng findOneAndUpdate để tránh tạo trùng nếu webhook chạy trước
    const savedCoupon = await Coupon.findOneAndUpdate(
        { id: newCouponFromHaravan.id }, // Điều kiện tìm kiếm
        newCouponFromHaravan, // Dữ liệu để cập nhật
        { upsert: true, new: true } // Tùy chọn: Tạo mới nếu không tìm thấy
    );
    console.log(`💾 Đã lưu/cập nhật mã vào database.`);

    // Bước 3: Trả về kết quả thành công
    res.status(201).json({ message: 'Tạo mã giảm giá thành công!', coupon: savedCoupon });

  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tạo mã giảm giá.', error: error.message });
  }
}

// Xuất tất cả các hàm ra để file khác có thể sử dụng
module.exports = {
  getAllCoupons,
  createCoupon
};
