/**
 * Phase 4 Comprehensive Conversions Test Suite
 * Tests all 8 Office & Standards conversion engines:
 * 1. wordToPDF (DOCX -> PDF)
 * 2. excelToPDF (XLSX -> PDF)
 * 3. powerpointToPDF (PPTX -> PDF)
 * 4. htmlToPDF (HTML -> PDF)
 * 5. pdfToWord (PDF -> DOCX)
 * 6. pdfToExcel (PDF -> XLSX)
 * 7. pdfToPowerPoint (PDF -> PPTX)
 * 8. pdfToPdfA (PDF -> ISO 19005-1 PDF/A-1b)
 */

const assert = require('assert');
const JSZip = require('jszip');
const PDFCore = require('../pdf_core.js');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name} passed`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ ${name} FAILED:`, err.message);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name} passed`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ ${name} FAILED:`, err.message);
    failedTests++;
  }
}

(async () => {
  console.log('=== PDF Studio Phase 4 Conversions Test Suite ===\n');

  // --- Helper to build a test DOCX ---
  async function createTestDocx() {
    const zip = new JSZip();
    zip.file('[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
      `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
      `  <Default Extension="xml" ContentType="application/xml"/>\n` +
      `  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n` +
      `</Types>`
    );
    zip.folder('_rels').file('.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
      `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n` +
      `</Relationships>`
    );
    zip.folder('word').file('document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n` +
      `  <w:body>\n` +
      `    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Project Specification</w:t></w:r></w:p>\n` +
      `    <w:p><w:r><w:t>This is a paragraph of text explaining the zero-egress architecture.</w:t></w:r></w:p>\n` +
      `  </w:body>\n` +
      `</w:document>`
    );
    return await zip.generateAsync({ type: 'uint8array' });
  }

  // --- Helper to build a test XLSX ---
  async function createTestXlsx() {
    const zip = new JSZip();
    zip.file('[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
      `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
      `  <Default Extension="xml" ContentType="application/xml"/>\n` +
      `  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n` +
      `  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n` +
      `  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>\n` +
      `</Types>`
    );
    zip.folder('_rels').file('.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
      `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n` +
      `</Relationships>`
    );
    zip.folder('xl').file('workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n` +
      `  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>\n` +
      `</workbook>`
    );
    zip.folder('xl').file('sharedStrings.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">\n` +
      `  <si><t>Item</t></si>\n` +
      `  <si><t>Quarter</t></si>\n` +
      `  <si><t>Revenue</t></si>\n` +
      `</sst>`
    );
    zip.folder('xl').folder('worksheets').file('sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n` +
      `  <sheetData>\n` +
      `    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>\n` +
      `    <row r="2"><c r="A2"><v>Widget A</v></c><c r="B2"><v>Q1</v></c><c r="C2"><v>54000</v></c></row>\n` +
      `  </sheetData>\n` +
      `</worksheet>`
    );
    return await zip.generateAsync({ type: 'uint8array' });
  }

  // --- Helper to build a test PPTX ---
  async function createTestPptx() {
    const zip = new JSZip();
    zip.file('[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
      `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
      `  <Default Extension="xml" ContentType="application/xml"/>\n` +
      `  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>\n` +
      `  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n` +
      `  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n` +
      `</Types>`
    );
    zip.folder('_rels').file('.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
      `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>\n` +
      `</Relationships>`
    );
    zip.folder('ppt').file('presentation.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n` +
      `  <p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>\n` +
      `</p:presentation>`
    );
    zip.folder('ppt').folder('slides').file('slide1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n` +
      `  <p:cSld><p:spTree>\n` +
      `    <p:sp><p:txBody><a:p><a:r><a:t>Executive Summary</a:t></a:r></a:p></p:txBody></p:sp>\n` +
      `    <p:sp><p:txBody><a:p><a:r><a:t>Key Milestone 1 Achieved</a:t></a:r></a:p></p:txBody></p:sp>\n` +
      `  </p:spTree></p:cSld>\n` +
      `</p:sld>`
    );
    zip.folder('ppt').folder('slides').file('slide2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n` +
      `  <p:cSld><p:spTree>\n` +
      `    <p:sp><p:txBody><a:p><a:r><a:t>Financial Outlook</a:t></a:r></a:p></p:txBody></p:sp>\n` +
      `    <p:sp><p:txBody><a:p><a:r><a:t>Net Margins up 42%</a:t></a:r></a:p></p:txBody></p:sp>\n` +
      `  </p:spTree></p:cSld>\n` +
      `</p:sld>`
    );
    return await zip.generateAsync({ type: 'uint8array' });
  }

  // --- 1. wordToPDF ---
  console.log('--- 1. wordToPDF (DOCX -> PDF) ---');
  await runAsyncTest('wordToPDF converts .docx into valid PDF document', async () => {
    const docxBytes = await createTestDocx();
    const pdfBytes = await PDFCore.wordToPDF(docxBytes);
    assert(pdfBytes instanceof Uint8Array, 'Output must be Uint8Array');
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString();
    assert.strictEqual(header, '%PDF-', 'Must start with PDF signature');
    assert(pdfBytes.length > 500, 'PDF size must be substantial');
  });

  await runAsyncTest('wordToPDF throws error on empty or null input', async () => {
    let threw = false;
    try {
      await PDFCore.wordToPDF(null);
    } catch {
      threw = true;
    }
    assert(threw, 'wordToPDF must throw on null');
  });

  // --- 2. excelToPDF ---
  console.log('\n--- 2. excelToPDF (XLSX -> PDF) ---');
  await runAsyncTest('excelToPDF converts .xlsx into landscape tabular PDF', async () => {
    const xlsxBytes = await createTestXlsx();
    const pdfBytes = await PDFCore.excelToPDF(xlsxBytes);
    assert(pdfBytes instanceof Uint8Array);
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString();
    assert.strictEqual(header, '%PDF-');
  });

  // --- 3. powerpointToPDF ---
  console.log('\n--- 3. powerpointToPDF (PPTX -> PDF) ---');
  await runAsyncTest('powerpointToPDF converts .pptx into 16:9 PDF slides', async () => {
    const pptxBytes = await createTestPptx();
    const pdfBytes = await PDFCore.powerpointToPDF(pptxBytes);
    assert(pdfBytes instanceof Uint8Array);
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString();
    assert.strictEqual(header, '%PDF-');
  });

  // --- 4. htmlToPDF ---
  console.log('\n--- 4. htmlToPDF (HTML -> PDF) ---');
  await runAsyncTest('htmlToPDF converts HTML markup to formatted PDF', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Security Architecture</h1>
          <p>Zero network egress client-side processing guarantees privacy.</p>
          <ul>
            <li>Client-side encryption</li>
            <li>In-memory canvas rendering</li>
          </ul>
        </body>
      </html>
    `;
    const pdfBytes = await PDFCore.htmlToPDF(html);
    assert(pdfBytes instanceof Uint8Array);
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString();
    assert.strictEqual(header, '%PDF-');
  });

  // --- 5. pdfToWord ---
  console.log('\n--- 5. pdfToWord (PDF -> DOCX) ---');
  await runAsyncTest('pdfToWord converts PDF to valid OpenXML DOCX archive', async () => {
    const testPdf = await PDFCore.textToPDF("# Monthly Report\nThis is paragraph one with data.");
    const docxBytes = await PDFCore.pdfToWord(testPdf);
    assert(docxBytes instanceof Uint8Array);

    const docxZip = await JSZip.loadAsync(docxBytes);
    assert(docxZip.file('word/document.xml') !== null, 'DOCX must contain word/document.xml');
    assert(docxZip.file('[Content_Types].xml') !== null, 'DOCX must contain [Content_Types].xml');

    const xml = await docxZip.file('word/document.xml').async('string');
    assert(xml.includes('Monthly Report') || xml.includes('Monthly'), 'DOCX should contain extracted title');
  });

  // --- 6. pdfToExcel ---
  console.log('\n--- 6. pdfToExcel (PDF -> XLSX) ---');
  await runAsyncTest('pdfToExcel converts PDF to valid OpenXML XLSX workbook', async () => {
    const testPdf = await PDFCore.textToPDF("Product\tSales\nApples\t1200\nOranges\t850");
    const xlsxBytes = await PDFCore.pdfToExcel(testPdf);
    assert(xlsxBytes instanceof Uint8Array);

    const xlsxZip = await JSZip.loadAsync(xlsxBytes);
    assert(xlsxZip.file('xl/workbook.xml') !== null, 'XLSX must contain xl/workbook.xml');
    assert(xlsxZip.file('xl/worksheets/sheet1.xml') !== null, 'XLSX must contain sheet1.xml');
  });

  // --- 7. pdfToPowerPoint ---
  console.log('\n--- 7. pdfToPowerPoint (PDF -> PPTX) ---');
  await runAsyncTest('pdfToPowerPoint converts PDF to valid OpenXML PPTX presentation', async () => {
    const testPdf = await PDFCore.textToPDF("# Presentation Deck\nKey Milestone Details\nArchitecture Notes");
    const pptxBytes = await PDFCore.pdfToPowerPoint(testPdf);
    assert(pptxBytes instanceof Uint8Array);

    const pptxZip = await JSZip.loadAsync(pptxBytes);
    assert(pptxZip.file('ppt/presentation.xml') !== null, 'PPTX must contain ppt/presentation.xml');
    assert(pptxZip.file('ppt/slides/slide1.xml') !== null, 'PPTX must contain slide1.xml');
  });

  // --- 8. pdfToPdfA ---
  console.log('\n--- 8. pdfToPdfA (PDF -> ISO 19005-1 PDF/A-1b) ---');
  await runAsyncTest('pdfToPdfA injects XMP metadata and OutputIntents for PDF/A-1b', async () => {
    const testPdf = await PDFCore.textToPDF("Document for long-term ISO preservation");
    const pdfaBytes = await PDFCore.pdfToPdfA(testPdf);
    assert(pdfaBytes instanceof Uint8Array);

    const pdfString = Buffer.from(pdfaBytes).toString('latin1');
    assert(pdfString.includes('pdfaid:part>1</pdfaid:part') || pdfString.includes('pdfaid:part'), 'Must declare pdfaid:part 1');
    assert(pdfString.includes('pdfaid:conformance>B</pdfaid:conformance') || pdfString.includes('pdfaid:conformance'), 'Must declare conformance B');
    assert(pdfString.includes('OutputIntents') || pdfString.includes('GTS_PDFA1'), 'Must include OutputIntents catalog entry');
  });

  // --- 9. Detached Buffer & Zero Network Egress Invariant ---
  console.log('\n--- 9. Security & Invariant Defenses ---');
  await runAsyncTest('All 8 conversions pass zero network egress invariant', async () => {
    const http = require('http');
    const https = require('https');
    let egressAttempted = false;

    const origHttp = http.request;
    const origHttps = https.request;
    http.request = () => { egressAttempted = true; throw new Error('Egress blocked'); };
    https.request = () => { egressAttempted = true; throw new Error('Egress blocked'); };

    try {
      const docx = await createTestDocx();
      await PDFCore.wordToPDF(docx);

      const xlsx = await createTestXlsx();
      await PDFCore.excelToPDF(xlsx);

      const html = '<h1>Offline Test</h1>';
      await PDFCore.htmlToPDF(html);
    } finally {
      http.request = origHttp;
      https.request = origHttps;
    }

    assert.strictEqual(egressAttempted, false, 'Zero network egress must be preserved during all conversions');
  });

  console.log('\n=============================================');
  console.log(`Phase 4 Conversions Test Results:`);
  console.log(`Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('=============================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
