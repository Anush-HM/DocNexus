// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, login, me } = require('../controllers/authController');
const { requireAuth } = require('../services/authService');

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, me);

module.exports = router;
