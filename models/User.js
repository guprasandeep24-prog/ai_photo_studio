const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    firebaseUid: { type: String, required: true, unique: true }, // <--- Yeh hona zaroori hai
    credits: { type: Number, default: 10 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);