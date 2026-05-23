require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const connectDB = require('./config/firebase.js');
const app = express();

// Middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendances', require('./routes/attendanceRoutes'));
app.use('/api/employees', employeeRoutes);
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
// Connect DB & Start Server
app.listen(process.env.PORT, () => console.log(`Server chạy port ${process.env.PORT}`))

