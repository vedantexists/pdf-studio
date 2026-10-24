const assert = require('assert');
const { PDFDocument } = require('pdf-lib');
const PDFCore = require('../pdf_core');

async function createSampleDoc(pageCount = 3, text = 'Phase 2 Test') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${text} - Page ${i + 1}`, { x: 50, y: 550, size: 24 });
    page.drawText('Confidential Internal Record Account #123-456-789', { x: 50, y: 500, size: 14 });
  }
  return await doc.save();
}

async function runPhase2Tests() {
  console.log('=== PDF Studio Phase 2 Test Suite (Optimization & Analysis) ===\n');

  // 1. compressPDF tests
  console.log('--- 1. Compress PDF ---');
  {
    const sample = await createSampleDoc(5, 'Compress Test');
    const compressed = await PDFCore.compressPDF(sample, { stripMetadata: true });
    assert(compressed instanceof Uint8Array, 'compressPDF must return a Uint8Array');
    assert(compressed.length <= sample.length, 'Compressed bytes should be smaller than or equal to uncompressed');
    
    // Check validity
    const doc = await PDFDocument.load(compressed);
    assert.strictEqual(doc.getPageCount(), 5, 'Page count preserved after compression');
    console.log(`  ✓ Compress PDF successful: ${sample.length} bytes -> ${compressed.length} bytes`);

    // Edge cases
    await assert.rejects(() => PDFCore.compressPDF(null), /required/i);
    console.log('  ✓ Compress PDF null guard passed');
  }

  // 2. repairPDF tests
  console.log('\n--- 2. Repair PDF ---');
  {
    const sample = await createSampleDoc(2, 'Repair Test');
    
    // Case A: Intact document repairs cleanly (idempotence)
    const repClean = await PDFCore.repairPDF(sample);
    const dClean = await PDFDocument.load(repClean);
    assert.strictEqual(dClean.getPageCount(), 2);
    console.log('  ✓ Clean document repair idempotence passed');

    // Case B: Truncated trailer & damaged XRef structure
    const latinStr = Buffer.from(sample).toString('latin1');
    const trailerIdx = latinStr.lastIndexOf('trailer');
    const brokenBytes = Buffer.from(latinStr.slice(0, trailerIdx), 'latin1');

    // Run repairPDF to synthesize missing XRef and trailer
    const repairedBytes = await PDFCore.repairPDF(brokenBytes);
    assert(repairedBytes instanceof Uint8Array, 'repairPDF must return Uint8Array');
    const dRepaired = await PDFDocument.load(repairedBytes);
    assert.strictEqual(dRepaired.getPageCount(), 2, 'Repaired document restored all pages');
    console.log('  ✓ Truncated / destroyed XRef reconstruction passed');

    // Edge cases
    await assert.rejects(() => PDFCore.repairPDF(null), /required/i);
    console.log('  ✓ Repair PDF null guard passed');
  }

  // 3. redactPDF tests
  console.log('\n--- 3. Redact PDF ---');
  {
    const sample = await createSampleDoc(2, 'Redact Test');
    
    // Single box redaction
    const redacted1 = await PDFCore.redactPDF(sample, {
      pageIndex: 0,
      x: 50,
      y: 490,
      width: 250,
      height: 30,
      label: 'CONFIDENTIAL',
    });
    assert(redacted1.length > sample.length, 'Redaction adds graphic annotations');
    const doc1 = await PDFDocument.load(redacted1);
    assert.strictEqual(doc1.getPageCount(), 2);
    console.log('  ✓ Single coordinate redaction with label passed');

    // Multi-page batch redaction
    const redactedMulti = await PDFCore.redactPDF(sample, [
      { pageIndex: 0, x: 50, y: 540, width: 200, height: 40 },
      { pageIndex: 1, x: 50, y: 500, width: 300, height: 25, label: '[REDACTED]' },
    ]);
    const docMulti = await PDFDocument.load(redactedMulti);
    assert.strictEqual(docMulti.getPageCount(), 2);
    console.log('  ✓ Multi-page coordinate redaction passed');

    // Edge cases: out of bounds page index, empty array
    const emptyRedact = await PDFCore.redactPDF(sample, []);
    assert.strictEqual((await PDFDocument.load(emptyRedact)).getPageCount(), 2);
    
    const outOfBounds = await PDFCore.redactPDF(sample, [{ pageIndex: 999, x: 10, y: 10, width: 100, height: 20 }]);
    assert.strictEqual((await PDFDocument.load(outOfBounds)).getPageCount(), 2);

    await assert.rejects(() => PDFCore.redactPDF(null), /required/i);
    console.log('  ✓ Redact PDF boundary & empty input guards passed');
  }

  // 4. Pipeline integration
  console.log('\n--- 4. Chained Phase 2 Pipeline ---');
  {
    const sample = await createSampleDoc(3, 'Pipeline Test');
    const chained = await PDFCore.runPipeline(sample, [
      { op: 'redact', redactions: [{ pageIndex: 0, x: 50, y: 500, width: 150, height: 25 }] },
      { op: 'repair' },
      { op: 'compress', options: { stripMetadata: true } },
    ]);
    const dChain = await PDFDocument.load(chained);
    assert.strictEqual(dChain.getPageCount(), 3);
    console.log('  ✓ Chained in-memory pipeline (redact -> repair -> compress) passed cleanly');
  }

  // 5. comparePDF tests
  console.log('\n--- 5. Compare PDF ---');
  {
    const docA = await createSampleDoc(2, 'Original Document');
    const docIdentical = await createSampleDoc(2, 'Original Document');
    const docModified = await createSampleDoc(2, 'Modified Revision V2');

    // Case A: Identical documents return 0 diffPixels and 0% diff
    const sameResult = await PDFCore.comparePDF(docA, docIdentical);
    assert(sameResult && Array.isArray(sameResult.diffPages), 'comparePDF must return diffPages array');
    assert.strictEqual(sameResult.diffPages.length, 2, 'Must compare all 2 pages');
    assert.strictEqual(sameResult.totalDiffPixels, 0, 'Identical documents must have 0 totalDiffPixels');
    assert.strictEqual(sameResult.hasDifferences, false, 'Identical documents must have hasDifferences=false');
    assert.strictEqual(sameResult.diffPages[0].diffPixels, 0, 'Page 0 must have 0 diffPixels');
    assert.strictEqual(sameResult.diffPages[0].diffPercent, 0, 'Page 0 must have 0% diff');
    console.log('  ✓ Identical PDFs return 0 diffPixels and 0% discrepancy');

    // Case B: Differing documents detect discrepancies
    const diffResult = await PDFCore.comparePDF(docA, docModified);
    assert(diffResult && Array.isArray(diffResult.diffPages), 'comparePDF must return diffPages array');
    assert(diffResult.totalDiffPixels > 0, 'Differing documents must have positive totalDiffPixels');
    assert.strictEqual(diffResult.hasDifferences, true, 'Differing documents must have hasDifferences=true');
    assert(diffResult.diffPages[0].diffPixels > 0, 'Page 0 diffPixels must be positive');
    assert(diffResult.diffPages[0].diffPercent > 0, 'Page 0 diffPercent must be positive');
    console.log(`  ✓ Differing PDFs detect differences (Page 0: ${diffResult.diffPages[0].diffPixels} diffPixels, ${diffResult.diffPages[0].diffPercent}% diff)`);

    // Case C: Asymmetric page counts (Doc A has 1 page, Doc B has 2 pages)
    const doc1Page = await createSampleDoc(1, 'One Page Only');
    const doc2Page = await createSampleDoc(2, 'Two Pages Document');
    const asymResult = await PDFCore.comparePDF(doc1Page, doc2Page);
    assert.strictEqual(asymResult.diffPages.length, 2, 'Must compare up to max page count');
    assert.strictEqual(asymResult.diffPages[1].diffPercent, 100, 'Missing page in Doc A must report 100% diff');
    assert(asymResult.diffPages[1].diffPixels > 0, 'Missing page must have positive diffPixels');
    console.log('  ✓ Asymmetric document lengths detect added/missing pages with 100% diff');

    // Case D: compressPDF preset validation (extreme, recommended, less)
    for (const preset of ['extreme', 'recommended', 'less']) {
      const compPreset = await PDFCore.compressPDF(doc2Page, { level: preset });
      assert(compPreset instanceof Uint8Array, `compressPDF preset '${preset}' must return Uint8Array`);
      const verifiedDoc = await PDFDocument.load(compPreset);
      assert.strictEqual(verifiedDoc.getPageCount(), 2, `compressPDF preset '${preset}' must preserve page count`);
    }
    console.log('  ✓ compressPDF presets (extreme, recommended, less) execute cleanly');

    // Case E: Null & boundary guards
    await assert.rejects(() => PDFCore.comparePDF(null, docA), /required/i);
    await assert.rejects(() => PDFCore.comparePDF(docA, null), /required/i);
    console.log('  ✓ comparePDF null guards passed cleanly');
  }

  console.log('\n=============================================');
  console.log('All Phase 2 Tests Passed 100%!');
  console.log('=============================================\n');
}

runPhase2Tests().catch((err) => {
  console.error('Phase 2 test suite failed:', err);
  process.exit(1);
});
