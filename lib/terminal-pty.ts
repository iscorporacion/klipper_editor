import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { readAppSettingsSync } from "@/lib/app-settings";
import { isTerminalEnabled, terminalShell } from "@/lib/terminal";

type Session = {
  id: string;
  process: ChildProcessWithoutNullStreams;
  queue: Uint8Array[];
  queuedBytes: number;
  controller?: ReadableStreamDefaultController<Uint8Array>;
  attached: boolean;
  alive: boolean;
  lastActivity: number;
  timer: NodeJS.Timeout;
};
const host = globalThis as typeof globalThis & { editorPty?: Session };
const encoder = new TextEncoder();

export function assertPtyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    throw new Error("Terminal requests must come from this K-Editor origin.");
  }
}

function enabled() {
  if (!isTerminalEnabled() || readAppSettingsSync().terminalMode !== "pty") {
    throw new Error("PTY is disabled. Select Interactive (PTY) in Options > Terminal.");
  }
}

function sessionFor(id: string) {
  const session = host.editorPty;
  if (!session || !id || session.id !== id) throw new Error("PTY session not found.");
  return session;
}

export function closePty(id?: string) {
  const session = host.editorPty;
  if (!session || (id !== undefined && session.id !== id)) return;
  session.alive = false;
  clearInterval(session.timer);
  session.process.stdin.end();
  session.process.kill("SIGTERM");
  try { session.controller?.close(); } catch { /* The browser may already have disconnected. */ }
  session.controller = undefined;
  session.queue = [];
  if (host.editorPty === session) host.editorPty = undefined;
}

export async function createPty(cols: number, rows: number) {
  enabled();
  if (process.platform !== "linux") throw new Error("Interactive PTY requires Linux and python3 on the printer.");
  if (host.editorPty) throw new Error("A PTY session is already open. Disconnect it before opening another.");
  const child = spawn(process.env.KLIPPER_EDITOR_PYTHON || "python3", [
    "-u", path.join(process.cwd(), "scripts/terminal-pty.py"), terminalShell(), homedir(), String(cols), String(rows)
  ], { env: { ...process.env, TERM: "xterm-256color" }, stdio: "pipe" });
  const session: Session = {
    id: randomBytes(32).toString("hex"), process: child, queue: [], queuedBytes: 0,
    attached: false, alive: true, lastActivity: Date.now(),
    timer: setInterval(() => {
      if (!isTerminalEnabled() || readAppSettingsSync().terminalMode !== "pty" ||
          Date.now() - session.lastActivity > (session.attached ? 30 * 60 * 1000 : 15000)) { closePty(session.id); return; }
      if (session.controller && (session.controller.desiredSize ?? 0) > 0) {
        try { session.controller.enqueue(encoder.encode("\n")); } catch { closePty(session.id); }
      }
    }, 5000)
  };
  session.timer.unref();
  host.editorPty = session;
  child.stdin.on("error", () => closePty(session.id));
  let pending = "";
  let stderr = "";
  const publish = (line: string) => {
    if (!session.alive) return;
    const chunk = encoder.encode(`${line}\n`);
    session.lastActivity = Date.now();
    if (session.controller) {
      try {
        session.controller.enqueue(chunk);
        if ((session.controller.desiredSize ?? 0) <= 0) child.stdout.pause();
      } catch { closePty(session.id); }
    } else {
      session.queue.push(chunk);
      session.queuedBytes += chunk.byteLength;
      if (session.queuedBytes >= 65536) child.stdout.pause();
    }
  };
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { closePty(session.id); reject(new Error("PTY startup timed out.")); }, 10000);
    child.stderr.on("data", (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4000); });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      pending += text;
      if (pending.length > 262144) { closePty(session.id); reject(new Error("PTY output limit exceeded.")); return; }
      let index;
      while ((index = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        try {
          const event = JSON.parse(line);
          if (event.event === "ready") { clearTimeout(timeout); resolve(); }
          else publish(line);
        } catch { closePty(session.id); reject(new Error("Invalid PTY response.")); }
      }
    });
    child.on("error", (error) => { clearTimeout(timeout); closePty(session.id); reject(error); });
    child.on("exit", () => {
      clearTimeout(timeout);
      if (session.alive) publish(JSON.stringify({ event: "exit", error: stderr || undefined }));
      closePty(session.id);
      reject(new Error(stderr || "PTY closed before starting."));
    });
  });
  return { id: session.id };
}

export function ptyStream(id: string, signal: AbortSignal) {
  enabled();
  const session = sessionFor(id);
  if (session.attached) throw new Error("PTY stream already attached.");
  if (signal.aborted) { closePty(id); throw new Error("Connection aborted."); }
  session.attached = true;
  const abort = () => closePty(id);
  signal.addEventListener("abort", abort, { once: true });
  return new ReadableStream<Uint8Array>({
    start(controller) {
      session.controller = controller;
      session.queue.forEach((chunk) => controller.enqueue(chunk));
      session.queue = [];
      session.queuedBytes = 0;
      session.process.stdout.resume();
    },
    pull() { session.process.stdout.resume(); },
    cancel() { signal.removeEventListener("abort", abort); closePty(id); }
  }, { highWaterMark: 65536, size: (chunk) => chunk.byteLength });
}

export function writePty(id: string, message: { action: "input"; data: string } | { action: "resize"; cols: number; rows: number }) {
  enabled();
  const session = sessionFor(id);
  if (!session.alive) throw new Error("PTY session has closed.");
  if (session.process.stdin.writableLength > 65536) throw new Error("PTY input is busy.");
  session.lastActivity = Date.now();
  session.process.stdin.write(`${JSON.stringify(message)}\n`);
}
