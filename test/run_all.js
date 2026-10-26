const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TEST_DIR = path.resolve(__dirname);

function parseTestOutput(stdout, stderr, exitCode) {
  const combined = (stdout || '') + '\n' + (stderr || '');
  let passed = 0;
  let failed = 0;
  let assertions = 0;

  // Patterns for Assertions
  const assertMatch = combined.match(/Assertions?:\s*(\d+)/i);
  if (assertMatch) {
    assertions = parseInt(assertMatch[1], 10);
  }

  // Patterns for Passed / Failed
  const passMatch = combined.match(/(?:Passed|passed):\s*(\d+)|(\d+)\s+(?:Passed|passed)/);
  if (passMatch) {
    passed = parseInt(passMatch[1] || passMatch[2], 10);
  }
  const failMatch = combined.match(/(?:Failed|failed):\s*(\d+)|(\d+)\s+(?:Failed|failed)/);
  if (failMatch) {
    failed = parseInt(failMatch[1] || failMatch[2], 10);
  }

  // Fallback checks for checks count if not explicitly formatted
  if (passed === 0 && exitCode === 0) {
    const checkmarks = (combined.match(/✓|\[PASS\]/g) || []).length;
    if (checkmarks > 0) {
      passed = checkmarks;
    }
  }

  // If no assertions count was found but checks passed, assertions >= passed
  if (assertions === 0 && passed > 0) {
    assertions = passed;
  }

  return { passed, failed, assertions };
}

async function runAll() {
  const files = fs.readdirSync(TEST_DIR)
    .filter(f => /^test_.*\.js$/.test(f))
    .sort();

  console.log('========================================================================');
  console.log(`PDF Studio Test Runner: Executing ${files.length} test suites dynamically`);
  console.log('========================================================================\n');

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalAssertions = 0;
  let anyFailure = false;

  for (const file of files) {
    process.stdout.write(`Running ${file} ... `);
    const start = Date.now();
    const filePath = path.join(TEST_DIR, file);

    const res = spawnSync(process.execPath, [filePath], {
      cwd: path.resolve(TEST_DIR, '..'),
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test' }
    });
    const duration = ((Date.now() - start) / 1000).toFixed(2);

    const counts = parseTestOutput(res.stdout, res.stderr, res.status);
    const failedExit = res.status !== 0 || counts.failed > 0 || counts.assertions === 0;

    if (failedExit) {
      anyFailure = true;
      console.log(`\x1b[31mFAILED\x1b[0m (${duration}s)`);
      if (counts.assertions === 0) {
        console.error(`  -> ERROR: Reported 0 assertions executed!`);
      }
      if (res.stderr) {
        console.error(res.stderr.trim().slice(-600));
      } else if (res.stdout) {
        console.error(res.stdout.trim().slice(-600));
      }
    } else {
      console.log(`\x1b[32mPASS\x1b[0m (${duration}s) - ${counts.passed} passed, ${counts.assertions} assertions`);
    }

    results.push({
      file,
      status: failedExit ? 'FAIL' : 'PASS',
      passed: counts.passed,
      failed: counts.failed + (res.status !== 0 && counts.failed === 0 ? 1 : 0),
      assertions: counts.assertions,
      duration: `${duration}s`
    });

    totalPassed += counts.passed;
    totalFailed += counts.failed + (res.status !== 0 && counts.failed === 0 ? 1 : 0);
    totalAssertions += counts.assertions;
  }

  console.log('\n================================================================================');
  console.log(
    'File'.padEnd(42) +
    'Status'.padEnd(10) +
    'Passed'.padEnd(10) +
    'Failed'.padEnd(10) +
    'Assertions'.padEnd(12) +
    'Time'
  );
  console.log('--------------------------------------------------------------------------------');

  for (const r of results) {
    const statusStr = r.status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(
      r.file.padEnd(42) +
      statusStr.padEnd(19) +
      String(r.passed).padEnd(10) +
      String(r.failed).padEnd(10) +
      String(r.assertions).padEnd(12) +
      r.duration
    );
  }

  console.log('================================================================================');
  console.log(`TOTAL SUITES: ${results.length} | PASSED: ${totalPassed} | FAILED: ${totalFailed} | ASSERTIONS: ${totalAssertions}`);
  console.log('================================================================================\n');

  if (anyFailure) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();
