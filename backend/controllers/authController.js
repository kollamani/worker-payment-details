const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const MAX_USERS_ALLOWED = 2;

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
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
        message: 'Maximum user limit reached (Max 2 users allowed)',
      });
    }

    const existing = await Admin.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    const admin = await Admin.create({ username, password, name });
    const token = signToken(admin._id);

    res.status(201).json({ success: true, token, admin: admin.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @route POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const admin = await Admin.findOne({ username: username.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = signToken(admin._id);
    res.status(200).json({ success: true, token, admin: admin.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, admin: req.admin.toSafeObject ? req.admin.toSafeObject() : req.admin });
  } catch (err) {
    next(err);
  }
};

module.exports = { signup, login, getMe, getSignupStatus };
