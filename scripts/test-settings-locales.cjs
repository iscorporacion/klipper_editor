const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const es = require('../locales/es.json');
const en = require('../locales/en.json');
test('all settings and backup keys exist in both languages with matching parameters', () => {
  for (const key of Object.keys(es.messages).filter((key) => /^(options|backups|homeGrid|mcp|pty)\./.test(key))) {
    assert.ok(en.messages[key], key);
    assert.equal(JSON.stringify((es.messages[key].match(/\{\w+\}/g) || []).sort()), JSON.stringify((en.messages[key].match(/\{\w+\}/g) || []).sort()), key);
  }
});
test('backup diagnostics translate without altering paths or unknown errors', () => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/backup-messages.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(code, { exports, require: () => es });
  const t = (key, values = {}) => en.messages[key].replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
  assert.equal(exports.translateBackupMessage('Referenciado por la configuracion activa', t), 'Referenced by the active configuration');
  assert.equal(exports.translateBackupMessage('Enlace omitido: mmu/base/printer.cfg', t), 'Skipped symbolic link: mmu/base/printer.cfg');
  assert.equal(exports.translateBackupMessage('EACCES: /some/path', t), 'EACCES: /some/path');
});
