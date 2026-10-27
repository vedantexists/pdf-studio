/**
 * test_browser_matrix.js
 * Cross-browser Playwright matrix test suite (Phase 0 Task 0.3):
 *
 * Targets:
 *   1. Chromium (Desktop)
 *   2. Firefox (Desktop)
 *   3. WebKit (Desktop)
 *   4. Mobile Emulation Profile (Pixel 7 on Chromium)
 *
 * Strict policy:
 *   - Browsers that cannot launch must fail the build immediately (no silent skipping).
 *   - Zero external network egress, running against local static server.
 *   - Tests App Loading, Tool Execution, and Dialog Workflows across all 4 targets.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium, firefox, webkit, devices } = require('playwright');
const { PDFDocument } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');

let assertionCount = 0;
const _rawAssert = require('assert');

function assert(condition, message) {
  assertionCount++;
  return _rawAssert(condition, message);
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

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.traineddata': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function createStaticServer() {
  const server = http.createServer((req, res) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, 'http://localhost');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('400 Bad Request');
    }

    let pathname = parsedUrl.pathname;
    if (pathname === '/') pathname = '/index.html';

    const safePath = path.normalize(path.join(ROOT, pathname));
    if (safePath !== ROOT && !safePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    fs.stat(safePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      const stream = fs.createReadStream(safePath);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    });
  });

  return server;
}

async function createSamplePDF() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  page.drawText('Browser Matrix Test Document', { x: 30, y: 250, size: 16 });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function checkQpdfAvailable() {
  try {
    const res = spawnSync('qpdf', ['--version'], { encoding: 'utf8' });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function runBrowserMatrix() {
  console.log('========================================================================');
  console.log('PDF Studio: Cross-Browser Playwright Matrix Test Suite (Phase 0 Task 0.3)');
  console.log('========================================================================\n');

  const hasQpdf = checkQpdfAvailable();
  if (hasQpdf) {
    console.log('System verification: QPDF CLI detected and enabled for cryptographic checks.\n');
  } else {
    console.log('System verification: QPDF CLI not found. Falling back to native PDF header checks.\n');
  }

  // Start local zero-egress static server on ephemeral port
  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.listen(0, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/`;
  console.log(`Local static server listening at ${baseUrl}\n`);

  const samplePdfBytes = await createSamplePDF();

  const tmpDownloadsDir = path.join(ROOT, 'test', '.tmp_downloads');
  if (!fs.existsSync(tmpDownloadsDir)) fs.mkdirSync(tmpDownloadsDir, { recursive: true });

  const targets = [
    {
      name: 'Chromium (Desktop)',
      id: 'chromium-desktop',
      launcher: chromium,
      launchOptions: { headless: true, downloadsPath: tmpDownloadsDir },
      contextOptions: { viewport: { width: 1280, height: 800 } },
      isMobile: false,
    },
    {
      name: 'Firefox (Desktop)',
      id: 'firefox-desktop',
      launcher: firefox,
      launchOptions: { headless: true, downloadsPath: tmpDownloadsDir },
      contextOptions: { viewport: { width: 1280, height: 800 } },
      isMobile: false,
    },
    {
      name: 'WebKit (Desktop)',
      id: 'webkit-desktop',
      launcher: webkit,
      launchOptions: { headless: true, downloadsPath: tmpDownloadsDir },
      contextOptions: { viewport: { width: 1280, height: 800 } },
      isMobile: false,
    },
    {
      name: 'Mobile Profile (Pixel 7)',
      id: 'mobile-pixel7',
      launcher: chromium,
      launchOptions: { headless: true, downloadsPath: tmpDownloadsDir },
      contextOptions: { ...devices['Pixel 7'] },
      isMobile: true,
    },
  ];

  const results = [];
  const executedTargets = new Set();

  try {
    for (const target of targets) {
      console.log(`------------------------------------------------------------------------`);
      console.log(`Testing Target: ${target.name}`);
      console.log(`------------------------------------------------------------------------`);

      const targetStart = Date.now();
      let browser;

      // Requirement 2: Missing or non-launchable browser must fail the build immediately
      try {
        browser = await target.launcher.launch(target.launchOptions);
      } catch (launchErr) {
        console.error(`\n[FATAL] Failed to launch browser engine "${target.name}":`, launchErr.message);
        console.error(`Per policy, missing or non-launchable browsers must fail the build (no silent skipping).`);
        throw new Error(`Browser launch failure for ${target.name}: ${launchErr.message}`);
      }

      assert.ok(browser, `Browser instance for ${target.name} must be active`);
      executedTargets.add(target.name);

      const context = await browser.newContext(target.contextOptions);
      const page = await context.newPage();

      const pageErrors = [];
      page.on('pageerror', (err) => {
        pageErrors.push(err.message);
      });

      // ----------------------------------------------------------------------
      // 1. Test App Loading & Layout
      // ----------------------------------------------------------------------
      console.log(`  -> Step 1: Testing App Loading & Navigation...`);
      await page.goto(baseUrl, { waitUntil: 'load' });

      const pageTitle = await page.title();
      assert.ok(pageTitle.includes('PDF Studio'), `${target.name}: Page title must contain 'PDF Studio' (got: "${pageTitle}")`);

      const logoVisible = await page.locator('#homeLogoBtn').isVisible();
      assert.ok(logoVisible, `${target.name}: #homeLogoBtn must be visible`);

      const toolCardsCount = await page.locator('.tool-card').count();
      assert.ok(toolCardsCount >= 30, `${target.name}: Expected at least 30 tool cards, found ${toolCardsCount}`);

      if (target.isMobile) {
        const viewport = page.viewportSize();
        assert.ok(viewport.width <= 500, `${target.name}: Viewport width must be mobile dimension <= 500px (got ${viewport.width})`);
        const mobileToggle = page.locator('#mobileMenuToggle');
        const mobileDrawer = page.locator('#mobileDrawer');
        assert.ok(await mobileToggle.count() > 0, `${target.name}: #mobileMenuToggle must exist in DOM`);
        assert.ok(await mobileDrawer.count() > 0, `${target.name}: #mobileDrawer must exist in DOM`);
      }

      console.log(`     ✓ Title, navigation, and ${toolCardsCount} tool cards rendered correctly.`);

      // ----------------------------------------------------------------------
      // 2. Test Tool Execution (Rotate PDF)
      // ----------------------------------------------------------------------
      console.log(`  -> Step 2: Testing Tool Execution (Rotate PDF)...`);
      await page.evaluate(() => window.openTool('rotate'));

      await page.setInputFiles('#pdfFileInput', {
        name: 'test_rotate.pdf',
        mimeType: 'application/pdf',
        buffer: samplePdfBytes,
      });

      await page.waitForSelector('#workArea', { state: 'visible', timeout: 8000 });
      await page.waitForSelector('#executeBtn:not([disabled])', { timeout: 8000 });

      const [rotateDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 12000 }),
        page.click('#executeBtn'),
      ]);

      const rotateStream = await rotateDownload.createReadStream();
      const rotateChunks = [];
      for await (const chunk of rotateStream) rotateChunks.push(chunk);
      const rotatedPdfBuffer = Buffer.concat(rotateChunks);
      try { await rotateDownload.delete(); } catch {}

      assert.ok(rotatedPdfBuffer.length > 100, `${target.name}: Downloaded rotated PDF must be non-empty (got ${rotatedPdfBuffer.length} bytes)`);
      assert.strictEqual(
        rotatedPdfBuffer.subarray(0, 5).toString('latin1'),
        '%PDF-',
        `${target.name}: Rotated PDF must start with %PDF- header`
      );

      const parsedRotatedDoc = await PDFDocument.load(rotatedPdfBuffer);
      assert.strictEqual(parsedRotatedDoc.getPageCount(), 1, `${target.name}: Rotated PDF must have 1 page`);
      console.log(`     ✓ Rotate tool executed cleanly, valid 1-page PDF produced (${rotatedPdfBuffer.length} bytes).`);

      // ----------------------------------------------------------------------
      // 3. Test Dialog Workflow (Protect Modal Dialog & Settings)
      // ----------------------------------------------------------------------
      console.log(`  -> Step 3: Testing Dialog Workflows (Protect Modal Dialog)...`);
      await page.evaluate(() => window.openModal('protectModal'));
      await page.waitForSelector('#protectModal', { state: 'visible', timeout: 5000 });

      // Verify permission checkboxes default to true
      const printToggle = page.locator('#modalProtectPermPrinting');
      const copyToggle = page.locator('#modalProtectPermCopying');
      const modToggle = page.locator('#modalProtectPermModifying');
      const annToggle = page.locator('#modalProtectPermAnnotating');

      assert.ok(await printToggle.isChecked(), `${target.name}: Printing constraint must default to checked`);
      assert.ok(await copyToggle.isChecked(), `${target.name}: Copying constraint must default to checked`);
      assert.ok(await modToggle.isChecked(), `${target.name}: Modifying constraint must default to checked`);
      assert.ok(await annToggle.isChecked(), `${target.name}: Annotating constraint must default to checked`);

      // Modify permission constraint: disable printing
      await printToggle.uncheck();
      assert.strictEqual(await printToggle.isChecked(), false, `${target.name}: Printing constraint must be uncheckable`);

      // Fill in passwords
      await page.fill('#modalProtectPasswordInput', 'MatrixPassSecret99!');
      await page.fill('#modalProtectConfirmInput', 'MatrixPassSecret99!');

      const [protectDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 12000 }),
        page.click('#modalProtectSubmitBtn'),
      ]);

      await page.waitForSelector('#protectModal', { state: 'hidden', timeout: 5000 });

      const protectStream = await protectDownload.createReadStream();
      const protectChunks = [];
      for await (const chunk of protectStream) protectChunks.push(chunk);
      const protectedPdfBuffer = Buffer.concat(protectChunks);
      try { await protectDownload.delete(); } catch {}

      assert.ok(protectedPdfBuffer.length > 100, `${target.name}: Protected PDF must be non-empty (got ${protectedPdfBuffer.length} bytes)`);
      assert.strictEqual(
        protectedPdfBuffer.subarray(0, 5).toString('latin1'),
        '%PDF-',
        `${target.name}: Protected PDF must start with %PDF- header`
      );
      assert.ok(
        protectedPdfBuffer.toString('latin1').includes('/Encrypt'),
        `${target.name}: Protected PDF must contain /Encrypt dictionary`
      );

      // Cryptographic verification via QPDF if available
      if (hasQpdf) {
        const tmpProtectedPath = path.join(ROOT, 'test', `temp_matrix_${target.id}.pdf`);
        fs.writeFileSync(tmpProtectedPath, protectedPdfBuffer);

        try {
          const encInfo = spawnSync('qpdf', ['--show-encryption', tmpProtectedPath], { encoding: 'utf8' });
          const out = encInfo.stdout + encInfo.stderr;
          assert.ok(out.includes('R = 6'), `${target.name}: Encryption must be AES-256 (R = 6)`);
          assert.ok(out.includes('print low resolution: not allowed'), `${target.name}: Low-res printing must be disallowed`);
          assert.ok(out.includes('print high resolution: not allowed'), `${target.name}: High-res printing must be disallowed`);

          const checkRes = spawnSync('qpdf', ['--password=MatrixPassSecret99!', '--check', tmpProtectedPath], { encoding: 'utf8' });
          assert.strictEqual(checkRes.status, 0, `${target.name}: File must open cleanly with password under qpdf --check`);
          console.log(`     ✓ QPDF verification confirmed AES-256 encryption & permission constraints.`);
        } finally {
          try { if (fs.existsSync(tmpProtectedPath)) fs.unlinkSync(tmpProtectedPath); } catch {}
        }
      }

      console.log(`     ✓ Protect modal dialog workflow completed successfully (${protectedPdfBuffer.length} bytes).`);

      // Ensure no fatal page runtime errors occurred
      assert.strictEqual(pageErrors.length, 0, `${target.name}: Page errors detected: ${pageErrors.join(', ')}`);

      await context.close();
      await browser.close();

      const duration = ((Date.now() - targetStart) / 1000).toFixed(2);
      console.log(`  [PASS] ${target.name} completed in ${duration}s\n`);

      results.push({
        target: target.name,
        status: 'PASS',
        duration: `${duration}s`,
      });
    }

    assert.strictEqual(executedTargets.size, targets.length, `All ${targets.length} browser targets must be executed`);

    console.log('========================================================================');
    console.log(`Playwright Cross-Browser Matrix Execution Summary:`);
    console.log('========================================================================');
    for (const r of results) {
      console.log(`✓ ${r.target.padEnd(28)} : \x1b[32m${r.status}\x1b[0m (${r.duration})`);
    }
    console.log('========================================================================');
    console.log(`Passed: ${results.length} | Failed: 0 | Assertions: ${assertionCount}`);
    console.log('========================================================================\n');

  } finally {
    try { if (fs.existsSync(tmpDownloadsDir)) fs.rmSync(tmpDownloadsDir, { recursive: true, force: true }); } catch {}
    server.close();
  }
}

if (require.main === module) {
  runBrowserMatrix()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[TEST MATRIX ERROR]:', err);
      process.exit(1);
    });
}

module.exports = { runBrowserMatrix };
