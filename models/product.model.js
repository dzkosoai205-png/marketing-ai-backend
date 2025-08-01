// ==========================================================
// File: models/product.model.js (Hoàn chỉnh theo Tài liệu Haravan & Yêu cầu của bạn)
// Nhiệm vụ: Định nghĩa cấu trúc của một sản phẩm, bao gồm giá vốn và các thông tin từ Haravan API.
// ==========================================================

const mongoose = require('mongoose');

// --- Schema cho ProductImage (Hình ảnh sản phẩm) ---
const ProductImageSchema = new mongoose.Schema({
  id: { type: Number }, // Haravan Image ID
  created_at: { type: Date },
  updated_at: { type: Date },
  position: { type: Number },
  product_id: { type: Number },
  src: { type: String }, // URL của hình ảnh
  filename: { type: String },
  variant_ids: [{ type: Number }] // Các ID variant mà hình ảnh này liên quan
}, { _id: false }); // Không tạo _id tự động cho sub-document này

// --- Schema cho ProductOption (Tùy chọn sản phẩm như Size, Color) ---
const ProductOptionSchema = new mongoose.Schema({
  id: { type: Number }, // Haravan Option ID
  name: { type: String }, // Tên tùy chọn, ví dụ: "Size", "Color"
  position: { type: Number },
  product_id: { type: Number },
  values: [{ type: String }] // Các giá trị của tùy chọn, ví dụ: ["S", "M", "L"]
}, { _id: false }); // Không tạo _id tự động cho sub-document này

// --- Schema cho ProductVariant (Phiên bản sản phẩm) ---
const VariantSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true }, // ID phiên bản từ Haravan
  product_id: { type: Number }, // ID sản phẩm cha
  title: { type: String }, // Tiêu đề phiên bản, ví dụ: "Màu đỏ / Size L"
  price: { type: Number, default: 0 }, // Giá bán của phiên bản
  compare_at_price: { type: Number, default: 0 }, // Giá gốc để so sánh (giá bị gạch đi)
  sku: { type: String }, // Mã SKU của phiên bản
  barcode: { type: String }, // Mã vạch
  grams: { type: Number, default: 0 }, // Khối lượng sản phẩm
  inventory_management: { type: String }, // Ví dụ: "haravan", "shopify", "manual"
  inventory_policy: { type: String }, // Ví dụ: "deny", "continue"
  inventory_quantity: { type: Number, default: 0 }, // Số lượng tồn kho
  taxable: { type: Boolean, default: true }, // Có chịu thuế không
  requires_shipping: { type: Boolean, default: true }, // Có yêu cầu vận chuyển không
  fulfillment_service: { type: String }, // Dịch vụ fulfill (e.g., "manual")
  position: { type: Number },
  option1: { type: String }, // Giá trị tùy chọn 1
  option2: { type: String }, // Giá trị tùy chọn 2
  option3: { type: String }, // Giá trị tùy chọn 3
  image_id: { type: Number }, // ID hình ảnh liên quan đến variant
  created_at: { type: Date }, // Thời gian tạo variant trên Haravan
  updated_at: { type: Date }, // Thời gian cập nhật variant trên Haravan
  inventory_advance: { type: Object }, // Chi tiết tồn kho nâng cao từ Haravan

  // <-- Trường quan trọng để tính lợi nhuận, KHÔNG có trực tiếp từ Haravan API -->
  // Cần được populate thủ công hoặc thông qua quá trình đồng bộ dữ liệu của bạn
  cost: { type: Number, default: 0 } 
}, { _id: false }); // Không tạo _id tự động cho sub-document này

// --- Schema cho Product (Sản phẩm chính) ---
const ProductSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // ID từ Haravan (DUY NHẤT)
    title: { type: String, required: true }, // Tên sản phẩm, ví dụ: "[Blue Lock] Thẻ - Isagi Yoichi"
    handle: { type: String }, // URL handle duy nhất
    product_type: { type: String }, // Loại sản phẩm theo phân loại của Haravan (ví dụ: "Đồ chơi", "Quần áo")
    vendor: { type: String }, // Nhà cung cấp
    tags: { type: String }, // Các thẻ (tags) của sản phẩm, dạng chuỗi ngăn cách bởi dấu phẩy
    template_suffix: { type: String }, // Suffix của template Liquid
    published_at: { type: Date }, // Ngày xuất bản sản phẩm
    published_scope: { type: String }, // Phạm vi xuất bản: "web", "pos", "global"

    // Thời gian tạo/cập nhật sản phẩm trên Haravan (để phân biệt với timestamps của Mongoose)
    created_at_haravan: { type: Date }, 
    updated_at_haravan: { type: Date }, 

    // Các mảng lồng nhau cho variants, images, options
    variants: [VariantSchema],
    images: [ProductImageSchema],
    options: [ProductOptionSchema],

    // Cờ báo hiệu ẩn sản phẩm khỏi danh sách, không cho phép khuyến mãi (theo Haravan API)
    only_hide_from_list: { type: Boolean, default: false },
    not_allow_promotion: { type: Boolean, default: false },

    // ==========================================================
    // <-- CÁC TRƯỜNG TÙY CHỈNH CỦA BẠN CHO PHÂN TÍCH AI -->
    // ==========================================================
    // Trường này để AI nhận diện rõ ràng anime
    // Có thể populate từ `title` trong controller hoặc lưu trực tiếp nếu bạn có phân loại rõ ràng trong DB
    anime_genre: { type: String }, 
    // Trường này để AI nhận diện rõ loại sản phẩm (ví dụ: "Thẻ", "Đồ bông")
    // Cũng có thể populate từ `title` trong controller hoặc lưu trực tiếp
    product_category: { type: String }, 
    
    // Thêm cờ để theo dõi hàng mới (từ file cũ của bạn)
    is_new_product: { type: Boolean, default: false },
    // Thời gian sản phẩm lần đầu tiên được nhập/đồng bộ vào hệ thống của bạn
    first_imported_at: { type: Date }

}, {
    timestamps: true // Tự động thêm createdAt và updatedAt của Mongoose
});

const Product = mongoose.model('Product', ProductSchema);
module.exports = Product;
