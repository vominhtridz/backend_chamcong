const DEFAULT_WORK_START = '22:40';
const DEFAULT_WORK_END = '04:30';
const DEFAULT_LATE_THRESHOLD = 15;

const timeToMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
};

const formatDate = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateAtTime = (dateStr, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
};

const isOvernightShift = (workStartTime, workEndTime) =>
  timeToMinutes(workEndTime) <= timeToMinutes(workStartTime);

/**
 * Ngày ca làm: ca 22:40–04:30 thì 00:00–04:30 sáng vẫn thuộc ca tối hôm trước.
 */
const getShiftDate = (now = new Date(), workStartTime, workEndTime) => {
  const today = formatDate(now);
  if (!isOvernightShift(workStartTime, workEndTime)) {
    return today;
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(workStartTime);
  const endMin = timeToMinutes(workEndTime);

  if (nowMin <= endMin) {
    const prev = new Date(now);
    prev.setDate(prev.getDate() - 1);
    return formatDate(prev);
  }

  if (nowMin >= startMin) {
    return today;
  }

  return today;
};

const getShiftBounds = (shiftDate, settings) => {
  const workStartTime = settings.workStartTime || DEFAULT_WORK_START;
  const workEndTime = settings.workEndTime || DEFAULT_WORK_END;
  const lateThreshold = Number(settings.lateThreshold) || 0;

  const checkInStart = parseDateAtTime(shiftDate, workStartTime);
  const checkInDeadline = new Date(checkInStart);
  checkInDeadline.setMinutes(checkInDeadline.getMinutes() + lateThreshold);

  const checkOutEnd = parseDateAtTime(shiftDate, workEndTime);
  if (isOvernightShift(workStartTime, workEndTime)) {
    checkOutEnd.setDate(checkOutEnd.getDate() + 1);
  }

  return { checkInStart, checkInDeadline, checkOutEnd, workStartTime, workEndTime, lateThreshold };
};

const formatTimeVi = (date) =>
  date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const minutesBetween = (later, earlier) =>
  Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 60000));

/**
 * Kiểm tra check-in theo yêu cầu Vietnam:
 * - 08:00 - 10:45: On Time (grace period 15 min from 10:30)
 * - 10:46 - 13:00: Late (tính từ 08:00, không phải từ 10:30)
 * - Sau 13:00: Missing In
 * 
 * IMPORTANT: Late minutes count from original start time (08:00),
 * NOT from end of grace period (10:30).
 * Example: Check-in at 10:46 → Late = (10:46 - 08:00) = 166 minutes, NOT 16 minutes
 */
const evaluateCheckIn = (now = new Date(), settings = {}) => {
  const shiftDate = getShiftDate(now, settings.workStartTime, settings.workEndTime);
  const bounds = getShiftBounds(shiftDate, settings);
  const { checkInStart, checkInDeadline, workStartTime } = bounds;
  
  // Calculate extended deadline (lateThreshold + grace period)
  const extendedDeadline = new Date(checkInStart);
  const maxLateMinutes = Number(settings.maxLateMinutes) || 120; // Default 2 hours
  extendedDeadline.setMinutes(extendedDeadline.getMinutes() + maxLateMinutes);

  // Before start time
  if (now.getTime() < checkInStart.getTime()) {
    return {
      allowed: false,
      shiftDate,
      lateMinutes: 0,
      isLate: false,
      status: null,
      message: `Chưa đến giờ check-in (${workStartTime}). Vui lòng quay lại sau ${formatTimeVi(checkInStart)}.`,
    };
  }

  // Calculate late minutes from original start time (NOT from grace period end)
  const lateMinutes = minutesBetween(now, checkInStart);
  const gracePeriodMinutes = Number(settings.lateThreshold) || 15;
  
  // Determine status based on grace period
  const isLate = lateMinutes > gracePeriodMinutes;

  // Beyond extended deadline (no check-in allowed)
  if (now.getTime() > extendedDeadline.getTime()) {
    return {
      allowed: false,
      shiftDate,
      lateMinutes,
      isLate: true,
      status: 'Missing',
      message: `Quá hạn check-in. Ca làm từ ${workStartTime} - ${bounds.workEndTime}. Vui lòng liên hệ quản lý.`,
    };
  }

  // Within allowed window (even if late)
  return {
    allowed: true,
    shiftDate,
    lateMinutes,
    isLate,
    status: isLate ? 'Late' : 'OnTime',
    graceMinutes: Math.max(0, gracePeriodMinutes - lateMinutes),
    message: isLate
      ? `Check-in trễ ${lateMinutes} phút. Vẫn được ghi nhận (tính từ ${workStartTime}).`
      : `Check-in đúng giờ — trong grace period ${gracePeriodMinutes} phút.`,
  };
};

