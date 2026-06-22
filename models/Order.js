const mongoose = require('mongoose');

// models/Order.js mein change karein

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    category: { type: String, required: true },
    gender: { type: String, required: true },
    aiImageUrl: { type: String, required: true },
    status: { type: String, default: 'completed' },
    // ❌ PURANA: razorpayOrderId: { type: String, unique: true }
    // ✅ NAYA: Unique hata diya taaki multiple "N/A" allow ho sakein
    razorpayOrderId: { type: String, default: 'N/A' } 
}, { timestamps: true });


module.exports = mongoose.model('Order', OrderSchema);