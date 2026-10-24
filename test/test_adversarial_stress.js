/**
 * Adversarial Stress & Chaos Test Suite for pdftool Phase 1
 * Stress-tests edge cases, malicious inputs, boundary conditions,
 * type confusions, and chained chaos pipelines across PDFCore.
 */
const assert = require('assert');
const { PDFDocument, PDFName } = require('pdf-lib');
const PDFCore = require('../pdf_core');

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPG_1X1_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function createSamplePDF(pageCount = 3, text = 'Adversarial Test') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([500, 700]);
    page.drawText(`${text} Page ${i + 1}`, { x: 50, y: 650, size: 18 });
  }
  return await doc.save();
}

async function createFormPDF() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]);
  const form = doc.getForm();

  const tf = form.createTextField('username');
  tf.setText('InitialUser');
  tf.addToPage(page, { x: 50, y: 600, width: 200, height: 25 });

  const cb = form.createCheckBox('terms');
  cb.addToPage(page, { x: 50, y: 550, width: 20, height: 20 });

  const dd = form.createDropdown('tier');
  dd.addOptions(['Free', 'Pro', 'Enterprise']);
  dd.select('Free');
  dd.addToPage(page, { x: 50, y: 500, width: 200, height: 25 });

  const rg = form.createRadioGroup('billing');
  rg.addOptionToPage('monthly', page, { x: 50, y: 450, width: 20, height: 20 });
  rg.addOptionToPage('yearly', page, { x: 120, y: 450, width: 20, height: 20 });
  rg.select('monthly');

  return await doc.save();
}

