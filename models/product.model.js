const mongoose = require('mongoose');

// --- Schema cho ProductImage (Hình ảnh sản phẩm) ---
const ProductImageSchema = new mongoose.Schema({
  id: { type: Number },
  created_at: { type: Date },
  updated_at: { type: Date },
  position: { type: Number },
  product_id: { type: Number },
  src: { type: String },
  filename: { type: String },
  variant_ids: [{ type: Number }]
}, { _id: false }); 

// --- Schema cho ProductOption (Tùy chọn sản phẩm như Size, Color) ---
const ProductOptionSchema = new mongoose.Schema({
  id: { type: Number },
  name: { type: String },
  position: { type: Number },
  product_id: { type: Number },
  values: [{ type: String }]
}, { _id: false }); 

// --- Schema cho ProductVariant (Phiên bản sản phẩm) ---
const VariantSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  product_id: { type: Number },
  title: { type: String },
  price: { type: Number, default: 0 },
  compare_at_price: { type: Number, default: 0 },
  sku: { type: String },
  barcode: { type: String },
  grams: { type: Number, default: 0 },
  inventory_management: { type: String }, 
  inventory_policy: { type: String }, 
  inventory_quantity: { type: Number, default: 0 },
  taxable: { type: Boolean, default: true },
  requires_shipping: { type: Boolean, default: true },
  fulfillment_service: { type: String },
  position: { type: Number },
  option1: { type: String },
  option2: { type: String },
  option3: { type: String },
  image_id: { type: Number },
  created_at: { type: Date },
  updated_at: { type: Date },
  inventory_advance: { type: Object },

  // Trường quan trọng cho việc tính lợi nhuận
  cost: { type: Number, default: 0 } 
}, { _id: false }); 

// --- Schema cho Product (Sản phẩm chính) ---
const ProductSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    handle: { type: String },
    product_type: { type: String },
    vendor: { type: String },
    tags: { type: String },
    template_suffix: { type: String },
    published_at: { type: Date },
    published_scope: { type: String },
    created_at_haravan: { type: Date }, 
    updated_at_haravan: { type: Date }, 

    variants: [VariantSchema],
    images: [ProductImageSchema],
    options: [ProductOptionSchema],

    only_hide_from_list: { type: Boolean, default: false },
    not_allow_promotion: { type: Boolean, default: false },

    // ==========================================================
    // CÁC TRƯỜNG DỮ LIỆU ĐỂ LƯU THÔNG TIN SMART COLLECTIONS
    // ==========================================================
    haravan_collection_ids: [{ type: Number }], // Mảng các ID của Collection
    haravan_collection_names: [{ type: String }], // Mảng các TÊN của Collection
    
    // Các trường tùy chỉnh khác của bạn
    is_new_product: { type: Boolean, default: false },
    first_imported_at: { type: Date }

}, {
    timestamps: true
});

const Product = mongoose.model('Product', ProductSchema);
module.exports = Product;