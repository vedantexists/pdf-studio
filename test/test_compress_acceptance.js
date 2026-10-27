const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const core = require('../pdf_core.js');

const CORPUS_DIR = path.resolve(__dirname, '../bench/corpus');

let assertionsCount = 0;
function trackAssert(cond, msg) {
  assertionsCount++;
  assert(cond, msg);
}

function trackStrictEqual(actual, expected, msg) {
  assertionsCount++;
  assert.strictEqual(actual, expected, msg);
}

function runQpdfCheck(pdfBytes, password) {
  const tmpPath = path.join(__dirname, `_tmp_qpdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(pdfBytes));
    const args = ['--check', '--warning-exit-0'];
    if (password) args.push(`--password=${password}`);
    args.push(tmpPath);
    const res = spawnSync('qpdf', args, { encoding: 'utf8' });
    return res.status === 0;
  } catch {
    return false;
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

function runPdfiumCheck(pdfBytes, password) {
  const tmpPath = path.join(__dirname, `_tmp_pdfium_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(pdfBytes));
    const safePath = tmpPath.replace(/\\/g, '/');
    const pyCode = `
import pypdfium2 as pdfium
pw = ${password ? JSON.stringify(password) : 'None'}
doc = pdfium.PdfDocument("${safePath}", password=pw)
assert len(doc) >= 0
`;
    const res = spawnSync('python', ['-c', pyCode], { encoding: 'utf8' });
    if (res.status !== 0) {
      console.error('PDFium check error:', res.stderr || res.stdout);
    }
    return res.status === 0;
  } catch (err) {
    console.error('runPdfiumCheck exception:', err);
    return false;
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

function computeTextMatchRatio(srcText, outText) {
  if (!srcText && !outText) return 1.0;
  if (!srcText || !outText) return 0.0;
  const srcWords = new Set(srcText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (srcWords.size === 0) return 1.0;
  const outWords = new Set(outText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  let matched = 0;
  for (const w of srcWords) {
    if (outWords.has(w)) matched++;
  }
  return Number((matched / srcWords.size).toFixed(2));
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function runCompressAcceptanceSuite() {
  console.log('========================================================================');
  console.log('Phase 1 Task 1.1: Compress Tool Acceptance Test Suite');
  console.log('========================================================================\n');

  const testFiles = [
    { category: 'Image-Heavy', file: '12_image_heavy_photo.pdf' },
    { category: 'Image-Heavy', file: '13_image_heavy_multi.pdf' },
    { category: 'Text-Heavy', file: '14_text_heavy_article.pdf' },
    { category: 'Text-Heavy', file: '15_text_heavy_report.pdf' },
    { category: 'Scanned', file: '01_clean_scan.pdf' },
    { category: 'Scanned', file: '02_noisy_scan.pdf' },
    { category: 'Large Corpus', file: '03_large_220_pages.pdf' }
  ];

  const presets = ['low', 'recommended', 'extreme'];
  const resultsTable = [];
  let passedTests = 0;

  // 1. Boundary and Error Checking
  console.log('--- 1. Boundary & Input Guards ---');
  try {
    let threw = false;
    try {
      await core.compressPDF(null);
    } catch (e) {
      threw = true;
    }
    trackAssert(threw, 'compressPDF(null) must throw error');
    console.log('  ✓ null input correctly rejected');
    passedTests++;
  } catch (err) {
    console.error('  ✗ null input test failed:', err);
  }

  // 2. Metadata Stripping Invariance
  console.log('--- 2. Metadata Stripping Selection ---');
  try {
    const docMeta = await PDFDocument.create();
    docMeta.setTitle('Important Document');
    docMeta.setAuthor('Antigravity');
    docMeta.addPage([200, 200]);
    const metaPdf = await docMeta.save();

    const stripped = await core.compressPDF(metaPdf, { stripMetadata: true });
    const docStripped = await PDFDocument.load(stripped);
    trackStrictEqual(docStripped.getTitle() || '', '', 'Title must be stripped when stripMetadata: true');
    trackStrictEqual(docStripped.getAuthor() || '', '', 'Author must be stripped when stripMetadata: true');

    const preserved = await core.compressPDF(metaPdf, { stripMetadata: false });
    const docPreserved = await PDFDocument.load(preserved);
    trackStrictEqual(docPreserved.getTitle(), 'Important Document', 'Title must be preserved when stripMetadata: false');
    trackStrictEqual(docPreserved.getAuthor(), 'Antigravity', 'Author must be preserved when stripMetadata: false');

    console.log('  ✓ Optional metadata stripped only when selected');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Metadata test failed:', err);
  }

  // 3. Acceptance Matrix Across Corpus & Presets
  console.log('--- 3. Corpus Benchmark & Preset Verification ---');

  for (const { category, file } of testFiles) {
    const filePath = path.join(CORPUS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping missing fixture: ${file}`);
      continue;
    }

    const origBytes = fs.readFileSync(filePath);
    const inDoc = await PDFDocument.load(origBytes, { ignoreEncryption: true });
    const origPageCount = inDoc.getPageCount();

    let origText = '';
    try {
      const res = await core.pdfToText(origBytes);
      origText = res?.text || '';
    } catch (e) {}

    console.log(`\nEvaluating: ${file} (${category}, ${formatBytes(origBytes.length)}, ${origPageCount} pgs)`);

    let prevCompressedSize = origBytes.length;

    for (const preset of presets) {
      process.stdout.write(`  -> Preset [${preset.padEnd(11)}] ... `);
      const start = Date.now();
      const compressed = await core.compressPDF(origBytes, { level: preset });
      const elapsed = Date.now() - start;

      // Assertion 1: Valid Uint8Array returned
      trackAssert(compressed instanceof Uint8Array, `Preset ${preset} must return Uint8Array`);

      // Assertion 2: Never return a file larger than input
      trackAssert(
        compressed.length <= origBytes.length,
        `Preset ${preset} output (${compressed.length} B) must be <= original (${origBytes.length} B)`
      );

      // Assertion 3: Page count matches
      const outDoc = await PDFDocument.load(compressed, { ignoreEncryption: true });
      const outPageCount = outDoc.getPageCount();
      trackStrictEqual(
        outPageCount,
        origPageCount,
        `Preset ${preset} page count (${outPageCount}) must match input (${origPageCount})`
      );

      // Assertion 4: Text content matches
      let textMatchRatio = 1.0;
      if (origText.trim().length > 0) {
        let outText = '';
        try {
          const res = await core.pdfToText(compressed);
          outText = res?.text || '';
        } catch (e) {}
        textMatchRatio = computeTextMatchRatio(origText, outText);
        trackAssert(
          textMatchRatio >= 0.95,
          `Preset ${preset} text match (${(textMatchRatio * 100).toFixed(1)}%) must be >= 95%`
        );
      }

      // Assertion 5: QPDF --check verification
      const qpdfPass = runQpdfCheck(compressed);
      trackAssert(qpdfPass, `Preset ${preset} on ${file} must pass qpdf --check`);

      // Assertion 6: PDFium (pypdfium2) verification
      const pdfiumPass = runPdfiumCheck(compressed);
      trackAssert(pdfiumPass, `Preset ${preset} on ${file} must pass pdfium`);

      const reductionPct = origBytes.length > 0
        ? (((origBytes.length - compressed.length) / origBytes.length) * 100).toFixed(1)
        : '0.0';

      console.log(`OK (${elapsed}ms, ${formatBytes(compressed.length)}, -${reductionPct}%, QPDF:${qpdfPass ? 'PASS' : 'FAIL'}, PDFium:${pdfiumPass ? 'PASS' : 'FAIL'})`);
      passedTests++;

      resultsTable.push({
        category,
        file,
        preset,
        origSize: formatBytes(origBytes.length),
        compSize: formatBytes(compressed.length),
        reduction: `-${reductionPct}%`,
        pages: `${outPageCount}/${origPageCount}`,
        textMatch: `${Math.round(textMatchRatio * 100)}%`,
        qpdf: qpdfPass ? 'PASS' : 'FAIL',
        pdfium: pdfiumPass ? 'PASS' : 'FAIL'
      });
    }
  }

  // 4. Output Markdown Table
  console.log('\n========================================================================');
  console.log('PDF STUDIO COMPRESS ACCEPTANCE RESULTS');
  console.log('========================================================================\n');

  console.log('| Category | File | Preset | Original Size | Compressed Size | Reduction | Pages | Text Match | QPDF | PDFium |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const row of resultsTable) {
    console.log(`| ${row.category} | \`${row.file}\` | **${row.preset}** | ${row.origSize} | ${row.compSize} | **${row.reduction}** | ${row.pages} | ${row.textMatch} | **${row.qpdf}** | **${row.pdfium}** |`);
  }

  console.log('\n========================================================================');
  console.log(`Suites Passed: ${passedTests} | Total Assertions: ${assertionsCount}`);
  console.log(`Assertions: ${assertionsCount}`);
  console.log('========================================================================\n');
}

runCompressAcceptanceSuite().catch(err => {
  console.error('Acceptance suite failed:', err);
  process.exit(1);
});
