require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const mongoose = require('mongoose');

const Order = require('./models/Order');
const User = require('./models/User'); 
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- TEMPLATES CONFIGURATION (Update these with your REAL Cloudinary URLs) ---
const TEMPLATES = {
    'linkedin': { 
        'man': [
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/man_1.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/man_2.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/man_3.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/man_4.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/man_5.jpg'
        ], 
        'woman': [
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/woman_1.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/woman_2.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/woman_3.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/woman_4.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/linkedin/woman_5.jpg'
        ] 
    },
    'wedding': { 
        'man': [
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/man_1.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/man_2.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/man_3.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/man_4.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/man_5.jpg'
        ], 
        'woman': [
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/woman_1.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/woman_2.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/woman_3.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/woman_4.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/wedding/woman_5.jpg'
        ] 
    },
    'fashion': { 
        'man': [
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/man_1.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/man_2.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/man_3.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/man_4.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/man_5.jpg'
        ], 
        'woman': [
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/woman_1.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/woman_2.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/woman_3.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/woman_4.jpg',
            'https://res.cloudinary.com/your_name/image/upload/v1/fashion/woman_5.jpg'
        ] 
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- AI CORE LOGIC ---
async function runAIFaceSwap(userCloudinaryUrl, targetImageUrl) {
    console.log("🤖 [AI] Starting Replicate Face-Swap...");
    try {
        const output = await replicate.run(
            "pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", 
            { input: { target_image: targetImageUrl, swap_image: userCloudinaryUrl } }
        );

        if (typeof output === 'string' && output.startsWith('http')) return output;
        if (Array.isArray(output) && output.length > 0) return output[0];
        if (output && typeof output === 'object') {
            const urlFromObj = output.output || output.url || output.image;
            if (typeof urlFromObj === 'string' && urlFromObj.startsWith('http')) return urlFromObj;
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
                    cloudinary.uploader.upload_stream({ folder: "ai_studio_generated" }, (error, result) => {
                        if (error) reject(error); else resolve(result);
                    }).end(buffer);
                });
                return uploadResult.secure_url;
            }
        }
        throw new Error("AI returned unparseable format");
    } catch (error) {
        console.error("❌ [AI ERROR]:", error.message);
        throw error;
    }
}

// --- ROUTES ---

app.get('/', (req, res) => res.send("🚀 AI Photo Studio Backend (Multi-Template Mode) is LIVE!"));

// 🚀 NEW ROUTE: Get all templates for frontend
app.get('/templates', (req, res) => {
    res.json(TEMPLATES);
});

app.post('/register', async (req, res) => {
    try {
        const { email, firebaseUid } = req.body;
        let user = await User.findOne({ firebaseUid });
        if (!user) {
            user = new User({ firebaseUid, email, credits: 5 });
            await user.save();
            console.log(`🆕 [NEW USER] Registered: ${email}`);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use('/api/payments', paymentRoutes);

app.get('/user-profile/:userId', async (req, res) => {
    try {
        let user = await User.findOne({ firebaseUid: req.params.userId });
        if (!user) {
            user = new User({ firebaseUid: req.params.userId, email: "new@user.com", credits: 5 });
            await user.save();
        }
        res.json({ success: true, credits: user.credits, email: user.email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 UPDATED: Upload Route (Handles Template Selection)
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, category, gender, templateIndex } = req.body;
        
        // 1. Validation
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "Insufficient credits!" });
        if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });
        if (!category || !gender || templateIndex === undefined) {
            return res.status(400).json({ success: false, error: "Category, Gender, and Template are required" });
        }

        // 2. Pick the correct template URL using the index
        const selectedTemplates = TEMPLATES[category][gender];
        const idx = parseInt(templateIndex);

        if (!selectedTemplates || idx < 0 || idx >= selectedTemplates.length) {
            return res.status(400).json({ success: false, error: "Invalid Template Selected" });
        }
        const targetImageUrl = selectedTemplates[idx];

        // 3. Upload original image to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
        const originalImageUrl = uploadResult.secure_url;

        // 4. Run Face-Swap AI
        const aiImageUrl = await runAIFaceSwap(originalImageUrl, targetImageUrl);

        // 5. Deduct Credit
        user.credits -= 1;
        await user.save();

        // 6. Save Order
        const newOrder = new Order({
            userId: userId,
            email: email,
            category: category,
            gender: gender,
            aiImageUrl: aiImageUrl,
            originalImageUrl: originalImageUrl,
            status: 'completed'
        });
        await newOrder.save();

        // 7. Cleanup local file
        if (req.file) fs.unlinkSync(req.file.path);

        // 8. Send Response
        res.json({ 
            success: true, 
            ai_image_url: aiImageUrl, 
            original_image_url: originalImageUrl 
        });

    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        console.error("❌ [UPLOAD ERROR]:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/my-photos', async (req, res) => {
    try {
        const photos = await Order.find({ userId: req.query.userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`));