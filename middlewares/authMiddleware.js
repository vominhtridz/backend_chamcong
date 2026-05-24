const jwt = require('jsonwebtoken');
const db = require('../config/firebase');

const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_KEY_123';

const isAdminRole = (role) => String(role || '').toLowerCase() === 'admin';

const loadAccountFromToken = async (decoded) => {
  if (isAdminRole(decoded.role)) {
    const adminSnap = await db.ref(`admins/${decoded.id}`).once('value');
    if (adminSnap.exists()) {
      const admin = adminSnap.val();
      return {
        id: decoded.id,
        email: admin.email,
        role: 'Admin',
        status: 'Active',
        isFaceRegistered: true,
      };
    }

    // Admin đăng nhập qua /login (lưu trong users, không có bản ghi admins/{id})
    const userSnap = await db.ref(`users/${decoded.id}`).once('value');
    if (userSnap.exists() && isAdminRole(userSnap.val().role)) {
      const user = userSnap.val();
      return {
        id: decoded.id,
        email: user.email,
        role: 'Admin',
        status: user.status || 'Active',
        isFaceRegistered: Boolean(user.isFaceRegistered),
        personalInfo: user.personalInfo || {},
      };
    }

    return null;
  }

  const snap = await db.ref(`users/${decoded.id}`).once('value');
  if (!snap.exists()) return null;
  const user = snap.val();
  return {
    id: decoded.id,
    email: user.email,
    role: user.role || 'Employee',
    status: user.status || 'Pending',
    isFaceRegistered: Boolean(user.isFaceRegistered),
    personalInfo: user.personalInfo || {},
  };
};

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Không tìm thấy Token, truy cập bị từ chối' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await loadAccountFromToken(decoded);
    if (!user) {
      return res.status(401).json({ message: 'Người dùng không tồn tại' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

const RESTRICTED_AUTH_ALLOWED = [
  { method: 'GET', path: '/me' },
  { method: 'PUT', path: '/profile' },
  { method: 'PATCH', path: '/profile' },
];

const isRestrictedAllowed = (req) => {
  const base = (req.baseUrl || '').replace(/\/$/, '');
  const path = req.path || '';

  if (base === '/api/auth') {
    return RESTRICTED_AUTH_ALLOWED.some(
      (rule) => rule.method === req.method && (path === rule.path || path.endsWith(rule.path))
    );
  }

  if (base === '/api/leaves') {
    if (req.method === 'GET' && path === '/') return true;
    if (req.method === 'POST' && path === '/') return true;
    if (req.method === 'DELETE' && /^\/[^/]+$/.test(path)) return true;
  }

  return false;
};

const checkStatus = (req, res, next) => {
  if (isAdminRole(req.user.role)) return next();

  const isRestricted =
    req.user.status === 'Pending' || req.user.isFaceRegistered === false;

  if (isRestricted && !isRestrictedAllowed(req)) {
    return res.status(403).json({
      message:
        'Tài khoản đang chờ duyệt hoặc chưa đăng ký khuôn mặt. Bạn chỉ được truy cập trang Cá nhân.',
      isRestricted: true,
    });
  }

  next();
};

const adminOnly = (req, res, next) => {
  if (isAdminRole(req.user?.role)) return next();
  return res.status(403).json({ message: 'Quyền truy cập dành riêng cho Admin' });
};

module.exports = { protect, checkStatus, adminOnly };
