/**
 * test_worker_architecture.js
 * Comprehensive tests for Worker Architecture (Phase 0 Task 0.2):
 *   1. Job interface: start(job), onProgress(percent, stage), cancel(), onResult(bytes), onError({code, userMessage, detail})
 *   2. Cancellation stops work and releases memory (worker.terminate() and nulling buffers)
 *   3. Progress ordering (non-decreasing, 0-100, valid stages)
 *   4. Error propagation ({code, userMessage, detail})
 *   5. Verifying pdf_core operations produce identical valid output through worker
 *   6. Transferable buffers handling
 */

const assert = require('assert');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const PDFCore = require('../pdf_core');
const JobRunner = require('../job_runner');
const { VALID_STAGES } = require('../job_runner');

let passedCount = 0;
let assertionCount = 0;

function trackAssert(condition, message) {
  assertionCount++;
  assert(condition, message);
}

function trackStrictEqual(actual, expected, message) {
  assertionCount++;
  assert.strictEqual(actual, expected, message);
}

function trackDeepStrictEqual(actual, expected, message) {
  assertionCount++;
  assert.deepStrictEqual(actual, expected, message);
}

function trackOk(condition, message) {
  assertionCount++;
  assert.ok(condition, message);
}

async function createSamplePDF(pageCount, text = 'Page') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([300, 300]);
    page.drawText(`${text} ${i + 1}`, { x: 30, y: 250, size: 18 });
  }
  return await doc.save();
}

