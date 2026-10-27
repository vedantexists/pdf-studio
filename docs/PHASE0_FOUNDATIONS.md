# Phase 0: Foundations — Technical Specification & Verification Status

This document details the architectural foundations established during Phase 0 of the PDF Studio project, matching verified outputs confirmed by the Verifier.

---

## 1. Task 0.1: Standardized Benchmark Corpus & Validation Harness

- **Status:** **VERIFIED**
- **Verified Commit:** `3fa3a86`
- **Verification Command:** `node bench/run.js`
- **Verification Output:** 17/17 benchmarks passing 100% QPDF and 100% PDFium validation; negative control exits with code 1.

### 1.1 The 25-File Benchmark Corpus (`bench/corpus/`)
The corpus is deterministically generated via `node bench/generate_corpus.js` to eliminate external test asset dependencies while covering the full spectrum of PDF syntax edge cases:

| Corpus File | Size | Characteristics & Edge Case Targeted |
| :--- | :--- | :--- |
| `01_clean_scan.pdf` | 1.8 KB | Clean B&W scan with Otsu binarization layout. |
| `02_noisy_scan.pdf` | 18.0 KB | High-DPI simulated noisy scan with background threshold noise. |
| `03_large_220_pages.pdf` | 110.1 KB | High page count (220 pages), stress-testing page tree traversal and batch operations. |
| `04_encrypted_userpass.pdf` | 2.3 KB | Genuine standard AES-256 encryption (`/V 5 /R 6`) requiring password `user123`. |
| `05_rotated_90_cropbox.pdf` | 1.0 KB | 90° rotation with non-zero CropBox offsets. |
| `06_rotated_180_cropbox.pdf` | 1.0 KB | 180° rotation with non-zero CropBox offsets. |
| `07_rotated_270_cropbox.pdf` | 1.0 KB | 270° rotation with non-zero CropBox offsets. |
| `08_rotated_mixed_pages.pdf` | 1.5 KB | Multi-page document with mixed orientations (0°, 90°, 180°, 270°). |
| `09_page_size_a0.pdf` | 1.0 KB | Extreme format: A0 architectural blueprint (2384 x 3370 pt). |
| `10_page_size_tiny.pdf` | 0.9 KB | Extreme format: Tiny shipping tag (72 x 72 pt). |
| `11_page_size_mixed.pdf` | 1.8 KB | Document with heterogeneous page dimensions (Letter, A4, A0, Tiny, Legal). |
| `12_image_heavy_photo.pdf` | 124.4 KB | Document containing high-resolution photographic JPEG XObjects. |
| `13_image_heavy_multi.pdf` | 100.0 KB | Multi-page image portfolio with multiple embedded raster streams. |
| `14_text_heavy_article.pdf` | 7.3 KB | Multi-column academic paper with dense text and headings. |
| `15_text_heavy_report.pdf` | 12.2 KB | 12-page structured annual report with page headers and footers. |
| `16_form_interactive.pdf` | 4.6 KB | Interactive AcroForm with text inputs, checkboxes, and choice fields. |
| `17_nonlatin_cjk.pdf` | 1.0 KB | Non-Latin CJK typography (Japanese / Chinese glyphs). |
| `18_nonlatin_cyrillic.pdf` | 93.3 KB | Non-Latin Cyrillic alphabet and typography. |
| `19_nonlatin_greek.pdf` | 93.3 KB | Non-Latin Greek polytonic alphabet. |
| `20_nonlatin_arabic_indic.pdf` | 1.1 KB | Non-Latin Arabic and Indic script rendering. |
| `21_nonlatin_multilingual.pdf` | 93.6 KB | Multilingual document mixing Latin, Cyrillic, Greek, and CJK text. |
| `22_annotations_links.pdf` | 1.1 KB | Document with link annotations, highlights, and document outline trees. |
| `23_transparency_vector.pdf` | 1.1 KB | Vector graphics utilizing PDF 1.4+ transparency groups and alpha blend modes. |
| `24_grayscale_monochrome.pdf` | 1.5 KB | Monochromatic line art and technical drawings. |
| `25_blank_pages.pdf` | 1.9 KB | Sparse and blank pages interspersed among content pages. |

### 1.2 Dual-Reader Validation Architecture
Every benchmarked operation output is tested against two independent industry-standard PDF parsing engines:
1. **QPDF Validator (`qpdf --check --warning-exit-0`)**: Verifies ISO 32000-1 conformance, trailer integrity, XRef table validity, stream length dictionary synchronization, and object reachability.
2. **PDFium Validator (`pypdfium2.PdfDocument`)**: Verifies Google Chrome's native PDF rendering engine can parse, instantiate, decrypt (with password where applicable), and traverse pages without segmentation faults or fatal parser exceptions.
3. **Text Retention Verification**: Compares extracted text before and after operation via `core.pdfToText()` to verify text content is preserved without corruption.
4. **Negative Control Verification**: Verified that deliberate malformed inputs (corrupted headers, bad trailers, unencrypted files expecting cipher keys) trigger validation failures and non-zero process exits (`exit 1`), proving the harness cannot produce false green passes.

### 1.3 Verified Benchmark Performance Results
Current verified results across 17 benchmark tasks:

