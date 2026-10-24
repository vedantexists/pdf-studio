/**
 * Phase 1 Comprehensive E2E Test Suite for pdftool
 * Covers:
 * - Privacy Invariants (Buffer Detachment Defense, Zero Network Egress)
 * - Tier 1: Feature Coverage (Unlock, Protect, Sign, Crop, Form Inspect/Fill/Flatten, Remove, Extract)
 * - Tier 2: Boundary & Corner Cases (Empty forms, remove all pages, invalid dimensions, multi-page isolation)
 * - Tier 3: Cross-Feature Combinations (Sign + Protect, Crop + Watermark, Form + Flatten + Numbers, Unlock + Rotate)
 * - Tier 4: Real-World Scenarios (Full Document Lifecycle, Sequential Pipeline)
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const { PDFDocument, PDFName } = require('pdf-lib');
const PDFCore = require('../pdf_core');

// ============================================================================
// Network Egress Trap (Zero Server Uploads Invariant)
// ============================================================================
let egressAttempted = false;
function installNetworkTrap() {
  const trap = (targetUrl) => {
    egressAttempted = true;
    throw new Error(`VIOLATION: Network request detected during client-side PDF operation! URL: ${targetUrl || 'unknown'}`);
  };

  // Monkeypatch global fetch and Node.js http/https
  global.fetch = trap;
  http.request = trap;
  https.request = trap;
}

// ============================================================================
// In-Memory Fixture Generators
// ============================================================================
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createTestPNG() {
  return Buffer.from(PNG_1X1_BASE64, 'base64');
}

async function createSamplePDF(pageCount, text = 'Page') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${text} ${i + 1}`, { x: 50, y: 550, size: 24 });
  }
  return await doc.save();
}

async function createFormSamplePDF() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  const form = doc.getForm();

  const nameField = form.createTextField('fullName');
  nameField.setText('Initial Name');
  nameField.addToPage(page, { x: 50, y: 500, width: 200, height: 25 });

  const agreeCheck = form.createCheckBox('agree');
  agreeCheck.addToPage(page, { x: 50, y: 450, width: 20, height: 20 });

  const countryDropdown = form.createDropdown('country');
  countryDropdown.addOptions(['USA', 'Canada', 'UK']);
  countryDropdown.select('USA');
  countryDropdown.addToPage(page, { x: 50, y: 400, width: 200, height: 25 });

  return await doc.save();
}

async function createRestrictedSamplePDF() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]);
  const encryptDict = doc.context.obj({
    Filter: PDFName.of('Standard'),
    V: 2,
    R: 3,
    P: -4,
  });
  doc.context.trailerInfo.Encrypt = encryptDict;
  return await doc.save();
}

// ============================================================================
// Test Runner Harness
// ============================================================================
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
};

async function runTest(category, id, title, fn) {
  stats.total++;
  try {
    await fn();
    stats.passed++;
    console.log(`  ✓ [${category}.${id}] ${title} passed`);
  } catch (err) {
    stats.failed++;
    const errMsg = err && err.message ? err.message : String(err);
    stats.failures.push({ category, id, title, error: err });
    console.log(`  ✗ [${category}.${id}] ${title} failed: ${errMsg}`);
  }
}

// ============================================================================
// Test Suites
// ============================================================================

async function runSuite() {
  console.log('=== pdftool Phase 1 Comprehensive Test Harness ===\n');

  // Install network trap at the very beginning
  installNetworkTrap();

  // --------------------------------------------------------------------------
  // Privacy Invariants
  // --------------------------------------------------------------------------
  console.log('--- Privacy Invariants ---');

  await runTest('PI', '1', 'Buffer Detachment Defense (.slice() & structuredClone)', async () => {
    const original = await createSamplePDF(1);
    const copy = original.slice();

    // Simulate Web Worker transfer detachment on the cloned buffer
    structuredClone(copy.buffer, { transfer: [copy.buffer] });
    assert.strictEqual(copy.buffer.byteLength, 0, 'Transferred buffer must be detached');

    // Verify original buffer was completely unharmed
    assert.strictEqual(original.byteLength > 0, true, 'Original buffer must remain intact');
    const doc = await PDFDocument.load(original);
    assert.strictEqual(doc.getPageCount(), 1, 'Original buffer loads and operates cleanly');
  });

  await runTest('PI', '2', 'Zero Network Egress Verification', async () => {
    // Verify that attempting outbound egress triggers our trap
    assert.throws(
      () => {
        global.fetch('https://example.com/telemetry');
      },
      /VIOLATION: Network request detected/i,
      'Network trap must intercept global.fetch'
    );
    // Reset flag after intentional verification test
    egressAttempted = false;
  });

  // --------------------------------------------------------------------------
  // Tier 1: Feature Coverage (Happy Path)
  // --------------------------------------------------------------------------
  console.log('\n--- Tier 1: Feature Coverage ---');

  await runTest('T1', '1', 'Unlock PDF (Decrypt & strip permissions lock)', async () => {
    assert(typeof PDFCore.unlockPDF === 'function', 'PDFCore.unlockPDF must be implemented');
    const restrictedBytes = await createRestrictedSamplePDF();
    const unlockedBytes = await PDFCore.unlockPDF(restrictedBytes);
    assert(unlockedBytes instanceof Uint8Array || Buffer.isBuffer(unlockedBytes), 'Must return Uint8Array');

    // Standard load without ignoreEncryption must succeed cleanly
    const loaded = await PDFDocument.load(unlockedBytes);
    assert.strictEqual(loaded.isEncrypted, false, 'Unlocked PDF must not be encrypted');
    assert.strictEqual(loaded.getPageCount(), 1, 'Page count preserved');
  });

  await runTest('T1', '2', 'Protect PDF (Password encryption)', async () => {
    assert(typeof PDFCore.protectPDF === 'function', 'PDFCore.protectPDF must be implemented');
    const normalBytes = await createSamplePDF(1);
    const protectedBytes = await PDFCore.protectPDF(normalBytes, 'MyPassword123');
    assert(protectedBytes instanceof Uint8Array || Buffer.isBuffer(protectedBytes), 'Must return Uint8Array');

    // Standard load without credentials must fail due to encryption
    let threw = false;
    try {
      await PDFDocument.load(protectedBytes);
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Standard PDFDocument.load must reject encrypted PDF');
  });

  await runTest('T1', '3', 'Sign PDF (Bake PNG signature onto page)', async () => {
    assert(typeof PDFCore.signPDF === 'function', 'PDFCore.signPDF must be implemented');
    const sampleBytes = await createSamplePDF(2);
    const pngBytes = createTestPNG();
    const signedBytes = await PDFCore.signPDF(sampleBytes, pngBytes, 0, { x: 50, y: 50, width: 100, height: 50 });
    assert(signedBytes instanceof Uint8Array || Buffer.isBuffer(signedBytes), 'Must return Uint8Array');
    assert(signedBytes.length > sampleBytes.length, 'Signed PDF byte length must increase');

    const loaded = await PDFDocument.load(signedBytes);
    assert.strictEqual(loaded.getPageCount(), 2, 'Page count preserved');
  });

  await runTest('T1', '4', 'Crop PDF (Set CropBox coordinates)', async () => {
    assert(typeof PDFCore.cropPDF === 'function', 'PDFCore.cropPDF must be implemented');
    const sampleBytes = await createSamplePDF(1);
    const cropBox = { pageIndex: 0, x: 50, y: 100, width: 300, height: 400 };
    const croppedBytes = await PDFCore.cropPDF(sampleBytes, [cropBox]);
    assert(croppedBytes instanceof Uint8Array || Buffer.isBuffer(croppedBytes), 'Must return Uint8Array');

    const loaded = await PDFDocument.load(croppedBytes);
    const box = loaded.getPage(0).getCropBox();
    assert.strictEqual(box.x, 50, 'CropBox X coordinate matches');
    assert.strictEqual(box.y, 100, 'CropBox Y coordinate matches');
    assert.strictEqual(box.width, 300, 'CropBox width matches');
    assert.strictEqual(box.height, 400, 'CropBox height matches');
  });

  await runTest('T1', '5', 'PDF Forms Inspection (inspectForm)', async () => {
    assert(typeof PDFCore.inspectForm === 'function', 'PDFCore.inspectForm must be implemented');
    const formBytes = await createFormSamplePDF();
    const fields = await PDFCore.inspectForm(formBytes);
    assert(Array.isArray(fields), 'inspectForm must return an array');
    assert.strictEqual(fields.length, 3, 'Must discover 3 form fields');

    const nameField = fields.find((f) => f.name === 'fullName');
    assert(nameField, 'fullName field exists');
    assert.strictEqual(nameField.type, 'text', 'fullName is text type');
    assert.strictEqual(nameField.value, 'Initial Name', 'fullName value matches');

    const agreeField = fields.find((f) => f.name === 'agree');
    assert(agreeField, 'agree field exists');
    assert.strictEqual(agreeField.type, 'checkbox', 'agree is checkbox type');

    const countryField = fields.find((f) => f.name === 'country');
    assert(countryField, 'country field exists');
    assert.strictEqual(countryField.type, 'dropdown', 'country is dropdown type');
  });

  await runTest('T1', '6', 'PDF Forms Interactive Fill (fillForm without flatten)', async () => {
    assert(typeof PDFCore.fillForm === 'function', 'PDFCore.fillForm must be implemented');
    const formBytes = await createFormSamplePDF();
    const filledBytes = await PDFCore.fillForm(
      formBytes,
      { fullName: 'Alice Wonderland', agree: true, country: 'Canada' },
      false
    );
    assert(filledBytes instanceof Uint8Array || Buffer.isBuffer(filledBytes), 'Must return Uint8Array');

    const loaded = await PDFDocument.load(filledBytes);
    const form = loaded.getForm();
    assert.strictEqual(form.getTextField('fullName').getText(), 'Alice Wonderland');
    assert.strictEqual(form.getCheckBox('agree').isChecked(), true);
    assert.deepStrictEqual(form.getDropdown('country').getSelected(), ['Canada']);
    assert.strictEqual(form.getFields().length, 3, 'Interactive fields remain present');
  });

  await runTest('T1', '7', 'PDF Forms Flatten (fillForm with flatten)', async () => {
    assert(typeof PDFCore.fillForm === 'function', 'PDFCore.fillForm must be implemented');
    const formBytes = await createFormSamplePDF();
    const flattenedBytes = await PDFCore.fillForm(
      formBytes,
      { fullName: 'Bob Builder', agree: true },
      true
    );
    assert(flattenedBytes instanceof Uint8Array || Buffer.isBuffer(flattenedBytes), 'Must return Uint8Array');

    const loaded = await PDFDocument.load(flattenedBytes);
    const form = loaded.getForm();
    assert.strictEqual(form.getFields().length, 0, 'Form fields must be flattened into static graphics');
  });

  await runTest('T1', '8', 'Remove Pages (removePages)', async () => {
    assert(typeof PDFCore.removePages === 'function', 'PDFCore.removePages must be implemented');
    const sampleBytes = await createSamplePDF(5, 'DocPage');
    const remainingBytes = await PDFCore.removePages(sampleBytes, [1, 3]);
    assert(remainingBytes instanceof Uint8Array || Buffer.isBuffer(remainingBytes), 'Must return Uint8Array');

    const loaded = await PDFDocument.load(remainingBytes);
    assert.strictEqual(loaded.getPageCount(), 3, '5 pages minus 2 = 3 pages remaining');
  });

  await runTest('T1', '9', 'Extract Pages (extractPages)', async () => {
    assert(typeof PDFCore.extractPages === 'function', 'PDFCore.extractPages must be implemented');
    const sampleBytes = await createSamplePDF(5, 'ExtractDoc');
    const extractedBytes = await PDFCore.extractPages(sampleBytes, [0, 2, 4]);
    assert(extractedBytes instanceof Uint8Array || Buffer.isBuffer(extractedBytes), 'Must return Uint8Array');

    const loaded = await PDFDocument.load(extractedBytes);
    assert.strictEqual(loaded.getPageCount(), 3, '3 pages extracted');
  });

  // --------------------------------------------------------------------------
  // Tier 2: Boundary & Corner Cases
  // --------------------------------------------------------------------------
  console.log('\n--- Tier 2: Boundary & Corner Cases ---');

  await runTest('T2', '1', 'inspectForm on empty/formless PDF returns empty array', async () => {
    assert(typeof PDFCore.inspectForm === 'function', 'PDFCore.inspectForm must be implemented');
    const sampleBytes = await createSamplePDF(1);
    const fields = await PDFCore.inspectForm(sampleBytes);
    assert(Array.isArray(fields), 'inspectForm must return array');
    assert.strictEqual(fields.length, 0, 'Must return empty array [] when no AcroForm fields exist');
  });

  await runTest('T2', '2', 'removePages rejects removing all pages', async () => {
    assert(typeof PDFCore.removePages === 'function', 'PDFCore.removePages must be implemented');
    const sampleBytes = await createSamplePDF(2);
    await assert.rejects(
      async () => PDFCore.removePages(sampleBytes, [0, 1]),
      /all pages|at least one/i,
      'Attempting to remove all pages must throw descriptive error'
    );
  });

  await runTest('T2', '3', 'cropPDF rejects non-positive dimensions', async () => {
    assert(typeof PDFCore.cropPDF === 'function', 'PDFCore.cropPDF must be implemented');
    const sampleBytes = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sampleBytes, [{ pageIndex: 0, x: 0, y: 0, width: -50, height: 200 }]),
      /positive|width|height|invalid/i,
      'Non-positive width or height must throw descriptive error'
    );
  });

  await runTest('T2', '4', 'protectPDF rejects empty password', async () => {
    assert(typeof PDFCore.protectPDF === 'function', 'PDFCore.protectPDF must be implemented');
    const sampleBytes = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.protectPDF(sampleBytes, ''),
      /password/i,
      'Empty password must be rejected'
    );
  });

  await runTest('T2', '5', 'Multi-Page Crop Isolation (only targeted page modified)', async () => {
    assert(typeof PDFCore.cropPDF === 'function', 'PDFCore.cropPDF must be implemented');
    const sampleBytes = await createSamplePDF(3);
    const croppedBytes = await PDFCore.cropPDF(sampleBytes, [
      { pageIndex: 1, x: 20, y: 30, width: 250, height: 350 },
    ]);
    const loaded = await PDFDocument.load(croppedBytes);

    const p0 = loaded.getPage(0).getCropBox();
    const p1 = loaded.getPage(1).getCropBox();
    const p2 = loaded.getPage(2).getCropBox();

    // Page 1 is cropped
    assert.strictEqual(p1.x, 20);
    assert.strictEqual(p1.y, 30);
    assert.strictEqual(p1.width, 250);
    assert.strictEqual(p1.height, 350);

    // Pages 0 and 2 retain original dimensions
    assert.strictEqual(p0.width, 400);
    assert.strictEqual(p0.height, 600);
    assert.strictEqual(p2.width, 400);
    assert.strictEqual(p2.height, 600);
  });

  await runTest('T2', '6', 'signPDF rejects out-of-bounds page index', async () => {
    assert(typeof PDFCore.signPDF === 'function', 'PDFCore.signPDF must be implemented');
    const sampleBytes = await createSamplePDF(2);
    const pngBytes = createTestPNG();
    await assert.rejects(
      async () => PDFCore.signPDF(sampleBytes, pngBytes, 99, { x: 50, y: 50, width: 100, height: 50 }),
      /index|bounds|page/i,
      'Out of bounds page index must throw error'
    );
  });

  await runTest('T2', '7', 'unlockPDF is idempotent on already unencrypted PDF', async () => {
    assert(typeof PDFCore.unlockPDF === 'function', 'PDFCore.unlockPDF must be implemented');
    const normalBytes = await createSamplePDF(2);
    const unlockedBytes = await PDFCore.unlockPDF(normalBytes);
    const loaded = await PDFDocument.load(unlockedBytes);
    assert.strictEqual(loaded.getPageCount(), 2, 'Unencrypted PDF remains valid with 2 pages');
    assert.strictEqual(loaded.isEncrypted, false);
  });

  // --------------------------------------------------------------------------
  // Tier 3: Cross-Feature Combinations
  // --------------------------------------------------------------------------
  console.log('\n--- Tier 3: Cross-Feature Combinations ---');

  await runTest('T3', '1', 'Sign + Protect Combination', async () => {
    assert(typeof PDFCore.signPDF === 'function', 'PDFCore.signPDF must be implemented');
    assert(typeof PDFCore.protectPDF === 'function', 'PDFCore.protectPDF must be implemented');

    const sampleBytes = await createSamplePDF(1);
    const pngBytes = createTestPNG();
    const signedBytes = await PDFCore.signPDF(sampleBytes, pngBytes, 0, { x: 50, y: 50, width: 80, height: 40 });
    const protectedBytes = await PDFCore.protectPDF(signedBytes, 'ComboKey123');

    let threw = false;
    try {
      await PDFDocument.load(protectedBytes);
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Sign + Protect result must be encrypted');
  });

  await runTest('T3', '2', 'Crop + Watermark Combination', async () => {
    assert(typeof PDFCore.cropPDF === 'function', 'PDFCore.cropPDF must be implemented');
    assert(typeof PDFCore.watermarkPDF === 'function', 'PDFCore.watermarkPDF must be implemented');

    const sampleBytes = await createSamplePDF(2);
    const croppedBytes = await PDFCore.cropPDF(sampleBytes, [
      { pageIndex: 0, x: 25, y: 25, width: 350, height: 550 },
    ]);
    const watermarkedBytes = await PDFCore.watermarkPDF(croppedBytes, { text: 'CONFIDENTIAL CROP' });

    const loaded = await PDFDocument.load(watermarkedBytes);
    assert.strictEqual(loaded.getPageCount(), 2);
    const cropBox = loaded.getPage(0).getCropBox();
    assert.strictEqual(cropBox.x, 25);
    assert.strictEqual(cropBox.width, 350);
  });

  await runTest('T3', '3', 'Form Fill + Flatten + Page Numbers Combination', async () => {
    assert(typeof PDFCore.fillForm === 'function', 'PDFCore.fillForm must be implemented');
    assert(typeof PDFCore.addPageNumbers === 'function', 'PDFCore.addPageNumbers must be implemented');

    const formBytes = await createFormSamplePDF();
    const flattenedBytes = await PDFCore.fillForm(formBytes, { fullName: 'Combo User', agree: true }, true);
    const numberedBytes = await PDFCore.addPageNumbers(flattenedBytes, { format: 'Page {n} of {total}' });

    const loaded = await PDFDocument.load(numberedBytes);
    assert.strictEqual(loaded.getForm().getFields().length, 0, 'Form remains flattened');
    assert.strictEqual(loaded.getPageCount(), 1, 'Page count preserved');
  });

  await runTest('T3', '4', 'Unlock + Rotate Combination', async () => {
    assert(typeof PDFCore.unlockPDF === 'function', 'PDFCore.unlockPDF must be implemented');
    assert(typeof PDFCore.rotatePDF === 'function', 'PDFCore.rotatePDF must be implemented');

    const restrictedBytes = await createRestrictedSamplePDF();
    const unlockedBytes = await PDFCore.unlockPDF(restrictedBytes);
    const rotatedBytes = await PDFCore.rotatePDF(unlockedBytes, 90, [0]);

    const loaded = await PDFDocument.load(rotatedBytes);
    assert.strictEqual(loaded.getPage(0).getRotation().angle, 90, 'Unlocked document rotates cleanly');
  });

  // --------------------------------------------------------------------------
  // Tier 4: Real-World Scenarios
  // --------------------------------------------------------------------------
  console.log('\n--- Tier 4: Real-World Scenarios ---');

  await runTest('T4', '1', 'Full Document Lifecycle (Fill -> Sign -> Flatten -> Protect -> Unlock)', async () => {
    assert(typeof PDFCore.fillForm === 'function', 'fillForm required');
    assert(typeof PDFCore.signPDF === 'function', 'signPDF required');
    assert(typeof PDFCore.protectPDF === 'function', 'protectPDF required');
    assert(typeof PDFCore.unlockPDF === 'function', 'unlockPDF required');

    // 1. Synthesize form
    const formBytes = await createFormSamplePDF();

    // 2. Interactive fill
    const filledBytes = await PDFCore.fillForm(formBytes, { fullName: 'Executive Officer', agree: true }, false);

    // 3. Stamp signature
    const pngBytes = createTestPNG();
    const signedBytes = await PDFCore.signPDF(filledBytes, pngBytes, 0, { x: 50, y: 100, width: 120, height: 60 });

    // 4. Flatten form to bake inputs permanently
    const flattenedBytes = await PDFCore.fillForm(signedBytes, {}, true);

    // 5. Password-protect the finalized agreement
    const protectedBytes = await PDFCore.protectPDF(flattenedBytes, 'VaultKey2026');

    // Verify it is encrypted
    let threw = false;
    try {
      await PDFDocument.load(protectedBytes);
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Lifecycle output must be encrypted');

    // 6. Unlock and verify end-to-end integrity
    const unlockedBytes = await PDFCore.unlockPDF(protectedBytes, 'VaultKey2026');
    const finalDoc = await PDFDocument.load(unlockedBytes);
    assert.strictEqual(finalDoc.getForm().getFields().length, 0, 'Form fields remain flattened');
    assert.strictEqual(finalDoc.getPageCount(), 1, 'Page count intact');
  });

  await runTest('T4', '2', 'Chained In-Memory Multi-Step Pipeline with Editing Operations', async () => {
    assert(typeof PDFCore.removePages === 'function', 'removePages required');
    assert(typeof PDFCore.watermarkPDF === 'function', 'watermarkPDF required');
    assert(typeof PDFCore.rotatePDF === 'function', 'rotatePDF required');

    const sampleBytes = await createSamplePDF(5, 'Pipeline');
    // Step 1: Remove pages 1 and 3 (leaves 3 pages: 0, 2, 4)
    const step1 = await PDFCore.removePages(sampleBytes, [1, 3]);
    // Step 2: Rotate page 0
    const step2 = await PDFCore.rotatePDF(step1, 180, [0]);
    // Step 3: Watermark all pages
    const step3 = await PDFCore.watermarkPDF(step2, { text: 'PIPELINE COMPLETE' });

    const finalDoc = await PDFDocument.load(step3);
    assert.strictEqual(finalDoc.getPageCount(), 3, 'Pipeline document has 3 pages');
    assert.strictEqual(finalDoc.getPage(0).getRotation().angle, 180, 'Page 0 rotated');
  });

  // --------------------------------------------------------------------------
  // Summary & Exit Codes
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log('Phase 1 Test Suite Summary:');
  console.log(`Total: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed}`);
  console.log('======================================================\n');

  if (stats.failed > 0) {
    console.log(`Pending / Failed Tests (${stats.failed}):`);
    for (const f of stats.failures) {
      console.log(`  • [${f.category}.${f.id}] ${f.title}`);
      console.log(`    Reason: ${f.error && f.error.message ? f.error.message : f.error}`);
    }
    process.exit(1);
  } else {
    console.log('All Phase 1 tests passed successfully!');
    process.exit(0);
  }
}

// Execute the test harness
runSuite().catch((err) => {
  console.error('Fatal error in Phase 1 test suite:', err);
  process.exit(1);
});
