const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    email: { type: String, required: true },
    category: { type: String, required: true },
    gender: { type: String, required: false }, // 'true' se badal kar 'false' kar diya
    aiImageUrl: { type: String, required: true },
    originalImageUrl: { type: String },
    status: { type: String, default: 'completed' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);