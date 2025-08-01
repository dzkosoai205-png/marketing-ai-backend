// ==========================================================
// File: controllers/sync.controller.js (Sửa lỗi Import date-fns-tz)
// ==========================================================

const haravanService = require('../services/haravan.service');
const Product = require('../models/product.model');
const HaravanCollection = require('../models/haravanCollection.model');
const Coupon = require('../models/coupon.model'); 
const Order = require('../models/order.model'); 
const Customer = require('../models/customer.model'); 

// THAY ĐỔI DÒNG NÀY: Import đúng cách các hàm từ date-fns-tz
const { utcToZonedTime, format, toDate } = require('date-fns-tz'); 
// THÊM: Nếu bạn cũng dùng date-fns cho các hàm như startOfMonth, endOfMonth
// const { startOfMonth, endOfMonth } = require('date-fns');

// THÊM: Định nghĩa múi giờ cửa hàng (PHẢI TRÙNG VỚI HARAVAN)
const STORE_TIMEZONE = process.env.STORE_TIMEZONE || 'Asia/Ho_Chi_Minh'; // Ví dụ cho Việt Nam (GMT+7)

// Hàm trợ giúp để kiểm tra xem một sản phẩm có khớp với quy tắc của Smart Collection không
const matchesRule = (product, rule) => { /* ... giữ nguyên ... */ };

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
                    update: { $set: { 
                        ...collection, 
                        // SỬA LỖI: new Date(collection.created_at) trước khi chuyển đổi
                        created_at_haravan: collection.created_at ? utcToZonedTime(new Date(collection.created_at), STORE_TIMEZONE) : null, 
                        updated_at_haravan: collection.updated_at ? utcToZonedTime(new Date(collection.updated_at), STORE_TIMEZONE) : null 
                    } },
                    upsert: true
                }
            }));
            await HaravanCollection.bulkWrite(collectionOps);
            console.log(`✅ Đã đồng bộ ${smartCollectionsFromHaravan.length} Smart Collections.`);
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
                productCollectsMap[collect.product_id].push(collectionIdToNameMap[collect.collection_id]);
            }
        });

        // --- Bước 2: Đồng bộ Products và ánh xạ với Smart Collections ---
        if (productsFromHaravan && productsFromHaravan.length > 0) {
            const productOps = productsFromHaravan.map(product => {
                const associatedCollectionIds = [];
                const associatedCollectionNames = [];

                smartCollectionsFromHaravan.forEach(collection => { 
                    const { rules, disjunctive } = collection;
                    
                    if (!rules || rules.length === 0) return; 

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
                                // SỬA LỖI: new Date(product.created_at) trước khi chuyển đổi
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

        // --- Bước 4: Đồng bộ Đơn hàng (CẬP NHẬT: Chuẩn hóa created_at_haravan) ---
        if (ordersFromHaravan && ordersFromHaravan.length > 0) {
            const orderOps = ordersFromHaravan.map(order => {
                const haravanCreatedAtUTC = order.created_at ? new Date(order.created_at) : null;
                
                const createdDateTimeInStoreTimezone = haravanCreatedAtUTC ? utcToZonedTime(haravanCreatedAtUTC, STORE_TIMEZONE) : null;

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
