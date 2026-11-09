"use client";
import { useState } from "react";
import { MdAdd, MdDeleteOutline, MdDriveFileMove, MdRefresh, MdSave } from "react-icons/md";
import WidgetDialog from "@/components/WidgetDialog";
import type { BackupRule } from "@/lib/backup-rules";
import type { BackupCandidate } from "@/lib/backup-migration";
import { defaultBackupRules } from "@/scripts/backup-paths.mjs";
import { createClientId } from "@/lib/client-id";
import { translateBackupMessage } from "@/lib/backup-messages";

type Document = { rules: BackupRule[]; revision: string; location: string; rulesFile: string };
type Preview = { candidates: BackupCandidate[]; revision: string; warnings: string[] };
export default function BackupSettings({ endpoint, onChanged, protectedPaths = [], t }: {
  t: (key: string, values?: Record<string, string | number>) => string;
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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = Boolean(document && JSON.stringify(document.rules) !== JSON.stringify(rules));
  const localize = (value: string) => translateBackupMessage(value, t);
  const request = async (method = "GET", body?: unknown) => {
    const response = await fetch(endpoint, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ? localize(data.error) : t("backups.failure"));
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
      setPreview(null); setSelected([]); setMessage(t("backups.saved")); onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const scan = async () => {
    setBusy(true); setError(""); setMessage(""); setSelected([]); setConfirming(false);
    try { setPreview(await request("POST", { action: "preview" })); }
    catch (error) { setPreview(null); setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const blocked = (item: BackupCandidate) => item.blockedReason || (protectedPaths.some((file) => file === item.path || file.startsWith(`${item.path}/`)) ? t("backups.open") : "");
  const move = async (remove = false) => {
    if (!preview) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const items = preview.candidates.filter((item) => selected.includes(item.path));
      if (items.some(blocked)) throw new Error(t("backups.closeTabs"));
      const data = await request("POST", { action: remove ? "delete" : "move", confirm: remove, revision: preview.revision, items: items.map(({ path, fingerprint }) => ({ path, fingerprint })) });
      setSelected([]); setPreview(null); setConfirming(false);
      const count = remove ? data.deleted.length : data.moved.length;
      setMessage(t(`backups.${remove ? "deleted" : "moved"}${count === 1 ? "One" : "Many"}`, { count }));
      if (data.errors.length) setError(data.errors.map((item: { path: string; error: string }) => `${item.path}: ${localize(item.error)}`).join("\n"));
      onChanged();
    } catch (error) { setConfirming(false); setPreview(null); setSelected([]); setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <>
    <button className="dialog-button" type="button" onClick={() => { setOpen(true); setView("organize"); setMessage(""); void load(); }}><MdDriveFileMove /> {t("backups.manage")}</button>
    {open && <WidgetDialog title={t("backups.title")} closeLabel={t("backups.close")} className="backup-settings-dialog" onClose={() => { if (!busy) setOpen(false); }} footer={<>
      <button className="dialog-button" type="button" disabled={busy} onClick={() => setOpen(false)}>{t("backups.close")}</button>
      {view === "rules" && <button className="dialog-button primary" type="button" disabled={busy || (!dirty && document?.revision !== "default")} onClick={() => void save()}><MdSave /> {t("backups.save")}</button>}
    </>}>
      {error && <p className="backup-manager-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {document && <>
        <dl className="backup-locations"><dt>{t("backups.location")}</dt><dd><code>{document.location}</code></dd><dt>{t("backups.rules")}</dt><dd><code>{document.rulesFile}</code></dd></dl>
        <div className="backup-view-tabs" role="tablist" aria-label={t("backups.manage")}>
          <button className={view === "organize" ? "options-tab active" : "options-tab"} type="button" role="tab" aria-selected={view === "organize"} onClick={() => setView("organize")}>{t("backups.organize")}</button>
          <button className={view === "rules" ? "options-tab active" : "options-tab"} type="button" role="tab" aria-selected={view === "rules"} onClick={() => setView("rules")}>{t("backups.patterns")}</button>
        </div>
        {view === "rules" && <section className="backup-rules-section" role="tabpanel">
          <div className="backup-section-heading"><h3>{t("backups.detection")}</h3><button type="button" className="modal-icon-button" title={t("backups.add")} aria-label={t("backups.add")} disabled={busy || rules.length >= 100} onClick={() => { setRules((current) => [...current, { id: createClientId(), pattern: "", kind: "both", enabled: true }]); setPreview(null); setSelected([]); }}><MdAdd /></button></div>
          <div className="backup-rules-list">{rules.map((rule) => <div className="backup-rule-row" key={rule.id}>
            <input type="checkbox" checked={rule.enabled} disabled={busy} aria-label={t("backups.activate", { pattern: rule.pattern || t("backups.defaultPattern") })} onChange={(event) => change(rule.id, { enabled: event.target.checked })} />
            <input aria-label={t("backups.pattern")} value={rule.pattern} disabled={busy} maxLength={160} onChange={(event) => change(rule.id, { pattern: event.target.value })} />
            <select aria-label={t("backups.kind", { pattern: rule.pattern || t("backups.defaultPattern") })} value={rule.kind} disabled={busy} onChange={(event) => change(rule.id, { kind: event.target.value as BackupRule["kind"] })}><option value="file">{t("backups.file")}</option><option value="directory">{t("backups.folder")}</option><option value="both">{t("backups.both")}</option></select>
            <button className="modal-icon-button" type="button" title={t("backups.deletePattern")} aria-label={t("backups.removePattern", { pattern: rule.pattern || t("backups.defaultPattern") })} disabled={busy} onClick={() => { setRules((current) => current.filter((item) => item.id !== rule.id)); setPreview(null); setSelected([]); }}><MdDeleteOutline /></button>
          </div>)}</div>
          <button type="button" className="dialog-button backup-reset-rules" disabled={busy} onClick={() => { setRules(defaultBackupRules.map((rule) => ({ ...rule, kind: rule.kind as BackupRule["kind"] }))); setPreview(null); setSelected([]); setConfirming(false); }}>{t("backups.reset")}</button>
        </section>}
        {view === "organize" && <section className="backup-migration-section" role="tabpanel">
          <div className="backup-section-heading"><h3>{t("backups.existing")}</h3><button className="dialog-button" type="button" disabled={busy || dirty} onClick={() => void scan()}><MdRefresh /> {t("backups.preview")}</button></div>
          {dirty && <p className="setting-help">{t("backups.dirty")}</p>}
          {preview && <>
            {preview.warnings.length > 0 && <details><summary>{t("backups.warnings")} ({preview.warnings.length})</summary>{preview.warnings.map((warning) => <p className="setting-help" key={warning}>{localize(warning)}</p>)}</details>}
            {preview.candidates.length === 0 ? <p className="empty-note">{t("backups.empty")}</p> : <>
              <div className="backup-selection-actions">
                <button type="button" className="dialog-button" disabled={busy || confirming || !preview.candidates.some((item) => !blocked(item))} onClick={() => {
                  const available = preview.candidates.filter((item) => !blocked(item)).map((item) => item.path);
                  setSelected(available.every((file) => selected.includes(file)) ? [] : available);
                }}>{preview.candidates.filter((item) => !blocked(item)).every((item) => selected.includes(item.path)) ? t("backups.deselectAll") : t("backups.selectAll")}</button>
                <button type="button" className="dialog-button" disabled={busy || confirming || !selected.length || selected.length > 500} onClick={() => { setDeleting(true); setConfirming(true); }}><MdDeleteOutline /> {t("backups.deleteSelected")} ({selected.length})</button>
              </div>
              <div className="backup-candidates">{preview.candidates.map((item) => <label key={item.path} className="backup-candidate-row">
                <input type="checkbox" disabled={busy || Boolean(blocked(item)) || confirming} checked={selected.includes(item.path)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.path] : current.filter((file) => file !== item.path))} aria-label={t("backups.moveItem", { path: item.path })} />
                <span><strong>{item.path}</strong><small>{item.type === "directory" ? t("backups.folderFiles", { count: item.files }) : t("backups.file")}</small><code>→ {item.destination}</code>{blocked(item) && <small className="backup-manager-error">{localize(blocked(item))}</small>}</span>
              </label>)}</div>
              {confirming ? <div className="backup-move-confirm" role="alertdialog" aria-label={deleting ? t("backups.confirmDelete") : t("backups.confirmMove")}>
                <p>{deleting ? t("backups.deleteNotice", { count: selected.length }) : t("backups.moveNotice", { count: selected.length })}</p>
                {deleting && <ul>{selected.map((file) => <li key={file}>{file}</li>)}</ul>}
                <button type="button" className="dialog-button" disabled={busy} onClick={() => setConfirming(false)}>{t("backups.cancel")}</button><button type="button" className="dialog-button primary" disabled={busy} onClick={() => void move(deleting)}>{busy ? t("backups.working") : deleting ? t("backups.deleteForever") : t("backups.confirmMove")}</button></div>
                : <button type="button" className="dialog-button" disabled={busy || !selected.length || selected.length > 500} onClick={() => { setDeleting(false); setConfirming(true); }}><MdDriveFileMove /> {t("backups.moveSelected")} ({selected.length})</button>}
            </>}
          </>}
        </section>}
      </>}
    </WidgetDialog>}
  </>;
}
