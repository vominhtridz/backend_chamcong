/**
 * Exception Handler Utility
 * Manages creation and validation of attendance exceptions
 * Used when check-in or check-out is missing or problematic
 */

const EXCEPTION_TYPES = {
  MISSING_IN: 'MissingIn',
  MISSING_OUT: 'MissingOut',
  INVALID_IN: 'InvalidIn',
  INVALID_OUT: 'InvalidOut',
  LATE_WITH_REASON: 'LateWithReason',
  EARLY_WITH_REASON: 'EarlyWithReason',
};

const EXCEPTION_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const VALID_REASONS = [
  'Quên check-in',
  'Quên check-out',
  'Mạng lỗi',
  'Lỗi khuôn mặt',
  'Vấn đề camera',
  'Tự do công việc',
  'Yêu cầu từ quản lý',
  'Lý do khác',
];

/**
 * Validate if reason is valid for exception
 * @param {string} reason
 * @returns {boolean}
 */
const isValidExceptionReason = (reason) => {
  return VALID_REASONS.includes(reason);
};

/**
 * Create exception request object
 * @param {object} params - {userId, date, type, reason, comment, attachmentUrls}
 * @returns {object} - Exception request object or error
 */
const createExceptionRequest = (params = {}) => {
  const { userId, date, type, reason, comment = '', attachmentUrls = [] } = params;

  // Validation
  if (!userId) {
    return { error: 'userId is required' };
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'date must be in format YYYY-MM-DD' };
  }
  if (!Object.values(EXCEPTION_TYPES).includes(type)) {
    return { error: `type must be one of: ${Object.values(EXCEPTION_TYPES).join(', ')}` };
  }
  if (!isValidExceptionReason(reason)) {
    return { error: `reason must be one of: ${VALID_REASONS.join(', ')}` };
  }

  const now = Date.now();
  
  return {
    userId,
    date,
    type,
    reason,
    comment: String(comment).trim().slice(0, 1000),
    attachmentUrls: Array.isArray(attachmentUrls) ? attachmentUrls.slice(0, 5) : [],
    status: EXCEPTION_STATUS.PENDING,
    createdAt: now,
    updatedAt: now,
    approvedBy: null,
    approvalNote: '',
  };
};

/**
 * Calculate what check points are missing for a day
 * @param {object} attendance - Attendance record
 * @param {object} settings - Shift settings with workStartTime, workEndTime
 * @returns {Array<string>} - ['CheckIn'] or ['CheckOut'] or ['CheckIn', 'CheckOut']
 */
const calculateMissingCheckPoints = (attendance = {}, settings = {}) => {
  const missing = [];

  if (!attendance.checkInTime) {
    missing.push('CheckIn');
  }
  if (!attendance.checkOutTime) {
    missing.push('CheckOut');
  }

  return missing;
};

/**
 * Suggest exception type based on missing check points
 * @param {Array<string>} missingPoints - Result from calculateMissingCheckPoints
 * @returns {string} - Suggested exception type
 */
const suggestExceptionType = (missingPoints = []) => {
  if (missingPoints.includes('CheckIn') && missingPoints.includes('CheckOut')) {
    return EXCEPTION_TYPES.MISSING_IN; // Priority: check-in
  }
  if (missingPoints.includes('CheckIn')) {
    return EXCEPTION_TYPES.MISSING_IN;
  }
  if (missingPoints.includes('CheckOut')) {
    return EXCEPTION_TYPES.MISSING_OUT;
  }
  return null;
};

/**
 * Check if exception request should be automatically created
 * @param {object} attendance - Attendance record
 * @param {object} settings - Shift settings
 * @returns {object} - { shouldCreate, reason, type }
 */
const shouldAutoCreateException = (attendance = {}, settings = {}) => {
  const missing = calculateMissingCheckPoints(attendance, settings);
  
  if (missing.length === 0) {
    return {
      shouldCreate: false,
      reason: 'No missing check points',
      type: null,
    };
  }

  const type = suggestExceptionType(missing);

  return {
    shouldCreate: true,
    reason: `Missing: ${missing.join(', ')}`,
    type,
  };
};

/**
 * Generate readable message for exception type
 * @param {string} type - Exception type
 * @returns {string}
 */
const getExceptionTypeMessage = (type) => {
  const messages = {
    [EXCEPTION_TYPES.MISSING_IN]: 'Quên/không thể check-in',
    [EXCEPTION_TYPES.MISSING_OUT]: 'Quên/không thể check-out',
    [EXCEPTION_TYPES.INVALID_IN]: 'Check-in không hợp lệ',
    [EXCEPTION_TYPES.INVALID_OUT]: 'Check-out không hợp lệ',
    [EXCEPTION_TYPES.LATE_WITH_REASON]: 'Đi trễ có lý do',
    [EXCEPTION_TYPES.EARLY_WITH_REASON]: 'Về sớm có lý do',
  };
  return messages[type] || 'Ngoại lệ chấm công';
};

/**
 * Generate readable message for exception status
 * @param {string} status - Exception status
 * @returns {string}
 */
const getExceptionStatusMessage = (status) => {
  const messages = {
    [EXCEPTION_STATUS.PENDING]: 'Chờ duyệt',
    [EXCEPTION_STATUS.APPROVED]: 'Đã duyệt',
    [EXCEPTION_STATUS.REJECTED]: 'Bị từ chối',
    [EXCEPTION_STATUS.CANCELLED]: 'Đã hủy',
  };
  return messages[status] || 'Không xác định';
};

module.exports = {
  EXCEPTION_TYPES,
  EXCEPTION_STATUS,
  VALID_REASONS,
  isValidExceptionReason,
  createExceptionRequest,
  calculateMissingCheckPoints,
  suggestExceptionType,
  shouldAutoCreateException,
  getExceptionTypeMessage,
  getExceptionStatusMessage,
};
