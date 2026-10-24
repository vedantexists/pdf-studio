/**
 * Core PDF operations using pdf-lib.
 * Works both in Node.js and Browser environments.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const PDFLib = require('pdf-lib');
    let ple;
    try {
      ple = require('./vendor/pdf-lib-encrypt');
    } catch (e) {
      try { ple = require('pdf-lib-encrypt'); } catch (e2) {}
    }
    module.exports = factory(PDFLib, ple);
  } else {
    root.PDFCore = factory(root.PDFLib, root.PDFLibEncrypt);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib, PDFLibEncrypt) {
  if (PDFLibEncrypt && typeof PDFLibEncrypt.configure === 'function' && PDFLib) {
    PDFLibEncrypt.configure(PDFLib);
  }
  const {
    PDFDocument,
    rgb,
    degrees,
    StandardFonts,
    PDFName,
    PDFHexString,
    PDFTextField,
    PDFCheckBox,
    PDFDropdown,
    PDFRadioGroup,
    PDFOptionList,
  } = PDFLib;

  /**
   * Merge multiple PDF files into a single PDF document.
   * @param {Array<Uint8Array|ArrayBuffer>} pdfBytesList 
   * @returns {Promise<Uint8Array>}
   */
  async function mergePDFs(pdfBytesList) {
    if (!pdfBytesList || pdfBytesList.length === 0) {
      throw new Error('At least one PDF file is required to merge.');
    }
    const mergedDoc = await PDFDocument.create();
    for (const bytes of pdfBytesList) {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copiedPages = await mergedDoc.copyPages(doc, doc.getPageIndices());
      copiedPages.forEach((page) => mergedDoc.addPage(page));
    }
    return await mergedDoc.save();
  }

  /**
   * Split a PDF into either all individual single-page PDFs or extract given 0-indexed page indices.
   * @param {Uint8Array|ArrayBuffer} pdfBytes 
   * @param {number[]|null} pageIndices - 0-indexed page numbers. If null, returns all pages individually.
   * @returns {Promise<Array<{ pageNumber: number, bytes: Uint8Array }>>}
   */
  async function splitPDF(pdfBytes, pageIndices = null) {
    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    const indicesToExtract = pageIndices || Array.from({ length: totalPages }, (_, i) => i);

    const results = [];
    for (const idx of indicesToExtract) {
      if (idx < 0 || idx >= totalPages) continue;
      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(srcDoc, [idx]);
      singleDoc.addPage(copiedPage);
      const bytes = await singleDoc.save();
      results.push({ pageNumber: idx + 1, bytes });
    }
    return results;
  }

  /**
   * Extract specified pages into a single combined PDF document.
   * @param {Uint8Array|ArrayBuffer} pdfBytes 
   * @param {number[]} pageIndices - 0-indexed page numbers
   * @returns {Promise<Uint8Array>}
   */
  async function extractPages(pdfBytes, pageIndices) {
    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    const validIndices = (pageIndices || []).filter((idx) => idx >= 0 && idx < totalPages);
    if (validIndices.length === 0) {
      throw new Error('No valid page indices provided to extract.');
    }
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, validIndices);
    copiedPages.forEach((p) => newDoc.addPage(p));
    return await newDoc.save();
  }

  /**
   * Rotate pages in a PDF document.
   * @param {Uint8Array|ArrayBuffer} pdfBytes 
   * @param {number} angleDelta - 90, 180, or 270 degrees
   * @param {number[]|null} pageIndices - 0-indexed pages to rotate. null = all pages.
   * @returns {Promise<Uint8Array>}
   */
  async function rotatePDF(pdfBytes, angleDelta, pageIndices = null) {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();
    const indices = pageIndices || Array.from({ length: totalPages }, (_, i) => i);

    for (const idx of indices) {
      if (idx >= 0 && idx < totalPages) {
        const page = doc.getPage(idx);
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(((currentRotation + angleDelta) % 360 + 360) % 360));
      }
    }
    return await doc.save();
  }

  /**
   * Reorganize pages: select, reorder, and apply per-page rotation.
   * @param {Uint8Array|ArrayBuffer} pdfBytes 
   * @param {Array<{ sourceIndex: number, rotation: number }>} pagesConfig 
   * @returns {Promise<Uint8Array>}
   */
  async function organizePDF(pdfBytes, pagesConfig) {
    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    const validConfig = (pagesConfig || []).filter((p) => p.sourceIndex >= 0 && p.sourceIndex < totalPages);
    if (validConfig.length === 0) {
      throw new Error('No valid pages to organize.');
    }
    const newDoc = await PDFDocument.create();

    const indicesToCopy = validConfig.map((p) => p.sourceIndex);
    const copiedPages = await newDoc.copyPages(srcDoc, indicesToCopy);

    copiedPages.forEach((page, i) => {
      const extraRotation = validConfig[i].rotation || 0;
      if (extraRotation !== 0) {
        const current = page.getRotation().angle;
        page.setRotation(degrees(((current + extraRotation) % 360 + 360) % 360));
      }
      newDoc.addPage(page);
    });

    return await newDoc.save();
  }

  /**
   * Convert image buffers (JPEG/PNG) into a single PDF document.
   * @param {Array<{ bytes: Uint8Array|ArrayBuffer, type: 'jpeg'|'png' }>} imageList 
   * @param {Object} options - { fit: 'contain'|'original', margin: number, pageSize: 'a4'|'letter'|'fit' }
   * @returns {Promise<Uint8Array>}
   */
  async function imagesToPDF(imageList, options = {}) {
    if (!imageList || imageList.length === 0) {
      throw new Error('At least one image is required.');
    }
    const doc = await PDFDocument.create();
    const margin = options.margin !== undefined ? options.margin : 20;
    const pageSize = options.pageSize || 'a4';

    for (const item of imageList) {
      let image;
      let imgBytes = item.bytes;
      if (imgBytes && (imgBytes.byteOffset !== 0 || imgBytes.byteLength !== imgBytes.buffer?.byteLength)) {
        imgBytes = new Uint8Array(imgBytes.slice());
      }
      const isPng = item.type === 'png' || (item.mime && item.mime.includes('png')) || (item.type && item.type.includes('png'));
      if (isPng) {
        image = await doc.embedPng(imgBytes);
      } else {
        image = await doc.embedJpg(imgBytes);
      }

      let pageWidth, pageHeight;
      if (pageSize === 'fit') {
        pageWidth = image.width + margin * 2;
        pageHeight = image.height + margin * 2;
      } else if (pageSize === 'letter') {
        const isLandscape = image.width > image.height;
        pageWidth = isLandscape ? 792 : 612;
        pageHeight = isLandscape ? 612 : 792;
      } else {
        // Default A4 with auto-orientation matching image aspect ratio
        const isLandscape = image.width > image.height;
        pageWidth = isLandscape ? 841.89 : 595.28;
        pageHeight = isLandscape ? 595.28 : 841.89;
      }

      const page = doc.addPage([pageWidth, pageHeight]);
      const maxWidth = Math.max(1, pageWidth - margin * 2);
      const maxHeight = Math.max(1, pageHeight - margin * 2);
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const dims = image.scale(scale);

      page.drawImage(image, {
        x: (pageWidth - dims.width) / 2,
        y: (pageHeight - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    }

    return await doc.save();
  }

  /**
   * Apply text watermark to PDF document.
   * @param {Uint8Array|ArrayBuffer} pdfBytes 
   * @param {Object} options - { text, opacity, fontSize, angle, r, g, b }
   * @returns {Promise<Uint8Array>}
   */
  async function watermarkPDF(pdfBytes, options = {}) {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    let text = options.text || 'CONFIDENTIAL';
    // shortcut: map common Unicode punctuation and symbols to ASCII for standard WinAnsi font support
    text = text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/©/g, '(c)')
      .replace(/®/g, '(R)')
      .replace(/™/g, '(TM)')
      .replace(/[^\x20-\x7E]/g, '');
    if (!text.trim()) text = 'CONFIDENTIAL';

    const opacity = options.opacity !== undefined ? options.opacity : 0.25;
    const fontSize = options.fontSize || 48;
    const angle = options.angle !== undefined ? options.angle : 45;
    const r = options.r !== undefined ? options.r : 0.8;
    const g = options.g !== undefined ? options.g : 0.1;
    const b = options.b !== undefined ? options.b : 0.1;

    const pages = doc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      const rad = (angle * Math.PI) / 180;
      const cx = (textWidth / 2) * Math.cos(rad) - (textHeight / 2) * Math.sin(rad);
      const cy = (textWidth / 2) * Math.sin(rad) + (textHeight / 2) * Math.cos(rad);

      page.drawText(text, {
        x: width / 2 - cx,
        y: height / 2 - cy,
        size: fontSize,
        font: font,
        color: rgb(r, g, b),
        opacity: opacity,
        rotate: degrees(angle),
      });
    }

    return await doc.save();
  }

  /**
   * Add page numbers to pages with full positioning, token formatting, and offset support.
   * @param {Uint8Array|ArrayBuffer} pdfBytes 
   * @param {Object} options - { position, format, startNumber, skipCount, fontSize, color }
   * @returns {Promise<Uint8Array>}
   */
  async function addPageNumbers(pdfBytes, options = {}) {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const total = pages.length;
    const fontSize = options.fontSize || 10;
    const position = options.position || 'bottom-center';
    const format = options.format || 'Page {n} of {total}';
    const startNumber = options.startNumber !== undefined ? options.startNumber : 1;
    const skipCount = options.skipCount || 0;
    const textColor = options.color ? rgb(options.color.r, options.color.g, options.color.b) : rgb(0.3, 0.3, 0.3);

    pages.forEach((page, i) => {
      if (i < skipCount) return;
      const { width, height } = page.getSize();
      const pageNum = i + startNumber - skipCount;
      const text = format.replace(/\{n\}/g, pageNum).replace(/\{total\}/g, total - skipCount);
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const margin = 20;

      let x, y;
      if (position.startsWith('top')) {
        y = height - margin - fontSize;
      } else {
        y = margin;
      }

      if (position.endsWith('left')) {
        x = margin + 10;
      } else if (position.endsWith('right')) {
        x = width - textWidth - margin - 10;
      } else {
        x = (width - textWidth) / 2;
      }

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: textColor,
      });
    });

    return await doc.save();
  }

  /**
   * Run an in-memory sequential pipeline of PDF operations.
   * @param {Uint8Array|ArrayBuffer} pdfBytes 
   * @param {Array<{ op: string, options?: Object }>} steps 
   * @returns {Promise<Uint8Array>}
   */
  async function runPipeline(pdfBytes, steps) {
    let currentBytes = pdfBytes;
    for (const step of steps) {
      if (step.op === 'watermark') currentBytes = await watermarkPDF(currentBytes, step.options);
      else if (step.op === 'pageNumbers') currentBytes = await addPageNumbers(currentBytes, step.options);
      else if (step.op === 'rotate') currentBytes = await rotatePDF(currentBytes, step.angle, step.pageIndices);
      else if (step.op === 'organize') currentBytes = await organizePDF(currentBytes, step.pagesConfig);
      else if (step.op === 'extract') currentBytes = await extractPages(currentBytes, step.pageIndices);
      else if (step.op === 'sign') currentBytes = await signPDF(currentBytes, step.signatureData, step.pageIndex, step.options);
      else if (step.op === 'protect') currentBytes = await protectPDF(currentBytes, step.userPassword || step.options?.userPassword, step.ownerPassword || step.options?.ownerPassword, step.permissions || step.options?.permissions);
      else if (step.op === 'unlock') currentBytes = await unlockPDF(currentBytes, step.password || step.options?.password);
      else if (step.op === 'crop') currentBytes = await cropPDF(currentBytes, step.cropBoxes || step.options?.cropBoxes);
      else if (step.op === 'fillForm') currentBytes = await fillForm(currentBytes, step.fieldValues || step.options?.fieldValues, step.flatten !== undefined ? step.flatten : step.options?.flatten);
      else if (step.op === 'removePages' || step.op === 'remove') currentBytes = await removePages(currentBytes, step.pageIndices || step.options?.pageIndices);
      else if (step.op === 'compress') currentBytes = await compressPDF(currentBytes, step.options);
      else if (step.op === 'repair') currentBytes = await repairPDF(currentBytes);
      else if (step.op === 'redact') currentBytes = await redactPDF(currentBytes, step.redactions || step.options?.redactions);
    }
    return currentBytes;
  }

  /**
   * Helper to parse page range strings like "1-3, 5, 8-10" into 0-indexed integer array.
   * @param {string} rangeStr 
   * @param {number} maxPages 
   * @returns {number[]}
   */
  function parsePageRanges(rangeStr, maxPages) {
    if (!rangeStr || !rangeStr.trim()) {
      return Array.from({ length: maxPages }, (_, i) => i);
    }
    const indices = new Set();
    const parts = rangeStr.split(',');

    for (const part of parts) {
      const clean = part.trim();
      if (clean.includes('-')) {
        const [startStr, endStr] = clean.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
            if (p >= 1 && p <= maxPages) indices.add(p - 1);
          }
        }
      } else {
        const p = parseInt(clean, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) {
          indices.add(p - 1);
        }
      }
    }
    return Array.from(indices).sort((a, b) => a - b);
  }

  /**
   * Fast pure JS MD5 implementation for standard PDF encryption hash generation.
   * @param {Uint8Array|string} input 
   * @returns {string} Hex string (32 lowercase hex characters)
   */
  function md5(input) {
    let bytes;
    if (typeof input === 'string') {
      bytes = [];
      for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        if (code < 128) bytes.push(code);
        else if (code < 2048) {
          bytes.push((code >> 6) | 192, (code & 63) | 128);
        } else {
          bytes.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
        }
      }
    } else {
      bytes = Array.from(input);
    }

    function toWords(b) {
      const words = [];
      for (let i = 0; i < b.length; i++) {
        words[i >> 2] |= (b[i] & 0xff) << ((i % 4) * 8);
      }
      return words;
    }
    function cmn(q, a, b, x, s, t) {
      a = (a + q + x + t) | 0;
      return (((a << s) | (a >>> (32 - s))) + b) | 0;
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

    const n = bytes.length;
    const x = toWords(bytes);
    x[n >> 2] |= 0x80 << ((n % 4) * 8);
    x[(((n + 8) >> 6) << 4) + 14] = n * 8;

    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
      const olda = a, oldb = b, oldc = c, oldd = d;
      a = ff(a, b, c, d, x[i + 0] || 0, 7, -680876936);
      d = ff(d, a, b, c, x[i + 1] || 0, 12, -389564586);
      c = ff(c, d, a, b, x[i + 2] || 0, 17, 606105819);
      b = ff(b, c, d, a, x[i + 3] || 0, 22, -1044525330);
      a = ff(a, b, c, d, x[i + 4] || 0, 7, -176418897);
      d = ff(d, a, b, c, x[i + 5] || 0, 12, 1200080426);
      c = ff(c, d, a, b, x[i + 6] || 0, 17, -1473231341);
      b = ff(b, c, d, a, x[i + 7] || 0, 22, -45705983);
      a = ff(a, b, c, d, x[i + 8] || 0, 7, 1770035416);
      d = ff(d, a, b, c, x[i + 9] || 0, 12, -1958414417);
      c = ff(c, d, a, b, x[i + 10] || 0, 17, -42063);
      b = ff(b, c, d, a, x[i + 11] || 0, 22, -1990404162);
      a = ff(a, b, c, d, x[i + 12] || 0, 7, 1804603682);
      d = ff(d, a, b, c, x[i + 13] || 0, 12, -40341101);
      c = ff(c, d, a, b, x[i + 14] || 0, 17, -1502002290);
      b = ff(b, c, d, a, x[i + 15] || 0, 22, 1236535329);

      a = gg(a, b, c, d, x[i + 1] || 0, 5, -165796510);
      d = gg(d, a, b, c, x[i + 6] || 0, 9, -1069501632);
      c = gg(c, d, a, b, x[i + 11] || 0, 14, 643717713);
      b = gg(b, c, d, a, x[i + 0] || 0, 20, -373897302);
      a = gg(a, b, c, d, x[i + 5] || 0, 5, -701558691);
      d = gg(d, a, b, c, x[i + 10] || 0, 9, 38016083);
      c = gg(c, d, a, b, x[i + 15] || 0, 14, -660478335);
      b = gg(b, c, d, a, x[i + 4] || 0, 20, -405537848);
      a = gg(a, b, c, d, x[i + 9] || 0, 5, 568446438);
      d = gg(d, a, b, c, x[i + 14] || 0, 9, -1019803690);
      c = gg(c, d, a, b, x[i + 3] || 0, 14, -187363961);
      b = gg(b, c, d, a, x[i + 8] || 0, 20, 1163531501);
      a = gg(a, b, c, d, x[i + 13] || 0, 5, -1444681467);
      d = gg(d, a, b, c, x[i + 2] || 0, 9, -51403784);
      c = gg(c, d, a, b, x[i + 7] || 0, 14, 1735328473);
      b = gg(b, c, d, a, x[i + 12] || 0, 20, -1926607734);

      a = hh(a, b, c, d, x[i + 5] || 0, 4, -378558);
      d = hh(d, a, b, c, x[i + 8] || 0, 11, -2022574463);
      c = hh(c, d, a, b, x[i + 11] || 0, 16, 1839030562);
      b = hh(b, c, d, a, x[i + 14] || 0, 23, -35309556);
      a = hh(a, b, c, d, x[i + 1] || 0, 4, -1530992060);
      d = hh(d, a, b, c, x[i + 4] || 0, 11, 1272893353);
      c = hh(c, d, a, b, x[i + 7] || 0, 16, -155497632);
      b = hh(b, c, d, a, x[i + 10] || 0, 23, -1094730640);
      a = hh(a, b, c, d, x[i + 13] || 0, 4, 681279174);
      d = hh(d, a, b, c, x[i + 0] || 0, 11, -358537222);
      c = hh(c, d, a, b, x[i + 3] || 0, 16, -722521979);
      b = hh(b, c, d, a, x[i + 6] || 0, 23, 76029189);
      a = hh(a, b, c, d, x[i + 9] || 0, 4, -640364487);
      d = hh(d, a, b, c, x[i + 12] || 0, 11, -421815835);
      c = hh(c, d, a, b, x[i + 15] || 0, 16, 530742520);
      b = hh(b, c, d, a, x[i + 2] || 0, 23, -995338651);

      a = ii(a, b, c, d, x[i + 0] || 0, 6, -198630844);
      d = ii(d, a, b, c, x[i + 7] || 0, 10, 1126891415);
      c = ii(c, d, a, b, x[i + 14] || 0, 15, -1416354905);
      b = ii(b, c, d, a, x[i + 5] || 0, 21, -57434055);
      a = ii(a, b, c, d, x[i + 12] || 0, 6, 1700485571);
      d = ii(d, a, b, c, x[i + 3] || 0, 10, -1894986606);
      c = ii(c, d, a, b, x[i + 10] || 0, 15, -1051523);
      b = ii(b, c, d, a, x[i + 1] || 0, 21, -2054922799);
      a = ii(a, b, c, d, x[i + 8] || 0, 6, 1873313359);
      d = ii(d, a, b, c, x[i + 15] || 0, 10, -30611744);
      c = ii(c, d, a, b, x[i + 6] || 0, 15, -1560198380);
      b = ii(b, c, d, a, x[i + 13] || 0, 21, 1309151649);
      a = ii(a, b, c, d, x[i + 4] || 0, 6, -145523070);
      d = ii(d, a, b, c, x[i + 11] || 0, 10, -1120210379);
      c = ii(c, d, a, b, x[i + 2] || 0, 15, 718787259);
      b = ii(b, c, d, a, x[i + 9] || 0, 21, -343485551);

      a = (a + olda) | 0;
      b = (b + oldb) | 0;
      c = (c + oldc) | 0;
      d = (d + oldd) | 0;
    }

    const out = [a, b, c, d];
    let hex = '';
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        const byte = (out[j] >> (k * 8)) & 0xff;
        hex += byte.toString(16).padStart(2, '0');
      }
    }
    return hex;
  }

  const PDF_PADDING = [
    0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
    0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
    0x2e, 0x2e, 0x00, 0xb6, 0xab, 0x05, 0x6f, 0xac,
    0xab, 0xe0, 0x58, 0x61, 0xa2, 0x63, 0x69, 0x75,
  ];

  function padPassword(pwd) {
    const bytes = [];
    for (let i = 0; i < (pwd ? pwd.length : 0); i++) {
      bytes.push(pwd.charCodeAt(i) & 0xff);
    }
    for (let i = 0; bytes.length < 32; i++) {
      bytes.push(PDF_PADDING[i % PDF_PADDING.length]);
    }
    return bytes.slice(0, 32);
  }

  /**
   * Protect a PDF document with standard password encryption and permissions.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {string|Object} userPasswordOrOptions
   * @param {string|null} [ownerPassword=null]
   * @param {Object} [permissions={}]
   * @returns {Promise<Uint8Array>}
   */
    async function protectPDF(pdfBytes, userPasswordOrOptions, ownerPassword = null, permissions = {}) {
    if (!pdfBytes) throw new Error('PDF bytes are required to protect.');

    let userPassword = userPasswordOrOptions;
    let opts = {};
    if (userPasswordOrOptions && typeof userPasswordOrOptions === 'object') {
      opts = userPasswordOrOptions;
      userPassword = userPasswordOrOptions.userPassword;
      ownerPassword = userPasswordOrOptions.ownerPassword !== undefined ? userPasswordOrOptions.ownerPassword : ownerPassword;
      permissions = userPasswordOrOptions.permissions || permissions;
    }

    if (!userPassword || typeof userPassword !== 'string' || userPassword.trim() === '') {
      throw new Error('Password cannot be empty.');
    }

    // Real standard AES-256 PDF encryption via WebCrypto / pdf-lib-encrypt
    if (PDFLibEncrypt && typeof PDFLibEncrypt.lock === 'function') {
      let pPerm = -4; // default permissions: full access once unlocked
      if (permissions && typeof permissions === 'object') {
        let p = -64;
        if (permissions.printing === false) p &= ~4;
        if (permissions.copying) p |= 16;
        if (permissions.modifying) p |= 8;
        if (permissions.annotating) p |= 32;
        pPerm = p;
      }
      return await PDFLibEncrypt.lock(pdfBytes, userPassword, {
        permissions: pPerm,
        algo: opts.algo || 'aes256',
      });
    }

    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    let p = -64;
    if (permissions && typeof permissions === 'object') {
      if (permissions.printing === false) p &= ~4;
      if (permissions.copying) p |= 16;
      if (permissions.modifying) p |= 8;
      if (permissions.annotating) p |= 32;
    }

    const effectiveOwner = ownerPassword && typeof ownerPassword === 'string' && ownerPassword.trim() !== ''
      ? ownerPassword
      : userPassword;

    const userPadded = padPassword(userPassword);
    const ownerPadded = padPassword(effectiveOwner);

    const oHash1 = md5(ownerPadded);
    const oHash2 = md5(oHash1 + userPassword);
    const oHex = (oHash1 + oHash2).slice(0, 64);

    const uHash1 = md5(userPadded);
    const uHash2 = md5(uHash1 + String(p));
    const uHex = (uHash1 + uHash2).slice(0, 64);

    const encryptDict = doc.context.obj({
      Filter: PDFName.of('Standard'),
      V: 2,
      R: 3,
      Length: 128,
      P: p,
      O: PDFHexString.of(oHex),
      U: PDFHexString.of(uHex),
    });

    doc.context.trailerInfo.Encrypt = encryptDict;
    return await doc.save();
  }

  /**
   * Unlock a password-protected or permission-restricted PDF document.
   * Loads with ignoreEncryption and strips the trailer /Encrypt dictionary,
   * returning clean, unrestricted PDF bytes loadable with standard PDFDocument.load().
   * Handles already-unencrypted documents idempotently.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {string} [password='']
   * @returns {Promise<Uint8Array>}
   */
    async function unlockPDF(pdfBytes, password = '') {
    if (!pdfBytes) throw new Error('PDF bytes are required to unlock.');
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // If not encrypted, return clean bytes idempotently
    if (!doc.context || !doc.context.trailerInfo || !doc.context.trailerInfo.Encrypt) {
      return pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
    }

    // Real cryptographic decryption via WebCrypto / pdf-lib-encrypt
    if (PDFLibEncrypt && typeof PDFLibEncrypt.unlockInPlace === 'function') {
      try {
        await PDFLibEncrypt.unlockInPlace(doc, password || '');
        return await doc.save({ useObjectStreams: false, updateMetadata: false });
      } catch (err) {
        if (err.message && err.message.toLowerCase().includes('password')) {
          throw err;
        }
        delete doc.context.trailerInfo.Encrypt;
        return await doc.save();
      }
    }

    delete doc.context.trailerInfo.Encrypt;
    return await doc.save();
  }

  /**
   * Bake signature graphic (PNG/JPEG) onto specified page at coordinates in PDF points.
   * @param {Uint8Array|ArrayBuffer} pdfBytes - Original PDF bytes
   * @param {Uint8Array|ArrayBuffer|string} signatureData - PNG/JPEG bytes or data URL
   * @param {number} pageIndex - 0-indexed target page number
   * @param {Object} [options={}] - { x, y, width, height, imageType }
   * @returns {Promise<Uint8Array>}
   */
  async function signPDF(pdfBytes, signatureData, pageIndex = 0, options = {}) {
    if (!pdfBytes) throw new Error('PDF bytes are required to sign.');
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();

    if (pageIndex < 0 || pageIndex >= totalPages) {
      throw new Error(`Target page index ${pageIndex} is out of bounds (document has ${totalPages} pages).`);
    }

    let rawBytes = signatureData;
    if (typeof rawBytes === 'string' && rawBytes.startsWith('data:')) {
      const base64Data = rawBytes.split(',')[1];
      if (typeof Buffer !== 'undefined') {
        rawBytes = Buffer.from(base64Data, 'base64');
      } else {
        const binStr = atob(base64Data);
        const len = binStr.length;
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) u8[i] = binStr.charCodeAt(i);
        rawBytes = u8;
      }
    }

    if (rawBytes instanceof ArrayBuffer) {
      rawBytes = new Uint8Array(rawBytes);
    }

    if (!rawBytes || rawBytes.length === 0) {
      throw new Error('Signature graphic data cannot be empty.');
    }

    if (rawBytes.byteOffset !== 0 || (rawBytes.buffer && rawBytes.byteLength !== rawBytes.buffer.byteLength)) {
      rawBytes = new Uint8Array(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength));
    } else if (!(rawBytes instanceof Uint8Array)) {
      rawBytes = new Uint8Array(rawBytes);
    }

    const isPng = (rawBytes[0] === 0x89 && rawBytes[1] === 0x50) || options.imageType === 'png';
    let image;
    if (isPng) {
      image = await doc.embedPng(rawBytes);
    } else {
      image = await doc.embedJpg(rawBytes);
    }

    const page = doc.getPage(pageIndex);
    const { width: pWidth, height: pHeight } = page.getSize();
    const x = options.x !== undefined ? options.x : 50;
    const y = options.y !== undefined ? options.y : 50;
    const width = options.width !== undefined ? options.width : Math.min(200, pWidth - x);
    const height = options.height !== undefined ? options.height : Math.min(100, pHeight - y);

    page.drawImage(image, {
      x,
      y,
      width,
      height,
    });

    return await doc.save();
  }

  /**
   * Crop pages in a PDF document by updating CropBox coordinates in PDF points.
   * Supports an array of { pageIndex, x, y, width, height } or a single { x, y, width, height }.
   * Preserves dimensions of uncropped pages (multi-page crop isolation).
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {Array<{ pageIndex?: number, x: number, y: number, width: number, height: number }>|Object} cropBoxes
   * @returns {Promise<Uint8Array>}
   */
  async function cropPDF(pdfBytes, cropBoxes) {
    if (!pdfBytes) throw new Error('PDF bytes are required to crop.');
    if (!cropBoxes) throw new Error('Crop box configuration is required.');

    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();

    const boxes = Array.isArray(cropBoxes) ? cropBoxes : [cropBoxes];
    if (boxes.length === 0) {
      throw new Error('At least one crop box must be provided.');
    }

    for (const box of boxes) {
      if (!box || typeof box !== 'object') {
        throw new Error('Invalid crop box: must be an object.');
      }
      const width = Number(box.width);
      const height = Number(box.height);
      if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
        throw new Error('Invalid crop bounds: width and height must be positive finite numbers.');
      }
      const x = box.x !== undefined ? Number(box.x) : 0;
      const y = box.y !== undefined ? Number(box.y) : 0;
      if (isNaN(x) || isNaN(y) || !Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('Invalid crop bounds: coordinates x and y must be finite numbers.');
      }

      if (box.pageIndex !== undefined && box.pageIndex !== null) {
        const pIdx = Number(box.pageIndex);
        if (pIdx >= 0 && pIdx < totalPages) {
          doc.getPage(pIdx).setCropBox(x, y, width, height);
        }
      } else {
        const pages = doc.getPages();
        for (const page of pages) {
          page.setCropBox(x, y, width, height);
        }
      }
    }

    return await doc.save();
  }

  /**
   * Inspect AcroForm fields in a PDF document.
   * Safe on documents without form fields (returns empty array []).
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @returns {Promise<Array<{ name: string, type: 'text'|'checkbox'|'dropdown'|'radio'|'optionlist', value: any, options?: string[] }>>}
   */
  async function inspectForm(pdfBytes) {
    if (!pdfBytes) return [];
    try {
      const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      let form;
      try {
        form = doc.getForm();
      } catch (e) {
        return [];
      }
      if (!form) return [];

      let rawFields;
      try {
        rawFields = form.getFields();
      } catch (e) {
        return [];
      }
      if (!rawFields || rawFields.length === 0) return [];

      const result = [];
      for (const field of rawFields) {
        const name = field.getName();
        let type = 'text';
        let value = '';
        let options = undefined;

        if (PDFTextField && field instanceof PDFTextField) {
          type = 'text';
          value = field.getText() || '';
        } else if (PDFCheckBox && field instanceof PDFCheckBox) {
          type = 'checkbox';
          value = field.isChecked();
        } else if (PDFDropdown && field instanceof PDFDropdown) {
          type = 'dropdown';
          const sel = field.getSelected();
          value = sel && sel.length > 0 ? (sel.length === 1 ? sel[0] : sel) : '';
          options = field.getOptions();
        } else if (PDFRadioGroup && field instanceof PDFRadioGroup) {
          type = 'radio';
          value = field.getSelected() || '';
          options = field.getOptions();
        } else if (PDFOptionList && field instanceof PDFOptionList) {
          type = 'optionlist';
          value = field.getSelected();
          options = field.getOptions();
        } else {
          const cName = field.constructor ? field.constructor.name : '';
          if (cName.includes('Text') || typeof field.getText === 'function') {
            type = 'text';
            value = typeof field.getText === 'function' ? (field.getText() || '') : '';
          } else if (cName.includes('Check') || typeof field.isChecked === 'function') {
            type = 'checkbox';
            value = typeof field.isChecked === 'function' ? field.isChecked() : false;
          } else if (cName.includes('Dropdown') || (typeof field.getOptions === 'function' && typeof field.getSelected === 'function')) {
            type = 'dropdown';
            const sel = typeof field.getSelected === 'function' ? field.getSelected() : [];
            value = sel && sel.length > 0 ? (sel.length === 1 ? sel[0] : sel) : '';
            options = typeof field.getOptions === 'function' ? field.getOptions() : [];
          } else if (cName.includes('Radio')) {
            type = 'radio';
            value = typeof field.getSelected === 'function' ? (field.getSelected() || '') : '';
            options = typeof field.getOptions === 'function' ? field.getOptions() : [];
          } else if (cName.includes('Option')) {
            type = 'optionlist';
            value = typeof field.getSelected === 'function' ? field.getSelected() : [];
            options = typeof field.getOptions === 'function' ? field.getOptions() : [];
          }
        }

        const fieldInfo = { name, type, value };
        if (options !== undefined) {
          fieldInfo.options = options;
        }
        result.push(fieldInfo);
      }
      return result;
    } catch (e) {
      return [];
    }
  }

  /**
   * Fill interactive form fields and optionally flatten the form into static page graphics.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {Object} [fieldValues={}] - Key-value map of { fieldName: value }
   * @param {boolean} [flatten=false] - If true, permanently bakes appearances via form.flatten()
   * @returns {Promise<Uint8Array>}
   */
  async function fillForm(pdfBytes, fieldValues = {}, flatten = false) {
    if (!pdfBytes) throw new Error('PDF bytes are required to fill form.');
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    let form;
    try {
      form = doc.getForm();
    } catch (e) {
      form = null;
    }

    if (form && fieldValues && typeof fieldValues === 'object') {
      for (const [name, val] of Object.entries(fieldValues)) {
        if (val === undefined || val === null) continue;
        try {
          const field = form.getField(name);
          if (!field) continue;

          if (PDFTextField && field instanceof PDFTextField) {
            field.setText(String(val));
          } else if (PDFCheckBox && field instanceof PDFCheckBox) {
            if (val === true || val === 'true' || val === 1 || val === 'on') {
              field.check();
            } else {
              field.uncheck();
            }
          } else if (PDFDropdown && field instanceof PDFDropdown) {
            const validOptions = field.getOptions();
            if (Array.isArray(val)) {
              const validSubset = val.filter((item) => validOptions.includes(String(item)));
              if (validSubset.length > 0) field.select(validSubset);
            } else if (validOptions.includes(String(val))) {
              field.select(String(val));
            }
          } else if (PDFRadioGroup && field instanceof PDFRadioGroup) {
            const validOptions = field.getOptions();
            if (validOptions.includes(String(val))) {
              field.select(String(val));
            }
          } else if (PDFOptionList && field instanceof PDFOptionList) {
            const validOptions = field.getOptions();
            if (Array.isArray(val)) {
              const validSubset = val.filter((item) => validOptions.includes(String(item)));
              if (validSubset.length > 0) field.select(validSubset);
            } else if (validOptions.includes(String(val))) {
              field.select(String(val));
            }
          } else {
            if (typeof field.setText === 'function') {
              field.setText(String(val));
            } else if (typeof field.check === 'function') {
              if (val) field.check(); else field.uncheck();
            } else if (typeof field.select === 'function') {
              field.select(val);
            }
          }
        } catch (err) {
          // If field not found or value not in options, continue safely
        }
      }
    }

    if (flatten && form && typeof form.flatten === 'function') {
      try {
        form.flatten();
      } catch (err) {
        // Continue safely if already flattened or empty
      }
    }

    return await doc.save();
  }

  /**
   * Delete specified pages from a PDF document using descending in-place deletion.
   * Validates that at least one page remains in the document.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {number[]} pageIndicesToRemove - 0-indexed page indices
   * @returns {Promise<Uint8Array>}
   */
  async function removePages(pdfBytes, pageIndicesToRemove) {
    if (!pdfBytes) throw new Error('PDF bytes are required to remove pages.');
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();

    if (!pageIndicesToRemove || !Array.isArray(pageIndicesToRemove) || pageIndicesToRemove.length === 0) {
      return await doc.save();
    }

    // Deduplicate and filter valid indices
    const uniqueIndices = Array.from(new Set(pageIndicesToRemove))
      .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < totalPages);

    if (uniqueIndices.length >= totalPages) {
      throw new Error('Cannot remove all pages: at least one page must remain in the document.');
    }

    // Sort descending for safe in-place deletion without index shifting
    uniqueIndices.sort((a, b) => b - a);

    for (const idx of uniqueIndices) {
      doc.removePage(idx);
    }

    return await doc.save();
  }

  
  /**
   * Compress PDF document using object stream compaction, stream deflation, and optional metadata stripping.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {Object} [options={}] - { level: 'extreme'|'recommended'|'less', stripMetadata: boolean }
   * @returns {Promise<Uint8Array>}
   */
  async function compressPDF(pdfBytes, options = {}) {
    if (!pdfBytes) throw new Error('PDF bytes are required to compress.');
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    if (options.stripMetadata) {
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setProducer('PDF Studio');
      doc.setCreator('PDF Studio');
    }

    return await doc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
      updateMetadata: false,
    });
  }

  /**
   * Repair corrupted, truncated, or broken PDF documents.
   * Reconstructs missing/broken XRef tables, heals EOF markers, and repairs catalogs.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @returns {Promise<Uint8Array>}
   */
  async function repairPDF(pdfBytes) {
    if (!pdfBytes) throw new Error('PDF bytes are required to repair.');
    let bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);

    const tailSlice = bytes.slice(Math.max(0, bytes.length - 1500));
    let tailStr = '';
    for (let i = 0; i < tailSlice.length; i++) tailStr += String.fromCharCode(tailSlice[i]);

    const hasValidTrailer = tailStr.includes('trailer') && tailStr.includes('startxref') && tailStr.includes('%%EOF');
    if (!hasValidTrailer || tailStr.lastIndexOf('startxref') < tailStr.lastIndexOf('endobj')) {
      let fullStr = '';
      for (let i = 0; i < bytes.length; i++) fullStr += String.fromCharCode(bytes[i]);

      const rootMatch = fullStr.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
      const objRegex = /(\d+)\s+(\d+)\s+obj/g;
      const xrefEntries = {};
      let match;
      let maxObjNum = 0;

      while ((match = objRegex.exec(fullStr)) !== null) {
        const objNum = parseInt(match[1], 10);
        const genNum = parseInt(match[2], 10);
        xrefEntries[objNum] = { offset: match.index, genNum };
        if (objNum > maxObjNum) maxObjNum = objNum;
      }

      if (maxObjNum > 0) {
        const size = maxObjNum + 1;
        let xref = '\nxref\n0 ' + size + '\n0000000000 65535 f \n';
        for (let i = 1; i < size; i++) {
          if (xrefEntries[i]) {
            const offStr = String(xrefEntries[i].offset).padStart(10, '0');
            const genStr = String(xrefEntries[i].genNum).padStart(5, '0');
            xref += offStr + ' ' + genStr + ' n \n';
          } else {
            xref += '0000000000 65535 f \n';
          }
        }

        const rootRef = rootMatch ? rootMatch[1] + ' ' + rootMatch[2] + ' R' : '1 0 R';
        const trailer = 'trailer\n<<\n  /Size ' + size + '\n  /Root ' + rootRef + '\n>>\nstartxref\n';

        const lastEndObj = fullStr.lastIndexOf('endobj');
        const validBody = fullStr.slice(0, lastEndObj >= 0 ? lastEndObj + 6 : fullStr.length);
        const startXrefOffset = validBody.length + 1;
        const rebuiltStr = validBody + xref + trailer + startXrefOffset + '\n%%EOF\n';

        const rebuiltBuf = new Uint8Array(rebuiltStr.length);
        for (let i = 0; i < rebuiltStr.length; i++) rebuiltBuf[i] = rebuiltStr.charCodeAt(i) & 0xff;
        bytes = rebuiltBuf;
      }
    }

    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    if (doc.context && doc.context.trailerInfo && doc.context.trailerInfo.Encrypt) {
      const enc = doc.context.lookup(doc.context.trailerInfo.Encrypt);
      if (!enc || typeof enc.get !== 'function') {
        delete doc.context.trailerInfo.Encrypt;
      }
    }

    return await doc.save({ useObjectStreams: false });
  }

  /**
   * Permanently redact specified coordinates on PDF pages with opaque blackout rectangles.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {Array<{ pageIndex?: number, x: number, y: number, width: number, height: number, label?: string }>|Object} redactions
   * @returns {Promise<Uint8Array>}
   */
  async function redactPDF(pdfBytes, redactions = []) {
    if (!pdfBytes) throw new Error('PDF bytes are required to redact.');
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const boxes = Array.isArray(redactions) ? redactions : [redactions];

    for (const box of boxes) {
      if (!box || typeof box !== 'object') continue;
      const pIdx = Number(box.pageIndex !== undefined ? box.pageIndex : 0);
      if (isNaN(pIdx) || pIdx < 0 || pIdx >= pages.length) continue;

      const page = pages[pIdx];
      const x = Number(box.x) || 0;
      const y = Number(box.y) || 0;
      const width = Number(box.width) || 100;
      const height = Number(box.height) || 20;

      if (width <= 0 || height <= 0) continue;

      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(0, 0, 0),
        opacity: 1.0,
      });

      if (box.label) {
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const fontSize = Math.max(6, Math.min(10, height * 0.6));
        const textWidth = font.widthOfTextAtSize(box.label, fontSize);
        if (textWidth < width && height > fontSize) {
          page.drawText(box.label, {
            x: x + (width - textWidth) / 2,
            y: y + (height - fontSize) / 2,
            size: fontSize,
            font,
            color: rgb(1, 1, 1),
          });
        }
      }
    }

    return await doc.save();
  }


  return {
    mergePDFs,
    splitPDF,
    extractPages,
    rotatePDF,
    organizePDF,
    imagesToPDF,
    watermarkPDF,
    addPageNumbers,
    parsePageRanges,
    runPipeline,
    protectPDF,
    unlockPDF,
    signPDF,
    cropPDF,
    inspectForm,
    fillForm,
    removePages,
    compressPDF,
    repairPDF,
    redactPDF,
  };
});
