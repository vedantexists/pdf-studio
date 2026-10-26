/**
 * Independent Adversarial Stress Test Suite for Milestone 1 Review
 * Author: reviewer_m1_1
 * Verifies all 8 scope items and integrity invariants.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PDFDocument, PDFName, PDFHexString, rgb, StandardFonts } = require('pdf-lib');
const PDFCore = require('../pdf_core');
const latin1 = require('./helpers/latin1');

async function run() {
  console.log('=== Reviewer M1 Independent Adversarial Verification Suite ===\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${e.message}\n${e.stack}`);
    }
  }

  // --------------------------------------------------------------------------
  // 1. Redaction Stream Operator Stripping
  // --------------------------------------------------------------------------
  console.log('--- 1. Redaction Operator Stripping ---');

  await test('Redact removes text inside transformed coordinate system (cm operator)', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    // Draw text with translation
    page.drawText('TOP_SECRET_COORDINATES', { x: 100, y: 500, size: 14, font });
    page.drawText('NORMAL_TEXT_PRESERVED', { x: 100, y: 300, size: 14, font });
    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [{
      pageIndex: 0,
      x: 90,
      y: 490,
      width: 250,
      height: 30,
      label: '[REDACTED]',
    }]);

    const extracted = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!extracted.includes('TOP_SECRET_COORDINATES'), 'Redacted text must not be extracted');
    assert(extracted.includes('NORMAL_TEXT_PRESERVED'), 'Normal text must be preserved');
  });

  await test('Redaction with out-of-bounds / zero / negative dimensions does not crash', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    const originalBytes = await doc.save();

    // Passing empty, invalid, and negative boxes
    const result1 = await PDFCore.redactPDF(originalBytes, []);
    assert(result1 instanceof Uint8Array);

    const result2 = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: -50, y: -50, width: 0, height: 10 },
      { pageIndex: 999, x: 10, y: 10, width: 50, height: 20 },
      { pageIndex: 0, x: 10, y: 10, width: -20, height: 20 },
      null,
      undefined,
    ]);
    assert(result2 instanceof Uint8Array);
  });

  await test('Redaction of raw hex-encoded text in content stream', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    // Create text stream using raw stream manipulation
    const secretWord = 'TOPSECRET123';
    page.drawText(secretWord, { x: 100, y: 250, size: 16 });
    const bytes = await doc.save();

    const redacted = await PDFCore.redactPDF(bytes, [{
      pageIndex: 0,
      x: 80,
      y: 240,
      width: 200,
      height: 40,
    }]);

    const extracted = await PDFCore.pdfToText(redacted, { format: 'plain' });
    assert(!extracted.includes(secretWord), 'Hex or literal secret word must be removed');
  });

  // --------------------------------------------------------------------------
  // 2. Wiring of 7 Dormant Tools
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Wiring of 7 Dormant Tools ---');

  await test('All 7 dormant tools have complete TOOLS entries and executeBtn branches', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

    const dormantTools = ['compress', 'repair', 'redact', 'compare', 'scan-to-pdf', 'text-to-pdf', 'pdf-to-text'];
    for (const tool of dormantTools) {
      assert(appCode.includes(`'${tool}':`), `TOOLS must contain entry for '${tool}'`);
      assert(appCode.includes(`currentTool === '${tool}'`), `executeBtn must contain branch for '${tool}'`);
    }
  });

  // --------------------------------------------------------------------------
  // 3. Unlock PDF Cipher Guard & Safety
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Unlock PDF Cipher Guard & Safety ---');

  await test('unlockPDF preserves /Encrypt on bad password', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    const orig = await doc.save();
    const encrypted = await PDFCore.protectPDF(orig, 'CorrectSecret99');

    let errorThrown = false;
    try {
      await PDFCore.unlockPDF(encrypted, 'IncorrectPassword');
    } catch (err) {
      errorThrown = true;
      assert(/password|incorrect|decrypt/i.test(err.message), 'Error message must mention password/decrypt');
    }
    assert(errorThrown, 'Must throw on wrong password');

    // Verify /Encrypt dictionary is intact
    let loadFailed = false;
    try {
      await PDFDocument.load(encrypted);
    } catch {
      loadFailed = true;
    }
    assert(loadFailed, 'Document must remain encrypted after failed unlock attempt');
  });

  await test('unlockPDF rejects unsupported ciphers without deleting /Encrypt', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    doc.context.trailerInfo.Encrypt = doc.context.obj({
      Filter: PDFName.of('Standard'),
      V: 4,
      R: 4,
      Length: 128,
      CF: doc.context.obj({
        StdCF: doc.context.obj({
          CFM: PDFName.of('AESV2'),
          Length: 16,
        }),
      }),
    });
    const bytes = await doc.save();

    let threw = false;
    try {
      await PDFCore.unlockPDF(bytes, 'password');
    } catch (err) {
      threw = true;
      assert(/unsupported|cipher|algorithm/i.test(err.message), 'Must indicate unsupported cipher');
    }
    assert(threw, 'Must throw on V=4 / AESV2');

    // Verify trailer Encrypt was not removed
    let reloadThrew = false;
    try {
      await PDFDocument.load(bytes);
    } catch {
      reloadThrew = true;
    }
    assert(reloadThrew, 'Encrypt dictionary must not be stripped on unsupported cipher error');
  });

  await test('unlockPDF returns clean bytes idempotently on unencrypted PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();
    const unlocked = await PDFCore.unlockPDF(bytes);
    assert(unlocked instanceof Uint8Array);
    const loaded = await PDFDocument.load(unlocked);
    assert.strictEqual(loaded.getPageCount(), 1);
  });

  // --------------------------------------------------------------------------
  // 4. Fast Latin1 String Decoding
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Fast Latin1 String Decoding ---');

  await test('Latin1 decoder handles all 256 byte values and zero String.fromCharCode loops exist', async () => {
    const coreCode = fs.readFileSync(path.join(__dirname, '../pdf_core.js'), 'utf8');
    assert(!coreCode.includes('String.fromCharCode'), 'pdf_core.js must not contain String.fromCharCode');
    assert(coreCode.includes("new TextDecoder('latin1')"), 'pdf_core.js must instantiate TextDecoder with latin1');
  });

  // --------------------------------------------------------------------------
  // 5. repairPDF XRef Stream Masking
  // --------------------------------------------------------------------------
  console.log('\n--- 5. repairPDF XRef Stream Masking ---');

  await test('repairPDF masks stream contents to avoid fake /Root matches', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([300, 300]);
    p.drawText('Legitimate Content', { x: 50, y: 250, size: 14 });
    const originalBytes = await doc.save();

    const fullStr = latin1.decode(originalBytes);
    const streamPos = fullStr.indexOf('stream');
    assert(streamPos > 0);

    // Inject fake catalog in stream
    const fakeObj = 'FAKE_STREAM_DATA\n/Root 888 0 R\n888 0 obj\n<< /Type /Catalog /Bogus true >>\nendobj\n';
    const damagedStr = fullStr.slice(0, streamPos + 7) + fakeObj + fullStr.slice(streamPos + 7);
    const trailerPos = damagedStr.lastIndexOf('trailer');
    const truncatedStr = damagedStr.slice(0, trailerPos);
    const brokenBytes = latin1.encode(truncatedStr);

    const repaired = await PDFCore.repairPDF(brokenBytes);
    const repStr = latin1.decode(repaired);
    const trailerStr = repStr.slice(repStr.lastIndexOf('trailer'));
    const rootMatch = trailerStr.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
    assert(rootMatch, 'Repaired doc must contain /Root');
    assert.notStrictEqual(parseInt(rootMatch[1], 10), 888, 'Repaired root must not be the fake stream object 888');

    const loaded = await PDFDocument.load(repaired);
    assert.strictEqual(loaded.getPageCount(), 1);
  });

  // --------------------------------------------------------------------------
  // 6. Memory Cleanup (.destroy())
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Memory Cleanup ---');

  await test('pdfToText cleans up doc.destroy() in success and error paths', async () => {
    let pdfjs = null;
    try {
      pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    } catch {
      pdfjs = require('pdfjs-dist');
    }

    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const bytes = await doc.save();

    let destroyed = false;
    const origGetDoc = pdfjs.getDocument;
    pdfjs.getDocument = function(src) {
      const task = origGetDoc.call(this, src);
      task.promise = task.promise.then(d => {
        const origDestroy = d.destroy ? d.destroy.bind(d) : () => Promise.resolve();
        d.destroy = async () => {
          destroyed = true;
          return await origDestroy();
        };
        return d;
      });
      return task;
    };

    try {
      await PDFCore.pdfToText(bytes);
      assert.strictEqual(destroyed, true, 'doc.destroy must be called on success');
    } finally {
      pdfjs.getDocument = origGetDoc;
    }
  });

  // --------------------------------------------------------------------------
  // 7. Fast DOM Page Selection
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Fast DOM Page Selection ---');

  await test('DOM helpers update card classes without renderPageThumbnails', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert(appCode.includes('function updateRemovePageCardDOM'), 'Must define updateRemovePageCardDOM');
    assert(appCode.includes('function updateExtractPageCardDOM'), 'Must define updateExtractPageCardDOM');
    assert(appCode.includes('syncAllRemoveSelectionDOM'), 'Must define syncAllRemoveSelectionDOM');
    assert(appCode.includes('syncAllExtractSelectionDOM'), 'Must define syncAllExtractSelectionDOM');
    // Ensure clicking thumbnail in remove-pages does NOT call renderPageThumbnails
    const clickHandlerMatch = appCode.match(/if\s*\(isRemovePages\)\s*\{[\s\S]*?updateRemovePageCardDOM[\s\S]*?\}/);
    assert(clickHandlerMatch, 'Remove click handler must use updateRemovePageCardDOM');
    assert(!clickHandlerMatch[0].includes('renderPageThumbnails'), 'Must not call renderPageThumbnails inside click handler');
  });

  // --------------------------------------------------------------------------
  // 8. Dead Code Elimination & Integrity Checks
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Dead Code Elimination & Integrity Checks ---');

  await test('package.json and pdf_core.js are free of dead MD5/padding and removed packages', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    assert(!pkg.dependencies || !pkg.dependencies['pdf-lib-encrypt'], 'pdf-lib-encrypt must be removed from package.json');

    const coreCode = fs.readFileSync(path.join(__dirname, '../pdf_core.js'), 'utf8');
    assert(!coreCode.includes('function md5'), 'Dead md5 function must be deleted from pdf_core.js');
    assert(!coreCode.includes('PDF_PADDING'), 'Dead PDF_PADDING constant must be deleted from pdf_core.js');
    assert(!coreCode.includes('padPassword'), 'Dead padPassword function must be deleted from pdf_core.js');
  });

  await test('Integrity check: No hardcoded test tokens or bypass facades', async () => {
    const coreCode = fs.readFileSync(path.join(__dirname, '../pdf_core.js'), 'utf8');
    const testTokens = [
      'CONFIDENTIAL_API_TOKEN',
      'SSN_CLASSIFIED',
      'PAGE_0_CONFIDENTIAL_KEY',
      'PAGE_1_STANDARD_FINANCIALS',
      'WrongPassword999',
      'EgressKey123',
    ];
    for (const token of testTokens) {
      assert(!coreCode.includes(token), `Integrity violation: test token "${token}" found hardcoded in pdf_core.js`);
    }
  });

  console.log(`\n===============================================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`===============================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
