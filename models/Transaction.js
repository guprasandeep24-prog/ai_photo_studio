const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // User model se link karega
        required: true
    },
    amount: {
        type: Number, // Kitne paise diye (e.g., 499)
        required: true
    },
    creditsAdded: {
        type: Number, // Kitne credits mile (e.g., 50)
        required: true
    },
    type: {
        type: String,
        enum: ['PURCHASE', 'USAGE'], // PURCHASE matlab paise dekar liye, USAGE matlab photo banane mein kharch kiye
        required: true
    },
    razorpayOrderId: {
        type: String, // Razorpay ka order ID record rakhne ke liye
        required: false
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'PENDING'],
        default: 'PENDING'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Transaction', transactionSchema);