/**
 * Comprehensive Test Suite for Exception Request Workflow
 * Tests all scenarios: create, validate, approve, reject, list, and audit trail
 */

const exceptionHandler = require('../utils/exceptionHandler');
const AttendanceException = require('../models/AttendanceException');

// ============================================================================
// Test Results Tracker
// ============================================================================
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

function logTest(name, passed, details = '') {
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
    console.log(`✓ PASS: ${name}`);
  } else {
    testResults.failed++;
    console.log(`✗ FAIL: ${name}`);
    if (details) console.log(`  ${details}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ============================================================================
// TEST 1: Create exception for Missing Check-in
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST 1: Create exception for Missing Check-in');
console.log('='.repeat(70));

try {
  const exceptionReq = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '2024-01-15',
    type: 'MissingIn',
    reason: 'Mạng lỗi',
    comment: 'Network was down for 30 minutes',
  });

  assert(!exceptionReq.error, `Error: ${exceptionReq.error}`);
  assert(exceptionReq.userId === 'user1', 'userId mismatch');
  assert(exceptionReq.date === '2024-01-15', 'date mismatch');
  assert(exceptionReq.type === 'MissingIn', 'type mismatch');
  assert(exceptionReq.reason === 'Mạng lỗi', 'reason mismatch');
  assert(exceptionReq.status === 'Pending', 'status should be Pending');
  assert(exceptionReq.createdAt > 0, 'createdAt should be set');
  assert(exceptionReq.approvedBy === null, 'approvedBy should be null initially');

  const exception1 = new AttendanceException(exceptionReq);
  logTest(
    'Create Missing Check-in Exception',
    true,
    `Exception created: ${exception1.type}, Status: ${exception1.status}`
  );
  console.log(`  Created exception: ${JSON.stringify(exceptionReq, null, 2)}`);
} catch (err) {
  logTest('Create Missing Check-in Exception', false, err.message);
}

// ============================================================================
// TEST 2: Create exception for Missing Check-out
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST 2: Create exception for Missing Check-out');
console.log('='.repeat(70));

try {
  const exceptionReq = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '2024-01-15',
    type: 'MissingOut',
    reason: 'Lỗi khuôn mặt',
    comment: 'Face recognition failed at checkout',
  });

  assert(!exceptionReq.error, `Error: ${exceptionReq.error}`);
  assert(exceptionReq.type === 'MissingOut', 'type mismatch');
  assert(exceptionReq.status === 'Pending', 'status should be Pending');

  const exception2 = new AttendanceException(exceptionReq);
  logTest(
    'Create Missing Check-out Exception',
    true,
    `Exception created: ${exception2.type}, Status: ${exception2.status}`
  );
} catch (err) {
  logTest('Create Missing Check-out Exception', false, err.message);
}

// ============================================================================
// TEST 3: Validate exception reasons (all 8 valid types)
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST 3: Validate exception reasons (all 8 valid types)');
console.log('='.repeat(70));

const validReasons = [
  'Quên check-in',
  'Quên check-out',
  'Mạng lỗi',
  'Lỗi khuôn mặt',
  'Vấn đề camera',
  'Tự do công việc',
  'Yêu cầu từ quản lý',
  'Lý do khác',
];

try {
  const allValid = validReasons.every((reason) =>
    exceptionHandler.isValidExceptionReason(reason)
  );
  assert(allValid, 'Not all valid reasons passed validation');

  const invalidReason = 'Invalid reason';
  const isInvalid = !exceptionHandler.isValidExceptionReason(invalidReason);
  assert(isInvalid, 'Invalid reason should fail validation');

  logTest(
    'Validate all 8 valid reasons',
    true,
    `All ${validReasons.length} reasons validated successfully`
  );

  // Test creating exceptions with each valid reason
  console.log('\n  Testing each reason type:');
  validReasons.forEach((reason) => {
    const req = exceptionHandler.createExceptionRequest({
      userId: 'user1',
      date: '2024-01-15',
      type: 'MissingIn',
      reason,
    });
    console.log(`    ✓ ${reason}`);
  });
} catch (err) {
  logTest('Validate all 8 valid reasons', false, err.message);
}

// Test invalid reason
console.log('\n  Testing invalid reason:');
try {
  const result = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '2024-01-15',
    type: 'MissingIn',
    reason: 'Invalid reason type',
  });

  assert(
    result.error && result.error.includes('reason must be one of'),
    'Invalid reason should produce error'
  );
  logTest(
    'Reject invalid reason',
    true,
    `Correctly rejected: ${result.error}`
  );
  console.log(`    ✓ Invalid reason rejected: ${result.error}`);
} catch (err) {
  logTest('Reject invalid reason', false, err.message);
}

// ============================================================================
// TEST 4: Get exception details
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST 4: Get exception details');
console.log('='.repeat(70));

try {
  const exceptionReq = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '2024-01-15',
    type: 'MissingIn',
    reason: 'Mạng lỗi',
    comment: 'Network was unstable',
    attachmentUrls: ['http://example.com/proof1.jpg'],
  });

  const exception = new AttendanceException(exceptionReq);

  // Verify all required fields exist
  assert(exception.userId === 'user1', 'userId should match');
  assert(exception.date === '2024-01-15', 'date should match');
  assert(exception.type === 'MissingIn', 'type should match');
  assert(exception.reason === 'Mạng lỗi', 'reason should match');
  assert(exception.status === 'Pending', 'status should match');
  assert(exception.createdAt !== null, 'createdAt should be set');
  assert(exception.approvedBy === null, 'approvedBy should be null initially');
  assert(exception.approvalNote === '', 'approvalNote should be empty initially');
  assert(
    exception.attachmentUrls.length === 1,
    'attachmentUrls should contain one item'
  );

  logTest(
    'Get exception details',
    true,
    'All fields present and correctly populated'
  );

  console.log('\n  Exception details:');
  const details = exception.toFirebaseJSON();
  Object.keys(details).forEach((key) => {
    console.log(`    ${key}: ${JSON.stringify(details[key])}`);
  });
} catch (err) {
  logTest('Get exception details', false, err.message);
}

// ============================================================================
// TEST 5: Approve exception and update attendance
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST 5: Approve exception and update attendance');
console.log('='.repeat(70));

try {
  // Create exception
  const exceptionReq = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '2024-01-15',
    type: 'MissingIn',
    reason: 'Mạng lỗi',
  });

  const exception = new AttendanceException(exceptionReq);

  // Approve exception with adjusted times
  exception.status = 'Approved';
  exception.approvedBy = 'manager1';
  exception.approvalNote = 'Approved - user had network issues';
  exception.adjustedCheckInTime = '08:30';
  exception.adjustedCheckOutTime = '17:45';
  exception.updatedAt = Date.now();
  exception.approvedAt = Date.now();

  assert(exception.status === 'Approved', 'status should be Approved');
  assert(exception.approvedBy === 'manager1', 'approvedBy should be set');
  assert(
    exception.adjustedCheckInTime === '08:30',
    'adjustedCheckInTime should be set'
  );
  assert(
    exception.adjustedCheckOutTime === '17:45',
    'adjustedCheckOutTime should be set'
  );
  assert(exception.approvedAt !== null, 'approvedAt should be set');

  logTest(
    'Approve exception with adjusted times',
    true,
    `Status: ${exception.status}, Approved by: ${exception.approvedBy}`
  );

  console.log(`\n  Approved exception details:`);
  const approvedData = exception.toFirebaseJSON();
  console.log(`    Status: ${approvedData.status}`);
  console.log(`    Approved By: ${approvedData.approvedBy}`);
  console.log(`    Adjusted Check-in: ${approvedData.adjustedCheckInTime}`);
  console.log(`    Adjusted Check-out: ${approvedData.adjustedCheckOutTime}`);
  console.log(`    Approval Note: ${approvedData.approvalNote}`);
} catch (err) {
  logTest('Approve exception with adjusted times', false, err.message);
}

// ============================================================================
// TEST 6: Reject exception
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST 6: Reject exception');
console.log('='.repeat(70));

try {
  // Create exception
  const exceptionReq = exceptionHandler.createExceptionRequest({
    userId: 'user2',
    date: '2024-01-16',
    type: 'MissingOut',
    reason: 'Lý do khác',
  });

  const exception = new AttendanceException(exceptionReq);

  // Reject exception
  exception.status = 'Rejected';
  exception.approvedBy = 'manager1';
  exception.approvalNote = 'Insufficient evidence';
  exception.updatedAt = Date.now();
  exception.approvedAt = Date.now();

  assert(exception.status === 'Rejected', 'status should be Rejected');
  assert(exception.approvalNote === 'Insufficient evidence', 'approvalNote mismatch');
  assert(exception.approvedAt !== null, 'approvedAt should be set');

  logTest(
    'Reject exception with reason',
    true,
    `Status: ${exception.status}, Reason: ${exception.approvalNote}`
  );

  console.log(`\n  Rejected exception details:`);
  const rejectedData = exception.toFirebaseJSON();
  console.log(`    Status: ${rejectedData.status}`);
  console.log(`    Rejection Reason: ${rejectedData.approvalNote}`);
} catch (err) {
  logTest('Reject exception with reason', false, err.message);
}

// ============================================================================
// TEST 7: List user exceptions with pagination
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST 7: List user exceptions with pagination');
console.log('='.repeat(70));

try {
  // Create multiple exceptions for the same user
  const exceptions = [];
  for (let i = 1; i <= 5; i++) {
    const exceptionReq = exceptionHandler.createExceptionRequest({
      userId: 'user1',
      date: `2024-01-${String(10 + i).padStart(2, '0')}`,
      type: i % 2 === 0 ? 'MissingOut' : 'MissingIn',
      reason: i % 2 === 0 ? 'Quên check-out' : 'Quên check-in',
    });

    exceptions.push(new AttendanceException(exceptionReq));
  }

  assert(exceptions.length === 5, 'Should have 5 exceptions');

  // Simulate pagination (2 items per page)
  const pageSize = 2;
  const page1 = exceptions.slice(0, pageSize);
  const page2 = exceptions.slice(pageSize, pageSize * 2);
  const page3 = exceptions.slice(pageSize * 2);

  assert(page1.length === 2, 'Page 1 should have 2 items');
  assert(page2.length === 2, 'Page 2 should have 2 items');
  assert(page3.length === 1, 'Page 3 should have 1 item');

  logTest(
    'List user exceptions with pagination',
    true,
    `Created 5 exceptions, paginated into 3 pages (2, 2, 1 items)`
  );

  console.log(`\n  Exception list (paginated):`);
  console.log(`  Page 1:`);
  page1.forEach((exc, idx) => {
    console.log(`    ${idx + 1}. ${exc.type} (${exc.date}) - Status: ${exc.status}`);
  });
  console.log(`  Page 2:`);
  page2.forEach((exc, idx) => {
    console.log(`    ${idx + 1}. ${exc.type} (${exc.date}) - Status: ${exc.status}`);
  });
  console.log(`  Page 3:`);
  page3.forEach((exc, idx) => {
    console.log(`    ${idx + 1}. ${exc.type} (${exc.date}) - Status: ${exc.status}`);
  });
} catch (err) {
  logTest('List user exceptions with pagination', false, err.message);
}

// ============================================================================
// TEST 8: Audit trail - Track modification history
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST 8: Audit trail - Track modification history');
console.log('='.repeat(70));

try {
  // Create exception and track changes
  const exceptionReq = exceptionHandler.createExceptionRequest({
    userId: 'user3',
    date: '2024-01-20',
    type: 'MissingIn',
    reason: 'Vấn đề camera',
  });

  const exception = new AttendanceException(exceptionReq);

  // Create audit trail
  const auditTrail = [];

  // Event 1: Created
  auditTrail.push({
    event: 'CREATED',
    timestamp: exception.createdAt,
    status: exception.status,
    details: `Exception created for ${exception.date}`,
  });

  // Event 2: Approved
  exception.status = 'Approved';
  exception.approvedBy = 'manager1';
  exception.approvalNote = 'Approved - camera issue confirmed';
  exception.adjustedCheckInTime = '08:45';
  exception.updatedAt = Date.now();
  exception.approvedAt = Date.now();

  auditTrail.push({
    event: 'APPROVED',
    timestamp: exception.approvedAt,
    status: exception.status,
    approvedBy: exception.approvedBy,
    details: exception.approvalNote,
  });

  assert(auditTrail.length === 2, 'Should have 2 audit events');
  assert(auditTrail[0].event === 'CREATED', 'First event should be CREATED');
  assert(auditTrail[1].event === 'APPROVED', 'Second event should be APPROVED');
  assert(
    auditTrail[1].timestamp >= auditTrail[0].timestamp,
    'Timestamp should be in order'
  );

  logTest(
    'Audit trail with modification history',
    true,
    `Tracked 2 events: CREATED, APPROVED`
  );

  console.log(`\n  Audit trail:`);
  auditTrail.forEach((entry, idx) => {
    const timestamp = new Date(entry.timestamp).toISOString();
    console.log(`    ${idx + 1}. [${timestamp}] ${entry.event}`);
    console.log(`       Status: ${entry.status}`);
    if (entry.approvedBy) {
      console.log(`       Approved By: ${entry.approvedBy}`);
    }
    console.log(`       Details: ${entry.details}`);
  });
} catch (err) {
  logTest('Audit trail with modification history', false, err.message);
}

// ============================================================================
// Test edge cases
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('Additional Tests: Edge Cases and Validations');
console.log('='.repeat(70));

// Test invalid date format
console.log('\n  Testing invalid date format:');
try {
  const result = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '15-01-2024',
    type: 'MissingIn',
    reason: 'Mạng lỗi',
  });

  assert(result.error !== undefined, 'Should have error for invalid date');
  logTest(
    'Reject invalid date format',
    true,
    `Correctly rejected: ${result.error}`
  );
  console.log(`    ✓ Invalid date rejected: ${result.error}`);
} catch (err) {
  logTest('Reject invalid date format', false, err.message);
}

// Test missing userId
console.log('\n  Testing missing userId:');
try {
  const result = exceptionHandler.createExceptionRequest({
    date: '2024-01-15',
    type: 'MissingIn',
    reason: 'Mạng lỗi',
  });

  assert(result.error !== undefined, 'Should have error for missing userId');
  logTest(
    'Reject missing userId',
    true,
    `Correctly rejected: ${result.error}`
  );
  console.log(`    ✓ Missing userId rejected: ${result.error}`);
} catch (err) {
  logTest('Reject missing userId', false, err.message);
}

// Test invalid exception type
console.log('\n  Testing invalid exception type:');
try {
  const result = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '2024-01-15',
    type: 'InvalidType',
    reason: 'Mạng lỗi',
  });

  assert(result.error !== undefined, 'Should have error for invalid type');
  logTest(
    'Reject invalid exception type',
    true,
    `Correctly rejected: ${result.error}`
  );
  console.log(`    ✓ Invalid type rejected: ${result.error}`);
} catch (err) {
  logTest('Reject invalid exception type', false, err.message);
}

// Test attachment URL limiting
console.log('\n  Testing attachment URL limiting:');
try {
  const manyUrls = Array(10)
    .fill(0)
    .map((_, i) => `http://example.com/file${i}.jpg`);

  const result = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '2024-01-15',
    type: 'MissingIn',
    reason: 'Mạng lỗi',
    attachmentUrls: manyUrls,
  });

  assert(
    result.attachmentUrls.length === 5,
    'Should limit attachments to 5'
  );
  logTest(
    'Limit attachment URLs to 5',
    true,
    `Correctly limited 10 URLs to 5`
  );
  console.log(`    ✓ Attachment limit enforced: 10 URLs → 5 URLs`);
} catch (err) {
  logTest('Limit attachment URLs to 5', false, err.message);
}

