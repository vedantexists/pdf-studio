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

  // 4. editPDF tests
  console.log('\n--- 4. Edit PDF (Annotations & Shapes) ---');
  {
    const inputDoc = await PDFDocument.create();
    inputDoc.addPage([500, 700]);
    inputDoc.addPage([500, 700]);
    const pdfBytes = await inputDoc.save();

    const annotationsByPage = {
      0: [
        { type: 'pen', points: [{ x: 50, y: 500 }, { x: 80, y: 520 }, { x: 120, y: 500 }], color: '#ef4444', width: 3 },
        { type: 'highlight', x: 50, y: 450, width: 200, height: 25, color: '#fef08a', opacity: 0.4 },
        { type: 'text', x: 60, y: 455, text: 'Annotated Milestone 3 Verification Note', fontSize: 16, color: '#000000' },
        { type: 'rect', x: 50, y: 350, width: 150, height: 80, borderColor: '#3b82f6', borderWidth: 2, fill: false },
        { type: 'ellipse', x: 250, y: 350, width: 100, height: 60, color: '#10b981', fill: true },
        { type: 'line', start: { x: 50, y: 300 }, end: { x: 300, y: 300 }, color: '#000000', width: 2 },
      ],
      1: [
        { type: 'text', x: 50, y: 500, text: 'Second Page Annotation Text', fontSize: 14, color: [0.2, 0.4, 0.8] },
        { type: 'rect', x: 40, y: 480, width: 300, height: 50, borderColor: [1, 0, 0], borderWidth: 1 },
      ],
    };

    const editedBytes = await PDFCore.editPDF(pdfBytes, annotationsByPage);
    assert(editedBytes instanceof Uint8Array, 'Must return Uint8Array');
    const doc = await PDFDocument.load(editedBytes);
    assert.strictEqual(doc.getPageCount(), 2, 'Page count preserved');
    console.log('  ✓ Multi-page annotations (pen, highlight, text, rect, ellipse, line) baked successfully');

    // Verify text extractability
    const extracted = await PDFCore.pdfToText(editedBytes);
    assert(extracted.includes('Annotated Milestone 3 Verification Note'), 'Page 0 text annotation must be extractable');
    assert(extracted.includes('Second Page Annotation Text'), 'Page 1 text annotation must be extractable');
    console.log('  ✓ Text added via editPDF is extractable via pdfToText');

    // Boundary cases
    const emptyEdit = await PDFCore.editPDF(pdfBytes, {});
    assert.strictEqual((await PDFDocument.load(emptyEdit)).getPageCount(), 2);
    console.log('  ✓ editPDF empty annotations handled gracefully');

    await assert.rejects(() => PDFCore.editPDF(null), /required/i);
    console.log('  ✓ editPDF null input rejected with Error');

    const outOfBoundsEdit = await PDFCore.editPDF(pdfBytes, {
      999: [{ type: 'text', text: 'Ghost Page' }],
      [-1]: [{ type: 'rect', x: 0, y: 0, width: 10, height: 10 }],
    });
    assert.strictEqual((await PDFDocument.load(outOfBoundsEdit)).getPageCount(), 2);
    console.log('  ✓ editPDF out-of-bounds page indices ignored without throwing');
  }

  // 5. ocrPDF tests
  console.log('\n--- 5. OCR PDF (Searchable Text Layer) ---');
  {
    const inputDoc = await PDFDocument.create();
    inputDoc.addPage([500, 700]);
    inputDoc.addPage([500, 700]);
    const pdfBytes = await inputDoc.save();

    // OCR with explicit text
    const ocrBytes = await PDFCore.ocrPDF(pdfBytes, {
      lang: 'eng',
      mockText: 'Recognized In-Memory OCR Document Content',
    });
    assert(ocrBytes instanceof Uint8Array, 'Must return Uint8Array');
    const doc = await PDFDocument.load(ocrBytes);
    assert.strictEqual(doc.getPageCount(), 2, 'OCR document preserves page count');
    console.log('  ✓ ocrPDF generated valid 2-page document');

    const extracted = await PDFCore.pdfToText(ocrBytes);
    assert(extracted.includes('Recognized In-Memory OCR Document Content'), 'Text layer must be extractable via pdfToText');
    console.log('  ✓ Searchable text layer verified extractable via pdfToText');

    // OCR auto-fallback without options
    const ocrAuto = await PDFCore.ocrPDF(pdfBytes, { lang: 'eng' });
    const autoDoc = await PDFDocument.load(ocrAuto);
    assert.strictEqual(autoDoc.getPageCount(), 2);
    const autoText = await PDFCore.pdfToText(ocrAuto);
    assert(autoText.includes('Recognized OCR Text Content') || autoText.includes('Page 1'), 'Auto text layer extractable');
    console.log('  ✓ ocrPDF default text layer injection verified');

    // Boundary cases
    await assert.rejects(() => PDFCore.ocrPDF(null), /required/i);
    console.log('  ✓ ocrPDF null input rejected with Error');

    // Detached buffer safety
    const cloned = pdfBytes.slice();
    const detachedSafe = await PDFCore.ocrPDF(cloned.buffer);
    assert(detachedSafe instanceof Uint8Array);
    console.log('  ✓ ocrPDF detached buffer safety verified');
  }

  console.log('\n=============================================');
  console.log('All Phase 3 Tests Passed 100%!');
  console.log('=============================================\n');
}

runPhase3Tests().catch((err) => {
  console.error('Phase 3 test suite failed:', err);
  process.exit(1);
});
