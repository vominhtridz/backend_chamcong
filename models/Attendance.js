class Attendance {
  constructor(data = {}) {
    // 1. Thông tin định danh
    this.userId = data.userId || '';
    this.date = data.date || ''; // Định dạng YYYY-MM-DD

    // 2. Check-in/Check-out: Lưu thời gian thực tế (sau lọc spam)
    this.checkInTime = data.checkInTime || null;
    this.checkOutTime = data.checkOutTime || null;

    // 3. Spam Detection: Lưu tất cả các attempt
    this.checkInAttempts = data.checkInAttempts || []; // Array of {timestamp, imageUrl, ...}
    this.checkOutAttempts = data.checkOutAttempts || []; // Array of {timestamp, imageUrl, ...}

    // 4. Status fields (detailed)
    this.status = data.status || 'Absent'; // OnTime | Late | Missing | Absent
    this.checkOutStatus = data.checkOutStatus || null; // OnTime | Early | Late | Overtime | Missing
    
    // 5. Duration & late metrics
    this.lateMinutes = data.lateMinutes || 0; // Tính từ mốc gốc
    this.isLate = data.isLate || false;
    this.earlyCheckoutMinutes = data.earlyCheckoutMinutes || 0;
    this.lateCheckoutMinutes = data.lateCheckoutMinutes || 0;
    this.workedMinutes = data.workedMinutes || 0; // Tổng thời gian làm việc

    // 6. Daily Status Matrix
    this.dailyStatus = data.dailyStatus || 'Invalid'; // Valid | Invalid
    this.dailyStatusReasons = data.dailyStatusReasons || []; // Array of reason strings

    // 7. Exception handling
    this.hasException = data.hasException || false;
    this.exceptionId = data.exceptionId || null;
    this.note = data.note || '';

    // 8. Hình ảnh xác thực (Link ImgBB)
    this.verifyImageIn = data.verifyImageIn || '';
    this.verifyImageOut = data.verifyImageOut || '';

    // 9. Metadata
    this.faceDistance = data.faceDistance || null; // Check-in face distance
    this.faceDistanceOut = data.faceDistanceOut || null; // Check-out face distance
    this.checkInLocation = data.checkInLocation || null; // {latitude, longitude, inGeofence, distanceMeters}
    this.checkOutLocation = data.checkOutLocation || null;
    this.checkInMeta = data.checkInMeta || {}; // {ip, userAgent, deviceFingerprint, brightness}
    this.checkOutMeta = data.checkOutMeta || {};
    this.livenessChallenge = data.livenessChallenge || '';

    // 10. Timestamps
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
      checkInAttempts: this.checkInAttempts,
      checkOutAttempts: this.checkOutAttempts,
      status: this.status,
      checkOutStatus: this.checkOutStatus,
      lateMinutes: this.lateMinutes,
      isLate: this.isLate,
      earlyCheckoutMinutes: this.earlyCheckoutMinutes,
      lateCheckoutMinutes: this.lateCheckoutMinutes,
      workedMinutes: this.workedMinutes,
      dailyStatus: this.dailyStatus,
      dailyStatusReasons: this.dailyStatusReasons,
      hasException: this.hasException,
      exceptionId: this.exceptionId,
      note: this.note,
      verifyImageIn: this.verifyImageIn,
      verifyImageOut: this.verifyImageOut,
      faceDistance: this.faceDistance,
      faceDistanceOut: this.faceDistanceOut,
      checkInLocation: this.checkInLocation,
      checkOutLocation: this.checkOutLocation,
      checkInMeta: this.checkInMeta,
      checkOutMeta: this.checkOutMeta,
      livenessChallenge: this.livenessChallenge,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = Attendance;