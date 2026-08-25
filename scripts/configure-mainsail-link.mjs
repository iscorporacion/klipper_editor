#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const editorIcon =
  "M5,3H7V5H5V10A2,2 0 0,1 3,12A2,2 0 0,1 5,14V19H7V21H5C3.93,20.73 3,20.1 3,19V15A2,2 0 0,0 1,13H0V11H1A2,2 0 0,0 3,9V5A2,2 0 0,1 5,3M19,3A2,2 0 0,1 21,5V9A2,2 0 0,0 23,11H24V13H23A2,2 0 0,0 21,15V19A2,2 0 0,1 19,21H17V19H19V14A2,2 0 0,1 21,12A2,2 0 0,1 19,10V5H17V3H19M12,15A1,1 0 0,1 13,16A1,1 0 0,1 12,17A1,1 0 0,1 11,16A1,1 0 0,1 12,15M8,15A1,1 0 0,1 9,16A1,1 0 0,1 8,17A1,1 0 0,1 7,16A1,1 0 0,1 8,15M16,15A1,1 0 0,1 17,16A1,1 0 0,1 16,17A1,1 0 0,1 15,16A1,1 0 0,1 16,15Z";

const removeLink = process.argv.includes("--remove");
const configRoot = process.env.RATOS_VIEWER_ROOT || process.env.CONFIG_ROOT;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/editor";
const moonrakerUrl = process.env.RATOS_MOONRAKER_URL || process.env.MOONRAKER_URL || "http://127.0.0.1:7125";
const title = process.env.KLIPPER_EDITOR_MAINSAIL_LINK_TITLE || "code editor";
const href =
  process.env.KLIPPER_EDITOR_MAINSAIL_LINK_HREF ||
  `${basePath.startsWith("/") ? basePath : `/${basePath}`}${basePath.endsWith("/") ? "" : "/"}`;
const target = process.env.KLIPPER_EDITOR_MAINSAIL_LINK_TARGET || "_self";
const position = Number.parseInt(process.env.KLIPPER_EDITOR_MAINSAIL_LINK_POSITION || "91", 10);

if (!configRoot) {
  console.log("Mainsail link skipped: RATOS_VIEWER_ROOT is not set.");
  process.exit(0);
}

const naviFile = path.join(configRoot, ".theme", "navi.json");

function sameLink(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    (String(entry.title || "").toLowerCase() === title.toLowerCase() || String(entry.href || "") === href)
  );
}

async function readJsonArray(file) {
  try {
    const content = await readFile(file, "utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    console.warn(`${file} is not an array. Replacing it with a new navigation list.`);
    return [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    console.warn(`Unable to parse ${file}. Replacing it with a new navigation list.`);
    return [];
  }
}

async function writeNaviFile() {
  await mkdir(path.dirname(naviFile), { recursive: true });

  const current = await readJsonArray(naviFile);
  const filtered = current.filter((entry) => !sameLink(entry));
  const next = removeLink
    ? filtered
    : [
        ...filtered,
        {
          title,
          icon: editorIcon,
          href,
          target,
          visible: true,
          position
        }
      ];

  await writeFile(naviFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(removeLink ? `Removed Mainsail link from ${naviFile}` : `Configured Mainsail link in ${naviFile}`);
}

function moonrakerEndpoint() {
  const base = moonrakerUrl.endsWith("/") ? moonrakerUrl : `${moonrakerUrl}/`;
  const endpoint = new URL("server/database/item", base);
  endpoint.searchParams.set("namespace", "mainsail");
  endpoint.searchParams.set("key", "navigation.entries");
  return endpoint;
}

async function readMoonrakerNavigationEntries(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) return [];

  const payload = await response.json();
  const value = payload?.result?.value ?? payload?.value;
  return Array.isArray(value) ? value : [];
}

async function writeMoonrakerNavigationEntries() {
  try {
    const endpoint = moonrakerEndpoint();
    const current = await readMoonrakerNavigationEntries(endpoint);
    const filtered = current.filter(
      (entry) =>
        !(
          entry &&
          entry.type === "link" &&
          String(entry.title || "").toLowerCase() === title.toLowerCase()
        )
    );
    const next = removeLink
      ? filtered
      : [
          ...filtered,
          {
            type: "link",
            title,
            visible: true,
            position
          }
        ];

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace: "mainsail",
        key: "navigation.entries",
        value: next
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    console.log("Configured Mainsail navigation order in Moonraker DB.");
  } catch (error) {
    console.warn(`Mainsail navigation DB update skipped: ${error.message}`);
  }
}

await writeNaviFile();
await writeMoonrakerNavigationEntries();
