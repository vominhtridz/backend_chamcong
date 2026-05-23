const admin = require("firebase-admin");
const serviceAccount = require("../nhandienkhuonmat.json"); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  
  // BẮT BUỘC PHẢI CÓ DÒNG NÀY CHO REALTIME DATABASE
  // Thay URL này bằng URL lấy trên Firebase Console của bạn
  databaseURL: "https://nhandienkhuonmat-cdf36-default-rtdb.asia-southeast1.firebasedatabase.app" 
});

// SỬA LẠI THÀNH database() (KHÔNG DÙNG firestore)
const db = admin.database();

console.log("🔥 Đã kết nối Firebase Realtime Database thành công!");

module.exports = db;