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

// 🚀 ROUTE 2: Verify Payment & Add Credits (With Auto-Registration)
router.post('/verify-payment', async (req, res) => {
    // Humne yahan 'email' bhi mangwaya hai taaki naya user bana sakein
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, creditsToAdd, email } = req.body;

    // 1. Signature Verification (Security Check)
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign)
        .digest("hex");

    if (razorpay_signature === expectedSign) {
        try {
            // 2. Check if user exists in MongoDB
            let user = await User.findOne({ firebaseUid: userId });

            if (!user) {
                // ✨ SELF-HEALING: Agar user nahi milta, toh turant create kar do!
                console.log(`🆕 [PAYMENT] User not found in DB. Auto-creating for UID: ${userId}`);
                user = new User({
                    firebaseUid: userId,
                    email: email || "new-user@example.com", // Use email from frontend
                    credits: parseInt(creditsToAdd)        // Initial credits
                });
                await user.save();
                console.log("✅ [PAYMENT] New user created successfully during verification.");
            } else {
                // 3. Agar user pehle se hai, toh credits badha do
                user.credits += parseInt(creditsToAdd);
                await user.save();
                console.log(`💰 [PAYMENT] Credits added to existing user: ${userId}`);
            }

            res.json({ success: true, message: "Payment successful! Credits added." });
        } catch (error) {
            console.error("❌ [PAYMENT] Database Error:", error);
            res.status(500).json({ success: false, error: "Database update failed" });
        }
    } else {
        console.error("❌ [PAYMENT] Signature mismatch!");
        res.status(400).json({ success: false, error: "Invalid payment signature" });
    }
});

module.exports = router;