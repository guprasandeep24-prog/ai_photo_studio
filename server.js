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

// 🚀 ULTIMATE UNIVERSAL GENERATOR ROUTE
app.post('/upload', upload.single('image'), async (req, res) => {
    console.log("📥 [GENERATE] Request received for /upload");
    console.log("📝 [DATA] Body:", req.body);
    console.log("📁 [FILE] File info:", req.file ? req.file.path : "No file uploaded");

    let localFilePath = req.file ? req.file.path : null; 

    try {
        const { category, gender, userId, prompt, mode } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, error: "User ID missing!" });
        }

        // 1. User Check
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found!" });
        if (user.credits < 1) return res.status(402).json({ success: false, error: "Insufficient credits!" });

        let finalAiImageUrl = "";

        // --- CASE A: MAGIC PROMPT MODE (Text-to-Image) ---
        if (mode === 'prompt') {
            if (!prompt) return res.status(400).json({ success: false, error: "Please provide a prompt!" });
            
            console.log("🎨 [MODE] Prompt-to-Image active. Prompt:", prompt);
            
            // Using Flux-Schnell (Fast & High Quality)
            const output = await replicate.run(
                "black-forest-labs/flux-schnell",
                { input: { prompt: prompt } }
            );

            // Handle different Replicate output formats (String, Array, or Object)
            if (typeof output === 'string') {
                finalAiImageUrl = output;
            } else if (Array.isArray(output) && output.length > 0) {
                finalAiImageUrl = output[0];
            } else if (typeof output === 'object' && output !== null) {
                finalAiImageUrl = output.output || output.url || output.image || (output.data ? output.data[0] : "");
            }

            if (!finalAiImageUrl || !finalAiImageUrl.startsWith('http')) {
                throw new Error("AI returned an invalid image URL in prompt mode.");
            }

            // IMPORTANT: Prompt mode mein image Replicate ke server par hoti hai. 
            // Use Cloudinary mein save karein taaki hum database mein link rakh sakein.
            console.log("☁️ [PROMPT] Uploading generated image to Cloudinary...");
            const uploadResult = await cloudinary.uploader.upload(finalAiImageUrl, { folder: "ai_studio_generated" });
            finalAiImageUrl = uploadResult.secure_url;

        } 
        // --- CASE B: FACE-SWAP MODE (Image-to-Image) ---
        else if (mode === 'faceswap') {
            if (!localFilePath) return res.status(400).json({ success: false, error: "Please upload an image for face-swap!" });
            if (!category || !gender) return res.status(400).json({ success: false, error: "Category or Gender missing!" });

            console.log("👤 [MODE] Face-swap mode active.");

            // 1. Upload user selfie to Cloudinary
            const cloudinaryResult = await cloudinary.uploader.upload(localFilePath, { folder: 'ai_studio_uploads' });
            
            // 2. Run Face-swap logic
            finalAiImageUrl = await runAIFaceSwap(cloudinaryResult.secure_url, category, gender);
        } 
        else {
            throw new Error("Invalid mode! Use 'prompt' or 'faceswap'.");
        }

        // --- FINAL STEP: SAVE EVERYTHING ---
        if (!finalAiImageUrl) throw new Error("AI failed to generate a valid image URL.");

        // Deduct credit
        user.credits -= 1;
        await user.save();

        // Save to Order collection
        await Order.create({ 
            userId, 
            category: mode === 'prompt' ? 'Magic Prompt' : category, 
            gender: mode === 'prompt' ? 'neutral' : gender, 
            aiImageUrl: finalAiImageUrl, 
            status: 'completed', 
            razorpayOrderId: 'N/A' 
        });

        // Cleanup local file if it exists
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

        console.log("✅ [SUCCESS] Generation complete!");
        res.json({ success: true, ai_image_url: finalAiImageUrl, remainingCredits: user.credits });

    } catch (error) {
        console.error("❌ [GENERATE ERROR]:", error);
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