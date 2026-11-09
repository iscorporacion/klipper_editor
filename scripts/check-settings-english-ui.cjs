const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const locale = require('../locales/en.json');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.routeWebSocket('**/websocket', () => {});
    await context.route('**/api/**', async (route) => {
      const request = route.request(), url = new URL(request.url());
      let data = {};
      if (url.pathname === '/api/preferences') data = { id: 'english-settings', values: { 'ratos-viewer-locale': 'en', 'klipper-editor-home-widgets': '[]' } };
      else if (url.pathname === '/api/locales') data = url.searchParams.has('locale') ? { code: 'en', messages: locale.messages } : { locales: [{ code: 'en', name: 'English' }] };
      else if (url.pathname === '/api/tree') data = { root: 'test', children: [] };
      else if (url.pathname === '/api/macros') data = { macros: [] };
      else if (url.pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false };
      else if (url.pathname === '/api/printer/manual-probe') data = { active: false, ready: true, printing: false, homed: false, options: [] };
      else if (url.pathname === '/api/backups') {
        if (request.method() === 'POST') data = { revision: 'test', warnings: ['Enlace omitido: mmu/link'], candidates: [
          { path: 'old.bak', type: 'file', fingerprint: 'a', destination: '.keditor-backups/old.bak', files: 1, blockedReason: '' },
          { path: 'printer.cfg', type: 'file', fingerprint: 'b', destination: '.keditor-backups/printer.bak', files: 1, blockedReason: 'Referenciado por la configuracion activa' }
        ] };
        else data = { rules: [{ id: 'bak', pattern: '*.bak', enabled: true, kind: 'file' }], revision: 'test', location: 'config/.keditor-backups', rulesFile: '.keditor-backup-rules.json' };
      }
      await route.fulfill({ json: data });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.TEST_URL || 'http://localhost:3024', { timeout: 120000 });
    await page.getByRole('button', { name: 'Options', exact: true }).click();
    await page.getByText('Start with sidebar collapsed', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Manage backups', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Backups', exact: true });
    await manager.getByRole('button', { name: 'Preview', exact: true }).click();
    await manager.getByText('Referenced by the active configuration', { exact: true }).waitFor();
    await manager.locator('summary').click();
    await manager.getByText('Skipped symbolic link: mmu/link', { exact: true }).waitFor();
    await manager.getByRole('button', { name: 'Select all', exact: true }).click();
    await manager.getByRole('button', { name: 'Delete selected (1)', exact: true }).click();
    await manager.getByRole('alertdialog', { name: 'Confirm deletion', exact: true }).waitFor();
    await manager.getByRole('button', { name: 'Cancel', exact: true }).click();
    await manager.getByRole('tab', { name: 'Patterns', exact: true }).click();
    await manager.getByRole('button', { name: 'Add pattern', exact: true }).waitFor();
    await manager.getByRole('button', { name: 'Close', exact: true }).last().click();
    for (const name of ['Widgets', 'Theme', 'MCP', 'Terminal']) {
      await page.getByRole('tab', { name, exact: true }).click();
      const text = await page.locator('.options-tab-panel').innerText();
      assert.ok(!/Iniciar|Administrar|Guardar|Configuración|Seleccionar|Agregar|Eliminar/.test(text), `${name}: ${text}`);
    }
    assert.deepEqual(errors, []);
    console.log('OK: all settings tabs and backup patterns, warnings, selection and confirmation are English; no printer commands');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
