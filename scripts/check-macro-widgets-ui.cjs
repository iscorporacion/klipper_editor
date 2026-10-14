const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const sizes = ['1x1', '2x1', '2x2', '1x4'];
  const widgets = [{ id: 'custom-macros:test', title: 'Printer actions', buttons: sizes.map((size, index) => ({
    id: `button-${index}`, name: `Action ${size}`, description: 'Test description', command: `TEST_MACRO VALUE=${index}`, size,
    color: ['#4da3ff', '#f3c633', '#49c99b', '#ef7882', '#c7cbd0'][index], icon: { collection: 'md', name: 'MdSettings' }
  })) }, { id: 'custom-macros:second', title: 'Second group', buttons: [] }];
  const values = {
    'ratos-viewer-locale': 'es', 'klipper-editor-home-widgets': JSON.stringify(widgets.map((item) => item.id)),
    'klipper-editor-custom-macro-widgets': JSON.stringify(widgets),
    'klipper-editor-home-grid-layout': JSON.stringify({ columns: { desktop: 3, tablet: 2, mobile: 1 } })
  };
  let executed = [];
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/icons')) return route.continue();
    let data = {};
    if (pathname === '/api/preferences') {
      if (request.method() === 'PUT') Object.assign(values, request.postDataJSON().values);
      data = { id: 'test-browser', values };
    } else if (pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false, position: { x: 0, y: 0, z: 0 } };
    else if (pathname === '/api/printer/macro-buttons') {
      if (request.method() === 'GET') data = { macros: ['TEST_MACRO'] };
      else { const body = request.postDataJSON(); if (!body.validateOnly) executed.push(body.command); data = { valid: true }; }
    } else if (pathname === '/api/tree') data = { root: 'test', children: [] };
    else if (pathname === '/api/macros') data = { macros: [] };
    await route.fulfill({ json: data });
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90000);
  const failures = [];
  page.on('pageerror', (error) => { failures.push(error.message); console.error('Browser error:', error.message); });
  await page.goto(process.env.TEST_URL || 'http://localhost:3023', { waitUntil: 'domcontentloaded' });
  const group = page.locator('.home-widget').filter({ has: page.getByRole('heading', { name: 'Printer actions', exact: true }) });
  await group.waitFor({ timeout: 60000 });
  await group.locator('.macro-command-button svg path').first().waitFor();
  const measure = () => group.locator('.macro-tile').evaluateAll((nodes) => nodes.map((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  const desktop = await measure();
  assert.ok(Math.abs(desktop[0].width - desktop[0].height) < 1);
  assert.ok(desktop[0].width <= 64, 'Base buttons must stay compact');
  assert.ok(Math.abs(desktop[1].width - (desktop[0].width * 2 + 8)) < 1);
  assert.ok(Math.abs(desktop[2].height - (desktop[0].height * 2 + 8)) < 1);
  assert.ok(Math.abs(desktop[3].width - (desktop[0].width * 4 + 24)) < 1);
  await group.getByRole('button', { name: 'Action 1x1', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.macro-command-button[aria-busy="true"]'));
  assert.deepEqual(executed, ['TEST_MACRO VALUE=0']);
  await group.getByRole('button', { name: 'Configurar widget', exact: true }).click();
  await group.getByRole('button', { name: 'Action 2x2', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Configurar boton', exact: true });
  await editor.locator('.macro-icon-select').click();
  const picker = page.getByRole('dialog', { name: 'Seleccionar icono', exact: true });
  await picker.getByRole('button', { name: 'Md123', exact: true }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR || require('node:os').tmpdir(), 'macro-icon-picker.png'), fullPage: true });
  await picker.getByLabel('Buscar icono', { exact: true }).fill('home');
  await picker.getByRole('button', { name: 'MdHome', exact: true }).click();
  await picker.getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await editor.getByLabel('Nombre', { exact: true }).fill('Heating controls');
  await editor.getByRole('button', { name: 'Izquierda', exact: true }).click();
  assert.ok(await editor.locator('.macro-button-preview').evaluate((node) => node.querySelector('svg').getBoundingClientRect().right <= node.querySelector('span').getBoundingClientRect().left));
  await editor.getByRole('button', { name: 'Centro', exact: true }).click();
  assert.equal(await editor.locator('.macro-button-preview').evaluate((node) => getComputedStyle(node).justifyContent), 'center');
  await editor.getByRole('button', { name: 'Derecha', exact: true }).click();
  assert.ok(await editor.locator('.macro-button-preview').evaluate((node) => node.querySelector('svg').getBoundingClientRect().left >= node.querySelector('span').getBoundingClientRect().right));
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  const saved = JSON.parse(values['klipper-editor-custom-macro-widgets']);
  assert.equal(saved[0].buttons[2].icon.name, 'MdHome');
  assert.equal(saved[0].buttons[2].alignment, 'right');
  assert.equal(executed.length, 1, 'Validation must not execute a macro');
  await group.getByRole('button', { name: 'Action 1x1', exact: true }).dragTo(group.getByRole('button', { name: 'Action 1x4', exact: true }));
  await page.waitForTimeout(200);
  assert.equal(JSON.parse(values['klipper-editor-custom-macro-widgets'])[0].buttons.at(-1).id, 'button-0');
  await group.getByRole('button', { name: 'Terminar edicion', exact: true }).click();
  const screenshotDir = process.env.SCREENSHOT_DIR || require('node:os').tmpdir();
  await page.screenshot({ path: path.join(screenshotDir, 'macro-widgets-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await measure();
  assert.ok(Math.abs(mobile.at(-1).width - mobile.at(-1).height) < 1);
  assert.ok(mobile.at(-1).width <= 64, 'Mobile buttons must retain the compact base size');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile horizontal overflow');
  await page.screenshot({ path: path.join(screenshotDir, 'macro-widgets-mobile.png'), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Second group', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Heating controls', exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Heating controls', exact: true }).evaluate((node) => node.classList.contains('align-right') && node.querySelector('svg').getBoundingClientRect().left >= node.querySelector('span').getBoundingClientRect().right));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  await page.getByRole('tab', { name: 'Widgets', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar widget de macros', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar opciones', exact: true }).click();
  await page.getByRole('heading', { name: 'Macros 3', exact: true }).waitFor();
  assert.equal(JSON.parse(values['klipper-editor-custom-macro-widgets']).length, 3);
  assert.deepEqual(failures, []);
  console.log('OK: desktop/mobile sizing, real icon rendering/search, editing, drag order, persistence and mocked execution');
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
