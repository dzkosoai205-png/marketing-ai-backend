// ==========================================================
// File: index.js (Phiên bản Hoàn Chỉnh Cuối Cùng, Đã Sửa Lỗi Cú Pháp)
// Đã bao gồm:
// - Cấu hình Gemini API (gemini-2.0-flash)
// - Tăng giới hạn kích thước request body (50mb)
// - Logic parsing phản hồi từ Gemini mạnh mẽ và linh hoạt
// - Debug logs để kiểm tra phản hồi RAW và kết quả parsed
// - Sửa lỗi phạm vi biến (ReferenceError)
// - SỬA LỖI CÚ PHÁP: Unexpected token ')'
// ==========================================================

// Tải biến môi trường từ file .env (chỉ dùng cục bộ)
require('dotenv').config();

const express = require('express');
const cors = require('cors'); // Đảm bảo không có lỗi chính tả ở đây
const mongoose = require('mongoose');

// Import SDK Gemini API
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Nạp các file route của ứng dụng
const couponRoutes = require('./routes/coupon.routes');
const orderRoutes = require('./routes/order.routes');
const customerRoutes = require('./routes/customer.routes');
const syncRoutes = require('./routes/sync.routes');
const webhookRoutes = require('./routes/webhook.routes');
// const cronRoutes = require('./routes/cron.routes'); // <-- Giữ nguyên trạng thái vô hiệu hóa

// Khởi tạo ứng dụng Express
const app = express();
const PORT = process.env.PORT || 3001; // Sử dụng cổng 3001 hoặc biến môi trường PORT

// --- Middleware ---
app.use(cors()); // Cho phép CORS cho tất cả các request để frontend có thể truy cập
// Tăng giới hạn kích thước request body JSON để tránh lỗi 413 Payload Too Large
app.use(express.json({ limit: '50mb' })); 
// Tăng giới hạn cho dữ liệu URL-encoded (ví dụ: từ form submissions)
app.use(express.urlencoded({ limit: '50mb', extended: true })); 


// ==========================================================
// Cấu hình Gemini API
// ==========================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let model; // Khai báo biến model ở phạm vi rộng hơn

if (!GEMINI_API_KEY) {
    console.warn("Cảnh báo: Biến môi trường GEMINI_API_KEY chưa được thiết lập. Tính năng AI sẽ không hoạt động.");
} else {
    // Khởi tạo Gemini API nếu có KEY
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Gán giá trị cho biến model
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
}

