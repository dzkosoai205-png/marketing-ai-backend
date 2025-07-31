// ==========================================================
// File: index.js (Backend với Gemini API)
// ==========================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// ==========================================================
// THÊM: Import SDK Gemini API
// ==========================================================
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Nạp các file route
const couponRoutes = require('./routes/coupon.routes');
const orderRoutes = require('./routes/order.routes');
const customerRoutes = require('./routes/customer.routes');
const syncRoutes = require('./routes/sync.routes');
const webhookRoutes = require('./routes/webhook.routes');
// const cronRoutes = require('./routes/cron.routes'); // <-- Tạm thời vô hiệu hóa dòng này

// Khởi tạo ứng dụng Express
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// ==========================================================
// THÊM: Cấu hình Gemini API và Route mới
// ==========================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.warn("Cảnh báo: Biến môi trường GEMINI_API_KEY chưa được thiết lập. Tính năng AI sẽ không hoạt động.");
    // Không thoát ứng dụng, chỉ cảnh báo để các API khác vẫn hoạt động
} else {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Định nghĩa endpoint mới cho phân tích marketing AI
    app.post('/api/analyze-marketing', async (req, res) => {
        // Lấy dữ liệu từ body của request frontend
        const { totalRevenue, totalDiscount, totalOrdersWithDiscount, couponUsageData, revenueByCouponData, topCustomers, orders, customers, coupons } = req.body;

        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ error: "Không có dữ liệu được cung cấp cho phân tích AI." });
        }

        // Xây dựng prompt cho Gemini
        const promptParts = [
            "Bạn là một chuyên gia phân tích marketing và chiến lược gia.",
            "Hãy phân tích dữ liệu marketing sau đây và đưa ra các insight sâu sắc, đề xuất các thử nghiệm marketing A/B mới, các ý tưởng chiến dịch marketing, và các chủ đề/nội dung email marketing hấp dẫn.",
            "Dữ liệu được cung cấp là:",
            `- Tổng doanh thu từ đơn hàng có mã giảm giá: ${totalRevenue} VND`,
            `- Tổng số đơn hàng có mã giảm giá: ${totalOrdersWithDiscount}`,
            `- Tổng tiền đã giảm giá: ${totalDiscount} VND`,
            "\nChi tiết lượt sử dụng mã giảm giá:",
            "Mã | Số lượt sử dụng",
            "---|----------------",
            ...couponUsageData.map(item => `${item.name} | ${item['Số lượt sử dụng']}`),
            "\nDoanh thu theo mã giảm giá:",
            "Mã | Doanh thu",
            "---|-----------",
            ...revenueByCouponData.map(item => `${item.name} | ${item.value}`),
            "\nKhách hàng thân thiết (top 5 theo số lượt dùng mã):",
            "Khách hàng | Lượt dùng mã",
            "------------|-------------",
            ...topCustomers.map(item => `${item.name} | ${item.usageCount}`),
            "\n",
            "Hãy trình bày kết quả theo định dạng sau:",
            "Insight từ AI:",
            "<Các insight tổng quan về hiệu suất mã giảm giá, xu hướng khách hàng, v.v.>",
            "\nThử nghiệm đề xuất (ví dụ: A/B testing):",
            "- <Thử nghiệm 1>",
            "- <Thử nghiệm 2>",
            "\nChiến dịch đề xuất:",
            "- <Chiến dịch 1 (Mục tiêu, Đối tượng, Ý tưởng)>",
            "- <Chiến dịch 2>",
            "\nEmail Marketing đề xuất (chủ đề và nội dung chính):",
            "- <Chủ đề Email 1: Nội dung chính>",
            "- <Chủ đề Email 2: Nội dung chính>",
            "\n",
            "Hãy đảm bảo phân tích của bạn thực tế và dựa trên dữ liệu đã cho. Nếu có bất kỳ điều gì không rõ ràng, hãy đưa ra giả định hợp lý hoặc nêu rõ hạn chế của dữ liệu."
        ];

        try {
            const result = await model.generateContent(promptParts);
            const response = await result.response;
            const textResponse = response.text();

            // Phân tích phản hồi văn bản từ Gemini để trích xuất các phần cần thiết
            let insights = "";
            let experiments = [];
            let campaigns = [];
            let emails = [];

            if (textResponse) {
                const parts = textResponse.split('\n');
                let currentSection = '';
                for (const line of parts) {
                    if (line.startsWith('Insight từ AI:')) {
                        currentSection = 'insights';
                        insights = ''; // Reset insight cho phần mới
                    } else if (line.startsWith('Thử nghiệm đề xuất:')) {
                        currentSection = 'experiments';
                    } else if (line.startsWith('Chiến dịch đề xuất:')) {
                        currentSection = 'campaigns';
                    } else if (line.startsWith('Email Marketing đề xuất:')) {
                        currentSection = 'emails';
                    } else if (line.startsWith('- ')) {
                        const content = line.substring(2).trim();
                        if (currentSection === 'experiments') experiments.push(content);
                        else if (currentSection === 'campaigns') campaigns.push(content);
                        else if (currentSection === 'emails') emails.push(content);
                    } else if (currentSection === 'insights' && line.trim() !== '') {
                        insights += line.trim() + '\n';
                    }
                }
                insights = insights.trim(); // Loại bỏ khoảng trắng thừa cuối cùng
            }
            
            res.json({
                insights: insights,
                experiments: experiments,
                campaigns: campaigns,
                emails: emails
            });

        } catch (error) {
            console.error('Lỗi khi gọi Gemini API:', error);
            res.status(500).json({ error: 'Failed to get AI analysis', details: error.message });
        }
    });
}


// --- Sử dụng các route ---
app.use('/api', couponRoutes);
app.use('/api', orderRoutes);
app.use('/api', customerRoutes);
app.use('/api', syncRoutes);
app.use('/api', webhookRoutes);
// app.use('/api', cronRoutes); // <-- Tạm thời vô hiệu hóa dòng này

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