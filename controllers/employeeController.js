const db = require('../config/firebase');
const { uploadToImgBB } = require('../utils/imgbbService');
const {
  resolveFaceDataStatus,
  qualityLabel,
  WORK_SHIFTS,
  FACE_QUALITY_WARN_MAX,
} = require('../utils/faceDataStatus');

const countRecentFaceFailsBatch = (activityLogs, userId) => {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return activityLogs.filter(
    (l) => l.userId === userId && l.type === 'face_fail' && (l.timestamp || 0) >= weekAgo
  ).length;
};

const loadActivityLogsList = async () => {
  const snap = await db.ref('activityLogs').once('value');
  if (!snap.exists()) return [];
  return Object.values(snap.val());
};

const mapUserToEmployee = (id, user, faceRecord = null, extras = {}) => {
  const faceStatus = resolveFaceDataStatus(faceRecord, user);
  const bestDistance = faceRecord?.registrationQuality?.bestDistance ?? null;
  const sampleCount = faceRecord?.face_descriptor?.length || 0;

  return {
    id,
    employee_code: user.employeeCode || `NV${id.slice(-6).toUpperCase()}`,
    full_name: user.personalInfo?.fullName || user.email?.split('@')[0] || 'N/A',
    department: user.personalInfo?.department || '',
    position: user.personalInfo?.position || '',
    phone: user.personalInfo?.phone || '',
    email: user.email || '',
    work_shift: user.workShift || 'office',
    status: user.status || 'Pending',
    isFaceRegistered: Boolean(user.isFaceRegistered),
    profileImage: user.profileImage || '',
    faceDataStatus: faceStatus,
    faceSampleCount: sampleCount,
    faceQualityScore: bestDistance,
    faceQualityLabel: qualityLabel(bestDistance).text,
    lastExtractedAt: faceRecord?.registrationQuality?.extractedAt || faceRecord?.updatedAt || null,
    recentFaceFails: extras.recentFaceFails ?? 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const getEmployees = async (req, res) => {
  try {
    const [usersSnap, faceSnap, activityLogs] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('faceData').once('value'),
      loadActivityLogsList(),
    ]);

    const faceData = faceSnap.val() || {};
    let employees = [];

    if (usersSnap.exists()) {
      const data = usersSnap.val();
      const entries = Object.keys(data).filter((key) => data[key].role === 'Employee');

      employees = entries.map((key) => {
        const fails = countRecentFaceFailsBatch(activityLogs, key);
        const faceRecord = faceData[key] ? { ...faceData[key], recentFailCount: fails } : null;
        return mapUserToEmployee(key, data[key], faceRecord, { recentFaceFails: fails });
      });
    }

    employees.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.status(200).json(employees);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách', error: error.message });
  }
};

