"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdHome, MdKeyboardArrowDown, MdKeyboardArrowUp, MdRefresh, MdSettings } from "react-icons/md";
import { FaBroom } from "react-icons/fa6";

type TrayPayload = {
  available: boolean;
  servoAvailable: boolean;
  printing: boolean;
  state: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  temperature: number;
  target: number;
  error?: string;
};

type TrayForm = {
  profile: string;
  safePosition: number;
  purgePosition: number;
  brushPosition: number;
  dropPosition: number;
  purgeX: number;
  purgeY: number;
  purgeZ: number;
  brushX1: number;
  brushX2: number;
  brushY: number;
  brushZ: number;
  purgeLength: number;
  servoReceiveAngle: number;
  servoReleaseAngle: number;
  servoDwell: number;
  maxBlobs: number;
};

const defaults: TrayForm = {
  profile: "Stealthburner", safePosition: 30, purgePosition: 25, brushPosition: 25, dropPosition: 50,
  purgeX: 0, purgeY: 0, purgeZ: 0, brushX1: 0, brushX2: 0, brushY: 0, brushZ: 0,
  purgeLength: 60, servoReceiveAngle: 90, servoReleaseAngle: 0, servoDwell: 700, maxBlobs: 80
};

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setting(settings: Record<string, unknown> | null, name: string, fallback: number) {
  return number(settings?.[name], fallback);
}

