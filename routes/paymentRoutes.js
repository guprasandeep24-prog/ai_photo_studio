const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');

// 1. Razorpay Instance setup
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 🚀 ROUTE 1: Create Razorpay Order
router.post('/create-order', async (req, res) => {
    const { amount, userId } = req.body;

    const options = {
        amount: amount * 100, // Amount in paise (₹1 = 100 paise)
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
    };

    try {
        const order = await razorpay.orders.create(options);
        res.json({ success: true, order });
    } catch (error) {
        console.error("❌ [PAYMENT] Order Creation Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 ROUTE 2: Verify Payment & Add Credits
router.post('/verify-payment', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, creditsToAdd } = req.body;

    // Signature verification logic
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign)
        .digest("hex");

    if (razorpay_signature === expectedSign) {
        try {
            // ✅ Payment Successful! Update User Credits in MongoDB
            const user = await User.findOne({ firebaseUid: userId });
            if (!user) return res.status(404).json({ success: false, error: "User not found" });

            user.credits += parseInt(creditsToAdd);
            await user.save();

            console.log(`💰 [PAYMENT] Success! Added ${creditsToAdd} credits to user: ${userId}`);
            res.json({ success: true, message: "Payment successful! Credits added." });
        } catch (error) {
            res.status(500).json({ success: false, error: "Database error" });
        }
    } else {
        console.error("❌ [PAYMENT] Signature mismatch!");
        res.status(400).json({ success: false, error: "Invalid payment signature" });
    }
});

module.exports = router;