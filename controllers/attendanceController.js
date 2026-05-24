const db = require('../config/firebase');
const { uploadToImgBB } = require('../utils/imgbbService');
const { findFaceMatchForUser, FACE_SELF_MATCH_THRESHOLD } = require('../utils/faceUtils');
const { logActivity, getClientIp, parseClientMeta } = require('../utils/activityLogger');
const { evaluateGeofence } = require('../utils/geofence');
const { checkKnownDevice, registerKnownDevice } = require('../utils/deviceTracker');
const {
  DEFAULT_WORK_START,
  DEFAULT_WORK_END,
  DEFAULT_LATE_THRESHOLD,
  getShiftDate,
  evaluateCheckIn,
  evaluateCheckOut,
  getShiftContext,
  calcWorkedMinutes,
} = require('../utils/shiftUtils');
const { resolveShiftSettings } = require('../utils/shiftSettings');

const loadGlobalSettings = async () => {
  const snap = await db.ref('settings').once('value');
  return snap.val() || {};
};

const loadWorkSettings = async (workShift = null) => {
  const global = await loadGlobalSettings();
  if (workShift) {
    return resolveShiftSettings(global, workShift);
  }
  return {
    workStartTime: global.workStartTime || DEFAULT_WORK_START,
    workEndTime: global.workEndTime || DEFAULT_WORK_END,
    lateThreshold: Number(global.lateThreshold ?? DEFAULT_LATE_THRESHOLD),
    geofenceEnabled: Boolean(global.geofenceEnabled),
    geofenceLat: global.geofenceLat,
    geofenceLng: global.geofenceLng,
    geofenceRadiusMeters: Number(global.geofenceRadiusMeters) || 500,
    ...global,
  };
};

const employeeBrief = (user, userId) => ({
  userId,
  fullName: user?.personalInfo?.fullName || 'N/A',
  employeeCode: user?.employeeCode || `NV${(userId || '').slice(-6).toUpperCase()}`,
  department: user?.personalInfo?.department || '',
});

const logSecurity = async (req, type, extra = {}) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const meta = parseClientMeta(req.body);
  const userId = req.user?.id || extra.userId || '';
  let user = extra.user;
  if (!user && userId) {
    const snap = await db.ref(`users/${userId}`).once('value');
    user = snap.val();
  }
  const brief = employeeBrief(user, userId);
  await logActivity({
    type,
    severity: extra.severity || 'warning',
    ...brief,
    message: extra.message || '',
    faceDistance: extra.faceDistance ?? null,
    faceThreshold: FACE_SELF_MATCH_THRESHOLD,
    imageUrl: extra.imageUrl || '',
    ip,
    userAgent,
    deviceFingerprint: meta.deviceFingerprint,
    location:
      meta.latitude != null
        ? { latitude: meta.latitude, longitude: meta.longitude }
        : null,
    timestamp: Date.now(),
    ...extra,
  });
};

/** Bản ghi ca hiện tại: ưu tiên bản ghi chưa check-out, sau đó bản ghi đã hoàn tất trong ngày ca. */
const findShiftAttendanceRecord = async (userId, settings, now = new Date()) => {
  const shiftDate = getShiftDate(now, settings.workStartTime, settings.workEndTime);
  const primaryKey = `${userId}_${shiftDate}`;

  const primarySnap = await db.ref(`attendances/${primaryKey}`).once('value');
  if (primarySnap.exists()) {
    const rec = primarySnap.val();
    return { recordKey: primaryKey, record: rec, shiftDate: rec.date || shiftDate };
  }

  const attSnap = await db.ref('attendances').once('value');
  const all = attSnap.val() || {};

  let openRecord = null;
  let openKey = null;

  Object.entries(all).forEach(([key, rec]) => {
    if (rec.userId !== userId || !rec.checkInTime || rec.checkOutTime) return;
    if (!openRecord || rec.checkInTime > openRecord.checkInTime) {
      openRecord = rec;
      openKey = key;
    }
  });

  if (openRecord) {
    return { recordKey: openKey, record: openRecord, shiftDate: openRecord.date || shiftDate };
  }

  return { recordKey: primaryKey, record: null, shiftDate };
};

