"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MdStraighten } from "react-icons/md";
import WidgetDialog from "@/components/WidgetDialog";

type ProbeState = {
  active: boolean; position: number | null; lower: number | null; upper: number | null;
  ready: boolean; printing: boolean; homed: boolean;
  options: { id: string; label: string; command: string }[];
};
const height = (value: number | null | undefined) => typeof value === "number" ? value.toFixed(3) : "??????";

export default function ManualProbeDialog({ endpoint, openRequest, onMessage, confirm }: {
  endpoint: string; openRequest: number; onMessage: (message: string) => void;
  confirm: (title: string, message: string) => Promise<boolean>;
}) {
  const [state, setState] = useState<ProbeState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const locked = useRef(false);
  const wasActive = useRef(false);
  const generation = useRef(0);
  const applyState = useCallback((next: ProbeState) => {
    if (next.active && !wasActive.current) setOpen(true);
    if (!next.active && wasActive.current) setOpen(false);
    wasActive.current = next.active;
    setState(next);
    setSelected((current) => next.options.some((item) => item.id === current) ? current : next.options[0]?.id ?? "");
  }, []);
  useEffect(() => { if (openRequest > 0) setOpen(true); }, [openRequest]);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = generation.current;
      if (!locked.current) {
        try {
          const response = await fetch(endpoint, { cache: "no-store" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "No se pudo consultar la sondeada");
          if (!disposed && version === generation.current) { applyState(data); setError(""); }
        } catch (error) {
          if (!disposed && version === generation.current) {
            setState(null);
            setError(error instanceof Error ? error.message : "Sin conexion con Klipper");
          }
        }
      }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [endpoint, applyState]);
  const send = async (body: Record<string, string>) => {
    if (locked.current) return;
    locked.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo ejecutar la calibracion");
      applyState(data);
      if (body.action === "accept") onMessage("Posicion Z aceptada. Espera a que termine la calibracion antes de guardar la configuracion.");
      if (body.action === "abort") onMessage("Sondeada manual abortada");
    } catch (error) {
      setState(null);
      const message = error instanceof Error ? error.message : "No se pudo ejecutar la calibracion";
      setError(message);
      onMessage(message);
    } finally { locked.current = false; setBusy(false); }
  };
  const start = async () => {
    const option = state?.options.find((item) => item.id === selected);
    if (!option || locked.current) return;
    locked.current = true;
    generation.current++;
    setOpen(false);
    const accepted = await confirm("Calibrar Z", `Se ejecutara ${option.command} en la posicion actual del cabezal. Confirma que la boquilla y la cama estan preparadas y libres de obstaculos.`);
    locked.current = false;
    setOpen(true);
    if (accepted) {
      await send({ action: "start", id: option.id });
    }
  };
  const disabled = busy || !state?.ready || state.printing;
  return open ? <WidgetDialog title={state?.active ? "Sondeada manual" : "Calibrar Z"} className="manual-probe-dialog" onClose={() => setOpen(false)} footer={state?.active ? <>
    <button className="dialog-button danger" disabled={disabled} onClick={() => void send({ action: "abort" })}>Abortar</button>
    <button className="dialog-button primary" disabled={disabled} onClick={() => void send({ action: "accept" })}>Aceptar</button>
  </> : undefined}>
    {error && <p className="manual-probe-error" role="alert">{error}</p>}
    {state?.active ? <>
      <div className="manual-probe-position"><span>{height(state.lower)}</span><span>»</span><strong>{height(state.position)}</strong><span>«</span><span>{height(state.upper)}</span></div>
      <div className="manual-probe-coarse">{["--", "-", "+", "++"].map((step) => <button key={step} className="dialog-button primary" disabled={disabled} onClick={() => void send({ action: "test", step })}>{step}</button>)}</div>
      <details><summary>Avanzado</summary><div className="manual-probe-steps">{[1, -1].flatMap((sign) => [0.005, 0.01, 0.05, 0.1, 1].map((step) => <button key={`${sign}:${step}`} className="dialog-button" disabled={disabled} onClick={() => void send({ action: "test", step: String(sign * step) })}>{sign > 0 ? "+" : "−"}{step}</button>))}</div></details>
    </> : <div className="manual-probe-start">
      <label>Calibracion<select value={selected} disabled={disabled} onChange={(event) => setSelected(event.target.value)}>{state?.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <button className="dialog-button primary" disabled={disabled || !state?.homed || !selected} onClick={() => void start()}><MdStraighten /> Iniciar</button>
      {state && !state.homed && <p className="empty-note">HOME XYZ requerido</p>}
    </div>}
  </WidgetDialog> : null;
}
