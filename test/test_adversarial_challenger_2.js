/**
 * test_adversarial_challenger_2.js
 * Empirical Challenger 2 Verification Suite for pdftool Phase 1
 * 
 * Focus Areas:
 * 1. Buffer Detachment Stress Testing (structuredClone transfer, MessageChannel transferList, reusability)
 * 2. Network Egress Stress Testing (strict traps on fetch, http, https, WebSocket, XMLHttpRequest, net, tls, dgram)
 * 3. Multi-Step Chained Pipelines (crop -> watermark -> sign -> form fill -> flatten -> protect -> unlock)
 * 4. Zero Disk Writes Invariant (trapping fs writes)
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const dgram = require('dgram');
const fs = require('fs');
const { MessageChannel } = require('worker_threads');
const { PDFDocument, PDFName, rgb, degrees } = require('pdf-lib');
const PDFCore = require('../pdf_core');

// ============================================================================
// Fixtures
// ============================================================================
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG_1X1_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/9oACAEBAAA/AL+A/9k=';

function createTestPNG() {
  return Buffer.from(PNG_1X1_BASE64, 'base64');
}

function createTestJPEG() {
  return new Uint8Array(Buffer.from(JPEG_1X1_BASE64, 'base64'));
}

async function createSamplePDF(pageCount = 1, text = 'Page') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${text} ${i + 1}`, { x: 50, y: 550, size: 24 });
  }
  return await doc.save();
}

async function createFormSamplePDF(pageCount = 2) {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([400, 600]);
  const form = doc.getForm();

  const nameField = form.createTextField('applicantName');
  nameField.setText('Jane Doe');
  nameField.addToPage(page1, { x: 50, y: 500, width: 200, height: 25 });

  const agreeCheck = form.createCheckBox('termsAccepted');
  agreeCheck.addToPage(page1, { x: 50, y: 450, width: 20, height: 20 });

  const deptDropdown = form.createDropdown('department');
  deptDropdown.addOptions(['Engineering', 'Legal', 'Adversarial QA']);
  deptDropdown.select('Engineering');
  deptDropdown.addToPage(page1, { x: 50, y: 400, width: 200, height: 25 });

  for (let i = 1; i < pageCount; i++) {
    const p = doc.addPage([400, 600]);
    p.drawText(`Page ${i + 1} Supplementary`, { x: 50, y: 550, size: 20 });
  }

  return await doc.save();
}

async function createRestrictedSamplePDF() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]);
  const encryptDict = doc.context.obj({
    Filter: PDFName.of('Standard'),
    V: 2,
    R: 3,
    P: -64,
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

async function test(suite, name, fn) {
  stats.total++;
  const label = `[${suite}] ${name}`;
  try {
    await fn();
    stats.passed++;
    console.log(`  ✓ ${label} passed`);
  } catch (err) {
    stats.failed++;
    stats.failures.push({ suite, name, error: err });
    console.log(`  ✗ ${label} FAILED: ${err.message}`);
  }
}

// ============================================================================
// Network Traps System
// ============================================================================
let networkCallsDetected = 0;
const networkLog = [];

function setupStrictNetworkTraps() {
  const trap = (channel, target) => {
    networkCallsDetected++;
    const desc = `${channel} -> ${target || 'unknown target'}`;
    networkLog.push(desc);
    throw new Error(`STRICT EGRESS VIOLATION: Disallowed network operation via ${desc}`);
  };

  // 1. global.fetch
  global.fetch = (input) => trap('global.fetch', typeof input === 'string' ? input : input?.url);

  // 2. http & https request / get
  const origHttpRequest = http.request;
  const origHttpGet = http.get;
  const origHttpsRequest = https.request;
  const origHttpsGet = https.get;

  http.request = (...args) => trap('http.request', args[0]);
  http.get = (...args) => trap('http.get', args[0]);
  https.request = (...args) => trap('https.request', args[0]);
  https.get = (...args) => trap('https.get', args[0]);

  // 3. net.connect & net.Socket.prototype.connect
  const origNetConnect = net.connect;
  const origSocketConnect = net.Socket.prototype.connect;
  net.connect = (...args) => trap('net.connect', args[0]);
  net.Socket.prototype.connect = function (...args) {
    trap('net.Socket.connect', `${args[0]}:${args[1]}`);
  };

  // 4. tls.connect
  const origTlsConnect = tls.connect;
  tls.connect = (...args) => trap('tls.connect', args[0]);

  // 5. dgram.createSocket
  const origDgramCreate = dgram.createSocket;
  dgram.createSocket = (...args) => trap('dgram.createSocket', args[0]);

  // 6. Browser simulated globals
  global.WebSocket = class MockWebSocket {
    constructor(url) {
      trap('WebSocket', url);
    }
  };

  global.XMLHttpRequest = class MockXHR {
    open(method, url) {
      trap('XMLHttpRequest.open', `${method} ${url}`);
    }
    send() {
      trap('XMLHttpRequest.send', 'payload');
    }
  };

  return function restoreNetwork() {
    http.request = origHttpRequest;
    http.get = origHttpGet;
    https.request = origHttpsRequest;
    https.get = origHttpsGet;
    net.connect = origNetConnect;
    net.Socket.prototype.connect = origSocketConnect;
    tls.connect = origTlsConnect;
    dgram.createSocket = origDgramCreate;
    delete global.fetch;
    delete global.WebSocket;
    delete global.XMLHttpRequest;
  };
}

// ============================================================================
// Disk Write Traps System
// ============================================================================
let diskWritesDetected = 0;
const diskWriteLog = [];

function setupStrictDiskWriteTraps() {
  const trapDisk = (fnName, path) => {
    diskWritesDetected++;
    const desc = `${fnName} -> ${path}`;
    diskWriteLog.push(desc);
    throw new Error(`DISK WRITE VIOLATION: Intermediate disk write detected: ${desc}`);
  };

  const origWriteFile = fs.writeFile;
  const origWriteFileSync = fs.writeFileSync;
  const origAppendFile = fs.appendFile;
  const origAppendFileSync = fs.appendFileSync;
  const origCreateWriteStream = fs.createWriteStream;
  const origPromisesWriteFile = fs.promises.writeFile;
  const origPromisesAppendFile = fs.promises.appendFile;

  fs.writeFile = (path, ...args) => trapDisk('fs.writeFile', path);
  fs.writeFileSync = (path, ...args) => trapDisk('fs.writeFileSync', path);
  fs.appendFile = (path, ...args) => trapDisk('fs.appendFile', path);
  fs.appendFileSync = (path, ...args) => trapDisk('fs.appendFileSync', path);
  fs.createWriteStream = (path, ...args) => trapDisk('fs.createWriteStream', path);
  fs.promises.writeFile = (path, ...args) => trapDisk('fs.promises.writeFile', path);
  fs.promises.appendFile = (path, ...args) => trapDisk('fs.promises.appendFile', path);

  return function restoreDisk() {
    fs.writeFile = origWriteFile;
    fs.writeFileSync = origWriteFileSync;
    fs.appendFile = origAppendFile;
    fs.appendFileSync = origAppendFileSync;
    fs.createWriteStream = origCreateWriteStream;
    fs.promises.writeFile = origPromisesWriteFile;
    fs.promises.appendFile = origPromisesAppendFile;
  };
}

// ============================================================================
// Main Adversarial Test Runner
// ============================================================================
async function runAllChallengerTests() {
  console.log('================================================================');
  console.log('CHALLENGER 2: Empirical Verification & Adversarial Stress Suite');
  console.log('Testing: Buffer Detachment, Network Egress, and Chained Pipelines');
  console.log('================================================================\n');

  // ==========================================================================
  // SUITE 1: Buffer Detachment & Memory Safety Stress
  // ==========================================================================
  console.log('--- SUITE 1: Buffer Detachment & Memory Safety Stress ---');

  await test('BD', '1.1: structuredClone transfer detachment defense', async () => {
    const sourceBytes = await createFormSamplePDF(2);
    const initialByteLength = sourceBytes.byteLength;
    assert.strictEqual(initialByteLength > 0, true);

    // Simulate what app.js does: clone via .slice() before Web Worker transfer
    const cloned = sourceBytes.slice();
    assert.strictEqual(cloned.byteLength, initialByteLength);
    assert.notStrictEqual(cloned.buffer, sourceBytes.buffer, 'Clone must have distinct ArrayBuffer');

    // Transfer cloned ArrayBuffer (which completely detaches it)
    structuredClone(cloned.buffer, { transfer: [cloned.buffer] });
    assert.strictEqual(cloned.buffer.byteLength, 0, 'Transferred buffer must be detached (byteLength == 0)');

    // Assert source buffer is 100% unharmed
    assert.strictEqual(sourceBytes.byteLength, initialByteLength, 'Source buffer byteLength must be intact');
    assert.strictEqual(sourceBytes.buffer.byteLength >= initialByteLength, true, 'Source ArrayBuffer must not be detached');

    // Verify source buffer can be loaded and processed across multiple operations
    const fields = await PDFCore.inspectForm(sourceBytes);
    assert.strictEqual(fields.length, 3, 'Form fields inspectable from source buffer');

    const cropped = await PDFCore.cropPDF(sourceBytes, [{ pageIndex: 0, x: 10, y: 10, width: 380, height: 580 }]);
    assert.strictEqual(cropped.byteLength > 0, true, 'Crop operation succeeds on source buffer');

    const watermarked = await PDFCore.watermarkPDF(sourceBytes, { text: 'BUFFER_SAFE' });
    assert.strictEqual(watermarked.byteLength > sourceBytes.byteLength, true, 'Watermark succeeds on source buffer');
  });

  await test('BD', '1.2: worker_threads MessagePort transfer detachment', async () => {
    const sourceBytes = await createSamplePDF(3);
    const initialByteLength = sourceBytes.byteLength;

    const { port1, port2 } = new MessageChannel();
    const cloned = sourceBytes.slice();

    // Post message with transferList
    port1.postMessage({ detachedPayload: cloned.buffer }, [cloned.buffer]);

    // Cloned buffer must now be detached
    assert.strictEqual(cloned.buffer.byteLength, 0, 'Transferred ArrayBuffer is detached');

    // Source buffer must remain valid and operational
    assert.strictEqual(sourceBytes.byteLength, initialByteLength, 'Source Uint8Array byteLength intact');
    const doc = await PDFDocument.load(sourceBytes);
    assert.strictEqual(doc.getPageCount(), 3, 'Source PDFDocument loads cleanly with 3 pages');

    port1.close();
    port2.close();
  });

  await test('BD', '1.3: Concurrent multi-worker transfer detachment stress', async () => {
    const sourceBytes = await createSamplePDF(2);
    const numWorkers = 10;
    const channels = [];

    for (let i = 0; i < numWorkers; i++) {
      const ch = new MessageChannel();
      channels.push(ch);
      const copy = sourceBytes.slice();
      ch.port1.postMessage({ buf: copy.buffer }, [copy.buffer]);
      assert.strictEqual(copy.buffer.byteLength, 0, `Worker clone ${i} must be detached`);
    }

    // After 10 simulated concurrent worker transfers, source is pristine
    assert.strictEqual(sourceBytes.byteLength > 0, true, 'Source buffer survived 10 worker transfers');
    const rotated = await PDFCore.rotatePDF(sourceBytes, 90);
    const loaded = await PDFDocument.load(rotated);
    assert.strictEqual(loaded.getPage(0).getRotation().angle, 90, 'Rotated page verified');

    channels.forEach((ch) => {
      ch.port1.close();
      ch.port2.close();
    });
  });

  await test('BD', '1.4: Source buffer reusability & immutability across operations', async () => {
    const sourceBytes = await createFormSamplePDF(2);
    const originalChecksum = Buffer.from(sourceBytes).toString('base64');
    const originalLength = sourceBytes.length;

    // Call 5 separate operations sequentially using the exact same Uint8Array reference
    await PDFCore.cropPDF(sourceBytes, [{ pageIndex: 0, x: 20, y: 20, width: 300, height: 400 }]);
    await PDFCore.inspectForm(sourceBytes);
    await PDFCore.watermarkPDF(sourceBytes, { text: 'REUSE TEST' });
    await PDFCore.rotatePDF(sourceBytes, 180, [1]);
    await PDFCore.extractPages(sourceBytes, [0]);

    // Assert that sourceBytes was never mutated in-place or detached
    assert.strictEqual(sourceBytes.length, originalLength, 'Length remains identical');
    assert.strictEqual(sourceBytes.byteLength, originalLength, 'byteLength remains identical');
    const afterChecksum = Buffer.from(sourceBytes).toString('base64');
    assert.strictEqual(afterChecksum, originalChecksum, 'Source buffer byte contents are completely unchanged');
  });

  await test('BD', '1.5: Graceful error handling on already-detached buffer intake', async () => {
    const dummy = new Uint8Array(100);
    structuredClone(dummy.buffer, { transfer: [dummy.buffer] });
    assert.strictEqual(dummy.buffer.byteLength, 0, 'Buffer is detached');

    // Assert PDFCore functions reject detached buffers gracefully
    await assert.rejects(
      async () => await PDFCore.rotatePDF(dummy, 90),
      /detached|ArrayBuffer|load|header|parse/i,
      'rotatePDF rejects detached buffer with error'
    );
    await assert.rejects(
      async () => await PDFCore.cropPDF(dummy, { width: 100, height: 100 }),
      /detached|ArrayBuffer|load|header|parse/i,
      'cropPDF rejects detached buffer with error'
    );
    await assert.rejects(
      async () => await PDFCore.unlockPDF(dummy),
      /detached|ArrayBuffer|load|header|parse/i,
      'unlockPDF rejects detached buffer with error'
    );
  });

  // ==========================================================================
  // SUITE 2: Strict Zero-Egress Network Traps
  // ==========================================================================
  console.log('\n--- SUITE 2: Strict Zero-Egress Network Traps ---');

  const restoreNetwork = setupStrictNetworkTraps();

  await test('NET', '2.1: Network trap canary verification', async () => {
    const canaryCountBefore = networkCallsDetected;

    // Verify global.fetch trap
    assert.throws(() => global.fetch('https://malicious-telemetry.org'), /STRICT EGRESS VIOLATION/);
    // Verify http.get trap
    assert.throws(() => http.get('http://insecure-leak.com'), /STRICT EGRESS VIOLATION/);
    // Verify https.request trap
    assert.throws(() => https.request('https://leak.com'), /STRICT EGRESS VIOLATION/);
    // Verify WebSocket trap
    assert.throws(() => new WebSocket('wss://leak-stream.com'), /STRICT EGRESS VIOLATION/);
    // Verify XMLHttpRequest trap
    assert.throws(() => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.upload.com');
    }, /STRICT EGRESS VIOLATION/);

    assert.strictEqual(networkCallsDetected, canaryCountBefore + 5, 'All 5 canary egress attempts were intercepted');
    // Reset network log and counter for actual PDFCore testing
    networkCallsDetected = 0;
    networkLog.length = 0;
  });

  await test('NET', '2.2: Exhaustive Zero-Egress Verification Across All 18 PDFCore Operations', async () => {
    const sample1 = await createSamplePDF(2, 'ZeroEgress1');
    const sample2 = await createSamplePDF(2, 'ZeroEgress2');
    const formSample = await createFormSamplePDF(2);
    const pngBytes = createTestPNG();
    const jpgBytes = createTestJPEG();

    // 1. mergePDFs
    await PDFCore.mergePDFs([sample1, sample2]);
    // 2. splitPDF
    await PDFCore.splitPDF(sample1);
    // 3. extractPages
    await PDFCore.extractPages(sample1, [0]);
    // 4. rotatePDF
    await PDFCore.rotatePDF(sample1, 90, [0]);
    // 5. organizePDF
    await PDFCore.organizePDF(sample1, [{ sourceIndex: 1, rotation: 0 }, { sourceIndex: 0, rotation: 180 }]);
    // 6. imagesToPDF
    await PDFCore.imagesToPDF([{ bytes: pngBytes, type: 'png' }, { bytes: jpgBytes, type: 'jpeg' }]);
    // 7. watermarkPDF
    await PDFCore.watermarkPDF(sample1, { text: 'ZERO EGRESS AIR GAP' });
    // 8. addPageNumbers
    await PDFCore.addPageNumbers(sample1, { position: 'bottom-center' });
    // 9. parsePageRanges (pure utility)
    PDFCore.parsePageRanges('1-2, 2', 2);
    // 10. protectPDF
    const protectedBytes = await PDFCore.protectPDF(sample1, 'AirGapPassword2026!');
    // 11. unlockPDF
    const unlockedBytes = await PDFCore.unlockPDF(protectedBytes, 'AirGapPassword2026!');
    // 12. signPDF (PNG)
    await PDFCore.signPDF(unlockedBytes, pngBytes, 0, { x: 50, y: 50, width: 80, height: 40 });
    // 13. signPDF (JPEG)
    await PDFCore.signPDF(unlockedBytes, jpgBytes, 0, { x: 50, y: 100, width: 80, height: 40 });
    // 14. cropPDF
    await PDFCore.cropPDF(sample1, [{ pageIndex: 0, x: 20, y: 20, width: 300, height: 400 }]);
    // 15. inspectForm
    await PDFCore.inspectForm(formSample);
    // 16. fillForm (interactive)
    const filledInteractive = await PDFCore.fillForm(formSample, { applicantName: 'Air Gap Tester', termsAccepted: true }, false);
    // 17. fillForm (flatten)
    await PDFCore.fillForm(filledInteractive, {}, true);
    // 18. removePages
    await PDFCore.removePages(sample1, [1]);
    // 19. runPipeline
    await PDFCore.runPipeline(sample1, [
      { op: 'watermark', options: { text: 'AIRGAP PIPELINE' } },
      { op: 'rotate', angle: 90, pageIndices: [0] },
    ]);

    // Assert strictly zero network calls were attempted
    assert.strictEqual(networkCallsDetected, 0, `ZERO network calls allowed, but detected: ${networkLog.join(', ')}`);
  });

  await test('NET', '2.3: Font and asset isolation stress (standard font embeddings are local)', async () => {
    const sample = await createSamplePDF(1);
    // Test watermark with long text and rotation
    const res1 = await PDFCore.watermarkPDF(sample, {
      text: 'CONFIDENTIAL CLASSIFIED DOCUMENT - DO NOT DISTRIBUTE',
      fontSize: 24,
      opacity: 0.5,
      color: '#ff0000',
    });
    assert.strictEqual(res1.byteLength > sample.byteLength, true);

    // Test page numbering
    const res2 = await PDFCore.addPageNumbers(sample, {
      format: 'Page {page} of {total}',
      position: 'bottom-right',
      fontSize: 12,
    });
    assert.strictEqual(res2.byteLength > sample.byteLength, true);

    // Assert zero egress during font embedding
    assert.strictEqual(networkCallsDetected, 0, 'No external font requests triggered');
  });

  // Restore network handlers
  restoreNetwork();

  // ==========================================================================
  // SUITE 3: Multi-Step Chained Pipelines
  // ==========================================================================
  console.log('\n--- SUITE 3: Multi-Step Chained Pipelines ---');

  // Install disk write traps to verify zero intermediate disk writes
  const restoreDisk = setupStrictDiskWriteTraps();

  await test('PL', '3.1: Complete 7-step chained pipeline via PDFCore.runPipeline', async () => {
    diskWritesDetected = 0;
    diskWriteLog.length = 0;

    const initialBytes = await createFormSamplePDF(3);
    const pngSignature = createTestPNG();

    const pipelineSteps = [
      // 1. Crop: crop page 0 to specific dimensions
      { op: 'crop', cropBoxes: [{ pageIndex: 0, x: 25, y: 35, width: 350, height: 530 }] },
      // 2. Watermark: add watermark text
      { op: 'watermark', options: { text: 'OFFICIAL RECORD', opacity: 0.3 } },
      // 3. Sign: bake PNG signature onto page 0
      { op: 'sign', signatureData: pngSignature, pageIndex: 0, options: { x: 50, y: 100, width: 120, height: 60 } },
      // 4. Form fill: populate interactive form fields
      { op: 'fillForm', fieldValues: { applicantName: 'Adversarial Challenger', termsAccepted: true, department: 'Adversarial QA' }, flatten: false },
      // 5. Flatten: bake form fields permanently into page vector stream
      { op: 'fillForm', fieldValues: {}, flatten: true },
      // 6. Protect: password-protect with standard encryption
      { op: 'protect', userPassword: 'PipelineVaultSecret99!' },
      // 7. Unlock: unlock password-protected document
      { op: 'unlock', password: 'PipelineVaultSecret99!' },
    ];

    const finalBytes = await PDFCore.runPipeline(initialBytes, pipelineSteps);

    // 1. Verify zero disk writes occurred
    assert.strictEqual(diskWritesDetected, 0, `Zero intermediate disk writes allowed, but caught: ${diskWriteLog.join(', ')}`);

    // 2. Verify bytes are non-empty and valid
    assert.strictEqual(finalBytes instanceof Uint8Array || Buffer.isBuffer(finalBytes), true);
    assert.strictEqual(finalBytes.byteLength > initialBytes.byteLength, true, 'Transformed document has grown in size');

    // 3. Verify final document loads cleanly with standard PDFDocument.load()
    const finalDoc = await PDFDocument.load(finalBytes);
    assert.strictEqual(finalDoc.getPageCount(), 3, 'Page count preserved at 3');
    assert.strictEqual(finalDoc.isEncrypted, false, 'Document is unlocked (not encrypted)');

    // 4. Verify CropBox on page 0
    const cropBox0 = finalDoc.getPage(0).getCropBox();
    assert.strictEqual(cropBox0.x, 25, 'CropBox X matches');
    assert.strictEqual(cropBox0.y, 35, 'CropBox Y matches');
    assert.strictEqual(cropBox0.width, 350, 'CropBox width matches');
    assert.strictEqual(cropBox0.height, 530, 'CropBox height matches');

    // 5. Verify Uncropped pages remain unaffected (Multi-page crop isolation)
    const cropBox1 = finalDoc.getPage(1).getCropBox();
    assert.strictEqual(cropBox1.width, 400, 'Page 1 width uncropped');
    assert.strictEqual(cropBox1.height, 600, 'Page 1 height uncropped');

    // 6. Verify Form Fields Flattened
    const fieldsAfterFlatten = finalDoc.getForm().getFields();
    assert.strictEqual(fieldsAfterFlatten.length, 0, 'Form fields are 100% flattened into static graphics');
  });

  await test('PL', '3.2: Direct function composition chained pipeline (pure in-memory)', async () => {
    diskWritesDetected = 0;
    diskWriteLog.length = 0;

    const initialBytes = await createFormSamplePDF(2);
    const pngSignature = createTestPNG();

    // Step 1: Crop page 0
    const step1 = await PDFCore.cropPDF(initialBytes, [{ pageIndex: 0, x: 40, y: 60, width: 320, height: 480 }]);
    assert.strictEqual(step1.byteLength > 0, true);

    // Step 2: Watermark
    const step2 = await PDFCore.watermarkPDF(step1, { text: 'COMPOSED PIPELINE', opacity: 0.4 });
    assert.strictEqual(step2.byteLength > step1.byteLength, true);

    // Step 3: Sign
    const step3 = await PDFCore.signPDF(step2, pngSignature, 0, { x: 70, y: 120, width: 100, height: 50 });
    assert.strictEqual(step3.byteLength > step2.byteLength, true);

    // Step 4: Fill form interactive
    const step4 = await PDFCore.fillForm(step3, { applicantName: 'Direct Chainer', termsAccepted: true }, false);
    const doc4 = await PDFDocument.load(step4);
    assert.strictEqual(doc4.getForm().getFields().length, 3, 'Form fields present before flattening');

    // Step 5: Flatten
    const step5 = await PDFCore.fillForm(step4, {}, true);
    const doc5 = await PDFDocument.load(step5);
    assert.strictEqual(doc5.getForm().getFields().length, 0, 'Form fields flattened');

    // Step 6: Protect
    const step6 = await PDFCore.protectPDF(step5, 'PassCodeDirect2026');
    let loadFailed = false;
    try {
      await PDFDocument.load(step6);
    } catch (e) {
      loadFailed = true;
    }
    assert.strictEqual(loadFailed, true, 'Protected document cannot be loaded without ignoreEncryption');

    // Step 7: Unlock
    const step7 = await PDFCore.unlockPDF(step6, 'PassCodeDirect2026');
    const doc7 = await PDFDocument.load(step7);
    assert.strictEqual(doc7.isEncrypted, false, 'Unlocked document is unencrypted');
    assert.strictEqual(doc7.getPageCount(), 2, 'Page count intact');

    // Assert zero intermediate disk touches
    assert.strictEqual(diskWritesDetected, 0, 'Zero disk writes during direct function composition');
  });

  await test('PL', '3.3: Chained pipeline with descending page removal + security + editing', async () => {
    diskWritesDetected = 0;

    // Start with 6-page document
    const initialBytes = await createSamplePDF(6, 'ComplexPipeline');
    const pngSignature = createTestPNG();

    // Pipeline:
    // 1. Remove pages 1 and 3 (pages 0, 2, 4, 5 remain = 4 pages)
    // 2. Crop page 0
    // 3. Rotate page 2 by 90 deg
    // 4. Add page numbers
    // 5. Watermark
    // 6. Sign page 0
    // 7. Protect
    // 8. Unlock
    const steps = [
      { op: 'removePages', pageIndices: [1, 3] },
      { op: 'crop', cropBoxes: [{ pageIndex: 0, x: 10, y: 10, width: 380, height: 580 }] },
      { op: 'rotate', angle: 90, pageIndices: [2] },
      { op: 'pageNumbers', options: { position: 'bottom-center' } },
      { op: 'watermark', options: { text: 'COMPLEX CHAIN PASS' } },
      { op: 'sign', signatureData: pngSignature, pageIndex: 0, options: { x: 50, y: 50, width: 80, height: 40 } },
      { op: 'protect', userPassword: 'ComplexChainPass!' },
      { op: 'unlock', password: 'ComplexChainPass!' },
    ];

    const result = await PDFCore.runPipeline(initialBytes, steps);
    assert.strictEqual(diskWritesDetected, 0, 'Zero disk writes during complex chained pipeline');

    const loaded = await PDFDocument.load(result);
    assert.strictEqual(loaded.getPageCount(), 4, 'Remaining page count is exactly 4');
    assert.strictEqual(loaded.isEncrypted, false, 'Result is unlocked');
    assert.strictEqual(loaded.getPage(2).getRotation().angle, 90, 'Page 2 rotated by 90 degrees');
  });

  // Restore disk handlers
  restoreDisk();

  // ==========================================================================
  // SUITE 4: Adversarial Stress & Edge Cases
  // ==========================================================================
  console.log('\n--- SUITE 4: Adversarial Stress & Edge Cases ---');

  await test('ADV', '4.1: Repeated protect/unlock cycling preserves document validity', async () => {
    let bytes = await createSamplePDF(2, 'CycleDocument');

    // Cycle protect -> unlock 3 times consecutively
    for (let cycle = 1; cycle <= 3; cycle++) {
      const password = `CyclePass_${cycle}`;
      bytes = await PDFCore.protectPDF(bytes, password);
      // Verify protected
      let threw = false;
      try {
        await PDFDocument.load(bytes);
      } catch (e) {
        threw = true;
      }
      assert.strictEqual(threw, true, `Cycle ${cycle}: Protected document must throw on standard load`);

      // Unlock
      bytes = await PDFCore.unlockPDF(bytes, password);
      const unlockedDoc = await PDFDocument.load(bytes);
      assert.strictEqual(unlockedDoc.isEncrypted, false, `Cycle ${cycle}: Unlocked document must have isEncrypted: false`);
      assert.strictEqual(unlockedDoc.getPageCount(), 2, `Cycle ${cycle}: Page count preserved`);
    }
  });

  await test('ADV', '4.2: runPipeline resilience to unknown step ops and options format', async () => {
    const initialBytes = await createSamplePDF(1);
    // Pipeline with unknown step op and nested options format
    const steps = [
      { op: 'unknownOperationWhichDoesNotExist', foo: 'bar' },
      { op: 'watermark', options: { text: 'RECOVERY PASS' } },
    ];

    const result = await PDFCore.runPipeline(initialBytes, steps);
    const loaded = await PDFDocument.load(result);
    assert.strictEqual(loaded.getPageCount(), 1, 'Unknown ops ignored gracefully');
    assert.strictEqual(result.byteLength > initialBytes.byteLength, true, 'Subsequent watermark step succeeded');
  });

  await test('ADV', '4.3: Subarray with non-zero byteOffset buffer safety', async () => {
    const fullPdf = await createSamplePDF(1);
    // Wrap in a larger Uint8Array at offset 64
    const padded = new Uint8Array(fullPdf.byteLength + 128);
    padded.set(fullPdf, 64);
    const subarray = padded.subarray(64, 64 + fullPdf.byteLength);

    assert.strictEqual(subarray.byteOffset, 64, 'Subarray has non-zero byteOffset');

    // Pass subarray to PDFCore operations
    const cropped = await PDFCore.cropPDF(subarray, { width: 300, height: 400 });
    assert.strictEqual(cropped.byteLength > 0, true);

    const watermarked = await PDFCore.watermarkPDF(subarray, { text: 'SUBARRAY SAFE' });
    assert.strictEqual(watermarked.byteLength > 0, true);

    const protectedBytes = await PDFCore.protectPDF(subarray, 'SubArrayPass123');
    assert.strictEqual(protectedBytes.byteLength > 0, true);
  });

  await test('ADV', '4.4: Mega 9-step chained in-memory pipeline without disk writes', async () => {
    const pngSignature = createTestPNG();
    const initPdf = await PDFCore.imagesToPDF([{ bytes: pngSignature, type: 'png' }, { bytes: pngSignature, type: 'png' }]);
    assert.strictEqual((await PDFDocument.load(initPdf)).getPageCount(), 2);

    const steps = [
      { op: 'watermark', options: { text: 'MEGA PIPELINE TEST' } },
      { op: 'pageNumbers', options: { position: 'bottom-right' } },
      { op: 'crop', cropBoxes: [{ pageIndex: 0, x: 15.5, y: 15.5, width: 250.25, height: 250.75 }] },
      { op: 'sign', signatureData: pngSignature, pageIndex: 1, options: { x: 30, y: 30, width: 60, height: 30 } },
      { op: 'rotate', angle: 90, pageIndices: [1] },
      { op: 'protect', userPassword: 'MegaPipelinePassword2026!' },
      { op: 'unlock', password: 'MegaPipelinePassword2026!' },
      { op: 'removePages', pageIndices: [1] },
    ];

    const result = await PDFCore.runPipeline(initPdf, steps);
    const loaded = await PDFDocument.load(result);
    assert.strictEqual(loaded.getPageCount(), 1, 'Final page count is 1 after removal of page 1');
    assert.strictEqual(loaded.isEncrypted, false, 'Final document is unlocked');
    const box = loaded.getPage(0).getCropBox();
    assert.strictEqual(box.x, 15.5, 'Floating point crop X preserved');
    assert.strictEqual(box.width, 250.25, 'Floating point crop width preserved');
  });

  await test('ADV', '4.5: Unsorted & duplicate page indices in removePages', async () => {
    const sample = await createSamplePDF(5, 'RemoveTest');
    // Request deletion of pages [3, 1, 3, 1, 4] -> Unique indices to remove: 1, 3, 4 -> Pages 0 and 2 should remain
    const removed = await PDFCore.removePages(sample, [3, 1, 3, 1, 4]);
    const loaded = await PDFDocument.load(removed);
    assert.strictEqual(loaded.getPageCount(), 2, 'Exactly 2 pages remain');
  });

  await test('ADV', '4.6: Robust handling of non-existent form fields & partial fills', async () => {
    const formPdf = await createFormSamplePDF(1);
    // Fill with some existing and some non-existent fields
    const filled = await PDFCore.fillForm(formPdf, {
      applicantName: 'Real Name',
      nonExistentField_123: 'Should not crash',
      anotherFakeField: 9999,
    }, false);

    const fields = await PDFCore.inspectForm(filled);
    const applicant = fields.find((f) => f.name === 'applicantName');
    assert.strictEqual(applicant.value, 'Real Name');
  });

  await test('ADV', '4.7: Memory stability under 50 sequential operations in-memory', async () => {
    let current = await createSamplePDF(1);
    for (let i = 0; i < 50; i++) {
      if (i % 2 === 0) {
        current = await PDFCore.rotatePDF(current, 90);
      } else {
        current = await PDFCore.cropPDF(current, { x: 5, y: 5, width: 390, height: 590 });
      }
    }
    const loaded = await PDFDocument.load(current);
    assert.strictEqual(loaded.getPageCount(), 1, 'Survives 50 sequential operations cleanly');
  });

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n================================================================');
  console.log('CHALLENGER 2 SUMMARY:');
  console.log(`Total tests: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed}`);
  console.log('================================================================');

  if (stats.failed > 0) {
    console.error('\nFAILED TESTS:');
    stats.failures.forEach((f) => {
      console.error(`- [${f.suite}] ${f.name}: ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log('\nALL EMPIRICAL CHALLENGES PASSED WITH ZERO FAILURES.');
    process.exit(0);
  }
}

runAllChallengerTests().catch((err) => {
  console.error('Fatal crash in challenger 2 test runner:', err);
  process.exit(1);
});
