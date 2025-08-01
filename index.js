// ==========================================================
// File: index.js (Phiên bản Hoàn chỉnh cuối cùng)
// ==========================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Nạp tất cả các file route
const couponRoutes = require('./routes/coupon.routes');
const orderRoutes = require('./routes/order.routes');
const customerRoutes = require('./routes/customer.routes');
const syncRoutes = require('./routes/sync.routes');
const webhookRoutes = require('./routes/webhook.routes');
const aiRoutes = require('./routes/ai.routes'); // <-- Thêm route AI

// Khởi tạo ứng dụng Express
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Sử dụng các route ---
app.use('/api', couponRoutes);
app.use('/api', orderRoutes);
app.use('/api', customerRoutes);
app.use('/api', syncRoutes);
app.use('/api', webhookRoutes);
app.use('/api', aiRoutes); // <-- Sử dụng route AI

// --- KẾT NỐI DATABASE VÀ KHỞI ĐỘNG SERVER ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("Lỗi: Biến môi trường MONGO_URI chưa được thiết lập trong file .env");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ Đã kết nối thành công đến MongoDB Atlas!");
        // Chỉ khởi động server sau khi đã kết nối database thành công
        app.listen(PORT, () => {
            console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error("❌ Lỗi kết nối MongoDB:", err.message);
        process.exit(1);
    });
