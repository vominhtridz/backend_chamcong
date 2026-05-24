require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { verifyFirebase } = require('./config/firebase.js');

async function startServer() {
  await verifyFirebase();

  const app = express();

  // Middleware
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cors());

  // Routes
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/attendances', require('./routes/attendanceRoutes'));
  app.use('/api/employees', require('./routes/employeeRoutes'));
  app.use('/api/dashboard', require('./routes/dashboardRoutes'));
  app.use('/api/leaves', require('./routes/leaveRoutes'));

  app.listen(process.env.PORT, () =>
    console.log(`Server chạy port ${process.env.PORT}`)
  );
}

startServer().catch((err) => {
  console.error('Không khởi động được server:', err);
  process.exit(1);
});

