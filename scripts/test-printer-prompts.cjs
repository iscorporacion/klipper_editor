const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Error, require: (name) => dependencies[name] || require(name) });
  return exports;
}
const prompts = load('lib/printer-prompts.ts');
const entry = (message, time = 1, type = 'response') => ({ message, time, type });
const entries = [entry('// action:prompt_begin MMU issue'), entry('action:prompt_text Gate 2 is empty'), entry('action:prompt_footer_button Unlock|MMU_UNLOCK|primary'), entry('action:prompt_footer_button Cancel print|CANCEL_PRINT|error'), entry('action:prompt_show')];
test('parses streamed prompt text, groups and footer buttons; no command echoes or completed prompts', () => {
  const prompt = prompts.readPrinterPrompt(entries);
  assert.equal(prompt.title, 'MMU issue');
  assert.equal(prompt.text[0], 'Gate 2 is empty');
  assert.equal(prompt.buttons[0].command, 'MMU_UNLOCK');
  assert.equal(prompts.promptCancelsPrint(prompt.buttons[1]), true);
  assert.equal(prompts.promptCancelsPrint({ label: 'Cancel', command: 'RESPOND TYPE=command MSG=action:prompt_end' }), false);
  assert.equal(prompts.readPrinterPrompt(entries.slice(0, -1)), null);
  assert.equal(prompts.readPrinterPrompt([...entries, entry('action:prompt_end', 2)]), null);
  assert.equal(prompts.readPrinterPrompt([entry('action:prompt_begin fake', 1, 'command'), entry('action:prompt_show')]), null);
  const grouped = prompts.readPrinterPrompt([entry('action:prompt_begin "Quoted"\naction:prompt_button_group_start\naction:prompt_button One|TEST X=1\naction:prompt_button Two|TEST X=2\naction:prompt_button_group_end\naction:prompt_show')]);
  assert.equal(grouped.title, '"Quoted"');
  assert.equal(grouped.buttons[0].group, grouped.buttons[1].group);
});
test('purge tray homing errors become actionable printer alerts', () => {
  const prompt = prompts.readPrinterPrompt([entry('!! MMU issue: Unload sequence failed because:\nError evaluating PURGE_TRAY_MOVE: Purge tray is not homed', 7)]);
  assert.equal(prompt.kind, 'purgeTrayNotHomed');
  assert.equal(prompt.buttons[0].command, 'PURGE_TRAY_HOME');
  assert.equal(prompt.buttons[0].style, 'primary');
});
test('server executes only a current received button after explicit click; cancellation and resume are guarded', async () => {
  let current = entries;
  let ready = true;
  let recovery = false;
  const sent = [];
  const api = load('app/api/printer/prompts/route.ts', {
    '@/lib/printer-prompts': prompts,
    '@/lib/moonraker': { getGcodeStore: async () => current, getMoonrakerStatus: async () => ({ webhooksState: ready ? 'ready' : 'shutdown' }), assertTrayRecoveryComplete: async () => { if (recovery) throw new Error('Purge pending'); }, runGcodeScript: async (command) => sent.push(command) },
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } }
  });
  const prompt = (await (await api.GET()).json()).prompt;
  const post = (button, extra = {}) => api.POST(new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ id: prompt.id, ...button, ...extra }) }));
  assert.equal(sent.length, 0);
  assert.equal((await post({ label: 'Injected', command: 'G28' })).status, 409);
  assert.equal((await post(prompt.buttons[1])).status, 409);
  assert.equal((await post(prompt.buttons[0])).status, 200);
  assert.equal((await post(prompt.buttons[1], { confirmCancel: true })).status, 200);
  ready = false;
  assert.equal((await post(prompt.buttons[0])).status, 409);
  ready = true;
  current = [...entries, entry('action:prompt_end', 2)];
  assert.equal((await post(prompt.buttons[0])).status, 409);
  current = [...entries.slice(0, -1), entry('action:prompt_footer_button Resume|RESUME|primary'), entry('action:prompt_show')];
  recovery = true;
  assert.equal((await post({ label: 'Resume', command: 'RESUME' })).status, 502);
  assert.deepEqual(sent, ['MMU_UNLOCK', 'CANCEL_PRINT']);
});
test('tray recovery button executes only the detected safe command and acknowledges the alert', async () => {
  const current = [entry('!! MMU issue: Unload failed\nPurge tray is not homed', 9)];
  const sent = [];
  const api = load('app/api/printer/prompts/route.ts', {
    '@/lib/printer-prompts': prompts,
    '@/lib/moonraker': { getGcodeStore: async () => current, getMoonrakerStatus: async () => ({ webhooksState: 'ready' }), assertTrayRecoveryComplete: async () => {}, runGcodeScript: async (command) => sent.push(command) },
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } }
  });
  const prompt = (await (await api.GET()).json()).prompt;
  const response = await api.POST(new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ id: prompt.id, label: prompt.buttons[0].label, command: prompt.buttons[0].command }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(sent, ['PURGE_TRAY_HOME']);
  assert.equal((await (await api.GET()).json()).prompt, null);
});
