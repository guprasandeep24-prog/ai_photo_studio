// 1. Sabse pehle zaroori libraries load karein
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

// 2. Initialization
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 3. Middleware
// Isse replace kijiye (Apne server.js mein)
app.use(cors({
    origin: '*', // Yeh sabhi websites ko permission dega
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// 4. Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 5. Multer Setup (Local storage for temporary upload)
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

// 6. Templates & Prompts Map (Organized by Category & Gender)
// Note: Men ke liye aapko baad mein apni links add karni hongi
const TEMPLATES = {
    'linkedin': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928122/man_suit_template.jpg', 
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231467/front-view-young-attractive-lady-black-jacket-white-shirt-front-table-working-with-laptop-work-business-technologies_rcaqts.jpg'
    },
    'wedding': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928122/man_wedding_template.jpg',
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231455/pexels-skgphotography-29370687_gxzak9.jpg'
    },
    'fashion': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928122/man_fashion_template.jpg',
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231824/indian_woman_fashion_ckkwlf.jpg'
    }
};

// 7. AI Logic Function
async function runAIFaceSwap(userCloudinaryUrl, category, gender) {
    console.log(`🤖 AI STARTING: ${category} mode for ${gender}...`);

    const targetImageUrl = TEMPLATES[category][gender] || TEMPLATES['linkedin']['woman'];

    try {
        console.log("📡 Contacting Replicate...");
        
        // Using your confirmed working Hash ID
        const output = await replicate.run(
            "pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", 
            {
                input: {
                    target_image: targetImageUrl,
                    swap_image: userCloudinaryUrl
                }
            }
        );

        // Handle Stream if returned
        if (output && typeof output[Symbol.asyncIterator] === 'function') {
            console.log("🌊 Processing Stream to Cloudinary...");
            const chunks = [];
            for await (const chunk of output) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const buffer = Buffer.concat(chunks);

            const uploadResult = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({ folder: "ai_studio_final" }, (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }).end(buffer);
            });
            return uploadResult.secure_url;
        }

        return Array.isArray(output) ? output[0] : output;

    } catch (error) {
        console.error("❌ AI Model Error:", error.message);
        throw error;
    }
}

// 8. API Routes

// ROUTE: Main Upload & AI Generation
app.post('/upload', upload.single('image'), async (req, res) => {
    let localFilePath = req.file ? req.file.path : null;

    try {
        const { category, gender } = req.body;

        if (!localFilePath || !category || !gender) {
            return res.status(400).json({ success: false, error: "Missing data (image, category, or gender)!" });
        }

        console.log(`🚀 Request Received: ${category} | ${gender}`);

        // 1. Upload selfie to Cloudinary
        const cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
            folder: 'ai_studio_uploads'
        });
        const userImageUrl = cloudinaryResult.secure_url;

        // 2. Run AI
        const finalAiImageUrl = await runAIFaceSwap(userImageUrl, category, gender);

        // 3. Cleanup local file
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

        res.json({
            success: true,
            ai_image_url: finalAiImageUrl,
            message: "Your photo is ready!"
        });

    } catch (error) {
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        console.error("❌ Server Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROUTE: Razorpay Order Creation
app.post('/create-order', async (req, res) => {
    try {
        const options = {
            amount: 5000, // ₹50.00 (amount in paise)
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error("Razorpay Order Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROUTE: Razorpay Verification
app.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature === razorpay_signature) {
            res.json({ success: true, message: "Payment Verified" });
        } else {
            res.status(400).json({ success: false, error: "Payment verification failed" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 9. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ AI STUDIO ENGINE LIVE AT http://localhost:${PORT}`);
});