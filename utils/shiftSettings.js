const DEFAULT_SHIFT_TIMES = {
  morning: { workStartTime: '06:00', workEndTime: '14:00', lateThreshold: 15 },
  afternoon: { workStartTime: '14:00', workEndTime: '22:00', lateThreshold: 15 },
  office: { workStartTime: '08:00', workEndTime: '17:30', lateThreshold: 15 },
  night: { workStartTime: '22:40', workEndTime: '04:30', lateThreshold: 15 },
};

/**
 * Gộp cấu hình global + giờ theo ca làm việc của nhân viên.
 */
const resolveShiftSettings = (globalSettings = {}, workShift = 'office') => {
  const shiftKey = workShift || 'office';
  const shiftTimes = globalSettings.shiftTimes || {};
  const perShift = shiftTimes[shiftKey] || DEFAULT_SHIFT_TIMES[shiftKey] || DEFAULT_SHIFT_TIMES.office;

  const legacyStart = globalSettings.workStartTime;
  const legacyEnd = globalSettings.workEndTime;
  const legacyLate = globalSettings.lateThreshold;

  const hasShiftTimes = Boolean(shiftTimes[shiftKey]);

  return {
    workStartTime:
      perShift.workStartTime ||
      (hasShiftTimes ? DEFAULT_SHIFT_TIMES[shiftKey]?.workStartTime : legacyStart) ||
      DEFAULT_SHIFT_TIMES.office.workStartTime,
    workEndTime:
      perShift.workEndTime ||
      (hasShiftTimes ? DEFAULT_SHIFT_TIMES[shiftKey]?.workEndTime : legacyEnd) ||
      DEFAULT_SHIFT_TIMES.office.workEndTime,
    lateThreshold: Number(
      perShift.lateThreshold ??
        (hasShiftTimes ? DEFAULT_SHIFT_TIMES[shiftKey]?.lateThreshold : legacyLate) ??
        15
    ),
    geofenceEnabled: Boolean(globalSettings.geofenceEnabled),
    geofenceLat: globalSettings.geofenceLat ?? null,
    geofenceLng: globalSettings.geofenceLng ?? null,
    geofenceRadiusMeters: Number(globalSettings.geofenceRadiusMeters) || 500,
    imgbbApiKey: globalSettings.imgbbApiKey || '',
    workShift: shiftKey,
  };
};

module.exports = {
  DEFAULT_SHIFT_TIMES,
  resolveShiftSettings,
};
