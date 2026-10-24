# Test Readiness & Coverage Report — pdftool Phase 1

**Document Status:** Published & Active  
**Author:** `test_writer_e2e_1` (E2E Test Writer)  
**Target Milestone:** Phase 1 (Security & Editing Suite)  
**Last Updated:** 2026-10-24  

---

## 1. Test Runner & Verification Commands

All tests execute 100% in-memory with zero network requests and zero external test runner dependencies.

```bash
# 1. Run Baseline Core Tests (13 tests - all passing)
node test/test_core.js

# 2. Run Phase 1 Comprehensive Test Harness (24 tests)
node test/test_phase1.js

# 3. Run Full Project Test Suite (Chained execution)
npm test
```

---

## 2. Test Execution Status Overview

| Test Suite | Total Tests | Passed | Pending / Failed | Status |
|---|---|---|---|---|
| `test/test_core.js` | 13 | 13 | 0 | **100% GREEN (Baseline Intact)** |
| `test/test_phase1.js` | 24 | 3 | 21 | **ACTIVE TEST HARNESS (TDD Ready)** |
| **Combined (`npm test`)** | 37 | 16 | 21 | Ready for M2 & M3 Implementations |

- **Privacy Invariants (2/2 passed)**: Confirmed that detached buffer protections (`.slice()`) survive `structuredClone` memory transfers, and confirmed that zero outbound network requests can escape due to global egress traps.
- **Existing Operations (1/1 passed)**: `extractPages` (T1.9) passes cleanly against `pdf_core.js`.
- **Pending Implementations (21 tests)**: Explicit assertions are wired to all Phase 1 contracts in `PROJECT.md`, awaiting implementation by `worker_m2` (Security Suite) and `worker_m3` (Editing & Forms Suite).

---

## 3. Feature-by-Tier Coverage Checklist

### Privacy Invariants (Baseline Invariants)
- [x] **PI.1 Buffer Detachment Defense**: Transfers `.slice()` cloned buffers through `structuredClone(..., { transfer: [...] })`; asserts original buffer remains functional.
- [x] **PI.2 Zero Network Egress**: Global traps on `fetch`, `http.request`, and `https.request` guarantee zero bytes leave the client process.

### Tier 1: Feature Coverage (Happy Path Verification)
- [ ] **T1.1 Unlock PDF**: `PDFCore.unlockPDF(restrictedBytes)` strips encryption dictionary; verifies document loads with standard `PDFDocument.load()` without errors. *(Assigned: M2)*
- [ ] **T1.2 Protect PDF**: `PDFCore.protectPDF(bytes, 'password')` injects trailer encryption; standard load without credentials throws encryption error. *(Assigned: M2)*
- [ ] **T1.3 Sign PDF**: `PDFCore.signPDF(bytes, pngBytes, pageIndex, options)` stamps PNG signature; verifies size increase and clean reload. *(Assigned: M2)*
- [ ] **T1.4 Crop PDF**: `PDFCore.cropPDF(bytes, [{ pageIndex, x, y, width, height }])` updates `page.setCropBox`; verified via `getCropBox()`. *(Assigned: M3)*
- [ ] **T1.5 PDF Forms Inspection**: `PDFCore.inspectForm(bytes)` discovers all AcroForm fields (text, checkbox, dropdown) with types and values. *(Assigned: M3)*
- [ ] **T1.6 PDF Forms Interactive Fill**: `PDFCore.fillForm(bytes, values, false)` updates fields while preserving interactive controls. *(Assigned: M3)*
- [ ] **T1.7 PDF Forms Flatten**: `PDFCore.fillForm(bytes, values, true)` calls `form.flatten()`; verified `getFields().length === 0`. *(Assigned: M3)*
- [ ] **T1.8 Remove Pages**: `PDFCore.removePages(bytes, [indices])` deletes specified 0-indexed pages descending in-place. *(Assigned: M3)*
- [x] **T1.9 Extract Pages**: `PDFCore.extractPages(bytes, [indices])` extracts subset of pages cleanly. *(Implemented)*

