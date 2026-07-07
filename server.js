require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const mongoose = require('mongoose');

// Models (Ensure these files exist in your /models folder)
const Order = require('./models/Order');
const User = require('./models/User'); 
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// ✅ FIXED: Using ONLY clean model slugs as per your instruction
const AI_MODELS = {
    MAGIC_PORTRAIT: "tencentarc/photomaker", 
    FACESWAP: "lucataco/faceswap", 
    MAGIC_PROMPT: "stability-ai/sdxl"
};

// --- MIDDLEWARES ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// --- CLOUDINARY CONFIG ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- TEMPLATE DATA ---
const TEMPLATES = {
    'linkedin': { 
        'man': [
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396313/linkdin_ceo_man2_lcz3pr.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396319/linkdin_ceo_man1_kyl019.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475527/6manceo_nlnqtb.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475517/7manceo_cyjhce.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475510/5manceo_n4lmd3.jpg'
        ], 
        'woman': [
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396312/linkdin_ceo_woman1_b7te2c.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475519/6ladisceo_ol7rrf.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475510/5ladisceo_ypnjv8.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475510/7ladisceo_vqq6bt.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782476890/womanceo5_xyaguv.jpg'
        ] 
    },
    'wedding': { 
        'man': [
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396313/wedding_man_y6wpzx.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782476491/man_wedding4_mlu9pn.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782476491/man_wedding2_oze1yw.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782476491/man_wedding5_q3sffj.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782476500/man_wedding3_yybehx.jpg'
        ], 
        'woman': [
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396312/Wedding_ladis1_hag27g.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396313/wedding_ladies2_pzl1ky.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396306/wedding_ladies3_fodvpi.png',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475506/ladis_wedding7_mlwije.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475502/wedding_ladis5_hu89ax.jpg'
        ] 
    },
    'fashion': { 
        'man': [
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396314/man_fashion_image_pbxhpj.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475517/4manfashion_xnmmis.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475490/3mainfashion_b1g93r.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475486/2manfashion_qwuq46.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475485/1man_fashion_ysxyj6.jpg'
        ], 
        'woman': [
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396307/indian_woman_fashion_fak0sy.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475513/7ladisfashion_g0dzz3.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475506/9ladisfashion_fqedqe.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475503/8ladisfashion_tfkxfl.jpg',
            'https://res.cloudinary.com/dh8klfp1s/image/upload/v1782475494/6ladiesfashion_jcmgzk.jpg'
        ] 
    }
};

// --- MULTER SETUP ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- 🚀 POWERHOUSE UTILITY: REPLICATE STREAM TO CLOUDINARY ---
async function handleReplicateStream(output, folder) {
    if (!output) throw new Error("AI returned no data.");

    // Case 1: Already a string (URL)
    if (typeof output === 'string' && output.startsWith('http')) return output;

    // Case 2: Array of strings
    if (Array.isArray(output)) {
        const url = output.find(item => typeof item === 'string' && item.startsWith('http'));
        if (url) return url;
    }

    // Case 3: Stream (The core fix using Buffer.concat)
    if (output && typeof output[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        for await (const chunk of output) { 
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); 
        }
        const buffer = Buffer.concat(chunks);
        
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder },
                (error, result) => (error ? reject(error) : resolve(result.secure_url))
            );
            uploadStream.end(buffer);
        });
    }

    // Case 4: Deep Search for nested objects (Extremely robust)
    const findUrlDeep = (obj) => {
        if (typeof obj === 'string' && obj.startsWith('http')) return obj;
        if (typeof obj === 'object' && obj !== null) {
            for (let key in obj) {
                const found = findUrlDeep(obj[key]);
                if (found) return found;
            }
        }
        return null;
    };

    const deepFound = findUrlDeep(output);
    if (deepFound) return deepFound;

    throw new Error("AI output format not recognized.");
}

// --- 🚀 API ROUTES ---

