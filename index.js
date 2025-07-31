// ==========================================================
// File: index.js (Hoàn chỉnh với Gemini API và tăng giới hạn Body)
// ==========================================================

require('dotenv').config(); // Tải biến môi trường từ file .env
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// ==========================================================
// THÊM: Import SDK Gemini API
// ==========================================================
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Nạp các file route của ứng dụng
const couponRoutes = require('./routes/coupon.routes');
const orderRoutes = require('./routes/order.routes');
const customerRoutes = require('./routes/customer.routes');
const syncRoutes = require('./routes/sync.routes');
const webhookRoutes = require('./routes/webhook.routes');
// const cronRoutes = require('./routes/cron.routes'); // <-- Tạm thời vô hiệu hóa dòng này (theo file gốc của bạn)

// Khởi tạo ứng dụng Express
const app = express();
const PORT = process.env.PORT || 3001; // Sử dụng cổng 3001 hoặc biến môi trường PORT

// --- Middleware ---
app.use(cors()); // Cho phép CORS cho tất cả các request để frontend có thể truy cập
// THAY ĐỔI: Tăng giới hạn kích thước request body JSON
app.use(express.json({ limit: '50mb' })); 
// THÊM: Tăng giới hạn cho dữ liệu URL-encoded (ví dụ: từ form submissions)
app.use(express.urlencoded({ limit: '50mb', extended: true })); 


// ==========================================================
// THÊM: Cấu hình Gemini API và Route mới cho AI Analysis
// ==========================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Kiểm tra xem GEMINI_API_KEY có tồn tại không
if (!GEMINI_API_KEY) {
    console.warn("Cảnh báo: Biến môi trường GEMINI_API_KEY chưa được thiết lập. Tính năng AI sẽ không hoạt động.");
    // Ứng dụng sẽ tiếp tục chạy nhưng tính năng AI sẽ bị vô hiệu hóa
} else {
    // Khởi tạo Gemini API nếu có KEY
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Sử dụng mô hình gemini-pro cho văn bản

    // Định nghĩa endpoint POST mới cho phân tích marketing AI
    app.post('/api/analyze-marketing', async (req, res) => {
        // Lấy dữ liệu marketing từ body của request (được gửi từ frontend)
        const { 
            totalRevenue, 
            totalDiscount, 
            totalOrdersWithDiscount, 
            couponUsageData, 
            revenueByCouponData, 
            topCustomers,
            orders, // Dữ liệu order chi tiết
            customers, // Dữ liệu customer chi tiết
            coupons // Dữ liệu coupon chi tiết
        } = req.body;

        // Kiểm tra xem có dữ liệu nào được gửi không
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ error: "Không có dữ liệu được cung cấp cho phân tích AI." });
        }

        // Xây dựng prompt (lời nhắc) chi tiết cho Gemini
        // Prompt này hướng dẫn AI phân tích và định dạng kết quả
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
            // Thêm dữ liệu chi tiết từ các mảng
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
            // Bạn có thể thêm dữ liệu thô chi tiết hơn nếu cần cho Gemini phân tích sâu hơn
            // Ví dụ: "\nThông tin chi tiết tất cả đơn hàng:\n" + JSON.stringify(orders, null, 2),
            //        "\nThông tin chi tiết tất cả khách hàng:\n" + JSON.stringify(customers, null, 2),
            //        "\nThông tin chi tiết tất cả mã giảm giá:\n" + JSON.stringify(coupons, null, 2),
            "\n",
            "Hãy trình bày kết quả theo định dạng sau:",
            "Insight từ AI:",
            "<Các insight tổng quan về hiệu suất mã giảm giá, xu hướng khách hàng, v.v. (tối đa 3-5 câu)>",
            "\nThử nghiệm đề xuất (ví dụ: A/B testing):",
            "- <Thử nghiệm 1 (Mô tả ngắn gọn)>",
            "- <Thử nghiệm 2 (Mô tả ngắn gọn)>",
            "\nChiến dịch đề xuất:",
            "- <Chiến dịch 1 (Mục tiêu, Đối tượng, Ý tưởng chính)>",
            "- <Chiến dịch 2 (Mục tiêu, Đối tượng, Ý tưởng chính)>",
            "\nEmail Marketing đề xuất (chủ đề và nội dung chính):",
            "- <Chủ đề Email 1: Nội dung chính>",
            "- <Chủ đề Email 2: Nội dung chính>",
            "\n",
            "Hãy đảm bảo phân tích của bạn thực tế và dựa trên dữ liệu đã cho. Nếu có bất kỳ điều gì không rõ ràng, hãy đưa ra giả định hợp lý hoặc nêu rõ hạn chế của dữ liệu."
        ];

        try {
            // Gọi Gemini API
            const result = await model.generateContent(promptParts);
            const response = await result.response;
            const textResponse = response.text();

            // Phân tích phản hồi văn bản từ Gemini thành các phần riêng biệt
            // (Phần này cần điều chỉnh nếu định dạng đầu ra của Gemini thay đổi)
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
                        insights = ''; // Reset insights cho mỗi lần xử lý
                    } else if (line.startsWith('Thử nghiệm đề xuất:')) {
                        currentSection = 'experiments';
                    } else if (line.startsWith('Chiến dịch đề xuất:')) {
                        currentSection = 'campaigns';
                    } else if (line.startsWith('Email Marketing đề xuất:')) {
                        currentSection = 'emails';
                    } else if (line.startsWith('- ')) { // Xử lý các mục danh sách
                        const content = line.substring(2).trim();
                        if (currentSection === 'experiments') experiments.push(content);
                        else if (currentSection === 'campaigns') campaigns.push(content);
                        else if (currentSection === 'emails') emails.push(content);
                    } else if (currentSection === 'insights' && line.trim() !== '') {
                        insights += line.trim() + '\n'; // Thêm dòng vào insights
                    }
                }
                insights = insights.trim(); // Loại bỏ khoảng trắng thừa cuối cùng
            }
            
            // Trả về kết quả cho frontend
            res.json({
                insights: insights,
                experiments: experiments,
                campaigns: campaigns,
                emails: emails
            });

        } catch (error) {
            // Xử lý lỗi nếu có vấn đề khi gọi Gemini API
            console.error('Lỗi khi gọi Gemini API:', error);
            res.status(500).json({ error: 'Failed to get AI analysis', details: error.message });
        }
    });
}


// --- Sử dụng các route hiện có của ứng dụng ---
// (Đảm bảo các file route tương ứng tồn tại trong thư mục ./routes/)
app.use('/api', couponRoutes);
app.use('/api', orderRoutes);
app.use('/api', customerRoutes);
app.use('/api', syncRoutes);
app.use('/api', webhookRoutes);
// app.use('/api', cronRoutes); // <-- Giữ nguyên trạng thái vô hiệu hóa

// --- KẾT NỐI DATABASE VÀ KHỞI ĐỘNG SERVER ---
const MONGO_URI = process.env.MONGO_URI;

// Kiểm tra biến môi trường MONGO_URI
if (!MONGO_URI) {
    console.error("Lỗi: Biến môi trường MONGO_URI chưa được thiết lập trong file .env hoặc trên Render.");
    process.exit(1); // Thoát ứng dụng nếu không có kết nối DB
}

// Kết nối đến MongoDB Atlas và khởi động server
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
        process.exit(1); // Thoát ứng dụng nếu kết nối DB thất bại
    });