### Tier 2: Boundary & Corner Cases
- [ ] **T2.1 Empty Form Inspection**: `PDFCore.inspectForm` returns empty array `[]` on standard PDFs without form fields. *(Assigned: M3)*
- [ ] **T2.2 Remove All Pages Validation**: `PDFCore.removePages` throws error matching `/all pages|at least one/i` when all pages are targeted. *(Assigned: M3)*
- [ ] **T2.3 Crop Negative Dimensions**: `PDFCore.cropPDF` throws error matching `/positive|width|height|invalid/i` on invalid bounds. *(Assigned: M3)*
- [ ] **T2.4 Protect PDF Empty Password**: `PDFCore.protectPDF` throws error matching `/password/i` when password is empty. *(Assigned: M2)*
- [ ] **T2.5 Multi-Page Crop Isolation**: Cropping page 1 in a multi-page document preserves original dimensions of page 0 and page 2. *(Assigned: M3)*
- [ ] **T2.6 Sign Out-of-Bounds**: `PDFCore.signPDF` throws descriptive error when target page index exceeds document bounds. *(Assigned: M2)*
- [ ] **T2.7 Unlock Idempotence**: `PDFCore.unlockPDF` succeeds cleanly on already unencrypted PDFs without corrupting content. *(Assigned: M2)*

### Tier 3: Cross-Feature Combinations
- [ ] **T3.1 Sign + Protect**: Signs page 0 with PNG graphic, then password-protects the signed document; output is encrypted and contains signature. *(Assigned: M2)*
- [ ] **T3.2 Crop + Watermark**: Crops page 0, then applies diagonal watermark text; verifies both CropBox bounds and watermark structure are preserved. *(Assigned: M3)*
- [ ] **T3.3 Form Fill + Flatten + Page Numbers**: Fills form fields, flattens fields to page graphics, then stamps `{n}/{total}` page numbers; verifies 0 interactive fields and intact pagination. *(Assigned: M3)*
- [ ] **T3.4 Unlock + Rotate**: Unlocks a restricted document, then rotates page 0 by 90 degrees; verifies clean rotation without encryption errors. *(Assigned: M2/M3)*

### Tier 4: Real-World Scenarios
- [ ] **T4.1 Full Document Lifecycle**:
  - Fill interactive AcroForm fields (`fullName`, `agree`).
  - Stamp PNG signature graphic at specified coordinates.
  - Flatten form fields permanently.
  - Password-protect agreement output.
  - Decrypt with user credentials and verify flattened state and signature persistence. *(Assigned: M2 & M3)*
- [ ] **T4.2 Sequential Multi-Step Pipeline**: Chained in-memory pipeline combining page removals, rotation, and watermark stamping without intermediate disk serialization. *(Assigned: M3)*

---

## 4. Instructions for Implementing Agents (M2 & M3)

1. **API Parity**:
   Follow the interface definitions in `PROJECT.md` § Interface Contracts:
   - `PDFCore.unlockPDF(pdfBytes, password = '')`
   - `PDFCore.protectPDF(pdfBytes, userPassword, ownerPassword = null, permissions = {})`
   - `PDFCore.signPDF(pdfBytes, signatureData, pageIndex, options = {})`
   - `PDFCore.cropPDF(pdfBytes, cropBoxes)`
   - `PDFCore.inspectForm(pdfBytes)`
   - `PDFCore.fillForm(pdfBytes, fieldValues, flatten = false)`
   - `PDFCore.removePages(pdfBytes, pageIndicesToRemove)`

2. **Progressive Verification**:
   - `worker_m2` should run `node test/test_phase1.js` after implementing `unlockPDF`, `protectPDF`, and `signPDF`. Tests T1.1-T1.3, T2.4, T2.6, T2.7, and T3.1 will turn green.
   - `worker_m3` should run `node test/test_phase1.js` after implementing `cropPDF`, `inspectForm`, `fillForm`, and `removePages`. Tests T1.4-T1.8, T2.1-T2.3, T2.5, T3.2-T3.4, and T4.1-T4.2 will turn green.
   - Once all milestones are implemented, `npm test` will report 100% pass across all 37 tests.
