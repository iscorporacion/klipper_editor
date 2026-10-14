"use client";
import { useState } from "react";
import { MdAdd, MdDeleteOutline, MdDriveFileMove, MdRefresh, MdSave } from "react-icons/md";
import WidgetDialog from "@/components/WidgetDialog";
import type { BackupRule } from "@/lib/backup-rules";
import type { BackupCandidate } from "@/lib/backup-migration";
import { defaultBackupRules } from "@/scripts/backup-paths.mjs";
import { createClientId } from "@/lib/client-id";

type Document = { rules: BackupRule[]; revision: string; location: string; rulesFile: string };
type Preview = { candidates: BackupCandidate[]; revision: string; warnings: string[] };
export default function BackupSettings({ endpoint, onChanged, protectedPaths = [] }: {
  endpoint: string; onChanged: () => void; protectedPaths?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"rules" | "organize">("organize");
  const [document, setDocument] = useState<Document | null>(null);
  const [rules, setRules] = useState<BackupRule[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = Boolean(document && JSON.stringify(document.rules) !== JSON.stringify(rules));
  const request = async (method = "GET", body?: unknown) => {
    const response = await fetch(endpoint, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No se pudo administrar las copias");
    return data;
  };
  const load = async () => {
    setBusy(true); setError(""); setPreview(null); setSelected([]); setConfirming(false);
    try { const data = await request(); setDocument(data); setRules(data.rules); }
    catch (error) { setError(String(error instanceof Error ? error.message : error)); }
    finally { setBusy(false); }
  };
  const change = (id: string, patch: Partial<BackupRule>) => {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
    setPreview(null); setSelected([]); setConfirming(false);
  };
  const save = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await request("PUT", { rules, revision: document?.revision });
      setDocument((current) => current ? { ...current, ...data } : current); setRules(data.rules);
      setPreview(null); setSelected([]); setMessage("Patrones guardados"); onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const scan = async () => {
    setBusy(true); setError(""); setMessage(""); setSelected([]); setConfirming(false);
    try { setPreview(await request("POST", { action: "preview" })); }
    catch (error) { setPreview(null); setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const blocked = (item: BackupCandidate) => item.blockedReason || (protectedPaths.some((file) => file === item.path || file.startsWith(`${item.path}/`)) ? "Abierto en el editor; cierra su pestaña antes de trasladarlo" : "");
  const move = async () => {
    if (!preview) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const items = preview.candidates.filter((item) => selected.includes(item.path));
      if (items.some(blocked)) throw new Error("Cierra las pestañas de las copias seleccionadas antes de trasladarlas");
      const data = await request("POST", { action: "move", revision: preview.revision, items: items.map(({ path, fingerprint }) => ({ path, fingerprint })) });
      setSelected([]); setPreview(null); setConfirming(false);
      setMessage(data.moved.length === 1 ? "1 copia trasladada" : `${data.moved.length} copias trasladadas`);
      if (data.errors.length) setError(data.errors.map((item: { path: string; error: string }) => `${item.path}: ${item.error}`).join("\n"));
      onChanged();
    } catch (error) { setConfirming(false); setPreview(null); setSelected([]); setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <>
    <button className="dialog-button" type="button" onClick={() => { setOpen(true); setView("organize"); setMessage(""); void load(); }}><MdDriveFileMove /> Administrar copias</button>
    {open && <WidgetDialog title="Copias de seguridad" className="backup-settings-dialog" onClose={() => { if (!busy) setOpen(false); }} footer={<>
      <button className="dialog-button" type="button" disabled={busy} onClick={() => setOpen(false)}>Cerrar</button>
      {view === "rules" && <button className="dialog-button primary" type="button" disabled={busy || (!dirty && document?.revision !== "default")} onClick={() => void save()}><MdSave /> Guardar patrones</button>}
    </>}>
      {error && <p className="backup-manager-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {document && <>
        <dl className="backup-locations"><dt>Copias</dt><dd><code>{document.location}</code></dd><dt>Reglas</dt><dd><code>{document.rulesFile}</code></dd></dl>
        <div className="backup-view-tabs" role="tablist" aria-label="Administrar copias">
          <button className={view === "organize" ? "options-tab active" : "options-tab"} type="button" role="tab" aria-selected={view === "organize"} onClick={() => setView("organize")}>Organizar copias</button>
          <button className={view === "rules" ? "options-tab active" : "options-tab"} type="button" role="tab" aria-selected={view === "rules"} onClick={() => setView("rules")}>Patrones</button>
        </div>
        {view === "rules" && <section className="backup-rules-section" role="tabpanel">
          <div className="backup-section-heading"><h3>Patrones de detección</h3><button type="button" className="modal-icon-button" title="Agregar patrón" aria-label="Agregar patrón" disabled={busy || rules.length >= 100} onClick={() => { setRules((current) => [...current, { id: createClientId(), pattern: "", kind: "both", enabled: true }]); setPreview(null); setSelected([]); }}><MdAdd /></button></div>
          <div className="backup-rules-list">{rules.map((rule) => <div className="backup-rule-row" key={rule.id}>
            <input type="checkbox" checked={rule.enabled} disabled={busy} aria-label={`Activar ${rule.pattern || "patrón"}`} onChange={(event) => change(rule.id, { enabled: event.target.checked })} />
            <input aria-label="Patrón" value={rule.pattern} disabled={busy} maxLength={160} onChange={(event) => change(rule.id, { pattern: event.target.value })} />
            <select aria-label={`Tipo de ${rule.pattern || "patrón"}`} value={rule.kind} disabled={busy} onChange={(event) => change(rule.id, { kind: event.target.value as BackupRule["kind"] })}><option value="file">Archivo</option><option value="directory">Carpeta</option><option value="both">Ambos</option></select>
            <button className="modal-icon-button" type="button" title="Eliminar patrón" aria-label={`Eliminar ${rule.pattern || "patrón"}`} disabled={busy} onClick={() => { setRules((current) => current.filter((item) => item.id !== rule.id)); setPreview(null); setSelected([]); }}><MdDeleteOutline /></button>
          </div>)}</div>
          <button type="button" className="dialog-button backup-reset-rules" disabled={busy} onClick={() => { setRules(defaultBackupRules.map((rule) => ({ ...rule, kind: rule.kind as BackupRule["kind"] }))); setPreview(null); setSelected([]); setConfirming(false); }}>Restaurar patrones predeterminados</button>
        </section>}
        {view === "organize" && <section className="backup-migration-section" role="tabpanel">
          <div className="backup-section-heading"><h3>Organizar copias existentes</h3><button className="dialog-button" type="button" disabled={busy || dirty} onClick={() => void scan()}><MdRefresh /> Vista previa</button></div>
          {dirty && <p className="setting-help">Guarda los patrones antes de generar la vista previa.</p>}
          {preview && <>
            {preview.warnings.length > 0 && <details><summary>Avisos ({preview.warnings.length})</summary>{preview.warnings.map((warning) => <p className="setting-help" key={warning}>{warning}</p>)}</details>}
            {preview.candidates.length === 0 ? <p className="empty-note">No hay copias pendientes de traslado.</p> : <>
              <div className="backup-candidates">{preview.candidates.map((item) => <label key={item.path} className="backup-candidate-row">
                <input type="checkbox" disabled={busy || Boolean(blocked(item)) || confirming} checked={selected.includes(item.path)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.path] : current.filter((file) => file !== item.path))} aria-label={`Trasladar ${item.path}`} />
                <span><strong>{item.path}</strong><small>{item.type === "directory" ? `Carpeta · ${item.files} archivos` : "Archivo"}</small><code>→ {item.destination}</code>{blocked(item) && <small className="backup-manager-error">{blocked(item)}</small>}</span>
              </label>)}</div>
              {confirming ? <div className="backup-move-confirm" role="alertdialog" aria-label="Confirmar traslado"><p>Se trasladarán {selected.length} copias completas a .keditor-backups/. No se cambiará su contenido ni se sobrescribirán destinos existentes.</p><button type="button" className="dialog-button" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button><button type="button" className="dialog-button primary" disabled={busy} onClick={() => void move()}>{busy ? "Trasladando..." : "Confirmar traslado"}</button></div>
                : <button type="button" className="dialog-button" disabled={busy || !selected.length} onClick={() => setConfirming(true)}><MdDriveFileMove /> Trasladar seleccionadas ({selected.length})</button>}
            </>}
          </>}
        </section>}
      </>}
    </WidgetDialog>}
  </>;
}
