// ==========================================================
// File: models/haravanCollection.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một Smart Collection (nhóm sản phẩm tự động) từ Haravan.
// ==========================================================

const mongoose = require('mongoose');

// Schema cho một rule (quy tắc) của Smart Collection
const SmartCollectionRuleSchema = new mongoose.Schema({
    column: { type: String }, // Trường dữ liệu để so sánh, ví dụ: 'tag', 'title', 'product_type'
    relation: { type: String }, // Mối quan hệ, ví dụ: 'equals', 'starts_with', 'contains'
    condition: { type: String } // Giá trị để so sánh, ví dụ: 'Blue Lock'
}, { _id: false });

const HaravanCollectionSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // ID của Collection từ Haravan
    title: { type: String, required: true }, // Tên của Collection (ví dụ: "Blue Lock Collection")
    handle: { type: String }, // Handle của Collection (dùng cho URL)
    body_html: { type: String }, // Mô tả HTML của Collection
    sort_order: { type: String }, // Cách sắp xếp sản phẩm trong Collection
    published_at: { type: Date }, // Ngày xuất bản Collection
    published_scope: { type: String }, // Phạm vi xuất bản (web, pos, global)
    template_suffix: { type: String }, // Suffix của template Liquid
    
    // ==========================================================
    // <-- CÁC TRƯỜNG DỮ LIỆU ĐẶC THÙ CHO SMART COLLECTIONS -->
    // ==========================================================
    disjunctive: { type: Boolean, default: false }, // false: AND, true: OR
    rules: [SmartCollectionRuleSchema], // Mảng các quy tắc của Collection này
    products_count: { type: Number, default: 0 }, // Số lượng sản phẩm trong collection

    // Thời gian tạo/cập nhật trên Haravan (để phân biệt với timestamps của Mongoose)
    created_at_haravan: { type: Date }, 
    updated_at_haravan: { type: Date }

}, {
    timestamps: true // Tự động thêm createdAt và updatedAt của Mongoose
});

const HaravanCollection = mongoose.model('HaravanCollection', HaravanCollectionSchema);
module.exports = HaravanCollection;