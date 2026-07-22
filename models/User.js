const mongoose = require('mongoose');

// 1. UserSchema ko sahi se define karna
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
        default: 10 
    },
    referralCode: { 
        type: String, 
        default: null 
    },
    referredBy: { 
        type: String, 
        default: null 
    }
}, { 
    // Ye options object hai, jo schema fields ke baad aata hai
    timestamps: true 
});

// 2. Model ko export karna
const User = mongoose.model('User', UserSchema);
module.exports = User;