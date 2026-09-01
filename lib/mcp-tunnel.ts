import { spawn, type ChildProcess } from "node:child_process";

type TunnelEvent = {
  time?: string;
  event?: string;
  url?: string;
  serverUrl?: string;
  localUrl?: string;
  text?: string;
  error?: string;
  code?: number | null;
};

type TunnelState = {
  process: ChildProcess | null;
  running: boolean;
  starting: boolean;
  url: string;
  localUrl: string;
  error: string;
  log: string[];
};

const state: TunnelState = {
  process: null,
  running: false,
  starting: false,
  url: "",
  localUrl: "",
  error: "",
  log: []
};

function pushLog(line: string) {
  state.log.push(line);
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

function handleEvent(event: TunnelEvent) {
  if (event.event === "ready" && event.serverUrl) {
    state.url = event.serverUrl;
    state.localUrl = event.localUrl ?? "";
    state.running = true;
    state.starting = false;
    state.error = "";
  } else if (event.event === "error" && event.error) {
    state.error = event.error;
    state.running = false;
    state.starting = false;
  } else if (event.event === "tunnel_closed" || event.event === "mcp_exit") {
    state.running = false;
    state.starting = false;
  }

  pushLog(JSON.stringify(event));
}

function parseLines(buffer: { value: string }, chunk: Buffer) {
  buffer.value += chunk.toString("utf8");
  const lines = buffer.value.split(/\r?\n/);
  buffer.value = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      handleEvent(JSON.parse(line) as TunnelEvent);
    } catch {
      pushLog(line);
    }
  }
}

export function getMcpTunnelStatus() {
  return {
    running: state.running,
    starting: state.starting,
    url: state.url,
    localUrl: state.localUrl,
    error: state.error,
    log: state.log
  };
}

export function startMcpTunnel() {
  if (state.process && !state.process.killed) return getMcpTunnelStatus();

  state.running = false;
  state.starting = true;
  state.url = "";
  state.localUrl = "";
  state.error = "";
  state.log = [];

  const child = spawn(process.execPath, ["scripts/klipper-editor-mcp-tunnel.mjs"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  state.process = child;
  const stdoutBuffer = { value: "" };
  const stderrBuffer = { value: "" };

  child.stdout.on("data", (chunk: Buffer) => parseLines(stdoutBuffer, chunk));
  child.stderr.on("data", (chunk: Buffer) => parseLines(stderrBuffer, chunk));
  child.on("error", (error) => {
    state.error = error.message;
    state.running = false;
    state.starting = false;
    pushLog(error.message);
  });
  child.on("exit", (code) => {
    state.process = null;
    state.running = false;
    state.starting = false;
    if (code && !state.error) state.error = `MCP tunnel exited with code ${code}`;
  });

  return getMcpTunnelStatus();
}

export function stopMcpTunnel() {
  if (state.process && !state.process.killed) {
    state.process.kill();
  }
  state.process = null;
  state.running = false;
  state.starting = false;
  state.url = "";
  state.localUrl = "";
  return getMcpTunnelStatus();
}