export default function PurgeTrayWidget({ apiBase = "", locale = "es" }: { apiBase?: string; locale?: string }) {
  const es = locale.toLowerCase().startsWith("es");
  const text = useMemo(() => es ? {
    unavailable: "La configuracion de la bandeja no esta instalada.", idle: "Lista", home: "Home", safe: "Segura",
    purge: "Probar purga", clean: "Probar limpieza", drop: "Descargar", reset: "Vaciar deposito", settings: "Configurar",
    position: "Posicion", bucket: "Deposito", homed: "HOME", required: "Requerido", close: "Cerrar", save: "Guardar configuracion",
    profile: "Perfil", tray: "Posiciones de bandeja", toolhead: "Cabezal", brush: "Cepillo", purgeConfig: "Purga y deposito", servo: "Cama movil (servo 9g)", servoPending: "Servo pendiente de configurar",
    error: "No se pudo controlar la bandeja", refresh: "Actualizar", printing: "Controles bloqueados durante impresion", servoMissing: "Servo pendiente"
  } : {
    unavailable: "The purge tray configuration is not installed.", idle: "Ready", home: "Home", safe: "Safe",
    purge: "Test purge", clean: "Test cleaning", drop: "Drop", reset: "Empty bucket", settings: "Configure",
    position: "Position", bucket: "Bucket", homed: "HOME", required: "Required", close: "Close", save: "Save configuration",
    profile: "Profile", tray: "Tray positions", toolhead: "Toolhead", brush: "Brush", purgeConfig: "Purge and bucket", servo: "Moving bed (9g servo)", servoPending: "Servo configuration pending",
    error: "Unable to control purge tray", refresh: "Refresh", printing: "Controls locked while printing", servoMissing: "Servo pending"
  }, [es]);
  const [data, setData] = useState<TrayPayload | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm] = useState<TrayForm>(defaults);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/printer/tray`, { cache: "no-store" });
      const payload = await response.json() as TrayPayload;
      if (!response.ok) throw new Error(payload.error || text.error);
      setData(payload);
      const vars = payload.settings;
      if (payload.available && vars) setForm({
        profile: String(vars.profile_name ?? defaults.profile),
        safePosition: setting(vars, "safe_position", defaults.safePosition),
        purgePosition: setting(vars, "purge_position", defaults.purgePosition),
        brushPosition: setting(vars, "brush_position", defaults.brushPosition),
        dropPosition: setting(vars, "drop_position", defaults.dropPosition),
        purgeX: setting(vars, "purge_x", 0), purgeY: setting(vars, "purge_y", 0), purgeZ: setting(vars, "purge_z", 0),
        brushX1: setting(vars, "brush_x1", 0), brushX2: setting(vars, "brush_x2", 0),
        brushY: setting(vars, "brush_y", 0), brushZ: setting(vars, "brush_z", 0),
        purgeLength: setting(vars, "purge_length", defaults.purgeLength),
        servoReceiveAngle: setting(vars, "servo_receive_angle", defaults.servoReceiveAngle),
        servoReleaseAngle: setting(vars, "servo_release_angle", defaults.servoReleaseAngle),
        servoDwell: setting(vars, "servo_dwell", defaults.servoDwell),
        maxBlobs: setting(vars, "max_blobs", defaults.maxBlobs)
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : text.error); }
  }, [apiBase, text.error]);

  useEffect(() => { void load(); }, [load]);
  const operation = String(data?.state?.state ?? "idle").toLowerCase();
  useEffect(() => {
    if (!data?.available || operation === "idle" || operation === "error" || operation === "full") return;
    const timer = window.setInterval(() => void load(), 700);
    return () => window.clearInterval(timer);
  }, [data?.available, load, operation]);

  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action); setMessage("");
    const optimistic: Record<string, string> = { home: "homing", safe: "moving_safe", purge: "purging", clean: "cleaning", drop: "dropping" };
    if (optimistic[action]) {
      setData((current) => current ? { ...current, state: { ...(current.state ?? {}), state: optimistic[action] } } : current);
    }
    try {
      const response = await fetch(`${apiBase}/api/printer/tray`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const payload = await response.json() as { status?: TrayPayload; error?: string };
      if (!response.ok) throw new Error(payload.error || text.error);
      if (payload.status) setData(payload.status);
    } catch (error) { setMessage(error instanceof Error ? error.message : text.error); }
    finally { setBusy(""); }
  };

  const state = data?.state ?? {};
  const position = Math.min(50, Math.max(0, number(state.position, form.safePosition)));
  const target = Math.min(50, Math.max(0, number(state.target_position, position)));
  const blobs = Math.max(0, number(state.blob_count));
  const capacity = Math.max(1, number(state.max_blobs, form.maxBlobs));
  const homed = Boolean(state.homed);
  const full = blobs >= capacity;
  const moving = ["homing", "moving_safe", "positioning", "dropping"].includes(operation);
  const trayY = 35 + (moving ? target : position) * 2.2;
  const disabled = busy !== "" || Boolean(data?.printing);
  const input = (key: keyof TrayForm, label: string, min = -1000, max = 1000) => <label><span>{label}</span><input type="number" min={min} max={max} step="0.1" value={form[key] as number}
    onChange={(event) => setForm((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>;

  return <div className={`purge-tray-widget state-${operation}`}>
    {!data?.available ? <div className="purge-tray-unavailable"><p>{text.unavailable}</p><button type="button" onClick={() => void load()}><MdRefresh />{text.refresh}</button></div> : <>
      <div className="purge-tray-summary">
        <span className={`purge-tray-state ${operation}`}>{operation === "idle" ? text.idle : operation.replaceAll("_", " ")}</span>
        <span>{text.position} <strong>{position.toFixed(1)} / 50 mm</strong></span>
        <span>{text.bucket} <strong className={full ? "danger" : ""}>{blobs} / {capacity}</strong></span>
      </div>
      <div className="purge-tray-scene" aria-label={`${text.position}: ${position.toFixed(1)} mm`}>
        <svg viewBox="0 0 560 245" role="img">
          <g className="tray-frame"><path d="M456 20v204M490 20v204M446 224h54" /><circle cx="473" cy="218" r="19" /></g>
          <g className={`tray-carriage ${moving ? "moving" : ""}`} style={{ transform: `translateY(${trayY}px)` }}>
            <path className="tray-arm" d="M457 0H320v22h137" />
            <path className="tray-bin" d="M318-10H92v68h226z" />
            <path className={operation === "dropping" ? "tray-bed releasing" : "tray-bed"} d="M94-8h176v25H94z" />
            <g className={operation === "cleaning" ? "tray-brush brushing" : "tray-brush"}><path d="M276-24h64v21h-64z" /><path d="M283-24v-19m13 19v-24m13 24v-19m13 19v-24m12 24v-19" /></g>
          </g>
          <g className={operation === "purging" ? "tray-nozzle purging" : "tray-nozzle"}><path d="M235 3h25v32l-8 14h-9l-8-14z" /><path d="M240 3V-14h15V3" /></g>
          <circle className={`tray-blob ${operation === "purging" ? "forming" : ""} ${operation === "dropping" ? "falling" : ""}`} cx="247" cy="67" r="11" />
          <g className="tray-scale"><path d="M517 35v110" />{[0,10,20,30,40,50].map((tick) => <g key={tick}><path d={`M510 ${35 + tick * 2.2}h14`} /><text x="530" y={39 + tick * 2.2}>{tick}</text></g>)}</g>
        </svg>
        <div className="purge-tray-temperature">{Math.round(data.temperature)} / {Math.round(data.target)} C</div>
      </div>
      <div className="purge-tray-status-row">
        <span className={homed ? "ok" : "warn"}>{text.homed}: {homed ? "OK" : text.required}</span>
        {!data.servoAvailable && <span className="warn">{text.servoMissing}</span>}
        {data.printing && <span>{text.printing}</span>}
      </div>
      {message && <p className="purge-tray-message">{message}</p>}
      <div className="purge-tray-actions">
        <button type="button" disabled={disabled} onClick={() => void run("home")}><MdHome />{text.home}</button>
        <button type="button" disabled={disabled || !homed} onClick={() => void run("safe")}><MdKeyboardArrowDown />{text.safe}</button>
        <button type="button" disabled={disabled || !homed || full || !data.servoAvailable} onClick={() => void run("purge")}><MdKeyboardArrowUp />{text.purge}</button>
        <button type="button" disabled={disabled || !homed} onClick={() => void run("clean")}><FaBroom />{text.clean}</button>
        <button type="button" disabled={disabled || !homed || !data.servoAvailable} onClick={() => void run("drop")}><MdKeyboardArrowDown />{text.drop}</button>
        <button type="button" disabled={disabled || blobs === 0} onClick={() => void run("reset")} title={text.reset}>{text.reset}</button>
        <button className="icon-only" type="button" title={text.settings} aria-label={text.settings} onClick={() => setSettingsOpen(true)}><MdSettings /></button>
      </div>
    </>}
    {settingsOpen && typeof document !== "undefined" && createPortal(<div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
      <section className="options-modal purge-tray-settings" role="dialog" aria-modal="true" aria-labelledby="purge-tray-settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="purge-tray-settings-title">{text.settings}</h2><button className="modal-icon-button" type="button" onClick={() => setSettingsOpen(false)} aria-label={text.close}><MdClose /></button></header>
        <div className="purge-tray-settings-body">
          <label><span>{text.profile}</span><input value={form.profile} maxLength={32} onChange={(event) => setForm((current) => ({ ...current, profile: event.target.value }))} /></label>
          <fieldset><legend>{text.tray}</legend>{input("safePosition", "Segura", 0, 50)}{input("purgePosition", "Purga", 0, 50)}{input("brushPosition", "Cepillo", 0, 50)}{input("dropPosition", "Descarga", 0, 50)}</fieldset>
          <fieldset><legend>{text.toolhead}</legend>{input("purgeX", "Purga X")}{input("purgeY", "Purga Y")}{input("purgeZ", "Purga Z", -5, 500)}</fieldset>
          <fieldset><legend>{text.brush}</legend>{input("brushX1", "X inicial")}{input("brushX2", "X final")}{input("brushY", "Y")}{input("brushZ", "Z", -5, 500)}</fieldset>
          <fieldset><legend>{text.purgeConfig}</legend>{input("purgeLength", "Filamento (mm)", 0, 500)}{input("maxBlobs", "Capacidad", 1, 10000)}</fieldset>
          <fieldset><legend>{text.servo}</legend>{input("servoReceiveAngle", "Angulo de recepcion", 0, 180)}{input("servoReleaseAngle", "Angulo de descarga", 0, 180)}{input("servoDwell", "Espera (ms)", 100, 10000)}{!data?.servoAvailable && <p className="purge-tray-servo-pending">{text.servoPending}</p>}</fieldset>
        </div>
        <footer><button type="button" className="dialog-button" onClick={() => setSettingsOpen(false)}>{text.close}</button><button type="button" className="dialog-button primary" disabled={busy !== ""}
          onClick={() => void run("configure", form).then(() => setSettingsOpen(false))}>{text.save}</button></footer>
      </section>
    </div>, document.body)}
  </div>;
}
