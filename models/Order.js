const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    category: { type: String, required: true },
    gender: { type: String, required: true },
    aiImageUrl: { type: String, required: true },
    status: { type: String, default: 'completed' },
    razorpayOrderId: { type: String, default: 'N/A' } 
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);