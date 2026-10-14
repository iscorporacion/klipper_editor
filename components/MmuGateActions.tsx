"use client";
import { useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";
import MdiIcon from "@mdi/react";
import { mdiCheckCircleOutline, mdiEject, mdiSwapHorizontal, mdiTrayArrowDown } from "@mdi/js";

export default function MmuGateActions({ gate, tools, status, selectedGate, disabled, labels, onClose, onAction }: {
  gate: number; tools: number[]; status: number; selectedGate: number; disabled: boolean;
  labels: { select: string; preload: string; eject: string; check: string; close: string };
  onClose: () => void; onAction: (action: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>(".mmu-gate-panel-close")?.focus();
    const pointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (panel.current?.contains(target)) return;
      const spool = target?.closest?.(".mmu-spool");
      if (spool && panel.current?.closest(".mmu-widget")?.contains(spool)) return;
      close.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      const spool = panel.current?.closest(".mmu-widget")?.querySelector<HTMLButtonElement>(`.mmu-spool[data-gate="${gate}"]`);
      close.current(); spool?.focus();
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard, true);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", keyboard, true); };
  }, [gate]);
  return <aside ref={panel} className="mmu-gate-panel" aria-label={`Acciones G${gate}`}>
    <header><strong>G{gate}{tools.length ? ` · ${tools.map((tool) => `T${tool}`).join(", ")}` : ""}</strong><button className="mmu-gate-panel-close" type="button" aria-label={labels.close} title={labels.close} onClick={() => {
      const spool = panel.current?.closest(".mmu-widget")?.querySelector<HTMLButtonElement>(`.mmu-spool[data-gate="${gate}"]`);
      onClose(); spool?.focus();
    }}><MdClose /></button></header>
    {([
      ["select", mdiSwapHorizontal, labels.select, gate === selectedGate],
      ["preload", mdiTrayArrowDown, labels.preload, status > 0],
      ["eject", mdiEject, labels.eject, status === 0],
      ["check", mdiCheckCircleOutline, labels.check, false]
    ] as const).map(([action, icon, label, blocked]) => <button type="button" key={action} disabled={disabled || blocked} onClick={() => onAction(action)}>
      <MdiIcon path={icon} size={.8} /><span>{label}</span>
    </button>)}
  </aside>;
}
