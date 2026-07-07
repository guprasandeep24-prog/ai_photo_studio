require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const mongoose = require('mongoose');

// Models
const Order = require('./models/Order');
const User = require('./models/User'); 
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// --- 🏗️ ARCHITECT'S CONFIGURATION ---
// YOU KEEP ONLY CLEAN SLUGS HERE. No hashes. 
// This makes your code clean and easy to read.
const AI_MODELS = {
    MAGIC_PORTRAIT: "tencentarc/photomaker", 
    FACESWAP: "lucataco/faceswap", 
    MAGIC_PROMPT: "stability-ai/sdxl"
};

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// --- 🛠️ THE SMART-RUNNER ENGINE (The Secret Sauce) ---
/**
 * This function takes a CLEAN SLUG (like 'tencentarc/photomaker'),
 * automatically finds the LATEST valid version from Replicate,
 * and then runs it. This prevents both 404 and 422 errors.
 */
async function runSmartAI(modelSlug, input) {
    console.log(`🔍 [SMART-RUNNER] Resolving latest version for: ${modelSlug}`);
    
    // 1. Fetch the model details using the clean slug
    const model = await replicate.models.get(modelSlug);
    
    if (!model || !model.versions || model.versions.length === 0) {
        throw new Error(`Model ${modelSlug} not found or has no versions.`);
    }

    // 2. Get the most recent version ID (This is the magic part)
    const latestVersionId = model.versions[0].id;
    console.log(`✅ [SMART-RUNNER] Found latest version: ${latestVersionId}`);

    // 3. Run the prediction with the dynamic ID
    return await replicate.run(latestVersionId, { input });
}

// --- MIDDLEWARES & CONFIG ---
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI).then(() => console.log("✅ [DATABASE] Connected"));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const TEMPLATES = {
    'linkedin': { 'man': ['https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396313/linkdin_ceo_man2_lcz3pr.jpg'], 'woman': ['https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396312/linkdin_ceo_woman1_b7te2c.jpg'] },
    'wedding': { 'man': ['https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396313/wedding_man_y6wpzx.jpg'], 'woman': ['https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396312/Wedding_ladis1_hag27g.jpg'] },
    'fashion': { 'man': ['https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396314/man_fashion_image_pbxhpj.jpg'], 'woman': ['https://res.cloudinary.com/dh8klfp1s/image/upload/v1782396307/indian_woman_fashion_fak0sy.jpg'] }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => { if (!fs.existsSync('uploads/')) fs.mkdirSync('uploads/'); cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// Robust Stream Handler
async function handleReplicateStream(output, folder) {
    if (typeof output === 'string' && output.startsWith('http')) return output;
    if (Array.isArray(output)) return output[0];

    if (output && typeof output[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        for await (const chunk of output) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
        const buffer = Buffer.concat(chunks);
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ folder }, (err, res) => err ? reject(err) : resolve(res.secure_url));
            stream.end(buffer);
        });
    }
    
    // Deep Search fallback
    const findUrl = (obj) => {
        if (typeof obj === 'string' && obj.startsWith('http')) return obj;
        if (obj && typeof obj === 'object') {
            for (let k in obj) { const f = findUrl(obj[k]); if (f) return f; }
        }
        return null;
    };
    const res = findUrl(output);
    if (res) return res;
    throw new Error("Output not found");
}

// --- ROUTES ---

app.post('/magic-portrait', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0 || !prompt || !req.file) return res.status(400).json({ success: false, error: "Invalid data" });

        const uploadRes = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
        
        // Use the Smart Runner! It will find the ID for "tencentarc/photomaker" automatically
        const output = await runSmartAI(AI_MODELS.MAGIC_PORTRAIT, { 
            input_image: uploadRes.secure_url, 
            prompt: prompt,
            num_outputs: 1
        });

        const finalImageUrl = await handleReplicateStream(output, "magic_portraits");

        user.credits -= 1;
        await user.save();

        await new Order({ userId, email, category: 'magic-portrait', aiImageUrl: finalImageUrl, originalImageUrl: uploadRes.secure_url, status: 'completed' }).save();

        if (req.file) fs.unlinkSync(req.file.path);
        res.json({ success: true, ai_image_url: finalImageUrl });
    } catch (err) {
        if (req.file) fs.unlinkSync(req.file.path);
        console.error("❌ [MAGIC ERROR]:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, category, gender, templateIndex } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0 || !req.file) return res.status(400).json({ success: false, error: "Invalid request" });

        const targetImageUrl = TEMPLATES[category][gender][parseInt(templateIndex)];
        const uploadRes = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });

        const output = await runSmartAI(AI_MODELS.FACESWAP, { target_image: targetImageUrl, swap_image: uploadRes.secure_url });
        const aiImageUrl = await handleReplicateStream(output, "ai_studio_faceswap");

        user.credits -= 1;
        await user.save();

        await new Order({ userId, email, category, gender, aiImageUrl, originalImageUrl: uploadRes.secure_url, status: 'completed' }).save();

        if (req.file) fs.unlinkSync(req.file.path);
        res.json({ success: true, ai_image_url: aiImageUrl, original_image_url: uploadRes.secure_url });
    } catch (err) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/magic-prompt', async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0 || !prompt) return res.status(400).json({ success: false, error: "Invalid request" });

        const output = await runSmartAI(AI_MODELS.MAGIC_PROMPT, { prompt });
        const finalImageUrl = await handleReplicateStream(output, "magic_prompts");

        user.credits -= 1;
        await user.save();
        await new Order({ userId, email, category: 'magic-prompt', aiImageUrl: finalImageUrl, originalImageUrl: "", status: 'completed' }).save();

        res.json({ success: true, ai_image_url: finalImageUrl });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/templates', (req, res) => res.json(TEMPLATES));
app.get('/user-profile/:userId', async (req, res) => {
    let user = await User.findOne({ firebaseUid: req.params.userId });
    if (!user) user = await User.create({ firebaseUid: req.params.userId, email: "new@user.com", credits: 5 });
    res.json({ success: true, credits: user.credits, email: user.email });
});
app.use('/api/payments', paymentRoutes);
app.get('/my-photos', async (req, res) => {
    const photos = await Order.find({ userId: req.query.userId, status: 'completed' }).sort({ createdAt: -1 });
    res.json(photos);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`));