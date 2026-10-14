const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let active = false, position = 1.39;
    const colors = [], commands = [];
    const probe = () => ({ active, position, lower: null, upper: 2.39, ready: true, printing: false, homed: true,
      options: [{ id: 'probe_eddy_current btt_eddy', label: 'Eddy: btt_eddy', command: 'PROBE_EDDY_CURRENT_CALIBRATE CHIP=btt_eddy' }] });
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let data = {};
      if (pathname === '/api/preferences') data = { id: 'probe-test', values: { 'ratos-viewer-locale': 'es', 'klipper-editor-home-widgets': '["movement"]' } };
      else if (pathname === '/api/tree') data = { root: 'test', children: [] };
      else if (pathname === '/api/macros') data = { macros: [] };
      else if (pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false, homedAxes: 'xyz', allAxesHomed: true, position: { x: 100, y: 100, z: 5 } };
      else if (pathname === '/api/printer/auxiliary') {
        if (request.method() === 'POST') { colors.push(request.postDataJSON().color); await new Promise((resolve) => setTimeout(resolve, 350)); }
        data = { controls: [{ name: 'neopixel sb_leds', label: 'Sb Leds', type: 'led', source: 'neopixel', value: 1, color: colors.at(-1) || '#000000', controllable: true }] };
      } else if (pathname === '/api/printer/manual-probe') {
        if (request.method() === 'POST') {
          const body = request.postDataJSON(); commands.push(body);
          if (body.action === 'abort' || body.action === 'accept') active = false;
          else if (body.action === 'start') active = true;
          else position += Number(body.step) || 0;
        }
        data = probe();
      }
      await route.fulfill({ json: data });
    });
    const page = await context.newPage();
    await page.goto(process.env.TEST_URL || 'http://localhost:3023', { timeout: 120000 });
    await page.locator('.auxiliaries-open-button').click({ timeout: 60000 });
    const input = page.locator('.auxiliaries-modal input[type=color]');
    await input.waitFor();
    await input.evaluate((element) => { element.focus(); element.value = '#ff0000'; element.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(200);
    for (const next of ['#00ff00', '#123456']) await input.evaluate((element, value) => { element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); }, next);
    await page.waitForTimeout(1200);
    assert.equal(colors.at(-1), '#123456');
    assert.ok(colors.length <= 2);
    assert.equal(await page.locator('.auxiliaries-modal').isVisible(), true);
    await page.locator('.auxiliaries-modal .modal-close').click();
    active = true;
    const dialog = page.getByRole('dialog', { name: 'Sondeada manual', exact: true });
    await dialog.waitFor({ timeout: 10000 });
    assert.match(await dialog.locator('.manual-probe-position').innerText(), /1\.390/);
    await dialog.getByText('Avanzado', { exact: true }).click();
    await dialog.getByRole('button', { name: '+0.005', exact: true }).click();
    await page.waitForTimeout(500);
    assert.equal(commands.at(-1).step, '0.005');
    await page.screenshot({ path: `${process.env.TEMP}/keditor-probe-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${process.env.TEMP}/keditor-probe-mobile.png` });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    const coarse = await dialog.locator('.manual-probe-coarse button').all();
    for (let i = 1; i < coarse.length; i++) {
      const previous = await coarse[i - 1].boundingBox(), current = await coarse[i].boundingBox();
      assert.ok(previous.x + previous.width < current.x, 'coarse adjustment buttons must not overlap');
    }
    await dialog.getByRole('button', { name: 'Abortar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(commands.at(-1).action, 'abort');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.move-open-button').click();
    await page.getByRole('button', { name: 'Calibrar Z', exact: true }).click();
    const setup = page.locator('.manual-probe-dialog');
    await setup.getByRole('button', { name: 'Iniciar', exact: true }).click();
    const confirmation = page.locator('.app-dialog');
    await confirmation.waitFor();
    assert.match(await confirmation.innerText(), /PROBE_EDDY_CURRENT_CALIBRATE CHIP=btt_eddy/);
    await confirmation.locator('.dialog-button.primary').click();
    await dialog.waitFor();
    assert.equal(commands.at(-1).action, 'start');
    await dialog.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(commands.at(-1).action, 'accept');
    console.log('OK: live color without blur/Enter, last color preserved, automatic probe dialog, TESTZ, ABORT and responsive layout; all printer requests mocked');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
