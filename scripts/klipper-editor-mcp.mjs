#!/usr/bin/env node
import fs from "node:fs/promises";
import fss from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const appDirName = "ratos-file-viewer";
const root = path.resolve(process.env.KLIPPER_EDITOR_MCP_ROOT || process.env.RATOS_VIEWER_ROOT || defaultRoot());
const moonrakerUrl = normalizeUrl(process.env.MOONRAKER_URL || process.env.RATOS_MOONRAKER_URL || "http://127.0.0.1:7125");
const writeEnabled = process.env.KLIPPER_EDITOR_MCP_ENABLE_WRITE === "true";
const deleteEnabled = process.env.KLIPPER_EDITOR_MCP_ENABLE_DELETE === "true";
const gcodeEnabled = process.env.KLIPPER_EDITOR_MCP_ENABLE_GCODE === "true";
const restartEnabled = process.env.KLIPPER_EDITOR_MCP_ENABLE_RESTART === "true";
const maxReadBytes = Number(process.env.KLIPPER_EDITOR_MCP_MAX_READ_BYTES || 1024 * 1024);
const blockedSegments = new Set([".git", ".next", "node_modules", appDirName]);

function defaultRoot() {
  const printerDataConfig = path.join(os.homedir(), "printer_data", "config");
  return fss.existsSync(printerDataConfig) ? printerDataConfig : path.resolve(process.cwd(), "..");
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

function toRelativePath(input = "") {
  return String(input).replace(/\\/g, "/").replace(/^\/+/, "");
}

function isBlocked(relativePath) {
  return toRelativePath(relativePath)
    .split("/")
    .filter(Boolean)
    .some((segment) => blockedSegments.has(segment));
}

function resolveSafe(relativePath = "") {
  const clean = toRelativePath(relativePath);
  if (isBlocked(clean)) throw new Error("Path contains a blocked segment");

  const absolute = path.resolve(root, clean);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSeparator)) {
    throw new Error("Path is outside the configured root");
  }
  return absolute;
}

function requirePermission(enabled, name) {
  if (!enabled) {
    throw new Error(`${name} is disabled. Enable it explicitly with the documented environment variable.`);
  }
}

async function backupFile(absolutePath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const backupPath = `${absolutePath}.mcp-backup-${stamp}`;
  await fs.copyFile(absolutePath, backupPath);
  return path.relative(root, backupPath).replace(/\\/g, "/");
}

async function moonrakerFetch(endpoint, init) {
  const response = await fetch(`${moonrakerUrl}${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Moonraker request failed: ${response.status}`);
  }
  return payload.result ?? payload;
}

const tools = [
  {
    name: "list_files",
    description: "List files and folders inside the configured Klipper config root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative folder path. Defaults to the root." }
      }
    }
  },
  {
    name: "read_file",
    description: "Read a text file inside the configured Klipper config root.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Relative file path." }
      }
    }
  },
  {
    name: "write_file",
    description: "Write a text file. Requires KLIPPER_EDITOR_MCP_ENABLE_WRITE=true. Existing files are backed up first.",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string", description: "Relative file path." },
        content: { type: "string", description: "New file content." }
      }
    }
  },
  {
    name: "rename_file",
    description: "Rename or move a file. Requires KLIPPER_EDITOR_MCP_ENABLE_WRITE=true.",
    inputSchema: {
      type: "object",
      required: ["from", "to"],
      properties: {
        from: { type: "string", description: "Current relative path." },
        to: { type: "string", description: "New relative path." }
      }
    }
  },
  {
    name: "delete_file",
    description: "Delete a file. Requires KLIPPER_EDITOR_MCP_ENABLE_DELETE=true.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Relative file path." }
      }
    }
  },
  {
    name: "search_config",
    description: "Search text across config files under the configured root.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Text to search." },
        limit: { type: "number", description: "Maximum number of matches. Defaults to 50." }
      }
    }
  },
  {
    name: "run_gcode",
    description: "Send G-code or a macro to Moonraker. Requires KLIPPER_EDITOR_MCP_ENABLE_GCODE=true.",
    inputSchema: {
      type: "object",
      required: ["script"],
      properties: {
        script: { type: "string", description: "G-code script to execute." }
      }
    }
  },
  {
    name: "restart_firmware",
    description: "Request Klipper firmware restart through Moonraker. Requires KLIPPER_EDITOR_MCP_ENABLE_RESTART=true.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "printer_status",
    description: "Read a small printer status summary from Moonraker.",
    inputSchema: { type: "object", properties: {} }
  }
];

