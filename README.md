# PDFTool - Fast & Private Client-Side PDF Tools (iLovePDF Clone)

A lightweight, zero-server-upload iLovePDF clone that runs 100% in the browser.

## Features
- **Merge PDF**: Combine multiple PDFs into a single document in custom order.
- **Split PDF**: Extract all pages as separate PDFs (zipped) or extract custom page ranges (e.g. `1-3, 5`).
- **Organize PDF**: Visual thumbnail grid to reorder, delete, and rotate pages individually.
- **Rotate PDF**: Rotate all or specific pages 90°, 180°, or 270°.
- **PDF to JPG / PNG**: Convert PDF pages into high-resolution images (individual or ZIP).
- **JPG / PNG to PDF**: Convert image files into a formatted PDF document.
- **Watermark PDF**: Add custom text watermarks with control over opacity, font size, angle, and color.
- **Page Numbers**: Add clean page numbering across all pages.

## Privacy & Security
All processing happens entirely in client memory using WebAssembly and pure JavaScript (`pdf-lib`, `pdfjs-dist`). **No files or documents are ever uploaded to any server or cloud.**

## Quick Start

### Option 1: Open directly
Open `index.html` in any modern web browser (Chrome, Edge, Firefox, Safari).

### Option 2: Run local development server
```bash
npm start
```
Then visit [http://localhost:3000](http://localhost:3000).

## Testing
Run the automated assert-based test suite verifying all core PDF operations:
```bash
npm test
```
