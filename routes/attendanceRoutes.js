const express = require('express');
const router = express.Router();
const {
  getAllAttendances,
  getMyAttendances,
  checkIn,
  getWorkConfig,
  updateAttendanceNote,
  logSecurityAttempt,
  runAttendanceTest,
  getMyAttendanceTests,
  getAllAttendanceTests,
} = require('../controllers/attendanceController');
const { protect, checkStatus, adminOnly } = require('../middlewares/authMiddleware');

router.get('/work-config', protect, checkStatus, getWorkConfig);
router.get('/me', protect, checkStatus, getMyAttendances);
router.get('/', protect, adminOnly, getAllAttendances);
router.post('/checkin', protect, checkStatus, checkIn);
router.post('/test', protect, checkStatus, runAttendanceTest);
router.get('/test/me', protect, checkStatus, getMyAttendanceTests);
router.get('/test', protect, adminOnly, getAllAttendanceTests);
router.post('/log-attempt', protect, checkStatus, logSecurityAttempt);
router.patch('/:id/note', protect, adminOnly, updateAttendanceNote);

module.exports = router;
