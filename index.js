// ... (các import và middleware) ...

// ==========================================================
// CẬP NHẬT CUỐI CÙNG: Logic Parsing Phản hồi Gemini MẠNH MẼ VÀ LINH HOẠT HƠN
// ==========================================================
// ... (phần code trên, bao gồm promptParts, giữ nguyên) ...

try {
    const result = await model.generateContent(promptParts);
    const response = await result.response;
    const textResponse = response.text();

    // LOG NỘI DUNG RAW TỪ GEMINI (VẪN CẦN THIẾT ĐỂ DEBUG)
    console.log('Phản hồi RAW từ Gemini:', textResponse); 

    let insights = "";
    let experiments = [];
    let campaigns = [];
    let emails = [];

    // --- LOGIC PARSING HOÀN TOÀN MỚI ---
    if (textResponse) {
        // Định nghĩa các tiêu đề sections (đảm bảo khớp với prompt)
        const sectionHeaders = [
            "Insight từ AI:",
            "Thử nghiệm đề xuất:",
            "Chiến dịch đề xuất:",
            "Email Marketing đề xuất:"
        ];

        // Tạo một regex để chia chuỗi dựa trên các tiêu đề này
        // Sử dụng lookahead để giữ lại tiêu đề trong kết quả split
        const sectionsRegex = new RegExp(`(${sectionHeaders.join('|')})`, 'g');
        const rawSections = textResponse.split(sectionsRegex).map(s => s.trim()).filter(s => s !== '');

        let currentSectionKey = '';
        for (const part of rawSections) {
            if (sectionHeaders.includes(part)) {
                // Đây là một tiêu đề section
                if (part === "Insight từ AI:") currentSectionKey = 'insights';
                else if (part === "Thử nghiệm đề xuất:") currentSectionKey = 'experiments';
                else if (part === "Chiến dịch đề xuất:") currentSectionKey = 'campaigns';
                else if (part === "Email Marketing đề xuất:") currentSectionKey = 'emails';
            } else {
                // Đây là nội dung của section hiện tại
                const content = part.trim();
                if (content === '') continue; // Bỏ qua nội dung rỗng

                switch (currentSectionKey) {
                    case 'insights':
                        // Xử lý dòng chào đầu và các dấu đầu dòng
                        let cleanedInsights = content.split('\n')
                            .filter(line => line.trim() !== '' && !line.includes('**Lưu ý:**') && !line.includes('Tuyệt vời!'))
                            .map(line => line.replace(/^(\*+\s*|\d+\.\s*|Insight \d+\:\s*)/gm, '').trim()) // Loại bỏ *, **, số thứ tự, "Insight X:"
                            .join('\n')
                            .trim();
                        // Nếu có dòng chào đầu mà chưa bị lọc, hãy bỏ nó
                        if (cleanedInsights.startsWith('Dưới đây là phân tích chi tiết,')) {
                            cleanedInsights = cleanedInsights.substring(cleanedInsights.indexOf('\n') + 1).trim();
                        }
                        insights = cleanedInsights;
                        break;
                    case 'experiments':
                    case 'campaigns':
                    case 'emails':
                        // Đối với các phần danh sách, chia thành từng dòng
                        const items = content.split('\n')
                            .map(line => line.trim())
                            .filter(line => line.startsWith('*') || line.startsWith('- ') || line.startsWith('**') || line.match(/^\d+\.\s*/)) // Chấp nhận cả số thứ tự
                            .map(line => line.replace(/^(\*+\s*|\-\s*|\d+\.\s*)/, '').trim()); // Loại bỏ *,-,**, số thứ tự
                        
                        if (currentSectionKey === 'experiments') experiments = items;
                        else if (currentSectionKey === 'campaigns') campaigns = items;
                        else if (currentSectionKey === 'emails') emails = items;
                        break;
                }
            }
        }
    }
    // --- KẾT THÚC LOGIC PARSING HOÀN TOÀN MỚI ---
    
    // LOG CÁC BIẾN ĐÃ PARSE TRƯỚC KHI GỬI ĐẾN FRONTEND (RẤT QUAN TRỌNG ĐỂ DEBUG)
    console.log('Parsed results before sending to frontend:', {
        insights: insights,
        experiments: experiments,
        campaigns: campaigns, 
        emails: emails       
    });

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
// ... (phần còn lại của file index.js giữ nguyên) ...
