const express = require('express');
const router = express.Router();
const { getAllAttendances, getMyAttendances, checkIn } = require('../controllers/attendanceController');
const { protect, checkStatus, adminOnly } = require('../middlewares/authMiddleware');

router.get('/me', protect, checkStatus, getMyAttendances);
router.get('/', protect, adminOnly, getAllAttendances);
router.post('/checkin', protect, checkStatus, checkIn);

module.exports = router;
