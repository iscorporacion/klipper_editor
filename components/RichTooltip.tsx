"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function RichTooltip({ content, children, placement = "top" }: {
  content: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom";
}) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, arrowLeft: 20, placement, ready: false, theme: {} as CSSProperties });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const triggerStyle = window.getComputedStyle(trigger);
    const margin = 10;
    const gap = 9;
    const resolvedPlacement = placement === "top" && triggerRect.top >= tooltipRect.height + gap + margin ? "top"
      : placement === "bottom" && window.innerHeight - triggerRect.bottom >= tooltipRect.height + gap + margin ? "bottom"
        : triggerRect.top >= tooltipRect.height + gap + margin ? "top" : "bottom";
    const idealLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    const left = Math.min(Math.max(margin, idealLeft), Math.max(margin, window.innerWidth - tooltipRect.width - margin));
    const top = resolvedPlacement === "top" ? triggerRect.top - tooltipRect.height - gap : triggerRect.bottom + gap;
    setPosition({
      top: Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin)),
      left,
      arrowLeft: Math.min(Math.max(12, triggerRect.left + triggerRect.width / 2 - left), tooltipRect.width - 12),
      placement: resolvedPlacement,
      ready: true,
      theme: {
        "--tooltip-panel": triggerStyle.getPropertyValue("--panel-strong"),
        "--tooltip-border": triggerStyle.getPropertyValue("--border"),
        "--tooltip-accent": triggerStyle.getPropertyValue("--accent"),
        "--tooltip-text": triggerStyle.getPropertyValue("--text"),
        "--tooltip-muted": triggerStyle.getPropertyValue("--muted")
      } as CSSProperties
    });
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const show = () => {
    setPosition((current) => ({ ...current, ready: false }));
    setOpen(true);
  };

  return <span className="rich-tooltip"
    onMouseEnter={show} onMouseLeave={() => setOpen(false)}
    onFocusCapture={show}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <span ref={triggerRef} className="rich-tooltip-trigger" aria-describedby={open ? id : undefined}>{children}</span>
    {open && typeof document !== "undefined" && createPortal(
      <span ref={tooltipRef} className={`rich-tooltip-content rich-tooltip-${position.placement} ${position.ready ? "ready" : ""}`} id={id} role="tooltip"
        style={{ ...position.theme, top: position.top, left: position.left, "--tooltip-arrow-left": `${position.arrowLeft}px` } as CSSProperties}>{content}</span>,
      document.body
    )}
  </span>;
}
