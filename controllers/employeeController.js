const db = require('../config/firebase');
const { uploadToImgBB } = require('../utils/imgbbService');

const mapUserToEmployee = (id, user) => ({
  id,
  employee_code: user.employeeCode || `NV${id.slice(-6).toUpperCase()}`,
  full_name: user.personalInfo?.fullName || user.email?.split('@')[0] || 'N/A',
  department: user.personalInfo?.department || '',
  email: user.email,
  status: user.status || 'Pending',
  isFaceRegistered: Boolean(user.isFaceRegistered),
  profileImage: user.profileImage || '',
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getEmployees = async (req, res) => {
  try {
    const snapshot = await db.ref('users').once('value');
    let employees = [];

    if (snapshot.exists()) {
      const data = snapshot.val();
      employees = Object.keys(data)
        .filter((key) => data[key].role === 'Employee')
        .map((key) => mapUserToEmployee(key, data[key]));
    }

    employees.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.status(200).json(employees);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách', error: error.message });
  }
};

const addEmployee = async (req, res) => {
  try {
    const { employee_code, full_name, department } = req.body;
    if (!employee_code || !full_name) {
      return res.status(400).json({ message: 'Mã NV và họ tên là bắt buộc' });
    }

    const usersSnap = await db.ref('users').once('value');
    if (usersSnap.exists()) {
      const users = usersSnap.val();
      const duplicate = Object.values(users).some(
        (u) => u.employeeCode === employee_code
      );
      if (duplicate) {
        return res.status(400).json({ message: 'Mã nhân viên đã tồn tại!' });
      }
    }

    const newRef = db.ref('users').push();
    const employeeData = {
      email: `${employee_code.toLowerCase()}@company.local`,
      password: '',
      employeeCode: employee_code,
      personalInfo: { fullName: full_name, department: department || '' },
      role: 'Employee',
      status: 'Pending',
      isFaceRegistered: false,
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
    const { full_name, department, status } = req.body;

    const userRef = db.ref(`users/${id}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists() || snapshot.val().role !== 'Employee') {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const old = snapshot.val();
    await userRef.update({
      personalInfo: {
        ...old.personalInfo,
        fullName: full_name ?? old.personalInfo?.fullName,
        department: department ?? old.personalInfo?.department,
      },
      status: status || old.status,
      updatedAt: Date.now(),
    });

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
    ]);

    res.status(200).json({ message: 'Đã xóa nhân viên và dữ liệu khuôn mặt!' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const registerEmployeeFace = async (req, res) => {
  try {
    const { id } = req.params;
    const { descriptors, base64Image } = req.body;

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

    let profileImageUrl = '';
    if (base64Image) {
      profileImageUrl = await uploadToImgBB(base64Image);
    }

    await Promise.all([
      db.ref(`users/${id}`).update({
        isFaceRegistered: true,
        status: 'Active',
        profileImage: profileImageUrl,
        updatedAt: Date.now(),
      }),
      db.ref(`faceData/${id}`).set({
        user_id: id,
        face_descriptor: descriptors,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ]);

    res.status(200).json({
      message: 'Đăng ký khuôn mặt và kích hoạt nhân viên thành công!',
      profileImage: profileImageUrl,
    });
  } catch (error) {
    console.error('Lỗi registerEmployeeFace:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = {
  getEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  registerEmployeeFace,
};
