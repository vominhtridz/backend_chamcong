const express = require('express');
const router = express.Router();
const {
  kioskCheckIn,
  getAllAttendances,
  getMyAttendances,
  checkIn,
  getWorkConfig,
  updateAttendanceNote,
  logSecurityAttempt,
  runAttendanceTest,
  getMyAttendanceTests,
  getAllAttendanceTests,
  createAttendanceException,
  getMyExceptions,
  getAllExceptions,
  updateExceptionStatus,
} = require('../controllers/attendanceController');
const { protect, checkStatus, adminOnly } = require('../middlewares/authMiddleware');

// Attendance endpoints
router.get('/work-config', protect, checkStatus, getWorkConfig);
router.get('/me', protect, checkStatus, getMyAttendances);
router.get('/', protect, adminOnly, getAllAttendances);
router.post('/checkin', protect, checkStatus, checkIn);
router.post('/kiosk-checkin', kioskCheckIn); // Public endpoint for multi-employee checkin
router.post('/test', protect, checkStatus, runAttendanceTest);
router.get('/test/me', protect, checkStatus, getMyAttendanceTests);
router.get('/test', protect, adminOnly, getAllAttendanceTests);
router.post('/log-attempt', protect, checkStatus, logSecurityAttempt);
router.patch('/:id/note', protect, adminOnly, updateAttendanceNote);

// Exception endpoints
router.post('/exception/create', protect, checkStatus, createAttendanceException);
router.get('/exception/me', protect, checkStatus, getMyExceptions);
router.get('/exception', protect, adminOnly, getAllExceptions);
router.patch('/exception/:id/status', protect, adminOnly, updateExceptionStatus);

module.exports = router;
