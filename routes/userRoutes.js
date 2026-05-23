// backend/routes/userRoutes.js (Ví dụ demo các API khác)
const express = require('express');
const router = express.Router();
const { protect, checkStatus, adminOnly } = require('../middlewares/authMiddleware');


// Áp dụng protect và checkStatus cho TOÀN BỘ API trong file này
router.use(protect);
router.use(checkStatus);

// API xem thông tin cá nhân (Được phép vào kể cả khi Pending/Chưa quét mặt)
router.get('/me', authController.getMe);

// API Admin (Sẽ bị chặn nếu không phải Admin)
router.get('/admin/dashboard', adminOnly, (req, res) => {
  res.json({ message: 'Chào mừng Admin!' });
});

module.exports = router;