async function runWorkerArchitectureTests() {
  console.log('========================================================================');
  console.log('PDF Studio: Worker Architecture Test Suite');
  console.log('========================================================================\n');

  // --- Suite 1: Interface Conformance ---
  console.log('Suite 1: Single Job Interface Conformance');
  {
    const runner = new JobRunner();
    trackStrictEqual(typeof runner.start, 'function', 'JobRunner must implement start(job)');
    trackStrictEqual(typeof runner.cancel, 'function', 'JobRunner must implement cancel()');
    trackStrictEqual(typeof runner.onProgress, 'function', 'JobRunner must implement onProgress()');
    trackStrictEqual(typeof runner.onResult, 'function', 'JobRunner must implement onResult()');
    trackStrictEqual(typeof runner.onError, 'function', 'JobRunner must implement onError()');

    // Method chaining / registration
    const fn1 = () => {};
    const fn2 = () => {};
    const fn3 = () => {};
    runner.onProgress(fn1);
    runner.onResult(fn2);
    runner.onError(fn3);
    trackStrictEqual(runner._onProgress, fn1, 'onProgress(fn) registers progress handler');
    trackStrictEqual(runner._onResult, fn2, 'onResult(fn) registers result handler');
    trackStrictEqual(runner._onError, fn3, 'onError(fn) registers error handler');

    // Property assignment
    const fn4 = () => {};
    const fn5 = () => {};
    const fn6 = () => {};
    runner.onProgress = fn4;
    runner.onResult = fn5;
    runner.onError = fn6;
    trackStrictEqual(runner.onProgress, fn4, 'runner.onProgress = fn assignment works');
    trackStrictEqual(runner.onResult, fn5, 'runner.onResult = fn assignment works');
    trackStrictEqual(runner.onError, fn6, 'runner.onError = fn assignment works');

    // Invalid job invocation returns rejection and triggers onError
    let errorCalled = null;
    runner.onError = (err) => { errorCalled = err; };
    try {
      await runner.start(null);
      trackOk(false, 'start(null) should have thrown or rejected');
    } catch (err) {
      trackStrictEqual(err.code, 'INVALID_JOB', 'start(null) rejects with INVALID_JOB');
      trackOk(typeof err.userMessage === 'string' && err.userMessage.length > 0, 'INVALID_JOB has userMessage');
      trackOk(err.detail !== undefined, 'INVALID_JOB has detail');
    }
    trackStrictEqual(errorCalled && errorCalled.code, 'INVALID_JOB', 'onError callback received INVALID_JOB');

    passedCount++;
    console.log('  ✓ Job interface conformance verified');
  }

  // --- Suite 2: Identical Valid Output (Direct vs Worker) ---
  console.log('\nSuite 2: PDFCore Operations Produce Identical Valid Output Through Worker');
  {
    const sampleA = await createSamplePDF(2, 'DocA');
    const sampleB = await createSamplePDF(3, 'DocB');
    const runner = new JobRunner();

    // 2.1 Merge
    const directMerged = await PDFCore.mergePDFs([sampleA, sampleB]);
    const workerMerged = await runner.start({
      operation: 'mergePDFs',
      args: [[sampleA, sampleB]]
    });
    trackOk(workerMerged instanceof Uint8Array, 'Worker merge returns Uint8Array');
    trackOk(workerMerged.length > 0, 'Worker merge returns non-empty bytes');
    const directDoc = await PDFDocument.load(directMerged);
    const workerDoc = await PDFDocument.load(workerMerged);
    trackStrictEqual(workerDoc.getPageCount(), directDoc.getPageCount(), 'Worker merged page count matches direct');
    trackStrictEqual(workerDoc.getPageCount(), 5, 'Merged page count is 5');

    // 2.2 Split
    const directSplit = await PDFCore.splitPDF(workerMerged);
    const workerSplit = await runner.start({
      operation: 'splitPDF',
      args: [workerMerged]
    });
    trackStrictEqual(workerSplit.length, directSplit.length, 'Split page array length matches');
    trackStrictEqual(workerSplit.length, 5, 'Split produces 5 items');
    for (let i = 0; i < 5; i++) {
      trackStrictEqual(workerSplit[i].pageNumber, directSplit[i].pageNumber, `Split item ${i} pageNumber matches`);
      const pageDoc = await PDFDocument.load(workerSplit[i].bytes);
      trackStrictEqual(pageDoc.getPageCount(), 1, `Split page ${i} has exactly 1 page`);
    }

    // 2.3 Rotate
    const directRotated = await PDFCore.rotatePDF(sampleA, 90, [0]);
    const workerRotated = await runner.start({
      operation: 'rotatePDF',
      args: [sampleA, 90, [0]]
    });
    const directRotDoc = await PDFDocument.load(directRotated);
    const workerRotDoc = await PDFDocument.load(workerRotated);
    trackStrictEqual(workerRotDoc.getPage(0).getRotation().angle, directRotDoc.getPage(0).getRotation().angle, 'Worker rotated page 0 angle matches direct');
    trackStrictEqual(workerRotDoc.getPage(1).getRotation().angle, directRotDoc.getPage(1).getRotation().angle, 'Worker rotated page 1 angle matches direct');
    trackStrictEqual(workerRotDoc.getPage(0).getRotation().angle, 90, 'Page 0 rotation is 90');
    trackStrictEqual(workerRotDoc.getPage(1).getRotation().angle, 0, 'Page 1 rotation is 0');

    // 2.4 Extract Pages
    const directExtracted = await PDFCore.extractPages(workerMerged, [0, 2, 4]);
    const workerExtracted = await runner.start({
      operation: 'extractPages',
      args: [workerMerged, [0, 2, 4]]
    });
    const directExtDoc = await PDFDocument.load(directExtracted);
    const workerExtDoc = await PDFDocument.load(workerExtracted);
    trackStrictEqual(workerExtDoc.getPageCount(), directExtDoc.getPageCount(), 'Extracted page count matches direct');
    trackStrictEqual(workerExtDoc.getPageCount(), 3, 'Extracted page count is 3');

    // 2.5 Watermark
    const directWm = await PDFCore.watermarkPDF(sampleA, { text: 'CONFIDENTIAL', opacity: 0.5 });
    const workerWm = await runner.start({
      operation: 'watermarkPDF',
      args: [sampleA, { text: 'CONFIDENTIAL', opacity: 0.5 }]
    });
    const directWmDoc = await PDFDocument.load(directWm);
    const workerWmDoc = await PDFDocument.load(workerWm);
    trackStrictEqual(workerWmDoc.getPageCount(), directWmDoc.getPageCount(), 'Watermarked page count matches direct');

    // 2.6 Compress
    const directComp = await PDFCore.compressPDF(sampleA, { level: 'recommended', stripMetadata: true });
    const workerComp = await runner.start({
      operation: 'compressPDF',
      args: [sampleA, { level: 'recommended', stripMetadata: true }]
    });
    const directCompDoc = await PDFDocument.load(directComp);
    const workerCompDoc = await PDFDocument.load(workerComp);
    trackStrictEqual(workerCompDoc.getPageCount(), directCompDoc.getPageCount(), 'Compressed page count matches direct');

    // 2.7 Text Extraction
    const directText = await PDFCore.pdfToText(sampleA, { format: 'text' });
    const workerText = await runner.start({
      operation: 'pdfToText',
      args: [sampleA, { format: 'text' }]
    });
    trackStrictEqual(workerText.trim(), directText.trim(), 'Extracted text via worker matches direct extraction');

    runner.cancel();
    passedCount++;
    console.log('  ✓ PDFCore operations produce valid, equivalent output via worker');
  }

  // --- Suite 3: Progress Ordering & Valid Stages ---
  console.log('\nSuite 3: Progress Ordering and Stage Validation');
  {
    const sample = await createSamplePDF(3, 'ProgressTest');
    const runner = new JobRunner();
    const progressLog = [];

    runner.onProgress((percent, stage) => {
      progressLog.push({ percent, stage });
    });

    const result = await runner.start({
      operation: 'rotatePDF',
      args: [sample, 180]
    });
    trackOk(result.length > 0, 'Rotate completed successfully');

    trackOk(progressLog.length >= 3, `Expected at least 3 progress events, got ${progressLog.length}`);

    // Verify ordering and stages
    let previousPercent = -1;
    for (let i = 0; i < progressLog.length; i++) {
      const { percent, stage } = progressLog[i];
      trackOk(typeof percent === 'number', `Progress event ${i} percent must be a number`);
      trackOk(percent >= 0 && percent <= 100, `Progress percent ${percent} must be between 0 and 100`);
      trackOk(percent >= previousPercent, `Progress percent ${percent} must be non-decreasing (was ${previousPercent})`);
      trackOk(VALID_STAGES.has(stage), `Stage "${stage}" must be in VALID_STAGES`);
      previousPercent = percent;
    }

    // Verify first and terminal stages
    trackStrictEqual(progressLog[0].stage, 'loading', 'Initial progress stage is loading');
    trackStrictEqual(progressLog[progressLog.length - 1].stage, 'completed', 'Final progress stage is completed');
    trackStrictEqual(progressLog[progressLog.length - 1].percent, 100, 'Final progress percent is 100');

    runner.cancel();
    passedCount++;
    console.log('  ✓ Progress is strictly non-decreasing (0-100) and adheres to valid stages');
  }

  // --- Suite 4: Error Propagation Format ({ code, userMessage, detail }) ---
  console.log('\nSuite 4: Error Propagation Format and Integrity');
  {
    const runner = new JobRunner();

    // 4.1 Invalid PDF data
    let callbackError1 = null;
    runner.onError = (err) => { callbackError1 = err; };

    try {
      await runner.start({
        operation: 'splitPDF',
        args: [new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44])] // Not a PDF
      });
      trackOk(false, 'Invalid PDF data should have thrown');
    } catch (err) {
      trackOk(err && typeof err === 'object', 'Error is an object');
      trackOk(typeof err.code === 'string' && err.code.length > 0, `Error code is non-empty string: "${err.code}"`);
      trackOk(typeof err.userMessage === 'string' && err.userMessage.length > 0, `userMessage is non-empty string: "${err.userMessage}"`);
      trackOk(typeof err.detail === 'string' && err.detail.length > 0, `detail is non-empty string: "${err.detail}"`);
      trackStrictEqual(err, callbackError1, 'onError callback receives the same formatted error object');
    }

    // 4.2 Unknown Operation
    let callbackError2 = null;
    runner.onError = (err) => { callbackError2 = err; };

    try {
      await runner.start({
        operation: 'nonExistentOperationXYZ',
        args: []
      });
      trackOk(false, 'Unknown operation should have thrown');
    } catch (err) {
      trackStrictEqual(err.code, 'UNKNOWN_OPERATION', 'Error code is UNKNOWN_OPERATION');
      trackOk(err.userMessage.includes('nonExistentOperationXYZ'), 'userMessage mentions the invalid operation');
      trackOk(typeof err.detail === 'string' && err.detail.length > 0, 'detail provides actionable info');
      trackStrictEqual(err, callbackError2, 'onError callback receives UNKNOWN_OPERATION error');
    }

    runner.cancel();
    passedCount++;
    console.log('  ✓ Error propagation adheres to {code, userMessage, detail} schema');
  }

  // --- Suite 5: Cancellation Actually Stops Work and Releases Memory ---
  console.log('\nSuite 5: Cancellation Mechanics and Memory Release');
  {
    const sample = await createSamplePDF(15, 'LargeCancelDoc');
    const runner = new JobRunner();

    let cancelError = null;
    runner.onError = (err) => {
      cancelError = err;
    };

    // Start a heavy compress operation
    const jobPromise = runner.start({
      operation: 'compressPDF',
      args: [sample, { level: 'extreme' }]
    });

    trackStrictEqual(runner.isRunning, true, 'Runner is running immediately after start');
    trackOk(runner.worker !== null, 'Worker thread is active');
    trackOk(runner.currentJob !== null, 'Current job is tracked');

    // Trigger immediate cancellation
    runner.cancel();

    // Verify worker terminated and references nulled
    trackStrictEqual(runner.isRunning, false, 'Runner isRunning is false after cancel()');
    trackStrictEqual(runner.worker, null, 'runner.worker must be null after cancel() (worker.terminate called)');
    trackStrictEqual(runner.currentJob, null, 'runner.currentJob must be null after cancel() (buffers released)');

    // Verify rejection and onError
    try {
      await jobPromise;
      trackOk(false, 'Cancelled job promise should have rejected');
    } catch (err) {
      trackStrictEqual(err.code, 'CANCELLED', 'Cancelled error code is CANCELLED');
      trackOk(typeof err.userMessage === 'string' && err.userMessage.length > 0, 'userMessage present on cancel');
      trackOk(typeof err.detail === 'string' && err.detail.length > 0, 'detail present on cancel');
    }

    trackOk(cancelError !== null, 'onError callback was invoked for cancellation');
    trackStrictEqual(cancelError.code, 'CANCELLED', 'onError received CANCELLED code');

    // Verify runner can immediately execute a subsequent job without hanging or zombie worker
    const sampleSmall = await createSamplePDF(2, 'SubsequentDoc');
    const subResult = await runner.start({
      operation: 'rotatePDF',
      args: [sampleSmall, 90]
    });
    trackOk(subResult instanceof Uint8Array, 'Subsequent job executes and returns valid result');
    trackOk(subResult.length > 0, 'Subsequent job result is non-empty');
    trackStrictEqual(runner.isRunning, false, 'Runner isRunning is false after job completes');

    runner.cancel();
    passedCount++;
    console.log('  ✓ Cancellation terminates worker, nulls buffers, and allows fresh jobs');
  }

  // --- Suite 6: Transferable Buffers and Input Immutability ---
  console.log('\nSuite 6: Transferable Buffers and Input Defense');
  {
    const sample = await createSamplePDF(2, 'TransferTest');
    const runner = new JobRunner();

    // Verify caller buffer is NOT detached by worker run
    const originalLength = sample.length;
    trackOk(sample.buffer.byteLength > 0, 'Sample buffer is initially valid');

    const result = await runner.start({
      operation: 'rotatePDF',
      args: [sample, 90]
    });

    trackOk(sample.buffer.byteLength > 0, 'Sample buffer was not detached by runner execution');
    trackStrictEqual(sample.length, originalLength, 'Sample length remains unchanged');

    // Verify result is a valid Uint8Array with own buffer
    trackOk(result instanceof Uint8Array, 'Result is Uint8Array');
    trackOk(result.buffer instanceof ArrayBuffer, 'Result buffer is valid ArrayBuffer');
    trackOk(result.buffer.byteLength > 0, 'Result buffer byteLength is positive');

    runner.cancel();
    passedCount++;
    console.log('  ✓ Transferable buffers preserve caller input and return zero-copy output');
  }

  // --- Suite 7: Callbacks in Job Spec vs Constructor vs Properties ---
  console.log('\nSuite 7: Multiple Callback Binding Pathways');
  {
    const sample = await createSamplePDF(1, 'CallbackBinding');

    // Pathway A: Callbacks defined inside start({ ..., onProgress, onResult, onError })
    let inlineProgressCalls = 0;
    let inlineResultReceived = null;
    const runnerA = new JobRunner();

    await runnerA.start({
      operation: 'rotatePDF',
      args: [sample, 90],
      onProgress: (p, s) => {
        inlineProgressCalls++;
      },
      onResult: (res) => {
        inlineResultReceived = res;
      }
    });

    trackOk(inlineProgressCalls > 0, 'Inline onProgress callback received events');
    trackOk(inlineResultReceived instanceof Uint8Array, 'Inline onResult callback received result');
    runnerA.cancel();

    // Pathway B: Callbacks passed to constructor
    let ctorProgressCalls = 0;
    let ctorResultReceived = null;
    const runnerB = new JobRunner({
      onProgress: () => { ctorProgressCalls++; },
      onResult: (res) => { ctorResultReceived = res; }
    });

    await runnerB.start({
      operation: 'rotatePDF',
      args: [sample, 90]
    });

    trackOk(ctorProgressCalls > 0, 'Constructor onProgress callback received events');
    trackOk(ctorResultReceived instanceof Uint8Array, 'Constructor onResult callback received result');
    runnerB.cancel();

    passedCount++;
    console.log('  ✓ Callbacks correctly dispatched via inline job, constructor, and property assignment');
  }

  console.log('\n========================================================================');
  console.log(`Passed: ${passedCount} suites`);
  console.log(`Assertions: ${assertionCount}`);
  console.log('========================================================================\n');
}

runWorkerArchitectureTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Test failed with unhandled exception:', err);
  process.exit(1);
});
