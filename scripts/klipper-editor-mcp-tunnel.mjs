#!/usr/bin/env node
import { spawn } from "node:child_process";

const port = Number(process.env.KLIPPER_EDITOR_MCP_HTTP_PORT || 3001);
const host = process.env.KLIPPER_EDITOR_MCP_HTTP_HOST || "127.0.0.1";
const token = process.env.KLIPPER_EDITOR_MCP_TOKEN || "";
const nodeBin = process.execPath;
const cloudflaredBin = process.env.KLIPPER_EDITOR_CLOUDFLARED_BIN || "cloudflared";
const localMcpUrl = `http://${host}:${port}/mcp`;

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMcp() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(token ? `${localMcpUrl}?token=${encodeURIComponent(token)}` : localMcpUrl, {
        cache: "no-store"
      });
      if (response.ok) return;
    } catch {
      // The MCP HTTP process may still be starting.
    }
    await wait(250);
  }
  throw new Error(`MCP HTTP server did not become ready at ${localMcpUrl}`);
}

function serverUrlFromTunnelUrl(tunnelUrl) {
  const cleanUrl = tunnelUrl.replace(/\/+$/, "");
  return token ? `${cleanUrl}/mcp?token=${encodeURIComponent(token)}` : `${cleanUrl}/mcp`;
}

const mcp = spawn(nodeBin, ["scripts/klipper-editor-mcp.mjs", "--http"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    KLIPPER_EDITOR_MCP_HTTP_HOST: host,
    KLIPPER_EDITOR_MCP_HTTP_PORT: String(port),
    KLIPPER_EDITOR_MCP_TOKEN: token
  },
  stdio: ["ignore", "pipe", "pipe"]
});

mcp.stdout.on("data", (chunk) => writeEvent({ event: "mcp_stdout", text: chunk.toString("utf8") }));
mcp.stderr.on("data", (chunk) => writeEvent({ event: "mcp_stderr", text: chunk.toString("utf8") }));
mcp.on("exit", (code) => writeEvent({ event: "mcp_exit", code }));

let cloudflared;
let ready = false;

function handleCloudflaredOutput(chunk) {
  const text = chunk.toString("utf8");
  writeEvent({ event: "cloudflared_output", text });

  if (ready) return;
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!match) return;

  ready = true;
  writeEvent({
    event: "ready",
    url: match[0],
    serverUrl: serverUrlFromTunnelUrl(match[0]),
    localUrl: token ? `${localMcpUrl}?token=${encodeURIComponent(token)}` : localMcpUrl
  });
}

async function shutdown() {
  writeEvent({ event: "stopping" });
  if (cloudflared && !cloudflared.killed) cloudflared.kill();
  if (!mcp.killed) mcp.kill();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

try {
  await waitForMcp();

  cloudflared = spawn(cloudflaredBin, ["tunnel", "--url", `http://${host}:${port}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  cloudflared.stdout.on("data", handleCloudflaredOutput);
  cloudflared.stderr.on("data", handleCloudflaredOutput);
  cloudflared.on("error", (error) => {
    writeEvent({
      event: "error",
      error:
        error && "code" in error && error.code === "ENOENT"
          ? "cloudflared no esta instalado o no esta en PATH. Instala cloudflared en la impresora y vuelve a subir el MCP."
          : error.message
    });
    if (!mcp.killed) mcp.kill();
    process.exit(1);
  });
  cloudflared.on("exit", (code) => {
    writeEvent({ event: "tunnel_closed", code });
    if (!mcp.killed) mcp.kill();
    process.exit(code ?? 0);
  });
} catch (error) {
  writeEvent({ event: "error", error: error instanceof Error ? error.message : "Unable to start MCP tunnel" });
  if (!mcp.killed) mcp.kill();
  process.exit(1);
}
