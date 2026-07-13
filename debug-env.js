const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '.env');

console.log("🔍 Checking path:", envPath);

if (fs.existsSync(envPath)) {
    console.log("✅ .env file exists!");
    const content = fs.readFileSync(envPath, 'utf8');
    console.log("-----------------------------------------");
    console.log("📄 CONTENT INSIDE .env:");
    console.log("-----------------------------------------");
    console.log(content); // यह दिखाएगा कि फाइल के अंदर क्या है
    console.log("-----------------------------------------");
    
    dotenv.config({ path: envPath });
    console.log("🔑 Value of REPLICATE_API_TOKEN:", process.env.REPLICATE_API_TOKEN ? "✅ Found!" : "❌ NOT FOUND!");
} else {
    console.log("❌ ERROR: .env file NOT FOUND at this location!");
}