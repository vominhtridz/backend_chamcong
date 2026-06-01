/**
 * Test suite for spam detection logic
 * Tests all scenarios for filterSpamCheckins() and filterSpamCheckouts()
 */

const {
  filterSpamCheckins,
  filterSpamCheckouts,
  SPAM_WINDOW_MS,
} = require('./spamDetection');

// Helper to convert time string (HH:MM:SS) to milliseconds for today
const timeToMs = (timeStr) => {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return date.getTime();
};

// Helper to format milliseconds back to time string
const msToTime = (ms) => {
  const date = new Date(ms);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

// Helper to create timestamp objects
const createAttempt = (timeStr) => ({
  timestamp: timeToMs(timeStr),
  time: timeStr,
});

// Test results tracker
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    results.push(`✓ ${message}`);
  } else {
    failed++;
    results.push(`✗ ${message}`);
  }
}

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║       SPAM DETECTION TEST SUITE - Check-In Logic              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');

// =====================================================================
// CHECK-IN TESTS (Keep FIRST within 3-minute window)
// =====================================================================

console.log('\n--- SCENARIO 1: Single check-in (no spam) ---');
const test1 = filterSpamCheckins([createAttempt('10:30:00')]);
assert(!test1.spamDetected, 'Single check-in should have spamDetected=false');
assert(test1.selectedCheckIn !== null, 'Single check-in should return a valid selection');
assert(test1.validCount === 1, 'validCount should be 1');
assert(msToTime(test1.selectedCheckIn.timestamp) === '10:30:00', 'Selected time should be 10:30:00');
console.log(`  Result: spamDetected=${test1.spamDetected}, selected=${msToTime(test1.selectedCheckIn.timestamp)}`);

console.log('\n--- SCENARIO 2: Two check-ins within 3 minutes ---');
const test2 = filterSpamCheckins([
  createAttempt('10:30:00'),
  createAttempt('10:30:30'),
]);
assert(test2.spamDetected, 'Two check-ins within 3 min should have spamDetected=true');
assert(test2.validCount === 2, 'validCount should be 2');
assert(msToTime(test2.selectedCheckIn.timestamp) === '10:30:00', 'Should keep earliest (10:30:00)');
console.log(`  Result: spamDetected=${test2.spamDetected}, selected=${msToTime(test2.selectedCheckIn.timestamp)}, validCount=${test2.validCount}`);

console.log('\n--- SCENARIO 3: Multiple check-ins in sequence ---');
const test3 = filterSpamCheckins([
  createAttempt('10:30:00'),
  createAttempt('10:30:15'),
  createAttempt('10:30:45'),
  createAttempt('10:31:20'),
  createAttempt('10:31:55'),
]);
assert(test3.spamDetected, 'Multiple check-ins should have spamDetected=true');
assert(test3.validCount === 5, 'validCount should be 5');
assert(msToTime(test3.selectedCheckIn.timestamp) === '10:30:00', 'Should keep earliest (10:30:00)');
console.log(`  Result: spamDetected=${test3.spamDetected}, selected=${msToTime(test3.selectedCheckIn.timestamp)}, validCount=${test3.validCount}`);

console.log('\n--- SCENARIO 4: Check-ins outside 3-minute window ---');
const test4 = filterSpamCheckins([
  createAttempt('10:30:00'),
  createAttempt('10:34:00'),
]);
assert(test4.spamDetected, 'Multiple attempts (even outside window) should have spamDetected=true');
assert(test4.validCount === 2, 'validCount should be 2');
assert(msToTime(test4.selectedCheckIn.timestamp) === '10:30:00', 'Should select earliest time (first overall)');
console.log(`  Result: spamDetected=${test4.spamDetected}, selected=${msToTime(test4.selectedCheckIn.timestamp)}`);
console.log('  Note: getFirstValidCheckIn() groups by 3-min window around earliest');

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║       SPAM DETECTION TEST SUITE - Check-Out Logic             ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');

// =====================================================================
// CHECK-OUT TESTS (Keep LAST within 3-minute window)
// =====================================================================

console.log('\n--- SCENARIO 5: Single check-out (no spam) ---');
const test5 = filterSpamCheckouts([createAttempt('17:45:00')]);
assert(!test5.spamDetected, 'Single check-out should have spamDetected=false');
assert(test5.selectedCheckOut !== null, 'Single check-out should return a valid selection');
assert(test5.validCount === 1, 'validCount should be 1');
assert(msToTime(test5.selectedCheckOut.timestamp) === '17:45:00', 'Selected time should be 17:45:00');
console.log(`  Result: spamDetected=${test5.spamDetected}, selected=${msToTime(test5.selectedCheckOut.timestamp)}`);

