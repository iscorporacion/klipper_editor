const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const locale = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/es.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const values = { 'ratos-viewer-locale': 'es', 'klipper-editor-hide-backup-files': 'false', 'klipper-editor-home-widgets': '[]' };
    const { defaultBackupRules } = await import('./backup-paths.mjs');
    let rules = defaultBackupRules, revision = 'default', moves = 0;
    await context.route('**/api/**', async (route) => {
      const request = route.request(), url = new URL(request.url());
      let data = {};
      if (url.pathname === '/api/preferences') {
        if (request.method() === 'PUT') Object.assign(values, request.postDataJSON().values);
        data = { id: 'backup-test', values };
      } else if (url.pathname === '/api/locales') data = url.searchParams.has('locale') ? { code: 'es', name: 'Español', messages: locale.messages } : { locales: [{ code: 'es', name: 'Español' }] };
      else if (url.pathname === '/api/backups') {
        const body = request.method() === 'GET' ? {} : request.postDataJSON();
        if (request.method() === 'PUT') { rules = body.rules; revision = 'saved'; data = { rules, revision }; }
        else if (body.action === 'preview') data = { revision, warnings: [], candidates: [
          { path: 'mmu.old-20261014-114726', destination: '.keditor-backups/organized/test/mmu.old-20261014-114726.bak', type: 'directory', files: 20, fingerprint: 'snapshot', blockedReason: '' },
          { path: 'printer.cfg', destination: '.keditor-backups/organized/test/printer.cfg.bak', type: 'file', files: 1, fingerprint: 'protected', blockedReason: 'Referenciado por la configuracion activa' }
        ] };
        else if (body.action === 'move') { assert.equal(body.items.length, 1); assert.equal(body.items[0].path, 'mmu.old-20261014-114726'); moves++; data = { moved: [{ path: body.items[0].path }], errors: [] }; }
        else data = { rules, revision, location: 'test-config/.keditor-backups/', rulesFile: '.keditor-backup-rules.json' };
      }
      else if (url.pathname === '/api/tree') data = { root: 'test-config', children: [
        { name: 'printer.cfg', path: 'printer.cfg', type: 'file', icon: 'settings' },
        { name: 'printer-20261014_103025.cfg', path: 'printer-20261014_103025.cfg', type: 'file', icon: 'backup-file', backup: true },
        { name: 'mmu.old-20261014-114726', path: 'mmu.old-20261014-114726', type: 'directory', backup: true, icon: 'folder-backup', children: [] },
        { name: '.keditor-backups', path: '.keditor-backups', type: 'directory', children: [{ name: 'printer.cfg-copy.bak', path: '.keditor-backups/printer.cfg-copy.bak', type: 'file' }] }
      ] };
      else if (url.pathname === '/api/file') data = { path: url.searchParams.get('path'), content: '# Backup test\n' };
      else if (url.pathname === '/api/macros') data = { macros: [] };
      else if (url.pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false };
      else if (url.pathname === '/api/printer/manual-probe') data = { active: false, ready: true, printing: false, homed: false, options: [] };
      await route.fulfill({ json: data });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error('Browser error:', error.message));
    await page.goto(process.env.TEST_URL || 'http://localhost:3024', { timeout: 120000 });
    const backup = page.locator('.tree-open-button[title="printer-20261014_103025.cfg"]');
    await backup.waitFor({ timeout: 60000 });
    assert.equal(await backup.locator('.backup-file-icon').count(), 1);
    assert.equal(await page.locator('.tree-open-button[title="printer.cfg"] .backup-file-icon').count(), 0);
    await backup.click();
    await page.waitForTimeout(700);
    assert.ok(await page.locator('.tabs .backup-file-icon').count() >= 1);
    await page.getByRole('button', { name: 'Ocultar backups', exact: true }).click();
    await backup.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.tree-row').filter({ hasText: '.keditor-backups' }).count(), 0);
    await page.getByRole('button', { name: 'Opciones', exact: true }).click();
    const help = page.locator('.setting-help').filter({ hasText: 'Las nuevas copias se guardan en .keditor-backups/' });
    await help.waitFor();
    assert.match(await help.innerText(), /con tu confirmación/);
    await page.screenshot({ path: `${process.env.TEMP}/keditor-backups-settings.png` });
    await page.getByRole('button', { name: 'Administrar copias', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Copias de seguridad', exact: true });
    await manager.getByRole('tab', { name: 'Patrones', exact: true }).click();
    await manager.locator('input[value="mmu.old-*"]').waitFor();
    assert.equal(moves, 0);
    await manager.getByRole('button', { name: 'Agregar patrón', exact: true }).click();
    await manager.getByRole('textbox', { name: 'Patrón', exact: true }).last().fill('custom-*.cfg');
    assert.equal(await manager.getByRole('button', { name: 'Guardar patrones', exact: true }).isEnabled(), true);
    await manager.getByRole('button', { name: 'Guardar patrones', exact: true }).click();
    await manager.getByText('Patrones guardados', { exact: true }).waitFor();
    assert.equal(rules.at(-1).pattern, 'custom-*.cfg');
    await manager.getByRole('tab', { name: 'Organizar copias', exact: true }).click();
    await manager.getByRole('button', { name: 'Vista previa', exact: true }).click();
    const folder = manager.getByRole('checkbox', { name: 'Trasladar mmu.old-20261014-114726', exact: true });
    await folder.waitFor();
    assert.equal(await manager.getByRole('checkbox', { name: 'Trasladar printer.cfg', exact: true }).isEnabled(), false);
    await folder.check();
    await page.screenshot({ path: `${process.env.TEMP}/keditor-backup-migration-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${process.env.TEMP}/keditor-backup-migration-mobile.png` });
    const bounds = await manager.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    await manager.getByRole('button', { name: 'Trasladar seleccionadas (1)', exact: true }).click();
    assert.equal(moves, 0);
    await manager.getByRole('button', { name: 'Confirmar traslado', exact: true }).click();
    await manager.getByText('1 copia trasladada', { exact: true }).waitFor();
    assert.equal(moves, 1);
    console.log('OK: backup icons in tree and tabs, hide-backups behavior, and location notice in settings; all API calls mocked');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
