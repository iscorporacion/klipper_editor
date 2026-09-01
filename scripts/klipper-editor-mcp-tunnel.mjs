#!/usr/bin/env node
import { spawn } from "node:child_process";
import localtunnel from "localtunnel";

const port = Number(process.env.KLIPPER_EDITOR_MCP_HTTP_PORT || 3001);
const host = process.env.KLIPPER_EDITOR_MCP_HTTP_HOST || "127.0.0.1";
const subdomain = process.env.KLIPPER_EDITOR_MCP_TUNNEL_SUBDOMAIN || undefined;
const nodeBin = process.execPath;

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMcp() {
  const url = `http://${host}:${port}/mcp`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // The MCP HTTP process may still be starting.
    }
    await wait(250);
  }
  throw new Error(`MCP HTTP server did not become ready at ${url}`);
}

const child = spawn(nodeBin, ["scripts/klipper-editor-mcp.mjs", "--http"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    KLIPPER_EDITOR_MCP_HTTP_HOST: host,
    KLIPPER_EDITOR_MCP_HTTP_PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => writeEvent({ event: "mcp_stdout", text: chunk.toString("utf8") }));
child.stderr.on("data", (chunk) => writeEvent({ event: "mcp_stderr", text: chunk.toString("utf8") }));
child.on("exit", (code) => writeEvent({ event: "mcp_exit", code }));

let tunnel;

async function shutdown() {
  writeEvent({ event: "stopping" });
  tunnel?.close();
  if (!child.killed) child.kill();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

try {
  await waitForMcp();
  tunnel = await localtunnel({ port, local_host: host, subdomain });
  const serverUrl = `${tunnel.url.replace(/\/+$/, "")}/mcp`;
  writeEvent({ event: "ready", url: tunnel.url, serverUrl, localUrl: `http://${host}:${port}/mcp` });

  tunnel.on("close", () => {
    writeEvent({ event: "tunnel_closed" });
    if (!child.killed) child.kill();
    process.exit(0);
  });
  tunnel.on("error", (error) => writeEvent({ event: "tunnel_error", error: error.message }));
} catch (error) {
  writeEvent({ event: "error", error: error instanceof Error ? error.message : "Unable to start MCP tunnel" });
  if (!child.killed) child.kill();
  process.exit(1);
}
