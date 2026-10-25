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
const zlib = require('zlib');
const PDFLib = require('pdf-lib');
const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFRef } = PDFLib;
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

function createSyntheticPNGWithAlpha(width, height, alphaValue = 128) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    buf.writeUInt32BE(crc32(buf.slice(4, 8 + len)), 8 + len);
    return buf;
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = 255; rawData[pxOffset + 1] = 100; rawData[pxOffset + 2] = 50; rawData[pxOffset + 3] = alphaValue;
    }
  }
  const idatChunk = makeChunk('IDAT', zlib.deflateSync(rawData));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
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
  // Tier 5: Phase 1 Security Hardening & Core Engine Invariants
  // --------------------------------------------------------------------------
  console.log('\n--- Tier 5: Phase 1 Security Hardening & Core Engine Invariants ---');

  await runTest('T5', '1', 'Redaction Safety: Sanitize /Annots (hyperlinks, tooltips) intersecting redactions', async () => {
    assert(typeof PDFCore.redactPDF === 'function', 'redactPDF required');
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);

    // Link 1: inside redaction box [40, 390, 220, 50]
    const link1 = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [50, 400, 200, 430],
      A: { Type: 'Action', S: 'URI', URI: 'https://secret-vault.internal/leak?token=SECRET123' },
      Contents: 'Confidential Internal Portal'
    });
    // Link 2: outside redaction box at [50, 50, 200, 80]
    const link2 = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [50, 50, 200, 80],
      A: { Type: 'Action', S: 'URI', URI: 'https://public-docs.org/safe' },
      Contents: 'Public Safe Link'
    });

    const r1 = doc.context.register(link1);
    const r2 = doc.context.register(link2);
    page.node.set(PDFName.of('Annots'), doc.context.obj([r1, r2]));

    const originalBytes = await doc.save();
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 40, y: 390, width: 220, height: 50 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const annotsRef = loaded.getPage(0).node.get(PDFName.of('Annots'));
    const annots = loaded.context.lookup(annotsRef);
    assert(annots instanceof PDFArray, 'Annots must remain a PDFArray');
    assert.strictEqual(annots.size(), 1, 'Only non-intersecting annotation must remain');

    const remLink = loaded.context.lookup(annots.get(0));
    const remAction = loaded.context.lookup(remLink.get(PDFName.of('A')));
    const remUri = remAction.get(PDFName.of('URI')).toString();
    assert(remUri.includes('public-docs.org'), 'Public safe link must remain intact');
  });

  await runTest('T5', '2', 'Redaction Safety: Purge form field values (/V, /DV, /AP) intersecting redactions', async () => {
    assert(typeof PDFCore.redactPDF === 'function', 'redactPDF required');
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    const form = doc.getForm();
    const tf = form.createTextField('sensitiveCreditCard');
    tf.setText('TOP_SECRET_CARD_4111_2222_3333');
    tf.addToPage(page, { x: 50, y: 300, width: 250, height: 30 });

    const originalBytes = await doc.save();
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 40, y: 290, width: 270, height: 50 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const field = loaded.getForm().getTextField('sensitiveCreditCard');
    assert(!field.getText(), 'Field text must be cleared or undefined');
    assert(!field.acroField.dict.has(PDFName.of('V')), 'Field /V must be deleted');
    assert(!field.acroField.dict.has(PDFName.of('DV')), 'Field /DV must be deleted');
    assert(!field.acroField.dict.has(PDFName.of('AP')), 'Field /AP must be deleted');

    const extractedText = await PDFCore.pdfToText(redactedBytes);
    assert(!extractedText.includes('TOP_SECRET_CARD'), 'Sensitive form value must not be extractable via pdfToText');
  });

  await runTest('T5', '3', 'Redaction Safety: Recursively sanitize Form /XObjects intersecting redactions', async () => {
    assert(typeof PDFCore.redactPDF === 'function', 'redactPDF required');
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);

    const embeddedDoc = await PDFDocument.create();
    const subPage = embeddedDoc.addPage([200, 200]);
    subPage.drawText('EMBEDDED_CONFIDENTIAL_KEY_999', { x: 10, y: 10, size: 12 });

    const [embeddedPage] = await doc.embedPages([subPage]);
    page.drawPage(embeddedPage, { x: 50, y: 50, width: 200, height: 200 });

    const originalBytes = await doc.save();
    const textBefore = await PDFCore.pdfToText(originalBytes);
    assert(textBefore.includes('EMBEDDED_CONFIDENTIAL_KEY_999'), 'Unredacted document contains embedded key');

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 40, y: 40, width: 220, height: 220 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(!textAfter.includes('EMBEDDED_CONFIDENTIAL_KEY_999'), 'Form /XObject text must be stripped under redaction box');
  });

  await runTest('T5', '4', 'Image Compression: Convert /DeviceCMYK channels to RGB without color inversion', async () => {
    assert(typeof PDFCore.compressPDF === 'function', 'compressPDF required');
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);

    // 100x100 pure cyan raster: C=255, M=0, Y=0, K=0
    const cmykBytes = Buffer.alloc(100 * 100 * 4);
    for (let i = 0; i < cmykBytes.length; i += 4) {
      cmykBytes[i] = 255; // C
      cmykBytes[i + 1] = 0;
      cmykBytes[i + 2] = 0;
      cmykBytes[i + 3] = 0;
    }
    const deflated = zlib.deflateSync(cmykBytes);
    const imgDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 100,
      ColorSpace: 'DeviceCMYK',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    });
    const stream = PDFRawStream.of(imgDict, deflated);
    const imgRef = doc.context.register(stream);
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImCmyk: imgRef }
    }));

    const origPdf = await doc.save();
    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const verifiedDoc = await PDFDocument.load(compressed);

    let verified = false;
    for (const [, obj] of verifiedDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image') {
        const cs = obj.dict.get(PDFName.of('ColorSpace'))?.toString();
        assert.strictEqual(cs, '/DeviceRGB', 'ColorSpace must be converted to /DeviceRGB');
        const uncompressed = zlib.inflateSync(obj.getContents());
        // Pure cyan in RGB: R=0, G=255, B=255
        assert.strictEqual(uncompressed[0], 0, 'Red channel must be 0 for pure cyan');
        assert.strictEqual(uncompressed[1], 255, 'Green channel must be 255 for pure cyan');
        assert.strictEqual(uncompressed[2], 255, 'Blue channel must be 255 for pure cyan');
        verified = true;
      }
    }
    assert(verified, 'CMYK image must be verified');
  });

  await runTest('T5', '5', 'Image Compression: Preserve /SMask transparency on transparent PNG images', async () => {
    assert(typeof PDFCore.compressPDF === 'function', 'compressPDF required');
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const pngBytes = createSyntheticPNGWithAlpha(100, 100, 128);
    const img = await doc.embedPng(pngBytes);
    page.drawImage(img, { x: 20, y: 20, width: 200, height: 200 });

    const origPdf = await doc.save();
    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const verifiedDoc = await PDFDocument.load(compressed);

    let foundMainImage = false;
    for (const [, obj] of verifiedDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image') {
        if (obj.dict.has(PDFName.of('SMask'))) {
          foundMainImage = true;
          const smaskRef = obj.dict.get(PDFName.of('SMask'));
          const smaskObj = verifiedDoc.context.lookup(smaskRef);
          assert(smaskObj instanceof PDFRawStream, 'SMask must resolve to an image stream');
          assert.strictEqual(smaskObj.dict.get(PDFName.of('ColorSpace'))?.toString(), '/DeviceGray');
        }
      }
    }
    assert(foundMainImage, 'Image with /SMask must be preserved in compressed PDF');
  });

  await runTest('T5', '6', 'Image Compression: Eliminate unreferenced orphan image stream objects', async () => {
    assert(typeof PDFCore.compressPDF === 'function', 'compressPDF required');
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);

    // Active referenced image
    const s1 = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 10, Height: 10, ColorSpace: 'DeviceGray', BitsPerComponent: 8
    }), new Uint8Array(100));
    const r1 = doc.context.register(s1);
    page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { Im1: r1 } }));

    // Orphan unreferenced image
    const sOrphan = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 10, Height: 10, ColorSpace: 'DeviceGray', BitsPerComponent: 8
    }), new Uint8Array(100));
    doc.context.register(sOrphan);

    const origPdf = await doc.save();
    const origDoc = await PDFDocument.load(origPdf);
    const origImages = Array.from(origDoc.context.enumerateIndirectObjects())
      .filter(([, o]) => o instanceof PDFRawStream && o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image');
    assert.strictEqual(origImages.length, 2, 'Initial PDF must have 2 image streams');

    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const verifiedDoc = await PDFDocument.load(compressed);
    const compImages = Array.from(verifiedDoc.context.enumerateIndirectObjects())
      .filter(([, o]) => o instanceof PDFRawStream && o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image');
    assert.strictEqual(compImages.length, 1, 'Only 1 active image stream must remain; orphan must be eliminated');
  });

  await runTest('T5', '7', 'Modern PDF XRef Repair Guard: PDF 1.5+ XRef stream idempotence', async () => {
    assert(typeof PDFCore.repairPDF === 'function', 'repairPDF required');
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const pdf15 = await doc.save({ useObjectStreams: true });
    const rep15 = await PDFCore.repairPDF(pdf15);
    const rep15Str = Buffer.from(rep15).toString('latin1');
    assert(!rep15Str.includes('trailer\n<<\n  /Size'), 'PDF 1.5+ must preserve modern XRef stream without degrading to legacy ASCII trailer');

    const reloaded = await PDFDocument.load(rep15);
    assert.strictEqual(reloaded.getPageCount(), 1, 'Repaired PDF 1.5+ loads cleanly with 1 page');
  });

  await runTest('T5', '8', 'Modern PDF Repair Performance: Stream masking with slice indices', async () => {
    assert(typeof PDFCore.repairPDF === 'function', 'repairPDF required');
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 600]);
    page.drawText('Genuine Uncorrupted Page', { x: 50, y: 550, size: 20 });
    const originalBytes = await doc.save();

    const latin = new TextDecoder('latin1').decode(originalBytes);
    const streamIdx = latin.indexOf('stream');
    assert(streamIdx > 0, 'Document must contain a stream');

    // Inject fake /Root 999 0 R and fake 999 0 obj inside genuine stream content
    const fakePayload = 'FAKE_STREAM_DATA /Root 999 0 R MORE_DATA 999 0 obj << /Type /Catalog /Bogus true >> endobj ';
    const corruptedLatin = latin.slice(0, streamIdx + 7) + fakePayload + latin.slice(streamIdx + 7);

    // Truncate trailer to trigger repairPDF reconstruction
    const trailerIdx = corruptedLatin.lastIndexOf('trailer');
    const brokenBytes = Buffer.from(corruptedLatin.slice(0, trailerIdx), 'latin1');

    const repairedBytes = await PDFCore.repairPDF(brokenBytes);
    const repairedLatin = new TextDecoder('latin1').decode(repairedBytes);

    // The repaired trailer /Root must NOT reference the fake object 999 0 R
    const trailerStr = repairedLatin.slice(repairedLatin.lastIndexOf('trailer'));
    const rootMatch = trailerStr.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
    assert(rootMatch, 'Repaired document must contain a reconstructed /Root reference in trailer');
    const rootObjNum = parseInt(rootMatch[1], 10);
    assert.notStrictEqual(rootObjNum, 999, 'repairPDF must NOT match fake /Root 999 0 R inside stream body');

    const repDoc = await PDFDocument.load(repairedBytes);
    assert.strictEqual(repDoc.getPageCount(), 1, 'Repaired document must recover genuine page');
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