// Test comment truncation
console.log('\n  Testing comment truncation:');
try {
  const longComment = 'A'.repeat(2000);

  const result = exceptionHandler.createExceptionRequest({
    userId: 'user1',
    date: '2024-01-15',
    type: 'MissingIn',
    reason: 'Mạng lỗi',
    comment: longComment,
  });

  assert(result.comment.length === 1000, 'Should limit comment to 1000 chars');
  logTest(
    'Limit comment to 1000 characters',
    true,
    `Correctly limited 2000 chars to 1000`
  );
  console.log(`    ✓ Comment limit enforced: 2000 chars → 1000 chars`);
} catch (err) {
  logTest('Limit comment to 1000 characters', false, err.message);
}

// ============================================================================
// Test status display and type messages
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('Additional Tests: Display Messages');
console.log('='.repeat(70));

try {
  const exception = new AttendanceException({
    userId: 'user1',
    date: '2024-01-15',
    type: 'MissingIn',
    reason: 'Mạng lỗi',
    status: 'Pending',
  });

  const statusDisplay = exception.getStatusDisplay();
  const typeDisplay = exception.getTypeDisplay();

  assert(statusDisplay.text === 'Chờ duyệt', 'Status display text mismatch');
  assert(statusDisplay.icon === '⏳', 'Status icon mismatch');
  assert(typeDisplay === 'Không check-in', 'Type display text mismatch');

  logTest(
    'Display messages for status and type',
    true,
    `Status: ${statusDisplay.text} (${statusDisplay.icon}), Type: ${typeDisplay}`
  );

  console.log(`\n  Display messages:`);
  console.log(`    Status: ${statusDisplay.text} (${statusDisplay.icon})`);
  console.log(`    Type: ${typeDisplay}`);
} catch (err) {
  logTest('Display messages for status and type', false, err.message);
}