console.log('\n--- SCENARIO 6: Multiple check-outs - keep LAST ---');
const test6 = filterSpamCheckouts([
  createAttempt('17:45:00'),
  createAttempt('17:45:20'),
  createAttempt('17:46:10'),
]);
assert(test6.spamDetected, 'Multiple check-outs should have spamDetected=true');
assert(test6.validCount === 3, 'validCount should be 3');
assert(msToTime(test6.selectedCheckOut.timestamp) === '17:46:10', 'Should keep latest (17:46:10)');
console.log(`  Result: spamDetected=${test6.spamDetected}, selected=${msToTime(test6.selectedCheckOut.timestamp)}, validCount=${test6.validCount}`);

console.log('\n--- SCENARIO 7: Check-out within strict 3-min window ---');
const test7 = filterSpamCheckouts([
  createAttempt('17:45:00'),
  createAttempt('17:47:59'),
]);
assert(test7.spamDetected, 'Two check-outs within 3 min should have spamDetected=true');
assert(msToTime(test7.selectedCheckOut.timestamp) === '17:47:59', 'Should keep latest within window');
console.log(`  Result: spamDetected=${test7.spamDetected}, selected=${msToTime(test7.selectedCheckOut.timestamp)}`);

console.log('\n--- SCENARIO 8: Check-out outside 3-minute window ---');
const test8 = filterSpamCheckouts([
  createAttempt('17:45:00'),
  createAttempt('17:50:00'),
]);
assert(test8.spamDetected, 'Multiple attempts should have spamDetected=true');
assert(msToTime(test8.selectedCheckOut.timestamp) === '17:50:00', 'Should select latest (last overall)');
console.log(`  Result: spamDetected=${test8.spamDetected}, selected=${msToTime(test8.selectedCheckOut.timestamp)}`);
console.log('  Note: getLastValidCheckOut() groups by 3-min window around latest');

// =====================================================================
// EDGE CASES
// =====================================================================

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║              EDGE CASES & BOUNDARY TESTS                      ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');

console.log('\n--- EDGE CASE 1: Empty array ---');
const testE1c = filterSpamCheckins([]);
assert(!testE1c.spamDetected, 'Empty check-ins should have spamDetected=false');
assert(testE1c.selectedCheckIn === null, 'Empty check-ins should return null');
console.log(`  Check-in result: spamDetected=${testE1c.spamDetected}, selected=${testE1c.selectedCheckIn}`);

const testE1o = filterSpamCheckouts([]);
assert(!testE1o.spamDetected, 'Empty check-outs should have spamDetected=false');
assert(testE1o.selectedCheckOut === null, 'Empty check-outs should return null');
console.log(`  Check-out result: spamDetected=${testE1o.spamDetected}, selected=${testE1o.selectedCheckOut}`);

console.log('\n--- EDGE CASE 2: Exactly at 3-minute boundary ---');
const test3min = filterSpamCheckins([
  createAttempt('10:30:00'),
  createAttempt('10:33:00'), // exactly 180 seconds = 3 minutes
]);
assert(test3min.spamDetected, 'Two check-ins at exact 3-min boundary should have spamDetected=true');
assert(msToTime(test3min.selectedCheckIn.timestamp) === '10:30:00', 'Should keep earliest');
console.log(`  Result: spamDetected=${test3min.spamDetected}, selected=${msToTime(test3min.selectedCheckIn.timestamp)}`);

console.log('\n--- EDGE CASE 3: Just outside 3-minute boundary ---');
const testBeyond3min = filterSpamCheckins([
  createAttempt('10:30:00'),
  createAttempt('10:33:01'), // 181 seconds = beyond 3 minutes
]);
assert(testBeyond3min.spamDetected, 'Multiple attempts detected');
assert(msToTime(testBeyond3min.selectedCheckIn.timestamp) === '10:30:00', 'Should select first');
console.log(`  Result: spamDetected=${testBeyond3min.spamDetected}, selected=${msToTime(testBeyond3min.selectedCheckIn.timestamp)}`);

console.log('\n--- EDGE CASE 4: Unordered input ---');
const testUnordered = filterSpamCheckins([
  createAttempt('10:30:45'),
  createAttempt('10:30:00'),
  createAttempt('10:30:15'),
]);
assert(testUnordered.spamDetected, 'Unordered input should be detected as spam');
assert(msToTime(testUnordered.selectedCheckIn.timestamp) === '10:30:00', 'Should select earliest regardless of input order');
console.log(`  Result: spamDetected=${testUnordered.spamDetected}, selected=${msToTime(testUnordered.selectedCheckIn.timestamp)}`);

// =====================================================================
// SUMMARY
// =====================================================================

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                      TEST SUMMARY                             ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

results.forEach(r => console.log(r));

console.log(`\n${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!');
  process.exit(1);
}
