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

// --- 1. CORS CONFIGURATION ---
app.use(cors({
    origin: process.env.CLIENT_URL || '*', // Use environment variable for production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- 2. DATABASE & AI INIT ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- 3. STORAGE SETUP ---
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

        // Strategy 1: Direct String
        if (typeof output === 'string' && output.startsWith('http')) return output;

        // Strategy 2: Array
        if (Array.isArray(output) && output[0]?.startsWith('http')) return output[0];

        // Strategy 3: Object
        if (output && typeof output === 'object') {
            const url = output.output || output.url || output.image;
            if (typeof url === 'string' && url.startsWith('http')) return url;
        }

        // Strategy 4: Stream/Buffer handling
        if (output && typeof output[Symbol.asyncIterator] === 'function') {
            const chunks = [];
            for await (const chunk of output) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
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

        throw new Error("AI failed to return a valid image URL.");
    } catch (error) {
        console.error("❌ [AI ERROR]:", error.message);
        throw error;
    }
}

// --- 5. ROUTES ---
// 🚀 ROUTE: Register User (Auto-create MongoDB profile)
app.post('/register', async (req, res) => {
    try {
        const { email, firebaseUid } = req.body;
        let user = await User.findOne({ firebaseUid });

        if (!user) {
            user = new User({
                firebaseUid: firebaseUid,
                email: email,
                credits: 5 // Welcome credits!
            });
            await user.save();
            console.log(`🆕 [NEW USER] Registered: ${email}`);
        }
        res.json({ success: true, message: "User registered/logged in" });
    } catch (error) {
        console.error("❌ [REGISTER ERROR]:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => res.send("🚀 AI Photo Studio Backend is LIVE!"));

app.use('/api/payments', paymentRoutes);

// Profile Route (Auto-Registration)
app.get('/user-profile/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        let user = await User.findOne({ firebaseUid: userId });

        if (!user) {
            console.log(`🆕 [NEW USER] Auto-creating: ${userId}`);
            user = new User({ firebaseUid: userId, email: "new-user@example.com", credits: 5 });
            await user.save();
        }
        res.json({ success: true, credits: user.credits, email: user.email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Gallery Route
app.get('/my-photos', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, error: "userId required" });

        let user = await User.findOne({ firebaseUid: userId });
        if (!user) {
            user = new User({ firebaseUid: userId, email: "new-user@example.com", credits: 5 });
            await user.save();
        }

        const photos = await Order.find({ userId: userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 6. SERVER START ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`);
});