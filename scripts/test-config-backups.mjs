import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { BACKUP_DIRECTORY, backupRelativePath, isBackupFilePath } from "./backup-paths.mjs";
import { createConfigBackup } from "./config-backups.mjs";

const require = createRequire(import.meta.url);
async function load(file, dependencies) {
  const exports = {};
  const source = await fs.readFile(new URL(`../${file}`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
    { exports, Error, process, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "keditor-backups-test-"));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}
test("all known backup formats share detection, ordinary configs do not", () => {
  for (const file of ["a.cfg.bak", "a.cfg.bak.20261014", "a.cfg.old", "a.cfg.orig", "a.cfg.bkp20261014", "printer-20261014_103025.cfg", "printer-20261014T103025Z.cfg", "printer.cfg.mcp-backup-20261014-103025", "a.cfg~", `${BACKUP_DIRECTORY}/mmu/base/a.cfg`]) assert.equal(isBackupFilePath(file), true, file);
  for (const file of ["printer.cfg", "mmu/base/mmu_parameters.cfg", "backup_notes.cfg", "mmu/macros/mmu.cfg"]) assert.equal(isBackupFilePath(file), false, file);
  for (const file of ["../printer.cfg", "/printer.cfg", "mmu/../../printer.cfg", "C:\\printer.cfg"]) assert.throws(() => backupRelativePath(file, "id"));
});
test("backups preserve contents, stay out of HH includes and cannot collide", async (t) => {
  const root = await fixture(t);
  const source = path.join(root, "mmu", "base", "mmu_parameters.cfg");
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, "original\n");
  const copies = await Promise.all(Array.from({ length: 6 }, () => createConfigBackup(root, source)));
  assert.equal(new Set(copies).size, copies.length);
  for (const backup of copies) {
    assert.ok(backup.startsWith(`${BACKUP_DIRECTORY}/mmu/base/`));
    assert.ok(backup.endsWith(".bak"));
    assert.equal(await fs.readFile(path.join(root, backup), "utf8"), "original\n");
  }
  assert.deepEqual(await fs.readdir(path.dirname(source)), ["mmu_parameters.cfg"]);
});
test("save without backup is unchanged; a failed backup never overwrites the original", async (t) => {
  const root = await fixture(t);
  const source = path.join(root, "printer.cfg");
  await fs.writeFile(source, "before");
  const route = await load("app/api/file/route.ts", {
    "@/scripts/config-backups.mjs": { createConfigBackup },
    "@/lib/workspace": { isBlockedPath: () => false, toRelativePath: (value) => value, resolveWorkspacePath: (value = "") => path.join(root, value) },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } }
  });
  const save = (content, createBackup) => route.PUT(new Request("http://localhost/", { method: "PUT", body: JSON.stringify({ path: "printer.cfg", content, createBackup }) }));
  assert.equal((await save("first", false)).status, 200);
  assert.deepEqual(await fs.readdir(root), ["printer.cfg"]);
  const saved = await save("second", true);
  assert.equal(saved.status, 200);
  const backup = (await saved.json()).backupPath;
  assert.equal(await fs.readFile(path.join(root, backup), "utf8"), "first");
  const safeRoot = await fs.mkdtemp(path.join(root, "blocked-"));
  await fs.writeFile(path.join(safeRoot, "printer.cfg"), "intact");
  await fs.writeFile(path.join(safeRoot, BACKUP_DIRECTORY), "not a directory");
  await assert.rejects(createConfigBackup(safeRoot, path.join(safeRoot, "printer.cfg")));
  assert.equal(await fs.readFile(path.join(safeRoot, "printer.cfg"), "utf8"), "intact");
});
test("managed widget updates upload backups only into the separate backup directory", async () => {
  const uploads = [];
  const sync = await load("lib/widget-config-sync.ts", {
    "@/scripts/backup-paths.mjs": { backupRelativePath },
    "@/lib/moonraker": {
      getMoonrakerFileRoots: async () => [{ name: "config", permissions: "rw" }],
      readMoonrakerConfigFile: async (file) => file === "printer.cfg" ? "[include statusbar_leds.cfg]\n" : "old LED macros",
      uploadMoonrakerConfigFile: async (file, content) => uploads.push({ file, content })
    }
  });
  const result = await sync.installWidgetConfig("statusbar");
  assert.equal(result.backups.length, 2);
  for (const backup of result.backups) assert.ok(backup.startsWith(`${BACKUP_DIRECTORY}/`) && backup.endsWith(".bak"));
  assert.equal(uploads.filter((item) => item.file.endsWith(".cfg")).length, 1);
});
