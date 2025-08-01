// ==========================================================
// File: controllers/sync.controller.js (Hoàn thiện Đồng bộ Smart Collections)
// Nhiệm vụ: Chứa logic chính để đồng bộ dữ liệu.
// ==========================================================

const haravanService = require('../services/haravan.service');
const Product = require('../models/product.model');
const HaravanCollection = require('../models/haravanCollection.model');

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
            productValue = product.variants.map(v => v.title).join(', '); // Nối tất cả variant titles
            break;
        case 'price':
            // Cần tính giá trung bình hoặc kiểm tra từng variant
            productValue = product.variants.length > 0 ? product.variants[0].price : 0; // Giả định lấy giá của variant đầu tiên
            break;
        // Thêm các case khác nếu bạn dùng các cột khác trong quy tắc của mình
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
        // Thêm các case khác như 'greater_than', 'less_than' nếu bạn sử dụng
        default:
            return false;
    }
};

// Hàm chính để đồng bộ tất cả dữ liệu
async function syncAllData(req, res) {
    console.log('🔄 Bắt đầu quá trình đồng bộ dữ liệu...');
    try {
        // --- Bước 1: Lấy dữ liệu mới nhất từ Haravan ---
        const [
            couponsFromHaravan, 
            ordersFromHaravan, 
            customersFromHaravan,
            productsFromHaravan,
            smartCollectionsFromHaravan // <-- CẬP NHẬT: Dữ liệu Smart Collections
        ] = await Promise.all([
            haravanService.getDiscountCodes(),
            haravanService.getOrders(),
            haravanService.getCustomers(),
            haravanService.getProducts(),
            haravanService.getSmartCollections() // <-- CẬP NHẬT
        ]);

        console.log(`- Đã lấy được: ${productsFromHaravan.length} sản phẩm, ${couponsFromHaravan.length} mã, ${ordersFromHaravan.length} đơn hàng, ${customersFromHaravan.length} khách hàng, ${smartCollectionsFromHaravan.length} Smart Collections.`);

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
            console.log(`✅ Đã đồng bộ ${smartCollectionsFromHaravan.length} Smart Collections.`);
        }
        
        // --- Bước 2: Đồng bộ Products và ánh xạ với Smart Collections ---
        if (productsFromHaravan && productsFromHaravan.length > 0) {
            const productOps = productsFromHaravan.map(product => {
                // LOGIC CẬP NHẬT: Xác định các Smart Collections mà sản phẩm này thuộc về
                const associatedCollectionIds = [];
                const associatedCollectionNames = [];

                smartCollectionsFromHaravan.forEach(collection => {
                    const { rules, disjunctive } = collection;
                    let isMatch = false;

                    // Nếu disjunctive = true (OR), chỉ cần một rule khớp là được
                    if (disjunctive) {
                        isMatch = rules.some(rule => matchesRule(product, rule));
                    } else {
                        // Nếu disjunctive = false (AND), tất cả các rules phải khớp
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
                                // Sửa lỗi cũ: Đảm bảo trường variants được cập nhật đúng
                                variants: product.variants.map(haravanVariant => {
                                    // Tạo một đối tượng variant mới, bắt đầu với dữ liệu từ Haravan
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

        // --- Các bước đồng bộ khác (Giữ nguyên) ---
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

        // --- Bước 4: Đồng bộ Đơn hàng ---
        if (ordersFromHaravan && ordersFromHaravan.length > 0) {
            const orderOps = ordersFromHaravan.map(order => ({
                updateOne: {
                    filter: { id: order.id },
                    update: { $set: { ...order, created_at_haravan: order.created_at } },
                    upsert: true
                }
            }));
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
        res.status(500).json({ message: 'Đồng bộ dữ liệu thất bại.', error: error.message });
    }
}

module.exports = {
    syncAllData
};