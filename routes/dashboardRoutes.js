const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.get('/stats', protect, adminOnly, getDashboardStats);
router.get('/', protect, adminOnly, getDashboardStats);

module.exports = router;
