const db = require('../config/firebase');
const { getShiftDate } = require('../utils/shiftUtils');

const formatDate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const loadSettings = async () => {
  const snap = await db.ref('settings').once('value');
  return snap.val() || {};
};

const loadEmployees = async () => {
  const snap = await db.ref('users').once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .filter(([, u]) => u.role === 'Employee')
    .map(([id, u]) => ({
      id,
      employeeCode: u.employeeCode || `NV${id.slice(-6).toUpperCase()}`,
      fullName: u.personalInfo?.fullName || u.email || 'N/A',
      department: u.personalInfo?.department || 'Chưa phân loại',
      status: u.status || 'Pending',
      isFaceRegistered: Boolean(u.isFaceRegistered),
    }));
};

const loadAttendances = async () => {
  const snap = await db.ref('attendances').once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val()).map(([id, r]) => ({ id, ...r }));
};

const loadActivityLogs = async (limit = 50) => {
  const snap = await db.ref('activityLogs').orderByChild('timestamp').once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);
};

const countOnLeaveToday = async (shiftDate) => {
  const snap = await db.ref('leaveRequests').once('value');
  if (!snap.exists()) return 0;
  return Object.values(snap.val()).filter(
    (r) => r.status === 'Approved' && r.dateFrom <= shiftDate && r.dateTo >= shiftDate
  ).length;
};

const countPendingLeaves = async () => {
  const snap = await db.ref('leaveRequests').once('value');
  if (!snap.exists()) return 0;
  return Object.values(snap.val()).filter((r) => r.status === 'Pending').length;
};

const checkDatabaseHealth = async () => {
  const start = Date.now();
  try {
    await db.ref('settings').limitToFirst(1).once('value');
    return { status: 'ok', latencyMs: Date.now() - start, label: 'Firebase Realtime DB' };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - start, label: 'Firebase Realtime DB', error: err.message };
  }
};