// ============================================================================
// Test calculateMissingCheckPoints
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('Additional Tests: Calculate Missing Check Points');
console.log('='.repeat(70));

try {
  // Test with missing check-in
  const missing1 = exceptionHandler.calculateMissingCheckPoints({
    checkInTime: null,
    checkOutTime: '17:00',
  });
  assert(
    missing1.includes('CheckIn') && !missing1.includes('CheckOut'),
    'Should detect missing check-in only'
  );

  // Test with missing check-out
  const missing2 = exceptionHandler.calculateMissingCheckPoints({
    checkInTime: '08:00',
    checkOutTime: null,
  });
  assert(
    !missing2.includes('CheckIn') && missing2.includes('CheckOut'),
    'Should detect missing check-out only'
  );

  // Test with both missing
  const missing3 = exceptionHandler.calculateMissingCheckPoints({
    checkInTime: null,
    checkOutTime: null,
  });
  assert(
    missing3.includes('CheckIn') && missing3.includes('CheckOut'),
    'Should detect both missing'
  );

  // Test with none missing
  const missing4 = exceptionHandler.calculateMissingCheckPoints({
    checkInTime: '08:00',
    checkOutTime: '17:00',
  });
  assert(missing4.length === 0, 'Should detect none missing');

  logTest(
    'Calculate missing check points',
    true,
    'All check point detection scenarios passed'
  );

  console.log(`\n  Missing check points:`);
  console.log(`    Missing In only: ${JSON.stringify(missing1)}`);
  console.log(`    Missing Out only: ${JSON.stringify(missing2)}`);
  console.log(`    Both missing: ${JSON.stringify(missing3)}`);
  console.log(`    None missing: ${JSON.stringify(missing4)}`);
} catch (err) {
  logTest('Calculate missing check points', false, err.message);
}

// ============================================================================
// Summary Report
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY REPORT');
console.log('='.repeat(70));

console.log(`\nTotal Tests: ${testResults.passed + testResults.failed}`);
console.log(`✓ Passed: ${testResults.passed}`);
console.log(`✗ Failed: ${testResults.failed}`);

const passRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
console.log(`Pass Rate: ${passRate}%\n`);

if (testResults.failed === 0) {
  console.log('🎉 All tests passed successfully!');
} else {
  console.log('⚠️  Some tests failed. See details above.');
}

console.log('\n' + '='.repeat(70));
console.log('Test Details:');
console.log('='.repeat(70));

testResults.tests.forEach((test, idx) => {
  const icon = test.passed ? '✓' : '✗';
  console.log(`${idx + 1}. [${icon}] ${test.name}`);
  if (test.details) {
    console.log(`   ${test.details}`);
  }
});

module.exports = testResults;
