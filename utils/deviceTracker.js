const db = require('../config/firebase');

const normalizeDeviceKey = (fingerprint, ip) =>
  `${fingerprint || 'unknown'}::${ip || 'unknown'}`.slice(0, 120);

/**
 * Kiểm tra thiết bị/IP mới so với lịch sử đã lưu trong Firebase.
 */
const checkKnownDevice = async (userId, fingerprint, ip) => {
  const key = normalizeDeviceKey(fingerprint, ip).replace(/[.#$[\]]/g, '_');
  const ref = db.ref(`knownDevices/${userId}/${key}`);
  const snap = await ref.once('value');

  if (snap.exists()) {
    await ref.update({ lastSeenAt: Date.now(), useCount: (snap.val().useCount || 0) + 1 });
    return { isNew: false, deviceKey: key };
  }

  return { isNew: true, deviceKey: key };
};

const registerKnownDevice = async (userId, fingerprint, ip, userAgent = '') => {
  const key = normalizeDeviceKey(fingerprint, ip).replace(/[.#$[\]]/g, '_');
  const ref = db.ref(`knownDevices/${userId}/${key}`);
  const snap = await ref.once('value');
  const now = Date.now();

  if (snap.exists()) {
    await ref.update({ lastSeenAt: now, useCount: (snap.val().useCount || 0) + 1 });
  } else {
    await ref.set({
      fingerprint: fingerprint || '',
      ip: ip || '',
      userAgent: userAgent || '',
      firstSeenAt: now,
      lastSeenAt: now,
      useCount: 1,
    });
  }
  return key;
};

module.exports = { checkKnownDevice, registerKnownDevice, normalizeDeviceKey };
