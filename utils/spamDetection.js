/**
 * Spam Detection Utility
 * Handles detection and filtering of multiple check-ins/outs within short time windows
 * Rule: First in, Last out within 3-minute window
 */

const SPAM_WINDOW_MS = 3 * 60 * 1000; // 3 minutes in milliseconds

/**
 * Check if timestamp is within spam window of reference time
 * @param {number} timestamp - Timestamp to check (ms)
 * @param {number} referenceTime - Reference timestamp (ms)
 * @returns {boolean}
 */
const isWithinSpamWindow = (timestamp, referenceTime) => {
  const diff = Math.abs(timestamp - referenceTime);
  return diff <= SPAM_WINDOW_MS;
};

/**
 * Filter spam check-ins: Keep only first (earliest) within 3-min window
 * @param {Array<object>} attempts - Array of check-in records with timestamps
 * @returns {object} - First valid check-in or null
 */
const getFirstValidCheckIn = (attempts = []) => {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return null;
  }

  // Sort by timestamp ascending
  const sorted = [...attempts].sort((a, b) => a.timestamp - b.timestamp);
  
  // Get the earliest one
  const first = sorted[0];
  if (!first) return null;

  // Find all within 3-min window of first
  const group = sorted.filter(att => isWithinSpamWindow(att.timestamp, first.timestamp));

  // Return the earliest from this group
  return group[0] || null;
};

/**
 * Filter spam check-outs: Keep only last (latest) within 3-min window
 * @param {Array<object>} attempts - Array of check-out records with timestamps
 * @returns {object} - Last valid check-out or null
 */
const getLastValidCheckOut = (attempts = []) => {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return null;
  }

  // Sort by timestamp descending
  const sorted = [...attempts].sort((a, b) => b.timestamp - a.timestamp);

  // Get the latest one
  const last = sorted[0];
  if (!last) return null;

  // Find all within 3-min window of last
  const group = sorted.filter(att => isWithinSpamWindow(att.timestamp, last.timestamp));

  // Return the latest from this group
  return group.sort((a, b) => b.timestamp - a.timestamp)[0] || null;
};

/**
 * Aggregate check-in attempts and detect spam
 * @param {Array<object>} attempts - Raw check-in attempts
 * @returns {object} - { spamDetected, validCount, filteredAttempts, selectedCheckIn }
 */
const filterSpamCheckins = (attempts = []) => {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return {
      spamDetected: false,
      validCount: 0,
      filteredAttempts: [],
      selectedCheckIn: null,
    };
  }

  const spamDetected = attempts.length > 1;
  const selectedCheckIn = getFirstValidCheckIn(attempts);

  return {
    spamDetected,
    validCount: attempts.length,
    filteredAttempts: attempts,
    selectedCheckIn,
  };
};

/**
 * Aggregate check-out attempts and detect spam
 * @param {Array<object>} attempts - Raw check-out attempts
 * @returns {object} - { spamDetected, validCount, filteredAttempts, selectedCheckOut }
 */
const filterSpamCheckouts = (attempts = []) => {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return {
      spamDetected: false,
      validCount: 0,
      filteredAttempts: [],
      selectedCheckOut: null,
    };
  }

  const spamDetected = attempts.length > 1;
  const selectedCheckOut = getLastValidCheckOut(attempts);

  return {
    spamDetected,
    validCount: attempts.length,
    filteredAttempts: attempts,
    selectedCheckOut,
  };
};

/**
 * Get all attempts for a user on a specific date within time range
 * Typically called with 3-5 minute window to detect spam
 * @param {number} targetTime - Target timestamp
 * @param {number} windowMs - Time window in milliseconds (default 3 minutes)
 * @param {Array<object>} allRecords - All attendance records
 * @param {string} userId - User ID to filter
 * @param {string} date - Shift date (YYYY-MM-DD)
 * @param {string} type - 'checkin' or 'checkout'
 * @returns {Array<object>} - Matching attempts sorted by time
 */
const getAttemptsInWindow = (targetTime, windowMs = SPAM_WINDOW_MS, allRecords = [], userId, date, type = 'checkin') => {
  if (!allRecords.length) return [];

  const timeField = type === 'checkin' ? 'checkInTime' : 'checkOutTime';
  const results = [];

  allRecords.forEach(record => {
    if (record.userId !== userId || record.date !== date) return;
    if (!record[timeField]) return;

    const recordTime = record[timeField];
    if (Math.abs(recordTime - targetTime) <= windowMs) {
      results.push({
        timestamp: recordTime,
        record,
      });
    }
  });

  return results.sort((a, b) => a.timestamp - b.timestamp);
};

module.exports = {
  SPAM_WINDOW_MS,
  isWithinSpamWindow,
  getFirstValidCheckIn,
  getLastValidCheckOut,
  filterSpamCheckins,
  filterSpamCheckouts,
  getAttemptsInWindow,
};
