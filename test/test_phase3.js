const assert = require('assert');
const { PDFDocument } = require('pdf-lib');
const PDFCore = require('../pdf_core');

async function runPhase3Tests() {
  console.log('=== PDF Studio Phase 3 Test Suite (Conversions & Extractor) ===\n');

  // 1. textToPDF tests
  console.log('--- 1. Text to PDF ---');
  {
    const sampleText = 'Welcome to PDF Studio\n\nThis is a clean, multi-line text document formatted into standard PDF pages.\n' + 'Additional paragraph content for testing.\n'.repeat(20);
    const pdfBytes = await PDFCore.textToPDF(sampleText, { fontSize: 14, margin: 40 });
    assert(pdfBytes instanceof Uint8Array, 'textToPDF must return Uint8Array');
    assert(pdfBytes.length > 500, 'PDF bytes should be non-trivial');

    const doc = await PDFDocument.load(pdfBytes);
    assert(doc.getPageCount() >= 1, 'Document has at least 1 page');
    console.log(`  ✓ textToPDF generated valid ${doc.getPageCount()}-page document (${pdfBytes.length} bytes)`);

    // Edge cases
    await assert.rejects(() => PDFCore.textToPDF(null), /string/i);
    const emptyDoc = await PDFCore.textToPDF('');
    assert((await PDFDocument.load(emptyDoc)).getPageCount() === 1);
    console.log('  ✓ textToPDF boundary & empty string guards passed');
  }

  // 2. pdfToText tests
  console.log('\n--- 2. PDF to Text / Markdown ---');
  {
    const inputDoc = await PDFDocument.create();
    const p1 = inputDoc.addPage([400, 600]);
    p1.drawText('Phase 3 Text Extraction', { x: 50, y: 550, size: 20 });
    p1.drawText('First paragraph line', { x: 50, y: 500, size: 12 });
    const p2 = inputDoc.addPage([400, 600]);
    p2.drawText('Page 2 Content Follows', { x: 50, y: 550, size: 20 });
    const pdfBytes = await inputDoc.save();

    // Markdown extraction
    const md = await PDFCore.pdfToText(pdfBytes, { format: 'markdown' });
    assert(typeof md === 'string', 'Must return a string');
    assert(md.includes('Page 1') || md.includes('Extraction'), 'Should extract text content');
    console.log(`  ✓ pdfToText markdown extraction passed (${md.length} characters)`);

    // Plain text extraction
    const plain = await PDFCore.pdfToText(pdfBytes, { format: 'plain' });
    assert(typeof plain === 'string', 'Must return a string');
    console.log(`  ✓ pdfToText plain extraction passed`);

    // Edge cases
    await assert.rejects(() => PDFCore.pdfToText(null), /required/i);
    console.log('  ✓ pdfToText null guard passed');
  }

  // 3. Roundtrip verification: Text -> PDF -> Text
  console.log('\n--- 3. Roundtrip Text Verification ---');
  {
    const original = 'Hello World from PDF Studio Phase 3 Suite';
    const pdf = await PDFCore.textToPDF(original);
    const textOut = await PDFCore.pdfToText(pdf, { format: 'plain' });
    assert(textOut.includes('Hello World') || textOut.includes('Phase 3'), 'Roundtrip text preserved');
    console.log('  ✓ Full Text -> PDF -> Text roundtrip verified');
  }

  console.log('\n=============================================');
  console.log('All Phase 3 Tests Passed 100%!');
  console.log('=============================================\n');
}

runPhase3Tests().catch((err) => {
  console.error('Phase 3 test suite failed:', err);
  process.exit(1);
});
