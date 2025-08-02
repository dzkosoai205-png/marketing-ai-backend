// ==========================================================
// File: controllers/social.controller.js
// Nhiệm vụ: Chứa logic sáng tạo nội dung social media bằng AI.
// ==========================================================

const geminiService = require('../services/gemini.service');
const Product = require('../models/product.model');

/**
 * Controller để tạo caption quảng cáo cho một sản phẩm.
 */
async function generateCaptions(req, res) {
  // Lấy tên sản phẩm và lý do từ request của frontend
  const { productName, reason } = req.body;

  if (!productName) {
    return res.status(400).json({ message: 'Tên sản phẩm là bắt buộc.' });
  }

  console.log(`✍️ [AI] Nhận được yêu cầu viết caption cho sản phẩm: ${productName}`);

  try {
    // Tìm thông tin chi tiết của sản phẩm trong database để prompt được tốt hơn
    const product = await Product.findOne({ title: productName });

    const prompt = `
      Là một chuyên gia viết nội dung quảng cáo cho một cửa hàng bán đồ anime, hãy viết 3 caption Facebook hấp dẫn để quảng cáo cho sản phẩm sau.
      
      **Thông tin sản phẩm:**
      - Tên sản phẩm: ${productName}
      - Loại sản phẩm: ${product ? product.product_type : 'Không rõ'}
      - Tags: ${product ? product.tags : 'Không rõ'}

      **Bối cảnh / Lý do quảng cáo:**
      - ${reason || `Tăng doanh số cho sản phẩm ${productName}.`}

      **Yêu cầu:**
      - Viết 3 caption với các phong cách khác nhau (ví dụ: hài hước, kêu gọi hành động mạnh mẽ, kể chuyện).
      - Mỗi caption phải có các hashtag liên quan (#anime, #manga, #[tên_anime]...).
      - Trả về kết quả dưới dạng một đối tượng JSON có key là "captions", giá trị là một mảng (array) chứa 3 chuỗi (string) caption.
      
      Ví dụ cấu trúc JSON trả về:
      {
        "captions": [
          "Caption 1...",
          "Caption 2...",
          "Caption 3..."
        ]
      }
    `;

    const resultText = await geminiService.getAnalysisFromAI(prompt);
    const jsonString = resultText.replace(/```json\n|```/g, '').trim();
    const resultJson = JSON.parse(jsonString);

    console.log(`✅ [AI] Đã tạo thành công caption cho: ${productName}`);
    res.status(200).json(resultJson);

  } catch (error) {
    console.error('❌ Lỗi khi tạo caption:', error);
    res.status(500).json({ message: 'Lỗi khi tạo caption.', error: error.message });
  }
}

module.exports = {
  generateCaptions
};
