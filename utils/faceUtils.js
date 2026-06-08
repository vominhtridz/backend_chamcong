const FACE_MATCH_THRESHOLD = 0.45;
const FACE_MATCH_MARGIN = 0.04;
/** Ngưỡng so khớp với mẫu của chính user đang đăng nhập (hơi nới vì điều kiện ánh sáng khác lúc đăng ký). */
const FACE_SELF_MATCH_THRESHOLD = 0.5;

const euclideanDistance = (descA, descB) => {
  if (!Array.isArray(descA) || !Array.isArray(descB) || descA.length !== descB.length) {
    throw new Error('Dữ liệu descriptor không hợp lệ');
  }
  let sum = 0;
  for (let i = 0; i < descA.length; i += 1) {
    const diff = descA[i] - descB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

/**
 * So khớp descriptor với toàn bộ faceData, yêu cầu khoảng cách tốt nhất vượt trội so với người thứ hai.
 */
const findBestFaceMatch = (descriptor, allFaces, threshold = FACE_MATCH_THRESHOLD) => {
  let bestUserId = null;
  let minDistance = Infinity;
  let secondBestDistance = Infinity;

  for (const userId of Object.keys(allFaces || {})) {
    const savedDescriptors = allFaces[userId]?.face_descriptor;
    if (!Array.isArray(savedDescriptors)) continue;

    for (const savedDesc of savedDescriptors) {
      try {
        const distance = euclideanDistance(savedDesc, descriptor);
        if (distance < minDistance) {
          secondBestDistance = minDistance;
          minDistance = distance;
          bestUserId = userId;
        } else if (distance < secondBestDistance) {
          secondBestDistance = distance;
        }
      } catch {
        // bỏ qua descriptor lỗi
      }
    }
  }

  if (!bestUserId || minDistance > threshold) {
    return { matched: false, userId: null, minDistance, reason: 'no_match' };
  }

  if (secondBestDistance !== Infinity && secondBestDistance - minDistance < FACE_MATCH_MARGIN) {
    return { matched: false, userId: null, minDistance, reason: 'ambiguous' };
  }

  return { matched: true, userId: bestUserId, minDistance };
};

/**
 * So khớp descriptor với mẫu của một user cụ thể (dùng khi đã biết ai đang chấm công).
 * Vẫn kiểm tra không có user khác khớp gần hơn hoặc gần bằng (chống nhầm người).
 */
const findFaceMatchForUser = (
  descriptor,
  userId,
  allFaces,
  selfThreshold = FACE_SELF_MATCH_THRESHOLD,
  margin = FACE_MATCH_MARGIN
) => {
  const savedDescriptors = allFaces?.[userId]?.face_descriptor;
  if (!Array.isArray(savedDescriptors) || savedDescriptors.length === 0) {
    return { matched: false, userId: null, minDistance: Infinity, reason: 'no_samples' };
  }

  let selfMinDistance = Infinity;
  for (const savedDesc of savedDescriptors) {
    try {
      const distance = euclideanDistance(savedDesc, descriptor);
      if (distance < selfMinDistance) selfMinDistance = distance;
    } catch {
      // bỏ qua descriptor lỗi
    }
  }

  if (selfMinDistance > selfThreshold) {
    return { matched: false, userId: null, minDistance: selfMinDistance, reason: 'self_no_match' };
  }

  let bestOtherUserId = null;
  let bestOtherDistance = Infinity;

  for (const otherId of Object.keys(allFaces || {})) {
    if (otherId === userId) continue;
    const otherSamples = allFaces[otherId]?.face_descriptor;
    if (!Array.isArray(otherSamples)) continue;

    for (const savedDesc of otherSamples) {
      try {
        const distance = euclideanDistance(savedDesc, descriptor);
        if (distance < bestOtherDistance) {
          bestOtherDistance = distance;
          bestOtherUserId = otherId;
        }
      } catch {
        // bỏ qua
      }
    }
  }

  if (bestOtherUserId && bestOtherDistance < selfMinDistance) {
    return {
      matched: false,
      userId: null,
      minDistance: selfMinDistance,
      reason: 'other_closer',
      otherUserId: bestOtherUserId,
    };
  }

  if (
    bestOtherUserId &&
    bestOtherDistance !== Infinity &&
    bestOtherDistance - selfMinDistance < margin
  ) {
    return { matched: false, userId: null, minDistance: selfMinDistance, reason: 'ambiguous' };
  }

  return { matched: true, userId, minDistance: selfMinDistance };
};
const findFaceMatchForAllUser = (
  descriptor,
  allFaces,
  threshold = FACE_SELF_MATCH_THRESHOLD, // Đổi tên selfThreshold thành threshold vì không còn "self" nữa
  margin = FACE_MATCH_MARGIN
) => {
  // Lưu trữ 2 người có kết quả giống nhất (Top 1 và Top 2)
  let bestMatch = { userId: null, distance: Infinity };
  let secondBestMatch = { userId: null, distance: Infinity };

  // 1. Quét qua toàn bộ user trong Database
  for (const [currentUserId, faceEntry] of Object.entries(allFaces || {})) {
    const savedDescriptors = faceEntry?.face_descriptor;
    
    // Bỏ qua user này nếu không có dữ liệu khuôn mặt hợp lệ
    if (!Array.isArray(savedDescriptors) || savedDescriptors.length === 0) {
      continue;
    }

    // Tìm khoảng cách nhỏ nhất CỦA RIÊNG user đang lặp
    let minDistanceForThisUser = Infinity;
    for (const savedDesc of savedDescriptors) {
      try {
        const distance = euclideanDistance(savedDesc, descriptor);
        if (distance < minDistanceForThisUser) {
          minDistanceForThisUser = distance;
        }
      } catch {
        // bỏ qua descriptor bị lỗi cấu trúc
      }
    }

    // 2. Cập nhật bảng xếp hạng Top 1 và Top 2
    if (minDistanceForThisUser < bestMatch.distance) {
      // Đẩy Top 1 hiện tại xuống làm Top 2
      secondBestMatch = { ...bestMatch };
      // Gán kết quả mới làm Top 1
      bestMatch = { userId: currentUserId, distance: minDistanceForThisUser };
    } else if (minDistanceForThisUser < secondBestMatch.distance) {
      // Nếu không thắng được Top 1 nhưng tốt hơn Top 2 hiện tại, cập nhật Top 2
      secondBestMatch = { userId: currentUserId, distance: minDistanceForThisUser };
    }
  }

  // --- KẾT THÚC VÒNG LẶP, BẮT ĐẦU ĐÁNH GIÁ KẾT QUẢ ---

  // Trường hợp 1: Không tìm thấy ai, hoặc người giống nhất vẫn vượt quá ngưỡng cho phép
  if (!bestMatch.userId || bestMatch.distance > threshold) {
    return { 
      matched: false, 
      userId: null, 
      minDistance: bestMatch.distance, 
      reason: 'no_match' 
    };
  }

  // Trường hợp 2: Có người giống nhất, nhưng người thứ 2 cũng giống gần bằng (khoảng cách < margin)
  // => Hệ thống không dám chắc chắn là ai (ambiguous)
  if (
    secondBestMatch.userId && 
    (secondBestMatch.distance - bestMatch.distance) < margin
  ) {
    return { 
      matched: false, 
      userId: null, 
      minDistance: bestMatch.distance, 
      reason: 'ambiguous',
      candidates: [bestMatch.userId, secondBestMatch.userId] // Trả về cả 2 để tiện debug
    };
  }

  // Trường hợp 3: Hoàn hảo! Tìm thấy 1 người duy nhất thỏa mãn mọi điều kiện
  return { 
    matched: true, 
    userId: bestMatch.userId, 
    minDistance: bestMatch.distance 
  };
};
module.exports = {
  FACE_MATCH_THRESHOLD,
  FACE_SELF_MATCH_THRESHOLD,
  FACE_MATCH_MARGIN,
  euclideanDistance,
  findBestFaceMatch,
  findFaceMatchForAllUser,
  findFaceMatchForUser,
};
