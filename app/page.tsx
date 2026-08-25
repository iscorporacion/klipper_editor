"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import type { ChangeEvent, CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { tags } from "@lezer/highlight";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { FcDownload, FcExpand, FcNext, FcRefresh, FcSearch, FcSettings, FcUpload } from "react-icons/fc";
import { MdDelete, MdFunctions } from "react-icons/md";
import { IoDocumentTextOutline, IoPower } from "react-icons/io5";
import logoWhite from "@/components/logoWhite.png";
import { klipperConfigParser } from "@/lib/codemirror/klipper-config";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function apiPath(path: string) {
  return `${appBasePath}${path}`;
}

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  icon?: string;
  openIcon?: string;
};

type OpenFile = {
  path: string;
  content: string;
  savedContent: string;
  modifiedAt?: string;
  loading?: boolean;
  saving?: boolean;
  error?: string;
};

type ConfigSection = {
  line: number;
  title: string;
  content: string;
};

type SectionPreview = {
  section: ConfigSection;
  left: number;
  top: number;
};

type LocaleOption = {
  code: string;
  name: string;
};

type PrinterStatus = {
  webhooksState: string;
  webhooksMessage: string;
  printState: string;
  filename: string;
  printing: boolean;
  error?: string;
};

type MacroEntry = {
  name: string;
  title: string;
  path: string;
  line: number;
};

type PendingJump = {
  path: string;
  line: number;
};

type Messages = Record<string, string>;

const defaultMessages: Messages = {
  "app.title": "FINAL",
  "explorer.label": "Explorador",
  "actions.refreshTree": "Actualizar arbol",
  "actions.createFile": "Crear archivo",
  "actions.uploadFiles": "Subir archivos",
  "actions.downloadFile": "Descargar archivo",
  "actions.deleteFile": "Borrar archivo",
  "actions.macros": "Macros",
  "actions.save": "Guardar",
  "actions.saving": "Guardando",
  "actions.options": "Opciones",
  "actions.restartFirmware": "Reiniciar firmware",
  "actions.restartingFirmware": "Reiniciando",
  "status.ready": "Listo",
  "status.opening": "Abriendo {path}",
  "status.opened": "Abierto {path}",
  "status.creating": "Creando {path}",
  "status.created": "Creado {path}",
  "status.uploading": "Subiendo {path}",
  "status.uploaded": "Subido {path}",
  "status.deleted": "Borrado {path}",
  "status.openingMacro": "Abriendo macro {name}",
  "status.saving": "Guardando {path}",
  "status.saved": "Guardado {path}",
  "status.firmwareRestarting": "Reiniciando firmware",
  "status.firmwareRestarted": "Reinicio de firmware solicitado",
  "status.printerState": "Impresora: {state}",
  "status.resolvingInclude": "Resolviendo include {include}",
  "status.wildcardInclude": "Include con comodin: abierto {path}; {count} coincidencias",
  "status.modified": "modificado",
  "errors.loadTree": "No se pudo cargar el arbol",
  "errors.openFile": "No se pudo abrir el archivo",
  "errors.openGeneric": "Error al abrir",
  "errors.createFile": "No se pudo crear el archivo",
  "errors.uploadFile": "No se pudo subir el archivo",
  "errors.deleteFile": "No se pudo borrar el archivo",
  "errors.loadMacros": "No se pudieron cargar las macros",
  "errors.saveFile": "No se pudo guardar",
  "errors.saveGeneric": "Error al guardar",
  "errors.restartFirmware": "No se pudo reiniciar el firmware",
  "errors.restartPrinting": "No se puede reiniciar firmware mientras hay una impresion en curso",
  "errors.printerStatus": "No se pudo consultar Moonraker",
  "errors.includeNotFound": "No se encontro el include",
  "errors.includeOpen": "No se pudo abrir el include",
  "confirm.closeUnsaved": "{path} tiene cambios sin guardar. Cerrar?",
  "confirm.deleteFile": "Borrar {path}? Esta accion no se puede deshacer.",
  "confirm.restartFirmware": "Reiniciar firmware ahora?",
  "prompt.newFilePath": "Ruta del nuevo archivo",
  "panels.openEditors": "Editores abiertos",
  "panels.includes": "Includes",
  "panels.sections": "Sesiones",
  "empty.openFile": "Abre un archivo del arbol.",
  "empty.includes": "Sin includes detectados.",
  "empty.sections": "Sin sesiones detectadas.",
  "empty.sectionContent": "Sesion sin contenido.",
  "welcome.title": "Selecciona un archivo",
  "welcome.description": "Los includes en archivos `.cfg` se pueden abrir haciendo clic sobre la linea `[include ...]`.",
  "loading.title": "Cargando",
  "error.title": "Error",
  "tabs.closeLabel": "Cerrar {path}",
  "line.label": "Linea {line}",
  "preview.show": "Vista previa",
  "resize.width": "Cambiar ancho del panel",
  "resize.height": "Cambiar alto de includes y sesiones",
  "preview.jump": "Ir a esta sesion",
  "options.title": "Opciones",
  "options.language": "Idioma",
  "options.languageHelp": "Los idiomas disponibles salen de los archivos JSON en la carpeta `locales`.",
  "options.close": "Cerrar opciones",
  "options.loadingLocales": "Cargando idiomas.",
  "options.noLocales": "No hay archivos de idioma disponibles.",
  "macros.title": "Macros",
  "macros.search": "Buscar macro",
  "macros.loading": "Cargando macros.",
  "macros.empty": "Sin macros detectadas.",
  "macros.count": "{count} macros"
};

