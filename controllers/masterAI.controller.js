// controllers/masterAI.controller.js

// ... (các phần import, GEMINI_API_KEY, getProductCategorization, analyzeOverallBusiness giữ nguyên) ...

// =========================================================================
// SỬA LỖI: handleChat để đảm bảo lịch sử bắt đầu với 'user'
// =========================================================================
async function handleChat(req, res) {
    console.log('💬 [AI Chat] Nhận được tin nhắn mới...');
    if (!geminiModelInstance) {
        return res.status(503).json({ message: "Dịch vụ AI không khả dụng. Vui lòng kiểm tra cấu hình GEMINI_API_KEY." });
    }

    const { sessionId, message, initialContext } = req.body;

    if (!sessionId || !message) {
        return res.status(400).json({ message: "Thiếu sessionId hoặc tin nhắn." });
    }

    try {
        let chatSessionDoc = await ChatSession.findOne({ sessionId });
        let history = [];

        if (chatSessionDoc) {
            history = chatSessionDoc.history;
            console.log(`💬 [AI Chat] Đã tải lịch sử cho session ${sessionId} (${history.length} tin nhắn).`);
        } else {
            // Nếu là phiên mới, và có initialContext (kết quả phân tích Master AI)
            if (initialContext) {
                // THAY ĐỔI QUAN TRỌNG Ở ĐÂY:
                // Thêm một tin nhắn giả lập từ 'user' trước context của 'model'
                // để tuân thủ quy tắc của Gemini API (bắt đầu bằng user)
                history.push({
                    role: 'user', 
                    parts: [{ text: 'Chào AI, tôi vừa nhận được một bản phân tích kinh doanh. Bạn có thể cho tôi biết thêm chi tiết về nó không?' }]
                });
                history.push({
                    role: 'model', 
                    parts: [{ text: `Chào bạn! Dưới đây là bản phân tích mà tôi đã tạo: \n\`\`\`json\n${JSON.stringify(initialContext, null, 2)}\n\`\`\`\n` }]
                });
                console.log(`💬 [AI Chat] Tạo session mới ${sessionId} với context ban đầu đã chỉnh sửa.`);
            } else {
                console.log(`💬 [AI Chat] Tạo session mới ${sessionId} (không có context ban đầu).`);
            }
            chatSessionDoc = new ChatSession({ sessionId, history });
        }
        
        const chat = geminiModelInstance.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 2048, 
            },
        });

        // 3. Gửi tin nhắn của người dùng và nhận phản hồi
        const result = await chat.sendMessage(message);
        const modelResponseText = result.response.text();

        // 4. Cập nhật lịch sử chat và lưu vào DB
        chatSessionDoc.history.push({ role: 'user', parts: [{ text: message }] });
        chatSessionDoc.history.push({ role: 'model', parts: [{ text: modelResponseText }] });
        chatSessionDoc.lastActivity = new Date(); 
        await chatSessionDoc.save();

        console.log(`💬 [AI Chat] Trả lời cho session ${sessionId}: ${modelResponseText.substring(0, 50)}...`);
        res.status(200).json({ response: modelResponseText, sessionId: sessionId });

    } catch (error) {
        console.error('❌ [AI Chat] Lỗi xử lý chat:', error);
        res.status(500).json({ message: "Lỗi trong quá trình xử lý chat AI.", error: error.message, sessionId: sessionId });
    }
}


// Export tất cả các hàm để có thể sử dụng trong router
module.exports = {
    analyzeOverallBusiness,
    handleChat 
};
