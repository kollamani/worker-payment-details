const express = require('express');
const router = express.Router();
const { signup, login, getMe, getSignupStatus } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.get('/signup-status', getSignupStatus);
router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
