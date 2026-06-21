require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const mongoose = require('mongoose');

// 1. Models Import
const Order = require('./models/Order');
const User = require('./models/User');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// 2. Middleware - CORS FIX (Sabse important part)
app.use(cors({
    origin: "https://guprasandeep24-prog.github.io", // Aapka GitHub URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files setup
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// 3. Initialization
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 4. Multer Setup (File Upload ke liye)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// 5. Templates
const TEMPLATES = {
    'linkedin': { 'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928122/smiling-businessman-with-arms-crossed_dalfak.jpg', 'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781527213/linkdin_ceo_woman1_p0hoc3.jpg' },
    'wedding': { 'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928082/Wedding_qq5pyd.jpg', 'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231450/pexels-creative-studio-830123672-19376431_mancpc.jpg' },
    'fashion': { 'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781238420/man_fashion_image_repevi.jpg', 'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231824/indian_woman_fashion_ckkwlf.jpg' }
};

// 6. AI Logic
async function runAIFaceSwap(userCloudinaryUrl, category, gender) {
    const targetImageUrl = TEMPLATES[category][gender] || TEMPLATES['linkedin']['woman'];
    const output = await replicate.run("pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", { 
        input: { target_image: targetImageUrl, swap_image: userCloudinaryUrl } 
    });

    if (output && typeof output[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        for await (const chunk of output) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
        const buffer = Buffer.concat(chunks);
        const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ folder: "ai_studio_final" }, (error, result) => {
                if (error) reject(error); else resolve(result);
            }).end(buffer);
        });
        return uploadResult.secure_url;
    }
    return Array.isArray(output) ? output[0] : output;
}

// 7. ROUTES
// UPLOAD ROUTE
// --- NAYA REGISTER ROUTE ---
app.post('/register', async (req, res) => {
    try {
        const { email, firebaseUid } = req.body;
        if (!email || !firebaseUid) {
            return res.status(400).json({ success: false, error: "Missing Email or UID!" });
        }

        // Check karo kya user pehle se hai?
        let user = await User.findOne({ firebaseUid: firebaseUid });
        
        if (user) {
            return res.status(200).json({ success: true, message: "User already exists" });
        }

        // Agar naya user hai, toh use MongoDB mein save karo
        // Hum naye user ko 10 FREE CREDITS de rahe hain taaki wo test kar sake!
        user = new User({ 
            email: email, 
            firebaseUid: firebaseUid, 
            credits: 10 
        });
        
        await user.save();
        console.log(`🌟 NEW USER REGISTERED: ${email} with 10 credits!`);
        res.status(201).json({ success: true, message: "User registered successfully" });

    } catch (error) {
        console.error("❌ Registration Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PAYMENTS ROUTE
app.use('/api/payments', paymentRoutes);

// USER PROFILE ROUTE
app.get('/user-profile/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.params.userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        res.json({ success: true, credits: user.credits, email: user.email });
    } catch (error) { 
        res.status(500).json({ success: false, error: error.message }); 
    }
});

// MY PHOTOS ROUTE
app.get('/my-photos', async (req, res) => {
    try {
        const { userId } = req.query;
        const photos = await Order.find({ userId: userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) { 
        res.status(500).json({ success: false, error: error.message }); 
    }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("💥 [CRITICAL ERROR]:", err.stack);
    res.status(500).json({ success: false, error: "Internal Server Error" });
});

// 10. Start Server
const PORT = process.env.PORT || 5000;

// Render requires '0.0.0.0' to work correctly
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ [SYSTEM] AI STUDIO ENGINE LIVE AT http://localhost:${PORT}`);
    console.log(`🚀 PUBLIC URL: https://ai-photo-studio-e3so.onrender.com`);
});