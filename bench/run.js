const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const core = require('../pdf_core.js');
const { PDFDocument } = require('pdf-lib');
const { generateAll, CORPUS_DIR } = require('./generate_corpus.js');

const RESULTS_JSON_PATH = path.resolve(__dirname, 'benchmark_results.json');
const RESULTS_MD_PATH = path.resolve(__dirname, 'benchmark_results.md');

function runQpdfCheck(pdfBytes, password) {
  const tmpPath = path.join(__dirname, `_tmp_qpdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(pdfBytes));
    const args = ['--check', '--warning-exit-0'];
    if (password) args.push(`--password=${password}`);
    args.push(tmpPath);
    const res = spawnSync('qpdf', args, { encoding: 'utf8' });
    return res.status === 0;
  } catch {
    return false;
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

function runPdfiumCheck(pdfBytes, password) {
  const tmpPath = path.join(__dirname, `_tmp_pdfium_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(pdfBytes));
    const pyCode = `
import pypdfium2 as pdfium
pw = ${password ? JSON.stringify(password) : 'None'}
doc = pdfium.PdfDocument(r"${tmpPath}", password=pw)
assert len(doc) >= 0
`;
    const res = spawnSync('python', ['-c', pyCode], { encoding: 'utf8' });
    return res.status === 0;
  } catch {
    return false;
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

async function extractTextSafe(pdfBytes, password) {
  try {
    const res = await core.pdfToText(pdfBytes);
    return (res.text || '').trim();
  } catch {
    return '';
  }
}

async function getPageCount(pdfBytes) {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 0;
  }
}

