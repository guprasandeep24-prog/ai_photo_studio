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

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

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
        throw new Error("AI returned unparseable format");
    } catch (error) {
        console.error("❌ [AI ERROR]:", error.message);
        throw error;
    }
}

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

app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, category, gender, templateIndex } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "Insufficient credits!" });
        if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });
        
        const selectedTemplates = TEMPLATES[category][gender];
        const idx = parseInt(templateIndex);
        if (!selectedTemplates || idx < 0 || idx >= selectedTemplates.length) {
            return res.status(400).json({ success: false, error: "Invalid Template" });
        }
        const targetImageUrl = selectedTemplates[idx];

        const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
        const originalImageUrl = uploadResult.secure_url;

        const aiImageUrl = await runAIFaceSwap(originalImageUrl, targetImageUrl);

        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email, category, gender,
            aiImageUrl, originalImageUrl, status: 'completed'
        });
        await newOrder.save();

        if (req.file) fs.unlinkSync(req.file.path);
        res.json({ success: true, ai_image_url: aiImageUrl, original_image_url: originalImageUrl });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/magic-prompt', async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0 || !prompt) {
            return res.status(400).json({ success: false, error: "Invalid request or no credits" });
        }

        const output = await replicate.run("black-forest-labs/flux-schnell", { input: { prompt } });
        let finalImageUrl = "";
        let target = Array.isArray(output) ? output[0] : output;

        if (typeof target === 'string' && target.startsWith('http')) {
            finalImageUrl = target;
        } else {
            throw new Error("Failed to get image URL");
        }

        // Ensure permanent URL via Cloudinary
        let permanentUrl = finalImageUrl;
        if (!finalImageUrl.includes('cloudinary.com')) {
            const uploadResult = await cloudinary.uploader.upload(finalImageUrl, { folder: "magic_prompts" });
            permanentUrl = uploadResult.secure_url;
        }

        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email, category: 'magic-prompt', aiImageUrl: permanentUrl, originalImageUrl: "", status: 'completed'
        });
        await newOrder.save();

        res.json({ success: true, ai_image_url: permanentUrl });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ NEW: 4K UPSCALE ROUTE (FIX - ye route pehle missing tha!)
app.post('/upscale', async (req, res) => {
    try {
        const { userId, email, imageUrl } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "Insufficient credits!" });
        if (!imageUrl) return res.status(400).json({ success: false, error: "No image URL provided" });

        console.log("✨ [UPSCALE] Starting 4K Enhancement...");

        // Real-ESRGAN model for 4x upscaling with face enhancement
        const output = await replicate.run(
            "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
            { input: { image: imageUrl, scale: 4, face_enhance: true } }
        );

        let upscaledUrl = typeof output === 'string' ? output
            : Array.isArray(output) ? output[0]
            : (output && output.url ? output.url : null);

        if (!upscaledUrl) throw new Error("Upscaling returned no result");

        // Save permanently to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(upscaledUrl, { folder: "upscaled_images" });
        const permanentUrl = uploadResult.secure_url;

        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email: email || "unknown@user.com",
            category: 'upscale', aiImageUrl: permanentUrl,
            originalImageUrl: imageUrl, status: 'completed'
        });
        await newOrder.save();

        console.log("✅ [UPSCALE] Done:", permanentUrl);
        res.json({ success: true, ai_image_url: permanentUrl });

    } catch (error) {
        console.error("❌ [UPSCALE ERROR]:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ NEW: MAGIC PORTRAIT ROUTE (FIX - ye route pehle missing tha!)
// Flow: User photo upload → Generate AI scene from prompt → Face swap into scene
app.post('/magic-portrait', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "Insufficient credits!" });
        if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });
        if (!prompt) return res.status(400).json({ success: false, error: "Prompt is required" });

        console.log("🎭 [MAGIC PORTRAIT] Starting transformation for:", userId);

        // Step 1: Upload user's selfie to Cloudinary
        const userUpload = await cloudinary.uploader.upload(req.file.path, { folder: "portrait_inputs" });
        const userImageUrl = userUpload.secure_url;
        console.log("📸 [MAGIC PORTRAIT] User photo uploaded:", userImageUrl);

        // Step 2: Generate a scene/background using flux-schnell from the prompt
        const sceneOutput = await replicate.run("black-forest-labs/flux-schnell", { 
            input: { prompt: prompt, num_outputs: 1, num_inference_steps: 4 }
        });
        let sceneUrl = Array.isArray(sceneOutput) ? sceneOutput[0] : sceneOutput;
        if (typeof sceneUrl !== 'string' || !sceneUrl.startsWith('http')) {
            throw new Error("Scene generation from prompt failed");
        }
        console.log("🎨 [MAGIC PORTRAIT] Scene generated:", sceneUrl);

        // Step 3: Face swap user's face into the generated scene
        const faceSwappedUrl = await runAIFaceSwap(userImageUrl, sceneUrl);
        console.log("🔄 [MAGIC PORTRAIT] Face swap done:", faceSwappedUrl);

        // Step 4: Save result permanently in Cloudinary
        const finalUpload = await cloudinary.uploader.upload(faceSwappedUrl, { folder: "magic_portraits" });
        const permanentUrl = finalUpload.secure_url;

        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email: email || "unknown@user.com",
            category: 'magic-portrait', gender: 'any',
            aiImageUrl: permanentUrl, originalImageUrl: userImageUrl, status: 'completed'
        });
        await newOrder.save();

        if (req.file) fs.unlinkSync(req.file.path);
        console.log("✅ [MAGIC PORTRAIT] Complete:", permanentUrl);
        res.json({ success: true, ai_image_url: permanentUrl, original_image_url: userImageUrl });

    } catch (error) {
        console.error("❌ [MAGIC PORTRAIT ERROR]:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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
const server = app.listen(PORT, () => console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`));

server.timeout = 300000; // 5 Minutes
