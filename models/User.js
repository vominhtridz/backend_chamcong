class User {
  constructor(data) {
    // Thông tin cơ bản
    this.email = data.email ? data.email.toLowerCase().trim() : '';
    this.password = data.password || ''; // Mật khẩu đã được hash từ Controller
    this.role = data.role || 'Employee'; // Enum: 'Admin', 'Employee'
    this.status = data.status || 'Pending'; // Enum: 'Pending', 'Active', 'Inactive'

    // Khởi tạo personalInfo để tránh lỗi undefined
    const info = data.personalInfo || {};
    this.personalInfo = {
      fullName: info.fullName ? info.fullName.trim() : '',
      phoneNumber: info.phoneNumber ? info.phoneNumber.trim() : '',
      department: info.department ? info.department.trim() : '',
      position: info.position ? info.position.trim() : '',
    };

    // Dữ liệu khuôn mặt và ảnh
    this.profileImage = data.profileImage || '';
    this.faceData = data.faceData || []; // Mảng 2 chiều chứa Face Descriptors
    this.isFaceRegistered = data.isFaceRegistered || false;

    // Quên mật khẩu
    this.resetPasswordOTP = data.resetPasswordOTP || null;
    this.resetPasswordExpires = data.resetPasswordExpires || null;

    // Timestamps (Tự động thêm giống Mongoose)
    const now = Date.now();
    this.createdAt = data.createdAt || now;
    this.updatedAt = now;
  }

  // Hàm này tương đương với method toJSON() của Mongoose
  // Dùng để loại bỏ password trước khi gửi về Frontend
  toSafeObject() {
    const safeUser = { ...this };
    delete safeUser.password;
    delete safeUser.resetPasswordOTP;
    delete safeUser.resetPasswordExpires;
    return safeUser;
  }

  // Hàm để lọc ra object thuần túy dùng để lưu vào Firebase (Firebase không nhận Class instance)
  toFirebaseJSON() {
    return {
      email: this.email,
      password: this.password,
      role: this.role,
      status: this.status,
      personalInfo: this.personalInfo,
      profileImage: this.profileImage,
      faceData: this.faceData,
      isFaceRegistered: this.isFaceRegistered,
      resetPasswordOTP: this.resetPasswordOTP,
      resetPasswordExpires: this.resetPasswordExpires,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = User;