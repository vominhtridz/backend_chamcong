const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employee_code: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    index: true // Đánh index để search nhân viên nhanh hơn
  },
  full_name: { 
    type: String, 
    required: true 
  },
  department: { 
    type: String,
    required: true
  },
  status: { 
    type: String, 
    enum: ['Active', 'Inactive', 'OnLeave'], 
    default: 'Active' 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Employee', employeeSchema);