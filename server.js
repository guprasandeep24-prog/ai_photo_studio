require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const mongoose = require('mongoose');

// 1. Models Import
const Order = require('./models/Order');
const User = require('./models/User'); 
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// 2. Middleware (ORDER IS VERY IMPORTANT!)
// CORS ko sabse upar rakhiye taaki koi error na aaye
app.use(cors()); 
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// 3. Initialization
console.log("🛠️ [SYSTEM] Initializing AI Studio Server...");

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

const TEMPLATES = {
    'linkedin': { 'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928122/smiling-businessman-with-arms-crossed_dalfak.jpg', 'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781527213/linkdin_ceo_woman1_p0hoc3.jpg' },
    'wedding': { 'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928082/Wedding_qq5pyd.jpg', 'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231450/pexels-creative-studio-830123672-19376431_mancpc.jpg' },
    'fashion': { 'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781238420/man_fashion_image_repevi.jpg', 'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231824/indian_woman_fashion_ckkwlf.jpg' }
};

// 4. AI Logic
async function runAIFaceSwap(userCloudinaryUrl, category, gender) {
    const targetImageUrl = TEMPLATES[category][gender] || TEMPLATES['linkedin']['woman'];
    const output = await replicate.run("pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", { input: { target_image: targetImageUrl, swap_image: userCloudinaryUrl } });
    if (output && typeof output[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        for await (const chunk of output) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
        const buffer = Buffer.concat(chunks);
        const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ folder: "ai_studio_final" }, (error, result) => {
                if (error) reject(error); else resolve(result);
            }).end(buffer);
        });
        return uploadResult.secure_url;
    }
    return Array.isArray(output) ? output[0] : output;
}

// 5. ROUTES
// 🚀 ROUTE 1: AI Generation
app.post('/upload', upload.single('image'), async (req, res) => {
    console.log("📥 [UPLOAD] Received request for /upload");
    let localFilePath = req.file ? req.file.path : null;
    try {
        const { category, gender, userId } = req.body;
        if (!localFilePath || !category || !gender || !userId) {
            console.log("❌ [UPLOAD] Missing fields:", { localFilePath, category, gender, userId });
            return res.status(400).json({ success: false, error: "Missing info or User ID!" });
        }

        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits < 1) {
            return res.status(402).json({ success: false, error: "Insufficient credits!" });
        }

        const cloudinaryResult = await cloudinary.uploader.upload(localFilePath, { folder: 'ai_studio_uploads' });
        const finalAiImageUrl = await runAIFaceSwap(cloudinaryResult.secure_url, category, gender);

        user.credits -= 1;
        await user.save();

        await Order.create({ userId, category, gender, aiImageUrl: finalAiImageUrl, status: 'completed', razorpayOrderId: 'N/A' });

        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        res.json({ success: true, ai_image_url: finalAiImageUrl, remainingCredits: user.credits });
    } catch (error) {
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 ROUTE 2: Payments
app.use('/api/payments', paymentRoutes);

// 🚀 ROUTE 3: Profile
app.get('/user-profile/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.params.userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        res.json({ success: true, credits: user.credits, email: user.email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 ROUTE 4: Gallery
app.get('/my-photos', async (req, res) => {
    try {
        const { userId } = req.query;
        const photos = await Order.find({ userId: userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🛠️ DEBUGGING: Print all registered routes on startup
app.listen(process.env.PORT || 5000, () => {
    console.log(`✅ [SYSTEM] AI STUDIO ENGINE LIVE AT http://localhost:${process.env.PORT || 5000}`);
    console.log("📜 REGISTERED ROUTES:");
    console.log("- POST /upload");
    console.log("- GET  /user-profile/:userId");
    console.log("- GET  /my-photos");
    console.log("- /api/payments (handled by paymentRoutes)");
});