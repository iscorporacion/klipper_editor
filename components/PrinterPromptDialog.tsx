"use client";
import { useEffect, useRef, useState } from "react";
import { MdAnnouncement } from "react-icons/md";
import WidgetDialog from "@/components/WidgetDialog";
import { promptCancelsPrint, type PrinterPrompt, type PromptButton } from "@/lib/printer-prompts";

export default function PrinterPromptDialog({ endpoint, t }: {
  endpoint: string; t: (key: string) => string;
}) {
  const [prompt, setPrompt] = useState<PrinterPrompt | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<PromptButton | null>(null);
  const active = useRef<PrinterPrompt | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (controller.signal.aborted) return;
        const next = data.prompt ?? null;
        if (next?.id !== active.current?.id) { setOpen(Boolean(next)); setError(""); setConfirming(null); }
        active.current = next; setPrompt(next);
      } catch {
        if (!controller.signal.aborted && active.current) setError(t("printerPrompt.disconnected"));
      } finally { if (!controller.signal.aborted) timer = setTimeout(poll, 2000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [endpoint, t]);
  const run = async (button: PromptButton, confirmed = false) => {
    if (!prompt || sending.current) return;
    if (promptCancelsPrint(button) && !confirmed) { setConfirming(button); return; }
    sending.current = true; setBusy(true); setError("");
    try {
      const cancel = promptCancelsPrint(button);
      if (active.current?.id !== prompt.id) throw new Error(t("printerPrompt.changed"));
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: prompt.id, label: button.label, command: button.command, confirmCancel: cancel }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === "promptChanged" ? t("printerPrompt.changed") : data.error === "printerNotReady" ? t("printerPrompt.disconnected") : data.error);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { sending.current = false; setBusy(false); setConfirming(null); }
  };
  const renderButton = (button: PromptButton, index: number) => <button key={index} type="button" className={`dialog-button printer-prompt-${button.style}`} disabled={busy || Boolean(confirming)} onClick={() => void run(button)}>{button.label}</button>;
  const dismiss = () => { if (!busy) { setOpen(false); setConfirming(null); } };
  if (!prompt) return null;
  return <>
    {!open && <button type="button" className="printer-prompt-reopen" onClick={() => setOpen(true)}><MdAnnouncement />{prompt.title || t("printerPrompt.title")}</button>}
    {open && <WidgetDialog title={prompt.title || t("printerPrompt.title")} closeLabel={t("printerPrompt.close")} className="printer-prompt-dialog" closeOnBackdrop={false} onClose={dismiss} footer={<>
      <button type="button" className="dialog-button" disabled={busy} onClick={dismiss}>{t("printerPrompt.close")}</button>
      {prompt.buttons.filter((button) => button.footer).map(renderButton)}
    </>}>
      {prompt.text.map((text, index) => <p className="printer-prompt-text" key={index}>{text}</p>)}
      {error && <p className="backup-manager-error" role="alert">{error}</p>}
      {confirming && <div role="alertdialog" aria-label={t("printerPrompt.cancelTitle")}><p>{t("printerPrompt.cancelMessage")}</p><div className="printer-prompt-buttons"><button className="dialog-button" disabled={busy} onClick={() => setConfirming(null)}>{t("printerPrompt.back")}</button><button className="dialog-button danger" disabled={busy} onClick={() => void run(confirming, true)}>{t("printerPrompt.cancelTitle")}</button></div></div>}
      {[...new Set(prompt.buttons.filter((button) => !button.footer).map((button) => button.group))].map((group) => <div className="printer-prompt-buttons" key={group}>{prompt.buttons.filter((button) => !button.footer && button.group === group).map(renderButton)}</div>)}
    </WidgetDialog>}
  </>;
}
