import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import * as helpers from "./backup-paths.mjs";
import { createConfigBackup } from "./config-backups.mjs";
const require = createRequire(import.meta.url);
async function load(file, dependencies) {
  const exports = {};
  const source = await fs.readFile(new URL(`../${file}`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
    { exports, Error, process, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "keditor-migration-test-"));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  const workspace = {
    WORKSPACE_ROOT: root,
    isBlockedPath: (file) => file.split('/').some((part) => ['.git', 'node_modules', '.next', 'ratos-file-viewer'].includes(part)),
    toRelativePath: (file) => file.replace(/\\/g, '/'),
    sortByDirectoryThenName: (items) => items,
    resolveWorkspacePath: (file = '') => {
      const absolute = path.resolve(root, file);
      if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error('Outside workspace');
      return absolute;
    }
  };
  const dependencies = { '@/lib/workspace': workspace, '@/scripts/backup-paths.mjs': helpers, '@/scripts/config-backups.mjs': { createConfigBackup } };
  const rules = await load('lib/backup-rules.ts', dependencies);
  dependencies['@/lib/backup-rules'] = rules;
  const migration = await load('lib/backup-migration.ts', dependencies);
  dependencies['@/lib/backup-migration'] = migration;
  dependencies['next/server'] = { NextResponse: { json: (body, options) => Response.json(body, options) } };
  const write = async (file, text) => { const target = workspace.resolveWorkspacePath(file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, text); };
  await write('printer.cfg', '[include mmu/base/*.cfg]\n[save_variables]\nfilename: mmu/mmu_vars.cfg\n');
  await write('mmu/base/mmu.cfg', '# active\n');
  await write('mmu/base/mmu-20261014_103025.cfg', '# old file\n');
  await write('mmu/mmu_vars.cfg', 'mmu_revision = 0\n');
  await write('mmu.old-20261014-114726/base/mmu.cfg', '# old folder\n');
  return { root, rules, migration, dependencies, write };
}

test('glob rules support files, folders, nested paths, disabling and HH archives', () => {
  assert.equal(helpers.isBackupPath('mmu.old-20261014-114726', 'directory'), true);
  assert.equal(helpers.isBackupPath('mmu.old-20261014-114726/base/mmu.cfg'), true);
  assert.equal(helpers.isBackupPath('mmu/base/mmu.cfg'), false);
  assert.equal(helpers.matchesBackupGlob('mmu/base/old.cfg', 'mmu/**/old.cfg'), true);
  assert.equal(helpers.matchesBackupGlob('mmu/base/old.cfg', '*.cfg', false), false);
  const custom = [{ pattern: 'archive-*', kind: 'both', enabled: false }];
  assert.equal(helpers.isBackupPath('archive-a', 'directory', custom), false);
  custom[0].enabled = true;
  assert.equal(helpers.isBackupPath('archive-a/main.cfg', 'file', custom), true);
});
test('rules persist separately, reject unsafe syntax and stale writes', async (t) => {
  const { rules, root } = await setup(t);
  const first = await rules.readBackupRules();
  const saved = await rules.saveBackupRules([...first.rules, { id: 'extra', pattern: 'custom-*.cfg', kind: 'file', enabled: true }], first.revision);
  assert.notEqual(saved.revision, 'default');
  assert.ok((await fs.readFile(path.join(root, helpers.BACKUP_RULES_FILE), 'utf8')).includes('custom-*.cfg'));
  await assert.rejects(rules.saveBackupRules(first.rules, first.revision), /cambiaron/);
  assert.throws(() => rules.validateBackupRules([{ id: 'bad', pattern: '../*', kind: 'both', enabled: true }]));
  assert.throws(() => rules.validateBackupRules([{ id: 'bad', pattern: '*', kind: 'both', enabled: true }]));
});
test('preview is read-only and migration moves only explicitly selected snapshots', async (t) => {
  const { migration, root } = await setup(t);
  const plan = await migration.previewBackupMigration();
  assert.equal(plan.candidates.length, 2);
  const folder = plan.candidates.find((item) => item.type === 'directory');
  assert.equal(folder.files, 1);
  await assert.rejects(fs.access(path.join(root, helpers.BACKUP_DIRECTORY)));
  const result = await migration.migrateBackups([{ path: folder.path, fingerprint: folder.fingerprint }], plan.revision);
  assert.equal(result.moved.length, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(await fs.readFile(path.join(root, folder.destination, 'base/mmu.cfg'), 'utf8'), '# old folder\n');
  assert.equal(await fs.readFile(path.join(root, 'mmu/base/mmu-20261014_103025.cfg'), 'utf8'), '# old file\n');
  await assert.rejects(fs.access(path.join(root, folder.path)));
  const next = await migration.previewBackupMigration();
  const file = next.candidates.find((item) => item.type === 'file');
  const movedFile = await migration.migrateBackups([{ path: file.path, fingerprint: file.fingerprint }], next.revision);
  assert.equal(movedFile.moved.length, 1);
  assert.equal(await fs.readFile(path.join(root, file.destination), 'utf8'), '# old file\n');
  await assert.rejects(fs.access(path.join(root, file.path)));
});
test('direct includes, active wildcard configs and saved variables are protected even with broad custom rules', async (t) => {
  const { rules, migration, write } = await setup(t);
  const document = await rules.readBackupRules();
  await rules.saveBackupRules([...document.rules, { id: 'all-cfg', pattern: '*.cfg', kind: 'file', enabled: true }], document.revision);
  let plan = await migration.previewBackupMigration();
  for (const file of ['printer.cfg', 'mmu/base/mmu.cfg', 'mmu/mmu_vars.cfg']) assert.ok(plan.candidates.find((item) => item.path === file).blockedReason, file);
  const old = plan.candidates.find((item) => item.path.endsWith('mmu-20261014_103025.cfg'));
  assert.equal(old.blockedReason, '');
  await write('printer.cfg', '[include mmu.old-20261014-114726/base/mmu.cfg]\n');
  plan = await migration.previewBackupMigration();
  const folder = plan.candidates.find((item) => item.type === 'directory');
  assert.ok(folder.blockedReason);
  await assert.rejects(migration.migrateBackups([{ path: folder.path, fingerprint: folder.fingerprint }], plan.revision), /protegido/);
});
test('stale snapshots, changed rules and existing destinations never move or overwrite source files', async (t) => {
  const { migration, rules, write, root } = await setup(t);
  let plan = await migration.previewBackupMigration();
  const old = plan.candidates.find((item) => item.type === 'file');
  await write(old.path, '# changed backup\n');
  await assert.rejects(migration.migrateBackups([{ path: old.path, fingerprint: old.fingerprint }], plan.revision), /cambio|protegido/);
  plan = await migration.previewBackupMigration();
  const folder = plan.candidates.find((item) => item.type === 'directory');
  await write(folder.destination, 'occupied');
  await assert.rejects(migration.migrateBackups([{ path: folder.path, fingerprint: folder.fingerprint }], plan.revision), /protegido/);
  assert.equal(await fs.readFile(path.join(root, folder.destination), 'utf8'), 'occupied');
  const document = await rules.readBackupRules();
  await rules.saveBackupRules(document.rules, document.revision);
  await assert.rejects(migration.migrateBackups([{ path: old.path, fingerprint: old.fingerprint }], plan.revision), /reglas cambiaron/);
});
test('API never migrates during active/paused prints or while Klipper is disconnected', async (t) => {
  const { dependencies } = await setup(t);
  let status = { printing: true, webhooksState: 'ready' }, moves = 0;
  dependencies['@/lib/moonraker'] = { getMoonrakerStatus: async () => status };
  dependencies['@/lib/backup-migration'] = { migrateBackups: async () => { moves++; return { moved: [], errors: [] }; }, previewBackupMigration: async () => ({ candidates: [] }) };
  const route = await load('app/api/backups/route.ts', dependencies);
  const post = () => route.POST(new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ action: 'move' }) }));
  assert.equal((await post()).status, 409);
  status = { printing: false, webhooksState: 'shutdown' };
  assert.equal((await post()).status, 409);
  assert.equal(moves, 0);
});

