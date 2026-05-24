const db = require('../config/firebase');
const { LEAVE_TYPES, findOverlappingLeave } = require('../utils/leaveUtils');

const mapLeave = (id, row) => ({
  id,
  userId: row.userId || '',
  employeeCode: row.employeeCode || '',
  fullName: row.fullName || '',
  department: row.department || '',
  leaveType: row.leaveType || 'annual',
  dateFrom: row.dateFrom || '',
  dateTo: row.dateTo || '',
  reason: row.reason || '',
  status: row.status || 'Pending',
  adminNote: row.adminNote || '',
  createdAt: row.createdAt || null,
  updatedAt: row.updatedAt || null,
  reviewedAt: row.reviewedAt || null,
  reviewedBy: row.reviewedBy || '',
});

const loadLeavesList = async () => {
  const snap = await db.ref('leaveRequests').once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([id, row]) => mapLeave(id, row))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

const getLeaves = async (req, res) => {
  try {
    const isAdmin = String(req.user.role).toLowerCase() === 'admin';
    let list = await loadLeavesList();

    if (!isAdmin) {
      list = list.filter((l) => l.userId === req.user.id);
    } else if (req.query.status) {
      list = list.filter((l) => l.status === req.query.status);
    }

    res.status(200).json(list);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy đơn nghỉ', error: error.message });
  }
};

const createLeave = async (req, res) => {
  try {
    const { dateFrom, dateTo, reason, leaveType, userId: targetUserId } = req.body;
    const isAdmin = String(req.user.role).toLowerCase() === 'admin';

    if (!dateFrom || !dateTo) {
      return res.status(400).json({ message: 'Cần ngày bắt đầu và kết thúc nghỉ' });
    }
    if (!isAdmin && !(reason || '').trim()) {
      return res.status(400).json({ message: 'Cần nhập lý do xin nghỉ' });
    }
    if (dateTo < dateFrom) {
      return res.status(400).json({ message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi' });
    }

    const leaveTypeVal = leaveType || 'annual';
    if (!LEAVE_TYPES.includes(leaveTypeVal)) {
      return res.status(400).json({ message: 'Loại nghỉ không hợp lệ' });
    }

    const userId = isAdmin && targetUserId ? targetUserId : req.user.id;
    const userSnap = await db.ref(`users/${userId}`).once('value');
    if (!userSnap.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }
    const user = userSnap.val();

    if (!isAdmin && user.role !== 'Employee') {
      return res.status(403).json({ message: 'Chỉ nhân viên mới được gửi đơn nghỉ phép' });
    }

    const existing = await loadLeavesList();
    const overlap = findOverlappingLeave(existing, userId, dateFrom, dateTo);
    if (overlap) {
      return res.status(400).json({
        message: `Trùng khoảng thời gian với đơn ${overlap.status === 'Pending' ? 'đang chờ duyệt' : 'đã duyệt'} (${overlap.dateFrom} → ${overlap.dateTo})`,
      });
    }

    const now = Date.now();
    const ref = db.ref('leaveRequests').push();
    const record = {
      userId,
      employeeCode: user.employeeCode || '',
      fullName: user.personalInfo?.fullName || '',
      department: user.personalInfo?.department || '',
      leaveType: leaveTypeVal,
      dateFrom,
      dateTo,
      reason: (reason || '').trim().slice(0, 500),
      status: isAdmin && req.body.status === 'Approved' ? 'Approved' : 'Pending',
      adminNote: '',
      createdAt: now,
      updatedAt: now,
      reviewedAt: isAdmin && req.body.status === 'Approved' ? now : null,
      reviewedBy: isAdmin && req.body.status === 'Approved' ? req.user.id : '',
    };

    await ref.set(record);
    res.status(201).json({ message: 'Đã gửi đơn nghỉ phép', leave: mapLeave(ref.key, record) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    const ref = db.ref(`leaveRequests/${id}`);
    const snap = await ref.once('value');
    if (!snap.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy đơn nghỉ' });
    }

    const now = Date.now();
    await ref.update({
      status,
      adminNote: typeof adminNote === 'string' ? adminNote.trim().slice(0, 500) : '',
      updatedAt: now,
      reviewedAt: status === 'Pending' ? null : now,
      reviewedBy: status === 'Pending' ? '' : req.user.id,
    });

    res.status(200).json({ message: `Đã cập nhật trạng thái: ${status}` });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const deleteLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const ref = db.ref(`leaveRequests/${id}`);
    const snap = await ref.once('value');
    if (!snap.exists()) {
      return res.status(404).json({ message: 'Không tìm thấy đơn nghỉ' });
    }

    const row = snap.val();
    const isAdmin = String(req.user.role).toLowerCase() === 'admin';
    if (!isAdmin && row.userId !== req.user.id) {
      return res.status(403).json({ message: 'Không có quyền xóa đơn này' });
    }
    if (!isAdmin && row.status !== 'Pending') {
      return res.status(400).json({ message: 'Chỉ xóa được đơn đang chờ duyệt' });
    }

    await ref.remove();
    res.status(200).json({ message: 'Đã xóa đơn nghỉ phép' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = {
  getLeaves,
  createLeave,
  updateLeaveStatus,
  deleteLeave,
};
