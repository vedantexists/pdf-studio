# Project: pdftool Phase 1 (Security & Editing Suite)

## Architecture
- **Client-Side Invariant**: 100% in-browser, in-memory execution via `Uint8Array` / `Blob`. Zero server uploads (`server.js` is strictly a static file server with zero POST/data routes).
- **Detached Buffer Protection**: All binary payloads passed across workers or async loaders use `.slice()` or explicit cloning.
- **Data Flow & Layers**:
  - `pdf_core.js`: UMD module providing pure PDF manipulation functions powered by `pdf-lib` and WebCrypto. Operates on `Uint8Array` / `ArrayBuffer` inputs and returns `Promise<Uint8Array>`.
  - `app.js`: Presentation and UI state controller. Manages DOM events, dropzone ingestion, page thumbnail generation via `pdfjsLib`, interactive tools, modals (Signature pad, Crop box, Form fields), and download triggers.
  - `index.html`: Semantic markup containing the mega-menu navigation bar, tool grid dashboard, workspace controls, and modal dialogs.
  - `style.css`: Responsive CSS with modern variables, dropdown mega-menus, canvas overlays, and responsive breakpoints.
  - `test/test_core.js`: Baseline automated self-checks (13 tests passing cleanly).
  - `test/test_phase1.js`: Phase 1 comprehensive automated test suite (Tiers 1-4).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Mega-Menu Navigation Header | Dropdown navigation bar in header with 6 iLovePDF categories (Organize, Optimize, Convert To, Convert From, Edit, Security) and mobile drawer | M1 | ORIGINAL_REQUEST §R3 |
| F2 | Dashboard & Tool Card Routing | Dedicated dashboard cards and URL hash / tool-state switching for all 14 tools (8 existing + 6 new/expanded) | M1 | ORIGINAL_REQUEST §R3 |
| F3 | Unlock PDF (PDFCore) | In-memory decryption & permissions restriction stripping from password-protected or restricted PDFs | M2 | ORIGINAL_REQUEST §R1 |
| F4 | Unlock PDF (UI) | Password prompt modal/input in workspace for encrypted PDFs, executing unlock and downloading decrypted PDF | M2 | ORIGINAL_REQUEST §R1 |
| F5 | Protect PDF (PDFCore) | In-memory password encryption & security handler injection for output PDFs | M2 | ORIGINAL_REQUEST §R1 |
| F6 | Protect PDF (UI) | Password & confirmation inputs in workspace settings, encrypting and downloading protected PDF | M2 | ORIGINAL_REQUEST §R1 |
| F7 | Sign PDF (PDFCore) | Baking signature graphics (PNG/JPEG) onto specified page at coordinates (x, y, width, height) in PDF points | M2 | ORIGINAL_REQUEST §R1 |
| F8 | Sign PDF (UI Modal & Drag/Drop) | Modal supporting Draw (canvas), Type (cursive fonts), and Upload signature image, with drag-and-drop placement on page preview | M2 | ORIGINAL_REQUEST §R1 |
| F9 | Crop PDF (PDFCore) | Visual crop bounding box execution updating `page.setCropBox(x, y, width, height)` on target pages | M3 | ORIGINAL_REQUEST §R2 |
| F10 | Crop PDF (UI) | Interactive bounding box overlay on preview canvas with coordinate conversion and page selection | M3 | ORIGINAL_REQUEST §R2 |
| F11 | PDF Forms Inspection (PDFCore) | Inspect AcroForm fields using `doc.getForm()` returning field metadata (name, type, value, options) | M3 | ORIGINAL_REQUEST §R2 |
| F12 | PDF Forms Fill & Flatten (PDFCore) | Fill text, checkbox, dropdown, radio fields and support both interactive save and irreversible `form.flatten()` | M3 | ORIGINAL_REQUEST §R2 |
| F13 | PDF Forms (UI) | Interactive HTML form generator in workspace settings for filling fields with "Save Interactive" and "Flatten" actions | M3 | ORIGINAL_REQUEST §R2 |
| F14 | Remove Pages (PDFCore & UI) | Dedicated tool entry point to delete selected pages using descending in-place deletion preserving catalog & forms | M3 | ORIGINAL_REQUEST §R2 |
| F15 | Extract Pages (Dedicated UI) | Dedicated tool entry point to extract selected page ranges into a new standalone PDF | M3 | ORIGINAL_REQUEST §R2 |
| F16 | Detached Buffer Protections | Ensure all `.slice()` defensive copies are applied before any Web Worker or pdfjsLib handoff across all tools | M1-M3 | ORIGINAL_REQUEST §Acceptance Criteria |
| F17 | Zero-Upload Network Verification | Automated assertions verifying 0 HTTP requests or server uploads occur during any PDF operations | M4 (E2E) | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Mega-Menu Header & Modular Navigation | Semantic mega-menu in `index.html`, responsive CSS in `style.css`, and navigation dispatch/routing in `app.js` | none | COMPLETED |
| M2 | Document Security Suite | Implement Sign PDF, Unlock PDF, and Protect PDF in `pdf_core.js`, with UI controls/modals in `app.js`, `index.html`, and `style.css` | M1 | COMPLETED |
| M3 | Document Editing & Forms Suite | Implement Crop PDF, PDF Forms (inspect/fill/flatten), Remove Pages, and Extract Pages in `pdf_core.js` and `app.js` | M1 | COMPLETED |
| M4 | Optimization & Analysis Suite (Phase 2) | Compress PDF, Repair damaged PDFs, Redact sensitive data, and Compare PDF versions | M2, M3 | COMPLETED |
| M5 | Conversions & Device Integration (Phase 3)| Live Camera Scanner (Scan to PDF), Text to PDF, and PDF to Markdown/Text extraction | M4 | COMPLETED |
| M6 | Full Verification & Adversarial Hardening | Comprehensive test coverage across all suites (135+ tests: unit, adversarial, stress, challenger) | M1-M5 | COMPLETED |

