/**
 * AI Photo Studio — Backend (MERGED FINAL VERSION)
 * ---------------------------------------------------
 * Yeh file aapki purani DONO server.js files ko milakar banayi gayi hai:
 *   - Purani file 1 se liya: Email bhejne wala code (sendPhotoEmail)
 *   - Purani file 2 se liya: /templates route + zyada robust AI output handling
 *   - Dono se liya: /magic-portrait aur /upscale routes (yeh sirf file 1 mein the)
 *
 * ISE KYA KARNA HAI: apni purani DONO server.js files ko DELETE/RENAME kar dein,
 * aur is poori file ko naye "server.js" naam se save karke Render par push karein.
 *
 * NOTE: Ab "templates_data.js" file ki zaroorat nahi hai — templates is file ke
 * andar hi (TEMPLATES object mein) hain. Agar templates_data.js file hai to use
 * yun hi rehne dein, isse koi fark nahi padega (yeh file use hi nahi hogi).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const Order = require('./models/Order');
const User = require('./models/User');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// ---------------- Middleware ----------------
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------------- Database ----------------
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ [DATABASE] Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ [DATABASE] Connection Error:", err));

// ---------------- Replicate & Cloudinary ----------------
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ---------------- Email Setup ----------------
// NOTE: "service: 'gmail'" wala purana tareeka kabhi-kabhi cloud hosting (Render)
// par connection timeout deta hai. Explicit host/port (587 + STARTTLS) zyada
// reliable hai — yeh Google ka khud recommend kiya hua tareeka hai.
// ZARURI: EMAIL_PASS mein aapka normal Gmail password NAHI chalega — Google ne
// yeh band kar diya hai. Isme ek "App Password" (16-character code) dalna
// hoga, jo Google Account -> Security -> 2-Step Verification -> App Passwords
// se banta hai (2-Step Verification pehle ON hona zaroori hai).
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // 587 par STARTTLS use hota hai, secure:false hi sahi hai
    requireTLS: true, // cloud hosting (Render/Heroku type) par timeout se bachne ka pramukh fix
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 15000, // 15 second mein fail ho jaaye, hamesha ke liye latka na rahe
    greetingTimeout: 15000,
    socketTimeout: 15000
});

emailTransporter.verify((err) => {
    if (err) console.error("⚠️ [EMAIL] Transporter setup problem:", err.message);
    else console.log("✅ [EMAIL] Ready to send emails");
});

const CATEGORY_NAMES = {
    'linkedin': 'LinkedIn Professional',
    'wedding': 'Wedding Royal Look',
    'fashion': 'Fashion Style',
    'magic-prompt': 'Magic Prompt',
    'magic-portrait': 'Magic Portrait',
    'upscale': '4K Enhanced Photo'
};

async function sendPhotoEmail(toEmail, imageUrl, category) {
    if (!toEmail) return; // safety: email na ho to silently skip
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
        // Email fail ho jaaye to bhi poora request fail nahi hona chahiye
        console.error("⚠️ [EMAIL] Error:", err.message);
    }
}

// ---------------- Templates (ab is file ke andar hi hain) ----------------
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

// ---------------- Multer (file upload) ----------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// =====================================================================
// AI OUTPUT HELPER — Replicate kabhi URL, kabhi Array, kabhi Stream
// bhejta hai. Yeh ek function sab cases ko handle karta hai taaki
// har route mein baar-baar wahi copy-paste code na likhna pade.
// =====================================================================
async function extractFromReplicateOutput(output) {
    let target = Array.isArray(output) ? output[0] : output;

    if (typeof target === 'string' && target.startsWith('http')) {
        return { type: 'url', value: target };
    }

    if (target && typeof target[Symbol.asyncIterator] === 'function') {
        // Yeh ek Stream hai — chunks collect karke buffer banate hain
        const chunks = [];
        for await (const chunk of target) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const buffer = Buffer.concat(chunks);
        const asString = buffer.toString('utf-8', 0, Math.min(buffer.length, 500)).trim();
        if (asString.startsWith('http')) return { type: 'url', value: asString };
        return { type: 'buffer', value: buffer };
    }

    if (target && typeof target === 'object') {
        const url = target.url || target.href || target.output || target.image;
        if (typeof url === 'string' && url.startsWith('http')) return { type: 'url', value: url };
    }

    throw new Error("AI returned an unparseable format");
}

async function uploadBufferToCloudinary(buffer, folder) {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder }, (error, result) => {
            if (error) reject(error); else resolve(result);
        }).end(buffer);
    });
}

// Replicate ka output leke, hamesha ek permanent Cloudinary URL wapas deta hai
async function resolveToCloudinaryUrl(output, folder) {
    const extracted = await extractFromReplicateOutput(output);

    if (extracted.type === 'buffer') {
        const uploadResult = await uploadBufferToCloudinary(extracted.value, folder);
        return uploadResult.secure_url;
    }

    // Replicate ke temporary URLs permanent nahi hote, isliye Cloudinary par
    // dobara upload kar dete hain (agar pehle se cloudinary URL na ho)
    if (!extracted.value.includes('cloudinary.com')) {
        const uploadResult = await cloudinary.uploader.upload(extracted.value, { folder });
        return uploadResult.secure_url;
    }

    return extracted.value;
}

function cleanupLocalFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { console.error("⚠️ [CLEANUP] Failed:", e.message); }
    }
}

// AI models (khaaskar upscale/face-swap/portrait) chhote GPU par chalte hain,
// bahut badi photo (jaise 4000x3000 phone camera image) bhejne se
// "greater than max size that fits in GPU memory" jaisa error aata hai.
// Yeh function Cloudinary ke URL mein hi ek resize instruction daal deta hai,
// taaki photo download/resize/re-upload karne ki zaroorat na pade.
function capCloudinaryImageSize(url, maxDim = 1600) {
    if (!url || typeof url !== 'string' || !url.includes('/upload/')) return url;
    return url.replace('/upload/', `/upload/w_${maxDim},h_${maxDim},c_limit/`);
}

// =====================================================================
// ROUTES
// =====================================================================

app.get('/', (req, res) => res.send("🚀 AI Photo Studio Backend is LIVE!"));

// Frontend yahi call karke templates list leta hai (category select karne par)
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

// ---------------- FACE SWAP (LinkedIn / Wedding / Fashion) ----------------
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const { userId, email, category, gender, templateIndex } = req.body;

        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "Insufficient credits!" });
        if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });
        if (!category || !gender || templateIndex === undefined) {
            return res.status(400).json({ success: false, error: "Category, Gender, and Template are required" });
        }

        const selectedTemplates = TEMPLATES[category] && TEMPLATES[category][gender];
        const idx = parseInt(templateIndex);
        if (!selectedTemplates || idx < 0 || idx >= selectedTemplates.length) {
            cleanupLocalFile(req.file.path);
            return res.status(400).json({ success: false, error: "Invalid Template Selected" });
        }
        const targetImageUrl = selectedTemplates[idx];

        const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "user_selfies" });
        const originalImageUrl = uploadResult.secure_url;
        cleanupLocalFile(req.file.path); // local temp file ab zaroorat nahi

        const aiOutput = await replicate.run(
            "codeplugtech/face-swap:278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34",
            { input: { input_image: targetImageUrl, swap_image: capCloudinaryImageSize(originalImageUrl) } }
        );
        const aiImageUrl = await resolveToCloudinaryUrl(aiOutput, "ai_studio_generated");

        user.credits -= 1;
        await user.save();

        const order = new Order({
            userId, email, category, gender,
            aiImageUrl, originalImageUrl, status: 'completed'
        });
        await order.save();

        sendPhotoEmail(email, aiImageUrl, category);

        res.json({ success: true, ai_image_url: aiImageUrl, original_image_url: originalImageUrl });
    } catch (err) {
        cleanupLocalFile(req.file && req.file.path);
        console.error("❌ [UPLOAD ERROR]:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------- MAGIC PROMPT (Text to Image) ----------------
app.post('/magic-prompt', async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;

        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "Insufficient credits!" });
        if (!prompt) return res.status(400).json({ success: false, error: "Prompt is required" });

        console.log("✨ [MAGIC PROMPT] Starting Generation for:", prompt);

        const output = await replicate.run("black-forest-labs/flux-schnell", {
            input: { prompt: prompt, num_inference_steps: 4 }
        });
        const finalImageUrl = await resolveToCloudinaryUrl(output, "magic_prompts");

        user.credits -= 1;
        await user.save();

        const order = new Order({
            userId, email, category: 'magic-prompt',
            aiImageUrl: finalImageUrl, originalImageUrl: "", status: 'completed'
        });
        await order.save();

        sendPhotoEmail(email, finalImageUrl, 'magic-prompt');

        res.json({ success: true, ai_image_url: finalImageUrl });
    } catch (err) {
        console.error("❌ [MAGIC PROMPT ERROR]:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------- MAGIC PORTRAIT (Image + Prompt) ----------------
app.post('/magic-portrait', upload.single("image"), async (req, res) => {
    try {
        const { userId, email, prompt } = req.body;

        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0 || !req.file) {
            cleanupLocalFile(req.file && req.file.path);
            return res.status(400).json({ success: false, error: "Invalid Request" });
        }

        const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "magic_portrait_inputs" });
        const userImgUrl = uploadResult.secure_url;
        cleanupLocalFile(req.file.path);

        const output = await replicate.run(
            "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
            {
                input: {
                    prompt: prompt,
                    image: capCloudinaryImageSize(userImgUrl),
                    refine: "expert_ensemble_refiner",
                    apply_watermark: false,
                    disable_safety_checker: true // SDXL ka built-in filter aksar normal selfies/prompts ko bhi galti se NSFW mark kar deta hai
                }
            }
        );
        const finalImageUrl = await resolveToCloudinaryUrl(output, "magic_portrait_results");

        user.credits -= 1;
        await user.save();

        const order = new Order({
            userId, email, category: 'magic-portrait',
            aiImageUrl: finalImageUrl, originalImageUrl: userImgUrl, status: 'completed'
        });
        await order.save();

        sendPhotoEmail(email, finalImageUrl, 'magic-portrait');

        res.json({ success: true, ai_image_url: finalImageUrl });
    } catch (err) {
        cleanupLocalFile(req.file && req.file.path);
        console.error("❌ [MAGIC PORTRAIT ERROR]:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------- UPSCALE (Enhance to 4K) ----------------
app.post('/upscale', async (req, res) => {
    try {
        const { userId, email, imageUrl } = req.body;

        const user = await User.findOne({ firebaseUid: userId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        if (user.credits <= 0) return res.status(400).json({ success: false, error: "No credits" });
        if (!imageUrl) return res.status(400).json({ success: false, error: "imageUrl is required" });

        const output = await replicate.run(
            "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
            { input: { image: capCloudinaryImageSize(imageUrl, 1400), scale: 4, face_enhance: true } }
        );
        const upscaledUrl = await resolveToCloudinaryUrl(output, "upscaled_images");

        user.credits -= 1;
        await user.save();

        const order = new Order({
            userId, email, category: 'upscale',
            aiImageUrl: upscaledUrl, originalImageUrl: imageUrl, status: 'completed'
        });
        await order.save();

        res.json({ success: true, ai_image_url: upscaledUrl });
    } catch (err) {
        console.error("❌ [UPSCALE ERROR]:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/my-photos', async (req, res) => {
    try {
        const photos = await Order.find({ userId: req.query.userId, status: 'completed' }).sort({ createdAt: -1 });
        res.json(photos);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ [SYSTEM] SERVER RUNNING ON PORT ${PORT}`));