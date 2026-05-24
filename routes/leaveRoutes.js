const express = require('express');
const router = express.Router();
const {
  getLeaves,
  createLeave,
  updateLeaveStatus,
  deleteLeave,
} = require('../controllers/leaveController');
const { protect, checkStatus, adminOnly } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', checkStatus, getLeaves);
router.post('/', checkStatus, createLeave);
router.patch('/:id/status', adminOnly, updateLeaveStatus);
router.delete('/:id', checkStatus, deleteLeave);

module.exports = router;
