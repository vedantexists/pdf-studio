const assert = require('assert');
const { PDFDocument } = require('pdf-lib');
const PDFCore = require('../pdf_core');

async function createSamplePDF(pageCount, text = 'Page') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${text} ${i + 1}`, { x: 50, y: 550, size: 24 });
  }
  return await doc.save();
}

async function runTests() {
  console.log('--- Running PDFCore self-checks ---');

  // Test 1: Merge
  const pdf1 = await createSamplePDF(2, 'Doc1');
  const pdf2 = await createSamplePDF(3, 'Doc2');
  const merged = await PDFCore.mergePDFs([pdf1, pdf2]);
  const mergedDoc = await PDFDocument.load(merged);
  assert.strictEqual(mergedDoc.getPageCount(), 5, 'Merged PDF should have 5 pages');
  console.log('✓ Merge PDF passed (2 + 3 = 5 pages)');

  // Test 2: Split
  const splitResults = await PDFCore.splitPDF(merged);
  assert.strictEqual(splitResults.length, 5, 'Split should produce 5 single-page PDFs');
  const firstSplitDoc = await PDFDocument.load(splitResults[0].bytes);
  assert.strictEqual(firstSplitDoc.getPageCount(), 1, 'Split item should have 1 page');
  console.log('✓ Split PDF passed (5 single-page outputs)');

  // Test 3: Extract custom range
  const extracted = await PDFCore.extractPages(merged, [0, 2, 4]);
  const extractedDoc = await PDFDocument.load(extracted);
  assert.strictEqual(extractedDoc.getPageCount(), 3, 'Extracted PDF should have 3 pages');
  console.log('✓ Extract pages passed (3 pages extracted)');

  // Test 4: Rotate
  const rotated = await PDFCore.rotatePDF(pdf1, 90, [0]);
  const rotatedDoc = await PDFDocument.load(rotated);
  assert.strictEqual(rotatedDoc.getPage(0).getRotation().angle, 90, 'Page 0 should be rotated 90 degrees');
  assert.strictEqual(rotatedDoc.getPage(1).getRotation().angle, 0, 'Page 1 should remain unrotated');
  console.log('✓ Rotate PDF passed (page 0 rotated 90 deg)');

  // Test 5: Watermark
  const watermarked = await PDFCore.watermarkPDF(pdf1, { text: 'SAMPLE WATERMARK', opacity: 0.3 });
  const watermarkedDoc = await PDFDocument.load(watermarked);
  assert.strictEqual(watermarkedDoc.getPageCount(), 2, 'Watermarked PDF maintains page count');
  console.log('✓ Watermark PDF passed');

  // Test 6: Organize (Reorder & delete)
  const organized = await PDFCore.organizePDF(merged, [
    { sourceIndex: 4, rotation: 0 },
    { sourceIndex: 1, rotation: 180 },
  ]);
  const organizedDoc = await PDFDocument.load(organized);
  assert.strictEqual(organizedDoc.getPageCount(), 2, 'Organized PDF should have 2 pages');
  assert.strictEqual(organizedDoc.getPage(1).getRotation().angle, 180, 'Page 1 should have 180 rotation');
  console.log('✓ Organize PDF passed');

  // Test 7: Page range parser
  const parsed = PDFCore.parsePageRanges('1-3, 5, 8-10', 10);
  assert.deepStrictEqual(parsed, [0, 1, 2, 4, 7, 8, 9], 'Page ranges parsed accurately');
  console.log('✓ Page range parser passed');

  // Test 8: Images to PDF (using minimal 1x1 PNG)
  // Minimal valid 1x1 transparent PNG byte array
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  const imgPdf = await PDFCore.imagesToPDF([{ bytes: png1x1, type: 'png' }], { pageSize: 'fit' });
  const imgDoc = await PDFDocument.load(imgPdf);
  assert.strictEqual(imgDoc.getPageCount(), 1, 'Images to PDF should create 1 page');
  console.log('✓ Images to PDF passed');

  // Test 9: Add page numbers with custom tokens and positions
  const numbered = await PDFCore.addPageNumbers(merged, {
    format: '{n}/{total}',
    position: 'top-right',
    startNumber: 1,
  });
  const numberedDoc = await PDFDocument.load(numbered);
  assert.strictEqual(numberedDoc.getPageCount(), 5, 'Numbered PDF retains 5 pages');
  console.log('✓ Add page numbers passed');

  // Test 10: Negative rotation normalization
  const negRotated = await PDFCore.rotatePDF(pdf1, -90, [0]);
  const negDoc = await PDFDocument.load(negRotated);
  assert.strictEqual(negDoc.getPage(0).getRotation().angle, 270, 'Negative rotation normalized to 270 deg');
  console.log('✓ Negative rotation normalization passed');

  // Test 11: Non-ASCII watermark sanitization
  const unicodeWatermarked = await PDFCore.watermarkPDF(pdf1, { text: 'CONFIDENTIAL © 2026 “TEST”' });
  const wmDoc = await PDFDocument.load(unicodeWatermarked);
  assert.strictEqual(wmDoc.getPageCount(), 2, 'Unicode watermark renders without error');
  console.log('✓ Unicode watermark sanitization passed');

  // Test 12: Extract pages bounds validation
  await assert.rejects(
    async () => PDFCore.extractPages(pdf1, [99, 100]),
    /No valid page indices/,
    'Out of bounds indices must throw descriptive error'
  );
  console.log('✓ Extract pages bounds check passed');

  // Test 13: Pipeline execution
  const pipelineResult = await PDFCore.runPipeline(pdf1, [
    { op: 'rotate', angle: 90 },
    { op: 'pageNumbers', options: { position: 'bottom-center' } },
  ]);
  const pipeDoc = await PDFDocument.load(pipelineResult);
  assert.strictEqual(pipeDoc.getPageCount(), 2, 'Pipeline executed successfully');
  assert.strictEqual(pipeDoc.getPage(0).getRotation().angle, 90, 'Pipeline rotation applied');
  console.log('✓ In-memory pipeline passed');

  console.log('All PDFCore tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
