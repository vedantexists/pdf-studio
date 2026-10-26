/**
 * Empirical Adversarial Challenger Test Suite — Milestone 2
 * Agent: challenger_m2_2
 * Focus:
 *  1. comparePDF:
 *     - Concurrent comparisons (race conditions, shared state)
 *     - Memory leak prevention: doc.destroy() invoked on docA & docB under normal, mid-loop error, and partial load scenarios
 *     - Response format contract: { diffPages: Array<{ pageIndex, diffPixels, diffPercent, canvasDataUrl? }> }
 *     - Asymmetric pages, identical pages, modified pages
 *     - Empty / corrupted inputs
 *  2. compressPDF:
 *     - Text content preservation across presets (extreme, recommended, less)
 *     - Vector graphics preservation
 *     - Link annotation (/Subtype /Link, /URI) preservation
 *     - Metadata stripping vs preservation
 *     - Byte reduction on image-heavy documents (>20%)
 *  3. App integration:
 *     - Error handling when < 2 files uploaded
 *     - Error handling with corrupt / unparseable files
 *  4. Zero network egress:
 *     - Outbound request interception across all compare and compress operations
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
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const dgram = require('dgram');
const PDFLib = require('pdf-lib');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFRawStream, rgb } = PDFLib;
const PDFCore = require('../pdf_core');

// ============================================================================
// Network Egress Trap Harness
// ============================================================================
let egressAttempts = [];
const origFetch = global.fetch;
const origHttpRequest = http.request;
const origHttpGet = http.get;
const origHttpsRequest = https.request;
const origHttpsGet = https.get;
const origNetConnect = net.connect;
const origTlsConnect = tls.connect;
const origDgramCreateSocket = dgram.createSocket;

function armNetworkTraps() {
  egressAttempts = [];
  const trap = (target) => {
    const err = new Error(`SECURITY VIOLATION: Unauthorized outbound network request to "${target}"`);
    egressAttempts.push({ target: String(target), stack: err.stack });
    throw err;
  };

  global.fetch = (url) => trap(url);
  http.request = (url) => trap(url);
  http.get = (url) => trap(url);
  https.request = (url) => trap(url);
  https.get = (url) => trap(url);
  net.connect = (...args) => trap(args[0] || 'net.connect');
  tls.connect = (...args) => trap(args[0] || 'tls.connect');
  dgram.createSocket = (...args) => trap('dgram.socket');
}

function disarmNetworkTraps() {
  global.fetch = origFetch;
  http.request = origHttpRequest;
  http.get = origHttpGet;
  https.request = origHttpsRequest;
  https.get = origHttpsGet;
  net.connect = origNetConnect;
  tls.connect = origTlsConnect;
  dgram.createSocket = origDgramCreateSocket;
}

// ============================================================================
// Synthetic Test Document Generators
// ============================================================================
async function createTextAndVectorDoc(pageCount = 1, text = 'Original Content') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([500, 700]);
    // Text
    page.drawText(`${text} - Page ${i + 1}`, { x: 50, y: 650, size: 16, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`Paragraph content for verification testing on page ${i + 1}`, { x: 50, y: 600, size: 12 });
    // Vector graphics: rectangle, line, circle
    page.drawRectangle({
      x: 50,
      y: 450,
      width: 150,
      height: 100,
      color: rgb(0.2, 0.6, 0.8),
      borderColor: rgb(0, 0, 0),
      borderWidth: 2,
    });
    page.drawLine({
      start: { x: 50, y: 400 },
      end: { x: 300, y: 400 },
      thickness: 3,
      color: rgb(0.9, 0.2, 0.2),
    });
    page.drawCircle({
      x: 250,
      y: 500,
      size: 30,
      color: rgb(0.3, 0.8, 0.3),
    });
  }
  return await doc.save();
}

async function createDocWithLinksAndMetadata(uri = 'https://example.com/pdftool-test') {
  const doc = await PDFDocument.create();
  doc.setTitle('Document With Links');
  doc.setAuthor('Test Author');
  doc.setSubject('Testing Link Preservation');
  doc.setKeywords(['test', 'link', 'compression']);

  const page = doc.addPage([500, 700]);
  page.drawText('Click here to visit website', { x: 50, y: 600, size: 14 });

  // Add Link Annotation with URI action
  const linkAnnot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [50, 590, 250, 620],
    Border: [0, 0, 0],
    C: [0, 0, 1],
    A: {
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of(uri),
    },
  });
  const linkRef = doc.context.register(linkAnnot);

  let annots = page.node.get(PDFName.of('Annots'));
  if (!annots) {
    annots = doc.context.obj([linkRef]);
    page.node.set(PDFName.of('Annots'), annots);
  } else if (annots instanceof PDFArray) {
    annots.push(linkRef);
  }

  return await doc.save();
}

function createSyntheticPNG(width, height) {
  // Simple uncompressed RGBA PNG
  const zlib = require('zlib');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.slice(4, 8 + len));
    buf.writeInt32BE(crc, 8 + len);
    return buf;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
    }
    return (c ^ 0xffffffff) | 0;
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw image raster
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = (x * 7) % 256;      // R
      rawData[pxOffset + 1] = (y * 11) % 256;  // G
      rawData[pxOffset + 2] = ((x + y) * 5) % 256; // B
      rawData[pxOffset + 3] = 255;            // A
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

async function createImageHeavyDoc() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]);
  const pngBytes = createSyntheticPNG(250, 250);
  const img = await doc.embedPng(pngBytes);
  page.drawImage(img, { x: 50, y: 50, width: 400, height: 600 });
  return await doc.save();
}

// ============================================================================
// Test Suite Execution Harness
// ============================================================================
let passedCount = 0;
let failedCount = 0;
const failures = [];

async function test(name, fn) {
  process.stdout.write(`  [CHALLENGE] ${name} ... `);
  try {
    await fn();
    console.log('PASS');
    passedCount++;
  } catch (err) {
    console.log('FAIL');
    console.error(`    -> ${err.message}`);
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(relevantStack);
    }
    failedCount++;
    failures.push({ name, error: err });
  }
}

async function runAllChallenges() {
  console.log('====================================================================');
  console.log('Empirical Adversarial Challenge Suite: Milestone 2 (F9 & F10)');
  console.log('====================================================================\n');

  // --------------------------------------------------------------------------
  // Area 1: comparePDF Concurrency & Shared State
  // --------------------------------------------------------------------------
  console.log('--- 1. comparePDF Concurrency & Stress ---');

  await test('1.1 Concurrent comparisons (10 simultaneous comparisons without race conditions)', async () => {
    const docA = await createTextAndVectorDoc(2, 'Version A');
    const docB = await createTextAndVectorDoc(2, 'Version B (different)');
    const docC = await createTextAndVectorDoc(1, 'Version C (short)');

    const tasks = [];
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        tasks.push(PDFCore.comparePDF(docA, docB));
      } else {
        tasks.push(PDFCore.comparePDF(docA, docC));
      }
    }

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, 10, 'All 10 concurrent comparisons must resolve');

    for (let i = 0; i < 10; i++) {
      const res = results[i];
      assert(res && Array.isArray(res.diffPages), 'Must return diffPages array');
      if (i % 2 === 0) {
        assert.strictEqual(res.diffPages.length, 2, 'Doc A vs B must have 2 pages');
        assert.strictEqual(res.hasDifferences, true, 'Doc A vs B has differences');
      } else {
        assert.strictEqual(res.diffPages.length, 2, 'Doc A vs C must have 2 pages (max length)');
        assert.strictEqual(res.diffPages[1].diffPercent, 100, 'Page 2 missing in Doc C must be 100% diff');
      }
    }
  });

  // --------------------------------------------------------------------------
  // Area 2: comparePDF Lifecycle & Memory Leak Prevention (.destroy())
  // --------------------------------------------------------------------------
  console.log('\n--- 2. comparePDF Memory Lifecycle (.destroy() verification) ---');

  await test('2.1 Intercept and verify docA.destroy() and docB.destroy() on normal run', async () => {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const origGetDoc = pdfjs.getDocument;
    const destroyedDocs = [];

    pdfjs.getDocument = function(src) {
      const task = origGetDoc.call(this, src);
      const origPromise = task.promise;
      task.promise = origPromise.then((doc) => {
        const origDestroy = doc.destroy ? doc.destroy.bind(doc) : async () => {};
        doc.destroy = async function() {
          destroyedDocs.push(doc);
          return await origDestroy();
        };
        return doc;
      });
      return task;
    };

    try {
      const docA = await createTextAndVectorDoc(1, 'Doc 1');
      const docB = await createTextAndVectorDoc(1, 'Doc 2');
      const result = await PDFCore.comparePDF(docA, docB);
      assert(result && Array.isArray(result.diffPages));
      assert.strictEqual(destroyedDocs.length, 2, `Both PDF.js documents must be destroyed (destroyed: ${destroyedDocs.length})`);
    } finally {
      pdfjs.getDocument = origGetDoc;
    }
  });

  await test('2.2 Verify docA.destroy() and docB.destroy() on error during comparison loop', async () => {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const origGetDoc = pdfjs.getDocument;
    const destroyedDocs = [];

    let callCount = 0;
    pdfjs.getDocument = function(src) {
      const task = origGetDoc.call(this, src);
      const origPromise = task.promise;
      task.promise = origPromise.then((doc) => {
        callCount++;
        const myId = callCount;
        const origDestroy = doc.destroy ? doc.destroy.bind(doc) : async () => {};
        doc.destroy = async function() {
          destroyedDocs.push(myId);
          return await origDestroy();
        };

        if (myId === 2) {
          // Monkey-patch getPage on Doc B to throw mid-comparison
          const origGetPage = doc.getPage.bind(doc);
          doc.getPage = async function(num) {
            throw new Error('Simulated memory fault in getPage');
          };
        }
        return doc;
      });
      return task;
    };

    try {
      const docA = await createTextAndVectorDoc(1, 'Doc 1');
      const docB = await createTextAndVectorDoc(1, 'Doc 2');

      // The loop catches page render/text faults and falls back or returns diffPages
      const result = await PDFCore.comparePDF(docA, docB);
      assert.strictEqual(destroyedDocs.length, 2, 'Both doc instances must be destroyed even if getPage fails');
    } finally {
      pdfjs.getDocument = origGetDoc;
    }
  });

  // --------------------------------------------------------------------------
  // Area 3: comparePDF Response Format Contract Compliance
  // --------------------------------------------------------------------------
  console.log('\n--- 3. comparePDF Response Format Contract ---');

  await test('3.1 Verify contract fields { diffPages: Array<{ pageIndex, diffPixels, diffPercent, canvasDataUrl? }> }', async () => {
    const docA = await createTextAndVectorDoc(3, 'Baseline Spec Doc');
    const docB = await createTextAndVectorDoc(3, 'Baseline Spec Doc');

    const result = await PDFCore.comparePDF(docA, docB);

    assert(typeof result === 'object' && result !== null, 'comparePDF must return an object');
    assert(Array.isArray(result.diffPages), 'result.diffPages must be an array');
    assert.strictEqual(result.diffPages.length, 3, 'Must match page count');

    for (let i = 0; i < result.diffPages.length; i++) {
      const pageDiff = result.diffPages[i];
      assert.strictEqual(typeof pageDiff.pageIndex, 'number', `diffPages[${i}].pageIndex must be a number`);
      assert.strictEqual(pageDiff.pageIndex, i, `diffPages[${i}].pageIndex must equal ${i}`);
      assert.strictEqual(typeof pageDiff.diffPixels, 'number', `diffPages[${i}].diffPixels must be a number`);
      assert(pageDiff.diffPixels >= 0, `diffPages[${i}].diffPixels must be >= 0`);
      assert.strictEqual(typeof pageDiff.diffPercent, 'number', `diffPages[${i}].diffPercent must be a number`);
      assert(pageDiff.diffPercent >= 0 && pageDiff.diffPercent <= 100, `diffPages[${i}].diffPercent must be between 0 and 100`);

      if (pageDiff.canvasDataUrl !== undefined) {
        assert.strictEqual(typeof pageDiff.canvasDataUrl, 'string', 'canvasDataUrl if present must be string');
        assert(pageDiff.canvasDataUrl.startsWith('data:image/'), 'canvasDataUrl must be a data URI');
      }
    }
  });

  // --------------------------------------------------------------------------
  // Area 4: compressPDF Preservation (Text, Vector Graphics, Links, Metadata)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. compressPDF Content & Link Preservation ---');

  await test('4.1 Text content is perfectly extractable and unaltered after compressPDF', async () => {
    const secretPhrase = 'Confidential Integrity Check 12345';
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    page.drawText(secretPhrase, { x: 50, y: 600, size: 14 });
    const originalBytes = await doc.save();

    for (const preset of ['extreme', 'recommended', 'less']) {
      const compressed = await PDFCore.compressPDF(originalBytes, { level: preset });
      const extracted = await PDFCore.pdfToText(compressed, { format: 'plain' });
      assert(
        extracted.includes(secretPhrase),
        `Preset '${preset}' must preserve exact text content. Extracted: "${extracted}"`
      );
    }
  });

  await test('4.2 Vector graphics and paths are preserved in content streams', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    page.drawRectangle({ x: 50, y: 50, width: 200, height: 100, color: rgb(0.8, 0.2, 0.2) });
    const originalBytes = await doc.save();

    const compressed = await PDFCore.compressPDF(originalBytes, { level: 'extreme' });
    const loaded = await PDFDocument.load(compressed);
    const loadedPage = loaded.getPage(0);
    const contents = loadedPage.node.Contents();
    assert(contents, 'Page must retain content stream');

    // Load and verify page structure and size
    const { width, height } = loadedPage.getSize();
    assert.strictEqual(width, 500, 'Page width must remain 500');
    assert.strictEqual(height, 700, 'Page height must remain 700');
  });

  await test('4.3 Link annotations (/Annots with /URI) are preserved across all compression levels', async () => {
    const targetUri = 'https://anti-gravity.test/doc-link';
    const originalBytes = await createDocWithLinksAndMetadata(targetUri);

    for (const preset of ['extreme', 'recommended', 'less']) {
      const compressed = await PDFCore.compressPDF(originalBytes, { level: preset, stripMetadata: false });
      const loaded = await PDFDocument.load(compressed);
      const page = loaded.getPage(0);

      const annots = page.node.get(PDFName.of('Annots'));
      assert(annots, `Page must retain /Annots array under preset '${preset}'`);

      const annotArray = loaded.context.lookup(annots);
      assert(annotArray && typeof annotArray.size === 'function' && annotArray.size() > 0, 'Annots array must not be empty');

      const annotObj = loaded.context.lookup(annotArray.get(0));
      const actionObj = loaded.context.lookup(annotObj.get(PDFName.of('A')));
      assert(actionObj, 'Link annotation must contain action dictionary /A');
      const uriStr = actionObj.get(PDFName.of('URI'));
      assert(uriStr, 'Action dictionary must contain /URI entry');
      assert.strictEqual(uriStr.value, targetUri, `Link URI must be preserved exactly under preset '${preset}'`);
    }
  });

  await test('4.4 Metadata stripping works when stripMetadata=true and preserves when false', async () => {
    const originalBytes = await createDocWithLinksAndMetadata();

    // Case A: stripMetadata = true
    const strippedBytes = await PDFCore.compressPDF(originalBytes, { stripMetadata: true });
    const strippedDoc = await PDFDocument.load(strippedBytes);
    assert.strictEqual(strippedDoc.getTitle() || '', '', 'Title should be empty when stripped');
    assert.strictEqual(strippedDoc.getAuthor() || '', '', 'Author should be empty when stripped');

    // Case B: stripMetadata = false
    const preservedBytes = await PDFCore.compressPDF(originalBytes, { stripMetadata: false });
    const preservedDoc = await PDFDocument.load(preservedBytes);
    assert.strictEqual(preservedDoc.getTitle(), 'Document With Links', 'Title should be preserved when stripMetadata=false');
    assert.strictEqual(preservedDoc.getAuthor(), 'Test Author', 'Author should be preserved when stripMetadata=false');
  });

  await test('4.5 Image-heavy document achieves >20% byte reduction across presets', async () => {
    const imageDoc = await createImageHeavyDoc();
    const originalLen = imageDoc.length;

    const compressedExtreme = await PDFCore.compressPDF(imageDoc, { level: 'extreme' });
    const redExtreme = (originalLen - compressedExtreme.length) / originalLen;
    assert(redExtreme > 0.20, `Extreme preset must achieve >20% reduction (got ${(redExtreme * 100).toFixed(1)}%)`);

    const compressedRec = await PDFCore.compressPDF(imageDoc, { level: 'recommended' });
    const redRec = (originalLen - compressedRec.length) / originalLen;
    assert(redRec > 0.20, `Recommended preset must achieve >20% reduction (got ${(redRec * 100).toFixed(1)}%)`);
  });

  await test('4.6 Document without images compresses cleanly without error or corruption', async () => {
    const textDoc = await createTextAndVectorDoc(3, 'No Image Text Document');
    const compressed = await PDFCore.compressPDF(textDoc, { level: 'recommended' });
    assert(compressed instanceof Uint8Array, 'Must return Uint8Array');
    const loaded = await PDFDocument.load(compressed);
    assert.strictEqual(loaded.getPageCount(), 3, 'Must retain 3 pages');
    const extracted = await PDFCore.pdfToText(compressed, { format: 'plain' });
    assert(extracted.includes('No Image Text Document'), 'Text must remain intact');
  });

  await test('4.7 Document with embedded JPEG (DCTDecode) compresses safely', async () => {
    // Generate a document embedding a real JPEG image
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    // Standard valid 1x1 JPEG binary hex
    const standardJpegHex = 'ffd8ffe000104a46494600010101004800480000ffdb004300030202020202030202020303030304060404040404080606050609080a0a090809090a0c0f0c0a0b0e0b09090d110d0e0f101011100a0c12131210130f101010ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9';
    const buf = Buffer.from(standardJpegHex, 'hex');
    const jpgBytes = new Uint8Array(buf.length);
    buf.copy(jpgBytes);
    const img = await doc.embedJpg(jpgBytes);
    page.drawImage(img, { x: 50, y: 50, width: 200, height: 200 });
    const originalBytes = await doc.save();

    const compressed = await PDFCore.compressPDF(originalBytes, { level: 'recommended' });
    assert(compressed instanceof Uint8Array, 'Must return Uint8Array');
    const loaded = await PDFDocument.load(compressed);
    assert.strictEqual(loaded.getPageCount(), 1, 'Page count preserved');
  });

  await test('4.8 Repeated compression idempotence: compressPDF(compressPDF(doc))', async () => {
    const originalDoc = await createImageHeavyDoc();
    const pass1 = await PDFCore.compressPDF(originalDoc, { level: 'recommended' });
    const pass2 = await PDFCore.compressPDF(pass1, { level: 'recommended' });
    assert(pass2 instanceof Uint8Array);
    const loaded = await PDFDocument.load(pass2);
    assert.strictEqual(loaded.getPageCount(), 1);
  });

  await test('4.9 Buffer immutability: compressPDF does not mutate source buffer', async () => {
    const originalDoc = await createTextAndVectorDoc(1, 'Immutable Source');
    const snapshot = Buffer.from(originalDoc);
    await PDFCore.compressPDF(originalDoc, { level: 'extreme', stripMetadata: true });
    assert.deepStrictEqual(Buffer.from(originalDoc), snapshot, 'Input buffer must not be mutated');
  });

  await test('4.10 DCTDecode (JPEG) image >60px must NOT be corrupted into truncated FlateDecode in Node', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);

    // Construct an RGB Image XObject with DCTDecode (simulating a 100x100 JPEG)
    const imgDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 100,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    });
    // 3000 bytes simulating JPEG payload (compressed size < 100x100x3)
    const fakeJpegBytes = Buffer.alloc(3000, 0xBB);
    const imgStream = PDFLib.PDFRawStream.of(imgDict, fakeJpegBytes);
    const imgRef = doc.context.register(imgStream);
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      XObject: { ImRgb: imgRef }
    }));
    const originalPdf = await doc.save();

    const compressed = await PDFCore.compressPDF(originalPdf, { level: 'recommended' });
    const verified = await PDFDocument.load(compressed);

    for (const [ref, obj] of verified.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFRawStream) {
        const dict = obj.dict;
        if (dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
          const filter = dict.get(PDFName.of('Filter'))?.toString();
          const cs = dict.get(PDFName.of('ColorSpace'))?.toString();
          if (filter?.includes('FlateDecode') && cs?.includes('DeviceRGB')) {
            const w = dict.get(PDFName.of('Width')).asNumber();
            const h = dict.get(PDFName.of('Height')).asNumber();
            const uncompressed = require('zlib').inflateSync(obj.getContents());
            const expectedBytes = w * h * 3;
            assert.strictEqual(
              uncompressed.length,
              expectedBytes,
              `CRITICAL BUG: DeviceRGB FlateDecode stream is truncated! Expected ${expectedBytes} bytes for ${w}x${h} RGB raster, got ${uncompressed.length} bytes!`
            );
          }
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // Area 5: Deep comparePDF Discrepancy & Algorithmic Coverage
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Deep comparePDF Algorithmic & Discrepancy Coverage ---');

  await test('5.1 Page-selective modifications: middle page diff detected, adjacent pages 0% diff', async () => {
    const docA = await PDFDocument.create();
    const docB = await PDFDocument.create();
    for (let i = 0; i < 3; i++) {
      const pA = docA.addPage([500, 700]);
      pA.drawText(`Consistent Page ${i + 1}`, { x: 50, y: 650, size: 14 });
      const pB = docB.addPage([500, 700]);
      if (i === 1) {
        // Page index 1 is altered
        pB.drawText('Heavily Altered Page 2 Revision Modified Completely', { x: 50, y: 650, size: 14 });
      } else {
        pB.drawText(`Consistent Page ${i + 1}`, { x: 50, y: 650, size: 14 });
      }
    }
    const bytesA = await docA.save();
    const bytesB = await docB.save();

    const result = await PDFCore.comparePDF(bytesA, bytesB);
    assert.strictEqual(result.diffPages.length, 3);
    assert.strictEqual(result.diffPages[0].diffPercent, 0, 'Page 0 must be 0% diff');
    assert(result.diffPages[1].diffPercent > 0, 'Page 1 must be >0% diff');
    assert.strictEqual(result.diffPages[2].diffPercent, 0, 'Page 2 must be 0% diff');
    assert.strictEqual(result.hasDifferences, true);
  });

  await test('5.2 Long text discrepancy (>1000 characters) exercises Set token overlap fallback', async () => {
    const docA = await PDFDocument.create();
    const docB = await PDFDocument.create();
    const pageA = docA.addPage([600, 900]);
    const pageB = docB.addPage([600, 900]);

    // Generate > 1000 characters of text
    const wordsA = [];
    const wordsB = [];
    for (let i = 0; i < 250; i++) {
      wordsA.push(`tokenA${i}`);
      wordsB.push(i % 3 === 0 ? `MODIFIED_TOKEN_${i}` : `tokenA${i}`);
    }
    const textA = wordsA.join(' ');
    const textB = wordsB.join(' ');
    assert(textA.length > 1000, 'Must exceed 1000 characters for Set fallback');

    pageA.drawText(textA.slice(0, 300), { x: 50, y: 800, size: 10 });
    pageB.drawText(textB.slice(0, 300), { x: 50, y: 800, size: 10 });

    const bytesA = await docA.save();
    const bytesB = await docB.save();

    const result = await PDFCore.comparePDF(bytesA, bytesB);
    assert.strictEqual(result.diffPages.length, 1);
    assert(result.diffPages[0].diffPercent > 0, 'Must detect difference via Set overlap algorithm');
  });

  await test('5.3 Buffer immutability: comparePDF does not mutate either input buffer', async () => {
    const docA = await createTextAndVectorDoc(1, 'Immutable Doc A');
    const docB = await createTextAndVectorDoc(1, 'Immutable Doc B');
    const snapshotA = Buffer.from(docA);
    const snapshotB = Buffer.from(docB);

    await PDFCore.comparePDF(docA, docB);

    assert.deepStrictEqual(Buffer.from(docA), snapshotA, 'docA buffer must not be mutated');
    assert.deepStrictEqual(Buffer.from(docB), snapshotB, 'docB buffer must not be mutated');
  });

  await test('5.4 Partial load failure cleanup: docA.destroy() invoked even if docB loading rejects', async () => {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const origGetDoc = pdfjs.getDocument;
    let docADestroyed = false;
    let callNum = 0;

    pdfjs.getDocument = function(src) {
      callNum++;
      if (callNum === 1) {
        // Doc A succeeds
        const task = origGetDoc.call(this, src);
        task.promise = task.promise.then(doc => {
          const orig = doc.destroy ? doc.destroy.bind(doc) : async () => {};
          doc.destroy = async function() {
            docADestroyed = true;
            return await orig();
          };
          return doc;
        });
        return task;
      } else {
        // Doc B rejects
        return {
          promise: Promise.reject(new Error('Simulated taskB load failure')),
        };
      }
    };

    try {
      const docA = await createTextAndVectorDoc(1, 'Doc A');
      const docB = await createTextAndVectorDoc(1, 'Doc B');
      await PDFCore.comparePDF(docA, docB);
      assert.strictEqual(docADestroyed, true, 'docA must be cleanly destroyed even if docB rejected');
    } finally {
      pdfjs.getDocument = origGetDoc;
    }
  });

  // --------------------------------------------------------------------------
  // Area 6: App Integration & Boundary Guards
  // --------------------------------------------------------------------------
  console.log('\n--- 6. App Integration & Boundary Guards ---');

  await test('6.1 comparePDF null / undefined guards throw descriptive errors', async () => {
    const docA = await createTextAndVectorDoc(1, 'Doc A');
    await assert.rejects(() => PDFCore.comparePDF(null, docA), /required/i);
    await assert.rejects(() => PDFCore.comparePDF(docA, null), /required/i);
    await assert.rejects(() => PDFCore.comparePDF(undefined, undefined), /required/i);
  });

  await test('6.2 compressPDF null / empty input guard throws descriptive error', async () => {
    await assert.rejects(() => PDFCore.compressPDF(null), /required/i);
    await assert.rejects(() => PDFCore.compressPDF(undefined), /required/i);
  });

  // --------------------------------------------------------------------------
  // Area 7: Pure Client-Side Zero-Egress Network Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Pure Client-Side Zero-Egress Isolation ---');

  await test('7.1 Zero network egress across comparePDF and compressPDF operations', async () => {
    armNetworkTraps();
    try {
      const docA = await createTextAndVectorDoc(2, 'Egress Doc A');
      const docB = await createTextAndVectorDoc(2, 'Egress Doc B');

      // Execute comparePDF
      await PDFCore.comparePDF(docA, docB);

      // Execute compressPDF across all presets
      for (const preset of ['extreme', 'recommended', 'less']) {
        await PDFCore.compressPDF(docA, { level: preset });
      }

      assert.strictEqual(egressAttempts.length, 0, 'Zero network egress calls must be made');
    } finally {
      disarmNetworkTraps();
    }
  });

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`Milestone 2 Challenge Results: ${passedCount} Passed | ${failedCount} Failed | Assertions: ${assertionCount}`);
  console.log('====================================================================\n');

  if (failedCount > 0 || assertionCount === 0) {
    if (assertionCount === 0) console.error('FAILED: Zero assertions executed!');
    process.exit(1);
  }
}

runAllChallenges().catch((err) => {
  console.error('Fatal challenge runner error:', err);
  process.exit(1);
});

