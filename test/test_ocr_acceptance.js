const { spawnSync, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
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

const ROOT = path.resolve(__dirname, '..');
const PORT = 3891;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.traineddata': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.pdf': 'application/pdf',
};

async function runOcrAcceptance() {
  console.log('=== Item 4 Acceptance Test: Offline OCR with Local Tesseract WASM ===');

  // Step 1: Ensure rasterized test PDF exists
  const samplePdfPath = path.join(ROOT, 'test', 'image_only_sample.pdf');
  const genScript = path.join(ROOT, 'test', 'make_image_pdf.py');
  if (!fs.existsSync(samplePdfPath)) {
    execSync(`python "${genScript}"`, { stdio: 'inherit' });
  }
  assert(fs.existsSync(samplePdfPath), 'Sample image-only PDF must exist');

  // Step 2: Spin up local zero-egress test server
  const outPdfPath = path.join(ROOT, 'test', 'ocr_output.pdf');
  if (fs.existsSync(outPdfPath)) fs.unlinkSync(outPdfPath);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'POST' && url.pathname === '/save_ocr') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(outPdfPath, buf);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('saved');
      });
      return;
    }

    const safePath = path.normalize(path.join(ROOT, url.pathname));
    fs.readFile(safePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  await new Promise(resolve => server.listen(PORT, resolve));

  // Step 3: Run headless browser via Playwright
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    server.close();
    throw new Error(`Failed to launch Playwright Chromium for OCR acceptance test: ${err.message}`);
  }

  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/test/test_ocr_harness.html`);

  // Wait for file to be written
  const start = Date.now();
  while (!fs.existsSync(outPdfPath) || fs.statSync(outPdfPath).size < 1000) {
    if (Date.now() - start > 35000) {
      try { await browser.close(); } catch {}
      server.close();
      throw new Error('Timeout waiting for OCR output generation');
    }
    await new Promise(r => setTimeout(r, 400));
  }

  try { await browser.close(); } catch {}
  server.close();

  // Step 4: Verify with Python pypdf and pdfium
  const pyCheck = `
import pypdf, pypdfium2 as pdfium, sys
r = pypdf.PdfReader('test/ocr_output.pdf')
assert len(r.pages) == 2, f"Expected 2 pages, got {len(r.pages)}"
p1_text = r.pages[0].extract_text()
p2_text = r.pages[1].extract_text()

doc = pdfium.PdfDocument('test/ocr_output.pdf')
pdfium_p1 = doc[0].get_textpage().get_text_range()
pdfium_p2 = doc[1].get_textpage().get_text_range()

expected = 'The quick brown fox jumps over the lazy dog Client side Optical Character Recognition in PDF Studio toolkit'.lower().split()
extracted = [w.strip('.,\\r\\n') for w in p1_text.lower().split() if w.strip('.,\\r\\n')]
matched = [w for w in expected if w in extracted]
accuracy = len(matched) / len(expected)

print(f"  [PASS] Word accuracy: {accuracy * 100:.2f}% (required >= 90%)")
assert accuracy >= 0.90, f"Accuracy {accuracy:.2f} below 0.90 requirement"

print(f"  [PASS] Blank page verification: pypdf='{p2_text.strip()}', pdfium='{pdfium_p2.strip()}'")
assert p2_text.strip() == "", "Page 2 in pypdf must have 0 text"
assert pdfium_p2.strip() == "", "Page 2 in pdfium must have 0 text"

print("  [PASS] All OCR acceptance criteria passed!")
`;

  const pyRes = spawnSync('python', ['-c', pyCheck], { encoding: 'utf8', cwd: ROOT });
  console.log(pyRes.stdout);
  if (pyRes.status !== 0) {
    console.error(pyRes.stderr);
    process.exit(1);
  }

  assert(pyRes.status === 0, 'OCR verification python check must pass');
  console.log(`Passed: 1 | Failed: 0 | Assertions: ${assertionCount}`);

  try { if (fs.existsSync(outPdfPath)) fs.unlinkSync(outPdfPath); } catch {}
  if (assertionCount === 0) throw new Error('Zero assertions executed in test_ocr_acceptance');
}

if (require.main === module) {
  runOcrAcceptance().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runOcrAcceptance };