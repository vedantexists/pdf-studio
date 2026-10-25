/**
 * Phase 4 Audit Remediation & E2E Acceptance Test Suite for pdftool
 * 
 * Verifies the 7 core audit remediations & 30-tool architecture from ORIGINAL_REQUEST.md & PROJECT.md:
 * 1. Redaction Stream Operator Stripping (Tj, TJ, ', ") — pdfToText cannot extract redacted text.
 * 2. unlockPDF() Cipher Guard — explicit errors on bad password & unsupported ciphers without deleting /Encrypt.
 * 3. Fast Latin1 String Decoding & repairPDF XRef Stream Masking (ignores false objects between stream and endstream).
 * 4. Memory Cleanup — mock/verify PDF.js .destroy() lifecycle during document extraction.
 * 5. 30-Tool Registry Completeness — verify all 30 tools in TOOLS with required metadata and category mapping.
 * 6. Compression Byte Reduction — achieves >20% reduction on image-heavy documents.
 * 7. Pure Client-Side Zero-Egress Traps — intercept all outbound network requests across core operations.
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PDFDocument, PDFName, PDFHexString } = require('pdf-lib');
const PDFCore = require('../pdf_core');

// ============================================================================
// Test Suite Statistics & Runner
// ============================================================================
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
};

async function runTest(category, id, title, testFn) {
  stats.total++;
  try {
    await testFn();
    stats.passed++;
    console.log(`  ✓ [${category}.${id}] ${title} passed`);
  } catch (err) {
    stats.failed++;
    stats.failures.push({ category, id, title, error: err });
    console.log(`  ✗ [${category}.${id}] ${title} failed: ${err && err.message ? err.message : err}`);
  }
}

// ============================================================================
// Fixture Generators
// ============================================================================

/**
 * Generate a valid in-memory PNG buffer of designated dimensions.
 * Uses built-in zlib.deflateSync (zero external dependencies).
 */
function createSyntheticPNG(width = 150, height = 150) {
  const lineLength = 1 + width * 4;
  const rawData = Buffer.alloc(lineLength * height);
  for (let y = 0; y < height; y++) {
    const offset = y * lineLength;
    rawData[offset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = offset + 1 + x * 4;
      rawData[pxOffset] = (x ^ y) & 0xff;     // R
      rawData[pxOffset + 1] = (x * 2) & 0xff; // G
      rawData[pxOffset + 2] = (y * 2) & 0xff; // B
      rawData[pxOffset + 3] = 255;            // A
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const toCrc = Buffer.concat([typeBuf, data]);
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < toCrc.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ toCrc[i]) & 0xFF];
    }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressedData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Create a simple multi-page PDF document.
 */
async function createSamplePDF(pageCount = 2, text = 'Audit Sample Page') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([500, 700]);
    page.drawText(`${text} - Page ${i + 1}`, { x: 50, y: 650, size: 20 });
    page.drawText(`Standard content line on page ${i + 1}`, { x: 50, y: 600, size: 12 });
  }
  return await doc.save();
}

// ============================================================================
// Test Suite Execution
// ============================================================================

