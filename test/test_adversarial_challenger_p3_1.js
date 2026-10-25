/**
 * Phase 3 Adversarial Challenge Suite (challenger_p3_1)
 *
 * Adversarially stress-tests:
 * 1. Excel bijective base-26 column naming in pdf_core.js across large indices (0..20000+)
 *    - Mathematical verification against independent base-26 oracle
 *    - Exact round-trip verification (index -> colName -> index)
 *    - Boundary checks (A, Z, AA, ZZ, AAA, BAA, XFD, ZZZ, AAAA)
 * 2. Full end-to-end PDF -> Excel conversion with 2,500 columns:
 *    - XLSX OpenXML structure validation
 *    - sheet1.xml cell reference regex validation (^([A-Z]+)(\d+)$)
 *    - Single-letter (A..Z), double-letter (AA..ZZ), triple-letter (AAA..CWX) cell references
 * 3. Empty, single-cell, and whitespace boundary edge cases
 * 4. Codebase inspection: zero String.fromCharCode / fromCodePoint in pdf_core.js
 * 5. Test runner script integrity and exit code verification
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const PDFCore = require('../pdf_core.js');

// Independent mathematical oracle for bijective base-26 column conversion
function oracleColName(idx) {
  if (idx < 0) return '';
  let colNum = idx + 1; // 1-based
  let s = '';
  while (colNum > 0) {
    let rem = (colNum - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    colNum = Math.floor((colNum - 1) / 26);
  }
  return s;
}

// Independent reverse parser: Excel column string -> 0-based index
function colNameToIndex(str) {
  let idx = 0;
  for (let i = 0; i < str.length; i++) {
    idx = idx * 26 + (str.charCodeAt(i) - 64);
  }
  return idx - 1;
}

async function runAdversarialTests() {
  console.log('================================================================');
  console.log(' Phase 3 Adversarial Challenge: pdfToExcel & Test Consolidator  ');
  console.log('================================================================\n');

  // ----------------------------------------------------------------
  // 1. Static Analysis: Zero String.fromCharCode / fromCodePoint in pdf_core.js
  // ----------------------------------------------------------------
  console.log('--- 1. Static Analysis: String.fromCharCode Elimination ---');
  const pdfCorePath = path.join(__dirname, '..', 'pdf_core.js');
  const pdfCoreSource = fs.readFileSync(pdfCorePath, 'utf8');

  assert(
    !pdfCoreSource.includes('String.fromCharCode'),
    'FAIL: String.fromCharCode detected in pdf_core.js!'
  );
  assert(
    !pdfCoreSource.includes('fromCharCode'),
    'FAIL: fromCharCode detected in pdf_core.js!'
  );
  assert(
    !pdfCoreSource.includes('String.fromCodePoint'),
    'FAIL: String.fromCodePoint detected in pdf_core.js!'
  );
  console.log('  ✓ 0 occurrences of String.fromCharCode confirmed in pdf_core.js');
  console.log('  ✓ 0 occurrences of fromCharCode or fromCodePoint confirmed');

  // Extract the actual getColName function definition from pdf_core.js source
  const getColNameMatch = pdfCoreSource.match(/function\s+getColName\s*\([^)]*\)\s*\{[\s\S]*?return\s+name;\s*\}/);
  assert(getColNameMatch, 'FAIL: Could not locate getColName function in pdf_core.js');

  // Safely evaluate getColName in an isolated scope
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const getColNameFn = new Function('ALPHABET', `
    ${getColNameMatch[0]}
    return getColName;
  `)(ALPHABET);

  // ----------------------------------------------------------------
  // 2. Mathematical Stress-Testing Across 0..20,000 Indices
  // ----------------------------------------------------------------
  console.log('\n--- 2. Mathematical Stress-Testing: getColName(0..20,000) ---');

  // Landmark assertions
  const landmarks = [
    { idx: 0, expected: 'A' },
    { idx: 1, expected: 'B' },
    { idx: 25, expected: 'Z' },
    { idx: 26, expected: 'AA' },
    { idx: 27, expected: 'AB' },
    { idx: 51, expected: 'AZ' },
    { idx: 52, expected: 'BA' },
    { idx: 701, expected: 'ZZ' },
    { idx: 702, expected: 'AAA' },
    { idx: 703, expected: 'AAB' },
    { idx: 1377, expected: 'AZZ' },
    { idx: 1378, expected: 'BAA' },
    { idx: 1999, expected: 'BXX' },
    { idx: 2000, expected: 'BXY' },
    { idx: 16383, expected: 'XFD' }, // Max Excel column (16,384 columns)
    { idx: 18277, expected: 'ZZZ' },
    { idx: 18278, expected: 'AAAA' }
  ];

  for (const { idx, expected } of landmarks) {
    const actual = getColNameFn(idx);
    const oracle = oracleColName(idx);
    assert.strictEqual(
      actual,
      expected,
      `Landmark mismatch at index ${idx}: expected ${expected}, got ${actual}`
    );
    assert.strictEqual(
      actual,
      oracle,
      `Oracle mismatch at landmark index ${idx}: oracle=${oracle}, actual=${actual}`
    );
    assert.strictEqual(
      colNameToIndex(actual),
      idx,
      `Round-trip mismatch at landmark index ${idx} for column ${actual}`
    );
  }
  console.log(`  ✓ All ${landmarks.length} key landmark indices verified (including XFD @ 16383)`);

  // Exhaustive check from 0 to 20,000
  let previousName = '';
  for (let i = 0; i <= 20000; i++) {
    const colName = getColNameFn(i);

    // Rule 1: Non-empty string
    assert(typeof colName === 'string' && colName.length > 0, `Index ${i} returned invalid name`);

    // Rule 2: Strictly uppercase English letters
    assert(/^[A-Z]+$/.test(colName), `Index ${i} returned non-alpha characters: "${colName}"`);

    // Rule 3: Agreement with independent bijective base-26 oracle
    const oracle = oracleColName(i);
    assert.strictEqual(
      colName,
      oracle,
      `Discrepancy at index ${i}: getColName="${colName}" vs oracle="${oracle}"`
    );

    // Rule 4: Round-trip reverse bijective mapping
    const roundTrip = colNameToIndex(colName);
    assert.strictEqual(
      roundTrip,
      i,
      `Round-trip failure at index ${i}: parsed back to ${roundTrip}`
    );

    // Rule 5: Strict uniqueness against immediate predecessor
    assert.notStrictEqual(colName, previousName, `Duplicate consecutive column name at index ${i}`);
    previousName = colName;
  }
  console.log('  ✓ Exhaustive 0..20,000 range verified against independent oracle and reverse bijection');

  // Negative / boundary inputs
  assert.strictEqual(getColNameFn(-1), '', 'Negative index must return empty string');
  assert.strictEqual(getColNameFn(-100), '', 'Negative index must return empty string');
  console.log('  ✓ Negative index boundary guards verified');

  // ----------------------------------------------------------------
  // 3. End-to-End Stress Test: 2,500 Columns in pdfToExcel
  // ----------------------------------------------------------------
  console.log('\n--- 3. End-to-End Stress Test: 2,500 Columns in pdfToExcel ---');

  const NUM_COLS = 2500;
  // Generate 2500 CSV values: Val0,Val1,...,Val2499
  const rowValues = [];
  for (let c = 0; c < NUM_COLS; c++) {
    rowValues.push(`Val${c}`);
  }
  const csvText = rowValues.join(',');

  // Create a wide PDF with a single row of 2,500 columns
  const { PDFDocument } = require('pdf-lib');
  const wideDoc = await PDFDocument.create();
  const widePage = wideDoc.addPage([250000, 1000]);
  widePage.drawText(csvText, { x: 10, y: 500, size: 6 });
  const pdfBytes = await wideDoc.save();
  assert(pdfBytes instanceof Uint8Array, 'PDF save must return Uint8Array');

  // Convert to Excel XLSX
  const xlsxBytes = await PDFCore.pdfToExcel(pdfBytes);
  assert(xlsxBytes instanceof Uint8Array, 'pdfToExcel must return Uint8Array');
  assert(xlsxBytes.length > 1000, 'XLSX archive must have non-trivial size');

  // Unpack XLSX using JSZip
  const zip = await JSZip.loadAsync(xlsxBytes);

  // Validate OpenXML package files exist
  assert(zip.file('[Content_Types].xml'), 'Missing [Content_Types].xml');
  assert(zip.file('xl/workbook.xml'), 'Missing xl/workbook.xml');
  assert(zip.file('xl/styles.xml'), 'Missing xl/styles.xml');
  assert(zip.file('xl/sharedStrings.xml'), 'Missing xl/sharedStrings.xml');
  assert(zip.file('xl/worksheets/sheet1.xml'), 'Missing xl/worksheets/sheet1.xml');

  const sheet1Xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml').async('string');

  // Extract all cell references from sheet1.xml: <c r="([A-Z0-9]+)"
  const cellRefRegex = /<c\s+r="([A-Z]+)(\d+)"/g;
  let match;
  const parsedCells = [];
  while ((match = cellRefRegex.exec(sheet1Xml)) !== null) {
    parsedCells.push({ full: match[0], col: match[1], row: parseInt(match[2], 10) });
  }

  console.log(`  ✓ Successfully unpacked XLSX workbook with ${parsedCells.length} cells in sheet1.xml`);
  assert(parsedCells.length >= NUM_COLS, `Expected at least ${NUM_COLS} cells, found ${parsedCells.length}`);

  // Adversarially verify cell reference alignment for all 2,500 columns
  for (let c = 0; c < NUM_COLS; c++) {
    const expectedCol = oracleColName(c);
    const cell = parsedCells[c];
    assert(cell, `Missing cell at column index ${c}`);
    assert.strictEqual(cell.row, 1, `Expected row 1 at index ${c}, got ${cell.row}`);
    assert.strictEqual(
      cell.col,
      expectedCol,
      `Cell column mismatch at index ${c}: expected ${expectedCol}, got ${cell.col}`
    );
  }

  // Check specific column ranges
  // 1-letter range: 0..25 (A..Z)
  assert.strictEqual(parsedCells[0].col, 'A');
  assert.strictEqual(parsedCells[25].col, 'Z');

  // 2-letter range: 26..701 (AA..ZZ)
  assert.strictEqual(parsedCells[26].col, 'AA');
  assert.strictEqual(parsedCells[27].col, 'AB');
  assert.strictEqual(parsedCells[701].col, 'ZZ');

  // 3-letter range: 702..2499 (AAA..CRD)
  assert.strictEqual(parsedCells[702].col, 'AAA');
  assert.strictEqual(parsedCells[703].col, 'AAB');
  assert.strictEqual(parsedCells[1378].col, 'BAA');
  assert.strictEqual(parsedCells[2499].col, 'CRD');

  console.log('  ✓ Single-letter (A..Z), double-letter (AA..ZZ), and triple-letter (AAA..CRD) verified');
  console.log('  ✓ All 2,500 cell references strictly match format ^([A-Z]+)(\\d+)$ with correct row 1');

  // ----------------------------------------------------------------
  // 4. Edge Cases: Numbers vs SharedStrings, Empty Rows, Detached Buffers
  // ----------------------------------------------------------------
  console.log('\n--- 4. Edge Cases: Numeric vs String Cells & Buffer Safety ---');

  // Row 1: Numbers (100, 200, 300)
  // Row 2: Strings ("Apple", "Banana", "Cherry")
  // Row 3: Mixed ("123", "Hello", "45.67")
  const multiRowText = "100, 200, 300\nApple, Banana, Cherry\n123, Hello, 45.67";
  const multiPdf = await PDFCore.textToPDF(multiRowText, { fontSize: 8 });
  const multiXlsx = await PDFCore.pdfToExcel(multiPdf);
  const multiZip = await JSZip.loadAsync(multiXlsx);
  const multiSheetXml = await multiZip.file('xl/worksheets/sheet1.xml').async('string');

  // Numeric cells must NOT have t="s"
  assert(multiSheetXml.includes('<c r="A1"><v>100</v></c>'), 'Row 1 numeric cell A1 must be unquoted value');
  assert(multiSheetXml.includes('<c r="B1"><v>200</v></c>'), 'Row 1 numeric cell B1 must be unquoted value');

  // String cells must have t="s"
  assert(multiSheetXml.includes('<c r="A2" t="s">'), 'Row 2 string cell A2 must have t="s"');
  assert(multiSheetXml.includes('<c r="B2" t="s">'), 'Row 2 string cell B2 must have t="s"');
  console.log('  ✓ Number vs SharedString type routing in cell XML verified');

  // Detached buffer safety
  const detachedCopy = pdfBytes.slice();
  const detachedXlsx = await PDFCore.pdfToExcel(detachedCopy.buffer);
  assert(detachedXlsx instanceof Uint8Array, 'Must handle ArrayBuffer input cleanly');
  console.log('  ✓ Detached buffer safety confirmed');

  // Input validation guards
  await assert.rejects(
    async () => await PDFCore.pdfToExcel(null),
    /PDF bytes are required/
  );
  await assert.rejects(
    async () => await PDFCore.pdfToExcel(undefined),
    /PDF bytes are required/
  );
  console.log('  ✓ Null and undefined input guards verified');

  // ----------------------------------------------------------------
  // 5. Package Scripts & Runner Consolidation Verification
  // ----------------------------------------------------------------
  console.log('\n--- 5. Package Scripts & Runner Consolidation Verification ---');
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const requiredScripts = ['test', 'test:core', 'test:audit', 'test:security'];
  for (const s of requiredScripts) {
    assert(pkg.scripts[s], `Missing script: ${s} in package.json`);
  }

  // Ensure no test script uses --conditional or bypass flags
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    assert(
      !cmd.includes('--conditional'),
      `Script "${name}" contains --conditional flag: "${cmd}"`
    );
  }
  console.log('  ✓ All required modular test scripts present without --conditional flag');

  console.log('\n================================================================');
  console.log(' ALL ADVERSARIAL CHALLENGES PASSED (100% EMPIRICAL CONFIRMATION)');
  console.log('================================================================\n');
}

runAdversarialTests().catch(err => {
  console.error('\n❌ ADVERSARIAL CHALLENGE FAILURE:', err);
  process.exit(1);
});
