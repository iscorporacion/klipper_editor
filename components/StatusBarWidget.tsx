"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdCloudUpload, MdLightMode, MdPlayArrow, MdPowerSettingsNew, MdRefresh, MdRestartAlt, MdSettings, MdVisibility, MdVisibilityOff } from "react-icons/md";
import RichTooltip from "@/components/RichTooltip";

const stateNames = ["startup", "standby", "homing", "heating", "printing", "paused", "mmu", "complete", "cancelled", "error"] as const;
type StateName = typeof stateNames[number];
type EffectName = "STATIC" | "CYLON" | "BREATHING" | "BLINK" | "COMET" | "FIRE" | "PROGRESS" | "HEATER";
type StateConfig = { effect: EffectName; color: string; secondary: string; speed: number };
type FormState = Record<StateName, StateConfig> & { brightness: number; automatic: boolean };
type Payload = { available: boolean; printing: boolean; state: Record<string, unknown> | null; settings: Record<string, unknown> | null; bedTemperature: number; bedTarget: number; printProgress: number; printState: string; filamentColor: string; error?: string };
type SyncStatus = { enabled: boolean; writable: boolean; installed: boolean; current: boolean; restartRequired?: boolean };

const defaults: FormState = {
  brightness: .7, automatic: true,
  startup: { effect: "COMET", color: "#0078ff", secondary: "#000f2d", speed: .7 },
  standby: { effect: "CYLON", color: "#f3e821", secondary: "#1e1c02", speed: 1 },
  homing: { effect: "COMET", color: "#2896ff", secondary: "#000f28", speed: .8 },
  heating: { effect: "HEATER", color: "#ff2300", secondary: "#ffbe00", speed: .7 },
  printing: { effect: "PROGRESS", color: "#0078ff", secondary: "#030303", speed: 1 },
  paused: { effect: "BREATHING", color: "#ff9100", secondary: "#140500", speed: 1.2 },
  mmu: { effect: "COMET", color: "#aa46ff", secondary: "#0f021e", speed: .8 },
  complete: { effect: "CYLON", color: "#00ff50", secondary: "#001905", speed: 1 },
  cancelled: { effect: "BLINK", color: "#ff2d14", secondary: "#140000", speed: 1 },
  error: { effect: "BLINK", color: "#ff0000", secondary: "#190000", speed: .45 }
};

function csvColor(value: unknown, fallback: string) {
  const parts = String(value ?? "").split(",").map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? `#${parts.map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0")).join("")}` : fallback;
}

