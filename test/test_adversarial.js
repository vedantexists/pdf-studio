/**
 * Adversarial Stress Test Suite for pdftool Phase 1
 * Written by Challenger 1 (Adversarial Challenger)
 * 
 * Tests:
 * 1. Adversarial Security:
 *    - unlock on already unlocked PDFs (idempotence)
 *    - unlock chained multiple times
 *    - unlock with invalid/empty passwords
 *    - protect with empty, whitespace, null, non-string passwords
 *    - sign with empty, corrupted, truncated image buffers
 *    - sign with invalid Base64 Data URL
 *    - sign with page -1, 9999, out-of-bounds, NaN
 * 2. Adversarial Crop:
 *    - crop to 0x0, 0 width, 0 height
 *    - crop with negative width, height, both
 *    - crop with sub-pixel floating point coordinates
 *    - crop beyond page bounds (huge coordinates & negative x/y)
 *    - multi-page crop isolation & multi-page distinct crops
 *    - crop with out-of-bounds page indices
 *    - crop with empty or invalid crop box objects
 * 3. Adversarial Forms:
 *    - inspectForm & fillForm on PDFs without forms
 *    - inspectForm & fillForm on PDFs with malformed AcroForm catalog entry
 *    - fillForm with non-existent field names
 *    - form flattening idempotence (repeated flattening)
 *    - fillForm with empty string, boolean false, special characters (emojis, HTML, newlines)
 *    - multi-choice options: valid selections, invalid choices for dropdown/radio/optionlist
 * 4. Adversarial Page Removal:
 *    - removePages with duplicate indices
 *    - removePages with unsorted indices
 *    - removePages with negative indices
 *    - removePages with non-numeric, NaN, null elements
 *    - removePages rejecting all pages (exact, superset, duplicate, single-page doc)
 *    - removePages with empty array or null
 * 5. Adversarial Stress & Resiliency:
 *    - corrupted PDF bytes rejection across all Phase 1 APIs
 *    - 100-page document stress test
 */

const assert = require('assert');
const { PDFDocument, PDFName, rgb } = require('pdf-lib');
const PDFCore = require('../pdf_core');

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createValidPNG() {
  return Buffer.from(PNG_1X1_BASE64, 'base64');
}

async function createSamplePDF(pageCount = 1, text = 'Adversarial Test') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${text} - Page ${i + 1}`, { x: 50, y: 550, size: 20 });
  }
  return await doc.save();
}

async function createFormPDF() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]);
  const form = doc.getForm();

  const nameField = form.createTextField('fullName');
  nameField.setText('Original Name');
  nameField.addToPage(page, { x: 50, y: 600, width: 200, height: 25 });

  const agreeCheck = form.createCheckBox('agreeTerms');
  agreeCheck.addToPage(page, { x: 50, y: 550, width: 20, height: 20 });

  const roleDropdown = form.createDropdown('role');
  roleDropdown.addOptions(['Admin', 'Editor', 'Viewer']);
  roleDropdown.select('Admin');
  roleDropdown.addToPage(page, { x: 50, y: 500, width: 200, height: 25 });

  const notifyRadio = form.createRadioGroup('notify');
  notifyRadio.addOptionToPage('daily', page, { x: 50, y: 450, width: 20, height: 20 });
  notifyRadio.addOptionToPage('weekly', page, { x: 120, y: 450, width: 20, height: 20 });
  notifyRadio.select('daily');

  const tagsList = form.createOptionList('tags');
  tagsList.addOptions(['Tech', 'Design', 'Marketing']);
  tagsList.select('Tech');
  tagsList.addToPage(page, { x: 50, y: 350, width: 200, height: 60 });

  return await doc.save();
}

async function createMalformedFormPDF() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]);
  // Inject corrupted AcroForm entry where Fields is a string rather than an array/dict
  doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: 'corrupted-non-array' }));
  return await doc.save();
}

const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
};

async function test(name, fn) {
  stats.total++;
  try {
    await fn();
    stats.passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    stats.failed++;
    stats.failures.push({ name, error: err });
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}\n    Stack: ${err.stack}`);
  }
}

