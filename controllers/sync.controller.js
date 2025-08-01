// ==========================================================
// File: controllers/sync.controller.js (Đã cập nhật để đồng bộ Collections)
// Nhiệm vụ: Chứa logic chính để đồng bộ dữ liệu.
// ==========================================================

const haravanService = require('../services/haravan.service');
const Coupon = require('../models/coupon.model');
const Order = require('../models/order.model');
const Customer = require('../models/customer.model');
const Product = require('../models/product.model');
const HaravanCollection = require('../models/haravanCollection.model'); // <-- THÊM: Model cho Collections

/**
 * Controller để kích hoạt quá trình đồng bộ toàn bộ dữ liệu
 * từ Haravan về MongoDB.
 */
async function syncAllData(req, res) {
    console.log('🔄 Bắt đầu quá trình đồng bộ dữ liệu...');
    try {
        // --- Bước 1: Lấy dữ liệu mới nhất từ Haravan ---
        // Giả định haravanService của bạn có các hàm mới:
        // .getProductsWithCollects()
        // .getCustomCollections()
        const [
            couponsFromHaravan, 
            ordersFromHaravan, 
            customersFromHaravan,
            productsFromHaravan, // Dữ liệu sản phẩm thô
            collectionsFromHaravan, // <-- THÊM: Dữ liệu collections
            collectsFromHaravan // <-- THÊM: Dữ liệu collects
        ] = await Promise.all([
            haravanService.getDiscountCodes(),
            haravanService.getOrders(),
            haravanService.getCustomers(),
            haravanService.getProducts(),
            haravanService.getCustomCollections(), // <-- THÊM
            haravanService.getCollects() // <-- THÊM
        ]);

        console.log(`- Đã lấy được: ${productsFromHaravan.length} sản phẩm, ${couponsFromHaravan.length} mã, ${ordersFromHaravan.length} đơn hàng, ${customersFromHaravan.length} khách hàng, ${collectionsFromHaravan.length} collections, ${collectsFromHaravan.length} collects.`);

        // --- Bước 1.5: Đồng bộ Collections vào Model MongoDB ---
        // BƯỚC MỚI: Đồng bộ Collections trước để có map ID-to-Name
        if (collectionsFromHaravan && collectionsFromHaravan.length > 0) {
            const collectionOps = collectionsFromHaravan.map(collection => ({
                updateOne: {
                    filter: { id: collection.id },
                    update: { $set: { ...collection, created_at_haravan: collection.created_at, updated_at_haravan: collection.updated_at } },
                    upsert: true
                }
            }));
            await HaravanCollection.bulkWrite(collectionOps);
            console.log(`✅ Đã đồng bộ ${collectionsFromHaravan.length} Collections.`);
        }
        
        // Tạo một map từ ID Collection sang tên của nó để sử dụng ở bước sau
        const collectionIdToNameMap = {};
        collectionsFromHaravan.forEach(col => {
            collectionIdToNameMap[col.id] = col.title;
        });

        // Tạo một map từ Product ID sang mảng Collects của nó
        const productCollectsMap = {};
        collectsFromHaravan.forEach(collect => {
            if (!productCollectsMap[collect.product_id]) {
                productCollectsMap[collect.product_id] = [];
            }
            productCollectsMap[collect.product_id].push(collect.collection_id);
        });

        // --- Bước 2: Đồng bộ Sản phẩm (Đã sửa) ---
        if (productsFromHaravan && productsFromHaravan.length > 0) {
            const productOps = productsFromHaravan.map(product => {
                // Ánh xạ Product ID với Collection IDs và Names
                const associatedCollectionIds = productCollectsMap[product.id] || [];
                const associatedCollectionNames = associatedCollectionIds
                    .map(id => collectionIdToNameMap[id])
                    .filter(name => name); // Lọc bỏ tên undefined/null

                return {
                    updateOne: {
                        filter: { id: product.id },
                        update: {
                            $set: {
                                ...product,
                                created_at_haravan: product.created_at,
                                updated_at_haravan: product.updated_at,
                                // Gán các trường mới
                                haravan_collection_ids: associatedCollectionIds,
                                haravan_collection_names: associatedCollectionNames,
                                // Sửa lỗi của bạn: setOnInsert không phải là $set
                                // $setOnInsert chỉ hoạt động khi document được tạo mới (upsert)
                            },
                            // $setOnInsert: { is_new_product: true, first_imported_at: new Date() } // <-- Giữ logic này
                        },
                        upsert: true
                    }
                };
            });
            await Product.bulkWrite(productOps);
            console.log(`✅ Đã đồng bộ ${productsFromHaravan.length} sản phẩm.`);
        }


        // --- Bước 3: Đồng bộ Mã giảm giá (Giữ nguyên) ---
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

        // --- Bước 4: Đồng bộ Đơn hàng (Giữ nguyên) ---
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

        // --- Bước 5: Đồng bộ Khách hàng (Giữ nguyên) ---
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