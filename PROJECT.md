# Project: pdftool — 30-Tool Suite Expansion & Audit Remediation

## Architecture
- **Client-Side Invariant**: 100% in-browser, in-memory execution via `Uint8Array` / `Blob`. Zero server uploads (`server.js` is strictly a static file server with zero POST/data routes).
- **Detached Buffer Protection**: All binary payloads passed across workers, canvas contexts, or async loaders use `.slice()` or explicit cloning.
- **Memory Lifecycle Management**: All active `pdfjsLib` PDF documents and canvas instances call `.destroy()` prior to file/tool navigation.
- **Layers & Modules**:
  - `pdf_core.js`: Core PDF manipulation engine powered by `pdf-lib` and WebCrypto. Pure functions taking `Uint8Array` / `ArrayBuffer` and returning `Promise<Uint8Array>`.
  - `app.js`: Presentation and UI state controller. Manages DOM events, dropzone ingestion, page thumbnails via `pdfjsLib`, interactive tools, settings panels, and download triggers.
  - `index.html`: Semantic markup containing the 6-column mega-menu navigation bar, mobile drawer, 30-card tool grid dashboard, workspace controls, and modal dialogs.
  - `style.css`: Responsive CSS with modern variables, dropdown mega-menus, canvas overlays, and responsive breakpoints.
  - `vendor/`: Bundled client-side libraries for offline execution (`mammoth.js`, `xlsx.full.min.js`, `docx.js`, `pptxgen.min.js`, `tesseract.min.js`).
  - `test/`: Automated test harnesses (`test_core.js`, `test_phase1.js`, `test_phase2.js`, `test_phase3.js`, `test_phase4_audit.js`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Redact Text Stream Stripping | Strip text operators (`Tj`, `TJ`, `'`, `"`) from content streams in `redactPDF()` when stamping blackout boxes | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Wire 7 Dormant Tools | Register `compress`, `repair`, `redact`, `compare`, `scan-to-pdf`, `text-to-pdf`, `pdf-to-text` in `TOOLS` & `executeBtn` | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Unlock PDF Cipher Safety | Prevent `/Encrypt` deletion on decryption failure or unsupported ciphers; throw explicit errors | M1 | ORIGINAL_REQUEST §R1 |
| F4 | Fast Latin1 Decoding | Replace binary single-character string concatenation loops with `new TextDecoder('latin1').decode(bytes)` | M1 | ORIGINAL_REQUEST §R1 |
| F5 | Repair PDF Stream Masking | Mask bytes between `stream` and `endstream` with whitespace to prevent false-positive XRef matches | M1 | ORIGINAL_REQUEST §R1 |
| F6 | PDF.js Memory Cleanup | Call `.destroy()` on active PDF.js document instances before switching files or tools | M1 | ORIGINAL_REQUEST §R1 |
| F7 | Fast DOM Page Selection | Update page selection in `remove-pages` and `extract-pages` directly in the DOM without re-rendering all thumbnails | M1 | ORIGINAL_REQUEST §R1 |
| F8 | Dead Code Elimination | Remove ~140 lines of unused MD5 and padding code, remove dead manual fallback, remove `pdf-lib-encrypt` from `package.json` | M1 | ORIGINAL_REQUEST §R1 |
| F9 | In-Browser Image Compression | Downsample image XObjects via OffscreenCanvas (DPI presets & JPEG re-encoding) with object stream compaction | M2 | ORIGINAL_REQUEST §R2 |
| F10 | PDF Comparison Tool | Dual-canvas pixel discrepancy diffing with side-by-side or slider overlay highlighting in Magenta/Cyan | M2 | ORIGINAL_REQUEST §R2 |
| F11 | Scan to PDF Camera Capture | Mobile/webcam viewfinder using `getUserMedia`, auto-contrast filters, multi-page capture reel, compile to PDF | M3 | ORIGINAL_REQUEST §R3 |
| F12 | Edit PDF Canvas Overlay | Interactive canvas for pen, highlighter, text annotations, and shapes baked into the PDF page stream | M3 | ORIGINAL_REQUEST §R3 |
| F13 | Client-Side WebAssembly OCR | Client-side OCR via `tesseract.js` generating invisible searchable text layers on scanned pages | M3 | ORIGINAL_REQUEST §R3 |
| F14 | Word to PDF Conversion | Client-side docx parsing via `mammoth.js` and rendering to paginated PDF | M4 | ORIGINAL_REQUEST §R4 |
| F15 | Excel to PDF Conversion | Spreadsheet parsing via `xlsx` (SheetJS) and rendering auto-paginated table grids to PDF | M4 | ORIGINAL_REQUEST §R4 |
| F16 | PDF to Word Conversion | PDF text extraction via PDF.js and structured `.docx` document generation via `docx` | M4 | ORIGINAL_REQUEST §R4 |
| F17 | PDF to PowerPoint Conversion | PDF page rendering to high-res images and `.pptx` presentation generation via `pptxgenjs` | M4 | ORIGINAL_REQUEST §R4 |
| F18 | PDF to PDF/A Compliance | Embed sRGB ICC color profile, OutputIntent dictionary, and XMP metadata packet (`pdfaid` schema) | M4 | ORIGINAL_REQUEST §R4 |
| F19 | 6-Column Semantic Mega-Menu | Render 6 categories (Organize, Optimize, Convert To, Convert From, Edit, Security) matching reference iLovePDF | M5 | ORIGINAL_REQUEST §R5 |
| F20 | 30-Tool Dashboard & Routing | Complete 30-tool cards grid, mobile drawer navigation, URL hash routing, and workspace panel management | M5 | ORIGINAL_REQUEST §R5 |
| F21 | E2E Automated Test Suite | Comprehensive tests covering redaction stripping, compression reduction (>20%), unlock guards, memory, and 0 network egress | M-E2E / M6 | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-E2E | E2E Testing Track | Author `test/test_phase4_audit.js` covering Tiers 1-4 for all R1-R5 features, publish `TEST_READY.md` | none | IN_PROGRESS |
| M1 | Audit Remediation & Core Hardening | R1 items: text operator stripping in `redactPDF`, wire 7 tools, unlock cipher guard, latin1 decoder, repair XRef masking, PDF.js destroy, DOM selection, dead code cleanup | none | DONE |
| M2 | Core Optimization & Security | R2 items: in-browser `compressPDF` with OffscreenCanvas JPEG downsampling, `comparePDF` dual-canvas diffing | M1 | DONE |
| M3 | Document Editing, Capture & OCR | R3 items: `scan-to-pdf` (camera + filters), `edit-pdf` (canvas annotations), `ocr-pdf` (`tesseract.js` WASM searchable layer) | M1 | PLANNED |
| M4 | Office & Standards Conversions | R4 items: Word to PDF (`mammoth`), Excel to PDF (`xlsx`), PDF to Word (`docx`), PDF to PPT (`pptxgenjs`), PDF to PDF/A | M1 | PLANNED |
| M5 | 6-Column Mega-Menu UI Refresh | R5 items: `index.html` & `style.css` 6-column mega-nav, 30-card grid, mobile drawer, workspace panels | M1-M4 | PLANNED |
| M6 | Final Verification & Coverage Hardening | 100% pass across all E2E test suites (Tiers 1-4) + Tier 5 adversarial coverage hardening + forensic integrity audit | M-E2E, M1-M5 | PLANNED |

## Interface Contracts

### PDFCore Extensions (`pdf_core.js`)
```javascript
// R1: Audit Hardening
PDFCore.redactPDF = async function(pdfBytes, redactions)
// Input: pdfBytes (Uint8Array/ArrayBuffer), redactions (Array<{ pageIndex: number, x: number, y: number, width: number, height: number, label?: string }>)
// Output: Promise<Uint8Array> with text operators stripped and blackout rectangles stamped

PDFCore.unlockPDF = async function(pdfBytes, password = '')
// Input: pdfBytes, password
// Output: Promise<Uint8Array> or throws explicit Error if password invalid or cipher unsupported (never strips /Encrypt on failure)

PDFCore.repairPDF = async function(pdfBytes)
// Input: damaged pdfBytes
// Output: Promise<Uint8Array> reconstructed with XRef scanner masking stream bodies

// R2: Optimization & Security
PDFCore.compressPDF = async function(pdfBytes, options = { dpi: 150, quality: 0.7, level: 'recommended' })
// Input: pdfBytes, compression options
// Output: Promise<Uint8Array> with downsampled image XObjects and useObjectStreams: true

PDFCore.comparePDF = async function(pdfBytesA, pdfBytesB, options = {})
// Input: pdfBytesA, pdfBytesB
// Output: Promise<{ diffPages: Array<{ pageIndex: number, diffPixels: number, diffPercent: number, canvasDataUrl?: string }> }>

// R3: Editing, Capture & OCR
PDFCore.editPDF = async function(pdfBytes, annotationsByPage)
// Input: pdfBytes, annotationsByPage: { [pageIndex: number]: Array<{ type: 'pen'|'highlight'|'text'|'rect'|'ellipse'|'line', ...coords, color, size, text? }> }
// Output: Promise<Uint8Array> with baked annotations in page streams

PDFCore.ocrPDF = async function(pdfBytes, options = { lang: 'eng' })
// Input: pdfBytes, options
// Output: Promise<Uint8Array> with invisible searchable text layer superimposed over pages

// R4: Conversions
PDFCore.wordToPDF = async function(docxBytes)
// Input: docx file bytes (Uint8Array)
// Output: Promise<Uint8Array> PDF

PDFCore.excelToPDF = async function(xlsxBytes)
// Input: xlsx file bytes (Uint8Array)
// Output: Promise<Uint8Array> PDF

PDFCore.pdfToWord = async function(pdfBytes)
// Input: pdfBytes (Uint8Array)
// Output: Promise<Uint8Array> .docx file

PDFCore.pdfToPowerPoint = async function(pdfBytes)
// Input: pdfBytes (Uint8Array)
// Output: Promise<Uint8Array> .pptx file

PDFCore.pdfToPDFA = async function(pdfBytes, options = { conformance: 'PDF/A-1b' })
// Input: pdfBytes
// Output: Promise<Uint8Array> with sRGB OutputIntent and XMP pdfaid metadata
```

## Code Layout
- `pdf_core.js`: Core PDF processing methods (redactPDF, unlockPDF, repairPDF, compressPDF, comparePDF, editPDF, ocrPDF, wordToPDF, excelToPDF, pdfToWord, pdfToPowerPoint, pdfToPDFA).
- `app.js`: Application logic, `TOOLS` dictionary for all 30 tools, navigation handlers, active PDF.js instance cleanup, direct DOM thumbnail toggles, and tool execution branches.
- `index.html`: Semantic 6-column mega-menu, mobile navigation drawer, 30-card tool dashboard, workspace dropzones, and options controls.
- `style.css`: Styles for mega-menu, mobile drawer, tool grid, canvas annotations, and compare viewer.
- `vendor/`: Local client-side third-party libraries for zero-egress offline execution.
- `test/`:
  - `test_core.js`: Baseline core operations tests.
  - `test_phase1.js`: Phase 1 security and editing tests.
  - `test_phase2.js`: Phase 2 tools tests.
  - `test_phase3.js`: Phase 3 conversion tests.
  - `test_phase4_audit.js`: Phase 4 audit remediation and 30-tool acceptance test suite.
