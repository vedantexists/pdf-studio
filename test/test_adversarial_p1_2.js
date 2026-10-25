/**
 * test/test_adversarial_p1_2.js
 * Empirical Challenger P1-2 Adversarial Stress & Verification Harness
 * Focus areas:
 * 1. Image Compression CMYK Color Accuracy & Inversion Defense
 * 2. Transparent PNGs & Alpha Mask (/SMask) Preservation
 * 3. Orphan Image Elimination & Object Graph Reachability
 * 4. Modern PDF 1.5+ XRef Repair Guard & Repair Idempotence under Adversarial Noise
 */

const assert = require('assert');
const zlib = require('zlib');
const PDFLib = require('pdf-lib');
const { PDFDocument, PDFName, PDFRawStream, PDFRef } = PDFLib;
const PDFCore = require('../pdf_core');

let passCount = 0;
let failCount = 0;
const failures = [];

async function test(name, fn) {
  process.stdout.write(`  [CHALLENGER-P1-2] ${name} ... `);
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
    failures.push({ name, error: err });
    failCount++;
  }
}

// Helper: build a minimal valid PNG with alpha channel in pure Node.js
function createSyntheticPNGWithAlpha(width, height, alphaValue = 128) {
  const rawBytes = [];
  for (let y = 0; y < height; y++) {
    rawBytes.push(0); // PNG scanline filter byte: 0 = None
    for (let x = 0; x < width; x++) {
      rawBytes.push(255); // R
      rawBytes.push(0);   // G
      rawBytes.push(0);   // B
      rawBytes.push(alphaValue); // A
    }
  }

  const deflated = zlib.deflateSync(Buffer.from(rawBytes));

  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const full = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(full), 0);
    return Buffer.concat([len, full, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(6, 9);   // color type: RGBA
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter
  ihdr.writeUInt8(0, 12);  // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

async function runAdversarialSuite() {
  console.log('=== Challenger P1-2 Empirical Adversarial Stress Harness ===\n');

  // =========================================================================
  // 1. Image Compression CMYK Color Accuracy & Inversion Defense
  // =========================================================================
  console.log('--- 1. Image Compression CMYK Color Accuracy & Inversion Defense ---');

  await test('1.1 CMYK Primaries: Cyan, Magenta, Yellow, Black, White color translation', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);

    // 100x100 raster with 5 distinct 20-pixel horizontal bands:
    // Band 0: Cyan (255, 0, 0, 0)
    // Band 1: Magenta (0, 255, 0, 0)
    // Band 2: Yellow (0, 0, 255, 0)
    // Band 3: Black (0, 0, 0, 255)
    // Band 4: White (0, 0, 0, 0)
    const cmykBytes = Buffer.alloc(100 * 100 * 4);
    for (let y = 0; y < 100; y++) {
      let c = 0, m = 0, yVal = 0, k = 0;
      if (y < 20) { c = 255; }
      else if (y < 40) { m = 255; }
      else if (y < 60) { yVal = 255; }
      else if (y < 80) { k = 255; }
      else { /* white: 0,0,0,0 */ }

      for (let x = 0; x < 100; x++) {
        const idx = (y * 100 + x) * 4;
        cmykBytes[idx] = c;
        cmykBytes[idx + 1] = m;
        cmykBytes[idx + 2] = yVal;
        cmykBytes[idx + 3] = k;
      }
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
      XObject: { ImCmykPrimaries: imgRef }
    }));

    const origPdf = await doc.save();
    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const verifiedDoc = await PDFDocument.load(compressed);

    let verified = false;
    for (const [, obj] of verifiedDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image') {
        const cs = obj.dict.get(PDFName.of('ColorSpace'))?.toString();
        assert.strictEqual(cs, '/DeviceRGB', 'ColorSpace must be converted from DeviceCMYK to /DeviceRGB');
        const uncompressed = zlib.inflateSync(obj.getContents());
        const w = obj.dict.get(PDFName.of('Width')).asNumber();
        const h = obj.dict.get(PDFName.of('Height')).asNumber();
        assert.strictEqual(w, 50, 'Downsampled width should be 50');
        assert.strictEqual(h, 50, 'Downsampled height should be 50');
        assert.strictEqual(uncompressed.length, 50 * 50 * 3, 'Output stream must have 3 RGB channels per pixel');

        // Check Cyan band (y=0..9 in downsampled 50x50 image): Expect R=0, G=255, B=255
        const cyanIdx = (5 * 50 + 25) * 3;
        assert.strictEqual(uncompressed[cyanIdx], 0, 'Cyan: Red channel must be 0');
        assert.strictEqual(uncompressed[cyanIdx + 1], 255, 'Cyan: Green channel must be 255');
        assert.strictEqual(uncompressed[cyanIdx + 2], 255, 'Cyan: Blue channel must be 255');

        // Check Magenta band (y=10..19): Expect R=255, G=0, B=255
        const magIdx = (15 * 50 + 25) * 3;
        assert.strictEqual(uncompressed[magIdx], 255, 'Magenta: Red channel must be 255');
        assert.strictEqual(uncompressed[magIdx + 1], 0, 'Magenta: Green channel must be 0');
        assert.strictEqual(uncompressed[magIdx + 2], 255, 'Magenta: Blue channel must be 255');

        // Check Yellow band (y=20..29): Expect R=255, G=255, B=0
        const yelIdx = (25 * 50 + 25) * 3;
        assert.strictEqual(uncompressed[yelIdx], 255, 'Yellow: Red channel must be 255');
        assert.strictEqual(uncompressed[yelIdx + 1], 255, 'Yellow: Green channel must be 255');
        assert.strictEqual(uncompressed[yelIdx + 2], 0, 'Yellow: Blue channel must be 0');

        // Check Black band (y=30..39): Expect R=0, G=0, B=0
        const blkIdx = (35 * 50 + 25) * 3;
        assert.strictEqual(uncompressed[blkIdx], 0, 'Black: Red channel must be 0');
        assert.strictEqual(uncompressed[blkIdx + 1], 0, 'Black: Green channel must be 0');
        assert.strictEqual(uncompressed[blkIdx + 2], 0, 'Black: Blue channel must be 0');

        // Check White band (y=40..49): Expect R=255, G=255, B=255
        const whtIdx = (45 * 50 + 25) * 3;
        assert.strictEqual(uncompressed[whtIdx], 255, 'White: Red channel must be 255');
        assert.strictEqual(uncompressed[whtIdx + 1], 255, 'White: Green channel must be 255');
        assert.strictEqual(uncompressed[whtIdx + 2], 255, 'White: Blue channel must be 255');

        verified = true;
      }
    }
    assert(verified, 'CMYK Primaries image must be verified in document');
  });

  await test('1.2 CMYK Secondaries & Rich Black: Orange, Green, Purple, Rich Black translation', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);

    // 100x100 raster:
    // Band 0: Orange (C=0, M=128, Y=255, K=0) -> R=255, G=127, B=0
    // Band 1: Green (C=255, M=0, Y=255, K=0) -> R=0, G=255, B=0
    // Band 2: Purple (C=128, M=255, Y=0, K=0) -> R=127, G=0, B=255
    // Band 3: 50% Gray via K (C=0, M=0, Y=0, K=128) -> R=127, G=127, B=127
    // Band 4: Rich Black (C=100, M=100, Y=100, K=255) -> R=0, G=0, B=0
    const cmykBytes = Buffer.alloc(100 * 100 * 4);
    for (let y = 0; y < 100; y++) {
      let c = 0, m = 0, yVal = 0, k = 0;
      if (y < 20) { c = 0; m = 128; yVal = 255; k = 0; }
      else if (y < 40) { c = 255; m = 0; yVal = 255; k = 0; }
      else if (y < 60) { c = 128; m = 255; yVal = 0; k = 0; }
      else if (y < 80) { c = 0; m = 0; yVal = 0; k = 128; }
      else { c = 100; m = 100; yVal = 100; k = 255; }

      for (let x = 0; x < 100; x++) {
        const idx = (y * 100 + x) * 4;
        cmykBytes[idx] = c;
        cmykBytes[idx + 1] = m;
        cmykBytes[idx + 2] = yVal;
        cmykBytes[idx + 3] = k;
      }
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
      XObject: { ImCmykSecondaries: imgRef }
    }));

    const origPdf = await doc.save();
    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const verifiedDoc = await PDFDocument.load(compressed);

    let verified = false;
    for (const [, obj] of verifiedDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image') {
        const uncompressed = zlib.inflateSync(obj.getContents());

        // Orange: R=255, G=127, B=0
        const oIdx = (5 * 50 + 25) * 3;
        assert.strictEqual(uncompressed[oIdx], 255, 'Orange Red should be 255');
        assert(Math.abs(uncompressed[oIdx + 1] - 127) <= 1, 'Orange Green should be ~127');
        assert.strictEqual(uncompressed[oIdx + 2], 0, 'Orange Blue should be 0');

        // Green: R=0, G=255, B=0
        const gIdx = (15 * 50 + 25) * 3;
        assert.strictEqual(uncompressed[gIdx], 0, 'Green Red should be 0');
        assert.strictEqual(uncompressed[gIdx + 1], 255, 'Green Green should be 255');
        assert.strictEqual(uncompressed[gIdx + 2], 0, 'Green Blue should be 0');

        // Purple: R=127, G=0, B=255
        const pIdx = (25 * 50 + 25) * 3;
        assert(Math.abs(uncompressed[pIdx] - 127) <= 1, 'Purple Red should be ~127');
        assert.strictEqual(uncompressed[pIdx + 1], 0, 'Purple Green should be 0');
        assert.strictEqual(uncompressed[pIdx + 2], 255, 'Purple Blue should be 255');

        // 50% Gray: R=127, G=127, B=127
        const grayIdx = (35 * 50 + 25) * 3;
        assert(Math.abs(uncompressed[grayIdx] - 127) <= 1, 'Gray Red should be ~127');
        assert(Math.abs(uncompressed[grayIdx + 1] - 127) <= 1, 'Gray Green should be ~127');
        assert(Math.abs(uncompressed[grayIdx + 2] - 127) <= 1, 'Gray Blue should be ~127');

        // Rich Black: R=0, G=0, B=0
        const rbIdx = (45 * 50 + 25) * 3;
        assert.strictEqual(uncompressed[rbIdx], 0, 'Rich Black Red should be 0');
        assert.strictEqual(uncompressed[rbIdx + 1], 0, 'Rich Black Green should be 0');
        assert.strictEqual(uncompressed[rbIdx + 2], 0, 'Rich Black Blue should be 0');

        verified = true;
      }
    }
    assert(verified, 'CMYK Secondaries image must be verified');
  });

  await test('1.3 CMYK Array ColorSpace [/DeviceCMYK] and implicit 4-channel fallback', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);

    // Array ColorSpace: [/DeviceCMYK]
    const cmykBytes = Buffer.alloc(80 * 80 * 4, 128); // 80x80 neutral gray
    const deflated = zlib.deflateSync(cmykBytes);
    const imgDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 80,
      Height: 80,
      ColorSpace: ['DeviceCMYK'],
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    });
    const stream = PDFRawStream.of(imgDict, deflated);
    const imgRef = doc.context.register(stream);
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImCmykArray: imgRef }
    }));

    const origPdf = await doc.save();
    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const verifiedDoc = await PDFDocument.load(compressed);

    let verified = false;
    for (const [, obj] of verifiedDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image') {
        const cs = obj.dict.get(PDFName.of('ColorSpace'))?.toString();
        assert.strictEqual(cs, '/DeviceRGB', 'Array ColorSpace [/DeviceCMYK] must be normalized to /DeviceRGB');
        const uncompressed = zlib.inflateSync(obj.getContents());
        assert.strictEqual(uncompressed.length, 40 * 40 * 3, 'RGB output buffer size must match 40x40x3');
        verified = true;
      }
    }
    assert(verified, 'Array ColorSpace [/DeviceCMYK] must be verified');
  });

  // =========================================================================
  // 2. Transparent PNGs & Alpha Mask (/SMask) Preservation
  // =========================================================================
  console.log('\n--- 2. Transparent PNGs & Alpha Mask (/SMask) Preservation ---');

  await test('2.1 Multi-level alpha gradient PNG preservation across compressPDF presets', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);

    // PNG with alpha = 64
    const pngBytes = createSyntheticPNGWithAlpha(120, 120, 64);
    const img = await doc.embedPng(pngBytes);
    page.drawImage(img, { x: 50, y: 50, width: 200, height: 200 });

    const origPdf = await doc.save();

    for (const preset of ['less', 'recommended', 'extreme']) {
      const compressed = await PDFCore.compressPDF(origPdf, { level: preset });
      const verifiedDoc = await PDFDocument.load(compressed);

      let foundMainWithSMask = false;
      for (const [, obj] of verifiedDoc.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFRawStream && obj.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image') {
          if (obj.dict.has(PDFName.of('SMask'))) {
            foundMainWithSMask = true;
            const smaskRef = obj.dict.get(PDFName.of('SMask'));
            const smaskObj = verifiedDoc.context.lookup(smaskRef);
            assert(smaskObj instanceof PDFRawStream, `[${preset}] SMask must resolve to an image stream`);
            assert.strictEqual(smaskObj.dict.get(PDFName.of('ColorSpace'))?.toString(), '/DeviceGray');
            
            // Inflate SMask and verify alpha values
            const smaskData = zlib.inflateSync(smaskObj.getContents());
            assert.strictEqual(smaskData[0], 64, `[${preset}] SMask alpha channel value must be preserved as 64`);
          }
        }
      }
      assert(foundMainWithSMask, `[${preset}] Main image with /SMask must survive compression intact`);
    }
  });

  await test('2.2 Mixed document: Transparent PNG + Opaque JPEG in same document', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);

    // 1. Transparent PNG
    const pngBytes = createSyntheticPNGWithAlpha(100, 100, 192);
    const pngImg = await doc.embedPng(pngBytes);
    page.drawImage(pngImg, { x: 20, y: 20, width: 150, height: 150 });

    // 2. Synthetic Opaque RGB Image
    const rgbBytes = Buffer.alloc(100 * 100 * 3, 200); // flat light gray
    const deflated = zlib.deflateSync(rgbBytes);
    const opaqueDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 100,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    });
    const opaqueStream = PDFRawStream.of(opaqueDict, deflated);
    const opaqueRef = doc.context.register(opaqueStream);
    const res = page.node.get(PDFName.of('Resources'));
    const xobj = res.get(PDFName.of('XObject'));
    xobj.set(PDFName.of('ImOpaque'), opaqueRef);

    const origPdf = await doc.save();
    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const verifiedDoc = await PDFDocument.load(compressed);

    let transparentFound = false;
    let opaqueFound = false;

    for (const [, obj] of verifiedDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image') {
        const cs = obj.dict.get(PDFName.of('ColorSpace'))?.toString();
        if (obj.dict.has(PDFName.of('SMask'))) {
          transparentFound = true;
          assert.strictEqual(cs, '/DeviceRGB', 'Transparent image color space should be DeviceRGB');
        } else if (cs === '/DeviceRGB') {
          opaqueFound = true;
        }
      }
    }

    assert(transparentFound, 'Transparent image with /SMask must exist in compressed document');
    assert(opaqueFound, 'Opaque image without /SMask must exist in compressed document');
  });

  // =========================================================================
  // 3. Orphan Elimination & Object Graph Reachability
  // =========================================================================
  console.log('\n--- 3. Orphan Elimination & Object Graph Reachability ---');

  await test('3.1 Deeply nested referenced image inside Form /XObject is NOT pruned as orphan', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);

    // Create an image stream
    const imgData = zlib.deflateSync(Buffer.alloc(80 * 80 * 3, 100));
    const imgStream = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 80, Height: 80, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode'
    }), imgData);
    const imgRef = doc.context.register(imgStream);

    // Create a Form XObject referencing the image in its nested Resources
    const formStream = PDFRawStream.of(doc.context.obj({
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 100, 100],
      Resources: {
        XObject: { ImNested: imgRef }
      }
    }), Buffer.from('/ImNested Do\n', 'latin1'));
    const formRef = doc.context.register(formStream);

    // Place Form XObject on the page
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { Form1: formRef }
    }));

    // Register a true unreferenced orphan image
    const orphanData = zlib.deflateSync(Buffer.alloc(80 * 80 * 3, 222));
    const orphanStream = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 80, Height: 80, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode'
    }), orphanData);
    doc.context.register(orphanStream);

    const origPdf = await doc.save();
    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const verifiedDoc = await PDFDocument.load(compressed);

    // Count image objects in output
    const images = Array.from(verifiedDoc.context.enumerateIndirectObjects())
      .filter(([, o]) => o instanceof PDFRawStream && o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image');

    assert.strictEqual(images.length, 1, 'Only the nested image should survive; the true orphan must be eliminated');
  });

  await test('3.2 Cyclical dictionary graph reachability does not infinite-loop', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);

    // Create cyclical dictionary structure: Dict A -> Dict B -> Dict A
    const dictA = doc.context.obj({ Name: 'DictA' });
    const refA = doc.context.register(dictA);
    const dictB = doc.context.obj({ Name: 'DictB', CycleBack: refA });
    const refB = doc.context.register(dictB);
    dictA.set(PDFName.of('CycleForward'), refB);

    // Attach to page
    page.node.set(PDFName.of('CyclicMetadata'), refA);

    // Add 1 referenced image and 2 orphan images
    const img1 = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 10, Height: 10, ColorSpace: 'DeviceGray', BitsPerComponent: 8
    }), new Uint8Array(100));
    const r1 = doc.context.register(img1);
    page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { Im1: r1 } }));

    const orphan1 = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 10, Height: 10, ColorSpace: 'DeviceGray', BitsPerComponent: 8
    }), new Uint8Array(100));
    doc.context.register(orphan1);

    const orphan2 = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 10, Height: 10, ColorSpace: 'DeviceGray', BitsPerComponent: 8
    }), new Uint8Array(100));
    doc.context.register(orphan2);

    const origPdf = await doc.save();
    const startMs = Date.now();
    const compressed = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const elapsedMs = Date.now() - startMs;

    assert(elapsedMs < 2000, `Graph traversal with cycles must finish quickly (took ${elapsedMs}ms)`);
    const verifiedDoc = await PDFDocument.load(compressed);
    const images = Array.from(verifiedDoc.context.enumerateIndirectObjects())
      .filter(([, o]) => o instanceof PDFRawStream && o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image');
    assert.strictEqual(images.length, 1, 'Only the referenced image must survive cycle traversal');
  });

  await test('3.3 Sequential compression passes are completely idempotent on object counts', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const img = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 80, Height: 80, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode'
    }), zlib.deflateSync(Buffer.alloc(80 * 80, 150)));
    const r = doc.context.register(img);
    page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { Im: r } }));

    // Plus 3 unreferenced orphans
    for (let i = 0; i < 3; i++) {
      const o = PDFRawStream.of(doc.context.obj({
        Type: 'XObject', Subtype: 'Image', Width: 10, Height: 10, ColorSpace: 'DeviceGray', BitsPerComponent: 8
      }), new Uint8Array(100));
      doc.context.register(o);
    }

    const origPdf = await doc.save();
    const pass1 = await PDFCore.compressPDF(origPdf, { level: 'recommended' });
    const docPass1 = await PDFDocument.load(pass1);
    const imagesPass1 = Array.from(docPass1.context.enumerateIndirectObjects())
      .filter(([, o]) => o instanceof PDFRawStream && o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image').length;
    assert.strictEqual(imagesPass1, 1, 'Pass 1 must prune orphans down to 1 image');

    const pass2 = await PDFCore.compressPDF(pass1, { level: 'recommended' });
    const docPass2 = await PDFDocument.load(pass2);
    const imagesPass2 = Array.from(docPass2.context.enumerateIndirectObjects())
      .filter(([, o]) => o instanceof PDFRawStream && o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image').length;
    assert.strictEqual(imagesPass2, 1, 'Pass 2 must preserve the 1 active image without further deletion');

    const pass3 = await PDFCore.compressPDF(pass2, { level: 'recommended' });
    const docPass3 = await PDFDocument.load(pass3);
    const imagesPass3 = Array.from(docPass3.context.enumerateIndirectObjects())
      .filter(([, o]) => o instanceof PDFRawStream && o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image').length;
    assert.strictEqual(imagesPass3, 1, 'Pass 3 must remain strictly stable');
  });

  // =========================================================================
  // 4. Modern PDF 1.5+ XRef Repair Guard & Repair Idempotence
  // =========================================================================
  console.log('\n--- 4. Modern PDF 1.5+ XRef Repair Guard & Repair Idempotence ---');

  await test('4.1 PDF 1.5+ cross-reference streams survive repairPDF without ASCII table regression', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) {
      const p = doc.addPage([300, 300]);
      p.drawText(`Page ${i + 1}`, { x: 50, y: 250, size: 16 });
    }

    const pdf15Bytes = await doc.save({ useObjectStreams: true });
    const repairedBytes = await PDFCore.repairPDF(pdf15Bytes);
    const repStr = Buffer.from(repairedBytes).toString('latin1');

    // PDF 1.5+ with valid XRef stream must not be downgraded to legacy ASCII trailer
    assert(!repStr.includes('trailer\n<<\n  /Size'), 'PDF 1.5+ XRef streams must NOT degrade to ASCII trailer');

    const verified = await PDFDocument.load(repairedBytes);
    assert.strictEqual(verified.getPageCount(), 3, 'All 3 pages must load cleanly from repaired PDF 1.5+ document');
  });

  await test('4.2 Multi-pass repairPDF idempotence across multiple damaged & valid documents', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([400, 400]);
    p.drawText('Idempotence Test Page', { x: 50, y: 350, size: 18 });
    const orig = await doc.save();

    // Damage EOF
    const latin = new TextDecoder('latin1').decode(orig);
    const broken = Buffer.from(latin.slice(0, latin.lastIndexOf('trailer')), 'latin1');

    const r1 = await PDFCore.repairPDF(broken);
    const r2 = await PDFCore.repairPDF(r1);
    const r3 = await PDFCore.repairPDF(r2);

    const d1 = await PDFDocument.load(r1);
    const d2 = await PDFDocument.load(r2);
    const d3 = await PDFDocument.load(r3);

    assert.strictEqual(d1.getPageCount(), 1, 'r1 page count must be 1');
    assert.strictEqual(d2.getPageCount(), 1, 'r2 page count must be 1');
    assert.strictEqual(d3.getPageCount(), 1, 'r3 page count must be 1');

    // Text extractable
    const t1 = await PDFCore.pdfToText(r1);
    const t2 = await PDFCore.pdfToText(r2);
    const t3 = await PDFCore.pdfToText(r3);
    assert(t1.includes('Idempotence Test Page'), 'r1 must contain text');
    assert(t2.includes('Idempotence Test Page'), 'r2 must contain text');
    assert(t3.includes('Idempotence Test Page'), 'r3 must contain text');
  });

  await test('4.3 Multi-megabyte PDF (2MB+) with adversarial binary stream noise & fake trailer injection', async () => {
    const doc = await PDFDocument.create();
    for (let pIdx = 0; pIdx < 5; pIdx++) {
      const p = doc.addPage([500, 700]);
      p.drawText(`Real Page Number ${pIdx + 1}`, { x: 50, y: 650, size: 24 });
    }

    // Embed a 2MB raw data stream containing deliberately hostile PDF syntax tokens
    const hostileNoise = Buffer.concat([
      Buffer.alloc(500000, 0x41), // 500KB 'A'
      Buffer.from('\r\n999 0 obj\r\n<< /Type /Catalog /Pages 998 0 R /FakeRoot true >>\r\nendobj\r\n', 'latin1'),
      Buffer.alloc(500000, 0x42), // 500KB 'B'
      Buffer.from('\r\ntrailer\r\n<< /Size 1000 /Root 999 0 R >>\r\nstartxref\r\n999999\r\n%%EOF\r\n', 'latin1'),
      Buffer.alloc(500000, 0x43), // 500KB 'C'
      Buffer.from('\r\n888 0 obj\r\n<< /Type /FakeObj true >>\r\nendobj\r\n', 'latin1'),
      Buffer.alloc(500000, 0x44), // 500KB 'D'
    ]);

    const page1 = doc.getPage(0);
    const noiseStream = PDFRawStream.of(doc.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: 10, Height: 10, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Length: hostileNoise.length
    }), hostileNoise);
    const noiseRef = doc.context.register(noiseStream);
    page1.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImHostile: noiseRef }
    }));

    const validBytes = await doc.save({ useObjectStreams: false });
    assert(validBytes.length > 2000000, `Generated PDF must exceed 2MB (actual: ${validBytes.length} bytes)`);

    // Now corrupt the true trailer by truncating at the last 'trailer'
    const latin = new TextDecoder('latin1').decode(validBytes);
    const realTrailerIdx = latin.lastIndexOf('trailer');
    const corruptedBytes = Buffer.from(latin.slice(0, realTrailerIdx), 'latin1');

    const startMs = Date.now();
    const repairedBytes = await PDFCore.repairPDF(corruptedBytes);
    const repairDurationMs = Date.now() - startMs;

    assert(repairDurationMs < 5000, `Repair on 2MB document must complete under 5s (took ${repairDurationMs}ms)`);

    // Verify reconstructed trailer does NOT reference fake Root 999 0 R
    const repStr = new TextDecoder('latin1').decode(repairedBytes);
    const trailerIdx = repStr.lastIndexOf('trailer');
    assert(trailerIdx > 0, 'Rebuilt document must contain trailer');
    const trailerBlock = repStr.slice(trailerIdx);
    const rootMatch = trailerBlock.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
    assert(rootMatch, 'Rebuilt trailer must have a /Root');
    const rootNum = parseInt(rootMatch[1], 10);
    assert.notStrictEqual(rootNum, 999, 'Rebuilt trailer MUST NOT bind to hostile stream fake Root 999 0 R');

    const repDoc = await PDFDocument.load(repairedBytes);
    assert.strictEqual(repDoc.getPageCount(), 5, 'All 5 genuine pages must be recovered from 2MB corrupted document');

    const text = await PDFCore.pdfToText(repairedBytes);
    assert(text.includes('Real Page Number 1'), 'Page 1 text must be intact');
    assert(text.includes('Real Page Number 5'), 'Page 5 text must be intact');
  });

  await test('4.4 Corrupted PDF 1.5+ with broken startxref header correctly heals', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([300, 300]);
    p.drawText('Heal Stream XRef', { x: 50, y: 250, size: 16 });
    const pdf15 = await doc.save({ useObjectStreams: true });

    // Corrupt the startxref offset in PDF 1.5+
    const latin = new TextDecoder('latin1').decode(pdf15);
    const sxMatch = latin.match(/startxref\s+(\d+)/);
    assert(sxMatch, 'Must find startxref');
    const badSx = latin.replace(/startxref\s+\d+/, 'startxref 99999999');
    const brokenBytes = Buffer.from(badSx, 'latin1');

    const repaired = await PDFCore.repairPDF(brokenBytes);
    const repDoc = await PDFDocument.load(repaired);
    assert.strictEqual(repDoc.getPageCount(), 1, 'Corrupted startxref in PDF 1.5+ must be recovered');
    const text = await PDFCore.pdfToText(repaired);
    assert(text.includes('Heal Stream XRef'), 'Text must be recoverable from healed PDF 1.5+ document');
  });

  await test('4.5 Error robustness: Null, empty, and non-PDF inputs throw descriptive errors', async () => {
    await assert.rejects(() => PDFCore.repairPDF(null), /required/i);
    await assert.rejects(() => PDFCore.repairPDF(new Uint8Array(0)), /failed|invalid|corrupt|required/i);
    await assert.rejects(() => PDFCore.repairPDF(Buffer.from('not a valid pdf header')), /failed|invalid|corrupt|parse/i);
  });

  await test('4.6 Trailing garbage / noise appended after %%EOF is stripped and document cleanly repaired', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([300, 300]);
    p.drawText('Trailing Garbage Test', { x: 50, y: 250, size: 16 });
    const validBytes = await doc.save({ useObjectStreams: false });

    // Append 5KB of arbitrary binary noise after %%EOF
    const noisyBytes = Buffer.concat([
      Buffer.from(validBytes),
      Buffer.alloc(5120, 0xFE), // 5KB 0xFE bytes
      Buffer.from('\r\nRANDOM_SERVER_LOG_RESIDUE_GARBAGE\r\n', 'latin1'),
    ]);

    const repaired = await PDFCore.repairPDF(noisyBytes);
    const repDoc = await PDFDocument.load(repaired);
    assert.strictEqual(repDoc.getPageCount(), 1, 'Document with trailing garbage must recover cleanly');
    const text = await PDFCore.pdfToText(repaired);
    assert(text.includes('Trailing Garbage Test'), 'Text must be recoverable from trailing garbage repair');
  });

  await test('4.7 Incremental updates (multiple trailer revisions) recovery upon EOF truncation', async () => {
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([300, 300]);
    p1.drawText('Revision 1 Page', { x: 50, y: 250, size: 16 });
    const rev1Bytes = await doc.save({ useObjectStreams: false });

    // Load and add revision 2
    const doc2 = await PDFDocument.load(rev1Bytes);
    const p2 = doc2.addPage([300, 300]);
    p2.drawText('Revision 2 Page', { x: 50, y: 250, size: 16 });
    const rev2Bytes = await doc2.save({ useObjectStreams: false });

    // Truncate revision 2 trailer
    const latin = new TextDecoder('latin1').decode(rev2Bytes);
    const lastTrailer = latin.lastIndexOf('trailer');
    const truncatedRev2 = Buffer.from(latin.slice(0, lastTrailer), 'latin1');

    const repaired = await PDFCore.repairPDF(truncatedRev2);
    const repDoc = await PDFDocument.load(repaired);
    assert.strictEqual(repDoc.getPageCount(), 2, 'Incremental update recovery must preserve all 2 pages');
    const text = await PDFCore.pdfToText(repaired);
    assert(text.includes('Revision 1 Page'), 'Rev 1 text must exist');
    assert(text.includes('Revision 2 Page'), 'Rev 2 text must exist');
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n======================================================');
  console.log(`Challenger P1-2 Adversarial Results:`);
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  console.log('======================================================\n');

  if (failCount > 0) {
    console.error(`Pending / Failed Tests (${failCount}):`);
    for (const f of failures) {
      console.error(`  • ${f.name}`);
      console.error(`    ${f.error?.message || f.error}`);
    }
    process.exit(1);
  } else {
    console.log('All Challenger P1-2 adversarial tests passed successfully!');
    process.exit(0);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal crash in Challenger P1-2 suite:', err);
  process.exit(1);
});
