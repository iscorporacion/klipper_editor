import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { WORKSPACE_ROOT } from "@/lib/workspace";

type TerminalChunk = {
  id: number;
  text: string;
};

type TerminalSession = {
  id: string;
  process: ChildProcessWithoutNullStreams;
  chunks: TerminalChunk[];
  cursor: number;
  alive: boolean;
  exitCode: number | null;
  lastAccess: number;
};

const sessions = new Map<string, TerminalSession>();
const idleTimeoutMs = 30 * 60 * 1000;
const maxBufferedCharacters = 80_000;

export function isTerminalEnabled() {
  return process.env.KLIPPER_EDITOR_ENABLE_TERMINAL === "true";
}

export function terminalShell() {
  if (process.env.KLIPPER_EDITOR_TERMINAL_SHELL) {
    return process.env.KLIPPER_EDITOR_TERMINAL_SHELL;
  }

  if (process.platform === "win32") {
    return process.env.ComSpec ?? "powershell.exe";
  }

  return process.env.SHELL ?? "/bin/bash";
}

function shellArgs(shell: string) {
  const normalized = shell.replace(/\\/g, "/").toLowerCase();

  if (process.platform === "win32") {
    return normalized.endsWith("powershell.exe") || normalized.endsWith("pwsh.exe") ? ["-NoLogo"] : [];
  }

  if (normalized.endsWith("/bash") || normalized.endsWith("/zsh") || normalized.endsWith("/sh")) {
    return ["-i"];
  }

  return [];
}

function appendOutput(session: TerminalSession, text: string) {
  if (!text) return;

  session.cursor += 1;
  session.chunks.push({ id: session.cursor, text });

  let total = session.chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  while (total > maxBufferedCharacters && session.chunks.length > 1) {
    const removed = session.chunks.shift();
    total -= removed?.text.length ?? 0;
  }
}

function cleanupIdleSessions() {
  const now = Date.now();

  for (const session of sessions.values()) {
    if (now - session.lastAccess <= idleTimeoutMs) continue;
    closeTerminalSession(session.id);
  }
}

function terminalWorkingDirectory() {
  return fs.existsSync(WORKSPACE_ROOT) ? WORKSPACE_ROOT : process.cwd();
}

export function createTerminalSession() {
  if (!isTerminalEnabled()) {
    throw new Error("Terminal is disabled");
  }

  cleanupIdleSessions();

  const shell = terminalShell();
  const cwd = terminalWorkingDirectory();
  const child = spawn(shell, shellArgs(shell), {
    cwd,
    env: {
      ...process.env,
      TERM: process.env.TERM ?? "xterm-256color"
    },
    shell: false
  });

  const session: TerminalSession = {
    id: crypto.randomUUID(),
    process: child,
    chunks: [],
    cursor: 0,
    alive: true,
    exitCode: null,
    lastAccess: Date.now()
  };

  appendOutput(session, `Connected to ${os.hostname()} (${cwd})\n`);

  child.stdout.on("data", (data: Buffer) => appendOutput(session, data.toString("utf8")));
  child.stderr.on("data", (data: Buffer) => appendOutput(session, data.toString("utf8")));
  child.on("error", (error) => {
    appendOutput(session, `\nTerminal error: ${error.message}\n`);
    session.alive = false;
  });
  child.on("exit", (code) => {
    session.alive = false;
    session.exitCode = code;
    appendOutput(session, `\nTerminal closed${code === null ? "" : ` with code ${code}`}.\n`);
  });

  sessions.set(session.id, session);
  return readTerminalSession(session.id, 0);
}

export function readTerminalSession(id: string, cursor = 0) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error("Terminal session was not found");
  }

  session.lastAccess = Date.now();

  return {
    id: session.id,
    cursor: session.cursor,
    alive: session.alive,
    exitCode: session.exitCode,
    output: session.chunks.filter((chunk) => chunk.id > cursor)
  };
}

export function writeTerminalInput(id: string, input: string) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error("Terminal session was not found");
  }

  session.lastAccess = Date.now();

  if (!session.alive) {
    throw new Error("Terminal session is closed");
  }

  session.process.stdin.write(input);
  return readTerminalSession(id, session.cursor);
}

export function closeTerminalSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;

  session.alive = false;
  if (!session.process.killed) {
    session.process.kill();
  }

  sessions.delete(id);
}
