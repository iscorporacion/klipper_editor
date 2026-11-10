const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("managed Node manifest has a pinned semantic version", () => {
  const manifest = JSON.parse(read("node-runtime.json"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.channel, "LTS");
});

test("release installer uses private staging and managed runtime", () => {
  const installer = read("install-release.sh");
  assert.match(installer, /KLIPPER_EDITOR_TEMP_ROOT:-\$\{INSTALL_ROOT\}\/\.install-tmp/);
  assert.match(installer, /scripts\/ensure-node-runtime\.sh/);
  assert.match(installer, /scripts\/start-runtime\.sh/);
  assert.doesNotMatch(installer, /require_command node/);
});

test("runtime installer verifies downloads and supports printer architectures", () => {
  const runtime = read("scripts/ensure-node-runtime.sh");
  for (const architecture of ["armv7l", "arm64", "x64"]) assert.match(runtime, new RegExp(architecture));
  assert.match(runtime, /sha256sum --check/);
  assert.match(runtime, /nodejs\.org\/dist/);
});

test("standalone package includes runtime metadata and launch scripts", () => {
  const packager = read("scripts/package-standalone.sh");
  for (const required of ["node-runtime.json", "ensure-node-runtime.sh", "start-runtime.sh"]) {
    assert.match(packager, new RegExp(required.replaceAll(".", "\\.")));
  }
});
