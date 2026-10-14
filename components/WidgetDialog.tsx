"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MdClose } from "react-icons/md";

export default function WidgetDialog({ title, onClose, children, footer, className = "" }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current!;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((item) => item.getClientRects().length);
    (focusable()[0] ?? panel).focus();
    const key = (event: KeyboardEvent) => {
      if (!panel.contains(document.activeElement)) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); previous?.focus(); };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="modal-backdrop macro-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} tabIndex={-1} className={`options-modal macro-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={id}>
      <header><h2 id={id}>{title}</h2><button type="button" className="modal-icon-button" onClick={onClose} aria-label="Close"><MdClose /></button></header>
      <div className="macro-dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  </div>, document.body);
}
