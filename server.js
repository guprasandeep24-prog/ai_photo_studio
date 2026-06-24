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

// --- 1. IMPROVED CORS ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- 2. HEALTH CHECK ROUTE ---
app.get('/', (req, res) => {
    res.send("🚀 AI Photo Studio Backend is LIVE and running!");
});

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

// 🚀 YOUR ORIGINAL "BRUTE FORCE" AI LOGIC (STRATEGIES 1-4)
async function runAIFaceSwap(userCloudinaryUrl, category, gender) {
    const targetImageUrl = TEMPLATES[category][gender] || TEMPLATES['linkedin']['woman'];
    
    console.log("🤖 [AI] Starting Replicate Face-Swap...");
    console.log("🖼️ [AI] Target:", targetImageUrl);
    console.log("👤 [AI] Swap with:", userCloudinaryUrl);

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

        // --- STRATEGY 1: Direct String ---
        if (typeof output === 'string' && output.startsWith('http')) {
            console.log("✅ [AI] Strategy 1 Success: Found direct URL string.");
            return output;
        }

        // --- STRATEGY 2: Array ---
        if (Array.isArray(output) && output.length > 0) {
            if (typeof output[0] === 'string' && output[0].startsWith('http')) {
                console.log("✅ [AI] Strategy 2 Success: Found URL in array.");
                return output[0];
            }
        }

        // --- STRATEGY 3: Object with keys ---
        if (output && typeof output === 'object' && !Array.isArray(output)) {
            const urlFromObj = output.output || output.url || output.image || (output.data ? output.data[0] : null);
            if (typeof urlFromObj === 'string' && urlFromObj.startsWith('http')) {
                console.log("✅ [AI] Strategy 3 Success: Found URL inside object.");
                return urlFromObj;
            }
        }

        // --- STRATEGY 4: The "Heavy Lifting" (Stream/Buffer) ---
        try {
            console.log("🌊 [AI] Strategy 4: Attempting to consume output as a Stream...");
            const chunks = [];
            for await (const chunk of output) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const buffer = Buffer.concat(chunks);
            const contentString = buffer.toString().trim();

            if (contentString.startsWith('http')) {
                console.log("✅ [AI] Strategy 4 Success: Stream was actually a URL string.");
                return contentString;
            }

            if (buffer.length > 0) {
                console.log(`📤 [AI] Strategy 4 Success: Stream was image data (${buffer.length} bytes). Uploading...`);
                const uploadResult = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { folder: "ai_studio_final" }, 
                        (error, result) => {
                            if (error) reject(error); else resolve(result);
                        }
                    ).end(buffer);
                });
                return uploadResult.secure_url;
            }
        } catch (streamError) {
            console.error("❌ [AI] Strategy 4 (Stream) failed:", streamError.message);
        }

        throw new Error(`AI returned unparseable format: ${JSON.stringify(output).substring(0, 100)}`);

    } catch (error) {
        console.error("❌ [AI ERROR]:", error.message);
        throw error;
    }
}

// --- 4. ROUTES ---

// 🚀 REGISTER ROUTE
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

// 🚀 UPLOAD ROUTE (Includes the Magic Prompt part you were missing)
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, mode, category, gender, prompt } = req.body;

        // 1. Check User
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "Insufficient credits!" });

        let aiImageUrl = "";
        let originalImageUrl = "";

        // 2. Handle Modes (Face-Swap vs Magic Prompt)
        if (mode === 'faceswap') {
            if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });

            // Upload selfie to Cloudinary
            const uploadRes = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({ folder: "user_selfies" }, (err, res) => {
                    if (err) reject(err); else resolve(res);
                }).end(fs.createReadStream(req.file.path));
            });
            originalImageUrl = uploadRes.secure_url;

            // Run Face-Swap
            aiImageUrl = await runAIFaceSwap(originalImageUrl, category, gender);

        } else if (mode === 'prompt') {
            // 🚀 YOUR MAGIC PROMPT MODE
            console.log("🪄 [AI] Starting Magic Prompt Mode...");
            const output = await replicate.run(
                "black-forest-labs/flux-schnell",
                { input: { prompt: prompt } }
            );
            
            // Parse output
            if (typeof output === 'string') aiImageUrl = output;
            else if (Array.isArray(output)) aiImageUrl = output[0];
            else if (typeof output === 'object') aiImageUrl = output.url || output.output || "";
        }

        if (!aiImageUrl || !aiImageUrl.startsWith('http')) {
            throw new Error("AI failed to generate a valid URL.");
        }

        // 3. Deduct Credits & Save Order
        user.credits -= 1;
        await user.save();

        const newOrder = new Order({
            userId, email, category: category || 'magic-prompt',
            gender: mode === 'faceswap' ? gender : undefined, // Fix for gender validation
            aiImageUrl, originalImageUrl, status: 'completed'
        });
        await newOrder.save();

        // 4. Cleanup
        if (req.file) fs.unlinkSync(req.file.path);

        res.json({ success: true, ai_image_url: aiImageUrl, original_image_url: originalImageUrl });

    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        console.error("❌ [UPLOAD ERROR]:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 PROFILE ROUTE
app.get('/user-profile/:userId', async (req, res) => {
    try {
        let user = await User.findOne({ firebaseUid: req.params.userId });
        if (!user) {
            user = new User({ firebaseUid: req.params.userId, email: "new-user@example.com", credits: 5 });
            await user.save();
        }
        res.json({ success: true, credits: user.credits, email: user.email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 GALLERY ROUTE
app.get('/my-photos', async (req, res) => {
    try {
        const photos = await Order.find({ userId: req.query.userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use('/api/payments', paymentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`));