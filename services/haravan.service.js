// ==========================================================
// File: services/haravan.service.js
// Phiên bản này chứa đầy đủ tất cả các hàm cần thiết.
// ==========================================================

const axios = require('axios');

// Hàm chung để xử lý logic phân trang, tránh lặp lại code
async function fetchAllPages(endpoint) {
  const accessToken = process.env.HARAVAN_ACCESS_TOKEN;
  const shopDomain = process.env.HARAVAN_SHOP_DOMAIN;

  if (!accessToken || !shopDomain) {
    throw new Error('HARAVAN_ACCESS_TOKEN và HARAVAN_SHOP_DOMAIN phải được cấu hình trong file .env');
  }

  let allResults = [];
  let page = 1;
  const limit = 250;

  while (true) {
    const apiUrl = `https://${shopDomain}/admin/${endpoint}?limit=${limit}&page=${page}`;
    console.log(`- Đang lấy dữ liệu từ: ${endpoint}, trang ${page}...`);

    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const resourceKey = endpoint.split('.')[0].split('?')[0];
    const resultsOnPage = response.data[resourceKey];

    if (resultsOnPage && resultsOnPage.length > 0) {
      allResults = allResults.concat(resultsOnPage);
      page++;
    } else {
      break; 
    }
  }
   
  console.log(`✅ Đã lấy tổng cộng ${allResults.length} mục từ ${endpoint}.`);
  return allResults;
}

// Hàm lấy TOÀN BỘ danh sách mã giảm giá
async function getDiscountCodes() {
  try {
    const accessToken = process.env.HARAVAN_ACCESS_TOKEN;
    const shopDomain = process.env.HARAVAN_SHOP_DOMAIN;
    const apiUrl = `https://${shopDomain}/admin/discounts.json`;
    const response = await axios.get(apiUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    return response.data.discounts || [];
  } catch (error) {
    console.error('Lỗi chi tiết khi gọi Haravan API (getDiscountCodes):', error.response ? JSON.stringify(error.response.data) : error.message);
    throw new Error('Không thể lấy dữ liệu mã giảm giá từ Haravan.');
  }
}

// Hàm lấy TOÀN BỘ danh sách đơn hàng
async function getOrders() {
  try {
    return await fetchAllPages('orders.json?status=any');
  } catch (error) {
    console.error('Lỗi chi tiết khi gọi Haravan API (getOrders):', error.response ? JSON.stringify(error.response.data) : error.message);
    throw new Error('Không thể lấy dữ liệu đơn hàng từ Haravan.');
  }
}

// Hàm lấy TOÀN BỘ danh sách khách hàng
async function getCustomers() {
  try {
    return await fetchAllPages('customers.json');
  } catch (error) {
    console.error('Lỗi chi tiết khi gọi Haravan API (getCustomers):', error.response ? JSON.stringify(error.response.data) : error.message);
    throw new Error('Không thể lấy dữ liệu khách hàng từ Haravan.');
  }
}

// Hàm lấy TOÀN BỘ danh sách sản phẩm
async function getProducts() {
  try {
    return await fetchAllPages('products.json');
  } catch (error) {
    console.error('Lỗi chi tiết khi gọi Haravan API (getProducts):', error.response ? JSON.stringify(error.response.data) : error.message);
    throw new Error('Không thể lấy dữ liệu sản phẩm từ Haravan.');
  }
}

// Hàm TẠO một mã giảm giá mới
async function createDiscountCode(couponData) {
  const accessToken = process.env.HARAVAN_ACCESS_TOKEN;
  const shopDomain = process.env.HARAVAN_SHOP_DOMAIN;

  if (!accessToken || !shopDomain) {
    throw new Error('HARAVAN_ACCESS_TOKEN và HARAVAN_SHOP_DOMAIN phải được cấu hình trong file .env');
  }

  const apiUrl = `https://${shopDomain}/admin/discounts.json`;

  try {
    const response = await axios.post(
      apiUrl,
      { discount: couponData },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.discount;
  } catch (error) {
    console.error('Lỗi chi tiết khi tạo mã giảm giá trên Haravan:');
    if (error.response) {
      console.error(' - Status Code:', error.response.status);
      console.error(' - Response Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(' - Error Message:', error.message);
    }
    throw new Error('Không thể tạo mã giảm giá trên Haravan.');
  }
}

// ==========================================================
// THAY ĐỔI: Các hàm mới để lấy Smart Collections
// ==========================================================
async function getSmartCollections() { // Đổi tên từ getCustomCollections
  try {
    return await fetchAllPages('smart_collections.json'); // Đổi endpoint
  } catch (error) {
    console.error('Lỗi chi tiết khi gọi Haravan API (getSmartCollections):', error.response ? JSON.stringify(error.response.data) : error.message);
    throw new Error('Không thể lấy dữ liệu Smart Collections từ Haravan.');
  }
}

// XÓA: Hàm getCollects() vì không cần cho Smart Collections
// exports.getCollects = async () => { ... }

// Xuất tất cả các hàm ra để file khác có thể sử dụng
module.exports = {
  getDiscountCodes,
  getOrders,
  getCustomers,
  getProducts,
  createDiscountCode,
  getSmartCollections, // <-- Cập nhật tên hàm
};