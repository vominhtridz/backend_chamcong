class Notification {
  constructor(data = {}) {
    // 1. Nội dung thông báo
    this.message = data.message ? data.message.trim() : '';
    
    // 2. Trạng thái đã đọc (mặc định là false)
    this.isRead = data.isRead !== undefined ? Boolean(data.isRead) : false;

    // 3. Các trường tùy chọn (có thể dùng để phân loại hoặc gửi đích danh)
    this.recipientId = data.recipientId || null; 
    this.type = data.type || 'System'; // VD: 'NewUser', 'System', 'Alert'

    // 4. Timestamps (Tự động tạo thời gian dạng mili-giây)
    const now = Date.now();
    this.createdAt = data.createdAt || now;
    this.updatedAt = now;
  }

  // Chuyển đổi thành Object thuần để đẩy lên Firebase
  toFirebaseJSON() {
    const json = {
      message: this.message,
      isRead: this.isRead,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };

    // Chỉ đẩy các trường tùy chọn lên Firebase nếu chúng có dữ liệu 
    // (Giúp tiết kiệm dung lượng database)
    if (this.recipientId) {
      json.recipientId = this.recipientId;
    }
    if (this.type) {
      json.type = this.type;
    }

    return json;
  }
}

module.exports = Notification;