function isTransientKlipperDisconnect(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /Klippy Host not connected|HTTP 503|"code"\s*:\s*503|fetch failed|Unexpected token ['"]?<['"]?/i.test(message);
}

export default function StatusBarWidget({ apiBase = "", locale = "es" }: { apiBase?: string; locale?: string }) {
  const es = locale.toLowerCase().startsWith("es");
  const labels = useMemo(() => es ? {
    unavailable: "La configuracion de la barra LED no esta instalada.", settings: "Configurar barra LED", install: "Instalar configuracion", update: "Actualizar configuracion", restart: "Reiniciar Klipper", close: "Cerrar", save: "Guardar configuracion", restore: "Restaurar automatico", automatic: "Cambiar automaticamente con el estado de la impresora", brightness: "Brillo maximo", effect: "Efecto", primary: "Principal", secondary: "Secundario", speed: "Velocidad", visible: "Visible", hidden: "Oculta", configOutdated: "La configuracion instalada no coincide con esta version del widget."
  } : {
    unavailable: "The LED status bar configuration is not installed.", settings: "Configure LED status bar", install: "Install configuration", update: "Update configuration", restart: "Restart Klipper", close: "Close", save: "Save configuration", restore: "Restore automatic", automatic: "Automatically follow printer state", brightness: "Maximum brightness", effect: "Effect", primary: "Primary", secondary: "Secondary", speed: "Speed", visible: "Visible", hidden: "Hidden", configOutdated: "The installed configuration does not match this widget version."
  }, [es]);
  const stateLabels: Record<StateName, string> = es
    ? { startup: "Inicio", standby: "Espera", homing: "Homing", heating: "Calentando", printing: "Imprimiendo", paused: "Pausada", mmu: "Cambio MMU", complete: "Finalizada", cancelled: "Cancelada", error: "Error" }
    : { startup: "Startup", standby: "Standby", homing: "Homing", heating: "Heating", printing: "Printing", paused: "Paused", mmu: "MMU change", complete: "Complete", cancelled: "Cancelled", error: "Error" };
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState<FormState>(defaults);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [sync, setSync] = useState<SyncStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/printer/status-bar`, { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error || "Status bar unavailable");
      setData(payload); setMessage("");
      if (payload.available && payload.settings && !open) {
        const next = { ...defaults } as FormState;
        next.brightness = Number(payload.settings.brightness) || defaults.brightness;
        next.automatic = Number(payload.settings.automatic) !== 0;
        for (const state of stateNames) next[state] = {
          effect: String(payload.settings[`${state}_effect`] ?? defaults[state].effect).toUpperCase() as EffectName,
          color: csvColor(payload.settings[`${state}_color`], defaults[state].color),
          secondary: csvColor(payload.settings[`${state}_secondary`], defaults[state].secondary),
          speed: Number(payload.settings[`${state}_speed`]) || defaults[state].speed
        };
        setForm(next);
      }
    } catch (error) {
      setMessage(isTransientKlipperDisconnect(error) ? "" : error instanceof Error ? error.message : "Status bar unavailable");
    }
  }, [apiBase, open]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load(), 2000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => { void fetch(`${apiBase}/api/dev/widget-config?widget=statusbar`, { cache: "no-store" }).then(async (response) => response.ok ? setSync(await response.json()) : setSync(null)).catch(() => setSync(null)); }, [apiBase]);

  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action); setMessage("");
    try {
      const response = await fetch(`${apiBase}/api/printer/status-bar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const payload = await response.json() as { status?: Payload; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to control status bar");
      if (payload.status) setData(payload.status);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to control status bar"); }
    finally { setBusy(""); }
  };
  const manage = async (action: "install" | "restart") => {
    setBusy(action);
    try {
      const response = await fetch(`${apiBase}/api/dev/widget-config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ widget: "statusbar", action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to manage configuration");
      if (action === "install") setSync((current) => ({ ...(current ?? { enabled: true, writable: true, installed: false, current: false }), ...payload }));
      else window.setTimeout(() => void load(), 3500);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to manage configuration"); }
    finally { setBusy(""); }
  };

  const state = String(data?.state?.state_name ?? "standby").toLowerCase() as StateName;
  const active = stateNames.includes(state) ? state : "standby";
  const effect = String(data?.state?.effect ?? form[active].effect).toLowerCase();
  const color = csvColor(data?.state?.color, form[active].color);
  const secondary = csvColor(data?.state?.secondary, form[active].secondary);
  const visible = Number(data?.state?.visible ?? 1) !== 0;
  const progress = active === "heating" ? Math.min(1, data?.bedTarget ? data.bedTemperature / data.bedTarget : 0) : data?.printProgress ?? 0;
  const sceneStyle = { "--status-led-primary": color, "--status-led-secondary": secondary, "--status-led-speed": `${Math.max(.15, Number(data?.state?.speed) || 1)}s` } as CSSProperties;

  if (!data?.available) return <div className="statusbar-unavailable"><p>{labels.unavailable}</p>{message && <p className="statusbar-message">{message}</p>}<div><button onClick={() => void load()}><MdRefresh />Actualizar</button>{sync?.enabled && <button disabled={busy !== "" || !sync.writable} onClick={() => void manage("install")}><MdCloudUpload />{sync.installed ? labels.update : labels.install}</button>}{sync?.restartRequired && <button disabled={busy !== ""} onClick={() => void manage("restart")}><MdRestartAlt />{labels.restart}</button>}</div></div>;

  return <div className={`statusbar-widget effect-${effect} state-${active} ${visible ? "" : "is-hidden"}`} style={sceneStyle}>
    <div className="statusbar-summary"><span className="statusbar-live-dot" /><strong>{stateLabels[active]}</strong><span>{form[active].effect}</span><span>{visible ? labels.visible : labels.hidden}</span></div>
    <div className="statusbar-strip" role="img" aria-label={`${stateLabels[active]}: ${effect}`}>{Array.from({ length: 18 }, (_, index) => <span key={index} className={index / 18 < progress ? "filled" : ""} style={{ "--status-led-index": index } as CSSProperties} />)}</div>
    <div className="statusbar-metrics">{active === "heating" && <span>{Math.round(data.bedTemperature)} / {Math.round(data.bedTarget)} C</span>}{active === "printing" && <span>{Math.round(data.printProgress * 100)}%</span>}</div>
    {message && <p className="statusbar-message">{message}</p>}
    <div className="statusbar-actions">
      <RichTooltip content={visible ? "Ocultar" : "Mostrar"}><button disabled={busy !== ""} onClick={() => void run(visible ? "hide" : "show")}>{visible ? <MdVisibilityOff /> : <MdVisibility />}</button></RichTooltip>
      <RichTooltip content="Color estatico"><button disabled={busy !== ""} onClick={() => void run("color", { color: form.standby.color })}><MdLightMode /></button></RichTooltip>
      <RichTooltip content={labels.restore}><button disabled={busy !== ""} onClick={() => void run("restore")}><MdRefresh /></button></RichTooltip>
      <RichTooltip content="Apagar"><button disabled={busy !== ""} onClick={() => void run("off")}><MdPowerSettingsNew /></button></RichTooltip>
      <RichTooltip content={labels.settings}><button disabled={busy !== ""} onClick={() => setOpen(true)}><MdSettings /></button></RichTooltip>
    </div>
    {open && createPortal(<div className="modal-backdrop" onMouseDown={() => setOpen(false)}><section className="options-modal statusbar-settings" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>{labels.settings}</h2><button className="modal-icon-button" onClick={() => setOpen(false)} aria-label={labels.close}><MdClose /></button></header>
      <div className="statusbar-settings-body">
        {sync?.enabled && (!sync.current || sync.restartRequired) && <div className="statusbar-config-sync"><span>{labels.configOutdated}</span>{!sync.current && <button disabled={busy !== "" || !sync.writable} onClick={() => void manage("install")}><MdCloudUpload />{labels.update}</button>}{sync.restartRequired && <button disabled={busy !== ""} onClick={() => void manage("restart")}><MdRestartAlt />{labels.restart}</button>}</div>}
        <div className="statusbar-general"><label><span>{labels.brightness}: {Math.round(form.brightness * 100)}%</span><input type="range" min="0.05" max="1" step="0.05" value={form.brightness} onChange={(event) => setForm((current) => ({ ...current, brightness: Number(event.target.value) }))} /></label><label className="setting-checkbox"><input type="checkbox" checked={form.automatic} onChange={(event) => setForm((current) => ({ ...current, automatic: event.target.checked }))} /><span>{labels.automatic}</span></label></div>
        <div className="statusbar-state-grid">{stateNames.map((name) => <fieldset key={name}><legend>{stateLabels[name]}</legend><div className={`statusbar-mini-preview effect-${form[name].effect.toLowerCase()}`} style={{ "--status-led-primary": form[name].color, "--status-led-secondary": form[name].secondary, "--status-led-speed": `${form[name].speed}s` } as CSSProperties}>{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--status-led-index": index } as CSSProperties} />)}</div><label><span>{labels.effect}</span><select value={form[name].effect} onChange={(event) => setForm((current) => ({ ...current, [name]: { ...current[name], effect: event.target.value as EffectName } }))}>{["STATIC","CYLON","BREATHING","BLINK","COMET","FIRE","PROGRESS","HEATER"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>{labels.primary}</span><input type="color" value={form[name].color} onChange={(event) => setForm((current) => ({ ...current, [name]: { ...current[name], color: event.target.value } }))} /></label><label><span>{labels.secondary}</span><input type="color" value={form[name].secondary} onChange={(event) => setForm((current) => ({ ...current, [name]: { ...current[name], secondary: event.target.value } }))} /></label><label><span>{labels.speed}</span><input type="number" min="0.05" max="10" step="0.05" value={form[name].speed} onChange={(event) => setForm((current) => ({ ...current, [name]: { ...current[name], speed: Number(event.target.value) } }))} /></label><RichTooltip content={`${stateLabels[name]} - Play`}><button className="statusbar-test" disabled={busy !== ""} onClick={() => void run("test", { state: name.toUpperCase(), ...form[name] })}><MdPlayArrow /></button></RichTooltip></fieldset>)}</div>
      </div>
      <footer><button className="dialog-button" onClick={() => setOpen(false)}>{labels.close}</button><button className="dialog-button" disabled={busy !== ""} onClick={() => void run("restore")}>{labels.restore}</button><button className="dialog-button primary" disabled={busy !== ""} onClick={() => void run("configure", form).then(() => setOpen(false))}>{labels.save}</button></footer>
    </section></div>, document.body)}
  </div>;
}
