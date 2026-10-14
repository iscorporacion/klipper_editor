const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/client-id.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;
function load(crypto) {
  const context = { exports: {}, crypto };
  vm.runInNewContext(code, context);
  return context.exports.createClientId;
}
test('uses native UUID when available', () => {
  assert.equal(load({ randomUUID: () => 'native-id' })(), 'native-id');
});
test('HTTP fallback produces unique version 4 UUIDs without randomUUID', () => {
  const create = load({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
  const ids = Array.from({ length: 1000 }, create);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
