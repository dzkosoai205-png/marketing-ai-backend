// ==========================================================
// File: models/chatSession.model.js
// Nhiệm vụ: Định nghĩa cấu trúc cho lịch sử phiên trò chuyện với AI.
// ==========================================================

const mongoose = require('mongoose');

// Schema cho một tin nhắn trong lịch sử chat
// Dựa trên định dạng của Gemini.GenerativeModel.startChat({ history: [...] })
const ChatMessagePartSchema = new mongoose.Schema({
    text: { type: String }
}, { _id: false });

const ChatMessageSchema = new mongoose.Schema({
    role: { type: String, required: true }, // 'user' hoặc 'model'
    parts: [ChatMessagePartSchema] // Nội dung tin nhắn
}, { _id: false });


const ChatSessionSchema = new mongoose.Schema({
    // Sử dụng một ID duy nhất cho phiên chat (có thể là ID người dùng hoặc một UUID ngẫu nhiên)
    sessionId: { type: String, required: true, unique: true }, 
    
    // Lịch sử cuộc trò chuyện
    history: [ChatMessageSchema],

    // Thời gian tạo và cập nhật phiên
    lastActivity: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }

}, {
    timestamps: true // Tự động thêm `createdAt` và `updatedAt`
});

const ChatSession = mongoose.model('ChatSession', ChatSessionSchema);
module.exports = ChatSession;