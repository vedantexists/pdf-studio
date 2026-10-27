# iLovePDF Manual Benchmark Comparison Template

> **Note for Evaluator / Owner**:
> Per Ground Rule 10, automated scraping or programmatic interaction with iLovePDF's proprietary web service is strictly prohibited.
> This template contains the exact corpus file list and blank tables for manual verification on [iLovePDF.com](https://www.ilovepdf.com).
> Upload each file manually, execute the corresponding tool, and record the output size, processing time, and visual fidelity notes.

## Corpus File Directory (`bench/corpus/`)

| # | File Name | Description | Source Size | Pages | Applicable iLovePDF Tools |
|---|---|---|---|---|---|
| 01 | `01_clean_scan.pdf` | Clean scanned document with bitmap text | 2.5 KB | 1 | Compress, OCR, PDF to JPG |
| 02 | `02_noisy_scan.pdf` | Noisy scan with background gradient & speckles | 2.5 KB | 1 | Compress, OCR, PDF to JPG |
| 03 | `03_large_220_pages.pdf` | 220-page document for volume stress | 165 KB | 220 | Compress, Split, Page Numbers, Watermark |
| 04 | `04_encrypted_userpass.pdf` | AES-256 encrypted PDF (pass: `user123`) | 3.4 KB | 1 | Unlock PDF |
| 05 | `05_rotated_90_cropbox.pdf` | /Rotate 90 with offset CropBox | 1.8 KB | 1 | Rotate, Crop, Watermark |
| 06 | `06_rotated_180_cropbox.pdf` | /Rotate 180 with offset CropBox | 1.8 KB | 1 | Rotate, Crop, Watermark |
| 07 | `07_rotated_270_cropbox.pdf` | /Rotate 270 with offset CropBox | 1.8 KB | 1 | Rotate, Crop, Watermark |
| 08 | `08_rotated_mixed_pages.pdf` | 4 pages with mixed rotations (0, 90, 180, 270) | 2.5 KB | 4 | Organize, Rotate, Merge |
| 09 | `09_page_size_a0.pdf` | Technical blueprint in A0 format (2384x3370 pt) | 2.2 KB | 1 | Compress, Watermark, PDF to JPG |
| 10 | `10_page_size_tiny.pdf` | Micro shipping label (72x72 pt) | 1.4 KB | 1 | Watermark, Rotate |
| 11 | `11_page_size_mixed.pdf` | 5 pages with mixed sizes (Letter, A4, A0, Tiny, Legal) | 3.1 KB | 5 | Organize, Watermark, Page Numbers |
| 12 | `12_image_heavy_photo.pdf` | 2 pages with dense embedded PNG photos | 3.4 KB | 2 | Compress, PDF to JPG |
| 13 | `13_image_heavy_multi.pdf` | 5 pages with multiple embedded graphics | 5.8 KB | 5 | Compress, PDF to JPG |
| 14 | `14_text_heavy_article.pdf` | 4-page two-column dense academic article | 5.2 KB | 4 | Compress, Redact, Word to PDF |
| 15 | `15_text_heavy_report.pdf` | 12-page structured data audit report | 14.5 KB | 12 | Compress, Watermark, Page Numbers |
| 16 | `16_form_interactive.pdf` | Interactive AcroForm (text, check, dropdown) | 4.8 KB | 1 | Fill Form, Flatten |
| 17 | `17_nonlatin_cjk.pdf` | Chinese & Japanese text (UniGB-UTF16-H) | 2.1 KB | 1 | Watermark, Page Numbers, PDF to Text |
| 18 | `18_nonlatin_cyrillic.pdf` | Russian & Ukrainian text with LiberationSans | 95.5 KB | 1 | Watermark, Page Numbers, PDF to Text |
| 19 | `19_nonlatin_greek.pdf` | Greek text & mathematical symbols | 95.5 KB | 1 | Watermark, Page Numbers, PDF to Text |
| 20 | `20_nonlatin_arabic_indic.pdf` | Arabic & Devanagari Unicode reference | 1.9 KB | 1 | Watermark, Page Numbers |
| 21 | `21_nonlatin_multilingual.pdf` | Multi-language UN declaration excerpt | 96.0 KB | 1 | Watermark, Page Numbers, PDF to Text |
| 22 | `22_annotations_links.pdf` | Hyperlinks, link annotations, stamps | 2.4 KB | 1 | Redact, Watermark |
| 23 | `23_transparency_vector.pdf` | Transparent overlapping vector geometries | 1.9 KB | 1 | Compress, Watermark, PDF to JPG |
| 24 | `24_grayscale_monochrome.pdf` | 1-bit monochrome scanned facsimile | 2.4 KB | 1 | Compress, OCR, PDF to JPG |
| 25 | `25_blank_pages.pdf` | 6 pages with blank pages at 2 and 4 | 2.8 KB | 6 | Organize, Split, Remove Pages |

---

## Blank Results Table for Manual iLovePDF Testing

### 1. Compress PDF

| Corpus File | Preset Used | Original Size | iLovePDF Output Size | Reduction % | iLovePDF Time | PDF Studio Size | Notes / Visual Quality |
|---|---|---|---|---|---|---|---|
| `01_clean_scan.pdf` | Extreme | | | | | | |
| `01_clean_scan.pdf` | Recommended | | | | | | |
| `02_noisy_scan.pdf` | Recommended | | | | | | |
| `03_large_220_pages.pdf` | Recommended | | | | | | |
| `12_image_heavy_photo.pdf`| Recommended | | | | | | |
| `13_image_heavy_multi.pdf`| Recommended | | | | | | |
| `14_text_heavy_article.pdf`| Recommended | | | | | | |

### 2. Merge & Split PDF

| Operation | Files Used | iLovePDF Output Size | iLovePDF Time | PDF Studio Time | Notes / Page Fidelity |
|---|---|---|---|---|---|
| Merge | `08_rotated_mixed_pages.pdf` + `11_page_size_mixed.pdf` | | | | |
| Split | `03_large_220_pages.pdf` (pages 1-10) | | | | |
| Remove Pages | `25_blank_pages.pdf` (remove 2, 4) | | | | |

### 3. Security (Protect & Unlock)

| Operation | File | Password | iLovePDF Success? | PDF Studio Success? | QPDF Validation |
|---|---|---|---|---|---|
| Unlock | `04_encrypted_userpass.pdf` | `user123` | | | |
| Protect | `16_form_interactive.pdf` | `secure2026` | | | |

### 4. Page Operations (Rotate, Page Numbers, Watermark)

| Operation | File | Configuration | iLovePDF Result | PDF Studio Result | Notes |
|---|---|---|---|---|---|
| Rotate | `05_rotated_90_cropbox.pdf` | 90 deg clockwise | | | |
| Watermark | `18_nonlatin_cyrillic.pdf` | Text "CONFIDENTIAL" | | | |
| Page Numbers | `03_large_220_pages.pdf` | Bottom right "Page {n}" | | | |
