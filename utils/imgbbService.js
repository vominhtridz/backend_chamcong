const axios = require('axios');

/**
 * Hàm upload ảnh base64 lên ImgBB
 * @param {string} base64Image - Chuỗi ảnh base64 (có thể chứa tiền tố data:image...)
 * @returns {Promise<string>} - Trả về URL trực tiếp của ảnh
 */
const uploadToImgBB = async (base64Image) => {
  try {
    // 1. Cắt bỏ tiền tố "data:image/jpeg;base64," nếu có
    // ImgBB API chỉ nhận phần nội dung base64 thuần túy
    const base64Data = base64Image.includes('base64,') 
      ? base64Image.split('base64,')[1] 
      : base64Image;

    // 2. Chuẩn bị payload dạng form-urlencoded
    const params = new URLSearchParams();
    params.append('key', process.env.IMGBB_API_KEY); // Lấy API Key từ file .env
    params.append('image', base64Data);

    // 3. Gọi API của ImgBB
    const response = await axios.post('https://api.imgbb.com/1/upload', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // 4. Trả về URL ảnh (đường link trực tiếp có thể hiển thị trên thẻ <img>)
    if (response.data && response.data.data && response.data.data.url) {
      return response.data.data.url;
    } else {
      throw new Error('Định dạng trả về từ ImgBB không hợp lệ');
    }

  } catch (error) {
    console.error('Lỗi khi upload lên ImgBB:', error?.response?.data || error.message);
    throw new Error('Không thể upload ảnh lên ImgBB');
  }
};

module.exports = { uploadToImgBB };