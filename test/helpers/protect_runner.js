(async () => {
  try {
    console.log('[BROWSER_TEST] Starting Protect test runner');

    // Wait for DOMContentLoaded and app.js initialization
    while (typeof window.openTool !== 'function') {
      await new Promise(r => setTimeout(r, 50));
    }

    let currentUploadUrl = '/save_protect_panel';

    // 1. Hook URL.createObjectURL to send protected output to server
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
      console.log('[BROWSER_TEST] Intercepted output blob:', blob.size, 'target:', currentUploadUrl);
      blob.arrayBuffer().then(buf => {
        fetch(currentUploadUrl, {
          method: 'POST',
          body: buf,
          headers: { 'Content-Type': 'application/pdf' }
        }).then(() => {
          console.log('[BROWSER_TEST] Uploaded to', currentUploadUrl);
        });
      });
      return origCreateObjectURL.call(URL, blob);
    };

    // 2. Open Protect tool in workspace
    window.openTool('protect');
    await new Promise(r => setTimeout(r, 200));

    // 3. Create a 1-page sample PDF
    const pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.addPage([250, 250]);
    const sampleBytes = await pdfDoc.save();

    // 4. Feed file into app
    const file = new File([sampleBytes], 'sample_to_protect.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const fileInput = document.getElementById('pdfFileInput');
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // 5. Wait for workArea and toolSettings to appear
    let waitIters = 0;
    while (!document.getElementById('protectPermPrinting') && waitIters++ < 40) {
      await new Promise(r => setTimeout(r, 100));
    }

    const printToggle = document.getElementById('protectPermPrinting');
    if (!printToggle) throw new Error('protectPermPrinting element not found in settings panel');

    // Verify all permission checkboxes default to true in tool settings
    const copyToggle = document.getElementById('protectPermCopying');
    const modToggle = document.getElementById('protectPermModifying');
    const annToggle = document.getElementById('protectPermAnnotating');

    if (!copyToggle || !copyToggle.checked) throw new Error('Copying toggle must exist and default to checked');
    if (!modToggle || !modToggle.checked) throw new Error('Modifying toggle must exist and default to checked');
    if (!annToggle || !annToggle.checked) throw new Error('Annotating toggle must exist and default to checked');
    if (!printToggle.checked) throw new Error('Printing toggle must default to checked');

    // 6. Clear "Allow printing" toggle
    printToggle.checked = false;

    // 7. Fill in passwords
    document.getElementById('protectPasswordInput').value = 'TestSecretPass99';
    document.getElementById('protectConfirmInput').value = 'TestSecretPass99';

    // 8. Click executeBtn
    const executeBtn = document.getElementById('executeBtn');
    if (!executeBtn) throw new Error('executeBtn not found');
    currentUploadUrl = '/save_protect_panel';
    executeBtn.click();
    console.log('[BROWSER_TEST] Clicked executeBtn for panel');

    // 9. Now test the Protect Modal dialog (modalProtectPermPrinting etc.)
    await new Promise(r => setTimeout(r, 1200));
    window.openModal('protectModal');

    const modalPrintToggle = document.getElementById('modalProtectPermPrinting');
    const modalCopyToggle = document.getElementById('modalProtectPermCopying');
    const modalModToggle = document.getElementById('modalProtectPermModifying');
    const modalAnnToggle = document.getElementById('modalProtectPermAnnotating');

    if (!modalPrintToggle || !modalPrintToggle.checked) throw new Error('modalProtectPermPrinting must exist and default to checked');
    if (!modalCopyToggle || !modalCopyToggle.checked) throw new Error('modalProtectPermCopying must exist and default to checked');
    if (!modalModToggle || !modalModToggle.checked) throw new Error('modalProtectPermModifying must exist and default to checked');
    if (!modalAnnToggle || !modalAnnToggle.checked) throw new Error('modalProtectPermAnnotating must exist and default to checked');

    // Clear "Allow printing" in modal
    modalPrintToggle.checked = false;

    document.getElementById('modalProtectPasswordInput').value = 'ModalSecretPass88';
    document.getElementById('modalProtectConfirmInput').value = 'ModalSecretPass88';

    currentUploadUrl = '/save_protect_modal';
    document.getElementById('modalProtectSubmitBtn').click();
    console.log('[BROWSER_TEST] Clicked modalProtectSubmitBtn');

  } catch (err) {
    console.error('[BROWSER_TEST] Error:', err);
    fetch('/test_error?err=' + encodeURIComponent(err.stack || err.message));
  }
})();
