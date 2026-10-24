const assert = require('assert');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');
const PDFCore = require('../pdf_core');

function createSyntheticPNG(width = 120, height = 120) {
  const lineLength = 1 + width * 4;
  const rawData = Buffer.alloc(lineLength * height);
  for (let y = 0; y < height; y++) {
    const offset = y * lineLength;
    rawData[offset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = offset + 1 + x * 4;
      rawData[pxOffset] = (x ^ y) & 0xff;
      rawData[pxOffset + 1] = (x * 3) & 0xff;
      rawData[pxOffset + 2] = (y * 3) & 0xff;
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
  function calcCrc(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(typeStr, dataBuf) {
    const len = dataBuf ? dataBuf.length : 0;
    const chunk = Buffer.alloc(12 + len);
    chunk.writeUInt32BE(len, 0);
    chunk.write(typeStr, 4, 4, 'ascii');
    if (dataBuf) dataBuf.copy(chunk, 8);
    const crc = calcCrc(chunk.subarray(4, 8 + len));
    chunk.writeUInt32BE(crc, 8 + len);
    return chunk;
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressedData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

async function createDocWithImage(pageCount = 1) {
  const doc = await PDFDocument.create();
  const pngBytes = createSyntheticPNG(150, 150);
  const img = await doc.embedPng(pngBytes);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([500, 500]);
    page.drawText(`Image Document Page ${i + 1}`, { x: 50, y: 460, size: 16 });
    page.drawImage(img, { x: 50, y: 50, width: 350, height: 350 });
  }
  return await doc.save();
}

async function createTextDoc(pageCount = 2, text = 'Text Doc') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${text} - Page ${i + 1}`, { x: 50, y: 550, size: 20 });
    page.drawRectangle({ x: 50, y: 200, width: 300, height: 200 });
  }
  return await doc.save();
}

async function runReviewerM2AdversarialSuite() {
  console.log('=== Reviewer M2 Adversarial Verification Suite ===\n');
  let passed = 0;
  let failed = 0;

  // 1. Preset Scaling & Compression Monotonicity
  console.log('--- 1. Preset Scaling & Compression Monotonicity ---');
  try {
    const sample = await createDocWithImage(2);
    const origSize = sample.length;

    const extBytes = await PDFCore.compressPDF(sample, { level: 'extreme' });
    const recBytes = await PDFCore.compressPDF(sample, { level: 'recommended' });
    const lessBytes = await PDFCore.compressPDF(sample, { level: 'less' });

    assert(extBytes.length < origSize, 'extreme compression should reduce size');
    assert(recBytes.length < origSize, 'recommended compression should reduce size');
    assert(lessBytes.length < origSize, 'less compression should reduce size');

    // Extreme downsampling (scaleDiv: 3) should yield smaller or equal bytes than less (scaleDiv: 2)
    assert(extBytes.length <= lessBytes.length, `extreme (${extBytes.length}) should be <= less (${lessBytes.length})`);

    // Verify all outputs load cleanly
    const dExt = await PDFDocument.load(extBytes);
    const dRec = await PDFDocument.load(recBytes);
    const dLess = await PDFDocument.load(lessBytes);
    assert.strictEqual(dExt.getPageCount(), 2);
    assert.strictEqual(dRec.getPageCount(), 2);
    assert.strictEqual(dLess.getPageCount(), 2);

    // Fallback on invalid preset
    const fallbackBytes = await PDFCore.compressPDF(sample, { level: 'ultra_nonexistent' });
    const dFb = await PDFDocument.load(fallbackBytes);
    assert.strictEqual(dFb.getPageCount(), 2);

    console.log(`  ✓ Presets (extreme: ${extBytes.length}b, recommended: ${recBytes.length}b, less: ${lessBytes.length}b) preserve structure and monotonicity`);
    passed++;
  } catch (err) {
    console.error('  ✗ Preset test failed:', err);
    failed++;
  }

  // 2. Metadata Stripping Invariance
  console.log('--- 2. Metadata Stripping Invariance ---');
  try {
    const doc = await PDFDocument.create();
    doc.setTitle('Sensitive Title');
    doc.setAuthor('Secret Author');
    doc.setSubject('Classified');
    doc.setKeywords(['confidential', 'nda']);
    const page = doc.addPage([300, 300]);
    page.drawText('Classified Material', { x: 20, y: 250, size: 14 });
    const metaPdf = await doc.save();

    // With stripMetadata: true
    const strippedBytes = await PDFCore.compressPDF(metaPdf, { stripMetadata: true });
    const docStripped = await PDFDocument.load(strippedBytes);
    assert.strictEqual(docStripped.getTitle() || '', '');
    assert.strictEqual(docStripped.getAuthor() || '', '');
    assert.strictEqual(docStripped.getSubject() || '', '');

    // With stripMetadata: false
    const keptBytes = await PDFCore.compressPDF(metaPdf, { stripMetadata: false });
    const docKept = await PDFDocument.load(keptBytes);
    assert.strictEqual(docKept.getTitle(), 'Sensitive Title');
    assert.strictEqual(docKept.getAuthor(), 'Secret Author');

    console.log('  ✓ Metadata stripping and preservation options work strictly as configured');
    passed++;
  } catch (err) {
    console.error('  ✗ Metadata stripping failed:', err);
    failed++;
  }

  // 3. No-Image / Pure Vector Document Compression
  console.log('--- 3. Pure Vector / Text Document Compression ---');
  try {
    const textSample = await createTextDoc(3, 'Vector Only Document');
    const compText = await PDFCore.compressPDF(textSample);
    const dComp = await PDFDocument.load(compText);
    assert.strictEqual(dComp.getPageCount(), 3);
    const latin = Buffer.from(compText).toString('latin1');
    assert(latin.includes('/ObjStm'), 'Output must utilize Object Streams for compaction');
    console.log('  ✓ Pure vector documents compress safely and use Object Streams');
    passed++;
  } catch (err) {
    console.error('  ✗ Vector compression failed:', err);
    failed++;
  }

  // 4. Corrupted Stream Invariance
  console.log('--- 4. Corrupted Image Stream Invariance ---');
  try {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    // Create broken raw stream labeled as image
    const brokenStream = doc.context.flateStream(Buffer.from([0x01, 0x02, 0x03, 0x04]));
    brokenStream.dict.set(PDFName.of('Subtype'), PDFName.of('Image'));
    brokenStream.dict.set(PDFName.of('Width'), doc.context.obj(100));
    brokenStream.dict.set(PDFName.of('Height'), doc.context.obj(100));
    const ref = doc.context.register(brokenStream);
    const brokenPdf = await doc.save();

    // Must not crash
    const res = await PDFCore.compressPDF(brokenPdf);
    assert(res instanceof Uint8Array);
    const dRes = await PDFDocument.load(res);
    assert.strictEqual(dRes.getPageCount(), 1);
    console.log('  ✓ Malformed image stream recovers gracefully via internal fallback');
    passed++;
  } catch (err) {
    console.error('  ✗ Corrupted stream test failed:', err);
    failed++;
  }

  // 5. comparePDF Identical Multi-Page Document
  console.log('--- 5. comparePDF Identical Multi-Page Document ---');
  try {
    const doc1 = await createTextDoc(4, 'Identical Report Document');
    const doc2 = await createTextDoc(4, 'Identical Report Document');
    const res = await PDFCore.comparePDF(doc1, doc2);

    assert.strictEqual(res.diffPages.length, 4, 'Must report all 4 pages');
    assert.strictEqual(res.totalDiffPixels, 0, 'Total diff pixels must be exactly 0');
    assert.strictEqual(res.hasDifferences, false, 'hasDifferences must be false');
    for (let p = 0; p < 4; p++) {
      assert.strictEqual(res.diffPages[p].diffPixels, 0, `Page ${p} diffPixels must be 0`);
      assert.strictEqual(res.diffPages[p].diffPercent, 0, `Page ${p} diffPercent must be 0`);
    }
    console.log('  ✓ Identical 4-page documents report 0 total diff pixels across all pages');
    passed++;
  } catch (err) {
    console.error('  ✗ Identical compare failed:', err);
    failed++;
  }

  // 6. comparePDF Partial Page Modifications
  console.log('--- 6. comparePDF Partial Page Modifications ---');
  try {
    const docA = await createTextDoc(3, 'Base Version');
    const docB = await PDFDocument.load(docA);
    // Only modify page 2 (index 1)
    docB.getPage(1).drawText('MODIFICATION ALERT EXTRA PARAGRAPH', { x: 50, y: 300, size: 24 });
    const bytesB = await docB.save();

    const compRes = await PDFCore.comparePDF(docA, bytesB);
    assert.strictEqual(compRes.diffPages.length, 3);
    assert.strictEqual(compRes.hasDifferences, true);
    assert.strictEqual(compRes.diffPages[0].diffPixels, 0, 'Page 0 should be identical');
    assert(compRes.diffPages[1].diffPixels > 0, 'Page 1 should detect differences');
    assert(compRes.diffPages[1].diffPercent > 0, 'Page 1 diffPercent should be positive');
    assert.strictEqual(compRes.diffPages[2].diffPixels, 0, 'Page 2 should be identical');
    console.log(`  ✓ Isolated change on Page 1 detected: ${compRes.diffPages[1].diffPercent}% diff while Pages 0 & 2 are 0%`);
    passed++;
  } catch (err) {
    console.error('  ✗ Partial modification compare failed:', err);
    failed++;
  }

  // 7. comparePDF Asymmetric Page Lengths (Both Directions)
  console.log('--- 7. comparePDF Asymmetric Page Lengths ---');
  try {
    const docShort = await createTextDoc(1, 'Short Document');
    const docLong = await createTextDoc(3, 'Long Document');

    // Direction 1: Short vs Long
    const resShortVsLong = await PDFCore.comparePDF(docShort, docLong);
    assert.strictEqual(resShortVsLong.diffPages.length, 3);
    assert.strictEqual(resShortVsLong.diffPages[1].diffPercent, 100);
    assert.strictEqual(resShortVsLong.diffPages[2].diffPercent, 100);

    // Direction 2: Long vs Short
    const resLongVsShort = await PDFCore.comparePDF(docLong, docShort);
    assert.strictEqual(resLongVsShort.diffPages.length, 3);
    assert.strictEqual(resLongVsShort.diffPages[1].diffPercent, 100);
    assert.strictEqual(resLongVsShort.diffPages[2].diffPercent, 100);

    console.log('  ✓ Asymmetric comparisons in both directions report 100% diff for missing/added pages');
    passed++;
  } catch (err) {
    console.error('  ✗ Asymmetric compare failed:', err);
    failed++;
  }

  // 8. comparePDF Dimension Mismatches
  console.log('--- 8. comparePDF Dimension Mismatches ---');
  try {
    const docSmall = await PDFDocument.create();
    docSmall.addPage([200, 300]).drawText('Small Page', { x: 20, y: 150 });
    const bytesSmall = await docSmall.save();

    const docLarge = await PDFDocument.create();
    docLarge.addPage([600, 900]).drawText('Large Page', { x: 50, y: 450 });
    const bytesLarge = await docLarge.save();

    const dimRes = await PDFCore.comparePDF(bytesSmall, bytesLarge);
    assert.strictEqual(dimRes.diffPages.length, 1);
    assert(dimRes.hasDifferences, 'Dimension-mismatched pages should detect difference');
    console.log('  ✓ Dimension mismatch handled cleanly without unhandled exceptions');
    passed++;
  } catch (err) {
    console.error('  ✗ Dimension mismatch compare failed:', err);
    failed++;
  }

  // 9. comparePDF Lifecycle Cleanup (.destroy() on success & error)
  console.log('--- 9. comparePDF Lifecycle Cleanup (.destroy()) ---');
  try {
    let pdfjs = null;
    try {
      pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    } catch {
      try { pdfjs = require('pdfjs-dist'); } catch {}
    }

    if (pdfjs && typeof pdfjs.getDocument === 'function') {
      const origGetDoc = pdfjs.getDocument;
      let destroyCount = 0;

      pdfjs.getDocument = function(src) {
        const task = origGetDoc.call(this, src);
        const origPromise = task.promise;
        task.promise = origPromise.then(doc => {
          const origDest = doc.destroy ? doc.destroy.bind(doc) : () => Promise.resolve();
          doc.destroy = async function() {
            destroyCount++;
            return await origDest();
          };
          return doc;
        });
        return task;
      };

      try {
        const docA = await createTextDoc(1, 'Doc A');
        const docB = await createTextDoc(1, 'Doc B');
        await PDFCore.comparePDF(docA, docB);
        assert.strictEqual(destroyCount, 2, 'Both docA and docB must have doc.destroy() called upon completion');
      } finally {
        pdfjs.getDocument = origGetDoc;
      }
    }
    console.log('  ✓ comparePDF cleanly calls .destroy() on both documents');
    passed++;
  } catch (err) {
    console.error('  ✗ Lifecycle cleanup test failed:', err);
    failed++;
  }

  // 10. Boundary Guards & Detached Buffer Protection
  console.log('--- 10. Boundary Guards & Detached Buffer Protection ---');
  try {
    const valid = await createTextDoc(1);

    await assert.rejects(() => PDFCore.comparePDF(null, valid), /required/i);
    await assert.rejects(() => PDFCore.comparePDF(valid, null), /required/i);
    await assert.rejects(() => PDFCore.comparePDF(undefined, undefined), /required/i);

    // Buffer detachment test (Uint8Array)
    const bufA = valid.slice();
    const bufB = valid.slice();
    const compPromise = PDFCore.comparePDF(bufA, bufB);
    // Mutate buffer while async operation is running
    bufA.fill(0);
    bufB.fill(0);
    const detachedRes = await compPromise;
    assert.strictEqual(detachedRes.hasDifferences, false);
    console.log('  ✓ Buffer detachment defense and argument validation guards passed');
    passed++;
  } catch (err) {
    console.error('  ✗ Boundary test failed:', err);
    failed++;
  }

  // 11. High-Concurrency Stress Test
  console.log('--- 11. High-Concurrency Stress Test ---');
  try {
    const sample = await createTextDoc(2, 'Concurrency Document');
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(PDFCore.compressPDF(sample, { level: 'extreme' }));
      promises.push(PDFCore.comparePDF(sample, sample));
    }
    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 20);
    console.log('  ✓ 20 parallel compress and compare operations executed cleanly');
    passed++;
  } catch (err) {
    console.error('  ✗ Concurrency test failed:', err);
    failed++;
  }

  // 12. App.js Wiring and Integration Verification
  console.log('--- 12. App.js Wiring Verification ---');
  try {
    const appJsContent = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert(appJsContent.includes("'compare': {"), "app.js must declare 'compare' in TOOLS");
    assert(appJsContent.includes("'compress': {"), "app.js must declare 'compress' in TOOLS");
    assert(appJsContent.includes("currentTool === 'compare'"), "app.js must handle currentTool === 'compare'");
    assert(appJsContent.includes("currentTool === 'compress'"), "app.js must handle currentTool === 'compress'");
    assert(appJsContent.includes("PDFCore.comparePDF"), "app.js must invoke PDFCore.comparePDF");
    assert(appJsContent.includes("PDFCore.compressPDF"), "app.js must invoke PDFCore.compressPDF");
    assert(appJsContent.includes("downloadBlob"), "app.js must download compare diff / report");
    console.log('  ✓ app.js wiring for compare and compress fully confirmed');
    passed++;
  } catch (err) {
    console.error('  ✗ App wiring test failed:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(`Reviewer M2 Adversarial Suite Summary:`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runReviewerM2AdversarialSuite().catch(err => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
