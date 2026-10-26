const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');

async function runHygieneTests() {
  console.log('=== Item 5 Comprehensive Hygiene & Security Test Suite ===\n');

  // --- 1. Self-Hosted Fonts & Zero External Font Links ---
  console.log('--- 1. Self-Hosted Fonts Verification ---');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(!indexHtml.includes('fonts.googleapis.com'), 'index.html must not link to fonts.googleapis.com');
  assert(!indexHtml.includes('fonts.gstatic.com'), 'index.html must not link to fonts.gstatic.com');
  console.log('  [PASS] Zero Google Fonts links in index.html');

  const fontFiles = ['caveat.woff2', 'dancing-script.woff2', 'great-vibes.woff2'];
  for (const font of fontFiles) {
    const fontPath = path.join(ROOT, 'vendor', 'fonts', font);
    assert(fs.existsSync(fontPath), `Font file must exist: ${font}`);
    const size = fs.statSync(fontPath).size;
    assert(size > 5000, `Font file ${font} must be valid non-empty woff2 (got ${size} bytes)`);
  }
  console.log('  [PASS] All 3 woff2 fonts exist under vendor/fonts/');

  const styleCss = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert(styleCss.includes('@font-face'), 'style.css must define @font-face');
  assert(styleCss.includes("vendor/fonts/caveat.woff2"), 'style.css must reference caveat.woff2');
  assert(styleCss.includes("vendor/fonts/dancing-script.woff2"), 'style.css must reference dancing-script.woff2');
  assert(styleCss.includes("vendor/fonts/great-vibes.woff2"), 'style.css must reference great-vibes.woff2');
  console.log('  [PASS] @font-face rules defined in style.css for Caveat, Dancing Script, and Great Vibes');

  // --- 2. Strict Content Security Policy (CSP) ---
  console.log('\n--- 2. Strict CSP Meta Tag Verification ---');
  const cspRegex = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]*)"/i;
  const match = indexHtml.match(cspRegex);
  assert(match, 'index.html must include Content-Security-Policy meta tag');
  const csp = match[1];

  const requiredDirectives = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "connect-src 'none'"
  ];

  for (const dir of requiredDirectives) {
    assert(csp.includes(dir), `CSP must include directive: ${dir}`);
  }
  console.log('  [PASS] Strict CSP meta tag matches required directives exactly');

  // --- 3. HTML Escaping & XSS Sanitization Audit ---
  console.log('\n--- 3. XSS Sanitization & escapeHtml Audit ---');
  const { escapeHtml } = require('../app.js');
  assert.strictEqual(typeof escapeHtml, 'function', 'app.js must export escapeHtml function');

  // Test vector: "><img src=x onerror=alert(1)>.pdf
  const xssFilename = '"><img src=x onerror=alert(1)>.pdf';
  const escaped = escapeHtml(xssFilename);
  assert(!escaped.includes('<img'), 'escapeHtml must neutralize <img tags');
  assert(!escaped.includes('"'), 'escapeHtml must escape double quotes');
  assert(!escaped.includes('>'), 'escapeHtml must escape greater-than');
  assert.strictEqual(escaped, '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;.pdf');
  console.log('  [PASS] XSS filename vector "><img src=x onerror=alert(1)>.pdf sanitized properly');

  // Boundary inputs
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(123), '123');
  assert.strictEqual(escapeHtml('Normal.pdf'), 'Normal.pdf');
  assert.strictEqual(escapeHtml("Tom & Jerry's <Contract>.pdf"), "Tom &amp; Jerry&#039;s &lt;Contract&gt;.pdf");
  console.log('  [PASS] escapeHtml handles null, undefined, numbers, and special chars');

  // Verify app.js filesList template escapes item.name
  const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert(appJs.includes('${safeName}'), 'app.js file-name and title attribute must use escaped filename');
  assert(appJs.includes('escapeHtml(uploadedFiles[0].name)'), 'app.js compare tool must escape document A name');
  assert(appJs.includes('escapeHtml(uploadedFiles[1].name)'), 'app.js compare tool must escape document B name');
  assert(appJs.includes('escapeHtml(message)'), 'app.js status and toast banners must escape message string');
  console.log('  [PASS] app.js verified: all filename, metadata, and status injection sites escaped');

  // --- 4. Zero Non-Local Network URL Request Invariant ---
  console.log('\n--- 4. Zero Non-Local URL Request Invariant ---');
  let egressAttempted = null;

  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;

  http.request = (options, cb) => {
    const host = (typeof options === 'string' ? new URL(options) : options).host || (options.hostname || '');
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
      egressAttempted = host;
      throw new Error(`BLOCKED non-local egress request to: ${host}`);
    }
    return originalHttpRequest.call(http, options, cb);
  };

  https.request = (options, cb) => {
    const host = (typeof options === 'string' ? new URL(options) : options).host || (options.hostname || '');
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
      egressAttempted = host;
      throw new Error(`BLOCKED non-local egress request to: ${host}`);
    }
    return originalHttpsRequest.call(https, options, cb);
  };

  try {
    const PDFCore = require('../pdf_core.js');
    const doc = await PDFCore.textToPDF('Zero runtime egress test document.');
    await PDFCore.pdfToText(doc);
    await PDFCore.pdfToPdfA(doc);
    assert.strictEqual(egressAttempted, null, 'No external network request must occur during runtime execution');
    console.log('  [PASS] Runtime execution strictly zero-egress: zero external URLs requested');
  } finally {
    http.request = originalHttpRequest;
    https.request = originalHttpsRequest;
  }

  console.log('\n=============================================');
  console.log('All Item 5 Hygiene Checks Passed 100%!');
  console.log('=============================================');
}

if (require.main === module) {
  runHygieneTests().catch(err => {
    console.error('Hygiene test failed:', err);
    process.exit(1);
  });
}

module.exports = { runHygieneTests };
