require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const mongoose = require('mongoose');

// Models & Routes
const Order = require('./models/Order');
const User = require('./models/User'); 
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// --- 1. MIDDLEWARE & CONFIG ---
app.use(cors({
    origin: process.env.CLIENT_URL || '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- 2. DATABASE & AI INITIALIZATION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- 3. STORAGE SETUP (Multer Disk Storage) ---
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

// --- 4. AI CORE LOGIC (The Brain) ---
async function runAIFaceSwap(userCloudinaryUrl, category, gender) {
    const targetImageUrl = TEMPLATES[category][gender] || TEMPLATES['linkedin']['woman'];
    console.log("🤖 [AI] Starting Replicate Face-Swap...");

    try {
        const output = await replicate.run(
            "pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", 
            { 
                input: { 
                    target_image: targetImageUrl, 
                    swap_image: userCloudinaryUrl 
                } 
            }
        );

        // Strategy handling
        if (typeof output === 'string' && output.startsWith('http')) return output;
        if (Array.isArray(output) && output[0]?.startsWith('http')) return output[0];
        if (output && typeof output === 'object') {
            const url = output.output || output.url || output.image;
            if (typeof url === 'string' && url.startsWith('http')) return url;
        }
        // Stream handling
        if (output && typeof output[Symbol.asyncIterator] === 'function') {
            const chunks = [];
            for await (const chunk of output) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
            const buffer = Buffer.concat(chunks);
            const contentString = buffer.toString().trim();
            if (contentString.startsWith('http')) return contentString;
            if (buffer.length > 0) {
                const uploadResult = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream({ folder: "ai_studio_generated" }, (err, res) => {
                        if (err) reject(err); else resolve(res);
                    }).end(buffer);
                });
                return uploadResult.secure_url;
            }
        }
        throw new Error("AI returned unparseable format.");
    } catch (error) {
        console.error("❌ [AI ERROR]:", error.message);
        throw error;
    }
}

// --- 5. ROUTES ---

// Health Check
app.get('/', (req, res) => res.send("🚀 AI Photo Studio Backend is LIVE!"));

// Auth: Register/Login
app.post('/register', async (req, res) => {
    try {
        const { email, firebaseUid } = req.body;
        let user = await User.findOne({ firebaseUid });
        if (!user) {
            user = new User({ firebaseUid, email, credits: 5 });
            await user.save();
            console.log(`🆕 [NEW USER] Registered: ${email}`);
        }
        res.json({ success: true, message: "User ready" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Profile
app.get('/user-profile/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        let user = await User.findOne({ firebaseUid: userId });
        if (!user) {
            user = new User({ firebaseUid: userId, email: "new-user@example.com", credits: 5 });
            await user.save();
        }
        res.json({ success: true, credits: user.credits, email: user.email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// AI Generation (The Engine)
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, mode, category, gender, prompt } = req.body;

        // 1. Validation
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "Insufficient credits!" });

        let aiImageUrl = "";
        let originalImageUrl = "";

        // 2. Execution
        if (mode === 'faceswap') {
            if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });

            // FIXED: Since using diskStorage, use cloudinary.uploader.upload(path)
            const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
            originalImageUrl = uploadResult.secure_url;
            aiImageUrl = await runAIFaceSwap(originalImageUrl, category, gender);

        } else if (mode === 'prompt') {
            const output = await replicate.run("black-forest-labs/flux-schnell", { input: { prompt: prompt } });
            aiImageUrl = Array.isArray(output) ? output[0] : output;
        }

        if (!aiImageUrl) throw new Error("AI Generation failed");

        // 3. Database Update
        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email, category: category || 'magic-prompt',
            aiImageUrl, originalImageUrl, status: 'completed'
        });
        await newOrder.save();

        // 4. Cleanup local file
        if (req.file) fs.unlinkSync(req.file.path);

        res.json({ success: true, ai_image_url: aiImageUrl, original_image_url: originalImageUrl });

    } catch (error) {
        console.error("❌ [UPLOAD ERROR]:", error);
        // Cleanup local file even if error occurs to prevent disk full
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Gallery
app.get('/my-photos', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, error: "userId required" });
        const photos = await Order.find({ userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Payments
app.use('/api/payments', paymentRoutes);

// --- 6. START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`));