const checkIn = async (req, res) => {
  try {
    const { descriptor, base64Image, livenessPassed, livenessChallenge, note } = req.body;
    const now = new Date();
    const meta = parseClientMeta(req.body);
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!livenessPassed) {
      await logSecurity(req, 'liveness_fail', {
        message: 'Không vượt qua kiểm tra liveness',
        severity: 'error',
      });
      return res.status(400).json({
        message: 'Chưa vượt qua kiểm tra liveness. Vui lòng thực hiện đúng hành động được yêu cầu.',
      });
    }

    if (meta.brightness != null && meta.brightness < 40) {
      await logSecurity(req, 'spoof_suspect', {
        message: 'Ánh sáng quá thấp — nghi ngờ ảnh/video',
        brightness: meta.brightness,
      });
    }

    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ message: 'Dữ liệu khuôn mặt không hợp lệ. Vui lòng quét lại.' });
    }

    if (!base64Image) {
      return res.status(400).json({ message: 'Thiếu ảnh bằng chứng chấm công.' });
    }

    const faceDataSnap = await db.ref('faceData').once('value');
    const allFaces = faceDataSnap.val();

    if (!allFaces) {
      return res.status(404).json({ message: 'Chưa có dữ liệu khuôn mặt nào trong hệ thống.' });
    }

    const loggedInUserId = req.user?.id;

    if (!loggedInUserId) {
      return res.status(401).json({ message: 'Chưa xác thực tài khoản.' });
    }

    let imageUrl = '';
    try {
      imageUrl = await uploadToImgBB(base64Image);
    } catch {
      imageUrl = '';
    }

    const match = findFaceMatchForUser(descriptor, loggedInUserId, allFaces);

    if (!match.matched) {
      const msgByReason = {
        no_samples: 'Tài khoản chưa có mẫu khuôn mặt. Liên hệ Admin đăng ký lại.',
        self_no_match:
          'Khuôn mặt không khớp với hồ sơ đã đăng ký. Thử lại với ánh sáng tốt hơn và nhìn thẳng camera.',
        other_closer:
          'Khuôn mặt khớp với hồ sơ khác hơn tài khoản của bạn. Chỉ được chấm công cho chính bạn.',
        ambiguous:
          'Không thể xác định danh tính duy nhất. Vui lòng thử lại hoặc liên hệ Admin.',
      };
      const msg =
        msgByReason[match.reason] ||
        'Khuôn mặt không khớp với hồ sơ đã đăng ký. Vui lòng thử lại!';
      await logSecurity(req, 'face_fail', {
        message: msg,
        faceDistance: match.minDistance ?? null,
        reason: match.reason,
        imageUrl,
        severity: 'error',
      });
      return res.status(400).json({ message: msg, faceMatchError: true, reason: match.reason });
    }

    const matchedUserId = match.userId;
    const userSnap = await db.ref(`users/${matchedUserId}`).once('value');

    if (!userSnap.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ nhân viên.' });
    }

    const user = userSnap.val();
    if (user.status !== 'Active' || !user.isFaceRegistered) {
      return res.status(403).json({
        message: 'Tài khoản chưa được kích hoạt hoặc chưa đăng ký khuôn mặt.',
      });
    }

    const settings = await loadWorkSettings(user.workShift || 'office');
    const brief = employeeBrief(user, matchedUserId);
    const deviceCheck = await checkKnownDevice(
      matchedUserId,
      meta.deviceFingerprint,
      ip
    );
    if (deviceCheck.isNew && meta.deviceFingerprint) {
      await logSecurity(req, 'unknown_device', {
        user,
        message: `Thiết bị/IP mới: ${ip}`,
        ip,
        deviceFingerprint: meta.deviceFingerprint,
        imageUrl,
      });
    }

    const geo = evaluateGeofence(meta.latitude, meta.longitude, settings);
    const locationMeta = {
      latitude: meta.latitude,
      longitude: meta.longitude,
      inGeofence: geo.inZone,
      distanceMeters: geo.distanceMeters,
    };

    if (settings.geofenceEnabled && !geo.inZone && !geo.skipped) {
      await logSecurity(req, 'out_of_zone', {
        user,
        message: geo.noGps
          ? 'Chấm công không có tọa độ GPS'
          : `Ngoài vùng cho phép (${geo.distanceMeters}m)`,
        imageUrl,
        location: locationMeta,
      });
    }

    const fullName = brief.fullName;
    const shiftInfo = await findShiftAttendanceRecord(matchedUserId, settings, now);
    const { recordKey, record: existingRecord, shiftDate } = shiftInfo;

    if (existingRecord?.checkOutTime) {
      return res.status(400).json({
        message:
          'Bạn đã hoàn tất check-in và check-out cho ca hôm nay. Vui lòng chờ đến ngày ca tiếp theo.',
        alreadyCompleted: true,
      });
    }

    if (!existingRecord?.checkInTime) {
      const checkInEval = evaluateCheckIn(now, settings);
      if (!checkInEval.allowed) {
        await logSecurity(req, 'time_fail', {
          user,
          message: checkInEval.message,
          imageUrl,
        });
        return res.status(400).json({ message: checkInEval.message });
      }

      const newRecordKey = `${matchedUserId}_${checkInEval.shiftDate}`;
      const newRef = db.ref(`attendances/${newRecordKey}`);
      const existingSnap = await newRef.once('value');

      if (existingSnap.exists()) {
        const saved = existingSnap.val();
        if (saved.checkOutTime) {
          return res.status(400).json({
            message:
              'Bạn đã hoàn tất chấm công ca này. Chờ đến ngày ca tiếp theo để check-in/check-out lại.',
            alreadyCompleted: true,
          });
        }
        if (saved.checkInTime) {
          return res.status(400).json({
            message: 'Bạn đã check-in ca này. Vui lòng check-out để hoàn tất.',
          });
        }
      }

      if (!imageUrl) imageUrl = await uploadToImgBB(base64Image);

      const ts = Date.now();
      const checkInStatus = checkInEval.isLate ? 'Late' : 'OnTime';
      await newRef.set({
        userId: matchedUserId,
        date: checkInEval.shiftDate,
        checkInTime: ts,
        checkOutTime: null,
        status: checkInStatus,
        lateMinutes: checkInEval.lateMinutes,
        isLate: checkInEval.isLate,
        checkOutStatus: null,
        note: typeof note === 'string' ? note.trim().slice(0, 500) : '',
        verifyImageIn: imageUrl,
        livenessChallenge: livenessChallenge || '',
        faceDistance: match.minDistance,
        checkInLocation: locationMeta,
        checkInMeta: { ip, userAgent, deviceFingerprint: meta.deviceFingerprint, brightness: meta.brightness },
        createdAt: ts,
        updatedAt: ts,
      });

      await registerKnownDevice(matchedUserId, meta.deviceFingerprint, ip, userAgent);
      const lateNote = checkInEval.isLate ? ` (trễ ${checkInEval.lateMinutes} phút)` : '';
      await logActivity({
        type: 'check_in',
        action: 'checkIn',
        severity: checkInEval.isLate ? 'warning' : 'info',
        ...brief,
        message: `Check-in thành công${lateNote} — ${fullName}`,
        imageUrl,
        faceDistance: match.minDistance,
        lateMinutes: checkInEval.lateMinutes,
        ip,
        userAgent,
        deviceFingerprint: meta.deviceFingerprint,
        location: locationMeta,
        timestamp: ts,
      });

      const greetMsg = checkInEval.isLate
        ? `Check-in trễ ${checkInEval.lateMinutes} phút — Xin chào ${fullName}. Vui lòng check-out khi kết thúc ca.`
        : `Check-in đúng giờ — Xin chào ${fullName}. Vui lòng check-out khi kết thúc ca.`;

      return res.status(200).json({
        message: greetMsg,
        action: 'checkIn',
        fullName,
        distance: match.minDistance.toFixed(4),
        status: checkInStatus,
        lateMinutes: checkInEval.lateMinutes,
        isLate: checkInEval.isLate,
        shiftDate: checkInEval.shiftDate,
      });
    }

    const recordShiftDate = existingRecord.date || shiftDate;
    const checkOutEval = evaluateCheckOut(now, settings, recordShiftDate);

    if (!imageUrl) imageUrl = await uploadToImgBB(base64Image);
    const attendanceRef = db.ref(`attendances/${recordKey}`);
    const ts = Date.now();
    const workedMinutes = calcWorkedMinutes(existingRecord.checkInTime, ts);

    await attendanceRef.update({
      checkOutTime: ts,
      checkOutStatus: checkOutEval.checkOutStatus,
      earlyCheckoutMinutes: checkOutEval.earlyCheckoutMinutes,
      lateCheckoutMinutes: checkOutEval.lateCheckoutMinutes,
      workedMinutes,
      status: 'Complete',
      verifyImageOut: imageUrl,
      faceDistanceOut: match.minDistance,
      checkOutLocation: locationMeta,
      checkOutMeta: { ip, userAgent, deviceFingerprint: meta.deviceFingerprint, brightness: meta.brightness },
      updatedAt: ts,
    });

    await registerKnownDevice(matchedUserId, meta.deviceFingerprint, ip, userAgent);
    await logActivity({
      type: 'check_out',
      action: 'checkOut',
      severity: 'info',
      ...brief,
      message: `Check-out thành công (${workedMinutes} phút làm) — ${fullName}`,
      imageUrl,
      faceDistance: match.minDistance,
      workedMinutes,
      ip,
      userAgent,
      location: locationMeta,
      timestamp: ts,
    });

    const outMsg =
      checkOutEval.lateCheckoutMinutes > 0
        ? `Check-out trễ ${checkOutEval.lateCheckoutMinutes} phút — Tạm biệt ${fullName}! Đã làm ${workedMinutes} phút.`
        : checkOutEval.earlyCheckoutMinutes > 0
          ? `Check-out sớm ${checkOutEval.earlyCheckoutMinutes} phút — Tạm biệt ${fullName}! Đã làm ${workedMinutes} phút.`
          : `Check-out đúng giờ — Tạm biệt ${fullName}! Đã làm ${workedMinutes} phút.`;

    return res.status(200).json({
      message: outMsg,
      action: 'checkOut',
      fullName,
      distance: match.minDistance.toFixed(4),
      status: 'Complete',
      workedMinutes,
      shiftDate: recordShiftDate,
      alreadyCompleted: true,
    });
  } catch (error) {
    console.error('Lỗi attendanceController.checkIn:', error);
    await logActivity({
      type: 'api_error',
      severity: 'error',
      message: error.message,
      timestamp: Date.now(),
    }).catch(() => {});
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const logSecurityAttempt = async (req, res) => {
  try {
    const { attemptType, message, faceDistance, imageUrl } = req.body;
    await logSecurity(req, attemptType || 'face_fail', {
      message: message || 'Lượt quét thất bại từ client',
      faceDistance: faceDistance ?? null,
      imageUrl: imageUrl || '',
      severity: 'warning',
    });
    res.status(200).json({ logged: true });
  } catch (error) {
    res.status(500).json({ message: 'Không ghi được log' });
  }
};

const mapAttendanceRecord = (key, record, user = {}) => ({
  id: key,
  userId: record.userId,
  employee_code: user.employeeCode || `NV${(record.userId || '').slice(-6).toUpperCase()}`,
  full_name: user.personalInfo?.fullName || 'Nhân viên đã bị xóa',
  date: record.date,
  checkInTime: record.checkInTime,
  checkOutTime: record.checkOutTime || null,
  status: record.status,
  checkOutStatus: record.checkOutStatus || null,
  lateMinutes: record.lateMinutes ?? null,
  isLate: record.isLate ?? false,
  earlyCheckoutMinutes: record.earlyCheckoutMinutes ?? null,
  lateCheckoutMinutes: record.lateCheckoutMinutes ?? null,
  workedMinutes: record.workedMinutes ?? null,
  note: record.note || '',
  verifyImageIn: record.verifyImageIn || '',
  verifyImageOut: record.verifyImageOut || '',
});

const getAllAttendances = async (req, res) => {
  try {
    const [attSnap, usersSnap] = await Promise.all([
      db.ref('attendances').once('value'),
      db.ref('users').once('value'),
    ]);

    const attendancesData = attSnap.val() || {};
    const usersData = usersSnap.val() || {};

    const result = Object.keys(attendancesData).map((key) =>
      mapAttendanceRecord(key, attendancesData[key], usersData[attendancesData[key].userId] || {})
    );

    result.sort((a, b) => {
      if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
      return (b.checkInTime || 0) - (a.checkInTime || 0);
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Lỗi getAllAttendances:', error);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu chấm công' });
  }
};

const getMyAttendances = async (req, res) => {
  try {
    const userId = req.user.id;
    const attSnap = await db.ref('attendances').once('value');
    const attendancesData = attSnap.val() || {};

    const result = Object.keys(attendancesData)
      .filter((key) => attendancesData[key].userId === userId)
      .map((key) => ({
        id: key,
        ...attendancesData[key],
      }))
      .sort((a, b) => {
        if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
        return (b.checkInTime || 0) - (a.checkInTime || 0);
      });

    res.status(200).json(result);
  } catch (error) {
    console.error('Lỗi getMyAttendances:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử chấm công' });
  }
};

const getWorkConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    const userSnap = await db.ref(`users/${userId}`).once('value');
    const workShift = userSnap.val()?.workShift || 'office';
    const settings = await loadWorkSettings(workShift);
    const now = new Date();
    const shiftInfo = await findShiftAttendanceRecord(userId, settings, now);
    const existingRecord = shiftInfo.record;
    const context = getShiftContext(now, settings, existingRecord);

    res.status(200).json({
      ...settings,
      ...context,
      workShift,
      shiftDate: shiftInfo.shiftDate,
      hasRecord: Boolean(existingRecord),
      isCompleted: Boolean(existingRecord?.checkInTime && existingRecord?.checkOutTime),
      record: existingRecord,
    });
  } catch (error) {
    console.error('Lỗi getWorkConfig:', error);
    res.status(500).json({ message: 'Lỗi khi lấy cấu hình ca làm' });
  }
};

const updateAttendanceNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const ref = db.ref(`attendances/${id}`);
    const snap = await ref.once('value');
    if (!snap.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi chấm công.' });
    }

    await ref.update({
      note: typeof note === 'string' ? note.trim().slice(0, 500) : '',
      updatedAt: Date.now(),
    });

    res.status(200).json({ message: 'Đã cập nhật ghi chú.' });
  } catch (error) {
    console.error('Lỗi updateAttendanceNote:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

/** Lưu lượt test chấm công (không ghi vào attendances chính thức) */
const runAttendanceTest = async (req, res) => {
  try {
    const { descriptor, base64Image, livenessPassed, livenessChallenge } = req.body;
    const now = Date.now();
    const meta = parseClientMeta(req.body);
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Chưa xác thực tài khoản.' });
    }

    const userSnap = await db.ref(`users/${userId}`).once('value');
    const user = userSnap.val();
    const brief = employeeBrief(user, userId);

    let imageUrl = '';
    if (base64Image) {
      try {
        imageUrl = await uploadToImgBB(base64Image);
      } catch {
        imageUrl = '';
      }
    }

    const spoofSuspect = meta.brightness != null && meta.brightness < 40;
    const settings = await loadWorkSettings(user?.workShift || 'office');
    const geo = evaluateGeofence(meta.latitude, meta.longitude, settings);

    const baseLog = {
      userId,
      fullName: brief.fullName,
      employeeCode: brief.employeeCode,
      timestamp: now,
      livenessPassed: Boolean(livenessPassed),
      livenessChallenge: livenessChallenge || '',
      brightness: meta.brightness ?? null,
      spoofSuspect,
      geofence: {
        inZone: geo.inZone,
        distanceMeters: geo.distanceMeters,
        skipped: geo.skipped,
      },
      location:
        meta.latitude != null
          ? { latitude: meta.latitude, longitude: meta.longitude }
          : null,
      clientMeta: {
        ip,
        userAgent,
        deviceFingerprint: meta.deviceFingerprint,
      },
      imageUrl,
    };

    if (!livenessPassed) {
      const entry = {
        ...baseLog,
        success: false,
        failureReason: 'liveness_fail',
        message: 'Chưa vượt qua kiểm tra liveness',
        faceMatched: false,
        faceDistance: null,
        faceReason: null,
      };
      const ref = db.ref(`attendanceTests/${userId}`).push();
      await ref.set(entry);
      await logSecurity(req, 'liveness_fail', { user, message: entry.message, severity: 'warning' });
      return res.status(400).json({ message: entry.message, testId: ref.key, ...entry });
    }

    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      const entry = {
        ...baseLog,
        success: false,
        failureReason: 'invalid_descriptor',
        message: 'Dữ liệu khuôn mặt không hợp lệ',
        faceMatched: false,
      };
      const ref = db.ref(`attendanceTests/${userId}`).push();
      await ref.set(entry);
      return res.status(400).json({ message: entry.message, testId: ref.key, ...entry });
    }

    const faceDataSnap = await db.ref('faceData').once('value');
    const allFaces = faceDataSnap.val() || {};
    const match = findFaceMatchForUser(descriptor, userId, allFaces);

    if (!match.matched) {
      const msgByReason = {
        no_samples: 'Chưa có mẫu khuôn mặt — liên hệ Admin.',
        self_no_match: 'Khuôn mặt không khớp hồ sơ của bạn.',
        other_closer: 'Nghi ngờ giả mạo: khuôn mặt gần hồ sơ người khác hơn.',
        ambiguous: 'Không xác định được danh tính — thử lại.',
      };
      const msg = msgByReason[match.reason] || 'Xác thực khuôn mặt thất bại.';
      const entry = {
        ...baseLog,
        success: false,
        failureReason: match.reason || 'face_fail',
        message: msg,
        faceMatched: false,
        faceDistance: match.minDistance ?? null,
        faceReason: match.reason,
        possibleSpoof: match.reason === 'other_closer' || match.reason === 'ambiguous',
      };
      const ref = db.ref(`attendanceTests/${userId}`).push();
      await ref.set(entry);
      await logSecurity(req, 'face_fail', {
        user,
        message: msg,
        faceDistance: match.minDistance,
        reason: match.reason,
        imageUrl,
      });
      return res.status(400).json({ message: msg, testId: ref.key, ...entry });
    }

    const entry = {
      ...baseLog,
      success: true,
      failureReason: null,
      message: 'Xác thực thành công — đúng người, không phát hiện giả mạo.',
      faceMatched: true,
      faceDistance: match.minDistance,
      faceReason: 'self_match',
      possibleSpoof: spoofSuspect,
      warnings: [
        ...(spoofSuspect ? ['Ánh sáng thấp — nghi ngờ ảnh/video'] : []),
        ...(settings.geofenceEnabled && !geo.inZone && !geo.skipped
          ? [`Ngoài vùng GPS (${geo.distanceMeters}m)`]
          : []),
      ],
    };

    const ref = db.ref(`attendanceTests/${userId}`).push();
    await ref.set(entry);

    return res.status(200).json({
      message: entry.message,
      testId: ref.key,
      ...entry,
    });
  } catch (error) {
    console.error('Lỗi runAttendanceTest:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getMyAttendanceTests = async (req, res) => {
  try {
    const userId = req.user.id;
    const snap = await db.ref(`attendanceTests/${userId}`).once('value');
    const data = snap.val() || {};

    const result = Object.entries(data)
      .map(([id, row]) => ({ id, ...row }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 100);

    res.status(200).json(result);
  } catch (error) {
    console.error('Lỗi getMyAttendanceTests:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử test' });
  }
};

const getAllAttendanceTests = async (req, res) => {
  try {
    const snap = await db.ref('attendanceTests').once('value');
    const all = snap.val() || {};
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};

    const result = [];
    Object.entries(all).forEach(([userId, tests]) => {
      const u = users[userId] || {};
      Object.entries(tests || {}).forEach(([testId, row]) => {
        result.push({
          id: testId,
          userId,
          fullName: u.personalInfo?.fullName || row.fullName || 'N/A',
          employeeCode: u.employeeCode || row.employeeCode,
          ...row,
        });
      });
    });

    result.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.status(200).json(result.slice(0, 500));
  } catch (error) {
    console.error('Lỗi getAllAttendanceTests:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách test' });
  }
};

module.exports = {
  getAllAttendances,
  getMyAttendances,
  checkIn,
  getWorkConfig,
  updateAttendanceNote,
  logSecurityAttempt,
  runAttendanceTest,
  getMyAttendanceTests,
  getAllAttendanceTests,
};