const getDashboardOverview = async (req, res) => {
  try {
    const settings = await loadSettings();
    const now = new Date();
    const shiftDate = getShiftDate(now, settings.workStartTime || '22:40', settings.workEndTime || '04:30');

    const [employees, attendances, activityLogs, dbHealth, onLeaveCount, pendingLeaves] =
      await Promise.all([
        loadEmployees(),
        loadAttendances(),
        loadActivityLogs(60),
        checkDatabaseHealth(),
        countOnLeaveToday(shiftDate),
        countPendingLeaves(),
      ]);

    const activeEmployees = employees.filter((e) => e.status === 'Active');
    const totalEmployees = activeEmployees.length;

    const todayAttendances = attendances.filter((a) => a.date === shiftDate);
    const presentIds = new Set(todayAttendances.filter((a) => a.checkInTime).map((a) => a.userId));
    const presentCount = presentIds.size;
    const workingNow = todayAttendances.filter((a) => a.status === 'CheckedIn').length;
    const completeCount = todayAttendances.filter((a) => a.status === 'Complete').length;
    const lateCount = todayAttendances.filter((a) => a.status === 'Late').length;
    const notCheckedIn = Math.max(0, totalEmployees - presentCount);
    const absentCount = Math.max(0, notCheckedIn - onLeaveCount);

    const pendingFacesCount = employees.filter(
      (e) => !e.isFaceRegistered || e.status === 'Pending'
    ).length;

    const incompleteShifts = attendances.filter((a) => a.checkInTime && !a.checkOutTime).length;

    // Biểu đồ 7 ngày
    const last7Days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      const dayRecords = attendances.filter((a) => a.date === dateStr);
      const dayPresent = dayRecords.filter((a) => a.checkInTime).length;
      const dayLate = dayRecords.filter((a) => a.status === 'Late').length;
      const dayOnTime = dayRecords.filter(
        (a) => a.status === 'Complete' || a.status === 'CheckedIn' || a.status === 'OnTime'
      ).length;
      last7Days.push({
        date: dateStr,
        label: d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        present: dayPresent,
        onTime: dayOnTime,
        late: dayLate,
        absent: Math.max(0, totalEmployees - dayPresent),
      });
    }

    // Live feed — check-in/out thành công
    const liveFeed = activityLogs
      .filter((l) => l.type === 'check_in' || l.type === 'check_out')
      .slice(0, 20)
      .map((l) => ({
        id: l.id,
        type: l.type,
        fullName: l.fullName,
        employeeCode: l.employeeCode,
        department: l.department,
        timestamp: l.timestamp,
        imageUrl: l.imageUrl,
        action: l.action,
        faceDistance: l.faceDistance,
      }));

    // Cảnh báo bảo mật
    const securityAlerts = activityLogs
      .filter((l) =>
        ['face_fail', 'spoof_suspect', 'unknown_device', 'out_of_zone', 'liveness_fail', 'time_fail'].includes(
          l.type
        )
      )
      .slice(0, 15);

    const failedAttempts = activityLogs.filter((l) => l.type === 'face_fail').slice(0, 10);
    const spoofAlerts = activityLogs.filter((l) => l.type === 'spoof_suspect').slice(0, 10);
    const unknownDevices = activityLogs.filter((l) => l.type === 'unknown_device').slice(0, 10);
    const outOfZone = activityLogs.filter((l) => l.type === 'out_of_zone').slice(0, 10);

    // GPS pins từ chấm công hôm nay
    const mapPins = todayAttendances
      .filter((a) => a.checkInLocation?.latitude != null && a.checkInLocation?.longitude != null)
      .map((a) => {
        const emp = employees.find((e) => e.id === a.userId) || {};
        return {
          userId: a.userId,
          fullName: emp.fullName,
          lat: a.checkInLocation.latitude,
          lng: a.checkInLocation.longitude,
          inGeofence: a.checkInLocation.inGeofence !== false,
          time: a.checkInTime,
        };
      });

    // Phòng ban
    const deptMap = {};
    activeEmployees.forEach((e) => {
      const dept = e.department || 'Chưa phân loại';
      if (!deptMap[dept]) deptMap[dept] = { total: 0, present: 0, onTime: 0 };
      deptMap[dept].total += 1;
      if (presentIds.has(e.id)) {
        deptMap[dept].present += 1;
        const rec = todayAttendances.find((a) => a.userId === e.id);
        if (rec && (rec.status === 'Complete' || rec.status === 'CheckedIn' || rec.status === 'OnTime')) {
          deptMap[dept].onTime += 1;
        }
      }
    });

    const departmentBreakdown = Object.entries(deptMap).map(([name, v]) => ({
      department: name,
      total: v.total,
      present: v.present,
      complianceRate: v.total > 0 ? Math.round((v.onTime / v.total) * 100) : 0,
    }));

    // Top đi muộn tuần (legacy Late + check-in sau deadline nếu có lateMinutes)
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const lateByUser = {};
    attendances
      .filter((a) => a.checkInTime >= weekAgo && (a.status === 'Late' || (a.lateMinutes || 0) > 0))
      .forEach((a) => {
        const emp = employees.find((e) => e.id === a.userId);
        if (!lateByUser[a.userId]) {
          lateByUser[a.userId] = {
            userId: a.userId,
            fullName: emp?.fullName || 'N/A',
            department: emp?.department || '',
            lateCount: 0,
            totalLateMinutes: 0,
          };
        }
        lateByUser[a.userId].lateCount += 1;
        lateByUser[a.userId].totalLateMinutes += a.lateMinutes || 15;
      });

    const topLate = Object.values(lateByUser)
      .sort((a, b) => b.totalLateMinutes - a.totalLateMinutes)
      .slice(0, 5);

    const lastFaceSuccess = activityLogs.find((l) => l.type === 'check_in' || l.type === 'check_out');

    const recentErrors = activityLogs
      .filter((l) => l.severity === 'error' || l.type === 'api_error')
      .slice(0, 8);

    const pendingTasks = [
      {
        id: 'pending-faces',
        label: 'Nhân viên chờ đăng ký khuôn mặt',
        count: pendingFacesCount,
        link: '/admin/employees',
        priority: pendingFacesCount > 0 ? 'high' : 'normal',
      },
      {
        id: 'pending-leaves',
        label: 'Đơn xin nghỉ phép chờ duyệt',
        count: pendingLeaves,
        link: '/admin/leaves',
        priority: pendingLeaves > 0 ? 'high' : 'normal',
      },
      {
        id: 'incomplete-shifts',
        label: 'Ca chưa check-out',
        count: incompleteShifts,
        link: '/admin/attendance',
        priority: incompleteShifts > 0 ? 'medium' : 'normal',
      },
      {
        id: 'security-alerts',
        label: 'Cảnh báo bảo mật (24h)',
        count: securityAlerts.length,
        link: '/admin/dashboard',
        priority: securityAlerts.length > 0 ? 'high' : 'normal',
      },
    ];

    res.status(200).json({
      shiftDate,
      todayOverview: {
        total: totalEmployees,
        present: presentCount,
        workingNow,
        complete: completeCount,
        late: lateCount,
        absent: absentCount,
        onLeave: onLeaveCount,
        notCheckedIn,
      },
      donut: [
        { name: 'Có mặt', value: presentCount, color: '#22c55e' },
        { name: 'Đi muộn', value: lateCount, color: '#eab308' },
        { name: 'Vắng mặt', value: absentCount, color: '#ef4444' },
        { name: 'Nghỉ phép', value: onLeaveCount, color: '#94a3b8' },
      ].filter((d) => d.value > 0 || d.name === 'Có mặt' || d.name === 'Vắng mặt'),
      kpiCards: [
        { key: 'total', label: 'Tổng nhân viên', value: totalEmployees, color: 'blue' },
        { key: 'present', label: 'Đã check-in ca', value: presentCount, color: 'green' },
        { key: 'working', label: 'Đang trong ca', value: workingNow, color: 'indigo' },
        { key: 'notIn', label: 'Chưa check-in', value: notCheckedIn, color: 'orange' },
      ],
      chart7Days: last7Days,
      liveFeed,
      systemHealth: {
        database: dbHealth,
        faceApi: {
          status: lastFaceSuccess ? 'ok' : 'idle',
          label: 'Nhận diện khuôn mặt (client-side)',
          lastSuccessAt: lastFaceSuccess?.timestamp || null,
          note: 'Model AI chạy trên trình duyệt nhân viên; server xử lý so khớp descriptor.',
        },
        recentErrors,
      },
      security: {
        alerts: securityAlerts,
        failedAttempts,
        spoofAlerts,
        unknownDevices,
        outOfZone,
      },
      geofence: {
        enabled: Boolean(settings.geofenceEnabled),
        center: {
          lat: settings.geofenceLat ?? null,
          lng: settings.geofenceLng ?? null,
        },
        radiusMeters: settings.geofenceRadiusMeters || 500,
        pins: mapPins,
      },
      departmentBreakdown,
      topLate,
      pendingTasks,
      pendingFacesCount,
      generatedAt: Date.now(),
    });
  } catch (error) {
    console.error('getDashboardOverview:', error);
    res.status(500).json({ message: 'Lỗi khi tải dashboard', error: error.message });
  }
};

/** Legacy endpoint — tương thích code cũ */
const getDashboardStats = async (req, res) => {
  try {
    const settings = await loadSettings();
    const now = new Date();
    const shiftDate = getShiftDate(now, settings.workStartTime || '22:40', settings.workEndTime || '04:30');
    const employees = await loadEmployees();
    const attendances = await loadAttendances();
    const activeEmployees = employees.filter((e) => e.status === 'Active');
    const todayAttendances = attendances.filter((a) => a.date === shiftDate);
    const presentCount = todayAttendances.filter((a) => a.checkInTime).length;
    const lateCount = todayAttendances.filter((a) => a.status === 'Late').length;
    const pendingFacesCount = employees.filter((e) => !e.isFaceRegistered || e.status === 'Pending').length;

    res.status(200).json({
      dailyStats: {
        total: activeEmployees.length,
        present: presentCount,
        absent: Math.max(0, activeEmployees.length - presentCount),
        late: lateCount,
      },
      pendingFacesCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu Dashboard' });
  }
};

module.exports = { getDashboardOverview, getDashboardStats };
