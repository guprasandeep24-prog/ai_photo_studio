require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const mongoose = require('mongoose');

const Order = require('./models/Order');
const User = require('./models/User'); 
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// Middleware
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

// Replicate & Cloudinary Config
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Email Setup
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const CATEGORY_NAMES = {
    'linkedin': 'LinkedIn Professional',
    'wedding': 'Wedding Royal Look',
    'fashion': 'Fashion Style',
    'magic-prompt': 'Magic Prompt',
    'magic-portrait': 'Magic Portrait',
    'upscale': '4K Enhanced Photo'
};

// --- HELPER FUNCTIONS ---

function parseReplicateUrl(output) {
    let target = Array.isArray(output) ? output[0] : output;
    if (!target) return null;
    if (typeof target === 'string' && target.startsWith('http')) return target;
    if (target.url && typeof target.url === 'string') return target.url;
    return null;
}

async function sendPhotoEmail(toEmail, imageUrl, category) {
    try {
        const categoryName = CATEGORY_NAMES[category] || 'AI Photo';
        const mailOptions = {
            from: `"AI Photo Studio ✨" <${process.env.EMAIL_USER}>`,
            to: toEmail,
            subject: `✨ Aapki ${categoryName} Photo Ready Hai!`,
            html: `<div style="background:#0f172a;padding:30px;text-align:center;font-family:Arial;">
                    <h2 style="color:white;">🎉 Aapki Photo Ready Hai!</h2>
                    <p style="color:#94a3b8;">${categoryName} transformation complete!</p>
                    <img src="${imageUrl}" width="100%" style="border-radius:16px;border:2px solid #334155;">
                    <br><br><a href="${imageUrl}" style="background:#4f46e5;color:white;padding:12px 24px;text-decoration:none;border-radius:50px;">⬇️ Download Karo</a>
                   </div>`
        };
        await emailTransporter.sendMail(mailOptions);
        console.log(`✅ [EMAIL] Sent to: ${toEmail}`);
    } catch (err) {
        console.error("⚠️ [EMAIL] Error:", err.message);
    }
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- ROUTES ---

app.get('/', (req, res) => res.send("🚀 AI Photo Studio Backend is LIVE!"));

app.post('/register', async (req, res) => {
    try {
        const { email, firebaseUid } = req.body;
        let user = await User.findOne({ firebaseUid });
        if (!user) {
            user = new User({ firebaseUid, email, credits: 5 });
            await user.save();
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// FACE SWAP (LINKEDIN/WEDDING/FASHION)
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, category, gender, templateIndex } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0 || !req.file) return res.status(400).json({ success: false, error: "Invalid request" });
        
        const templates = require('./templates_data')[category][gender];
        const targetImg = templates[parseInt(templateIndex)];

        const uploadRes = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
        const aiImg = await replicate.run("pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a87c1f7af92e2a3b00", {
            input: { target_image: targetImg, swap_image: uploadRes.secure_url }
        });

        const finalImg = parseReplicateUrl(aiImg);
        user.credits -= 1; await user.save();
        const order = new Order({ userId, email, category, aiImageUrl: finalImg, originalImageUrl: uploadRes.secure_url, status: 'completed' });
        await order.save();
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        sendPhotoEmail(email, finalImg, category);
        res.json({ success: true, ai_image_url: finalImg });
    } catch (err) { 
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: err.message }); 
    }
});

// MAGIC PROMPT (Text to Image)
app.post('/magic-prompt', async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0) return res.status(400).json({ success: false, error: "No credits" });

        const output = await replicate.run("black-forest-labs/flux-schnell", {
            input: { prompt: prompt, num_inference_steps: 4 }
        });

        const finalUrl = parseReplicateUrl(output);
        const uploadRes = await cloudinary.uploader.upload(finalUrl, { folder: "magic_prompts" });
        
        user.credits -= 1; await user.save();
        const order = new Order({ userId, email, category: 'magic-prompt', aiImageUrl: uploadRes.secure_url, status: 'completed' });
        await order.save();
        sendPhotoEmail(email, uploadRes.secure_url, 'magic-prompt');

        res.json({ success: true, ai_image_url: uploadRes.secure_url });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// MAGIC PORTRAIT (REMOVED '/api' to match frontend)
app.post('/magic-portrait', upload.single("image"), async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0 || !req.file) return res.status(400).json({ success: false, error: "Invalid Request" });

        const uploadResult = await cloudinary.uploader.upload(req.file.path, { 
            folder: "magic_portrait_inputs" 
        });
        const userImgUrl = uploadResult.secure_url;

        // UPGRADED MODEL: SDXL supports both Image and Prompt perfectly
        const output = await replicate.run(
            "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1d712de7dfea5355252857d2152b0a110d7b", 
            {
                input: {
                    prompt: prompt,
                    image: userImgUrl,
                    refine: "expert_ensemble_refiner",
                    apply_watermark: false
                }
            }
        );

        const finalUrl = parseReplicateUrl(output);
        const finalUpload = await cloudinary.uploader.upload(finalUrl, { folder: "magic_portrait_results" });

        user.credits -= 1; await user.save();
        const order = new Order({ userId, email, category: 'magic-portrait', aiImageUrl: finalUpload.secure_url, status: 'completed' });
        await order.save();

        sendPhotoEmail(email, finalUpload.secure_url, 'magic-portrait').catch(err => console.error(err));

        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.json({ success: true, ai_image_url: finalUpload.secure_url });
    } catch (err) {
        console.error("❌ [MAGIC PORTRAIT ERROR]:", err.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: err.message });
    }
});

// UPSCALE
app.post('/upscale', async (req, res) => {
    try {
        const { userId, email, imageUrl } = req.body;
        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0) return res.status(400).json({ success: false, error: "No credits" });

        // Fast Resizing to save Replicate bandwidth/speed
        const output = await replicate.run("nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b", {
            input: { image: imageUrl, scale: 4, face_enhance: true }
        });

        const upscaledUrl = parseReplicateUrl(output);
        const uploadRes = await cloudinary.uploader.upload(upscaledUrl, { folder: "upscaled_images" });

        user.credits -= 1; await user.save();
        const order = new Order({ userId, email, category: 'upscale', aiImageUrl: uploadRes.secure_url, originalImageUrl: imageUrl, status: 'completed' });
        await order.save();
        res.json({ success: true, ai_image_url: uploadRes.secure_url });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/my-photos', async (req, res) => {
    try {
        const photos = await Order.find({ userId: req.query.userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`));