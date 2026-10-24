# PDF-Studio - Fast, Zero-Upload Client-Side PDF tool

> **100% private, in-browser PDF manipulation suite. Zero server uploads.**

[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen.svg)](https://vedantexists.github.io/pdf-studio/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Privacy: 100% Local](https://img.shields.io/badge/privacy-100%25%20local-emerald.svg)](#-100-in-browser-privacy)

🌐 **Live Studio**: [https://vedantexists.github.io/pdf-studio/](https://vedantexists.github.io/pdf-studio/)

---

## 🎬 Live Interactive Preview

![PDFForge Studio Workflow](assets/demo.svg)

---

## Features
- **Organize & Structure**:
  - **Merge PDF**: Combine multiple PDFs into a single document in custom sequence.
  - **Split PDF**: Extract all pages as separate PDFs (ZIP) or extract custom page ranges (e.g. `1-3, 5`).
  - **Organize PDF**: Visual thumbnail grid to reorder, delete, and rotate pages individually.
  - **Remove Pages**: Target and delete unwanted pages cleanly.
  - **Extract Pages**: Pull selected pages into a standalone PDF.
- **Conversion**:
  - **PDF to JPG / PNG**: Convert PDF pages into crisp high-resolution images (individual or ZIP).
  - **JPG / PNG to PDF**: Assemble images into a formatted PDF document with customizable margins.
- **Enhance & Edit**:
  - **Rotate PDF**: Rotate all or specific pages 90°, 180°, or 270°.
  - **Watermark PDF**: Add custom text watermarks with control over opacity, font size, angle, and color.
  - **Page Numbers**: Add clean page numbering across all pages with customizable placement.
  - **Crop PDF**: Adjust page dimensions and crop bounding boxes.
- **Security & Forms**:
  - **Sign PDF**: Create drawn, typed, or uploaded signatures and stamp them onto document pages.
  - **Unlock PDF**: Remove passwords and permissions restrictions to view, copy, and print freely.
  - **Protect PDF**: Encrypt documents with robust user passwords.
  - **PDF Forms**: Inspect and fill interactive form fields with options to save or permanently flatten.

---

## 🔒 100% In-Browser Privacy
All processing happens entirely in client memory using WebAssembly and pure JavaScript (`pdf-lib`, `pdfjs-dist`, `jszip`).
- **Zero data retention**: Documents never leave your browser tab.
- **`server.js` is strictly an optional, local static development server**: It has zero API routes, zero storage, and performs no data handling—it simply serves HTML, CSS, and JS files over localhost.
- Works fully offline once loaded.

---

## Quick Start

### Option 1: Open Live Web App
Open the deployed studio at **[https://vedantexists.github.io/pdftool/](https://vedantexists.github.io/pdftool/)**.

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
