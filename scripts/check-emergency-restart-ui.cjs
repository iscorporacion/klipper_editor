const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  let shutdown = true;
  let restartRequests = 0;
  await context.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let data = {};
    if (pathname === '/api/preferences') data = { id: 'restart-test', values: { 'ratos-viewer-locale': 'es', 'klipper-editor-home-widgets': '[]' } };
    else if (pathname === '/api/tree') data = { root: 'test', children: [] };
    else if (pathname === '/api/macros') data = { macros: [] };
    else if (pathname === '/api/printer/status') data = { webhooksState: shutdown ? 'shutdown' : 'ready', webhooksMessage: shutdown ? 'Shutdown due to webhooks request' : '', printState: shutdown ? 'printing' : 'standby', printing: shutdown };
    else if (pathname === '/api/printer/firmware-restart') { restartRequests++; shutdown = false; data = { result: 'ok' }; }
    await route.fulfill({ json: data });
  });
  const page = await context.newPage();
  await page.goto(process.env.TEST_URL || 'http://localhost:3023', { timeout: 90000 });
  const card = page.locator('.printer-initializing-card');
  await card.waitFor({ timeout: 30000 });
  const firmware = card.getByRole('button', { name: 'Reiniciar firmware', exact: true });
  const klipper = card.getByRole('button', { name: 'Reiniciar Klipper', exact: true });
  assert.equal(await firmware.isEnabled(), true);
  assert.equal(await klipper.isEnabled(), true);
  await firmware.click();
  await card.waitFor({ state: 'hidden' });
  assert.equal(restartRequests, 1);
  console.log('OK: shutdown with stale printing flag enables recovery and clears modal after mocked firmware restart');
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
