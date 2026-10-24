/**
 * PDFTool - iLovePDF Clone Application Controller
 * Handles UI interactions, file intake, PDF.js rendering, and PDFCore executions.
 */
document.addEventListener('DOMContentLoaded', () => {
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
  const statusBanner = document.getElementById('statusBanner');

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
      description: 'Sort, delete, and rotate pages visually with an interactive page thumbnail grid.',
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
  };

  // Aliases for hyphenated variants
  TOOLS['sign-pdf'] = TOOLS['sign'];
  TOOLS['unlock-pdf'] = TOOLS['unlock'];
  TOOLS['protect-pdf'] = TOOLS['protect'];
  TOOLS['crop-pdf'] = TOOLS['crop'];
  TOOLS['pdf-forms'] = TOOLS['forms'];

  // Backward compatibility & global access
  const TOOL_METADATA = TOOLS;
  window.TOOLS = TOOLS;
  window.TOOL_METADATA = TOOLS;

  // Category mapping for active indicator
  const CATEGORY_MAP = {
    'organize': ['merge', 'split', 'remove-pages', 'extract-pages', 'organize'],
    'optimize': ['compress'],
    'convert-to': ['pdf-to-img'],
    'convert-from': ['img-to-pdf'],
    'edit': ['rotate', 'page-numbers', 'watermark', 'crop', 'crop-pdf', 'forms', 'pdf-forms'],
    'security': ['unlock', 'unlock-pdf', 'protect', 'protect-pdf', 'sign', 'sign-pdf'],
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
    if (signExisting) signExisting.remove();
    const cropExisting = document.getElementById('cropPreviewContainer');
    if (cropExisting) cropExisting.remove();
  }

  function removeSignPreview() {
    cleanupWorkspaceCustomContainers();
  }

  // --- Navigation & Routing ---
  function showDashboard() {
    currentTool = null;
    uploadedFiles = [];
    activePages = [];
    pdfFileInput.value = '';
    imgFileInput.value = '';
    currentSignatureDataUrl = null;
    signCurrentPageIndex = 0;
    removeSignPreview();
    hideStatus();
    dropdownToggles.forEach(t => t.classList.remove('active'));

    dashboardView.style.display = 'block';
    workspaceView.style.display = 'none';
    workArea.style.display = 'none';
    dropzone.style.display = 'block';
  }

  function openTool(toolKey) {
    if (!TOOLS[toolKey]) {
      console.warn(`Tool "${toolKey}" is not recognized.`);
      return;
    }
    currentTool = toolKey;
    uploadedFiles = [];
    activePages = [];
    pdfFileInput.value = '';
    imgFileInput.value = '';
    currentSignatureDataUrl = null;
    signCurrentPageIndex = 0;
    removeSignPreview();
    hideStatus();

    const meta = TOOLS[toolKey];
    activeToolTitle.textContent = meta.title;
    activeToolIcon.textContent = meta.icon;
    executeBtnText.textContent = meta.actionText;

    if (meta.acceptImages) {
      dropzoneHeading.textContent = 'Select Image files';
      dropzoneSubtitle.textContent = 'or drag and drop JPG, PNG, WebP images here';
    } else {
      dropzoneHeading.textContent = 'Select PDF files';
      dropzoneSubtitle.textContent = 'or drag and drop PDFs here';
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
      if (link.classList.contains('is-disabled') || tool === 'compress') {
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
    if (TOOL_METADATA[currentTool].acceptImages) {
      imgFileInput.click();
    } else {
      pdfFileInput.click();
    }
  });

  dropzone.addEventListener('click', () => {
    if (TOOL_METADATA[currentTool].acceptImages) {
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
      const validFiles = files.filter((f) => {
        if (meta.acceptImages) {
          return f.type.startsWith('image/');
        }
        return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      });

      if (validFiles.length === 0) {
        throw new Error(meta.acceptImages ? 'Please select valid image files (JPG, PNG, WebP).' : 'Please select valid PDF files.');
      }

      // Read file bytes
      const processedItems = [];
      for (const f of validFiles) {
        const buffer = await f.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let pageCount = 1;

        if (!meta.acceptImages) {
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
        uploadedFiles = [processedItems[0]];
      } else {
        uploadedFiles = [...uploadedFiles, ...processedItems];
      }

      // Initialize activePages reliably using pageCount from PDFLib
      if (!meta.acceptImages && uploadedFiles.length > 0) {
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
      renderToolWorkspace();
    } catch (err) {
      console.error(err);
      showStatus(err.message, 'error');
    }
  }

  // --- Dynamic Workspace Rendering ---
  async function renderToolWorkspace() {
    renderSettingsPanel();

    if (currentTool === 'merge' || currentTool === 'img-to-pdf') {
      // Show file list with reorder buttons
      pagesGrid.style.display = 'none';
      filesList.style.display = 'flex';
      removeSignPreview();
      renderFileList();
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
      await renderCropPreview();
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
      try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.protocol.startsWith('http')
            ? 'node_modules/pdfjs-dist/build/pdf.worker.min.js'
            : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const clonedBytes = file.bytes.slice();
        const pdf = await window.pdfjsLib.getDocument({ data: clonedBytes }).promise;
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
      try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.protocol.startsWith('http')
            ? 'node_modules/pdfjs-dist/build/pdf.worker.min.js'
            : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const clonedBytes = file.bytes.slice();
        const pdf = await window.pdfjsLib.getDocument({ data: clonedBytes }).promise;
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

  function renderFileList() {
    filesList.innerHTML = '';
    uploadedFiles.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'file-card-item';
      
      const sizeKb = (item.size / 1024).toFixed(1);
      const ext = item.name.split('.').pop().toUpperCase();
      const pageInfo = item.pageCount ? ` &bull; ${item.pageCount} page${item.pageCount > 1 ? 's' : ''}` : '';

      card.innerHTML = `
        <div class="file-info">
          <span class="file-badge">${ext}</span>
          <div>
            <div class="file-name" title="${item.name}">${item.name}</div>
            <div class="file-size">${sizeKb} KB${pageInfo}</div>
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
    const addMoreRow = document.createElement('div');
    addMoreRow.style.marginTop = '0.5rem';
    addMoreRow.innerHTML = `
      <button type="button" class="secondary-btn" id="addMoreFilesBtn">+ Add More Files</button>
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

  // --- Render Page Thumbnails with PDF.js or Fallback ---
  async function renderPageThumbnails() {
    pagesGrid.innerHTML = '';
    const file = uploadedFiles[0];
    if (!file || !file.bytes) return;

    const total = activePages.length;
    let pdfDoc = null;

    // Try loading PDF with PDF.js
    if (window.pdfjsLib) {
      try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.protocol.startsWith('http')
            ? 'node_modules/pdfjs-dist/build/pdf.worker.min.js'
            : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        // ALWAYS pass a cloned copy to prevent worker from detaching file.bytes
        const clonedBytes = file.bytes.slice();
        pdfDoc = await window.pdfjsLib.getDocument({ data: clonedBytes }).promise;
      } catch (err) {
        console.warn('PDF.js thumbnail engine unavailable, using fallback cards:', err);
        pdfDoc = null;
      }
    }

    for (let i = 0; i < total; i++) {
      const pageData = activePages[i];
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

      card.innerHTML = `
        <div class="page-canvas-wrapper" id="canvasWrapper-${i}">
          <div class="spinner"></div>
        </div>
        <div class="page-meta">
          <span>Page ${pageData.pageNum}</span>
          ${removeBadgeHtml}
          ${extractBadgeHtml}
          <div class="page-card-actions">
            ${isOrganize && i > 0 ? `<button type="button" class="icon-btn" title="Move Left" data-action="move-left" data-index="${i}">←</button>` : ''}
            ${isOrganize && i < total - 1 ? `<button type="button" class="icon-btn" title="Move Right" data-action="move-right" data-index="${i}">→</button>` : ''}
            ${(isOrganize || isRotate) ? `<button type="button" class="icon-btn" title="Rotate 90°" data-action="rotate-page" data-index="${i}">↻</button>` : ''}
            ${isOrganize ? `<button type="button" class="icon-btn delete-btn" title="${pageData.isDeleted ? 'Restore Page' : 'Delete Page'}" data-action="toggle-delete" data-index="${i}">${pageData.isDeleted ? '↺' : '✕'}</button>` : ''}
          </div>
        </div>
      `;

      if (isRemovePages) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          if (e.target.closest('.icon-btn')) return;
          if (selectedRemovePages.has(pageData.pageNum)) {
            selectedRemovePages.delete(pageData.pageNum);
          } else {
            selectedRemovePages.add(pageData.pageNum);
          }
          syncRemovePagesInput();
          renderPageThumbnails();
        });
      } else if (isExtractPages) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          if (e.target.closest('.icon-btn')) return;
          if (selectedExtractPages.has(pageData.pageNum)) {
            selectedExtractPages.delete(pageData.pageNum);
          } else {
            selectedExtractPages.add(pageData.pageNum);
          }
          syncExtractPagesInput();
          renderPageThumbnails();
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
          <p class="setting-hint">Click ✕ to delete/exclude a page. Click ↻ to rotate. Use ← → to reorder pages.</p>
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
      const docAName = uploadedFiles[0] ? uploadedFiles[0].name : 'Document A';
      const docBName = uploadedFiles[1] ? uploadedFiles[1].name : 'Not yet selected (use + Add More Files)';
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
        renderPageThumbnails();
      });

      document.getElementById('rmClearBtn')?.addEventListener('click', () => {
        selectedRemovePages.clear();
        syncRemovePagesInput();
        renderPageThumbnails();
      });

      document.getElementById('rmEvenBtn')?.addEventListener('click', () => {
        selectedRemovePages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p % 2 === 0));
        syncRemovePagesInput();
        renderPageThumbnails();
      });

      document.getElementById('rmOddBtn')?.addEventListener('click', () => {
        selectedRemovePages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p % 2 !== 0));
        syncRemovePagesInput();
        renderPageThumbnails();
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
        renderPageThumbnails();
      });

      document.getElementById('extAllBtn')?.addEventListener('click', () => {
        selectedExtractPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
        syncExtractPagesInput();
        renderPageThumbnails();
      });

      document.getElementById('extClearBtn')?.addEventListener('click', () => {
        selectedExtractPages.clear();
        syncExtractPagesInput();
        renderPageThumbnails();
      });

      document.getElementById('extOddBtn')?.addEventListener('click', () => {
        selectedExtractPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p % 2 !== 0));
        syncExtractPagesInput();
        renderPageThumbnails();
      });

      document.getElementById('extEvenBtn')?.addEventListener('click', () => {
        selectedExtractPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p % 2 === 0));
        syncExtractPagesInput();
        renderPageThumbnails();
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
      function escapeHtml(str) {
        if (typeof str !== 'string') return String(str ?? '');
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

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
            <input type="checkbox" id="protectPermCopying">
            <span>Allow Copying Content & Graphics</span>
          </label>
          <label class="radio-option">
            <input type="checkbox" id="protectPermModifying">
            <span>Allow Modifying Contents</span>
          </label>
          <label class="radio-option">
            <input type="checkbox" id="protectPermAnnotating">
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

      const resultBytes = await PDFCore.fillForm(srcBytes, fieldValues, flatten);
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
    showStatus('Processing your document...', 'processing');

    try {
      if (currentTool === 'merge') {
        if (uploadedFiles.length < 2) {
          throw new Error('Please add at least 2 PDF files to merge.');
        }
        const bytesList = uploadedFiles.map((f) => f.bytes.slice());
        const mergedBytes = await PDFCore.mergePDFs(bytesList);
        downloadFile(mergedBytes, 'merged.pdf', 'application/pdf');
        showSuccess('Your PDFs have been successfully merged!');
      } else if (currentTool === 'split') {
        const mode = document.querySelector('input[name="splitMode"]:checked').value;
        const srcBytes = uploadedFiles[0].bytes.slice();

        if (mode === 'all') {
          const splitResults = await PDFCore.splitPDF(srcBytes);
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
          
          const extractedBytes = await PDFCore.extractPages(srcBytes, indices);
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

        const organizedBytes = await PDFCore.organizePDF(srcBytes, validPages);
        downloadFile(organizedBytes, 'organized.pdf', 'application/pdf');
        showSuccess(`Saved organized PDF with ${validPages.length} page(s)!`);
      } else if (currentTool === 'rotate') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const firstRot = activePages.length > 0 ? activePages[0].rotation : 0;
        const isUniform = activePages.every((p) => p.rotation === firstRot);
        let rotatedBytes;

        if (isUniform && firstRot !== 0) {
          // In-place rotation preserves document bookmarks, outlines, and form fields
          rotatedBytes = await PDFCore.rotatePDF(srcBytes, firstRot);
        } else {
          const pagesConfig = activePages.map((p) => ({
            sourceIndex: p.pageNum - 1,
            rotation: p.rotation,
          }));
          rotatedBytes = await PDFCore.organizePDF(srcBytes, pagesConfig);
        }
        downloadFile(rotatedBytes, 'rotated.pdf', 'application/pdf');
        showSuccess('Your PDF pages have been rotated!');
      } else if (currentTool === 'pdf-to-img') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const format = document.getElementById('imgFormatSelect').value;
        const scale = parseFloat(document.getElementById('imgScaleSelect').value) || 2.0;

        if (!window.pdfjsLib) throw new Error('PDF.js rendering engine is not loaded.');
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.protocol.startsWith('http')
            ? 'node_modules/pdfjs-dist/build/pdf.worker.min.js'
            : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(srcBytes) }).promise;
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

        const pdfBytes = await PDFCore.imagesToPDF(imageItems, { margin, pageSize });
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

        const watermarkedBytes = await PDFCore.watermarkPDF(srcBytes, {
          text,
          opacity,
          fontSize,
          angle,
          r, g, b,
        });
        downloadFile(watermarkedBytes, 'watermarked.pdf', 'application/pdf');
        showSuccess('Watermark applied successfully!');
      } else if (currentTool === 'page-numbers') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const position = document.getElementById('pnPosSelect').value;
        const format = document.getElementById('pnFormatInput').value || 'Page {n} of {total}';
        const startNumber = parseInt(document.getElementById('pnStartNumberInput').value, 10) || 1;
        const skipCount = document.getElementById('pnSkipCoverInput').checked ? 1 : 0;

        const numberedBytes = await PDFCore.addPageNumbers(srcBytes, {
          position,
          format,
          startNumber,
          skipCount,
        });
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
        const extractedBytes = await PDFCore.extractPages(srcBytes, indices);
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
        const resultBytes = await PDFCore.removePages(srcBytes, indicesToRemove);
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
          copying: document.getElementById('protectPermCopying')?.checked ?? false,
          modifying: document.getElementById('protectPermModifying')?.checked ?? false,
          annotating: document.getElementById('protectPermAnnotating')?.checked ?? false,
        };
        const protectedBytes = await PDFCore.protectPDF(srcBytes, pass, null, permissions);
        downloadFile(protectedBytes, 'protected.pdf', 'application/pdf');
        showSuccess('Your PDF has been encrypted with password protection!');
      } else if (currentTool === 'unlock' || currentTool === 'unlock-pdf') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const pass = (document.getElementById('unlockPasswordInput')?.value || '').trim();
        const unlockedBytes = await PDFCore.unlockPDF(srcBytes, pass);
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

        const signedBytes = await PDFCore.signPDF(srcBytes, currentSignatureDataUrl, signCurrentPageIndex, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });
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

        const croppedBytes = await PDFCore.cropPDF(srcBytes, cropBoxes);
        downloadFile(croppedBytes, 'cropped.pdf', 'application/pdf');
        showSuccess('Your PDF has been successfully cropped!');
      } else if (currentTool === 'forms' || currentTool === 'pdf-forms') {
        await executeFormAction(false);
      }
    } catch (err) {
      console.error(err);
      showStatus(err.message || 'An error occurred during processing.', 'error');
    } finally {
      isProcessing = false;
      executeBtn.disabled = false;
    }
  });

  // --- Helper Functions ---
  function showStatus(message, type) {
    statusBanner.className = `status-banner ${type}`;
    if (type === 'processing') {
      statusBanner.innerHTML = `<div class="spinner"></div><span>${message}</span>`;
    } else if (type === 'error') {
      statusBanner.innerHTML = `<strong>Error:</strong> <span>${message}</span>`;
    }
    statusBanner.style.display = 'flex';
  }

  function showSuccess(message) {
    statusBanner.className = 'status-banner success';
    statusBanner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem;">
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #10b981; color: #fff; font-size: 0.75rem; font-weight: 800;">✓</span>
        <div>
          <div style="font-weight: 700; font-size: 0.95rem;">${message}</div>
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
      closeModal();
      showStatus('Protecting PDF...', 'processing');
      try {
        const res = await PDFCore.protectPDF(uploadedFiles[0].bytes.slice(), pass);
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
});