const cfgLanguage = StreamLanguage.define(klipperConfigParser);
const klipperHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "#6a9955" },
  { tag: tags.namespace, color: "#4ec9b0" },
  { tag: tags.className, color: "#d7ba7d" },
  { tag: tags.atom, color: "#4fc1ff" },
  { tag: tags.number, color: "#b5cea8" },
  { tag: tags.string, color: "#ce9178" },
  { tag: tags.keyword, color: "#c586c0" },
  { tag: tags.operator, color: "#d4d4d4" },
  { tag: tags.updateOperator, color: "#dcdcaa" },
  { tag: tags.propertyName, color: "#9cdcfe" },
  { tag: tags.name, color: "#4fc1ff" },
  { tag: tags.tagName, color: "#4ec9b0" },
  { tag: tags.variableName, color: "#9cdcfe" }
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function translate(messages: Messages, key: string, values: Record<string, string | number> = {}) {
  const template = messages[key] ?? defaultMessages[key] ?? key;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template
  );
}

function fileLanguage(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".cfg") || lower.endsWith(".conf") || lower.endsWith(".ini")) return cfgLanguage;
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return yaml();
  if (lower.endsWith(".json")) return json();
  if (lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".tsx")) return javascript();
  return cfgLanguage;
}

function basename(path: string) {
  return path.split("/").at(-1) ?? path;
}

function dirname(path: string) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

function Icon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`icon ${className}`}>{children}</span>;
}

function MaterialIcon({ name, className }: { name: string; className: string }) {
  return (
    <img
      className={className}
      src={apiPath(`/api/material-icon?name=${encodeURIComponent(name)}`)}
      alt=""
      aria-hidden="true"
    />
  );
}

function fallbackIconForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".cfg") || lower.endsWith(".conf") || lower.endsWith(".ini")) {
    return "settings";
  }

  if (lower.endsWith(".sh")) {
    return "console";
  }

  return "file";
}

function FileIcon({ path, icon }: { path: string; icon?: string }) {
  return <MaterialIcon name={icon ?? fallbackIconForPath(path)} className="file-type-icon" />;
}

function collectIconMap(nodes: TreeNode[], icons = new Map<string, string>()) {
  for (const node of nodes) {
    if (node.icon) {
      icons.set(node.path, node.icon);
    }

    if (node.children) {
      collectIconMap(node.children, icons);
    }
  }

  return icons;
}

function isCommentLine(text: string) {
  const trimmed = text.trimStart();
  return trimmed.startsWith("#") || trimmed.startsWith(";");
}

function getIncludes(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => !isCommentLine(line))
    .map((line) => line.match(/^\s*\[include\s+([^\]]+)\]/i)?.[1]?.trim())
    .filter((includePath): includePath is string => Boolean(includePath));
}

function getConfigSections(content: string) {
  const lines = content.split(/\r?\n/);
  const headers: Array<{ lineIndex: number; title: string }> = [];

  lines.forEach((line, index) => {
    const match = line.match(/^\s*\[([^\]]+)\]/);
    if (!match) return;

    const title = match[1].trim();
    if (/^include\b/i.test(title)) return;

    headers.push({ lineIndex: index, title: `[${title}]` });
  });

  return headers.map((header, index) => {
    const nextHeader = headers[index + 1];
    const contentStart = header.lineIndex + 1;
    const contentEnd = nextHeader ? nextHeader.lineIndex : lines.length;

    return {
      line: header.lineIndex + 1,
      title: header.title,
      content: lines.slice(contentStart, contentEnd).join("\n").trim()
    };
  });
}

const includeMark = Decoration.mark({ class: "cm-include-link" });
const urlMark = Decoration.mark({ class: "cm-url-link" });

function buildLinkDecorations(view: EditorView) {
  const ranges = [];
  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);

    if (isCommentLine(line.text)) {
      const urlPattern = /https?:\/\/[^\s\])]+/gi;
      let urlMatch: RegExpExecArray | null;
      while ((urlMatch = urlPattern.exec(line.text))) {
        const start = line.from + urlMatch.index;
        ranges.push(urlMark.range(start, start + urlMatch[0].length));
      }

      continue;
    }

    const includeMatch = line.text.match(/^\s*\[include\s+([^\]]+)\]/i);
    if (includeMatch) {
      const start = line.from + (includeMatch.index ?? 0);
      ranges.push(includeMark.range(start, start + includeMatch[0].length));
    }
  }

  return Decoration.set(ranges, true);
}

