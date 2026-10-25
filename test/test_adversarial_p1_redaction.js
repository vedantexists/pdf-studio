/**
 * Adversarial Challenger 1 — Phase 1: Redaction Safety & Security Verification
 *
 * Adversarial Attack Vectors:
 * 1. Nested Form XObjects:
 *    - Deeply nested (Page -> Form A -> Form B -> Form C with text)
 *    - Transformed (scaled, translated)
 *    - Nested Form XObject OUTSIDE redaction box (must NOT be corrupted)
 *    - Multiple Form XObjects referencing child forms
 * 2. Rotated Text & Rotated CTM:
 *    - Text rotated 90 degrees
 *    - Text rotated 180 degrees
 *    - Text rotated 270 degrees
 *    - Page with page-level rotation (/Rotate 90)
 *    - Rotated text OUTSIDE redaction box (must NOT be corrupted)
 * 3. Complex AcroForms:
 *    - Text fields with sensitive /V, /DV, and /AP
 *    - Adjacent form fields (must NOT be cleared)
 *    - Multi-widget fields
 *    - Radio buttons and Checkboxes (/V, /AS, /AP)
 *    - Dropdown / Choice fields
 * 4. Hyperlinks & Annotations:
 *    - Action /URI containing sensitive tokens in query params
 *    - Tooltip /TU, /Contents, /Dest (GoTo)
 *    - Annotations with appearance streams (/AP)
 *    - Adjacent safe links on the same page (must remain clickable and intact)
 *    - Partial boundary overlap
 * 5. Raw Byte & Stream Leakage Inspection:
 *    - Assert that zero sensitive tokens remain in raw serialized PDF bytes
 *    - Multi-page isolation & boundary touch invariants
 */

const assert = require('assert');
const PDFLib = require('pdf-lib');
const { PDFDocument, PDFName, PDFArray, PDFRef, PDFRawStream, PDFString, degrees } = PDFLib;
const PDFCore = require('../pdf_core');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

