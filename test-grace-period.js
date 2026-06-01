const {
  evaluateCheckIn,
  formatDate,
  parseDateAtTime,
} = require('./utils/shiftUtils');

// Helper to create a date at a specific time
const createTestDate = (dateStr, timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
};

// Test settings: Start at 08:00, grace period 150 min (until 10:30), max late 180 min (until 11:00)
const testSettings = {
  workStartTime: '08:00',
  workEndTime: '17:00',
  lateThreshold: 150,        // Grace period: 15 minutes
  maxLateMinutes: 180,       // Can check in up to 180 minutes late (3 hours after start)
};

// Test date (any date, we use 2024-01-15)
const testDate = '2024-01-15';

const testCases = [
  {
    name: 'Test 1: Check-in at 09:00',
    time: '09:00',
    expectedStatus: 'OnTime',
    expectedLateMinutes: 60,
    description: '1 hour late but within grace period',
  },
  {
    name: 'Test 2: Check-in at 10:30',
    time: '10:30',
    expectedStatus: 'OnTime',
    expectedLateMinutes: 150,
    description: '2.5 hours, at grace period boundary',
  },
  {
    name: 'Test 3: Check-in at 10:45',
    time: '10:45',
    expectedStatus: 'Late',
    expectedLateMinutes: 165,
    description: '2h 45m, 15 minutes after grace period end - should be Late',
  },
  {
    name: 'Test 4: Check-in at 10:46 (CRITICAL TEST)',
    time: '10:46',
    expectedStatus: 'Late',
    expectedLateMinutes: 166,
    description: 'Just past grace period - MUST be 166, NOT 16',
    isCritical: true,
  },
  {
    name: 'Test 5: Check-in at 11:00',
    time: '11:00',
    expectedStatus: 'Late',
    expectedLateMinutes: 180,
    description: '3 hours late, at extended deadline',
  },
  {
    name: 'Test 6: Check-in at 13:00',
    time: '13:00',
    expectedStatus: 'Missing',
    expectedLateMinutes: 300,
    description: '5 hours late, exceeds max late minutes',
    expectNotAllowed: true,
  },
  {
    name: 'Test 7: Check-in at 13:01',
    time: '13:01',
    expectedStatus: 'Missing',
    expectedLateMinutes: 301,
    description: 'After max late window',
    expectNotAllowed: true,
  },
];

console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
console.log('║         GRACE PERIOD CALCULATION TEST - shiftUtils.evaluateCheckIn()           ║');
console.log('╠════════════════════════════════════════════════════════════════════════════════╣');
console.log(`║ Work Start Time:    ${testSettings.workStartTime}                                                      ║`);
console.log(`║ Grace Period:       ${testSettings.lateThreshold} minutes (until 10:30)                                  ║`);
console.log(`║ Max Late Minutes:   ${testSettings.maxLateMinutes} minutes (until 11:00)                                  ║`);
console.log(`║ Test Date:          ${testDate}                                                  ║`);
console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

let passCount = 0;
let failCount = 0;
let criticalFailCount = 0;

testCases.forEach((testCase, index) => {
  const testTime = createTestDate(testDate, testCase.time);
  const result = evaluateCheckIn(testTime, testSettings);

  const statusMatch = result.status === testCase.expectedStatus;
  const lateMinutesMatch = result.lateMinutes === testCase.expectedLateMinutes;
  const allowedMatch = testCase.expectNotAllowed ? !result.allowed : result.allowed;

  const passed = statusMatch && lateMinutesMatch && allowedMatch;

  const statusBg = passed ? '✅ PASS' : '❌ FAIL';
  const criticality = testCase.isCritical ? ' [🔴 CRITICAL]' : '';

  console.log(`\n${statusBg}${criticality} - ${testCase.name}`);
  console.log(`   ${testCase.description}`);
  console.log(`   ├─ Time: ${testCase.time}`);
  console.log(`   ├─ Expected Status: ${testCase.expectedStatus}, Actual: ${result.status}`);
  console.log(`   ├─ Expected Late Minutes: ${testCase.expectedLateMinutes}, Actual: ${result.lateMinutes}`);
  console.log(`   ├─ Expected Allowed: ${!testCase.expectNotAllowed}, Actual: ${result.allowed}`);
  console.log(`   └─ Message: ${result.message}`);

  if (passed) {
    passCount++;
  } else {
    failCount++;
    if (testCase.isCritical) {
      criticalFailCount++;
      console.log(`   ⚠️  CRITICAL FAILURE DETECTED!`);
    }
  }
});

console.log('\n╔════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                            TEST SUMMARY                                        ║');
console.log('╠════════════════════════════════════════════════════════════════════════════════╣');
console.log(`║ Total Tests:        ${testCases.length}`);
console.log(`║ Passed:             ${passCount} ✅`);
console.log(`║ Failed:             ${failCount} ❌`);
if (criticalFailCount > 0) {
  console.log(`║ Critical Failures:  ${criticalFailCount} 🔴`);
}
console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

if (criticalFailCount > 0) {
  console.log('🔴 CRITICAL TEST FAILED - Late minutes NOT calculated from original start time!');
  process.exit(1);
} else if (failCount === 0) {
  console.log('✅ ALL TESTS PASSED - Grace period logic is correct!');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILED - See details above');
  process.exit(1);
}
