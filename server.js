require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Import Order Model
const Order = require('./models/Order');

const app = express();

// 1. Initialization
console.log("🛠️ [SYSTEM] Initializing AI Studio Server...");

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

let razorpay;
try {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log("✅ [SYSTEM] Razorpay Initialized Successfully");
} catch (err) {
    console.error("❌ [CRITICAL] Razorpay Initialization Failed:", err.message);
}

// 2. Middleware
app.use(cors({
    origin: 'https://guprasandeep24-prog.github.io', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// 3. Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 4. Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// 5. Templates Map
const TEMPLATES = {
    'linkedin': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928122/smiling-businessman-with-arms-crossed_dalfak.jpg', 
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781527213/linkdin_ceo_woman1_p0hoc3.jpg'
    },
    'wedding': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928082/Wedding_qq5pyd.jpg',
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231450/pexels-creative-studio-830123672-19376431_mancpc.jpg'
    },
    'fashion': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781238420/man_fashion_image_repevi.jpg',
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231824/indian_woman_fashion_ckkwlf.jpg'
    }
};

// 6. AI Engine Logic
async function runAIFaceSwap(userCloudinaryUrl, category, gender) {
    const targetImageUrl = TEMPLATES[category][gender] || TEMPLATES['linkedin']['woman'];
    try {
        const output = await replicate.run(
            "pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", 
            { input: { target_image: targetImageUrl, swap_image: userCloudinaryUrl } }
        );

        if (output && typeof output[Symbol.asyncIterator] === 'function') {
            const chunks = [];
            for await (const chunk of output) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const buffer = Buffer.concat(chunks);
            const uploadResult = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({ folder: "ai_studio_final" }, (error, result) => {
                    if (error) reject(error); else resolve(result);
                }).end(buffer);
            });
            return uploadResult.secure_url;
        }
        return Array.isArray(output) ? output[0] : output;
    } catch (error) {
        console.error("❌ [AI ERROR]:", error.message);
        throw error;
    }
}

// 7. API ROUTES

// ROUTE 1: AI Generation
app.post('/upload', upload.single('image'), async (req, res) => {
    let localFilePath = req.file ? req.file.path : null;
    try {
        const { category, gender } = req.body;
        if (!localFilePath || !category || !gender) return res.status(400).json({ success: false, error: "Missing info!" });

        const cloudinaryResult = await cloudinary.uploader.upload(localFilePath, { folder: 'ai_studio_uploads' });
        const finalAiImageUrl = await runAIFaceSwap(cloudinaryResult.secure_url, category, gender);

        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        res.json({ success: true, ai_image_url: finalAiImageUrl });
    } catch (error) {
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROUTE 2: Razorpay Order (UPDATED)
app.post('/create-order', async (req, res) => {
    const { category, gender, aiImageUrl, userId } = req.body; // Frontend se userId aayegi
    console.log("💰 [PAYMENT] Create Order Request Received!");

    if (!razorpay) return res.status(500).json({ success: false, error: "Payment system offline." });

    try {
        const options = { amount: 5000, currency: "INR", receipt: `rcpt_${Date.now()}` };
        const order = await razorpay.orders.create(options);

        // Save to MongoDB with userId
        await Order.create({
            userId, 
            category,
            gender,
            aiImageUrl,
            razorpayOrderId: order.id,
            status: 'pending'
        });

        res.json(order);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROUTE 3: Razorpay Verification (UPDATED)
app.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString()).digest("hex");

        if (expectedSignature === razorpay_signature) {
            await Order.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id },
                { status: 'completed', razorpayPaymentId: razorpay_payment_id }
            );
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, error: "Verification failed" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROUTE 4: Get User Photos (NEW ROUTE for Dashboard)
app.get('/my-photos', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, error: "User ID required" });

        // Sirf wahi photos lao jo completed hain aur us user ki hain
        const photos = await Order.find({ userId: userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8. GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
    console.error("💥 [CRITICAL ERROR]:", err.stack);
    res.status(500).json({ success: false, error: "Internal Server Error" });
});

// 9. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ [SYSTEM] AI STUDIO ENGINE LIVE AT http://localhost:${PORT}`);
});