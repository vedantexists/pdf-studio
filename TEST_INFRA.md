# Testing Infrastructure Specification — PDF Studio (pdftool)

## 1. Testing Philosophy & Invariants

`pdftool` is an in-browser, client-side PDF studio engineered for high speed, zero backend data leakage, and rigorous privacy. The test infrastructure strictly enforces four architectural tenets:

1. **Zero-Dependency Runtime Execution**:
   - The test harness relies exclusively on Node.js built-ins (`assert`, `http`/`https`, `net`, `tls`, `dgram`, `zlib`) and the project's core runtime library (`pdf-lib`).
   - No heavyweight external test frameworks (Jest, Mocha, Vitest) or browser automation tools (Puppeteer, Playwright) are introduced, ensuring the entire multi-suite suite executes in under 3 seconds with zero devDependency bloat.

2. **100% In-Memory Dynamic PDF Synthesis**:
   - Zero binary `.pdf` fixture files are stored on disk.
   - All PDF documents, AcroForms, stream objects, and raster graphics are synthesized on-the-fly in RAM (`PDFDocument.create()`, built-in zlib-compressed PNG byte generators).
   - This prevents repository bloat, eliminates filesystem permissions or cleanup failures, avoids file handle leaks, and guarantees deterministic test inputs across platforms.

3. **Strict Privacy & Security Invariants**:
   - **Buffer Detachment Defense**: Web Worker memory transfers detach underlying buffers (`byteLength === 0`). Defensive `.slice()` cloning protects source buffers from detachment.
   - **Zero Network Egress Traps**: Global synchronous interceptors monitor `global.fetch`, `http.request`, `http.get`, `https.request`, `https.get`, `net.connect`, `tls.connect`, and `dgram.createSocket` to mathematically enforce zero server uploads, telemetry, or external font/asset downloads.
   - **Text Redaction Sanitization**: Redactions must strip underlying text operators (`Tj`, `TJ`, `'`, `"`) from content streams so sensitive strings cannot be copied or extracted via PDF.js.
   - **Cipher Error Safety**: Password decryption failures and unsupported ciphers must reject with explicit errors without deleting trailer `/Encrypt` dictionaries.

4. **Multi-Tier Opaque-Box Validation**:
   - Tests assert strictly observable behavior, API interface contracts, and standard PDF specifications (page counts, CropBox dimensions, form field metadata, encryption states, compression ratios, and error rejections).

---

## 2. Feature Inventory & Test Mapping

The following matrix maps all features from `PROJECT.md` (F1–F21) to their respective test suites and test tiers:

