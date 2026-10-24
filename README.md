# PDFTool - Fast & Private Client-Side PDF Tools (iLovePDF Clone)

> **100% private, client-side PDF tool suite. No server uploads.**

[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen.svg)](https://vedantexists.github.io/pdftool/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🌐 **Live Demo**: [https://vedantexists.github.io/pdftool/](https://vedantexists.github.io/pdftool/)

---

## Features
- **Merge PDF**: Combine multiple PDFs into a single document in custom order.
- **Split PDF**: Extract all pages as separate PDFs (zipped) or extract custom page ranges (e.g. `1-3, 5`).
- **Organize PDF**: Visual thumbnail grid to reorder, delete, and rotate pages individually.
- **Rotate PDF**: Rotate all or specific pages 90°, 180°, or 270°.
- **PDF to JPG / PNG**: Convert PDF pages into high-resolution images (individual or ZIP).
- **JPG / PNG to PDF**: Convert image files into a formatted PDF document.
- **Watermark PDF**: Add custom text watermarks with control over opacity, font size, angle, and color.
- **Page Numbers**: Add clean page numbering across all pages.
- **Security & Forms (In Progress - Phase 1)**: Sign PDF, Unlock PDF, Protect PDF, Crop PDF, and PDF Forms.

## 🔒 100% In-Browser Privacy
All processing happens entirely in client memory using WebAssembly and pure JavaScript (`pdf-lib`, `pdfjs-dist`, `jszip`).
- **No files or documents are ever uploaded to any server or cloud.**
- **`server.js` is strictly an optional, local static development server**: It has zero API routes, zero storage, and performs no data handling—it simply serves HTML, CSS, and JS files over localhost.
- Works fully offline once loaded.

## Quick Start

### Option 1: Open Live Web App
Visit **[https://vedantexists.github.io/pdftool/](https://vedantexists.github.io/pdftool/)**.

### Option 2: Open directly from disk
Open `index.html` in any modern web browser (Chrome, Edge, Firefox, Safari).

### Option 3: Run local development server
```bash
npm start
```
Then visit [http://localhost:3000](http://localhost:3000).

## Testing
Run the automated test suite verifying all core PDF operations:
```bash
npm test
```

## Repository Structure & Developer Notes
- `pdf_core.js`: Pure PDF manipulation logic powered by `pdf-lib`.
- `app.js`: Presentation, drag-and-drop intake, and thumbnail rendering via `pdfjs-dist`.
- `index.html` / `style.css`: UI and responsive mega-menu navigation.
- `PROJECT.md`: Technical architectural specifications and milestone tracker for the active expansion roadmap.
- `server.js`: Zero-dependency static file server for local testing.

## License
[MIT](LICENSE) © 2026 Vedant Kushwaha
