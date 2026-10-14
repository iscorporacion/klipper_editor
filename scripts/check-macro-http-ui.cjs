const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
    const values = { 'ratos-viewer-locale': 'es', 'klipper-editor-home-widgets': '[]', 'klipper-editor-custom-macro-widgets': '[]' };
    await context.routeWebSocket('**/websocket', () => {});
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let data = {};
      if (pathname === '/api/preferences') {
        if (request.method() === 'PUT') Object.assign(values, request.postDataJSON().values);
        data = { id: 'http-test', values };
      } else if (pathname === '/api/tree') data = { root: 'test', children: [] };
      else if (pathname === '/api/macros') data = { macros: [] };
      else if (pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false };
      else if (pathname === '/api/printer/manual-probe') data = { active: false, ready: true, printing: false, homed: false, options: [] };
      else if (pathname === '/api/printer/macro-buttons') data = request.method() === 'GET' ? { macros: ['TEST_MACRO'] } : { valid: true };
      else if (pathname === '/api/icons') data = { icon: { name: 'MdPlayArrow', attr: { viewBox: '0 0 24 24' }, children: [{ tag: 'path', attr: { d: 'M8 5v14l11-7z' }, children: [] }] } };
      await route.fulfill({ json: data });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.TEST_URL || 'http://localhost:3024', { timeout: 90000 });
    assert.equal(await page.evaluate(() => typeof crypto.randomUUID), 'undefined');
    await page.getByRole('button', { name: 'Opciones', exact: true }).click();
    await page.getByRole('tab', { name: 'Widgets', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar widget de macros', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar opciones', exact: true }).click();
    const widget = page.locator('.home-widget').filter({ has: page.getByRole('heading', { name: 'Macros 1', exact: true }) });
    await widget.waitFor();
    await widget.getByRole('button', { name: 'Agregar boton', exact: true }).last().click();
    const editor = page.getByRole('dialog', { name: 'Configurar boton', exact: true });
    await editor.getByLabel('Nombre', { exact: true }).fill('HTTP test');
    await editor.getByLabel('Macro y parametros', { exact: true }).fill('TEST_MACRO');
    await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('.macro-command-button'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const saved = JSON.parse(values['klipper-editor-custom-macro-widgets']);
    assert.equal(saved.length, 1);
    assert.match(saved[0].id, /^custom-macros:[0-9a-f-]{36}$/);
    assert.match(saved[0].buttons[0].id, /^[0-9a-f-]{36}$/);
    assert.equal(saved[0].buttons[0].command, 'TEST_MACRO');
    await page.reload();
    await page.getByRole('button', { name: 'HTTP test', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('OK: widget and button creation, saving and reload without crypto.randomUUID; all printer APIs mocked');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
