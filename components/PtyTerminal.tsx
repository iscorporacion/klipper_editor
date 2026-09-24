"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { MdClose, MdOpenInFull, MdTerminal } from "react-icons/md";

type Props = {
  endpoint: string;
  enabled: boolean;
  supported: boolean;
  onClose: () => void;
  onExpand?: () => void;
  onActive: (active: boolean) => void;
  labels: { connect: string; disconnect: string; connected: string; disconnected: string; connecting: string; close: string; expand: string; disabled: string; unsupported: string; http: string };
};

export default function PtyTerminal({ endpoint, enabled, supported, onClose, onExpand, onActive, labels }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [wanted, setWanted] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [insecure, setInsecure] = useState(false);
  const latest = useRef({ onActive, labels });
  latest.current = { onActive, labels };

  useEffect(() => {
    setInsecure(window.location.protocol === "http:");
    if (!container.current || !enabled || !supported || !wanted) return;
    const terminal = new Terminal({
      cursorBlink: true, fontSize: 13, scrollback: 2000,
      fontFamily: '"Cascadia Code", Consolas, monospace',
      theme: { background: "#0b0f14", foreground: "#d6dee6" },
      allowProposedApi: false, convertEol: false
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    fit.fit();
    const abort = new AbortController();
    let disposed = false;
    let id = "";
    let frame = 0;
    let queuedBytes = 0;
    let commands = Promise.resolve();
    const post = async (message: Record<string, unknown>, signal?: AbortSignal) => {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message), signal, cache: "no-store"
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || `Terminal HTTP ${response.status}`);
      }
      return response;
    };
    const closeRemote = () => {
      if (!id) return;
      void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", id }), keepalive: true }).catch(() => {});
    };
    const enqueue = (message: Record<string, unknown>, size = 0) => {
      if (!id || disposed) return;
      queuedBytes += size;
      if (queuedBytes > 262144) { setError("Terminal input limit exceeded"); setWanted(false); return; }
      commands = commands.then(async () => {
        if (!disposed) await post({ ...message, id }, abort.signal);
      }).catch((failure) => {
        if (!disposed) { setError(String(failure)); setWanted(false); }
      }).finally(() => { queuedBytes -= size; });
    };
    const input = terminal.onData((data) => {
      for (let offset = 0; offset < data.length; offset += 4096) {
        enqueue({ action: "input", data: data.slice(offset, offset + 4096) }, Math.min(4096, data.length - offset));
      }
    });
    const binary = terminal.onBinary((data) => enqueue({ action: "input", data, binary: true }, data.length));
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed) return;
        fit.fit();
        enqueue({ action: "resize", cols: terminal.cols, rows: terminal.rows });
      });
    });
    observer.observe(container.current);
    setConnecting(true);
    setError("");
    latest.current.onActive(true);
    const run = async () => {
      try {
        // Let an in-flight open finish so cleanup can close the returned session.
        const opened = await post({ action: "open", cols: terminal.cols, rows: terminal.rows });
        const payload = await opened.json();
        id = payload.id;
        if (disposed) { closeRemote(); return; }
        setConnected(true);
        setConnecting(false);
        terminal.focus();
        enqueue({ action: "resize", cols: terminal.cols, rows: terminal.rows });
        const response = await post({ action: "stream", id }, abort.signal);
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Terminal stream unavailable");
        const decoder = new TextDecoder();
        let pending = "";
        while (!disposed) {
          const chunk = await reader.read();
          if (chunk.done) break;
          pending += decoder.decode(chunk.value, { stream: true });
          let index;
          while ((index = pending.indexOf("\n")) !== -1) {
            const line = pending.slice(0, index);
            pending = pending.slice(index + 1);
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.error) setError(event.error);
            if (event.event === "data") {
              const bytes = Uint8Array.from(atob(event.data), (character) => character.charCodeAt(0));
              await new Promise<void>((resolve) => terminal.write(bytes, resolve));
            }
          }
        }
      } catch (failure) {
        if (!disposed) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        closeRemote();
        if (!disposed) { setConnected(false); setConnecting(false); setWanted(false); latest.current.onActive(false); }
      }
    };
    // Avoid creating a session during React's development-only effect rehearsal.
    const start = setTimeout(() => void run(), 0);
    const unload = () => { closeRemote(); abort.abort(); };
    window.addEventListener("pagehide", unload);
    return () => {
      disposed = true;
      clearTimeout(start);
      abort.abort();
      closeRemote();
      window.removeEventListener("pagehide", unload);
      observer.disconnect();
      cancelAnimationFrame(frame);
      input.dispose(); binary.dispose(); terminal.dispose();
      latest.current.onActive(false);
    };
  }, [endpoint, enabled, supported, wanted]);

  return <div className="pty-terminal">
    <div className="terminal-header">
      <div className="terminal-title"><MdTerminal className="terminal-title-icon" /><span>PTY</span><small>{connecting ? labels.connecting : connected ? labels.connected : labels.disconnected}</small></div>
      <div className="terminal-actions">
        <button type="button" className="terminal-button" disabled={!enabled || !supported || wanted} onClick={() => setWanted(true)}>{labels.connect}</button>
        <button type="button" className="terminal-button" disabled={!wanted} onClick={() => { setWanted(false); setConnected(false); setConnecting(false); }}>{labels.disconnect}</button>
        {onExpand && <button type="button" className="terminal-icon-button" title={labels.expand} aria-label={labels.expand} onClick={onExpand}><MdOpenInFull /></button>}
        <button type="button" className="terminal-icon-button" title={labels.close} aria-label={labels.close} onClick={onClose}><MdClose /></button>
      </div>
    </div>
    {insecure && <div className="pty-http-warning">{labels.http}</div>}
    {(!enabled || !supported || error) && <div className="pty-error" role="status">{!enabled ? labels.disabled : !supported ? labels.unsupported : error}</div>}
    <div className="pty-terminal-screen" ref={container} />
  </div>;
}
