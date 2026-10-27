/**
 * job_runner.js
 * Clean client library exposing a single job interface:
 *   - start(job)
 *   - onProgress(percent, stage)
 *   - cancel()
 *   - onResult(bytes)
 *   - onError({code, userMessage, detail})
 *
 * Supports Web Workers in browsers and worker_threads in Node.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const exports = factory();
    module.exports = exports.JobRunner;
    module.exports.JobRunner = exports.JobRunner;
    module.exports.createJobRunner = exports.createJobRunner;
    module.exports.VALID_STAGES = exports.VALID_STAGES;
    module.exports.formatError = exports.formatError;
  } else {
    const exports = factory();
    if (typeof root !== 'undefined' && root) {
      root.JobRunner = exports.JobRunner;
      root.createJobRunner = exports.createJobRunner;
    }
    if (typeof window !== 'undefined' && window) {
      window.JobRunner = exports.JobRunner;
      window.createJobRunner = exports.createJobRunner;
    }
    if (typeof globalThis !== 'undefined' && globalThis) {
      globalThis.JobRunner = exports.JobRunner;
      globalThis.createJobRunner = exports.createJobRunner;
    }
    if (typeof self !== 'undefined' && self) {
      self.JobRunner = exports.JobRunner;
      self.createJobRunner = exports.createJobRunner;
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';

  const VALID_STAGES = new Set(['init', 'loading', 'processing', 'rendering', 'saving', 'completed']);

  function formatError(err) {
    if (err && typeof err === 'object' && err.code && err.userMessage && err.detail !== undefined) {
      return {
        code: String(err.code),
        userMessage: String(err.userMessage),
        detail: String(err.detail)
      };
    }

    const message = (err && err.message) || String(err || 'Unknown error');
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
    } else if (lower.includes('corrupt') || lower.includes('invalid') || lower.includes('parse') || lower.includes('header')) {
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

  class JobRunner {
    constructor(options = {}) {
      this.workerPath = options.workerPath || null;
      this._onProgress = options.onProgress || null;
      this._onResult = options.onResult || null;
      this._onError = options.onError || null;

      this.worker = null;
      this.currentWorker = null;
      this.currentJob = null;
      this.isRunning = false;
      this.nextJobId = 0;
      this._resolve = null;
      this._reject = null;
    }

    onProgress(fn) {
      if (typeof fn === 'function') {
        this._onProgress = fn;
        return this;
      }
    }

    onResult(fn) {
      if (typeof fn === 'function') {
        this._onResult = fn;
        return this;
      }
    }

    onError(fn) {
      if (typeof fn === 'function') {
        this._onError = fn;
        return this;
      }
    }

    _ensureWorker() {
      if (this.worker) return this.worker;

      if (isNode) {
        const { Worker } = require('worker_threads');
        const path = require('path');
        const targetPath = this.workerPath || path.resolve(__dirname, 'pdf_worker.js');
        const w = new Worker(targetPath);
        this.worker = w;
        w.on('message', (msg) => this._onMessage(w, msg));
        w.on('error', (err) => this._onWorkerError(w, err));
        w.on('exit', (code) => this._onWorkerExit(w, code));
      } else {
        const targetPath = this.workerPath || 'pdf_worker.js';
        const w = new Worker(targetPath);
        this.worker = w;
        w.onmessage = (e) => this._onMessage(w, e.data);
        w.onerror = (e) => this._onWorkerError(w, e);
      }
      return this.worker;
    }

    start(job) {
      if (!job || typeof job !== 'object') {
        const err = {
          code: 'INVALID_JOB',
          userMessage: 'Invalid job definition provided.',
          detail: 'Job must be an object with operation and args.'
        };
        this._triggerError(err);
        const p = Promise.reject(err);
        p.catch(() => {});
        return p;
      }

      // If a job is already in progress, cancel it cleanly first
      if (this.isRunning) {
        this.cancel();
      }

      const jobId = ++this.nextJobId;
      const normalizedJob = {
        id: jobId,
        operation: job.operation || job.type || job.tool || job.name,
        args: job.args !== undefined ? job.args : (job.params ? [job.params] : (job.data !== undefined ? [job.data] : [])),
        options: job.options || {},
        onProgress: job.onProgress,
        onResult: job.onResult,
        onError: job.onError
      };

      if (!Array.isArray(normalizedJob.args)) {
        normalizedJob.args = [normalizedJob.args];
      }

      this.currentJob = normalizedJob;
      this.isRunning = true;

      const promise = new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
      });
      // Prevent unhandled promise rejection warnings in environments relying solely on onError callback
      promise.catch(() => {});

      try {
        const worker = this._ensureWorker();
        this.currentWorker = worker;
        const payload = {
          type: 'START',
          jobId,
          operation: normalizedJob.operation,
          args: normalizedJob.args,
          options: normalizedJob.options
        };
        worker.postMessage(payload);
      } catch (err) {
        this.isRunning = false;
        const formatted = formatError(err);
        this._triggerError(formatted);
        if (this._reject) {
          const rej = this._reject;
          this._reject = null;
          this._resolve = null;
          rej(formatted);
        }
      }

      return promise;
    }

    cancel() {
      if (!this.isRunning && !this.currentJob && !this.worker) {
        return;
      }
      this.isRunning = false;

      // 1. Terminate worker immediately to stop CPU execution
      if (this.worker) {
        const w = this.worker;
        this.worker = null;
        this.currentWorker = null;
        try {
          w.terminate();
        } catch (e) {}
      }

      // 2. Null buffers and references to release memory
      if (this.currentJob) {
        if (this.currentJob.args && Array.isArray(this.currentJob.args)) {
          for (let i = 0; i < this.currentJob.args.length; i++) {
            this.currentJob.args[i] = null;
          }
        }
        this.currentJob.args = null;
        this.currentJob.options = null;
        this.currentJob = null;
      }

      // 3. Format error and trigger callbacks / rejection
      const cancelError = {
        code: 'CANCELLED',
        userMessage: 'The operation was cancelled.',
        detail: 'Operation was cancelled via JobRunner.cancel().'
      };

      this._triggerError(cancelError);

      if (this._reject) {
        const rej = this._reject;
        this._reject = null;
        this._resolve = null;
        rej(cancelError);
      }
    }

    terminate() {
      this.cancel();
      if (this.worker) {
        try { this.worker.terminate(); } catch (e) {}
        this.worker = null;
        this.currentWorker = null;
      }
    }

    _onMessage(worker, message) {
      if (!message || typeof message !== 'object') return;
      if (!this.currentJob || message.jobId !== this.currentJob.id) return;
      if (this.currentWorker && this.currentWorker !== worker) return;

      if (message.type === 'PROGRESS') {
        const percent = typeof message.percent === 'number' ? message.percent : 0;
        const stage = message.stage || 'processing';
        this._triggerProgress(percent, stage);
      } else if (message.type === 'RESULT') {
        this.isRunning = false;
        const result = message.result;
        // Release job arguments from runner memory
        if (this.currentJob && this.currentJob.args) {
          this.currentJob.args = null;
        }
        this._triggerResult(result);
        if (this._resolve) {
          const res = this._resolve;
          this._resolve = null;
          this._reject = null;
          res(result);
        }
      } else if (message.type === 'ERROR') {
        this.isRunning = false;
        const error = formatError(message.error);
        if (this.currentJob && this.currentJob.args) {
          this.currentJob.args = null;
        }
        this._triggerError(error);
        if (this._reject) {
          const rej = this._reject;
          this._reject = null;
          this._resolve = null;
          rej(error);
        }
      }
    }

    _onWorkerError(worker, err) {
      if (this.worker === worker) {
        this.worker = null;
      }
      if (!this.isRunning || (this.currentWorker && this.currentWorker !== worker)) return;
      this.isRunning = false;
      const formatted = {
        code: 'WORKER_ERROR',
        userMessage: 'A worker thread error occurred.',
        detail: (err && (err.stack || err.message)) || String(err)
      };
      try { worker.terminate(); } catch (e) {}
      this._triggerError(formatted);
      if (this._reject) {
        const rej = this._reject;
        this._reject = null;
        this._resolve = null;
        rej(formatted);
      }
    }

    _onWorkerExit(worker, code) {
      if (this.worker === worker) {
        this.worker = null;
      }
      if (this.currentJob && this.isRunning && this.currentWorker === worker && code !== 0) {
        this.isRunning = false;
        const formatted = {
          code: 'WORKER_EXIT',
          userMessage: 'Worker thread terminated unexpectedly.',
          detail: `Worker exited with non-zero code ${code}.`
        };
        this._triggerError(formatted);
        if (this._reject) {
          const rej = this._reject;
          this._reject = null;
          this._resolve = null;
          rej(formatted);
        }
      }
    }

    _triggerProgress(percent, stage) {
      if (this.currentJob && typeof this.currentJob.onProgress === 'function') {
        this.currentJob.onProgress(percent, stage);
      }
      if (typeof this._onProgress === 'function') {
        this._onProgress(percent, stage);
      }
      if (typeof this.onProgress === 'function' && this.onProgress !== JobRunner.prototype.onProgress) {
        this.onProgress(percent, stage);
      }
    }

    _triggerResult(bytes) {
      if (this.currentJob && typeof this.currentJob.onResult === 'function') {
        this.currentJob.onResult(bytes);
      }
      if (typeof this._onResult === 'function') {
        this._onResult(bytes);
      }
      if (typeof this.onResult === 'function' && this.onResult !== JobRunner.prototype.onResult) {
        this.onResult(bytes);
      }
    }

    _triggerError(err) {
      if (this.currentJob && typeof this.currentJob.onError === 'function') {
        this.currentJob.onError(err);
      }
      if (typeof this._onError === 'function') {
        this._onError(err);
      }
      if (typeof this.onError === 'function' && this.onError !== JobRunner.prototype.onError) {
        this.onError(err);
      }
    }
  }

  function createJobRunner(options) {
    return new JobRunner(options);
  }

  return {
    JobRunner,
    createJobRunner,
    VALID_STAGES,
    formatError
  };
});
