const db = require('../config/firebase');

const MAX_ACTIVITY_LOGS = 500;

/**
 * Ghi nhật ký hoạt động / bảo mật vào Firebase (dữ liệu thật cho dashboard).
 */
const logActivity = async (payload) => {
  try {
    const entry = {
      ...payload,
      timestamp: payload.timestamp || Date.now(),
    };
    const ref = db.ref('activityLogs').push();
    await ref.set(entry);

    // Giữ tối đa MAX_ACTIVITY_LOGS bản ghi mới nhất
    const snap = await db.ref('activityLogs').orderByChild('timestamp').once('value');
    if (snap.exists()) {
      const entries = Object.entries(snap.val())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      if (entries.length > MAX_ACTIVITY_LOGS) {
        const toRemove = entries.slice(MAX_ACTIVITY_LOGS);
        await Promise.all(toRemove.map((e) => db.ref(`activityLogs/${e.id}`).remove()));
      }
    }
    return ref.key;
  } catch (err) {
    console.error('logActivity error:', err.message);
    return null;
  }
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
};

const parseClientMeta = (body = {}) => ({
  latitude: body.latitude != null ? Number(body.latitude) : null,
  longitude: body.longitude != null ? Number(body.longitude) : null,
  deviceFingerprint: body.deviceFingerprint || '',
  brightness: body.brightness != null ? Number(body.brightness) : null,
  livenessPassed: Boolean(body.livenessPassed),
});

module.exports = {
  logActivity,
  getClientIp,
  parseClientMeta,
  MAX_ACTIVITY_LOGS,
};
