const db = require('../config/firebase');
const { uploadToImgBB } = require('../utils/imgbbService');
const { findBestFaceMatch } = require('../utils/faceUtils');

const getToday = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const loadWorkSettings = async () => {
  const snap = await db.ref('settings').once('value');
  const settings = snap.val() || {};
  return {
    workStartTime: settings.workStartTime || '08:00',
    lateThreshold: Number(settings.lateThreshold) || 0,
  };
};

const isLate = async () => {
  const { workStartTime, lateThreshold } = await loadWorkSettings();
  const [h, m] = workStartTime.split(':').map(Number);
  const deadline = new Date();
  deadline.setHours(h, m + lateThreshold, 0, 0);
  return Date.now() > deadline.getTime();
};

const checkIn = async (req, res) => {
  try {
    const { descriptor, base64Image, date, livenessPassed, livenessChallenge } = req.body;
    const attendanceDate = date || getToday();

    if (!livenessPassed) {
      return res.status(400).json({
        message: 'Chưa vượt qua kiểm tra liveness. Vui lòng thực hiện đúng hành động được yêu cầu.',
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

    const match = findBestFaceMatch(descriptor, allFaces);

    if (!match.matched) {
      const msg =
        match.reason === 'ambiguous'
          ? 'Không thể xác định danh tính duy nhất. Vui lòng thử lại hoặc liên hệ Admin.'
          : 'Khuôn mặt không khớp với hồ sơ đã đăng ký. Vui lòng thử lại!';
      return res.status(400).json({ message: msg, faceMatchError: true });
    }

    const matchedUserId = match.userId;

    if (req.user?.id && matchedUserId !== req.user.id) {
      return res.status(403).json({
        message:
          'Khuôn mặt không trùng với tài khoản đang đăng nhập. Chỉ được chấm công cho chính bạn.',
        faceMatchError: true,
      });
    }

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

    const fullName = user.personalInfo?.fullName || 'bạn';
    const recordKey = `${matchedUserId}_${attendanceDate}`;
    const attendanceRef = db.ref(`attendances/${recordKey}`);
    const attendanceSnap = await attendanceRef.once('value');
    const imageUrl = await uploadToImgBB(base64Image);
    const late = await isLate();

    if (!attendanceSnap.exists()) {
      await attendanceRef.set({
        userId: matchedUserId,
        date: attendanceDate,
        checkInTime: Date.now(),
        status: late ? 'Late' : 'OnTime',
        verifyImageIn: imageUrl,
        livenessChallenge: livenessChallenge || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return res.status(200).json({
        message: `Tít! Xin chào ${fullName}`,
        action: 'checkIn',
        fullName,
        distance: match.minDistance.toFixed(4),
        status: late ? 'Late' : 'OnTime',
      });
    }

    const existingRecord = attendanceSnap.val();
    if (existingRecord.checkOutTime) {
      return res.status(400).json({ message: 'Bạn đã hoàn tất check-out hôm nay rồi!' });
    }

    await attendanceRef.update({
      checkOutTime: Date.now(),
      verifyImageOut: imageUrl,
      updatedAt: Date.now(),
    });

    return res.status(200).json({
      message: `Tít! Tạm biệt ${fullName}, chúc bạn buổi tối vui vẻ!`,
      action: 'checkOut',
      fullName,
      distance: match.minDistance.toFixed(4),
    });
  } catch (error) {
    console.error('Lỗi attendanceController.checkIn:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getAllAttendances = async (req, res) => {
  try {
    const [attSnap, usersSnap] = await Promise.all([
      db.ref('attendances').once('value'),
      db.ref('users').once('value'),
    ]);

    const attendancesData = attSnap.val() || {};
    const usersData = usersSnap.val() || {};

    let result = Object.keys(attendancesData).map((key) => {
      const record = attendancesData[key];
      const user = usersData[record.userId] || {};

      return {
        id: key,
        userId: record.userId,
        employee_code: user.employeeCode || `NV${(record.userId || '').slice(-6).toUpperCase()}`,
        full_name: user.personalInfo?.fullName || 'Nhân viên đã bị xóa',
        date: record.date,
        checkInTime: record.checkInTime,
        checkOutTime: record.checkOutTime,
        status: record.status,
        verifyImageIn: record.verifyImageIn || '',
        verifyImageOut: record.verifyImageOut || '',
      };
    });

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

module.exports = { getAllAttendances, getMyAttendances, checkIn };