const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const [userSnap, faceSnap] = await Promise.all([
      db.ref(`users/${id}`).once('value'),
      db.ref(`faceData/${id}`).once('value'),
    ]);

    if (!userSnap.exists() || userSnap.val().role !== 'Employee') {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const fails = countRecentFaceFailsBatch(await loadActivityLogsList(), id);
    const faceRecord = faceSnap.val()
      ? { ...faceSnap.val(), recentFailCount: fails }
      : null;

    res.status(200).json({
      employee: mapUserToEmployee(id, userSnap.val(), faceRecord, { recentFaceFails: fails }),
      biometric: faceRecord
        ? {
            sampleCount: faceRecord.face_descriptor?.length || 0,
            registrationQuality: faceRecord.registrationQuality || null,
            faceDataStatus: resolveFaceDataStatus(faceRecord, userSnap.val()),
            lastExtractedAt: faceRecord.registrationQuality?.extractedAt || faceRecord.updatedAt,
            recentFaceFails: fails,
          }
        : null,
      workShifts: Object.values(WORK_SHIFTS),
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const addEmployee = async (req, res) => {
  try {
    const {
      employee_code,
      full_name,
      department,
      position,
      phone,
      email,
      work_shift,
      status,
    } = req.body;

    if (!employee_code || !full_name) {
      return res.status(400).json({ message: 'Mã NV và họ tên là bắt buộc' });
    }

    const usersSnap = await db.ref('users').once('value');
    if (usersSnap.exists()) {
      const users = usersSnap.val();
      const duplicate = Object.values(users).some((u) => u.employeeCode === employee_code);
      if (duplicate) {
        return res.status(400).json({ message: 'Mã nhân viên đã tồn tại!' });
      }
    }

    const newRef = db.ref('users').push();
    const employeeEmail = email?.trim() || `${employee_code.toLowerCase()}@company.local`;

    const employeeData = {
      email: employeeEmail,
      password: '',
      employeeCode: employee_code,
      personalInfo: {
        fullName: full_name,
        department: department || '',
        position: position || '',
        phone: phone || '',
      },
      workShift: work_shift || 'office',
      role: 'Employee',
      status: status || 'Pending',
      isFaceRegistered: false,
      faceDataStatus: null,
      profileImage: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await newRef.set(employeeData);

    res.status(201).json({
      message: 'Thêm thành công',
      employee: mapUserToEmployee(newRef.key, employeeData),
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name,
      department,
      position,
      phone,
      email,
      work_shift,
      status,
      faceDataStatus,
    } = req.body;

    const userRef = db.ref(`users/${id}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists() || snapshot.val().role !== 'Employee') {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const old = snapshot.val();
    const updates = {
      personalInfo: {
        ...old.personalInfo,
        fullName: full_name ?? old.personalInfo?.fullName,
        department: department ?? old.personalInfo?.department,
        position: position ?? old.personalInfo?.position,
        phone: phone ?? old.personalInfo?.phone,
      },
      workShift: work_shift ?? old.workShift ?? 'office',
      status: status || old.status,
      updatedAt: Date.now(),
    };

    if (email?.trim()) updates.email = email.trim();
    if (faceDataStatus === 'needs_update' || faceDataStatus === 'ready') {
      updates.faceDataStatus = faceDataStatus;
    }

    await userRef.update(updates);
    res.status(200).json({ message: 'Cập nhật thông tin thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const userRef = db.ref(`users/${id}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    await Promise.all([
      userRef.remove(),
      db.ref(`faceData/${id}`).remove(),
      db.ref(`knownDevices/${id}`).remove(),
    ]);

    res.status(200).json({ message: 'Đã xóa nhân viên và dữ liệu khuôn mặt!' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const saveFaceHistory = async (userId, existingFace, meta = {}) => {
  if (!existingFace?.face_descriptor?.length) return;
  const historyRef = db.ref(`faceDataHistory/${userId}`).push();
  await historyRef.set({
    sampleCount: existingFace.sampleCount || existingFace.face_descriptor.length,
    registrationQuality: existingFace.registrationQuality || null,
    faceDataStatus: existingFace.faceDataStatus || null,
    profileImage: meta.profileImage || '',
    action: meta.action || 're_extract',
    performedBy: meta.performedBy || '',
    archivedAt: Date.now(),
  });
};

const registerEmployeeFace = async (req, res) => {
  try {
    const { id } = req.params;
    const { descriptors, base64Image, qualityMetrics } = req.body;

    if (!Array.isArray(descriptors) || descriptors.length < 3) {
      return res.status(400).json({
        message: 'Cần ít nhất 3 mẫu khuôn mặt (trực diện, nghiêng trái, nghiêng phải)',
      });
    }

    const invalid = descriptors.some((d) => !Array.isArray(d) || d.length !== 128);
    if (invalid) {
      return res.status(400).json({ message: 'Mỗi descriptor phải là mảng 128 số' });
    }

    const userSnap = await db.ref(`users/${id}`).once('value');
    if (!userSnap.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const bestDistance = qualityMetrics?.bestDistance ?? null;
    const testRounds = qualityMetrics?.testRounds ?? 0;
    const faceDataStatus =
      bestDistance != null && bestDistance > FACE_QUALITY_WARN_MAX ? 'needs_update' : 'ready';

    let profileImageUrl = userSnap.val().profileImage || '';
    if (base64Image) {
      profileImageUrl = await uploadToImgBB(base64Image);
    }

    const now = Date.now();

    const existingFaceSnap = await db.ref(`faceData/${id}`).once('value');
    const existingFace = existingFaceSnap.val();
    if (existingFace) {
      await saveFaceHistory(id, existingFace, {
        profileImage: userSnap.val().profileImage || '',
        action: 're_extract',
        performedBy: req.user?.id || '',
      });
    }

    await Promise.all([
      db.ref(`users/${id}`).update({
        isFaceRegistered: true,
        status: 'Active',
        faceDataStatus,
        profileImage: profileImageUrl,
        updatedAt: now,
      }),
      db.ref(`faceData/${id}`).set({
        user_id: id,
        face_descriptor: descriptors,
        sampleCount: descriptors.length,
        registrationQuality: {
          bestDistance,
          testRounds,
          sampleCount: descriptors.length,
          extractedAt: now,
        },
        faceDataStatus,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    res.status(200).json({
      message: 'Trích xuất embedding và lưu vector đặc trưng thành công!',
      profileImage: profileImageUrl,
      faceDataStatus,
      bestDistance,
    });
  } catch (error) {
    console.error('Lỗi registerEmployeeFace:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const resetEmployeeFace = async (req, res) => {
  try {
    const { id } = req.params;
    const userRef = db.ref(`users/${id}`);
    const snap = await userRef.once('value');

    if (!snap.exists() || snap.val().role !== 'Employee') {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    await Promise.all([
      userRef.update({
        isFaceRegistered: false,
        faceDataStatus: null,
        status: 'Pending',
        updatedAt: Date.now(),
      }),
      db.ref(`faceData/${id}`).remove(),
    ]);

    res.status(200).json({ message: 'Đã xóa dữ liệu sinh trắc. Cần trích xuất embedding lại.' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const markFaceNeedsUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const userRef = db.ref(`users/${id}`);
    const snap = await userRef.once('value');

    if (!snap.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    await Promise.all([
      userRef.update({ faceDataStatus: 'needs_update', updatedAt: Date.now() }),
      db.ref(`faceData/${id}`).update({ faceDataStatus: 'needs_update', updatedAt: Date.now() }),
    ]);

    res.status(200).json({ message: 'Đã đánh dấu cần cập nhật lại khuôn mặt.' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getFaceHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.ref(`faceDataHistory/${id}`).once('value');
    if (!snap.exists()) {
      return res.status(200).json([]);
    }
    const list = Object.entries(snap.val())
      .map(([hid, row]) => ({ id: hid, ...row }))
      .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
    res.status(200).json(list);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử', error: error.message });
  }
};

const csvEscape = (val) => {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const exportEmployeesCsv = async (req, res) => {
  try {
    const [usersSnap, faceSnap] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('faceData').once('value'),
    ]);
    const faceData = faceSnap.val() || {};
    const headers = [
      'Ma_NV',
      'Ho_ten',
      'Phong_ban',
      'Chuc_vu',
      'Email',
      'So_dien_thoai',
      'Ca_lam',
      'Trang_thai',
      'Sinh_trac_hoc',
      'So_mau',
      'Chat_luong',
    ];

    const rows = [];
    if (usersSnap.exists()) {
      Object.entries(usersSnap.val()).forEach(([id, user]) => {
        if (user.role !== 'Employee') return;
        const face = faceData[id];
        const status = resolveFaceDataStatus(face, user);
        rows.push([
          user.employeeCode || '',
          user.personalInfo?.fullName || '',
          user.personalInfo?.department || '',
          user.personalInfo?.position || '',
          user.email || '',
          user.personalInfo?.phone || '',
          user.workShift || 'office',
          user.status || 'Pending',
          status,
          face?.face_descriptor?.length || 0,
          face?.registrationQuality?.bestDistance ?? '',
        ]);
      });
    }

    const csv = [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nhan-vien.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi export CSV', error: error.message });
  }
};

const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};

const importEmployeesCsv = async (req, res) => {
  try {
    const { csvText, rows: rawRows } = req.body;
    let rows = rawRows;

    if (!rows && csvText) {
      const lines = String(csvText)
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((l) => l.trim());
      if (lines.length < 2) {
        return res.status(400).json({ message: 'File CSV trống hoặc thiếu dữ liệu' });
      }
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
      rows = lines.slice(1).map((line) => {
        const cols = parseCsvLine(line);
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = cols[i] || '';
        });
        return obj;
      });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'Không có dòng dữ liệu để import' });
    }

    const usersSnap = await db.ref('users').once('value');
    const existing = usersSnap.val() || {};
    const codeToId = {};
    Object.entries(existing).forEach(([id, u]) => {
      if (u.employeeCode) codeToId[u.employeeCode] = id;
    });

    let created = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const code =
        row.ma_nv ||
        row.Ma_NV ||
        row.employee_code ||
        row['mã nv'] ||
        row['ma nv'] ||
        '';
      const fullName =
        row.ho_ten || row.Ho_ten || row.full_name || row['họ tên'] || row['ho ten'] || '';
      if (!code || !fullName) {
        errors.push(`Dòng ${i + 2}: thiếu Mã NV hoặc Họ tên`);
        continue;
      }

      const payload = {
        employeeCode: code,
        email: row.email || row.Email || `${String(code).toLowerCase()}@company.local`,
        personalInfo: {
          fullName,
          department: row.phong_ban || row.Phong_ban || row.department || '',
          position: row.chuc_vu || row.Chuc_vu || row.position || '',
          phone: row.so_dien_thoai || row.So_dien_thoai || row.phone || '',
        },
        workShift: row.ca_lam || row.Ca_lam || row.work_shift || 'office',
        status: row.trang_thai || row.Trang_thai || row.status || 'Pending',
      };

      const existingId = codeToId[code];
      if (existingId) {
        await db.ref(`users/${existingId}`).update({
          ...payload,
          personalInfo: {
            ...existing[existingId]?.personalInfo,
            ...payload.personalInfo,
          },
          updatedAt: Date.now(),
        });
        updated += 1;
      } else {
        const ref = db.ref('users').push();
        await ref.set({
          ...payload,
          role: 'Employee',
          password: '',
          isFaceRegistered: false,
          faceDataStatus: null,
          profileImage: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        codeToId[code] = ref.key;
        created += 1;
      }
    }

    res.status(200).json({
      message: `Import xong: ${created} mới, ${updated} cập nhật`,
      created,
      updated,
      errors,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi import CSV', error: error.message });
  }
};

module.exports = {
  getEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  registerEmployeeFace,
  resetEmployeeFace,
  markFaceNeedsUpdate,
  getFaceHistory,
  exportEmployeesCsv,
  importEmployeesCsv,
};
