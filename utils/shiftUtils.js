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
 * Kiểm tra check-in: chỉ chặn khi chưa đến giờ bắt đầu.
 * Trễ vẫn được chấm — ghi lateMinutes; vượt ngưỡng → status Late.
 */
const evaluateCheckIn = (now = new Date(), settings = {}) => {
  const shiftDate = getShiftDate(now, settings.workStartTime, settings.workEndTime);
  const { checkInStart, workStartTime, lateThreshold } = getShiftBounds(shiftDate, settings);

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
  const isLate = lateMinutes > lateThreshold;

  return {
    allowed: true,
    shiftDate,
    lateMinutes,
    isLate,
    status: isLate ? 'Late' : 'OnTime',
    message: isLate
      ? `Check-in trễ ${lateMinutes} phút (ngưỡng đúng giờ: ${lateThreshold} phút). Vẫn được ghi nhận chấm công.`
      : `Check-in đúng giờ — trong ${lateThreshold} phút đầu ca.`,
  };
};

/**
 * Check-out: luôn cho phép sau khi đã check-in; ghi sớm/muộn nếu có.
 */
const evaluateCheckOut = (now = new Date(), settings = {}, shiftDate) => {
  const { checkOutEnd, workEndTime } = getShiftBounds(shiftDate, settings);

  const earlyCheckoutMinutes =
    now.getTime() < checkOutEnd.getTime() ? minutesBetween(checkOutEnd, now) : 0;
  const lateCheckoutMinutes =
    now.getTime() > checkOutEnd.getTime() ? minutesBetween(now, checkOutEnd) : 0;

  let checkOutStatus = 'OnTime';
  if (lateCheckoutMinutes > 0) checkOutStatus = 'Late';
  else if (earlyCheckoutMinutes > 0) checkOutStatus = 'Early';

  let message = 'Bạn có thể check-out ca hiện tại.';
  if (earlyCheckoutMinutes > 0) {
    message = `Check-out sớm ${earlyCheckoutMinutes} phút (giờ kết thúc ca: ${workEndTime}). Vẫn được ghi nhận.`;
  } else if (lateCheckoutMinutes > 0) {
    message = `Check-out trễ ${lateCheckoutMinutes} phút so với giờ kết thúc ca (${workEndTime}). Vẫn được ghi nhận.`;
  }

  return {
    allowed: true,
    checkOutStatus,
    earlyCheckoutMinutes,
    lateCheckoutMinutes,
    message,
  };
};

/** Tính số phút làm việc từ check-in đến check-out */
const calcWorkedMinutes = (checkInTime, checkOutTime) => {
  if (!checkInTime || !checkOutTime) return 0;
  return Math.max(0, Math.floor((checkOutTime - checkInTime) / 60000));
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
  isOvernightShift,
};