## E2E Testing Track (Parallel)
- **Track**: E2E Testing Track Orchestrator / Test Writer
- **Scope**: Create `TEST_INFRA.md`, build programmatic test harness in `test/test_phase1.js` covering Tiers 1-4 for F1-F17, update `package.json` test script, and publish `TEST_READY.md`.

## Interface Contracts

### PDFCore Extensions (`pdf_core.js`)

```javascript
// R1: Security Suite
PDFCore.protectPDF = async function(pdfBytes, userPassword, ownerPassword = null, permissions = {})
// Input: pdfBytes (Uint8Array/ArrayBuffer), userPassword (string)
// Output: Promise<Uint8Array> with trailer /Encrypt dictionary

PDFCore.unlockPDF = async function(pdfBytes, password = '')
// Input: pdfBytes (Uint8Array/ArrayBuffer), password (string optional)
// Output: Promise<Uint8Array> without /Encrypt dictionary, re-loadable with standard PDFDocument.load()

PDFCore.signPDF = async function(pdfBytes, signatureData, pageIndex, options = {})
// Input:
//   pdfBytes: Uint8Array/ArrayBuffer
//   signatureData: Uint8Array/ArrayBuffer (PNG/JPG image bytes)
//   pageIndex: number (0-based)
//   options: { x: number, y: number, width: number, height: number } (PDF points)
// Output: Promise<Uint8Array>

// R2: Editing & Forms Suite
PDFCore.cropPDF = async function(pdfBytes, cropBoxes)
// Input:
//   pdfBytes: Uint8Array/ArrayBuffer
//   cropBoxes: Array<{ pageIndex: number, x: number, y: number, width: number, height: number }> or object for all pages
// Output: Promise<Uint8Array>

PDFCore.inspectForm = async function(pdfBytes)
// Input: pdfBytes (Uint8Array/ArrayBuffer)
// Output: Promise<Array<{ name: string, type: 'text'|'checkbox'|'dropdown'|'radio'|'optionlist', value: any, options?: string[] }>>

PDFCore.fillForm = async function(pdfBytes, fieldValues, flatten = false)
// Input:
//   pdfBytes: Uint8Array/ArrayBuffer
//   fieldValues: Object { [fieldName: string]: any }
//   flatten: boolean (if true, calls form.flatten())
// Output: Promise<Uint8Array>

PDFCore.removePages = async function(pdfBytes, pageIndicesToRemove)
// Input:
//   pdfBytes: Uint8Array/ArrayBuffer
//   pageIndicesToRemove: Array<number> (0-based indices)
// Output: Promise<Uint8Array>

PDFCore.extractPages = async function(pdfBytes, pageIndicesToExtract)
// (Existing function in pdf_core.js, verify parity and 0-based indices)
```

## Code Layout
- `index.html`: Main HTML structure, mega-menu markup in `.app-header`, modals for Sign, Crop, Form in `#modalContainer` or body.
- `style.css`: Styles for mega-menu (`.mega-nav`, `.dropdown`), modal signatures, crop box overlay, and form field generator.
- `pdf_core.js`: Core PDF processing methods (protectPDF, unlockPDF, signPDF, cropPDF, inspectForm, fillForm, removePages, extractPages).
- `app.js`: Application logic, tool configurations (`TOOLS` dictionary), event handlers, signature pad canvas, preview crop overlays, and dynamic form UI.
- `server.js`: Unchanged static local HTTP server.
- `test/test_core.js`: Existing core tests (13 tests).
- `test/test_phase1.js`: New Phase 1 test suite covering all new methods, boundary conditions, buffer detachment, and network traps.
