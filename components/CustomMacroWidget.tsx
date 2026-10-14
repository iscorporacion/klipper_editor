"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MdAdd, MdCheck, MdDeleteOutline, MdDragIndicator, MdArrowBack, MdArrowForward, MdRefresh, MdFormatAlignLeft, MdFormatAlignCenter, MdFormatAlignRight } from "react-icons/md";
import { buttonSizes, parseMacroCommand, type MacroButton, type MacroWidgetConfig } from "@/lib/macro-widgets";
import RichTooltip from "@/components/RichTooltip";
import WidgetDialog from "@/components/WidgetDialog";
import IconPicker from "@/components/IconPicker";
import LibraryIcon from "@/components/LibraryIcon";
import { createClientId } from "@/lib/client-id";

export default function CustomMacroWidget({ config, onChange, editing, onFinishEdit, apiBase = "", locale = "es" }: {
  config: MacroWidgetConfig; onChange: (config: MacroWidgetConfig) => void;
  editing: boolean; onFinishEdit: () => void; apiBase?: string; locale?: string;
}) {
  const es = locale.startsWith("es");
  const [draft, setDraft] = useState<MacroButton | null>(null);
  const [pickIcon, setPickIcon] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [macroNames, setMacroNames] = useState<string[] | null>(null);
  const [macroError, setMacroError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!editing) return;
    const controller = new AbortController();
    setMacroError("");
    fetch(`${apiBase}/api/printer/macro-buttons`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setMacroNames(payload.macros);
    }).catch((failure) => { if (!controller.signal.aborted) { setMacroNames(null); setMacroError(String(failure.message)); } });
    return () => controller.abort();
  }, [apiBase, editing, refresh]);
  const updateDraft = (patch: Partial<MacroButton>) => { setDraft((current) => current ? { ...current, ...patch } : null); setValidation(""); setError(""); };
  const editButton = (button?: MacroButton) => {
    setDraft(button ? { ...button } : { id: createClientId(), name: "", description: "", command: "", size: "1x1", color: "#4da3ff", alignment: "center", showTitle: true, icon: { collection: "md", name: "MdPlayArrow" } });
    setError(""); setValidation("");
  };
  const requestCommand = async (command: string, validateOnly = false) => {
    parseMacroCommand(command);
    const response = await fetch(`${apiBase}/api/printer/macro-buttons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, validateOnly }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    return payload;
  };
  const run = async (button: MacroButton) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(button.id); setError("");
    try { await requestCommand(button.command); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { inFlight.current = false; setBusy(""); }
  };
  const validate = async (save: boolean) => {
    if (!draft || inFlight.current) return;
    if (!draft.name.trim()) { setError(es ? "Introduce un nombre." : "Enter a name."); return; }
    inFlight.current = true; setBusy("validate"); setError(""); setValidation("");
    try {
      await requestCommand(draft.command, true);
      setValidation(es ? "Macro registrada en Klipper" : "Macro registered in Klipper");
      if (save) {
        const button = { ...draft, name: draft.name.trim(), command: draft.command.trim(), showTitle: draft.size !== "1x1" && draft.showTitle };
        onChange({ ...config, buttons: config.buttons.some((item) => item.id === button.id) ? config.buttons.map((item) => item.id === button.id ? button : item) : [...config.buttons, button] });
        setDraft(null);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { inFlight.current = false; setBusy(""); }
  };
  const move = (id: string, to: number) => {
    const buttons = [...config.buttons];
    const index = buttons.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [button] = buttons.splice(index, 1);
    buttons.splice(Math.max(0, Math.min(to, buttons.length)), 0, button);
    onChange({ ...config, buttons });
  };
  const removeButton = () => {
    if (!draft || !window.confirm(es ? `Eliminar ${draft.name}?` : `Delete ${draft.name}?`)) return;
    onChange({ ...config, buttons: config.buttons.filter((item) => item.id !== draft.id) }); setDraft(null);
  };
  const closeDraft = () => { if (!busy) { setDraft(null); setError(""); } };
  let known: boolean | null = null;
  try { if (draft && macroNames) known = macroNames.includes(parseMacroCommand(draft.command).name); } catch { /* Incomplete command while typing. */ }
  return <div className="custom-macro-widget">
    {editing && <div className="macro-widget-toolbar">
      <input aria-label={es ? "Titulo del widget" : "Widget title"} maxLength={80} value={config.title} onChange={(event) => onChange({ ...config, title: event.target.value })} />
      <RichTooltip content={es ? "Agregar boton" : "Add button"}><button type="button" className="modal-icon-button" disabled={config.buttons.length >= 100} aria-label={es ? "Agregar boton" : "Add button"} onClick={() => editButton()}><MdAdd /></button></RichTooltip>
      <RichTooltip content={es ? "Terminar edicion" : "Finish editing"}><button type="button" className="modal-icon-button" aria-label={es ? "Terminar edicion" : "Finish editing"} onClick={onFinishEdit}><MdCheck /></button></RichTooltip>
    </div>}
    {error && !draft && <p className="macro-widget-error" role="alert">{error}</p>}
    {!config.buttons.length && <button type="button" className="macro-widget-add" onClick={() => editButton()}><MdAdd />{es ? "Agregar boton" : "Add button"}</button>}
    <div className="macro-board"><div className="macro-button-grid">
      {config.buttons.map((button, index) => {
        const [width, height] = buttonSizes[button.size];
        const named = button.size !== "1x1" && button.showTitle;
        return <div key={button.id} className={`macro-tile ${dropTarget === button.id ? "drop-target" : ""} ${dragged === button.id ? "dragging" : ""}`} style={{ gridColumn: `span ${width}`, gridRow: `span ${height}`, "--macro-color": button.color } as CSSProperties}
          draggable={editing} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("application/x-keditor-macro-button", button.id); event.dataTransfer.effectAllowed = "move"; setDragged(button.id); }}
          onDragOver={(event) => { if (!editing || !dragged) return; event.preventDefault(); event.stopPropagation(); setDropTarget(button.id); }}
          onDrop={(event) => { if (!editing || !dragged) return; event.preventDefault(); event.stopPropagation(); if (dragged !== button.id) move(dragged, index); setDragged(null); setDropTarget(null); }}
          onDragEnd={(event) => { event.stopPropagation(); setDragged(null); setDropTarget(null); }}>
          <RichTooltip content={<span className="rich-tooltip-stack"><strong>{button.name}</strong>{button.description && <span>{button.description}</span>}<code>{button.command}</code></span>}>
            <button type="button" className={`macro-command-button align-${button.alignment} ${button.size === "1x4" || button.size === "2x1" ? "wide" : ""}`} aria-label={button.name} disabled={busy !== ""} aria-busy={busy === button.id} onClick={() => editing ? editButton(button) : void run(button)}>
              {editing && <MdDragIndicator className="macro-tile-grip" />}
              <LibraryIcon apiBase={apiBase} icon={button.icon} />{named && <span>{button.name}</span>}
            </button>
          </RichTooltip>
        </div>;
      })}
    </div></div>
    {editing && config.buttons.length > 1 && <div className="macro-order-list">{config.buttons.map((button, index) => <div key={button.id}>
      <span>{button.name}</span><button type="button" className="modal-icon-button" aria-label={`${es ? "Mover antes" : "Move before"}: ${button.name}`} disabled={index === 0} onClick={() => move(button.id, index - 1)}><MdArrowBack /></button>
      <button type="button" className="modal-icon-button" aria-label={`${es ? "Mover despues" : "Move after"}: ${button.name}`} disabled={index === config.buttons.length - 1} onClick={() => move(button.id, index + 1)}><MdArrowForward /></button>
    </div>)}</div>}
    {draft && <WidgetDialog title={es ? "Configurar boton" : "Configure button"} onClose={closeDraft} className="macro-button-editor" footer={<>
      {config.buttons.some((item) => item.id === draft.id) && <RichTooltip content={es ? "Eliminar boton" : "Delete button"}><button type="button" className="modal-icon-button danger" aria-label={es ? "Eliminar boton" : "Delete button"} disabled={busy !== ""} onClick={removeButton}><MdDeleteOutline /></button></RichTooltip>}
      <button type="button" className="dialog-button" disabled={busy !== ""} onClick={closeDraft}>{es ? "Cancelar" : "Cancel"}</button>
      <button type="button" className="dialog-button primary" disabled={busy !== ""} onClick={() => void validate(true)}>{es ? "Guardar" : "Save"}</button>
    </>}>
      <fieldset className="macro-button-form" disabled={busy !== ""}>
        <label>{es ? "Nombre" : "Name"}<input maxLength={80} value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
        <label>{es ? "Tamano" : "Size"}<select value={draft.size} onChange={(event) => updateDraft({ size: event.target.value as MacroButton["size"] })}>{Object.keys(buttonSizes).map((size) => <option key={size}>{size}</option>)}</select></label>
        <label className="macro-form-full macro-title-toggle"><input type="checkbox" checked={draft.size !== "1x1" && draft.showTitle} disabled={draft.size === "1x1"} onChange={(event) => updateDraft({ showTitle: event.target.checked })} /><span>{es ? "Mostrar titulo" : "Show title"}</span></label>
        <label className="macro-form-full">{es ? "Descripcion" : "Description"}<textarea maxLength={500} rows={2} value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} /></label>
        <label className="macro-form-full">{es ? "Macro y parametros" : "Macro and parameters"}<input list={`macro-names-${config.id}`} maxLength={2000} value={draft.command} spellCheck={false} onChange={(event) => updateDraft({ command: event.target.value })} /></label>
        <datalist id={`macro-names-${config.id}`}>{macroNames?.map((name) => <option value={name} key={name} />)}</datalist>
        <div className="macro-validation macro-form-full"><button type="button" className="dialog-button" disabled={busy !== ""} onClick={() => void validate(false)}><MdCheck />{es ? "Validar macro" : "Validate macro"}</button>
          <span className={known === false ? "danger" : ""} role="status">{validation || (known === true ? (es ? "Macro encontrada" : "Macro found") : known === false ? (es ? "Macro no registrada" : "Macro not registered") : "")}</span>
          <button type="button" className="modal-icon-button" aria-label={es ? "Actualizar macros" : "Refresh macros"} onClick={() => setRefresh((item) => item + 1)}><MdRefresh /></button>
        </div>
        <div className="macro-form-full macro-appearance-fields">
        <label>{es ? "Icono" : "Icon"}<button type="button" className="macro-icon-select" onClick={() => setPickIcon(true)}><LibraryIcon apiBase={apiBase} icon={draft.icon} /><span>{draft.icon.name}</span></button></label>
        <div className="macro-alignment-field"><span>{es ? "Alineacion" : "Alignment"}</span><div className="macro-alignment-controls" role="group" aria-label={es ? "Alineacion" : "Alignment"}>
          {([
            ["left", es ? "Izquierda" : "Left", MdFormatAlignLeft],
            ["center", es ? "Centro" : "Center", MdFormatAlignCenter],
            ["right", es ? "Derecha" : "Right", MdFormatAlignRight]
          ] as const).map(([alignment, label, Icon]) => <RichTooltip key={alignment} content={label}><button type="button" aria-label={label} aria-pressed={draft.alignment === alignment} onClick={() => updateDraft({ alignment })}><Icon /></button></RichTooltip>)}
        </div></div>
        <label>Color<input type="color" value={draft.color} onChange={(event) => updateDraft({ color: event.target.value })} /></label>
        </div>
        <div className={`macro-form-full macro-button-preview align-${draft.alignment}`} style={{ "--macro-color": draft.color } as CSSProperties}><LibraryIcon apiBase={apiBase} icon={draft.icon} />{draft.size !== "1x1" && draft.showTitle && <span>{draft.name}</span>}</div>
      </fieldset>
      {(error || macroError) && <p role="alert" className="macro-widget-error">{error || macroError}</p>}
    </WidgetDialog>}
    {pickIcon && draft && <IconPicker apiBase={apiBase} locale={locale} value={draft.icon} onClose={() => setPickIcon(false)} onSelect={(icon) => { updateDraft({ icon }); setPickIcon(false); }} />}
  </div>;
}
