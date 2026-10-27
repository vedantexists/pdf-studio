# PDF Studio Benchmark Run Results

Executed on 2026-10-27T16:26:44.982Z across 17 corpus benchmark tasks.

| Tool | File | Src Size | Out Size | Delta | Time (ms) | Peak Mem | Src Pgs | Out Pgs | Text Match | QPDF | PDFium |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| compressPDF | `03_large_220_pages.pdf` | 110.1 KB | 110.1 KB | 0.0% | 233 ms | 1.0 MB | 220 | 220 | 100% | **PASS** | **PASS** |
| compressPDF | `12_image_heavy_photo.pdf` | 124.4 KB | 5.5 KB | -95.6% | 40 ms | 4.4 MB | 2 | 2 | 100% | **PASS** | **PASS** |
| compressPDF | `14_text_heavy_article.pdf` | 7.3 KB | 7.3 KB | 0.0% | 5 ms | 0.9 MB | 4 | 4 | 100% | **PASS** | **PASS** |
| rotatePDF | `05_rotated_90_cropbox.pdf` | 1.0 KB | 1.0 KB | 0.5% | 5 ms | 0.2 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| rotatePDF | `06_rotated_180_cropbox.pdf` | 1.0 KB | 1.0 KB | 0.3% | 4 ms | 0.2 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| cropPDF | `08_rotated_mixed_pages.pdf` | 1.5 KB | 1.5 KB | 1.3% | 7 ms | 0.2 MB | 4 | 4 | 100% | **PASS** | **PASS** |
| watermarkPDF | `15_text_heavy_report.pdf` | 12.2 KB | 15.4 KB | 26.1% | 114 ms | 0.0 MB | 12 | 12 | 100% | **PASS** | **PASS** |
| watermarkPDF | `18_nonlatin_cyrillic.pdf` | 93.3 KB | 93.8 KB | 0.5% | 35 ms | 0.8 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| addPageNumbers | `03_large_220_pages.pdf` | 110.1 KB | 153.1 KB | 39.1% | 605 ms | 5.2 MB | 220 | 220 | 100% | **PASS** | **PASS** |
| splitPDF | `11_page_size_mixed.pdf` | 1.8 KB | 0.9 KB | -51.7% | 19 ms | 0.6 MB | 5 | 1 | 100% | **PASS** | **PASS** |
| mergePDFs | `01_clean_scan.pdf + 02_noisy_scan.pdf` | 19.8 KB | 19.2 KB | -3.0% | 6 ms | 0.4 MB | 2 | 2 | 100% | **PASS** | **PASS** |
| unlockPDF | `04_encrypted_userpass.pdf` | 2.3 KB | 1.5 KB | -35.6% | 142 ms | 0.0 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| protectPDF | `16_form_interactive.pdf` | 4.6 KB | 9.1 KB | 99.9% | 185 ms | 6.2 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| fillForm | `16_form_interactive.pdf` | 4.6 KB | 5.3 KB | 14.8% | 46 ms | 1.0 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| removePages | `25_blank_pages.pdf` | 1.9 KB | 1.9 KB | 0.2% | 6 ms | 0.3 MB | 6 | 4 | 100% | **PASS** | **PASS** |
| repairPDF | `23_transparency_vector.pdf` | 1.1 KB | 1.1 KB | 0.4% | 10 ms | 0.3 MB | 1 | 1 | 100% | **PASS** | **PASS** |
| redactPDF | `14_text_heavy_article.pdf` | 7.3 KB | 7.7 KB | 5.6% | 35 ms | 1.9 MB | 4 | 4 | 100% | **PASS** | **PASS** |
