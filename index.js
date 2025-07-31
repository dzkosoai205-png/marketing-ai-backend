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
    "Bạn là một chuyên gia phân tích dữ liệu marketing hàng đầu, có khả năng nhìn nhận xu hướng và đề xuất chiến lược hiệu quả. Bạn cần đưa ra các insight sâu sắc, đề xuất các thử nghiệm A/B marketing cụ thể, các ý tưởng chiến dịch marketing sáng tạo, và các chủ đề/nội dung email marketing hấp dẫn.",
    "Phân tích dựa trên các dữ liệu sau đây từ một doanh nghiệp thương mại điện tử:",
    "--- DỮ LIỆU TỔNG QUAN ---",
    `- Tổng doanh thu từ đơn hàng có mã giảm giá: ${totalRevenue} VND.`,
    `- Tổng số đơn hàng có mã giảm giá: ${totalOrdersWithDiscount} đơn.`,
    `- Tổng tiền đã giảm giá cho khách hàng: ${totalDiscount} VND.`,

    "\n--- CHI TIẾT SỬ DỤNG MÃ GIẢM GIÁ (Top Coupon Codes) ---",
    "Đây là danh sách các mã giảm giá và số lượt sử dụng của chúng:",
    "Mã | Số lượt sử dụng",
    "---|----------------",
    // Đảm bảo dữ liệu này có giá trị (không rỗng)
    ...(couponUsageData && couponUsageData.length > 0 ? 
        couponUsageData.map(item => `${item.name} | ${item['Số lượt sử dụng']}`) : 
        ["Không có dữ liệu sử dụng mã giảm giá.")
    ),

    "\n--- DOANH THU THEO MÃ GIẢM GIÁ (Revenue by Coupon) ---",
    "Đây là doanh thu được tạo ra bởi từng mã giảm giá:",
    "Mã | Doanh thu",
    "---|-----------",
    // Đảm bảo dữ liệu này có giá trị
    ...(revenueByCouponData && revenueByCouponData.length > 0 ? 
        revenueByCouponData.map(item => `${item.name} | ${item.value}`) : 
        ["Không có dữ liệu doanh thu theo mã giảm giá.")
    ),

    "\n--- KHÁCH HÀNG THÂN THIẾT (Top 5 Customers by Coupon Usage) ---",
    "Đây là 5 khách hàng hàng đầu theo số lượt sử dụng mã giảm giá:",
    "Khách hàng | Lượt dùng mã",
    "------------|-------------",
    // Đảm bảo dữ liệu này có giá trị
    ...(topCustomers && topCustomers.length > 0 ? 
        topCustomers.map(item => `${item.name} | ${item.usageCount}`) : 
        ["Không có dữ liệu khách hàng thân thiết.")
    ),

    // =========================================================================
    // THÊM: Có thể thêm dữ liệu thô chi tiết hơn nếu cần để AI phân tích sâu
    // Tuy nhiên, hãy cẩn thận với giới hạn token của gói miễn phí và kích thước body
    // =========================================================================
    // if (orders && orders.length > 0) {
    //     promptParts.push("\n--- CHI TIẾT TẤT CẢ ĐƠN HÀNG (đã giảm giá và thanh toán) ---");
    //     promptParts.push("Dữ liệu này bao gồm ID đơn hàng, tổng giá trị, tổng chiết khấu, mã giảm giá và thông tin khách hàng:");
    //     promptParts.push(JSON.stringify(orders, null, 2));
    // }
    // if (customers && customers.length > 0) {
    //     promptParts.push("\n--- CHI TIẾT TẤT CẢ KHÁCH HÀNG ---");
    //     promptParts.push("Dữ liệu này bao gồm ID khách hàng, tên và email:");
    //     promptParts.push(JSON.stringify(customers, null, 2));
    // }
    // if (coupons && coupons.length > 0) {
    //     promptParts.push("\n--- CHI TIẾT TẤT CẢ MÃ GIẢM GIÁ ---");
    //     promptParts.push("Dữ liệu này bao gồm mã, giá trị và loại chiết khấu:");
    //     promptParts.push(JSON.stringify(coupons, null, 2));
    // }

    "\n--- YÊU CẦU PHÂN TÍCH VÀ ĐỀ XUẤT ---",
    "Dựa trên các dữ liệu trên:",
    "1. Insight từ AI: Đưa ra ít nhất 3-5 insight quan trọng về hiệu quả của các chiến dịch mã giảm giá, hành vi của khách hàng, và các xu hướng đáng chú ý. Hãy tập trung vào những gì dữ liệu ĐANG NÓI và ĐỀ XUẤT tại sao. Sử dụng ngôn ngữ chuyên nghiệp và dễ hiểu. Mỗi insight là một đoạn văn ngắn.",
    "2. Thử nghiệm đề xuất (A/B testing): Đề xuất ít nhất 2 ý tưởng thử nghiệm A/B cụ thể để tối ưu hóa việc sử dụng mã giảm giá hoặc thu hút khách hàng. Mỗi thử nghiệm nên có mục tiêu rõ ràng và các yếu tố cần thử nghiệm.",
    "3. Chiến dịch đề xuất: Đề xuất ít nhất 2 ý tưởng chiến dịch marketing mới, có thể liên quan đến việc sử dụng mã giảm giá hoặc dựa trên insight về khách hàng. Mỗi chiến dịch cần nêu rõ mục tiêu, đối tượng và ý tưởng cốt lõi.",
    "4. Email Marketing đề xuất: Đề xuất ít nhất 2 chủ đề email marketing hấp dẫn và nội dung chính cho mỗi email, dựa trên các insight hoặc đề xuất chiến dịch.",
    "\n",
    "Hãy trình bày kết quả theo định dạng CÓ CẤU TRÚC sau:",
    "Insight từ AI:",
    "<Insight 1.>",
    "<Insight 2.>",
    "<Insight 3.>",
    // ...
    "\nThử nghiệm đề xuất:",
    "- <Thử nghiệm A>",
    "- <Thử nghiệm B>",
    // ...
    "\nChiến dịch đề xuất:",
    "- <Chiến dịch A>",
    "- <Chiến dịch B>",
    // ...
    "\nEmail Marketing đề xuất:",
    "- <Chủ đề Email A: Nội dung chính>",
    "- <Chủ đề Email B: Nội dung chính>",
    // ...
    "\n",
    "Nếu dữ liệu quá ít hoặc không có để tạo insight cụ thể, hãy nêu rõ điều đó và đưa ra các đề xuất chung chung hơn hoặc các câu hỏi cần đặt ra để thu thập thêm dữ liệu.",
    "Đảm bảo không bỏ trống bất kỳ phần nào nếu có thể."
];
        try {
            // Gọi Gemini API
            const result = await model.generateContent(promptParts);
            const response = await result.response;
            const textResponse = response.text();
            console.log('Phản hồi RAW từ Gemini:', textResponse); // <--- THÊM DÒNG NÀY

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
