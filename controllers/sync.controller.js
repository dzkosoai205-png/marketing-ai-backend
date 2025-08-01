// ==========================================================
// File: controllers/sync.controller.js (ĐÃ SỬA LỖI ĐỂ ĐỒNG BỘ SMART COLLECTIONS)
// Nhiệm vụ: Chứa logic chính để đồng bộ dữ liệu từ Haravan về MongoDB.
// ==========================================================

const haravanService = require('../services/haravan.service');
const Product = require('../models/product.model');
const HaravanCollection = require('../models/haravanCollection.model'); // Model cho Collections (Giờ là Smart Collection)
const Coupon = require('../models/coupon.model'); 
const Order = require('../models/order.model'); 
const Customer = require('../models/customer.model'); 

// THÊM: Import date-fns-tz
const { utcToZonedTime, format } = require('date-fns-tz'); 

// THÊM: Định nghĩa múi giờ cửa hàng (PHẢI TRÙNG VỚI HARAVAN)
const STORE_TIMEZONE = process.env.STORE_TIMEZONE || 'Asia/Ho_Chi_Minh'; // Ví dụ cho Việt Nam (GMT+7)

// Hàm trợ giúp để kiểm tra xem một sản phẩm có khớp với quy tắc của Smart Collection không
const matchesRule = (product, rule) => {
    const { column, relation, condition } = rule;
    let productValue;

    switch (column) {
        case 'title':
            productValue = product.title;
            break;
        case 'product_type':
            productValue = product.product_type;
            break;
        case 'vendor':
            productValue = product.vendor;
            break;
        case 'tag':
            // Rule có thể là 'tag' (string) và product.tags cũng là string.
            // Cần chuyển tags của sản phẩm thành mảng để kiểm tra khớp
            productValue = product.tags ? product.tags.split(',').map(tag => tag.trim()) : [];
            break;
        case 'variant_title':
            productValue = product.variants.map(v => v.title).join(', '); 
            break;
        case 'price':
            // Để đơn giản, lấy giá của variant đầu tiên hoặc giá trung bình
            productValue = product.variants.length > 0 ? product.variants[0].price : 0; 
            break;
        case 'compare_at_price':
            productValue = product.variants.length > 0 ? product.variants[0].compare_at_price : 0;
            break;
        case 'variant_weight': // Nếu có variant.grams
            productValue = product.variants.length > 0 ? product.variants[0].grams : 0;
            break;
        case 'inventory_quantity': // Nếu có variant.inventory_quantity
            productValue = product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
            break;
        default:
            console.warn(`⚠️ [Sync] Quy tắc không xác định trong Smart Collection: ${column}`);
            return false;
    }

    if (productValue === undefined || productValue === null) {
        return false;
    }

    const conditionValue = String(condition).toLowerCase(); // Đảm bảo condition là chuỗi
    let isMatch = false;

    // Xử lý các kiểu quan hệ
    switch (relation) {
        case 'equals':
            if (column === 'tag') {
                isMatch = productValue.includes(conditionValue);
            } else if (column === 'price' || column === 'compare_at_price' || column === 'inventory_quantity' || column === 'variant_weight') {
                isMatch = parseFloat(productValue) === parseFloat(conditionValue);
            } else {
                isMatch = String(productValue).toLowerCase() === conditionValue;
            }
            break;
        case 'not_equals':
            if (column === 'tag') {
                isMatch = !productValue.includes(conditionValue);
            } else if (column === 'price' || column === 'compare_at_price' || column === 'inventory_quantity' || column === 'variant_weight') {
                isMatch = parseFloat(productValue) !== parseFloat(conditionValue);
            } else {
                isMatch = String(productValue).toLowerCase() !== conditionValue;
            }
            break;
        case 'contains':
            if (column === 'tag') {
                isMatch = productValue.some(tag => tag.includes(conditionValue));
            } else {
                isMatch = String(productValue).toLowerCase().includes(conditionValue);
            }
            break;
        case 'not_contains':
            if (column === 'tag') {
                isMatch = !productValue.some(tag => tag.includes(conditionValue));
            } else {
                isMatch = !String(productValue).toLowerCase().includes(conditionValue);
            }
            break;
        case 'starts_with':
            isMatch = String(productValue).toLowerCase().startsWith(conditionValue);
            break;
        case 'ends_with':
            isMatch = String(productValue).toLowerCase().endsWith(conditionValue);
            break;
        case 'greater_than':
            isMatch = parseFloat(productValue) > parseFloat(conditionValue);
            break;
        case 'less_than':
            isMatch = parseFloat(productValue) < parseFloat(conditionValue);
            break;
        default:
            console.warn(`⚠️ [Sync] Quan hệ quy tắc không xác định: ${relation}`);
            return false;
    }
    return isMatch;
};