function editorLinkExtension(activePath: string, onInclude: (includePath: string, fromPath: string) => void) {
  const linkPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildLinkDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildLinkDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations
    }
  );

  const linkClickHandler = EditorView.domEventHandlers({
    click(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const line = view.state.doc.lineAt(pos);

      if (isCommentLine(line.text)) {
        const urlPattern = /https?:\/\/[^\s\])]+/gi;
        let urlMatch: RegExpExecArray | null;
        while ((urlMatch = urlPattern.exec(line.text))) {
          const start = line.from + urlMatch.index;
          const end = start + urlMatch[0].length;
          if (pos >= start && pos <= end) {
            event.preventDefault();
            window.open(urlMatch[0], "_blank", "noopener,noreferrer");
            return true;
          }
        }

        return false;
      }

      const includeMatch = line.text.match(/^\s*\[include\s+([^\]]+)\]/i);
      if (includeMatch) {
        const start = line.from + (includeMatch.index ?? 0);
        const end = start + includeMatch[0].length;
        if (pos >= start && pos <= end) {
          event.preventDefault();
          onInclude(includeMatch[1].trim(), activePath);
          return true;
        }
      }

      return false;
    }
  });

  return [linkPlugin, linkClickHandler];
}

function isCfgPath(path: string) {
  const lower = path.toLowerCase();
  return lower.endsWith(".cfg") || lower.endsWith(".conf") || lower.endsWith(".ini");
}

function FileTree({
  nodes,
  activePath,
  openPaths,
  onOpen,
  onDownload,
  onDelete,
  downloadLabel,
  deleteLabel
}: {
  nodes: TreeNode[];
  activePath?: string;
  openPaths: Set<string>;
  onOpen: (path: string) => void;
  onDownload: (path: string) => void;
  onDelete: (path: string) => void;
  downloadLabel: string;
  deleteLabel: string;
}) {
  return (
    <div className="tree">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          activePath={activePath}
          openPaths={openPaths}
          onOpen={onOpen}
          onDownload={onDownload}
          onDelete={onDelete}
          downloadLabel={downloadLabel}
          deleteLabel={deleteLabel}
        />
      ))}
    </div>
  );
}