app.get('/', (req, res) => res.send("🚀 AI Photo Studio Backend is LIVE!"));
app.get('/templates', (req, res) => { res.json(TEMPLATES); });

app.post('/register', async (req, res) => {
    try {
        const { email, firebaseUid } = req.body;
        let user = await User.findOne({ firebaseUid });
        if (!user) {
            user = new User({ firebaseUid, email, credits: 5 });
            await user.save();
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

/**
 * [FINAL & STABLE] MAGIC PORTRAIT ROUTE
 * Model: stability-ai/sdxl (Most reliable in the industry)
 * Method: Img2Img (Keeps structure, changes style/clothes/background)
 */
app.post('/magic-portrait', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        const user = await User.findOne({ firebaseUid: userId });

        if (!user || user.credits <= 0 || !prompt || !req.file) {
            return res.status(400).json({ success: false, error: "Insufficient credits or missing data" });
        }

        console.log(`✨ [MAGIC PORTRAIT] Attempting SDXL Img2Img for: ${email}`);

        // 1. Upload original photo to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
        const userImageUrl = uploadResult.secure_url;

        // 2. AI Magic (Using SDXL - Guaranteed to work with Clean Slug)
        // We use prompt_strength (0.4 to 0.6) to balance between "Original Face" and "New Style"
        const output = await replicate.run(
            "stability-ai/sdxl", 
            { 
                input: { 
                    image: userImageUrl, 
                    prompt: prompt, 
                    prompt_strength: 0.5, // CRITICAL: 0.5 maintains identity while changing style
                    refine: "expert_ensemble_refiner",
                    apply_watermark: false,
                    num_outputs: 1
                } 
            }
        );

        // 3. Handle Stream (Using your existing robust function)
        const finalImageUrl = await handleReplicateStream(output, "magic_portraits");

        // 4. Update Credits & Save Order
        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, 
            email, 
            category: 'magic-portrait', 
            aiImageUrl: finalImageUrl, 
            originalImageUrl: userImageUrl, 
            status: 'completed'
        });
        await newOrder.save();

        // Cleanup local file
        if (req.file) fs.unlinkSync(req.file.path);

        console.log("✅ [MAGIC PORTRAIT] Success!");
        res.json({ success: true, ai_image_url: finalImageUrl });

    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        console.error("❌ [MAGIC PORTRAIT FINAL ERROR]:", error.message);
        res.status(500).json({ success: false, error: "AI Engine busy. Please try again in a moment." });
    }
});

/**
 * FACE SWAP ROUTE (Using Templates)
 */
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, category, gender, templateIndex } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0 || !req.file) return res.status(400).json({ success: false, error: "Invalid request" });
        
        const selectedTemplates = TEMPLATES[category][gender];
        const targetImageUrl = selectedTemplates[parseInt(templateIndex)];

        const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
        const originalImageUrl = uploadResult.secure_url;

        // AI Face Swap Call
        const output = await replicate.run(AI_MODELS.FACESWAP, { 
            input: { target_image: targetImageUrl, swap_image: originalImageUrl } 
        });
        const aiImageUrl = await handleReplicateStream(output, "ai_studio_faceswap");

        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email, category, gender, aiImageUrl, originalImageUrl, status: 'completed'
        });
        await newOrder.save();

        if (req.file) fs.unlinkSync(req.file.path);
        res.json({ success: true, ai_image_url: aiImageUrl, original_image_url: originalImageUrl });

    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * MAGIC PROMPT ROUTE (Text-to-Image)
 */
app.post('/magic-prompt', async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0 || !prompt) return res.status(400).json({ success: false, error: "Invalid request" });

        const output = await replicate.run(AI_MODELS.MAGIC_PROMPT, { input: { prompt } });
        const finalImageUrl = await handleReplicateStream(output, "magic_prompts");

        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email, category: 'magic-prompt', aiImageUrl: finalImageUrl, originalImageUrl: "", status: 'completed'
        });
        await newOrder.save();

        res.json({ success: true, ai_image_url: finalImageUrl });
    } catch (error) {
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