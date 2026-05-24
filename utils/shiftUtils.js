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

/**
 * Kiểm tra có được check-in không.
 * Chỉ cho phép từ giờ bắt đầu đến giờ bắt đầu + ngưỡng trễ; quá trễ = không chấm được.
 */
const evaluateCheckIn = (now = new Date(), settings = {}) => {
  const shiftDate = getShiftDate(now, settings.workStartTime, settings.workEndTime);
  const { checkInStart, checkInDeadline, workStartTime, lateThreshold } = getShiftBounds(
    shiftDate,
    settings
  );

  if (now.getTime() < checkInStart.getTime()) {
    return {
      allowed: false,
      shiftDate,
      message: `Chưa đến giờ check-in (${workStartTime}). Vui lòng quay lại sau ${formatTimeVi(checkInStart)}.`,
    };
  }

  if (now.getTime() > checkInDeadline.getTime()) {
    return {
      allowed: false,
      shiftDate,
      message: `Đã quá ${lateThreshold} phút so với giờ bắt đầu (${workStartTime}). Không thể check-in ca này.`,
    };
  }

  return { allowed: true, shiftDate, status: 'OnTime' };
};

/**
 * Kiểm tra có được check-out không — phải từ giờ kết thúc ca trở đi.
 */
const evaluateCheckOut = (now = new Date(), settings = {}, shiftDate) => {
  const { checkOutEnd, workEndTime } = getShiftBounds(shiftDate, settings);

  if (now.getTime() < checkOutEnd.getTime()) {
    return {
      allowed: false,
      message: `Chưa đến giờ kết thúc ca (${workEndTime}). Không thể check-out sớm — vui lòng quay lại sau ${formatTimeVi(checkOutEnd)}.`,
    };
  }

  return { allowed: true, checkOutStatus: 'OnTime' };
};

/** Trạng thái ca hiện tại để hiển thị trên frontend */
const getShiftContext = (now = new Date(), settings = {}, existingRecord = null) => {
  const shiftDate = getShiftDate(now, settings.workStartTime, settings.workEndTime);
  const bounds = getShiftBounds(shiftDate, settings);
  const checkInEval = evaluateCheckIn(now, settings);

  let phase = 'idle';
  let message = '';

  if (existingRecord?.checkInTime && !existingRecord?.checkOutTime) {
    const checkOutEval = evaluateCheckOut(now, settings, existingRecord.date || shiftDate);
    if (checkOutEval.allowed) {
      phase = 'checkOut';
      message = 'Bạn có thể check-out ca hiện tại.';
    } else {
      phase = 'waitCheckOut';
      message = checkOutEval.message;
    }
  } else if (!existingRecord?.checkInTime) {
    if (checkInEval.allowed) {
      phase = 'checkIn';
      message = 'Bạn có thể check-in ca hiện tại.';
    } else {
      phase = 'waitCheckIn';
      message = checkInEval.message;
    }
  } else {
    phase = 'completed';
    message = 'Bạn đã hoàn tất chấm công ca này.';
  }

  return {
    shiftDate,
    phase,
    message,
    workStartTime: bounds.workStartTime,
    workEndTime: bounds.workEndTime,
    lateThreshold: bounds.lateThreshold,
    checkInWindow: {
      from: bounds.checkInStart.getTime(),
      to: bounds.checkInDeadline.getTime(),
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
  isOvernightShift,
};