async function listFiles(args) {
  const absolute = resolveSafe(args.path || "");
  const dirents = await fs.readdir(absolute, { withFileTypes: true });
  const entries = [];
  for (const dirent of dirents) {
    const relative = toRelativePath(path.join(args.path || "", dirent.name));
    if (isBlocked(relative)) continue;
    const stat = dirent.isSymbolicLink() ? await fs.stat(resolveSafe(relative)).catch(() => undefined) : undefined;
    entries.push({
      name: dirent.name,
      path: relative,
      type: dirent.isDirectory() || stat?.isDirectory() ? "directory" : "file",
      symlink: dirent.isSymbolicLink()
    });
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
  return { root, entries };
}

async function readFile(args) {
  const absolute = resolveSafe(args.path);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new Error("Path is not a file");
  if (stat.size > maxReadBytes) throw new Error(`File is too large. Limit is ${maxReadBytes} bytes.`);
  return { path: toRelativePath(args.path), content: await fs.readFile(absolute, "utf8") };
}

async function writeFile(args) {
  requirePermission(writeEnabled, "write_file");
  const absolute = resolveSafe(args.path);
  let backupPath = null;
  const exists = await fs.stat(absolute).then((stat) => stat.isFile()).catch(() => false);
  if (exists) backupPath = await backupFile(absolute);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, String(args.content), "utf8");
  return { path: toRelativePath(args.path), backupPath };
}

async function renameFile(args) {
  requirePermission(writeEnabled, "rename_file");
  const from = resolveSafe(args.from);
  const to = resolveSafe(args.to);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  return { from: toRelativePath(args.from), to: toRelativePath(args.to) };
}

async function deleteFile(args) {
  requirePermission(deleteEnabled, "delete_file");
  const absolute = resolveSafe(args.path);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new Error("Only files can be deleted");
  const backupPath = await backupFile(absolute);
  await fs.unlink(absolute);
  return { path: toRelativePath(args.path), backupPath };
}

async function walkFiles(relativePath = "", depth = 0) {
  if (depth > 12) return [];
  const absolute = resolveSafe(relativePath);
  const dirents = await fs.readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const dirent of dirents) {
    const child = toRelativePath(path.join(relativePath, dirent.name));
    if (isBlocked(child)) continue;
    const stat = dirent.isSymbolicLink() ? await fs.stat(resolveSafe(child)).catch(() => undefined) : undefined;
    if (dirent.isDirectory() || stat?.isDirectory()) files.push(...await walkFiles(child, depth + 1));
    if (dirent.isFile() || stat?.isFile()) files.push(child);
  }
  return files;
}

async function searchConfig(args) {
  const query = String(args.query || "");
  if (query.length < 2) throw new Error("Query must contain at least 2 characters");
  const limit = Math.max(1, Math.min(Number(args.limit || 50), 200));
  const lowerQuery = query.toLowerCase();
  const matches = [];
  for (const file of await walkFiles()) {
    const absolute = resolveSafe(file);
    const stat = await fs.stat(absolute);
    if (stat.size > maxReadBytes) continue;
    const content = await fs.readFile(absolute, "utf8").catch(() => "");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].toLowerCase().includes(lowerQuery)) continue;
      matches.push({ path: file, line: index + 1, text: lines[index] });
      if (matches.length >= limit) return { query, matches };
    }
  }
  return { query, matches };
}

async function runGcode(args) {
  requirePermission(gcodeEnabled, "run_gcode");
  return moonrakerFetch("/printer/gcode/script", {
    method: "POST",
    body: JSON.stringify({ script: String(args.script || "") })
  });
}

async function restartFirmware() {
  requirePermission(restartEnabled, "restart_firmware");
  return moonrakerFetch("/printer/firmware_restart", { method: "POST" });
}

async function printerStatus() {
  return moonrakerFetch(
    "/printer/objects/query?webhooks=state,state_message&print_stats=state,filename,message&display_status=message,progress"
  );
}

const handlers = {
  list_files: listFiles,
  read_file: readFile,
  write_file: writeFile,
  rename_file: renameFile,
  delete_file: deleteFile,
  search_config: searchConfig,
  run_gcode: runGcode,
  restart_firmware: restartFirmware,
  printer_status: printerStatus
};

function textContent(value) {
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];
}

async function handleRequest(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "klipper-editor-mcp", version: "0.1.0" }
    };
  }

  if (request.method === "tools/list") return { tools };

  if (request.method === "tools/call") {
    const name = request.params?.name;
    const handler = handlers[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    const result = await handler(request.params?.arguments || {});
    return { content: textContent(result) };
  }

  return {};
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
    if (!request.id) {
      if (request.method === "notifications/initialized") return;
      return;
    }
    const result = await handleRequest(request);
    send({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: request?.id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : "MCP server error"
      }
    });
  }
});
