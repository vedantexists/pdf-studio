# Testing Infrastructure Specification — pdftool Phase 1

## 1. Testing Philosophy

`pdftool` is an in-browser, client-side PDF manipulation utility engineered for high speed, zero backend data leakage, and rigorous privacy. The testing infrastructure is designed around four core tenets:

1. **Zero-Dependency Runtime Execution**:
   - The test harness relies exclusively on Node.js's built-in `assert` module and the project's core runtime library (`pdf-lib`).
   - No heavyweight external test frameworks (Jest, Mocha, Vitest) or browser automation tools (Puppeteer, Playwright) are introduced, ensuring tests run in under 2 seconds with zero devDependency bloat.

2. **100% In-Memory Dynamic PDF Synthesis**:
   - Zero binary `.pdf` fixture files are stored on disk.
   - All PDF documents, AcroForms, and binary signature graphics are synthesized on-the-fly in RAM (`PDFDocument.create()`, base64 transparent PNG decoding).
   - This prevents repository bloat, eliminates filesystem permissions or cleanup failures, avoids file handle leaks, and guarantees deterministic test inputs across platforms.

3. **Strict Privacy Invariants**:
   - **Buffer Detachment Defense**: In browser Web Worker environments (such as `pdfjs-dist`), passing an `ArrayBuffer` transfers ownership, detaching the underlying memory (`byteLength === 0`). The test suite validates that `.slice()` defensive copies protect original buffers from detachment using Node.js `structuredClone(buffer, { transfer: [buffer] })`.
   - **Zero Network Egress**: Client-side execution requires absolute network isolation. The test harness installs synchronous traps on `global.fetch`, `http.request`, and `https.request` to mathematically enforce zero server uploads or external network requests during PDF operations.

4. **Opaque-Box Requirement-Driven Testing**:
   - Tests assert strictly observable behavior, API interface contracts, and standard PDF specifications (page counts, CropBox dimensions, form field metadata, encryption states, and error rejections).
   - Tests treat modules as opaque boxes without coupling to unexported private state.

---

## 2. Feature Inventory & Coverage Mapping

The following matrix maps Phase 1 features from `PROJECT.md` to testing tiers:

| ID | Feature Name | Primary Method | Test Tier | Primary Assertions |
|---|---|---|---|---|
| **F3** | Unlock PDF (PDFCore) | `PDFCore.unlockPDF` | Tier 1, Tier 2, Tier 3 | Strips `/Encrypt` dictionary; loads cleanly with `PDFDocument.load()` without `ignoreEncryption: true`; idempotent on normal PDFs. |
| **F5** | Protect PDF (PDFCore) | `PDFCore.protectPDF` | Tier 1, Tier 2, Tier 3 | Encrypts document trailer; `PDFDocument.load()` rejects with encryption error; empty password rejects. |
| **F7** | Sign PDF (PDFCore) | `PDFCore.signPDF` | Tier 1, Tier 2, Tier 3 | Bakes signature PNG at designated `(x, y, width, height)`; byte length increases; page count intact; bounds validated. |
| **F9** | Crop PDF (PDFCore) | `PDFCore.cropPDF` | Tier 1, Tier 2, Tier 3 | Updates `page.setCropBox(x, y, width, height)`; verified via `page.getCropBox()`; non-positive dimensions throw. |
| **F11** | Form Inspection (PDFCore) | `PDFCore.inspectForm` | Tier 1, Tier 2 | Introspects AcroForm fields; extracts `name`, `type`, `value`, `options`; returns `[]` on forms without fields. |
| **F12** | Form Fill & Flatten (PDFCore) | `PDFCore.fillForm` | Tier 1, Tier 3, Tier 4 | Updates field values interactively; when `flatten: true`, bakes fields to vector graphics (`getFields().length === 0`). |
| **F14** | Remove Pages (PDFCore) | `PDFCore.removePages` | Tier 1, Tier 2 | Removes specified 0-indexed pages descending in-place; throws if all pages removed; preserves AcroForms on remaining pages. |
| **F15** | Extract Pages (PDFCore) | `PDFCore.extractPages` | Tier 1, Tier 2 | Extracts designated 0-indexed pages; throws on invalid bounds. |
| **F16** | Detached Buffer Protections | `.slice()` + `structuredClone` | Privacy Invariant | Cloned buffers detach transferred memory without affecting source buffers. |
| **F17** | Zero-Upload Verification | Global network spy/traps | Privacy Invariant | Intercepts `fetch`, `http.request`, `https.request` ensuring 0 bytes egress during processing. |

---

## 3. Four-Tier Coverage Plan

### Tier 0: Privacy Invariants (Baseline Guarantees)
- **PI.1: Buffer Detachment Safety**:
  - Clones source buffer using `.slice()`.
  - Simulates worker memory detachment via `structuredClone(transferred.buffer, { transfer: [transferred.buffer] })`.
  - Asserts transferred buffer has `byteLength === 0` while source buffer retains full integrity and remains loadable by `PDFDocument.load()`.
- **PI.2: Zero Network Egress**:
  - Replaces `global.fetch`, `http.request`, and `https.request` with assertion traps.
  - Verifies that any simulated outbound egress triggers an immediate `Error`.
  - Confirms zero network requests occur across all test executions.

