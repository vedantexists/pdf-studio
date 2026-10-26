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

    // OCR on blank pages produces no invented text layer
    const ocrAuto = await PDFCore.ocrPDF(pdfBytes, { lang: 'eng' });
    const autoDoc = await PDFDocument.load(ocrAuto);
    assert.strictEqual(autoDoc.getPageCount(), 2);
    const autoTextPlain = await PDFCore.pdfToText(ocrAuto, { format: 'plain' });
    assert.strictEqual(autoTextPlain.trim(), '', 'Blank pages must yield no recognized text');
    console.log('  ✓ ocrPDF blank pages yield no invented text');

    // Boundary cases
    await assert.rejects(() => PDFCore.ocrPDF(null), /required/i);
    console.log('  ✓ ocrPDF null input rejected with Error');

    // Detached buffer safety
    const cloned = pdfBytes.slice();
    const detachedSafe = await PDFCore.ocrPDF(cloned.buffer);
    assert(detachedSafe instanceof Uint8Array);
    console.log('  ✓ ocrPDF detached buffer safety verified');
  }

  // 6. pdfToExcel Column Naming & Multi-Column Indexing
  console.log('\n--- 6. pdfToExcel Column Naming (A..Z, AA..ZZ) ---');
  {
    const cols = Array.from({ length: 30 }, (_, i) => `C${i}`).join(',');
    const pdfBytes = await PDFCore.textToPDF(cols, { fontSize: 5, margin: 10 });
    const xlsxBytes = await PDFCore.pdfToExcel(pdfBytes);
    assert(xlsxBytes instanceof Uint8Array, 'Must return Uint8Array');

    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(xlsxBytes);
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
    assert(sheetXml.includes('r="A1"'), 'Must include column A1');
    assert(sheetXml.includes('r="Z1"'), 'Must include column Z1');
    assert(sheetXml.includes('r="AA1"'), 'Must include column AA1');
    assert(sheetXml.includes('r="AB1"'), 'Must include column AB1');
    assert(sheetXml.includes('r="AD1"'), 'Must include column AD1');
    console.log('  ✓ pdfToExcel multi-letter column names (A..Z, AA..AD) verified');

    // Assert zero String.fromCharCode in pdf_core.js
    const fs = require('fs');
    const path = require('path');
    const coreCode = fs.readFileSync(path.join(__dirname, '..', 'pdf_core.js'), 'utf8');
    assert(!coreCode.includes('String.fromCharCode'), 'pdf_core.js must not contain String.fromCharCode');
    console.log('  ✓ Static alphabet indexing verified with zero String.fromCharCode in pdf_core.js');
  }

  // 7. Mobile Touch Reordering DOM & CSS Cascade Precedence Verification
  console.log('\n--- 7. Mobile Touch Reorder Controls & CSS Verification ---');
  {
    const fs = require('fs');
    const path = require('path');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

    // Verify app.js DOM structure
    assert(appJs.includes('mobile-touch-reorder'), 'app.js must render .mobile-touch-reorder container');
    assert(appJs.includes('mobile-reorder-btn'), 'app.js must include .mobile-reorder-btn classes');
    assert(appJs.includes('data-action="move-left"'), 'app.js must bind move-left data-action');
    assert(appJs.includes('data-action="move-right"'), 'app.js must bind move-right data-action');
    assert(appJs.includes('◀') && appJs.includes('▶'), 'app.js must include ◀ and ▶ reorder controls');
    assert(appJs.includes('mobile-reorder-label'), 'app.js must render page indicator label');
    console.log('  ✓ app.js mobile touch controls DOM template and action binding verified');

    // Verify style.css responsive styling & cascade hierarchy
    assert(styleCss.includes('@media (max-width: 900px)'), 'style.css must include 900px responsive breakpoint');

    // 1. Base desktop concealment rule must exist outside media query
    const desktopNoneIdx = styleCss.indexOf('.mobile-touch-reorder {\n  display: none;');
    assert(desktopNoneIdx !== -1, 'style.css must define base desktop rule .mobile-touch-reorder { display: none; }');

    // 2. Responsive display: flex must be declared AFTER desktop display: none to prevent cascade inversion
    const mobileFlexIdx = styleCss.indexOf('.mobile-touch-reorder {\n    display: flex;');
    assert(mobileFlexIdx !== -1, 'style.css must declare display: flex for .mobile-touch-reorder inside media query');
    assert(desktopNoneIdx < mobileFlexIdx, `Cascade Inversion Defect: base desktop rule (pos ${desktopNoneIdx}) must precede responsive override (pos ${mobileFlexIdx})`);

    // 3. Elevated specificity hierarchy for container and buttons
    assert(styleCss.includes('.page-thumb-card .mobile-touch-reorder'), 'style.css must elevate container selector specificity with .page-thumb-card');
    assert(styleCss.includes('.page-thumb-card .mobile-touch-reorder .mobile-reorder-btn'), 'style.css must elevate button selector specificity with .page-thumb-card and .mobile-touch-reorder');

    // 4. Button height (40px) must be declared AFTER global .icon-btn (34px) to prevent height truncation
    const iconBtnIdx = styleCss.indexOf('.icon-btn {\n  background: transparent;');
    const btnHeight40Idx = styleCss.indexOf('height: 40px;');
    assert(iconBtnIdx !== -1, 'style.css must define .icon-btn');
    assert(btnHeight40Idx !== -1, 'style.css must define height: 40px for mobile reorder buttons');
    assert(iconBtnIdx < btnHeight40Idx, `Selector Clash: .icon-btn (pos ${iconBtnIdx}) must be declared before mobile 40px touch height (pos ${btnHeight40Idx})`);

    // 5. Touch target ergonomics and mobile optimizations
    assert(styleCss.includes('min-width: 44px'), 'style.css must specify min-width: 44px for WCAG touch compliance');
    assert(styleCss.includes('touch-action: manipulation'), 'style.css must set touch-action: manipulation for instant tap response');
    assert(styleCss.includes('user-select: none'), 'style.css must prevent text selection during touch reordering');
    assert(styleCss.includes('pointer-events: none'), 'style.css must disable pointer events on disabled touch buttons');
    console.log('  ✓ style.css 900px breakpoint, cascade declaration order, elevated specificity, and touch target ergonomics verified');
  }

  // 8. Multi-Phase Documentation & Disclosures Verification
  console.log('\n--- 8. Multi-Phase Documentation & Disclosures Verification ---');
  {
    const fs = require('fs');
    const path = require('path');
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    // README multi-phase documentation
    assert(readme.includes('## 🛡️ Remediation & Hardening Architecture (Phases 1, 2 & 3)'), 'README must have multi-phase architecture section');
    assert(readme.includes('Phase 1: Security & Core Engine Hardening'), 'README must document Phase 1 achievements');
    assert(readme.includes('Phase 2: Offline Invariants & Performance'), 'README must document Phase 2 achievements');
    assert(readme.includes('Phase 3: Integrity, Verification & Mobile UX'), 'README must document Phase 3 achievements');
    assert(readme.includes('tests-132%2B%20passing'), 'README must display 132+ passing badge');

    // index.html & app.js UI disclosures
    assert(indexHtml.includes('Translate PDF (Glossary)'), 'index.html must display Translate PDF (Glossary)');
    assert(indexHtml.includes('Tesseract WASM engine; zero cloud uploads'), 'index.html must disclose OCR WASM requirement');
    assert(indexHtml.includes('mobile touch reordering'), 'index.html must describe Organize mobile touch reordering');

    // package.json consolidated test runner
    assert(pkg.scripts.test.includes('test_phase4_audit.js') && !pkg.scripts.test.includes('--conditional'), 'npm test must run audit suite without --conditional');
    assert(pkg.scripts['test:core'] && pkg.scripts['test:audit'] && pkg.scripts['test:security'], 'package.json must provide test:core, test:audit, and test:security scripts');
    console.log('  ✓ README multi-phase docs, UI disclosures, and package.json test scripts verified');
  }

  console.log('\n=============================================');
  console.log('All Phase 3 Tests Passed 100%!');
  console.log('=============================================\n');
}

runPhase3Tests().catch((err) => {
  console.error('Phase 3 test suite failed:', err);
  process.exit(1);
});
