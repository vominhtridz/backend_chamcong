const FACE_MATCH_THRESHOLD = 0.4;
const FACE_MATCH_MARGIN = 0.08;

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

module.exports = {
  FACE_MATCH_THRESHOLD,
  euclideanDistance,
  findBestFaceMatch,
};
