class Attendance {
  constructor(data = {}) {
    // 1. Thông tin định danh
    this.userId = data.userId || '';
    this.date = data.date || ''; // Định dạng YYYY-MM-DD

    // 2. Thời gian check-in / check-out (Nên lưu bằng Timestamp dạng số mili-giây)
    this.checkInTime = data.checkInTime || null;
    this.checkOutTime = data.checkOutTime || null;

    // 3. Trạng thái chấm công
    // Enum: 'OnTime', 'Late', 'Absent', 'EarlyLeave'
    this.status = data.status || 'Absent';

    // 4. Hình ảnh xác thực (Link ImgBB)
    this.verifyImageIn = data.verifyImageIn || '';
    this.verifyImageOut = data.verifyImageOut || '';

    // 5. Timestamps
    const now = Date.now();
    this.createdAt = data.createdAt || now;
    this.updatedAt = now;
  }

  // Chuyển đổi thành Object thuần để lưu vào Firebase
  toFirebaseJSON() {
    return {
      userId: this.userId,
      date: this.date,
      checkInTime: this.checkInTime,
      checkOutTime: this.checkOutTime,
      status: this.status,
      verifyImageIn: this.verifyImageIn,
      verifyImageOut: this.verifyImageOut,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Attendance;