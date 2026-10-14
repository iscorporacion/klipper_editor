const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, api) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(output, { exports, Error, require: (name) => name === '@/lib/moonraker' ? api : {
    NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) }
  } });
  return exports;
}
const request = (body) => new Request('http://localhost/', { method: 'POST', body: JSON.stringify(body) });
test('toolbar cooling is blocked during printing and paused; panel remains independent', async () => {
  let printing = true;
  let calls = 0;
  const route = load('app/api/printer/heaters/route.ts', {
    getMoonrakerStatus: async () => ({ printing }),
    getHeaters: async () => [],
    setHeaterTarget: async () => { calls++; }
  });
  for (let i = 0; i < 2; i++) {
    assert.equal((await route.POST(request({ source: 'toolbar-cool', targets: { heater_bed: 0 } }))).status, 409);
  }
  assert.equal(calls, 0);
  assert.equal((await route.POST(request({ targets: { heater_bed: 0 } }))).status, 200);
  printing = false;
  assert.equal((await route.POST(request({ source: 'toolbar-cool', targets: { heater_bed: 0 } }))).status, 200);
  assert.equal(calls, 2);
});
test('service detection fails closed and restart endpoint accepts only the two services', async () => {
  let available = true;
  const calls = [];
  const route = load('app/api/printer/services/route.ts', {
    getKlipperScreenService: async () => { if (!available) throw new Error('offline'); return 'KlipperScreen'; },
    restartPrinterService: async (service) => calls.push(service)
  });
  assert.equal((await (await route.GET()).json()).klipperscreen, true);
  available = false;
  assert.equal((await (await route.GET()).json()).klipperscreen, false);
  for (const service of ['moonraker', 'klipperscreen']) assert.equal((await route.POST(request({ service }))).status, 200);
  assert.equal((await route.POST(request({ service: 'klipper' }))).status, 400);
  assert.deepEqual(calls, ['moonraker', 'klipperscreen']);
});
