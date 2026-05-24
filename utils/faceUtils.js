const FACE_MATCH_THRESHOLD = 0.4;
const FACE_MATCH_MARGIN = 0.08;
/** Ngưỡng so khớp với mẫu của chính user đang đăng nhập (hơi nới vì điều kiện ánh sáng khác lúc đăng ký). */
const FACE_SELF_MATCH_THRESHOLD = 0.45;

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

module.exports = {
  FACE_MATCH_THRESHOLD,
  FACE_SELF_MATCH_THRESHOLD,
  FACE_MATCH_MARGIN,
  euclideanDistance,
  findBestFaceMatch,
  findFaceMatchForUser,
};
