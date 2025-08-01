// ==========================================================
// File: controllers/sync.controller.js
// Nhiệm vụ: Chứa logic chính để đồng bộ dữ liệu từ Haravan về MongoDB.
// ==========================================================

const haravanService = require('../services/haravan.service');
const Product = require('../models/product.model');
const HaravanCollection = require('../models/haravanCollection.model');
const Coupon = require('../models/coupon.model'); 
const Order = require('../models/order.model'); 
const Customer = require('../models/customer.model'); 

// --- BỎ DÒNG NÀY NẾU date-fns-tz KHÔNG DÙNG ĐƯỢC ---
// const { utcToZonedTime, format } = require('date-fns-tz'); 

// Sử dụng biến môi trường hoặc giá trị mặc định cho múi giờ
const STORE_TIMEZONE_OFFSET_HOURS = 7; // Hoặc lấy từ process.env.STORE_TIMEZONE_OFFSET_HOURS nếu bạn muốn cấu hình

// ... (các hàm matchesRule và các phần khác giữ nguyên) ...

async function syncAllData(req, res) {
    console.log('🔄 Bắt đầu quá trình đồng bộ dữ liệu...');
    try {
        const [
            couponsFromHaravan, 
            ordersFromHaravan, 
            customersFromHaravan,
            productsFromHaravan,
            smartCollectionsFromHaravan
        ] = await Promise.all([
            haravanService.getDiscountCodes(),
            haravanService.getOrders(), 
            haravanService.getCustomers(),
            haravanService.getProducts(),
            haravanService.getSmartCollections(),
            Promise.resolve({ collects: [] })
        ]);

        console.log(`- Đã lấy được: ${productsFromHaravan.length} sản phẩm, ${couponsFromHaravan.length} mã, ${ordersFromHaravan.length} đơn hàng, ${customersFromHaravan.length} khách hàng, ${smartCollectionsFromHaravan.length} Smart Collections.`);

        // Hàm helper để điều chỉnh thời gian thủ công
        const adjustTimeToStoreTimezone = (dateString) => {
            if (!dateString) return null;
            let date = new Date(dateString); // Tạo Date object từ chuỗi Haravan (là UTC)
            
            // Lấy thời gian hiện tại của Date object (tính bằng mili giây)
            // và thêm vào số mili giây tương ứng với 7 giờ (7 * 60 phút * 60 giây * 1000 mili giây)
            date.setHours(date.getHours() + STORE_TIMEZONE_OFFSET_HOURS);
            return date;
        };

        // --- Bước 1.5: Đồng bộ Smart Collections vào Model MongoDB ---
        if (smartCollectionsFromHaravan && smartCollectionsFromHaravan.length > 0) {
            const collectionOps = smartCollectionsFromHaravan.map(collection => ({
                updateOne: {
                    filter: { id: collection.id },
                    update: { $set: { 
                        ...collection, 
                        created_at_haravan: adjustTimeToStoreTimezone(collection.created_at), 
                        updated_at_haravan: adjustTimeToStoreTimezone(collection.updated_at) 
                    } },
                    upsert: true
                }
            }));
            await HaravanCollection.bulkWrite(collectionOps);
            console.log(`✅ Đã đồng bộ ${smartCollectionsFromHaravan.length} Smart Collections.`);
        }
         
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
                                created_at_haravan: adjustTimeToStoreTimezone(product.created_at),
                                updated_at_haravan: adjustTimeToStoreTimezone(product.updated_at),
                                haravan_collection_ids: associatedCollectionIds,
                                haravan_collection_names: associatedCollectionNames,
                                variants: product.variants.map(haravanVariant => {
                                    let newVariant = { ...haravanVariant };
                                    if (newVariant.cost === undefined) { 
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

        // --- Bước 3: Đồng bộ Mã giảm giá (không có trường thời gian cần điều chỉnh) ---
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
                const createdDateTimeInStoreTimezone = adjustTimeToStoreTimezone(order.created_at);
                const updatedDateTimeInStoreTimezone = adjustTimeToStoreTimezone(order.updated_at);
                const cancelledDateTimeInStoreTimezone = adjustTimeToStoreTimezone(order.cancelled_at);

                console.log(`Đơn hàng ${order.id}: created_at_haravan từ Haravan (RAW): ${order.created_at} -> Store Timezone Date (Manual): ${createdDateTimeInStoreTimezone?.toISOString()}`);

                return {
                    updateOne: {
                        filter: { id: order.id },
                        update: { 
                            $set: { 
                                ...order, 
                                created_at_haravan: createdDateTimeInStoreTimezone, 
                                updated_at_haravan: updatedDateTimeInStoreTimezone,
                                cancelled_at: cancelledDateTimeInStoreTimezone,
                            } 
                        },
                        upsert: true
                    }
                };
            });
            await Order.bulkWrite(orderOps); 
            console.log(`✅ Đã đồng bộ ${ordersFromHaravan.length} đơn hàng.`);
        }

        // --- Bước 5: Đồng bộ Khách hàng (không có trường thời gian cần điều chỉnh) ---
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
