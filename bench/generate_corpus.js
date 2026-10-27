const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const { PDFDocument, rgb, degrees, StandardFonts, PDFName } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const CORPUS_DIR = path.resolve(__dirname, 'corpus');

// Pure JS PNG Generator
function makePng(width, height, getPixel) {
  const rowLen = 1 + width * 4;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    raw[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      const pxOffset = rowOffset + 1 + x * 4;
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a !== undefined ? a : 255;
    }
  }

  const deflated = zlib.deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const tb = Buffer.from(type, 'ascii');
    const lb = Buffer.alloc(4);
    lb.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([tb, data]);
    const cb = Buffer.alloc(4);
    cb.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([lb, body, cb]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', deflated),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

async function getLiberationFontBytes() {
  const fontPath = path.resolve(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Regular.ttf');
  if (fs.existsSync(fontPath)) {
    return fs.readFileSync(fontPath);
  }
  return null;
}

async function generateAll() {
  if (!fs.existsSync(CORPUS_DIR)) {
    fs.mkdirSync(CORPUS_DIR, { recursive: true });
  }

  console.log(`Generating benchmark corpus in ${CORPUS_DIR}...`);

  const libFontBytes = await getLiberationFontBytes();

  // 1. Clean Scan
  {
    const doc = await PDFDocument.create();
    const cleanPng = makePng(400, 200, (x, y) => {
      // Crisp horizontal lines of text simulation
      const lineIdx = Math.floor(y / 25);
      const inLine = (y % 25) > 6 && (y % 25) < 18;
      const isChar = inLine && ((x % 14) < 10) && x > 30 && x < 370;
      return isChar ? [20, 20, 20, 255] : [255, 255, 255, 255];
    });
    const img = await doc.embedPng(cleanPng);
    const page = doc.addPage([595, 842]);
    page.drawImage(img, { x: 50, y: 550, width: 495, height: 247 });
    fs.writeFileSync(path.join(CORPUS_DIR, '01_clean_scan.pdf'), await doc.save());
  }

  // 2. Noisy Scan
  {
    const doc = await PDFDocument.create();
    let seed = 42;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    const noisyPng = makePng(400, 200, (x, y) => {
      // Noise speckles + faint contrast gradient
      const gradient = 240 + Math.floor((x / 400) * 15);
      const isNoise = rnd() < 0.03;
      const lineIdx = Math.floor(y / 25);
      const inLine = (y % 25) > 6 && (y % 25) < 18;
      const isChar = inLine && ((x % 14) < 10) && x > 30 && x < 370;
      if (isNoise) return [60, 60, 60, 255];
      if (isChar) {
        const val = rnd() < 0.2 ? 90 : 30;
        return [val, val, val, 255];
      }
      return [gradient, gradient, gradient, 255];
    });
    const img = await doc.embedPng(noisyPng);
    const page = doc.addPage([595, 842]);
    page.drawImage(img, { x: 50, y: 550, width: 495, height: 247 });
    fs.writeFileSync(path.join(CORPUS_DIR, '02_noisy_scan.pdf'), await doc.save());
  }

  // 3. 200+ Page Document (220 pages)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    for (let i = 1; i <= 220; i++) {
      const page = doc.addPage([612, 792]);
      page.drawText(`PDF Studio Benchmark - Volume 1`, { x: 50, y: 750, size: 10, font });
      page.drawText(`Chapter ${Math.ceil(i / 10)}: Section ${i}`, { x: 50, y: 700, size: 18, font: boldFont });
      page.drawText(`This is page ${i} of 220. Automated high-volume page corpus benchmark document.`, { x: 50, y: 660, size: 12, font });
      page.drawText(`Content paragraph verifying memory management, streaming, and page iteration stability under heavy load.`, { x: 50, y: 630, size: 11, font });
      page.drawText(`Page ${i}`, { x: 540, y: 30, size: 10, font });
    }
    fs.writeFileSync(path.join(CORPUS_DIR, '03_large_220_pages.pdf'), await doc.save());
  }

  // 4. Encrypted PDF (password: user123)
  {
    const outEncPath = path.join(CORPUS_DIR, '04_encrypted_userpass.pdf');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Confidential Document - Password Protected', { x: 50, y: 700, size: 16, font });
    page.drawText('This file is encrypted with standard user password "user123".', { x: 50, y: 660, size: 12, font });
    const clearBytes = await doc.save();
    const core = require('../pdf_core.js');
    const encBytes = await core.protectPDF(clearBytes, 'user123');
    fs.writeFileSync(outEncPath, encBytes);
  }

  // 5. Rotated 90 with non-zero CropBox
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.setRotation(degrees(90));
    page.setCropBox(36, 54, 540, 684); // Left: 36, Bottom: 54, Width: 540, Height: 684
    page.drawText('Rotated 90 Degrees with Non-Zero CropBox', { x: 60, y: 700, size: 16, font });
    page.drawText('Testing coordinate transformation and orientation handling.', { x: 60, y: 660, size: 12, font });
    fs.writeFileSync(path.join(CORPUS_DIR, '05_rotated_90_cropbox.pdf'), await doc.save());
  }

  // 6. Rotated 180 with non-zero CropBox
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.setRotation(degrees(180));
    page.setCropBox(50, 50, 512, 692);
    page.drawText('Rotated 180 Degrees with Non-Zero CropBox', { x: 70, y: 700, size: 16, font });
    page.drawText('Testing inverted coordinates and upside-down orientation.', { x: 70, y: 660, size: 12, font });
    fs.writeFileSync(path.join(CORPUS_DIR, '06_rotated_180_cropbox.pdf'), await doc.save());
  }

  // 7. Rotated 270 with non-zero CropBox
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.setRotation(degrees(270));
    page.setCropBox(40, 40, 532, 712);
    page.drawText('Rotated 270 Degrees with Non-Zero CropBox', { x: 60, y: 700, size: 16, font });
    page.drawText('Testing 270 degree rotation and CropBox offsets.', { x: 60, y: 660, size: 12, font });
    fs.writeFileSync(path.join(CORPUS_DIR, '07_rotated_270_cropbox.pdf'), await doc.save());
  }

  // 8. Rotated Mixed Pages
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const angles = [0, 90, 180, 270];
    for (let idx = 0; idx < angles.length; idx++) {
      const page = doc.addPage([612, 792]);
      page.setRotation(degrees(angles[idx]));
      page.drawText(`Page ${idx + 1} - Rotated ${angles[idx]} deg`, { x: 50, y: 700, size: 16, font });
    }
    fs.writeFileSync(path.join(CORPUS_DIR, '08_rotated_mixed_pages.pdf'), await doc.save());
  }

  // 9. Odd Page Size: A0 (2384 x 3370 pt)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([2384, 3370]);
    page.drawText('ENGINEERING BLUEPRINT ARCHITECTURE - A0 FORMAT (841 x 1189 mm)', { x: 100, y: 3200, size: 36, font });
    page.drawText('Grid dimensions: 2384 x 3370 PostScript points. Stress test for scale rendering and rasterization limits.', { x: 100, y: 3100, size: 24, font });
    fs.writeFileSync(path.join(CORPUS_DIR, '09_page_size_a0.pdf'), await doc.save());
  }

  // 10. Odd Page Size: Tiny (72 x 72 pt)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([72, 72]);
    page.drawText('TAG #1', { x: 10, y: 50, size: 10, font });
    page.drawText('SKU-99', { x: 10, y: 30, size: 8, font });
    fs.writeFileSync(path.join(CORPUS_DIR, '10_page_size_tiny.pdf'), await doc.save());
  }

  // 11. Odd Page Sizes: Mixed in one doc
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const sizes = [
      { name: 'Letter', w: 612, h: 792 },
      { name: 'A4', w: 595, h: 842 },
      { name: 'A0 Large', w: 2384, h: 3370 },
      { name: 'Tiny Label', w: 72, h: 72 },
      { name: 'Legal', w: 612, h: 1008 }
    ];
    for (const s of sizes) {
      const page = doc.addPage([s.w, s.h]);
      page.drawText(`Document Section: ${s.name} (${s.w}x${s.h})`, { x: 20, y: s.h - 40, size: Math.min(14, s.h / 5), font });
    }
    fs.writeFileSync(path.join(CORPUS_DIR, '11_page_size_mixed.pdf'), await doc.save());
  }

  // 12. Image-Heavy Photo
  {
    const doc = await PDFDocument.create();
    const photo1 = makePng(200, 150, (x, y) => [Math.floor((x / 200) * 255), Math.floor((y / 150) * 255), 180, 255]);
    const photo2 = makePng(200, 150, (x, y) => [220, Math.floor((x / 200) * 255), Math.floor((y / 150) * 255), 255]);
    const img1 = await doc.embedPng(photo1);
    const img2 = await doc.embedPng(photo2);
    const p1 = doc.addPage([612, 792]);
    p1.drawImage(img1, { x: 50, y: 400, width: 500, height: 350 });
    const p2 = doc.addPage([612, 792]);
    p2.drawImage(img2, { x: 50, y: 400, width: 500, height: 350 });
    fs.writeFileSync(path.join(CORPUS_DIR, '12_image_heavy_photo.pdf'), await doc.save());
  }

  // 13. Image-Heavy Multi-Page
  {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 5; i++) {
      const imgBuf = makePng(100, 100, (x, y) => [(i * 50) % 255, x * 2 % 255, y * 2 % 255, 255]);
      const img = await doc.embedPng(imgBuf);
      const page = doc.addPage([612, 792]);
      for (let j = 0; j < 4; j++) {
        page.drawImage(img, { x: 50 + (j % 2) * 260, y: 150 + Math.floor(j / 2) * 280, width: 240, height: 240 });
      }
    }
    fs.writeFileSync(path.join(CORPUS_DIR, '13_image_heavy_multi.pdf'), await doc.save());
  }

  // 14. Text-Heavy Article
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    for (let p = 1; p <= 4; p++) {
      const page = doc.addPage([612, 792]);
      page.drawText(`Technical Journal - Issue ${p}`, { x: 50, y: 750, size: 14, font: bold });
      for (let col = 0; col < 2; col++) {
        const xOffset = 50 + col * 260;
        for (let line = 0; line < 35; line++) {
          page.drawText(`Line ${line + 1}: High-density scientific corpus paragraph article body text validation.`, {
            x: xOffset,
            y: 720 - line * 18,
            size: 8,
            font
          });
        }
      }
    }
    fs.writeFileSync(path.join(CORPUS_DIR, '14_text_heavy_article.pdf'), await doc.save());
  }

  // 15. Text-Heavy Report
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    for (let p = 1; p <= 12; p++) {
      const page = doc.addPage([595, 842]);
      page.drawText(`ANNUAL PERFORMANCE AUDIT REPORT - PAGE ${p}`, { x: 50, y: 800, size: 12, font: bold });
      for (let row = 0; row < 25; row++) {
        page.drawText(`Record ${row + 1}: Category Alpha, Metric Score: ${(row * 3.7 + p).toFixed(2)}, Status: Verified Compliant`, {
          x: 50,
          y: 760 - row * 26,
          size: 10,
          font
        });
      }
    }
    fs.writeFileSync(path.join(CORPUS_DIR, '15_text_heavy_report.pdf'), await doc.save());
  }

  // 16. Interactive Form PDF
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('PDF Studio Application Form', { x: 50, y: 720, size: 16, font });
    const form = doc.getForm();
    const nameField = form.createTextField('fullName');
    nameField.setText('Ada Lovelace');
    nameField.addToPage(page, { x: 50, y: 660, width: 250, height: 24 });

    const emailField = form.createTextField('email');
    emailField.setText('ada@example.org');
    emailField.addToPage(page, { x: 50, y: 610, width: 250, height: 24 });

    const subscribeBox = form.createCheckBox('subscribe');
    subscribeBox.check();
    subscribeBox.addToPage(page, { x: 50, y: 560, width: 18, height: 18 });

    const dropdown = form.createDropdown('country');
    dropdown.addOptions(['United Kingdom', 'United States', 'Canada', 'Germany', 'Japan']);
    dropdown.select('United Kingdom');
    dropdown.addToPage(page, { x: 50, y: 500, width: 200, height: 24 });

    fs.writeFileSync(path.join(CORPUS_DIR, '16_form_interactive.pdf'), await doc.save());
  }

  // 17. Non-Latin: CJK Text
  {
    const tempRawPath = path.join(CORPUS_DIR, '_temp_cjk.pdf');
    const finalCjkPath = path.join(CORPUS_DIR, '17_nonlatin_cjk.pdf');
    const cjkPdf = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UTF16-H /DescendantFonts [6 0 R] >>
endobj
6 0 obj
<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> >>
endobj
5 0 obj
<< /Length 72 >>
stream
BT
/F1 20 Tf
50 720 Td
<4e2d65876d4b8bd5> Tj
0 -35 Td
<65e5672c8a9e30c630b930c8> Tj
ET
endstream
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000236 00000 n 
0000000450 00000 n 
0000000344 00000 n 
trailer
<< /Size 7 /Root 1 0 R >>
startxref
575
%%EOF
`);
    fs.writeFileSync(tempRawPath, cjkPdf);
    try {
      execSync(`qpdf --warning-exit-0 "${tempRawPath}" "${finalCjkPath}"`, { stdio: 'ignore' });
      fs.unlinkSync(tempRawPath);
    } catch {
      fs.renameSync(tempRawPath, finalCjkPath);
    }
  }

  // 18. Non-Latin: Cyrillic
  {
    const doc = await PDFDocument.create();
    if (libFontBytes) {
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(libFontBytes);
      const page = doc.addPage([612, 792]);
      page.drawText('Документ на русском языке (Cyrillic Benchmark)', { x: 50, y: 720, size: 16, font });
      page.drawText('Пример текста: Съешь же ещё этих мягких французских булок, да выпей чаю.', { x: 50, y: 680, size: 12, font });
      page.drawText('Українська мова: Тестування обробки кириличних символів у PDF Studio.', { x: 50, y: 640, size: 12, font });
      fs.writeFileSync(path.join(CORPUS_DIR, '18_nonlatin_cyrillic.pdf'), await doc.save());
    }
  }

  // 19. Non-Latin: Greek
  {
    const doc = await PDFDocument.create();
    if (libFontBytes) {
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(libFontBytes);
      const page = doc.addPage([612, 792]);
      page.drawText('Ελληνικό Κείμενο (Greek Language Benchmark)', { x: 50, y: 720, size: 16, font });
      page.drawText('Παράδειγμα: Καλημέρα κόσμε! Η ποιότητα της επεξεργασίας PDF είναι κρίσιμη.', { x: 50, y: 680, size: 12, font });
      page.drawText('Μαθηματικά σύμβολα: α + β = γ, Δx / Δt, ∫ f(x) dx = Ω', { x: 50, y: 640, size: 12, font });
      fs.writeFileSync(path.join(CORPUS_DIR, '19_nonlatin_greek.pdf'), await doc.save());
    }
  }

  // 20. Non-Latin: Arabic & Indic (with honest notice on shaping)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Arabic and Indic Scripts Corpus Test', { x: 50, y: 720, size: 16, font });
    page.drawText('Scope notice: Complex text shaping (OpenType GSUB/GPOS) is marked beta/unsupported.', { x: 50, y: 680, size: 11, font });
    page.drawText('Devanagari Sample: Namaste (Unicode reference sample)', { x: 50, y: 640, size: 12, font });
    page.drawText('Arabic Sample: Marhaban (Unicode reference sample)', { x: 50, y: 610, size: 12, font });
    fs.writeFileSync(path.join(CORPUS_DIR, '20_nonlatin_arabic_indic.pdf'), await doc.save());
  }

  // 21. Non-Latin: Multilingual
  {
    const doc = await PDFDocument.create();
    if (libFontBytes) {
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(libFontBytes);
      const page = doc.addPage([612, 792]);
      page.drawText('Universal Declaration of Human Rights - Multilingual', { x: 50, y: 720, size: 14, font });
      page.drawText('EN: All human beings are born free and equal in dignity and rights.', { x: 50, y: 680, size: 11, font });
      page.drawText('FR: Tous les êtres humains naissent libres et égaux en dignité et en droits.', { x: 50, y: 650, size: 11, font });
      page.drawText('ES: Todos los seres humanos nacen libres e iguales en dignidad y derechos.', { x: 50, y: 620, size: 11, font });
      page.drawText('RU: Все люди рождаются свободными и равными в своем достоинстве и правах.', { x: 50, y: 590, size: 11, font });
      page.drawText('EL: Όλοι οι άνθρωποι γεννιούνται ελεύθεροι και ίσοι στην αξιοπρέπεια και τα δικαιώματα.', { x: 50, y: 560, size: 11, font });
      fs.writeFileSync(path.join(CORPUS_DIR, '21_nonlatin_multilingual.pdf'), await doc.save());
    }
  }

  // 22. Annotations and Links
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Document with Annotations and Hyperlinks', { x: 50, y: 720, size: 16, font });
    page.drawText('Visit https://github.com/vedantexists/pdf-studio for documentation.', { x: 50, y: 680, size: 12, font });
    // Add URI Link Annotation via pdf-lib context
    const linkAnnot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [50, 675, 450, 695],
      Border: [0, 0, 1],
      C: [0, 0, 1],
      A: {
        Type: 'Action',
        S: 'URI',
        URI: 'https://github.com/vedantexists/pdf-studio'
      }
    });
    const linkRef = doc.context.register(linkAnnot);
    page.node.set(PDFName.of('Annots'), doc.context.obj([linkRef]));
    fs.writeFileSync(path.join(CORPUS_DIR, '22_annotations_links.pdf'), await doc.save());
  }

  // 23. Transparency and Vector Graphics
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Vector Graphics and Alpha Transparency', { x: 50, y: 720, size: 16, font });
    page.drawCircle({
      x: 200,
      y: 500,
      size: 80,
      color: rgb(1, 0, 0),
      opacity: 0.6
    });
    page.drawCircle({
      x: 270,
      y: 500,
      size: 80,
      color: rgb(0, 0, 1),
      opacity: 0.6
    });
    page.drawRectangle({
      x: 150,
      y: 350,
      width: 200,
      height: 100,
      color: rgb(0, 0.8, 0.2),
      opacity: 0.5,
      borderWidth: 2,
      borderColor: rgb(0, 0, 0)
    });
    fs.writeFileSync(path.join(CORPUS_DIR, '23_transparency_vector.pdf'), await doc.save());
  }

  // 24. Grayscale Monochrome Scanned Document
  {
    const doc = await PDFDocument.create();
    const monoPng = makePng(300, 150, (x, y) => {
      const isChar = (y % 20 > 5 && y % 20 < 15) && (x % 10 < 7) && x > 20 && x < 280;
      return isChar ? [0, 0, 0, 255] : [255, 255, 255, 255];
    });
    const img = await doc.embedPng(monoPng);
    const page = doc.addPage([595, 842]);
    page.drawImage(img, { x: 50, y: 550, width: 495, height: 247 });
    fs.writeFileSync(path.join(CORPUS_DIR, '24_grayscale_monochrome.pdf'), await doc.save());
  }

  // 25. Blank Pages Interspersed
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let p = 1; p <= 6; p++) {
      const page = doc.addPage([612, 792]);
      // Pages 2 and 4 are completely blank
      if (p !== 2 && p !== 4) {
        page.drawText(`Content on Page ${p} of 6`, { x: 50, y: 700, size: 14, font });
        page.drawText(`Note: Page 2 and Page 4 are intentionally left blank to verify blank page handling.`, { x: 50, y: 660, size: 11, font });
      }
    }
    fs.writeFileSync(path.join(CORPUS_DIR, '25_blank_pages.pdf'), await doc.save());
  }

  const files = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.pdf'));
  console.log(`Generated ${files.length} benchmark corpus files successfully in ${CORPUS_DIR}.`);
  return files;
}

if (require.main === module) {
  generateAll().catch(err => {
    console.error('Failed to generate benchmark corpus:', err);
    process.exit(1);
  });
}

module.exports = { generateAll, CORPUS_DIR };
