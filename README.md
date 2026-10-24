# PDF Studio - Fast, Zero-Upload Client-Side PDF Tools

> **100% private, in-browser PDF manipulation suite. Zero server uploads.**

[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen.svg)](https://vedantexists.github.io/pdf-studio/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Privacy: 100% Local](https://img.shields.io/badge/privacy-100%25%20local-emerald.svg)](#-100-in-browser-privacy)

🌐 **Live Studio**: [https://vedantexists.github.io/pdf-studio/](https://vedantexists.github.io/pdf-studio/)

---

## 🎬 Live Interactive Preview

![PDF Studio Workflow](assets/demo.svg)

---

## Features
- **Organize & Structure**:
  - **Merge PDF**: Combine multiple PDFs into a single document in custom sequence.
  - **Split PDF**: Extract all pages as separate PDFs (ZIP) or extract custom page ranges (e.g. `1-3, 5`).
  - **Organize PDF**: Visual thumbnail grid to reorder, delete, and rotate pages individually.
  - **Remove Pages**: Target and delete unwanted pages cleanly.
  - **Extract Pages**: Pull selected pages into a standalone PDF.
- **Optimize & Repair**:
  - **Compress PDF**: In-memory stream compaction & metadata stripping reducing file size while preserving readability.
  - **Repair PDF**: Scans token streams and synthesizes clean XRef offset tables to recover damaged or unreadable PDFs.
- **Conversion**:
  - **PDF to JPG / PNG**: Convert PDF pages into crisp high-resolution images (individual or ZIP).
  - **JPG / PNG to PDF**: Assemble images into a formatted PDF document with customizable margins.
  - **Scan to PDF**: Capture multi-page documents directly using your mobile camera or desktop webcam.
  - **Text to PDF**: Convert plain text or markdown notes into cleanly formatted, paginated PDF documents.
  - **PDF to Text / Markdown**: Extract structured text, paragraphs, and headings from PDFs into clean Markdown or TXT.
- **Enhance & Edit**:
  - **Rotate PDF**: Rotate all or specific pages 90°, 180°, or 270°.
  - **Watermark PDF**: Add custom text watermarks with control over opacity, font size, angle, and color.
  - **Page Numbers**: Add clean page numbering across all pages with customizable placement.
  - **Crop PDF**: Adjust page dimensions and crop bounding boxes.
- **Security & Forms**:
  - **Sign PDF**: Create drawn, typed, or uploaded electronic signature stamps onto document pages.
  - **Unlock PDF**: Decrypt open passwords and strip permissions restrictions in-memory.
  - **Protect PDF**: Real AES-256 in-browser encryption requiring passwords across Adobe Acrobat, Chrome, and mobile.
  - **Redact PDF**: Permanently blackout sensitive numbers, private text, or confidential rectangular regions.
  - **Compare PDF**: Spot modifications and visual discrepancies between two PDF revisions.
  - **PDF Forms**: Inspect and fill interactive form fields with options to save or permanently flatten.

---

## 🔒 100% In-Browser Privacy
All processing happens entirely in client memory using WebAssembly and pure JavaScript (`pdf-lib`, `pdfjs-dist`, `jszip`).
- **Zero data retention**: Documents never leave your browser tab.
- **`server.js` is strictly an optional, local static development server**: It has zero API routes, zero storage, and performs no data handling—it simply serves HTML, CSS, and JS files over localhost.
- Works fully offline once loaded.

---

---

## 🛡️ Security & Cryptography Details

PDF Studio handles security directly in-browser using standard Web Crypto and PDF ISO 32000 specifications:

### 1. Password Protection (Real AES-256 In-Browser Encryption)
- **Standard**: Uses genuine ISO 32000-1 / PDF 2.0 **AES-256** encryption (`/V 5 /R 6 /AESV3`) with Web Crypto key derivation.
- **Cross-Reader Verification**: Encrypted PDFs are genuinely ciphered at the stream and string level. When opened in **Adobe Acrobat, Google Chrome, Mozilla Firefox, Microsoft Edge, Apple Preview, or mobile PDF readers (iOS/Android)**, the reader strictly demands the password before displaying pages or rendering content.
- **Configurable Permissions**: Restrict copying, modification, or printing while keeping the file readable.

### 2. Unlocking: Open Password vs. Permissions Locks
PDF security comes in two distinct modes, and PDF Studio handles each appropriately:
- **Files with an Open (User) Password**: The file cannot be read without authentication. To unlock, you must provide the password. PDF Studio verifies the password, decrypts all object streams in-memory, and removes the `/Encrypt` dictionary, returning a clean, unencrypted PDF.
- **Files with Permissions Restrictions Only (Owner Lock, No Open Password)**: Some PDFs open freely in any reader, but restrict printing, copying text, or extracting pages. Because these files have an empty open password, **no password is required to unlock them**—simply click **Unlock Document** to strip the restriction dictionary and restore full copying and printing capabilities.

### 3. Sign PDF: Visual Electronic Stamp vs. Cryptographic Certificate
> **⚠️ Legal & Technical Transparency Note:**
>
> The **Sign PDF** tool in PDF Studio creates an **Electronic Signature Stamp (e-Signature)**—a high-resolution visual signature graphic (drawn on canvas, typed with handwriting fonts, or uploaded as an image) baked directly into the document's page stream.
>
> - **What it is**: An electronic mark/overlay permanently rendered onto the PDF canvas.
> - **What it is NOT**: It is **not** a cryptographic PKI / X.509 digital signature (PAdES / Adobe Approved Trust List). It does not embed a private key digital certificate, mathematical cryptographic digest, or timestamp authority token.
> - **Legal Validity**: While electronic signature stamps are commonly accepted for informal contracts, internal approvals, receipts, and day-to-day forms, formal government filings, legal deeds, and regulated financial contracts may legally mandate certified cryptographic digital signatures. Always verify the compliance requirements of your jurisdiction and counterparty.

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

## Automated Verification Suite
Run the automated test harness:
```bash
npm test
```

---

## Repository Structure & Developer Notes
- `pdf_core.js`: Pure PDF manipulation logic powered by `pdf-lib`.
- `app.js`: Presentation, drag-and-drop intake, and thumbnail rendering via `pdfjs-dist`.
- `index.html` / `style.css`: UI and responsive mega-menu navigation.
- `PROJECT.md`: Technical architectural specifications and milestone tracker for the active expansion roadmap.
- `server.js`: Zero-dependency static file server for local testing.

---

## License
[MIT](LICENSE) © 2026 Vedant Kushwaha
