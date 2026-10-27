/**
 * pdf_worker.js
 * Universal Web Worker and Node.js worker_threads entry point for PDF operations.
 * Executes PDFCore operations in the background, emitting progress, result
 * (with transferable buffers), and formatted errors.
 */
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';

let parentPort = null;
let PDFCore = null;

const VALID_STAGES = new Set(['init', 'loading', 'processing', 'rendering', 'saving', 'completed']);

const OP_ALIASES = {
  merge: 'mergePDFs',
  mergePDFs: 'mergePDFs',
  split: 'splitPDF',
  splitPDF: 'splitPDF',
  extract: 'extractPages',
  extractPages: 'extractPages',
  rotate: 'rotatePDF',
  rotatePDF: 'rotatePDF',
  organize: 'organizePDF',
  organizePDF: 'organizePDF',
  imagesToPDF: 'imagesToPDF',
  'img-to-pdf': 'imagesToPDF',
  watermark: 'watermarkPDF',
  watermarkPDF: 'watermarkPDF',
  pageNumbers: 'addPageNumbers',
  addPageNumbers: 'addPageNumbers',
  removePages: 'removePages',
  protect: 'protectPDF',
  protectPDF: 'protectPDF',
  unlock: 'unlockPDF',
  unlockPDF: 'unlockPDF',
  sign: 'signPDF',
  signPDF: 'signPDF',
  crop: 'cropPDF',
  cropPDF: 'cropPDF',
  compress: 'compressPDF',
  compressPDF: 'compressPDF',
  repair: 'repairPDF',
  repairPDF: 'repairPDF',
  redact: 'redactPDF',
  redactPDF: 'redactPDF',
  fillForm: 'fillForm',
  inspectForm: 'inspectForm',
  compare: 'comparePDF',
  comparePDF: 'comparePDF',
  textToPDF: 'textToPDF',
  pdfToText: 'pdfToText',
  edit: 'editPDF',
  editPDF: 'editPDF',
  ocr: 'ocrPDF',
  ocrPDF: 'ocrPDF',
  wordToPDF: 'wordToPDF',
  excelToPDF: 'excelToPDF',
  powerpointToPDF: 'powerpointToPDF',
  htmlToPDF: 'htmlToPDF',
  pdfToWord: 'pdfToWord',
  pdfToExcel: 'pdfToExcel',
  pdfToPowerPoint: 'pdfToPowerPoint',
  pdfToPdfA: 'pdfToPdfA',
  summarizePDF: 'summarizePDF',
  translatePDF: 'translatePDF',
  pdfToMarkdown: 'pdfToMarkdown',
};

function formatError(err) {
  if (err && typeof err === 'object' && err.code && err.userMessage && err.detail !== undefined) {
    return {
      code: String(err.code),
      userMessage: String(err.userMessage),
      detail: String(err.detail)
    };
  }

  const message = (err && err.message) || String(err || 'Unknown worker error');
  const stack = (err && err.stack) || '';
  let code = (err && err.code) || 'OPERATION_FAILED';
  let userMessage = message;

  const lower = message.toLowerCase();
  if (lower.includes('cancel')) {
    code = 'CANCELLED';
    userMessage = 'The operation was cancelled.';
  } else if (lower.includes('password') || lower.includes('encrypt') || lower.includes('cipher') || lower.includes('decrypt')) {
    code = 'ENCRYPTION_ERROR';
    userMessage = message;
  } else if (lower.includes('corrupt') || lower.includes('invalid') || lower.includes('parse') || lower.includes('header') || lower.includes('failed to parse')) {
    code = 'INVALID_PDF';
    userMessage = message.includes('PDF') ? message : 'The file provided is not a valid PDF.';
  } else if (lower.includes('out of bounds') || lower.includes('range') || lower.includes('page index')) {
    code = 'INVALID_RANGE';
    userMessage = message;
  } else if (lower.includes('not loaded') || lower.includes('not available')) {
    code = 'ENGINE_UNAVAILABLE';
    userMessage = message;
  }

  return {
    code,
    userMessage,
    detail: stack || message
  };
}

