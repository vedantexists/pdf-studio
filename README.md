# PDF Studio - Fast, Zero-Upload Client-Side PDF Tools

> **100% private, in-browser PDF manipulation suite. Zero server uploads. Works fully offline once loaded.**

[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen.svg)](https://vedantexists.github.io/pdf-studio/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Privacy: 100% Local](https://img.shields.io/badge/privacy-100%25%20local-emerald.svg)](#-100-in-browser-privacy)
[![Tests: 94 Passing](https://img.shields.io/badge/tests-94%20passing-brightgreen.svg)](#-automated-verification-suite)

🌐 **Live Studio**: [https://vedantexists.github.io/pdf-studio/](https://vedantexists.github.io/pdf-studio/)

---

## 🎬 Live Interactive Preview

![PDF Studio Workflow](assets/demo.svg)

---

## Complete 35-Tool Suite

### 1. Organize PDF
- **Merge PDF**: Combine multiple PDFs into a single document in any custom sequence.
- **Split PDF**: Extract all pages as separate PDFs (ZIP) or extract custom page ranges (e.g. `1-3, 5`).
- **Remove Pages**: Target and delete unwanted pages cleanly.
- **Extract Pages**: Pull selected pages into a standalone PDF.
- **Organize PDF**: Visual thumbnail grid to reorder, delete, and rotate individual pages.
- **Scan to PDF**: Capture multi-page documents directly using your mobile camera or desktop webcam with Otsu binarization and contrast presets.

### 2. Optimize PDF
- **Compress PDF**: In-memory stream compaction & metadata stripping reducing file size (>80% on image-heavy documents) while preserving readability.
- **Repair PDF**: Scans token streams and synthesizes clean XRef offset tables to recover damaged or unreadable PDFs.
- **OCR PDF (Beta)**: Injects an invisible searchable, selectable text layer locally into PDFs without external cloud uploads or heavy multi-megabyte CDN language pack downloads.

### 3. Convert to PDF
- **JPG / PNG to PDF**: Assemble images into a formatted PDF document with customizable margins and page sizes.
- **Word to PDF (Beta)**: Basic client-side conversion of Microsoft Word (`.docx`) text and paragraphs into PDF.
- **PowerPoint to PDF (Beta)**: Basic client-side conversion of PowerPoint (`.pptx`) slide text and notes into 16:9 PDF slides.
- **Excel to PDF (Beta)**: Basic client-side conversion of spreadsheet (`.xlsx`) data grids into formatted table pages.
- **HTML to PDF (Beta)**: Basic client-side conversion of HTML document markup and headings into PDF.
- **Text to PDF**: Convert plain text or markdown notes into cleanly formatted, paginated PDF documents.

### 4. Convert from PDF
- **PDF to JPG / PNG**: Convert PDF pages into crisp high-resolution images (individual or ZIP).
- **PDF to Word (Beta)**: Basic client-side extraction of PDF text and layout into editable Microsoft Word (`.docx`) files.
- **PDF to PowerPoint (Beta)**: Basic client-side extraction of PDF pages and text content into Microsoft PowerPoint (`.pptx`) presentation slides.
- **PDF to Excel (Beta)**: Basic client-side extraction of tabular text from PDF into Microsoft Excel (`.xlsx`) spreadsheets.
- **PDF to PDF/A (Beta)**: Appends ISO 19005-1 (PDF/A-1b) archival metadata, schema, and sRGB OutputIntents for archival workflows *(see Archival Details below)*.
- **PDF to Text / Markdown**: Extract structured text, paragraphs, and headings from PDFs into clean Markdown or TXT.

### 5. Edit PDF
- **Edit PDF**: Add freehand drawing, highlighter, annotations, text, callouts, arrows, and shapes directly to PDF pages.
- **Rotate PDF**: Rotate all or specific pages 90°, 180°, or 270°.
- **Page Numbers**: Add clean page numbering across all pages with customizable placement and formatting.
- **Watermark PDF**: Add custom text watermarks with control over opacity, font size, angle, and color.
- **Crop PDF**: Adjust page dimensions and crop bounding boxes with interactive visual drag-handles.
- **PDF Forms**: Inspect and fill interactive form fields with options to save or permanently flatten.

### 6. PDF Security
- **Unlock PDF**: Decrypt open passwords and strip permissions restrictions in-memory.
- **Protect PDF**: Genuine standard AES-256 in-browser encryption requiring passwords across Adobe Acrobat, Chrome, Preview, and mobile.
- **Sign PDF**: Create drawn, typed, or uploaded electronic signature stamps onto document pages *(see Legal Transparency Note)*.
- **Redact PDF**: Permanently blackout sensitive numbers, private text, or confidential rectangular regions with raw content stream operator stripping.
- **Compare PDF**: Spot modifications and visual discrepancies between two PDF revisions side-by-side.

### 7. PDF Intelligence (Beta)
- **AI Summarizer (Beta)**: Extractive in-memory executive summary & bullet key takeaways using client-side sentence significance scoring (100% private, zero external model downloads or cloud APIs).
- **Translate PDF (Beta)**: Local in-memory term and phrase translation using built-in dictionaries (Spanish, French, German, Italian) with zero data egress.
- **PDF to Markdown**: Direct extraction of headings, lists, tables, and code blocks into structured Markdown.

---

## 🔒 100% In-Browser Privacy & Offline Guarantee

All processing happens entirely in client memory using WebAssembly and pure JavaScript (`pdf-lib`, `pdfjs-dist`, `jszip`).
- **Zero data retention**: Documents never leave your browser tab.
- **Zero external network egress**: All tools operate offline without calling third-party cloud APIs.
- **`server.js` is strictly an optional, local static development server**: It has zero API routes, zero storage, and performs no data handling—it simply serves HTML, CSS, and JS files over localhost.
- **Works fully offline once loaded**: All core engines and vendor libraries are bundled locally in `vendor/` without runtime CDN script dependencies.

---

## 🛡️ Technical Specifications & Transparency Disclosures

### 1. Password Protection (Real AES-256 In-Browser Encryption)
- **Standard**: Uses genuine ISO 32000-1 / PDF 2.0 **AES-256** encryption (`/V 5 /R 6 /AESV3`) with Web Crypto key derivation.
- **Cross-Reader Verification**: Encrypted PDFs are genuinely ciphered at the stream and string level. When opened in **Adobe Acrobat, Google Chrome, Mozilla Firefox, Microsoft Edge, Apple Preview, or mobile PDF readers (iOS/Android)**, the reader strictly demands the password before displaying pages or rendering content.
- **Configurable Permissions**: Restrict copying, modification, or printing while keeping the file readable.

### 2. Redaction Safety (Content Stream Operator Stripping)
- Unlike basic editors that simply place black visual rectangles over text (leaving the underlying text selectable and extractable), PDF Studio's `redactPDF` engine decompresses page content streams, strips or masks raw text operators (`Tj`, `TJ`, `'`, `"`) within the bounding box coordinates, and repacks the stream before drawing opaque blackout overlays.

### 3. Sign PDF: Visual Electronic Stamp vs. Cryptographic Certificate
> **⚠️ Legal & Technical Transparency Note:**
>
> The **Sign PDF** tool in PDF Studio creates an **Electronic Signature Stamp (e-Signature)**—a high-resolution visual signature graphic (drawn on canvas, typed with handwriting fonts, or uploaded as an image) baked directly into the document's page stream.
>
> - **What it is**: An electronic mark/overlay permanently rendered onto the PDF canvas.
> - **What it is NOT**: It is **not** a cryptographic PKI / X.509 digital signature (PAdES / Adobe Approved Trust List). It does not embed a private key digital certificate, mathematical cryptographic digest, or timestamp authority token.
> - **Legal Validity**: While electronic signature stamps are commonly accepted for informal contracts, internal approvals, receipts, and day-to-day forms, formal government filings, legal deeds, and regulated financial contracts may legally mandate certified cryptographic digital signatures. Always verify the compliance requirements of your jurisdiction and counterparty.

### 4. Office Conversions & PDF/A Conformance Disclosures
- **Office Conversions (Beta)**: Built on pure client-side OpenXML ZIP parsers (`docx`, `pptx`, `xlsx`) designed for text, paragraphs, and table extraction without sending documents to third-party conversion servers. Complex desktop typography, macro scripting, and advanced floating shapes may render in simplified layouts compared to full native Microsoft Office or LibreOffice rendering.
- **PDF to PDF/A (Beta)**: Injects the standard ISO 19005-1 (PDF/A-1b) catalog dictionary, XMP metadata schema, and standard sRGB OutputIntents dictionary for long-term archiving workflows. Full VeraPDF validation on pre-existing third-party PDFs with non-embedded proprietary system fonts may require font subset embedding.

---

## Quick Start

### Option 1: Open Live Web App
Open the deployed studio at **[https://vedantexists.github.io/pdf-studio/](https://vedantexists.github.io/pdf-studio/)**.

### Option 2: Open directly from disk
Open `index.html` directly in any modern web browser (Chrome, Edge, Firefox, Safari).

### Option 3: Run local development server
```bash
npm start
```
Then visit [http://localhost:3000](http://localhost:3000).

---

## 🧪 Automated Verification Suite
Run the 94-test automated test harness covering privacy invariants, zero-network egress traps, conversion engines, and security cipher guards:
```bash
npm test
```

---

## Repository Structure & Developer Notes
- `pdf_core.js`: Pure PDF manipulation logic powered by `pdf-lib` and WebCrypto.
- `app.js`: Application controller, drag-and-drop intake, and thumbnail rendering via `pdfjs-dist`.
- `index.html` / `style.css`: Responsive dashboard grid and mega-menu navigation.
- `vendor/`: Self-contained vendor libraries (`pdf-lib.min.js`, `jszip.min.js`, `pdf.min.js`, `pdf.worker.min.js`, `pdf-lib-encrypt.js`).
- `test/`: 7 test suites validating core features, security, compression, and zero egress.

---

## License
[MIT](LICENSE) © 2026 Vedant Kushwaha