| ID | Feature Name | Primary Method / Module | Test Suite | Test Identifier | Primary Verification Criteria |
|---|---|---|---|---|---|
| **F1** | Redact Text Stream Stripping | `PDFCore.redactPDF` | `test_phase4_audit.js` | AUDIT.1.1, AUDIT.1.2, AUDIT.1.3 | Strips text stream operators (`Tj`, `TJ`, `'`, `"`); `pdfToText()` cannot extract redacted text; decompressed streams contain neither raw text nor hex tokens. |
| **F2** | Wire 7 Dormant Tools | `app.js` (`TOOLS`, `executeBtn`) | `test_phase4_audit.js` | AUDIT.5.1, AUDIT.5.2 | Dormant tools (`compress`, `repair`, `redact`, `compare`, `scan-to-pdf`, `text-to-pdf`, `pdf-to-text`) registered with metadata. |
| **F3** | Unlock PDF Cipher Safety | `PDFCore.unlockPDF` | `test_phase1.js`, `test_phase4_audit.js` | T1.1, AUDIT.2.1, AUDIT.2.2, AUDIT.2.3 | Explicit errors on bad password & unsupported ciphers (`/AESV2`, AES-256); trailer `/Encrypt` is never deleted on failure; idempotent on plain PDFs. |
| **F4** | Fast Latin1 Decoding | `pdf_core.js` | `test_phase4_audit.js` | AUDIT.3.1, AUDIT.3.2 | Fast latin1 decoding (`TextDecoder('latin1')`); 1:1 mapping across all 256 byte values (0x00–0xFF); eliminates quadratic `String.fromCharCode` loops. |
| **F5** | Repair PDF Stream Masking | `PDFCore.repairPDF` | `test_phase2.js`, `test_phase4_audit.js` | AUDIT.3.3 | Ignores byte contents between `stream` and `endstream` to prevent false-positive `/Root` or object matches; restores broken XRef tables. |
| **F6** | PDF.js Memory Cleanup | `pdf_core.js` (`pdfToText`), `app.js` | `test_phase4_audit.js` | AUDIT.4.1, AUDIT.4.2 | Calls `doc.destroy()` on PDF.js documents in `finally` blocks upon completion or failure to release worker canvas memory. |
| **F7** | Fast DOM Page Selection | `app.js` | Manual / UI verification | N/A | Toggles thumbnail DOM selection classes without re-rendering all page canvases via PDF.js. |
| **F8** | Dead Code Elimination | `pdf_core.js`, `package.json` | Baseline Suite | Regression checks | Strips unused MD5/padding functions; eliminates dead manual fallbacks; removes `pdf-lib-encrypt` dependency cleanly. |
| **F9** | In-Browser Image Compression | `PDFCore.compressPDF` | `test_phase2.js`, `test_phase4_audit.js` | AUDIT.6.1 | Measurable byte reduction (>20% on image-heavy documents) via downsampling/re-encoding and object stream compaction. |
| **F10**| PDF Comparison Tool | `PDFCore.comparePDF` | Milestone 2 | TBD | Dual-canvas pixel discrepancy diffing with magenta/cyan overlay. |
| **F11**| Scan to PDF Camera Capture | `app.js`, `pdf_core.js` | Milestone 3 | TBD | Mobile/webcam viewfinder capture and paginated PDF compilation. |
| **F12**| Edit PDF Canvas Overlay | `PDFCore.editPDF` | Milestone 3 | TBD | Interactive canvas annotations (pen, highlighter, shapes, text) baked into page streams. |
| **F13**| Client-Side WebAssembly OCR | `PDFCore.ocrPDF` | Milestone 3 | TBD | In-browser Tesseract WASM searchable text layer generation. |
| **F14**| Word to PDF Conversion | `PDFCore.wordToPDF` | Milestone 4 | TBD | DOCX parsing via `mammoth.js` and rendering to paginated PDF. |
| **F15**| Excel to PDF Conversion | `PDFCore.excelToPDF` | Milestone 4 | TBD | Spreadsheet parsing via SheetJS (`xlsx`) and table rendering to PDF. |
| **F16**| PDF to Word Conversion | `PDFCore.pdfToWord` | Milestone 4 | TBD | Structured DOCX document generation from PDF text/layout. |
| **F17**| PDF to PowerPoint Conversion | `PDFCore.pdfToPowerPoint` | Milestone 4 | TBD | High-resolution slide rendering to `.pptx` via `pptxgenjs`. |
| **F18**| PDF to PDF/A Compliance | `PDFCore.pdfToPDFA` | Milestone 4 | TBD | Embeds sRGB ICC profile and XMP metadata with `pdfaid` schema. |
| **F19**| 6-Column Semantic Mega-Menu | `index.html`, `style.css` | `test_phase4_audit.js` | AUDIT.5.3 | Enforces 6 semantic categories: Organize, Optimize, Convert to PDF, Convert from PDF, Edit, Security. |
| **F20**| 30-Tool Dashboard & Routing | `index.html`, `app.js` | `test_phase4_audit.js` | AUDIT.5.1, AUDIT.5.2 | Complete 30-tool cards grid and workspace options panels. |
| **F21**| E2E Automated Test Suite | `test/test_phase4_audit.js` | Test Suite Runner | AUDIT 1.1–7.2 | Comprehensive 7-category audit test harness with strict zero-egress enforcement. |

---

## 3. Test Suite Architecture & Organization

The automated testing harness is structured into 5 co-located suites under `test/`:

