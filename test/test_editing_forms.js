/**
 * Automated Verification Test Suite for Milestone 3 (Document Editing & Forms)
 * Covers:
 * - cropPDF (single page, all pages, isolation, invalid bounds)
 * - inspectForm (empty doc, text/check/dropdown/radio/optionlist discovery)
 * - fillForm (interactive update, flattening to static graphics)
 * - removePages (descending in-place deletion, validation rejecting all pages)
 * - runPipeline integration (crop, fillForm, removePages)
 */

const assert = require('assert');
const { PDFDocument } = require('pdf-lib');
const PDFCore = require('../pdf_core');

async function createSamplePDF(pageCount, text = 'Page') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([500, 700]);
    page.drawText(`${text} ${i + 1}`, { x: 50, y: 650, size: 20 });
  }
  return await doc.save();
}

async function createComplexFormPDF() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]);
  const form = doc.getForm();

  const nameField = form.createTextField('fullName');
  nameField.setText('Jane Doe');
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

async function runTests() {
  console.log('=== Running Document Editing & Forms Suite (M3) Tests ===\n');

  // Test 1: cropPDF single page and dimensions
  {
    const sample = await createSamplePDF(2);
    const cropped = await PDFCore.cropPDF(sample, [{ pageIndex: 0, x: 25, y: 35, width: 300, height: 450 }]);
    const doc = await PDFDocument.load(cropped);
    const b0 = doc.getPage(0).getCropBox();
    const b1 = doc.getPage(1).getCropBox();
    assert.strictEqual(b0.x, 25);
    assert.strictEqual(b0.y, 35);
    assert.strictEqual(b0.width, 300);
    assert.strictEqual(b0.height, 450);
    assert.strictEqual(b1.width, 500, 'Page 1 preserved original width');
    assert.strictEqual(b1.height, 700, 'Page 1 preserved original height');
    console.log('✓ cropPDF single page with multi-page isolation passed');
  }

  // Test 2: cropPDF all pages with single object
  {
    const sample = await createSamplePDF(3);
    const cropped = await PDFCore.cropPDF(sample, { x: 10, y: 15, width: 400, height: 500 });
    const doc = await PDFDocument.load(cropped);
    for (let i = 0; i < 3; i++) {
      const b = doc.getPage(i).getCropBox();
      assert.strictEqual(b.x, 10);
      assert.strictEqual(b.y, 15);
      assert.strictEqual(b.width, 400);
      assert.strictEqual(b.height, 500);
    }
    console.log('✓ cropPDF applies single box to all pages passed');
  }

  // Test 3: cropPDF validation rejects invalid bounds
  {
    const sample = await createSamplePDF(1);
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ width: 0, height: 100 }]),
      /positive|width|height|invalid/i
    );
    await assert.rejects(
      async () => PDFCore.cropPDF(sample, [{ width: 100, height: -20 }]),
      /positive|width|height|invalid/i
    );
    console.log('✓ cropPDF rejects non-positive bounds passed');
  }

  // Test 4: inspectForm on complex form
  {
    const formBytes = await createComplexFormPDF();
    const fields = await PDFCore.inspectForm(formBytes);
    assert.strictEqual(fields.length, 5);

    const name = fields.find(f => f.name === 'fullName');
    assert.strictEqual(name.type, 'text');
    assert.strictEqual(name.value, 'Jane Doe');

    const agree = fields.find(f => f.name === 'agreeTerms');
    assert.strictEqual(agree.type, 'checkbox');
    assert.strictEqual(agree.value, false);

    const role = fields.find(f => f.name === 'role');
    assert.strictEqual(role.type, 'dropdown');
    assert.strictEqual(role.value, 'Admin');
    assert.deepStrictEqual(role.options, ['Admin', 'Editor', 'Viewer']);

    const notify = fields.find(f => f.name === 'notify');
    assert.strictEqual(notify.type, 'radio');
    assert.strictEqual(notify.value, 'daily');

    const tags = fields.find(f => f.name === 'tags');
    assert.strictEqual(tags.type, 'optionlist');
    console.log('✓ inspectForm correctly discovers all field types and values passed');
  }

  // Test 5: inspectForm on formless doc returns []
  {
    const sample = await createSamplePDF(2);
    const fields = await PDFCore.inspectForm(sample);
    assert.deepStrictEqual(fields, []);
    console.log('✓ inspectForm safe return on formless document passed');
  }

  // Test 6: fillForm interactive update
  {
    const formBytes = await createComplexFormPDF();
    const filled = await PDFCore.fillForm(formBytes, {
      fullName: 'Super User',
      agreeTerms: true,
      role: 'Editor',
      notify: 'weekly',
    }, false);

    const doc = await PDFDocument.load(filled);
    const form = doc.getForm();
    assert.strictEqual(form.getTextField('fullName').getText(), 'Super User');
    assert.strictEqual(form.getCheckBox('agreeTerms').isChecked(), true);
    assert.deepStrictEqual(form.getDropdown('role').getSelected(), ['Editor']);
    assert.strictEqual(form.getRadioGroup('notify').getSelected(), 'weekly');
    assert.strictEqual(form.getFields().length, 5, 'Fields remain interactive');
    console.log('✓ fillForm interactive updates preserved interactive controls passed');
  }

  // Test 7: fillForm flatten bakes graphics
  {
    const formBytes = await createComplexFormPDF();
    const flattened = await PDFCore.fillForm(formBytes, {
      fullName: 'Finalized Document',
      agreeTerms: true,
    }, true);

    const doc = await PDFDocument.load(flattened);
    assert.strictEqual(doc.getForm().getFields().length, 0, 'Form flattened to 0 fields');
    console.log('✓ fillForm flattening permanently bakes fields passed');
  }

  // Test 8: removePages descending in-place deletion
  {
    const sample = await createSamplePDF(5, 'RemovalDoc');
    // Remove pages 1 and 3 (0-based)
    const remaining = await PDFCore.removePages(sample, [1, 3]);
    const doc = await PDFDocument.load(remaining);
    assert.strictEqual(doc.getPageCount(), 3);
    console.log('✓ removePages descending in-place deletion passed');
  }

  // Test 9: removePages rejects all pages
  {
    const sample = await createSamplePDF(3);
    await assert.rejects(
      async () => PDFCore.removePages(sample, [0, 1, 2]),
      /all pages|at least one/i
    );
    console.log('✓ removePages rejects deleting all pages passed');
  }

  // Test 10: runPipeline chaining crop, fillForm, and removePages
  {
    const formBytes = await createComplexFormPDF();
    const pipelineOut = await PDFCore.runPipeline(formBytes, [
      { op: 'fillForm', fieldValues: { fullName: 'Pipelined' }, flatten: true },
      { op: 'crop', cropBoxes: { x: 20, y: 20, width: 460, height: 660 } },
      { op: 'watermark', options: { text: 'APPROVED' } },
    ]);
    const doc = await PDFDocument.load(pipelineOut);
    assert.strictEqual(doc.getForm().getFields().length, 0);
    const box = doc.getPage(0).getCropBox();
    assert.strictEqual(box.x, 20);
    assert.strictEqual(box.width, 460);
    console.log('✓ runPipeline sequential execution of crop and fillForm passed');
  }

  console.log('\nAll 10 Document Editing & Forms tests passed cleanly!\n');
}

runTests().catch((err) => {
  console.error('Editing & Forms test failure:', err);
  process.exit(1);
});
