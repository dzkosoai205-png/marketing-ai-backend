// ==========================================================
// File: models/product.model.js
// Nhiệm vụ: Định nghĩa cấu trúc của một sản phẩm, bao gồm giá vốn.
// ==========================================================

const mongoose = require('mongoose');

const VariantSchema = new mongoose.Schema({
    id: { type: Number, required: true },
    price: { type: Number, default: 0 },
    sku: { type: String },
    inventory_quantity: { type: Number, default: 0 },
    cost: { type: Number, default: 0 } // <-- Trường quan trọng để tính lợi nhuận
});

const ProductSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // ID từ Haravan
    title: { type: String, required: true },
    handle: { type: String },
    product_type: { type: String }, // Dùng để phân loại theo anime
    vendor: { type: String },
    tags: { type: String },
    
    // Một sản phẩm có thể có nhiều phiên bản (variant)
    variants: [VariantSchema],

    // Thêm cờ để theo dõi hàng mới
    is_new_product: { type: Boolean, default: false },
    first_imported_at: { type: Date }

}, {
    timestamps: true
});

const Product = mongoose.model('Product', ProductSchema);
module.exports = Product;
