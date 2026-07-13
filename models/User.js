const mongoose = require('mongoose');

// 1. UserSchema ko sahi se define karna zaroori hai
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
    }
}, { 
    timestamps: true 
});

// 2. Model ko export karna
const User = mongoose.model('User', UserSchema);
module.exports = User;