const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const PDFCore = require('../pdf_core.js');

function getQpdfPath() {
  try {
    execSync('qpdf --version', { stdio: 'ignore' });
    return 'qpdf';
  } catch (e) {}
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const candidate = path.join(localAppData, 'qpdf', 'qpdf-12.4.2-msvc64', 'bin', 'qpdf.exe');
    if (fs.existsSync(candidate)) return `"${candidate}"`;
  }
  return 'qpdf';
}

const qpdfCmd = getQpdfPath();

async function runRepairAcceptance() {
  console.log('=== Running repairPDF Acceptance Test Suite (Item 2) ===\n');
  const tmpDir = os.tmpdir();

  // 1. Truncated XRef File Repair
  console.log('--- 1. Repair Truncated XRef Document ---');
  const doc1 = await PDFDocument.create();
  const page1 = doc1.addPage([400, 600]);
  page1.drawText('Truncated XRef Test Page', { x: 50, y: 550, size: 20 });
  const origBytes1 = await doc1.save();

  const latin1 = Buffer.from(origBytes1).toString('latin1');
  const xrefPos1 = latin1.lastIndexOf('xref');
  assert(xrefPos1 > 0, 'Original PDF must contain xref table');
  // Truncate in the middle of the xref table
  const brokenBytes1 = Buffer.from(latin1.slice(0, xrefPos1 + 12), 'latin1');

  const repaired1 = await PDFCore.repairPDF(brokenBytes1);
  assert(repaired1 instanceof Uint8Array, 'Repaired output must be Uint8Array');

  // Verify with pdfjs that it opens and reads pages
  const task1 = pdfjs.getDocument({ data: new Uint8Array(repaired1) });
  const loadedPdf1 = await task1.promise;
  assert.strictEqual(loadedPdf1.numPages, 1, 'pdfjs must open repaired truncated-xref document with 1 page');
  await loadedPdf1.destroy();

  // Verify with qpdf --check
  const tmpPath1 = path.join(tmpDir, `repair_truncated_xref_${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath1, Buffer.from(repaired1));
  const qpdfCheck1 = execSync(`${qpdfCmd} --check "${tmpPath1}"`, { encoding: 'utf8' });
  assert(!/fatal error/i.test(qpdfCheck1) || /No syntax or stream encoding errors found/i.test(qpdfCheck1), `qpdf --check failed: ${qpdfCheck1}`);
  fs.unlinkSync(tmpPath1);
  console.log('✓ Truncated XRef document repaired, opens in pdfjs, and passes qpdf --check\n');

  // 2. Missing Trailer Document Repair
  console.log('--- 2. Repair Missing Trailer Document ---');
  const doc2 = await PDFDocument.create();
  const page2 = doc2.addPage([500, 500]);
  page2.drawText('Missing Trailer Test Page', { x: 50, y: 450, size: 20 });
  const origBytes2 = await doc2.save();

  const latin2 = Buffer.from(origBytes2).toString('latin1');
  const lastEndobj2 = latin2.lastIndexOf('endobj');
  assert(lastEndobj2 > 0, 'Must have endobj');
  // Cut off right after endobj (completely removing xref, trailer, startxref, %%EOF)
  const brokenBytes2 = Buffer.from(latin2.slice(0, lastEndobj2 + 6), 'latin1');

  const repaired2 = await PDFCore.repairPDF(brokenBytes2);
  assert(repaired2 instanceof Uint8Array, 'Repaired output must be Uint8Array');

  // Verify with pdfjs that it opens
  const task2 = pdfjs.getDocument({ data: new Uint8Array(repaired2) });
  const loadedPdf2 = await task2.promise;
  assert.strictEqual(loadedPdf2.numPages, 1, 'pdfjs must open repaired missing-trailer document with 1 page');
  await loadedPdf2.destroy();

  // Verify with qpdf --check
  const tmpPath2 = path.join(tmpDir, `repair_missing_trailer_${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath2, Buffer.from(repaired2));
  const qpdfCheck2 = execSync(`${qpdfCmd} --check "${tmpPath2}"`, { encoding: 'utf8' });
  assert(!/fatal error/i.test(qpdfCheck2) || /No syntax or stream encoding errors found/i.test(qpdfCheck2), `qpdf --check failed: ${qpdfCheck2}`);
  fs.unlinkSync(tmpPath2);
  console.log('✓ Missing Trailer document repaired, opens in pdfjs, and passes qpdf --check\n');

  // 3. XRef-stream PDF 1.5+ Document Repair
  console.log('--- 3. Repair Modern PDF 1.5+ XRef Stream Document ---');
  const doc3 = await PDFDocument.create();
  const page3a = doc3.addPage([300, 300]);
  page3a.drawText('XRef Stream Page 1', { x: 50, y: 250, size: 16 });
  const page3b = doc3.addPage([300, 300]);
  page3b.drawText('XRef Stream Page 2', { x: 50, y: 250, size: 16 });
  const origBytes3 = await doc3.save({ useObjectStreams: true });

  const latin3 = Buffer.from(origBytes3).toString('latin1');
  assert(latin3.includes('/Type /XRef') || latin3.includes('/Type/XRef'), 'Must be PDF 1.5+ XRef stream');
  // Damage the file by cutting off the trailing startxref and %%EOF
  const lastEndobj3 = latin3.lastIndexOf('endobj');
  const brokenBytes3 = Buffer.from(latin3.slice(0, lastEndobj3 + 6), 'latin1');

  const repaired3 = await PDFCore.repairPDF(brokenBytes3);
  assert(repaired3 instanceof Uint8Array, 'Repaired output must be Uint8Array');

  // Verify with pdfjs that it opens with both pages
  const task3 = pdfjs.getDocument({ data: new Uint8Array(repaired3) });
  const loadedPdf3 = await task3.promise;
  assert.strictEqual(loadedPdf3.numPages, 2, 'pdfjs must open repaired PDF 1.5+ document with 2 pages');
  await loadedPdf3.destroy();

  // Verify with qpdf --check
  const tmpPath3 = path.join(tmpDir, `repair_xref_stream_${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath3, Buffer.from(repaired3));
  const qpdfCheck3 = execSync(`${qpdfCmd} --check "${tmpPath3}"`, { encoding: 'utf8' });
  assert(!/fatal error/i.test(qpdfCheck3) || /No syntax or stream encoding errors found/i.test(qpdfCheck3), `qpdf --check failed: ${qpdfCheck3}`);
  fs.unlinkSync(tmpPath3);
  console.log('✓ PDF 1.5+ XRef Stream document repaired, opens in pdfjs, and passes qpdf --check\n');

  console.log('All 3 repairPDF acceptance verification tests PASSED cleanly!');
}

runRepairAcceptance().catch((err) => {
  console.error('repairPDF acceptance test failed:', err);
  process.exit(1);
});
