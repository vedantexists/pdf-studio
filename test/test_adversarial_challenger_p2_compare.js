/**
 * test/test_adversarial_challenger_p2_compare.js
 * Empirical Challenger 2 Adversarial Stress & Verification Harness for Phase 2:
 * Compare PDF Memory Optimization
 *
 * Targets:
 * 1. Multi-page document comparison (5-page, 10-page, identical vs modified vs asymmetric).
 * 2. Canvas dimension zeroing verification (canvas.width = 0; canvas.height = 0) after EVERY page pass.
 * 3. maxDiffImages bounding: strict retention limits (1, 3, all, 0, includeDataUrls=false).
 * 4. Identical page data URL suppression: diffPixels === 0 NEVER produces canvasDataUrl.
 * 5. Lifecycle spy: peak concurrent non-zero canvas bounding (<= 3 at any instant).
 * 6. Error-path finally block canvas zeroing (render error, diff loop error).
 * 7. Heap growth & memory retention during 20-page comparison.
 * 8. OffscreenCanvas vs HTMLCanvasElement behavior analysis.
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
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const PDFCore = require('../pdf_core');

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
  process.stdout.write(`  [CHALLENGER-P2-2] ${name} ... `);
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
    failCount++;
  }
}

// Helper to create test PDFs
async function createDocWithPages(pageConfigs) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pageConfigs.length; i++) {
    const config = pageConfigs[i];
    const page = doc.addPage([config.width || 400, config.height || 600]);
    page.drawText(config.text || `Default Page ${i + 1}`, {
      x: 50,
      y: 550,
      size: 16,
      font,
      color: config.color || rgb(0, 0, 0),
    });
    if (config.subtext) {
      page.drawText(config.subtext, {
        x: 50,
        y: 500,
        size: 12,
        font,
      });
    }
  }
  return await doc.save();
}

// Canvas Spy Environment for Node.js
function setupCanvasSpyEnvironment(options = {}) {
  const allCanvases = [];
  let activeNonZeroCanvases = 0;
  let peakActiveNonZeroCanvases = 0;
  const lifecycleEvents = [];

  class SpyCanvas {
    constructor(w = 300, h = 150) {
      this._width = w;
      this._height = h;
      this.id = allCanvases.length + 1;
      this.history = [{ prop: 'init', width: w, height: h, time: Date.now() }];
      if (w > 0 && h > 0) {
        activeNonZeroCanvases++;
        if (activeNonZeroCanvases > peakActiveNonZeroCanvases) {
          peakActiveNonZeroCanvases = activeNonZeroCanvases;
        }
      }
      lifecycleEvents.push({ event: 'created', id: this.id, w, h });
      allCanvases.push(this);
    }

    get width() {
      return this._width;
    }
    set width(val) {
      const prevW = this._width;
      this._width = val;
      this.history.push({ prop: 'width', from: prevW, to: val });
      lifecycleEvents.push({ event: 'width_set', id: this.id, from: prevW, to: val });
      if (prevW > 0 && val === 0 && this._height === 0) {
        activeNonZeroCanvases = Math.max(0, activeNonZeroCanvases - 1);
      }
    }

    get height() {
      return this._height;
    }
    set height(val) {
      const prevH = this._height;
      this._height = val;
      this.history.push({ prop: 'height', from: prevH, to: val });
      lifecycleEvents.push({ event: 'height_set', id: this.id, from: prevH, to: val });
      if (this._width === 0 && prevH > 0 && val === 0) {
        activeNonZeroCanvases = Math.max(0, activeNonZeroCanvases - 1);
      }
    }

    getContext(type) {
      if (type !== '2d') return null;
      if (!this._ctx) {
        const self = this;
        const baseCtx = {
          canvas: self,
          fillRect: () => {},
          save: () => {},
          restore: () => {},
          setLineDash: () => {},
          transform: () => {},
          getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
          createImageData: (w, h) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          }),
          getImageData: (x, y, w, h) => {
            if (options.throwOnGetImageData && self.id === options.throwOnCanvasId) {
              throw new Error('Injected getImageData fault');
            }
            const data = new Uint8ClampedArray(w * h * 4);
            if (options.modifyCanvasIds && options.modifyCanvasIds.includes(self.id)) {
              for (let i = 0; i < data.length; i += 4) {
                data[i] = 220; // Red discrepancy
                data[i + 3] = 255;
              }
            } else if (options.modifiedPageIndices) {
              // Canvas order per page: canvasA = 3*p + 1, canvasB = 3*p + 2, diffCanvas = 3*p + 3
              const pageIdx = Math.floor((self.id - 1) / 3);
              const isCanvasB = (self.id - 1) % 3 === 1;
              if (isCanvasB && options.modifiedPageIndices.includes(pageIdx)) {
                for (let i = 0; i < data.length; i += 4) {
                  data[i] = 255; // Discrepancy
                  data[i + 3] = 255;
                }
              }
            }
            return { width: w, height: h, data };
          },
          putImageData: () => {},
        };
        this._ctx = new Proxy(baseCtx, {
          get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
          },
        });
      }
      return this._ctx;
    }

    toDataURL(mime) {
      if (options.disableToDataURL) {
        return undefined;
      }
      return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==#canvas_${this.id}`;
    }
  }

  global.document = {
    createElement: (tag) => {
      if (tag === 'canvas') return new SpyCanvas();
      return {};
    },
  };

  return {
    allCanvases,
    getPeakActive: () => peakActiveNonZeroCanvases,
    getLifecycle: () => lifecycleEvents,
    cleanup: () => {
      delete global.document;
    },
  };
}

async function runAdversarialCompareSuite() {
  console.log('=== Empirical Challenger 2: Compare PDF Memory & Canvas Optimization ===\n');

  // =========================================================================
  // 1. Multi-Page Identical Documents (5-page and 10-page)
  // =========================================================================
  console.log('--- 1. Multi-Page Identical Document Tests ---');

  await test('1.1 5-page identical document: 0% diff, zero data URLs allocated', async () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({
      text: `Identical Page ${i + 1} - Standard Contract Clause`,
      subtext: `Hash verification: 0x${(i * 111111).toString(16)}`,
    }));
    const bytes = await createDocWithPages(pages);

    const { allCanvases, cleanup } = setupCanvasSpyEnvironment();
    try {
      const result = await PDFCore.comparePDF(bytes, bytes, { maxDiffImages: 1 });
      assert.strictEqual(result.hasDifferences, false, 'Identical 5-page must have hasDifferences=false');
      assert.strictEqual(result.totalDiffPixels, 0, 'Identical 5-page must have 0 totalDiffPixels');
      assert.strictEqual(result.diffPages.length, 5, 'Must report all 5 pages');

      for (let i = 0; i < result.diffPages.length; i++) {
        const p = result.diffPages[i];
        assert.strictEqual(p.diffPixels, 0, `Page ${i + 1} diffPixels must be 0`);
        assert.strictEqual(p.diffPercent, 0, `Page ${i + 1} diffPercent must be 0`);
        assert.strictEqual(p.canvasDataUrl, undefined, `Page ${i + 1} canvasDataUrl must be undefined`);
      }

      // Assert all 15 canvases (3 per page * 5) were zeroed in finally
      assert.strictEqual(allCanvases.length, 15, 'Must have created 15 canvases total (3 per page)');
      for (const c of allCanvases) {
        assert.strictEqual(c.width, 0, `Canvas ${c.id} width must be zeroed`);
        assert.strictEqual(c.height, 0, `Canvas ${c.id} height must be zeroed`);
      }
    } finally {
      cleanup();
    }
  });

  await test('1.2 10-page identical document: full zeroing across all 30 canvases', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      text: `Doc Ten Identical Page ${i + 1}`,
      subtext: `Clause ${i + 1}.0`,
    }));
    const bytes = await createDocWithPages(pages);

    const { allCanvases, getPeakActive, cleanup } = setupCanvasSpyEnvironment();
    try {
      const result = await PDFCore.comparePDF(bytes, bytes);
      assert.strictEqual(result.hasDifferences, false);
      assert.strictEqual(result.totalDiffPixels, 0);
      assert.strictEqual(result.diffPages.length, 10);

      // Verify zero canvasDataUrls
      const urls = result.diffPages.filter((p) => p.canvasDataUrl);
      assert.strictEqual(urls.length, 0, 'Zero data URLs should be generated for identical 10-page PDF');

      // Verify 30 canvases created (canvasA, canvasB, diffCanvas for 10 pages)
      assert.strictEqual(allCanvases.length, 30, 'Must create exactly 30 canvases for 10 pages');
      for (const c of allCanvases) {
        assert.strictEqual(c.width, 0, `Canvas ${c.id} must have width=0`);
        assert.strictEqual(c.height, 0, `Canvas ${c.id} must have height=0`);
      }

      // Peak concurrent active non-zero canvases must be bounded (<= 3 at any instant)
      const peak = getPeakActive();
      assert(peak <= 3, `Peak active non-zero canvases must be <= 3 (actual: ${peak})`);
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // 2. Multi-Page Modified Documents & Bounding Controls
  // =========================================================================
  console.log('\n--- 2. Multi-Page Modified Document Tests & maxDiffImages Bounding ---');

  await test('2.1 10-page document with alternating page modifications (maxDiffImages: 1)', async () => {
    const pagesA = Array.from({ length: 10 }, (_, i) => ({
      text: `Original Document Page ${i + 1}`,
    }));
    const pagesB = Array.from({ length: 10 }, (_, i) => ({
      text: i % 2 === 1 ? `MODIFIED REVISION Page ${i + 1}` : `Original Document Page ${i + 1}`,
    }));

    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    // Modified pages in B are indices 1, 3, 5, 7, 9 (odd 0-based indices)
    const modifiedPageIndices = [1, 3, 5, 7, 9];
    const { allCanvases, cleanup } = setupCanvasSpyEnvironment({ modifiedPageIndices });
    try {
      const result = await PDFCore.comparePDF(bytesA, bytesB, { maxDiffImages: 1 });
      assert.strictEqual(result.hasDifferences, true);
      assert.strictEqual(result.diffPages.length, 10);

      // Exactly 5 pages should have diffPixels > 0
      const pagesWithDiff = result.diffPages.filter((p) => p.diffPixels > 0);
      assert.strictEqual(pagesWithDiff.length, 5, '5 modified pages must be detected');

      // But EXACTLY 1 page must have canvasDataUrl (first modified page, page 2 / index 1)
      const pagesWithDataUrl = result.diffPages.filter((p) => p.canvasDataUrl);
      assert.strictEqual(pagesWithDataUrl.length, 1, 'Only 1 canvasDataUrl allowed with maxDiffImages: 1');
      assert.strictEqual(pagesWithDataUrl[0].pageIndex, 1, 'First modified page (index 1) gets the data URL');

      // The other 4 modified pages must have canvasDataUrl === undefined
      const otherModified = pagesWithDiff.filter((p) => p.pageIndex !== 1);
      for (const p of otherModified) {
        assert.strictEqual(p.canvasDataUrl, undefined, `Page ${p.pageIndex + 1} must omit canvasDataUrl`);
      }

      // All 30 canvases must be zeroed
      assert.strictEqual(allCanvases.length, 30);
      for (const c of allCanvases) {
        assert.strictEqual(c.width, 0);
        assert.strictEqual(c.height, 0);
      }
    } finally {
      cleanup();
    }
  });

  await test('2.2 10-page document with ALL pages modified (maxDiffImages: 3)', async () => {
    const pagesA = Array.from({ length: 10 }, (_, i) => ({ text: `Page ${i + 1} Rev A` }));
    const pagesB = Array.from({ length: 10 }, (_, i) => ({ text: `Page ${i + 1} Rev B` }));
    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    const modifiedPageIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { cleanup } = setupCanvasSpyEnvironment({ modifiedPageIndices });
    try {
      const result = await PDFCore.comparePDF(bytesA, bytesB, { maxDiffImages: 3 });
      const pagesWithDataUrl = result.diffPages.filter((p) => p.canvasDataUrl);
      assert.strictEqual(pagesWithDataUrl.length, 3, 'Exactly 3 data URLs retained when maxDiffImages: 3');
      assert.strictEqual(pagesWithDataUrl[0].pageIndex, 0);
      assert.strictEqual(pagesWithDataUrl[1].pageIndex, 1);
      assert.strictEqual(pagesWithDataUrl[2].pageIndex, 2);

      // Remaining 7 pages must not have data URLs
      const remainingPages = result.diffPages.slice(3);
      assert.strictEqual(remainingPages.length, 7);
      for (const p of remainingPages) {
        assert.strictEqual(p.canvasDataUrl, undefined, `Page ${p.pageIndex + 1} must omit data URL`);
      }
    } finally {
      cleanup();
    }
  });

  await test('2.3 10-page document with ALL pages modified (allDiffImages: true)', async () => {
    const pagesA = Array.from({ length: 10 }, (_, i) => ({ text: `Page ${i + 1} Rev A` }));
    const pagesB = Array.from({ length: 10 }, (_, i) => ({ text: `Page ${i + 1} Rev B` }));
    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    const modifiedPageIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { cleanup } = setupCanvasSpyEnvironment({ modifiedPageIndices });
    try {
      const result = await PDFCore.comparePDF(bytesA, bytesB, { allDiffImages: true });
      const pagesWithDataUrl = result.diffPages.filter((p) => p.canvasDataUrl);
      assert.strictEqual(pagesWithDataUrl.length, 10, 'All 10 data URLs retained when allDiffImages: true');
    } finally {
      cleanup();
    }
  });

  await test('2.4 10-page document with ALL pages modified (includeDataUrls: false)', async () => {
    const pagesA = Array.from({ length: 10 }, (_, i) => ({ text: `Page ${i + 1} Rev A` }));
    const pagesB = Array.from({ length: 10 }, (_, i) => ({ text: `Page ${i + 1} Rev B` }));
    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    const modifiedPageIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { cleanup } = setupCanvasSpyEnvironment({ modifiedPageIndices });
    try {
      const result = await PDFCore.comparePDF(bytesA, bytesB, { includeDataUrls: false });
      const pagesWithDataUrl = result.diffPages.filter((p) => p.canvasDataUrl);
      assert.strictEqual(pagesWithDataUrl.length, 0, 'Zero data URLs retained when includeDataUrls: false');
      assert(result.totalDiffPixels > 0, 'Metrics still computed');
    } finally {
      cleanup();
    }
  });

  await test('2.5 Boundary check: maxDiffImages: 0 suppresses all data URLs', async () => {
    const pagesA = Array.from({ length: 5 }, (_, i) => ({ text: `Page ${i + 1} A` }));
    const pagesB = Array.from({ length: 5 }, (_, i) => ({ text: `Page ${i + 1} B` }));
    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    const modifiedPageIndices = [0, 1, 2, 3, 4];
    const { cleanup } = setupCanvasSpyEnvironment({ modifiedPageIndices });
    try {
      const result = await PDFCore.comparePDF(bytesA, bytesB, { maxDiffImages: 0 });
      const pagesWithDataUrl = result.diffPages.filter((p) => p.canvasDataUrl);
      assert.strictEqual(pagesWithDataUrl.length, 0, 'maxDiffImages: 0 must retain 0 data URLs');
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // 3. Canvas Lifetime & Zeroing Step-by-Step Verification
  // =========================================================================
  console.log('\n--- 3. Canvas Lifetime & Step-by-Step Zeroing ---');

  await test('3.1 Canvas dimension zeroing order: page N canvases zeroed before page N+1 allocated', async () => {
    const pagesA = Array.from({ length: 4 }, (_, i) => ({ text: `Page ${i + 1}` }));
    const bytesA = await createDocWithPages(pagesA);

    const { getLifecycle, cleanup } = setupCanvasSpyEnvironment();
    try {
      await PDFCore.comparePDF(bytesA, bytesA);
      const events = getLifecycle();

      // Check event sequence: for each page i (0 to 3), canvases 3*i+1, 3*i+2, 3*i+3 must have width_set to 0
      // BEFORE canvas 3*(i+1)+1 is created
      for (let p = 0; p < 3; p++) {
        const c1 = p * 3 + 1;
        const c2 = p * 3 + 2;
        const c3 = p * 3 + 3;
        const nextC1 = (p + 1) * 3 + 1;

        const c1ZeroIdx = events.findIndex((e) => e.event === 'width_set' && e.id === c1 && e.to === 0);
        const c2ZeroIdx = events.findIndex((e) => e.event === 'width_set' && e.id === c2 && e.to === 0);
        const c3ZeroIdx = events.findIndex((e) => e.event === 'width_set' && e.id === c3 && e.to === 0);
        const nextCreateIdx = events.findIndex((e) => e.event === 'created' && e.id === nextC1);

        assert(c1ZeroIdx !== -1, `Canvas ${c1} width must be zeroed`);
        assert(c2ZeroIdx !== -1, `Canvas ${c2} width must be zeroed`);
        assert(c3ZeroIdx !== -1, `Canvas ${c3} width must be zeroed`);
        assert(nextCreateIdx !== -1, `Next canvas ${nextC1} must be created`);

        assert(
          c1ZeroIdx < nextCreateIdx && c2ZeroIdx < nextCreateIdx && c3ZeroIdx < nextCreateIdx,
          `Page ${p + 1} canvases must all be zeroed BEFORE page ${p + 2} canvas is allocated!`
        );
      }
    } finally {
      cleanup();
    }
  });

  await test('3.2 Concurrent active non-zero canvas invariant: never exceeds 3', async () => {
    const pagesA = Array.from({ length: 8 }, (_, i) => ({ text: `Document A Page ${i + 1}` }));
    const pagesB = Array.from({ length: 8 }, (_, i) => ({ text: `Document B Page ${i + 1}` }));
    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    const { getPeakActive, cleanup } = setupCanvasSpyEnvironment({ modifiedPageIndices: [0, 2, 4, 6] });
    try {
      await PDFCore.comparePDF(bytesA, bytesB, { maxDiffImages: 1 });
      const peak = getPeakActive();
      assert(peak <= 3, `Peak active non-zero canvases must be <= 3 throughout 8 pages (actual: ${peak})`);
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // 4. Error Resilience in Canvas Processing (Finally Block Execution)
  // =========================================================================
  console.log('\n--- 4. Error Resilience & Finally Zeroing Under Fault Injection ---');

  await test('4.1 Injected error during pixel diff loop still executes finally zeroing', async () => {
    const pagesA = Array.from({ length: 3 }, (_, i) => ({ text: `Page ${i + 1} A` }));
    const pagesB = Array.from({ length: 3 }, (_, i) => ({ text: `Page ${i + 1} B` }));
    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    // Canvas ID 5 is canvasB on page 2. Let's throw on canvas ID 4 (canvasA on page 2)
    const { allCanvases, cleanup } = setupCanvasSpyEnvironment({
      throwOnGetImageData: true,
      throwOnCanvasId: 4,
    });
    try {
      // comparePDF catches canvas errors, falls back to text comparison for that page, and executes finally!
      const result = await PDFCore.comparePDF(bytesA, bytesB);
      assert.strictEqual(result.diffPages.length, 3, 'Must complete all 3 pages via fallback');

      // Assert that canvasA (id 4), canvasB (id 5), and diffCanvas (if created) were zeroed in finally
      const c4 = allCanvases.find((c) => c.id === 4);
      assert(c4, 'Canvas 4 must exist');
      assert.strictEqual(c4.width, 0, 'Canvas 4 width must be zeroed even though it threw');
      assert.strictEqual(c4.height, 0, 'Canvas 4 height must be zeroed even though it threw');

      const c5 = allCanvases.find((c) => c.id === 5);
      if (c5) {
        assert.strictEqual(c5.width, 0, 'Canvas 5 width must be zeroed');
        assert.strictEqual(c5.height, 0, 'Canvas 5 height must be zeroed');
      }
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // 5. Asymmetric Document Page Counts
  // =========================================================================
  console.log('\n--- 5. Asymmetric Page Counts (10 pages vs 5 pages, 4 vs 8) ---');

  await test('5.1 10 pages vs 5 pages: trailing pages detect 100% diff, no canvas leak', async () => {
    const pages10 = Array.from({ length: 10 }, (_, i) => ({ text: `Document Page ${i + 1}` }));
    const pages5 = Array.from({ length: 5 }, (_, i) => ({ text: `Document Page ${i + 1}` }));
    const bytes10 = await createDocWithPages(pages10);
    const bytes5 = await createDocWithPages(pages5);

    const { allCanvases, cleanup } = setupCanvasSpyEnvironment();
    try {
      const result = await PDFCore.comparePDF(bytes10, bytes5, { maxDiffImages: 1 });
      assert.strictEqual(result.diffPages.length, 10);
      assert.strictEqual(result.hasDifferences, true);

      // Pages 1-5 are identical (0% diff)
      for (let i = 0; i < 5; i++) {
        assert.strictEqual(result.diffPages[i].diffPercent, 0);
      }
      // Pages 6-10 are deleted in B (100% diff)
      for (let i = 5; i < 10; i++) {
        assert.strictEqual(result.diffPages[i].diffPercent, 100);
        assert(result.diffPages[i].diffPixels > 0);
      }

      // First 5 pages created canvases (15 total); trailing 5 pages do not create dual canvases
      assert.strictEqual(allCanvases.length, 15);
      for (const c of allCanvases) {
        assert.strictEqual(c.width, 0);
        assert.strictEqual(c.height, 0);
      }
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // 6. Heap Footprint & Memory Retention Under Multi-Page Load (20 Pages)
  // =========================================================================
  console.log('\n--- 6. 20-Page Heap Memory Retention Comparison ---');

  await test('6.1 20-page comparison: maxDiffImages: 1 vs allDiffImages: true memory delta', async () => {
    const pagesA = Array.from({ length: 20 }, (_, i) => ({ text: `20-Page Doc Rev A Page ${i + 1}` }));
    const pagesB = Array.from({ length: 20 }, (_, i) => ({ text: `20-Page Doc Rev B Page ${i + 1}` }));
    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    const modifiedPageIndices = Array.from({ length: 20 }, (_, i) => i);

    // Run 1: maxDiffImages: 1
    const env1 = setupCanvasSpyEnvironment({ modifiedPageIndices });
    let resBounded;
    try {
      resBounded = await PDFCore.comparePDF(bytesA, bytesB, { maxDiffImages: 1 });
    } finally {
      env1.cleanup();
    }

    // Run 2: allDiffImages: true
    const env2 = setupCanvasSpyEnvironment({ modifiedPageIndices });
    let resUnbounded;
    try {
      resUnbounded = await PDFCore.comparePDF(bytesA, bytesB, { allDiffImages: true });
    } finally {
      env2.cleanup();
    }

    const boundedUrls = resBounded.diffPages.filter((p) => p.canvasDataUrl);
    const unboundedUrls = resUnbounded.diffPages.filter((p) => p.canvasDataUrl);

    assert.strictEqual(boundedUrls.length, 1, 'Bounded run must contain exactly 1 data URL');
    assert.strictEqual(unboundedUrls.length, 20, 'Unbounded run must contain 20 data URLs');

    // Calculate retained JSON/memory payload size
    const boundedSize = JSON.stringify(resBounded).length;
    const unboundedSize = JSON.stringify(resUnbounded).length;

    console.log(`\n     [Memory Analysis]`);
    console.log(`     Retained Result Object Size (maxDiffImages: 1):  ${boundedSize} bytes`);
    console.log(`     Retained Result Object Size (allDiffImages: true): ${unboundedSize} bytes`);
    console.log(`     Memory Payload Reduction: ${((1 - boundedSize / unboundedSize) * 100).toFixed(1)}%`);

    assert(boundedSize < unboundedSize, 'Bounded result payload must be strictly smaller');
  });

  // =========================================================================
  // 7. OffscreenCanvas Behavior & Browser Invariant Investigation
  // =========================================================================
  console.log('\n--- 7. OffscreenCanvas Behavior & Browser Invariant Investigation ---');

  await test('7.1 OffscreenCanvas in global scope: graceful handling and zeroing', async () => {
    const pagesA = Array.from({ length: 3 }, (_, i) => ({ text: `Offscreen Page ${i + 1} A` }));
    const pagesB = Array.from({ length: 3 }, (_, i) => ({ text: `Offscreen Page ${i + 1} B` }));
    const bytesA = await createDocWithPages(pagesA);
    const bytesB = await createDocWithPages(pagesB);

    const offscreenCanvases = [];
    class MockOffscreenCanvas {
      constructor(w, h) {
        this.width = w;
        this.height = h;
        offscreenCanvases.push(this);
      }
      getContext(type) {
        if (type !== '2d') return null;
        const self = this;
        const baseCtx = {
          canvas: self,
          fillRect: () => {},
          save: () => {},
          restore: () => {},
          setLineDash: () => {},
          transform: () => {},
          getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
          createImageData: (w, h) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          }),
          getImageData: (x, y, w, h) => {
            const data = new Uint8ClampedArray(w * h * 4);
            return { width: w, height: h, data };
          },
          putImageData: () => {},
        };
        return new Proxy(baseCtx, {
          get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
          },
        });
      }
      // Note: OffscreenCanvas standard specification has NO toDataURL method!
    }

    global.OffscreenCanvas = MockOffscreenCanvas;
    try {
      const result = await PDFCore.comparePDF(bytesA, bytesB, { maxDiffImages: 1 });
      assert.strictEqual(result.diffPages.length, 3);
      // Because OffscreenCanvas has no toDataURL, comparePDF must not crash,
      // and canvasDataUrl should simply be omitted safely
      for (const p of result.diffPages) {
        assert.strictEqual(p.canvasDataUrl, undefined);
      }
      // Canvases must still have width=0 and height=0 in finally!
      assert.strictEqual(offscreenCanvases.length, 9);
      for (const oc of offscreenCanvases) {
        assert.strictEqual(oc.width, 0, 'OffscreenCanvas width must be zeroed');
        assert.strictEqual(oc.height, 0, 'OffscreenCanvas height must be zeroed');
      }
    } finally {
      delete global.OffscreenCanvas;
    }
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n======================================================');
  console.log(`Challenger P2-2 Compare PDF Memory Optimization Results:`);
  console.log(`Passed: ${passCount} | Failed: ${failCount} | Assertions: ${assertionCount}`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAdversarialCompareSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
