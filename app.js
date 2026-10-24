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

  // --- Navigation & Routing ---
  function showDashboard() {
    currentTool = null;
    uploadedFiles = [];
    activePages = [];
    pdfFileInput.value = '';
    imgFileInput.value = '';
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
      renderFileList();
    } else {
      // Single PDF visual pages grid
      filesList.style.display = 'none';
      pagesGrid.style.display = 'grid';
      await renderPageThumbnails();
    }
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
      const card = document.createElement('div');
      card.className = `page-thumb-card ${pageData.isDeleted ? 'deleted' : ''}`;
      card.id = `pageCard-${i}`;

      const isOrganize = currentTool === 'organize';
      const isRotate = currentTool === 'rotate';

      card.innerHTML = `
        <div class="page-canvas-wrapper" id="canvasWrapper-${i}">
          <div class="spinner"></div>
        </div>
        <div class="page-meta">
          <span>Page ${pageData.pageNum}</span>
          <div class="page-card-actions">
            ${isOrganize && i > 0 ? `<button type="button" class="icon-btn" title="Move Left" data-action="move-left" data-index="${i}">←</button>` : ''}
            ${isOrganize && i < total - 1 ? `<button type="button" class="icon-btn" title="Move Right" data-action="move-right" data-index="${i}">→</button>` : ''}
            ${(isOrganize || isRotate) ? `<button type="button" class="icon-btn" title="Rotate 90°" data-action="rotate-page" data-index="${i}">↻</button>` : ''}
            ${isOrganize ? `<button type="button" class="icon-btn delete-btn" title="${pageData.isDeleted ? 'Restore Page' : 'Delete Page'}" data-action="toggle-delete" data-index="${i}">${pageData.isDeleted ? '↺' : '✕'}</button>` : ''}
          </div>
        </div>
      `;

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
    } else if (currentTool === 'remove-pages') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="removePagesInput">Pages to Remove</label>
          <input type="text" id="removePagesInput" placeholder="e.g. 1, 3-5">
          <p class="setting-hint">Enter comma-separated page numbers or ranges to remove.</p>
        </div>
      `;
    } else if (currentTool === 'extract-pages') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="extractPagesInput">Pages to Extract</label>
          <input type="text" id="extractPagesInput" placeholder="e.g. 1, 3-5">
          <p class="setting-hint">Enter page ranges to extract into a new standalone PDF.</p>
        </div>
      `;
    } else if (currentTool === 'crop' || currentTool === 'crop-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Crop Scope</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="cropScope" value="all" checked>
              <span>Apply to all pages</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="cropScope" value="current">
              <span>Apply to current page only</span>
            </label>
          </div>
        </div>
      `;
    } else if (currentTool === 'forms' || currentTool === 'pdf-forms') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Form Fields</label>
          <div id="formFieldsContainer">
            <p class="setting-hint">Interactive form controls will appear here.</p>
          </div>
        </div>
      `;
    } else if (currentTool === 'unlock' || currentTool === 'unlock-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="unlockPasswordInput">Document Password</label>
          <input type="password" id="unlockPasswordInput" placeholder="Optional for restricted permissions">
          <p class="setting-hint">Leave blank if the document only has permission locks.</p>
        </div>
      `;
    } else if (currentTool === 'protect' || currentTool === 'protect-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label for="protectPasswordInput">Set Password</label>
          <input type="password" id="protectPasswordInput" placeholder="Enter password to protect PDF">
          <p class="setting-hint">This password will be required to open the document.</p>
        </div>
      `;
    } else if (currentTool === 'sign' || currentTool === 'sign-pdf') {
      toolSettings.innerHTML = `
        <div class="setting-group">
          <label>Signature Options</label>
          <p class="setting-hint">Create, type, or upload your signature to place on pages.</p>
        </div>
      `;
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
        let indices = inputVal ? PDFCore.parsePageRanges(inputVal, total) : Array.from({ length: total }, (_, i) => i);
        const extractedBytes = await PDFCore.extractPages(srcBytes, indices);
        downloadFile(extractedBytes, 'extracted.pdf', 'application/pdf');
        showSuccess('Pages extracted successfully!');
      } else if (currentTool === 'remove-pages') {
        const srcBytes = uploadedFiles[0].bytes.slice();
        const total = uploadedFiles[0].pageCount || 1;
        const inputVal = (document.getElementById('removePagesInput')?.value || '').trim();
        let indicesToRemove = inputVal ? PDFCore.parsePageRanges(inputVal, total) : [];
        if (PDFCore.removePages) {
          const resultBytes = await PDFCore.removePages(srcBytes, indicesToRemove);
          downloadFile(resultBytes, 'removed_pages.pdf', 'application/pdf');
          showSuccess('Pages removed successfully!');
        } else {
          const toKeep = Array.from({ length: total }, (_, i) => i).filter((i) => !indicesToRemove.includes(i));
          const resultBytes = await PDFCore.extractPages(srcBytes, toKeep);
          downloadFile(resultBytes, 'removed_pages.pdf', 'application/pdf');
          showSuccess('Pages removed successfully!');
        }
      } else if (['sign', 'sign-pdf', 'unlock', 'unlock-pdf', 'protect', 'protect-pdf', 'crop', 'crop-pdf', 'forms', 'pdf-forms'].includes(currentTool)) {
        const srcBytes = uploadedFiles[0].bytes.slice();
        if (currentTool.startsWith('unlock') && PDFCore.unlockPDF) {
          const pass = document.getElementById('unlockPasswordInput')?.value || '';
          const res = await PDFCore.unlockPDF(srcBytes, pass);
          downloadFile(res, 'unlocked.pdf', 'application/pdf');
          showSuccess('PDF unlocked successfully!');
        } else if (currentTool.startsWith('protect') && PDFCore.protectPDF) {
          const pass = document.getElementById('protectPasswordInput')?.value || '';
          const res = await PDFCore.protectPDF(srcBytes, { userPassword: pass });
          downloadFile(res, 'protected.pdf', 'application/pdf');
          showSuccess('PDF protected successfully!');
        } else {
          showStatus(`Processing ready for ${TOOLS[currentTool].title}.`, 'processing');
        }
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
      <div><strong>✓ Success!</strong> ${message}</div>
      <div style="font-size: 0.85rem;">Your download should begin automatically.</div>
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
});
