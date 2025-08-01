async function analyzeOverallBusiness(req, res) {
  console.log('🤖 [Master AI] Nhận được yêu cầu phân tích toàn diện...');
  try {
    // --- Bước 1: Lấy TOÀN BỘ dữ liệu cần thiết ---
    const [
        latestReport, 
        settings, 
        upcomingEvents, 
        recentOrders,
        allProducts,
        allCoupons,
        allCustomers,
        abandonedCheckouts
    ] = await Promise.all([
        DailyReport.findOne().sort({ report_date: -1 }),
        BusinessSettings.findOne({ shop_id: 'main_settings' }),
        FinancialEvent.find({ due_date: { $gte: new Date() }, is_paid: false }).sort({ due_date: 1 }),
        Order.find({ created_at_haravan: { $gte: new Date(new Date() - 30*24*60*60*1000) } }),
        Product.find({}),
        Coupon.find({}),
        Customer.find({}).sort({ total_spent: -1 }),
        AbandonedCheckout.find({ created_at_haravan: { $gte: new Date(new Date() - 7*24*60*60*1000) } }) // Lấy giỏ hàng bị bỏ quên trong 7 ngày
    ]);

    if (!latestReport) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo nào để phân tích. Vui lòng nhập báo cáo cuối ngày trước.' });
    }

    // --- Bước 2: Xử lý và tổng hợp dữ liệu chi tiết cho prompt ---
    const reportDate = new Date(latestReport.report_date);
    const nextDay = new Date(reportDate);
    nextDay.setDate(reportDate.getDate() + 1);
    const todaysOrders = recentOrders.filter(o => new Date(o.created_at_haravan) >= reportDate && new Date(o.created_at_haravan) < nextDay);

    const todaysTopProducts = {};
    const todaysUsedCoupons = {};
    todaysOrders.forEach(order => {
        order.line_items.forEach(item => {
            todaysTopProducts[item.title] = (todaysTopProducts[item.title] || 0) + item.quantity;
        });
        order.discount_codes.forEach(coupon => {
            if (coupon && coupon.code) {
                todaysUsedCoupons[coupon.code] = (todaysUsedCoupons[coupon.code] || 0) + 1;
            }
        });
    });

    const lowStockProducts = allProducts
        .filter(p => p.variants.some(v => v.inventory_quantity > 0 && v.inventory_quantity <= 5))
        .map(p => p.title)
        .slice(0, 5);
    
    const soldProductIds = new Set(recentOrders.flatMap(o => o.line_items.map(li => li.product_id)));
    const slowSellers = allProducts
        .filter(p => !soldProductIds.has(p.id) && p.variants.some(v => v.inventory_quantity > 0))
        .map(p => p.title)
        .slice(0, 5);

    // --- Bước 3: Tạo một PROMPT CHUYÊN SÂU cho AI ---
    const prompt = `
      Là một Giám đốc Vận hành (COO) và Giám đốc Marketing (CMO) ảo, hãy phân tích toàn diện dữ liệu của một cửa hàng bán đồ anime và trả về một đối tượng JSON.
      
      **Dữ liệu Tài chính & Kinh doanh (Từ báo cáo của chủ shop):**
      - Báo cáo hôm nay: Doanh thu ${latestReport.total_revenue.toLocaleString('vi-VN')}đ, Lợi nhuận ${latestReport.total_profit.toLocaleString('vi-VN')}đ.
      - Chi phí cố định tháng: ${((settings?.monthly_rent_cost || 0) + (settings?.monthly_staff_cost || 0) + (settings?.monthly_marketing_cost || 0) + (settings?.monthly_other_cost || 0)).toLocaleString('vi-VN')}đ.
      - Mục tiêu lợi nhuận tháng: ${(settings?.monthly_profit_target || 0).toLocaleString('vi-VN')}đ.
      - Sự kiện chi tiền lớn sắp tới: ${JSON.stringify(upcomingEvents.map(e => ({name: e.event_name, amount: e.amount, due_date: e.due_date.toLocaleDateString('vi-VN')}))) }.

      **Dữ liệu Vận hành & Tồn kho (Từ hệ thống):**
      - Top sản phẩm bán chạy nhất HÔM NAY: ${JSON.stringify(Object.entries(todaysTopProducts).sort((a, b) => b[1] - a[1]).slice(0, 5))}.
      - Các mã giảm giá đã được sử dụng HÔM NAY: ${JSON.stringify(todaysUsedCoupons)}.
      - Top 5 sản phẩm sắp hết hàng (tồn kho <= 5): ${JSON.stringify(lowStockProducts)}.
      - Top 5 sản phẩm bán chậm (không bán được trong 30 ngày qua): ${JSON.stringify(slowSellers)}.

      **Dữ liệu Khuyến mãi & Khách hàng (Từ hệ thống):**
      - Tổng số mã giảm giá đang có: ${allCoupons.length}.
      - Top 5 khách hàng chi tiêu nhiều nhất (VIP): ${JSON.stringify(allCustomers.slice(0, 5).map(c => ({name: c.first_name + ' ' + c.last_name, total_spent: c.total_spent})))}.
      - Số lượng giỏ hàng bị bỏ quên trong 7 ngày qua: ${abandonedCheckouts.length}.

      **YÊU CẦU PHÂN TÍCH CHUYÊN SÂU:**
      Dựa vào TOÀN BỘ dữ liệu trên, hãy đưa ra:
      1.  **alerts**: Một mảng các cảnh báo quan trọng nhất (tối đa 2). Mỗi cảnh báo là một object có 'type' ('warning' hoặc 'info') và 'message'. **Ưu tiên cảnh báo về DÒNG TIỀN và các SẢN PHẨM BÁN CHẬM.**
      2.  **insights**: Một mảng gồm 3 nhận định sâu sắc. **Hãy tìm mối liên hệ giữa các bộ dữ liệu**, ví dụ: "Sản phẩm X bán chạy nhất hôm nay, nhưng không có khách hàng VIP nào mua nó, cho thấy tiềm năng marketing đến nhóm khách hàng này." hoặc "Tỷ lệ bỏ quên giỏ hàng cao, có thể do mã giảm giá chưa đủ hấp dẫn."
      3.  **action_plan**: Một mảng gồm 3 đề xuất hành động **cụ thể và có thể thực hiện ngay** cho ngày mai. Các đề xuất phải **bám sát vào dữ liệu**, ví dụ: "Nhập thêm 50 sản phẩm '[Tên sản phẩm]' vì tồn kho chỉ còn 3 và là sản phẩm bán chạy nhất hôm nay." hoặc "Tạo chiến dịch xả hàng cho '[Tên sản phẩm]' bằng cách tạo mã giảm giá 'CLEARANCE20' giảm 20% vì nó không bán được trong 30 ngày."

      **Cấu trúc JSON trả về phải là:**
      {
        "alerts": [ { "type": "warning", "message": "Cảnh báo về dòng tiền hoặc tồn kho." } ],
        "insights": [ "Nhận định sâu sắc 1.", "Nhận định sâu sắc 2.", "Nhận định sâu sắc 3." ],
        "action_plan": [
          { "action": "Tiêu đề hành động 1", "details": "Mô tả chi tiết hành động 1, có chứa tên sản phẩm hoặc mã giảm giá cụ thể." },
          { "action": "Tiêu đề hành động 2", "details": "Mô tả chi tiết hành động 2." },
          { "action": "Tiêu đề hành động 3", "details": "Mô tả chi tiết hành động 3." }
        ]
      }
    `;

    const analysisResultText = await geminiService.getAnalysisFromAI(prompt);
    const jsonString = analysisResultText.replace(/```json\n|```/g, '').trim();
    const analysisResultJson = JSON.parse(jsonString);
    res.status(200).json(analysisResultJson);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình phân tích toàn diện:', error);
    res.status(500).json({ message: 'Lỗi trong quá trình phân tích toàn diện.', error: error.message });
  }
}
