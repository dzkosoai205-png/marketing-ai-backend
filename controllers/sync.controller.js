// ==========================================================
// File: controllers/sync.controller.js (FIX CUỐI CÙNG & TRIỆT ĐỂ: Lỗi utcToZonedTime is not a function)
// Nhiệm vụ: Chứa logic chính để đồng bộ dữ liệu từ Haravan về MongoDB.
// ==========================================================

const haravanService = require('../services/haravan.service');
const Product = require('../models/product.model');
const HaravanCollection = require('../models/haravanCollection.model'); // Model cho Collections (Giờ là Smart Collection)
const Coupon = require('../models/coupon.model'); 
const Order = require('../models/order.model'); 
const Customer = require('../models/customer.model'); 

// XÓA: const dateFnsTz = require('date-fns-tz');
// XÓA: const utcToZonedTime = dateFnsTz.utcToZonedTime;
// XÓA: const format = dateFnsTz.format;

// ĐỊNH NGHĨA OFFSET CỦA MÚI GIỜ CỬA HÀNG (Việt Nam là GMT+7)
// Offset tính bằng phút so với UTC. (7 giờ * 60 phút/giờ = 420 phút)
const STORE_TIMEZONE_OFFSET_MINUTES = 7 * 60; 

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
            productValue = product.tags ? product.tags.split(',').map(tag => tag.trim()) : [];
            break;
        case 'variant_title':
            productValue = product.variants.map(v => v.title).join(', '); 
            break;
        case 'price':
            productValue = product.variants.length > 0 ? product.variants[0].price : 0; 
            break;
        case 'compare_at_price':
            productValue = product.variants.length > 0 ? product.variants[0].compare_at_price : 0;
            break;
        case 'variant_weight': 
            productValue = product.variants.length > 0 ? product.variants[0].grams : 0;
            break;
        case 'inventory_quantity': 
            productValue = product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
            break;
        default:
            console.warn(`⚠️ [Sync] Quy tắc không xác định trong Smart Collection: ${column}`);
            return false;
    }

    if (productValue === undefined || productValue === null) {
        return false;
    }

    const conditionValue = String(condition).toLowerCase();
    let isMatch = false;

    switch (relation) {
        case 'equals':
            if (column === 'tag') {
                isMatch = productValue.includes(conditionValue);
            } else if (['price', 'compare_at_price', 'inventory_quantity', 'variant_weight'].includes(column)) {
                isMatch = parseFloat(productValue) === parseFloat(conditionValue);
            } else {
                isMatch = String(productValue).toLowerCase() === conditionValue;
            }
            break;
        case 'not_equals':
            if (column === 'tag') {
                isMatch = !productValue.includes(conditionValue);
            } else if (['price', 'compare_at_price', 'inventory_quantity', 'variant_weight'].includes(column)) {
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

// Hàm trợ giúp để chuyển đổi Date object từ UTC sang múi giờ cửa hàng (và ngược lại)
// Date object luôn chứa thời điểm UTC. Chúng ta chỉ điều chỉnh các thành phần để nó "trông như" múi giờ cửa hàng.
const toDateInStoreTimezone = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString); // Parse chuỗi ISO (thường là UTC) thành Date object
    
    // Lấy offset của múi giờ cục bộ của Date object so với UTC (là giờ của Render server)
    const localOffset = date.getTimezoneOffset(); // Offset của server so với UTC (phút)

    // Điều chỉnh để thời điểm này đại diện cho giờ trong múi giờ cửa hàng
    // Ví dụ: 12:00 PM UTC + 7 giờ (Việt Nam) = 19:00 PM UTC (lúc này, thời điểm UTC mới)
    // Lấy timestamp UTC và cộng/trừ offset của múi giờ cửa hàng
    const utcTimestamp = date.getTime(); // Thời điểm tính bằng ms từ epoch, UTC
    const offsetMs = STORE_TIMEZONE_OFFSET_MINUTES * 60 * 1000; // Offset của cửa hàng tính bằng ms

    // Tạo một Date object mới mà khi xem theo UTC, nó là thời điểm "đúng" của cửa hàng
    // VD: nếu 19:00 VN là 12:00 UTC. Ta muốn lưu 12:00 UTC vào DB.
    // Nếu bạn có 19:00 (múi giờ cửa hàng), bạn muốn trừ đi 7 giờ để được 12:00 UTC.
    // TimezoneOffset của VN là -420 (phút). `getTimezoneOffset` trả về phút lệch so với UTC, ngược dấu với offset chuẩn.
    // Ví dụ: VN là GMT+7 -> getTimezoneOffset là -420.
    // Để có Date object mà khi lưu UTC nó khớp với giờ của Haravan, ta cần cộng offset của Haravan.
    const dateInStoreTimezone = new Date(utcTimestamp + (localOffset * 60 * 1000) + (STORE_TIMEZONE_OFFSET_MINUTES * 60 * 1000));
    // Dòng trên đang phức tạp và có thể gây lỗi.
    // CÁCH ĐƠN GIẢN VÀ CHÍNH XÁC NHẤT LÀ:
    // Haravan API trả về chuỗi ISO 8601 theo UTC. MongoDB lưu Date objects theo UTC.
    // Vấn đề là frontend hiển thị sai.
    // Nếu vẫn thấy lệch +2, có lẽ offset Haravan không phải GMT+7 mà là GMT+9.
    // Hoặc có lỗi ở cách frontend tính toán.
    
    // TẠM THỜI THỬ LẠI CHỈ ĐƠN GIẢN new Date() VÀ LOG ĐỂ DEBUG MÚI GIỜ THẬT
    return new Date(dateString); 
};


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
        
        // --- Bước 1.5: Đồng bộ Smart Collections vào Model MongoDB ---
        if (smartCollectionsFromHaravan && smartCollectionsFromHaravan.length > 0) {
            const collectionOps = smartCollectionsFromHaravan.map(collection => ({
                updateOne: {
                    filter: { id: collection.id },
                    update: { $set: { 
                        ...collection, 
                        // SỬ DỤNG HÀM toDateInStoreTimezone
                        created_at_haravan: toDateInStoreTimezone(collection.created_at), 
                        updated_at_haravan: toDateInStoreTimezone(collection.updated_at) 
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
                                // SỬ DỤNG HÀM toDateInStoreTimezone
                                created_at_haravan: toDateInStoreTimezone(product.created_at),
                                updated_at_haravan: toDateInStoreTimezone(product.updated_at),
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
                // SỬ DỤNG HÀM toDateInStoreTimezone cho tất cả các trường ngày tháng
                const haravanCreatedAt = toDateInStoreTimezone(order.created_at);
                const haravanUpdatedAt = toDateInStoreTimezone(order.updated_at);
                const haravanCancelledAt = toDateInStoreTimezone(order.cancelled_at);

                console.log(`Đơn hàng ${order.id}: created_at_haravan từ Haravan (RAW): ${order.created_at} -> Date Object (parsed): ${haravanCreatedAt?.toISOString()}`);


                return {
                    updateOne: {
                        filter: { id: order.id },
                        update: { 
                            $set: { 
                                ...order, 
                                created_at_haravan: haravanCreatedAt, 
                                updated_at_haravan: haravanUpdatedAt,
                                cancelled_at: haravanCancelledAt,
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
                    update: { 
                        $set: { 
                            ...customer,
                            // Haravan customer created_at/updated_at cũng cần chuẩn hóa
                            created_at_haravan: customer.created_at ? toDateInStoreTimezone(customer.created_at) : null,
                            updated_at_haravan: customer.updated_at ? toDateInStoreTimezone(customer.updated_at) : null,
                         } 
                    },
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
