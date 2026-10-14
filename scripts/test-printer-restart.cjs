const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(filename, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(output, { exports, Error, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}
const policy = load('lib/printer-restart.ts');

test('printer motors-off sends M84 and rejects active or paused jobs', async () => {
  let status = { printing: false, printState: 'standby' };
  const sent = [];
  const route = load('app/api/printer/quick-command/route.ts', {
    '@/lib/moonraker': {
      getMoonrakerStatus: async () => status,
      runGcodeScript: async (script) => { sent.push(script); return 'ok'; }
    },
    'next/server': { NextResponse: { json: (value, options) => new Response(JSON.stringify(value), options) } }
  });
  const post = (command) => route.POST(new Request('http://localhost/api/printer/quick-command', { method: 'POST', body: JSON.stringify({ command }) }));
  assert.equal((await post('motors-off')).status, 200);
  assert.deepEqual(sent, ['M84']);
  for (const printState of ['printing', 'paused']) {
    status = { printing: true, printState };
    assert.equal((await post('motors-off')).status, 409);
  }
  assert.equal(sent.length, 1);
});

test('only confirmed shutdown bypasses a stale printing flag', () => {
  assert.equal(policy.isRestartBlockedByPrint({ printing: true, webhooksState: 'shutdown' }), false);
  assert.equal(policy.isRestartBlockedByPrint({ printing: true, webhooksState: ' SHUTDOWN ' }), false);
  for (const webhooksState of ['ready', 'unknown', 'startup', 'error']) {
    assert.equal(policy.isRestartBlockedByPrint({ printing: true, webhooksState }), true);
  }
  assert.equal(policy.isRestartBlockedByPrint({ printing: false, webhooksState: 'ready' }), false);
});

for (const endpoint of ['firmware-restart', 'restart']) {
  test(`${endpoint}: active/paused print remains protected; shutdown can restart`, async () => {
    let status;
    let calls = 0;
    const route = load(`app/api/printer/${endpoint}/route.ts`, {
      '@/lib/printer-restart': policy,
      '@/lib/moonraker': {
        getMoonrakerStatus: async () => status,
        firmwareRestart: async () => { calls++; return 'ok'; },
        klipperRestart: async () => { calls++; return 'ok'; }
      },
      'next/server': { NextResponse: { json: (value, options) => new Response(JSON.stringify(value), options) } }
    });
    for (const printState of ['printing', 'paused']) {
      status = { webhooksState: 'ready', printing: true, printState };
      assert.equal((await route.POST()).status, 409);
    }
    status = { webhooksState: 'unknown', printing: true };
    assert.equal((await route.POST()).status, 409);
    assert.equal(calls, 0);
    status = { webhooksState: 'shutdown', printing: true, printState: 'printing' };
    assert.equal((await route.POST()).status, 200);
    assert.equal(calls, 1);
    status = { webhooksState: 'ready', printing: false, printState: 'standby' };
    assert.equal((await route.POST()).status, 200);
    assert.equal(calls, 2);
  });
}
