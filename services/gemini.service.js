// ==========================================================
// File: services/gemini.service.js
// Nhiệm vụ: Chứa logic kết nối và giao tiếp với Gemini API.
// ==========================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Lấy API key từ biến môi trường
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Gửi một prompt đến Gemini và nhận lại phân tích.
 * @param {string} prompt - Câu lệnh chi tiết chứa dữ liệu cần phân tích.
 * @returns {Promise<string>} Văn bản phân tích từ AI.
 */
async function getAnalysisFromAI(prompt) {
  try {
    // Chọn model, gemini-1.5-flash là một lựa chọn tốt về tốc độ và hiệu quả
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash"});

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log("✅ Gemini đã trả về phân tích.");
    return text;
  } catch (error) {
    console.error("❌ Lỗi khi giao tiếp với Gemini API:", error);
    throw new Error("Không thể nhận phân tích từ AI.");
  }
}

module.exports = {
  getAnalysisFromAI
};