function TreeItem({
  node,
  activePath,
  openPaths,
  onOpen,
  onDownload,
  onDelete,
  downloadLabel,
  deleteLabel
}: {
  node: TreeNode;
  activePath?: string;
  openPaths: Set<string>;
  onOpen: (path: string) => void;
  onDownload: (path: string) => void;
  onDelete: (path: string) => void;
  downloadLabel: string;
  deleteLabel: string;
}) {
  const defaultOpen = node.type === "directory" && (node.name === "RatOS" || node.name === "ratos_generated");
  const [expanded, setExpanded] = useState(defaultOpen);
  const isDirectory = node.type === "directory";
  const isOpenFile = openPaths.has(node.path);

  if (isDirectory) {
    return (
      <div>
        <button className="tree-row" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <FcExpand className="disclosure-icon" /> : <FcNext className="disclosure-icon" />}
          <MaterialIcon name={(expanded ? node.openIcon : node.icon) ?? "folder"} className="folder-type-icon" />
          <span>{node.name}</span>
        </button>
        {expanded && node.children && (
          <div className="tree-children">
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                activePath={activePath}
                openPaths={openPaths}
                onOpen={onOpen}
                onDownload={onDownload}
                onDelete={onDelete}
                downloadLabel={downloadLabel}
                deleteLabel={deleteLabel}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`tree-row file-row ${activePath === node.path ? "active" : ""}`} title={node.path}>
      <button className="tree-open-button" type="button" onClick={() => onOpen(node.path)}>
        <span className="tree-spacer" />
        <FileIcon path={node.path} icon={node.icon} />
        <span>{node.name}</span>
        {isOpenFile && <Icon className="open-dot">*</Icon>}
      </button>
      <div className="tree-file-actions">
        <button
          className="tree-action-button"
          type="button"
          title={downloadLabel}
          aria-label={downloadLabel}
          onClick={() => onDownload(node.path)}
        >
          <FcDownload className="tree-action-icon" />
        </button>
        <button
          className="tree-action-button danger"
          type="button"
          title={deleteLabel}
          aria-label={deleteLabel}
          onClick={() => onDelete(node.path)}
        >
          <MdDelete className="tree-action-icon" />
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [messages, setMessages] = useState<Messages>(defaultMessages);
  const [localeCode, setLocaleCode] = useState("es");
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [localesLoading, setLocalesLoading] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [macros, setMacros] = useState<MacroEntry[]>([]);
  const [macroSearch, setMacroSearch] = useState("");
  const [macrosLoading, setMacrosLoading] = useState(false);
  const [message, setMessage] = useState(defaultMessages["status.ready"]);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const [restartingFirmware, setRestartingFirmware] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState(320);
  const [includePanelHeight, setIncludePanelHeight] = useState(240);
  const [sectionPreview, setSectionPreview] = useState<SectionPreview | null>(null);
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const includePanelRef = useRef<HTMLElement | null>(null);
  const previewCloseTimerRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const activeFile = openFiles.find((file) => file.path === activePath);
  const openPathSet = useMemo(() => new Set(openFiles.map((file) => file.path)), [openFiles]);
  const iconByPath = useMemo(() => collectIconMap(tree), [tree]);
  const activeIncludes = useMemo(() => (activeFile ? getIncludes(activeFile.content) : []), [activeFile]);
  const activeSections = useMemo(() => (activeFile ? getConfigSections(activeFile.content) : []), [activeFile]);
  const activeDirectory = activePath ? dirname(activePath) : "";
  const filteredMacros = useMemo(() => {
    const query = macroSearch.trim().toLowerCase();
    if (!query) return macros;

    return macros.filter((macro) =>
      `${macro.name} ${macro.path} ${macro.title}`.toLowerCase().includes(query)
    );
  }, [macroSearch, macros]);
  const t = useCallback(
    (key: string, values?: Record<string, string | number>) => translate(messages, key, values),
    [messages]
  );

  const loadLocale = useCallback(async (code: string) => {
    const response = await fetch(apiPath(`/api/locales?locale=${encodeURIComponent(code)}`), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Unable to load locale");

    const nextMessages = { ...defaultMessages, ...(payload.messages ?? {}) };
    setMessages(nextMessages);
    setLocaleCode(payload.code ?? code);
    setMessage(translate(nextMessages, "status.ready"));
    window.localStorage.setItem("ratos-viewer-locale", payload.code ?? code);
  }, []);

  const loadTree = useCallback(async () => {
    const response = await fetch(apiPath("/api/tree"), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? t("errors.loadTree"));
    setTree(payload.children);
  }, [t]);

  const loadMacros = useCallback(async () => {
    setMacrosLoading(true);

    try {
      const response = await fetch(apiPath("/api/macros"), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.loadMacros"));
      setMacros(payload.macros ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.loadMacros"));
    } finally {
      setMacrosLoading(false);
    }
  }, [t]);

  const openMacrosModal = useCallback(() => {
    setMacrosOpen(true);
    setMacroSearch("");
    void loadMacros();
  }, [loadMacros]);

  const loadPrinterStatus = useCallback(async () => {
    try {
      const response = await fetch(apiPath("/api/printer/status"), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.printerStatus"));
      setPrinterStatus(payload);
    } catch (error) {
      setPrinterStatus({
        webhooksState: "unknown",
        webhooksMessage: error instanceof Error ? error.message : t("errors.printerStatus"),
        printState: "unknown",
        filename: "",
        printing: false,
        error: error instanceof Error ? error.message : t("errors.printerStatus")
      });
    }
  }, [t]);

  const restartFirmware = useCallback(async () => {
    if (restartingFirmware) return;
    if (!printerStatus || printerStatus.error) {
      setMessage(printerStatus?.error ?? t("errors.printerStatus"));
      return;
    }

    if (printerStatus?.printing) {
      setMessage(t("errors.restartPrinting"));
      return;
    }

    if (!window.confirm(t("confirm.restartFirmware"))) return;

    setRestartingFirmware(true);
    setMessage(t("status.firmwareRestarting"));

    try {
      const response = await fetch(apiPath("/api/printer/firmware-restart"), { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.restartFirmware"));
      setMessage(t("status.firmwareRestarted"));
      await loadPrinterStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.restartFirmware"));
    } finally {
      setRestartingFirmware(false);
    }
  }, [loadPrinterStatus, printerStatus?.printing, restartingFirmware, t]);

  const openFile = useCallback(
    async (path: string) => {
      setActivePath(path);
      if (openFiles.some((file) => file.path === path)) return;

      setOpenFiles((files) => [...files, { path, content: "", savedContent: "", loading: true }]);
      setMessage(t("status.opening", { path }));

      try {
        const response = await fetch(apiPath(`/api/file?path=${encodeURIComponent(path)}`), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.openFile"));

        setOpenFiles((files) =>
          files.map((file) =>
            file.path === path
              ? {
                  path,
                  content: payload.content,
                  savedContent: payload.content,
                  modifiedAt: payload.modifiedAt
                }
              : file
          )
        );
        setMessage(t("status.opened", { path }));
      } catch (error) {
        setOpenFiles((files) =>
          files.map((file) =>
            file.path === path
              ? { ...file, loading: false, error: error instanceof Error ? error.message : t("errors.openGeneric") }
              : file
          )
        );
        setMessage(error instanceof Error ? error.message : t("errors.openGeneric"));
      }
    },
    [openFiles, t]
  );

  const saveActiveFile = useCallback(async () => {
    if (!activeFile || activeFile.saving || activeFile.loading) return;

    setOpenFiles((files) => files.map((file) => (file.path === activeFile.path ? { ...file, saving: true } : file)));
    setMessage(t("status.saving", { path: activeFile.path }));

    try {
      const response = await fetch(apiPath("/api/file"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activeFile.path, content: activeFile.content })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.saveFile"));

      setOpenFiles((files) =>
        files.map((file) =>
          file.path === activeFile.path
            ? {
                ...file,
                savedContent: file.content,
                modifiedAt: payload.modifiedAt,
                saving: false,
                error: undefined
              }
            : file
        )
      );
      setMessage(t("status.saved", { path: activeFile.path }));
    } catch (error) {
      setOpenFiles((files) =>
        files.map((file) =>
          file.path === activeFile.path
            ? { ...file, saving: false, error: error instanceof Error ? error.message : t("errors.saveGeneric") }
            : file
        )
      );
      setMessage(error instanceof Error ? error.message : t("errors.saveGeneric"));
    }
  }, [activeFile, t]);

  const closeFile = useCallback(
    (path: string) => {
      const file = openFiles.find((item) => item.path === path);
      if (file && file.content !== file.savedContent && !window.confirm(t("confirm.closeUnsaved", { path }))) {
        return;
      }

      const nextFiles = openFiles.filter((item) => item.path !== path);
      setOpenFiles(nextFiles);
      if (activePath === path) {
        setActivePath(nextFiles.at(-1)?.path);
      }
    },
    [activePath, openFiles, t]
  );

  const createBlankFile = useCallback(async () => {
    const defaultPath = activeDirectory ? `${activeDirectory}/new.cfg` : "new.cfg";
    const requestedPath = window.prompt(t("prompt.newFilePath"), defaultPath);
    if (!requestedPath) return;

    const nextPath = requestedPath.trim().replaceAll("\\", "/").replace(/^\/+/, "");
    if (!nextPath) return;

    setMessage(t("status.creating", { path: nextPath }));

    try {
      const response = await fetch(apiPath("/api/file"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: nextPath, content: "" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.createFile"));

      await loadTree();
      await openFile(payload.path ?? nextPath);
      setMessage(t("status.created", { path: payload.path ?? nextPath }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.createFile"));
    }
  }, [activeDirectory, loadTree, openFile, t]);

  const downloadFile = useCallback((path: string) => {
    window.open(apiPath(`/api/download?path=${encodeURIComponent(path)}`), "_blank", "noopener,noreferrer");
  }, []);

  const deleteFile = useCallback(
    async (path: string) => {
      if (!window.confirm(t("confirm.deleteFile", { path }))) return;

      try {
        const response = await fetch(apiPath(`/api/file?path=${encodeURIComponent(path)}`), { method: "DELETE" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.deleteFile"));

        const nextFiles = openFiles.filter((file) => file.path !== path);
        setOpenFiles(nextFiles);
        if (activePath === path) {
          setActivePath(nextFiles.at(-1)?.path);
        }
        await loadTree();
        setMessage(t("status.deleted", { path }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.deleteFile"));
      }
    },
    [activePath, loadTree, openFiles, t]
  );

  const uploadFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) return;

      const uploadedPaths: string[] = [];

      for (const file of files) {
        const targetPath = activeDirectory ? `${activeDirectory}/${file.name}` : file.name;
        setMessage(t("status.uploading", { path: targetPath }));

        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("path", targetPath);

          const response = await fetch(apiPath("/api/upload"), {
            method: "POST",
            body: formData
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? t("errors.uploadFile"));
          uploadedPaths.push(payload.path ?? targetPath);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : t("errors.uploadFile"));
          return;
        }
      }

      await loadTree();
      if (uploadedPaths[0]) {
        await openFile(uploadedPaths[0]);
      }
      setMessage(t("status.uploaded", { path: uploadedPaths.join(", ") }));
    },
    [activeDirectory, loadTree, openFile, t]
  );

  const openMacro = useCallback(
    async (macro: MacroEntry) => {
      setMacrosOpen(false);
      setMessage(t("status.openingMacro", { name: macro.name }));
      setPendingJump({ path: macro.path, line: macro.line });
      await openFile(macro.path);
    },
    [openFile, t]
  );

  const resolveAndOpenInclude = useCallback(
    async (includePath: string, fromPath: string) => {
      setMessage(t("status.resolvingInclude", { include: includePath }));
      try {
        const params = new URLSearchParams({ from: fromPath, include: includePath });
        const response = await fetch(apiPath(`/api/resolve-include?${params.toString()}`), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.path) {
          throw new Error(payload.error ?? t("errors.includeNotFound"));
        }

        await openFile(payload.path);
        if (payload.matches?.length > 1) {
          setMessage(t("status.wildcardInclude", { path: payload.path, count: payload.matches.length }));
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.includeOpen"));
      }
    },
    [openFile, t]
  );

  const jumpToLine = useCallback((lineNumber: number) => {
    const view = editorViewRef.current;
    if (!view) return false;

    const targetLine = clamp(lineNumber, 1, view.state.doc.lines);
    const line = view.state.doc.line(targetLine);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" })
    });
    view.focus();
    return true;
  }, []);

  const clearPreviewCloseTimer = useCallback(() => {
    if (previewCloseTimerRef.current) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
  }, []);

  const schedulePreviewClose = useCallback(() => {
    clearPreviewCloseTimer();
    previewCloseTimerRef.current = window.setTimeout(() => setSectionPreview(null), 180);
  }, [clearPreviewCloseTimer]);

  const showSectionPreview = useCallback(
    (section: ConfigSection, event: ReactMouseEvent<HTMLButtonElement>) => {
      clearPreviewCloseTimer();
      const previewWidth = 560;
      const previewHeight = 380;
      const maxLeft = Math.max(14, window.innerWidth - previewWidth - 14);
      const maxTop = Math.max(14, window.innerHeight - previewHeight - 14);
      const left = clamp(event.clientX - previewWidth - 18, 14, maxLeft);
      const top = clamp(event.clientY - 28, 14, maxTop);

      setSectionPreview({ section, left, top });
    },
    [clearPreviewCloseTimer]
  );

  const startOutlineWidthResize = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = outlineWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        setOutlineWidth(clamp(startWidth - (moveEvent.clientX - startX), 240, 680));
      };
      const onMouseUp = () => {
        document.body.classList.remove("is-resizing");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      document.body.classList.add("is-resizing");
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [outlineWidth]
  );

  const startOutlineHeightResize = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const panelHeight = includePanelRef.current?.clientHeight ?? 520;
      const startY = event.clientY;
      const startHeight = includePanelHeight;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const maxHeight = Math.max(140, panelHeight - 140);
        setIncludePanelHeight(clamp(startHeight + (moveEvent.clientY - startY), 100, maxHeight));
      };
      const onMouseUp = () => {
        document.body.classList.remove("is-resizing");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      document.body.classList.add("is-resizing");
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [includePanelHeight]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLocales() {
      try {
        const response = await fetch(apiPath("/api/locales"), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load locales");

        const nextLocales = (payload.locales ?? []) as LocaleOption[];
        if (cancelled) return;

        setLocales(nextLocales);
        const savedLocale = window.localStorage.getItem("ratos-viewer-locale");
        const nextLocale =
          (savedLocale && nextLocales.some((locale) => locale.code === savedLocale) ? savedLocale : undefined) ??
          (nextLocales.some((locale) => locale.code === "es") ? "es" : nextLocales[0]?.code);

        if (nextLocale) {
          await loadLocale(nextLocale);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : defaultMessages["errors.loadTree"]);
        }
      } finally {
        if (!cancelled) {
          setLocalesLoading(false);
        }
      }
    }

    void loadLocales();

    return () => {
      cancelled = true;
    };
  }, [loadLocale]);

  useEffect(() => {
    loadTree().catch((error) => setMessage(error instanceof Error ? error.message : t("errors.loadTree")));
  }, [loadTree]);

  useEffect(() => {
    void loadPrinterStatus();
    const interval = window.setInterval(() => void loadPrinterStatus(), 5000);
    return () => window.clearInterval(interval);
  }, [loadPrinterStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveFile();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveActiveFile]);

  useEffect(() => {
    if (!pendingJump || activePath !== pendingJump.path || !activeFile || activeFile.loading || activeFile.error) return;

    const timer = window.setTimeout(() => {
      if (jumpToLine(pendingJump.line)) {
        setPendingJump(null);
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeFile, activePath, jumpToLine, pendingJump]);

  const editorExtensions = useMemo(() => {
    if (!activeFile) return [];
    const extensions = [fileLanguage(activeFile.path), ...editorLinkExtension(activeFile.path, resolveAndOpenInclude)];
    if (isCfgPath(activeFile.path)) {
      extensions.push(syntaxHighlighting(klipperHighlightStyle));
    }

    return extensions;
  }, [activeFile, resolveAndOpenInclude]);

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <div className="eyebrow">{t("explorer.label")}</div>
            <h1>{t("app.title")}</h1>
          </div>
          <div className="sidebar-actions">
            <button className="icon-button" type="button" onClick={() => void createBlankFile()} title={t("actions.createFile")}>
              <IoDocumentTextOutline className="action-icon plain-action-icon" />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              title={t("actions.uploadFiles")}
            >
              <FcUpload className="action-icon" />
            </button>
            <button className="icon-button" type="button" onClick={() => void loadTree()} title={t("actions.refreshTree")}>
              <FcRefresh className="action-icon" />
            </button>
          </div>
        </div>
        <input
          ref={uploadInputRef}
          className="hidden-file-input"
          type="file"
          multiple
          accept=".cfg,.conf,.ini,.txt,.sh,.json,.yaml,.yml"
          onChange={(event) => void uploadFiles(event)}
        />
        <FileTree
          nodes={tree}
          activePath={activePath}
          openPaths={openPathSet}
          onOpen={openFile}
          onDownload={downloadFile}
          onDelete={deleteFile}
          downloadLabel={t("actions.downloadFile")}
          deleteLabel={t("actions.deleteFile")}
        />
        <div className="open-editors">
          <div className="panel-title">{t("panels.openEditors")}</div>
          {openFiles.length === 0 ? (
            <p className="empty-note">{t("empty.openFile")}</p>
          ) : (
            openFiles.map((file) => (
              <button
                key={file.path}
                className={`open-editor ${file.path === activePath ? "active" : ""}`}
                type="button"
                onClick={() => setActivePath(file.path)}
                title={file.path}
              >
                <FileIcon path={file.path} icon={iconByPath.get(file.path)} />
                <span>{basename(file.path)}</span>
                {file.content !== file.savedContent && <Icon className="open-dot">*</Icon>}
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="editor-area">
        <div className="topbar">
          <button className="macro-button" type="button" onClick={openMacrosModal} title={t("actions.macros")}>
            <MdFunctions className="macro-button-icon" />
            {t("actions.macros")}
          </button>
          <div className="toolbar-actions">
            <button className="icon-button" type="button" onClick={() => setOptionsOpen(true)} title={t("actions.options")}>
              <FcSettings className="action-icon" />
            </button>
            <button
              className="restart-button"
              type="button"
              onClick={() => void restartFirmware()}
              disabled={restartingFirmware || !printerStatus || Boolean(printerStatus.error) || printerStatus.printing}
              title={
                printerStatus?.printing
                  ? t("errors.restartPrinting")
                  : printerStatus?.error
                    ? printerStatus.error
                    : t("actions.restartFirmware")
              }
            >
              <IoPower className="power-icon" />
              {restartingFirmware ? t("actions.restartingFirmware") : t("actions.restartFirmware")}
            </button>
            <button
              className="save-button"
              type="button"
              onClick={() => void saveActiveFile()}
              disabled={!activeFile || activeFile.content === activeFile.savedContent || activeFile.saving}
            >
              <FcUpload className="action-icon" />
              {activeFile?.saving ? t("actions.saving") : t("actions.save")}
            </button>
          </div>
        </div>

        <div className="tabs">
          {openFiles.map((file) => (
            <button
              key={file.path}
              className={`tab ${file.path === activePath ? "active" : ""}`}
              type="button"
              onClick={() => setActivePath(file.path)}
              title={file.path}
            >
              <FileIcon path={file.path} icon={iconByPath.get(file.path)} />
              <span>{basename(file.path)}</span>
              {file.content !== file.savedContent && <Icon className="open-dot">*</Icon>}
              <span
                className="tab-close"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  closeFile(file.path);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeFile(file.path);
                  }
                }}
                aria-label={t("tabs.closeLabel", { path: file.path })}
              >
                x
              </span>
            </button>
          ))}
        </div>

        <div className="editor-panel">
          {!activeFile ? (
            <div className="welcome">
              <Image className="welcome-logo" src={logoWhite} alt="" priority />
              <h2>{t("welcome.title")}</h2>
              <p>{t("welcome.description")}</p>
            </div>
          ) : activeFile.loading ? (
            <div className="welcome">
              <h2>{t("loading.title")}</h2>
              <p>{activeFile.path}</p>
            </div>
          ) : activeFile.error ? (
            <div className="welcome error">
              <h2>{t("error.title")}</h2>
              <p>{activeFile.error}</p>
            </div>
          ) : (
            <div className="editor-grid" style={{ "--outline-width": `${outlineWidth}px` } as CSSProperties}>
              <div className="code-host">
                <CodeMirror
                  value={activeFile.content}
                  height="100%"
                  maxHeight="100%"
                  theme={vscodeDark}
                  extensions={editorExtensions}
                  basicSetup={{
                    foldGutter: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true
                  }}
                  onCreateEditor={(view) => {
                    editorViewRef.current = view;
                  }}
                  onChange={(value) => {
                    setOpenFiles((files) =>
                      files.map((file) => (file.path === activeFile.path ? { ...file, content: value } : file))
                    );
                  }}
                />
              </div>
              <button
                className="panel-resizer panel-resizer-width"
                type="button"
                aria-label={t("resize.width")}
                onMouseDown={startOutlineWidthResize}
              />
              <aside
                ref={includePanelRef}
                className="include-panel"
                style={{ gridTemplateRows: `${includePanelHeight}px 8px minmax(0, 1fr)` }}
              >
                <section className="outline-section">
                  <div className="panel-title">{t("panels.includes")}</div>
                  <div className="outline-list">
                    {activeIncludes.length === 0 ? (
                      <p className="empty-note">{t("empty.includes")}</p>
                    ) : (
                      activeIncludes.map((includePath) => (
                        <button
                          key={`${activeFile.path}-${includePath}`}
                          className="outline-link include-link"
                          type="button"
                          onClick={() => void resolveAndOpenInclude(includePath, activeFile.path)}
                        >
                          {includePath}
                        </button>
                      ))
                    )}
                  </div>
                </section>
                <button
                  className="panel-resizer panel-resizer-height"
                  type="button"
                  aria-label={t("resize.height")}
                  onMouseDown={startOutlineHeightResize}
                />
                <section className="outline-section">
                  <div className="panel-title">{t("panels.sections")}</div>
                  <div className="outline-list">
                    {activeSections.length === 0 ? (
                      <p className="empty-note">{t("empty.sections")}</p>
                    ) : (
                      activeSections.map((section) => (
                        <div
                          key={`${activeFile.path}-${section.line}-${section.title}`}
                          className="outline-link section-link"
                        >
                          <button
                            className="section-title-button"
                            type="button"
                            title={t("line.label", { line: section.line })}
                            onClick={() => jumpToLine(section.line)}
                          >
                            <span>{section.title}</span>
                            <span className="line-number">{section.line}</span>
                          </button>
                          <button
                            className="section-preview-button"
                            type="button"
                            title={t("preview.show")}
                            aria-label={t("preview.show")}
                            onMouseEnter={(event) => showSectionPreview(section, event)}
                            onMouseLeave={schedulePreviewClose}
                          >
                            <FcSearch className="action-icon" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </aside>
            </div>
          )}
        </div>

        {macrosOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setMacrosOpen(false)}>
            <section
              className="options-modal macros-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="macros-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="macros-title">{t("macros.title")}</h2>
                <div className="modal-header-actions">
                  <button
                    className="modal-icon-button"
                    type="button"
                    title={t("actions.refreshTree")}
                    aria-label={t("actions.refreshTree")}
                    onClick={() => void loadMacros()}
                  >
                    <FcRefresh className="action-icon" />
                  </button>
                  <button
                    className="modal-close"
                    type="button"
                    title={t("options.close")}
                    aria-label={t("options.close")}
                    onClick={() => setMacrosOpen(false)}
                  >
                    x
                  </button>
                </div>
              </div>
              <div className="macro-modal-body">
                <label className="macro-search-field">
                  <FcSearch className="action-icon" />
                  <input
                    autoFocus
                    value={macroSearch}
                    placeholder={t("macros.search")}
                    onChange={(event) => setMacroSearch(event.target.value)}
                  />
                </label>
                <div className="macro-count">{t("macros.count", { count: filteredMacros.length })}</div>
                <div className="macro-list">
                  {macrosLoading ? (
                    <p className="empty-note">{t("macros.loading")}</p>
                  ) : filteredMacros.length === 0 ? (
                    <p className="empty-note">{t("macros.empty")}</p>
                  ) : (
                    filteredMacros.map((macro) => (
                      <button
                        key={`${macro.path}-${macro.line}-${macro.name}`}
                        className="macro-row"
                        type="button"
                        title={`${macro.title} - ${macro.path}:${macro.line}`}
                        onClick={() => void openMacro(macro)}
                      >
                        <MdFunctions className="macro-row-icon" />
                        <span className="macro-row-main">
                          <span className="macro-row-name">{macro.name}</span>
                          <span className="macro-row-path">
                            {macro.path}:{macro.line}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {optionsOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setOptionsOpen(false)}>
            <section
              className="options-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="options-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="options-title">{t("options.title")}</h2>
                <button
                  className="modal-close"
                  type="button"
                  title={t("options.close")}
                  aria-label={t("options.close")}
                  onClick={() => setOptionsOpen(false)}
                >
                  x
                </button>
              </div>
              <div className="modal-body">
                <label className="setting-field">
                  <span>{t("options.language")}</span>
                  <select
                    value={localeCode}
                    disabled={localesLoading || locales.length === 0}
                    onChange={(event) => {
                      const nextLocale = event.target.value;
                      void loadLocale(nextLocale).catch((error) =>
                        setMessage(error instanceof Error ? error.message : t("errors.loadTree"))
                      );
                    }}
                  >
                    {locales.map((locale) => (
                      <option key={locale.code} value={locale.code}>
                        {locale.name} ({locale.code})
                      </option>
                    ))}
                  </select>
                </label>
                <p className="setting-help">
                  {localesLoading
                    ? t("options.loadingLocales")
                    : locales.length === 0
                      ? t("options.noLocales")
                      : t("options.languageHelp")}
                </p>
              </div>
            </section>
          </div>
        )}

        {sectionPreview && (
          <div
            className="section-preview"
            style={{ left: sectionPreview.left, top: sectionPreview.top }}
            onMouseEnter={clearPreviewCloseTimer}
            onMouseLeave={schedulePreviewClose}
          >
            <div className="section-preview-title">
              <span>{sectionPreview.section.title}</span>
              <button
                className="section-preview-jump"
                type="button"
                title={t("preview.jump")}
                onClick={() => jumpToLine(sectionPreview.section.line)}
              >
                <FcNext className="action-icon" />
              </button>
            </div>
            <pre className="section-preview-body">
              {sectionPreview.section.content || t("empty.sectionContent")}
            </pre>
          </div>
        )}

        <footer className="statusbar">
          <span>{message}</span>
          {printerStatus && (
            <span title={printerStatus.webhooksMessage || printerStatus.error}>
              {t("status.printerState", { state: printerStatus.printState })}
              {printerStatus.filename ? ` - ${printerStatus.filename}` : ""}
            </span>
          )}
          {activeFile && (
            <span>
              {activeFile.path}
              {activeFile.content !== activeFile.savedContent ? ` - ${t("status.modified")}` : ""}
            </span>
          )}
        </footer>
      </section>
    </main>
  );
}