function getTransferables(value) {
  const transferables = [];
  if (!value) return transferables;

  if (value instanceof ArrayBuffer) {
    if (value.byteLength > 0) transferables.push(value);
  } else if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
    if (value.buffer.byteLength > 0 && !transferables.includes(value.buffer)) {
      transferables.push(value.buffer);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (item && item.bytes) {
        if (item.bytes instanceof ArrayBuffer && item.bytes.byteLength > 0) {
          if (!transferables.includes(item.bytes)) transferables.push(item.bytes);
        } else if (ArrayBuffer.isView(item.bytes) && item.bytes.buffer instanceof ArrayBuffer && item.bytes.buffer.byteLength > 0) {
          if (!transferables.includes(item.bytes.buffer)) transferables.push(item.bytes.buffer);
        }
      }
    }
  }
  return transferables;
}

function postResponse(msg, transferables = []) {
  if (isNode && parentPort) {
    parentPort.postMessage(msg, transferables);
  } else if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.postMessage(msg, transferables);
  }
}

let currentLastPercent = 0;

function emitProgress(jobId, percent, stage = 'processing') {
  const validStage = VALID_STAGES.has(stage) ? stage : 'processing';
  const clamped = Math.max(currentLastPercent, Math.min(100, Math.round(percent)));
  currentLastPercent = clamped;
  postResponse({
    type: 'PROGRESS',
    jobId,
    percent: clamped,
    stage: validStage
  });
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'START') {
    const jobId = message.jobId || (message.job && message.job.id) || 1;
    currentLastPercent = 0;

    try {
      let operation = message.operation || message.op || (message.job && (message.job.operation || message.job.type || message.job.tool || message.job.name)) || message.name;
      if (!operation && message.type !== 'START') {
        operation = message.type;
      }

      if (!operation) {
        throw {
          code: 'MISSING_OPERATION',
          userMessage: 'No operation specified for worker task.',
          detail: 'Expected operation name in job description.'
        };
      }

      const opName = OP_ALIASES[operation] || operation;
      if (!PDFCore || typeof PDFCore[opName] !== 'function') {
        throw {
          code: 'UNKNOWN_OPERATION',
          userMessage: `Operation "${operation}" is not supported.`,
          detail: `PDFCore does not implement method "${opName || operation}".`
        };
      }

      let args = message.args !== undefined ? message.args : (message.job && message.job.args !== undefined ? message.job.args : (message.params ? [message.params] : (message.data !== undefined ? [message.data] : [])));
      if (!Array.isArray(args)) {
        args = [args];
      }

      // 1. Progress: init/loading stage
      emitProgress(jobId, 0, 'loading');

      // 2. Progress: processing stage
      emitProgress(jobId, 25, 'processing');

      // Hook progress for operations supporting onProgress in options
      const lastArg = args[args.length - 1];
      if (lastArg && typeof lastArg === 'object' && !ArrayBuffer.isView(lastArg) && !(lastArg instanceof ArrayBuffer)) {
        if (!lastArg.onProgress) {
          lastArg.onProgress = (p, stage = 'processing') => {
            const scaled = Math.min(85, Math.max(25, Math.round(p)));
            emitProgress(jobId, scaled, stage);
          };
        }
      }

      const result = await PDFCore[opName](...args);

      // 3. Progress: saving stage
      emitProgress(jobId, 90, 'saving');

      // 4. Progress: completed stage
      emitProgress(jobId, 100, 'completed');

      const transferables = getTransferables(result);
      postResponse({
        type: 'RESULT',
        jobId,
        result
      }, transferables);

    } catch (err) {
      postResponse({
        type: 'ERROR',
        jobId,
        error: formatError(err)
      });
    }
  }
}

// Initialization
if (isNode) {
  const wt = require('worker_threads');
  parentPort = wt.parentPort;
  PDFCore = require('./pdf_core.js');
  if (parentPort) {
    parentPort.on('message', handleMessage);
  }
} else {
  // Browser Web Worker
  if (typeof self !== 'undefined') {
    if (!self.PDFCore && typeof importScripts === 'function') {
      try { importScripts('vendor/pdf-lib.min.js'); } catch (e) {}
      try { importScripts('vendor/jszip.min.js'); } catch (e) {}
      try { importScripts('vendor/pdf-lib-encrypt.js'); } catch (e) {}
      try { importScripts('pdf_core.js'); } catch (e) {}
    }
    PDFCore = self.PDFCore || (typeof window !== 'undefined' ? window.PDFCore : null);
    self.onmessage = (e) => handleMessage(e.data);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleMessage,
    formatError,
    VALID_STAGES,
    OP_ALIASES
  };
}
