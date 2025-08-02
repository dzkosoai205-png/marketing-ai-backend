// ==========================================================
// File: controllers/social.controller.js
// PHIÊN BẢN NÂNG CẤP: Thêm chức năng tạo kịch bản video TikTok.
// ==========================================================

const geminiService = require('../services/gemini.service');
const Product = require('../models/product.model');

/**
 * Controller để tạo caption quảng cáo cho một sản phẩm.
 */
async function generateCaptions(req, res) {
  const { productName, reason } = req.body;

  if (!productName) {
    return res.status(400).json({ message: 'Tên sản phẩm là bắt buộc.' });
  }

  console.log(`✍️ [AI] Nhận được yêu cầu viết caption cho sản phẩm: ${productName}`);

  try {
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
      - Viết 3 caption với các phong cách khác nhau (hài hước, kêu gọi hành động, kể chuyện).
      - Mỗi caption phải có các hashtag liên quan (#anime, #[tên_anime]...).
      - Trả về kết quả dưới dạng một đối tượng JSON có key là "captions", giá trị là một mảng (array) chứa 3 chuỗi (string) caption.
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


// ==========================================================
// ✨ HÀM MỚI: TẠO KỊCH BẢN TIKTOK
// ==========================================================
/**
 * Controller để tạo kịch bản video TikTok.
 */
async function generateScripts(req, res) {
    const { topic } = req.body; // Nhận chủ đề từ frontend

    if (!topic) {
        return res.status(400).json({ message: 'Chủ đề là bắt buộc.' });
    }

    console.log(`🎬 [AI] Nhận được yêu cầu viết kịch bản TikTok cho chủ đề: ${topic}`);

    try {
        const prompt = `
            Bạn là một nhà sáng tạo nội dung TikTok chuyên về review và unbox đồ anime, với hàng triệu lượt xem.
            Nhiệm vụ của bạn là viết 3 ý tưởng kịch bản video ngắn (15-30 giây) cho chủ đề sau: "${topic}".

            **Yêu cầu:**
            - Mỗi kịch bản phải có cấu trúc rõ ràng: Cảnh 1, Cảnh 2, Cảnh 3.
            - Với mỗi kịch bản, hãy đề xuất:
                - **Nhạc nền (Music):** Tên một bài hát hoặc loại nhạc đang trend, phù hợp với video.
                - **Văn bản trên màn hình (On-screen Text):** Các dòng chữ ngắn gọn, hấp dẫn xuất hiện trong video.
            - Các kịch bản phải theo các phong cách khác nhau: một kịch bản unbox ASMR, một kịch bản theo trend hài hước, và một kịch bản cinematic khoe vẻ đẹp sản phẩm.
            - Trả về kết quả dưới dạng một đối tượng JSON có key là "scripts", giá trị là một mảng chứa 3 object kịch bản.

            **Ví dụ cấu trúc JSON trả về:**
            {
                "scripts": [
                    {
                        "title": "Kịch bản 1: Unbox ASMR",
                        "scenes": [
                            "Cảnh 1: Quay cận cảnh tay đang từ từ mở hộp sản phẩm, tập trung vào âm thanh xé giấy, mở seal.",
                            "Cảnh 2: Lấy sản phẩm ra, quay chậm 360 độ để khoe chi tiết.",
                            "Cảnh 3: Đặt sản phẩm lên bàn trưng bày, kết thúc bằng hình ảnh sản phẩm hoàn hảo."
                        ],
                        "music": "Âm thanh ASMR tự nhiên, không nhạc nền",
                        "on_screen_text": ["Finally here!", "OMG so detailed!", "Must-have item!"]
                    },
                    {
                        "title": "Kịch bản 2: Trend Hài hước",
                        "scenes": ["..."],
                        "music": "Nhạc nền hot trend trên TikTok",
                        "on_screen_text": ["..."]
                    }
                ]
            }
        `;

        const resultText = await geminiService.getAnalysisFromAI(prompt);
        // Xử lý để lấy khối JSON một cách an toàn
        const match = resultText.match(/```json\n([\s\S]*?)\n```/);
        if (!match || !match[1]) {
            throw new Error("AI không trả về định dạng JSON hợp lệ.");
        }
        const jsonString = match[1].trim();
        const resultJson = JSON.parse(jsonString);

        console.log(`✅ [AI] Đã tạo thành công kịch bản TikTok cho: ${topic}`);
        res.status(200).json(resultJson);

    } catch (error) {
        console.error('❌ Lỗi khi tạo kịch bản TikTok:', error);
        res.status(500).json({ message: 'Lỗi khi tạo kịch bản TikTok.', error: error.message });
    }
}


module.exports = {
  generateCaptions,
  generateScripts // ✨ Xuất hàm mới
};
