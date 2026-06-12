require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const Replicate = require('replicate');

const app = express();

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// 🛠️ UPDATED TEMPLATES (Nested with Man/Woman)
const TEMPLATES = {
    'linkedin': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928122/smiling-businessman-with-arms-crossed_dalfak.jpg', // <-- Change this with real Man link
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231467/front-view-young-attractive-lady-black-jacket-white-shirt-front-table-working-with-laptop-work-business-technologies_rcaqts.jpg'
    },
    'wedding': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928082/Wedding_qq5pyd.jpg', // <-- Change this with real Man link
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1780928236/Screenshot_2026-06-08_192024_klsa2g.png'
    },
    'fashion': {
        'man': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781238420/man_fashion_image_repevi.jpg', // <-- Change this with real Man link
        'woman': 'https://res.cloudinary.com/dh8klfp1s/image/upload/v1781231824/indian_woman_fashion_ckkwlf.jpg'
    }
};

async function runAIFaceSwap(userCloudinaryUrl, category, gender) {
    console.log(`🤖 AI STARTING: ${category} - ${gender} shot...`);

    // Target URL selecting based on Category and Gender
    const targetImageUrl = TEMPLATES[category][gender];

    try {
        // Using the stable pikachupichu25 model with hash as you confirmed it works
        const output = await replicate.run(
            "pikachupichu25/image-faceswap:94b109952d4dd3cb6e9947340a6a099cc9a4821af8807a879c1f7af92e2a3b00", 
            {
                input: {
                    target_image: targetImageUrl,
                    swap_image: userCloudinaryUrl
                }
            }
        );

        // Handling stream or direct URL
        if (output && typeof output[Symbol.asyncIterator] === 'function') {
            const chunks = [];
            for await (const chunk of output) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const buffer = Buffer.concat(chunks);

            const uploadResult = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({ folder: "ai_studio_final" }, (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }).end(buffer);
            });
            return uploadResult.secure_url;
        }

        return Array.isArray(output) ? output[0] : output;

    } catch (error) {
        console.error("❌ AI Error:", error.message);
        throw error;
    }
}

app.post('/upload', upload.single('image'), async (req, res) => {
    let localFilePath = req.file ? req.file.path : null;

    try {
        const { category, gender } = req.body; // Taking gender from frontend

        if (!localFilePath || !category || !gender) {
            return res.status(400).json({ success: false, error: "Missing data!" });
        }

        console.log(`🚀 Request: ${category} | ${gender}`);

        // 1. Upload Selfie to Cloudinary
        const cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
            folder: 'ai_studio_uploads'
        });
        const userImageUrl = cloudinaryResult.secure_url;

        // 2. Run AI with Category AND Gender
        const finalAiImageUrl = await runAIFaceSwap(userImageUrl, category, gender);

        // 3. Cleanup local file
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

        res.json({
            success: true,
            ai_image_url: finalAiImageUrl,
            message: "Magic Complete!"
        });

    } catch (error) {
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        console.error("❌ Server Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ ENGINE LIVE AT http://localhost:${PORT}`);
});