```
pdftool/
├── package.json                   # Defines unified "npm test" runner command
├── pdf_core.js                    # Core UMD module under test
├── app.js                         # Application presentation & tools registry
├── test/
│   ├── test_core.js               # Baseline regression suite (13 core operations)
│   ├── test_phase1.js             # Phase 1 Security & Editing suite (24 tests: Tiers 1-4)
│   ├── test_phase2.js             # Phase 2 Optimization & Analysis suite (9 tests)
│   ├── test_phase3.js             # Phase 3 Text Conversion & Roundtrip suite (5 tests)
│   ├── test_phase4_audit.js       # Phase 4 Audit Remediation & Acceptance suite (17 tests)
│   ├── test_adversarial.js        # Adversarial challenger suite (boundary & corrupted PDFs)
│   ├── test_adversarial_challenger_2.js # Memory transfer & multi-step pipeline challenger
│   ├── test_adversarial_stress.js # Heavy load & deep tree parser stress tests
│   ├── test_editing_forms.js      # Dedicated AcroForms and editing tests
│   └── test_security.js          # Cryptographic & permissions lock tests
├── TEST_INFRA.md                  # Test architecture and specification (this file)
└── TEST_READY.md                  # Readiness checklist and execution report
```

### Suite Breakdown

1. **`test/test_core.js` (13 tests)**:
   - Baseline operations: `mergePDFs`, `splitPDF`, `extractPages`, `rotatePDF`, `watermarkPDF`, `organizePDF`, `imagesToPDF`, `addPageNumbers`, negative rotation normalization, Unicode sanitization, bounds checking, and pipeline chaining.
2. **`test/test_phase1.js` (24 tests)**:
   - Privacy Invariants: Buffer detachment safety (`structuredClone` with memory transfers) and network egress traps.
   - Tier 1: Feature coverage (`unlockPDF`, `protectPDF`, `signPDF`, `cropPDF`, `inspectForm`, `fillForm`, `removePages`, `extractPages`).
   - Tier 2: Boundary conditions (empty forms, removing all pages, invalid dimensions, multi-page isolation).
   - Tier 3: Cross-feature combinations (Sign + Protect, Crop + Watermark, Form + Flatten + Numbers, Unlock + Rotate).
   - Tier 4: Real-world document lifecycle and sequential pipelines.
3. **`test/test_phase2.js` (9 tests)**:
   - Optimization & analysis: `compressPDF` stream deflation, `repairPDF` corrupted XRef reconstruction, `redactPDF` blackout stamping, and chained pipelines.
4. **`test/test_phase3.js` (5 tests)**:
   - Conversions & extractor: `textToPDF` pagination, `pdfToText` markdown and plain text extraction, roundtrip text fidelity.
5. **`test/test_phase4_audit.js` (17 tests)**:
   - Category 1: Redaction stream operator stripping (`Tj`, `TJ`, `'`, `"`) and page stream isolation.
   - Category 2: `unlockPDF()` password validation and unsupported cipher guards (`/AESV2`, AES-256).
   - Category 3: Fast Latin1 string decoding (all 256 byte codes) and `repairPDF` stream masking (ignores fake `/Root` and objects inside streams).
   - Category 4: PDF.js `.destroy()` memory lifecycle verification (clean exit and error paths).
   - Category 5: 30-Tool registry completeness, metadata presence, and 6-column category mapping.
   - Category 6: Compression byte reduction (>20% on image-heavy documents).
   - Category 7: Pure client-side zero-egress traps across all core operations.

---

## 4. Verification Commands

```bash
# 1. Run the entire unified test suite (All 5 suites sequentially in progressive dev mode)
npm test

# 2. Run the Phase 4 Audit & Acceptance test suite in strict CI mode (exits non-zero on pending)
npm run test:audit
# or:
node test/test_phase4_audit.js

# 3. Run Phase 4 suite in conditional reporting mode (exits 0 with pending items listed)
node test/test_phase4_audit.js --conditional

# 4. Run individual milestone suites
node test/test_core.js
node test/test_phase1.js
node test/test_phase2.js
node test/test_phase3.js

# 5. Run adversarial stress & challenger suites
node test/test_adversarial.js
node test/test_adversarial_challenger_2.js
node test/test_adversarial_stress.js
```