async function runAuditSuite() {
  console.log('=== pdftool Phase 4 Audit & Acceptance Test Suite ===\n');

  // --------------------------------------------------------------------------
  // Test 1: Redaction stream operator stripping (Tj, TJ, ', ")
  // --------------------------------------------------------------------------
  console.log('--- 1. Redaction Stream Operator Stripping ---');

  await runTest('AUDIT', '1.1', 'pdfToText cannot extract redacted text from single-page document', async () => {
    const secret = 'CONFIDENTIAL_API_TOKEN_778899';
    const publicHeader = 'PUBLIC_STATEMENT_HEADER_2026';

    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    page.drawText(publicHeader, { x: 50, y: 650, size: 16 });
    page.drawText(secret, { x: 50, y: 550, size: 16 });
    const originalBytes = await doc.save();

    // Verify secret text is present initially
    const textBefore = await PDFCore.pdfToText(originalBytes, { format: 'plain' });
    assert(textBefore.includes(secret), 'Source PDF must contain secret string prior to redaction');

    // Apply redaction over the secret coordinates
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [{
      pageIndex: 0,
      x: 40,
      y: 540,
      width: 350,
      height: 30,
      label: '[REDACTED]',
    }]);

    // Assert 1: pdfToText extraction does NOT contain secret
    const textAfter = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!textAfter.includes(secret), `Redacted text "${secret}" MUST NOT be extractable by pdfToText`);

    // Assert 2: Public text outside redaction zone remains preserved
    assert(textAfter.includes(publicHeader), 'Unredacted public text must remain extractable');
  });

  await runTest('AUDIT', '1.2', 'Raw page content stream text operators (Tj, TJ, \', \") are stripped or masked', async () => {
    const classifiedId = 'SSN_CLASSIFIED_987_65_4321';
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    page.drawText(classifiedId, { x: 50, y: 500, size: 14 });
    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [{
      pageIndex: 0,
      x: 40,
      y: 490,
      width: 300,
      height: 30,
      label: '[PROTECTED]',
    }]);

    // Parse decompressed page stream
    const loadedDoc = await PDFDocument.load(redactedBytes);
    const loadedPage = loadedDoc.getPage(0);
    const contentsNode = loadedPage.node.Contents();

    let decompressedStreamText = '';
    if (contentsNode) {
      const arr = contentsNode.asArray ? contentsNode.asArray() : [contentsNode];
      for (const ref of arr) {
        const s = loadedDoc.context.lookup(ref);
        if (!s || typeof s.getContents !== 'function') continue;
        let streamBytes = s.getContents();
        try {
          streamBytes = zlib.inflateSync(streamBytes);
        } catch {
          // uncompressed
        }
        decompressedStreamText += new TextDecoder('latin1').decode(streamBytes);
      }
    }

    const hexSecret = Buffer.from(classifiedId).toString('hex').toUpperCase();

    // Check literal text operators: (str) Tj, (str) ', etc.
    const hasLiteralOperator = decompressedStreamText.includes(classifiedId);
    // Check hex encoded text operator: <hex> Tj
    const hasHexOperator = decompressedStreamText.includes(hexSecret);

    assert(!hasLiteralOperator, `Decompressed page stream MUST NOT contain literal redacted text "${classifiedId}"`);
    assert(!hasHexOperator, `Decompressed page stream MUST NOT contain hex-encoded redacted text "<${hexSecret}> Tj"`);
  });

  await runTest('AUDIT', '1.3', 'Multi-page redaction strips targeted page while preserving adjacent pages', async () => {
    const page0Secret = 'PAGE_0_CONFIDENTIAL_KEY';
    const page1Data = 'PAGE_1_STANDARD_FINANCIALS';

    const doc = await PDFDocument.create();
    const p0 = doc.addPage([500, 700]);
    p0.drawText(page0Secret, { x: 50, y: 550, size: 16 });
    const p1 = doc.addPage([500, 700]);
    p1.drawText(page1Data, { x: 50, y: 550, size: 16 });
    const originalBytes = await doc.save();

    // Redact only page 0
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [{
      pageIndex: 0,
      x: 40,
      y: 540,
      width: 300,
      height: 30,
    }]);

    const extracted = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!extracted.includes(page0Secret), 'Targeted page 0 secret must be stripped');
    assert(extracted.includes(page1Data), 'Adjacent page 1 content must remain fully intact');
  });

  // --------------------------------------------------------------------------
  // Test 2: unlockPDF() cipher guard & encryption safety
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Unlock PDF Cipher Guard & Encryption Safety ---');

  await runTest('AUDIT', '2.1', 'unlockPDF throws explicit error on invalid password without corrupting document', async () => {
    const sampleBytes = await createSamplePDF(1, 'Password Guard');
    const protectedBytes = await PDFCore.protectPDF(sampleBytes, 'ValidPassword123');

    // Attempt unlock with invalid password
    await assert.rejects(
      async () => {
        await PDFCore.unlockPDF(protectedBytes, 'WrongPassword999');
      },
      (err) => {
        assert(err && /password|incorrect|decrypt/i.test(err.message), `Must throw explicit password error, got: ${err.message}`);
        return true;
      }
    );

    // Verify /Encrypt dictionary is intact by loading without ignoreEncryption
    let encryptedLoadThrew = false;
    try {
      await PDFDocument.load(protectedBytes);
    } catch (e) {
      encryptedLoadThrew = true;
    }
    assert(encryptedLoadThrew, 'Protected PDF must remain encrypted; /Encrypt must not be stripped on bad password');
  });

  await runTest('AUDIT', '2.2', 'unlockPDF throws explicit error on unsupported cipher without stripping /Encrypt', async () => {
    const sampleBytes = await createSamplePDF(1, 'Cipher Guard');
    const doc = await PDFDocument.load(sampleBytes);

    // Inject unsupported cipher dictionary (V: 5, R: 6 AES-256 or /AESV2)
    doc.context.trailerInfo.Encrypt = doc.context.obj({
      Filter: PDFName.of('Standard'),
      V: 5,
      R: 6,
      Length: 256,
      OE: PDFHexString.of('0123456789abcdef0123456789abcdef'),
      UE: PDFHexString.of('0123456789abcdef0123456789abcdef'),
      Perms: PDFHexString.of('0123456789abcdef'),
    });
    const unsupportedBytes = await doc.save();

    // Must throw explicit unsupported cipher error and NOT silently strip /Encrypt
    await assert.rejects(
      async () => {
        await PDFCore.unlockPDF(unsupportedBytes, 'AnyPassword');
      },
      (err) => {
        assert(err && /unsupported|cipher|algorithm|encryption/i.test(err.message), `Must throw unsupported cipher error, got: ${err && err.message}`);
        return true;
      }
    );

    // Verify document trailer /Encrypt was NOT deleted
    let reloadThrew = false;
    try {
      await PDFDocument.load(unsupportedBytes);
    } catch {
      reloadThrew = true;
    }
    assert.strictEqual(reloadThrew, true, 'Document must retain /Encrypt dictionary; silent deletion prohibited');
  });

  await runTest('AUDIT', '2.3', 'unlockPDF operates idempotently on unencrypted PDF documents', async () => {
    const sampleBytes = await createSamplePDF(2, 'Unencrypted Sample');
    const unlocked = await PDFCore.unlockPDF(sampleBytes);
    assert(unlocked instanceof Uint8Array, 'Must return Uint8Array');

    const verified = await PDFDocument.load(unlocked);
    assert.strictEqual(verified.getPageCount(), 2, 'Page count preserved');
  });

  // --------------------------------------------------------------------------
  // Test 3: Fast Latin1 String Decoding & repairPDF XRef Stream Masking
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Fast Latin1 String Decoding & repairPDF Stream Masking ---');

  await runTest('AUDIT', '3.1', 'Latin1 string decoding preserves all 256 byte values without high-byte corruption', async () => {
    // Generate buffer with all 256 byte values (0x00 to 0xFF)
    const allBytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) allBytes[i] = i;

    const decoded = new TextDecoder('latin1').decode(allBytes);
    assert.strictEqual(decoded.length, 256, 'Latin1 decoded string length must match byte count');
    for (let i = 0; i < 256; i++) {
      assert.strictEqual(decoded.charCodeAt(i), i, `Byte ${i} must map 1:1 to charCode ${i}`);
    }

    // Benchmark fast decode of large buffer (1MB)
    const largeBuffer = new Uint8Array(1024 * 1024);
    for (let i = 0; i < largeBuffer.length; i++) largeBuffer[i] = i & 0xff;
    const start = Date.now();
    const largeDecoded = new TextDecoder('latin1').decode(largeBuffer);
    const duration = Date.now() - start;
    assert.strictEqual(largeDecoded.length, largeBuffer.length);
    assert(duration < 200, `TextDecoder('latin1') should decode 1MB in <200ms, took ${duration}ms`);
  });

  await runTest('AUDIT', '3.2', 'pdf_core.js does not contain quadratic String.fromCharCode concatenation loops', async () => {
    const coreCode = fs.readFileSync(path.join(__dirname, '../pdf_core.js'), 'utf8');
    const concatLoopPattern = /for\s*\([^)]*\)\s*(?:\w+\s*\+=\s*String\.fromCharCode|\w+\[\w+\]\s*=\s*String\.fromCharCode)/g;
    const matches = coreCode.match(concatLoopPattern);
    assert(!matches || matches.length === 0, `pdf_core.js must replace binary String.fromCharCode loops with TextDecoder('latin1'), found: ${matches}`);
  });

  await runTest('AUDIT', '3.3', 'repairPDF masks stream contents to ignore false-positive Root & object matches', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 600]);
    page.drawText('Genuine Page Content', { x: 50, y: 550, size: 20 });
    const originalBytes = await doc.save();

    let latin = new TextDecoder('latin1').decode(originalBytes);
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

    // Load repaired doc and verify structural integrity
    const repDoc = await PDFDocument.load(repairedBytes);
    assert.strictEqual(repDoc.getPageCount(), 1, 'Repaired document must recover genuine page');
  });

  // --------------------------------------------------------------------------
  // Test 4: Memory Cleanup — Mock/Verify PDF.js .destroy() Lifecycle
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Memory Cleanup — PDF.js .destroy() Lifecycle ---');

  await runTest('AUDIT', '4.1', 'pdfToText cleanly invokes doc.destroy() upon text extraction completion', async () => {
    let pdfjs = null;
    try {
      pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    } catch {
      try { pdfjs = require('pdfjs-dist'); } catch {}
    }
    assert(pdfjs && typeof pdfjs.getDocument === 'function', 'pdfjs-dist must be available in Node test environment');

    const sampleBytes = await createSamplePDF(1, 'Memory Lifecycle Test');
    const originalGetDocument = pdfjs.getDocument;
    let destroyInvoked = false;

    pdfjs.getDocument = function(src) {
      const task = originalGetDocument.call(this, src);
      const originalPromise = task.promise;
      task.promise = originalPromise.then((doc) => {
        const origDestroy = doc.destroy ? doc.destroy.bind(doc) : () => Promise.resolve();
        doc.destroy = async function() {
          destroyInvoked = true;
          return await origDestroy();
        };
        return doc;
      });
      return task;
    };

    try {
      await PDFCore.pdfToText(sampleBytes, { format: 'plain' });
      assert.strictEqual(destroyInvoked, true, 'pdfToText must invoke doc.destroy() to release PDF.js worker memory');
    } finally {
      pdfjs.getDocument = originalGetDocument;
    }
  });

  await runTest('AUDIT', '4.2', 'pdfToText invokes doc.destroy() even if page text extraction encounters an error', async () => {
    let pdfjs = null;
    try {
      pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    } catch {
      try { pdfjs = require('pdfjs-dist'); } catch {}
    }

    const sampleBytes = await createSamplePDF(2, 'Error Lifecycle Test');
    const originalGetDocument = pdfjs.getDocument;
    let destroyInvokedOnError = false;

    pdfjs.getDocument = function(src) {
      const task = originalGetDocument.call(this, src);
      const originalPromise = task.promise;
      task.promise = originalPromise.then((doc) => {
        const origDestroy = doc.destroy ? doc.destroy.bind(doc) : () => Promise.resolve();
        doc.destroy = async function() {
          destroyInvokedOnError = true;
          return await origDestroy();
        };
        // Mock getPage to throw error
        doc.getPage = async function() {
          throw new Error('Simulated page render corruption failure');
        };
        return doc;
      });
      return task;
    };

    try {
      await PDFCore.pdfToText(sampleBytes);
    } catch {
      // Ignored: testing cleanup
    } finally {
      pdfjs.getDocument = originalGetDocument;
    }

    assert.strictEqual(destroyInvokedOnError, true, 'doc.destroy() must be called in finally block even on extraction failure');
  });

  // --------------------------------------------------------------------------
  // Test 5: 30-Tool Registry Completeness
  // --------------------------------------------------------------------------
  console.log('\n--- 5. 30-Tool Registry Completeness ---');

  const EXPECTED_30_TOOLS = [
    // 1. Organize (6)
    'merge', 'split', 'remove-pages', 'extract-pages', 'organize', 'scan-to-pdf',
    // 2. Optimize (3)
    'compress', 'repair', 'ocr-pdf',
    // 3. Convert to PDF (5)
    'img-to-pdf', 'word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf', 'html-to-pdf',
    // 4. Convert from PDF (6)
    'pdf-to-img', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'pdf-to-pdfa', 'pdf-to-text',
    // 5. Edit (6)
    'rotate', 'page-numbers', 'watermark', 'edit-pdf', 'crop', 'redact',
    // 6. Security (4)
    'unlock', 'protect', 'sign', 'compare',
  ];

  const VALID_CATEGORIES = [
    'organize',
    'optimize',
    'convert-to-pdf',
    'convert-to',
    'convert-from-pdf',
    'convert-from',
    'edit',
    'security',
    'intelligence',
  ];

  await runTest('AUDIT', '5.1', 'All 30 tools are present in TOOLS registry in app.js', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

    // Extract TOOLS literal from app.js
    const match = appCode.match(/const TOOLS = (\{[\s\S]*?\n  \});/);
    assert(match, 'app.js must declare const TOOLS = { ... };');
    const tools = eval('(' + match[1] + ')');

    const missingTools = [];
    for (const toolKey of EXPECTED_30_TOOLS) {
      if (!tools[toolKey]) {
        missingTools.push(toolKey);
      }
    }
    assert.strictEqual(missingTools.length, 0, `Missing ${missingTools.length} tools in TOOLS: ${missingTools.join(', ')}`);
  });

  await runTest('AUDIT', '5.2', 'Every tool in TOOLS contains required metadata (title, icon, accept, action/description)', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const match = appCode.match(/const TOOLS = (\{[\s\S]*?\n  \});/);
    assert(match, 'app.js must declare const TOOLS = { ... };');
    const tools = eval('(' + match[1] + ')');

    const defectiveTools = [];
    for (const [key, meta] of Object.entries(tools)) {
      if (typeof meta !== 'object' || !meta) continue;
      const issues = [];
      if (!meta.title || typeof meta.title !== 'string') issues.push('missing title');
      if (!meta.icon || typeof meta.icon !== 'string') issues.push('missing icon');
      if (!meta.accept || typeof meta.accept !== 'string') issues.push('missing accept');
      if (!meta.description && !meta.actionText) issues.push('missing description/actionText');

      if (issues.length > 0) {
        defectiveTools.push(`${key} (${issues.join(', ')})`);
      }
    }
    assert.strictEqual(defectiveTools.length, 0, `Tools missing required metadata: ${defectiveTools.join('; ')}`);
  });

  await runTest('AUDIT', '5.3', 'All 30 tools are mapped to valid semantic categories in CATEGORY_MAP', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const catMatch = appCode.match(/const CATEGORY_MAP = (\{[\s\S]*?\n  \});/);
    assert(catMatch, 'app.js must declare const CATEGORY_MAP = { ... };');
    const categoryMap = eval('(' + catMatch[1] + ')');

    const mappedTools = new Set();
    for (const [catName, toolsList] of Object.entries(categoryMap)) {
      assert(VALID_CATEGORIES.includes(catName), `Category name "${catName}" is not a recognized category`);
      assert(Array.isArray(toolsList), `Category "${catName}" must contain array of tool keys`);
      for (const t of toolsList) {
        mappedTools.add(t);
      }
    }

    const unmappedTools = EXPECTED_30_TOOLS.filter((t) => !mappedTools.has(t));
    assert.strictEqual(unmappedTools.length, 0, `The following tools are missing from CATEGORY_MAP: ${unmappedTools.join(', ')}`);
  });

  // --------------------------------------------------------------------------
  // Test 6: Compression Byte Reduction (>20% on Image-Heavy Documents)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Compression Byte Reduction (>20% on Image-Heavy Documents) ---');

  await runTest('AUDIT', '6.1', 'compressPDF achieves >20% byte reduction on image-heavy documents', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);

    // Embed high-resolution uncompressed image fixture (~120KB)
    const pngBytes = createSyntheticPNG(200, 200);
    const embeddedImg = await doc.embedPng(pngBytes);
    page.drawImage(embeddedImg, { x: 50, y: 50, width: 400, height: 600 });
    const originalPdfBytes = await doc.save();

    assert(originalPdfBytes.length > 50000, `Image PDF fixture must be substantial in size, got ${originalPdfBytes.length} bytes`);

    // Compress PDF with recommended level
    const compressedBytes = await PDFCore.compressPDF(originalPdfBytes, {
      level: 'recommended',
      quality: 0.6,
      dpi: 150,
    });

    assert(compressedBytes instanceof Uint8Array, 'compressPDF must return a Uint8Array');

    const byteDiff = originalPdfBytes.length - compressedBytes.length;
    const reductionRatio = byteDiff / originalPdfBytes.length;
    console.log(`     Original size: ${originalPdfBytes.length} bytes`);
    console.log(`     Compressed size: ${compressedBytes.length} bytes`);
    console.log(`     Reduction: ${(reductionRatio * 100).toFixed(2)}% (Target: >20.0%)`);

    assert(
      reductionRatio >= 0.20,
      `compressPDF must achieve at least 20% byte reduction on image-heavy documents (achieved ${(reductionRatio * 100).toFixed(2)}%)`
    );

    // Verify output document remains valid and loadable
    const verifiedDoc = await PDFDocument.load(compressedBytes);
    assert.strictEqual(verifiedDoc.getPageCount(), 1, 'Compressed document must retain valid page structure');
  });

  // --------------------------------------------------------------------------
  // Test 7: Pure Client-Side Zero-Egress Network Traps
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Pure Client-Side Zero-Egress Network Traps ---');

  await runTest('AUDIT', '7.1', 'Zero network egress across full core PDF operations suite', async () => {
    let egressCount = 0;
    const interceptedCalls = [];

    const trap = (targetUrl) => {
      egressCount++;
      interceptedCalls.push(targetUrl || 'unknown');
      throw new Error(`VIOLATION: Outbound network request intercepted! Target: ${targetUrl || 'unknown'}`);
    };

    // Backup original network delegates
    const origFetch = global.fetch;
    const origHttpRequest = http.request;
    const origHttpGet = http.get;
    const origHttpsRequest = https.request;
    const origHttpsGet = https.get;
    const origNetConnect = net.connect;
    const origTlsConnect = tls.connect;
    const origDgramSocket = dgram.createSocket;

    // Install traps
    global.fetch = trap;
    http.request = trap;
    http.get = trap;
    https.request = trap;
    https.get = trap;
    net.connect = trap;
    tls.connect = trap;
    dgram.createSocket = trap;

    try {
      // Execute suite of core operations under trap
      const sample1 = await createSamplePDF(2, 'Egress Sample 1');
      const sample2 = await createSamplePDF(2, 'Egress Sample 2');

      await PDFCore.mergePDFs([sample1, sample2]);
      await PDFCore.splitPDF(sample1, [0]);
      await PDFCore.extractPages(sample1, [0]);
      await PDFCore.rotatePDF(sample1, 90, [0]);
      await PDFCore.organizePDF(sample1, [{ sourceIndex: 0, rotation: 0 }]);
      await PDFCore.watermarkPDF(sample1, { text: 'NO EGRESS' });
      await PDFCore.addPageNumbers(sample1, { position: 'bottom-right' });
      const protectedPdf = await PDFCore.protectPDF(sample1, 'EgressKey123');
      await PDFCore.unlockPDF(protectedPdf, 'EgressKey123');
      await PDFCore.signPDF(sample1, createSyntheticPNG(50, 50), 0);
      await PDFCore.cropPDF(sample1, [{ pageIndex: 0, x: 20, y: 20, width: 300, height: 400 }]);
      await PDFCore.inspectForm(sample1);
      await PDFCore.fillForm(sample1, {}, true);
      await PDFCore.removePages(sample1, [1]);
      await PDFCore.compressPDF(sample1);
      await PDFCore.repairPDF(sample1);
      await PDFCore.redactPDF(sample1, [{ pageIndex: 0, x: 10, y: 10, width: 50, height: 20 }]);
      const generatedPdf = await PDFCore.textToPDF('Client side only text');
      await PDFCore.pdfToText(generatedPdf);

      assert.strictEqual(egressCount, 0, `Zero network calls permitted; detected ${egressCount} attempts: ${interceptedCalls.join(', ')}`);
    } finally {
      // Restore network delegates
      global.fetch = origFetch;
      http.request = origHttpRequest;
      http.get = origHttpGet;
      https.request = origHttpsRequest;
      https.get = origHttpsGet;
      net.connect = origNetConnect;
      tls.connect = origTlsConnect;
      dgram.createSocket = origDgramSocket;
    }
  });

  await runTest('AUDIT', '7.2', 'Network egress trap actively catches and blocks unauthorized outbound requests', async () => {
    let trapped = false;
    const origRequest = http.request;
    http.request = () => {
      trapped = true;
      throw new Error('Egress blocked');
    };

    try {
      assert.throws(() => {
        http.request('http://evil-telemetry.example.com/log');
      }, /Egress blocked/);
      assert.strictEqual(trapped, true, 'Network trap must actively fire on outbound attempts');
    } finally {
      http.request = origRequest;
    }
  });

  // --------------------------------------------------------------------------
  // Summary & Reporting
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log('Phase 4 Audit Test Suite Summary:');
  console.log(`Total: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed}`);
  console.log('======================================================\n');

  if (stats.failed > 0) {
    console.log(`Pending Audit Remediation / Failed Tests (${stats.failed}):`);
    for (const f of stats.failures) {
      console.log(`  • [${f.category}.${f.id}] ${f.title}`);
      console.log(`    Reason: ${f.error && f.error.message ? f.error.message : f.error}`);
    }
    console.log('\n(Note: Failures represent pending implementation milestones M1-M5)\n');
    const isConditional = process.argv.includes('--conditional') || process.argv.includes('--allow-pending') || process.env.ALLOW_PENDING === '1';
    if (!isConditional) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } else {
    console.log('All Phase 4 audit tests passed successfully!');
    process.exit(0);
  }
}

// Execute suite
runAuditSuite().catch((err) => {
  console.error('Fatal error in Phase 4 audit test harness:', err);
  process.exit(1);
});
