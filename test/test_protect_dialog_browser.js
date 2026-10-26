const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { findBrowser } = require('./helpers/browser');

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
const PORT = 3894;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

async function runProtectBrowserTest() {
  console.log('=== Item 5 Acceptance Test: Protect Dialog Browser Verification with QPDF ===');

  const browserBin = findBrowser();
  if (!browserBin) {
    throw new Error('No supported browser found in environment to run Protect browser test.');
  }

  const panelPdfPath = path.join(ROOT, 'test', 'browser_protected_panel.pdf');
  const modalPdfPath = path.join(ROOT, 'test', 'browser_protected_modal.pdf');
  if (fs.existsSync(panelPdfPath)) fs.unlinkSync(panelPdfPath);
  if (fs.existsSync(modalPdfPath)) fs.unlinkSync(modalPdfPath);

  let browserError = null;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'POST' && url.pathname === '/save_protect_panel') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        fs.writeFileSync(panelPdfPath, Buffer.concat(chunks));
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('saved');
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/save_protect_modal') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        fs.writeFileSync(modalPdfPath, Buffer.concat(chunks));
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('saved');
      });
      return;
    }

    if (url.pathname === '/test_error') {
      browserError = url.searchParams.get('err');
      console.error('  [BROWSER ERROR]:', browserError);
      res.writeHead(200);
      res.end('logged');
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      // Relax connect-src from 'none' to 'self' for test report delivery and inject runner
      html = html.replace("connect-src 'none'", "connect-src 'self'");
      html = html.replace('</body>', '<script src="/test/helpers/protect_runner.js"></script></body>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
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

  const proc = spawn(browserBin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `http://localhost:${PORT}/`
  ]);

  proc.on('error', err => {
    console.warn('  [WARN] Headless browser execution notice:', err.message);
  });

  const start = Date.now();
  while ((!fs.existsSync(panelPdfPath) || !fs.existsSync(modalPdfPath)) && !browserError) {
    if (Date.now() - start > 25000) {
      try { proc.kill(); } catch {}
      server.close();
      throw new Error('Timeout waiting for Protect output files from browser');
    }
    await new Promise(r => setTimeout(r, 300));
  }

  try { proc.kill(); } catch {}
  server.close();

  if (browserError) {
    throw new Error('Browser execution encountered error: ' + browserError);
  }

  // Verification 1: Tool Settings Panel Path (app.js:3463)
  console.log('--- Verifying Workspace Panel Path (app.js:3463) ---');
  const panelShow = spawnSync('qpdf', ['--show-encryption', panelPdfPath], { encoding: 'utf8' });
  const panelOut = panelShow.stdout + panelShow.stderr;

  assert(panelOut.includes('R = 6'), 'Panel path: encryption must be R = 6 (AES-256)');
  assert(panelOut.includes('print low resolution: not allowed'), 'Panel path: print low resolution must be not allowed');
  assert(panelOut.includes('print high resolution: not allowed'), 'Panel path: print high resolution must be not allowed');
  assert(panelOut.includes('extract for any purpose: allowed'), 'Panel path: extraction must remain allowed');

  const panelCheck = spawnSync('qpdf', ['--password=TestSecretPass99', '--check', panelPdfPath], { encoding: 'utf8' });
  assert.strictEqual(panelCheck.status, 0, 'Panel path: file must open and pass qpdf --check');
  console.log('  ✓ Panel path verified: AES-256, printing disallowed, extraction allowed, password unlocks cleanly');

  // Verification 2: Protect Modal Dialog Path (app.js:4047)
  console.log('--- Verifying Modal Dialog Path (app.js:4047) ---');
  const modalShow = spawnSync('qpdf', ['--show-encryption', modalPdfPath], { encoding: 'utf8' });
  const modalOut = modalShow.stdout + modalShow.stderr;

  assert(modalOut.includes('R = 6'), 'Modal path: encryption must be R = 6 (AES-256)');
  assert(modalOut.includes('print low resolution: not allowed'), 'Modal path: print low resolution must be not allowed');
  assert(modalOut.includes('print high resolution: not allowed'), 'Modal path: print high resolution must be not allowed');
  assert(modalOut.includes('extract for any purpose: allowed'), 'Modal path: extraction must remain allowed');

  const modalCheck = spawnSync('qpdf', ['--password=ModalSecretPass88', '--check', modalPdfPath], { encoding: 'utf8' });
  assert.strictEqual(modalCheck.status, 0, 'Modal path: file must open and pass qpdf --check');
  console.log('  ✓ Modal path verified: AES-256, printing disallowed, extraction allowed, password unlocks cleanly');

  try { if (fs.existsSync(panelPdfPath)) fs.unlinkSync(panelPdfPath); } catch {}
  try { if (fs.existsSync(modalPdfPath)) fs.unlinkSync(modalPdfPath); } catch {}

  console.log(`Passed: 2 | Failed: 0 | Assertions: ${assertionCount}`);
  if (assertionCount === 0) throw new Error('Zero assertions executed in test_protect_dialog_browser');
}

if (require.main === module) {
  runProtectBrowserTest().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runProtectBrowserTest };
