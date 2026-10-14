"use client";
import { useEffect, useRef, useState } from "react";

export default function LiveLedColor({ name, label, color, disabled, endpoint, onApplied, onError }: {
  name: string; label: string; color: string; disabled: boolean; endpoint: string;
  onApplied: () => void; onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(color);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onApplied, onError });
  const flushOnClose = useRef<() => Promise<void>>(async () => {});
  callbacks.current = { onApplied, onError };
  useEffect(() => {
    if (!running.current && !pending.current && document.activeElement !== input.current) setDraft(color);
  }, [color]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    void flushOnClose.current();
  }, []);
  const flush = async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (pending.current) {
        const next = pending.current;
        pending.current = null;
        try {
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, value: 1, color: next }) });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "No se pudo aplicar el color");
        } catch (error) {
          pending.current = null;
          callbacks.current.onError(error instanceof Error ? error.message : "No se pudo aplicar el color");
          return;
        }
      }
      callbacks.current.onApplied();
    } finally { running.current = false; }
  };
  flushOnClose.current = flush;
  return <input ref={input} type="color" value={draft} disabled={disabled} aria-label={label} onInput={(event) => {
    const next = event.currentTarget.value;
    setDraft(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 120);
  }} onChange={() => {}} />;
}
