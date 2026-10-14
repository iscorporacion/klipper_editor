const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = require('react-icons/md').MdSettings({}).props;
const icon = { name: 'MdSettings', attr: source.attr, children: source.children.map((node) => ({ tag: node.type, attr: node.props, children: [] })) };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const config = [{ id: 'custom-macros:alignment', title: 'Alignment test', buttons: [{
    id: 'test-button', name: 'Inicio', description: 'Home', command: 'TEST_MACRO', size: '1x4', color: '#4da3ff', icon: { collection: 'md', name: 'MdSettings' }
  }] }];
  const values = { 'ratos-viewer-locale': 'es', 'klipper-editor-home-widgets': '["custom-macros:alignment","movement"]', 'klipper-editor-custom-macro-widgets': JSON.stringify(config) };
  let executions = 0;
  const motorActions = [];
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let data = {};
    if (pathname === '/api/preferences') {
      if (request.method() === 'PUT') Object.assign(values, request.postDataJSON().values);
      data = { id: 'alignment-test', values };
    } else if (pathname === '/api/tree') data = { root: 'test', children: [] };
    else if (pathname === '/api/macros') data = { macros: [] };
    else if (pathname === '/api/icons') data = { icon };
    else if (pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false };
    else if (pathname === '/api/printer/quick-command') { motorActions.push(request.postDataJSON().command); data = { result: 'ok' }; }
    else if (pathname === '/api/printer/macro-buttons') {
      if (request.method() === 'GET') data = { macros: ['TEST_MACRO'] };
      else { if (!request.postDataJSON().validateOnly) executions++; data = { valid: true }; }
    }
    await route.fulfill({ json: data });
  });
  const page = await context.newPage();
  await page.goto(process.env.TEST_URL || 'http://localhost:3023', { timeout: 90000 });
  const group = page.locator('.home-widget').filter({ has: page.getByRole('heading', { name: 'Alignment test', exact: true }) });
  const check = (node, alignment) => {
    const symbol = node.querySelector('svg:not(.macro-tile-grip)').getBoundingClientRect();
    const text = node.querySelector('span').getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    if (alignment === 'right') return symbol.left >= text.right && symbol.right > bounds.right - 20;
    if (alignment === 'left') return symbol.right <= text.left && symbol.left < bounds.left + 20;
    return Math.abs((symbol.left + text.right) / 2 - (bounds.left + bounds.right) / 2) < 2;
  };
  await group.locator('.macro-command-button.align-center').waitFor();
  for (const [alignment, label] of [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']]) {
    await group.getByRole('button', { name: 'Configurar widget', exact: true }).click();
    await group.getByRole('button', { name: 'Inicio', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Configurar boton', exact: true });
    assert.ok(await editor.locator('.macro-appearance-fields').evaluate((row) => {
      const icon = row.querySelector('.macro-icon-select').getBoundingClientRect();
      const alignment = row.querySelector('.macro-alignment-controls').getBoundingClientRect();
      const color = row.querySelector('input[type="color"]').getBoundingClientRect();
      return Math.abs(icon.y - alignment.y) < 1 && Math.abs(icon.y - color.y) < 1 && icon.right <= alignment.left && alignment.right <= color.left && color.width === 64;
    }));
    await editor.getByRole('button', { name: label, exact: true }).click();
    assert.ok(await editor.locator('.macro-button-preview').evaluate(check, alignment));
    await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal(JSON.parse(values['klipper-editor-custom-macro-widgets'])[0].buttons[0].alignment, alignment);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await group.locator(`.macro-command-button.align-${alignment}`).waitFor();
    assert.ok(await group.locator('.macro-command-button').evaluate(check, alignment));
  }
  await group.getByRole('button', { name: 'Configurar widget', exact: true }).click();
  await group.getByRole('button', { name: 'Inicio', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Configurar boton', exact: true });
  const size = editor.locator('.macro-button-form select');
  assert.equal(await size.locator('option[value="1x2"], option:has-text("1x2")').count(), 0);
  const title = editor.getByLabel('Mostrar titulo', { exact: true });
  for (const value of ['2x1', '2x2', '1x4']) {
    await size.selectOption(value);
    await title.check();
    assert.equal(await editor.locator('.macro-button-preview > span').count(), 1);
    await title.uncheck();
    assert.equal(await editor.locator('.macro-button-preview > span').count(), 0);
  }
  await size.selectOption('2x1');
  await title.check();
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await group.locator('.macro-command-button > span').textContent(), 'Inicio');
  await group.getByRole('button', { name: 'Configurar widget', exact: true }).click();
  await group.getByRole('button', { name: 'Inicio', exact: true }).click();
  await size.selectOption('1x1');
  assert.equal(await title.isDisabled(), true);
  assert.equal(await title.isChecked(), false);
  assert.equal(await editor.locator('.macro-button-preview > span').count(), 0);
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await group.locator('.macro-command-button').waitFor();
  assert.equal(await group.locator('.macro-command-button > span').count(), 0);
  const toolbarMotor = page.locator('.quick-toolbar').getByRole('button', { name: 'Apagar motores de la impresora', exact: true });
  const widget = page.locator('.home-widget-movement');
  await toolbarMotor.click();
  await page.waitForFunction(() => !document.querySelector('.quick-toolbar button[aria-label="Apagar motores de la impresora"]').disabled);
  await widget.getByRole('button', { name: 'Apagar motores de la impresora', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.quick-toolbar button[aria-label="Apagar motores de la impresora"]').disabled);
  await widget.getByRole('button', { name: 'Abrir ventana completa', exact: true }).click();
  await page.locator('.movement-modal').getByRole('button', { name: 'Apagar motores de la impresora', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.quick-toolbar button[aria-label="Apagar motores de la impresora"]').disabled);
  assert.deepEqual(motorActions, ['motors-off', 'motors-off', 'motors-off']);
  assert.equal(executions, 0);
  console.log('OK: alignment, optional titles, icon-only 1x1, removed 1x2 and three mocked motor-off controls');
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
