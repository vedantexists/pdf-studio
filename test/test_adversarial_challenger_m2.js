/**
 * Adversarial Challenger Test Suite for Milestone 2: R2 Core Optimization & Security
 * Targets: PDFCore.compressPDF (F9) and PDFCore.comparePDF (F10)
 * 
 * Verifies:
 * 1. compressPDF: extreme/recommended/less presets, text-only PDFs, unusual/corrupt image formats,
 *    DCTDecode/JPEG handling, multi-page PDFs, output validity, and size reduction.
 * 2. comparePDF: identical PDFs, completely different PDFs, asymmetric page counts,
 *    empty/corrupted buffers, PDF.js .destroy() cleanup on normal & error paths.
 * 3. Detached buffer safety and 0 network egress invariants.
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const net = require('net');
const zlib = require('zlib');
const PDFLib = require('pdf-lib');
const { PDFDocument, PDFName, rgb, StandardFonts } = PDFLib;
const PDFCore = require('../pdf_core');

// Network trap to enforce 0 egress
let networkViolations = 0;
const trapNetwork = () => {
  const trap = (target, method) => {
    const orig = target[method];
    target[method] = function (...args) {
      networkViolations++;
      throw new Error(`CRITICAL SECURITY VIOLATION: Unauthorized network call to ${method}`);
    };
    return () => { target[method] = orig; };
  };
  const untraps = [
    trap(http, 'request'),
    trap(http, 'get'),
    trap(https, 'request'),
    trap(https, 'get'),
    trap(net, 'connect'),
  ];
  return () => untraps.forEach(u => u());
};

// Fixture generator: valid PNG
function createSyntheticPNG(width = 150, height = 150) {
  const lineLength = 1 + width * 4;
  const rawData = Buffer.alloc(lineLength * height);
  for (let y = 0; y < height; y++) {
    const offset = y * lineLength;
    rawData[offset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = offset + 1 + x * 4;
      rawData[pxOffset] = (x ^ y) & 0xff;
      rawData[pxOffset + 1] = (x * 2) & 0xff;
      rawData[pxOffset + 2] = (y * 2) & 0xff;
      rawData[pxOffset + 3] = 255;
    }
  }
  const compressedData = zlib.deflateSync(rawData);
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const toCrc = Buffer.concat([typeBuf, data]);
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < toCrc.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ toCrc[i]) & 0xFF];
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressedData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// Minimal 1x1 JPEG fixture with byteOffset=0
const standardJpegHex = 'ffd8ffe000104a46494600010101004800480000ffdb004300030202020202030202020303030304060404040404080606050609080a0a090809090a0c0f0c0a0b0e0b09090d110d0e0f101011100a0c12131210130f101010ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9';
function createTestJPEG(w = 1, h = 1) {
  let hex = standardJpegHex;
  if (w !== 1 || h !== 1) {
    // Replace width & height in SOF0 marker: ffc0 000b 08 [height: 2 bytes] [width: 2 bytes]
    const hHex = h.toString(16).padStart(4, '0');
    const wHex = w.toString(16).padStart(4, '0');
    hex = hex.replace(/ffc0000b0800010001/, `ffc0000b08${hHex}${wHex}`);
  }
  const buf = Buffer.from(hex, 'hex');
  const u8 = new Uint8Array(buf.length);
  buf.copy(u8);
  return u8;
}

async function runAdversarialM2Suite() {
  console.log('=== Milestone 2 Adversarial Stress Suite (compressPDF & comparePDF) ===\n');
  const restoreNet = trapNetwork();
  let passCount = 0;
  let failCount = 0;

  async function test(name, fn) {
    try {
      await fn();
      passCount++;
      console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
      failCount++;
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    Error: ${err.message}\n    Stack: ${err.stack}`);
    }
  }

  // =========================================================================
  // Section 1: compressPDF Stress Testing
  // =========================================================================
  console.log('--- Section 1: compressPDF Stress Testing ---');

  await test('1.1 compressPDF: Presets (extreme, recommended, less) on image-heavy PDF', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const png = createSyntheticPNG(250, 250);
    const img = await doc.embedPng(png);
    page.drawImage(img, { x: 50, y: 50, width: 500, height: 700 });
    const originalBytes = await doc.save();

    for (const preset of ['extreme', 'recommended', 'less']) {
      const compressed = await PDFCore.compressPDF(originalBytes, { level: preset });
      assert(compressed instanceof Uint8Array, `Preset ${preset} must return Uint8Array`);
      assert(compressed.length < originalBytes.length, `Preset ${preset} must reduce size`);
      const ratio = (originalBytes.length - compressed.length) / originalBytes.length;
      assert(ratio > 0.20, `Preset ${preset} must achieve >20% reduction, got ${(ratio * 100).toFixed(1)}%`);

      // Verify document validity
      const verified = await PDFDocument.load(compressed);
      assert.strictEqual(verified.getPageCount(), 1, `Preset ${preset} must preserve page count`);
    }
  });

  await test('1.2 compressPDF: Text-only PDF (no images) preservation & validity', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 5; i++) {
      const page = doc.addPage([595, 842]);
      page.drawText(`Page ${i + 1} with high density textual content without any images.`, {
        x: 50,
        y: 750,
        size: 14,
        font,
      });
    }
    const textPdf = await doc.save();

    const compressed = await PDFCore.compressPDF(textPdf, { level: 'recommended', stripMetadata: true });
    assert(compressed instanceof Uint8Array, 'Compressed text PDF must be Uint8Array');
    const verified = await PDFDocument.load(compressed);
    assert.strictEqual(verified.getPageCount(), 5, 'Must preserve all 5 pages');

    // Verify text is still extractable
    const extractedText = await PDFCore.pdfToText(compressed, { format: 'plain' });
    assert(extractedText.includes('Page 1'), 'Page 1 text must survive compression');
    assert(extractedText.includes('Page 5'), 'Page 5 text must survive compression');
  });

  await test('1.3 compressPDF: Multi-page document (30 pages) stress test', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const png = createSyntheticPNG(100, 100);
    const img = await doc.embedPng(png);

    for (let i = 0; i < 30; i++) {
      const page = doc.addPage([400, 400]);
      page.drawText(`Multi-page stress test page ${i + 1}`, { x: 20, y: 350, size: 12, font });
      if (i % 5 === 0) {
        page.drawImage(img, { x: 50, y: 50, width: 200, height: 200 });
      }
    }
    const multiPdf = await doc.save();

    const startTime = Date.now();
    const compressed = await PDFCore.compressPDF(multiPdf, { level: 'extreme' });
    const durationMs = Date.now() - startTime;
    assert(durationMs < 15000, `Multi-page compression took too long: ${durationMs}ms`);

    const verified = await PDFDocument.load(compressed);
    assert.strictEqual(verified.getPageCount(), 30, 'All 30 pages must be preserved');
  });

  await test('1.4 compressPDF: Small image (<= 60px) is skipped without error', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    // 40x40 PNG (less than 60 threshold)
    const png = createSyntheticPNG(40, 40);
    const img = await doc.embedPng(png);
    page.drawImage(img, { x: 50, y: 50, width: 40, height: 40 });
    const smallImgPdf = await doc.save();

    const compressed = await PDFCore.compressPDF(smallImgPdf, { level: 'recommended' });
    const verified = await PDFDocument.load(compressed);
    assert.strictEqual(verified.getPageCount(), 1);
  });

  await test('1.5 compressPDF: Corrupted image stream recovery / graceful fallback', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    // Create raw corrupted image stream
    const imgDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 100,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    });
    // Corrupted flate contents (not valid zlib)
    const corruptStream = PDFLib.PDFRawStream.of(imgDict, Buffer.from('CORRUPT_INVALID_ZLIB_DATA_12345'));
    const imgRef = doc.context.register(corruptStream);
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImCorrupt: imgRef }
    }));
    const corruptPdf = await doc.save();

    // Must not crash when inflateSync fails
    const compressed = await PDFCore.compressPDF(corruptPdf);
    assert(compressed instanceof Uint8Array);
    const verified = await PDFDocument.load(compressed);
    assert.strictEqual(verified.getPageCount(), 1);
  });

  await test('1.6 compressPDF: Null and empty buffer boundary guards', async () => {
    await assert.rejects(() => PDFCore.compressPDF(null), /required/i);
    await assert.rejects(() => PDFCore.compressPDF(undefined), /required/i);
    await assert.rejects(() => PDFCore.compressPDF(new Uint8Array(0)), /end of data|failed|invalid|corrupted/i);
  });

  await test('1.7 compressPDF: Detached / ArrayBuffer input safety', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const originalBytes = await doc.save();

    // Pass as pure ArrayBuffer
    const ab = originalBytes.buffer.slice(originalBytes.byteOffset, originalBytes.byteOffset + originalBytes.byteLength);
    const compressed = await PDFCore.compressPDF(ab);
    assert(compressed instanceof Uint8Array);
    const verified = await PDFDocument.load(compressed);
    assert.strictEqual(verified.getPageCount(), 1);
  });

  await test('1.8 compressPDF: Embedded 1x1 JPEG image handling without corruption', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const jpg = await doc.embedJpg(createTestJPEG(1, 1));
    page.drawImage(jpg, { x: 50, y: 50, width: 100, height: 100 });
    const originalBytes = await doc.save();

    const compressed = await PDFCore.compressPDF(originalBytes, { level: 'recommended' });
    assert(compressed instanceof Uint8Array);
    const verified = await PDFDocument.load(compressed);
    assert.strictEqual(verified.getPageCount(), 1);
  });

  await test('1.9 compressPDF: Embedded 100x100 JPEG (DCTDecode) must not be corrupted by Flate downsampling', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const jpg = await doc.embedJpg(createTestJPEG(100, 100));
    page.drawImage(jpg, { x: 50, y: 50, width: 100, height: 100 });
    const originalBytes = await doc.save();

    const compressed = await PDFCore.compressPDF(originalBytes, { level: 'recommended' });
    assert(compressed instanceof Uint8Array);
    const verified = await PDFDocument.load(compressed);
    assert.strictEqual(verified.getPageCount(), 1);

    // Verify image object in verified PDF:
    // If it was downsampled in Node without a JPEG decoder, the image filter would have been
    // erroneously flipped to FlateDecode with truncated raw JPEG header bytes treated as pixels!
    let imageInspected = false;
    for (const [ref, obj] of verified.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFRawStream) {
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of('Subtype'));
        if (subtype && subtype.toString() === '/Image') {
          imageInspected = true;
          const filter = dict.get(PDFName.of('Filter'));
          console.log(`     Inspected embedded image filter: ${filter ? filter.toString() : 'none'}`);
        }
      }
    }
    assert(imageInspected, 'Must have inspected at least one image');
  });

  await test('1.10 compressPDF: RGB DCTDecode image should not have its stream corrupted to undersized FlateDecode', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);

    // Construct an RGB Image XObject with DCTDecode (simulating a color JPEG photo)
    const imgDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 100,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    });
    // 3000 bytes simulating JPEG payload (much less than 100x100x3 = 30000 uncompressed bytes)
    const fakeJpegBytes = Buffer.alloc(3000, 0xAA);
    const imgStream = PDFLib.PDFRawStream.of(imgDict, fakeJpegBytes);
    const imgRef = doc.context.register(imgStream);
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImRgb: imgRef }
    }));
    const originalPdf = await doc.save();

    const compressed = await PDFCore.compressPDF(originalPdf, { level: 'recommended' });
    const verified = await PDFDocument.load(compressed);

    for (const [ref, obj] of verified.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFRawStream) {
        const dict = obj.dict;
        if (dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
          const filter = dict.get(PDFName.of('Filter'))?.toString();
          const cs = dict.get(PDFName.of('ColorSpace'))?.toString();
          if (filter?.includes('FlateDecode') && cs?.includes('DeviceRGB')) {
            const w = dict.get(PDFName.of('Width')).asNumber();
            const h = dict.get(PDFName.of('Height')).asNumber();
            const uncompressed = zlib.inflateSync(obj.getContents());
            const expectedBytes = w * h * 3;
            assert.strictEqual(
              uncompressed.length,
              expectedBytes,
              `CRITICAL BUG: DeviceRGB FlateDecode stream is truncated! Expected ${expectedBytes} bytes for ${w}x${h} RGB raster, got ${uncompressed.length} bytes (3x shortage)!`
            );
          }
        }
      }
    }
  });

  // =========================================================================
  // Section 2: comparePDF Stress Testing
  // =========================================================================
  console.log('\n--- Section 2: comparePDF Stress Testing ---');

  await test('2.1 comparePDF: Identical multi-page documents (0% diff)', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 3; i++) {
      const page = doc.addPage([400, 600]);
      page.drawText(`Consistent Page ${i + 1} content`, { x: 50, y: 500, size: 14, font });
    }
    const pdfBytes = await doc.save();

    const result = await PDFCore.comparePDF(pdfBytes, pdfBytes);
    assert.strictEqual(result.hasDifferences, false, 'Identical documents must have hasDifferences=false');
    assert.strictEqual(result.totalDiffPixels, 0, 'Identical documents must have 0 totalDiffPixels');
    assert.strictEqual(result.diffPages.length, 3, 'Must report all 3 pages');
    for (const p of result.diffPages) {
      assert.strictEqual(p.diffPixels, 0);
      assert.strictEqual(p.diffPercent, 0);
    }
  });

  await test('2.2 comparePDF: Distinct documents with substantial textual discrepancy', async () => {
    const docA = await PDFDocument.create();
    const fontA = await docA.embedFont(StandardFonts.Helvetica);
    const pageA = docA.addPage([400, 600]);
    pageA.drawText('Original Contract: Party A agrees to pay $10,000 to Party B upon delivery.', { x: 30, y: 500, size: 12, font: fontA });
    const bytesA = await docA.save();

    const docB = await PDFDocument.create();
    const fontB = await docB.embedFont(StandardFonts.Helvetica);
    const pageB = docB.addPage([400, 600]);
    pageB.drawText('Modified Contract: Party A agrees to pay $999,999 to Party C unconditionally immediately.', { x: 30, y: 500, size: 12, font: fontB });
    const bytesB = await docB.save();

    const result = await PDFCore.comparePDF(bytesA, bytesB);
    assert.strictEqual(result.hasDifferences, true, 'Differing contracts must detect differences');
    assert(result.totalDiffPixels > 0, 'totalDiffPixels must be > 0');
    assert(result.diffPages[0].diffPercent > 0, 'diffPercent must be > 0');
  });

  await test('2.3 comparePDF: Asymmetric page counts (docA 5 pages vs docB 2 pages)', async () => {
    const docA = await PDFDocument.create();
    const fontA = await docA.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 5; i++) {
      const p = docA.addPage([400, 600]);
      p.drawText(`Document A Page ${i + 1}`, { x: 50, y: 500, size: 14, font: fontA });
    }
    const bytesA = await docA.save();

    const docB = await PDFDocument.create();
    const fontB = await docB.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 2; i++) {
      const p = docB.addPage([400, 600]);
      p.drawText(`Document A Page ${i + 1}`, { x: 50, y: 500, size: 14, font: fontB });
    }
    const bytesB = await docB.save();

    const result = await PDFCore.comparePDF(bytesA, bytesB);
    assert.strictEqual(result.hasDifferences, true);
    assert.strictEqual(result.diffPages.length, 5, 'diffPages must cover the max page count (5)');
    // Pages 0 and 1 are identical
    assert.strictEqual(result.diffPages[0].diffPercent, 0);
    assert.strictEqual(result.diffPages[1].diffPercent, 0);
    // Pages 2, 3, 4 are missing from docB -> 100% diff
    for (let i = 2; i < 5; i++) {
      assert.strictEqual(result.diffPages[i].diffPercent, 100.0, `Page ${i + 1} must be 100% diff`);
      assert(result.diffPages[i].diffPixels > 0, `Page ${i + 1} diffPixels must be positive`);
    }
  });

  await test('2.4 comparePDF: Asymmetric page counts (docA 1 page vs docB 4 pages)', async () => {
    const docA = await PDFDocument.create();
    const font = await docA.embedFont(StandardFonts.Helvetica);
    const pA = docA.addPage([400, 600]);
    pA.drawText('Root Page', { x: 50, y: 500, size: 14, font });
    const bytesA = await docA.save();

    const docB = await PDFDocument.create();
    const fontB = await docB.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 4; i++) {
      const p = docB.addPage([400, 600]);
      p.drawText(i === 0 ? 'Root Page' : `Added Page ${i + 1}`, { x: 50, y: 500, size: 14, font: fontB });
    }
    const bytesB = await docB.save();

    const result = await PDFCore.comparePDF(bytesA, bytesB);
    assert.strictEqual(result.hasDifferences, true);
    assert.strictEqual(result.diffPages.length, 4);
    assert.strictEqual(result.diffPages[0].diffPercent, 0);
    for (let i = 1; i < 4; i++) {
      assert.strictEqual(result.diffPages[i].diffPercent, 100.0);
    }
  });

  await test('2.5 comparePDF: Null, undefined, and boundary checks', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const valid = await doc.save();

    await assert.rejects(() => PDFCore.comparePDF(null, valid), /required/i);
    await assert.rejects(() => PDFCore.comparePDF(valid, null), /required/i);
    await assert.rejects(() => PDFCore.comparePDF(undefined, undefined), /required/i);
  });

  await test('2.6 comparePDF: Corrupted / non-PDF buffer handling', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const valid = await doc.save();
    const corrupted = Buffer.from('NOT_A_VALID_PDF_HEADER_1234567890');

    // Valid vs Corrupted
    const resA = await PDFCore.comparePDF(valid, corrupted);
    assert.strictEqual(resA.hasDifferences, true);
    assert.strictEqual(resA.diffPages.length, 1);
    assert.strictEqual(resA.diffPages[0].diffPercent, 100.0);

    // Corrupted vs Valid
    const resB = await PDFCore.comparePDF(corrupted, valid);
    assert.strictEqual(resB.hasDifferences, true);
    assert.strictEqual(resB.diffPages.length, 1);
    assert.strictEqual(resB.diffPages[0].diffPercent, 100.0);
  });

  await test('2.7 comparePDF: PDF.js .destroy() lifecycle on successful comparison', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();

    // Spy on PDF.js getDocument
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const origGetDoc = pdfjs.getDocument;
    let destroyCallCount = 0;

    pdfjs.getDocument = function (...args) {
      const task = origGetDoc.apply(this, args);
      const origPromise = task.promise;
      task.promise = origPromise.then(pdfDoc => {
        const origDestroy = pdfDoc.destroy;
        pdfDoc.destroy = function () {
          destroyCallCount++;
          return origDestroy.apply(this, arguments);
        };
        return pdfDoc;
      });
      return task;
    };

    try {
      await PDFCore.comparePDF(bytes, bytes);
      assert.strictEqual(destroyCallCount, 2, `Both docA and docB must be destroyed (called ${destroyCallCount} times)`);
    } finally {
      pdfjs.getDocument = origGetDoc;
    }
  });

  await test('2.8 comparePDF: PDF.js .destroy() lifecycle when comparison error occurs', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();

    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const origGetDoc = pdfjs.getDocument;
    let destroyCallCount = 0;

    pdfjs.getDocument = function (...args) {
      const task = origGetDoc.apply(this, args);
      const origPromise = task.promise;
      task.promise = origPromise.then(pdfDoc => {
        const origDestroy = pdfDoc.destroy;
        pdfDoc.destroy = function () {
          destroyCallCount++;
          return origDestroy.apply(this, arguments);
        };
        // Inject error during getPage
        pdfDoc.getPage = async function () {
          throw new Error('Simulated internal page processing failure');
        };
        return pdfDoc;
      });
      return task;
    };

    try {
      // comparePDF handles inner page errors and falls back, but finally block must destroy
      await PDFCore.comparePDF(bytes, bytes);
      assert.strictEqual(destroyCallCount, 2, `Both docA and docB must be destroyed even if getPage fails (called ${destroyCallCount} times)`);
    } finally {
      pdfjs.getDocument = origGetDoc;
    }
  });

  await test('2.9 comparePDF: PDF.js .destroy() lifecycle when docA.destroy() rejects', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();

    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const origGetDoc = pdfjs.getDocument;
    let docBDestroyed = false;
    let callIdx = 0;

    pdfjs.getDocument = function (...args) {
      const currentCall = ++callIdx;
      const task = origGetDoc.apply(this, args);
      const origPromise = task.promise;
      task.promise = origPromise.then(pdfDoc => {
        if (currentCall % 2 === 1) {
          // docA rejects
          pdfDoc.destroy = async function () {
            throw new Error('Simulated docA.destroy rejection');
          };
        } else {
          // docB must still be destroyed
          const origD = pdfDoc.destroy;
          pdfDoc.destroy = async function () {
            docBDestroyed = true;
            return origD.apply(this, arguments);
          };
        }
        return pdfDoc;
      });
      return task;
    };

    try {
      await PDFCore.comparePDF(bytes, bytes);
      assert(docBDestroyed, 'docB must be destroyed even if docA.destroy() throws');
    } finally {
      pdfjs.getDocument = origGetDoc;
    }
  });

  await test('2.10 comparePDF: Detached buffer protection across calls', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytesA = await doc.save();
    const bytesB = await doc.save();

    // Call comparePDF
    const p = PDFCore.comparePDF(bytesA, bytesB);
    // Mutate original bytes buffer concurrently
    bytesA[0] = 0;
    bytesA[1] = 0;
    const res = await p;
    assert.strictEqual(res.hasDifferences, false, 'Mutating bytesA after call must not affect comparison (buffer slicing)');
  });

  await test('2.11 comparePDF: Both inputs corrupted / invalid non-PDF buffers', async () => {
    const corrupt1 = Buffer.from('NOT_A_VALID_PDF_1');
    const corrupt2 = Buffer.from('NOT_A_VALID_PDF_2');
    await assert.rejects(
      () => PDFCore.comparePDF(corrupt1, corrupt2),
      /invalid|corrupt|failed to parse/i
    );
  });

  // =========================================================================
  // Section 3: Invariant & Security Verification
  // =========================================================================
  console.log('\n--- Section 3: Invariants & Security ---');

  await test('3.1 Pure Client-Side Zero-Egress Invariant during compression & comparison', async () => {
    assert.strictEqual(networkViolations, 0, 'Zero network requests allowed');
  });

  restoreNet();

  console.log('\n======================================================');
  console.log(`Milestone 2 Adversarial Stress Suite Results:`);
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAdversarialM2Suite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
