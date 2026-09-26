const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

const MAX_USERS_ALLOWED = 1;

const MIN_PASSWORD_LENGTH = 8;

/*
 * Dummy hash used when the username does not exist, so login always runs one
 * bcrypt comparison (constant-ish timing => no user-enumeration timing oracle)
 * and always returns the exact same error message (no enumeration oracle).
 * Hashed at module load with the same cost factor as real passwords.
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

const flagEnabled = (raw, fallback = true) => {
  if (raw === undefined || raw === '' || raw === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
};

/*
 * The JWT secret comes ONLY from the environment. A hardcoded fallback would
 * let anyone who reads the source forge admin tokens if the variable is ever
 * missing in production - server.js refuses to boot without a strong secret
 * (see config/env.js), this check is defence in depth.
 */
const signToken = (id) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('JWT_SECRET is not configured');
    err.statusCode = 500;
    throw err;
  }
  return jwt.sign({ id }, secret, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Constant-time comparison for the optional invite code (timing-safe).
const inviteMatches = (provided, expected) => {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const invalidCredentials = (res) =>
  res.status(401).json({ success: false, message: 'Invalid credentials' });

const getSignupStatus = async (req, res) => {
  try {
    const totalUsers = await Admin.countDocuments();
    // Deliberately minimal: no user counts / limits are disclosed to
    // unauthenticated callers - only what the signup form needs to render.
    return res.status(200).json({
      success: true,
      limitReached: totalUsers >= MAX_USERS_ALLOWED,
      inviteRequired: Boolean(process.env.INVITE_CODE),
    });
  } catch (err) {
    console.error('Signup status error:', err);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @route POST /api/auth/signup
const signup = async (req, res, next) => {
  try {
    const { username, password, name, inviteCode } = req.body;

    // Type checks first: `username.trim()` on an injected object would throw
    // (and object values could otherwise reach the query layer).
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    if (name !== undefined && name !== null && typeof name !== 'string') {
      return res.status(400).json({ success: false, message: 'Name must be text' });
    }
    if (password.length < MIN_PASSWORD_LENGTH || !/\d/.test(password)) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters and contain a digit`,
      });
    }
    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername.length < 3 || normalizedUsername.length > 64) {
      return res.status(400).json({ success: false, message: 'Username must be 3-64 characters' });
    }

    // Optional invite gate: when INVITE_CODE is configured, signup requires it.
    if (process.env.INVITE_CODE) {
      if (typeof inviteCode !== 'string' || !inviteMatches(inviteCode, process.env.INVITE_CODE)) {
        return res.status(403).json({ success: false, message: 'Invalid invite code' });
      }
    }

    // Honour RESTRICT_SIGNUP_TO_FIRST_ADMIN (previously read nowhere):
    // when enabled, signup closes as soon as any admin exists.
    const restrictToFirst = flagEnabled(process.env.RESTRICT_SIGNUP_TO_FIRST_ADMIN, true);
    const currentCount = await Admin.countDocuments();
    if (restrictToFirst ? currentCount > 0 : currentCount >= MAX_USERS_ALLOWED) {
      return res.status(403).json({ success: false, message: 'Maximum user limit reached' });
    }

    const existing = await Admin.findOne({ username: normalizedUsername });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    const admin = await Admin.create({
      username: normalizedUsername,
      password,
      name: typeof name === 'string' && name.trim() ? name.trim() : username,
    });

    // Race guard: concurrent signups can all pass the countDocuments() check
    // above. Re-check AFTER the insert and keep only the earliest-created
    // admins - later duplicates remove themselves, so MAX is enforced even
    // under parallel requests.
    const countAfter = await Admin.countDocuments();
    if (countAfter > MAX_USERS_ALLOWED) {
      const keep = await Admin.find()
        .sort({ createdAt: 1, _id: 1 })
        .limit(MAX_USERS_ALLOWED)
        .select('_id')
        .lean();
      const keepIds = new Set(keep.map((a) => String(a._id)));
      if (!keepIds.has(String(admin._id))) {
        await Admin.deleteOne({ _id: admin._id });
        return res.status(403).json({ success: false, message: 'Maximum user limit reached' });
      }
    }

    const token = signToken(admin._id);
    const safeAdmin = admin.toSafeObject();

    return res.status(201).json({ success: true, token, admin: safeAdmin });
  } catch (err) {
    console.error('Signup Error:', err);
    // Generic message: raw driver errors can leak internals.
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @route POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const admin = await Admin.findOne({ username: normalizedUsername }).select('+password');

    // Always run one bcrypt comparison (against a dummy hash when the user
    // does not exist) => constant response text + similar timing => no
    // username-enumeration oracle.
    const isMatch = await bcrypt.compare(password, admin ? admin.password : DUMMY_HASH);
    if (!admin || !isMatch) {
      return invalidCredentials(res);
    }

    const token = signToken(admin._id);
    const safeAdmin = admin.toSafeObject();

    return res.status(200).json({ success: true, token, admin: safeAdmin });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ success: false, message: 'Server Error' });
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
