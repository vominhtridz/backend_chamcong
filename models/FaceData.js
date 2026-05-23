class FaceData {
  constructor(data = {}) {
    // ID của nhân viên (Dùng làm liên kết ngoại)
    this.employee_id = data.employee_id || '';

    // Mảng 2 chiều: Chứa nhiều mẫu khuôn mặt, mỗi mẫu 128 số
    // Ví dụ: [ [0.1, 0.2...], [0.15, 0.25...] ]
    this.face_descriptor = data.face_descriptor || [];

    // Mảng chứa các đường dẫn hoặc URL ảnh trích xuất
    this.images = data.images || [];

    // Timestamps
    const now = Date.now();
    this.createdAt = data.createdAt || now;
    this.updatedAt = now;
  }

  // Chuyển đổi thành Object thuần để đẩy lên Firebase
  toFirebaseJSON() {
    return {
      employee_id: this.employee_id,
      face_descriptor: this.face_descriptor,
      images: this.images,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = FaceData;