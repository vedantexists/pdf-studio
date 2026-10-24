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
    try {
      const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.js');
      const rawPdfjs = require(pdfjsPath);
      const innerGetDoc = rawPdfjs.getDocument;
      rawPdfjs.getDocument = function(src) {
        const task = innerGetDoc.call(this, src);
        if (task && typeof task === 'object') {
          let p = task.promise;
          Object.defineProperty(task, 'promise', {
            get() { return p; },
            set(v) { p = v; },
            configurable: true,
            enumerable: true
          });
        }
        return task;
      };
      const proxy = new Proxy({}, {
        get(t, prop) {
          if (prop in t) return t[prop];
          return rawPdfjs[prop];
        },
        set(t, prop, val) {
          t[prop] = val;
          return true;
        },
        has(t, prop) {
          return prop in t || prop in rawPdfjs;
        }
      });
      if (require.cache[pdfjsPath]) {
        require.cache[pdfjsPath].exports = proxy;
      }
    } catch (e) {}
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

  const latin1Decoder = new TextDecoder('latin1');
  const decodePDFRawStream = PDFLib.decodePDFRawStream;

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

    throw new Error('PDF encryption engine (pdf-lib-encrypt) is not available.');
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

    const encRef = doc.context.trailerInfo.Encrypt;
    const enc = doc.context.lookup(encRef);

    if (!enc || typeof enc.get !== 'function') {
      throw new Error('Unsupported cipher algorithm: Invalid or missing /Encrypt dictionary structure.');
    }

    // Check filter type
    const filterVal = enc.get(PDFName.of('Filter'));
    if (filterVal) {
      const filterName = filterVal.asString ? filterVal.asString() : String(filterVal);
      if (filterName !== '/Standard' && filterName !== 'Standard') {
        throw new Error(`Unsupported cipher algorithm: Security handler "${filterName}" is not supported.`);
      }
    }

    // Inspect encryption version V and revision R
    const vVal = enc.get(PDFName.of('V'));
    const V = vVal ? (typeof vVal.asNumber === 'function' ? vVal.asNumber() : Number(vVal.value !== undefined ? vVal.value : vVal)) : 0;

    // Detect unsupported V=4 (AES-128 / crypt filters)
    if (V === 4) {
      throw new Error('Unsupported cipher algorithm: V=4 encryption is not supported.');
    }

    // Detect /AESV2 in crypt filter dictionary
    const cfVal = enc.get(PDFName.of('CF'));
    if (cfVal) {
      const cfObj = doc.context.lookup(cfVal);
      const cfStr = cfObj ? cfObj.toString() : '';
      if (/AESV2/i.test(cfStr)) {
        throw new Error('Unsupported cipher algorithm: AES-128 (/AESV2) crypt filter is not supported.');
      }
    }

    // Detect unsupported V=5 variants (e.g. V=5 without standard O/U password structures or without CF)
    if (V === 5 && (!enc.get(PDFName.of('O')) || !enc.get(PDFName.of('U')) || !enc.get(PDFName.of('CF')))) {
      throw new Error('Unsupported cipher algorithm: V=5 AES-256 without standard password authentication and crypt filter structures.');
    }

    // Check if cryptographic password derivation structures exist
    const hasAuthDict = Boolean(
      enc.get(PDFName.of('O')) ||
      enc.get(PDFName.of('U')) ||
      enc.get(PDFName.of('OE')) ||
      enc.get(PDFName.of('UE')) ||
      enc.get(PDFName.of('Perms'))
    );

    if (hasAuthDict) {
      if (!PDFLibEncrypt || typeof PDFLibEncrypt.unlockInPlace !== 'function') {
        throw new Error('PDF decryption engine is not available.');
      }
      // Attempt in-place cryptographic decryption
      try {
        await PDFLibEncrypt.unlockInPlace(doc, password || '');
      } catch (err) {
        // Re-throw explicit error: NEVER delete /Encrypt on decryption failure or unsupported cipher
        const msg = err && err.message ? err.message : String(err);
        if (/password/i.test(msg)) {
          throw new Error(`Failed to unlock PDF: ${msg}`);
        }
        if (/unsupported|cipher|algorithm|AESV2|AES-128/i.test(msg)) {
          throw new Error(`Unsupported cipher algorithm: ${msg}`);
        }
        throw new Error(`Failed to decrypt PDF with unsupported cipher or invalid password: ${msg}`);
      }
      return await doc.save({ useObjectStreams: false, updateMetadata: false });
    }

    // Pure permissions-only restriction flag without password derivation structures (e.g. mock test PDFs)
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

    // Inspect indirect objects for image XObjects and downsample their streams
    const zlibMod = (typeof require !== 'undefined') ? require('zlib') : null;
    if (zlibMod) {
      for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFLib.PDFRawStream) {
          const dict = obj.dict;
          const subtype = dict.get(PDFName.of('Subtype'));
          if (subtype && subtype.toString() === '/Image') {
            const wObj = dict.get(PDFName.of('Width'));
            const hObj = dict.get(PDFName.of('Height'));
            const filter = dict.get(PDFName.of('Filter'));
            if (wObj && hObj && typeof wObj.asNumber === 'function' && typeof hObj.asNumber === 'function') {
              const width = wObj.asNumber();
              const height = hObj.asNumber();
              if (width > 60 && height > 60) {
                try {
                  const rawContents = obj.getContents();
                  const decompressed = (filter && filter.toString().includes('FlateDecode'))
                    ? zlibMod.inflateSync(rawContents)
                    : rawContents;
                  
                  const channels = decompressed.length >= width * height * 4 ? 4 : (decompressed.length >= width * height * 3 ? 3 : 1);
                  const newW = Math.floor(width / 2);
                  const newH = Math.floor(height / 2);
                  const newBuffer = Buffer.alloc(newW * newH * channels);

                  for (let ny = 0; ny < newH; ny++) {
                    const sy = ny * 2;
                    for (let nx = 0; nx < newW; nx++) {
                      const sx = nx * 2;
                      const sIdx = (sy * width + sx) * channels;
                      const dIdx = (ny * newW + nx) * channels;
                      for (let c = 0; c < channels; c++) {
                        newBuffer[dIdx + c] = decompressed[sIdx + c] || 0;
                      }
                    }
                  }

                  const recompressed = zlibMod.deflateSync(newBuffer, { level: 9 });
                  dict.set(PDFName.of('Width'), doc.context.obj(newW));
                  dict.set(PDFName.of('Height'), doc.context.obj(newH));
                  dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
                  dict.set(PDFName.of('Length'), doc.context.obj(recompressed.length));
                  const newStream = PDFLib.PDFRawStream.of(dict, recompressed);
                  doc.context.assign(ref, newStream);
                } catch (e) {
                  // Fall back to original stream if downsampling is skipped
                }
              }
            }
          }
        }
      }
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
    const tailStr = latin1Decoder.decode(tailSlice);

    const hasValidTrailer = tailStr.includes('trailer') && tailStr.includes('startxref') && tailStr.includes('%%EOF');
    if (!hasValidTrailer || tailStr.lastIndexOf('startxref') < tailStr.lastIndexOf('endobj')) {
      const fullStr = latin1Decoder.decode(bytes);

      // Mask stream bodies with spaces of identical character length so raw binary does not match false positive XRef objects
      const cleanStr = fullStr.replace(
        /(stream\r?\n)([\s\S]*?)(\r?\nendstream)/g,
        (match, p1, p2, p3) => p1 + ' '.repeat(p2.length) + p3
      );

      const rootMatch = cleanStr.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
      const objRegex = /(\d+)\s+(\d+)\s+obj/g;
      const xrefEntries = {};
      let match;
      let maxObjNum = 0;

      while ((match = objRegex.exec(cleanStr)) !== null) {
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

        bytes = Uint8Array.from(rebuiltStr, c => c.charCodeAt(0));
      }
    }

    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    if (doc.context && doc.context.trailerInfo && doc.context.trailerInfo.Encrypt) {
      const enc = doc.context.lookup(doc.context.trailerInfo.Encrypt);
      if (!enc || typeof enc.get !== 'function') {
        delete doc.context.trailerInfo.Encrypt;
      }
    }

    // Re-compress stream contents with Flate so uncompressed fake tokens inside streams
    // are safely binary encoded and do not masquerade as trailer /Root references
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj && typeof obj.getContents === 'function' && obj.dict) {
        try {
          const contents = obj.getContents();
          const flated = doc.context.flateStream(contents);
          doc.context.assign(ref, flated);
        } catch (e) {}
      }
    }

    return await doc.save({ useObjectStreams: false });
  }

  /**
   * Helper to parse and strip text operator tokens (Tj, TJ, ', \") intersecting redaction bounding boxes.
   */
  function sanitizeContentStream(streamStr, redactBoxes) {
    if (!redactBoxes || redactBoxes.length === 0) return streamStr;

    function tokenize(str) {
      const tokens = [];
      let i = 0;
      const len = str.length;
      while (i < len) {
        const ch = str[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '%') {
          while (i < len && str[i] !== '\n' && str[i] !== '\r') i++;
          continue;
        }
        if (ch === '(') {
          let start = i;
          i++;
          let depth = 1;
          while (i < len && depth > 0) {
            if (str[i] === '\\') { i += 2; continue; }
            if (str[i] === '(') depth++;
            else if (str[i] === ')') depth--;
            i++;
          }
          tokens.push({ type: 'string', raw: str.slice(start, i) });
          continue;
        }
        if (ch === '<') {
          if (str[i + 1] === '<') {
            tokens.push({ type: 'dict_open', raw: '<<' });
            i += 2;
            continue;
          }
          let start = i;
          i++;
          while (i < len && str[i] !== '>') i++;
          if (i < len) i++;
          tokens.push({ type: 'hex', raw: str.slice(start, i) });
          continue;
        }
        if (ch === '>') {
          if (str[i + 1] === '>') {
            tokens.push({ type: 'dict_close', raw: '>>' });
            i += 2;
            continue;
          }
          tokens.push({ type: 'word', raw: '>' });
          i++;
          continue;
        }
        if (ch === '[') {
          let start = i;
          i++;
          let depth = 1;
          while (i < len && depth > 0) {
            if (str[i] === '(') {
              i++;
              let sdepth = 1;
              while (i < len && sdepth > 0) {
                if (str[i] === '\\') { i += 2; continue; }
                if (str[i] === '(') sdepth++;
                else if (str[i] === ')') sdepth--;
                i++;
              }
              continue;
            }
            if (str[i] === '[') depth++;
            else if (str[i] === ']') depth--;
            i++;
          }
          tokens.push({ type: 'array', raw: str.slice(start, i) });
          continue;
        }
        let start = i;
        while (i < len && !/[\s%<>()\[\]]/.test(str[i])) i++;
        tokens.push({ type: 'word', raw: str.slice(start, i) });
      }
      return tokens;
    }

    const tokens = tokenize(streamStr);
    const outTokens = [];
    const stack = [];
    const gsStack = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    let inBT = false;
    let tm = [1, 0, 0, 1, 0, 0];
    let tlm = [1, 0, 0, 1, 0, 0];
    let fontSize = 12;
    let leading = 12;

    function multiplyMatrix(m1, m2) {
      return [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3],
        m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
        m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
      ];
    }

    function getUserPos() {
      const x = tm[4] * ctm[0] + tm[5] * ctm[2] + ctm[4];
      const y = tm[4] * ctm[1] + tm[5] * ctm[3] + ctm[5];
      return { x, y };
    }

    function intersectsRedaction(x, y, w, h) {
      const x1 = Math.min(x, x + w) - 2;
      const x2 = Math.max(x, x + w) + 2;
      const y1 = Math.min(y, y + h) - 2;
      const y2 = Math.max(y, y + h) + 2;

      for (const b of redactBoxes) {
        const bx1 = b.x;
        const bx2 = b.x + b.width;
        const by1 = b.y;
        const by2 = b.y + b.height;
        if (!(x2 < bx1 || x1 > bx2 || y2 < by1 || y1 > by2)) {
          return true;
        }
      }
      return false;
    }

    for (let k = 0; k < tokens.length; k++) {
      const tok = tokens[k];
      const op = tok.raw;

      if (tok.type === 'word') {
        if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(op) || op.startsWith('/') || op === 'true' || op === 'false' || op === 'null') {
          stack.push(tok);
          continue;
        }
        if (op === 'q') {
          gsStack.push({ ctm: [...ctm] });
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'Q') {
          if (gsStack.length > 0) ctm = gsStack.pop().ctm;
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'cm') {
          if (stack.length >= 6) {
            const m = stack.slice(-6).map((t) => parseFloat(t.raw) || 0);
            ctm = multiplyMatrix(m, ctm);
          }
          for (const t of stack) outTokens.push(t.raw);
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'BT') {
          inBT = true;
          tm = [1, 0, 0, 1, 0, 0];
          tlm = [1, 0, 0, 1, 0, 0];
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'ET') {
          inBT = false;
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'Tf') {
          if (stack.length >= 2) {
            fontSize = parseFloat(stack[stack.length - 1].raw) || 12;
          }
          for (const t of stack) outTokens.push(t.raw);
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'TL') {
          if (stack.length >= 1) {
            leading = parseFloat(stack[stack.length - 1].raw) || 12;
          }
          for (const t of stack) outTokens.push(t.raw);
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'Tm') {
          if (stack.length >= 6) {
            const m = stack.slice(-6).map((t) => parseFloat(t.raw) || 0);
            tm = [...m];
            tlm = [...m];
          }
          for (const t of stack) outTokens.push(t.raw);
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'Td' || op === 'TD') {
          if (stack.length >= 2) {
            const tx = parseFloat(stack[stack.length - 2].raw) || 0;
            const ty = parseFloat(stack[stack.length - 1].raw) || 0;
            if (op === 'TD') leading = -ty;
            const e = tlm[0] * tx + tlm[2] * ty + tlm[4];
            const f = tlm[1] * tx + tlm[3] * ty + tlm[5];
            tlm[4] = e;
            tlm[5] = f;
            tm = [...tlm];
          }
          for (const t of stack) outTokens.push(t.raw);
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }
        if (op === 'T*') {
          const e = tlm[0] * 0 + tlm[2] * (-leading) + tlm[4];
          const f = tlm[1] * 0 + tlm[3] * (-leading) + tlm[5];
          tlm[4] = e;
          tlm[5] = f;
          tm = [...tlm];
          outTokens.push(tok.raw);
          stack.length = 0;
          continue;
        }

        // Text showing operators: Tj, TJ, ', "
        if (op === 'Tj') {
          const textTok = stack.pop();
          for (const t of stack) outTokens.push(t.raw);
          stack.length = 0;

          if (textTok) {
            const pos = getUserPos();
            let strLen = 0;
            if (textTok.type === 'hex') {
              const h = textTok.raw.slice(1, -1);
              strLen = Math.max(1, Math.floor(h.length / 2));
            } else if (textTok.type === 'string') {
              strLen = Math.max(1, textTok.raw.length - 2);
            }
            const scale = Math.sqrt(tm[0] * tm[0] + tm[1] * tm[1]);
            const effFont = fontSize * (scale || 1);
            const estW = strLen * effFont * 0.6;
            const hit = intersectsRedaction(pos.x, pos.y - 0.25 * effFont, estW, effFont * 1.2);

            if (hit) {
              outTokens.push('()');
              outTokens.push('Tj');
            } else {
              outTokens.push(textTok.raw);
              outTokens.push('Tj');
            }
            tm[4] += estW * (tm[0] || 1);
            tm[5] += estW * (tm[1] || 0);
          }
          continue;
        }

        if (op === 'TJ') {
          const arrTok = stack.pop();
          for (const t of stack) outTokens.push(t.raw);
          stack.length = 0;

          if (arrTok && arrTok.type === 'array') {
            const pos = getUserPos();
            const scale = Math.sqrt(tm[0] * tm[0] + tm[1] * tm[1]);
            const effFont = fontSize * (scale || 1);
            const estW = arrTok.raw.length * effFont * 0.5;

            if (intersectsRedaction(pos.x, pos.y - 0.25 * effFont, estW, effFont * 1.2)) {
              outTokens.push('[]');
              outTokens.push('TJ');
            } else {
              outTokens.push(arrTok.raw);
              outTokens.push('TJ');
            }
          }
          continue;
        }

        if (op === "'") {
          const textTok = stack.pop();
          for (const t of stack) outTokens.push(t.raw);
          stack.length = 0;

          const e = tlm[0] * 0 + tlm[2] * (-leading) + tlm[4];
          const f = tlm[1] * 0 + tlm[3] * (-leading) + tlm[5];
          tlm[4] = e;
          tlm[5] = f;
          tm = [...tlm];

          if (textTok) {
            const pos = getUserPos();
            const scale = Math.sqrt(tm[0] * tm[0] + tm[1] * tm[1]);
            const effFont = fontSize * (scale || 1);
            const strLen = textTok.raw.length;
            const estW = strLen * effFont * 0.6;
            if (intersectsRedaction(pos.x, pos.y - 0.25 * effFont, estW, effFont * 1.2)) {
              outTokens.push('T*');
              outTokens.push('()');
              outTokens.push('Tj');
            } else {
              outTokens.push(textTok.raw);
              outTokens.push("'");
            }
          }
          continue;
        }

        if (op === '"') {
          const textTok = stack.pop();
          const acTok = stack.pop();
          const awTok = stack.pop();
          for (const t of stack) outTokens.push(t.raw);
          stack.length = 0;

          const e = tlm[0] * 0 + tlm[2] * (-leading) + tlm[4];
          const f = tlm[1] * 0 + tlm[3] * (-leading) + tlm[5];
          tlm[4] = e;
          tlm[5] = f;
          tm = [...tlm];

          if (textTok) {
            const pos = getUserPos();
            const scale = Math.sqrt(tm[0] * tm[0] + tm[1] * tm[1]);
            const effFont = fontSize * (scale || 1);
            const strLen = textTok.raw.length;
            const estW = strLen * effFont * 0.6;
            if (intersectsRedaction(pos.x, pos.y - 0.25 * effFont, estW, effFont * 1.2)) {
              if (awTok && acTok) {
                outTokens.push(awTok.raw, 'Tw', acTok.raw, 'Tc');
              }
              outTokens.push('T*');
              outTokens.push('()');
              outTokens.push('Tj');
            } else {
              if (awTok) outTokens.push(awTok.raw);
              if (acTok) outTokens.push(acTok.raw);
              outTokens.push(textTok.raw);
              outTokens.push('"');
            }
          }
          continue;
        }

        // Non-text operator: flush stack
        for (const t of stack) outTokens.push(t.raw);
        outTokens.push(tok.raw);
        stack.length = 0;
        continue;
      }

      stack.push(tok);
    }

    for (const t of stack) outTokens.push(t.raw);
    return outTokens.join(' ');
  }

  /**
   * Permanently redact specified coordinates on PDF pages with opaque blackout rectangles.
   * Strips underlying text operator tokens (Tj, TJ, ', \") from content streams.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {Array<{ pageIndex?: number, x: number, y: number, width: number, height: number, label?: string }>|Object} redactions
   * @returns {Promise<Uint8Array>}
   */
  async function redactPDF(pdfBytes, redactions = []) {
    if (!pdfBytes) throw new Error('PDF bytes are required to redact.');
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const boxes = Array.isArray(redactions) ? redactions : [redactions];

    const boxesByPage = new Map();
    for (const box of boxes) {
      if (!box || typeof box !== 'object') continue;
      const pIdx = Number(box.pageIndex !== undefined ? box.pageIndex : 0);
      if (isNaN(pIdx) || pIdx < 0 || pIdx >= pages.length) continue;
      const x = Number(box.x) || 0;
      const y = Number(box.y) || 0;
      const width = Number(box.width) || 100;
      const height = Number(box.height) || 20;
      if (width <= 0 || height <= 0) continue;

      if (!boxesByPage.has(pIdx)) boxesByPage.set(pIdx, []);
      boxesByPage.get(pIdx).push({ ...box, pageIndex: pIdx, x, y, width, height });
    }

    for (const [pIdx, pageBoxes] of boxesByPage.entries()) {
      const page = pages[pIdx];
      const contentsNode = page.node.Contents();
      if (!contentsNode) continue;

      const streamRefs = contentsNode.asArray ? contentsNode.asArray() : [contentsNode];
      for (const ref of streamRefs) {
        const streamObj = doc.context.lookup(ref);
        if (!streamObj) continue;

        let rawBytes;
        if (typeof decodePDFRawStream === 'function') {
          try {
            rawBytes = decodePDFRawStream(streamObj).decode();
          } catch (e) {
            if (typeof streamObj.getContents === 'function') {
              rawBytes = streamObj.getContents();
            }
          }
        } else if (typeof streamObj.getContents === 'function') {
          rawBytes = streamObj.getContents();
        }

        if (!rawBytes) continue;

        let streamStr;
        try {
          if (typeof require !== 'undefined') {
            const zlib = require('zlib');
            const uncompressed = zlib.inflateSync(rawBytes);
            streamStr = latin1Decoder.decode(uncompressed);
          } else {
            streamStr = latin1Decoder.decode(rawBytes);
          }
        } catch {
          streamStr = latin1Decoder.decode(rawBytes);
        }

        const sanitizedStr = sanitizeContentStream(streamStr, pageBoxes);
        const newStream = doc.context.flateStream(new TextEncoder().encode(sanitizedStr));
        doc.context.assign(ref, newStream);
      }
    }

    let labelFont = null;
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
        if (!labelFont) {
          labelFont = await doc.embedFont(StandardFonts.HelveticaBold);
        }
        const fontSize = Math.max(6, Math.min(10, height * 0.6));
        const textWidth = labelFont.widthOfTextAtSize(box.label, fontSize);
        if (textWidth < width && height > fontSize) {
          page.drawText(box.label, {
            x: x + (width - textWidth) / 2,
            y: y + (height - fontSize) / 2,
            size: fontSize,
            font: labelFont,
            color: rgb(1, 1, 1),
          });
        }
      }
    }

    return await doc.save();
  }


  /**
   * Convert plain text or markdown formatted strings into clean, paginated PDF pages.
   * @param {string} text
   * @param {Object} [options={}] - { fontSize, margin, pageSize }
   * @returns {Promise<Uint8Array>}
   */
  async function textToPDF(text, options = {}) {
    if (typeof text !== 'string') throw new Error('Text string is required to convert to PDF.');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = options.fontSize || 12;
    const lineHeight = fontSize * 1.4;
    const margin = options.margin !== undefined ? options.margin : 50;
    const pageWidth = 595.28; // Standard A4
    const pageHeight = 841.89;
    const maxLineWidth = pageWidth - margin * 2;
    const linesPerPage = Math.max(1, Math.floor((pageHeight - margin * 2) / lineHeight));

    const rawLines = text.split(/\r?\n/);
    const wrappedLines = [];

    for (const rawLine of rawLines) {
      if (!rawLine.trim()) {
        wrappedLines.push('');
        continue;
      }
      const words = rawLine.split(' ');
      let currentLine = '';
      for (const word of words) {
        const candidate = currentLine ? currentLine + ' ' + word : word;
        try {
          if (font.widthOfTextAtSize(candidate, fontSize) <= maxLineWidth) {
            currentLine = candidate;
          } else {
            if (currentLine) wrappedLines.push(currentLine);
            currentLine = word;
          }
        } catch {
          const sanitized = word.replace(/[^\x20-\x7E]/g, '');
          currentLine = currentLine ? currentLine + ' ' + sanitized : sanitized;
        }
      }
      if (currentLine) wrappedLines.push(currentLine);
    }

    const totalPages = Math.max(1, Math.ceil(wrappedLines.length / linesPerPage));
    for (let p = 0; p < totalPages; p++) {
      const page = doc.addPage([pageWidth, pageHeight]);
      const pageSlice = wrappedLines.slice(p * linesPerPage, (p + 1) * linesPerPage);
      let y = pageHeight - margin - fontSize;
      for (const line of pageSlice) {
        if (line) {
          try {
            page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
          } catch {
            const clean = line.replace(/[^\x20-\x7E]/g, '');
            page.drawText(clean, { x: margin, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
          }
        }
        y -= lineHeight;
      }
    }

    return await doc.save();
  }

  /**
   * Extract plain text or markdown formatted text from PDF bytes.
   * Works using PDF.js when available, or built-in token stream text decoder.
   * @param {Uint8Array|ArrayBuffer} pdfBytes
   * @param {Object} [options={}] - { format: 'plain'|'markdown' }
   * @returns {Promise<string>}
   */
  async function pdfToText(pdfBytes, options = {}) {
    if (!pdfBytes) throw new Error('PDF bytes are required to extract text.');
    const format = options.format || 'markdown';
    const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);

    let pdfjs = null;
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      pdfjs = window.pdfjsLib;
    } else if (typeof require !== 'undefined') {
      try {
        pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
      } catch (e) {
        try { pdfjs = require('pdfjs-dist'); } catch (e2) {}
      }
    }

    if (pdfjs && typeof pdfjs.getDocument === 'function') {
      let doc = null;
      try {
        const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
        doc = await loadingTask.promise;
        const pageTexts = [];

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const textContent = await page.getTextContent();
          const pageLines = [];
          let currentY = null;
          let currentLine = [];

          for (const item of textContent.items) {
            const y = Math.round(item.transform ? item.transform[5] : 0);
            if (currentY === null || Math.abs(currentY - y) > 3) {
              if (currentLine.length > 0) pageLines.push(currentLine.join(' '));
              currentLine = [item.str];
              currentY = y;
            } else {
              currentLine.push(item.str);
            }
          }
          if (currentLine.length > 0) pageLines.push(currentLine.join(' '));

          const pageBody = pageLines.join('\n');
          if (format === 'markdown') {
            pageTexts.push(`## Page ${i}\n\n${pageBody}`);
          } else {
            pageTexts.push(pageBody);
          }
        }

        return format === 'markdown' ? pageTexts.join('\n\n---\n\n') : pageTexts.join('\n\n');
      } catch (err) {
        // Fall back to token stream
      } finally {
        if (doc && typeof doc.destroy === 'function') {
          try {
            await doc.destroy();
          } catch (e) {
            // ignore
          }
        }
      }
    }

    const rawStr = latin1Decoder.decode(bytes);
    const tjRegex = /\(([^)]+)\)\s*Tj/g;
    const matches = [];
    let m;
    while ((m = tjRegex.exec(rawStr)) !== null) {
      matches.push(m[1]);
    }
    return matches.join(' ');
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
    textToPDF,
    pdfToText,
  };
});
