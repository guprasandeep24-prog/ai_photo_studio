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
// Replace 'https://your-username.github.io' with your actual GitHub Pages URL
app.use(cors({
    origin: '*', // Temporary: Sabko allow karo testing ke liye. Baad mein apna URL daal dena.
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Static folders
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- 2. HEALTH CHECK ROUTE (Very Important for Testing) ---
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

// 🚀 THE "BRUTE FORCE" STREAM-PROOF AI LOGIC
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

        console.log("📦 [AI] RAW OUTPUT TYPE:", typeof output);
        console.log("📦 [AI] RAW OUTPUT CONTENT:", JSON.stringify(output).substring(0, 200)); // Log first 200 chars

        // --- STRATEGY 1: Direct String (The easiest) ---
        if (typeof output === 'string' && output.startsWith('http')) {
            console.log("✅ [AI] Strategy 1 Success: Found direct URL string.");
            return output;
        }

        // --- STRATEGY 2: Array (Common) ---
        if (Array.isArray(output) && output.length > 0) {
            if (typeof output[0] === 'string' && output[0].startsWith('http')) {
                console.log("✅ [AI] Strategy 2 Success: Found URL in array.");
                return output[0];
            }
        }

        // --- STRATEGY 3: Object with keys (Common) ---
        if (output && typeof output === 'object' && !Array.isArray(output)) {
            const urlFromObj = output.output || output.url || output.image || (output.data ? output.data[0] : null);
            if (typeof urlFromObj === 'string' && urlFromObj.startsWith('http')) {
                console.log("✅ [AI] Strategy 3 Success: Found URL inside object.");
                return urlFromObj;
            }
        }

        // --- STRATEGY 4: The "Heavy Lifting" (Handling the Stream/ReadableStream) ---
        // We try to consume it as an async iterator (works for most streams)
        try {
            console.log("🌊 [AI] Strategy 4: Attempting to consume output as a Stream...");
            const chunks = [];
            
            // This works if it's a Web Stream or Node Stream
            for await (const chunk of output) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }

            const buffer = Buffer.concat(chunks);
            const contentString = buffer.toString().trim();

            // Check if the stream was actually just a string URL
            if (contentString.startsWith('http')) {
                console.log("✅ [AI] Strategy 4 Success: Stream was actually a URL string.");
                return contentString;
            }

            // If it's actual image bytes, upload to Cloudinary
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

        // If all strategies fail
        throw new Error(`AI returned unparseable format: ${JSON.stringify(output).substring(0, 100)}`);

    } catch (error) {
        console.error("❌ [AI ERROR]:", error.message);
        throw error;
    }
}

// --- 4. ROUTES ---

// ROUTE 1: AI Generation
app.post('/upload', upload.single('image'), async (req, res) => {
    console.log("📥 [UPLOAD] Request received for /upload");
    console.log("📝 [UPLOAD] Body received:", req.body); 
    console.log("📁 [UPLOAD] File received:", req.file ? req.file.originalname : "No file");
    let localFilePath = req.file ? req.file.path : null; 
    try {
        const { category, gender, userId } = req.body;
        
        if (!localFilePath || !category || !gender || !userId) {
            console.log("❌ [UPLOAD] Missing fields:", { category, gender, userId, hasFile: !!localFilePath });
            return res.status(400).json({ success: false, error: "Missing info or User ID!" });
        }

        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found in database!" });
        if (user.credits < 1) return res.status(402).json({ success: false, error: "Insufficient credits!" });

        // 1. Upload to Cloudinary
        const cloudinaryResult = await cloudinary.uploader.upload(localFilePath, { folder: 'ai_studio_uploads' });
        
        // 2. Run AI
        const finalAiImageUrl = await runAIFaceSwap(cloudinaryResult.secure_url, category, gender);

        // 3. Update User & Order
        user.credits -= 1;
        await user.save();

        await Order.create({ userId, category, gender, aiImageUrl: finalAiImageUrl, status: 'completed', razorpayOrderId: 'N/A' });

        // 4. Cleanup
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        
        console.log("✅ [UPLOAD] Success for user:", userId);
        res.json({ success: true, ai_image_url: finalAiImageUrl, remainingCredits: user.credits });
    } catch (error) {
        console.error("❌ [UPLOAD ERROR]:", error);
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use('/api/payments', paymentRoutes);

// 🚀 IMPROVED ROUTE 3: Profile (With Auto-Registration)
// 🚀 ROUTE 3: Profile (With Auto-Registration)
app.get('/user-profile/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        let user = await User.findOne({ firebaseUid: userId });

        if (!user) {
            console.log(`🆕 [NEW USER] Auto-creating user for UID: ${userId}`);
            user = new User({
                firebaseUid: userId,
                email: "new-user@example.com", // Default
                credits: 5 // Welcome credits!
            });
            await user.save();
        }

        res.json({ success: true, credits: user.credits, email: user.email });
    } catch (error) {
        console.error("❌ [PROFILE ERROR]:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 ROUTE 4: Gallery (With Auto-Registration to prevent 404)
app.get('/my-photos', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, error: "userId required" });

        // Check if user exists, if not, create them silently
        let user = await User.findOne({ firebaseUid: userId });
        if (!user) {
            console.log(`🆕 [NEW USER] Auto-creating user during gallery fetch: ${userId}`);
            user = new User({
                firebaseUid: userId,
                email: "new-user@example.com",
                credits: 5
            });
            await user.save();
        }

        const photos = await Order.find({ userId: userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) {
        console.error("❌ [GALLERY ERROR]:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`);
});