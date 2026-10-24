/**
 * test/test_adversarial_challenger_m2_3.js
 * Empirical Challenger M2-3 Adversarial Stress & Verification Harness
 * Focus areas:
 * 1. compressPDF: /DCTDecode (JPEG) RGB, Gray, CMYK stream integrity in Node.js
 * 2. comparePDF: Dual-corrupted & non-PDF error handling (/invalid|corrupt|failed to parse/i)
 * 3. comparePDF: ArrayBuffer deep-cloning & detached buffer resilience
 * 4. Mixed document compression (Flate downsampled + DCT untouched)
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const PDFLib = require('pdf-lib');
const { PDFDocument, PDFName, StandardFonts } = PDFLib;
const PDFCore = require('../pdf_core');

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
  process.stdout.write(`  [CHALLENGER-M2-3] ${name} ... `);
  try {
    await fn();
    console.log('PASS');
    passCount++;
  } catch (err) {
    console.log('FAIL');
    console.error(`    -> ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
    failCount++;
  }
}

// Network egress trap
let networkViolations = 0;
const origHttpRequest = http.request;
const origHttpsRequest = https.request;

function activateNetTrap() {
  http.request = function (...args) {
    networkViolations++;
    throw new Error('Egress violation: http.request');
  };
  https.request = function (...args) {
    networkViolations++;
    throw new Error('Egress violation: https.request');
  };
}

function restoreNetTrap() {
  http.request = origHttpRequest;
  https.request = origHttpsRequest;
}

// Helper: create a valid multi-page text PDF
async function createTextDoc(pageCount = 1, textPrefix = 'Test Page') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${textPrefix} ${i + 1}`, { x: 50, y: 500, size: 14, font });
  }
  return await doc.save();
}

async function run() {
  console.log('=== Empirical Challenger M2-3 Adversarial Test Harness ===\n');
  activateNetTrap();

  // -------------------------------------------------------------------------
  // AREA 1: compressPDF - DCTDecode (JPEG) Stream Integrity in Node.js
  // -------------------------------------------------------------------------
  console.log('--- 1. compressPDF: DCTDecode (JPEG) Stream Integrity in Node.js ---');

  await test('1.1 RGB DCTDecode image stream is not touched or corrupted to FlateDecode', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);

    const imgDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 120,
      Height: 120,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    });
    // Distinct 4000-byte payload simulating JPEG
    const fakeJpegBytes = Buffer.alloc(4000, 0x55);
    const imgStream = PDFLib.PDFRawStream.of(imgDict, fakeJpegBytes);
    const imgRef = doc.context.register(imgStream);
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImRgb: imgRef }
    }));
    const originalPdf = await doc.save();

    const compressed = await PDFCore.compressPDF(originalPdf, { level: 'extreme' });
    const verified = await PDFDocument.load(compressed);

    let foundImage = false;
    for (const [ref, obj] of verified.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFRawStream) {
        const dict = obj.dict;
        if (dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
          foundImage = true;
          const filter = dict.get(PDFName.of('Filter'))?.toString();
          const cs = dict.get(PDFName.of('ColorSpace'))?.toString();
          assert.strictEqual(filter, '/DCTDecode', `Filter must remain /DCTDecode, got ${filter}`);
          assert.strictEqual(cs, '/DeviceRGB', `ColorSpace must remain /DeviceRGB, got ${cs}`);
          assert.strictEqual(dict.get(PDFName.of('Width')).asNumber(), 120);
          assert.strictEqual(dict.get(PDFName.of('Height')).asNumber(), 120);
          // Contents must be identical to original fakeJpegBytes
          assert.deepStrictEqual(Buffer.from(obj.getContents()), fakeJpegBytes);
        }
      }
    }
    assert(foundImage, 'Image XObject must be found in compressed PDF');
  });

  await test('1.2 Grayscale DCTDecode image stream is not corrupted in Node.js', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);

    const imgDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 100,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    });
    const fakeJpegBytes = Buffer.alloc(2500, 0x77);
    const imgStream = PDFLib.PDFRawStream.of(imgDict, fakeJpegBytes);
    const imgRef = doc.context.register(imgStream);
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImGray: imgRef }
    }));
    const originalPdf = await doc.save();

    const compressed = await PDFCore.compressPDF(originalPdf, { level: 'recommended' });
    const verified = await PDFDocument.load(compressed);

    let foundImage = false;
    for (const [ref, obj] of verified.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFRawStream) {
        const dict = obj.dict;
        if (dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
          foundImage = true;
          const filter = dict.get(PDFName.of('Filter'))?.toString();
          assert.strictEqual(filter, '/DCTDecode');
          assert.deepStrictEqual(Buffer.from(obj.getContents()), fakeJpegBytes);
        }
      }
    }
    assert(foundImage);
  });

  await test('1.3 Mixed document: FlateDecode image IS downsampled while DCTDecode IS preserved', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 600]);

    // 1. FlateDecode image: 100x100 RGB raw raster (30,000 bytes)
    const rawFlateRaster = Buffer.alloc(100 * 100 * 3);
    for (let i = 0; i < rawFlateRaster.length; i += 3) {
      rawFlateRaster[i] = (i / 3) % 256;
      rawFlateRaster[i + 1] = ((i / 3) * 2) % 256;
      rawFlateRaster[i + 2] = ((i / 3) * 3) % 256;
    }
    const deflatedFlate = zlib.deflateSync(rawFlateRaster);
    const flateDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 100,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    });
    const flateStream = PDFLib.PDFRawStream.of(flateDict, deflatedFlate);
    const flateRef = doc.context.register(flateStream);

    // 2. DCTDecode image: 100x100 RGB JPEG (3,000 bytes)
    const dctBytes = Buffer.alloc(3000, 0x88);
    const dctDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 100,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    });
    const dctStream = PDFLib.PDFRawStream.of(dctDict, dctBytes);
    const dctRef = doc.context.register(dctStream);

    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImFlate: flateRef, ImDct: dctRef }
    }));
    const originalPdf = await doc.save();

    // Compress with recommended level (scale factor 2 -> 50x50)
    const compressed = await PDFCore.compressPDF(originalPdf, { level: 'recommended' });
    const verified = await PDFDocument.load(compressed);

    let verifiedFlateDownsampled = false;
    let verifiedDctPreserved = false;

    for (const [ref, obj] of verified.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFRawStream) {
        const dict = obj.dict;
        if (dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
          const filter = dict.get(PDFName.of('Filter'))?.toString();
          if (filter?.includes('FlateDecode')) {
            const w = dict.get(PDFName.of('Width')).asNumber();
            const h = dict.get(PDFName.of('Height')).asNumber();
            assert.strictEqual(w, 50, 'Flate image Width should be downsampled to 50');
            assert.strictEqual(h, 50, 'Flate image Height should be downsampled to 50');
            const uncompressed = zlib.inflateSync(obj.getContents());
            assert.strictEqual(uncompressed.length, 50 * 50 * 3, 'Flate stream must have full 50x50x3 bytes');
            verifiedFlateDownsampled = true;
          } else if (filter?.includes('DCTDecode')) {
            const w = dict.get(PDFName.of('Width')).asNumber();
            const h = dict.get(PDFName.of('Height')).asNumber();
            assert.strictEqual(w, 100, 'DCT image Width should remain 100');
            assert.strictEqual(h, 100, 'DCT image Height should remain 100');
            assert.deepStrictEqual(Buffer.from(obj.getContents()), dctBytes, 'DCT stream must be untouched');
            verifiedDctPreserved = true;
          }
        }
      }
    }

    assert(verifiedFlateDownsampled, 'Flate image must be successfully downsampled');
    assert(verifiedDctPreserved, 'DCT image must be preserved intact');
  });

  // -------------------------------------------------------------------------
  // AREA 2: comparePDF - Error Handling on Dual Corrupted / Non-PDF Inputs
  // -------------------------------------------------------------------------
  console.log('\n--- 2. comparePDF: Dual Corrupted & Non-PDF Error Handling ---');

  await test('2.1 Both inputs corrupted non-PDF strings throw matching /invalid|corrupt|failed to parse/i', async () => {
    const corrupt1 = Buffer.from('NOT_A_PDF_STRING_A');
    const corrupt2 = Buffer.from('NOT_A_PDF_STRING_B');

    await assert.rejects(
      () => PDFCore.comparePDF(corrupt1, corrupt2),
      /invalid|corrupt|failed to parse/i
    );
  });

  await test('2.2 Both inputs 0-byte Uint8Array throw matching /invalid|corrupt|failed to parse/i', async () => {
    const empty1 = new Uint8Array(0);
    const empty2 = new Uint8Array(0);

    await assert.rejects(
      () => PDFCore.comparePDF(empty1, empty2),
      /invalid|corrupt|failed to parse/i
    );
  });

  await test('2.3 Both inputs zero-filled 100-byte buffers throw matching /invalid|corrupt|failed to parse/i', async () => {
    const zeros1 = new Uint8Array(100);
    const zeros2 = new Uint8Array(100);

    await assert.rejects(
      () => PDFCore.comparePDF(zeros1, zeros2),
      /invalid|corrupt|failed to parse/i
    );
  });

  await test('2.4 Valid PDF vs corrupted non-PDF reports 100% diff without throwing', async () => {
    const valid = await createTextDoc(2, 'Valid Doc');
    const corrupt = Buffer.from('TOTALLY_BOGUS_FILE_BYTES_XYZ');

    const res = await PDFCore.comparePDF(valid, corrupt);
    assert.strictEqual(res.hasDifferences, true);
    assert.strictEqual(res.diffPages.length, 2);
    assert.strictEqual(res.diffPages[0].diffPercent, 100);
    assert.strictEqual(res.diffPages[1].diffPercent, 100);
  });

  await test('2.5 Corrupted non-PDF vs valid PDF reports 100% diff without throwing', async () => {
    const valid = await createTextDoc(2, 'Valid Doc');
    const corrupt = Buffer.from('TOTALLY_BOGUS_FILE_BYTES_XYZ');

    const res = await PDFCore.comparePDF(corrupt, valid);
    assert.strictEqual(res.hasDifferences, true);
    assert.strictEqual(res.diffPages.length, 2);
    assert.strictEqual(res.diffPages[0].diffPercent, 100);
    assert.strictEqual(res.diffPages[1].diffPercent, 100);
  });

  // -------------------------------------------------------------------------
  // AREA 3: comparePDF - ArrayBuffer Deep Cloning & Detached Buffer Resilience
  // -------------------------------------------------------------------------
  console.log('\n--- 3. comparePDF: ArrayBuffer Deep-Cloning & Detached Buffer Safety ---');

  await test('3.1 comparePDF accepts raw ArrayBuffer instances without failure', async () => {
    const validU8 = await createTextDoc(1, 'ArrayBuffer Test');
    // Create pure ArrayBuffer
    const abA = validU8.buffer.slice(validU8.byteOffset, validU8.byteOffset + validU8.byteLength);
    const abB = validU8.buffer.slice(validU8.byteOffset, validU8.byteOffset + validU8.byteLength);

    assert(abA instanceof ArrayBuffer);
    assert(abB instanceof ArrayBuffer);

    const result = await PDFCore.comparePDF(abA, abB);
    assert.strictEqual(result.hasDifferences, false);
    assert.strictEqual(result.totalDiffPixels, 0);
  });

  await test('3.2 Immediate source ArrayBuffer mutation does not affect comparePDF execution', async () => {
    const validU8 = await createTextDoc(2, 'Mutation Test');
    const abA = validU8.buffer.slice(validU8.byteOffset, validU8.byteOffset + validU8.byteLength);
    const abB = validU8.buffer.slice(validU8.byteOffset, validU8.byteOffset + validU8.byteLength);

    // Launch comparePDF
    const compPromise = PDFCore.comparePDF(abA, abB);

    // Immediately zero-fill views of both buffers synchronously
    new Uint8Array(abA).fill(0);
    new Uint8Array(abB).fill(0);

    const result = await compPromise;
    assert.strictEqual(result.hasDifferences, false, 'Cloned buffers must protect comparison from caller buffer mutation');
    assert.strictEqual(result.diffPages.length, 2);
  });

  await test('3.3 Detached ArrayBuffer simulation: Transferring caller ArrayBuffer post-call', async () => {
    const validU8 = await createTextDoc(1, 'Transfer Test');
    const abA = validU8.buffer.slice(validU8.byteOffset, validU8.byteOffset + validU8.byteLength);
    const abB = validU8.buffer.slice(validU8.byteOffset, validU8.byteOffset + validU8.byteLength);

    const compPromise = PDFCore.comparePDF(abA, abB);

    // If structuredClone with transfer is supported in Node 17+, detach abA
    if (typeof structuredClone === 'function') {
      try {
        structuredClone(abA, { transfer: [abA] });
        assert.strictEqual(abA.byteLength, 0, 'Source ArrayBuffer should now be detached');
      } catch (e) {
        // Fall back if transfer not supported on this node runtime
      }
    }

    const result = await compPromise;
    assert.strictEqual(result.hasDifferences, false, 'Detached caller ArrayBuffer must not crash comparePDF');
  });

  // -------------------------------------------------------------------------
  // AREA 4: High Concurrency & Network Egress Integrity
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Concurrency & Network Invariant ---');

  await test('4.1 High concurrency: 10 parallel compress + compare operations', async () => {
    const docA = await createTextDoc(2, 'Doc A');
    const docB = await createTextDoc(2, 'Doc B');

    const ops = [];
    for (let i = 0; i < 10; i++) {
      ops.push(PDFCore.compressPDF(docA, { level: 'recommended' }));
      ops.push(PDFCore.comparePDF(docA, docB));
    }

    const results = await Promise.all(ops);
    assert.strictEqual(results.length, 20);
  });

  await test('4.2 Pure client-side zero-egress check', async () => {
    assert.strictEqual(networkViolations, 0, 'Zero network egress violations during adversarial suite');
  });

  restoreNetTrap();

  console.log('\n======================================================');
  console.log(`Challenger M2-3 Adversarial Suite Results:`);
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  restoreNetTrap();
  console.error('Test harness crashed:', err);
  process.exit(1);
});