function computeTextMatchRatio(srcText, outText) {
  if (!srcText && !outText) return 1.0;
  if (!srcText || !outText) return 0.0;
  const srcWords = new Set(srcText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (srcWords.size === 0) return 1.0;
  const outWords = new Set(outText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  let matched = 0;
  for (const w of srcWords) {
    if (outWords.has(w)) matched++;
  }
  return Number((matched / srcWords.size).toFixed(2));
}

async function runBenchmark() {
  if (!fs.existsSync(CORPUS_DIR) || fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.pdf')).length < 20) {
    console.log('Corpus not detected or incomplete. Generating corpus now...');
    await generateAll();
  }

  const corpusFiles = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.pdf')).sort();
  console.log(`\n================================================================================`);
  console.log(`PDF Studio Benchmark Suite: Executing over ${corpusFiles.length} corpus files`);
  console.log(`================================================================================\n`);

  const benchmarks = [
    {
      tool: 'compressPDF',
      file: '03_large_220_pages.pdf',
      fn: async (bytes) => await core.compressPDF(bytes, { level: 'recommended' })
    },
    {
      tool: 'compressPDF',
      file: '12_image_heavy_photo.pdf',
      fn: async (bytes) => await core.compressPDF(bytes, { level: 'recommended' })
    },
    {
      tool: 'compressPDF',
      file: '14_text_heavy_article.pdf',
      fn: async (bytes) => await core.compressPDF(bytes, { level: 'recommended' })
    },
    {
      tool: 'rotatePDF',
      file: '05_rotated_90_cropbox.pdf',
      fn: async (bytes) => await core.rotatePDF(bytes, 90)
    },
    {
      tool: 'rotatePDF',
      file: '06_rotated_180_cropbox.pdf',
      fn: async (bytes) => await core.rotatePDF(bytes, 180)
    },
    {
      tool: 'cropPDF',
      file: '08_rotated_mixed_pages.pdf',
      fn: async (bytes) => await core.cropPDF(bytes, { pageIndex: 0, x: 50, y: 50, width: 400, height: 600 })
    },
    {
      tool: 'watermarkPDF',
      file: '15_text_heavy_report.pdf',
      fn: async (bytes) => await core.watermarkPDF(bytes, 'CONFIDENTIAL')
    },
    {
      tool: 'watermarkPDF',
      file: '18_nonlatin_cyrillic.pdf',
      fn: async (bytes) => await core.watermarkPDF(bytes, 'AUDIT 2026')
    },
    {
      tool: 'addPageNumbers',
      file: '03_large_220_pages.pdf',
      fn: async (bytes) => await core.addPageNumbers(bytes, { position: 'bottom-right' })
    },
    {
      tool: 'splitPDF',
      file: '11_page_size_mixed.pdf',
      fn: async (bytes) => {
        const parts = await core.splitPDF(bytes, [0, 1, 2]);
        return parts[0].bytes;
      }
    },
    {
      tool: 'mergePDFs',
      file: '01_clean_scan.pdf + 02_noisy_scan.pdf',
      customRunner: async () => {
        const b1 = fs.readFileSync(path.join(CORPUS_DIR, '01_clean_scan.pdf'));
        const b2 = fs.readFileSync(path.join(CORPUS_DIR, '02_noisy_scan.pdf'));
        const start = Date.now();
        const memBefore = process.memoryUsage().heapUsed;
        const out = await core.mergePDFs([b1, b2]);
        const dur = Date.now() - start;
        const memAfter = process.memoryUsage().heapUsed;
        return {
          out,
          dur,
          mem: Math.max(0, memAfter - memBefore),
          srcSize: b1.length + b2.length,
          srcPages: 2
        };
      }
    },
    {
      tool: 'unlockPDF',
      file: '04_encrypted_userpass.pdf',
      fn: async (bytes) => await core.unlockPDF(bytes, 'user123')
    },
    {
      tool: 'protectPDF',
      file: '16_form_interactive.pdf',
      fn: async (bytes) => await core.protectPDF(bytes, 'secret2026')
    },
    {
      tool: 'fillForm',
      file: '16_form_interactive.pdf',
      fn: async (bytes) => await core.fillForm(bytes, { fullName: 'Grace Hopper', email: 'grace@navy.mil' }, { flatten: true })
    },
    {
      tool: 'removePages',
      file: '25_blank_pages.pdf',
      fn: async (bytes) => await core.removePages(bytes, [2, 4])
    },
    {
      tool: 'repairPDF',
      file: '23_transparency_vector.pdf',
      fn: async (bytes) => await core.repairPDF(bytes)
    },
    {
      tool: 'redactPDF',
      file: '14_text_heavy_article.pdf',
      fn: async (bytes) => await core.redactPDF(bytes, [{ pageIndex: 0, x: 50, y: 700, width: 200, height: 40 }])
    }
  ];

  const results = [];

  for (const b of benchmarks) {
    process.stdout.write(`Benchmarking ${b.tool.padEnd(16)} on ${b.file.padEnd(35)} ... `);
    let outBytes, duration, peakMem, srcSize, srcPages;
    let srcText = '';

    try {
      if (b.customRunner) {
        const res = await b.customRunner();
        outBytes = res.out;
        duration = res.dur;
        peakMem = res.mem;
        srcSize = res.srcSize;
        srcPages = res.srcPages;
      } else {
        const srcPath = path.join(CORPUS_DIR, b.file);
        const inBytes = fs.readFileSync(srcPath);
        srcSize = inBytes.length;
        srcPages = await getPageCount(inBytes);
        srcText = await extractTextSafe(inBytes, b.file.includes('encrypted') ? 'user123' : null);

        const memBefore = process.memoryUsage().heapUsed;
        const start = Date.now();
        outBytes = await b.fn(inBytes);
        duration = Date.now() - start;
        const memAfter = process.memoryUsage().heapUsed;
        peakMem = Math.max(0, memAfter - memBefore);
      }

      const outSize = outBytes.length;
      const sizeDelta = (((outSize - srcSize) / srcSize) * 100).toFixed(1);
      const outPages = await getPageCount(outBytes);
      const password = b.tool === 'protectPDF' ? 'secret2026' : null;

      const qpdfOk = runQpdfCheck(outBytes, password);
      const pdfiumOk = runPdfiumCheck(outBytes, password);

      const outText = await extractTextSafe(outBytes, password);
      const textMatch = computeTextMatchRatio(srcText, outText);

      const peakMemMB = (peakMem / (1024 * 1024)).toFixed(1);

      console.log(`OK (${duration}ms, ${qpdfOk ? 'qpdf:PASS' : 'qpdf:FAIL'}, pdfium:${pdfiumOk ? 'PASS' : 'FAIL'})`);

      results.push({
        tool: b.tool,
        file: b.file,
        srcSize,
        outSize,
        deltaPercent: `${sizeDelta}%`,
        timeMs: duration,
        peakMemMB: `${peakMemMB} MB`,
        srcPages,
        outPages,
        textMatch: `${Math.round(textMatch * 100)}%`,
        qpdf: qpdfOk ? 'PASS' : 'FAIL',
        pdfium: pdfiumOk ? 'PASS' : 'FAIL'
      });
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({
        tool: b.tool,
        file: b.file,
        srcSize: 0,
        outSize: 0,
        deltaPercent: 'ERR',
        timeMs: 0,
        peakMemMB: '0 MB',
        srcPages: 0,
        outPages: 0,
        textMatch: '0%',
        qpdf: 'FAIL',
        pdfium: 'FAIL',
        error: err.message
      });
    }
  }

  // Generate Markdown Table
  let md = `# PDF Studio Benchmark Run Results\n\n`;
  md += `Executed on ${new Date().toISOString()} across ${benchmarks.length} corpus benchmark tasks.\n\n`;
  md += `| Tool | File | Src Size | Out Size | Delta | Time (ms) | Peak Mem | Src Pgs | Out Pgs | Text Match | QPDF | PDFium |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const r of results) {
    md += `| ${r.tool} | \`${r.file}\` | ${(r.srcSize / 1024).toFixed(1)} KB | ${(r.outSize / 1024).toFixed(1)} KB | ${r.deltaPercent} | ${r.timeMs} ms | ${r.peakMemMB} | ${r.srcPages} | ${r.outPages} | ${r.textMatch} | **${r.qpdf}** | **${r.pdfium}** |\n`;
  }

  fs.writeFileSync(RESULTS_JSON_PATH, JSON.stringify(results, null, 2));
  fs.writeFileSync(RESULTS_MD_PATH, md);

  console.log(`\n================================================================================`);
  console.log(`BENCHMARK SUMMARY`);
  console.log(`================================================================================`);
  console.log(md);
  console.log(`Saved results to:`);
  console.log(` - ${RESULTS_MD_PATH}`);
  console.log(` - ${RESULTS_JSON_PATH}\n`);

  const anyFail = results.some(r => r.qpdf === 'FAIL' || r.pdfium === 'FAIL');
  return anyFail ? 1 : 0;
}

if (require.main === module) {
  runBenchmark().then(code => process.exit(code)).catch(err => {
    console.error('Benchmark fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runBenchmark };
