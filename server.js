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

function extractUrl(output) {
    if (!output) return "";
    if (typeof output === 'string') return output.startsWith('http') ? output : "";
    if (Array.isArray(output) && output.length > 0) return extractUrl(output[0]);
    if (typeof output === 'object') {
        const keys = ['url', 'output', 'image', 'secure_url'];
        for (let key of keys) {
            if (output[key] && typeof output[key] === 'string' && output[key].startsWith('http')) return output[key];
        }
    }
    return "";
}

// --- ROUTES ---

app.get('/', (req, res) => res.send("🚀 Backend Live"));

// 🚀 ROUTE 1: FACE-SWAP (Uses Multer for File + Text)
app.post('/api/upload-faceswap', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, category, gender } = req.body;
        console.log("🔄 Face-Swap Request received for:", email);

        if (!userId || !req.file) return res.status(400).json({ success: false, error: "Missing UserID or Image" });

        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0) return res.status(400).json({ success: false, error: "No credits!" });

        const uploadRes = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
        const originalImageUrl = uploadRes.secure_url;

        const targetImageUrl = TEMPLATES[category][gender] || TEMPLATES['linkedin']['woman'];
        const output = await replicate.run(
            "pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", 
            { input: { target_image: targetImageUrl, swap_image: originalImageUrl } }
        );

        const aiImageUrl = extractUrl(output);
        if (!aiImageUrl) throw new Error("AI returned invalid URL");

        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email, category, gender, aiImageUrl, originalImageUrl, status: 'completed'
        });
        await newOrder.save();

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.json({ success: true, ai_image_url: aiImageUrl, original_image_url: originalImageUrl });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        console.error("❌ [FACE-SWAP ERROR]:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 ROUTE 2: MAGIC PROMPT (Uses upload.none() to parse FormData text)
app.post('/api/upload-prompt', upload.none(), async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;
        console.log("🪄 [AI] Magic Prompt Request for:", email);

        if (!userId || !prompt) return res.status(400).json({ success: false, error: "Missing UserID or Prompt" });

        const user = await User.findOne({ firebaseUid: userId });
        if (!user || user.credits <= 0) return res.status(400).json({ success: false, error: "No credits!" });

        const output = await replicate.run("black-forest-labs/flux-schnell", { input: { prompt: prompt } });
        const aiImageUrl = extractUrl(output);

        if (!aiImageUrl) throw new Error("AI returned invalid URL");

        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email, category: 'magic-prompt', aiImageUrl, status: 'completed'
        });
        await newOrder.save();

        res.json({ success: true, ai_image_url: aiImageUrl });

    } catch (error) {
        console.error("❌ [PROMPT ERROR]:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Other routes (Auth, Profile, Gallery, Payments)
app.post('/register', async (req, res) => {
    try {
        const { email, firebaseUid } = req.body;
        let user = await User.findOne({ firebaseUid });
        if (!user) { user = new User({ firebaseUid, email, credits: 5 }); await user.save(); }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/user-profile/:userId', async (req, res) => {
    try {
        let user = await User.findOne({ firebaseUid: req.params.userId });
        if (!user) { user = new User({ firebaseUid: req.params.userId, email: "new@user.com", credits: 5 }); await user.save(); }
        res.json({ success: true, credits: user.credits, email: user.email });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/my-photos', async (req, res) => {
    try {
        const photos = await Order.find({ userId: req.query.userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.use('/api/payments', paymentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`));