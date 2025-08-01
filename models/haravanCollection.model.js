// ==========================================================
// File: models/haravanCollection.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một Custom Collection (nhóm sản phẩm) từ Haravan.
// ==========================================================

const mongoose = require('mongoose');

const HaravanCollectionSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // ID của Collection từ Haravan
    title: { type: String, required: true }, // Tên của Collection (ví dụ: "Blue Lock Collection", "Thẻ Anime")
    handle: { type: String }, // Handle của Collection (dùng cho URL)
    body_html: { type: String }, // Mô tả HTML của Collection
    sort_order: { type: String }, // Cách sắp xếp sản phẩm trong Collection (manual, best-selling, etc.)
    published_at: { type: Date }, // Ngày xuất bản Collection
    published_scope: { type: String }, // Phạm vi xuất bản (web, pos, global)
    template_suffix: { type: String }, // Suffix của template Liquid

    // Metafields nếu có (tùy chọn)
    metafields: { type: mongoose.Schema.Types.Mixed }, 

    // Thời gian tạo/cập nhật trên Haravan (để phân biệt với timestamps của Mongoose)
    created_at_haravan: { type: Date }, 
    updated_at_haravan: { type: Date }

}, {
    timestamps: true // Tự động thêm createdAt và updatedAt của Mongoose
});

const HaravanCollection = mongoose.model('HaravanCollection', HaravanCollectionSchema);
module.exports = HaravanCollection;