// ==========================================================
// Định nghĩa Route mới cho AI Analysis (Đặt ở phạm vi app)
// ==========================================================
app.post('/api/analyze-marketing', async (req, res) => { // 'res' là tham số của hàm này, luôn được định nghĩa
    // Nếu GEMINI_API_KEY không có, model sẽ không được định nghĩa
    if (!model) {
        return res.status(503).json({ error: "Dịch vụ AI không khả dụng. Vui lòng kiểm tra cấu hình GEMINI_API_KEY." });
    }

    const { 
        totalRevenue, 
        totalDiscount, 
        totalOrdersWithDiscount, 
        couponUsageData, 
        revenueByCouponData, 
        topCustomers,
        // orders, customers, coupons - giữ nguyên việc truyền từ frontend nhưng không dùng trực tiếp trong prompt nếu quá dài
    } = req.body;

    // Kiểm tra xem có dữ liệu nào được gửi không
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "Không có dữ liệu được cung cấp cho phân tích AI." });
    }

    const promptParts = [
        "Bạn là một chuyên gia phân tích dữ liệu marketing hàng đầu, có khả năng nhìn nhận xu hướng và đề xuất chiến lược hiệu quả. Bạn cần đưa ra các insight sâu sắc, đề xuất các thử nghiệm marketing A/B cụ thể, các ý tưởng chiến dịch marketing sáng tạo, và các chủ đề/nội dung email marketing hấp dẫn.",
        "Phân tích dựa trên các dữ liệu sau đây từ một doanh nghiệp thương mại điện tử:",
        "--- DỮ LIỆU TỔNG QUAN ---",
        `- Tổng doanh thu từ đơn hàng có mã giảm giá: ${totalRevenue} VND.`,
        `- Tổng số đơn hàng có mã giảm giá: ${totalOrdersWithDiscount} đơn.`,
        `- Tổng tiền đã giảm giá cho khách hàng: ${totalDiscount} VND.`,

        "\n--- CHI TIẾT SỬ DỤNG MÃ GIẢM GIÁ (Top Coupon Codes) ---",
        "Đây là danh sách các mã giảm giá và số lượt sử dụng của chúng:",
        "Mã | Số lượt sử dụng",
        "---|----------------",
        ...(couponUsageData && couponUsageData.length > 0 ? 
            couponUsageData.map(item => `${item.name} | ${item['Số lượt sử dụng']}`) : 
            ["Không có dữ liệu sử dụng mã giảm giá."] 
        ),

        "\n--- DOANH THU THEO MÃ GIẢM GIÁ (Revenue by Coupon) ---",
        "Đây là doanh thu được tạo ra bởi từng mã giảm giá:",
        "Mã | Doanh thu",
        "---|-----------",
        ...(revenueByCouponData && revenueByCouponData.length > 0 ? 
            revenueByCouponData.map(item => `${item.name} | ${item.value}`) : 
            ["Không có dữ liệu doanh thu theo mã giảm giá."] 
        ),

        "\n--- KHÁCH HÀNG THÂN THIẾT (Top 5 Customers by Coupon Usage) ---",
        "Đây là 5 khách hàng hàng đầu theo số lượt sử dụng mã giảm giá:",
        "Khách hàng | Lượt dùng mã",
        "------------|-------------",
        ...(topCustomers && topCustomers.length > 0 ? 
            topCustomers.map(item => `${item.name} | ${item.usageCount}`) : 
            ["Không có dữ liệu khách hàng thân thiết."] 
        ),

        "\n--- YÊU CẦU PHÂN TÍCH VÀ ĐỀ XUẤT ---",
        "Dựa trên các dữ liệu trên:",
        "1. Insight từ AI: Đưa ra ít nhất 3-5 insight quan trọng về hiệu quả của các chiến dịch mã giảm giá, hành vi của khách hàng, và các xu hướng đáng chú ý. Hãy tập trung vào những gì dữ liệu ĐANG NÓI và ĐỀ XUẤT tại sao. Sử dụng ngôn ngữ chuyên nghiệp và dễ hiểu. Mỗi insight là một đoạn văn ngắn.",
        "2. Thử nghiệm đề xuất (A/B testing): Đề xuất ít nhất 2 ý tưởng thử nghiệm A/B cụ thể để tối ưu hóa việc sử dụng mã giảm giá hoặc thu hút khách hàng. Mỗi thử nghiệm nên có mục tiêu rõ ràng và các yếu tố cần thử nghiệm.",
        "3. Chiến dịch đề xuất: Đề xuất ít nhất 2 ý tưởng chiến dịch marketing mới, có thể liên quan đến việc sử dụng mã giảm giá hoặc dựa trên insight về khách hàng. Mỗi chiến dịch cần nêu rõ mục tiêu, đối tượng và ý tưởng cốt lõi.",
        "4. Email Marketing đề xuất (chủ đề và nội dung chính): Đề xuất ít nhất 2 chủ đề email marketing hấp dẫn và nội dung chính cho mỗi email, dựa trên các insight hoặc đề xuất chiến dịch.",
        "\n",
        "Hãy trình bày kết quả theo định dạng CÓ CẤU TRÚC sau:",
        "Insight từ AI:",
        "<Insight 1.>",
        "<Insight 2.>",
        "<Insight 3.>",
        "\nThử nghiệm đề xuất:",
        "- <Thử nghiệm A>",
        "- <Thử nghiệm B>",
        "\nChiến dịch đề xuất:",
        "- <Chiến dịch A>",
        "- <Chiến dịch B>",
        "\nEmail Marketing đề xuất:",
        "- <Chủ đề Email A: Nội dung chính>",
        "- <Chủ đề Email B: Nội dung chính>",
        "\n",
        "Nếu dữ liệu quá ít hoặc không có để tạo insight cụ thể, hãy nêu rõ điều đó và đưa ra các đề xuất chung chung hơn hoặc các câu hỏi cần đặt ra để thu thập thêm dữ liệu.",
        "Đảm bảo không bỏ trống bất kỳ phần nào nếu có thể."
    ];

    try {
        const result = await model.generateContent(promptParts);
        const response = await result.response;
        const textResponse = response.text();

        console.log('Phản hồi RAW từ Gemini:', textResponse); 

        let insights = "";
        let experiments = [];
        let campaigns = [];
        let emails = [];

        if (textResponse) {
            const sectionHeaders = [
                "Insight từ AI:",
                "Thử nghiệm đề xuất:",
                "Chiến dịch đề xuất:",
                "Email Marketing đề xuất:"
            ];

            const sectionsRegex = new RegExp(`(${sectionHeaders.join('|')})`, 'g');
            const rawSections = textResponse.split(sectionsRegex).map(s => s.trim()).filter(s => s !== '');

            let currentSectionKey = '';
            for (const part of rawSections) { // Sửa lỗi ở đây, không cần i và nhảy qua part
                if (sectionHeaders.includes(part)) {
                    currentSectionKey = part;
                } else {
                    const content = part.trim();
                    if (content === '') continue;

                    switch (currentSectionKey) {
                        case 'Insight từ AI:':
                            let cleanedInsights = content.split('\n')
                                .filter(line => line.trim() !== '' && !line.includes('**Lưu ý:**') && !line.includes('Tuyệt vời!') && !line.includes('Dưới đây là phân tích chi tiết,'))
                                .map(line => line.replace(/^(\*+\s*|\d+\.\s*|Insight \d+\:\s*)/gm, '').trim())
                                .join('\n')
                                .trim();
                            insights = cleanedInsights;
                            break;
                        case 'Thử nghiệm đề xuất:':
                            experiments = content.split('\n')
                                .map(line => line.trim())
                                .filter(line => line.startsWith('*') || line.startsWith('- ') || line.startsWith('**') || line.match(/^\d+\.\s*/))
                                .map(line => line.replace(/^(\*+\s*|\-\s*|\d+\.\s*)/, '').trim());
                            break;
                        case 'Chiến dịch đề xuất:':
                            campaigns = content.split('\n')
                                .map(line => line.trim())
                                .filter(line => line.startsWith('*') || line.startsWith('- ') || line.startsWith('**') || line.match(/^\d+\.\s*/))
                                .map(line => line.replace(/^(\*+\s*|\-\s*|\d+\.\s*)/, '').trim());
                            break;
                        case 'Email Marketing đề xuất:':
                            emails = content.split('\n')
                                .map(line => line.trim())
                                .filter(line => line.startsWith('*') || line.startsWith('- ') || line.startsWith('**') || line.match(/^\d+\.\s*/))
                                .map(line => line.replace(/^(\*+\s*|\-\s*|\d+\.\s*)/, '').trim());
                            break;
                    }
                    // currentSectionKey = ''; // BỎ DÒNG NÀY, để nó xử lý các dòng tiếp theo nếu chúng cùng một section
                }
            }
        } // <-- DÒNG NÀY ĐÃ ĐƯỢC XÓA! Đây là dấu ')' bị thừa!
        
        console.log('Parsed results before sending to frontend:', {
            insights: insights,
            experiments: experiments,
            campaigns: campaigns, 
            emails: emails       
        });

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
);


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
