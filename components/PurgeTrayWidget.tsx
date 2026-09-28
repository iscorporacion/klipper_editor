"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MdAdd, MdCloudUpload, MdClose, MdHelpOutline, MdHome, MdKeyboardArrowDown, MdKeyboardArrowUp, MdPlayArrow, MdRefresh, MdRemove, MdRestartAlt, MdSettings } from "react-icons/md";
import { FaBroom } from "react-icons/fa6";
import RichTooltip from "@/components/RichTooltip";

type TrayPayload = {
  available: boolean;
  servoAvailable: boolean;
  filamentColor: string;
  allAxesHomed: boolean;
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
  bedSafeZ: number;
  brushX1: number;
  brushX2: number;
  brushY: number;
  purgeLength: number;
  blobDescent: number;
  servoReceiveAngle: number;
  servoReleaseAngle: number;
  servoDwell: number;
  maxBlobs: number;
};

type SyncStatus = {
  enabled: boolean;
  writable: boolean;
  installed: boolean;
  current: boolean;
  restartRequired?: boolean;
  error?: string;
};

const defaults: TrayForm = {
  profile: "Stealthburner", safePosition: 30, purgePosition: 25, brushPosition: 25, dropPosition: 50,
  purgeX: 0, purgeY: 0, bedSafeZ: 10, brushX1: 0, brushX2: 0, brushY: 0,
  purgeLength: 60, blobDescent: 5, servoReceiveAngle: 90, servoReleaseAngle: 0, servoDwell: 700, maxBlobs: 80
};

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setting(settings: Record<string, unknown> | null, name: string, fallback: number) {
  return number(settings?.[name], fallback);
}

