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

  console.log('\n=============================================');
  console.log('All Phase 2 Tests Passed 100%!');
  console.log('=============================================\n');
}

runPhase2Tests().catch((err) => {
  console.error('Phase 2 test suite failed:', err);
  process.exit(1);
});
