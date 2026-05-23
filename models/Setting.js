class Setting {
  constructor(data = {}) {
    // Gán giá trị mặc định nếu không truyền vào
    this.start_time = data.start_time || '08:00'; // Định dạng HH:mm
    this.end_time = data.end_time || '17:00';     // Định dạng HH:mm
    
    // Xử lý riêng cho threshold (nếu data là 0 thì lấy 0, nếu undefined thì lấy mặc định 0.5)
    this.confidence_threshold = data.confidence_threshold !== undefined 
                                ? Number(data.confidence_threshold) 
                                : 0.5;

    // Tự động tạo Timestamps (thay thế cho { timestamps: true })
    const now = Date.now();
    this.createdAt = data.createdAt || now;
    this.updatedAt = now; // Luôn cập nhật thời gian mới nhất khi khởi tạo lại
  }

  // Phương thức chuyển đổi thành JSON thuần để lưu vào Firebase
  toFirebaseJSON() {
    return {
      start_time: this.start_time,
      end_time: this.end_time,
      confidence_threshold: this.confidence_threshold,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Setting;