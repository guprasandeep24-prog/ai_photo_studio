const mongoose = require('mongoose');

// Ye Schema decide karega ki hamare Database mein kya-kya data save hoga
const OrderSchema = new mongoose.Schema({
    category: { type: String, required: true }, // e.g., 'linkedin'
    gender: { type: String, required: true },   // e.g., 'man'
    aiImageUrl: { type: String, required: true }, // Cloudinary ka link
    razorpayOrderId: { type: String, required: true, unique: true }, // Razorpay ki ID
    razorpayPaymentId: { type: String },        // Payment hone ke baad milegi
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'], 
        default: 'pending' 
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);