async function runAdversarialSuite() {
  console.log('=== Starting Adversarial Stress Tests ===\n');

  // Test A1: protectPDF password variations & hash entropy
  {
    const sample = await createSamplePDF(1);
    const p1 = await PDFCore.protectPDF(sample, 'PassOne');
    const p2 = await PDFCore.protectPDF(sample, 'PassTwo');

    // Hashes must be different for different passwords
    const doc1 = await PDFDocument.load(p1, { ignoreEncryption: true });
    const doc2 = await PDFDocument.load(p2, { ignoreEncryption: true });
    const enc1 = doc1.context.lookup(doc1.context.trailerInfo.Encrypt);
    const u1 = enc1.get(PDFName.of('U')).value;
    const enc2 = doc2.context.lookup(doc2.context.trailerInfo.Encrypt);
    const u2 = enc2.get(PDFName.of('U')).value;
    assert.notStrictEqual(u1, u2, 'Different passwords must yield different U hashes');
    console.log('✓ A1: Password hash entropy & uniqueness passed');
  }

  // Test A2: protectPDF input boundary validations
  {
    const sample = await createSamplePDF(1);
    await assert.rejects(() => PDFCore.protectPDF(null, 'pwd'), /required/i);
    await assert.rejects(() => PDFCore.protectPDF(sample, ''), /password/i);
    await assert.rejects(() => PDFCore.protectPDF(sample, '   \t\n  '), /password/i);
    await assert.rejects(() => PDFCore.protectPDF(sample, null), /password/i);
    await assert.rejects(() => PDFCore.protectPDF(sample, undefined), /password/i);
    await assert.rejects(() => PDFCore.protectPDF(sample, { userPassword: '' }), /password/i);
    console.log('✓ A2: protectPDF input rejection & boundary guards passed');
  }

  // Test A3: unlockPDF robustness & idempotence
  {
    const sample = await createSamplePDF(3);
    // Unlocking unencrypted PDF returns valid PDF
    const res1 = await PDFCore.unlockPDF(sample);
    const d1 = await PDFDocument.load(res1);
    assert.strictEqual(d1.getPageCount(), 3);
    assert.strictEqual(d1.isEncrypted, false);

    // Repeated unlocks
    const res2 = await PDFCore.unlockPDF(res1);
    const d2 = await PDFDocument.load(res2);
    assert.strictEqual(d2.getPageCount(), 3);

    // Null/undefined input guard
    await assert.rejects(() => PDFCore.unlockPDF(null), /required/i);
    console.log('✓ A3: unlockPDF robustness, idempotence, and null guards passed');
  }

  // Test A4: signPDF with JPEG, PNG, Data URL, and coordinate boundaries
  {
    const sample = await createSamplePDF(3);
    const pngBuffer = Buffer.from(PNG_1X1_BASE64, 'base64');
    const standardJpegHex = 'ffd8ffe000104a46494600010101004800480000ffdb004300030202020202030202020303030304060404040404080606050609080a0a090809090a0c0f0c0a0b0e0b09090d110d0e0f101011100a0c12131210130f101010ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9';
    const jpgBuffer = new Uint8Array(Buffer.from(standardJpegHex, 'hex').slice());
    const dataUrlPng = `data:image/png;base64,${PNG_1X1_BASE64}`;

    // Sign page 0 with PNG
    const s1 = await PDFCore.signPDF(sample, pngBuffer, 0, { x: 10, y: 20, width: 100, height: 50 });
    // Sign page 1 with JPEG
    const s2 = await PDFCore.signPDF(s1, jpgBuffer, 1, { x: 30, y: 40, width: 80, height: 40 });
    // Sign page 2 with Data URL PNG
    const s3 = await PDFCore.signPDF(s2, dataUrlPng, 2, { x: 50, y: 60, width: 120, height: 60 });

    const finalDoc = await PDFDocument.load(s3);
    assert.strictEqual(finalDoc.getPageCount(), 3);
    assert(s3.length > sample.length);

    // Bounds rejection
    await assert.rejects(() => PDFCore.signPDF(sample, pngBuffer, -1), /bounds|index|page/i);
    await assert.rejects(() => PDFCore.signPDF(sample, pngBuffer, 3), /bounds|index|page/i);
    await assert.rejects(() => PDFCore.signPDF(sample, pngBuffer, 999), /bounds|index|page/i);
    await assert.rejects(() => PDFCore.signPDF(sample, Buffer.alloc(0), 0), /empty/i);
    await assert.rejects(() => PDFCore.signPDF(null, pngBuffer, 0), /required/i);
    console.log('✓ A4: signPDF dual-format, data URL, and boundary guards passed');
  }

  // Test A5: cropPDF bounds validation, non-positive dimensions, isolation
  {
    const sample = await createSamplePDF(4);
    // Invalid dimensions
    await assert.rejects(() => PDFCore.cropPDF(sample, [{ width: -10, height: 100 }]), /positive/i);
    await assert.rejects(() => PDFCore.cropPDF(sample, [{ width: 100, height: 0 }]), /positive/i);
    await assert.rejects(() => PDFCore.cropPDF(sample, [{ width: NaN, height: 100 }]), /positive/i);
    await assert.rejects(() => PDFCore.cropPDF(sample, []), /at least one/i);
    await assert.rejects(() => PDFCore.cropPDF(null, { width: 100, height: 100 }), /required/i);

    // Multi-page crop isolation on page 2
    const cropped = await PDFCore.cropPDF(sample, [
      { pageIndex: 2, x: 15, y: 25, width: 300, height: 450 }
    ]);
    const d = await PDFDocument.load(cropped);
    assert.strictEqual(d.getPage(0).getCropBox().width, 500);
    assert.strictEqual(d.getPage(1).getCropBox().width, 500);
    assert.strictEqual(d.getPage(2).getCropBox().width, 300);
    assert.strictEqual(d.getPage(2).getCropBox().height, 450);
    assert.strictEqual(d.getPage(3).getCropBox().width, 500);
    console.log('✓ A5: cropPDF multi-page isolation & adversarial bounds passed');
  }

  // Test A6: inspectForm & fillForm on invalid, non-existent, and formless PDFs
  {
    const sample = await createSamplePDF(1);
    // Formless PDF inspection returns []
    const emptyFields = await PDFCore.inspectForm(sample);
    assert.deepStrictEqual(emptyFields, []);

    // Formless PDF fillForm does not throw and returns valid PDF
    const filledFormless = await PDFCore.fillForm(sample, { ghostField: 'value' }, false);
    const dFormless = await PDFDocument.load(filledFormless);
    assert.strictEqual(dFormless.getPageCount(), 1);

    // Complex Form PDF with valid & invalid fields
    const formBytes = await createFormPDF();
    const fields = await PDFCore.inspectForm(formBytes);
    assert.strictEqual(fields.length, 4);

    // Fill with a mix of valid fields and ghost fields
    const filledMixed = await PDFCore.fillForm(formBytes, {
      username: 'AdversarialUser',
      terms: true,
      tier: 'Enterprise',
      billing: 'yearly',
      nonExistentField123: 'ShouldNotCrash',
      anotherGhost: 42,
    }, false);

    const dMixed = await PDFDocument.load(filledMixed);
    const form = dMixed.getForm();
    assert.strictEqual(form.getTextField('username').getText(), 'AdversarialUser');
    assert.strictEqual(form.getCheckBox('terms').isChecked(), true);
    assert.deepStrictEqual(form.getDropdown('tier').getSelected(), ['Enterprise']);
    assert.strictEqual(form.getRadioGroup('billing').getSelected(), 'yearly');

    // Flattening wipes fields permanently
    const flattened = await PDFCore.fillForm(filledMixed, {}, true);
    const dFlat = await PDFDocument.load(flattened);
    assert.strictEqual(dFlat.getForm().getFields().length, 0);
    console.log('✓ A6: Form inspection, non-existent field tolerance & flattening passed');
  }

  // Test A7: removePages duplicate, out-of-order, out-of-bounds indices
  {
    const sample = await createSamplePDF(6, 'ChaosPage');
    // Remove with duplicates and out of order: [3, 1, 999, 1, -5, 3, 4] -> valid unique: [1, 3, 4]
    const res = await PDFCore.removePages(sample, [3, 1, 999, 1, -5, 3, 4]);
    const d = await PDFDocument.load(res);
    assert.strictEqual(d.getPageCount(), 3, '6 pages minus 3 unique targets = 3 pages');

    // Empty removal returns identical doc
    const resEmpty = await PDFCore.removePages(sample, []);
    const dEmpty = await PDFDocument.load(resEmpty);
    assert.strictEqual(dEmpty.getPageCount(), 6);

    // Reject removing all pages even with duplicates
    await assert.rejects(() => PDFCore.removePages(sample, [0, 1, 2, 3, 4, 5, 0, 1]), /all pages|at least one/i);
    await assert.rejects(() => PDFCore.removePages(null, [0]), /required/i);
    console.log('✓ A7: removePages chaotic indices, deduplication, and bounds passed');
  }

  // Test A8: Giant Full Lifecycle Pipeline with all operations
  {
    const formBytes = await createFormPDF();
    const pngBuffer = Buffer.from(PNG_1X1_BASE64, 'base64');

    // Pipeline:
    // 1. Fill form fields
    // 2. Sign page
    // 3. Flatten form
    // 4. Crop page
    // 5. Watermark page
    // 6. Add page numbers
    // 7. Protect PDF with password
    // 8. Unlock PDF
    const result = await PDFCore.runPipeline(formBytes, [
      { op: 'fillForm', fieldValues: { username: 'PipelineMaster', terms: true }, flatten: false },
      { op: 'sign', signatureData: pngBuffer, pageIndex: 0, options: { x: 50, y: 100, width: 80, height: 40 } },
      { op: 'fillForm', flatten: true },
      { op: 'crop', cropBoxes: { x: 10, y: 10, width: 480, height: 680 } },
      { op: 'watermark', options: { text: 'STRESS-TEST VERIFIED' } },
      { op: 'pageNumbers', options: { format: 'Page {n}' } },
      { op: 'protect', userPassword: 'AdversarialPassword2026' },
      { op: 'unlock', password: 'AdversarialPassword2026' },
    ]);

    const finalDoc = await PDFDocument.load(result);
    assert.strictEqual(finalDoc.getPageCount(), 1);
    assert.strictEqual(finalDoc.isEncrypted, false);
    assert.strictEqual(finalDoc.getForm().getFields().length, 0);
    const cropBox = finalDoc.getPage(0).getCropBox();
    assert.strictEqual(cropBox.width, 480);
    assert.strictEqual(cropBox.height, 680);
    console.log('✓ A8: Giant end-to-end multi-op chaos pipeline passed cleanly');
  }

  console.log('\n=============================================');
  console.log('All 8 Adversarial Stress Tests Passed 100%!');
  console.log('=============================================\n');
}

runAdversarialSuite().catch((err) => {
  console.error('Adversarial Test Failed:', err);
  process.exit(1);
});
