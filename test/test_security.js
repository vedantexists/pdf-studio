const assert = require('assert');
const { PDFDocument, PDFName } = require('pdf-lib');
const PDFCore = require('../pdf_core');

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createTestPNG() {
  return Buffer.from(PNG_1X1_BASE64, 'base64');
}

async function createSamplePDF(pageCount = 1, text = 'Security Test') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${text} ${i + 1}`, { x: 50, y: 550, size: 24 });
  }
  return await doc.save();
}

async function createRestrictedPDF() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]);
  const encryptDict = doc.context.obj({
    Filter: PDFName.of('Standard'),
    V: 2,
    R: 3,
    P: -4,
  });
  doc.context.trailerInfo.Encrypt = encryptDict;
  return await doc.save();
}

async function runSecuritySuiteTests() {
  console.log('=== Running Document Security Suite (M2) Verification Tests ===\n');

  // 1. Protect PDF with standard string password
  const sample = await createSamplePDF(2, 'Confidential');
  const protectedBytes = await PDFCore.protectPDF(sample, 'VaultSecret123');
  assert(protectedBytes instanceof Uint8Array || Buffer.isBuffer(protectedBytes));
  await assert.rejects(
    async () => PDFDocument.load(protectedBytes),
    /encrypted/i,
    'Standard PDFDocument.load must reject protected PDF'
  );
  console.log('✓ protectPDF encrypts PDF and prevents unauthenticated loading');

  // 2. Protect PDF with options object
  const protectedWithOptions = await PDFCore.protectPDF(sample, {
    userPassword: 'UserPass456',
    ownerPassword: 'OwnerPass789',
    permissions: { printing: true, copying: false, modifying: false, annotating: false },
  });
  await assert.rejects(
    async () => PDFDocument.load(protectedWithOptions),
    /encrypted/i,
    'protectPDF with options object must reject unauthenticated loading'
  );
  console.log('✓ protectPDF with full options object (owner pass & permissions) passed');

  // 3. Protect PDF validation - empty password
  await assert.rejects(
    async () => PDFCore.protectPDF(sample, ''),
    /password/i,
    'Empty password string must throw descriptive error'
  );
  await assert.rejects(
    async () => PDFCore.protectPDF(sample, '   '),
    /password/i,
    'Whitespace-only password must throw descriptive error'
  );
  await assert.rejects(
    async () => PDFCore.protectPDF(sample, null),
    /password/i,
    'Null password must throw descriptive error'
  );
  console.log('✓ protectPDF empty/null password validation passed');

  // 4. Unlock PDF on encrypted document
  const unlocked = await PDFCore.unlockPDF(protectedBytes, 'VaultSecret123');
  const unlockedDoc = await PDFDocument.load(unlocked);
  assert.strictEqual(unlockedDoc.isEncrypted, false, 'Unlocked PDF isEncrypted must be false');
  assert.strictEqual(unlockedDoc.getPageCount(), 2, 'Page count preserved through protect -> unlock cycle');
  console.log('✓ unlockPDF decrypts and strips encryption dictionary cleanly');

  // 5. Unlock PDF on permission-restricted PDF
  const restricted = await createRestrictedPDF();
  const unlockedRestricted = await PDFCore.unlockPDF(restricted);
  const reloadedRestricted = await PDFDocument.load(unlockedRestricted);
  assert.strictEqual(reloadedRestricted.isEncrypted, false);
  assert.strictEqual(reloadedRestricted.getPageCount(), 1);
  console.log('✓ unlockPDF strips permissions lock from restricted PDF');

  // 6. Unlock PDF idempotence on unencrypted PDF
  const normalDocBytes = await createSamplePDF(3, 'Normal');
  const unlockedNormal = await PDFCore.unlockPDF(normalDocBytes);
  const reloadedNormal = await PDFDocument.load(unlockedNormal);
  assert.strictEqual(reloadedNormal.isEncrypted, false);
  assert.strictEqual(reloadedNormal.getPageCount(), 3);
  console.log('✓ unlockPDF idempotence on unencrypted document passed');

  // 7. Sign PDF with PNG buffer
  const pngBytes = createTestPNG();
  const signed = await PDFCore.signPDF(sample, pngBytes, 0, { x: 50, y: 100, width: 120, height: 60 });
  assert(signed.length > sample.length, 'Signed document byte size increases');
  const signedDoc = await PDFDocument.load(signed);
  assert.strictEqual(signedDoc.getPageCount(), 2, 'Page count preserved');
  console.log('✓ signPDF embeds PNG signature onto page 0');

  // 8. Sign PDF with Data URL format
  const dataUrl = `data:image/png;base64,${PNG_1X1_BASE64}`;
  const signedDataUrl = await PDFCore.signPDF(sample, dataUrl, 1, { x: 100, y: 150, width: 80, height: 40 });
  const signedDataUrlDoc = await PDFDocument.load(signedDataUrl);
  assert.strictEqual(signedDataUrlDoc.getPageCount(), 2);
  console.log('✓ signPDF accepts data URL signature and signs page 1');

  // 9. Sign PDF out of bounds validation
  await assert.rejects(
    async () => PDFCore.signPDF(sample, pngBytes, 5, { x: 50, y: 50, width: 100, height: 50 }),
    /index|bounds|page/i,
    'Page index 5 out of bounds for 2-page document must throw'
  );
  await assert.rejects(
    async () => PDFCore.signPDF(sample, pngBytes, -1, { x: 50, y: 50, width: 100, height: 50 }),
    /index|bounds|page/i,
    'Negative page index must throw'
  );
  console.log('✓ signPDF bounds validation passed');

  // 10. Pipeline with sign, protect, and unlock
  const pipelineBytes = await PDFCore.runPipeline(sample, [
    { op: 'sign', signatureData: pngBytes, pageIndex: 0, options: { x: 50, y: 50, width: 80, height: 40 } },
    { op: 'protect', userPassword: 'PipeKey2026' },
  ]);
  await assert.rejects(
    async () => PDFDocument.load(pipelineBytes),
    /encrypted/i,
    'Pipeline output with protect step must be encrypted'
  );

  const pipelineUnlocked = await PDFCore.runPipeline(pipelineBytes, [
    { op: 'unlock', password: 'PipeKey2026' },
  ]);
  const finalPipeDoc = await PDFDocument.load(pipelineUnlocked);
  assert.strictEqual(finalPipeDoc.isEncrypted, false);
  assert.strictEqual(finalPipeDoc.getPageCount(), 2);
  console.log('✓ runPipeline with sign, protect, and unlock executed cleanly');

  console.log('\nAll 10 Document Security Suite tests passed cleanly!');
}

runSecuritySuiteTests().catch((err) => {
  console.error('Security test failed:', err);
  process.exit(1);
});
