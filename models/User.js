const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    firebaseUid: { type: String, required: true, unique: true }, // Firebase se aayega
    email: { type: String },
    credits: { type: Number, default: 0 }, // USER KA WALLET YAHAN HOGA
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);