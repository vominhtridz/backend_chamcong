const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  "https://nhandienkhuonmat-cdf36-default-rtdb.asia-southeast1.firebasedatabase.app";

const serviceAccountPath = path.resolve(
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, "..", "nhandienkhuonmat.json")
);

function loadServiceAccount() {
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Không tìm thấy file service account: ${serviceAccountPath}\n` +
        "Tải khóa mới tại Firebase Console → Project settings → Service accounts → Generate new private key."
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  if (!serviceAccount.private_key?.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "File service account không hợp lệ (thiếu private_key). Hãy tải lại file JSON từ Firebase Console."
    );
  }

  return serviceAccount;
}

const serviceAccount = loadServiceAccount();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });
}

const db = admin.database();

function printCredentialHelp(message) {
  console.error("\n❌ Lỗi xác thực Firebase Admin:", message);
  console.error(`
Khóa service account không còn hợp lệ (thường do đã bị thu hồi trên Google).

Cách sửa:
1. Mở https://console.firebase.google.com/project/nhandienkhuonmat-cdf36/settings/serviceaccounts/adminsdk
2. Bấm "Generate new private key" và tải file JSON mới
3. Thay file backend/nhandienkhuonmat.json (key ID hiện tại: ${serviceAccount.private_key_id})
4. Khởi động lại server backend
`);
}

async function verifyFirebase() {
  try {
    await admin.credential.cert(serviceAccount).getAccessToken();
    console.log("🔥 Đã xác thực Firebase Admin thành công!");
    return db;
  } catch (err) {
    const message = err?.message || String(err);
    if (message.includes("Invalid JWT Signature") || message.includes("invalid_grant")) {
      printCredentialHelp(message);
    } else {
      console.error("\n❌ Lỗi xác thực Firebase:", message);
    }
    process.exit(1);
  }
}

module.exports = db;
module.exports.verifyFirebase = verifyFirebase;