/**
 * Kiểm tra check-out theo yêu cầu Vietnam:
 * - Trước 17:30: Early Out
 * - 17:30+: On Time
 * - 18:30+: Overtime (optional)
 * - Sau 23:59: Missing Out / Forgot checkout
 */
const evaluateCheckOut = (now = new Date(), settings = {}, shiftDate) => {
  const bounds = getShiftBounds(shiftDate, settings);
  const { checkOutEnd, workEndTime } = bounds;
  const workEndMinutes = timeToMinutes(workEndTime);
  
  // Parse check-out settings
  const earlyOutMinutes = Number(settings.earlyOutThreshold) || 30; // Default 30 min early
  const overtimeStartMinutes = Number(settings.overtimeStartTime) 
    ? timeToMinutes(settings.overtimeStartTime)
    : workEndMinutes + 60; // Default 1 hour after end time
  const maxWorkMinutes = Number(settings.maxWorkMinutes) || 16 * 60; // Default 16 hours

  const earlyCheckoutMinutes =
    now.getTime() < checkOutEnd.getTime() ? minutesBetween(checkOutEnd, now) : 0;
  const lateCheckoutMinutes =
    now.getTime() > checkOutEnd.getTime() ? minutesBetween(now, checkOutEnd) : 0;

  let checkOutStatus = 'OnTime';
  let statusDetail = '';

  if (lateCheckoutMinutes > 0) {
    checkOutStatus = 'Late';
    
    // Check if overtime
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes >= overtimeStartMinutes) {
      checkOutStatus = 'Overtime';
      statusDetail = 'OT';
    }
  } else if (earlyCheckoutMinutes > 0) {
    checkOutStatus = 'Early';
  }

  let message = 'Check-out đúng giờ — Ca làm việc hoàn tất.';
  if (earlyCheckoutMinutes > 0) {
    message = `Check-out sớm ${earlyCheckoutMinutes} phút (giờ kết thúc ca: ${workEndTime}). Có thể tạo yêu cầu giải trình.`;
  } else if (lateCheckoutMinutes > 0 && checkOutStatus === 'Overtime') {
    message = `Check-out trễ ${lateCheckoutMinutes} phút — Tính làm thêm giờ (OT).`;
  } else if (lateCheckoutMinutes > 0) {
    message = `Check-out trễ ${lateCheckoutMinutes} phút so với giờ kết thúc ca (${workEndTime}).`;
  }

  return {
    allowed: true,
    checkOutStatus,
    statusDetail,
    earlyCheckoutMinutes,
    lateCheckoutMinutes,
    isOvertime: checkOutStatus === 'Overtime',
    message,
  };
};

/** Tính số phút làm việc từ check-in đến check-out */
const calcWorkedMinutes = (checkInTime, checkOutTime) => {
  if (!checkInTime || !checkOutTime) return 0;
  return Math.max(0, Math.floor((checkOutTime - checkInTime) / 60000));
};

