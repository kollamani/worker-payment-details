const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Testing కోసం User limit పెంచడం జరిగింది
const MAX_USERS_ALLOWED = 1; 

const signToken = (id) => {
  const secret = process.env.JWT_SECRET || 'fallback_secret_key_12345';
  return jwt.sign({ id }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const getSignupStatus = async (req, res) => {
  try {
    const totalUsers = await Admin.countDocuments();
    return res.status(200).json({
      success: true,
      totalUsers,
      maxUsersAllowed: MAX_USERS_ALLOWED,
      limitReached: totalUsers >= MAX_USERS_ALLOWED,
      remainingSlots: Math.max(MAX_USERS_ALLOWED - totalUsers, 0),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Unable to fetch signup status' });
  }
};

// @route POST /api/auth/signup
const signup = async (req, res, next) => {
  try {
    const { username, password, name } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const currentCount = await Admin.countDocuments();
    if (currentCount >= MAX_USERS_ALLOWED) {
      return res.status(403).json({
        success: false,
        message: 'Maximum user limit reached',
      });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const existing = await Admin.findOne({ username: normalizedUsername });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    const admin = await Admin.create({ 
      username: normalizedUsername, 
      password, 
      name: name || username 
    });

    const token = signToken(admin._id);

    const safeAdmin = admin.toSafeObject ? admin.toSafeObject() : { _id: admin._id, username: admin.username, name: admin.name };

    return res.status(201).json({ success: true, token, admin: safeAdmin });
  } catch (err) {
    console.error("Signup Error:", err);
    return res.status(500).json({ success: false, message: err.message || 'Server Error' });
  }
};

// @route POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const admin = await Admin.findOne({ username: normalizedUsername });
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials (User not found)' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials (Password Mismatch)' });
    }

    const token = signToken(admin._id);
    const safeAdmin = admin.toSafeObject ? admin.toSafeObject() : { _id: admin._id, username: admin.username, name: admin.name };

    return res.status(200).json({ success: true, token, admin: safeAdmin });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ success: false, message: err.message || 'Server Error' });
  }
};

// @route GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    const safeAdmin = req.admin.toSafeObject ? req.admin.toSafeObject() : req.admin;
    res.status(200).json({ success: true, admin: safeAdmin });
  } catch (err) {
    next(err);
  }
};

module.exports = { signup, login, getMe, getSignupStatus };