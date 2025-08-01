// ==========================================================
// File: models/product.model.js
// Sửa lại tên trường 'cost' thành 'cost_price' để khớp với Haravan.
// ==========================================================

const mongoose = require('mongoose');

const VariantSchema = new mongoose.Schema({
    id: { type: Number, required: true },
    price: { type: Number, default: 0 },
    sku: { type: String },
    inventory_quantity: { type: Number, default: 0 },
    cost_price: { type: Number, default: 0 } // <-- SỬA LẠI TÊN TRƯỜNG
});

const ProductSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    handle: { type: String },
    product_type: { type: String },
    vendor: { type: String },
    tags: { type: String },
    
    variants: [VariantSchema],

    is_new_product: { type: Boolean, default: false },
    first_imported_at: { type: Date }

}, {
    timestamps: true
});

const Product = mongoose.model('Product', ProductSchema);
module.exports = Product;
