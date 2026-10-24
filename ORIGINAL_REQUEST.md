# Original User Request

## 2026-10-24T08:54:57Z

Implement Phase 1 (Security & Editing suite) of the 100% client-side iLovePDF clone in `pdftool`, adding Sign PDF, Protect/Unlock PDF, Crop PDF, PDF Forms, dedicated Remove/Extract pages, and the top mega-menu navigation while preserving zero server uploads and lazy senior developer principles.

Working directory: c:\Users\vedan\OneDrive\Desktop\projects\pdftool
Integrity mode: development

## Requirements

### R1. Document Security Suite (Sign, Unlock, Protect)
- Implement **Sign PDF**: modal supporting Draw signature (canvas), Type signature, and Upload signature image, with drag-and-drop placement on any page, baked into the document.
- Implement **Unlock PDF**: decrypt password-protected PDFs or strip standard permission restrictions using in-memory PDF manipulation.
- Implement **Protect PDF**: password encryption for output PDFs.

### R2. Document Editing & Forms (Crop, PDF Forms)
- Implement **Crop PDF**: visual crop bounding box on page preview that updates `page.setCropBox(x, y, width, height)`.
- Implement **PDF Forms**: inspect form fields using `doc.getForm()`, render accessible interactive HTML form fields to fill, and support both saving filled fields and flattening (`form.flatten()`).
- Add dedicated **Remove Pages** and **Extract Pages** tool entry points.

### R3. Mega-Menu Header & Modular Architecture
- Update the application header to include the dropdown navigation bar matching iLovePDF categories (`Organize`, `Optimize`, `Convert To`, `Convert From`, `Edit`, `Security`).
- Ensure all new tools follow the established patterns in `pdf_core.js`, `app.js`, and `style.css` without breaking existing tools (Merge, Split, Rotate, Organize, Rotate, Watermark, Page Numbers, PDF to JPG, JPG to PDF).

## Acceptance Criteria

### Automated Self-Checks & Core Operations
- [ ] Programmatic test suite in `test/test_phase1.js` (or integrated into `npm test`) verifies all new core operations pass (unlock, protect, crop, form fill/flatten, remove/extract) with zero failures.
- [ ] Existing `test/test_core.js` continues to pass 100% cleanly without regressions.

### Client-Side Execution & Privacy
- [ ] All PDF modifications execute 100% in-browser / in-memory with zero network uploads.
- [ ] Detached buffer protections (`.slice()`) are preserved across all tools.
