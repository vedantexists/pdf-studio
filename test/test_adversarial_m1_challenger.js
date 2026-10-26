/**
 * Milestone 1 Adversarial Challenge & Stress-Test Suite
 * 
 * Focus Areas:
 * 1. Redact text stripping under nested text matrices, hex strings, escaped characters, multi-line operands.
 *    Empirical verification that no secret leaks through pdfToText or binary inspection.
 * 2. unlockPDF rejection behavior on corrupted encrypted PDFs, wrong passwords, unsupported ciphers.
 *    Empirical verification that /Encrypt is strictly preserved on all failure paths.
 * 3. repairPDF with stream masking: streams containing fake objects (1 0 obj ... endobj) get safely masked
 *    without breaking valid PDF objects or catalog hierarchy.
 * 4. Detached buffer safety, non-zero byte offsets, and strict zero network egress.
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const dgram = require('dgram');
const zlib = require('zlib');
const { PDFDocument, PDFName, PDFHexString, rgb, degrees } = require('pdf-lib');
const PDFCore = require('../pdf_core');
const latin1 = require('./helpers/latin1');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

async function test(section, title, fn) {
  results.total++;
  try {
    await fn();
    results.passed++;
    console.log(`  ✓ [${section}] ${title}`);
  } catch (err) {
    results.failed++;
    results.errors.push({ section, title, err });
    console.error(`  ✗ [${section}] ${title}: ${err.message}`);
  }
}

// Network trap helper
function runWithNetworkTrap(fn) {
  const egressAttempts = [];
  const origHttpReq = http.request;
  const origHttpsReq = https.request;
  const origNetConnect = net.connect;
  const origTlsConnect = tls.connect;
  const origDgramSocket = dgram.createSocket;

  http.request = function(...args) {
    egressAttempts.push({ protocol: 'http', host: args[0]?.host || args[0] });
    throw new Error('Egress violation: http.request blocked');
  };
  https.request = function(...args) {
    egressAttempts.push({ protocol: 'https', host: args[0]?.host || args[0] });
    throw new Error('Egress violation: https.request blocked');
  };
  net.connect = function(...args) {
    egressAttempts.push({ protocol: 'net', port: args[0] });
    throw new Error('Egress violation: net.connect blocked');
  };
  tls.connect = function(...args) {
    egressAttempts.push({ protocol: 'tls', port: args[0] });
    throw new Error('Egress violation: tls.connect blocked');
  };
  dgram.createSocket = function(...args) {
    egressAttempts.push({ protocol: 'dgram' });
    throw new Error('Egress violation: dgram.createSocket blocked');
  };

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      http.request = origHttpReq;
      https.request = origHttpsReq;
      net.connect = origNetConnect;
      tls.connect = origTlsConnect;
      dgram.createSocket = origDgramSocket;
      assert.strictEqual(egressAttempts.length, 0, `Detected ${egressAttempts.length} network egress attempts!`);
    });
}

// Scan binary PDF bytes and all inflated streams for secret substring (plain or hex)
function scanForSecret(pdfBytes, secretStr) {
  const latin = latin1.decode(pdfBytes);
  const hexPart = Buffer.from(secretStr, 'utf8').toString('hex');
  if (latin.includes(secretStr) || latin.toLowerCase().includes(hexPart.toLowerCase())) return true;

  // Search through all flate streams in indirect objects
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRegex.exec(latin)) !== null) {
    const rawStreamStr = match[1];
    const rawBuffer = latin1.encode(rawStreamStr);
    try {
      const inflated = latin1.decode(zlib.inflateSync(rawBuffer));
      if (inflated.includes(secretStr) || inflated.toLowerCase().includes(hexPart.toLowerCase())) return true;
    } catch {
      // Stream may not be flate compressed or may be uncompressed
      if (rawStreamStr.includes(secretStr) || rawStreamStr.toLowerCase().includes(hexPart.toLowerCase())) return true;
    }
  }
  return false;
}

// Helper to convert ASCII string to PDF hex string token (e.g. "HELLO" -> "<48454c4c4f>")
function toHexToken(str) {
  return '<' + Buffer.from(str, 'utf8').toString('hex') + '>';
}

async function runAdversarialSuite() {
  console.log('================================================================');
  console.log('   CHALLENGER M1: Empirical Verification & Adversarial Suite    ');
  console.log('================================================================\n');

  // ============================================================================
  // FOCUS 1: Redaction Text Stripping Under Adversarial Encodings & Matrices
  // ============================================================================
  console.log('--- FOCUS 1: Redaction Text Stripping Under Adversarial Operators ---');

  await test('REDACT.1', 'Hex string operands (<...>) in Tj operator are completely stripped and do not leak', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const secret = 'HEX_TOP_SECRET_ALPHA';
    const hex = toHexToken(secret);
    
    // Inject a content stream directly using hex string Tj
    const streamContent = `
      BT
      /F1 12 Tf
      1 0 0 1 100 500 Tm
      ${hex} Tj
      ET
    `;
    const stream = doc.context.flateStream(new TextEncoder().encode(streamContent));
    const streamRef = doc.context.register(stream);
    page.node.set(PDFName.of('Contents'), streamRef);
    const pdfBytes = await doc.save();

    // Verify secret is initially present in binary
    assert(scanForSecret(pdfBytes, secret), 'Original PDF must contain hex-encoded secret before redaction');

    // Redact the bounding box (x: 90, y: 490, width: 250, height: 30)
    const redactedBytes = await PDFCore.redactPDF(pdfBytes, [
      { pageIndex: 0, x: 90, y: 490, width: 250, height: 30, label: 'CONFIDENTIAL' }
    ]);

    // 1. Text extraction check
    const text = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!text.includes(secret), 'pdfToText must NOT extract hex-encoded secret after redaction');

    // 2. Deep binary and stream inspection check
    assert(!scanForSecret(redactedBytes, secret), 'Binary stream inspection must NOT find secret in redacted document');
  });

  await test('REDACT.2', 'Hex strings inside array TJ operator with kerning adjustments are stripped', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const secretPart1 = 'KERNING_SECRET_';
    const secretPart2 = 'PART_TWO';
    const hex1 = toHexToken(secretPart1);
    const hex2 = toHexToken(secretPart2);

    const streamContent = `
      BT
      /F1 12 Tf
      1 0 0 1 100 400 Tm
      [ ${hex1} -50 ${hex2} ] TJ
      ET
    `;
    const stream = doc.context.flateStream(new TextEncoder().encode(streamContent));
    const streamRef = doc.context.register(stream);
    page.node.set(PDFName.of('Contents'), streamRef);
    const pdfBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(pdfBytes, [
      { pageIndex: 0, x: 90, y: 390, width: 300, height: 30 }
    ]);

    const text = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!text.includes('KERNING_SECRET'), 'pdfToText must NOT find kerning secret');
    assert(!scanForSecret(redactedBytes, 'KERNING_SECRET'), 'Binary inspection must NOT contain kerning secret');
  });

  await test('REDACT.3', 'Single quote apostrophe (\') text operator is stripped and replaced with blank', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const secret = 'APOSTROPHE_OPERATOR_SECRET';

    const streamContent = `
      BT
      /F1 12 Tf
      14 TL
      1 0 0 1 100 350 Tm
      (${secret}) '
      ET
    `;
    const stream = doc.context.flateStream(new TextEncoder().encode(streamContent));
    const streamRef = doc.context.register(stream);
    page.node.set(PDFName.of('Contents'), streamRef);
    const pdfBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(pdfBytes, [
      { pageIndex: 0, x: 90, y: 320, width: 300, height: 40 }
    ]);

    const text = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!text.includes(secret), 'pdfToText must NOT find apostrophe operator secret');
    assert(!scanForSecret(redactedBytes, secret), 'Binary inspection must NOT contain apostrophe secret');
  });

  await test('REDACT.4', 'Double quote (") operator with word/char spacing is stripped without syntax corruption', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const secret = 'DOUBLE_QUOTE_SECRET';

    const streamContent = `
      BT
      /F1 12 Tf
      14 TL
      1 0 0 1 100 300 Tm
      2.5 0.5 (${secret}) "
      ET
    `;
    const stream = doc.context.flateStream(new TextEncoder().encode(streamContent));
    const streamRef = doc.context.register(stream);
    page.node.set(PDFName.of('Contents'), streamRef);
    const pdfBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(pdfBytes, [
      { pageIndex: 0, x: 90, y: 270, width: 300, height: 40 }
    ]);

    const text = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!text.includes(secret), 'pdfToText must NOT find double quote secret');
    assert(!scanForSecret(redactedBytes, secret), 'Binary inspection must NOT contain double quote secret');

    // Document must remain structurally valid and parseable
    const reloaded = await PDFDocument.load(redactedBytes);
    assert.strictEqual(reloaded.getPageCount(), 1);
  });

  await test('REDACT.5', 'Escaped characters (nested parens \\(\\), escaped backslashes \\\\) do not desynchronize token stream', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const secret = 'SECRET\\(NESTED_PARENS\\)_AND_\\\\BACKSLASHES\\\\';

    const streamContent = `
      BT
      /F1 12 Tf
      1 0 0 1 100 250 Tm
      (${secret}) Tj
      ET
    `;
    const stream = doc.context.flateStream(new TextEncoder().encode(streamContent));
    const streamRef = doc.context.register(stream);
    page.node.set(PDFName.of('Contents'), streamRef);
    const pdfBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(pdfBytes, [
      { pageIndex: 0, x: 90, y: 240, width: 350, height: 30 }
    ]);

    assert(!scanForSecret(redactedBytes, 'NESTED_PARENS'), 'Secret with escaped parens must be stripped');
    const reloaded = await PDFDocument.load(redactedBytes);
    assert.strictEqual(reloaded.getPageCount(), 1);
  });

  await test('REDACT.6', 'Multi-line operands in content streams are stripped cleanly', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const secret = 'MULTILINE_SECRET_CONTENT';

    const streamContent = `
      BT
      /F1 12 Tf
      1 0 0 1 100 200 Tm
      (LINE1_${secret}_LINE2
      STILL_ON_LINE3) Tj
      ET
    `;
    const stream = doc.context.flateStream(new TextEncoder().encode(streamContent));
    const streamRef = doc.context.register(stream);
    page.node.set(PDFName.of('Contents'), streamRef);
    const pdfBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(pdfBytes, [
      { pageIndex: 0, x: 90, y: 180, width: 350, height: 50 }
    ]);

    assert(!scanForSecret(redactedBytes, secret), 'Multi-line secret must be stripped');
  });

  await test('REDACT.7', 'Nested coordinate transformation matrices (cm) with translation and scaling', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const secret1 = 'TRANS_SECRET_X200_Y400';
    const secret2 = 'SCALED_SECRET_2X';

    // Matrix 1: Translate to (200, 400)
    // Matrix 2: Inside q/Q, scale by 2 at (100, 200)
    const streamContent = `
      q
      1 0 0 1 200 400 cm
      BT
      /F1 12 Tf
      0 0 Td
      (${secret1}) Tj
      ET
      Q
      q
      2 0 0 2 100 200 cm
      BT
      /F1 10 Tf
      0 0 Td
      (${secret2}) Tj
      ET
      Q
    `;
    const stream = doc.context.flateStream(new TextEncoder().encode(streamContent));
    const streamRef = doc.context.register(stream);
    page.node.set(PDFName.of('Contents'), streamRef);
    const pdfBytes = await doc.save();

    // Redact secret 1 at (x: 200, y: 400)
    // and secret 2 at (x: 100, y: 200)
    const redactedBytes = await PDFCore.redactPDF(pdfBytes, [
      { pageIndex: 0, x: 190, y: 390, width: 250, height: 30 },
      { pageIndex: 0, x: 90, y: 190, width: 250, height: 30 }
    ]);

    const text = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!text.includes(secret1), 'Transformed secret 1 must be stripped');
    assert(!text.includes(secret2), 'Scaled secret 2 must be stripped');
    assert(!scanForSecret(redactedBytes, secret1), 'Binary stream must not contain secret 1');
    assert(!scanForSecret(redactedBytes, secret2), 'Binary stream must not contain secret 2');
  });

  await test('REDACT.8', 'Text strictly outside redaction bounding box is preserved without loss', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const publicTop = 'PUBLIC_HEADER_PRESERVED';
    const secretMid = 'TOP_SECRET_CLASSIFIED';
    const publicBottom = 'PUBLIC_FOOTER_PRESERVED';

    page.drawText(publicTop, { x: 50, y: 650, size: 14 });
    page.drawText(secretMid, { x: 50, y: 350, size: 14 });
    page.drawText(publicBottom, { x: 50, y: 50, size: 14 });
    const pdfBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(pdfBytes, [
      { pageIndex: 0, x: 40, y: 340, width: 300, height: 30 }
    ]);

    const text = await PDFCore.pdfToText(redactedBytes, { format: 'plain' });
    assert(!text.includes(secretMid), 'Redacted secret must be stripped');
    assert(text.includes(publicTop), 'Public header must be preserved');
    assert(text.includes(publicBottom), 'Public footer must be preserved');
  });

  // ============================================================================
  // FOCUS 2: unlockPDF Rejection Behavior & /Encrypt Preservation
  // ============================================================================
  console.log('\n--- FOCUS 2: unlockPDF Rejection Behavior & /Encrypt Preservation ---');

  await test('UNLOCK.1', 'Invalid password rejects with explicit error and preserves /Encrypt', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.drawText('Confidential File', { x: 50, y: 350, size: 12 });
    const originalBytes = await doc.save();

    const protectedBytes = await PDFCore.protectPDF(originalBytes, 'CorrectPassword123');

    // Attempt unlock with wrong password
    let threw = false;
    try {
      await PDFCore.unlockPDF(protectedBytes, 'WrongPasswordX');
    } catch (err) {
      threw = true;
      assert(/password|incorrect|decrypt/i.test(err.message), `Error message must be explicit about password, got: ${err.message}`);
    }
    assert(threw, 'unlockPDF must throw on invalid password');

    // Verify /Encrypt dictionary was NOT deleted from input or trailer
    let reloadThrew = false;
    try {
      await PDFDocument.load(protectedBytes);
    } catch {
      reloadThrew = true;
    }
    assert(reloadThrew, 'PDFDocument.load must fail because /Encrypt is preserved');
  });

  await test('UNLOCK.2', 'Unsupported cipher V=4 / AESV2 throws explicit error and preserves /Encrypt', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.drawText('Sample Page', { x: 50, y: 350, size: 12 });

    // Inject V: 4 and CF with /AESV2
    doc.context.trailerInfo.Encrypt = doc.context.obj({
      Filter: PDFName.of('Standard'),
      V: 4,
      R: 4,
      Length: 128,
      CF: doc.context.obj({
        StdCF: doc.context.obj({
          CFM: PDFName.of('AESV2'),
          Length: 128
        })
      }),
      O: PDFHexString.of('0123456789abcdef0123456789abcdef'),
      U: PDFHexString.of('0123456789abcdef0123456789abcdef')
    });
    const v4Bytes = await doc.save();

    let threw = false;
    try {
      await PDFCore.unlockPDF(v4Bytes, 'SomePassword');
    } catch (err) {
      threw = true;
      assert(/unsupported|cipher|algorithm/i.test(err.message), `Error message must mention unsupported cipher, got: ${err.message}`);
    }
    assert(threw, 'unlockPDF must throw on V=4 cipher');

    // Verify /Encrypt is still present
    let reloadThrew = false;
    try {
      await PDFDocument.load(v4Bytes);
    } catch {
      reloadThrew = true;
    }
    assert(reloadThrew, 'Document must retain /Encrypt on unsupported cipher');
  });

  await test('UNLOCK.3', 'Unsupported custom security handler (Filter: /CustomDRM) throws explicit error', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    doc.context.trailerInfo.Encrypt = doc.context.obj({
      Filter: PDFName.of('CustomDRM'),
      V: 2,
      R: 3
    });
    const customBytes = await doc.save();

    await assert.rejects(
      async () => {
        await PDFCore.unlockPDF(customBytes, 'pass');
      },
      /unsupported cipher algorithm/i
    );
  });

  await test('UNLOCK.4', 'Corrupted Encrypt dictionary (non-dictionary object) throws explicit error without corrupting document', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    // Point Encrypt to a non-dictionary primitive
    doc.context.trailerInfo.Encrypt = doc.context.obj('INVALID_STRING_PRIMITIVE');
    const corruptBytes = await doc.save();

    await assert.rejects(
      async () => {
        await PDFCore.unlockPDF(corruptBytes, 'pass');
      },
      /unsupported cipher algorithm/i
    );
  });

  await test('UNLOCK.5', 'Null / undefined / empty input buffer rejection', async () => {
    await assert.rejects(
      async () => {
        await PDFCore.unlockPDF(null);
      },
      /required/i
    );
    await assert.rejects(
      async () => {
        await PDFCore.unlockPDF(undefined);
      },
      /required/i
    );
  });

  // ============================================================================
  // FOCUS 3: repairPDF with Stream Masking & Fake Object Neutralization
  // ============================================================================
  console.log('\n--- FOCUS 3: repairPDF Stream Masking & Fake Object Neutralization ---');

  await test('REPAIR.1', 'Stream containing fake "1 0 obj ... endobj" and fake /Root is neutralized by masking', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.drawText('Genuine Uncorrupted Document Body', { x: 50, y: 350, size: 16 });
    const originalBytes = await doc.save({ useObjectStreams: false });

    const latin = latin1.decode(originalBytes);

    // Inject a fake stream containing decoy objects and fake /Root
    const fakeInject = '900 0 obj\n<< /Length 140 >>\nstream\n' +
      '/Root 777 0 R\n' +
      '777 0 obj << /Type /Catalog /Bogus true >> endobj\n' +
      '888 0 obj << /Type /Pages /Bogus true >> endobj\n' +
      'endstream\nendobj\n';

    const xrefIdx = latin.lastIndexOf('xref');
    assert(xrefIdx > 0, 'Original document must have an xref table');
    const corruptedLatin = latin.slice(0, xrefIdx) + fakeInject;

    // Execute repair on document with truncated xref/trailer
    const brokenBytes = latin1.encode(corruptedLatin);
    const repairedBytes = await PDFCore.repairPDF(brokenBytes);
    const repairedLatin = latin1.decode(repairedBytes);

    // Verify reconstructed trailer /Root does NOT point to fake object 777
    const trailerStr = repairedLatin.slice(repairedLatin.lastIndexOf('trailer'));
    const rootMatch = trailerStr.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
    assert(rootMatch, 'Repaired PDF must have a valid /Root in trailer');
    const rootNum = parseInt(rootMatch[1], 10);
    assert.notStrictEqual(rootNum, 777, 'Repaired trailer must NOT link to fake stream object 777');
    assert.notStrictEqual(rootNum, 888, 'Repaired trailer must NOT link to fake stream object 888');

    // Verify doc loads cleanly and contains genuine page content
    const repDoc = await PDFDocument.load(repairedBytes);
    assert.strictEqual(repDoc.getPageCount(), 1, 'Repaired document must have 1 valid page');

    const extractedText = await PDFCore.pdfToText(repairedBytes, { format: 'plain' });
    assert(extractedText.includes('Genuine Uncorrupted Document Body'), 'Genuine text must be intact after repair');
  });

  await test('REPAIR.2', 'Multiple streams containing fake objects with CRLF line endings are all masked', async () => {
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([400, 400]);
    p1.drawText('Page One Content', { x: 50, y: 350, size: 14 });
    const p2 = doc.addPage([400, 400]);
    p2.drawText('Page Two Content', { x: 50, y: 350, size: 14 });
    const origBytes = await doc.save({ useObjectStreams: false });

    let latin = latin1.decode(origBytes);

    // Inject fake stream with CRLF line endings
    const fakeStreamCRLF = '999 0 obj\r\n<< /Length 80 >>\r\nstream\r\n' +
      '/Root 999 0 R\r\n' +
      '999 0 obj << /Type /Catalog >> endobj\r\n' +
      'endstream\r\nendobj\r\n';

    const xrefIdx = latin.lastIndexOf('xref');
    const damagedBytes = latin1.encode(latin.slice(0, xrefIdx) + fakeStreamCRLF);

    const repairedBytes = await PDFCore.repairPDF(damagedBytes);
    const repairedLatin = latin1.decode(repairedBytes);

    const trailerStr = repairedLatin.slice(repairedLatin.lastIndexOf('trailer'));
    const rootMatch = trailerStr.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
    assert(rootMatch, 'Must recover trailer Root');
    assert.notStrictEqual(parseInt(rootMatch[1], 10), 999, 'Must not match fake object 999');

    const repDoc = await PDFDocument.load(repairedBytes);
    assert.strictEqual(repDoc.getPageCount(), 2, 'Both pages must be recovered');

    const text = await PDFCore.pdfToText(repairedBytes, { format: 'plain' });
    assert(text.includes('Page One Content'), 'Page 1 text preserved');
    assert(text.includes('Page Two Content'), 'Page 2 text preserved');
  });

  await test('REPAIR.3', 'Clean valid PDF repair operates idempotently without breaking valid objects', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    page.drawText('Idempotent Repair Test', { x: 30, y: 250, size: 12 });
    const validBytes = await doc.save();

    const repaired = await PDFCore.repairPDF(validBytes);
    assert(repaired instanceof Uint8Array);
    const reloaded = await PDFDocument.load(repaired);
    assert.strictEqual(reloaded.getPageCount(), 1);
  });

  // ============================================================================
  // FOCUS 4: Detached Buffer Safety & Zero Network Egress
  // ============================================================================
  console.log('\n--- FOCUS 4: Detached Buffer Safety & Zero Network Egress ---');

  await test('BUFFER.1', 'Uint8Array with non-zero byteOffset and length subarray safety across core operations', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.drawText('Subarray Offset Test', { x: 50, y: 350, size: 14 });
    const rawBytes = await doc.save();

    // Allocate oversized buffer and place PDF bytes at non-zero offset
    const offset = 64;
    const paddedBuffer = new Uint8Array(rawBytes.length + offset + 32);
    paddedBuffer.set(rawBytes, offset);
    const subArrayBytes = paddedBuffer.subarray(offset, offset + rawBytes.length);

    assert.strictEqual(subArrayBytes.byteOffset, offset);

    // 1. Redact on subarray
    const redacted = await PDFCore.redactPDF(subArrayBytes, [
      { pageIndex: 0, x: 40, y: 340, width: 200, height: 30 }
    ]);
    assert(redacted instanceof Uint8Array);

    // 2. Repair on subarray
    const repaired = await PDFCore.repairPDF(subArrayBytes);
    assert(repaired instanceof Uint8Array);

    // 3. pdfToText on subarray
    const text = await PDFCore.pdfToText(subArrayBytes, { format: 'plain' });
    assert(text.includes('Subarray Offset Test'));
  });

  await test('BUFFER.2', 'Input buffer immutability: mutating source buffer does not corrupt output', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.drawText('Immutability Test', { x: 50, y: 350, size: 14 });
    const origBytes = await doc.save();

    const copy = new Uint8Array(origBytes);
    const redactPromise = PDFCore.redactPDF(copy, [{ pageIndex: 0, x: 50, y: 350, width: 100, height: 20 }]);
    
    // Mutate source buffer immediately
    copy.fill(0);

    const result = await redactPromise;
    assert(result instanceof Uint8Array);
    const docLoaded = await PDFDocument.load(result);
    assert.strictEqual(docLoaded.getPageCount(), 1);
  });

  await test('EGRESS.1', 'Zero network egress strictly enforced during all M1 operations', async () => {
    await runWithNetworkTrap(async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([400, 400]);
      page.drawText('Network Isolation Secret Content', { x: 50, y: 350, size: 12 });
      const sampleBytes = await doc.save();

      // 1. Redact
      const redacted = await PDFCore.redactPDF(sampleBytes, [{ pageIndex: 0, x: 40, y: 340, width: 200, height: 30 }]);
      assert(redacted.length > 0);

      // 2. Repair
      const repaired = await PDFCore.repairPDF(redacted);
      assert(repaired.length > 0);

      // 3. Unlock on unencrypted
      const unlocked = await PDFCore.unlockPDF(repaired);
      assert(unlocked.length > 0);

      // 4. pdfToText
      const extracted = await PDFCore.pdfToText(sampleBytes, { format: 'plain' });
      assert(extracted.includes('Network Isolation'));
    });
  });

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n================================================================');
  console.log(`Challenger M1 Adversarial Suite Summary:`);
  console.log(`Total: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed}`);
  console.log('================================================================');

  if (results.failed > 0) {
    console.error('\nFailures detected:');
    for (const f of results.errors) {
      console.error(`- [${f.section}] ${f.title}: ${f.err.message}`);
    }
    process.exit(1);
  } else {
    console.log('\nALL ADVERSARIAL STRESS CHALLENGES PASSED EMPIRICALLY!');
    process.exit(0);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal suite runner error:', err);
  process.exit(1);
});
