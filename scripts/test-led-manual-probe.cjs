const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Error, URLSearchParams, ...globals, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}
function printer(objects = [], status = {}) {
  const scripts = [];
  const api = load('lib/moonraker.ts', { '@/lib/mmu-state': {}, '@/lib/mmu-telemetry': load('lib/mmu-telemetry.ts') }, { process: { env: {} }, fetch: async (url, init) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/gcode/script')) { scripts.push(JSON.parse(init.body).script); return Response.json({ result: 'ok' }); }
    return Response.json({ result: pathname.endsWith('/objects/list') ? { objects } : { status } });
  } });
  return { api, scripts };
}
test('LED colors stop only the selected chain when effects exist; vanilla LEDs need no extension', async () => {
  for (const effects of [false, true]) {
    const { api, scripts } = printer(effects ? ['led_effect breathing'] : []);
    await api.setAuxiliaryControl('neopixel sb_leds', 1, '#ff8000');
    assert.match(scripts[0], /SET_LED LED="sb_leds" RED=1/);
    assert.equal(scripts[0].includes('STOP_LED_EFFECTS LEDS="neopixel:sb_leds"'), effects);
    assert.equal(scripts[0].includes('status_bar'), false);
  }
  const { api, scripts } = printer(['gcode_macro STATUS_BAR_COLOR', 'led_effect dynamic']);
  await api.setAuxiliaryControl('neopixel status_bar', 1, '#ff8000');
  assert.equal(scripts[0], 'STATUS_BAR_COLOR COLOR=255,128,0');
});
test('manual probe state preserves unknown bounds and discovers Eddy/BLTouch', async () => {
  const { api } = printer([], { manual_probe: { is_active: true, z_position: 1.39, z_position_lower: null, z_position_upper: 2.39 },
    configfile: { settings: { 'probe_eddy_current btt_eddy': {}, bltouch: {} } }, toolhead: { homed_axes: 'xyz' }, webhooks: { state: 'ready' }, print_stats: { state: 'standby' } });
  const state = await api.getManualProbeState();
  assert.equal(state.active, true);
  assert.equal(state.lower, null);
  assert.equal(state.position, 1.39);
  assert.equal(state.options[0].command, 'PROBE_EDDY_CURRENT_CALIBRATE CHIP=btt_eddy');
  assert.ok(state.options.some((item) => item.command === 'PROBE_CALIBRATE'));
});
test('manual probe actions are whitelisted, checked against current state and never save or home', async () => {
  let state = { active: false, ready: true, printing: false, homed: true, options: [{ id: 'eddy', command: 'PROBE_EDDY_CURRENT_CALIBRATE CHIP=btt_eddy' }] };
  const scripts = [];
  const route = load('app/api/printer/manual-probe/route.ts', {
    '@/lib/moonraker': { getManualProbeState: async () => state, runGcodeScript: async (script) => scripts.push(script) },
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } }
  });
  const post = (body) => route.POST(new Request('http://localhost/', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await post({ action: 'start', id: 'eddy' })).status, 200);
  assert.equal((await post({ action: 'test', step: '1' })).status, 409);
  state.active = true;
  assert.equal((await post({ action: 'start', id: 'eddy' })).status, 409);
  assert.equal((await post({ action: 'test', step: '100' })).status, 400);
  for (const step of ['--', '-', '+', '++', '-0.005', '0.1']) assert.equal((await post({ action: 'test', step })).status, 200);
  for (const action of ['accept', 'abort']) assert.equal((await post({ action })).status, 200);
  state.printing = true;
  assert.equal((await post({ action: 'test', step: '1' })).status, 409);
  state.printing = false; state.active = false; state.homed = false;
  assert.equal((await post({ action: 'start', id: 'eddy' })).status, 409);
  assert.equal(scripts.some((script) => /G28|SAVE_CONFIG/.test(script)), false);
});
