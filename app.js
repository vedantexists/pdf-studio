/**
 * PDFTool - iLovePDF Clone Application Controller
 * Handles UI interactions, file intake, PDF.js rendering, and PDFCore executions.
 */
/**
 * HTML Escaping utility to prevent XSS injection across all dynamic UI sites
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
  const PDFCore = window.PDFCore || (typeof self !== 'undefined' ? self.PDFCore : null);

  // Wire PDF.js worker directly to local bundled vendor asset
  if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  }

  // DOM Elements
  const dashboardView = document.getElementById('dashboardView');
  const workspaceView = document.getElementById('workspaceView');
  const homeLogoBtn = document.getElementById('homeLogoBtn');
  const backBtn = document.getElementById('backBtn');
  const toolCards = document.querySelectorAll('.tool-card');

  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileDrawer = document.getElementById('mobileDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');
  const dropdownToggles = document.querySelectorAll('.nav-dropdown-toggle');

  const activeToolIcon = document.getElementById('activeToolIcon');
  const activeToolTitle = document.getElementById('activeToolTitle');
  const dropzone = document.getElementById('dropzone');
  const dropzoneHeading = document.getElementById('dropzoneHeading');
  const dropzoneSubtitle = document.getElementById('dropzoneSubtitle');
  const browseBtn = document.getElementById('browseBtn');
  const pdfFileInput = document.getElementById('pdfFileInput');
  const imgFileInput = document.getElementById('imgFileInput');

  const workArea = document.getElementById('workArea');
  const filesList = document.getElementById('filesList');
  const pagesGrid = document.getElementById('pagesGrid');
  const toolSettings = document.getElementById('toolSettings');
  const executeBtn = document.getElementById('executeBtn');
  const executeBtnText = document.getElementById('executeBtnText');
  const cancelProcessBtn = document.getElementById('cancelProcessBtn');
  const statusBanner = document.getElementById('statusBanner');

  const jobRunner = (typeof JobRunner !== 'undefined') ? new JobRunner({
    onProgress(percent, stage) {
      showStatus(`Processing... ${percent}% (${stage})`, 'processing');
    },
    onError(err) {
      showStatus(err.userMessage || err.message || 'Operation failed.', 'error');
    }
  }) : null;

  if (cancelProcessBtn) {
    cancelProcessBtn.addEventListener('click', () => {
      if (jobRunner) {
        jobRunner.cancel();
      }
    });
  }

  async function executeCoreOp(op, args) {
    if (jobRunner) {
      return await jobRunner.start({ operation: op, args });
    }
    const fn = PDFCore && PDFCore[op];
    if (!fn) throw new Error(`Operation ${op} not found`);
    return await fn(...args);
  }

  // App State
  let currentTool = null;
  let uploadedFiles = []; // Array<{ file: File, bytes: Uint8Array, pageCount: number, name: string, size: number }>
  let activePages = [];   // Array<{ pageNum: number, rotation: number, isDeleted: boolean }>
  let isProcessing = false;

  // Signature & Document Security Suite State
  let currentSignatureDataUrl = null;
  let signCurrentPageIndex = 0;
  let sigOverlayPos = { left: 40, top: 60, width: 160, height: 80 };
  let currentPdfPageSize = { width: 612, height: 792 };
  let isDraggingSig = false;
  let isResizingSig = false;
  let sigDragStart = { x: 0, y: 0, left: 40, top: 60, width: 160, height: 80 };
  let activeSignTab = 'draw';
  let sigColor = '#000000';
  let sigStrokeWidth = 2;
  let sigFont = "'Dancing Script', cursive";
  let hasDrawn = false;

  // Crop Tool State
  let cropCurrentPageIndex = 0;
  let cropOverlayPos = { left: 30, top: 30, width: 320, height: 420 };
  let cropPageSize = { width: 612, height: 792 };
  let isDraggingCrop = false;
  let activeCropResizeHandle = null;
  let cropDragStart = { x: 0, y: 0, left: 30, top: 30, width: 320, height: 420 };

  // PDF Forms State
  let inspectedFormFields = [];

  // Dedicated Page Selection Sets (1-based page numbers)
  let selectedRemovePages = new Set();
  let selectedExtractPages = new Set();

  // PDF.js Memory Management & Active Document Tracking
  const activePdfDocs = new Set();
  let currentThumbPdfDoc = null;
  function trackPdfDoc(doc) {
    if (doc && typeof doc.destroy === 'function') {
      activePdfDocs.add(doc);
    }
    return doc;
  }
  async function cleanupActivePdfDocs() {
    if (currentThumbPdfDoc && typeof currentThumbPdfDoc.destroy === 'function') {
      try {
        await currentThumbPdfDoc.destroy();
      } catch (e) {}
      currentThumbPdfDoc = null;
    }
    for (const doc of activePdfDocs) {
      try {
        if (typeof doc.destroy === 'function') {
          await doc.destroy();
        }
      } catch (e) {}
    }
    activePdfDocs.clear();
  }

  // Complete Tools Registry
  const TOOLS = {
    'merge': {
      title: 'Merge PDF',
      icon: '⤯',
      actionText: 'Merge PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: Infinity,
      multiple: true,
      description: 'Combine multiple PDFs into one unified document in any order you choose.',
    },
    'split': {
      title: 'Split PDF',
      icon: '✂',
      actionText: 'Split PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Separate one page, custom ranges, or extract all pages into individual files.',
    },
    'organize': {
      title: 'Organize PDF',
      icon: '☷',
      actionText: 'Save Organized PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Sort, delete, and rotate pages visually with interactive thumbnail grid and mobile touch reordering.',
    },
    'rotate': {
      title: 'Rotate PDF',
      icon: '↻',
      actionText: 'Save Rotated PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Rotate your PDF pages 90°, 180°, or 270° clockwise or counter-clockwise.',
    },
    'pdf-to-img': {
      title: 'PDF to JPG / PNG',
      icon: '🖼',
      actionText: 'Convert to Images',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Convert each page of a PDF into high-quality images and download them or get a ZIP.',
    },
    'img-to-pdf': {
      title: 'JPG / PNG to PDF',
      icon: '📄',
      actionText: 'Convert to PDF',
      accept: 'image/jpeg,image/png,image/webp',
      acceptImages: true,
      maxFiles: Infinity,
      multiple: true,
      description: 'Convert images to PDF in seconds. Easily adjust orientation and margins.',
    },
    'watermark': {
      title: 'Watermark PDF',
      icon: '✎',
      actionText: 'Apply Watermark',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Stamp custom text over your PDF. Choose typography, transparency, angle and color.',
    },
    'page-numbers': {
      title: 'Page Numbers',
      icon: '🔢',
      actionText: 'Add Page Numbers',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Add sequential page numbers to all pages with customizable positioning.',
    },
    'sign': {
      title: 'Sign PDF',
      icon: '✍️',
      actionText: 'Sign & Download',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Create drawn, typed, or uploaded signatures and stamp them onto document pages.',
    },
    'unlock': {
      title: 'Unlock PDF',
      icon: '🔓',
      actionText: 'Unlock PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Remove PDF password security and permissions restrictions in memory.',
    },
    'protect': {
      title: 'Protect PDF',
      icon: '🔒',
      actionText: 'Protect PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Encrypt PDF files with robust user passwords and configurable document permissions.',
    },
    'crop': {
      title: 'Crop PDF',
      icon: '✂️',
      actionText: 'Crop & Save',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Trim page margins or specify exact crop boundaries with interactive visual preview.',
    },
    'forms': {
      title: 'PDF Forms',
      icon: '📝',
      actionText: 'Save Form',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Inspect and fill interactive form fields with options to save or permanently flatten.',
    },
    'remove-pages': {
      title: 'Remove Pages',
      icon: '🗑️',
      actionText: 'Remove Pages',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Delete unwanted pages from your PDF while preserving catalog and form integrity.',
    },
    'extract-pages': {
      title: 'Extract Pages',
      icon: '📑',
      actionText: 'Extract Pages',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Extract specific pages or custom ranges into a new standalone PDF or ZIP archive.',
    },
    'scan-to-pdf': {
      title: 'Scan to PDF',
      icon: '📷',
      actionText: 'Open Camera Scanner',
      accept: '.pdf,application/pdf,image/*',
      acceptImages: true,
      maxFiles: Infinity,
      multiple: true,
      description: 'Capture documents directly from camera, apply auto-contrast, and compile into PDF.',
    },
    'compress': {
      title: 'Compress PDF',
      icon: '⚡',
      actionText: 'Compress PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Reduce file size while keeping visual quality with smart image downsampling.',
    },
    'repair': {
      title: 'Repair PDF',
      icon: '🩹',
      actionText: 'Repair PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Fix damaged or corrupted PDFs and reconstruct broken cross-reference tables.',
    },
    'ocr-pdf': {
      title: 'OCR PDF (Beta)',
      icon: '🔍',
      actionText: 'Perform OCR',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Inject a searchable, selectable text layer locally into PDFs without cloud uploads or language pack downloads (Beta).',
    },
    'word-to-pdf': {
      title: 'Word to PDF (Beta)',
      icon: '📘',
      actionText: 'Convert to PDF',
      accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Basic client-side conversion of Word documents (.docx) text and paragraphs into PDF.',
    },
    'powerpoint-to-pdf': {
      title: 'PowerPoint to PDF (Beta)',
      icon: '📊',
      actionText: 'Convert to PDF',
      accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Basic client-side conversion of PowerPoint (.pptx) slide text and notes into PDF pages.',
    },
    'excel-to-pdf': {
      title: 'Excel to PDF (Beta)',
      icon: '📗',
      actionText: 'Convert to PDF',
      accept: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Basic client-side conversion of Excel (.xlsx) spreadsheet grids into formatted PDF table pages.',
    },
    'html-to-pdf': {
      title: 'HTML to PDF (Beta)',
      icon: '🌐',
      actionText: 'Convert to PDF',
      accept: '.html,.htm,text/html',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Basic client-side conversion of HTML markup and text into formatted PDF pages.',
    },
    'pdf-to-word': {
      title: 'PDF to Word (Beta)',
      icon: '📄',
      actionText: 'Convert to Word',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Basic client-side extraction of PDF text and layout into editable Microsoft Word (.docx) files.',
    },
    'pdf-to-powerpoint': {
      title: 'PDF to PowerPoint (Beta)',
      icon: '📑',
      actionText: 'Convert to PPTX',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Basic client-side extraction of PDF pages and text content into Microsoft PowerPoint (.pptx) slides.',
    },
    'pdf-to-excel': {
      title: 'PDF to Excel (Beta)',
      icon: '📈',
      actionText: 'Convert to Excel',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Basic client-side extraction of tabular text from PDF into Microsoft Excel (.xlsx) spreadsheets.',
    },
    'pdf-to-pdfa': {
      title: 'PDF/A Metadata (Beta)',
      icon: '🏛️',
      actionText: 'Append PDF/A Metadata',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'PDF/A metadata only (not validated, not conformant). Appends XMP metadata and sRGB OutputIntents.',
    },
    'pdf-to-text': {
      title: 'PDF to Text',
      icon: '📝',
      actionText: 'Extract Text',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Extract clean plain text or formatted Markdown from PDF pages.',
    },
    'edit-pdf': {
      title: 'Edit PDF',
      icon: '✏️',
      actionText: 'Save Edited PDF',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Add freehand drawing, highlighter, annotations, and shapes directly to PDF pages.',
    },
    'redact': {
      title: 'Redact PDF',
      icon: '⬛',
      actionText: 'Apply Redaction',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Permanently remove sensitive text and graphics with irreversible blackout boxes.',
    },
    'compare': {
      title: 'Compare PDF',
      icon: '⚖️',
      actionText: 'Compare Documents',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 2,
      multiple: true,
      description: 'Compare two PDF documents side-by-side or with interactive difference overlay.',
    },
    'text-to-pdf': {
      title: 'Text to PDF',
      icon: '📋',
      actionText: 'Convert to PDF',
      accept: '.txt,.md,text/plain,text/markdown',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Convert plain text notes or markdown into clean, paginated PDF documents.',
    },
    'ai-summarizer': {
      title: 'AI Summarizer (Beta)',
      icon: '💡',
      actionText: 'Generate Summary',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Extractive in-memory summary & bullet key takeaways using local sentence significance scoring (100% private, no external APIs).',
    },
    'translate-pdf': {
      title: 'Translate PDF (Glossary)',
      icon: '🌐',
      actionText: 'Translate Glossary Terms',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Local keyword and glossary translation using built-in dictionaries (ES, FR, DE, IT) with zero network transmission. Never uploads documents to cloud translation APIs.',
    },
    'pdf-to-markdown': {
      title: 'PDF to Markdown',
      icon: '📑',
      actionText: 'Convert to Markdown',
      accept: '.pdf,application/pdf',
      acceptImages: false,
      maxFiles: 1,
      multiple: false,
      description: 'Convert PDF pages into structured, clean Markdown (.md) headings, lists, and tables.',
    },
  };

  // Aliases for hyphenated variants
  TOOLS['summarizer'] = TOOLS['ai-summarizer'];
  TOOLS['translate'] = TOOLS['translate-pdf'];
  TOOLS['pdf-to-md'] = TOOLS['pdf-to-markdown'];
  TOOLS['scan'] = TOOLS['scan-to-pdf'];
  TOOLS['compress-pdf'] = TOOLS['compress'];
  TOOLS['repair-pdf'] = TOOLS['repair'];
  TOOLS['ocr'] = TOOLS['ocr-pdf'];
  TOOLS['redact-pdf'] = TOOLS['redact'];
  TOOLS['compare-pdf'] = TOOLS['compare'];
  TOOLS['sign-pdf'] = TOOLS['sign'];
  TOOLS['unlock-pdf'] = TOOLS['unlock'];
  TOOLS['protect-pdf'] = TOOLS['protect'];
  TOOLS['crop-pdf'] = TOOLS['crop'];
  TOOLS['pdf-forms'] = TOOLS['forms'];
  TOOLS['edit'] = TOOLS['edit-pdf'];

  // Backward compatibility & global access
  const TOOL_METADATA = TOOLS;
  window.TOOLS = TOOLS;
  window.TOOL_METADATA = TOOLS;

  // Category mapping for active indicator
  const CATEGORY_MAP = {
    'organize': ['merge', 'split', 'remove-pages', 'extract-pages', 'organize', 'scan-to-pdf'],
    'optimize': ['compress', 'repair', 'ocr-pdf'],
    'convert-to': ['img-to-pdf', 'word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf', 'html-to-pdf'],
    'convert-from': ['pdf-to-img', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'pdf-to-pdfa', 'pdf-to-text'],
    'edit': ['rotate', 'page-numbers', 'watermark', 'edit-pdf', 'crop', 'redact', 'crop-pdf', 'forms', 'pdf-forms'],
    'security': ['unlock', 'protect', 'sign', 'compare', 'unlock-pdf', 'protect-pdf', 'sign-pdf', 'compare-pdf'],
    'intelligence': ['ai-summarizer', 'translate-pdf', 'pdf-to-markdown', 'summarizer', 'translate', 'pdf-to-md'],
  };

  function updateActiveNavIndicator(toolKey) {
    dropdownToggles.forEach(t => t.classList.remove('active'));
    for (const [category, tools] of Object.entries(CATEGORY_MAP)) {
      if (tools.includes(toolKey)) {
        const toggle = document.querySelector(`.nav-dropdown-toggle[data-category="${category}"]`);
        if (toggle) toggle.classList.add('active');
        break;
      }
    }
  }

  function cleanupWorkspaceCustomContainers() {
    const signExisting = document.getElementById('signPreviewContainer');
    if (signExisting && signExisting.parentNode) signExisting.parentNode.removeChild(signExisting);
    const cropExisting = document.getElementById('cropPreviewContainer');
    if (cropExisting && cropExisting.parentNode) cropExisting.parentNode.removeChild(cropExisting);
    const editExisting = document.getElementById('editPreviewContainer');
    if (editExisting && editExisting.parentNode) editExisting.parentNode.removeChild(editExisting);
  }

  function removeSignPreview() {
    cleanupWorkspaceCustomContainers();
  }

  // --- Navigation & Routing ---
  async function showDashboard() {
    await cleanupActivePdfDocs();
    currentTool = null;
    uploadedFiles = [];
    activePages = [];
    pdfFileInput.value = '';
    imgFileInput.value = '';
    currentSignatureDataUrl = null;
    signCurrentPageIndex = 0;
    editCurrentPageIndex = 0;
    editAnnotationsByPage = {};
    isDrawingAnnotation = false;
    removeSignPreview();
    hideStatus();
    dropdownToggles.forEach(t => t.classList.remove('active'));

    dashboardView.style.display = 'block';
    workspaceView.style.display = 'none';
    workArea.style.display = 'none';
    dropzone.style.display = 'block';
  }

  async function openTool(toolKey) {
    if (!TOOLS[toolKey]) {
      console.warn(`Tool "${toolKey}" is not recognized.`);
      return;
    }

    // Switch views immediately so UI responds with zero delay
    dashboardView.style.display = 'none';
    workspaceView.style.display = 'block';

    cleanupActivePdfDocs().catch(() => {});
    currentTool = toolKey;
    uploadedFiles = [];
    activePages = [];
    pdfFileInput.value = '';
    imgFileInput.value = '';
    currentSignatureDataUrl = null;
    signCurrentPageIndex = 0;
    editCurrentPageIndex = 0;
    editAnnotationsByPage = {};
    isDrawingAnnotation = false;
    removeSignPreview();
    hideStatus();

    const meta = TOOLS[toolKey];
    activeToolTitle.textContent = meta.title;
    activeToolIcon.textContent = meta.icon;
    executeBtnText.textContent = meta.actionText;

    if (meta.accept) {
      pdfFileInput.accept = meta.accept;
    } else {
      pdfFileInput.accept = meta.acceptImages ? 'image/*' : '.pdf,application/pdf';
    }
    pdfFileInput.multiple = !!meta.multiple;

    if (toolKey === 'text-to-pdf' || toolKey === 'txt-to-pdf') {
      uploadedFiles = [{ name: 'document.txt', size: 0, bytes: new Uint8Array(), pageCount: 1 }];
      dashboardView.style.display = 'none';
      workspaceView.style.display = 'block';
      dropzone.style.display = 'none';
      workArea.style.display = 'block';
      updateActiveNavIndicator(toolKey);
      await renderToolWorkspace();
      return;
    }

    if (toolKey === 'scan-to-pdf' || toolKey === 'scan') {
      dropzoneHeading.textContent = 'Scan Documents from Camera or Upload Photos';
      dropzoneSubtitle.textContent = 'Capture pages directly with your device camera or select photos to assemble into PDF';
      browseBtn.innerHTML = '<span>📷 Launch Camera Scanner</span>';
    } else if (toolKey === 'compare' || toolKey === 'compare-pdf') {
      dropzoneHeading.textContent = 'Select 2 PDF Documents to Compare';
      dropzoneSubtitle.textContent = 'Select Document A and Document B to spot visual changes & pixel differences';
      browseBtn.innerHTML = '<span>Choose PDF Documents</span>';
    } else if (toolKey === 'compress' || toolKey === 'compress-pdf') {
      dropzoneHeading.textContent = 'Select PDF file to compress';
      dropzoneSubtitle.textContent = 'Smart stream compaction & image downsampling • 100% Private';
      browseBtn.innerHTML = '<span>Choose PDF Document</span>';
    } else if (toolKey === 'repair' || toolKey === 'repair-pdf') {
      dropzoneHeading.textContent = 'Select damaged or corrupted PDF file';
      dropzoneSubtitle.textContent = 'Reconstructs XRef tables, heals EOF markers & object graphs';
      browseBtn.innerHTML = '<span>Choose PDF Document</span>';
    } else if (toolKey === 'redact' || toolKey === 'redact-pdf') {
      dropzoneHeading.textContent = 'Select PDF file to redact';
      dropzoneSubtitle.textContent = 'Permanently black out private text and strip underlying stream data';
      browseBtn.innerHTML = '<span>Choose PDF Document</span>';
    } else if (toolKey === 'pdf-to-text' || toolKey === 'pdf-to-txt') {
      dropzoneHeading.textContent = 'Select PDF file to extract text';
      dropzoneSubtitle.textContent = 'Extracts all text, headings, and markdown tables directly in-browser';
      browseBtn.innerHTML = '<span>Choose PDF Document</span>';
    } else if (meta.acceptImages) {
      dropzoneHeading.textContent = 'Select Image files';
      dropzoneSubtitle.textContent = 'or drag and drop JPG, PNG, WebP images here';
      browseBtn.innerHTML = '<span>Choose Image Files</span>';
    } else {
      dropzoneHeading.textContent = 'Select PDF files';
      dropzoneSubtitle.textContent = 'or drag and drop PDFs here';
      browseBtn.innerHTML = '<span>Choose PDF Document</span>';
    }

    dashboardView.style.display = 'none';
    workspaceView.style.display = 'block';
    dropzone.style.display = 'block';
    workArea.style.display = 'none';

    updateActiveNavIndicator(toolKey);
  }
  window.openTool = openTool;

  // Drawer & Dropdown Helpers
  function closeMobileDrawer() {
    if (mobileDrawer) mobileDrawer.classList.remove('is-open');
    if (drawerOverlay) drawerOverlay.classList.remove('is-open');
    if (mobileMenuToggle) mobileMenuToggle.setAttribute('aria-expanded', 'false');
  }

  function openMobileDrawer() {
    if (mobileDrawer) mobileDrawer.classList.add('is-open');
    if (drawerOverlay) drawerOverlay.classList.add('is-open');
    if (mobileMenuToggle) mobileMenuToggle.setAttribute('aria-expanded', 'true');
  }

  function closeAllDropdowns() {
    dropdownToggles.forEach(t => t.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('is-open'));
  }

  // Mega-menu and Mobile Drawer tool links click handlers
  const megaMenuLinks = document.querySelectorAll('.nav-tool-link, .drawer-tool-link');
  megaMenuLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tool = link.dataset.tool;
      if (link.classList.contains('is-disabled')) {
        alert('Compress PDF is coming soon! All processing is 100% client-side in your browser.');
        closeMobileDrawer();
        closeAllDropdowns();
        return;
      }
      closeMobileDrawer();
      closeAllDropdowns();
      if (tool && TOOLS[tool]) {
        openTool(tool);
      }
    });
  });

  // Mobile menu toggle button
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileDrawer && mobileDrawer.classList.contains('is-open');
      if (isOpen) {
        closeMobileDrawer();
      } else {
        openMobileDrawer();
      }
    });
  }

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', closeMobileDrawer);
  }

  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', closeMobileDrawer);
  }

  // Dropdown toggles
  dropdownToggles.forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      closeAllDropdowns();
      if (!isExpanded) {
        toggle.setAttribute('aria-expanded', 'true');
        const dropdown = toggle.nextElementSibling;
        if (dropdown) dropdown.classList.add('is-open');
      }
    });
  });

  // Click outside to close dropdowns
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-item')) {
      closeAllDropdowns();
    }
  });

  // Escape key closes dropdowns and mobile drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdowns();
      closeMobileDrawer();
    }
  });

  toolCards.forEach((card) => {
    const tool = card.dataset.tool;
    card.addEventListener('click', () => openTool(tool));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTool(tool);
      }
    });
  });

  // Global delegation ensuring any card click reliably routes to openTool
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.tool-card');
    if (card && card.dataset && card.dataset.tool) {
      openTool(card.dataset.tool);
    }
  });

  backBtn.addEventListener('click', showDashboard);
  homeLogoBtn.addEventListener('click', showDashboard);
  homeLogoBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showDashboard();
    }
  });

  // --- Drop Zone & File Selection ---
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentTool === 'scan-to-pdf' || currentTool === 'scan') {
      openCameraScanner();
      return;
    }
    if (TOOL_METADATA[currentTool]?.acceptImages) {
      imgFileInput.click();
    } else {
      pdfFileInput.click();
    }
  });

  dropzone.addEventListener('click', () => {
    if (currentTool === 'scan-to-pdf' || currentTool === 'scan') {
      openCameraScanner();
      return;
    }
    if (TOOL_METADATA[currentTool]?.acceptImages) {
      imgFileInput.click();
    } else {
      pdfFileInput.click();
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  });

  pdfFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  });

  imgFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  });

  // --- File Intake & Processing ---
  async function handleFiles(files) {
    const meta = TOOL_METADATA[currentTool];
    showStatus('Loading file(s)...', 'processing');

    try {
      const isTextTool = currentTool === 'text-to-pdf' || currentTool === 'txt-to-pdf';
      const isWordTool = currentTool === 'word-to-pdf';
      const isExcelTool = currentTool === 'excel-to-pdf';
      const isPptTool = currentTool === 'powerpoint-to-pdf';
      const isHtmlTool = currentTool === 'html-to-pdf';
      const isOfficeOrHtmlTool = isWordTool || isExcelTool || isPptTool || isHtmlTool;

      const validFiles = files.filter((f) => {
        const nameLower = f.name.toLowerCase();
        if (meta.acceptImages) {
          return f.type.startsWith('image/');
        }
        if (isTextTool) {
          return f.type.startsWith('text/') || nameLower.endsWith('.txt') || nameLower.endsWith('.md');
        }
        if (isWordTool) {
          return nameLower.endsWith('.docx') || f.type.includes('wordprocessingml');
        }
        if (isExcelTool) {
          return nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls') || f.type.includes('spreadsheetml');
        }
        if (isPptTool) {
          return nameLower.endsWith('.pptx') || f.type.includes('presentationml');
        }
        if (isHtmlTool) {
          return nameLower.endsWith('.html') || nameLower.endsWith('.htm') || f.type === 'text/html';
        }
        return f.type === 'application/pdf' || nameLower.endsWith('.pdf');
      });

      if (validFiles.length === 0) {
        let msg = 'Please select valid PDF files.';
        if (meta.acceptImages) msg = 'Please select valid image files (JPG, PNG, WebP).';
        else if (isTextTool) msg = 'Please select valid text files (.txt, .md).';
        else if (isWordTool) msg = 'Please select a valid Word document (.docx).';
        else if (isExcelTool) msg = 'Please select a valid Excel workbook (.xlsx).';
        else if (isPptTool) msg = 'Please select a valid PowerPoint presentation (.pptx).';
        else if (isHtmlTool) msg = 'Please select a valid HTML file (.html, .htm).';
        throw new Error(msg);
      }

      // Read file bytes
      const processedItems = [];
      for (const f of validFiles) {
        const buffer = await f.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let pageCount = 1;

        if (!meta.acceptImages && !isTextTool && !isOfficeOrHtmlTool) {
          try {
            // Load with PDFLib to determine valid page count immediately
            const pdfDoc = await PDFLib.PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
            pageCount = pdfDoc.getPageCount();
          } catch (pdfErr) {
            console.warn('PDF load warning:', pdfErr);
            pageCount = 1;
          }
        }

        processedItems.push({
          file: f,
          name: f.name,
          size: f.size,
          bytes: bytes,
          pageCount: pageCount,
        });
      }

      // If single file tool, replace uploaded files
      if (!meta.multiple) {
        await cleanupActivePdfDocs();
        uploadedFiles = [processedItems[0]];
      } else {
        uploadedFiles = [...uploadedFiles, ...processedItems];
      }

      // Initialize activePages reliably using pageCount from PDFLib
      if (!meta.acceptImages && !isOfficeOrHtmlTool && uploadedFiles.length > 0) {
        const total = uploadedFiles[0].pageCount || 1;
        activePages = Array.from({ length: total }, (_, i) => ({
          pageNum: i + 1,
          rotation: 0,
          isDeleted: false,
        }));
      }

      dropzone.style.display = 'none';
      workArea.style.display = 'block';
      hideStatus();

      // Auto-inspect form fields on file load
      if ((currentTool === 'forms' || currentTool === 'pdf-forms') && uploadedFiles.length > 0) {
        try {
          inspectedFormFields = await PDFCore.inspectForm(uploadedFiles[0].bytes.slice());
        } catch (fErr) {
          console.warn('Form inspection error:', fErr);
          inspectedFormFields = [];
        }
      }
      if (currentTool === 'remove-pages') {
        selectedRemovePages.clear();
      }
      if (currentTool === 'extract-pages' && uploadedFiles.length > 0) {
        const total = uploadedFiles[0].pageCount || 1;
        selectedExtractPages = new Set(Array.from({ length: total }, (_, i) => i + 1));
      }
      if (currentTool === 'crop' || currentTool === 'crop-pdf') {
        cropCurrentPageIndex = 0;
        cropOverlayPos = { left: 30, top: 30, width: 320, height: 420 };
      }

      // Render workspace
      await renderToolWorkspace();

      if (isTextTool && processedItems[0]) {
        const text = new TextDecoder('utf-8').decode(processedItems[0].bytes);
        const editor = document.getElementById('textToPdfInput');
        if (editor) editor.value = text;
      }
    } catch (err) {
      console.error(err);
      showStatus(err.message, 'error');
    }
  }

  // --- Dynamic Workspace Rendering ---
  async function renderToolWorkspace() {
    renderSettingsPanel();

    if (currentTool === 'merge' || currentTool === 'img-to-pdf' || currentTool === 'compare' || currentTool === 'compare-pdf' ||
        currentTool === 'word-to-pdf' || currentTool === 'excel-to-pdf' || currentTool === 'powerpoint-to-pdf' || currentTool === 'html-to-pdf') {
      // Show file list with reorder buttons
      pagesGrid.style.display = 'none';
      filesList.style.display = 'flex';
      removeSignPreview();
      renderFileList();
    } else if (currentTool === 'text-to-pdf' || currentTool === 'txt-to-pdf') {
      pagesGrid.style.display = 'none';
      filesList.style.display = 'none';
      removeSignPreview();
    } else if (currentTool === 'sign' || currentTool === 'sign-pdf') {
      filesList.style.display = 'none';
      pagesGrid.style.display = 'none';
      const cropExisting = document.getElementById('cropPreviewContainer');
      if (cropExisting) cropExisting.remove();
      await renderSignPreview();
    } else if (currentTool === 'crop' || currentTool === 'crop-pdf') {
      filesList.style.display = 'none';
      pagesGrid.style.display = 'none';
      const signExisting = document.getElementById('signPreviewContainer');
      if (signExisting) signExisting.remove();
      const editExisting = document.getElementById('editPreviewContainer');
      if (editExisting) editExisting.remove();
      await renderCropPreview();
    } else if (currentTool === 'edit-pdf' || currentTool === 'edit') {
      filesList.style.display = 'none';
      pagesGrid.style.display = 'none';
      const signExisting = document.getElementById('signPreviewContainer');
      if (signExisting) signExisting.remove();
      const cropExisting = document.getElementById('cropPreviewContainer');
      if (cropExisting) cropExisting.remove();
      await renderEditPreview();
    } else {
      // Single PDF visual pages grid
      removeSignPreview();
      filesList.style.display = 'none';
      pagesGrid.style.display = 'grid';
      await renderPageThumbnails();
    }
  }

  async function renderSignPreview() {
    pagesGrid.style.display = 'none';
    filesList.style.display = 'none';

    let container = document.getElementById('signPreviewContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'signPreviewContainer';
      container.className = 'sign-preview-container';
      document.getElementById('itemsContainer').appendChild(container);
    }

    const file = uploadedFiles[0];
    const totalPages = file ? file.pageCount || 1 : 1;
    if (signCurrentPageIndex >= totalPages) signCurrentPageIndex = 0;

    container.innerHTML = `
      <div class="sign-page-nav">
        <button type="button" class="secondary-btn" id="sigPrevPageBtn" ${signCurrentPageIndex === 0 ? 'disabled style="opacity:0.4;"' : ''}>← Prev Page</button>
        <span id="sigPageIndicator">Page ${signCurrentPageIndex + 1} of ${totalPages}</span>
        <button type="button" class="secondary-btn" id="sigNextPageBtn" ${signCurrentPageIndex >= totalPages - 1 ? 'disabled style="opacity:0.4;"' : ''}>Next Page →</button>
      </div>
      <div id="signPageWrapper" class="sign-page-wrapper">
        <canvas id="signPageCanvas"></canvas>
        <div id="signatureOverlay" class="signature-overlay" style="display: ${currentSignatureDataUrl ? 'flex' : 'none'}; left: ${sigOverlayPos.left}px; top: ${sigOverlayPos.top}px; width: ${sigOverlayPos.width}px; height: ${sigOverlayPos.height}px;">
          <img id="sigOverlayImg" src="${currentSignatureDataUrl || ''}" alt="Signature">
          <div class="resize-handle" id="sigResizeHandle"></div>
          <div class="sig-delete-btn" id="sigDeleteBtn" title="Remove signature">✕</div>
        </div>
      </div>
    `;

    document.getElementById('sigPrevPageBtn').addEventListener('click', async () => {
      if (signCurrentPageIndex > 0) {
        signCurrentPageIndex--;
        await renderSignPreview();
        renderSettingsPanel();
      }
    });

    document.getElementById('sigNextPageBtn').addEventListener('click', async () => {
      if (signCurrentPageIndex < totalPages - 1) {
        signCurrentPageIndex++;
        await renderSignPreview();
        renderSettingsPanel();
      }
    });

    document.getElementById('sigDeleteBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      currentSignatureDataUrl = null;
      const overlay = document.getElementById('signatureOverlay');
      if (overlay) overlay.style.display = 'none';
      renderSettingsPanel();
    });

    setupSignatureOverlayInteractions();
    await renderSignPageCanvas(file, signCurrentPageIndex + 1);
    updateSigCoordinateDisplay();
  }

  async function renderSignPageCanvas(file, pageNum) {
    const canvas = document.getElementById('signPageCanvas');
    if (!canvas || !file || !file.bytes) return;

    if (window.pdfjsLib) {
      let pdf = null;
      try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        }
        const clonedBytes = file.bytes.slice();
        pdf = trackPdfDoc(await window.pdfjsLib.getDocument({ data: clonedBytes }).promise);
        const page = await pdf.getPage(pageNum);
        const originalViewport = page.getViewport({ scale: 1.0 });
        currentPdfPageSize = { width: originalViewport.width, height: originalViewport.height };

        const targetWidth = Math.min(560, window.innerWidth - 80);
        const scale = targetWidth / originalViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return;
      } catch (err) {
        console.warn('PDF.js render in sign preview failed, using canvas placeholder:', err);
      } finally {
        if (pdf && typeof pdf.destroy === 'function') {
          try {
            await pdf.destroy();
            activePdfDocs.delete(pdf);
          } catch (e) {}
        }
      }
    }

    // Fallback
    canvas.width = 500;
    canvas.height = 700;
    currentPdfPageSize = { width: 500, height: 700 };
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Page ${pageNum}`, 250, 350);
  }

  function setupSignatureOverlayInteractions() {
    const overlay = document.getElementById('signatureOverlay');
    const resizeHandle = document.getElementById('sigResizeHandle');
    const canvas = document.getElementById('signPageCanvas');
    if (!overlay || !resizeHandle || !canvas) return;

    overlay.onpointerdown = (e) => {
      if (e.target.id === 'sigResizeHandle' || e.target.id === 'sigDeleteBtn') return;
      e.preventDefault();
      isDraggingSig = true;
      sigDragStart = {
        x: e.clientX,
        y: e.clientY,
        left: sigOverlayPos.left,
        top: sigOverlayPos.top,
      };
      overlay.setPointerCapture(e.pointerId);
    };

    overlay.onpointermove = (e) => {
      if (!isDraggingSig) return;
      e.preventDefault();
      const dx = e.clientX - sigDragStart.x;
      const dy = e.clientY - sigDragStart.y;
      const maxLeft = Math.max(0, canvas.clientWidth - sigOverlayPos.width);
      const maxTop = Math.max(0, canvas.clientHeight - sigOverlayPos.height);

      sigOverlayPos.left = Math.max(0, Math.min(maxLeft, sigDragStart.left + dx));
      sigOverlayPos.top = Math.max(0, Math.min(maxTop, sigDragStart.top + dy));

      overlay.style.left = `${sigOverlayPos.left}px`;
      overlay.style.top = `${sigOverlayPos.top}px`;
      updateSigCoordinateDisplay();
    };

    const stopDragging = (e) => {
      if (isDraggingSig) {
        isDraggingSig = false;
        try { overlay.releasePointerCapture(e.pointerId); } catch {}
      }
    };
    overlay.onpointerup = stopDragging;
    overlay.onpointercancel = stopDragging;

    resizeHandle.onpointerdown = (e) => {
      e.stopPropagation();
      e.preventDefault();
      isResizingSig = true;
      sigDragStart = {
        x: e.clientX,
        y: e.clientY,
        width: sigOverlayPos.width,
        height: sigOverlayPos.height,
      };
      resizeHandle.setPointerCapture(e.pointerId);
    };

    resizeHandle.onpointermove = (e) => {
      if (!isResizingSig) return;
      e.preventDefault();
      const dx = e.clientX - sigDragStart.x;
      const dy = e.clientY - sigDragStart.y;

      const maxWidth = canvas.clientWidth - sigOverlayPos.left;
      const maxHeight = canvas.clientHeight - sigOverlayPos.top;

      sigOverlayPos.width = Math.max(40, Math.min(maxWidth, sigDragStart.width + dx));
      sigOverlayPos.height = Math.max(20, Math.min(maxHeight, sigDragStart.height + dy));

      overlay.style.width = `${sigOverlayPos.width}px`;
      overlay.style.height = `${sigOverlayPos.height}px`;
      updateSigCoordinateDisplay();
    };

    const stopResizing = (e) => {
      if (isResizingSig) {
        isResizingSig = false;
        try { resizeHandle.releasePointerCapture(e.pointerId); } catch {}
      }
    };
    resizeHandle.onpointerup = stopResizing;
    resizeHandle.onpointercancel = stopResizing;
  }

  function updateSigCoordinateDisplay() {
    const canvas = document.getElementById('signPageCanvas');
    if (!canvas) return;
    const prevW = canvas.clientWidth || canvas.width || 1;
    const prevH = canvas.clientHeight || canvas.height || 1;
    const pdfW = currentPdfPageSize.width || 612;
    const pdfH = currentPdfPageSize.height || 792;

    const scaleX = pdfW / prevW;
    const scaleY = pdfH / prevH;

    const pdfX = Math.round(sigOverlayPos.left * scaleX);
    const pdfY = Math.round(pdfH - (sigOverlayPos.top + sigOverlayPos.height) * scaleY);
    const pdfWpt = Math.round(sigOverlayPos.width * scaleX);
    const pdfHpt = Math.round(sigOverlayPos.height * scaleY);

    const ptX = document.getElementById('sigPtX');
    const ptY = document.getElementById('sigPtY');
    const ptW = document.getElementById('sigPtW');
    const ptH = document.getElementById('sigPtH');
    if (ptX) ptX.textContent = pdfX;
    if (ptY) ptY.textContent = pdfY;
    if (ptW) ptW.textContent = pdfWpt;
    if (ptH) ptH.textContent = pdfHpt;
  }

  // --- Crop PDF Interactive Visual Bounding Box ---
  async function renderCropPreview() {
    pagesGrid.style.display = 'none';
    filesList.style.display = 'none';

    let container = document.getElementById('cropPreviewContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'cropPreviewContainer';
      container.className = 'crop-preview-container';
      document.getElementById('itemsContainer').appendChild(container);
    }

    const file = uploadedFiles[0];
    const totalPages = file ? file.pageCount || 1 : 1;
    if (cropCurrentPageIndex >= totalPages) cropCurrentPageIndex = 0;

    container.innerHTML = `
      <div class="crop-page-nav">
        <button type="button" class="secondary-btn" id="cropPrevPageBtn" ${cropCurrentPageIndex === 0 ? 'disabled style="opacity:0.4;"' : ''}>← Prev Page</button>
        <span id="cropPageIndicator">Page ${cropCurrentPageIndex + 1} of ${totalPages}</span>
        <button type="button" class="secondary-btn" id="cropNextPageBtn" ${cropCurrentPageIndex >= totalPages - 1 ? 'disabled style="opacity:0.4;"' : ''}>Next Page →</button>
      </div>
      <div id="cropPageWrapper" class="crop-page-wrapper">
        <canvas id="cropPageCanvas"></canvas>
        <div id="cropOverlay" class="crop-overlay" style="left: ${cropOverlayPos.left}px; top: ${cropOverlayPos.top}px; width: ${cropOverlayPos.width}px; height: ${cropOverlayPos.height}px;">
          <div id="cropDimensionsBadge" class="crop-overlay-dimensions">0 × 0 pt</div>
          <div class="crop-handle handle-nw" data-handle="nw"></div>
          <div class="crop-handle handle-ne" data-handle="ne"></div>
          <div class="crop-handle handle-sw" data-handle="sw"></div>
          <div class="crop-handle handle-se" data-handle="se"></div>
          <div class="crop-handle handle-n" data-handle="n"></div>
          <div class="crop-handle handle-s" data-handle="s"></div>
          <div class="crop-handle handle-w" data-handle="w"></div>
          <div class="crop-handle handle-e" data-handle="e"></div>
        </div>
      </div>
    `;

    document.getElementById('cropPrevPageBtn').addEventListener('click', async () => {
      if (cropCurrentPageIndex > 0) {
        cropCurrentPageIndex--;
        await renderCropPreview();
        renderSettingsPanel();
      }
    });

    document.getElementById('cropNextPageBtn').addEventListener('click', async () => {
      if (cropCurrentPageIndex < totalPages - 1) {
        cropCurrentPageIndex++;
        await renderCropPreview();
        renderSettingsPanel();
      }
    });

    setupCropOverlayInteractions();
    await renderCropPageCanvas(file, cropCurrentPageIndex + 1);
    updateCropCoordinateDisplay();
  }

  async function renderCropPageCanvas(file, pageNum) {
    const canvas = document.getElementById('cropPageCanvas');
    if (!canvas || !file || !file.bytes) return;

    if (window.pdfjsLib) {
      let pdf = null;
      try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        }
        const clonedBytes = file.bytes.slice();
        pdf = trackPdfDoc(await window.pdfjsLib.getDocument({ data: clonedBytes }).promise);
        const page = await pdf.getPage(pageNum);
        const originalViewport = page.getViewport({ scale: 1.0 });
        cropPageSize = { width: originalViewport.width, height: originalViewport.height };

        const targetWidth = Math.min(560, window.innerWidth - 80);
        const scale = targetWidth / originalViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return;
      } catch (err) {
        console.warn('PDF.js render in crop preview failed, using canvas fallback:', err);
      } finally {
        if (pdf && typeof pdf.destroy === 'function') {
          try {
            await pdf.destroy();
            activePdfDocs.delete(pdf);
          } catch (e) {}
        }
      }
    }

    // Fallback
    canvas.width = 500;
    canvas.height = 700;
    cropPageSize = { width: 500, height: 700 };
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Page ${pageNum}`, 250, 350);
  }

  function setupCropOverlayInteractions() {
    const overlay = document.getElementById('cropOverlay');
    const canvas = document.getElementById('cropPageCanvas');
    if (!overlay || !canvas) return;

    // Drag overlay bounding box
    overlay.onpointerdown = (e) => {
      if (e.target.classList.contains('crop-handle')) return;
      e.preventDefault();
      isDraggingCrop = true;
      cropDragStart = {
        x: e.clientX,
        y: e.clientY,
        left: cropOverlayPos.left,
        top: cropOverlayPos.top,
      };
      overlay.setPointerCapture(e.pointerId);
    };

    overlay.onpointermove = (e) => {
      if (!isDraggingCrop) return;
      e.preventDefault();
      const dx = e.clientX - cropDragStart.x;
      const dy = e.clientY - cropDragStart.y;
      const maxLeft = Math.max(0, canvas.clientWidth - cropOverlayPos.width);
      const maxTop = Math.max(0, canvas.clientHeight - cropOverlayPos.height);

      cropOverlayPos.left = Math.max(0, Math.min(maxLeft, cropDragStart.left + dx));
      cropOverlayPos.top = Math.max(0, Math.min(maxTop, cropDragStart.top + dy));

      overlay.style.left = `${cropOverlayPos.left}px`;
      overlay.style.top = `${cropOverlayPos.top}px`;
      updateCropCoordinateDisplay();
    };

    const stopDraggingCrop = (e) => {
      if (isDraggingCrop) {
        isDraggingCrop = false;
        try { overlay.releasePointerCapture(e.pointerId); } catch {}
      }
    };
    overlay.onpointerup = stopDraggingCrop;
    overlay.onpointercancel = stopDraggingCrop;

    // Resizing with 8 handles
    overlay.querySelectorAll('.crop-handle').forEach((handle) => {
      handle.onpointerdown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        activeCropResizeHandle = handle.dataset.handle;
        cropDragStart = {
          x: e.clientX,
          y: e.clientY,
          left: cropOverlayPos.left,
          top: cropOverlayPos.top,
          width: cropOverlayPos.width,
          height: cropOverlayPos.height,
        };
        handle.setPointerCapture(e.pointerId);
      };

      handle.onpointermove = (e) => {
        if (!activeCropResizeHandle) return;
        e.preventDefault();
        const dx = e.clientX - cropDragStart.x;
        const dy = e.clientY - cropDragStart.y;
        const minDim = 30;
        const cWidth = canvas.clientWidth;
        const cHeight = canvas.clientHeight;

        let newLeft = cropDragStart.left;
        let newTop = cropDragStart.top;
        let newWidth = cropDragStart.width;
        let newHeight = cropDragStart.height;

        if (activeCropResizeHandle.includes('e')) {
          newWidth = Math.max(minDim, Math.min(cWidth - newLeft, cropDragStart.width + dx));
        }
        if (activeCropResizeHandle.includes('s')) {
          newHeight = Math.max(minDim, Math.min(cHeight - newTop, cropDragStart.height + dy));
        }
        if (activeCropResizeHandle.includes('w')) {
          const proposedLeft = Math.max(0, Math.min(cropDragStart.left + cropDragStart.width - minDim, cropDragStart.left + dx));
          newWidth = cropDragStart.width + (cropDragStart.left - proposedLeft);
          newLeft = proposedLeft;
        }
        if (activeCropResizeHandle.includes('n')) {
          const proposedTop = Math.max(0, Math.min(cropDragStart.top + cropDragStart.height - minDim, cropDragStart.top + dy));
          newHeight = cropDragStart.height + (cropDragStart.top - proposedTop);
          newTop = proposedTop;
        }

        cropOverlayPos.left = Math.round(newLeft);
        cropOverlayPos.top = Math.round(newTop);
        cropOverlayPos.width = Math.round(newWidth);
        cropOverlayPos.height = Math.round(newHeight);

        overlay.style.left = `${cropOverlayPos.left}px`;
        overlay.style.top = `${cropOverlayPos.top}px`;
        overlay.style.width = `${cropOverlayPos.width}px`;
        overlay.style.height = `${cropOverlayPos.height}px`;
        updateCropCoordinateDisplay();
      };

      const stopResizingCrop = (e) => {
        if (activeCropResizeHandle) {
          activeCropResizeHandle = null;
          try { handle.releasePointerCapture(e.pointerId); } catch {}
        }
      };
      handle.onpointerup = stopResizingCrop;
      handle.onpointercancel = stopResizingCrop;
    });
  }

  function updateCropCoordinateDisplay() {
    const canvas = document.getElementById('cropPageCanvas');
    if (!canvas) return;
    const prevW = canvas.clientWidth || canvas.width || 1;
    const prevH = canvas.clientHeight || canvas.height || 1;
    const pdfW = cropPageSize.width || 612;
    const pdfH = cropPageSize.height || 792;

    const scaleX = pdfW / prevW;
    const scaleY = pdfH / prevH;

    const pdfX = Math.round(cropOverlayPos.left * scaleX);
    const pdfY = Math.round(pdfH - (cropOverlayPos.top + cropOverlayPos.height) * scaleY);
    const pdfWpt = Math.round(cropOverlayPos.width * scaleX);
    const pdfHpt = Math.round(cropOverlayPos.height * scaleY);

    const ptX = document.getElementById('cropPtX');
    const ptY = document.getElementById('cropPtY');
    const ptW = document.getElementById('cropPtW');
    const ptH = document.getElementById('cropPtH');
    if (ptX) ptX.textContent = pdfX;
    if (ptY) ptY.textContent = pdfY;
    if (ptW) ptW.textContent = pdfWpt;
    if (ptH) ptH.textContent = pdfHpt;

    const badge = document.getElementById('cropDimensionsBadge');
    if (badge) badge.textContent = `${pdfWpt} × ${pdfHpt} pt`;
  }

  // --- Edit PDF Interactive Annotation Workspace ---
  let editCurrentPageIndex = 0;
  let editAnnotationsByPage = {};
  let currentEditTool = 'pen';
  let currentEditColor = '#ef4444';
  let currentEditWidth = 3;
  let currentEditFontSize = 16;
  let isDrawingAnnotation = false;
  let editDrawStart = null;
  let editCurrentStroke = [];

  async function renderEditPreview() {
    pagesGrid.style.display = 'none';
    filesList.style.display = 'none';

    let container = document.getElementById('editPreviewContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'editPreviewContainer';
      container.className = 'edit-preview-container';
      document.getElementById('itemsContainer').appendChild(container);
    }

    const file = uploadedFiles[0];
    const totalPages = file ? file.pageCount || 1 : 1;
    if (editCurrentPageIndex >= totalPages) editCurrentPageIndex = 0;

    container.innerHTML = `
      <div class="edit-page-nav">
        <button type="button" class="secondary-btn" id="editPrevPageBtn" ${editCurrentPageIndex === 0 ? 'disabled style="opacity:0.4;"' : ''}>← Prev Page</button>
        <span id="editPageIndicator">Page ${editCurrentPageIndex + 1} of ${totalPages}</span>
        <button type="button" class="secondary-btn" id="editNextPageBtn" ${editCurrentPageIndex >= totalPages - 1 ? 'disabled style="opacity:0.4;"' : ''}>Next Page →</button>
      </div>
      <div id="editPageWrapper" class="edit-page-wrapper">
        <canvas id="editPageCanvas"></canvas>
        <canvas id="editAnnotationCanvas" class="edit-annotation-canvas"></canvas>
      </div>
    `;

    document.getElementById('editPrevPageBtn').addEventListener('click', async () => {
      if (editCurrentPageIndex > 0) {
        editCurrentPageIndex--;
        await renderEditPreview();
        renderSettingsPanel();
      }
    });

    document.getElementById('editNextPageBtn').addEventListener('click', async () => {
      if (editCurrentPageIndex < totalPages - 1) {
        editCurrentPageIndex++;
        await renderEditPreview();
        renderSettingsPanel();
      }
    });

    await renderEditPage(editCurrentPageIndex + 1);
    redrawPageAnnotations();
    setupEditCanvasInteractions();
  }

  async function renderEditPage(pageNum) {
    const canvas = document.getElementById('editPageCanvas');
    if (!canvas) return;
    const file = uploadedFiles[0];
    if (!file || !file.bytes) return;

    if (window.pdfjsLib) {
      let pdf = null;
      try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        }
        const loadingTask = window.pdfjsLib.getDocument({ data: file.bytes.slice() });
        pdf = await loadingTask.promise;
        activePdfDocs.add(pdf);
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });

        const maxDisplayWidth = Math.min(window.innerWidth - 380, 800);
        const scale = Math.min(maxDisplayWidth / viewport.width, 1.5);
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        currentPdfPageSize = { width: viewport.width, height: viewport.height };

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
        return;
      } catch (err) {
        console.warn('PDF.js render failed for edit page, using fallback:', err);
      } finally {
        if (pdf && typeof pdf.destroy === 'function') {
          try {
            await pdf.destroy();
            activePdfDocs.delete(pdf);
          } catch (e) {}
        }
      }
    }

    // Fallback if PDF.js is unavailable
    canvas.width = 500;
    canvas.height = 700;
    currentPdfPageSize = { width: 500, height: 700 };
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Page ${pageNum}`, 250, 350);
  }

  function redrawPageAnnotations() {
    const annotCanvas = document.getElementById('editAnnotationCanvas');
    const baseCanvas = document.getElementById('editPageCanvas');
    if (!annotCanvas || !baseCanvas) return;

    annotCanvas.width = baseCanvas.width;
    annotCanvas.height = baseCanvas.height;
    const ctx = annotCanvas.getContext('2d');
    ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);

    const annotations = editAnnotationsByPage[editCurrentPageIndex] || [];
    const scaleX = annotCanvas.width / (currentPdfPageSize.width || annotCanvas.width);
    const scaleY = annotCanvas.height / (currentPdfPageSize.height || annotCanvas.height);
    const pdfH = currentPdfPageSize.height || annotCanvas.height;

    for (const ann of annotations) {
      drawAnnotationOnCanvas(ctx, ann, scaleX, scaleY, pdfH);
    }
  }

  function drawAnnotationOnCanvas(ctx, ann, scaleX, scaleY, pdfH) {
    ctx.save();
    switch (ann.type) {
      case 'pen': {
        if (Array.isArray(ann.points) && ann.points.length > 0) {
          ctx.beginPath();
          ctx.strokeStyle = ann.color || '#ef4444';
          ctx.lineWidth = (ann.width || 2) * scaleX;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const p0 = ann.points[0];
          ctx.moveTo(p0.x * scaleX, (pdfH - p0.y) * scaleY);
          for (let i = 1; i < ann.points.length; i++) {
            const p = ann.points[i];
            ctx.lineTo(p.x * scaleX, (pdfH - p.y) * scaleY);
          }
          ctx.stroke();
        }
        break;
      }
      case 'highlight': {
        const cx = ann.x * scaleX;
        const cy = (pdfH - ann.y - ann.height) * scaleY;
        const cw = ann.width * scaleX;
        const ch = ann.height * scaleY;
        ctx.fillStyle = ann.color || '#fef08a';
        ctx.globalAlpha = ann.opacity !== undefined ? ann.opacity : 0.35;
        ctx.fillRect(cx, cy, cw, ch);
        break;
      }
      case 'text': {
        const cx = ann.x * scaleX;
        const cy = (pdfH - ann.y) * scaleY;
        ctx.fillStyle = ann.color || '#000000';
        ctx.font = `${(ann.fontSize || 14) * scaleY}px sans-serif`;
        ctx.fillText(ann.text || '', cx, cy);
        break;
      }
      case 'rect': {
        const cx = ann.x * scaleX;
        const cy = (pdfH - ann.y - ann.height) * scaleY;
        const cw = ann.width * scaleX;
        const ch = ann.height * scaleY;
        if (ann.fill && ann.color) {
          ctx.fillStyle = ann.color;
          ctx.globalAlpha = ann.opacity !== undefined ? ann.opacity : 1.0;
          ctx.fillRect(cx, cy, cw, ch);
        }
        if (ann.borderColor || ann.borderWidth || !ann.fill) {
          ctx.strokeStyle = ann.borderColor || ann.color || '#000000';
          ctx.lineWidth = (ann.borderWidth || 1) * scaleX;
          ctx.globalAlpha = ann.borderOpacity !== undefined ? ann.borderOpacity : 1.0;
          ctx.strokeRect(cx, cy, cw, ch);
        }
        break;
      }
      case 'ellipse': {
        const cx = (ann.x + (ann.width ? ann.width / 2 : 0)) * scaleX;
        const cy = (pdfH - ann.y - (ann.height ? ann.height / 2 : 0)) * scaleY;
        const rx = Math.abs((ann.width ? ann.width / 2 : 50) * scaleX);
        const ry = Math.abs((ann.height ? ann.height / 2 : 50) * scaleY);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (ann.fill && ann.color) {
          ctx.fillStyle = ann.color;
          ctx.globalAlpha = ann.opacity !== undefined ? ann.opacity : 1.0;
          ctx.fill();
        }
        if (ann.borderColor || ann.borderWidth || !ann.fill) {
          ctx.strokeStyle = ann.borderColor || ann.color || '#000000';
          ctx.lineWidth = (ann.borderWidth || 1) * scaleX;
          ctx.globalAlpha = ann.borderOpacity !== undefined ? ann.borderOpacity : 1.0;
          ctx.stroke();
        }
        break;
      }
      case 'line': {
        const startX = (ann.start ? ann.start.x : (ann.x || 0)) * scaleX;
        const startY = (pdfH - (ann.start ? ann.start.y : (ann.y || 0))) * scaleY;
        const endX = (ann.end ? ann.end.x : ((ann.x || 0) + (ann.width || 100))) * scaleX;
        const endY = (pdfH - (ann.end ? ann.end.y : ((ann.y || 0) + (ann.height || 0)))) * scaleY;
        ctx.beginPath();
        ctx.strokeStyle = ann.color || '#000000';
        ctx.lineWidth = (ann.width || 1) * scaleX;
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  function setupEditCanvasInteractions() {
    const annotCanvas = document.getElementById('editAnnotationCanvas');
    if (!annotCanvas) return;

    annotCanvas.onpointerdown = (e) => {
      e.preventDefault();
      annotCanvas.setPointerCapture(e.pointerId);
      const rect = annotCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const scaleX = (currentPdfPageSize.width || annotCanvas.width) / annotCanvas.width;
      const scaleY = (currentPdfPageSize.height || annotCanvas.height) / annotCanvas.height;
      const pdfH = currentPdfPageSize.height || annotCanvas.height;

      const pdfX = x * scaleX;
      const pdfY = pdfH - (y * scaleY);

      if (currentEditTool === 'text') {
        const text = prompt('Enter annotation text:');
        if (text && text.trim()) {
          const ann = {
            type: 'text',
            x: Math.round(pdfX),
            y: Math.round(pdfY),
            text: text.trim(),
            fontSize: currentEditFontSize,
            color: currentEditColor,
          };
          editAnnotationsByPage[editCurrentPageIndex] = editAnnotationsByPage[editCurrentPageIndex] || [];
          editAnnotationsByPage[editCurrentPageIndex].push(ann);
          redrawPageAnnotations();
        }
        return;
      }

      isDrawingAnnotation = true;
      editDrawStart = { canvasX: x, canvasY: y, pdfX, pdfY };
      if (currentEditTool === 'pen') {
        editCurrentStroke = [{ x: pdfX, y: pdfY }];
      }
    };

    annotCanvas.onpointermove = (e) => {
      if (!isDrawingAnnotation || !editDrawStart) return;
      e.preventDefault();
      const rect = annotCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const scaleX = (currentPdfPageSize.width || annotCanvas.width) / annotCanvas.width;
      const scaleY = (currentPdfPageSize.height || annotCanvas.height) / annotCanvas.height;
      const pdfH = currentPdfPageSize.height || annotCanvas.height;

      const currentPdfX = x * scaleX;
      const currentPdfY = pdfH - (y * scaleY);

      redrawPageAnnotations();

      const ctx = annotCanvas.getContext('2d');
      ctx.save();
      if (currentEditTool === 'pen') {
        editCurrentStroke.push({ x: currentPdfX, y: currentPdfY });
        ctx.beginPath();
        ctx.strokeStyle = currentEditColor;
        ctx.lineWidth = currentEditWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const cScaleX = annotCanvas.width / (currentPdfPageSize.width || annotCanvas.width);
        const cScaleY = annotCanvas.height / (currentPdfPageSize.height || annotCanvas.height);
        ctx.moveTo(editCurrentStroke[0].x * cScaleX, (pdfH - editCurrentStroke[0].y) * cScaleY);
        for (let i = 1; i < editCurrentStroke.length; i++) {
          ctx.lineTo(editCurrentStroke[i].x * cScaleX, (pdfH - editCurrentStroke[i].y) * cScaleY);
        }
        ctx.stroke();
      } else if (currentEditTool === 'highlight') {
        ctx.fillStyle = currentEditColor || '#fef08a';
        ctx.globalAlpha = 0.35;
        const left = Math.min(editDrawStart.canvasX, x);
        const top = Math.min(editDrawStart.canvasY, y);
        const w = Math.abs(x - editDrawStart.canvasX);
        const h = Math.abs(y - editDrawStart.canvasY);
        ctx.fillRect(left, top, w, h);
      } else if (currentEditTool === 'rect') {
        ctx.strokeStyle = currentEditColor;
        ctx.lineWidth = currentEditWidth;
        const left = Math.min(editDrawStart.canvasX, x);
        const top = Math.min(editDrawStart.canvasY, y);
        const w = Math.abs(x - editDrawStart.canvasX);
        const h = Math.abs(y - editDrawStart.canvasY);
        ctx.strokeRect(left, top, w, h);
      } else if (currentEditTool === 'ellipse') {
        ctx.strokeStyle = currentEditColor;
        ctx.lineWidth = currentEditWidth;
        const left = Math.min(editDrawStart.canvasX, x);
        const top = Math.min(editDrawStart.canvasY, y);
        const w = Math.abs(x - editDrawStart.canvasX);
        const h = Math.abs(y - editDrawStart.canvasY);
        ctx.beginPath();
        ctx.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (currentEditTool === 'line') {
        ctx.strokeStyle = currentEditColor;
        ctx.lineWidth = currentEditWidth;
        ctx.beginPath();
        ctx.moveTo(editDrawStart.canvasX, editDrawStart.canvasY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    const finishDrawing = (e) => {
      if (!isDrawingAnnotation || !editDrawStart) return;
      isDrawingAnnotation = false;
      try { annotCanvas.releasePointerCapture(e.pointerId); } catch {}

      const rect = annotCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const scaleX = (currentPdfPageSize.width || annotCanvas.width) / annotCanvas.width;
      const scaleY = (currentPdfPageSize.height || annotCanvas.height) / annotCanvas.height;
      const pdfH = currentPdfPageSize.height || annotCanvas.height;

      const endPdfX = x * scaleX;
      const endPdfY = pdfH - (y * scaleY);

      editAnnotationsByPage[editCurrentPageIndex] = editAnnotationsByPage[editCurrentPageIndex] || [];

      if (currentEditTool === 'pen') {
        if (editCurrentStroke.length > 0) {
          editAnnotationsByPage[editCurrentPageIndex].push({
            type: 'pen',
            points: editCurrentStroke.map(pt => ({ x: Math.round(pt.x), y: Math.round(pt.y) })),
            color: currentEditColor,
            width: currentEditWidth,
          });
        }
      } else if (currentEditTool === 'highlight') {
        const left = Math.round(Math.min(editDrawStart.pdfX, endPdfX));
        const bottom = Math.round(Math.min(editDrawStart.pdfY, endPdfY));
        const w = Math.round(Math.abs(endPdfX - editDrawStart.pdfX));
        const h = Math.round(Math.abs(endPdfY - editDrawStart.pdfY));
        if (w > 2 && h > 2) {
          editAnnotationsByPage[editCurrentPageIndex].push({
            type: 'highlight',
            x: left,
            y: bottom,
            width: w,
            height: h,
            color: currentEditColor,
            opacity: 0.35,
          });
        }
      } else if (currentEditTool === 'rect') {
        const left = Math.round(Math.min(editDrawStart.pdfX, endPdfX));
        const bottom = Math.round(Math.min(editDrawStart.pdfY, endPdfY));
        const w = Math.round(Math.abs(endPdfX - editDrawStart.pdfX));
        const h = Math.round(Math.abs(endPdfY - editDrawStart.pdfY));
        if (w > 2 && h > 2) {
          editAnnotationsByPage[editCurrentPageIndex].push({
            type: 'rect',
            x: left,
            y: bottom,
            width: w,
            height: h,
            borderColor: currentEditColor,
            borderWidth: currentEditWidth,
            fill: false,
          });
        }
      } else if (currentEditTool === 'ellipse') {
        const left = Math.round(Math.min(editDrawStart.pdfX, endPdfX));
        const bottom = Math.round(Math.min(editDrawStart.pdfY, endPdfY));
        const w = Math.round(Math.abs(endPdfX - editDrawStart.pdfX));
        const h = Math.round(Math.abs(endPdfY - editDrawStart.pdfY));
        if (w > 2 && h > 2) {
          editAnnotationsByPage[editCurrentPageIndex].push({
            type: 'ellipse',
            x: left,
            y: bottom,
            width: w,
            height: h,
            borderColor: currentEditColor,
            borderWidth: currentEditWidth,
            fill: false,
          });
        }
      } else if (currentEditTool === 'line') {
        editAnnotationsByPage[editCurrentPageIndex].push({
          type: 'line',
          start: { x: Math.round(editDrawStart.pdfX), y: Math.round(editDrawStart.pdfY) },
          end: { x: Math.round(endPdfX), y: Math.round(endPdfY) },
          color: currentEditColor,
          width: currentEditWidth,
        });
      }

      editDrawStart = null;
      editCurrentStroke = [];
      redrawPageAnnotations();
    };

    annotCanvas.onpointerup = finishDrawing;
    annotCanvas.onpointercancel = finishDrawing;
  }

  function renderFileList() {
    filesList.innerHTML = '';
    uploadedFiles.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'file-card-item';
      
      const sizeKb = (item.size / 1024).toFixed(1);
      const ext = escapeHtml(item.name.split('.').pop().toUpperCase());
      const safeName = escapeHtml(item.name);
      const pageInfo = item.pageCount ? ` &bull; ${item.pageCount} page${item.pageCount > 1 ? 's' : ''}` : '';

      const isCompare = currentTool === 'compare' || currentTool === 'compare-pdf';
      const roleBadge = isCompare ? `<span style="font-size:0.75rem; background:var(--primary); color:#fff; padding:1px 6px; border-radius:3px; margin-right:4px;">${index === 0 ? 'Doc A' : index === 1 ? 'Doc B' : '#' + (index + 1)}</span>` : '';

      card.innerHTML = `
        <div class="file-info">
          <span class="file-badge">${ext}</span>
          <div>
            <div class="file-name" title="${safeName}">${roleBadge}${safeName}</div>
            <div class="file-size">${escapeHtml(sizeKb)} KB${pageInfo}</div>
          </div>
        </div>
        <div class="file-actions">
          <button type="button" class="icon-btn" title="Move Up" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''} data-action="up" data-index="${index}">↑</button>
          <button type="button" class="icon-btn" title="Move Down" ${index === uploadedFiles.length - 1 ? 'disabled style="opacity:0.3;"' : ''} data-action="down" data-index="${index}">↓</button>
          <button type="button" class="icon-btn delete-btn" title="Remove" data-action="delete" data-index="${index}">✕</button>
        </div>
      `;
      filesList.appendChild(card);
    });

    // Add "Add more files" button
    const isCompare = currentTool === 'compare' || currentTool === 'compare-pdf';
    const addBtnText = isCompare && uploadedFiles.length < 2 ? '+ Add Document B (Second Revision)' : '+ Add More Files';
    const addMoreRow = document.createElement('div');
    addMoreRow.style.marginTop = '0.5rem';
    addMoreRow.innerHTML = `
      <button type="button" class="secondary-btn" id="addMoreFilesBtn">${addBtnText}</button>
    `;
    filesList.appendChild(addMoreRow);

    document.getElementById('addMoreFilesBtn').addEventListener('click', () => {
      if (TOOL_METADATA[currentTool].acceptImages) {
        imgFileInput.click();
      } else {
        pdfFileInput.click();
      }
    });

    // Handle reorder and delete actions
    filesList.querySelectorAll('.icon-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.index, 10);
        if (action === 'up' && idx > 0) {
          const temp = uploadedFiles[idx];
          uploadedFiles[idx] = uploadedFiles[idx - 1];
          uploadedFiles[idx - 1] = temp;
          renderFileList();
        } else if (action === 'down' && idx < uploadedFiles.length - 1) {
          const temp = uploadedFiles[idx];
          uploadedFiles[idx] = uploadedFiles[idx + 1];
          uploadedFiles[idx + 1] = temp;
          renderFileList();
        } else if (action === 'delete') {
          uploadedFiles.splice(idx, 1);
          if (uploadedFiles.length === 0) {
            workArea.style.display = 'none';
            dropzone.style.display = 'block';
          } else {
            renderFileList();
          }
        }
      });
    });
  }

  function syncRemovePagesInput() {
    const input = document.getElementById('removePagesInput');
    if (input) {
      const sorted = Array.from(selectedRemovePages).sort((a, b) => a - b);
      input.value = sorted.join(', ');
    }
  }

  function syncExtractPagesInput() {
    const input = document.getElementById('extractPagesInput');
    if (input) {
      const sorted = Array.from(selectedExtractPages).sort((a, b) => a - b);
      input.value = sorted.join(', ');
    }
  }

  // Fast DOM Page Selection Helpers (Zero Canvas Re-renders)
  function updateRemovePageCardDOM(pageNum, isSelected) {
    const card = pagesGrid.querySelector(`.page-thumb-card[data-page-num="${pageNum}"]`);
    if (card) {
      card.classList.toggle('selected-for-remove', isSelected);
      const badge = card.querySelector('.remove-badge');
      if (badge) {
        badge.classList.toggle('active', isSelected);
        badge.textContent = isSelected ? '✕ Remove' : 'Keep';
      }
    }
  }

  function updateExtractPageCardDOM(pageNum, isSelected) {
    const card = pagesGrid.querySelector(`.page-thumb-card[data-page-num="${pageNum}"]`);
    if (card) {
      card.classList.toggle('selected-for-extract', isSelected);
      const badge = card.querySelector('.extract-badge');
      if (badge) {
        badge.classList.toggle('active', isSelected);
        badge.textContent = isSelected ? '✓ Extract' : 'Skip';
      }
    }
  }

  function syncAllRemoveSelectionDOM() {
    activePages.forEach((p) => {
      const isSelected = selectedRemovePages.has(p.pageNum);
      updateRemovePageCardDOM(p.pageNum, isSelected);
    });
  }

  function syncAllExtractSelectionDOM() {
    activePages.forEach((p) => {
      const isSelected = selectedExtractPages.has(p.pageNum);
      updateExtractPageCardDOM(p.pageNum, isSelected);
    });
  }

  // --- Render Page Thumbnails with PDF.js or Fallback ---
  async function renderPageThumbnails() {
    pagesGrid.innerHTML = '';
    const file = uploadedFiles[0];
    if (!file || !file.bytes) return;

    if (currentThumbPdfDoc && typeof currentThumbPdfDoc.destroy === 'function') {
      try {
        await currentThumbPdfDoc.destroy();
        activePdfDocs.delete(currentThumbPdfDoc);
      } catch (e) {}
      currentThumbPdfDoc = null;
    }

    const total = activePages.length;
    let pdfDoc = null;

    // Try loading PDF with PDF.js
    if (window.pdfjsLib) {
      try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        }
        // ALWAYS pass a cloned copy to prevent worker from detaching file.bytes
        const clonedBytes = file.bytes.slice();
        pdfDoc = await window.pdfjsLib.getDocument({ data: clonedBytes }).promise;
        currentThumbPdfDoc = trackPdfDoc(pdfDoc);
      } catch (err) {
        console.warn('PDF.js thumbnail engine unavailable, using fallback cards:', err);
        pdfDoc = null;
      }
    }

    for (let i = 0; i < total; i++) {
      const pageData = activePages[i];
      if (!pageData) continue;
      const isOrganize = currentTool === 'organize';
      const isRotate = currentTool === 'rotate';
      const isRemovePages = currentTool === 'remove-pages';
      const isExtractPages = currentTool === 'extract-pages';

      const isSelectedRemove = isRemovePages && selectedRemovePages.has(pageData.pageNum);
      const isSelectedExtract = isExtractPages && selectedExtractPages.has(pageData.pageNum);

      const removeBadgeHtml = isRemovePages ? `
        <span class="page-select-badge remove-badge ${isSelectedRemove ? 'active' : ''}" data-action="toggle-remove" data-page="${pageData.pageNum}">
          ${isSelectedRemove ? '✕ Remove' : 'Keep'}
        </span>
      ` : '';

      const extractBadgeHtml = isExtractPages ? `
        <span class="page-select-badge extract-badge ${isSelectedExtract ? 'active' : ''}" data-action="toggle-extract" data-page="${pageData.pageNum}">
          ${isSelectedExtract ? '✓ Extract' : 'Skip'}
        </span>
      ` : '';

      const card = document.createElement('div');
      card.className = `page-thumb-card ${pageData.isDeleted ? 'deleted' : ''} ${isSelectedRemove ? 'selected-for-remove' : ''} ${isSelectedExtract ? 'selected-for-extract' : ''}`;
      card.id = `pageCard-${i}`;
      card.dataset.pageNum = pageData.pageNum;

      card.innerHTML = `
        <div class="page-canvas-wrapper" id="canvasWrapper-${i}">
          <div class="spinner"></div>
        </div>
        <div class="page-meta">
          <span>Page ${pageData.pageNum}</span>
          ${removeBadgeHtml}
          ${extractBadgeHtml}
          <div class="page-card-actions">
            ${isOrganize && i > 0 ? `<button type="button" class="icon-btn" title="Move Left" data-action="move-left" data-index="${i}">◀</button>` : ''}
            ${isOrganize && i < total - 1 ? `<button type="button" class="icon-btn" title="Move Right" data-action="move-right" data-index="${i}">▶</button>` : ''}
            ${(isOrganize || isRotate) ? `<button type="button" class="icon-btn" title="Rotate 90°" data-action="rotate-page" data-index="${i}">↻</button>` : ''}
            ${isOrganize ? `<button type="button" class="icon-btn delete-btn" title="${pageData.isDeleted ? 'Restore Page' : 'Delete Page'}" data-action="toggle-delete" data-index="${i}">${pageData.isDeleted ? '↺' : '✕'}</button>` : ''}
          </div>
        </div>
        ${isOrganize ? `
          <div class="mobile-touch-reorder" aria-label="Touch Reorder Controls">
            <button type="button" class="mobile-reorder-btn icon-btn" title="Move Page Left" data-action="move-left" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move Page Left">◀</button>
            <span class="mobile-reorder-label">Page ${i + 1} of ${total}</span>
            <button type="button" class="mobile-reorder-btn icon-btn" title="Move Page Right" data-action="move-right" data-index="${i}" ${i >= total - 1 ? 'disabled' : ''} aria-label="Move Page Right">▶</button>
          </div>
        ` : ''}
      `;

      if (isRemovePages) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          if (e.target.closest('.icon-btn')) return;
          const isSelected = !selectedRemovePages.has(pageData.pageNum);
          if (isSelected) {
            selectedRemovePages.add(pageData.pageNum);
          } else {
            selectedRemovePages.delete(pageData.pageNum);
          }
          updateRemovePageCardDOM(pageData.pageNum, isSelected);
          syncRemovePagesInput();
        });
      } else if (isExtractPages) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          if (e.target.closest('.icon-btn')) return;
          const isSelected = !selectedExtractPages.has(pageData.pageNum);
          if (isSelected) {
            selectedExtractPages.add(pageData.pageNum);
          } else {
            selectedExtractPages.delete(pageData.pageNum);
          }
          updateExtractPageCardDOM(pageData.pageNum, isSelected);
          syncExtractPagesInput();
        });
      }

      pagesGrid.appendChild(card);

      const wrapper = card.querySelector(`#canvasWrapper-${i}`);

      // Render thumbnail asynchronously
      renderIndividualPage(pdfDoc, pageData.pageNum, pageData.rotation, wrapper, i);
    }

    // Attach button actions
    pagesGrid.querySelectorAll('.icon-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.index, 10);

        if (action === 'rotate-page') {
          activePages[idx].rotation = (activePages[idx].rotation + 90) % 360;
          const target = document.getElementById(`pagePreviewTarget-${idx}`);
          if (target) target.style.transform = `rotate(${activePages[idx].rotation}deg)`;
        } else if (action === 'toggle-delete') {
          activePages[idx].isDeleted = !activePages[idx].isDeleted;
          const card = document.getElementById(`pageCard-${idx}`);
          if (card) {
            card.classList.toggle('deleted', activePages[idx].isDeleted);
            btn.textContent = activePages[idx].isDeleted ? '↺' : '✕';
            btn.title = activePages[idx].isDeleted ? 'Restore Page' : 'Delete Page';
          }
        } else if (action === 'move-left' && idx > 0) {
          const temp = activePages[idx];
          activePages[idx] = activePages[idx - 1];
          activePages[idx - 1] = temp;
          renderPageThumbnails();
        } else if (action === 'move-right' && idx < activePages.length - 1) {
          const temp = activePages[idx];
          activePages[idx] = activePages[idx + 1];
          activePages[idx + 1] = temp;
          renderPageThumbnails();
        }
      });
    });
  }

  async function renderIndividualPage(pdfDoc, pageNum, rotation, wrapper, idx) {
    if (pdfDoc) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.id = `pagePreviewTarget-${idx}`;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.transform = `rotate(${rotation}deg)`;
        canvas.style.transition = 'transform 0.2s ease';

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        wrapper.innerHTML = '';
        wrapper.appendChild(canvas);
        return;
      } catch (err) {
        console.warn(`Could not render thumbnail for page ${pageNum}:`, err);
      }
    }

    // Elegant fallback card if canvas render fails or pdf.js is disabled
    wrapper.innerHTML = `
      <div id="pagePreviewTarget-${idx}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: #ffffff; border: 1px dashed var(--border); transform: rotate(${rotation}deg); transition: transform 0.2s ease;">
        <span style="font-size: 2rem;">📄</span>
        <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-top: 0.25rem;">Page ${pageNum}</span>
      </div>
    `;
  }

  // --- Dynamic Settings Panel per Tool ---
  function renderSettingsPanel() {
    toolSettings.innerHTML = '';
    const file = uploadedFiles[0];
    const totalPages = file ? file.pageCount || activePages.length || 1 : 1;

    if (currentTool === 'merge') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Merge Order</label>
          <p class="setting-hint">Use ↑ and ↓ arrows on each file card to arrange the sequence before merging.</p>
        </div>
      `;
    } else if (currentTool === 'split') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Document Info</label>
          <p class="setting-hint"><strong>Total Pages:</strong> ${totalPages}</p>
        </div>
        <div class="setting-group">
          <label>Split Mode</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="splitMode" value="all" checked>
              <span>Extract all pages as individual PDFs (ZIP)</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="splitMode" value="range">
              <span>Extract custom page range</span>
            </label>
          </div>
        </div>
        <div class="setting-group" id="rangeInputGroup" style="display: none;">
          <label for="pageRangesInput">Page Ranges</label>
          <input type="text" id="pageRangesInput" placeholder="e.g. 1-3, 5" value="1">
          <span class="setting-hint">Comma-separated page numbers or ranges (e.g. 1-${totalPages}).</span>
        </div>
      `;

      const radios = toolSettings.querySelectorAll('input[name="splitMode"]');
      const rangeGroup = toolSettings.querySelector('#rangeInputGroup');
      radios.forEach((r) => {
        r.addEventListener('change', () => {
          rangeGroup.style.display = r.value === 'range' ? 'flex' : 'none';
        });
      });
    } else if (currentTool === 'organize') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Organize Options</label>
          <p class="setting-hint">Click ✕ to delete/exclude a page. Click ↻ to rotate. Use ◀ ▶ (or touch controls on mobile) to reorder pages.</p>
          <button type="button" class="secondary-btn" id="resetOrganizeBtn" style="margin-top: 0.5rem;">Reset All Pages</button>
        </div>
      `;
      document.getElementById('resetOrganizeBtn').addEventListener('click', () => {
        activePages.forEach((p) => {
          p.isDeleted = false;
          p.rotation = 0;
        });
        activePages.sort((a, b) => a.pageNum - b.pageNum);
        renderPageThumbnails();
      });
    } else if (currentTool === 'rotate') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Rotate All Pages</label>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
            <button type="button" class="secondary-btn" id="rotateAllRightBtn" style="flex:1;">+90° CW</button>
            <button type="button" class="secondary-btn" id="rotateAllLeftBtn" style="flex:1;">-90° CCW</button>
            <button type="button" class="secondary-btn" id="rotateAll180Btn" style="flex:1;">180°</button>
          </div>
          <span class="setting-hint">You can also rotate individual pages using the ↻ button on each thumbnail.</span>
        </div>
      `;
      document.getElementById('rotateAllRightBtn').addEventListener('click', () => {
        activePages.forEach((p, idx) => {
          p.rotation = (p.rotation + 90) % 360;
          const target = document.getElementById(`pagePreviewTarget-${idx}`);
          if (target) target.style.transform = `rotate(${p.rotation}deg)`;
        });
      });
      document.getElementById('rotateAllLeftBtn').addEventListener('click', () => {
        activePages.forEach((p, idx) => {
          p.rotation = (p.rotation + 270) % 360;
          const target = document.getElementById(`pagePreviewTarget-${idx}`);
          if (target) target.style.transform = `rotate(${p.rotation}deg)`;
        });
      });
      document.getElementById('rotateAll180Btn').addEventListener('click', () => {
        activePages.forEach((p, idx) => {
          p.rotation = (p.rotation + 180) % 360;
          const target = document.getElementById(`pagePreviewTarget-${idx}`);
          if (target) target.style.transform = `rotate(${p.rotation}deg)`;
        });
      });
    } else if (currentTool === 'pdf-to-img') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="imgFormatSelect">Image Format</label>
          <select id="imgFormatSelect">
            <option value="png">PNG (Lossless & Crisp)</option>
            <option value="jpeg">JPEG (Compact File Size)</option>
          </select>
        </div>
        <div class="setting-group">
          <label for="imgScaleSelect">Resolution / Quality</label>
          <select id="imgScaleSelect">
            <option value="1.5">Standard (1.5x)</option>
            <option value="2.0" selected>High Resolution (2.0x)</option>
            <option value="3.0">Ultra High Resolution (3.0x)</option>
          </select>
        </div>
      `;
    } else if (currentTool === 'img-to-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="pageSizeSelect">Page Sizing</label>
          <select id="pageSizeSelect">
            <option value="a4" selected>A4 (Auto Orientation)</option>
            <option value="fit">Fit Page to Image (Original Aspect)</option>
            <option value="letter">US Letter (Auto Orientation)</option>
          </select>
        </div>
        <div class="setting-group">
          <label for="pageMarginSelect">Page Margins</label>
          <select id="pageMarginSelect">
            <option value="0">No Margin (Full Bleed)</option>
            <option value="20" selected>Small Margin (20pt)</option>
            <option value="40">Large Margin (40pt)</option>
          </select>
        </div>
      `;
    } else if (currentTool === 'watermark') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="wmTextInput">Watermark Text</label>
          <input type="text" id="wmTextInput" value="CONFIDENTIAL" maxlength="40">
        </div>
        <div class="setting-group">
          <label for="wmOpacityInput">Opacity: <span id="wmOpacityVal">25%</span></label>
          <input type="range" id="wmOpacityInput" min="5" max="100" value="25" style="accent-color: var(--primary);">
        </div>
        <div class="setting-group">
          <label for="wmSizeInput">Font Size: <span id="wmSizeVal">48</span></label>
          <input type="range" id="wmSizeInput" min="20" max="90" value="48" style="accent-color: var(--primary);">
        </div>
        <div class="setting-group">
          <label for="wmAngleSelect">Rotation Angle</label>
          <select id="wmAngleSelect">
            <option value="45" selected>45° (Diagonal)</option>
            <option value="0">0° (Horizontal)</option>
            <option value="-45">-45° (Reverse Diagonal)</option>
            <option value="90">90° (Vertical)</option>
          </select>
        </div>
        <div class="setting-group">
          <label for="wmColorPicker">Watermark Color</label>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <input type="color" id="wmColorPicker" value="#e5322d" style="width: 48px; height: 36px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;">
            <span class="setting-hint">Choose any custom color</span>
          </div>
        </div>
      `;
      const opInput = document.getElementById('wmOpacityInput');
      const opVal = document.getElementById('wmOpacityVal');
      opInput.addEventListener('input', () => { opVal.textContent = `${opInput.value}%`; });

      const sizeInput = document.getElementById('wmSizeInput');
      const sizeVal = document.getElementById('wmSizeVal');
      sizeInput.addEventListener('input', () => { sizeVal.textContent = sizeInput.value; });
    } else if (currentTool === 'page-numbers') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="pnPosSelect">Position</label>
          <select id="pnPosSelect">
            <option value="bottom-center" selected>Bottom Center</option>
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="top-center">Top Center</option>
            <option value="top-right">Top Right</option>
            <option value="top-left">Top Left</option>
          </select>
        </div>
        <div class="setting-group">
          <label for="pnFormatInput">Format String</label>
          <input type="text" id="pnFormatInput" value="Page {n} of {total}">
          <p class="setting-hint">Use <code>{n}</code> for page number and <code>{total}</code> for total pages.</p>
        </div>
        <div class="setting-group">
          <label for="pnStartNumberInput">Start Number Offset</label>
          <input type="number" id="pnStartNumberInput" value="1" min="1" style="max-width: 100px;">
        </div>
        <div class="setting-group">
          <label class="radio-option">
            <input type="checkbox" id="pnSkipCoverInput">
            <span>Skip first page (Cover page)</span>
          </label>
        </div>
      `;
    } else if (currentTool === 'compress' || currentTool === 'compress-pdf') {
      const origSizeKb = file ? Math.round(file.size / 1024) : 0;
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Compression Level</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="compressPreset" value="recommended" checked>
              <span><strong>Recommended Compression</strong><br><small style="color:var(--text-muted)">Balanced file size reduction & crisp text</small></span>
            </label>
            <label class="radio-option">
              <input type="radio" name="compressPreset" value="extreme">
              <span><strong>Extreme Compression</strong><br><small style="color:var(--text-muted)">Maximum file size reduction</small></span>
            </label>
            <label class="radio-option">
              <input type="radio" name="compressPreset" value="less">
              <span><strong>Less Compression</strong><br><small style="color:var(--text-muted)">Highest fidelity, light stream compaction</small></span>
            </label>
          </div>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label class="checkbox-option">
            <input type="checkbox" id="compressStripMetadata" checked>
            <span>Strip document metadata & unreferenced tokens</span>
          </label>
        </div>
        <div style="background: var(--bg-surface); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); font-size: 0.85rem; margin-top: 0.75rem;">
          <strong>Original Size:</strong> ${origSizeKb} KB<br>
          <strong>Target:</strong> Flate-deflated object streams
        </div>
      `;
    } else if (currentTool === 'repair' || currentTool === 'repair-pdf') {
      const fileSizeKb = file ? Math.round(file.size / 1024) : 0;
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Repair & Reconstruction Analysis</label>
          <p class="setting-hint" style="line-height: 1.5;">
            Scans document token stream for unreferenced indirect objects, repairs broken or truncated trailer dictionaries, heals missing EOF markers, and reconstructs standard cross-reference (XRef) offset tables in-memory.
          </p>
          <div style="background: var(--bg-surface); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); font-size: 0.85rem; margin-top: 0.75rem;">
            <strong>Status:</strong> Ready for reconstruction<br>
            <strong>Document Size:</strong> ${fileSizeKb} KB
          </div>
        </div>
      `;
    } else if (currentTool === 'redact' || currentTool === 'redact-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="redactPageSelect">Target Page</label>
          <select id="redactPageSelect">
            ${Array.from({ length: totalPages }, (_, i) => `<option value="${i}">Page ${i + 1}</option>`).join('')}
          </select>
        </div>
        <div class="setting-group">
          <label for="redactLabelInput">Redaction Text Label (Optional)</label>
          <input type="text" id="redactLabelInput" placeholder="e.g. [REDACTED]" value="[REDACTED]">
          <span class="setting-hint">White text printed centered inside the blackout bar.</span>
        </div>
        <div class="setting-group">
          <label>Quick Area Presets</label>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.25rem;">
            <button type="button" class="secondary-btn" id="redactPresetHeader" style="flex:1;">Header</button>
            <button type="button" class="secondary-btn" id="redactPresetCenter" style="flex:1;">Center</button>
            <button type="button" class="secondary-btn" id="redactPresetFooter" style="flex:1;">Footer</button>
          </div>
        </div>
        <div class="setting-group" style="margin-top: 0.5rem;">
          <label>Coordinates (PDF points)</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div><small>X</small><input type="number" id="redactX" value="50"></div>
            <div><small>Y</small><input type="number" id="redactY" value="450"></div>
            <div><small>Width</small><input type="number" id="redactW" value="250"></div>
            <div><small>Height</small><input type="number" id="redactH" value="30"></div>
          </div>
        </div>
      `;

      setTimeout(() => {
        const btnH = document.getElementById('redactPresetHeader');
        const btnC = document.getElementById('redactPresetCenter');
        const btnF = document.getElementById('redactPresetFooter');
        if (btnH) btnH.onclick = () => { document.getElementById('redactX').value = 50; document.getElementById('redactY').value = 700; document.getElementById('redactW').value = 400; document.getElementById('redactH').value = 35; };
        if (btnC) btnC.onclick = () => { document.getElementById('redactX').value = 50; document.getElementById('redactY').value = 450; document.getElementById('redactW').value = 300; document.getElementById('redactH').value = 40; };
        if (btnF) btnF.onclick = () => { document.getElementById('redactX').value = 50; document.getElementById('redactY').value = 50; document.getElementById('redactW').value = 400; document.getElementById('redactH').value = 30; };
      }, 50);
    } else if (currentTool === 'compare' || currentTool === 'compare-pdf') {
      const docAName = uploadedFiles[0] ? escapeHtml(uploadedFiles[0].name) : 'Document A';
      const docBName = uploadedFiles[1] ? escapeHtml(uploadedFiles[1].name) : 'Not yet selected (use + Add More Files)';
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Document Comparison</label>
          <p class="setting-hint" style="line-height: 1.5;">Compare two versions of a PDF document to verify modifications and discrepancies.</p>
          <div style="background: var(--bg-surface); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); font-size: 0.85rem; margin-top: 0.5rem; line-height: 1.6;">
            <strong>Document A:</strong> ${docAName}<br>
            <strong>Document B:</strong> ${docBName}
          </div>
          ${uploadedFiles.length < 2 ? '<p class="setting-hint" style="color: var(--accent); margin-top: 0.5rem;">Click "+ Add More Files" above to upload Document B.</p>' : ''}
        </div>
      `;
    } else if (currentTool === 'text-to-pdf' || currentTool === 'txt-to-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="textToPdfFontSize">Font Size</label>
          <select id="textToPdfFontSize">
            <option value="10">Small (10 pt)</option>
            <option value="12" selected>Standard (12 pt)</option>
            <option value="14">Medium (14 pt)</option>
            <option value="16">Large (16 pt)</option>
          </select>
        </div>
        <div class="setting-group">
          <label for="textToPdfMargin">Page Margins</label>
          <select id="textToPdfMargin">
            <option value="30">Narrow (30 pt)</option>
            <option value="50" selected>Standard (50 pt)</option>
            <option value="70">Wide (70 pt)</option>
          </select>
        </div>
        <div class="setting-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <label for="textToPdfInput">Text Content / Notes</label>
            <button type="button" class="secondary-btn" id="loadTextFileBtn" style="font-size: 0.75rem; padding: 2px 8px;">📂 Load Text File</button>
            <input type="file" id="textFileInputHidden" accept=".txt,.md,text/plain,text/markdown" style="display: none;">
          </div>
          <textarea id="textToPdfInput" rows="8" style="width:100%; border:1px solid var(--border); border-radius:6px; padding:0.5rem; font-family:monospace; font-size:0.85rem;" placeholder="Type, paste text or notes here, or load a .txt/.md file..."></textarea>
          <span class="setting-hint">Word-wraps and paginates into clean A4 PDF pages.</span>
        </div>
      `;

      setTimeout(() => {
        const loadBtn = document.getElementById('loadTextFileBtn');
        const fileIn = document.getElementById('textFileInputHidden');
        if (loadBtn && fileIn) {
          loadBtn.onclick = () => fileIn.click();
          fileIn.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
              const reader = new FileReader();
              reader.onload = (re) => {
                const ed = document.getElementById('textToPdfInput');
                if (ed) ed.value = re.target.result;
              };
              reader.readAsText(e.target.files[0]);
            }
          };
        }
      }, 50);
    } else if (currentTool === 'pdf-to-text' || currentTool === 'pdf-to-txt') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="pdfToTextFormat">Extraction Format</label>
          <select id="pdfToTextFormat">
            <option value="markdown" selected>Markdown (.md) with page headings</option>
            <option value="plain">Plain Text (.txt)</option>
          </select>
        </div>
        <div class="setting-group">
          <label>Extraction Info</label>
          <div style="background: var(--bg-surface); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); font-size: 0.85rem; line-height: 1.5;">
            Extracts textual content, baseline paragraph groupings, and document headings directly in-memory using PDF.js.
          </div>
        </div>
      `;
    } else if (currentTool === 'remove-pages') {
      const sorted = Array.from(selectedRemovePages).sort((a, b) => a - b);
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="removePagesInput">Pages to Remove</label>
          <input type="text" id="removePagesInput" placeholder="e.g. 1, 3-5" value="${sorted.join(', ')}">
          <p class="setting-hint">Click thumbnails to select pages, or enter comma-separated numbers/ranges (1-${totalPages}).</p>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
          <button type="button" class="secondary-btn" id="rmClearBtn" style="flex:1;">Clear</button>
          <button type="button" class="secondary-btn" id="rmEvenBtn" style="flex:1;">Even</button>
          <button type="button" class="secondary-btn" id="rmOddBtn" style="flex:1;">Odd</button>
        </div>
      `;

      const input = document.getElementById('removePagesInput');
      input?.addEventListener('input', () => {
        const val = input.value.trim();
        const indices = PDFCore.parsePageRanges(val, totalPages);
        selectedRemovePages = new Set(indices.map(i => i + 1));
        syncAllRemoveSelectionDOM();
      });

      document.getElementById('rmClearBtn')?.addEventListener('click', () => {
        selectedRemovePages.clear();
        syncRemovePagesInput();
        syncAllRemoveSelectionDOM();
      });

      document.getElementById('rmEvenBtn')?.addEventListener('click', () => {
        selectedRemovePages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p % 2 === 0));
        syncRemovePagesInput();
        syncAllRemoveSelectionDOM();
      });

      document.getElementById('rmOddBtn')?.addEventListener('click', () => {
        selectedRemovePages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p % 2 !== 0));
        syncRemovePagesInput();
        syncAllRemoveSelectionDOM();
      });
    } else if (currentTool === 'extract-pages') {
      const sorted = Array.from(selectedExtractPages).sort((a, b) => a - b);
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="extractPagesInput">Pages to Extract</label>
          <input type="text" id="extractPagesInput" placeholder="e.g. 1, 3-5" value="${sorted.join(', ')}">
          <p class="setting-hint">Click thumbnails to select pages, or enter comma-separated numbers/ranges (1-${totalPages}).</p>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
          <button type="button" class="secondary-btn" id="extAllBtn" style="flex:1;">All</button>
          <button type="button" class="secondary-btn" id="extClearBtn" style="flex:1;">Clear</button>
          <button type="button" class="secondary-btn" id="extOddBtn" style="flex:1;">Odd</button>
          <button type="button" class="secondary-btn" id="extEvenBtn" style="flex:1;">Even</button>
        </div>
      `;

      const input = document.getElementById('extractPagesInput');
      input?.addEventListener('input', () => {
        const val = input.value.trim();
        const indices = PDFCore.parsePageRanges(val, totalPages);
        selectedExtractPages = new Set(indices.map(i => i + 1));
        syncAllExtractSelectionDOM();
      });

      document.getElementById('extAllBtn')?.addEventListener('click', () => {
        selectedExtractPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
        syncExtractPagesInput();
        syncAllExtractSelectionDOM();
      });

      document.getElementById('extClearBtn')?.addEventListener('click', () => {
        selectedExtractPages.clear();
        syncExtractPagesInput();
        syncAllExtractSelectionDOM();
      });

      document.getElementById('extOddBtn')?.addEventListener('click', () => {
        selectedExtractPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p % 2 !== 0));
        syncExtractPagesInput();
        syncAllExtractSelectionDOM();
      });

      document.getElementById('extEvenBtn')?.addEventListener('click', () => {
        selectedExtractPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p % 2 === 0));
        syncExtractPagesInput();
        syncAllExtractSelectionDOM();
      });
    } else if (currentTool === 'crop' || currentTool === 'crop-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Crop Scope</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="cropScope" value="all" checked>
              <span>Apply to all pages (${totalPages} pages)</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="cropScope" value="current">
              <span>Apply to current page only (Page ${cropCurrentPageIndex + 1})</span>
            </label>
          </div>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Crop Boundaries (PDF Points)</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div>X: <strong id="cropPtX">0</strong> pt</div>
            <div>Y: <strong id="cropPtY">0</strong> pt</div>
            <div>W: <strong id="cropPtW">0</strong> pt</div>
            <div>H: <strong id="cropPtH">0</strong> pt</div>
          </div>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Quick Presets</label>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button type="button" class="secondary-btn" id="cropPresetResetBtn" style="flex:1;">Full Page</button>
            <button type="button" class="secondary-btn" id="cropPresetMarginBtn" style="flex:1;">10% Margins</button>
          </div>
        </div>
      `;

      document.getElementById('cropPresetResetBtn')?.addEventListener('click', () => {
        const canvas = document.getElementById('cropPageCanvas');
        if (!canvas) return;
        cropOverlayPos = { left: 0, top: 0, width: canvas.clientWidth, height: canvas.clientHeight };
        const overlay = document.getElementById('cropOverlay');
        if (overlay) {
          overlay.style.left = '0px';
          overlay.style.top = '0px';
          overlay.style.width = `${canvas.clientWidth}px`;
          overlay.style.height = `${canvas.clientHeight}px`;
        }
        updateCropCoordinateDisplay();
      });

      document.getElementById('cropPresetMarginBtn')?.addEventListener('click', () => {
        const canvas = document.getElementById('cropPageCanvas');
        if (!canvas) return;
        const mx = Math.round(canvas.clientWidth * 0.1);
        const my = Math.round(canvas.clientHeight * 0.1);
        cropOverlayPos = {
          left: mx,
          top: my,
          width: Math.max(40, canvas.clientWidth - mx * 2),
          height: Math.max(40, canvas.clientHeight - my * 2),
        };
        const overlay = document.getElementById('cropOverlay');
        if (overlay) {
          overlay.style.left = `${cropOverlayPos.left}px`;
          overlay.style.top = `${cropOverlayPos.top}px`;
          overlay.style.width = `${cropOverlayPos.width}px`;
          overlay.style.height = `${cropOverlayPos.height}px`;
        }
        updateCropCoordinateDisplay();
      });

      updateCropCoordinateDisplay();
    } else if (currentTool === 'forms' || currentTool === 'pdf-forms') {
      let fieldsHtml = '';
      if (!inspectedFormFields || inspectedFormFields.length === 0) {
        fieldsHtml = `
          <div style="background: #f8fafc; border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 1.25rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
            <span style="font-size: 1.5rem; display: block; margin-bottom: 0.25rem;">📄</span>
            No interactive AcroForm fields found in this document.
          </div>
        `;
      } else {
        fieldsHtml = `
          <div class="form-fields-list">
            ${inspectedFormFields.map((f) => {
              let inputControl = '';
              if (f.type === 'checkbox') {
                inputControl = `
                  <label class="radio-option" style="margin-top: 0.25rem;">
                    <input type="checkbox" class="form-field-input" data-field-name="${escapeHtml(f.name)}" ${f.value ? 'checked' : ''}>
                    <span>${f.value ? 'Checked' : 'Unchecked'}</span>
                  </label>
                `;
              } else if (f.type === 'dropdown' || f.type === 'radio' || f.type === 'optionlist') {
                const opts = Array.isArray(f.options) ? f.options : [];
                const currentVal = Array.isArray(f.value) ? f.value[0] : f.value;
                inputControl = `
                  <select class="form-field-input" data-field-name="${escapeHtml(f.name)}">
                    ${opts.map((opt) => `<option value="${escapeHtml(opt)}" ${opt === currentVal ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
                  </select>
                `;
              } else {
                inputControl = `
                  <input type="text" class="form-field-input" data-field-name="${escapeHtml(f.name)}" value="${escapeHtml(f.value || '')}" placeholder="Value">
                `;
              }

              return `
                <div class="form-field-card">
                  <div class="form-field-header">
                    <span class="form-field-name">${escapeHtml(f.name)}</span>
                    <span class="form-field-type">${escapeHtml(f.type)}</span>
                  </div>
                  ${inputControl}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      toolSettings.innerHTML = `
        <div class="setting-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <label>Form Fields (${inspectedFormFields.length})</label>
            <span class="setting-hint">${inspectedFormFields.length} detected</span>
          </div>
          ${fieldsHtml}
        </div>
        <div class="setting-group" style="margin-top: 1rem;">
          <button type="button" class="primary-btn" id="saveInteractiveFormBtn" style="width: 100%; justify-content: center;">
            <span>💾 Save Interactive Form</span>
          </button>
          <button type="button" class="secondary-btn" id="saveFlattenFormBtn" style="width: 100%; justify-content: center; margin-top: 0.5rem; border-color: #f59e0b; color: #b45309; font-weight: 700;">
            <span>⚡ Save & Flatten Form</span>
          </button>
          <span class="setting-hint" style="text-align: center; margin-top: 0.35rem;">
            Flattening permanently bakes responses into page graphics.
          </span>
        </div>
      `;

      document.getElementById('saveInteractiveFormBtn')?.addEventListener('click', () => {
        executeFormAction(false);
      });

      document.getElementById('saveFlattenFormBtn')?.addEventListener('click', () => {
        executeFormAction(true);
      });
    } else if (currentTool === 'unlock' || currentTool === 'unlock-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="unlockPasswordInput">Document Password</label>
          <input type="password" id="unlockPasswordInput" placeholder="Password (leave empty if restricted only)">
          <p class="setting-hint">If your document is restricted by owner permissions, leave blank and click Unlock. If it requires a password to open, enter it above.</p>
        </div>
      `;
    } else if (currentTool === 'protect' || currentTool === 'protect-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="protectPasswordInput">Set Password *</label>
          <input type="password" id="protectPasswordInput" placeholder="Enter password to protect PDF">
          <span class="setting-hint">Password cannot be empty.</span>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label for="protectConfirmInput">Confirm Password *</label>
          <input type="password" id="protectConfirmInput" placeholder="Re-enter password">
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Permissions Constraints</label>
          <label class="radio-option">
            <input type="checkbox" id="protectPermPrinting" checked>
            <span>Allow Printing (High Quality)</span>
          </label>
          <label class="radio-option">
            <input type="checkbox" id="protectPermCopying" checked>
            <span>Allow Copying Content & Graphics</span>
          </label>
          <label class="radio-option">
            <input type="checkbox" id="protectPermModifying" checked>
            <span>Allow Modifying Contents</span>
          </label>
          <label class="radio-option">
            <input type="checkbox" id="protectPermAnnotating" checked>
            <span>Allow Annotations & Form Filling</span>
          </label>
        </div>
      `;
    } else if (currentTool === 'sign' || currentTool === 'sign-pdf') {
      const pageOptions = Array.from({ length: totalPages }, (_, i) => `<option value="${i}" ${i === signCurrentPageIndex ? 'selected' : ''}>Page ${i + 1}</option>`).join('');
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Signature Graphic</label>
          <button type="button" class="primary-btn" id="openSignModalBtn" style="width: 100%; justify-content: center; margin-bottom: 0.5rem;">
            <span>✍️ ${currentSignatureDataUrl ? 'Change Signature' : 'Create Signature'}</span>
          </button>
          <span class="setting-hint">${currentSignatureDataUrl ? 'Signature ready. Drag to reposition or drag handle to resize.' : 'Click above to draw, type, or upload a signature.'}</span>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label for="signPageSelect">Target Page</label>
          <select id="signPageSelect">
            ${pageOptions}
          </select>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>PDF Placement Points</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div>X: <strong id="sigPtX">0</strong> pt</div>
            <div>Y: <strong id="sigPtY">0</strong> pt</div>
            <div>W: <strong id="sigPtW">0</strong> pt</div>
            <div>H: <strong id="sigPtH">0</strong> pt</div>
          </div>
        </div>
      `;

      document.getElementById('openSignModalBtn')?.addEventListener('click', () => {
        openModal('signModal');
      });

      document.getElementById('signPageSelect')?.addEventListener('change', async (e) => {
        signCurrentPageIndex = parseInt(e.target.value, 10) || 0;
        await renderSignPreview();
        renderSettingsPanel();
      });

      updateSigCoordinateDisplay();
    } else if (currentTool === 'edit-pdf' || currentTool === 'edit') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Annotation Tool</label>
          <div class="edit-tools-grid">
            <button type="button" class="edit-tool-btn ${currentEditTool === 'pen' ? 'active' : ''}" data-tool="pen">✏️ Pen</button>
            <button type="button" class="edit-tool-btn ${currentEditTool === 'highlight' ? 'active' : ''}" data-tool="highlight">🖍️ Highlight</button>
            <button type="button" class="edit-tool-btn ${currentEditTool === 'text' ? 'active' : ''}" data-tool="text">🔤 Text</button>
            <button type="button" class="edit-tool-btn ${currentEditTool === 'rect' ? 'active' : ''}" data-tool="rect">⬜ Rect</button>
            <button type="button" class="edit-tool-btn ${currentEditTool === 'ellipse' ? 'active' : ''}" data-tool="ellipse">⭕ Ellipse</button>
            <button type="button" class="edit-tool-btn ${currentEditTool === 'line' ? 'active' : ''}" data-tool="line">📏 Line</button>
          </div>
        </div>
        <div class="setting-group">
          <label for="editColorInput">Color</label>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="color" id="editColorInput" value="${currentEditColor}" style="width: 38px; height: 34px; padding: 0; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
            <div class="edit-color-palette">
              <span class="edit-color-swatch ${currentEditColor === '#ef4444' ? 'active' : ''}" data-color="#ef4444" style="background: #ef4444;" title="Red"></span>
              <span class="edit-color-swatch ${currentEditColor === '#3b82f6' ? 'active' : ''}" data-color="#3b82f6" style="background: #3b82f6;" title="Blue"></span>
              <span class="edit-color-swatch ${currentEditColor === '#10b981' ? 'active' : ''}" data-color="#10b981" style="background: #10b981;" title="Green"></span>
              <span class="edit-color-swatch ${currentEditColor === '#f59e0b' ? 'active' : ''}" data-color="#f59e0b" style="background: #f59e0b;" title="Amber"></span>
              <span class="edit-color-swatch ${currentEditColor === '#fef08a' ? 'active' : ''}" data-color="#fef08a" style="background: #fef08a;" title="Yellow"></span>
              <span class="edit-color-swatch ${currentEditColor === '#000000' ? 'active' : ''}" data-color="#000000" style="background: #000000;" title="Black"></span>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <label for="editStrokeSlider">Stroke Width: <span id="editStrokeLabel">${currentEditWidth}px</span></label>
          <input type="range" id="editStrokeSlider" min="1" max="20" value="${currentEditWidth}">
        </div>
        <div class="setting-group">
          <label for="editFontSizeInput">Font Size: <span id="editFontLabel">${currentEditFontSize}pt</span></label>
          <input type="range" id="editFontSizeInput" min="9" max="64" value="${currentEditFontSize}">
        </div>
        <div class="setting-group" style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          <button type="button" class="secondary-btn" id="editUndoBtn" style="flex: 1;">↩ Undo</button>
          <button type="button" class="secondary-btn" id="editClearBtn" style="flex: 1;">✕ Clear Page</button>
        </div>
      `;

      toolSettings.querySelectorAll('.edit-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          toolSettings.querySelectorAll('.edit-tool-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentEditTool = btn.dataset.tool;
        });
      });

      const colorInput = toolSettings.querySelector('#editColorInput');
      if (colorInput) {
        colorInput.addEventListener('input', (e) => {
          currentEditColor = e.target.value;
          toolSettings.querySelectorAll('.edit-color-swatch').forEach(s => s.classList.remove('active'));
        });
      }

      toolSettings.querySelectorAll('.edit-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
          currentEditColor = swatch.dataset.color;
          if (colorInput) colorInput.value = currentEditColor;
          toolSettings.querySelectorAll('.edit-color-swatch').forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
        });
      });

      const strokeSlider = toolSettings.querySelector('#editStrokeSlider');
      if (strokeSlider) {
        strokeSlider.addEventListener('input', (e) => {
          currentEditWidth = parseInt(e.target.value, 10);
          const lbl = toolSettings.querySelector('#editStrokeLabel');
          if (lbl) lbl.textContent = `${currentEditWidth}px`;
        });
      }

      const fontSlider = toolSettings.querySelector('#editFontSizeInput');
      if (fontSlider) {
        fontSlider.addEventListener('input', (e) => {
          currentEditFontSize = parseInt(e.target.value, 10);
          const lbl = toolSettings.querySelector('#editFontLabel');
          if (lbl) lbl.textContent = `${currentEditFontSize}pt`;
        });
      }

      const undoBtn = toolSettings.querySelector('#editUndoBtn');
      if (undoBtn) {
        undoBtn.addEventListener('click', () => {
          if (editAnnotationsByPage[editCurrentPageIndex] && editAnnotationsByPage[editCurrentPageIndex].length > 0) {
            editAnnotationsByPage[editCurrentPageIndex].pop();
            redrawPageAnnotations();
          }
        });
      }

      const clearBtn = toolSettings.querySelector('#editClearBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          editAnnotationsByPage[editCurrentPageIndex] = [];
          redrawPageAnnotations();
        });
      }
    } else if (currentTool === 'ocr-pdf' || currentTool === 'ocr') {
      const wasmLoaded = typeof window !== 'undefined' && !!window.Tesseract;
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="ocrLangSelect">Recognition Language</label>
          <select id="ocrLangSelect" class="form-select">
            <option value="eng" selected>English (Offline Bundled)</option>
          </select>
          ${!wasmLoaded ? `
            <div style="background:#fffbeb; border:1px solid #fef3c7; color:#92400e; padding:0.6rem; border-radius:var(--radius-sm); font-size:0.8rem; margin-top:0.65rem; line-height:1.4;">
              ⚠️ <strong>WASM Engine Unavailable:</strong> Tesseract WASM is not loaded. OCR requires the WebAssembly runtime to process image text offline.
            </div>
          ` : `
            <p class="setting-hint">100% private in-browser OCR engine generates a searchable, selectable text layer directly in your PDF using local WebAssembly.</p>
          `}
        </div>
      `;
    } else if (currentTool === 'scan-to-pdf' || currentTool === 'scan') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Camera Document Scanner</label>
          <p class="setting-hint">Capture paper documents via your device camera with live auto-contrast and Otsu binarization.</p>
          <button type="button" class="primary-btn" id="openScannerFromSettingsBtn" style="width: 100%; margin-top: 0.5rem;">📷 Launch Scanner</button>
        </div>
      `;
      document.getElementById('openScannerFromSettingsBtn')?.addEventListener('click', () => {
        openCameraScanner();
      });
    } else if (currentTool === 'word-to-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Word to PDF (Beta)</label>
          <p class="setting-hint">Converts headings, paragraphs, and simple tables from Word (.docx). Does not support images, CSS, or complex layout.</p>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Supported Features</label>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            Text &bull; Headings &bull; Simple Paragraphs &bull; Standard Tables<br>
            <span style="color: var(--text-muted); font-size: 0.8rem;">Unsupported: Images, headers/footers, floating frames, custom styles.</span>
          </div>
        </div>
      `;
    } else if (currentTool === 'excel-to-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Excel to PDF (Beta)</label>
          <p class="setting-hint">Converts tabular cell text from Excel (.xlsx) into a landscape grid. Does not support formulas, charts, or cell styling.</p>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Supported Features</label>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            Worksheet Cell Values &bull; Landscape Layout &bull; Auto-width Columns<br>
            <span style="color: var(--text-muted); font-size: 0.8rem;">Unsupported: Formulas, chart rendering, cell fills, fonts, multi-sheet tabs.</span>
          </div>
        </div>
      `;
    } else if (currentTool === 'powerpoint-to-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>PowerPoint to PDF (Beta)</label>
          <p class="setting-hint">Converts slide titles, bullet points, and text into 16:9 slides. Does not support images, shapes, or complex layout.</p>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Supported Features</label>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            Slide Titles &bull; Bullet Points &bull; 16:9 Presentation Pages<br>
            <span style="color: var(--text-muted); font-size: 0.8rem;">Unsupported: Vector shapes, embedded pictures, animations, master templates.</span>
          </div>
        </div>
      `;
    } else if (currentTool === 'html-to-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>HTML to PDF (Beta)</label>
          <p class="setting-hint">Converts text, headings, and simple tables from HTML. Does not support CSS layout, external fonts, or scripts.</p>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Supported Features</label>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            Headings &bull; Text Paragraphs &bull; Lists &bull; Simple Tables<br>
            <span style="color: var(--text-muted); font-size: 0.8rem;">Unsupported: CSS grid/flex layout, web fonts, JavaScript, external media.</span>
          </div>
        </div>
      `;
    } else if (currentTool === 'pdf-to-word') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>PDF to Word (Beta)</label>
          <p class="setting-hint">Extracts text and headings into Word (.docx) paragraphs. Does not support images or complex layouts.</p>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Output Format</label>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            Microsoft Word (.docx) &bull; OpenXML Standard &bull; Multi-page breaks
          </div>
        </div>
      `;
    } else if (currentTool === 'pdf-to-excel') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>PDF to Excel (Beta)</label>
          <p class="setting-hint">Extracts tabular text into Excel (.xlsx) sheets. Does not support charts, cell styling, or formulas.</p>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Output Format</label>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            Microsoft Excel (.xlsx) &bull; Shared String Table &bull; Tabular Grid
          </div>
        </div>
      `;
    } else if (currentTool === 'pdf-to-powerpoint') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>PDF to PowerPoint (Beta)</label>
          <p class="setting-hint">Extracts text into 16:9 presentation slides (.pptx). Does not support shapes, animations, or templates.</p>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Output Format</label>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            Microsoft PowerPoint (.pptx) &bull; 1 Slide per Document Page
          </div>
        </div>
      `;
    } else if (currentTool === 'pdf-to-pdfa') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>PDF/A Archival Profile</label>
          <div style="font-size: 0.85rem; background: #fffbeb; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid #fef3c7; color: #92400e; line-height: 1.4;">
            <strong>PDF/A metadata only (not validated, not conformant)</strong><br>
            <span class="setting-hint" style="color: #92400e;">Appends XMP metadata schema (pdfaid) and sRGB OutputIntents dictionary. Does not embed missing fonts or guarantee ISO 19005-1 conformance.</span>
          </div>
        </div>
      `;
    } else if (currentTool === 'ai-summarizer' || currentTool === 'summarizer') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>AI Summarizer Options</label>
          <p class="setting-hint">Generates an executive overview and key bullet takeaways directly in your browser with 100% privacy.</p>
        </div>
        <div class="setting-group" style="margin-top: 0.75rem;">
          <label>Summary Type</label>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            Executive Summary &bull; Key Takeaways &bull; Document Reading Stats
          </div>
        </div>
      `;
    } else if (currentTool === 'translate-pdf' || currentTool === 'translate') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="translateLangSelect">Target Language (Glossary Dictionary)</label>
          <select id="translateLangSelect" class="form-select">
            <option value="es" selected>Spanish (Español)</option>
            <option value="fr">French (Français)</option>
            <option value="de">German (Deutsch)</option>
            <option value="it">Italian (Italiano)</option>
          </select>
          <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.65rem; margin-top: 0.65rem; font-size: 0.8rem; line-height: 1.5;">
            <strong>🔒 Zero-Network Transmission Disclosure:</strong>
            <p style="margin: 0.25rem 0 0; color: var(--text-muted);">This tool executes 100% offline inside your browser. No document content, text, or metadata is ever transmitted over any network or sent to cloud translation services. Translations are performed via local in-memory business glossary dictionaries.</p>
          </div>
        </div>
      `;
    } else if (currentTool === 'pdf-to-markdown' || currentTool === 'pdf-to-md') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Markdown Formatting</label>
          <p class="setting-hint">Extracts structured headers (#, ##), lists, and table data into an editable .md document.</p>
        </div>
      `;
    }
  }

  // --- Form Action Execution Helper ---
  async function executeFormAction(flatten) {
    if (uploadedFiles.length === 0) return;
    if (isProcessing) return;

    isProcessing = true;
    executeBtn.disabled = true;
    showStatus(flatten ? 'Flattening and saving form...' : 'Saving filled form...', 'processing');

    try {
      const srcBytes = uploadedFiles[0].bytes.slice();
      const fieldValues = {};
      toolSettings.querySelectorAll('.form-field-input').forEach((input) => {
        const name = input.dataset.fieldName;
        if (!name) return;
        if (input.type === 'checkbox') {
          fieldValues[name] = input.checked;
        } else {
          fieldValues[name] = input.value;
        }
      });

      const resultBytes = await executeCoreOp('fillForm', [srcBytes, fieldValues, flatten]);
      const outFilename = flatten ? 'flattened_form.pdf' : 'filled_form.pdf';
      downloadFile(resultBytes, outFilename, 'application/pdf');
      showSuccess(flatten ? 'Form successfully flattened and saved!' : 'Interactive form saved successfully!');
    } catch (err) {
      console.error(err);
      showStatus(err.message || 'Error processing form.', 'error');
    } finally {
      isProcessing = false;
      executeBtn.disabled = false;
    }
  }

  // --- Execution Handlers ---
  executeBtn.addEventListener('click', async () => {
    if (isProcessing) return;
    if (uploadedFiles.length === 0) {
      showStatus('Please select a file to process.', 'error');
      return;
    }

    isProcessing = true;
    executeBtn.disabled = true;
    if (cancelProcessBtn) cancelProcessBtn.style.display = 'block';
    showStatus('Processing your document...', 'processing');

    try {
      if (currentTool === 'merge') {
        if (uploadedFiles.length < 2) {
          throw new Error('Please add at least 2 PDF files to merge.');
        }
        const bytesList = uploadedFiles.map((f) => f.bytes.slice());
        const mergedBytes = await executeCoreOp('mergePDFs', [bytesList]);
        downloadFile(mergedBytes, 'merged.pdf', 'application/pdf');
        showSuccess('Your PDFs have been successfully merged!');
      } else if (currentTool === 'split') {
        const mode = document.querySelector('input[name="splitMode"]:checked').value;
        const srcBytes = uploadedFiles[0].bytes.slice();

        if (mode === 'all') {
          const splitResults = await executeCoreOp('splitPDF', [srcBytes]);
          if (!window.JSZip) throw new Error('ZIP library not loaded.');
          const zip = new window.JSZip();
          splitResults.forEach((item) => {
            zip.file(`page_${item.pageNumber}.pdf`, item.bytes);
          });
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          downloadBlob(zipBlob, 'split_pages.zip');
          showSuccess(`Extracted ${splitResults.length} pages into split_pages.zip!`);
        } else {
          const rangeStr = document.getElementById('pageRangesInput').value;
          const totalPages = uploadedFiles[0].pageCount || activePages.length;
          const indices = PDFCore.parsePageRanges(rangeStr, totalPages);
          if (indices.length === 0) throw new Error('No valid pages found in the specified range.');
          
          const extractedBytes = await executeCoreOp('extractPages', [srcBytes, indices]);
          downloadFile(extractedBytes, 'extracted.pdf', 'application/pdf');
          showSuccess(`Extracted ${indices.length} pages into extracted.pdf!`);
        }
      } else if (currentTool === 'organize') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const validPages = activePages
          .filter((p) => !p.isDeleted)
          .map((p) => ({
            sourceIndex: p.pageNum - 1,
            rotation: p.rotation,
          }));

        if (validPages.length === 0) {
          throw new Error('At least one page must be included (cannot delete all pages).');
        }

        const organizedBytes = await executeCoreOp('organizePDF', [srcBytes, validPages]);
        downloadFile(organizedBytes, 'organized.pdf', 'application/pdf');
        showSuccess(`Saved organized PDF with ${validPages.length} page(s)!`);
      } else if (currentTool === 'rotate') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const firstRot = activePages.length > 0 ? activePages[0].rotation : 0;
        const isUniform = activePages.every((p) => p.rotation === firstRot);
        let rotatedBytes;

        if (isUniform && firstRot !== 0) {
          // In-place rotation preserves document bookmarks, outlines, and form fields
          rotatedBytes = await executeCoreOp('rotatePDF', [srcBytes, firstRot]);
        } else {
          const pagesConfig = activePages.map((p) => ({
            sourceIndex: p.pageNum - 1,
            rotation: p.rotation,
          }));
          rotatedBytes = await executeCoreOp('organizePDF', [srcBytes, pagesConfig]);
        }
        downloadFile(rotatedBytes, 'rotated.pdf', 'application/pdf');
        showSuccess('Your PDF pages have been rotated!');
      } else if (currentTool === 'pdf-to-img') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const format = document.getElementById('imgFormatSelect').value;
        const scale = parseFloat(document.getElementById('imgScaleSelect').value) || 2.0;

        if (!window.pdfjsLib) throw new Error('PDF.js rendering engine is not loaded.');
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        }
        let pdf = null;
        try {
          pdf = trackPdfDoc(await window.pdfjsLib.getDocument({ data: new Uint8Array(srcBytes) }).promise);
          const total = pdf.numPages;

          if (total === 1) {
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            canvas.toBlob((blob) => {
              downloadBlob(blob, `page_1.${format === 'jpeg' ? 'jpg' : 'png'}`);
              showSuccess('Converted page 1 to image!');
            }, format === 'jpeg' ? 'image/jpeg' : 'image/png');
          } else {
            if (!window.JSZip) throw new Error('ZIP library not loaded.');
            const zip = new window.JSZip();

            for (let i = 1; i <= total; i++) {
              showStatus(`Converting page ${i} of ${total}...`, 'processing');
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

              const blob = await new Promise((res) => canvas.toBlob(res, format === 'jpeg' ? 'image/jpeg' : 'image/png'));
              const ext = format === 'jpeg' ? 'jpg' : 'png';
              zip.file(`page_${i}.${ext}`, blob);
            }

            showStatus('Creating ZIP file...', 'processing');
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, 'pdf_images.zip');
            showSuccess(`Successfully converted all ${total} pages into ZIP!`);
          }
        } finally {
          if (pdf && typeof pdf.destroy === 'function') {
            try {
              await pdf.destroy();
              activePdfDocs.delete(pdf);
            } catch (e) {}
          }
        }
      } else if (currentTool === 'img-to-pdf') {
        const margin = parseInt(document.getElementById('pageMarginSelect').value, 10);
        const pageSize = document.getElementById('pageSizeSelect').value;
        const imageItems = [];

        for (const item of uploadedFiles) {
          let bytes = item.bytes;
          let type = item.file.type.includes('png') ? 'png' : 'jpeg';

          // Safely decode images through canvas to normalize progressive JPEGs and other formats
          try {
            const imgBitmap = await createImageBitmap(item.file);
            const canvas = document.createElement('canvas');
            canvas.width = imgBitmap.width;
            canvas.height = imgBitmap.height;
            canvas.getContext('2d').drawImage(imgBitmap, 0, 0);
            const outMime = type === 'png' ? 'image/png' : 'image/jpeg';
            const blob = await new Promise((res) => canvas.toBlob(res, outMime, 0.92));
            bytes = new Uint8Array(await blob.arrayBuffer());
          } catch {
            // Keep original raw bytes if createImageBitmap is not supported
          }
          imageItems.push({ bytes, type });
        }

        const pdfBytes = await executeCoreOp('imagesToPDF', [imageItems, { margin, pageSize }]);
        downloadFile(pdfBytes, 'converted_images.pdf', 'application/pdf');
        showSuccess(`Converted ${imageItems.length} images into PDF!`);
      } else if (currentTool === 'watermark') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const text = document.getElementById('wmTextInput').value || 'CONFIDENTIAL';
        const opacity = parseInt(document.getElementById('wmOpacityInput').value, 10) / 100;
        const fontSize = parseInt(document.getElementById('wmSizeInput').value, 10);
        const angle = parseInt(document.getElementById('wmAngleSelect').value, 10);
        const colorHex = document.getElementById('wmColorPicker').value || '#e5322d';

        const hexNum = parseInt(colorHex.replace('#', ''), 16);
        const r = ((hexNum >> 16) & 255) / 255;
        const g = ((hexNum >> 8) & 255) / 255;
        const b = (hexNum & 255) / 255;

        const watermarkedBytes = await executeCoreOp('watermarkPDF', [srcBytes, {
          text,
          opacity,
          fontSize,
          angle,
          r, g, b,
        }]);
        downloadFile(watermarkedBytes, 'watermarked.pdf', 'application/pdf');
        showSuccess('Watermark applied successfully!');
      } else if (currentTool === 'page-numbers') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const position = document.getElementById('pnPosSelect').value;
        const format = document.getElementById('pnFormatInput').value || 'Page {n} of {total}';
        const startNumber = parseInt(document.getElementById('pnStartNumberInput').value, 10) || 1;
        const skipCount = document.getElementById('pnSkipCoverInput').checked ? 1 : 0;

        const numberedBytes = await executeCoreOp('addPageNumbers', [srcBytes, {
          position,
          format,
          startNumber,
          skipCount,
        }]);
        downloadFile(numberedBytes, 'numbered.pdf', 'application/pdf');
        showSuccess('Page numbers added successfully!');
      } else if (currentTool === 'extract-pages') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const total = uploadedFiles[0].pageCount || 1;
        const inputVal = (document.getElementById('extractPagesInput')?.value || '').trim();
        let indices = [];
        if (inputVal) {
          indices = PDFCore.parsePageRanges(inputVal, total);
        } else if (selectedExtractPages.size > 0) {
          indices = Array.from(selectedExtractPages).map(p => p - 1).filter(i => i >= 0 && i < total).sort((a, b) => a - b);
        } else {
          indices = Array.from({ length: total }, (_, i) => i);
        }
        if (indices.length === 0) {
          throw new Error('Please select at least one page to extract.');
        }
        const extractedBytes = await executeCoreOp('extractPages', [srcBytes, indices]);
        downloadFile(extractedBytes, 'extracted.pdf', 'application/pdf');
        showSuccess(`Extracted ${indices.length} pages into extracted.pdf!`);
      } else if (currentTool === 'remove-pages') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const total = uploadedFiles[0].pageCount || 1;
        const inputVal = (document.getElementById('removePagesInput')?.value || '').trim();
        let indicesToRemove = [];
        if (inputVal) {
          indicesToRemove = PDFCore.parsePageRanges(inputVal, total);
        } else if (selectedRemovePages.size > 0) {
          indicesToRemove = Array.from(selectedRemovePages).map(p => p - 1).filter(i => i >= 0 && i < total).sort((a, b) => a - b);
        }
        if (indicesToRemove.length === 0) {
          throw new Error('Please select at least one page to remove.');
        }
        if (indicesToRemove.length >= total) {
          throw new Error('Cannot remove all pages: at least one page must remain in the document.');
        }
        const resultBytes = await executeCoreOp('removePages', [srcBytes, indicesToRemove]);
        downloadFile(resultBytes, 'removed_pages.pdf', 'application/pdf');
        showSuccess(`Removed ${indicesToRemove.length} page(s) successfully!`);
      } else if (currentTool === 'protect' || currentTool === 'protect-pdf') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const pass = (document.getElementById('protectPasswordInput')?.value || '').trim();
        const confirmPass = (document.getElementById('protectConfirmInput')?.value || '').trim();
        if (!pass) {
          throw new Error('Password cannot be empty.');
        }
        if (pass !== confirmPass) {
          throw new Error('Passwords do not match. Please verify your confirmation password.');
        }
        const permissions = {
          printing: document.getElementById('protectPermPrinting')?.checked ?? true,
          copying: document.getElementById('protectPermCopying')?.checked ?? true,
          modifying: document.getElementById('protectPermModifying')?.checked ?? true,
          annotating: document.getElementById('protectPermAnnotating')?.checked ?? true,
        };
        const protectedBytes = await executeCoreOp('protectPDF', [srcBytes, pass, null, permissions]);
        downloadFile(protectedBytes, 'protected.pdf', 'application/pdf');
        showSuccess('Your PDF has been encrypted with password protection!');
      } else if (currentTool === 'unlock' || currentTool === 'unlock-pdf') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const pass = (document.getElementById('unlockPasswordInput')?.value || '').trim();
        const unlockedBytes = await executeCoreOp('unlockPDF', [srcBytes, pass]);
        downloadFile(unlockedBytes, 'unlocked.pdf', 'application/pdf');
        showSuccess('Your PDF has been unlocked and decrypted successfully!');
      } else if (currentTool === 'sign' || currentTool === 'sign-pdf') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        if (!currentSignatureDataUrl) {
          throw new Error('Please create or upload a signature first using "Create Signature".');
        }
        const canvas = document.getElementById('signPageCanvas');
        if (!canvas) throw new Error('Signature preview canvas not ready.');

        const prevW = canvas.clientWidth || canvas.width || 1;
        const prevH = canvas.clientHeight || canvas.height || 1;
        const pdfW = currentPdfPageSize.width || 612;
        const pdfH = currentPdfPageSize.height || 792;

        const scaleX = pdfW / prevW;
        const scaleY = pdfH / prevH;

        const pdfX = Math.round(sigOverlayPos.left * scaleX);
        const pdfY = Math.round(pdfH - (sigOverlayPos.top + sigOverlayPos.height) * scaleY);
        const pdfWidth = Math.round(sigOverlayPos.width * scaleX);
        const pdfHeight = Math.round(sigOverlayPos.height * scaleY);

        const signedBytes = await executeCoreOp('signPDF', [srcBytes, currentSignatureDataUrl, signCurrentPageIndex, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        }]);
        downloadFile(signedBytes, 'signed.pdf', 'application/pdf');
        showSuccess('Signature baked into PDF successfully!');
      } else if (currentTool === 'crop' || currentTool === 'crop-pdf') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const canvas = document.getElementById('cropPageCanvas');
        if (!canvas) throw new Error('Crop preview canvas not initialized.');

        const prevW = canvas.clientWidth || canvas.width || 1;
        const prevH = canvas.clientHeight || canvas.height || 1;
        const pdfW = cropPageSize.width || 612;
        const pdfH = cropPageSize.height || 792;

        const scaleX = pdfW / prevW;
        const scaleY = pdfH / prevH;

        const pdfX = Math.round(cropOverlayPos.left * scaleX);
        const pdfY = Math.round(pdfH - (cropOverlayPos.top + cropOverlayPos.height) * scaleY);
        const pdfWidth = Math.round(cropOverlayPos.width * scaleX);
        const pdfHeight = Math.round(cropOverlayPos.height * scaleY);

        if (pdfWidth <= 0 || pdfHeight <= 0) {
          throw new Error('Crop width and height must be positive numbers.');
        }

        const scope = document.querySelector('input[name="cropScope"]:checked')?.value || 'all';
        let cropBoxes;
        if (scope === 'current') {
          cropBoxes = [{ pageIndex: cropCurrentPageIndex, x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight }];
        } else {
          cropBoxes = { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight };
        }

        const croppedBytes = await executeCoreOp('cropPDF', [srcBytes, cropBoxes]);
        downloadFile(croppedBytes, 'cropped.pdf', 'application/pdf');
        showSuccess('Your PDF has been successfully cropped!');
      } else if (currentTool === 'forms' || currentTool === 'pdf-forms') {
        await executeFormAction(false);
      } else if (currentTool === 'compress' || currentTool === 'compress-pdf') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const preset = document.querySelector('input[name="compressPreset"]:checked')?.value || 'recommended';
        const stripMetadata = document.getElementById('compressStripMetadata')?.checked ?? true;
        const compressedBytes = jobRunner
          ? await executeCoreOp('compressPDF', [srcBytes, { level: preset, stripMetadata }])
          : await PDFCore.compressPDF(srcBytes, { level: preset, stripMetadata });
        const oldSize = srcBytes.length;
        const newSize = compressedBytes.length;
        const ratio = oldSize > 0 ? Math.round(((oldSize - newSize) / oldSize) * 100) : 0;
        downloadFile(compressedBytes, 'compressed.pdf', 'application/pdf');
        showSuccess(`Compressed from ${(oldSize / 1024).toFixed(1)} KB to ${(newSize / 1024).toFixed(1)} KB (${ratio >= 0 ? '-' + ratio + '%' : '+0%'})!`);
      } else if (currentTool === 'repair' || currentTool === 'repair-pdf') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const repairedBytes = await executeCoreOp('repairPDF', [srcBytes]);
        downloadFile(repairedBytes, 'repaired.pdf', 'application/pdf');
        showSuccess('PDF repaired and cross-reference tables reconstructed successfully!');
      } else if (currentTool === 'redact' || currentTool === 'redact-pdf') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const pageIdx = parseInt(document.getElementById('redactPageSelect')?.value || '0', 10);
        const label = document.getElementById('redactLabelInput')?.value || '';
        const x = parseFloat(document.getElementById('redactX')?.value || '50');
        const y = parseFloat(document.getElementById('redactY')?.value || '450');
        const width = parseFloat(document.getElementById('redactW')?.value || '250');
        const height = parseFloat(document.getElementById('redactH')?.value || '30');
        const redactedBytes = await executeCoreOp('redactPDF', [srcBytes, [{
          pageIndex: pageIdx,
          x,
          y,
          width,
          height,
          label: label || undefined,
        }]]);
        downloadFile(redactedBytes, 'redacted.pdf', 'application/pdf');
        showSuccess('Document text purged and redacted successfully!');
      } else if (currentTool === 'compare' || currentTool === 'compare-pdf') {
        if (uploadedFiles.length < 2) {
          throw new Error('Please select at least 2 PDF files to compare revisions.');
        }
        showStatus('Comparing revisions...', 'processing');
        const fileA = uploadedFiles[0].bytes.slice();
        const fileB = uploadedFiles[1].bytes.slice();
        const result = await PDFCore.comparePDF(fileA, fileB, { maxDiffImages: 1 });
        const diffPages = result.diffPages || [];
        if (!diffPages || diffPages.length === 0) {
          throw new Error('Failed to parse either PDF document for comparison. Ensure both files are valid PDFs.');
        }
        const modifiedPages = diffPages.filter(p => p.diffPixels > 0).length;
        const totalDiff = result.totalDiffPixels !== undefined ? result.totalDiffPixels : diffPages.reduce((s, p) => s + p.diffPixels, 0);
        const avgDiff = diffPages.length > 0
          ? (diffPages.reduce((s, p) => s + p.diffPercent, 0) / diffPages.length).toFixed(1)
          : '0.0';

        const pageWithDiff = diffPages.find(p => p.canvasDataUrl);
        if (pageWithDiff && pageWithDiff.canvasDataUrl) {
          const dataUrl = pageWithDiff.canvasDataUrl;
          const base64 = dataUrl.split(',')[1];
          const bin = atob(base64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          downloadBlob(new Blob([u8], { type: 'image/png' }), 'revision_comparison_diff.png');
        } else {
          const report = `PDF Document Comparison Report\n` +
            `================================\n` +
            `Document A: ${uploadedFiles[0].name}\n` +
            `Document B: ${uploadedFiles[1].name}\n` +
            `Total Pages: ${diffPages.length}\n` +
            `Modified Pages: ${modifiedPages}\n` +
            `Average Discrepancy: ${avgDiff}%\n\n` +
            `Page Breakdown:\n` +
            diffPages.map(p => `  • Page ${p.pageIndex + 1}: ${p.diffPercent}% diff (${p.diffPixels} pixels)`).join('\n') +
            `\n\nGenerated by PDF Studio (100% Client-Side In-Browser)`;
          downloadBlob(new Blob([report], { type: 'text/plain' }), 'revision_comparison_report.txt');
        }

        if (totalDiff > 0) {
          showSuccess(`Comparison complete! Found ${modifiedPages} page(s) with differences (${avgDiff}% avg discrepancy).`);
        } else {
          showSuccess('Comparison complete! Documents are visually and structurally identical (0% diff).');
        }
      } else if (currentTool === 'scan-to-pdf') {
        if (uploadedFiles.length === 0) {
          throw new Error('Please capture or select at least one page image to compile into a PDF.');
        }
        const imgList = uploadedFiles.map(f => ({
          bytes: f.bytes,
          type: (f.file && f.file.type && f.file.type.includes('png')) ? 'png' : 'jpeg',
        }));
        const pdfBytes = await executeCoreOp('imagesToPDF', [imgList, { pageSize: 'a4', margin: 20 }]);
        downloadFile(pdfBytes, 'scanned_document.pdf', 'application/pdf');
        showSuccess(`Compiled ${imgList.length} scanned page(s) into PDF!`);
      } else if (currentTool === 'text-to-pdf' || currentTool === 'txt-to-pdf') {
        let textContent = '';
        const editor = document.getElementById('textToPdfInput');
        if (editor && editor.value) {
          textContent = editor.value;
        } else if (uploadedFiles[0] && uploadedFiles[0].bytes) {
          textContent = new TextDecoder('utf-8').decode(uploadedFiles[0].bytes);
        }
        if (!textContent.trim()) throw new Error('Please enter text or upload a text file to convert.');
        const fontSize = parseInt(document.getElementById('textToPdfFontSize')?.value || document.getElementById('txtFontSize')?.value || '12', 10);
        const margin = parseInt(document.getElementById('textToPdfMargin')?.value || document.getElementById('txtMargin')?.value || '50', 10);
        const pdfBytes = await executeCoreOp('textToPDF', [textContent, { fontSize, margin }]);
        downloadFile(pdfBytes, 'converted_text.pdf', 'application/pdf');
        showSuccess('Text document successfully converted to PDF!');
      } else if (currentTool === 'pdf-to-text' || currentTool === 'pdf-to-txt') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const format = document.getElementById('pdfToTextFormat')?.value || document.getElementById('txtOutputFormat')?.value || 'markdown';
        const extractedText = await executeCoreOp('pdfToText', [srcBytes, { format }]);
        const ext = format === 'markdown' ? 'md' : 'txt';
        const mime = format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
        const blob = new Blob([extractedText], { type: mime });
        downloadBlob(blob, `extracted_text.${ext}`);
        showSuccess(`Successfully extracted text to .${ext}!`);
      } else if (currentTool === 'edit-pdf' || currentTool === 'edit') {
        if (uploadedFiles.length === 0) {
          throw new Error('Please upload a PDF document to edit.');
        }
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Applying edits and baking annotations into PDF...', 'processing');
        const pdfBytes = await executeCoreOp('editPDF', [srcBytes, editAnnotationsByPage]);
        downloadFile(pdfBytes, 'edited_document.pdf', 'application/pdf');
        showSuccess('Annotations successfully applied and PDF saved!');
      } else if (currentTool === 'ocr-pdf' || currentTool === 'ocr') {
        if (uploadedFiles.length === 0) {
          throw new Error('Please upload a PDF document to perform OCR.');
        }
        if (typeof window !== 'undefined' && (!window.Tesseract || typeof window.Tesseract.recognize !== 'function')) {
          throw new Error('Client-side OCR requires the Tesseract WASM engine, which is not bundled or loaded in offline mode. Please load Tesseract WASM or provide a pre-recognized text layer.');
        }
        const srcBytes = uploadedFiles[0].bytes.slice();
        const lang = document.getElementById('ocrLangSelect')?.value || 'eng';
        showStatus(`Running client-side OCR recognition (${lang})...`, 'processing');
        const pdfBytes = await executeCoreOp('ocrPDF', [srcBytes, { lang }]);
        downloadFile(pdfBytes, 'searchable_ocr_document.pdf', 'application/pdf');
        showSuccess('Searchable PDF generated with embedded text layer!');
      } else if (currentTool === 'word-to-pdf') {
        if (uploadedFiles.length === 0) throw new Error('Please select a Word document (.docx) to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Converting Word document to PDF...', 'processing');
        const pdfBytes = await executeCoreOp('wordToPDF', [srcBytes]);
        downloadFile(pdfBytes, 'converted_word.pdf', 'application/pdf');
        showSuccess('Word document successfully converted to PDF!');
      } else if (currentTool === 'excel-to-pdf') {
        if (uploadedFiles.length === 0) throw new Error('Please select an Excel workbook (.xlsx) to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Converting spreadsheet to PDF...', 'processing');
        const pdfBytes = await executeCoreOp('excelToPDF', [srcBytes]);
        downloadFile(pdfBytes, 'converted_spreadsheet.pdf', 'application/pdf');
        showSuccess('Excel spreadsheet successfully converted to PDF!');
      } else if (currentTool === 'powerpoint-to-pdf') {
        if (uploadedFiles.length === 0) throw new Error('Please select a PowerPoint presentation (.pptx) to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Converting presentation to PDF...', 'processing');
        const pdfBytes = await executeCoreOp('powerpointToPDF', [srcBytes]);
        downloadFile(pdfBytes, 'converted_presentation.pdf', 'application/pdf');
        showSuccess('PowerPoint presentation successfully converted to PDF!');
      } else if (currentTool === 'html-to-pdf') {
        if (uploadedFiles.length === 0) throw new Error('Please select an HTML file to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Rendering HTML to PDF...', 'processing');
        const pdfBytes = await executeCoreOp('htmlToPDF', [srcBytes]);
        downloadFile(pdfBytes, 'converted_webpage.pdf', 'application/pdf');
        showSuccess('HTML document successfully converted to PDF!');
      } else if (currentTool === 'pdf-to-word') {
        if (uploadedFiles.length === 0) throw new Error('Please select a PDF document to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Extracting content and formatting Word document (.docx)...', 'processing');
        const docxBytes = await executeCoreOp('pdfToWord', [srcBytes]);
        downloadBlob(new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'converted_document.docx');
        showSuccess('PDF successfully converted to editable Word (.docx)!');
      } else if (currentTool === 'pdf-to-excel') {
        if (uploadedFiles.length === 0) throw new Error('Please select a PDF document to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Extracting tabular data and building Excel workbook (.xlsx)...', 'processing');
        const xlsxBytes = await executeCoreOp('pdfToExcel', [srcBytes]);
        downloadBlob(new Blob([xlsxBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'converted_data.xlsx');
        showSuccess('PDF data successfully converted to Excel (.xlsx)!');
      } else if (currentTool === 'pdf-to-powerpoint') {
        if (uploadedFiles.length === 0) throw new Error('Please select a PDF document to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Generating PowerPoint slides (.pptx)...', 'processing');
        const pptxBytes = await executeCoreOp('pdfToPowerPoint', [srcBytes]);
        downloadBlob(new Blob([pptxBytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'converted_presentation.pptx');
        showSuccess('PDF successfully converted to PowerPoint (.pptx)!');
      } else if (currentTool === 'pdf-to-pdfa') {
        if (uploadedFiles.length === 0) throw new Error('Please select a PDF document to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Appending PDF/A metadata packet and color profile intent...', 'processing');
        const pdfaBytes = await executeCoreOp('pdfToPdfA', [srcBytes]);
        downloadFile(pdfaBytes, 'archived_document_pdfa.pdf', 'application/pdf');
        showSuccess('PDF/A metadata appended (not validated, not conformant)!');
      } else if (currentTool === 'ai-summarizer' || currentTool === 'summarizer') {
        if (uploadedFiles.length === 0) throw new Error('Please select a PDF document to summarize.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Analyzing document and generating executive summary...', 'processing');
        const summaryMd = await executeCoreOp('summarizePDF', [srcBytes]);
        downloadBlob(new Blob([summaryMd], { type: 'text/markdown;charset=utf-8' }), 'ai_document_summary.md');
        showSuccess('AI Summary generated successfully!');
      } else if (currentTool === 'translate-pdf' || currentTool === 'translate') {
        if (uploadedFiles.length === 0) throw new Error('Please select a PDF document to translate.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        const targetLang = document.getElementById('translateLangSelect')?.value || 'es';
        showStatus(`Translating document glossary to ${targetLang.toUpperCase()}...`, 'processing');
        const translatedMd = await executeCoreOp('translatePDF', [srcBytes, { targetLang, format: 'markdown' }]);
        downloadBlob(new Blob([translatedMd], { type: 'text/markdown;charset=utf-8' }), `translated_${targetLang}.md`);
        showSuccess('Document translated via local offline glossary with zero network transmission!');
      } else if (currentTool === 'pdf-to-markdown' || currentTool === 'pdf-to-md') {
        if (uploadedFiles.length === 0) throw new Error('Please select a PDF document to convert.');
        const srcBytes = uploadedFiles[0].bytes.slice();
        showStatus('Extracting markdown structure...', 'processing');
        const markdown = await executeCoreOp('pdfToMarkdown', [srcBytes]);
        downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), 'document.md');
        showSuccess('PDF converted to Markdown (.md) successfully!');
      }
    } catch (err) {
      console.error(err);
      showStatus(err.message || 'An error occurred during processing.', 'error');
    } finally {
      isProcessing = false;
      executeBtn.disabled = false;
      if (cancelProcessBtn) cancelProcessBtn.style.display = 'none';
    }
  });

  // --- Helper Functions ---
  function showStatus(message, type) {
    statusBanner.className = `status-banner ${type}`;
    if (type === 'processing') {
      statusBanner.innerHTML = `<div class="spinner"></div><span>${escapeHtml(message)}</span>`;
    } else if (type === 'error') {
      statusBanner.innerHTML = `<strong>Error:</strong> <span>${escapeHtml(message)}</span>`;
    }
    statusBanner.style.display = 'flex';
  }

  function showSuccess(message) {
    statusBanner.className = 'status-banner success';
    statusBanner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem;">
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #10b981; color: #fff; font-size: 0.75rem; font-weight: 800;">✓</span>
        <div>
          <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(message)}</div>
          <div style="font-size: 0.78rem; color: #a7f3d0;">Your download should begin automatically.</div>
        </div>
      </div>
      <span style="background: rgba(255, 255, 255, 0.15); color: #6ee7b7; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 9999px; white-space: nowrap;">0ms Upload</span>
    `;
    statusBanner.style.display = 'flex';
  }

  function hideStatus() {
    statusBanner.style.display = 'none';
    statusBanner.innerHTML = '';
  }

  function downloadFile(uint8Array, filename, mimeType) {
    const blob = new Blob([uint8Array], { type: mimeType });
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // --- Modal Management & Signature Setup ---
  function openModal(modalId) {
    const modalContainer = document.getElementById('modalContainer');
    if (!modalContainer) return;
    modalContainer.style.display = 'flex';
    modalContainer.setAttribute('aria-hidden', 'false');
    const allModals = modalContainer.querySelectorAll('.modal-dialog');
    allModals.forEach((m) => { m.style.display = 'none'; });
    const target = document.getElementById(modalId);
    if (target) target.style.display = 'flex';
  }
  window.openModal = openModal;
  window.downloadFile = downloadFile;

  function closeModal() {
    const modalContainer = document.getElementById('modalContainer');
    if (!modalContainer) return;
    modalContainer.style.display = 'none';
    modalContainer.setAttribute('aria-hidden', 'true');
    const allModals = modalContainer.querySelectorAll('.modal-dialog');
    allModals.forEach((m) => { m.style.display = 'none'; });
  }
  window.closeModal = closeModal;

  function initSignatureModal() {
    const tabDrawBtn = document.getElementById('tabDrawBtn');
    const tabTypeBtn = document.getElementById('tabTypeBtn');
    const tabUploadBtn = document.getElementById('tabUploadBtn');

    const drawTabPanel = document.getElementById('drawTabPanel');
    const typeTabPanel = document.getElementById('typeTabPanel');
    const uploadTabPanel = document.getElementById('uploadTabPanel');

    function switchSignTab(tab) {
      activeSignTab = tab;
      [tabDrawBtn, tabTypeBtn, tabUploadBtn].forEach((b) => b?.classList.remove('active'));
      if (tab === 'draw') {
        tabDrawBtn?.classList.add('active');
        if (drawTabPanel) drawTabPanel.style.display = 'flex';
        if (typeTabPanel) typeTabPanel.style.display = 'none';
        if (uploadTabPanel) uploadTabPanel.style.display = 'none';
      } else if (tab === 'type') {
        tabTypeBtn?.classList.add('active');
        if (drawTabPanel) drawTabPanel.style.display = 'none';
        if (typeTabPanel) typeTabPanel.style.display = 'flex';
        if (uploadTabPanel) uploadTabPanel.style.display = 'none';
        updateTypeSignatureCanvas();
      } else if (tab === 'upload') {
        tabUploadBtn?.classList.add('active');
        if (drawTabPanel) drawTabPanel.style.display = 'none';
        if (typeTabPanel) typeTabPanel.style.display = 'none';
        if (uploadTabPanel) uploadTabPanel.style.display = 'flex';
      }
    }

    tabDrawBtn?.addEventListener('click', () => switchSignTab('draw'));
    tabTypeBtn?.addEventListener('click', () => switchSignTab('type'));
    tabUploadBtn?.addEventListener('click', () => switchSignTab('upload'));

    // Draw Tab Canvas
    const drawCanvas = document.getElementById('sigDrawCanvas');
    if (drawCanvas) {
      const dctx = drawCanvas.getContext('2d');
      dctx.lineCap = 'round';
      dctx.lineJoin = 'round';
      let isDrawing = false;
      let lastX = 0;
      let lastY = 0;

      function getCanvasPos(e) {
        const rect = drawCanvas.getBoundingClientRect();
        const scaleX = drawCanvas.width / rect.width;
        const scaleY = drawCanvas.height / rect.height;
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY,
        };
      }

      drawCanvas.addEventListener('pointerdown', (e) => {
        isDrawing = true;
        const pos = getCanvasPos(e);
        lastX = pos.x;
        lastY = pos.y;
        dctx.beginPath();
        dctx.strokeStyle = sigColor;
        dctx.lineWidth = sigStrokeWidth;
        dctx.moveTo(lastX, lastY);
        drawCanvas.setPointerCapture(e.pointerId);
      });

      drawCanvas.addEventListener('pointermove', (e) => {
        if (!isDrawing) return;
        const pos = getCanvasPos(e);
        dctx.lineTo(pos.x, pos.y);
        dctx.stroke();
        lastX = pos.x;
        lastY = pos.y;
        hasDrawn = true;
      });

      const stopDrawing = (e) => {
        if (isDrawing) {
          isDrawing = false;
          try { drawCanvas.releasePointerCapture(e.pointerId); } catch {}
        }
      };
      drawCanvas.addEventListener('pointerup', stopDrawing);
      drawCanvas.addEventListener('pointerleave', stopDrawing);

      // Color palette for draw tab
      document.querySelectorAll('.color-dot').forEach((dot) => {
        dot.addEventListener('click', () => {
          document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
          dot.classList.add('active');
          sigColor = dot.dataset.color || '#000000';
        });
      });

      // Stroke width
      document.getElementById('sigStrokeWidth')?.addEventListener('input', (e) => {
        sigStrokeWidth = parseInt(e.target.value, 10) || 2;
      });

      // Clear button
      document.getElementById('sigClearCanvasBtn')?.addEventListener('click', () => {
        dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        hasDrawn = false;
      });
    }

    // Type Tab
    const sigTextInput = document.getElementById('sigTextInput');
    const sigFontSelect = document.getElementById('sigFontSelect');
    sigTextInput?.addEventListener('input', updateTypeSignatureCanvas);
    sigFontSelect?.addEventListener('change', (e) => {
      sigFont = e.target.value;
      updateTypeSignatureCanvas();
    });

    document.querySelectorAll('.color-dot-type').forEach((dot) => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot-type').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        sigColor = dot.dataset.color || '#000000';
        updateTypeSignatureCanvas();
      });
    });

    function updateTypeSignatureCanvas() {
      const typeCanvas = document.getElementById('sigTypeCanvas');
      if (!typeCanvas) return;
      const tctx = typeCanvas.getContext('2d');
      tctx.clearRect(0, 0, typeCanvas.width, typeCanvas.height);
      const text = sigTextInput?.value || 'Your Signature';
      tctx.fillStyle = sigColor;
      tctx.font = `italic 54px ${sigFont}`;
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      tctx.fillText(text, typeCanvas.width / 2, typeCanvas.height / 2);
    }

    // Upload Tab
    const uploadInput = document.getElementById('sigUploadFileInput');
    const uploadBrowseBtn = document.getElementById('sigUploadBrowseBtn');
    const uploadImgPreview = document.getElementById('sigUploadedImagePreview');
    const uploadPlaceholder = document.getElementById('sigUploadPlaceholder');

    uploadBrowseBtn?.addEventListener('click', () => uploadInput?.click());
    uploadInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (re) => {
          if (uploadImgPreview) {
            uploadImgPreview.src = re.target.result;
            uploadImgPreview.style.display = 'block';
          }
          if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });

    // Apply Signature Button
    document.getElementById('sigApplySignatureBtn')?.addEventListener('click', () => {
      if (activeSignTab === 'draw') {
        const drawCanvas = document.getElementById('sigDrawCanvas');
        if (!hasDrawn || !drawCanvas) {
          alert('Please draw your signature before applying.');
          return;
        }
        currentSignatureDataUrl = drawCanvas.toDataURL('image/png');
      } else if (activeSignTab === 'type') {
        const typeCanvas = document.getElementById('sigTypeCanvas');
        updateTypeSignatureCanvas();
        currentSignatureDataUrl = typeCanvas.toDataURL('image/png');
      } else if (activeSignTab === 'upload') {
        if (!uploadImgPreview?.src || uploadImgPreview.style.display === 'none') {
          alert('Please select an image file to use as a signature.');
          return;
        }
        currentSignatureDataUrl = uploadImgPreview.src;
      }

      closeModal();
      if (currentTool && currentTool.startsWith('sign')) {
        renderSignPreview();
        renderSettingsPanel();
      }
    });

    // Modal submit handlers for Unlock and Protect modals
    document.getElementById('modalUnlockSubmitBtn')?.addEventListener('click', async () => {
      if (uploadedFiles.length === 0) return;
      closeModal();
      const pass = (document.getElementById('modalUnlockPasswordInput')?.value || '').trim();
      showStatus('Unlocking PDF...', 'processing');
      try {
        const res = await PDFCore.unlockPDF(uploadedFiles[0].bytes.slice(), pass);
        downloadFile(res, 'unlocked.pdf', 'application/pdf');
        showSuccess('PDF unlocked successfully!');
      } catch (err) {
        showStatus(err.message, 'error');
      }
    });

    document.getElementById('modalProtectSubmitBtn')?.addEventListener('click', async () => {
      if (uploadedFiles.length === 0) return;
      const pass = (document.getElementById('modalProtectPasswordInput')?.value || '').trim();
      const confirmPass = (document.getElementById('modalProtectConfirmInput')?.value || '').trim();
      if (!pass) {
        alert('Password cannot be empty.');
        return;
      }
      if (pass !== confirmPass) {
        alert('Passwords do not match.');
        return;
      }
      const permissions = {
        printing: document.getElementById('modalProtectPermPrinting')?.checked ?? true,
        copying: document.getElementById('modalProtectPermCopying')?.checked ?? true,
        modifying: document.getElementById('modalProtectPermModifying')?.checked ?? true,
        annotating: document.getElementById('modalProtectPermAnnotating')?.checked ?? true,
      };
      closeModal();
      showStatus('Protecting PDF...', 'processing');
      try {
        const res = await executeCoreOp('protectPDF', [uploadedFiles[0].bytes.slice(), pass, null, permissions]);
        downloadFile(res, 'protected.pdf', 'application/pdf');
        showSuccess('PDF protected successfully!');
      } catch (err) {
        showStatus(err.message, 'error');
      }
    });

    // Close modals on [data-close-modal] buttons or clicking backdrop
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', closeModal);
    });
    const modalContainer = document.getElementById('modalContainer');
    if (modalContainer) {
      modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) closeModal();
      });
    }
  }

  // Initialize signature modal
  initSignatureModal();

  // ============================================================================
  // Phase 3: Live Camera Scanner Subsystem
  // ============================================================================
  let scanMediaStream = null;
  let scanFacingMode = 'environment';
  const scannedPages = [];

  function openCameraScanner() {
    const modalContainer = document.getElementById('modalContainer');
    const scanModal = document.getElementById('scanModal');
    if (!modalContainer || !scanModal) return;

    modalContainer.style.display = 'flex';
    modalContainer.setAttribute('aria-hidden', 'false');
    scanModal.style.display = 'block';

    startCameraStream();
    setupScanModalButtons();
  }

  async function startCameraStream() {
    const video = document.getElementById('scanVideo');
    if (!video) return;

    if (scanMediaStream) {
      scanMediaStream.getTracks().forEach((t) => t.stop());
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          scanMediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: scanFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
        } catch (constraintErr) {
          scanMediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
        video.srcObject = scanMediaStream;
      } else {
        throw new Error('Camera access not supported on this browser or origin.');
      }
    } catch (err) {
      console.warn('Camera stream error:', err);
      showStatus('Camera access unavailable. Using photo upload fallback.', 'error');
    }
  }

  function setupScanModalButtons() {
    const captureBtn = document.getElementById('scanCaptureBtn');
    const switchBtn = document.getElementById('scanSwitchCameraBtn');
    const finishBtn = document.getElementById('scanFinishBtn');
    const cancelBtn = document.getElementById('scanCancelBtn');
    const video = document.getElementById('scanVideo');
    const canvas = document.getElementById('scanCaptureCanvas');

    if (captureBtn) {
      captureBtn.onclick = () => {
        if (!video || !canvas) return;
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);

        const filterSelect = document.getElementById('scanFilterSelect');
        const filter = filterSelect ? filterSelect.value : 'color';

        if (filter === 'contrast') {
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;
          let minLum = 255;
          let maxLum = 0;
          const len = data.length;
          for (let i = 0; i < len; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (lum < minLum) minLum = lum;
            if (lum > maxLum) maxLum = lum;
          }
          const range = maxLum - minLum;
          if (range > 10) {
            for (let i = 0; i < len; i += 4) {
              data[i] = Math.min(255, Math.max(0, ((data[i] - minLum) / range) * 255));
              data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - minLum) / range) * 255));
              data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - minLum) / range) * 255));
            }
            ctx.putImageData(imgData, 0, 0);
          }
        } else if (filter === 'bw') {
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;
          const len = data.length;
          const totalPixels = len / 4;
          const histogram = new Int32Array(256);
          for (let i = 0; i < len; i += 4) {
            const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[lum]++;
          }
          let sumAll = 0;
          for (let t = 0; t < 256; t++) sumAll += t * histogram[t];
          let sumB = 0;
          let wB = 0;
          let maxVariance = 0;
          let threshold = 128;
          for (let t = 0; t < 256; t++) {
            wB += histogram[t];
            if (wB === 0) continue;
            const wF = totalPixels - wB;
            if (wF === 0) break;
            sumB += t * histogram[t];
            const mB = sumB / wB;
            const mF = (sumAll - sumB) / wF;
            const betweenVariance = wB * wF * (mB - mF) * (mB - mF);
            if (betweenVariance > maxVariance) {
              maxVariance = betweenVariance;
              threshold = t;
            }
          }
          for (let i = 0; i < len; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const val = lum >= threshold ? 255 : 0;
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
          }
          ctx.putImageData(imgData, 0, 0);
        }

        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          blob.arrayBuffer().then((buf) => {
            scannedPages.push({ bytes: new Uint8Array(buf), type: 'jpeg', url });
            renderScannedTray();
          });
        }, 'image/jpeg', 0.9);
      };
    }

    if (switchBtn) {
      switchBtn.onclick = () => {
        scanFacingMode = scanFacingMode === 'environment' ? 'user' : 'environment';
        startCameraStream();
      };
    }

    if (finishBtn) {
      finishBtn.onclick = async () => {
        if (scannedPages.length === 0) return;
        try {
          showStatus('Assembling scanned pages into PDF...', 'processing');
          const pdfBytes = await PDFCore.imagesToPDF(scannedPages, { margin: 20, pageSize: 'a4' });
          downloadFile(pdfBytes, 'scanned_document.pdf', 'application/pdf');
          closeScanModal();
          showSuccess(`Successfully scanned and compiled ${scannedPages.length} page(s) into PDF!`);
        } catch (err) {
          showStatus(err.message, 'error');
        }
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = closeScanModal;
    }
  }

  function renderScannedTray() {
    const tray = document.getElementById('scanPagesTray');
    const finishBtn = document.getElementById('scanFinishBtn');
    if (!tray || !finishBtn) return;

    tray.innerHTML = '';
    if (scannedPages.length === 0) {
      tray.innerHTML = '<p id="scanEmptyTrayNotice" style="margin: auto; color: var(--text-muted); font-size: 0.85rem;">Captured pages will appear here</p>';
      finishBtn.disabled = true;
      finishBtn.textContent = 'Assemble PDF (0 pages)';
      return;
    }

    scannedPages.forEach((p, idx) => {
      const item = document.createElement('div');
      item.style.cssText = 'position: relative; width: 60px; height: 75px; flex-shrink: 0; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; background: #000;';
      item.innerHTML = `
        <img src="${p.url}" style="width: 100%; height: 100%; object-fit: cover;" alt="Scan ${idx + 1}">
        <span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.7); color: #fff; font-size: 9px; padding: 1px 3px; border-radius: 2px;">${idx + 1}</span>
        <button type="button" style="position: absolute; top: 2px; right: 2px; background: red; color: #fff; border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 9px; cursor: pointer;" title="Delete">✕</button>
      `;
      item.querySelector('button').onclick = () => {
        scannedPages.splice(idx, 1);
        renderScannedTray();
      };
      tray.appendChild(item);
    });

    finishBtn.disabled = false;
    finishBtn.textContent = `Assemble PDF (${scannedPages.length} ${scannedPages.length === 1 ? 'page' : 'pages'})`;
  }

  function closeScanModal() {
    if (scanMediaStream) {
      scanMediaStream.getTracks().forEach((t) => t.stop());
      scanMediaStream = null;
    }
    const modalContainer = document.getElementById('modalContainer');
    const scanModal = document.getElementById('scanModal');
    if (modalContainer) modalContainer.style.display = 'none';
    if (scanModal) scanModal.style.display = 'none';
  }

  window.openCameraScanner = openCameraScanner;
});
}