### Tier 1: Feature Coverage (Happy Path Verification)
- **T1.1: Unlock PDF**: Loads restricted sample PDF (synthesized with trailer `/Encrypt` dictionary), calls `PDFCore.unlockPDF()`, and verifies the output loads with `PDFDocument.load()` with `isEncrypted === false`.
- **T1.2: Protect PDF**: Passes plain PDF to `PDFCore.protectPDF(bytes, 'password123')`, verifies output cannot be loaded without credentials (throws encryption error).
- **T1.3: Sign PDF**: Embeds 1x1 transparent PNG signature at `(50, 50, 100, 50)` on page 0. Verifies output size increases and document loads cleanly.
- **T1.4: Crop PDF**: Sets CropBox `(50, 100, 300, 400)` on page 0 of a 400x600 PDF. Asserts `page.getCropBox()` matches target dimensions exactly.
- **T1.5: PDF Forms Inspection**: Creates sample PDF containing text field, checkbox, and dropdown. Asserts `PDFCore.inspectForm()` accurately reports names, types, and default values.
- **T1.6: PDF Forms Interactive Fill**: Fills text (`Alice`), checkbox (`true`), and dropdown (`Canada`) without flattening. Asserts `doc.getForm()` returns updated values and retains all 3 interactive fields.
- **T1.7: PDF Forms Flatten**: Fills form with `flatten: true`. Asserts `doc.getForm().getFields().length === 0` (fields baked into page graphics).
- **T1.8: Remove Pages**: Removes pages `[1, 3]` from a 5-page PDF. Asserts remaining document has exactly 3 pages.
- **T1.9: Extract Pages**: Extracts pages `[0, 2]` from a 5-page PDF. Asserts output document contains exactly 2 pages.

### Tier 2: Boundary & Corner Cases
- **T2.1: Empty Form Inspection**: Runs `inspectForm` on a standard PDF without AcroForm fields. Asserts return value is empty array `[]`.
- **T2.2: Remove All Pages Validation**: Attempts to remove all pages (`[0, 1]` from a 2-page document). Asserts rejection with descriptive error (`Cannot remove all pages`).
- **T2.3: Crop Box Invalid Dimensions**: Supplies non-positive width/height (`width: -10`). Asserts rejection with descriptive validation error.
- **T2.4: Protect PDF Empty Password**: Passes empty string `''` as user password. Asserts rejection with validation error.
- **T2.5: Multi-Page Crop Isolation**: In a 3-page document, crops page 1 only. Asserts page 1 CropBox is modified while page 0 and page 2 retain original dimensions.
- **T2.6: Sign PDF Out-of-Bounds**: Attempts to sign page index 99 on a 2-page PDF. Asserts descriptive out-of-bounds error.
- **T2.7: Unlock PDF Idempotence**: Calls `unlockPDF` on an already unencrypted PDF. Asserts output remains clean, valid, and unmodified.

### Tier 3: Cross-Feature Combinations
- **T3.1: Sign + Protect**: Signs page 0 with signature PNG, then password-protects the signed document. Verifies that output requires password and retains signature graphic.
- **T3.2: Crop + Watermark**: Sets CropBox on target page, then applies diagonal watermark text. Asserts both the CropBox bounds and the watermarked page structure are intact.
- **T3.3: Form Fill + Flatten + Page Numbers**: Fills form fields, flattens fields into page graphics, and stamps `{n}/{total}` page numbers. Asserts field count remains 0 and page numbers are rendered.
- **T3.4: Unlock + Rotate**: Unlocks a restricted document, then applies 90-degree rotation. Asserts output rotation angle is 90 degrees without encryption errors.

### Tier 4: Real-World Scenarios
- **T4.1: Full Document Lifecycle**:
  1. Synthesize AcroForm document.
  2. Inspect interactive fields.
  3. Fill interactive fields (`fullName`, `agree`).
  4. Stamp visual PNG signature at coordinates `(50, 100, 120, 60)`.
  5. Flatten form fields to prevent further editing.
  6. Apply password protection (`VaultKey2026`).
  7. Verify final payload is encrypted.
  8. Unlock with credentials and assert form fields are flattened and page count intact.
- **T4.2: Sequential Multi-Operation Pipeline**: Runs chained sequence of Phase 1 editing operations in memory without intermediate file serialization.

---

## 4. Test Runner Architecture

### 4.1 Test File Structure
```
pdftool/
├── package.json               # Defines test script: "node test/test_core.js && node test/test_phase1.js"
├── pdf_core.js                # Core UMD module under test
├── test/
│   ├── test_core.js           # Baseline self-checks (13 original tests)
│   └── test_phase1.js         # Phase 1 comprehensive test harness (Tiers 1-4 + Invariants)
├── TEST_INFRA.md              # Test architecture and specification
└── TEST_READY.md              # Readiness checklist and execution instructions
```

### 4.2 Execution Lifecycle
1. **Runner Entry Point**: `node test/test_phase1.js` (or `npm test`).
2. **Setup Phase**:
   - `installNetworkTrap()` intercepts all network calls.
   - Fixture factories initialize in-memory generators (`createSamplePDF`, `createFormSamplePDF`, `createRestrictedSamplePDF`, `createTestPNG`).
3. **Execution Phase**:
   - Each test is wrapped in an isolated async executor `runTest(tier, testId, title, fn)`.
   - Results are logged with structured prefix: `✓ [T1.1] Unlock PDF passed` or `✗ [T1.1] Unlock PDF failed: <reason>`.
   - Test counts and failure stacks are aggregated in memory.
4. **Teardown & Reporting**:
   - Summary banner outputs: `Total`, `Passed`, `Failed`.
   - If any test failed, `process.exit(1)` is triggered to fail CI/automation.
   - If all passed, `process.exit(0)` is returned.

---

## 5. Verification Commands

```bash
# Execute baseline test suite (13 tests)
node test/test_core.js

# Execute Phase 1 comprehensive test suite (22 tests)
node test/test_phase1.js

# Execute full test suite via npm
npm test
```
