const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  registerEmployeeFace,
  deleteEmployee,
  resetEmployeeFace,
  markFaceNeedsUpdate,
  getFaceHistory,
  exportEmployeesCsv,
  importEmployeesCsv,
} = require('../controllers/employeeController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.use(protect, adminOnly);

router.get('/export/csv', exportEmployeesCsv);
router.post('/import/csv', importEmployeesCsv);
router.get('/', getEmployees);
router.get('/:id/face-history', getFaceHistory);
router.get('/:id', getEmployeeById);
router.post('/', addEmployee);
router.put('/:id', updateEmployee);
router.post('/:id/register-face', registerEmployeeFace);
router.post('/:id/reset-face', resetEmployeeFace);
router.post('/:id/mark-face-update', markFaceNeedsUpdate);
router.delete('/:id', deleteEmployee);

module.exports = router;
