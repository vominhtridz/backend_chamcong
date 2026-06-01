/**
 * AttendanceException Model
 * Represents exceptions/requests for missing or invalid check-in/check-out
 */

class AttendanceException {
  constructor(data = {}) {
    // 1. Định danh
    this.userId = data.userId || '';
    this.attendanceId = data.attendanceId || ''; // Reference to attendance record
    this.date = data.date || ''; // YYYY-MM-DD

    // 2. Exception details
    this.type = data.type || 'MissingIn'; // MissingIn | MissingOut | InvalidIn | InvalidOut | LateWithReason | EarlyWithReason
    this.reason = data.reason || ''; // Reason for exception
    this.comment = data.comment || ''; // Detailed explanation
    this.attachmentUrls = data.attachmentUrls || []; // Evidence files

    // 3. Status tracking
    this.status = data.status || 'Pending'; // Pending | Approved | Rejected | Cancelled
    this.approvedBy = data.approvedBy || null; // User ID of approver
    this.approvalNote = data.approvalNote || ''; // Approval/rejection reason
    
    // 4. Adjustment
    this.adjustedCheckInTime = data.adjustedCheckInTime || null; // Adjusted check-in time if approved
    this.adjustedCheckOutTime = data.adjustedCheckOutTime || null; // Adjusted check-out time if approved
    this.adjustedLateMinutes = data.adjustedLateMinutes || 0;
    this.adjustedEarlyMinutes = data.adjustedEarlyMinutes || 0;
    this.adjustedWorkedMinutes = data.adjustedWorkedMinutes || 0;

    // 5. Timestamps
    const now = Date.now();
    this.createdAt = data.createdAt || now;
    this.updatedAt = now;
    this.approvedAt = data.approvedAt || null;
  }

  // Convert to plain object for Firebase
  toFirebaseJSON() {
    return {
      userId: this.userId,
      attendanceId: this.attendanceId,
      date: this.date,
      type: this.type,
      reason: this.reason,
      comment: this.comment,
      attachmentUrls: this.attachmentUrls,
      status: this.status,
      approvedBy: this.approvedBy,
      approvalNote: this.approvalNote,
      adjustedCheckInTime: this.adjustedCheckInTime,
      adjustedCheckOutTime: this.adjustedCheckOutTime,
      adjustedLateMinutes: this.adjustedLateMinutes,
      adjustedEarlyMinutes: this.adjustedEarlyMinutes,
      adjustedWorkedMinutes: this.adjustedWorkedMinutes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      approvedAt: this.approvedAt,
    };
  }

  // Get readable status
  getStatusDisplay() {
    const displays = {
      Pending: { text: 'Chờ duyệt', color: 'yellow', icon: '⏳' },
      Approved: { text: 'Đã duyệt', color: 'green', icon: '✓' },
      Rejected: { text: 'Bị từ chối', color: 'red', icon: '✕' },
      Cancelled: { text: 'Đã hủy', color: 'gray', icon: '○' },
    };
    return displays[this.status] || { text: this.status, color: 'gray', icon: '?' };
  }

  // Get readable type
  getTypeDisplay() {
    const displays = {
      MissingIn: 'Không check-in',
      MissingOut: 'Không check-out',
      InvalidIn: 'Check-in không hợp lệ',
      InvalidOut: 'Check-out không hợp lệ',
      LateWithReason: 'Đi trễ có lý do',
      EarlyWithReason: 'Về sớm có lý do',
    };
    return displays[this.type] || this.type;
  }
}

module.exports = AttendanceException;