async function runAdversarialSuite() {
  console.log('===============================================================');
  console.log('       PDFTOOL PHASE 1 ADVERSARIAL STRESS TEST SUITE           ');
  console.log('===============================================================\n');

  // ==========================================================================
  // Section 1: Adversarial Security Tests
  // ==========================================================================
  console.log('--- [1/5] Adversarial Security Cases ---');

  await test('Adv-SEC.1: unlockPDF on already unlocked PDF is idempotent and preserves document', async () => {
    const original = await createSamplePDF(3, 'Unlocked Doc');
    const unlocked = await PDFCore.unlockPDF(original);
    const doc = await PDFDocument.load(unlocked);
    assert.strictEqual(doc.isEncrypted, false);
    assert.strictEqual(doc.getPageCount(), 3);
  });

  await test('Adv-SEC.2: unlockPDF chained multiple times succeeds cleanly', async () => {
    const original = await createSamplePDF(2, 'Chain Unlock');
    const protectedBytes = await PDFCore.protectPDF(original, 'Pass1234');
    const unlock1 = await PDFCore.unlockPDF(protectedBytes, 'Pass1234');
    const unlock2 = await PDFCore.unlockPDF(unlock1, 'Pass1234');
    const unlock3 = await PDFCore.unlockPDF(unlock2, 'Pass1234');
    const doc = await PDFDocument.load(unlock3);
    assert.strictEqual(doc.isEncrypted, false);
    assert.strictEqual(doc.getPageCount(), 2);
  });

  await test('Adv-SEC.3: unlockPDF with various password inputs (empty string, wrong password, special chars)', async () => {
    const original = await createSamplePDF(1, 'Unlock Passwords');
    const protectedBytes = await PDFCore.protectPDF(original, 'CorrectPass');
    
    // Empty password
    const un1 = await PDFCore.unlockPDF(protectedBytes, '');
    assert.strictEqual((await PDFDocument.load(un1)).isEncrypted, false);

    // Wrong password
    const un2 = await PDFCore.unlockPDF(protectedBytes, 'WrongPass123');
    assert.strictEqual((await PDFDocument.load(un2)).isEncrypted, false);

    // Whitespace password
    const un3 = await PDFCore.unlockPDF(protectedBytes, '   ');
    assert.strictEqual((await PDFDocument.load(un3)).isEncrypted, false);

    // Special characters password
    const un4 = await PDFCore.unlockPDF(protectedBytes, '!@#$%^&*()_+~`|}{[]\\:;?><,./');
    assert.strictEqual((await PDFDocument.load(un4)).isEncrypted, false);
  });

  await test('Adv-SEC.4: protectPDF rejects empty, whitespace, null, undefined, and non-string passwords', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(async () => PDFCore.protectPDF(sample, ''), /password/i);
    await assert.rejects(async () => PDFCore.protectPDF(sample, '   '), /password/i);
    await assert.rejects(async () => PDFCore.protectPDF(sample, '\t\n'), /password/i);
    await assert.rejects(async () => PDFCore.protectPDF(sample, null), /password/i);
    await assert.rejects(async () => PDFCore.protectPDF(sample, undefined), /password/i);
    await assert.rejects(async () => PDFCore.protectPDF(sample, 12345), /password/i);
  });

  await test('Adv-SEC.5: protectPDF with empty userPassword in options object rejects', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(async () => PDFCore.protectPDF(sample, { userPassword: '' }), /password/i);
    await assert.rejects(async () => PDFCore.protectPDF(sample, { userPassword: '   ' }), /password/i);
    await assert.rejects(async () => PDFCore.protectPDF(sample, { userPassword: null }), /password/i);
  });

  await test('Adv-SEC.6: signPDF rejects empty signature buffer (0 bytes)', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.signPDF(sample, new Uint8Array(0), 0),
      /empty|graphic/i
    );
  });

  await test('Adv-SEC.7: signPDF rejects completely corrupted image buffer (random bytes)', async () => {
    const sample = await createSamplePDF(1);
    const corruptedBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    await assert.rejects(
      async () => PDFCore.signPDF(sample, corruptedBytes, 0),
      /SOI|JPEG|image|corrupt|error/i
    );
  });

  await test('Adv-SEC.8: signPDF rejects truncated / corrupted PNG header bytes', async () => {
    const sample = await createSamplePDF(1);
    const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]);
    await assert.rejects(
      async () => PDFCore.signPDF(sample, fakePng, 0)
    );
  });

  await test('Adv-SEC.9: signPDF rejects truncated / corrupted JPG header bytes', async () => {
    const sample = await createSamplePDF(1);
    const fakeJpg = new Uint8Array([0xff, 0xd8, 0x00, 0x00]);
    await assert.rejects(
      async () => PDFCore.signPDF(sample, fakeJpg, 0)
    );
  });

  await test('Adv-SEC.10: signPDF rejects invalid Base64 Data URL', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.signPDF(sample, 'data:image/png;base64,!!!NotBase64Data!!!', 0)
    );
  });

  await test('Adv-SEC.11: signPDF rejects page index -1', async () => {
    const sample = await createSamplePDF(3);
    const png = createValidPNG();
    await assert.rejects(
      async () => PDFCore.signPDF(sample, png, -1),
      /bounds|index|page/i
    );
  });

  await test('Adv-SEC.12: signPDF rejects page index 9999 (far out-of-bounds)', async () => {
    const sample = await createSamplePDF(3);
    const png = createValidPNG();
    await assert.rejects(
      async () => PDFCore.signPDF(sample, png, 9999),
      /bounds|index|page/i
    );
  });

  await test('Adv-SEC.13: signPDF rejects page index equal to totalPages (exact boundary)', async () => {
    const sample = await createSamplePDF(3);
    const png = createValidPNG();
    await assert.rejects(
      async () => PDFCore.signPDF(sample, png, 3), // doc has pages 0, 1, 2
      /bounds|index|page/i
    );
  });

  await test('Adv-SEC.14: signPDF rejects non-numeric or NaN page index', async () => {
    const sample = await createSamplePDF(2);
    const png = createValidPNG();
    await assert.rejects(
      async () => PDFCore.signPDF(sample, png, NaN)
    );
  });

  // ==========================================================================
  // Section 2: Adversarial Crop Tests
  // ==========================================================================
  console.log('\n--- [2/5] Adversarial Crop Cases ---');

  await test('Adv-CROP.1: cropPDF rejects 0x0 dimensions (width: 0, height: 0)', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 10, y: 10, width: 0, height: 0 }]),
      /positive|bounds|width|height/i
    );
  });

  await test('Adv-CROP.2: cropPDF rejects 0 width with positive height', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 10, y: 10, width: 0, height: 100 }]),
      /positive|bounds|width|height/i
    );
  });

  await test('Adv-CROP.3: cropPDF rejects positive width with 0 height', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 10, y: 10, width: 100, height: 0 }]),
      /positive|bounds|width|height/i
    );
  });

  await test('Adv-CROP.4: cropPDF rejects negative width', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 10, y: 10, width: -150, height: 200 }]),
      /positive|bounds|width|height/i
    );
  });

  await test('Adv-CROP.5: cropPDF rejects negative height', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 10, y: 10, width: 200, height: -80 }]),
      /positive|bounds|width|height/i
    );
  });

  await test('Adv-CROP.6: cropPDF rejects negative width and negative height', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 10, y: 10, width: -50, height: -50 }]),
      /positive|bounds|width|height/i
    );
  });

  await test('Adv-CROP.7: cropPDF rejects non-numeric width/height (NaN, strings, null)', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 10, y: 10, width: 'invalid', height: 100 }]),
      /positive|bounds|width|height/i
    );
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 'bad', y: 10, width: 100, height: 100 }]),
      /number|bounds|coordinate/i
    );
  });

  await test('Adv-CROP.8: cropPDF accepts and preserves sub-pixel floating point coordinates', async () => {
    const sample = await createSamplePDF(1);
    const cropped = await PDFCore.cropPDF(sample, [{
      pageIndex: 0,
      x: 10.375,
      y: 20.625,
      width: 250.875,
      height: 350.125,
    }]);
    const doc = await PDFDocument.load(cropped);
    const box = doc.getPage(0).getCropBox();
    assert.strictEqual(box.x, 10.375);
    assert.strictEqual(box.y, 20.625);
    assert(Math.abs(box.width - 250.875) < 0.0001);
    assert(Math.abs(box.height - 350.125) < 0.0001);
  });

  await test('Adv-CROP.9: cropPDF accepts crop box beyond page bounds (huge coordinates)', async () => {
    const sample = await createSamplePDF(1); // 400x600 page
    const cropped = await PDFCore.cropPDF(sample, [{
      pageIndex: 0,
      x: 5000,
      y: 5000,
      width: 1000,
      height: 1000,
    }]);
    const doc = await PDFDocument.load(cropped);
    const box = doc.getPage(0).getCropBox();
    assert.strictEqual(box.x, 5000);
    assert.strictEqual(box.y, 5000);
    assert.strictEqual(box.width, 1000);
    assert.strictEqual(box.height, 1000);
  });

  await test('Adv-CROP.10: cropPDF accepts negative x and y origin coordinates', async () => {
    const sample = await createSamplePDF(1);
    const cropped = await PDFCore.cropPDF(sample, [{
      pageIndex: 0,
      x: -100,
      y: -50,
      width: 300,
      height: 400,
    }]);
    const doc = await PDFDocument.load(cropped);
    const box = doc.getPage(0).getCropBox();
    assert.strictEqual(box.x, -100);
    assert.strictEqual(box.y, -50);
    assert.strictEqual(box.width, 300);
    assert.strictEqual(box.height, 400);
  });

  await test('Adv-CROP.11: cropPDF multi-page isolation (modifying page 1 preserves page 0 and page 2)', async () => {
    const sample = await createSamplePDF(3); // 3 pages of 400x600
    const cropped = await PDFCore.cropPDF(sample, [
      { pageIndex: 1, x: 20, y: 30, width: 200, height: 300 },
    ]);
    const doc = await PDFDocument.load(cropped);

    // Page 0 unchanged
    const b0 = doc.getPage(0).getCropBox();
    assert.strictEqual(b0.width, 400);
    assert.strictEqual(b0.height, 600);

    // Page 1 cropped
    const b1 = doc.getPage(1).getCropBox();
    assert.strictEqual(b1.x, 20);
    assert.strictEqual(b1.y, 30);
    assert.strictEqual(b1.width, 200);
    assert.strictEqual(b1.height, 300);

    // Page 2 unchanged
    const b2 = doc.getPage(2).getCropBox();
    assert.strictEqual(b2.width, 400);
    assert.strictEqual(b2.height, 600);
  });

  await test('Adv-CROP.12: cropPDF multi-page distinct crops on all pages', async () => {
    const sample = await createSamplePDF(3);
    const cropped = await PDFCore.cropPDF(sample, [
      { pageIndex: 0, x: 10, y: 10, width: 100, height: 150 },
      { pageIndex: 1, x: 20, y: 20, width: 200, height: 250 },
      { pageIndex: 2, x: 30, y: 30, width: 300, height: 350 },
    ]);
    const doc = await PDFDocument.load(cropped);
    assert.strictEqual(doc.getPage(0).getCropBox().width, 100);
    assert.strictEqual(doc.getPage(1).getCropBox().width, 200);
    assert.strictEqual(doc.getPage(2).getCropBox().width, 300);
  });

  await test('Adv-CROP.13: cropPDF handles out-of-bounds pageIndex gracefully (ignores invalid index)', async () => {
    const sample = await createSamplePDF(2);
    // Page 0 valid, page 99 invalid
    const cropped = await PDFCore.cropPDF(sample, [
      { pageIndex: 0, x: 15, y: 15, width: 150, height: 200 },
      { pageIndex: 99, x: 50, y: 50, width: 100, height: 100 },
      { pageIndex: -5, x: 50, y: 50, width: 100, height: 100 },
    ]);
    const doc = await PDFDocument.load(cropped);
    assert.strictEqual(doc.getPage(0).getCropBox().width, 150);
    assert.strictEqual(doc.getPage(1).getCropBox().width, 400, 'Page 1 unaffected');
  });

  await test('Adv-CROP.14: cropPDF rejects empty cropBoxes array []', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, []),
      /at least one|crop box/i
    );
  });

  await test('Adv-CROP.15: cropPDF rejects null or undefined cropBoxes', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(async () => PDFCore.cropPDF(sample, null), /crop box/i);
    await assert.rejects(async () => PDFCore.cropPDF(sample, undefined), /crop box/i);
  });

  // ==========================================================================
  // Section 3: Adversarial Forms Tests
  // ==========================================================================
  console.log('\n--- [3/5] Adversarial Forms Cases ---');

  await test('Adv-FORM.1: inspectForm on PDF without any form returns []', async () => {
    const sample = await createSamplePDF(2, 'No Form');
    const fields = await PDFCore.inspectForm(sample);
    assert.deepStrictEqual(fields, []);
  });

  await test('Adv-FORM.2: inspectForm on PDF with malformed AcroForm catalog returns [] safely', async () => {
    const malformed = await createMalformedFormPDF();
    const fields = await PDFCore.inspectForm(malformed);
    assert.deepStrictEqual(fields, []);
  });

  await test('Adv-FORM.3: fillForm on formless PDF returns valid PDF without error', async () => {
    const sample = await createSamplePDF(2, 'No Form');
    const filled = await PDFCore.fillForm(sample, { nonExistent: 'value' }, false);
    const doc = await PDFDocument.load(filled);
    assert.strictEqual(doc.getPageCount(), 2);
  });

  await test('Adv-FORM.4: fillForm on malformed AcroForm PDF handles safely without throwing', async () => {
    const malformed = await createMalformedFormPDF();
    const filled = await PDFCore.fillForm(malformed, { anyKey: 'anyVal' }, false);
    assert(filled.length > 0);
  });

  await test('Adv-FORM.5: fillForm with non-existent field names ignores missing and updates valid fields', async () => {
    const formBytes = await createFormPDF();
    const filled = await PDFCore.fillForm(formBytes, {
      ghostField_1: 'GhostValue1',
      fullName: 'Updated Name',
      ghostField_2: 99999,
      agreeTerms: true,
    }, false);
    const doc = await PDFDocument.load(filled);
    const form = doc.getForm();
    assert.strictEqual(form.getTextField('fullName').getText(), 'Updated Name');
    assert.strictEqual(form.getCheckBox('agreeTerms').isChecked(), true);
  });

  await test('Adv-FORM.6: form flattening idempotence (repeated flattening on already flattened PDF)', async () => {
    const formBytes = await createFormPDF();
    const flat1 = await PDFCore.fillForm(formBytes, { fullName: 'Bake Step 1' }, true);
    const doc1 = await PDFDocument.load(flat1);
    assert.strictEqual(doc1.getForm().getFields().length, 0, 'First flatten removed all fields');

    // Second flatten on already flattened PDF
    const flat2 = await PDFCore.fillForm(flat1, { fullName: 'Bake Step 2' }, true);
    const doc2 = await PDFDocument.load(flat2);
    assert.strictEqual(doc2.getForm().getFields().length, 0, 'Second flatten succeeds idempotently');
  });

  await test('Adv-FORM.7: form flattening on formless PDF succeeds idempotently', async () => {
    const sample = await createSamplePDF(2, 'No Form');
    const result = await PDFCore.fillForm(sample, {}, true);
    const doc = await PDFDocument.load(result);
    assert.strictEqual(doc.getPageCount(), 2);
  });

  await test('Adv-FORM.8: fillForm with empty string "" clears text field', async () => {
    const formBytes = await createFormPDF();
    const filled = await PDFCore.fillForm(formBytes, { fullName: '' }, false);
    const fields = await PDFCore.inspectForm(filled);
    const nameField = fields.find(f => f.name === 'fullName');
    assert.strictEqual(nameField.value, '');
  });

  await test('Adv-FORM.9: fillForm with special characters (Unicode, emojis, HTML/script tags, newlines)', async () => {
    const formBytes = await createFormPDF();
    const maliciousPayload = '<script>alert("xss")</script>\nLine2 & Special: \' " \t';
    const filled = await PDFCore.fillForm(formBytes, { fullName: maliciousPayload }, false);
    const fields = await PDFCore.inspectForm(filled);
    const nameField = fields.find(f => f.name === 'fullName');
    assert.strictEqual(nameField.value, maliciousPayload);
  });

  await test('Adv-FORM.10: fillForm with boolean false or 0 unchecks checkbox', async () => {
    const formBytes = await createFormPDF();
    // First check it
    const checkedBytes = await PDFCore.fillForm(formBytes, { agreeTerms: true }, false);
    const f1 = await PDFCore.inspectForm(checkedBytes);
    assert.strictEqual(f1.find(f => f.name === 'agreeTerms').value, true);

    // Then uncheck it
    const uncheckedBytes = await PDFCore.fillForm(checkedBytes, { agreeTerms: false }, false);
    const f2 = await PDFCore.inspectForm(uncheckedBytes);
    assert.strictEqual(f2.find(f => f.name === 'agreeTerms').value, false);
  });

  await test('Adv-FORM.11: fillForm with invalid dropdown option not in list handles safely', async () => {
    const formBytes = await createFormPDF();
    // Dropdown has options ['Admin', 'Editor', 'Viewer']
    const filled = await PDFCore.fillForm(formBytes, { role: 'Astronaut' }, false);
    const fields = await PDFCore.inspectForm(filled);
    const roleField = fields.find(f => f.name === 'role');
    // Value remains previous or unchanged, didn't throw
    assert.strictEqual(roleField.value, 'Admin');
  });

  await test('Adv-FORM.12: fillForm with invalid radio group option not in list handles safely', async () => {
    const formBytes = await createFormPDF();
    // Radio has options ['daily', 'weekly']
    const filled = await PDFCore.fillForm(formBytes, { notify: 'never' }, false);
    const fields = await PDFCore.inspectForm(filled);
    const notifyField = fields.find(f => f.name === 'notify');
    assert.strictEqual(notifyField.value, 'daily');
  });

  await test('Adv-FORM.13: fillForm with OptionList multiple selections', async () => {
    const formBytes = await createFormPDF();
    // OptionList options: ['Tech', 'Design', 'Marketing']
    const filled = await PDFCore.fillForm(formBytes, { tags: ['Tech', 'Design'] }, false);
    const doc = await PDFDocument.load(filled);
    const sel = doc.getForm().getOptionList('tags').getSelected();
    assert.deepStrictEqual(sel, ['Tech', 'Design']);
  });

  await test('Adv-FORM.14: fillForm with OptionList invalid option handles safely', async () => {
    const formBytes = await createFormPDF();
    const filled = await PDFCore.fillForm(formBytes, { tags: ['UnknownTag'] }, false);
    const doc = await PDFDocument.load(filled);
    // Didn't throw, original selection preserved
    assert(doc.getForm().getOptionList('tags').getSelected().length > 0);
  });

  // ==========================================================================
  // Section 4: Adversarial Page Removal Tests
  // ==========================================================================
  console.log('\n--- [4/5] Adversarial Page Removal Cases ---');

  await test('Adv-REMOVE.1: removePages with duplicate indices removes unique indices only', async () => {
    const sample = await createSamplePDF(5, 'Remove Dupes');
    // Remove pages 1 and 3 with lots of duplicates: [1, 1, 1, 3, 3, 1, 3]
    const result = await PDFCore.removePages(sample, [1, 1, 1, 3, 3, 1, 3]);
    const doc = await PDFDocument.load(result);
    assert.strictEqual(doc.getPageCount(), 3, '5 pages - 2 unique indices = 3 pages remaining');
  });

  await test('Adv-REMOVE.2: removePages with unsorted indices preserves correct descending order', async () => {
    const sample = await createSamplePDF(5, 'Remove Unsorted');
    // Remove pages 0, 2, 4 in unsorted order: [4, 0, 2]
    const result = await PDFCore.removePages(sample, [4, 0, 2]);
    const doc = await PDFDocument.load(result);
    assert.strictEqual(doc.getPageCount(), 2);
  });

  await test('Adv-REMOVE.3: removePages with negative indices filters them out cleanly', async () => {
    const sample = await createSamplePDF(4, 'Negative Indices');
    // Provide only negative indices: [-1, -5, -100]
    const result = await PDFCore.removePages(sample, [-1, -5, -100]);
    const doc = await PDFDocument.load(result);
    assert.strictEqual(doc.getPageCount(), 4, 'All pages preserved when all indices are negative');
  });

  await test('Adv-REMOVE.4: removePages with mix of negative, duplicate, and valid indices', async () => {
    const sample = await createSamplePDF(5, 'Mix Indices');
    // Indices: [-2, 1, 1, -5, 3, 3] -> only 1 and 3 are valid
    const result = await PDFCore.removePages(sample, [-2, 1, 1, -5, 3, 3]);
    const doc = await PDFDocument.load(result);
    assert.strictEqual(doc.getPageCount(), 3);
  });

  await test('Adv-REMOVE.5: removePages with non-numeric / NaN indices filters them out safely', async () => {
    const sample = await createSamplePDF(3, 'Non Numeric');
    const result = await PDFCore.removePages(sample, ['invalid', NaN, null, undefined, {}]);
    const doc = await PDFDocument.load(result);
    assert.strictEqual(doc.getPageCount(), 3, 'All pages preserved');
  });

  await test('Adv-REMOVE.6: removePages rejects removing all pages with exact indices', async () => {
    const sample = await createSamplePDF(3);
    await assert.rejects(
      async () => PDFCore.removePages(sample, [0, 1, 2]),
      /all pages|at least one/i
    );
  });

  await test('Adv-REMOVE.7: removePages rejects removing all pages with superset and duplicates', async () => {
    const sample = await createSamplePDF(3);
    await assert.rejects(
      async () => PDFCore.removePages(sample, [0, 1, 2, 2, 0, 999, -5]),
      /all pages|at least one/i
    );
  });

  await test('Adv-REMOVE.8: removePages rejects removing single page in a 1-page document', async () => {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.removePages(sample, [0]),
      /all pages|at least one/i
    );
  });

  await test('Adv-REMOVE.9: removePages with empty array [] returns document intact', async () => {
    const sample = await createSamplePDF(3);
    const result = await PDFCore.removePages(sample, []);
    const doc = await PDFDocument.load(result);
    assert.strictEqual(doc.getPageCount(), 3);
  });

  await test('Adv-REMOVE.10: removePages with null or undefined returns document intact', async () => {
    const sample = await createSamplePDF(3);
    const r1 = await PDFCore.removePages(sample, null);
    const r2 = await PDFCore.removePages(sample, undefined);
    assert.strictEqual((await PDFDocument.load(r1)).getPageCount(), 3);
    assert.strictEqual((await PDFDocument.load(r2)).getPageCount(), 3);
  });

  // ==========================================================================
  // Section 5: Adversarial Stress & Resiliency Combinations
  // ==========================================================================
  console.log('\n--- [5/5] Adversarial Stress & Resiliency Cases ---');

  await test('Adv-STRESS.1: Corrupted PDF bytes cleanly rejected across Phase 1 APIs', async () => {
    const garbageBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22]);

    // protectPDF should reject
    await assert.rejects(async () => PDFCore.protectPDF(garbageBytes, 'Key'));

    // unlockPDF should reject
    await assert.rejects(async () => PDFCore.unlockPDF(garbageBytes));

    // signPDF should reject
    await assert.rejects(async () => PDFCore.signPDF(garbageBytes, createValidPNG(), 0));

    // cropPDF should reject
    await assert.rejects(async () => PDFCore.cropPDF(garbageBytes, { x: 10, y: 10, width: 100, height: 100 }));

    // inspectForm returns [] safely without throwing
    const inspected = await PDFCore.inspectForm(garbageBytes);
    assert.deepStrictEqual(inspected, []);

    // fillForm should reject
    await assert.rejects(async () => PDFCore.fillForm(garbageBytes, { foo: 'bar' }));

    // removePages should reject
    await assert.rejects(async () => PDFCore.removePages(garbageBytes, [0]));
  });

  await test('Adv-STRESS.2: 100-page document batch stress test (crop, remove, protect, unlock)', async () => {
    // Generate 100-page document
    const doc = await PDFDocument.create();
    for (let i = 0; i < 100; i++) {
      const p = doc.addPage([300, 400]);
      p.drawText(`Page ${i + 1}`, { x: 20, y: 350, size: 14 });
    }
    const hundredPageBytes = await doc.save();

    // 1. Remove 20 even pages
    const toRemove = Array.from({ length: 20 }, (_, i) => i * 2);
    const removedBytes = await PDFCore.removePages(hundredPageBytes, toRemove);
    const docAfterRemove = await PDFDocument.load(removedBytes);
    assert.strictEqual(docAfterRemove.getPageCount(), 80);

    // 2. Crop remaining pages
    const croppedBytes = await PDFCore.cropPDF(removedBytes, { x: 10, y: 10, width: 280, height: 380 });
    const docAfterCrop = await PDFDocument.load(croppedBytes);
    assert.strictEqual(docAfterCrop.getPage(0).getCropBox().width, 280);
    assert.strictEqual(docAfterCrop.getPage(79).getCropBox().width, 280);

    // 3. Protect 80-page document
    const protectedBytes = await PDFCore.protectPDF(croppedBytes, 'StressKey80');
    await assert.rejects(async () => PDFDocument.load(protectedBytes), /encrypted/i);

    // 4. Unlock 80-page document
    const unlockedBytes = await PDFCore.unlockPDF(protectedBytes, 'StressKey80');
    const docFinal = await PDFDocument.load(unlockedBytes);
    assert.strictEqual(docFinal.isEncrypted, false);
    assert.strictEqual(docFinal.getPageCount(), 80);
  });

  console.log('\n===============================================================');
  console.log(`Adversarial Stress Test Summary:`);
  console.log(`Total: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed}`);
  console.log('===============================================================');

  if (stats.failed > 0) {
    console.error(`\n${stats.failed} ADVERSARIAL TEST(S) FAILED:`);
    stats.failures.forEach(f => console.error(` - ${f.name}: ${f.error.message}`));
    process.exit(1);
  } else {
    console.log('\nALL ADVERSARIAL STRESS TESTS PASSED CLEANLY WITH ZERO FAILURES!');
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
