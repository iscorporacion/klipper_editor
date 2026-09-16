const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('persistent preferences, migration, concurrent favorites, backup and corruption', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'keditor-preferences-'));
  const source = await fs.readFile(path.join(__dirname, '../lib/preferences-store.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  function load() {
    const exports = {};
    vm.runInNewContext(output, { exports, require: name => name === '@/lib/workspace' ? { WORKSPACE_ROOT: root } : require(name), globalThis: {} });
    return exports;
  }
  const store = load();
  const key = 'klipper-editor-macro-favorites';
  const filename = path.join(root, '.klipper-editor-preferences.json');
  try {
    const initial = await store.getPreferences();
    await store.updatePreferences({ [key]: '["A"]', 'ratos-viewer-locale': 'es' }, {}, true);
    await store.updatePreferences({ [key]: '["B"]', 'ratos-viewer-locale': 'en' }, {}, true);
    assert.equal((await store.getPreferences()).values['ratos-viewer-locale'], 'es');
    const before = '["A","B"]';
    await Promise.all([
      store.updatePreferences({ [key]: '["A","B","C"]' }, { [key]: before }),
      store.updatePreferences({ [key]: '["A","B","D"]' }, { [key]: before })
    ]);
    assert.deepEqual(JSON.parse((await store.getPreferences()).values[key]), ['A', 'B', 'C', 'D']);
    await store.updatePreferences({ [key]: '["A"]' }, { [key]: before });
    await store.updatePreferences({ [key]: '["A","B","E"]' }, { [key]: before });
    assert.deepEqual(JSON.parse((await store.getPreferences()).values[key]), ['A', 'C', 'D', 'E']);
    assert.equal((await load().getPreferences()).id, initial.id);
    const many = Array.from({ length: 150 }, (_, i) => `MACRO_${i}`);
    await store.updatePreferences({ [key]: JSON.stringify(many) }, { [key]: '["A","C","D","E"]' });
    assert.equal(JSON.parse((await store.getPreferences()).values[key]).length, 150);
    assert.ok((await fs.readFile(filename + '.bak', 'utf8')).includes('values'));
    await fs.writeFile(filename, '{broken');
    await assert.rejects(store.updatePreferences({ 'ratos-viewer-locale': 'en' }));
    assert.equal(await fs.readFile(filename, 'utf8'), '{broken');
    console.log('Temporary test directory:', root);
  } finally {
    // Only files created by this test are removed, never the actual workspace.
    for (const name of ['.klipper-editor-preferences.json', '.klipper-editor-preferences.json.bak'])
      await fs.unlink(path.join(root, name)).catch(() => {});
    await fs.rmdir(root);
  }
});
