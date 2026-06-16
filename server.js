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

const app = express();

// 1. Initialization & Deep Debugging
console.log("🛠️ [SYSTEM] Initializing AI Studio Server...");

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

// Razorpay Initialization with extreme safety
let razorpay;
try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.error("❌ [CRITICAL] Razorpay Keys are MISSING in Environment Variables!");
    } else {
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        console.log("✅ [SYSTEM] Razorpay Initialized Successfully");
    }
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
    console.log(`🤖 [AI] Starting: ${category} for ${gender}...`);
    const targetImageUrl = TEMPLATES[category][gender] || TEMPLATES['linkedin']['woman'];

    try {
        console.log("📡 [AI] Contacting Replicate API...");
        const output = await replicate.run(
            "pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", 
            {
                input: {
                    target_image: targetImageUrl,
                    swap_image: userCloudinaryUrl
                }
            }
        );

        if (output && typeof output[Symbol.asyncIterator] === 'function') {
            console.log("🌊 [AI] Processing Stream to Cloudinary...");
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

// Health Check Route (Very useful for monitoring)
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK", message: "Server is running smoothly" });
});

// ROUTE 1: AI Generation
app.post('/upload', upload.single('image'), async (req, res) => {
    let localFilePath = req.file ? req.file.path : null;
    try {
        const { category, gender } = req.body;
        if (!localFilePath || !category || !gender) {
            return res.status(400).json({ success: false, error: "Missing required info (image, category, or gender)!" });
        }

        console.log(`🚀 [UPLOAD] Processing: ${category} | ${gender}`);

        // 1. Upload Selfie
        const cloudinaryResult = await cloudinary.uploader.upload(localFilePath, { folder: 'ai_studio_uploads' });
        
        // 2. Run AI
        const finalAiImageUrl = await runAIFaceSwap(cloudinaryResult.secure_url, category, gender);

        // 3. Cleanup
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

        console.log("✅ [UPLOAD] Success! Image ready.");
        res.json({ success: true, ai_image_url: finalAiImageUrl });
    } catch (error) {
        console.error("❌ [UPLOAD ERROR]:", error.message);
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROUTE 2: Razorpay Order
app.post('/create-order', async (req, res) => {
    console.log("💰 [PAYMENT] Create Order Request Received!");

    if (!razorpay) {
        console.error("❌ [PAYMENT ERROR] Razorpay instance not available!");
        return res.status(500).json({ success: false, error: "Payment system is offline." });
    }

    try {
        const options = { 
            amount: 5000, // ₹50.00
            currency: "INR", 
            receipt: `rcpt_${Date.now()}` 
        };

        console.log("📡 [PAYMENT] Contacting Razorpay...");
        const order = await razorpay.orders.create(options);
        
        console.log("✅ [PAYMENT] Order Created:", order.id);
        res.json(order);

    } catch (error) {
        console.error("❌ [RAZORPAY API ERROR]:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Razorpay failed to create order." 
        });
    }
});

// ROUTE 3: Razorpay Verification
app.post('/verify-payment', async (req, res) => {
    console.log("🔐 [PAYMENT] Verifying Signature...");
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        
        if (!process.env.RAZORPAY_KEY_SECRET) {
            throw new Error("Server configuration error: Razorpay Secret missing.");
        }

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature === razorpay_signature) {
            console.log("✅ [PAYMENT] Verified Successfully!");
            res.json({ success: true });
        } else {
            console.warn("⚠️ [PAYMENT] Signature mismatch detected!");
            res.status(400).json({ success: false, error: "Verification failed: Invalid signature." });
        }
    } catch (error) {
        console.error("❌ [VERIFICATION ERROR]:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8. GLOBAL ERROR HANDLER (The "Anti-Crash" Shield)
app.use((err, req, res, next) => {
    console.error("💥 [CRITICAL SYSTEM ERROR]:", err.stack);
    res.status(500).json({ 
        success: false, 
        error: "A critical server error occurred. Check logs." 
    });
});

// 9. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ [SYSTEM] AI STUDIO ENGINE LIVE AT http://localhost:${PORT}`);
});