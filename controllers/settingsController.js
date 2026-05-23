const db = require('../config/firebase');

// [GET] Lấy cấu hình
const getSettings = async (req, res) => {
  const snap = await db.ref('settings').once('value');
  res.status(200).json(snap.val() || {
    workStartTime: '08:00',
    workEndTime: '17:30',
    lateThreshold: 15, // phút
    imgbbApiKey: ''
  });
};

// [POST] Cập nhật cấu hình
const updateSettings = async (req, res) => {
  await db.ref('settings').update(req.body);
  res.status(200).json({ message: 'Lưu cài đặt thành công!' });
};

module.exports = { getSettings, updateSettings };