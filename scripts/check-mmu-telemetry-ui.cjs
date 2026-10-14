const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const locale = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/es.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const state = { available: true, printing: false, displayName: 'Tradrack-0', websocketUrl: 'ws://printer.invalid/websocket', settings: { gate_homing_endstop: 'mmu_gate' }, mmu: {
      enabled: true, has_bypass: true, num_gates: 5, gate: 0, tool: 0, action: 'Idle', print_state: 'ready', filament_pos: 10, filament_position: 840,
      gate_status: [1, 1, 1, 1, 1], gate_color: ['77cc33','eec055','66aabb','ee9922','cccccc'], gate_temperature: [250,250,250,250,250], gate_material: ['PETG','PETG','PETG','PETG','PETG'], ttg_map: [0,1,2,3,4],
      sensors: { mmu_gate: true, extruder: true, toolhead: true, filament_proportional: false },
      encoder: { enabled: true, encoder_pos: 227, flow_rate: 100, headroom: 10, detection_length: 20 },
      flowguard: { enabled: true, active: true, level: .2, max_clog: 1, max_tangle: -1 },
      sync_feedback_enabled: true, sync_feedback_state: 'neutral', sync_feedback_bias_modelled: .36, sync_drive: true, num_toolchanges: 2, slicer_tool_map: { total_toolchanges: 5 }
    } };
    const actions = [];
    let socket, subscription;
    await context.routeWebSocket('**/websocket', (ws) => {
      socket = ws;
      ws.onMessage((message) => {
        const request = JSON.parse(String(message));
        subscription = request;
        ws.send(JSON.stringify({ id: request.id, result: { status: { mmu: state.mmu } } }));
      });
    });
    await context.route('**/api/**', async (route) => {
      const request = route.request(), url = new URL(request.url());
      let data = {};
      if (url.pathname === '/api/preferences') data = { id: 'mmu-telemetry-test', values: {
        'ratos-viewer-locale': 'es', 'klipper-editor-home-widgets': '["mmu"]',
        'klipper-editor-home-grid-layout': JSON.stringify({ columns: { desktop: 2, tablet: 1, mobile: 1 }, layout: { desktop: [['mmu'],[]], tablet: [['mmu']], mobile: [['mmu']] } })
      } };
      else if (url.pathname === '/api/locales') data = url.searchParams.has('locale') ? { code: 'es', name: 'Español', messages: locale.messages } : { locales: [{ code: 'es', name: 'Español' }] };
      else if (url.pathname === '/api/tree') data = { root: 'test', children: [] };
      else if (url.pathname === '/api/macros') data = { macros: [] };
      else if (url.pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false };
      else if (url.pathname === '/api/printer/manual-probe') data = { active: false, ready: true, printing: false, homed: false, options: [] };
      else if (url.pathname === '/api/printer/mmu/spool') return route.continue(); // Local asset rendering only; no printer access.
      else if (url.pathname === '/api/printer/mmu') {
        if (request.method() === 'POST') { actions.push(request.postDataJSON()); data = { status: state }; }
        else data = state;
      }
      await route.fulfill({ json: data });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.stack); });
    await page.goto(process.env.TEST_URL || 'http://localhost:3024', { timeout: 120000 });
    const widget = page.locator('.home-widget-mmu');
    const figure = widget.locator('.mmu-filament-path');
    await figure.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('.mmu-spool img')?.complete);
    assert.equal(await widget.locator('.mmu-gate-menu').count(), 0);
    assert.equal(await widget.locator('.mmu-gate-panel').count(), 0);
    const spool = (gate) => widget.locator(`.mmu-spool[data-gate="${gate}"]`);
    await spool(1).click();
    const panel = widget.locator('.mmu-gate-panel');
    await panel.waitFor();
    assert.match(await panel.locator('header').innerText(), /G1.*T1/);
    await spool(1).click();
    assert.equal(await panel.isVisible(), true);
    await spool(0).click();
    assert.match(await panel.locator('header').innerText(), /G0.*T0/);
    await panel.locator('.mmu-gate-panel-close').click();
    await panel.waitFor({ state: 'hidden' });
    await spool(1).click();
    await figure.click();
    await panel.waitFor({ state: 'hidden' });
    await spool(1).click();
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    await spool(1).click();
    await panel.getByRole('button', { name: 'Comprobar', exact: true }).click();
    await panel.waitFor({ state: 'hidden' });
    assert.deepEqual(actions, [{ action: 'check', gate: 1 }]);
    for (const field of ['sensors','bowden_progress','sync_feedback_bias_modelled']) assert.ok(subscription.params.objects.mmu.includes(field));
    const initialHeight = await figure.locator('.mmu-path-filament').getAttribute('height');
    socket.send(JSON.stringify({ method: 'notify_status_update', params: [{ mmu: { action: 'Loading', filament_pos: 3, bowden_progress: 20, filament_direction: 1, sensors: { toolhead: false } } }, 1] }));
    await page.waitForFunction(() => document.querySelector('.mmu-filament-path')?.getAttribute('data-phase') === '3');
    assert.ok(Number(await figure.locator('.mmu-path-filament').getAttribute('height')) < Number(initialHeight));
    assert.equal(await figure.locator('[data-sensor=toolhead]').getAttribute('data-detected'), 'false');
    assert.equal(await figure.locator('[data-sensor=mmu_gate]').getAttribute('data-detected'), 'true');
    assert.equal(await figure.locator('.mmu-path-motion').count(), 1);
    socket.send(JSON.stringify({ method: 'notify_status_update', params: [{ mmu: { action: 'Idle', filament_pos: 10, print_state: 'printing', is_in_print: true, sync_feedback_state: 'compressed', sync_feedback_bias_modelled: .7 } }, 2] }));
    await page.waitForFunction(() => document.querySelector('.mmu-path-piston')?.getAttribute('data-bias') === '0.7');
    await page.waitForTimeout(250);
    const gauge = await widget.locator('.mmu-monitoring').boundingBox(), diagram = await figure.boundingBox();
    assert.ok(gauge.x + gauge.width <= diagram.x + 1);
    await page.screenshot({ path: `${process.env.TEMP}/keditor-mmu-telemetry-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await figure.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.TEMP}/keditor-mmu-telemetry-mobile.png` });
    const mobile = await figure.boundingBox(), body = await widget.boundingBox();
    assert.ok(mobile.x >= body.x && mobile.x + mobile.width <= body.x + body.width + 1);
    await spool(1).click();
    await panel.waitFor();
    const panelBounds = await panel.boundingBox();
    assert.ok(panelBounds.x >= body.x && panelBounds.x + panelBounds.width <= body.x + body.width + 1);
    for (const button of await panel.locator(':scope > button').all()) assert.equal(await button.isDisabled(), true);
    assert.equal(actions.length, 1);
    await panel.getByRole('button', { name: 'Cerrar', exact: true }).click();
    Object.assign(state.mmu, { print_state: 'paused', is_paused: true, is_locked: true, filament_pos: 10 });
    state.printing = true;
    socket.send(JSON.stringify({ method: 'notify_status_update', params: [{ mmu: state.mmu }, 3] }));
    await page.waitForFunction(() => {
      const button = document.querySelector('.mmu-command-bar button[aria-label="Recuperar"]');
      return button && !button.disabled;
    });
    for (const label of ['Home', 'Recuperar', 'Descargar', 'Desbloquear', 'Comprobar todas']) assert.equal(await widget.getByRole('button', { name: label, exact: true }).isEnabled(), true, label);
    assert.equal(await widget.getByRole('button', { name: 'Cargar', exact: true }).isDisabled(), true, 'Loaded filament keeps load disabled');
    assert.equal(await widget.getByRole('button', { name: 'Apagar motores MMU', exact: true }).isDisabled(), true);
    state.mmu.filament_pos = 0;
    socket.send(JSON.stringify({ method: 'notify_status_update', params: [{ mmu: { filament_pos: 0 } }, 4] }));
    await page.waitForFunction(() => !document.querySelector('.mmu-command-bar button[aria-label="Cargar"]').disabled);
    assert.equal(await widget.getByRole('button', { name: 'Descargar', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('OK: compact live MMU path, real websocket updates, drawer repeat/switch/outside/Escape, correct mocked gate command and print guards on desktop/mobile');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
