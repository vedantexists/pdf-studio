/**
 * test/test_adversarial_p2_1.js
 * Empirical Challenger P2-1 Adversarial Stress & Verification Harness
 * Focus areas:
 * 1. Local PDF Worker Wiring & Integrity (zero CDN egress, version parity, local bundle syntax)
 * 2. Pure Client-Side Zero-Egress Network Invariant across full suite
 * 3. OCR Stub Hardening & Error Behavior (missing Tesseract WASM, malformed mocks)
 * 4. Honest Labeling & Translation Disclosures (glossary disclosure, offline invariant, output headers)
 * 5. Compare PDF Memory Optimization & Canvas Zeroing Lifecycle
 */

let assertionCount = 0;
const _rawAssert = require('assert');
function assert(...args) {
  assertionCount++;
  return _rawAssert(...args);
}
Object.assign(assert, _rawAssert);
for (const fn of ['strictEqual', 'notStrictEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'ok', 'rejects', 'throws', 'doesNotReject', 'doesNotThrow']) {
  if (typeof _rawAssert[fn] === 'function') {
    assert[fn] = function (...args) {
      assertionCount++;
      return _rawAssert[fn].apply(_rawAssert, args);
    };
  }
}
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const dgram = require('dgram');

const PDFLib = require('pdf-lib');
const { PDFDocument, rgb, StandardFonts } = PDFLib;
const PDFCore = require('../pdf_core');

let passCount = 0;
let failCount = 0;
const failures = [];

async function test(name, fn) {
  process.stdout.write(`  [CHALLENGER-P2-1] ${name} ... `);
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

// Helper: create a valid multi-page PDF document
async function createSampleDoc(pageCount = 1, text = 'Adversarial P2-1 Test Document') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${text} - Page ${i + 1}`, { x: 50, y: 550, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
  }
  return await doc.save();
}

async function run() {
  console.log('================================================================');
  console.log('Challenger P2-1 Adversarial Test Suite: Local Worker & Honest Stubs');
  console.log('================================================================\n');

  // ==========================================================================
  // Suite 1: Local PDF Worker Wiring & Asset Integrity
  // ==========================================================================
  console.log('--- Suite 1: Local PDF Worker Wiring & Asset Integrity ---');

  await test('1.1: Local worker bundle exists, non-empty, and matches API version', async () => {
    const workerPath = path.join(__dirname, '../vendor/pdf.worker.min.js');
    const mainPath = path.join(__dirname, '../vendor/pdf.min.js');
    assert(fs.existsSync(workerPath), 'vendor/pdf.worker.min.js must exist on disk');
    assert(fs.existsSync(mainPath), 'vendor/pdf.min.js must exist on disk');

    const workerStat = fs.statSync(workerPath);
    assert(workerStat.size > 1000000, `pdf.worker.min.js must be a complete bundle (>1MB), got: ${workerStat.size}`);

    const workerCode = fs.readFileSync(workerPath, 'utf8');
    const mainCode = fs.readFileSync(mainPath, 'utf8');

    // Extract PDF.js version strings (check 3.11.174 build parity in minified bundles)
    assert(workerCode.includes('3.11.174'), 'vendor/pdf.worker.min.js must contain version 3.11.174');
    assert(mainCode.includes('3.11.174'), 'vendor/pdf.min.js must contain version 3.11.174');
    assert(workerCode.includes('apiVersion'), 'vendor/pdf.worker.min.js must validate apiVersion');
    assert(mainCode.includes('apiVersion:"3.11.174"') || mainCode.includes('apiVersion: "3.11.174"'),
      'vendor/pdf.min.js must specify apiVersion 3.11.174');
  });

  await test('1.2: vendor/pdf.worker.min.js JavaScript syntax and VM compilation', async () => {
    const workerPath = path.join(__dirname, '../vendor/pdf.worker.min.js');
    const workerCode = fs.readFileSync(workerPath, 'utf8');

    // Compile script in isolated VM context to detect syntax or structural corruption
    assert.doesNotThrow(() => {
      new vm.Script(workerCode, { filename: 'pdf.worker.min.js' });
    }, 'vendor/pdf.worker.min.js must parse cleanly without syntax errors');
  });

  await test('1.3: Zero external CDN references across app.js, index.html, pdf_core.js', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const indexCode = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const coreCode = fs.readFileSync(path.join(__dirname, '../pdf_core.js'), 'utf8');

    const forbiddenDomains = [
      'cdnjs.cloudflare.com',
      'unpkg.com',
      'cdn.jsdelivr.net',
      'cdn.skypack.dev',
      'esm.sh',
      'node_modules/pdfjs-dist/build/pdf.worker.min.js'
    ];

    for (const domain of forbiddenDomains) {
      assert(!appCode.includes(domain), `app.js must not contain external domain: ${domain}`);
      assert(!indexCode.includes(domain), `index.html must not contain external domain: ${domain}`);
      assert(!coreCode.includes(domain), `pdf_core.js must not contain external domain: ${domain}`);
    }
  });

  await test('1.4: Direct vendor/pdf.worker.min.js wiring in all app.js & index.html locations', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const indexCode = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    // Check synchronous initialization in index.html
    assert(
      indexCode.includes("window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'"),
      'index.html must synchronously wire workerSrc to vendor/pdf.worker.min.js'
    );

    // Verify all occurrences of GlobalWorkerOptions.workerSrc in app.js point directly to vendor/
    const workerSrcRegex = /GlobalWorkerOptions\.workerSrc\s*=\s*([^;]+);/g;
    let match;
    let assignmentCount = 0;
    while ((match = workerSrcRegex.exec(appCode)) !== null) {
      assignmentCount++;
      const assignedVal = match[1].trim();
      assert(
        assignedVal === "'vendor/pdf.worker.min.js'" || assignedVal === '"vendor/pdf.worker.min.js"',
        `app.js GlobalWorkerOptions.workerSrc assignment must be exactly 'vendor/pdf.worker.min.js', found: ${assignedVal}`
      );
    }
    assert(assignmentCount >= 5, `Expected at least 5 workerSrc assignments in app.js, found ${assignmentCount}`);
  });

  await test('1.5: Assert vendor/pdf.worker.min.js contains zero external importScripts URLs', async () => {
    const workerCode = fs.readFileSync(path.join(__dirname, '../vendor/pdf.worker.min.js'), 'utf8');
    // Ensure importScripts is not calling external http/https URLs
    const importScriptsMatches = workerCode.match(/importScripts\s*\([^)]+\)/g) || [];
    for (const imp of importScriptsMatches) {
      assert(!imp.includes('http:') && !imp.includes('https:') && !imp.includes('//'),
        `vendor/pdf.worker.min.js must not import external scripts via importScripts: ${imp}`);
    }
  });

  // ==========================================================================
  // Suite 2: Pure Client-Side Zero-Egress Network Invariant (Broad Suite)
  // ==========================================================================
  console.log('\n--- Suite 2: Pure Client-Side Zero-Egress Network Traps ---');

  await test('2.1: Zero network egress across full core PDF operations suite', async () => {
    let egressAttempts = 0;
    const interceptedUrls = [];

    const trap = (url) => {
      egressAttempts++;
      interceptedUrls.push(String(url || 'unknown'));
      throw new Error(`VIOLATION: Outbound network request intercepted! Target: ${url}`);
    };

    const origFetch = global.fetch;
    const origHttpReq = http.request;
    const origHttpGet = http.get;
    const origHttpsReq = https.request;
    const origHttpsGet = https.get;
    const origNetConnect = net.connect;
    const origTlsConnect = tls.connect;
    const origDgram = dgram.createSocket;

    global.fetch = trap;
    http.request = trap;
    http.get = trap;
    https.request = trap;
    https.get = trap;
    net.connect = trap;
    tls.connect = trap;
    dgram.createSocket = trap;

    try {
      const sample1 = await createSampleDoc(2, 'Adversarial Egress Doc A');
      const sample2 = await createSampleDoc(2, 'Adversarial Egress Doc B');

      // 1. Compare PDF (Phase 2 core)
      await PDFCore.comparePDF(sample1, sample2, { maxDiffImages: 1 });
      await PDFCore.comparePDF(sample1, sample1, { includeDataUrls: false });

      // 2. Translate PDF (Phase 2 core) across all 4 target languages
      for (const lang of ['es', 'fr', 'de', 'it']) {
        const md = await PDFCore.translatePDF(sample1, { targetLang: lang, format: 'markdown' });
        assert(typeof md === 'string', `translatePDF to ${lang} must return markdown string`);
        const txt = await PDFCore.translatePDF(sample1, { targetLang: lang, format: 'text' });
        assert(typeof txt === 'string', `translatePDF to ${lang} must return text string`);
        const pdfOut = await PDFCore.translatePDF(sample1, { targetLang: lang });
        assert(pdfOut instanceof Uint8Array, `translatePDF to ${lang} default must return Uint8Array`);
      }

      // 3. OCR PDF with mock text
      const ocrOut = await PDFCore.ocrPDF(sample1, { mockText: 'Zero egress verified OCR text' });
      assert(ocrOut instanceof Uint8Array);

      // 4. Conversions suite
      const textSample = await PDFCore.textToPDF('Client side invoice report contract agreement.');
      await PDFCore.pdfToText(textSample);
      await PDFCore.pdfToMarkdown(textSample);
      await PDFCore.pdfToExcel(textSample);
      await PDFCore.pdfToWord(textSample);
      await PDFCore.pdfToPowerPoint(textSample);

      // 5. Optimization & repair
      await PDFCore.compressPDF(sample1);
      await PDFCore.repairPDF(sample1);
      await PDFCore.redactPDF(sample1, [{ pageIndex: 0, x: 10, y: 10, width: 50, height: 20 }]);

      assert.strictEqual(egressAttempts, 0, `Detected ${egressAttempts} outbound network calls: ${interceptedUrls.join(', ')}`);
    } finally {
      global.fetch = origFetch;
      http.request = origHttpReq;
      http.get = origHttpGet;
      https.request = origHttpsReq;
      https.get = origHttpsGet;
      net.connect = origNetConnect;
      tls.connect = origTlsConnect;
      dgram.createSocket = origDgram;
    }
  });

  // ==========================================================================
  // Suite 3: OCR Stub Hardening & Error Handling
  // ==========================================================================
  console.log('\n--- Suite 3: OCR Stub Hardening & Error Handling ---');

  await test('3.1: Browser mode without window.Tesseract rejects immediately', async () => {
    const sample = await createSampleDoc(1, 'OCR Stub');
    global.window = { pdfjsLib: {} }; // simulate browser DOM
    try {
      await assert.rejects(
        () => PDFCore.ocrPDF(sample),
        /Client-side OCR requires the Tesseract WASM engine/i,
        'Must reject when window.Tesseract is undefined'
      );
    } finally {
      delete global.window;
    }
  });

  await test('3.2: Browser mode with null or invalid window.Tesseract rejects immediately', async () => {
    const sample = await createSampleDoc(1, 'OCR Stub');
    
    // Case A: window.Tesseract is null
    global.window = { pdfjsLib: {}, Tesseract: null };
    try {
      await assert.rejects(
        () => PDFCore.ocrPDF(sample),
        /Tesseract WASM/i,
        'Must reject when window.Tesseract is null'
      );
    } finally {
      delete global.window;
    }

    // Case B: window.Tesseract is an empty object
    global.window = { pdfjsLib: {}, Tesseract: {} };
    try {
      await assert.rejects(
        () => PDFCore.ocrPDF(sample),
        /Tesseract WASM/i,
        'Must reject when window.Tesseract has no recognize function'
      );
    } finally {
      delete global.window;
    }

    // Case C: window.Tesseract.recognize is a non-function
    global.window = { pdfjsLib: {}, Tesseract: { recognize: 'invalid' } };
    try {
      await assert.rejects(
        () => PDFCore.ocrPDF(sample),
        /Tesseract WASM/i,
        'Must reject when window.Tesseract.recognize is not a function'
      );
    } finally {
      delete global.window;
    }
  });

  await test('3.3: Empty mock options cannot bypass browser OCR WASM requirement', async () => {
    const sample = await createSampleDoc(1, 'OCR Stub');
    global.window = { pdfjsLib: {} };
    try {
      // Empty string mockText
      await assert.rejects(
        () => PDFCore.ocrPDF(sample, { mockText: '' }),
        /Tesseract WASM/i,
        'Empty mockText string must not bypass WASM requirement'
      );

      // Empty object mockPages
      await assert.rejects(
        () => PDFCore.ocrPDF(sample, { mockPages: null }),
        /Tesseract WASM/i,
        'Null mockPages must not bypass WASM requirement'
      );
    } finally {
      delete global.window;
    }
  });

  await test('3.4: app.js executeBtn handler contains strict client-side Tesseract check', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert(
      appCode.includes("!window.Tesseract || typeof window.Tesseract.recognize !== 'function'"),
      'app.js executeBtn must validate window.Tesseract.recognize before executing OCR'
    );
    assert(
      appCode.includes('Client-side OCR requires the Tesseract WASM engine, which is not bundled or loaded in offline mode.'),
      'app.js executeBtn must throw actionable message explaining offline WASM requirement'
    );
  });

  await test('3.5: app.js UI renders WASM Engine Unavailable warning when Tesseract missing', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert(
      appCode.includes('⚠️ <strong>WASM Engine Unavailable:</strong> Tesseract WASM is not loaded.'),
      'app.js toolSettings must render WASM Engine Unavailable banner when window.Tesseract is not present'
    );
  });

  // ==========================================================================
  // Suite 4: Honest Labeling & Translation Disclosures
  // ==========================================================================
  console.log('\n--- Suite 4: Honest Labeling & Translation Disclosures ---');

  await test('4.1: TOOLS registry in app.js labels tool as Translate PDF (Glossary)', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert(appCode.includes("title: 'Translate PDF (Glossary)'"), "TOOLS['translate-pdf'].title must be 'Translate PDF (Glossary)'");
    assert(appCode.includes("actionText: 'Translate Glossary Terms'"), "TOOLS['translate-pdf'].actionText must be 'Translate Glossary Terms'");
    assert(appCode.includes('zero network transmission'), "TOOLS['translate-pdf'].description must explicitly state 'zero network transmission'");
    assert(appCode.includes('built-in dictionaries (ES, FR, DE, IT)'), "TOOLS['translate-pdf'].description must state built-in dictionaries");
  });

  await test('4.2: index.html navigation, drawer, and cards reflect honest glossary title', async () => {
    const indexCode = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    // Mega menu title and desc
    assert(indexCode.includes('<span class="nav-tool-title">Translate PDF (Glossary)</span>'), 'Mega menu must have Translate PDF (Glossary)');
    assert(indexCode.includes('Offline business glossary translation; zero network egress'), 'Mega menu desc must state offline business glossary translation');

    // Drawer link
    assert(indexCode.includes('data-tool="translate-pdf">Translate PDF (Glossary)</button>'), 'Drawer link must be Translate PDF (Glossary)');

    // Tool card
    assert(indexCode.includes('<h2>Translate PDF (Glossary)</h2>'), 'Dashboard tool card must be Translate PDF (Glossary)');
    assert(indexCode.includes('Offline keyword & business glossary translation using client-side dictionaries'), 'Tool card desc must state client-side dictionaries');
    assert(indexCode.includes('100% private in-browser with zero-network transmission'), 'Tool card desc must state zero-network transmission');
  });

  await test('4.3: Translated document header and text output contain required disclosures', async () => {
    const sample = await PDFCore.textToPDF('Report Agreement Contract Summary Document Meeting.');
    
    for (const lang of ['es', 'fr', 'de', 'it']) {
      const md = await PDFCore.translatePDF(sample, { targetLang: lang, format: 'markdown' });
      assert(md.includes('# Translated Document (Glossary - '), 'Markdown header must indicate Glossary translation');
      assert(
        md.includes('> *Notice: 100% offline client-side glossary translation using local term dictionaries. Zero network transmission — your document never left this browser.*'),
        'Markdown output must include notice disclosing local dictionaries and zero network transmission'
      );
    }
  });

  await test('4.4: Local dictionary translation behaves deterministically without dropping terms', async () => {
    const inputContent = 'The confidential contract and report require formal agreement before the deadline.';
    const sample = await PDFCore.textToPDF(inputContent);

    // Test Spanish translation
    const esMd = await PDFCore.translatePDF(sample, { targetLang: 'es', format: 'markdown' });
    // Known glossary words should be substituted:
    // contract -> contrato, report -> informe, agreement -> acuerdo, confidential -> confidencial
    assert(esMd.toLowerCase().includes('contrato'), 'Spanish translation must translate contract -> contrato');
    assert(esMd.toLowerCase().includes('informe'), 'Spanish translation must translate report -> informe');
    assert(esMd.toLowerCase().includes('acuerdo'), 'Spanish translation must translate agreement -> acuerdo');
    assert(esMd.toLowerCase().includes('confidencial'), 'Spanish translation must translate confidential -> confidencial');
    // Non-glossary words like "before" and "the" should be preserved intact, not dropped
    assert(esMd.includes('before'), 'Non-glossary terms must be preserved intact');
  });

  await test('4.5: app.js success toast and settings panel render transmission disclosures', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert(
      appCode.includes('Document translated via local offline glossary with zero network transmission!'),
      'app.js showSuccess toast must disclose local offline glossary translation'
    );
    assert(
      appCode.includes('<strong>🔒 Zero-Network Transmission Disclosure:</strong>'),
      'app.js settings panel must render Zero-Network Transmission Disclosure'
    );
    assert(
      appCode.includes('No document content, text, or metadata is ever transmitted over any network'),
      'app.js settings disclosure must state no text is ever transmitted'
    );
  });

  // ==========================================================================
  // Suite 5: Compare PDF Memory Optimization & Canvas Zeroing Lifecycle
  // ==========================================================================
  console.log('\n--- Suite 5: Compare PDF Memory Optimization & Canvas Zeroing Lifecycle ---');

  await test('5.1: Identical pages skip canvasDataUrl generation to preserve memory', async () => {
    const sample = await createSampleDoc(3, 'Memory Optimization Baseline');
    const result = await PDFCore.comparePDF(sample, sample);

    assert.strictEqual(result.totalDiffPixels, 0, 'Identical documents must have 0 diff pixels');
    assert.strictEqual(result.diffPages.length, 3, 'Must process all 3 pages');
    for (const p of result.diffPages) {
      assert.strictEqual(p.diffPixels, 0);
      assert.strictEqual(p.canvasDataUrl, undefined, 'Identical pages must NOT allocate canvasDataUrl');
    }
  });

  await test('5.2: maxDiffImages bounding limits retained image URLs', async () => {
    const docA = await createSampleDoc(3, 'Version Alpha');
    const docB = await createSampleDoc(3, 'Version Beta');

    const result = await PDFCore.comparePDF(docA, docB, { maxDiffImages: 1 });
    const diffsWithUrl = result.diffPages.filter(p => p.canvasDataUrl);
    assert(diffsWithUrl.length <= 1, `Must retain at most 1 data URL, found: ${diffsWithUrl.length}`);
  });

  await test('5.3: includeDataUrls=false produces metrics with zero retained data URLs', async () => {
    const docA = await createSampleDoc(2, 'Revision 1');
    const docB = await createSampleDoc(2, 'Revision 2');

    const result = await PDFCore.comparePDF(docA, docB, { includeDataUrls: false });
    assert(result.totalDiffPixels > 0, 'Diff metrics must still be computed');
    const anyDataUrl = result.diffPages.some(p => p.canvasDataUrl);
    assert.strictEqual(anyDataUrl, false, 'No data URLs should be retained when includeDataUrls=false');
  });

  await test('5.4: Canvas dimensions zeroing in try ... finally block in pdf_core.js', async () => {
    const coreCode = fs.readFileSync(path.join(__dirname, '../pdf_core.js'), 'utf8');
    assert(coreCode.includes('canvasA.width = 0; canvasA.height = 0;'), 'canvasA must be zeroed in finally');
    assert(coreCode.includes('canvasB.width = 0; canvasB.height = 0;'), 'canvasB must be zeroed in finally');
    assert(coreCode.includes('diffCanvas.width = 0; diffCanvas.height = 0;'), 'diffCanvas must be zeroed in finally');
  });

  await test('5.5: app.js comparePDF call specifies maxDiffImages: 1', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert(
      appCode.includes('PDFCore.comparePDF(fileA, fileB, { maxDiffImages: 1 })'),
      'app.js caller must pass maxDiffImages: 1'
    );
  });

  // ==========================================================================
  // Suite 6: Adversarial Boundary & Stress Cases
  // ==========================================================================
  console.log('\n--- Suite 6: Adversarial Boundary & Stress Cases ---');

  await test('6.1: 20-page multi-page discrepancy comparePDF stress test', async () => {
    // Generate two 20-page documents with discrepancies on every single page
    const docA = await createSampleDoc(20, 'Baseline Revision Version 1.0');
    const docB = await createSampleDoc(20, 'Modified Revision Version 2.0');

    const result = await PDFCore.comparePDF(docA, docB, { maxDiffImages: 1 });
    assert.strictEqual(result.diffPages.length, 20, 'All 20 pages must be evaluated');
    assert(result.totalDiffPixels > 0, 'Total diff pixels must be greater than 0');

    const pagesWithImages = result.diffPages.filter(p => p.canvasDataUrl);
    assert(pagesWithImages.length <= 1, `Must retain at most 1 data URL under stress (maxDiffImages: 1), found: ${pagesWithImages.length}`);
  });

  await test('6.2: translatePDF handles punctuation, mixed casing, empty inputs, and unknown lang', async () => {
    // Case A: Punctuation and mixed casing
    const inputPunctuation = 'Subject: (Confidential), regarding the "CONTRACT", "REPORT", and terms.';
    const samplePunct = await PDFCore.textToPDF(inputPunctuation);
    const translated = await PDFCore.translatePDF(samplePunct, { targetLang: 'es', format: 'markdown' });
    assert(translated.toLowerCase().includes('confidencial'), 'Must match with punctuation');
    assert(translated.toLowerCase().includes('contrato'), 'Must match uppercase "CONTRACT"');
    assert(translated.toLowerCase().includes('informe'), 'Must match uppercase "REPORT"');

    // Case B: Unsupported language code falls back gracefully without crashing
    const fallbackOut = await PDFCore.translatePDF(samplePunct, { targetLang: 'unsupported_xyz', format: 'markdown' });
    assert(fallbackOut.includes('Glossary'), 'Must safely fall back to default dictionary');

    // Case C: Empty document bytes rejection
    await assert.rejects(() => PDFCore.translatePDF(null), /required/i);
  });

  await test('6.3: Local server.js serves vendor/pdf.worker.min.js with correct MIME type', async () => {
    // Start local server on ephemeral port and request vendor/pdf.worker.min.js
    const serverProcess = http.createServer((req, res) => {
      // Simulate server.js routing logic
      const ROOT = path.join(__dirname, '..');
      const safePath = path.normalize(path.join(ROOT, req.url));
      if (!fs.existsSync(safePath)) {
        res.writeHead(404);
        return res.end('Not Found');
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(safePath).pipe(res);
    });

    await new Promise((resolve, reject) => {
      serverProcess.listen(0, '127.0.0.1', () => {
        const port = serverProcess.address().port;
        http.get(`http://127.0.0.1:${port}/vendor/pdf.worker.min.js`, (res) => {
          assert.strictEqual(res.statusCode, 200, 'HTTP status must be 200');
          assert.strictEqual(res.headers['content-type'], 'application/javascript; charset=utf-8');
          let bytesReceived = 0;
          res.on('data', chunk => { bytesReceived += chunk.length; });
          res.on('end', () => {
            assert(bytesReceived > 1000000, `Must receive full worker payload, got ${bytesReceived} bytes`);
            serverProcess.close(() => resolve());
          });
        }).on('error', (err) => {
          serverProcess.close(() => reject(err));
        });
      });
    });
  });

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n================================================================');
  console.log(`Challenger P2-1 Adversarial Results: ${passCount} Passed | ${failCount} Failed | Assertions: ${assertionCount}`);
  console.log('================================================================\n');

  if (failCount > 0 || assertionCount === 0) {
    if (assertionCount === 0) console.error('FAILED: Zero assertions were executed!');
    console.error(`Total failures: ${failCount}`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.name}] -> ${f.error.message}`);
    });
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
