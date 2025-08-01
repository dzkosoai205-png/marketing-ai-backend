// ==========================================================
// File: index.js (Cập nhật)
// Xóa route AI cũ, thêm route AI mới
// ==========================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const couponRoutes = require('./routes/coupon.routes');
const orderRoutes = require('./routes/order.routes');
const customerRoutes = require('./routes/customer.routes');
const syncRoutes = require('./routes/sync.routes');
const webhookRoutes = require('./routes/webhook.routes');
const reportRoutes = require('./routes/report.routes');
const accountingRoutes = require('./routes/accounting.routes');
const masterAIRoutes = require('./routes/masterAI.routes'); // <-- Dòng mới

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', couponRoutes);
app.use('/api', orderRoutes);
app.use('/api', customerRoutes);
app.use('/api', syncRoutes);
app.use('/api', webhookRoutes);
app.use('/api', reportRoutes);
app.use('/api', accountingRoutes);
app.use('/api', masterAIRoutes); // <-- Dòng mới

const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ Đã kết nối thành công đến MongoDB Atlas!");
        app.listen(PORT, () => {
            console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error("❌ Lỗi kết nối MongoDB:", err.message);
        process.exit(1);
    });
