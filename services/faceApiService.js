/**
 * So khớp descriptor khuôn mặt trên server (không dùng face-api.js / camera).
 * Trích xuất mẫu và tải model chỉ chạy trên frontend (public/models).
 */

const FACE_MATCH_THRESHOLD = 0.4;

const euclideanDistance = (a, b) => {
  if (!a || !b || a.length !== 128 || b.length !== 128) {
    throw new Error('Descriptor phải là mảng 128 số.');
  }
  let sum = 0;
  for (let i = 0; i < 128; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
};

/**
 * So khớp descriptor webcam với danh sách mẫu đã lưu.
 * @returns {{ isMatch: boolean, distance: number, bestIndex: number }}
 */
export const matchAgainstSamples = (samples, probe, threshold = FACE_MATCH_THRESHOLD) => {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('Nhân viên chưa có mẫu khuôn mặt.');
  }

  let minDistance = Infinity;
  let bestIndex = -1;

  samples.forEach((sample, index) => {
    const distance = euclideanDistance(sample, probe);
    if (distance < minDistance) {
      minDistance = distance;
      bestIndex = index;
    }
  });

  return {
    isMatch: minDistance < threshold,
    distance: Number(minDistance.toFixed(4)),
    bestIndex,
  };
};

export { FACE_MATCH_THRESHOLD };
