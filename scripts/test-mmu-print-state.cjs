const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(filename, dependencies = {}, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(output, { exports, Error, URLSearchParams, ...globals, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}
const policy = load('lib/mmu-state.ts');

test('manual tool selection is not a print, while actual and paused jobs remain protected', () => {
  const manual = { tool: 0, gate: 0, print_state: 'ready', is_in_print: false };
  assert.equal(policy.isMmuPrintActive('standby', manual), false);
  assert.equal(policy.isMmuPrintActive(undefined, manual), false);
  assert.equal(policy.isMmuPrintActive('printing', manual), true);
  assert.equal(policy.isMmuPrintActive('paused', manual), true);
  assert.equal(policy.isMmuPrintActive('standby', { ...manual, is_in_print: true }), true);
  assert.equal(policy.isMmuPrintActive(undefined, { ...manual, print_state: 'started' }), true);
});

test('MMU API permits bypass after manual T0 even while idle_timeout reports Printing', async () => {
  const raw = { print_stats: { state: 'standby' }, idle_timeout: { state: 'Printing' }, mmu: {
    enabled: true, num_gates: 5, has_bypass: true, gate: 0, tool: 0, print_state: 'ready', is_in_print: false
  } };
  const moonraker = load('lib/moonraker.ts', { '@/lib/mmu-state': policy }, {
    process: { env: {} }, fetch: async (url) => Response.json(new URL(url).pathname.endsWith('/objects/list')
      ? { result: { objects: ['mmu', 'print_stats', 'idle_timeout'] } } : { result: { status: raw } })
  });
  assert.equal((await moonraker.getMmuStatus()).printing, false);
  const commands = [];
  const route = load('app/api/printer/mmu/route.ts', {
    '@/lib/moonraker': { getMmuStatus: moonraker.getMmuStatus, runGcodeScript: async (script) => { commands.push(script); return 'ok'; } },
    'next/server': { NextResponse: { json: (value, options) => new Response(JSON.stringify(value), options) } }
  });
  const bypass = () => route.POST(new Request('http://localhost/api/printer/mmu', { method: 'POST', body: JSON.stringify({ action: 'bypass' }) }));
  assert.equal((await bypass()).status, 200);
  assert.deepEqual(commands, ['MMU_SELECT BYPASS=1']);
  for (const state of ['printing', 'paused']) {
    raw.print_stats.state = state;
    assert.equal((await bypass()).status, 409);
  }
  raw.print_stats.state = 'standby';
  raw.mmu.is_in_print = true;
  assert.equal((await bypass()).status, 409);
  assert.equal(commands.length, 1);
});
