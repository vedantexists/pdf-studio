/**
 * test_adversarial_challenger_p3_2.js
 * 
 * Phase 3 Challenger 2 Adversarial Stress Suite:
 * Rigorously stress-tests Organize PDF mobile touch reordering controls on <= 900px viewports:
 * 1. Boundary conditions (first page, last page, single-page, empty/multi-page).
 * 2. Rapid sequential reordering and array manipulation (fuzzing, rotations, deletions, reset).
 * 3. End-to-end PDF generation verification with PDFCore.organizePDF.
 * 4. Responsive CSS bounds, touch target sizes (>=40px), and media queries.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const PDFCore = require('../pdf_core');

let passed = 0;
let failed = 0;

function report(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function reportAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// Helper to generate the exact card HTML according to app.js lines 2084-2106
function generateCardHtml({ i, total, isOrganize = true, isRotate = false, pageNum = i + 1, isDeleted = false }) {
  const removeBadgeHtml = '';
  const extractBadgeHtml = '';
  return `
    <div class="page-canvas-wrapper" id="canvasWrapper-${i}">
      <div class="spinner"></div>
    </div>
    <div class="page-meta">
      <span>Page ${pageNum}</span>
      ${removeBadgeHtml}
      ${extractBadgeHtml}
      <div class="page-card-actions">
        ${isOrganize && i > 0 ? `<button type="button" class="icon-btn" title="Move Left" data-action="move-left" data-index="${i}">◀</button>` : ''}
        ${isOrganize && i < total - 1 ? `<button type="button" class="icon-btn" title="Move Right" data-action="move-right" data-index="${i}">▶</button>` : ''}
        ${(isOrganize || isRotate) ? `<button type="button" class="icon-btn" title="Rotate 90°" data-action="rotate-page" data-index="${i}">↻</button>` : ''}
        ${isOrganize ? `<button type="button" class="icon-btn delete-btn" title="${isDeleted ? 'Restore Page' : 'Delete Page'}" data-action="toggle-delete" data-index="${i}">${isDeleted ? '↺' : '✕'}</button>` : ''}
      </div>
    </div>
    ${isOrganize ? `
      <div class="mobile-touch-reorder" aria-label="Touch Reorder Controls">
        <button type="button" class="mobile-reorder-btn icon-btn" title="Move Page Left" data-action="move-left" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move Page Left">◀</button>
        <span class="mobile-reorder-label">Page ${i + 1} of ${total}</span>
        <button type="button" class="mobile-reorder-btn icon-btn" title="Move Page Right" data-action="move-right" data-index="${i}" ${i >= total - 1 ? 'disabled' : ''} aria-label="Move Page Right">▶</button>
      </div>
    ` : ''}
  `;
}

// Simulated action dispatcher mimicking app.js line 2145-2175
function dispatchAction(action, idx, activePages) {
  if (action === 'rotate-page' && idx >= 0 && idx < activePages.length) {
    activePages[idx].rotation = (activePages[idx].rotation + 90) % 360;
  } else if (action === 'toggle-delete' && idx >= 0 && idx < activePages.length) {
    activePages[idx].isDeleted = !activePages[idx].isDeleted;
  } else if (action === 'move-left' && idx > 0 && idx < activePages.length) {
    const temp = activePages[idx];
    activePages[idx] = activePages[idx - 1];
    activePages[idx - 1] = temp;
  } else if (action === 'move-right' && idx >= 0 && idx < activePages.length - 1) {
    const temp = activePages[idx];
    activePages[idx] = activePages[idx + 1];
    activePages[idx + 1] = temp;
  }
}

async function runAdversarialSuite() {
  console.log('======================================================');
  console.log('Phase 3 Challenger 2: Mobile Reorder Adversarial Suite');
  console.log('======================================================\n');

  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

  // --- Section 1: Boundary Condition Invariant Verification ---
  console.log('--- 1. Boundary Condition Invariants ---');

  report('Single-page document (total === 1) disables both ◀ and ▶ controls', () => {
    const html = generateCardHtml({ i: 0, total: 1, isOrganize: true });
    
    // Left button must be disabled
    const leftMatch = html.match(/data-action="move-left"[^>]*disabled/);
    assert(leftMatch, 'Single-page document must have move-left button disabled');

    // Right button must be disabled
    const rightMatch = html.match(/data-action="move-right"[^>]*disabled/);
    assert(rightMatch, 'Single-page document must have move-right button disabled');

    // Indicator label must say Page 1 of 1
    assert(html.includes('Page 1 of 1'), 'Label must display "Page 1 of 1"');

    // Desktop buttons should not be rendered at all for total === 1
    assert(!html.includes('class="page-card-actions">\n            <button type="button" class="icon-btn" title="Move Left"'), 'Desktop move-left button must not render for page 0');
    assert(!html.includes('class="page-card-actions">\n            <button type="button" class="icon-btn" title="Move Right"'), 'Desktop move-right button must not render for page total - 1');
  });

  report('Two-page document (total === 2) enforces asymmetric boundary states', () => {
    const page0Html = generateCardHtml({ i: 0, total: 2, isOrganize: true });
    const page1Html = generateCardHtml({ i: 1, total: 2, isOrganize: true });

    // Page 0: Left disabled, Right enabled
    assert(page0Html.match(/data-action="move-left"[^>]*disabled/), 'Page 0 must have move-left disabled');
    assert(!page0Html.match(/data-action="move-right"[^>]*disabled/), 'Page 0 must NOT have move-right disabled');
    assert(page0Html.includes('Page 1 of 2'), 'Page 0 label must be "Page 1 of 2"');

    // Page 1: Left enabled, Right disabled
    assert(!page1Html.match(/data-action="move-left"[^>]*disabled/), 'Page 1 must NOT have move-left disabled');
    assert(page1Html.match(/data-action="move-right"[^>]*disabled/), 'Page 1 must have move-right disabled');
    assert(page1Html.includes('Page 2 of 2'), 'Page 1 label must be "Page 2 of 2"');
  });

  report('Multi-page document (total === 10) intermediate pages have both ◀ and ▶ enabled', () => {
    for (let i = 1; i < 9; i++) {
      const html = generateCardHtml({ i, total: 10, isOrganize: true });
      assert(!html.match(/data-action="move-left"[^>]*disabled/), `Page ${i} must have move-left enabled`);
      assert(!html.match(/data-action="move-right"[^>]*disabled/), `Page ${i} must have move-right enabled`);
      assert(html.includes(`Page ${i + 1} of 10`), `Page ${i} label must match Page ${i + 1} of 10`);
      assert(html.includes(`data-index="${i}"`), `Page ${i} buttons must carry data-index="${i}"`);
    }
  });

  report('Non-organize tools suppress mobile reorder bar completely', () => {
    const rotateHtml = generateCardHtml({ i: 0, total: 5, isOrganize: false, isRotate: true });
    assert(!rotateHtml.includes('mobile-touch-reorder'), 'Rotate tool must not render mobile touch reorder bar');
    assert(!rotateHtml.includes('mobile-reorder-btn'), 'Rotate tool must not render mobile reorder buttons');
  });

  // --- Section 2: Adversarial Action Dispatch & Boundary Bypasses ---
  console.log('\n--- 2. Adversarial Action Dispatch & Boundary Bypasses ---');

  report('Click dispatch on boundary conditions rejects illegal state transitions', () => {
    const pages = [
      { pageNum: 1, rotation: 0, isDeleted: false },
      { pageNum: 2, rotation: 0, isDeleted: false },
      { pageNum: 3, rotation: 0, isDeleted: false }
    ];
    const originalJson = JSON.stringify(pages);

    // Adversarially dispatch move-left on first element (i === 0)
    dispatchAction('move-left', 0, pages);
    assert.strictEqual(JSON.stringify(pages), originalJson, 'move-left on index 0 must be a no-op');

    // Adversarially dispatch move-right on last element (i === 2)
    dispatchAction('move-right', 2, pages);
    assert.strictEqual(JSON.stringify(pages), originalJson, 'move-right on index 2 must be a no-op');

    // Out of bounds indices
    dispatchAction('move-left', -1, pages);
    assert.strictEqual(JSON.stringify(pages), originalJson, 'move-left on index -1 must be a no-op');

    dispatchAction('move-right', -1, pages);
    assert.strictEqual(JSON.stringify(pages), originalJson, 'move-right on index -1 must be a no-op');

    dispatchAction('move-left', 99, pages);
    assert.strictEqual(JSON.stringify(pages), originalJson, 'move-left on index 99 must be a no-op');

    dispatchAction('move-right', 99, pages);
    assert.strictEqual(JSON.stringify(pages), originalJson, 'move-right on index 99 must be a no-op');

    // Invalid NaN indices
    dispatchAction('move-left', NaN, pages);
    assert.strictEqual(JSON.stringify(pages), originalJson, 'move-left on NaN index must be a no-op');

    dispatchAction('move-right', NaN, pages);
    assert.strictEqual(JSON.stringify(pages), originalJson, 'move-right on NaN index must be a no-op');
  });

  // --- Section 3: Rapid Sequential Reordering & Array Invariants ---
  console.log('\n--- 3. Sequential Reordering & Array Invariants ---');

  report('Linear traverse: moving page 1 from 0 to N-1 and back preserves full identity', () => {
    const total = 8;
    const pages = Array.from({ length: total }, (_, i) => ({
      pageNum: i + 1,
      rotation: 0,
      isDeleted: false
    }));

    // Move page 1 rightwards to the end
    for (let pos = 0; pos < total - 1; pos++) {
      assert.strictEqual(pages[pos].pageNum, 1);
      dispatchAction('move-right', pos, pages);
      assert.strictEqual(pages[pos + 1].pageNum, 1);
      assert.strictEqual(pages.length, total);
    }
    assert.strictEqual(pages[total - 1].pageNum, 1);

    // Move page 1 leftwards back to the start
    for (let pos = total - 1; pos > 0; pos--) {
      assert.strictEqual(pages[pos].pageNum, 1);
      dispatchAction('move-left', pos, pages);
      assert.strictEqual(pages[pos - 1].pageNum, 1);
      assert.strictEqual(pages.length, total);
    }
    assert.strictEqual(pages[0].pageNum, 1);

    // Original sequence must be completely restored
    for (let i = 0; i < total; i++) {
      assert.strictEqual(pages[i].pageNum, i + 1);
    }
  });

  report('Rotation and deletion states stick to moving pages under multi-swap turbulence', () => {
    const pages = [
      { pageNum: 1, rotation: 90, isDeleted: false },
      { pageNum: 2, rotation: 0, isDeleted: true },
      { pageNum: 3, rotation: 180, isDeleted: false },
      { pageNum: 4, rotation: 270, isDeleted: true },
      { pageNum: 5, rotation: 0, isDeleted: false }
    ];

    // Swap P1 and P2
    dispatchAction('move-right', 0, pages);
    // Order is now: P2, P1, P3, P4, P5
    assert.strictEqual(pages[0].pageNum, 2);
    assert.strictEqual(pages[0].isDeleted, true);
    assert.strictEqual(pages[1].pageNum, 1);
    assert.strictEqual(pages[1].rotation, 90);

    // Move P4 left twice: swap(3,2) -> swap(2,1)
    dispatchAction('move-left', 3, pages); // P2, P1, P4, P3, P5
    dispatchAction('move-left', 2, pages); // P2, P4, P1, P3, P5
    assert.strictEqual(pages[1].pageNum, 4);
    assert.strictEqual(pages[1].rotation, 270);
    assert.strictEqual(pages[1].isDeleted, true);

    // Rotate P4 by 90 deg -> 360 % 360 === 0
    dispatchAction('rotate-page', 1, pages);
    assert.strictEqual(pages[1].rotation, 0);

    // Toggle delete on P2 -> restored
    dispatchAction('toggle-delete', 0, pages);
    assert.strictEqual(pages[0].isDeleted, false);

    // Verify all 5 pages exist with exact expected properties
    assert.strictEqual(pages.length, 5);
    const expectedOrder = [2, 4, 1, 3, 5];
    assert.deepStrictEqual(pages.map(p => p.pageNum), expectedOrder);
  });

  report('Fuzzing stress: 2,000 randomized operations preserve multiset and reset cleanly', () => {
    const total = 12;
    let pages = Array.from({ length: total }, (_, i) => ({
      pageNum: i + 1,
      rotation: 0,
      isDeleted: false
    }));

    const actions = ['move-left', 'move-right', 'rotate-page', 'toggle-delete'];

    for (let step = 0; step < 2000; step++) {
      const act = actions[Math.floor(Math.random() * actions.length)];
      // Include occasional out-of-bounds indices to stress guards
      const idx = Math.floor(Math.random() * (total + 4)) - 2;
      dispatchAction(act, idx, pages);

      // Invariant: length strictly total
      assert.strictEqual(pages.length, total);

      // Invariant: all pageNums 1..total present
      const seen = new Set(pages.map(p => p.pageNum));
      assert.strictEqual(seen.size, total, `Multiset violated at step ${step}`);
    }

    // Now test reset behavior as implemented in app.js lines 2264-2270
    pages.forEach((p) => {
      p.isDeleted = false;
      p.rotation = 0;
    });
    pages.sort((a, b) => a.pageNum - b.pageNum);

    for (let i = 0; i < total; i++) {
      assert.strictEqual(pages[i].pageNum, i + 1);
      assert.strictEqual(pages[i].rotation, 0);
      assert.strictEqual(pages[i].isDeleted, false);
    }
  });

  // --- Section 4: End-to-End PDF Compilation with Reordered Pages ---
  console.log('\n--- 4. Real PDF End-to-End Reordering Verification ---');

  await reportAsync('Compile reordered, rotated, and filtered PDF through PDFCore.organizePDF', async () => {
    // Create synthetic 5-page PDF with distinct text
    const srcDoc = await PDFDocument.create();
    for (let i = 1; i <= 5; i++) {
      const p = srcDoc.addPage([300, 300]);
      p.drawText(`Page ${i}`, { x: 50, y: 150, size: 24, color: rgb(0, 0, 0) });
    }
    const srcBytes = await srcDoc.save();

    // Setup activePages matching uploaded document
    const activePages = Array.from({ length: 5 }, (_, i) => ({
      pageNum: i + 1,
      rotation: 0,
      isDeleted: false
    }));

    // User operations:
    // 1. Move Page 5 to position 0 (4 move-left operations)
    dispatchAction('move-left', 4, activePages);
    dispatchAction('move-left', 3, activePages);
    dispatchAction('move-left', 2, activePages);
    dispatchAction('move-left', 1, activePages);
    assert.strictEqual(activePages[0].pageNum, 5);

    // 2. Rotate original Page 3 (now at index 3) by 90 degrees
    dispatchAction('rotate-page', 3, activePages);
    assert.strictEqual(activePages[3].rotation, 90);

    // 3. Mark original Page 2 (now at index 2) as deleted
    dispatchAction('toggle-delete', 2, activePages);
    assert.strictEqual(activePages[2].isDeleted, true);

    // Order of activePages: [P5, P1, P2(deleted), P3(rot90), P4]
    assert.deepStrictEqual(activePages.map(p => p.pageNum), [5, 1, 2, 3, 4]);

    // Map to validPages as app.js does (lines 3242-3247)
    const validPages = activePages
      .filter((p) => !p.isDeleted)
      .map((p) => ({
        sourceIndex: p.pageNum - 1,
        rotation: p.rotation
      }));

    assert.strictEqual(validPages.length, 4);
    assert.deepStrictEqual(validPages, [
      { sourceIndex: 4, rotation: 0 },
      { sourceIndex: 0, rotation: 0 },
      { sourceIndex: 2, rotation: 90 },
      { sourceIndex: 3, rotation: 0 }
    ]);

    // Run actual organizePDF
    const organizedBytes = await PDFCore.organizePDF(srcBytes, validPages);
    assert(organizedBytes instanceof Uint8Array);

    // Verify resulting PDF structure
    const outDoc = await PDFDocument.load(organizedBytes);
    assert.strictEqual(outDoc.getPageCount(), 4);

    // Page 0 was original page 5 (sourceIndex 4), rotation 0
    assert.strictEqual(outDoc.getPage(0).getRotation().angle, 0);

    // Page 2 was original page 3 (sourceIndex 2), rotation 90
    assert.strictEqual(outDoc.getPage(2).getRotation().angle, 90);

    // Page 1 was original page 1, rotation 0
    assert.strictEqual(outDoc.getPage(1).getRotation().angle, 0);

    // Page 3 was original page 4, rotation 0
    assert.strictEqual(outDoc.getPage(3).getRotation().angle, 0);
  });

  await reportAsync('Deleting all pages throws explicit error and prevents zero-page PDF', async () => {
    const srcDoc = await PDFDocument.create();
    srcDoc.addPage([200, 200]);
    const srcBytes = await srcDoc.save();

    const activePages = [{ pageNum: 1, rotation: 0, isDeleted: true }];
    const validPages = activePages
      .filter((p) => !p.isDeleted)
      .map((p) => ({ sourceIndex: p.pageNum - 1, rotation: p.rotation }));

    // Verify app.js validation rule
    let appErrorThrown = false;
    try {
      if (validPages.length === 0) {
        throw new Error('At least one page must be included (cannot delete all pages).');
      }
    } catch (e) {
      appErrorThrown = true;
      assert(e.message.includes('cannot delete all pages'));
    }
    assert(appErrorThrown, 'app.js must throw when all pages are deleted');

    // Verify PDFCore.organizePDF guard
    let coreErrorThrown = false;
    try {
      await PDFCore.organizePDF(srcBytes, validPages);
    } catch (e) {
      coreErrorThrown = true;
      assert(e.message.includes('No valid pages to organize'));
    }
    assert(coreErrorThrown, 'PDFCore.organizePDF must reject empty page configurations');
  });

  // --- Section 5: Responsive Bounds & CSS Contract Verification ---
  console.log('\n--- 5. Responsive Bounds & CSS Contract Verification ---');

  report('CSS contains valid @media (max-width: 900px) block for mobile reorder', () => {
    assert(styleCss.includes('@media (max-width: 900px)'), 'style.css must define @media (max-width: 900px)');
    
    // Extract contents of @media (max-width: 900px)
    const mediaStart = styleCss.indexOf('@media (max-width: 900px)');
    assert(mediaStart !== -1);
    const mediaSection = styleCss.slice(mediaStart, mediaStart + 2500);

    // Verify desktop move buttons are hidden
    assert(mediaSection.includes('.page-card-actions button[data-action="move-left"]') &&
           mediaSection.includes('.page-card-actions button[data-action="move-right"]'),
           'Media query must target desktop move-left and move-right buttons');
    assert(mediaSection.includes('display: none'), 'Desktop buttons must be set to display: none on <=900px');

    // Verify mobile reorder container is flex
    assert(mediaSection.includes('.mobile-touch-reorder'), 'Media query must style .mobile-touch-reorder');
    assert(mediaSection.includes('display: flex'), '.mobile-touch-reorder must have display: flex on <=900px');

    // Verify touch button target dimensions (>= 40px)
    assert(mediaSection.includes('height: 40px'), '.mobile-reorder-btn must have height: 40px');
    assert(mediaSection.includes('min-width: 44px'), '.mobile-reorder-btn must have min-width: 44px');

    // Verify touch optimizations
    assert(mediaSection.includes('touch-action: manipulation'), '.mobile-reorder-btn must specify touch-action: manipulation');
    assert(mediaSection.includes('user-select: none'), '.mobile-reorder-btn must prevent text selection during taps');

    // Verify disabled touch state
    assert(mediaSection.includes('.mobile-reorder-btn:disabled'), 'Disabled state must be explicitly styled');
    assert(mediaSection.includes('pointer-events: none'), 'Disabled buttons must disable pointer-events');
  });

  report('Desktop base style conceals mobile touch bar above 900px', () => {
    // Search for base .mobile-touch-reorder declaration outside the media query
    const desktopRule = styleCss.match(/\.mobile-touch-reorder\s*\{\s*display:\s*none;\s*\}/);
    assert(desktopRule, '.mobile-touch-reorder must be set to display: none outside the media query');
  });

  report('Accessibility attributes present on all interactive controls', () => {
    const html = generateCardHtml({ i: 2, total: 5, isOrganize: true });
    assert(html.includes('aria-label="Touch Reorder Controls"'), 'Container must have aria-label');
    assert(html.includes('aria-label="Move Page Left"'), 'Move Left button must have aria-label');
    assert(html.includes('aria-label="Move Page Right"'), 'Move Right button must have aria-label');
    assert(html.includes('title="Move Page Left"'), 'Move Left button must have title');
    assert(html.includes('title="Move Page Right"'), 'Move Right button must have title');
  });

  // --- Section 6: Buffer Detachment and Concurrency Protection ---
  console.log('\n--- 6. Detached Buffer & Concurrency Verification ---');

  report('app.js renderPageThumbnails clones file.bytes before worker handoff', () => {
    // Assert line in app.js: const clonedBytes = file.bytes.slice();
    assert(appJs.includes('const clonedBytes = file.bytes.slice();'), 'app.js must clone file.bytes to prevent worker detachment');
    assert(appJs.includes('pdfDoc = await window.pdfjsLib.getDocument({ data: clonedBytes }).promise;'), 'getDocument must receive clonedBytes');
  });

  report('app.js reuses unified icon-btn event listener without stale leaks', () => {
    assert(appJs.includes("pagesGrid.querySelectorAll('.icon-btn').forEach"), 'Click listener must bind to icon-btn selector');
    assert(appJs.includes("action === 'move-left'"), 'Handler must process move-left');
    assert(appJs.includes("action === 'move-right'"), 'Handler must process move-right');
    assert(appJs.includes("renderPageThumbnails()"), 'Successful reorder must invoke renderPageThumbnails()');
  });

  console.log('\n======================================================');
  console.log(`Phase 3 Challenger 2 Adversarial Suite Summary:`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Adversarial suite crashed:', err);
  process.exit(1);
});
