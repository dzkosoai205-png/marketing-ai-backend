// File: controllers/accounting.controller.js (File mới)
// ==========================================================
const BusinessSettings = require('../models/businessSettings.model');
const FinancialEvent = require('../models/financialEvent.model');

// --- CHI PHÍ KINH DOANH & MỤC TIÊU ---
async function getBusinessSettings(req, res) {
    try {
        const settings = await BusinessSettings.findOne({ shop_id: 'main_settings' });
        res.status(200).json(settings || {});
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy cài đặt kinh doanh.', error: error.message });
    }
}

async function saveBusinessSettings(req, res) {
    try {
        const { costs, goal } = req.body;
        const updateData = {
            monthly_rent_cost: costs.rent,
            monthly_staff_cost: costs.staff,
            monthly_marketing_cost: costs.marketing,
            monthly_other_cost: costs.other,
            monthly_profit_target: goal
        };

        const settings = await BusinessSettings.findOneAndUpdate(
            { shop_id: 'main_settings' },
            updateData,
            { upsert: true, new: true }
        );
        res.status(200).json({ message: 'Đã lưu cài đặt kinh doanh!', settings });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lưu cài đặt kinh doanh.', error: error.message });
    }
}

// --- SỰ KIỆN CHI TIỀN ---
async function getFinancialEvents(req, res) {
    try {
        const events = await FinancialEvent.find({}).sort({ due_date: 1 });
        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy sự kiện chi tiền.', error: error.message });
    }
}

async function addFinancialEvent(req, res) {
    try {
        const { event_name, amount, due_date } = req.body;
        if (!event_name || !amount || !due_date) {
            return res.status(400).json({ message: 'Thiếu thông tin sự kiện.' });
        }
        const newEvent = new FinancialEvent({ event_name, amount, due_date });
        await newEvent.save();
        res.status(201).json({ message: 'Đã thêm sự kiện thành công!', event: newEvent });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi thêm sự kiện.', error: error.message });
    }
}

module.exports = {
    getBusinessSettings,
    saveBusinessSettings,
    getFinancialEvents,
    addFinancialEvent
};