| Operation | Corpus Target | Source Size | Output Size | Delta | Time | QPDF | PDFium | Text Match |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `compressPDF` | `03_large_220_pages.pdf` | 110.1 KB | 110.1 KB | 0.0% | ~220 ms | **PASS** | **PASS** | 100% |
| `compressPDF` | `12_image_heavy_photo.pdf` | 124.4 KB | 31.5 KB | -74.7% | ~9 ms | **PASS** | **PASS** | 100% |
| `compressPDF` | `14_text_heavy_article.pdf` | 7.3 KB | 7.3 KB | +0.1% | ~5 ms | **PASS** | **PASS** | 100% |
| `rotatePDF` | `05_rotated_90_cropbox.pdf` | 1.0 KB | 1.0 KB | +0.9% | ~3 ms | **PASS** | **PASS** | 100% |
| `rotatePDF` | `06_rotated_180_cropbox.pdf` | 1.0 KB | 1.0 KB | +0.3% | ~2 ms | **PASS** | **PASS** | 100% |
| `cropPDF` | `08_rotated_mixed_pages.pdf` | 1.5 KB | 1.5 KB | +1.3% | ~2 ms | **PASS** | **PASS** | 100% |
| `watermarkPDF` | `15_text_heavy_report.pdf` | 12.2 KB | 15.4 KB | +26.1% | ~33 ms | **PASS** | **PASS** | 100% |
| `watermarkPDF` | `18_nonlatin_cyrillic.pdf` | 93.3 KB | 93.8 KB | +0.5% | ~17 ms | **PASS** | **PASS** | 100% |
| `addPageNumbers` | `03_large_220_pages.pdf` | 110.1 KB | 153.1 KB | +39.1% | ~337 ms | **PASS** | **PASS** | 100% |
| `splitPDF` | `11_page_size_mixed.pdf` | 1.8 KB | 0.9 KB | -51.7% | ~5 ms | **PASS** | **PASS** | 100% |
| `mergePDFs` | `01_clean_scan + 02_noisy_scan` | 19.8 KB | 19.2 KB | -3.0% | ~1 ms | **PASS** | **PASS** | 100% |
| `unlockPDF` | `04_encrypted_userpass.pdf` | 2.3 KB | 1.5 KB | -35.6% | ~28 ms | **PASS** | **PASS** | 100% |
| `protectPDF` | `16_form_interactive.pdf` | 4.6 KB | 9.1 KB | +99.9% | ~64 ms | **PASS** | **PASS** | 100% |
| `fillForm` | `16_form_interactive.pdf` | 4.6 KB | 5.3 KB | +14.8% | ~12 ms | **PASS** | **PASS** | 100% |
| `removePages` | `25_blank_pages.pdf` | 1.9 KB | 1.9 KB | +0.1% | ~2 ms | **PASS** | **PASS** | 100% |
| `repairPDF` | `23_transparency_vector.pdf` | 1.1 KB | 1.1 KB | +0.4% | ~3 ms | **PASS** | **PASS** | 100% |
| `redactPDF` | `14_text_heavy_article.pdf` | 7.3 KB | 7.7 KB | +5.7% | ~11 ms | **PASS** | **PASS** | 100% |

### 1.4 iLovePDF Quality Comparison Protocol (`bench/ilovepdf_manual.md`)
A structured manual comparison template measuring:
1. Output file size (bytes & % ratio)
2. Visual fidelity & rendering parity
3. Processing latency
4. Error handling on edge-case files
5. Standards conformance under QPDF `--check`

---

## 2. Task 0.2: Worker Architecture

- **Status:** **IN PROGRESS (Worker Platform Engineer)**
- **Verification Target:** Pending Verifier confirmation.

### 2.1 Architectural Contract
- **Job Interface (`job_runner.js`)**: Encapsulates job execution off the main UI thread using Web Workers (with automatic fallback to Node.js / synchronous mode if Web Workers are unavailable).
- **Interface Protocol**:
  - `start(job)`: Submits a job with `id`, `op`, `args`, and transferable `ArrayBuffer` items.
  - `onProgress(percent, stage)`: Monotonically increasing progress notifications (0–100%) through valid stages: `parsing`, `processing`, `rendering`, `compiling`, `saving`.
  - `cancel()`: Immediately terminates worker thread (`worker.terminate()`) and zeroes active buffer references to reclaim memory.
  - `onResult(bytes)`: Resolves resulting binary `Uint8Array`.
  - `onError({ code, userMessage, detail })`: Delivers structured, user-friendly error objects without unhandled promise rejections.
- **Detached Buffer Safety**: Source buffers are transferred where supported or defensively cloned via `.slice()` to prevent use-after-free or zero-length buffer bugs on the main thread.

---

## 3. Task 0.3: Cross-Browser Compatibility Matrix

- **Status:** **IN PROGRESS (Browser Matrix Engineer)**
- **Verification Target:** Pending Verifier confirmation.

### 3.1 Target Support Matrix
1. **Google Chrome / Chromium**: Full WebCrypto AES-256 derivation, OffscreenCanvas 2D context downsampling, Web Worker thread pools.
2. **Mozilla Firefox**: Full WebCrypto support, Canvas memory lifecycle reclamation via explicit `canvas.width = 0; canvas.height = 0`.
3. **Apple Safari / WebKit**: Proper fallback for Safari OffscreenCanvas quirks and memory limits on iOS mobile devices.
4. **Microsoft Edge**: Parity with Chromium desktop specifications.
