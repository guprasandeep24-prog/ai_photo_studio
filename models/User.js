const mongoose = require('mongoose');

// 1. Yahan humne "UserSchema" naam ka box banaya jo pehle missing tha
const UserSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    firebaseUid: { 
        type: String, 
        required: true, 
        unique: true 
    },
    credits: { 
        type: Number, 
        default: 10  // Naye users ko 10 free credits milenge
    }
}, { 
    timestamps: true // Isse humein pata chalega user kab bana
});

// 2. Ab hum is Schema ko export kar rahe hain taaki server ise use kar sake
module.exports = mongoose.model('User', UserSchema);