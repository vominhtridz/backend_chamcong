const express = require('express');
const router = express.Router();
const {
  getEmployees,
  addEmployee,
  updateEmployee,
  registerEmployeeFace,
  deleteEmployee,
} = require('../controllers/employeeController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.use(protect, adminOnly);

router.get('/', getEmployees);
router.post('/', addEmployee);
router.put('/:id', updateEmployee);
router.post('/:id/register-face', registerEmployeeFace);
router.delete('/:id', deleteEmployee);

module.exports = router;
