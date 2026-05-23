const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const axios = require('axios');
const FormData = require('form-data');
const User = require('../models/User');

// SỬA LỖI Ở ĐÂY: Xử lý cả 2 trường hợp export từ config/firebase.js
const firebaseInstance = require('../config/firebase');
const db = firebaseInstance.db || firebaseInstance; // Nếu export là { db } thì lấy .db, nếu export trực tiếp db thì lấy luôn

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});
exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    if (req.user.role === 'Admin') {
      return res.status(200).json({
        success: true,
        data: {
          id: userId,
          email: req.user.email,
          role: 'Admin',
          status: 'Active',
          isFaceRegistered: true,
          personalInfo: { fullName: 'Quản trị viên' },
        },
      });
    }

    const snapshot = await db.ref(`users/${userId}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
    }

    const userData = snapshot.val();

    // Loại bỏ dữ liệu nhạy cảm
    const {
      password,
      resetPasswordOTP,
      resetPasswordExpires,
      ...safeUser
    } = userData;

    // Trả về dữ liệu đầy đủ cho Profile.jsx
    return res.status(200).json({
      success: true,
      data: {
        id: userId,

        // Thông tin cơ bản
        email: safeUser.email || '',
        role: safeUser.role || 'Employee',
        status: safeUser.status || 'Pending',

        // Personal Info
        personalInfo: {
          fullName: safeUser.personalInfo?.fullName || '',
          phoneNumber: safeUser.personalInfo?.phoneNumber || '',
          department: safeUser.personalInfo?.department || '',
          position: safeUser.personalInfo?.position || '',
        },

        // Avatar
        profileImage: safeUser.profileImage || '',

        // Face Recognition
        isFaceRegistered: safeUser.isFaceRegistered || false,
        totalFaceData: safeUser.faceData
          ? safeUser.faceData.length
          : 0,

        // Time
        createdAt: safeUser.createdAt || null,
        updatedAt: safeUser.updatedAt || null,
      },
    });
  } catch (error) {
    console.error('GET PROFILE ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

/**
 * ================================
 * UPDATE PROFILE
 * ================================
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      fullName,
      phoneNumber,
      department,
      position,
      profileImage,
    } = req.body;

    const userRef = db.ref(`users/${userId}`);

    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: 'Người dùng không tồn tại',
      });
    }

    const oldUser = snapshot.val();

    // Update
    const updatedUser = {
      ...oldUser,

      personalInfo: {
        ...oldUser.personalInfo,

        fullName:
          fullName || oldUser.personalInfo?.fullName || '',

        phoneNumber:
          phoneNumber ||
          oldUser.personalInfo?.phoneNumber ||
          '',

        department:
          department ||
          oldUser.personalInfo?.department ||
          '',

        position:
          position ||
          oldUser.personalInfo?.position ||
          '',
      },

      profileImage:
        profileImage || oldUser.profileImage || '',

      updatedAt: Date.now(),
    };

    await userRef.update(updatedUser);

    // Remove sensitive data
    delete updatedUser.password;
    delete updatedUser.resetPasswordOTP;
    delete updatedUser.resetPasswordExpires;

    return res.status(200).json({
      success: true,
      message: 'Cập nhật hồ sơ thành công',
      data: updatedUser,
    });
  } catch (error) {
    console.error('UPDATE PROFILE ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi cập nhật hồ sơ',
      error: error.message,
    });
  }
};

/**
 * ================================
 * UPLOAD AVATAR IMG.BB
 * ================================
 */
exports.uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ảnh',
      });
    }

    // IMG.BB API KEY
    const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

    // Convert buffer -> base64
    const base64Image = req.file.buffer.toString('base64');

    const formData = new FormData();

    formData.append('image', base64Image);

    // Upload lên ImgBB
    const uploadResponse = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      formData,
      {
        headers: formData.getHeaders(),
      }
    );

    const imageUrl =
      uploadResponse.data.data.display_url;

    // Update Firebase
    await db.ref(`users/${userId}`).update({
      profileImage: imageUrl,
      updatedAt: Date.now(),
    });

    return res.status(200).json({
      success: true,
      message: 'Upload avatar thành công',
      profileImage: imageUrl,
    });
  } catch (error) {
    console.error('UPLOAD AVATAR ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi upload avatar',
      error: error.message,
    });
  }
};

// 1. Yêu cầu gửi mã OTP
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const snapshot = await db.ref('users').orderByChild('email').equalTo(email).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản với email này' });
    }

    const userData = snapshot.val();
    const userId = Object.keys(userData)[0];
    const user = userData[userId];

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await db.ref(`users/${userId}`).update({
      resetPasswordOTP: otp,
      resetPasswordExpires: Date.now() + 10 * 60 * 1000
    });

    const mailOptions = {
      from: `"Hệ thống chấm công" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Mã xác nhận đặt lại mật khẩu',
      html: `
        <h3>Xin chào ${user.personalInfo?.fullName || 'bạn'},</h3>
        <p>Bạn đã yêu cầu đặt lại mật khẩu. Mã OTP của bạn là: <strong style="font-size:24px; color:#1976d2;">${otp}</strong></p>
        <p>Mã này sẽ hết hạn sau 10 phút.</p>
        <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'Mã OTP đã được gửi đến email của bạn!' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi gửi email', error: error.message });
  }
};

// 2. Xác nhận OTP và đặt lại mật khẩu mới
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const snapshot = await db.ref('users').orderByChild('email').equalTo(email).once('value');

    if (!snapshot.exists()) {
      return res.status(400).json({ message: 'Mã OTP không hợp lệ hoặc đã hết hạn' });
    }

    const userData = snapshot.val();
    const userId = Object.keys(userData)[0];
    const user = userData[userId];

    if (user.resetPasswordOTP !== otp || user.resetPasswordExpires <= Date.now()) {
      return res.status(400).json({ message: 'Mã OTP không hợp lệ hoặc đã hết hạn' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db.ref(`users/${userId}`).update({
      password: hashedPassword,
      resetPasswordOTP: null,
      resetPasswordExpires: null
    });

    res.status(200).json({ message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập.' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 3. Đăng nhập (Cho User/Nhân viên)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ email và mật khẩu' });
    }

    const snapshot = await db.ref('users').orderByChild('email').equalTo(email).once('value');
    
    if (!snapshot.exists()) {
      return res.status(400).json({ message: 'Email hoặc mật khẩu không chính xác' });
    }

    const userData = snapshot.val();
    const userId = Object.keys(userData)[0];
    const user = userData[userId];

    if (user.status === 'Inactive') {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Email hoặc mật khẩu không chính xác' });
    }

    const token = jwt.sign(
      { id: userId, role: user.role },
      process.env.JWT_SECRET || 'SECRET_KEY_123',
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: userId,
        email: user.email,
        role: user.role,
        status: user.status,
        isFaceRegistered: user.isFaceRegistered || false,
        fullName: user.personalInfo?.fullName
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 4. Đăng ký nhân viên mới (Email, Password, Confirm Password)
exports.register = async (req, res) => {
  try {
    const { email, password, confirmPassword, fullName } = req.body;
    const normalizedEmail = (email || '').toLowerCase().trim();

    if (!normalizedEmail || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập Email, Mật khẩu và Xác nhận mật khẩu' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Mật khẩu xác nhận không khớp' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    const existingUserSnap = await db.ref('users').orderByChild('email').equalTo(normalizedEmail).once('value');
    if (existingUserSnap.exists()) {
      return res.status(400).json({ message: 'Email này đã được đăng ký' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const displayName = fullName?.trim() || normalizedEmail.split('@')[0];

    const newUserRef = db.ref('users').push(); 
    await newUserRef.set({
      email: normalizedEmail,
      password: hashedPassword,
      employeeCode: `NV${newUserRef.key.slice(-6).toUpperCase()}`,
      personalInfo: {
        fullName: displayName,
      },
      role: 'Employee',
      status: 'Pending',
      isFaceRegistered: false,
      profileImage: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await db.ref('notifications').push().set({
      type: 'NEW_EMPLOYEE',
      userId: newUserRef.key,
      message: `Nhân viên mới ${displayName} (${normalizedEmail}) vừa đăng ký. Cần lấy mẫu khuôn mặt.`,
      createdAt: Date.now(),
      read: false,
    });

    res.status(201).json({ 
      message: 'Đăng ký thành công! Vui lòng chờ Admin duyệt và cập nhật khuôn mặt.' 
    });

  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 5. Đăng nhập dành cho Admin
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const snapshot = await db.ref('admins').orderByChild('email').equalTo(email).once('value');
    
    if (!snapshot.exists()) {
      return res.status(400).json({ message: 'Sai tài khoản hoặc mật khẩu!' });
    }

    const adminData = snapshot.val();
    const adminId = Object.keys(adminData)[0];
    const admin = adminData[adminId];

    const isMatch = await bcrypt.compare(password, admin.password_hash || admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Sai tài khoản hoặc mật khẩu!' });
    }

    const adminUser = {
      id: adminId,
      email: admin.email,
      role: 'Admin',
      status: 'Active',
      isFaceRegistered: true,
    };

    const token = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: 'Admin' },
      process.env.JWT_SECRET || 'SECRET_KEY_123',
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Đăng nhập thành công!',
      token,
      admin: adminUser,
    });

  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};