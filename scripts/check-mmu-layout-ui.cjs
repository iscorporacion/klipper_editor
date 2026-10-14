const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const state = { available: true, printing: false, displayName: 'Test MMU', mmu: {
    enabled: true, has_bypass: true, num_gates: 5, gate: 0, tool: 0,
    gate_status: [1, 1, 1, 1, 1], gate_material: ['PETG', 'PETG', 'PETG', 'PETG', 'PETG'], ttg_map: [0, 1, 2, 3, 4]
  } };
  const actions = [];
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let data = {};
    if (pathname === '/api/preferences') data = { id: 'mmu-layout-test', values: { 'ratos-viewer-locale': 'es', 'klipper-editor-home-widgets': '["mmu"]' } };
    else if (pathname === '/api/tree') data = { root: 'test', children: [] };
    else if (pathname === '/api/macros') data = { macros: [] };
    else if (pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false };
    else if (pathname === '/api/printer/mmu') {
      if (request.method() === 'POST') { actions.push(request.postDataJSON().action); state.mmu.gate = -2; data = { status: state }; }
      else data = state;
    } else if (pathname === '/api/printer/mmu/spool') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" />' });
    await route.fulfill({ json: data });
  });
  const page = await context.newPage();
  await page.goto(process.env.TEST_URL || 'http://localhost:3023', { timeout: 90000 });
  const header = page.locator('.home-widget-mmu > .home-widget-header');
  const bypass = header.getByRole('button', { name: 'Bypass', exact: true });
  await bypass.waitFor();
  assert.equal(await page.locator('.mmu-spool-row .mmu-bypass').count(), 0);
  await header.getByRole('button', { name: /Mapear herramientas/ }).click();
  const modal = page.locator('.mmu-map-modal');
  const desktop = await modal.boundingBox();
  assert.ok(Math.abs(desktop.width - 504) < 1, `Expected 504px, got ${desktop.width}`);
  assert.equal(await modal.locator('.mmu-map-tool').count(), 5);
  assert.equal(await modal.locator('.mmu-map-body').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await modal.boundingBox();
  assert.ok(mobile.width <= 358 && mobile.x >= 0 && mobile.x + mobile.width <= 390);
  await modal.locator('.modal-close').click();
  await bypass.click();
  await page.waitForFunction(() => document.querySelector('.home-widget-header .mmu-bypass')?.classList.contains('active'));
  assert.deepEqual(actions, ['bypass']);
  assert.equal(await bypass.isDisabled(), true);
  console.log('OK: map width 504px, responsive single column, bypass in header and unchanged mocked action');
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
