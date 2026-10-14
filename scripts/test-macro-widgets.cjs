const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(filename) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(output, { exports, require, process, Map, Set, Object });
  return exports;
}
const widgets = load('lib/macro-widgets.ts');

test('command validation preserves parameters and rejects multiple lines', () => {
  const command = 'MY_MACRO TEMP=220 LABEL="Purge tray"';
  assert.equal(widgets.parseMacroCommand(command).script, command);
  assert.equal(widgets.parseMacroCommand('my_macro X=2.5').name, 'MY_MACRO');
  for (const value of ['', 'G28;MY_MACRO', 'MY_MACRO\nRESUME', 'MY_MACRO\0', null]) {
    assert.throws(() => widgets.parseMacroCommand(value));
  }
});

test('sizes and persisted data retain the horizontal 1x4 and independent widgets', () => {
  assert.equal(JSON.stringify(widgets.buttonSizes['1x4']), '[4,1]');
  assert.equal(Object.hasOwn(widgets.buttonSizes, '1x2'), false);
  const button = { id: 'button-a', name: 'Heat', description: 'Bed heating', command: 'HEAT BED=80', size: '2x2', color: '#aabbcc', icon: { collection: 'md', name: 'MdSettings' } };
  const data = [{ id: 'custom-macros:a', title: 'Heating', buttons: [button, button] }, { id: 'custom-macros:b', title: 'Tools', buttons: [{ ...button, size: 'bad', color: 'bad' }] }];
  const normalized = widgets.normalizeMacroWidgets(JSON.parse(JSON.stringify(data)));
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].buttons.length, 1);
  assert.equal(normalized[0].buttons[0].command, button.command);
  assert.equal(normalized[0].buttons[0].alignment, 'center');
  assert.equal(normalized[1].buttons[0].size, '1x1');
  assert.equal(normalized[1].buttons[0].color, '#4da3ff');
  const aligned = widgets.normalizeMacroWidgets([{ ...data[0], buttons: [{ ...button, alignment: 'right' }] }]);
  assert.equal(aligned[0].buttons[0].alignment, 'right');
  for (const size of ['2x1', '2x2', '1x4', '1x1', '1x2']) {
    for (const showTitle of [false, true]) {
      const item = widgets.normalizeMacroWidgets([{ ...data[0], buttons: [{ ...button, size, showTitle }] }])[0].buttons[0];
      assert.equal(item.showTitle, size === '1x1' || size === '1x2' ? false : showTitle);
      if (size === '1x2') { assert.equal(item.size, '1x1'); assert.equal(item.command, button.command); }
    }
  }
  assert.equal(widgets.normalizeMacroWidgets([null, {}, { id: '../escape' }]).length, 0);
});

test('all installed collections expose serializable native icon geometry', () => {
  const catalog = load('lib/icon-catalog.ts');
  assert.ok(catalog.iconCollections.length > 20);
  for (const collection of catalog.iconCollections) {
    const pack = catalog.getIconPack(collection.id);
    const names = Object.keys(pack);
    for (const name of [names[0], names.at(-1)]) {
      const icon = catalog.catalogIcon(collection.id, name);
      assert.ok(icon.attr.viewBox, `${collection.id}/${name}`);
      assert.ok(icon.children.length, `${collection.id}/${name}`);
      assert.ok(JSON.stringify(icon).length > 80);
    }
  }
  assert.throws(() => catalog.getIconPack('../package.json'));
  assert.throws(() => catalog.catalogIcon('md', 'constructor'));
});

test('custom widget preferences are accepted by both preference registries', () => {
  for (const filename of ['lib/preferences-store.ts', 'lib/preferences-client.ts']) {
    assert.ok(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8').includes('"' + widgets.macroWidgetsKey + '"'));
  }
});

test('API validates against current Klipper macros before every execution', async () => {
  const exports = {};
  let registered = ['MY_MACRO', 'RESUME'];
  let pendingRecovery = false;
  const sent = [];
  const source = fs.readFileSync(path.join(__dirname, '../app/api/printer/macro-buttons/route.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(output, { exports, Error, require: (name) => {
    if (name === '@/lib/macro-widgets') return widgets;
    if (name === 'next/server') return { NextResponse: { json: (value, options) => new Response(JSON.stringify(value), options) } };
    if (name === '@/lib/moonraker') return {
      getMacroButtonCommands: async () => registered,
      runGcodeScript: async (script) => { sent.push(script); return 'ok'; },
      assertTrayRecoveryComplete: async () => { if (pendingRecovery) throw new Error('Purge pending'); }
    };
    throw new Error(name);
  } });
  const post = (body) => exports.POST(new Request('http://localhost/api/printer/macro-buttons', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await post({ command: 'MY_MACRO VALUE=2.5', validateOnly: true })).status, 200);
  assert.equal(sent.length, 0);
  assert.equal((await post({ command: 'MY_MACRO VALUE=2.5' })).status, 200);
  assert.deepEqual(sent, ['MY_MACRO VALUE=2.5']);
  registered = ['RESUME'];
  assert.equal((await post({ command: 'MY_MACRO' })).status, 409);
  assert.equal((await post({ command: 'RESUME\nMY_MACRO' })).status, 400);
  pendingRecovery = true;
  assert.equal((await post({ command: 'RESUME' })).status, 502);
  assert.equal(sent.length, 1);
  registered = ['PROBE_EDDY_CURRENT_CALIBRATE'];
  const eddy = 'PROBE_EDDY_CURRENT_CALIBRATE CHIP=btt_eddy';
  assert.equal((await post({ command: eddy, validateOnly: true })).status, 200);
  assert.equal(sent.length, 1);
  assert.equal((await post({ command: eddy })).status, 200);
  assert.equal(sent.at(-1), eddy);
});