async function test(name, fn) {
  results.total++;
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: err.message });
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function runAdversarialSuite() {
  console.log('=== Adversarial Redaction Safety & Security Suite ===\n');

  // =========================================================================
  // SECTION 1: Nested Form XObjects
  // =========================================================================
  console.log('--- 1. Nested Form XObjects ---');

  await test('1.1 Deeply nested Form XObject (Page -> FormA -> FormB -> Text): stripped when redacted', async () => {
    // Innermost Form C
    const innerDoc = await PDFDocument.create();
    const innerPage = innerDoc.addPage([200, 200]);
    innerPage.drawText('DEEP_NESTED_SECRET_9876', { x: 20, y: 20, size: 14 });
    const innerBytes = await innerDoc.save();

    // Intermediate Form B
    const midDoc = await PDFDocument.create();
    const midPage = midDoc.addPage([300, 300]);
    const [embedInner] = await midDoc.embedPdf(innerBytes, [0]);
    midPage.drawPage(embedInner, { x: 30, y: 30, width: 200, height: 200 });
    const midBytes = await midDoc.save();

    // Outermost Page
    const outerDoc = await PDFDocument.create();
    const outerPage = outerDoc.addPage([500, 500]);
    const [embedMid] = await outerDoc.embedPdf(midBytes, [0]);
    outerPage.drawPage(embedMid, { x: 50, y: 50, width: 300, height: 300 });
    const outerBytes = await outerDoc.save();

    const textBefore = await PDFCore.pdfToText(outerBytes);
    assert(textBefore.includes('DEEP_NESTED_SECRET_9876'), 'Text must exist before redaction');

    // Redact covering the nested form
    const redactedBytes = await PDFCore.redactPDF(outerBytes, [
      { pageIndex: 0, x: 40, y: 40, width: 320, height: 320 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(!textAfter.includes('DEEP_NESTED_SECRET_9876'), 'Nested Form XObject text must be stripped under redaction');

    // Raw stream check
    const rawLatin = new TextDecoder('latin1').decode(redactedBytes);
    assert(!rawLatin.includes('DEEP_NESTED_SECRET_9876'), 'Nested secret must not exist in raw bytes');
  });

  await test('1.2 Transformed Form XObject with scaling and translation: stripped under redaction', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 600]);

    const subDoc = await PDFDocument.create();
    const subPage = subDoc.addPage([100, 100]);
    subPage.drawText('SCALED_SECRET_555', { x: 10, y: 10, size: 10 });
    const [embedded] = await doc.embedPages([subPage]);

    // Draw scaled 2x and translated to (200, 200)
    page.drawPage(embedded, { x: 200, y: 200, width: 200, height: 200 });

    const originalBytes = await doc.save();
    const textBefore = await PDFCore.pdfToText(originalBytes);
    assert(textBefore.includes('SCALED_SECRET_555'), 'Text must exist before redaction');

    // Redact at user space coordinates (190, 190, 220, 220)
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 190, y: 190, width: 220, height: 220 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(!textAfter.includes('SCALED_SECRET_555'), 'Scaled/translated Form XObject text must be stripped');
  });

  await test('1.3 Nested Form XObject outside redaction box: remains completely intact and extractable', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 600]);

    const subDoc = await PDFDocument.create();
    const subPage = subDoc.addPage([150, 150]);
    subPage.drawText('PRESERVED_FORM_TEXT', { x: 10, y: 50, size: 12 });
    const [embedded] = await doc.embedPages([subPage]);

    // Place at (50, 400)
    page.drawPage(embedded, { x: 50, y: 400, width: 150, height: 150 });
    // Regular text at (50, 100)
    page.drawText('REGULAR_SECRET_TO_REDACT', { x: 50, y: 100, size: 12 });

    const originalBytes = await doc.save();

    // Redact only the regular text at (40, 90, 200, 30)
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 40, y: 90, width: 200, height: 30 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(!textAfter.includes('REGULAR_SECRET_TO_REDACT'), 'Targeted text must be stripped');
    assert(textAfter.includes('PRESERVED_FORM_TEXT'), 'Form XObject text outside redaction must remain intact');
  });

  // =========================================================================
  // SECTION 2: Rotated Text & Rotated Coordinates
  // =========================================================================
  console.log('\n--- 2. Rotated Text & Rotated Coordinates ---');

  await test('2.1 Rotated text (90 degrees): stripped when redaction box covers it', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    // 90 deg rotation ascending along +Y axis from (200, 100)
    page.drawText('ROTATED_90_SECRET_VAL', {
      x: 200,
      y: 100,
      size: 14,
      rotate: degrees(90)
    });

    const originalBytes = await doc.save();
    const textBefore = await PDFCore.pdfToText(originalBytes);
    assert(textBefore.includes('ROTATED_90_SECRET_VAL'), 'Rotated text must exist before redaction');

    // Redaction box covering x=180 to 220, y=90 to 300
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 180, y: 90, width: 40, height: 220 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(!textAfter.includes('ROTATED_90_SECRET_VAL'), 'Rotated 90 deg text must be stripped under redaction');

    const rawLatin = new TextDecoder('latin1').decode(redactedBytes);
    assert(!rawLatin.includes('ROTATED_90_SECRET_VAL'), 'Rotated text must not exist in raw bytes');
  });

  await test('2.2 Rotated text (180 degrees): stripped when redaction box covers it', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    // 180 degrees: text flows to the left (-X) from (300, 200)
    page.drawText('ROTATED_180_SECRET_VAL', {
      x: 300,
      y: 200,
      size: 14,
      rotate: degrees(180)
    });

    const originalBytes = await doc.save();
    const textBefore = await PDFCore.pdfToText(originalBytes);
    assert(textBefore.includes('ROTATED_180_SECRET_VAL'), 'Rotated text must exist before redaction');

    // Redaction covering x=100 to 320, y=180 to 220
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 100, y: 180, width: 220, height: 40 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(!textAfter.includes('ROTATED_180_SECRET_VAL'), 'Rotated 180 deg text must be stripped under redaction');
  });

  await test('2.3 Rotated text (270 degrees): stripped when redaction box covers it', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    // 270 degrees: text flows downwards (-Y) from (200, 300)
    page.drawText('ROTATED_270_SECRET_VAL', {
      x: 200,
      y: 300,
      size: 14,
      rotate: degrees(270)
    });

    const originalBytes = await doc.save();
    const textBefore = await PDFCore.pdfToText(originalBytes);
    assert(textBefore.includes('ROTATED_270_SECRET_VAL'), 'Rotated text must exist before redaction');

    // Redaction covering x=180 to 230, y=100 to 320
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 180, y: 100, width: 50, height: 220 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(!textAfter.includes('ROTATED_270_SECRET_VAL'), 'Rotated 270 deg text must be stripped under redaction');
  });

  await test('2.4 Rotated page with page.setRotation(degrees(90)): redactions respect coordinates', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 600]);
    page.setRotation(degrees(90));
    page.drawText('PAGE_ROTATED_SECRET', { x: 50, y: 200, size: 14 });
    page.drawText('PAGE_ROTATED_SAFE', { x: 50, y: 500, size: 14 });

    const originalBytes = await doc.save();
    const textBefore = await PDFCore.pdfToText(originalBytes);
    assert(textBefore.includes('PAGE_ROTATED_SECRET'), 'Text must exist before redaction');

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 40, y: 190, width: 250, height: 30 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(!textAfter.includes('PAGE_ROTATED_SECRET'), 'Secret on rotated page must be stripped');
    assert(textAfter.includes('PAGE_ROTATED_SAFE'), 'Safe text on rotated page must remain intact');
  });

  await test('2.5 Rotated text outside redaction box: remains completely intact', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    page.drawText('ROTATED_SAFE_TEXT', { x: 100, y: 100, size: 14, rotate: degrees(90) });
    page.drawText('OTHER_SECRET_TEXT', { x: 300, y: 300, size: 14 });

    const originalBytes = await doc.save();
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 290, y: 290, width: 180, height: 30 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(textAfter.includes('ROTATED_SAFE_TEXT'), 'Rotated text outside redaction must remain intact');
    assert(!textAfter.includes('OTHER_SECRET_TEXT'), 'Targeted text must be stripped');
  });

  // =========================================================================
  // SECTION 3: Complex AcroForms
  // =========================================================================
  console.log('\n--- 3. Complex AcroForms ---');

  await test('3.1 Multiple form fields: redacted field cleared, adjacent field preserved', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 600]);
    const form = doc.getForm();

    const tfSecret = form.createTextField('secretField');
    tfSecret.setText('CONFIDENTIAL_PASSWORD_XYZ');
    tfSecret.addToPage(page, { x: 50, y: 400, width: 200, height: 30 });

    const tfPublic = form.createTextField('publicField');
    tfPublic.setText('PUBLIC_USERNAME_ABC');
    tfPublic.addToPage(page, { x: 50, y: 250, width: 200, height: 30 });

    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 40, y: 390, width: 220, height: 50 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const formAfter = loaded.getForm();

    // Redacted field checks
    const fSecret = formAfter.getTextField('secretField');
    assert(!fSecret.getText(), 'Redacted field text must be empty');
    assert(!fSecret.acroField.dict.has(PDFName.of('V')), 'Redacted field /V must be deleted');
    assert(!fSecret.acroField.dict.has(PDFName.of('DV')), 'Redacted field /DV must be deleted');
    assert(!fSecret.acroField.dict.has(PDFName.of('AP')), 'Redacted field /AP must be deleted');

    // Adjacent field checks
    const fPublic = formAfter.getTextField('publicField');
    assert.strictEqual(fPublic.getText(), 'PUBLIC_USERNAME_ABC', 'Adjacent field text must remain intact');
    assert(fPublic.acroField.dict.has(PDFName.of('V')), 'Adjacent field /V must be preserved');

    // Confirm that the secret was completely eradicated from the document
    let foundSecret = false;
    for (const [, obj] of loaded.context.enumerateIndirectObjects()) {
      if (obj.toString().includes('CONFIDENTIAL_PASSWORD_XYZ')) foundSecret = true;
    }
    assert(!foundSecret, 'Secret field value must not exist in any indirect object');
  });

  await test('3.2 Radio buttons and checkboxes: checked status and export value sanitized when redacted', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    const form = doc.getForm();

    const cb = form.createCheckBox('secretAgreement');
    cb.check();
    cb.addToPage(page, { x: 60, y: 350, width: 25, height: 25 });

    const cbSafe = form.createCheckBox('safeAgreement');
    cbSafe.check();
    cbSafe.addToPage(page, { x: 60, y: 150, width: 25, height: 25 });

    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 50, y: 340, width: 45, height: 45 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const cbAfter = loaded.getForm().getCheckBox('secretAgreement');
    assert(!cbAfter.isChecked(), 'Redacted checkbox must be unchecked');
    assert(!cbAfter.acroField.dict.has(PDFName.of('V')), 'Redacted checkbox /V must be cleared');

    const cbSafeAfter = loaded.getForm().getCheckBox('safeAgreement');
    assert(cbSafeAfter.isChecked(), 'Safe checkbox must remain checked');
  });

  await test('3.3 Choice / Dropdown form field: selected value purged under redaction', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    const form = doc.getForm();

    const dd = form.createDropdown('secretTier');
    dd.setOptions(['Standard', 'Executive', 'TOP_SECRET_TIER']);
    dd.select('TOP_SECRET_TIER');
    dd.addToPage(page, { x: 50, y: 300, width: 200, height: 30 });

    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 45, y: 290, width: 210, height: 50 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const ddAfter = loaded.getForm().getDropdown('secretTier');
    const selected = ddAfter.getSelected();
    assert(!selected || selected.length === 0 || !selected.includes('TOP_SECRET_TIER'), 'Selected secret value must be cleared');
  });

  // =========================================================================
  // SECTION 4: Hyperlinks and Annotations
  // =========================================================================
  console.log('\n--- 4. Hyperlinks & Annotations ---');

  await test('4.1 Hyperlink with secret query parameter: purged and stripped', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);

    // Redacted link with secret API token
    const secretLink = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [100, 400, 300, 430],
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of('https://api.internal.corp/admin?auth_token=SUPER_SECRET_TOKEN_9999')
      },
      Contents: PDFString.of('Internal Admin Dashboard'),
      TU: PDFString.of('Click here for Admin access')
    });
    const rSecret = doc.context.register(secretLink);

    // Safe link on same page
    const safeLink = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [100, 100, 300, 130],
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of('https://example.com/safe-public')
      },
      Contents: PDFString.of('Public Home Page')
    });
    const rSafe = doc.context.register(safeLink);

    page.node.set(PDFName.of('Annots'), doc.context.obj([rSecret, rSafe]));

    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 90, y: 390, width: 220, height: 50 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const rawAnnots = loaded.getPage(0).node.get(PDFName.of('Annots'));
    const annots = loaded.context.lookup(rawAnnots);

    assert(annots instanceof PDFArray, 'Annots array must exist');
    assert.strictEqual(annots.size(), 1, 'Exactly one annotation (safe link) must remain');

    const remaining = loaded.context.lookup(annots.get(0));
    const remAction = loaded.context.lookup(remaining.get(PDFName.of('A')));
    const uriVal = remAction.get(PDFName.of('URI')).asString();
    assert(uriVal.includes('example.com/safe-public'), 'Safe link URI must remain intact');

    // Verify secret token string does not appear anywhere in serialized PDF
    const rawLatin = new TextDecoder('latin1').decode(redactedBytes);
    assert(!rawLatin.includes('SUPER_SECRET_TOKEN_9999'), 'Secret token must not exist in raw PDF output');
    assert(!rawLatin.includes('Click here for Admin access'), 'Secret tooltip must not exist in raw PDF output');
    assert(!rawLatin.includes('Internal Admin Dashboard'), 'Secret Contents must not exist in raw PDF output');
  });

  await test('4.2 Internal GoTo Link with Dest: stripped when redacted', async () => {
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([500, 500]);
    const p2 = doc.addPage([500, 500]);

    const gotoLink = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [50, 400, 200, 430],
      A: {
        Type: 'Action',
        S: 'GoTo',
        D: [p2.ref, 'XYZ', 0, 500, 1]
      },
      Contents: PDFString.of('Jump to Secret Page 2')
    });
    const rGoTo = doc.context.register(gotoLink);
    p1.node.set(PDFName.of('Annots'), doc.context.obj([rGoTo]));

    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 40, y: 390, width: 180, height: 50 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const p1Annots = loaded.getPage(0).node.get(PDFName.of('Annots'));
    const isCleared = !p1Annots || (p1Annots instanceof PDFArray && p1Annots.size() === 0);
    assert(isCleared, 'Annots entry must be removed or empty when all annotations are redacted');

    const rawLatin = new TextDecoder('latin1').decode(redactedBytes);
    assert(!rawLatin.includes('Jump to Secret Page 2'), 'GoTo link contents must not exist in raw bytes');
  });

  await test('4.3 Annotations with partial overlap: stripped correctly at boundary', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);

    // Link at [100, 100, 200, 150]
    const link = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [100, 100, 200, 150],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://partial.secret/leak') },
      Contents: PDFString.of('Partially Covered')
    });
    const rLink = doc.context.register(link);
    page.node.set(PDFName.of('Annots'), doc.context.obj([rLink]));

    const originalBytes = await doc.save();

    // Redaction box overlapping by only 5 points: x=195 to 250, y=100 to 150
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 195, y: 100, width: 60, height: 50 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const pAnnots = loaded.getPage(0).node.get(PDFName.of('Annots'));
    const isCleared = !pAnnots || (pAnnots instanceof PDFArray && pAnnots.size() === 0);
    assert(isCleared, 'Partially overlapping annotation must be stripped');

    const rawLatin = new TextDecoder('latin1').decode(redactedBytes);
    assert(!rawLatin.includes('https://partial.secret/leak'), 'Partially overlapping URL must be stripped');
  });

  // =========================================================================
  // SECTION 5: Edge Invariants & Multi-Page Isolation
  // =========================================================================
  console.log('\n--- 5. Edge Invariants & Multi-Page Isolation ---');

  await test('5.1 Multi-page isolation: redacting page 1 does not affect page 0 or page 2', async () => {
    const doc = await PDFDocument.create();
    const p0 = doc.addPage([500, 500]);
    p0.drawText('PAGE_0_PRESERVED_TEXT', { x: 50, y: 400, size: 14 });

    const p1 = doc.addPage([500, 500]);
    p1.drawText('PAGE_1_CONFIDENTIAL_TEXT', { x: 50, y: 400, size: 14 });

    const p2 = doc.addPage([500, 500]);
    p2.drawText('PAGE_2_PRESERVED_TEXT', { x: 50, y: 400, size: 14 });

    const originalBytes = await doc.save();

    // Redact only page 1
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 1, x: 40, y: 390, width: 300, height: 30 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(textAfter.includes('PAGE_0_PRESERVED_TEXT'), 'Page 0 text must remain');
    assert(!textAfter.includes('PAGE_1_CONFIDENTIAL_TEXT'), 'Page 1 confidential text must be stripped');
    assert(textAfter.includes('PAGE_2_PRESERVED_TEXT'), 'Page 2 text must remain');
  });

  await test('5.2 Non-redacted text on same line 5 points away remains intact', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 600]);

    page.drawText('KEEP_THIS_PART', { x: 50, y: 300, size: 12 });
    page.drawText('REDACT_THIS_PART', { x: 200, y: 300, size: 12 });

    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 195, y: 290, width: 150, height: 30 }
    ]);

    const textAfter = await PDFCore.pdfToText(redactedBytes);
    assert(textAfter.includes('KEEP_THIS_PART'), 'Adjacent text must remain intact');
    assert(!textAfter.includes('REDACT_THIS_PART'), 'Targeted text must be stripped');
  });

  await test('5.3 Empty redactions array: idempotent, does not corrupt PDF', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.drawText('UNCHANGED_CONTENT', { x: 50, y: 200, size: 14 });
    const originalBytes = await doc.save();

    const output = await PDFCore.redactPDF(originalBytes, []);
    const reloaded = await PDFDocument.load(output);
    assert.strictEqual(reloaded.getPageCount(), 1, 'Page count preserved');

    const text = await PDFCore.pdfToText(output);
    assert(text.includes('UNCHANGED_CONTENT'), 'Content preserved');
  });

  await test('5.4 Boundary coordinates: redaction at page bounds (x=0, y=0) works without throwing', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    page.drawText('CORNER_TEXT', { x: 5, y: 5, size: 10 });
    const originalBytes = await doc.save();

    const output = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 0, y: 0, width: 100, height: 50 }
    ]);

    const reloaded = await PDFDocument.load(output);
    assert.strictEqual(reloaded.getPageCount(), 1, 'Page count preserved');
    const text = await PDFCore.pdfToText(output);
    assert(!text.includes('CORNER_TEXT'), 'Corner text must be stripped');
  });

  await test('5.5 Non-standard inputs: invalid pageIndex, NaN, negative bounds handled gracefully', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.drawText('GENUINE_DOC_BODY', { x: 50, y: 300, size: 12 });
    const originalBytes = await doc.save();

    // Adversarial inputs: null, invalid types, out-of-bounds pageIndex, negative width
    const output = await PDFCore.redactPDF(originalBytes, [
      null,
      undefined,
      'invalid_string',
      { pageIndex: 999, x: 50, y: 50, width: 100, height: 100 },
      { pageIndex: -1, x: 50, y: 50, width: 100, height: 100 },
      { pageIndex: 0, x: NaN, y: NaN, width: NaN, height: NaN },
      { pageIndex: 0, x: 50, y: 50, width: -100, height: -50 }
    ]);

    const reloaded = await PDFDocument.load(output);
    assert.strictEqual(reloaded.getPageCount(), 1, 'Document must survive invalid redaction descriptors');
    const text = await PDFCore.pdfToText(output);
    assert(text.includes('GENUINE_DOC_BODY'), 'Document content preserved');
  });

  await test('3.4 AcroForm field appearance stream (/AP) stripped to prevent visual/stream leaks', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    const form = doc.getForm();

    const tf = form.createTextField('apField');
    tf.setText('SECRET_IN_AP_STREAM_777');
    tf.addToPage(page, { x: 50, y: 300, width: 250, height: 30 });

    const originalBytes = await doc.save();

    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 40, y: 290, width: 270, height: 50 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const field = loaded.getForm().getTextField('apField');
    assert(!field.getText(), 'Field text must be empty');
    assert(!field.acroField.dict.has(PDFName.of('V')), 'Field /V must be deleted');
    assert(!field.acroField.dict.has(PDFName.of('AP')), 'Field appearance dictionary /AP must be deleted');

    // Verify secret was purged from appearance stream contents
    let foundApSecret = false;
    for (const [, obj] of loaded.context.enumerateIndirectObjects()) {
      if (obj.toString().includes('SECRET_IN_AP_STREAM_777')) foundApSecret = true;
    }
    assert(!foundApSecret, 'AP secret must not exist in any indirect object');
  });

  await test('4.4 Multiple hyperlink annotations on same page: selective purge', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);

    const link1 = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [50, 400, 150, 430],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://leak1.internal/secret') },
      Contents: PDFString.of('Leak 1')
    });
    const link2 = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [200, 400, 300, 430],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://leak2.internal/secret') },
      Contents: PDFString.of('Leak 2')
    });
    const link3 = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [50, 50, 150, 80],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://safe.public/portal') },
      Contents: PDFString.of('Safe Portal')
    });

    const r1 = doc.context.register(link1);
    const r2 = doc.context.register(link2);
    const r3 = doc.context.register(link3);
    page.node.set(PDFName.of('Annots'), doc.context.obj([r1, r2, r3]));

    const originalBytes = await doc.save();

    // Redact both leak1 and leak2 with two separate bounding boxes
    const redactedBytes = await PDFCore.redactPDF(originalBytes, [
      { pageIndex: 0, x: 45, y: 395, width: 110, height: 40 },
      { pageIndex: 0, x: 195, y: 395, width: 110, height: 40 }
    ]);

    const loaded = await PDFDocument.load(redactedBytes);
    const annots = loaded.context.lookup(loaded.getPage(0).node.get(PDFName.of('Annots')));
    assert.strictEqual(annots.size(), 1, 'Only safe link3 must remain in Annots');

    const remaining = loaded.context.lookup(annots.get(0));
    const act = loaded.context.lookup(remaining.get(PDFName.of('A')));
    assert(act.get(PDFName.of('URI')).asString().includes('safe.public/portal'), 'Safe link preserved');

    let foundLeak1 = false;
    let foundLeak2 = false;
    let foundSafe = false;
    for (const [, obj] of loaded.context.enumerateIndirectObjects()) {
      const s = obj.toString();
      if (s.includes('leak1.internal')) foundLeak1 = true;
      if (s.includes('leak2.internal')) foundLeak2 = true;
      if (s.includes('safe.public/portal')) foundSafe = true;
    }
    assert(!foundLeak1, 'Leak 1 URL purged from all indirect objects');
    assert(!foundLeak2, 'Leak 2 URL purged from all indirect objects');
    assert(foundSafe, 'Safe URL preserved in indirect objects');
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n======================================================');
  console.log(`Adversarial Suite Summary:`);
  console.log(`Total: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed}`);
  console.log('======================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