function friendlyError(value: unknown, fallback: string) {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  const readable = raw.replaceAll("\\n", "\n").replaceAll('\\"', '"');
  const commandErrors = [...readable.matchAll(/gcode\.CommandError:\s*([^\n]+)/g)];
  const detail = commandErrors.at(-1)?.[1]?.trim();
  if (detail) return detail.replace(/["}]+$/, "");
  const message = readable.match(/"message"\s*:\s*"([^"]+)"/)?.[1]?.trim();
  return message && message !== "Unknown" ? message : fallback;
}

export default function PurgeTrayWidget({ apiBase = "", locale = "es" }: { apiBase?: string; locale?: string }) {
  const es = locale.toLowerCase().startsWith("es");
  const text = useMemo(() => es ? {
    unavailable: "La configuracion de la bandeja no esta instalada.", idle: "Lista", home: "Home", safe: "Segura",
    purge: "Probar purga", clean: "Probar limpieza", drop: "Descargar", reset: "Vaciar deposito", settings: "Configurar",
    position: "Posicion", bucket: "Deposito", homed: "HOME", required: "Requerido", close: "Cerrar", save: "Guardar configuracion",
    profile: "Perfil", tray: "Posiciones de bandeja", toolhead: "Cabezal", brush: "Cepillo", purgeConfig: "Purga y deposito", servo: "Cama movil (servo 9g)", servoPending: "Servo pendiente de configurar",
    error: "No se pudo controlar la bandeja", refresh: "Actualizar", printing: "Controles bloqueados durante impresion", servoMissing: "Servo pendiente", testReceive: "Probar recepcion", testRelease: "Probar descarga",
    install: "Instalar configuracion", update: "Actualizar configuracion", restart: "Reiniciar Klipper", confirmRestart: "¿Reiniciar Klipper para cargar la configuracion de la bandeja?", readOnly: "Moonraker no permite escribir en config.", xyzRequired: "HOME XYZ requerido", configOutdated: "La configuracion instalada no coincide con esta version del widget.", increment: "Incremento de movimiento", testPosition: "Probar posicion", testStart: "Probar inicio", testEnd: "Probar final"
  } : {
    unavailable: "The purge tray configuration is not installed.", idle: "Ready", home: "Home", safe: "Safe",
    purge: "Test purge", clean: "Test cleaning", drop: "Drop", reset: "Empty bucket", settings: "Configure",
    position: "Position", bucket: "Bucket", homed: "HOME", required: "Required", close: "Close", save: "Save configuration",
    profile: "Profile", tray: "Tray positions", toolhead: "Toolhead", brush: "Brush", purgeConfig: "Purge and bucket", servo: "Moving bed (9g servo)", servoPending: "Servo configuration pending",
    error: "Unable to control purge tray", refresh: "Refresh", printing: "Controls locked while printing", servoMissing: "Servo pending", testReceive: "Test receive", testRelease: "Test release",
    install: "Install configuration", update: "Update configuration", restart: "Restart Klipper", confirmRestart: "Restart Klipper to load the purge tray configuration?", readOnly: "Moonraker does not allow writes to config.", xyzRequired: "XYZ HOME required", configOutdated: "The installed configuration does not match this widget version.", increment: "Movement increment", testPosition: "Test position", testStart: "Test start", testEnd: "Test end"
  }, [es]);
  const help: Record<keyof TrayForm | "profile", string> = useMemo(() => es ? {
    profile: "Nombre del conjunto de ajustes para distinguir cabezales o impresoras.",
    safePosition: "Posicion de auxiliar_z a la que vuelve la bandeja despues de HOME y al terminar.",
    purgePosition: "Posicion absoluta de auxiliar_z donde comienza la formacion de la bola.",
    brushPosition: "Posicion absoluta de auxiliar_z durante la limpieza. No es el eje Z del cabezal.",
    dropPosition: "Posicion de auxiliar_z donde el servo retrae la cama y descarga la bola.",
    purgeX: "Coordenada X absoluta del cabezal donde se realiza la purga.",
    purgeY: "Coordenada Y absoluta del cabezal que lo alinea con la bandeja.",
    bedSafeZ: "Posicion Z de seguridad de la impresora. En una Trident mueve la cama principal y no ajusta la altura de la bandeja.",
    brushX1: "Primer extremo X del recorrido de limpieza sobre las cerdas.",
    brushX2: "Segundo extremo X del recorrido de limpieza sobre las cerdas.",
    brushY: "Coordenada Y del cabezal que lo alinea con el cepillo.",
    purgeLength: "Cantidad total de filamento, en milimetros, extruida para formar cada bola.",
    blobDescent: "Distancia que baja lentamente auxiliar_z mientras se extruye la bola.",
    maxBlobs: "Numero estimado de bolas que caben antes de marcar el deposito como lleno.",
    servoReceiveAngle: "Angulo que coloca la cama movil debajo de la boquilla para recibir la bola.",
    servoReleaseAngle: "Angulo que retrae la cama movil para dejar caer la bola.",
    servoDwell: "Tiempo de espera en milisegundos despues de cada movimiento del servo."
  } : {
    profile: "Name of this settings set, used to distinguish toolheads or printers.",
    safePosition: "Auxiliary Z position used after HOME and when an operation finishes.",
    purgePosition: "Absolute auxiliary Z position where blob formation begins.",
    brushPosition: "Absolute auxiliary Z position used while cleaning. This is not toolhead Z.",
    dropPosition: "Auxiliary Z position where the servo retracts the bed and drops the blob.",
    purgeX: "Absolute toolhead X coordinate used for purging.",
    purgeY: "Absolute toolhead Y coordinate that aligns it with the purge tray.",
    bedSafeZ: "Safe printer Z position. On a Trident this moves the main bed and does not adjust tray height.",
    brushX1: "First X endpoint of the wiping travel across the brush.",
    brushX2: "Second X endpoint of the wiping travel across the brush.",
    brushY: "Toolhead Y coordinate that aligns the nozzle with the brush.",
    purgeLength: "Total millimeters of filament extruded to create each blob.",
    blobDescent: "Distance auxiliary Z slowly lowers while the blob is extruded.",
    maxBlobs: "Estimated number of blobs the bucket holds before being marked full.",
    servoReceiveAngle: "Angle that positions the moving bed below the nozzle to receive a blob.",
    servoReleaseAngle: "Angle that retracts the moving bed and releases the blob.",
    servoDwell: "Delay in milliseconds after each servo movement."
  }, [es]);
  const [data, setData] = useState<TrayPayload | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm] = useState<TrayForm>(defaults);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState("");
  const [movementIncrement, setMovementIncrement] = useState(1);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/printer/tray`, { cache: "no-store" });
      const payload = await response.json() as TrayPayload;
      if (!response.ok) throw new Error(payload.error || text.error);
      setData(payload);
      setMessage("");
      const vars = payload.settings;
      if (payload.available && vars && !settingsOpen) setForm({
        profile: String(vars.profile_name ?? defaults.profile),
        safePosition: setting(vars, "safe_position", defaults.safePosition),
        purgePosition: setting(vars, "purge_position", defaults.purgePosition),
        brushPosition: setting(vars, "brush_position", defaults.brushPosition),
        dropPosition: setting(vars, "drop_position", defaults.dropPosition),
        purgeX: setting(vars, "purge_x", 0), purgeY: setting(vars, "purge_y", 0), bedSafeZ: setting(vars, "clear_z", defaults.bedSafeZ),
        brushX1: setting(vars, "brush_x1", 0), brushX2: setting(vars, "brush_x2", 0),
        brushY: setting(vars, "brush_y", 0),
        purgeLength: setting(vars, "purge_length", defaults.purgeLength),
        blobDescent: setting(vars, "blob_descent", defaults.blobDescent),
        servoReceiveAngle: setting(vars, "servo_receive_angle", defaults.servoReceiveAngle),
        servoReleaseAngle: setting(vars, "servo_release_angle", defaults.servoReleaseAngle),
        servoDwell: setting(vars, "servo_dwell", defaults.servoDwell),
        maxBlobs: setting(vars, "max_blobs", defaults.maxBlobs)
      });
    } catch (error) { setMessage(friendlyError(error, text.error)); }
  }, [apiBase, settingsOpen, text.error]);

  useEffect(() => { void load(); }, [load]);
  const loadSyncStatus = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/dev/widget-config?widget=tray`, { cache: "no-store" });
      if (response.status === 404) return setSyncStatus(null);
      const payload = await response.json() as SyncStatus;
      setSyncStatus(payload.enabled ? payload : null);
    } catch { setSyncStatus(null); }
  }, [apiBase]);
  useEffect(() => { void loadSyncStatus(); }, [loadSyncStatus]);
  const operation = String(data?.state?.state ?? "idle").toLowerCase();
  useEffect(() => {
    if (!data?.available) return;
    const active = operation !== "idle" && operation !== "error" && operation !== "full";
    const timer = window.setInterval(() => void load(), active ? 700 : 2500);
    return () => window.clearInterval(timer);
  }, [data?.available, load, operation]);

  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action); setMessage("");
    const optimistic: Record<string, string> = { home: "homing", safe: "moving_safe", purge: "purging", clean: "cleaning", drop: "dropping" };
    if (optimistic[action] && !(action === "home" && !data?.allAxesHomed)) {
      const targetPosition = action === "home" ? 0
        : action === "clean" ? form.brushPosition
          : action === "purge" ? form.purgePosition
            : action === "safe" ? form.safePosition
              : action === "drop" ? form.dropPosition : undefined;
      setData((current) => current ? { ...current, state: { ...(current.state ?? {}), state: optimistic[action], ...(targetPosition !== undefined ? { target_position: targetPosition } : {}) } } : current);
    }
    try {
      const response = await fetch(`${apiBase}/api/printer/tray`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const payload = await response.json() as { status?: TrayPayload; error?: string };
      if (!response.ok) throw new Error(payload.error || text.error);
      if (payload.status) setData(payload.status);
    } catch (error) { setMessage(friendlyError(error, text.error)); }
    finally { setBusy(""); }
  };

  const manageConfig = async (action: "install" | "restart") => {
    if (action === "restart" && !window.confirm(text.confirmRestart)) return;
    setSyncBusy(action); setMessage("");
    try {
      const response = await fetch(`${apiBase}/api/dev/widget-config`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widget: "tray", action })
      });
      const payload = await response.json() as SyncStatus;
      if (!response.ok) throw new Error(payload.error || text.error);
      if (action === "install") setSyncStatus((current) => ({ ...(current ?? { enabled: true, writable: true, installed: false, current: false }), ...payload }));
      if (action === "restart") {
        setSyncStatus((current) => current ? { ...current, restartRequired: false } : current);
        window.setTimeout(() => { void load(); void loadSyncStatus(); }, 3500);
      }
    } catch (error) { setMessage(friendlyError(error, text.error)); }
    finally { setSyncBusy(""); }
  };

  const state = data?.state ?? {};
  const position = Math.min(50, Math.max(0, number(state.position, form.safePosition)));
  const target = Math.min(50, Math.max(0, number(state.target_position, position)));
  const blobs = Math.max(0, number(state.blob_count));
  const capacity = Math.max(1, number(state.max_blobs, form.maxBlobs));
  const homed = Boolean(state.homed);
  const full = blobs >= capacity;
  const fillPercent = Math.min(100, Math.max(0, blobs / capacity * 100));
  const moving = ["homing", "moving_safe", "positioning", "dropping"].includes(operation);
  const trayY = 57 + (moving ? target : position) * 1.5;
  const disabled = busy !== "" || Boolean(data?.printing);
  const fieldTitle = (label: string, description: string) => <span className="purge-tray-field-title"><span>{label}</span><RichTooltip placement="top" content={<span className="rich-tooltip-stack"><strong>{label}</strong><span>{description}</span></span>}><span className="purge-tray-help" role="button" tabIndex={0} aria-label={`${label}: ${description}`}><MdHelpOutline /></span></RichTooltip></span>;
  const input = (key: keyof TrayForm, label: string, min = -1000, max = 1000) => <label>{fieldTitle(label, help[key])}<input type="number" min={min} max={max} step="0.1" value={form[key] as number}
    onChange={(event) => setForm((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>;
  const nudge = (key: keyof TrayForm, direction: -1 | 1, min = -1000, max = 1000) => {
    setForm((current) => ({ ...current, [key]: Math.min(max, Math.max(min, Number(((current[key] as number) + movementIncrement * direction).toFixed(3)))) }));
  };
  const calibrationInput = (key: keyof TrayForm, label: string, min = -1000, max = 1000, onTest?: () => void) => <label>{fieldTitle(label, help[key])}<span className="purge-tray-calibration-input">
    <button type="button" onClick={() => nudge(key, -1, min, max)} aria-label={`${label} -${movementIncrement}`}><MdRemove /></button>
    <input type="number" min={min} max={max} step="0.1" value={form[key] as number} onChange={(event) => setForm((current) => ({ ...current, [key]: Number(event.target.value) }))} />
    <button type="button" onClick={() => nudge(key, 1, min, max)} aria-label={`${label} +${movementIncrement}`}><MdAdd /></button>
    {onTest && <RichTooltip placement="top" content={text.testPosition}><button className="purge-tray-inline-test" type="button" disabled={busy !== "" || !homed || Boolean(data?.printing)} onClick={onTest} aria-label={`${text.testPosition}: ${label}`}><MdPlayArrow /></button></RichTooltip>}
  </span></label>;
  const testCalibration = (mode: "PURGE" | "BRUSH_START" | "BRUSH_END") => {
    const purge = mode === "PURGE";
    return run("calibrate-position", {
      mode,
      trayPosition: purge ? form.purgePosition : form.brushPosition,
      x: purge ? form.purgeX : mode === "BRUSH_START" ? form.brushX1 : form.brushX2,
      y: purge ? form.purgeY : form.brushY
    });
  };
  const nozzleGraphic = <g className={`tray-nozzle ${operation === "purging" ? "purging" : ""} ${operation === "cleaning" ? "cleaning" : ""}`}
    style={operation === "cleaning" ? { "--tray-clean-y": `${trayY - 69}px` } as CSSProperties : undefined}>
    <path className="tray-nozzle-body" d="M194 0h27v25h-27z" />
    <path className="tray-nozzle-tip" d="M199 25h17v14l-6 11h-5l-6-11z" />
    <path className="tray-nozzle-neck" d="M201 0v-12h13V0" />
  </g>;

  return <div className={`purge-tray-widget state-${operation}`} style={{ "--tray-filament-color": data?.filamentColor || "#7457e8" } as CSSProperties}>
    {!data?.available ? <div className="purge-tray-unavailable">
      <p>{text.unavailable}</p>
      {message && <p className="purge-tray-message">{message}</p>}
      <div className="purge-tray-unavailable-actions">
        <button type="button" onClick={() => void load()}><MdRefresh />{text.refresh}</button>
        {syncStatus?.enabled && <button type="button" disabled={syncBusy !== "" || !syncStatus.writable} onClick={() => void manageConfig("install")}><MdCloudUpload />{syncStatus.installed ? text.update : text.install}</button>}
        {syncStatus?.restartRequired && <button type="button" disabled={syncBusy !== ""} onClick={() => void manageConfig("restart")}><MdRestartAlt />{text.restart}</button>}
      </div>
      {syncStatus?.enabled && !syncStatus.writable && <p className="purge-tray-servo-pending">{text.readOnly}</p>}
    </div> : <>
      <div className="purge-tray-summary">
        <span className={`purge-tray-state ${operation}`}>{operation === "idle" ? text.idle : operation.replaceAll("_", " ")}</span>
        <span>{text.position} <strong>{position.toFixed(1)} / 50 mm</strong></span>
        <span>{text.bucket} <strong className={full ? "danger" : ""}>{blobs} / {capacity}</strong></span>
      </div>
      <div className="purge-tray-scene" aria-label={`${text.position}: ${position.toFixed(1)} mm`}>
        <svg viewBox="0 0 460 205" role="img">
          <g className="tray-frame"><path d="M356 32v158M376 32v158M346 190h40" /><circle cx="366" cy="184" r="13" /></g>
          {operation === "cleaning" && nozzleGraphic}
          <g className={`tray-carriage ${moving ? "moving" : ""}`} style={{ transform: `translateY(${trayY}px)` }}>
            <path className="tray-arm" d="M357 0H251v22h106" />
            <path className="tray-height-block" d="M342-13h34v48h-34z" />
            <path className="tray-height-arrow" d="M377 0h14m0 0-5-4m5 4-5 4" />
            <path className="tray-bin" d="M155 16v44h96V16" />
            <rect className="tray-bin-fill" x="159" y={56 - (36 * fillPercent / 100)} width="88" height={36 * fillPercent / 100} />
            <text className="tray-bin-label" x="203" y="53">{Math.round(fillPercent)}%</text>
            <g className={operation === "dropping" ? "tray-slide releasing" : "tray-slide"}>
              <path className="tray-slide-base" d="M118 1h128v14H118z" />
              <path className="tray-bed" d="M176-7h72v9h-72z" />
            </g>
            <path className="tray-stop" d="M154-12h22v7h-22z" />
            <g className={operation === "cleaning" ? "tray-brush brushing" : "tray-brush"}><path d="M270-12h64v10h-64z" /><path d="M277-12v-17m13 17v-22m13 22v-17m13 17v-22m12 22v-17" /></g>
          </g>
          {operation !== "cleaning" && nozzleGraphic}
          <g className="tray-blob-level" style={{ transform: `translateY(${trayY}px)` }}><circle className={`tray-blob ${operation === "purging" ? "forming" : ""} ${operation === "dropping" ? "falling" : ""}`} cx="208" cy="-14" r="8" /></g>
          <g className="tray-scale"><path d="M402 57v75" />{[0,10,20,30,40,50].map((tick) => <g key={tick}><path d={`M395 ${57 + tick * 1.5}h14`} /><text x="415" y={61 + tick * 1.5}>{tick}</text></g>)}</g>
        </svg>
        <div className="purge-tray-temperature">{Math.round(data.temperature)} / {Math.round(data.target)} C</div>
      </div>
      <div className="purge-tray-status-row">
        <span className={homed ? "ok" : "warn"}>{text.homed}: {homed ? "OK" : text.required}</span>
        {!data.allAxesHomed && <span className="warn">{text.xyzRequired}</span>}
        {!data.servoAvailable && <span className="warn">{text.servoMissing}</span>}
        {data.printing && <span>{text.printing}</span>}
      </div>
      {message && <p className="purge-tray-message">{message}</p>}
      <div className="purge-tray-actions">
        <button type="button" disabled={disabled || !data.allAxesHomed} onClick={() => void run("home")} title={!data.allAxesHomed ? text.xyzRequired : text.home}><MdHome />{text.home}</button>
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
          {syncStatus?.enabled && (!syncStatus.current || syncStatus.restartRequired) && <div className="purge-tray-config-sync">
            <span>{text.configOutdated}</span>
            {!syncStatus.current && <button type="button" disabled={syncBusy !== "" || !syncStatus.writable} onClick={() => void manageConfig("install")}><MdCloudUpload />{text.update}</button>}
            {syncStatus.restartRequired && <button type="button" disabled={syncBusy !== ""} onClick={() => void manageConfig("restart")}><MdRestartAlt />{text.restart}</button>}
          </div>}
          <div className="purge-tray-settings-heading"><label>{fieldTitle(text.profile, help.profile)}<input value={form.profile} maxLength={32} onChange={(event) => setForm((current) => ({ ...current, profile: event.target.value }))} /></label>
            <label className="purge-tray-increment">{fieldTitle(text.increment, es ? "Cantidad que suman o restan los botones de calibracion." : "Amount added or subtracted by the calibration buttons.")}<input type="number" min="0.01" max="50" step="0.01" value={movementIncrement} onChange={(event) => setMovementIncrement(Math.min(50, Math.max(0.01, Number(event.target.value) || 0.01)))} /></label>
            {calibrationInput("bedSafeZ", es ? "Cama Z segura" : "Safe bed Z", 0, 500)}
          </div>
          <fieldset><legend>{text.tray}</legend>{calibrationInput("safePosition", "Segura", 0, 50, () => void run("move", { position: form.safePosition }))}{calibrationInput("purgePosition", "Purga", 0, 50, () => void run("move", { position: form.purgePosition }))}{calibrationInput("brushPosition", "Cepillo", 0, 50, () => void run("move", { position: form.brushPosition }))}{calibrationInput("dropPosition", "Descarga", 0, 50, () => void run("move", { position: form.dropPosition }))}</fieldset>
          <fieldset><legend>{text.toolhead}</legend>{calibrationInput("purgeX", "Purga X", -1000, 1000, () => void testCalibration("PURGE"))}{calibrationInput("purgeY", "Purga Y", -1000, 1000, () => void testCalibration("PURGE"))}</fieldset>
          <fieldset><legend>{text.brush}</legend>{calibrationInput("brushX1", "X inicial", -1000, 1000, () => void testCalibration("BRUSH_START"))}{calibrationInput("brushX2", "X final", -1000, 1000, () => void testCalibration("BRUSH_END"))}{calibrationInput("brushY", "Y", -1000, 1000, () => void testCalibration("BRUSH_START"))}</fieldset>
          <fieldset><legend>{text.purgeConfig}</legend>{input("purgeLength", "Filamento (mm)", 0, 500)}{input("blobDescent", "Descenso durante purga (mm)", 0.1, 50)}{input("maxBlobs", "Capacidad", 1, 10000)}</fieldset>
          <fieldset className="purge-tray-servo-settings"><legend>{text.servo}</legend>{input("servoReceiveAngle", "Angulo de recepcion", 0, 180)}{input("servoReleaseAngle", "Angulo de descarga", 0, 180)}{input("servoDwell", "Espera (ms)", 100, 10000)}
            <div className="purge-tray-servo-tests">
              <button type="button" disabled={busy !== "" || !data?.servoAvailable} onClick={() => void run("servo-test", { angle: form.servoReceiveAngle })}><MdKeyboardArrowUp />{text.testReceive}</button>
              <button type="button" disabled={busy !== "" || !data?.servoAvailable} onClick={() => void run("servo-test", { angle: form.servoReleaseAngle })}><MdKeyboardArrowDown />{text.testRelease}</button>
            </div>
            {!data?.servoAvailable && <p className="purge-tray-servo-pending">{text.servoPending}</p>}
          </fieldset>
        </div>
        <footer><button type="button" className="dialog-button" onClick={() => setSettingsOpen(false)}>{text.close}</button><button type="button" className="dialog-button primary" disabled={busy !== ""}
          onClick={() => void run("configure", form).then(() => setSettingsOpen(false))}>{text.save}</button></footer>
      </section>
    </div>, document.body)}
  </div>;
}
