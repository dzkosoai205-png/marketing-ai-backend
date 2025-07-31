require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const couponRoutes = require('./routes/coupon.routes');
const orderRoutes = require('./routes/order.routes');
const customerRoutes = require('./routes/customer.routes');
const syncRoutes = require('./routes/sync.routes');
const webhookRoutes = require('./routes/webhook.routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', couponRoutes);
app.use('/api', orderRoutes);
app.use('/api', customerRoutes);
app.use('/api', syncRoutes);
app.use('/api', webhookRoutes);

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("Lỗi: Biến môi trường MONGO_URI chưa được thiết lập.");
} else {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("✅ Đã kết nối thành công đến MongoDB Atlas!"))
        .catch(err => console.error("❌ Lỗi kết nối MongoDB:", err.message));
}

// Dòng mới: Xuất 'app' để Vercel có thể sử dụng
module.exports = app;