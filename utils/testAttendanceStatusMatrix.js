const { getAttendanceStatusMatrix } = require('./shiftUtils');

console.log('=== Testing getAttendanceStatusMatrix() ===\n');

// Helper to print test results
const runTest = (testNum, testName, attendance, settings, expectedResults) => {
  console.log(`Test ${testNum}: ${testName}`);
  console.log('Input:', JSON.stringify(attendance, null, 2));
  
  const result = getAttendanceStatusMatrix(attendance, settings);
  
  console.log('Output:', JSON.stringify(result, null, 2));
  
  // Validate results
  const errors = [];
  if (result.dayStatus !== expectedResults.dayStatus) {
    errors.push(`❌ dayStatus: expected '${expectedResults.dayStatus}', got '${result.dayStatus}'`);
  } else {
    console.log(`✓ dayStatus: ${result.dayStatus}`);
  }
  
  if (result.color !== expectedResults.color) {
    errors.push(`❌ color: expected '${expectedResults.color}', got '${result.color}'`);
  } else {
    console.log(`✓ color: ${result.color}`);
  }
  
  // Check reasons array
  const expectedReasons = expectedResults.reasons || [];
  if (result.reasons.length !== expectedReasons.length) {
    errors.push(`❌ reasons length: expected ${expectedReasons.length}, got ${result.reasons.length}`);
  } else if (expectedReasons.length === 0 && result.reasons.length === 0) {
    console.log('✓ reasons: empty (as expected)');
  } else {
    console.log(`✓ reasons count: ${result.reasons.length}`);
  }
  
  // Detailed reason validation
  expectedReasons.forEach((expectedReason, idx) => {
    const actualReason = result.reasons[idx];
    if (expectedReason === 'partial') {
      // For flexible matching like "Đi trễ" (without specific minutes)
      if (actualReason?.includes('Đi trễ')) {
        console.log(`  ✓ reasons[${idx}]: contains "Đi trễ"`);
      } else {
        errors.push(`  ❌ reasons[${idx}]: expected to contain "Đi trễ", got "${actualReason}"`);
      }
    } else if (expectedReason === 'early-partial') {
      if (actualReason?.includes('Về sớm')) {
        console.log(`  ✓ reasons[${idx}]: contains "Về sớm"`);
      } else {
        errors.push(`  ❌ reasons[${idx}]: expected to contain "Về sớm", got "${actualReason}"`);
      }
    } else {
      if (actualReason === expectedReason) {
        console.log(`  ✓ reasons[${idx}]: "${actualReason}"`);
      } else {
        errors.push(`  ❌ reasons[${idx}]: expected "${expectedReason}", got "${actualReason}"`);
      }
    }
  });
  
  if (errors.length > 0) {
    console.log('\nERRORS:');
    errors.forEach(e => console.log(e));
  } else {
    console.log('\n✓ All checks passed!');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
};

// Test 1: Valid day (perfect)
runTest(
  1,
  'Valid day (perfect) - On-time check-in AND On-time check-out AND no exceptions',
  {
    checkInTime: new Date('2024-01-15T08:30:00'),
    status: 'OnTime',
    lateMinutes: 0,
    checkOutTime: new Date('2024-01-15T17:45:00'),
    checkOutStatus: 'OnTime',
    earlyCheckoutMinutes: 0,
    hasException: false
  },
  {},
  {
    dayStatus: 'Valid',
    reasons: [],
    color: 'green'
  }
);

// Test 2: Invalid - Late check-in
runTest(
  2,
  'Invalid: Late check-in',
  {
    checkInTime: new Date('2024-01-15T10:50:00'),
    status: 'Late',
    lateMinutes: 170,
    checkOutTime: new Date('2024-01-15T17:45:00'),
    checkOutStatus: 'OnTime',
    earlyCheckoutMinutes: 0,
    hasException: false
  },
  {},
  {
    dayStatus: 'Invalid',
    reasons: ['partial'], // "Đi trễ 170 phút"
    color: 'red'
  }
);

// Test 3: Invalid - Early check-out
runTest(
  3,
  'Invalid: Early check-out',
  {
    checkInTime: new Date('2024-01-15T08:30:00'),
    status: 'OnTime',
    lateMinutes: 0,
    checkOutTime: new Date('2024-01-15T17:00:00'),
    checkOutStatus: 'Early',
    earlyCheckoutMinutes: 45,
    hasException: false
  },
  {},
  {
    dayStatus: 'Invalid',
    reasons: ['early-partial'], // "Về sớm 45 phút"
    color: 'red'
  }
);

// Test 4: Invalid - Both late and early
runTest(
  4,
  'Invalid: Both late check-in and early check-out',
  {
    checkInTime: new Date('2024-01-15T10:50:00'),
    status: 'Late',
    lateMinutes: 170,
    checkOutTime: new Date('2024-01-15T17:00:00'),
    checkOutStatus: 'Early',
    earlyCheckoutMinutes: 45,
    hasException: false
  },
  {},
  {
    dayStatus: 'Invalid',
    reasons: ['partial', 'early-partial'], // Both late and early
    color: 'red'
  }
);

// Test 5: Invalid - Missing check-in
runTest(
  5,
  'Invalid: Missing check-in',
  {
    checkInTime: null,
    status: null,
    checkOutTime: new Date('2024-01-15T17:45:00'),
    checkOutStatus: 'OnTime',
    hasException: false
  },
  {},
  {
    dayStatus: 'Invalid',
    reasons: ['Không check-in'],
    color: 'red'
  }
);

// Test 6: Invalid - With exception
runTest(
  6,
  'Invalid: With exception',
  {
    checkInTime: new Date('2024-01-15T08:30:00'),
    status: 'OnTime',
    lateMinutes: 0,
    checkOutTime: new Date('2024-01-15T17:45:00'),
    checkOutStatus: 'OnTime',
    earlyCheckoutMinutes: 0,
    hasException: true
  },
  {},
  {
    dayStatus: 'Invalid',
    reasons: ['Có ngoại lệ'],
    color: 'red'
  }
);

// Additional test: Overtime check-out (should still be Valid)
runTest(
  7,
  'Valid with Overtime check-out',
  {
    checkInTime: new Date('2024-01-15T08:30:00'),
    status: 'OnTime',
    lateMinutes: 0,
    checkOutTime: new Date('2024-01-15T19:00:00'),
    checkOutStatus: 'Overtime',
    lateCheckoutMinutes: 90,
    hasException: false
  },
  {},
  {
    dayStatus: 'Valid',
    reasons: [],
    color: 'green'
  }
);

// Additional test: Missing check-out
runTest(
  8,
  'Invalid: Missing check-out',
  {
    checkInTime: new Date('2024-01-15T08:30:00'),
    status: 'OnTime',
    lateMinutes: 0,
    checkOutTime: null,
    hasException: false
  },
  {},
  {
    dayStatus: 'Invalid',
    reasons: ['Không check-out'],
    color: 'red'
  }
);

console.log('=== All tests completed ===');
