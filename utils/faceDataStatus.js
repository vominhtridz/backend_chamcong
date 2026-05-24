const FACE_QUALITY_GOOD_MAX = 0.35;
const FACE_QUALITY_WARN_MAX = 0.42;

const WORK_SHIFTS = {
  morning: { id: 'morning', label: 'Ca sáng', hours: '06:00 – 14:00' },
  afternoon: { id: 'afternoon', label: 'Ca chiều', hours: '14:00 – 22:00' },
  office: { id: 'office', label: 'Hành chính', hours: '08:00 – 17:30' },
  night: { id: 'night', label: 'Ca đêm', hours: '22:40 – 04:30' },
};

/**
 * @returns {'none'|'ready'|'needs_update'}
 */
const resolveFaceDataStatus = (faceRecord = {}, user = {}) => {
  if (user.faceDataStatus === 'needs_update') return 'needs_update';
  if (!faceRecord?.face_descriptor?.length) return 'none';

  const forced = faceRecord.faceDataStatus;
  if (forced === 'needs_update') return 'needs_update';
  if (forced === 'ready') return 'ready';

  const bestDistance = faceRecord.registrationQuality?.bestDistance;
  if (bestDistance != null && bestDistance > FACE_QUALITY_WARN_MAX) return 'needs_update';

  const recentFails = Number(faceRecord.recentFailCount) || 0;
  if (recentFails >= 3) return 'needs_update';

  return 'ready';
};

const qualityLabel = (bestDistance) => {
  if (bestDistance == null) return { text: '—', level: 'unknown' };
  if (bestDistance <= FACE_QUALITY_GOOD_MAX) return { text: 'Tốt', level: 'good' };
  if (bestDistance <= FACE_QUALITY_WARN_MAX) return { text: 'Trung bình', level: 'warn' };
  return { text: 'Thấp', level: 'bad' };
};

module.exports = {
  FACE_QUALITY_GOOD_MAX,
  FACE_QUALITY_WARN_MAX,
  WORK_SHIFTS,
  resolveFaceDataStatus,
  qualityLabel,
};
