const express = require('express');
const router = express.Router();
const { getDashboardOverview, getDashboardStats } = require('../controllers/dashboardController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.get('/overview', protect, adminOnly, getDashboardOverview);
router.get('/stats', protect, adminOnly, getDashboardStats);
router.get('/', protect, adminOnly, getDashboardOverview);

module.exports = router;