async function syncAllData(req, res) {
    console.log('🔄 Bắt đầu quá trình đồng bộ dữ liệu...');
    try {
        const [
            couponsFromHaravan, 
            ordersFromHaravan, 
            customersFromHaravan,
            productsFromHaravan,
            smartCollectionsFromHaravan // <-- CẬP NHẬT: Chỉ lấy Smart Collections
            // XÓA: collectsFromHaravan
        ] = await Promise.all([
            haravanService.getDiscountCodes(),
            haravanService.getOrders(), 
            haravanService.getCustomers(),
            haravanService.getProducts(),
            haravanService.getSmartCollections(), // <-- CẬP NHẬT
            // XÓA: haravanService.getCollects()
            Promise.resolve([]) // <-- Thay thế getCollects bằng một Promise rỗng để giữ cấu trúc Promise.all
        ]);

        console.log(`- Đã lấy được: ${productsFromHaravan.length} sản phẩm, ${couponsFromHaravan.length} mã, ${ordersFromHaravan.length} đơn hàng, ${customersFromHaravan.length} khách hàng, ${smartCollectionsFromHaravan.length} Smart Collections.`);
        // XÓA: collectsFromHaravan khỏi log nếu không dùng

        // --- Bước 1.5: Đồng bộ Smart Collections vào Model MongoDB ---
        if (smartCollectionsFromHaravan && smartCollectionsFromHaravan.length > 0) {
            const collectionOps = smartCollectionsFromHaravan.map(collection => ({
                updateOne: {
                    filter: { id: collection.id },
                    update: { $set: { 
                        ...collection, 
                        created_at_haravan: collection.created_at ? utcToZonedTime(new Date(collection.created_at), STORE_TIMEZONE) : null, 
                        updated_at_haravan: collection.updated_at ? utcToZonedTime(new Date(collection.updated_at), STORE_TIMEZONE) : null 
                    } },
                    upsert: true
                }
            }));
            await HaravanCollection.bulkWrite(collectionOps);
            console.log(`✅ Đã đồng bộ ${smartCollectionsFromHaravan.length} Smart Collections.`); // Cập nhật tên biến
        }
        
        // Không cần collectionIdToNameMap hay productCollectsMap ở đây nữa
        // vì Product sẽ tự tính toán membership dựa trên rules.

        // --- Bước 2: Đồng bộ Products và ánh xạ với Smart Collections ---
        if (productsFromHaravan && productsFromHaravan.length > 0) {
            const productOps = productsFromHaravan.map(product => {
                const associatedCollectionIds = [];
                const associatedCollectionNames = [];

                smartCollectionsFromHaravan.forEach(collection => { // Lặp qua Smart Collections
                    const { rules, disjunctive } = collection;
                    
                    // Nếu không có quy tắc nào, hoặc lỗi dữ liệu, bỏ qua collection này
                    if (!rules || rules.length === 0) return; 

                    let isMatch = false;

                    if (disjunctive) { // Nếu disjunctive = true (OR)
                        isMatch = rules.some(rule => matchesRule(product, rule));
                    } else { // Nếu disjunctive = false (AND)
                        isMatch = rules.every(rule => matchesRule(product, rule));
                    }

                    if (isMatch) {
                        associatedCollectionIds.push(collection.id);
                        associatedCollectionNames.push(collection.title);
                    }
                });

                return {
                    updateOne: {
                        filter: { id: product.id },
                        update: {
                            $set: {
                                ...product,
                                // Chuẩn hóa created_at_haravan và updated_at_haravan
                                created_at_haravan: product.created_at ? utcToZonedTime(new Date(product.created_at), STORE_TIMEZONE) : null,
                                updated_at_haravan: product.updated_at ? utcToZonedTime(new Date(product.updated_at), STORE_TIMEZONE) : null,
                                haravan_collection_ids: associatedCollectionIds,
                                haravan_collection_names: associatedCollectionNames,
                                variants: product.variants.map(haravanVariant => {
                                    let newVariant = { ...haravanVariant };
                                    if (haravanVariant.cost === undefined) { 
                                        newVariant.cost = 0; 
                                    }
                                    return newVariant;
                                }),
                            },
                        },
                        upsert: true
                    }
                };
            });
            await Product.bulkWrite(productOps);
            console.log(`✅ Đã đồng bộ ${productsFromHaravan.length} sản phẩm.`);
        }

        // --- Bước 3: Đồng bộ Mã giảm giá ---
        if (couponsFromHaravan && couponsFromHaravan.length > 0) {
            const couponOps = couponsFromHaravan.map(coupon => ({
                updateOne: {
                    filter: { id: coupon.id },
                    update: { $set: coupon },
                    upsert: true
                }
            }));
            await Coupon.bulkWrite(couponOps); 
            console.log(`✅ Đã đồng bộ ${couponsFromHaravan.length} mã giảm giá.`);
        }

        // --- Bước 4: Đồng bộ Đơn hàng (ĐÃ SỬA LỖI XỬ LÝ created_at_haravan) ---
        if (ordersFromHaravan && ordersFromHaravan.length > 0) {
            const orderOps = ordersFromHaravan.map(order => {
                // Parse created_at từ chuỗi Haravan (thường là ISO 8601 UTC)
                const haravanCreatedAtUTC = order.created_at ? new Date(order.created_at) : null;
                
                // Chuẩn hóa created_at_haravan (UTC) sang múi giờ cục bộ của cửa hàng (GMT+7)
                const createdDateTimeInStoreTimezone = haravanCreatedAtUTC ? utcToZonedTime(haravanCreatedAtUTC, STORE_TIMEZONE) : null;

                // Log để kiểm tra giá trị này (debug)
                console.log(`Đơn hàng ${order.id}: created_at_haravan từ Haravan (RAW): ${order.created_at} -> Date Object (UTC): ${haravanCreatedAtUTC?.toISOString()} -> Store Timezone Date: ${createdDateTimeInStoreTimezone?.toISOString()} (Locale: ${createdDateTimeInStoreTimezone?.toLocaleString('vi-VN', {timeZone: STORE_TIMEZONE})})`);


                return {
                    updateOne: {
                        filter: { id: order.id },
                        update: { 
                            $set: { 
                                ...order, 
                                created_at_haravan: createdDateTimeInStoreTimezone, 
                                updated_at_haravan: order.updated_at ? utcToZonedTime(new Date(order.updated_at), STORE_TIMEZONE) : null,
                                cancelled_at: order.cancelled_at ? utcToZonedTime(new Date(order.cancelled_at), STORE_TIMEZONE) : null,
                            } 
                        },
                        upsert: true
                    }
                };
            });
            await Order.bulkWrite(orderOps); 
            console.log(`✅ Đã đồng bộ ${ordersFromHaravan.length} đơn hàng.`);
        }

        // --- Bước 5: Đồng bộ Khách hàng ---
        if (customersFromHaravan && customersFromHaravan.length > 0) {
            const customerOps = customersFromHaravan.map(customer => ({
                updateOne: {
                    filter: { id: customer.id },
                    update: { $set: customer },
                    upsert: true
                }
            }));
            await Customer.bulkWrite(customerOps); 
            console.log(`✅ Đã đồng bộ ${customersFromHaravan.length} khách hàng.`);
        }

        res.status(200).json({
            message: '🎉 Đồng bộ dữ liệu thành công!',
            syncedProducts: productsFromHaravan.length,
            syncedCoupons: couponsFromHaravan.length,
            syncedOrders: ordersFromHaravan.length,
            syncedCustomers: customersFromHaravan.length,
        });

    } catch (error) {
        console.error('❌ Lỗi trong quá trình đồng bộ:', error);
        if (error.response) {
            console.error('Phản hồi lỗi từ Haravan API:', error.response.data);
        }
        res.status(500).json({ message: 'Đồng bộ dữ liệu thất bại.', error: error.message });
    }
}

module.exports = {
    syncAllData
};
