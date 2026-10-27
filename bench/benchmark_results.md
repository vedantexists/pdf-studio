# PDF Studio Benchmark Run Results

Executed on 2026-10-27T13:05:40.158Z across 17 corpus benchmark tasks.

| Tool | File | Src Size | Out Size | Delta | Time (ms) | Peak Mem | Src Pgs | Out Pgs | Text Match | QPDF | PDFium |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| compressPDF | `03_large_220_pages.pdf` | 110.1 KB | 110.1 KB | 0.0% | 220 ms | 0.0 MB | 220 | 220 | 100% | **PASS** | **PASS** |
| compressPDF | `12_image_heavy_photo.pdf` | 124.4 KB | 31.5 KB | -74.7% | 9 ms | 0.3 MB | 2 | 2 | 100% | **PASS** | **PASS** |
| compressPDF | `14_text_heavy_article.pdf` | 7.3 KB | 7.3 KB | 0.1% | 5 ms | 0.8 MB | 4 | 4 | 100% | **PASS** | **PASS** |
| rotatePDF | `05_rotated_90_cropbox.pdf` | 1.0 KB | 1.0 KB | 0.9% | 3 ms | 0.2 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| rotatePDF | `06_rotated_180_cropbox.pdf` | 1.0 KB | 1.0 KB | 0.3% | 2 ms | 0.2 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| cropPDF | `08_rotated_mixed_pages.pdf` | 1.5 KB | 1.5 KB | 1.3% | 2 ms | 0.2 MB | 4 | 4 | 100% | **PASS** | **PASS** |
| watermarkPDF | `15_text_heavy_report.pdf` | 12.2 KB | 15.4 KB | 26.1% | 33 ms | 0.0 MB | 12 | 12 | 100% | **PASS** | **PASS** |
| watermarkPDF | `18_nonlatin_cyrillic.pdf` | 93.3 KB | 93.8 KB | 0.5% | 17 ms | 0.8 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| addPageNumbers | `03_large_220_pages.pdf` | 110.1 KB | 153.1 KB | 39.1% | 337 ms | 0.0 MB | 220 | 220 | 100% | **PASS** | **PASS** |
| splitPDF | `11_page_size_mixed.pdf` | 1.8 KB | 0.9 KB | -51.7% | 5 ms | 0.6 MB | 5 | 1 | 100% | **PASS** | **PASS** |
| mergePDFs | `01_clean_scan.pdf + 02_noisy_scan.pdf` | 19.8 KB | 19.2 KB | -3.0% | 1 ms | 0.4 MB | 2 | 2 | 100% | **PASS** | **PASS** |
| unlockPDF | `04_encrypted_userpass.pdf` | 2.3 KB | 1.5 KB | -35.6% | 28 ms | 0.0 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| protectPDF | `16_form_interactive.pdf` | 4.6 KB | 9.1 KB | 99.9% | 64 ms | 6.8 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| fillForm | `16_form_interactive.pdf` | 4.6 KB | 5.3 KB | 14.8% | 12 ms | 1.1 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| removePages | `25_blank_pages.pdf` | 1.9 KB | 1.9 KB | 0.1% | 2 ms | 0.3 MB | 6 | 4 | 100% | **PASS** | **PASS** |
| repairPDF | `23_transparency_vector.pdf` | 1.1 KB | 1.1 KB | 0.4% | 3 ms | 0.3 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| redactPDF | `14_text_heavy_article.pdf` | 7.3 KB | 7.7 KB | 5.7% | 11 ms | 1.8 MB | 4 | 4 | 100% | **PASS** | **PASS** |
