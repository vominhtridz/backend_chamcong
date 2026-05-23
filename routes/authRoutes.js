const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect, checkStatus, adminOnly } = require('../middlewares/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/admin-login', authController.adminLogin);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.get('/me', protect, authController.getMe);
router.put('/profile', protect, checkStatus, authController.updateProfile);

router.get('/settings', protect, adminOnly, getSettings);
router.put('/settings', protect, adminOnly, updateSettings);

module.exports = router;
