const db = require('../config/firebase');
const { DEFAULT_SHIFT_TIMES } = require('../utils/shiftSettings');

const defaultSettings = () => ({
  workStartTime: '22:40',
  workEndTime: '04:30',
  lateThreshold: 15,
  shiftTimes: { ...DEFAULT_SHIFT_TIMES },
  geofenceEnabled: false,
  geofenceLat: null,
  geofenceLng: null,
  geofenceRadiusMeters: 500,
  imgbbApiKey: '',
});

const getSettings = async (req, res) => {
  const snap = await db.ref('settings').once('value');
  const stored = snap.val() || {};
  res.status(200).json({
    ...defaultSettings(),
    ...stored,
    shiftTimes: { ...DEFAULT_SHIFT_TIMES, ...(stored.shiftTimes || {}) },
  });
};

const updateSettings = async (req, res) => {
  const payload = { ...req.body };
  if (payload.shiftTimes) {
    payload.shiftTimes = { ...DEFAULT_SHIFT_TIMES, ...payload.shiftTimes };
  }
  await db.ref('settings').update(payload);
  res.status(200).json({ message: 'Lưu cài đặt thành công!' });
};

module.exports = { getSettings, updateSettings };
