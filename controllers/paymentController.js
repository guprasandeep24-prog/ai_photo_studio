const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLANS = {
    "STARTER": { amount: 499, credits: 40 },
    "PRO": { amount: 999, credits: 90 }
};

exports.createOrder = async (req, res) => {
    try {
        const { planName } = req.body;
        const plan = PLANS[planName];
        if (!plan) return res.status(400).json({ message: "Invalid Plan" });

        const options = {
            amount: plan.amount * 100,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);
        res.status(200).json({ success: true, orderId: order.id, amount: plan.amount, planName: planName });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.verifyPayment = async (req, res) => {
    try {
        const { 
            razorpay_order_id, 
            razorpay_payment_id, 
            razorpay_signature, 
            firebaseUid, 
            planName 
        } = req.body;

        // 🕵️ DEBUGGING LOGS (Ye humein sach batayenge)
        console.log("--- 📥 NEW VERIFICATION REQUEST ---");
        console.log("1. Received Firebase UID:", firebaseUid);
        console.log("2. Received Plan Name:", planName);
        console.log("3. Received Razorpay ID:", razorpay_order_id);

        // 1. Signature Verify
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            console.log("❌ SIGNATURE MISMATCH!");
            return res.status(400).json({ success: false, error: "Invalid Signature" });
        }

        // 2. Find User
        console.log("🔍 Searching database for user with UID:", firebaseUid);
        const user = await User.findOne({ firebaseUid: firebaseUid });

        if (!user) {
            console.log("❌ USER NOT FOUND IN DATABASE!");
            return res.status(404).json({ success: false, error: "User not found in database" });
        }

        console.log("✅ User Found! Current Credits:", user.credits);

        // 3. Update Credits
        const plan = PLANS[planName];
        user.credits += plan.credits;
        await user.save();
        
        console.log(`🚀 SUCCESS! New Credit Balance: ${user.credits}`);

        // 4. Create Transaction Record
        await Transaction.create({
            userId: user._id,
            amount: plan.amount,
            creditsAdded: plan.credits,
            type: 'PURCHASE',
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            status: 'SUCCESS'
        });

        res.status(200).json({ success: true, newBalance: user.credits });

    } catch (error) {
        console.error("❌ VERIFICATION ERROR:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};