/**
 * Get daily attendance status matrix (Valid/Invalid)
 * @param {object} attendance - Attendance record
 * @param {object} settings - Shift settings
 * @returns {object} - { isValid, status, reasons, color }
 */
const getAttendanceStatusMatrix = (attendance = {}, settings = {}) => {
  const reasons = [];
  
  // Check missing check-in
  if (!attendance.checkInTime) {
    reasons.push('Không check-in');
  }
  
  // Check missing check-out
  if (!attendance.checkOutTime) {
    reasons.push('Không check-out');
  }
  
  // Check late check-in
  if (attendance.status === 'Late') {
    reasons.push(`Đi trễ ${attendance.lateMinutes || 0} phút`);
  }
  
  // Check early check-out
  if (attendance.checkOutStatus === 'Early') {
    reasons.push(`Về sớm ${attendance.earlyCheckoutMinutes || 0} phút`);
  }
  
  // Check exception flag
  if (attendance.hasException) {
    reasons.push('Có ngoại lệ');
  }

  // Valid day: Check-in OnTime AND Check-out OnTime
  const isValid = 
    attendance.checkInTime && 
    attendance.checkOutTime &&
    attendance.status === 'OnTime' && 
    (attendance.checkOutStatus === 'OnTime' || attendance.checkOutStatus === 'Overtime') &&
    !attendance.hasException;

  return {
    isValid,
    dayStatus: isValid ? 'Valid' : 'Invalid', // Vietnamese: Đủ công / Không đủ công
    displayText: isValid ? 'Đủ công' : 'Không đủ công',
    reasons,
    color: isValid ? 'green' : 'red',
    canCreateException: !isValid && reasons.length > 0,
  };
};

/** Trạng thái ca hiện tại để hiển thị trên frontend */
const getShiftContext = (now = new Date(), settings = {}, existingRecord = null) => {
  const shiftDate = getShiftDate(now, settings.workStartTime, settings.workEndTime);
  const bounds = getShiftBounds(shiftDate, settings);
  const checkInEval = evaluateCheckIn(now, settings);

  let phase = 'idle';
  let message = '';
  let canCheckIn = false;
  let canCheckOut = false;

  if (existingRecord?.checkInTime && existingRecord?.checkOutTime) {
    phase = 'completed';
    canCheckIn = false;
    canCheckOut = false;
    message =
      'Bạn đã hoàn tất check-in và check-out cho ca này. Vui lòng chờ đến ngày ca tiếp theo để chấm công lại.';
  } else if (existingRecord?.checkInTime && !existingRecord?.checkOutTime) {
    const checkOutEval = evaluateCheckOut(now, settings, existingRecord.date || shiftDate);
    phase = 'checkOut';
    canCheckOut = true;
    canCheckIn = false;
    message = checkOutEval.message;
  } else if (!existingRecord?.checkInTime) {
    if (checkInEval.allowed) {
      phase = 'checkIn';
      canCheckIn = true;
      message = checkInEval.message;
    } else {
      phase = 'waitCheckIn';
      message = checkInEval.message;
    }
  }

  return {
    shiftDate,
    phase,
    message,
    canCheckIn,
    canCheckOut,
    workStartTime: bounds.workStartTime,
    workEndTime: bounds.workEndTime,
    lateThreshold: bounds.lateThreshold,
    checkInWindow: {
      from: bounds.checkInStart.getTime(),
      onTimeUntil: bounds.checkInDeadline.getTime(),
    },
    checkOutFrom: bounds.checkOutEnd.getTime(),
  };
};

module.exports = {
  DEFAULT_WORK_START,
  DEFAULT_WORK_END,
  DEFAULT_LATE_THRESHOLD,
  getShiftDate,
  getShiftBounds,
  evaluateCheckIn,
  evaluateCheckOut,
  getShiftContext,
  calcWorkedMinutes,
  getAttendanceStatusMatrix,
  isOvernightShift,
  timeToMinutes,
  formatDate,
  formatTimeVi,
  minutesBetween,
};
