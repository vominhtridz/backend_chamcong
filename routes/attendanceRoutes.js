const express = require('express');
const router = express.Router();
const {
  getAllAttendances,
  getMyAttendances,
  checkIn,
  getWorkConfig,
  updateAttendanceNote,
  logSecurityAttempt,
} = require('../controllers/attendanceController');
const { protect, checkStatus, adminOnly } = require('../middlewares/authMiddleware');

router.get('/work-config', protect, checkStatus, getWorkConfig);
router.get('/me', protect, checkStatus, getMyAttendances);
router.get('/', protect, adminOnly, getAllAttendances);
router.post('/checkin', protect, checkStatus, checkIn);
router.post('/log-attempt', protect, checkStatus, logSecurityAttempt);
router.patch('/:id/note', protect, adminOnly, updateAttendanceNote);

module.exports = router;
