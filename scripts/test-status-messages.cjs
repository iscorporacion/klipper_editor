const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/status-messages.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, { exports: exportsObject });

for (const locale of ['es', 'en']) test(`success notices expire but errors and ongoing operations remain (${locale})`, () => {
  const messages = JSON.parse(fs.readFileSync(path.join(__dirname, `../locales/${locale}.json`), 'utf8')).messages;
  const translate = (key) => messages[key] || key;
  const patterns = exportsObject.transientStatusPatterns(translate);
  const match = (value) => patterns.some((pattern) => pattern.test(value));
  const render = (key) => translate(key).replace(/\{\w+\}/g, 'mmu/base/test[1]+.cfg');
  for (const key of ['status.opened', 'status.saved', 'status.savedWithBackup', 'status.created', 'status.uploaded', 'status.renamed', 'status.gcodeSent']) {
    assert.equal(match(render(key)), true, key);
  }
  for (const key of ['status.opening', 'status.saving', 'status.uploading', 'status.runningCommand', 'status.firmwareRestarting', 'status.serverRestarting', 'status.saveConfigPending', 'errors.openFile', 'errors.restartPrinting']) {
    assert.equal(match(render(key)), false, key);
  }
  assert.equal(match('Moonraker request failed: 400'), false);
  assert.equal(match('gcode.CommandError: XYZ homing required'), false);
  assert.equal(match('Unknown warning'), false);
});