test('folder symlinks are blocked; malformed rules do not destroy the file or prevent tree repair', async (t) => {
  const { migration, rules, dependencies, root, write } = await setup(t);
  await fs.symlink(path.join(root, 'mmu'), path.join(root, 'mmu.old-20261014-114726', 'link'), 'junction');
  const plan = await migration.previewBackupMigration();
  assert.match(plan.candidates.find((item) => item.type === 'directory').blockedReason, /enlaces/);
  await write(helpers.BACKUP_RULES_FILE, '{bad JSON');
  await assert.rejects(rules.readBackupRules(), /Se conserva/);
  await assert.rejects(migration.previewBackupMigration(), /Se conserva/);
  const tree = await load('app/api/tree/route.ts', dependencies);
  const response = await tree.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.backupRulesError);
  assert.ok(body.children.some((item) => item.path === helpers.BACKUP_RULES_FILE));
  assert.equal(await fs.readFile(path.join(root, helpers.BACKUP_RULES_FILE), 'utf8'), '{bad JSON');
});

test('saved rules drive tree icons/hiding and search, including complete HH folders', async (t) => {
  const { rules, dependencies, write } = await setup(t);
  const document = await rules.readBackupRules();
  await rules.saveBackupRules([...document.rules.map((rule) => rule.id === 'bak' ? { ...rule, enabled: false } : rule), { id: 'custom', pattern: 'custom-*.cfg', kind: 'file', enabled: true }], document.revision);
  await write('custom-archive.cfg', 'needle-test\n');
  await write('normal.cfg', 'needle-test\n');
  await write('ordinary.bak', 'needle-test\n');
  const tree = await load('app/api/tree/route.ts', dependencies);
  const body = await (await tree.GET()).json();
  assert.equal(body.children.find((item) => item.path === 'mmu.old-20261014-114726').backup, true);
  assert.equal(body.children.find((item) => item.path === 'custom-archive.cfg').icon, 'backup-file');
  assert.equal(body.children.find((item) => item.path === 'ordinary.bak').backup, false);
  const search = await load('app/api/search/route.ts', dependencies);
  const found = await (await search.GET({ nextUrl: new URL('http://localhost/?q=needle-test') })).json();
  assert.deepEqual(found.results.map((item) => item.path), ['normal.cfg']);
});
