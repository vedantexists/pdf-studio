# Original User Request

## 2026-10-24T08:54:57Z

Implement Phase 1 (Security & Editing suite) of the 100% client-side iLovePDF clone in `pdftool`, adding Sign PDF, Protect/Unlock PDF, Crop PDF, PDF Forms, dedicated Remove/Extract pages, and the top mega-menu navigation while preserving zero server uploads and lazy senior developer principles.

Working directory: c:\Users\vedan\OneDrive\Desktop\projects\pdftool
Integrity mode: development

## Requirements

### R1. Document Security Suite (Sign, Unlock, Protect)
- Implement **Sign PDF**: modal supporting Draw signature (canvas), Type signature, and Upload signature image, with drag-and-drop placement on any page, baked into the document.
- Implement **Unlock PDF**: decrypt password-protected PDFs or strip standard permission restrictions using in-memory PDF manipulation.
- Implement **Protect PDF**: password encryption for output PDFs.

### R2. Document Editing & Forms (Crop, PDF Forms)
- Implement **Crop PDF**: visual crop bounding box on page preview that updates `page.setCropBox(x, y, width, height)`.
- Implement **PDF Forms**: inspect form fields using `doc.getForm()`, render accessible interactive HTML form fields to fill, and support both saving filled fields and flattening (`form.flatten()`).
- Add dedicated **Remove Pages** and **Extract Pages** tool entry points.

### R3. Mega-Menu Header & Modular Architecture
- Update the application header to include the dropdown navigation bar matching iLovePDF categories (`Organize`, `Optimize`, `Convert To`, `Convert From`, `Edit`, `Security`).
- Ensure all new tools follow the established patterns in `pdf_core.js`, `app.js`, and `style.css` without breaking existing tools (Merge, Split, Rotate, Organize, Rotate, Watermark, Page Numbers, PDF to JPG, JPG to PDF).

## Acceptance Criteria

### Automated Self-Checks & Core Operations
- [ ] Programmatic test suite in `test/test_phase1.js` (or integrated into `npm test`) verifies all new core operations pass (unlock, protect, crop, form fill/flatten, remove/extract) with zero failures.
- [ ] Existing `test/test_core.js` continues to pass 100% cleanly without regressions.

### Client-Side Execution & Privacy
- [ ] All PDF modifications execute 100% in-browser / in-memory with zero network uploads.
- [ ] Detached buffer protections (`.slice()`) are preserved across all tools.


## 2026-10-24T12:57:08Z

Implement the audit remediation and expand the 30-tool iLovePDF suite in PDF Studio with 100% client-side in-browser privacy and zero server uploads.

Working directory: c:\Users\vedan\OneDrive\Desktop\projects\pdftool
Integrity mode: development

## Requirements

### R1. Audit Remediation & Core Hardening
- Strip actual text stream operators (`Tj`, `TJ`, `\'`, `\"`) in `redactPDF()` when stamping blackout boxes so underlying text cannot be selected or copied.
- Wire all 7 dormant tools (`compress`, `repair`, `redact`, `compare`, `scan-to-pdf`, `text-to-pdf`, `pdf-to-text`) into `TOOLS` registry in `app.js` and implement their execution branches in `executeBtn`.
- Prevent silent document corruption in `unlockPDF()` by never stripping `/Encrypt` when decryption fails or when ciphers are unsupported.
- Replace binary single-character string concatenation loops with `new TextDecoder('latin1').decode(bytes)` in `pdf_core.js`.
- Fix `repairPDF()` XRef scanner to ignore byte contents between `stream` and `endstream` to prevent false positive object matches.
- Call `.destroy()` on active PDF.js document instances before switching files or tools to fix memory leaks.
- Update page selection in `remove-pages` and `extract-pages` directly in the DOM without re-rendering all page thumbnails.
- Delete unused MD5 and padding code (~140 lines) and broken manual encryption fallback in `pdf_core.js`, and remove `pdf-lib-encrypt` from `package.json`.

### R2. Core Optimization & Document Security Tools
- Implement true in-browser `compressPDF()` with offscreen canvas JPEG downsampling (target DPI & quality presets) replacing image XObject streams, plus object stream compaction.
- Build `comparePDF()` using dual-canvas pixel discrepancy diffing with side-by-side or slider overlay highlighting modifications in magenta/cyan.

### R3. Document Editing, Capture & OCR
- Implement `scan-to-pdf` using `navigator.mediaDevices.getUserMedia` with mobile/webcam viewfinder, auto-contrast filters, multi-page capture, and PDF compilation.
- Implement `edit-pdf` with interactive canvas overlays for freehand pen, highlighter, text annotations, and shapes baked into the PDF page stream.
- Integrate client-side WebAssembly OCR via `tesseract.js` to generate searchable text layers on scanned pages.

### R4. Office & Standards Conversions
- Implement Word to PDF (`mammoth.js`) and Excel to PDF (`xlsx`).
- Implement PDF to Word (`docx`), PDF to PowerPoint (`pptxgenjs`), and PDF to PDF/A (XMP metadata + sRGB ICC profile).

### R5. Complete Mega-Menu UI Refresh
- Update `index.html` and `style.css` to render the 6-column semantic mega-menu matching the reference iLovePDF layout (`Organize`, `Optimize`, `Convert To`, `Convert From`, `Edit`, `Security`).

## Acceptance Criteria

### Security & Invariants
- [ ] Text redacted via `redactPDF()` cannot be extracted by `pdfToText()` or copied from the document.
- [ ] Zero network requests emitted during any PDF operation (pure client-side execution verified).
- [ ] `unlockPDF()` throws an explicit error when supplied an invalid password or unsupported cipher without deleting `/Encrypt`.

### Performance & Memory
- [ ] No browser freeze or memory leak when loading 20MB+ PDFs or processing 50+ page documents.
- [ ] Active PDF.js instances and canvas contexts are cleanly destroyed on navigation.
- [ ] Selecting pages in `remove-pages` or `extract-pages` toggles DOM state without re-rendering all thumbnails.

### Functional Verification
- [ ] All 30 tools in the mega-menu correctly open their workspace and execute without console errors.
- [ ] `npm test` passes 100% with added tests for redaction text stripping, compression downsampling, and unlock failure modes.
- [ ] Downsampled images in `compressPDF()` achieve measurable byte reduction (>20% on image-heavy documents).
