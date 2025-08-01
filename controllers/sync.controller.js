// ==========================================================
// File: controllers/sync.controller.js (Sử dụng date-fns-tz để chuẩn hóa múi giờ Order)
// ==========================================================
const haravanService = require('../services/haravan.service');
const Product = require('../models/product.model');
const HaravanCollection = require('../models/haravanCollection.model');
const Coupon = require('../models/coupon.model'); 
const Order = require('../models/order.model'); 
const Customer = require('../models/customer.model'); 

// THÊM: Import date-fns-tz
const { utcToZonedTime, format } = require('date-fns-tz'); 

// Cần biết múi giờ của cửa hàng Haravan của bạn (ví dụ: 'Asia/Ho_Chi_Minh' cho GMT+7)
const STORE_TIMEZONE = 'Asia/Ho_Chi_Minh'; // HOẶC múi giờ chính xác của cửa hàng Haravan của bạn

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
            productValue = product.tags;
            break;
        case 'variant_title':
            productValue = product.variants.map(v => v.title).join(', ');
            break;
        case 'price':
            productValue = product.variants.length > 0 ? product.variants[0].price : 0;
            break;
        default:
            return false;
    }

    if (productValue === undefined || productValue === null) {
        return false;
    }

    const conditionValue = condition.toLowerCase();
    const productValueLower = String(productValue).toLowerCase();

    switch (relation) {
        case 'equals':
            return productValueLower === conditionValue;
        case 'not_equals':
            return productValueLower !== conditionValue;
        case 'contains':
            return productValueLower.includes(conditionValue);
        case 'not_contains':
            return !productValueLower.includes(conditionValue);
        case 'starts_with':
            return productValueLower.startsWith(conditionValue);
        case 'ends_with':
            return productValueLower.endsWith(conditionValue);
        default:
            return false;
    }
};

// Hàm chính để đồng bộ tất cả dữ liệu
async function syncAllData(req, res) {
    console.log('🔄 Bắt đầu quá trình đồng bộ dữ liệu...');
    try {
        const [
            couponsFromHaravan, 
            ordersFromHaravan, 
            customersFromHaravan,
            productsFromHaravan,
            smartCollectionsFromHaravan,
            collectsFromHaravan 
        ] = await Promise.all([
            haravanService.getDiscountCodes(),
            haravanService.getOrders(), 
            haravanService.getCustomers(),
            haravanService.getProducts(),
            haravanService.getSmartCollections(),
            haravanService.getCollects() 
        ]);

        console.log(`- Đã lấy được: ${productsFromHaravan.length} sản phẩm, ${couponsFromHaravan.length} mã, ${ordersFromHaravan.length} đơn hàng, ${customersFromHaravan.length} khách hàng, ${smartCollectionsFromHaravan.length} Smart Collections, ${collectsFromHaravan.length} collects.`);

        // --- Bước 1.5: Đồng bộ Smart Collections vào Model MongoDB ---
        if (smartCollectionsFromHaravan && smartCollectionsFromHaravan.length > 0) {
            const collectionOps = smartCollectionsFromHaravan.map(collection => ({
                updateOne: {
                    filter: { id: collection.id },
                    update: { $set: { ...collection, created_at_haravan: collection.created_at, updated_at_haravan: collection.updated_at } },
                    upsert: true
                }
            }));
            await HaravanCollection.bulkWrite(collectionOps);
            console.log(`✅ Đã đồng bộ ${collectionsFromHaravan.length} Smart Collections.`);
        }
        
        const collectionIdToNameMap = {};
        collectionsFromHaravan.forEach(col => { // Lấy collectionsFromHaravan từ Promise.all
            collectionIdToNameMap[col.id] = col.title;
        });

        const productCollectsMap = {};
        collectsFromHaravan.forEach(collect => {
            if (collectionIdToNameMap[collect.collection_id]) {
                if (!productCollectsMap[collect.product_id]) {
                    productCollectsMap[collect.product_id] = [];
                }
                productCollectsMap[collect.product_id].push(collect.collection_id);
            }
        });

        // --- Bước 2: Đồng bộ Products và ánh xạ với Smart Collections ---
        if (productsFromHaravan && productsFromHaravan.length > 0) {
            const productOps = productsFromHaravan.map(product => {
                const associatedCollectionIds = [];
                const associatedCollectionNames = [];

                smartCollectionsFromHaravan.forEach(collection => {
                    const { rules, disjunctive } = collection;
                    let isMatch = false;

                    if (disjunctive) {
                        isMatch = rules.some(rule => matchesRule(product, rule));
                    } else {
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
                                created_at_haravan: product.created_at,
                                updated_at_haravan: product.updated_at,
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

        // --- Bước 4: Đồng bộ Đơn hàng (CẬP NHẬT: Chuẩn hóa created_at_haravan) ---
        if (ordersFromHaravan && ordersFromHaravan.length > 0) {
            const orderOps = ordersFromHaravan.map(order => {
                // Parse created_at từ chuỗi Haravan (thường là ISO 8601 UTC)
                const haravanCreatedAtUTC = order.created_at ? new Date(order.created_at) : null;
                
                // Chuyển đổi created_at_haravan (UTC) sang múi giờ cục bộ của cửa hàng (GMT+7)
                // và sau đó tạo một Date object mới từ đó.
                // Điều này giúp đảm bảo ngày được tính toán đúng theo múi giờ cửa hàng khi lưu trữ
                const createdDateTimeInStoreTimezone = haravanCreatedAtUTC ? utcToZonedTime(haravanCreatedAtUTC, STORE_TIMEZONE) : null;

                // Log để kiểm tra giá trị này (debug)
                console.log(`Đơn hàng ${order.id}: created_at_haravan từ Haravan (UTC): ${haravanCreatedAtUTC?.toISOString()} -> Store Timezone: ${createdDateTimeInStoreTimezone?.toISOString()} (Locale: ${createdDateTimeInStoreTimezone?.toLocaleString('vi-VN', {timeZone: STORE_TIMEZONE})})`);


                return {
                    updateOne: {
                        filter: { id: order.id },
                        update: { 
                            $set: { 
                                ...order, 
                                created_at_haravan: createdDateTimeInStoreTimezone, // Lưu Date object đã điều chỉnh
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
