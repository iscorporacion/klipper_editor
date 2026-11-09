const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const en = require('../locales/en.json');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.routeWebSocket('**/websocket', () => {});
    let prompt = { id: 'fixture:1', title: 'MMU issue', text: ['Load sequence failed: gate 2 is empty. <script>never execute</script>'], shown: true, buttons: [
      { label: 'Unlock', command: 'MMU_UNLOCK', style: 'primary', group: 0, footer: true }, { label: 'Cancel print', command: 'CANCEL_PRINT', style: 'error', group: 1, footer: true }
    ] };
    const sent = [];
    await context.route('**/api/**', async (route) => {
      const request = route.request(), url = new URL(request.url());
      let data = {};
      if (url.pathname === '/api/preferences') data = { id: 'prompt-fixture', values: { 'ratos-viewer-locale': 'en', 'klipper-editor-home-widgets': '[]' } };
      else if (url.pathname === '/api/locales') data = url.searchParams.has('locale') ? { code: 'en', messages: en.messages } : { locales: [{ code: 'en', name: 'English' }] };
      else if (url.pathname === '/api/tree') data = { root: 'test', children: [] };
      else if (url.pathname === '/api/macros') data = { macros: [] };
      else if (url.pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'paused', printing: true };
      else if (url.pathname === '/api/printer/manual-probe') data = { active: false, ready: true, printing: true, homed: true, options: [] };
      else if (url.pathname === '/api/printer/prompts') {
        if (request.method() === 'GET') data = { prompt };
        else { sent.push(request.postDataJSON()); data = { ok: true }; }
      }
      await route.fulfill({ json: data });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.TEST_URL || 'http://localhost:3024', { timeout: 120000 });
    const dialog = page.getByRole('dialog', { name: 'MMU issue', exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.locator('script').count(), 0);
    assert.equal(sent.length, 0);
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.waitForTimeout(2300);
    assert.equal(await dialog.isVisible(), false);
    await page.locator('.printer-prompt-reopen').click();
    await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.printer-prompt-dialog button:disabled'));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].command, 'MMU_UNLOCK');
    await dialog.getByRole('button', { name: 'Cancel print', exact: true }).click();
    const confirmation = dialog.getByRole('alertdialog', { name: 'Cancel print', exact: true });
    await confirmation.waitFor();
    assert.equal(sent.length, 1);
    await confirmation.getByRole('button', { name: 'Back', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    await page.screenshot({ path: `${process.env.TEMP}/keditor-printer-prompt-mobile.png` });
    await dialog.getByRole('button', { name: 'Cancel print', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Cancel print', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.printer-prompt-dialog button:disabled'));
    assert.equal(sent.length, 2);
    assert.equal(sent[1].confirmCancel, true);
    prompt = null;
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log('OK: automatic HH prompt, literal text, close/reopen, explicit actions, cancel confirmation and mobile bounds; APIs mocked');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
