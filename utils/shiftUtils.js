const DEFAULT_WORK_START = '22:40';
const DEFAULT_WORK_END = '04:30';
const DEFAULT_LATE_THRESHOLD = 15;

const timeToMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
};

// --- HÀM MỚI: Lấy chính xác Ngày/Giờ/Phút theo giờ Việt Nam bất chấp Server OS ---
const getVnTimeParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false // Ép định dạng 24h
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type).value;
  
  return {
    year: Number(getPart('year')),
    month: Number(getPart('month')),
    day: Number(getPart('day')),
    // Giờ 24h của Intl trả về 24 thay vì 0 lúc nửa đêm, cần normalize
    hour: Number(getPart('hour')) === 24 ? 0 : Number(getPart('hour')), 
    minute: Number(getPart('minute')),
  };
};

// FIX: Dùng getVnTimeParts thay vì date.getFullYear(), date.getMonth()
const formatDate = (date) => {
  const { year, month, day } = getVnTimeParts(date);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
};

// FIX: Ép cứng offset +07:00 vào chuỗi ISO để tạo Date chuẩn xác
const parseDateAtTime = (dateStr, hhmm) => {
  const [h, m] = hhmm.split(':');
  // ISO format: YYYY-MM-DDTHH:mm:00+07:00
  return new Date(`${dateStr}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00+07:00`);
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

  // FIX: Lấy giờ phút chuẩn VN
  const { hour, minute } = getVnTimeParts(now);
  const nowMin = hour * 60 + minute;
  const startMin = timeToMinutes(workStartTime);
  const endMin = timeToMinutes(workEndTime);

  if (nowMin <= endMin) {
    // Trừ đi 24h (bằng timestamp cho an toàn, không dùng setDate của server)
    const prevTimestamp = now.getTime() - (24 * 60 * 60 * 1000);
    return formatDate(new Date(prevTimestamp));
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
  const checkInDeadline = new Date(checkInStart.getTime() + (lateThreshold * 60000));

  let checkOutEnd = parseDateAtTime(shiftDate, workEndTime);
  if (isOvernightShift(workStartTime, workEndTime)) {
    // FIX: Cộng thêm 24 tiếng bằng timestamp thay vì dùng setDate
    checkOutEnd = new Date(checkOutEnd.getTime() + (24 * 60 * 60 * 1000));
  }

  return { checkInStart, checkInDeadline, checkOutEnd, workStartTime, workEndTime, lateThreshold };
};

const formatTimeVi = (date) =>
  date.toLocaleTimeString('vi-VN', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });

const minutesBetween = (later, earlier) =>
  Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 60000));

const evaluateCheckIn = (now = new Date(), settings = {}) => {
  const shiftDate = getShiftDate(now, settings.workStartTime, settings.workEndTime);
  const bounds = getShiftBounds(shiftDate, settings);
  const { checkInStart, checkInDeadline, workStartTime } = bounds;
  
  const maxLateMinutes = Number(settings.maxLateMinutes) || 120;
  const extendedDeadline = new Date(checkInStart.getTime() + (maxLateMinutes * 60000));
  
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

  const lateMinutes = minutesBetween(now, checkInStart);
  const gracePeriodMinutes = Number(settings.lateThreshold) || 15;
  const isLate = lateMinutes > gracePeriodMinutes;

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

const evaluateCheckOut = (now = new Date(), settings = {}, shiftDate) => {
  const bounds = getShiftBounds(shiftDate, settings);
  const { checkOutEnd, workEndTime } = bounds;
  const workEndMinutes = timeToMinutes(workEndTime);
  
  const earlyOutMinutes = Number(settings.earlyOutThreshold) || 30;
  const overtimeStartMinutes = Number(settings.overtimeStartTime) 
    ? timeToMinutes(settings.overtimeStartTime)
    : workEndMinutes + 60;
  const maxWorkMinutes = Number(settings.maxWorkMinutes) || 16 * 60;

  const earlyCheckoutMinutes = now.getTime() < checkOutEnd.getTime() ? minutesBetween(checkOutEnd, now) : 0;
  const lateCheckoutMinutes = now.getTime() > checkOutEnd.getTime() ? minutesBetween(now, checkOutEnd) : 0;

  let checkOutStatus = 'OnTime';
  let statusDetail = '';

  if (lateCheckoutMinutes > 0) {
    checkOutStatus = 'Late';
    
    // FIX: Dùng giờ phút chuẩn VN để tính Overtime
    const { hour, minute } = getVnTimeParts(now);
    const nowMinutes = hour * 60 + minute;
    
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

const calcWorkedMinutes = (checkInTime, checkOutTime) => {
  if (!checkInTime || !checkOutTime) return 0;
  return Math.max(0, Math.floor((checkOutTime - checkInTime) / 60000));
};

const getAttendanceStatusMatrix = (attendance = {}, settings = {}) => {
  // Giữ nguyên logic cũ... (không liên quan đến múi giờ)
  const reasons = [];
  if (!attendance.checkInTime) reasons.push('Không check-in');
  if (!attendance.checkOutTime) reasons.push('Không check-out');
  if (attendance.status === 'Late') reasons.push(`Đi trễ ${attendance.lateMinutes || 0} phút`);
  if (attendance.checkOutStatus === 'Early') reasons.push(`Về sớm ${attendance.earlyCheckoutMinutes || 0} phút`);
  if (attendance.hasException) reasons.push('Có ngoại lệ');

  const isValid = 
    attendance.checkInTime && 
    attendance.checkOutTime &&
    attendance.status === 'OnTime' && 
    (attendance.checkOutStatus === 'OnTime' || attendance.checkOutStatus === 'Overtime') &&
    !attendance.hasException;

  return {
    isValid,
    dayStatus: isValid ? 'Valid' : 'Invalid',
    displayText: isValid ? 'Đủ công' : 'Không đủ công',
    reasons,
    color: isValid ? 'green' : 'red',
    canCreateException: !isValid && reasons.length > 0,
  };
};

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
    message = 'Bạn đã hoàn tất check-in và check-out cho ca này. Vui lòng chờ đến ngày ca tiếp theo để chấm công lại.';
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
    
    // FIX: Gửi Real-time về cho frontend
    serverCurrentTime: now.getTime(), 
    serverCurrentTimeFormatted: formatTimeVi(now) // Gửi thêm chuỗi đọc được cho dễ debug
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
