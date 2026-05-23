const db = require('../config/firebase');

// Hàm hỗ trợ format Date thành chuỗi 'YYYY-MM-DD'
const getFormattedDate = (dateObj) => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDashboardStats = async (req, res) => {
  try {
    const todayStr = getFormattedDate(new Date());

    // ----------------------------------------------------
    // 1. ĐẾM NHÂN VIÊN VÀ SỐ NGƯỜI CHƯA ĐĂNG KÝ KHUÔN MẶT
    // ----------------------------------------------------
    // Kéo danh sách users/employees về (Tùy theo nhánh DB bạn đang lưu)
    const usersSnap = await db.ref('users').once('value'); 
    
    let totalEmployees = 0;
    let pendingFacesCount = 0;

    if (usersSnap.exists()) {
      const usersData = usersSnap.val();
      
      Object.values(usersData).forEach((user) => {
        if (user.role !== 'Employee') return;
        if (user.status === 'Active') {
          totalEmployees++;
        }
        if (!user.isFaceRegistered || user.status === 'Pending') {
          pendingFacesCount++;
        }
      });
    }

    // ----------------------------------------------------
    // 2. TÍNH TOÁN LƯỢT CHẤM CÔNG HÔM NAY
    // ----------------------------------------------------
    const attendanceSnap = await db.ref('attendances')
      .orderByChild('date')
      .equalTo(todayStr)
      .once('value');

    let presentCount = 0;
    let lateCount = 0;

    if (attendanceSnap.exists()) {
      const attendances = Object.values(attendanceSnap.val());
      presentCount = attendances.length; // Số người có mặt

      attendances.forEach(record => {
        if (record.status === 'Late') {
          lateCount++;
        }
      });
    }

    const absentCount = Math.max(0, totalEmployees - presentCount);

    // ----------------------------------------------------
    // 3. TRẢ KẾT QUẢ VỀ FRONTEND
    // ----------------------------------------------------
    res.status(200).json({
      dailyStats: {
        total: totalEmployees,
        present: presentCount,
        absent: absentCount,
        late: lateCount
      },
      pendingFacesCount: pendingFacesCount // Trả luôn số đếm này về cho frontend
    });

  } catch (error) {
    console.error("Lỗi getDashboardStats:", error);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu Dashboard' });
  }
};

module.exports = { getDashboardStats };