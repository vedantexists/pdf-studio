# PDF Studio Benchmark Suite & Corpus Documentation

## Overview
PDF Studio includes an automated benchmark suite and standardized test corpus in `bench/` to guarantee that core PDF operations deliver performance, memory safety, and visual/text fidelity matching or exceeding commercial tools (e.g., iLovePDF) across diverse real-world and edge-case documents.

---

## Benchmark Corpus Inventory (`bench/corpus/`)

The 25 test files are deterministically synthesized via `node bench/generate_corpus.js`:

1. **`01_clean_scan.pdf`**: Clean high-contrast black-and-white scan simulated with Otsu binarization.
2. **`02_noisy_scan.pdf`**: Scan containing high-frequency background noise, dark edges, and scanner dust artifacts.
3. **`03_large_220_pages.pdf`**: 220-page document stress-testing page-tree traversal, font caching, and memory scaling.
4. **`04_encrypted_userpass.pdf`**: Standard AES-256 encrypted document with user password `user123`.
5. **`05_rotated_90_cropbox.pdf`**: 90° clockwise page rotation with custom CropBox offsets.
6. **`06_rotated_180_cropbox.pdf`**: 180° inverted page rotation with custom CropBox offsets.
7. **`07_rotated_270_cropbox.pdf`**: 270° counter-clockwise page rotation with custom CropBox offsets.
8. **`08_rotated_mixed_pages.pdf`**: Multi-page document where pages have distinct orientations (0°, 90°, 180°, 270°).
9. **`09_page_size_a0.pdf`**: Large format engineering blueprint in A0 format (2384 x 3370 pt).
10. **`10_page_size_tiny.pdf`**: Miniature document format (72 x 72 pt tag).
11. **`11_page_size_mixed.pdf`**: Heterogeneous page sizes (Letter, A4, A0, Tiny, Legal) in a single document.
12. **`12_image_heavy_photo.pdf`**: Document embedding high-resolution photographic JPEG images.
13. **`13_image_heavy_multi.pdf`**: Multi-page image portfolio with multiple embedded raster streams.
14. **`14_text_heavy_article.pdf`**: Dense multi-column academic text layout.
15. **`15_text_heavy_report.pdf`**: 12-page structured corporate report with headers, footers, and page numbers.
16. **`16_form_interactive.pdf`**: Interactive AcroForm featuring text inputs, checkboxes, and radio options.
17. **`17_nonlatin_cjk.pdf`**: Typography with CJK (Chinese, Japanese, Korean) characters.
18. **`18_nonlatin_cyrillic.pdf`**: Typography with Cyrillic script.
19. **`19_nonlatin_greek.pdf`**: Typography with Greek polytonic characters.
20. **`20_nonlatin_arabic_indic.pdf`**: Typography with Arabic and Devanagari / Indic scripts.
21. **`21_nonlatin_multilingual.pdf`**: Polyglot document mixing Latin, Cyrillic, Greek, Arabic, and CJK text.
22. **`22_annotations_links.pdf`**: Document containing link annotations, URI actions, and highlight annotations.
23. **`23_transparency_vector.pdf`**: Vector graphics with PDF 1.4+ alpha transparency and blend modes.
24. **`24_grayscale_monochrome.pdf`**: Monochrome architectural schematics and technical line art.
25. **`25_blank_pages.pdf`**: Document containing blank and sparse pages.

---

## Validation Pipeline

Each benchmark execution runs through an automated multi-stage evaluation pipeline in `bench/run.js`:

1. **Duration & Memory Measurement**:
   - Elapsed wall-clock time (`ms`).
   - Peak heap delta (`process.memoryUsage().heapUsed`).
2. **Compression & Size Delta**:
   - Output byte size vs. source byte size (`deltaPercent`).
3. **Text Retention Verification**:
   - Text extracted from source and output via `core.pdfToText()`.
   - Word-set intersection ratio computed (`textMatch` 0–100%).
4. **QPDF Conformance Check**:
   - Shells out to `qpdf --check --warning-exit-0`.
   - Verifies XRef integrity, dictionary syntax, stream lengths, and catalog reachability.
5. **PDFium Cross-Validation**:
   - Invokes Chromium's native engine via Python `pypdfium2.PdfDocument`.
   - Validates that Google Chrome renders and navigates the PDF without error.

---

## Running Benchmarks

Generate or regenerate the corpus:
```bash
node bench/generate_corpus.js
```

Execute the full 17-task benchmark harness:
```bash
node bench/run.js
```

Results are automatically saved to:
- `bench/benchmark_results.json`
- `bench/benchmark_results.md`
