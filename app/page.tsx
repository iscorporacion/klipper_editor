"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import type { ChangeEvent, CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { tags } from "@lezer/highlight";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { BsArrowsMove } from "react-icons/bs";
import { FaHotjar } from "react-icons/fa";
import {
  FcAcceptDatabase,
  FcDeleteDatabase,
  FcDownload,
  FcExpand,
  FcNext,
  FcRefresh,
  FcSearch,
  FcSettings,
  FcStart,
  FcUpload
} from "react-icons/fc";
import {
  MdDelete,
  MdEmergency,
  MdFunctions,
  MdHome,
  MdKeyboardArrowDown,
  MdKeyboardArrowLeft,
  MdKeyboardArrowRight,
  MdKeyboardArrowUp
} from "react-icons/md";
import { TbActivityHeartbeat } from "react-icons/tb";
import { IoClose, IoDocumentTextOutline, IoHelpCircleOutline, IoPower } from "react-icons/io5";
import logoWhite from "@/components/logoWhite.png";
import { klipperConfigParser } from "@/lib/codemirror/klipper-config";
import { bundledLocaleOptions, bundledLocales } from "@/lib/locales";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const mainsailUrl = process.env.NEXT_PUBLIC_MAINSAIL_URL ?? "/";
const heaterCacheKey = "klipper-editor-heater-cache";
const heaterColorCacheKey = "klipper-editor-heater-colors";
const hideBackupFilesKey = "klipper-editor-hide-backup-files";

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
  kind?: "text" | "image";
  imageUrl?: string;
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
  zTiltAvailable: boolean;
  homedAxes: string;
  allAxesHomed: boolean;
  position: {
    x: number;
    y: number;
    z: number;
  };
  positionLimits: {
    x: AxisLimit;
    y: AxisLimit;
    z: AxisLimit;
  };
  zOffset: number;
  error?: string;
};

type QuickCommand = "home-all" | "home-x" | "home-y" | "home-z" | "z-tilt";
type JogAxis = "x" | "y" | "z";
type AxisLimit = {
  min: number;
  max: number;
};

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function axisLimitValue(value: unknown): AxisLimit {
  const limit = value && typeof value === "object" ? (value as Partial<AxisLimit>) : {};
  return {
    min: numericValue(limit.min),
    max: numericValue(limit.max)
  };
}

function normalizePrinterStatus(value: unknown, fallbackMessage: string): PrinterStatus {
  const status = value && typeof value === "object" ? (value as Partial<PrinterStatus>) : {};
  const position =
    status.position && typeof status.position === "object"
      ? (status.position as Partial<Record<JogAxis, unknown>>)
      : {};
  const positionLimits =
    status.positionLimits && typeof status.positionLimits === "object"
      ? (status.positionLimits as Partial<Record<JogAxis, unknown>>)
      : {};
  const printState = String(status.printState ?? "unknown");
  const error = typeof status.error === "string" && status.error.trim() ? status.error : undefined;

  return {
    webhooksState: String(status.webhooksState ?? "unknown"),
    webhooksMessage: String(status.webhooksMessage ?? error ?? fallbackMessage),
    printState,
    filename: String(status.filename ?? ""),
    printing: Boolean(status.printing),
    zTiltAvailable: Boolean(status.zTiltAvailable),
    homedAxes: String(status.homedAxes ?? ""),
    allAxesHomed: Boolean(status.allAxesHomed),
    position: {
      x: numericValue(position.x),
      y: numericValue(position.y),
      z: numericValue(position.z)
    },
    positionLimits: {
      x: axisLimitValue(positionLimits.x),
      y: axisLimitValue(positionLimits.y),
      z: axisLimitValue(positionLimits.z)
    },
    zOffset: numericValue(status.zOffset),
    error
  };
}

type HeaterStatus = {
  name: string;
  label: string;
  temperature: number;
  target: number;
  power?: number;
  color?: string;
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

type AppDialog =
  | {
      type: "confirm";
      title: string;
      message: string;
      resolve: (value: boolean) => void;
    }
  | {
      type: "input";
      title: string;
      defaultValue: string;
      resolve: (value: string | undefined) => void;
    };

type Messages = Record<string, string>;

const defaultMessages: Messages = {
  "app.title": "Klipper Editor",
  "explorer.label": "Explorador",
  "actions.refreshTree": "Actualizar arbol",
  "actions.createFile": "Crear archivo",
  "actions.uploadFiles": "Subir archivos",
  "actions.hideBackupFiles": "Ocultar backups",
  "actions.showBackupFiles": "Mostrar backups",
  "actions.downloadFile": "Descargar archivo",
  "actions.deleteFile": "Borrar archivo",
  "actions.downloadOnlyFile": "Descargar archivo",
  "actions.macros": "Macros",
  "actions.executeMacro": "Ejecutar macro",
  "actions.hot": "Hot",
  "actions.help": "Ayuda",
  "actions.coolHeater": "Enfriar {heater}",
  "actions.refreshHeaters": "Actualizar calentadores",
  "actions.move": "Mover",
  "actions.clearSearch": "Limpiar busqueda",
  "actions.setHeaters": "Aplicar temperaturas",
  "actions.settingHeaters": "Aplicando",
  "actions.emergencyStop": "Parada de emergencia",
  "actions.emergencyStopping": "Deteniendo",
  "actions.homeAll": "Home All",
  "actions.homeX": "Home X",
  "actions.homeY": "Home Y",
  "actions.homeZ": "Home Z",
  "actions.zTilt": "Z Tilt",
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
  "status.executingMacro": "Ejecutando macro {name}",
  "status.executedMacro": "Macro ejecutada {name}",
  "status.loadingHeaters": "Cargando temperaturas",
  "status.heatersRefreshed": "Calentadores actualizados",
  "status.coolingHeater": "Enfriando {heater}",
  "status.heaterCooling": "{heater} enfriando",
  "status.moving": "Moviendo {move}",
  "status.moveDone": "Movimiento ejecutado",
  "status.settingHeaters": "Aplicando temperaturas",
  "status.heatersSet": "Temperaturas aplicadas",
  "status.emergencyStopping": "Ejecutando parada de emergencia",
  "status.emergencyStopped": "Parada de emergencia enviada",
  "status.runningCommand": "Ejecutando {command}",
  "status.commandDone": "{command} ejecutado",
  "status.saving": "Guardando {path}",
  "status.saved": "Guardado {path}",
  "status.savedWithBackup": "Guardado {path}; copia creada en {backupPath}",
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
  "errors.executeMacro": "No se pudo ejecutar la macro",
  "errors.loadHeaters": "No se pudieron cargar los calentadores",
  "errors.coolHeater": "No se pudo enfriar el calentador",
  "errors.setHeaters": "No se pudieron aplicar las temperaturas",
  "errors.movePrinter": "No se pudo mover la impresora",
  "errors.moveHoming": "Haz home de X/Y/Z antes de mover la impresora",
  "errors.movePosition": "Ingresa una posicion valida para {axis}",
  "errors.moveRange": "{axis} debe estar entre {min} y {max}",
  "errors.emergencyStop": "No se pudo ejecutar la parada de emergencia",
  "errors.quickCommand": "No se pudo ejecutar el comando",
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
  "confirm.executeMacro": "Ejecutar macro {name} en la impresora?",
  "prompt.newFilePath": "Ruta del nuevo archivo",
  "panels.openEditors": "Editores abiertos",
  "panels.includes": "Includes",
  "panels.sections": "Sesiones",
  "empty.openFile": "Abre un archivo del arbol.",
  "empty.includes": "Sin includes detectados.",
  "empty.sections": "Sin sesiones detectadas.",
  "empty.sectionMatches": "Sin sesiones que coincidan.",
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
  "options.createBackupOnSave": "Crear copia de seguridad al guardar",
  "options.createBackupOnSaveHelp": "Antes de sobrescribir un archivo, crea una copia con fecha junto al original.",
  "options.close": "Cerrar opciones",
  "options.loadingLocales": "Cargando idiomas.",
  "options.noLocales": "No hay archivos de idioma disponibles.",
  "macros.title": "Macros",
  "macros.search": "Buscar macro",
  "macros.loading": "Cargando macros.",
  "macros.empty": "Sin macros detectadas.",
  "macros.count": "{count} macros",
  "sections.search": "Buscar sesion",
  "heaters.title": "Calentadores",
  "heaters.empty": "Sin calentadores detectados.",
  "heaters.cacheHelp": "Si modificaste tus calentadores recientemente, pulsa actualizar para recargarlos y guardarlos nuevamente.",
  "heaters.current": "Actual",
  "heaters.target": "Objetivo",
  "movement.title": "Movimiento",
  "movement.absolutePosition": "Posicion: absoluta",
  "movement.zOffset": "Z-Offset: {offset}",
  "movement.distance": "Distancia {distance}",
  "movement.axisRange": "{min} - {max}",
  "movement.homeAll": "TODO",
  "movement.zTilt": "Z Tilt"
};

const defaultLocaleCode = "en";
const defaultLocaleMessages = bundledLocales[defaultLocaleCode]?.messages ?? defaultMessages;

const moveSteps = [0.1, 1, 10, 25, 50, 100];
const zOffsetSteps = [0.005, 0.01, 0.025, 0.05];

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
  const template = messages[key] ?? defaultLocaleMessages[key] ?? defaultMessages[key] ?? key;
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

function formatTemperature(value: number) {
  return `${Math.round(value)} °C`;
}

function formatPosition(value: number, digits = 2) {
  return value.toFixed(digits).replace(".", ",");
}

function formatPositionInput(value: number, digits = 2) {
  return value.toFixed(digits).replace(".", ",");
}

function parsePositionInput(value: string) {
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatOffset(value: number) {
  return value.toFixed(3);
}

function formatAxisRange(limit: AxisLimit, axis: JogAxis) {
  const digits = axis === "z" ? 3 : 2;
  return `${formatPosition(limit.min, digits)} - ${formatPosition(limit.max, digits)}`;
}

function readHeaterColors() {
  if (typeof window === "undefined") return {};

  try {
    const cached = JSON.parse(window.localStorage.getItem(heaterColorCacheKey) ?? "{}") as unknown;
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) return {};

    return Object.fromEntries(
      Object.entries(cached as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

function writeHeaterColors(colors: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(heaterColorCacheKey, JSON.stringify(colors));
}

function randomHeaterColor() {
  return `hsl(${Math.floor(Math.random() * 360)} 85% 62%)`;
}

function assignHeaterColors(heaters: HeaterStatus[]) {
  const colors = readHeaterColors();
  let changed = false;

  const nextHeaters = heaters.map((heater) => {
    const color = heater.color ?? colors[heater.name] ?? randomHeaterColor();
    if (colors[heater.name] !== color) {
      colors[heater.name] = color;
      changed = true;
    }

    return { ...heater, color };
  });

  if (changed) {
    writeHeaterColors(colors);
  }

  return nextHeaters;
}

function cachedHeater(value: unknown): HeaterStatus | undefined {
  if (!value || typeof value !== "object") return undefined;
  const heater = value as Partial<HeaterStatus>;
  if (typeof heater.name !== "string" || typeof heater.label !== "string") return undefined;

  return {
    name: heater.name,
    label: heater.label,
    temperature: Number.isFinite(Number(heater.temperature)) ? Number(heater.temperature) : 0,
    target: Number.isFinite(Number(heater.target)) ? Number(heater.target) : 0,
    power: heater.power === undefined || !Number.isFinite(Number(heater.power)) ? undefined : Number(heater.power),
    color: typeof heater.color === "string" && heater.color.trim() ? heater.color.trim() : undefined
  };
}

function readCachedHeaters() {
  if (typeof window === "undefined") return [];

  try {
    const cached = JSON.parse(window.localStorage.getItem(heaterCacheKey) ?? "[]") as unknown;
    return Array.isArray(cached) ? cached.map(cachedHeater).filter((heater): heater is HeaterStatus => Boolean(heater)) : [];
  } catch {
    return [];
  }
}

function writeCachedHeaters(heaters: HeaterStatus[]) {
  if (typeof window === "undefined") return;
  if (heaters.length === 0) {
    window.localStorage.removeItem(heaterCacheKey);
    return;
  }
  window.localStorage.setItem(heaterCacheKey, JSON.stringify(heaters));
}

function heaterQueryPath(heaters: HeaterStatus[], refreshCatalog = false) {
  const params = new URLSearchParams();
  if (!refreshCatalog) {
    for (const heater of heaters) {
      params.append("heater", heater.name);
    }
  }

  const query = params.toString();
  return query ? `/api/printer/heaters?${query}` : "/api/printer/heaters";
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

function isBackupFilePath(path: string) {
  const name = basename(path).toLowerCase();
  return (
    /-\d{8}[-_]\d{6}(?:-\d+)?(?:\.[^.]+){1,2}$/.test(name) ||
    /\.(bak|backup|bkp|old|orig)$/.test(name) ||
    /\.(bak|backup|bkp)\.?\d{8}/.test(name) ||
    /~$/.test(name)
  );
}

function filterBackupFiles(nodes: TreeNode[], hideBackups: boolean): TreeNode[] {
  if (!hideBackups) return nodes;

  return nodes
    .filter((node) => node.type !== "file" || !isBackupFilePath(node.path))
    .map((node) =>
      node.children
        ? {
            ...node,
            children: filterBackupFiles(node.children, hideBackups)
          }
        : node
    );
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

function isDownloadOnlyPath(path: string) {
  return path.toLowerCase().endsWith(".zip");
}

function isImagePath(path: string) {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(path);
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
  const downloadOnly = isDownloadOnlyPath(node.path);

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
      <button
        className="tree-open-button"
        type="button"
        title={downloadOnly ? downloadLabel : node.path}
        onClick={() => (downloadOnly ? onDownload(node.path) : onOpen(node.path))}
      >
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
  const [hideBackupFiles, setHideBackupFiles] = useState(true);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [messages, setMessages] = useState<Messages>(defaultLocaleMessages);
  const [localeCode, setLocaleCode] = useState(defaultLocaleCode);
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [localesLoading, setLocalesLoading] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [moveStep, setMoveStep] = useState(50);
  const [movingAction, setMovingAction] = useState<string | null>(null);
  const [positionInputs, setPositionInputs] = useState<Record<JogAxis, string>>({ x: "", y: "", z: "" });
  const [editingPositionAxis, setEditingPositionAxis] = useState<JogAxis | null>(null);
  const [createBackupOnSave, setCreateBackupOnSave] = useState(true);
  const [heatersOpen, setHeatersOpen] = useState(false);
  const [heaters, setHeaters] = useState<HeaterStatus[]>([]);
  const [heaterTargets, setHeaterTargets] = useState<Record<string, string>>({});
  const [heatersLoading, setHeatersLoading] = useState(false);
  const [settingHeaters, setSettingHeaters] = useState(false);
  const [macros, setMacros] = useState<MacroEntry[]>([]);
  const [macroSearch, setMacroSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [macrosLoading, setMacrosLoading] = useState(false);
  const [executingMacro, setExecutingMacro] = useState<string | null>(null);
  const [dialog, setDialog] = useState<AppDialog | null>(null);
  const [dialogInputValue, setDialogInputValue] = useState("");
  const [message, setMessage] = useState(defaultLocaleMessages["status.ready"] ?? "Ready");
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const [restartingFirmware, setRestartingFirmware] = useState(false);
  const [emergencyStopping, setEmergencyStopping] = useState(false);
  const [runningQuickCommand, setRunningQuickCommand] = useState<QuickCommand | null>(null);
  const [outlineWidth, setOutlineWidth] = useState(320);
  const [includePanelHeight, setIncludePanelHeight] = useState(240);
  const [sectionPreview, setSectionPreview] = useState<SectionPreview | null>(null);
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const includePanelRef = useRef<HTMLElement | null>(null);
  const previewCloseTimerRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const heatersRef = useRef<HeaterStatus[]>([]);

  const activeFile = openFiles.find((file) => file.path === activePath);
  const openPathSet = useMemo(() => new Set(openFiles.map((file) => file.path)), [openFiles]);
  const visibleTree = useMemo(() => filterBackupFiles(tree, hideBackupFiles), [hideBackupFiles, tree]);
  const iconByPath = useMemo(() => collectIconMap(tree), [tree]);
  const activeIncludes = useMemo(
    () => (activeFile && activeFile.kind !== "image" ? getIncludes(activeFile.content) : []),
    [activeFile]
  );
  const activeSections = useMemo(
    () => (activeFile && activeFile.kind !== "image" ? getConfigSections(activeFile.content) : []),
    [activeFile]
  );
  const filteredSections = useMemo(() => {
    const query = sectionSearch.trim().toLowerCase();
    if (!query) return activeSections;

    return activeSections.filter((section) =>
      `${section.title} ${section.content} ${section.line}`.toLowerCase().includes(query)
    );
  }, [activeSections, sectionSearch]);
  const activeDirectory = activePath ? dirname(activePath) : "";
  const filteredMacros = useMemo(() => {
    const query = macroSearch.trim().toLowerCase();
    if (!query) return macros;

    return macros.filter((macro) =>
      `${macro.name} ${macro.path} ${macro.title}`.toLowerCase().includes(query)
    );
  }, [macroSearch, macros]);
  const anyHeaterActive = heaters.some((heater) => heater.target > 0);
  const t = useCallback(
    (key: string, values?: Record<string, string | number>) => translate(messages, key, values),
    [messages]
  );

  const cacheAndSetHeaters = useCallback((nextHeaters: HeaterStatus[]) => {
    const heatersWithColors = assignHeaterColors(nextHeaters);
    heatersRef.current = heatersWithColors;
    setHeaters(heatersWithColors);
    writeCachedHeaters(heatersWithColors);
  }, []);

  const confirmDialog = useCallback((title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ type: "confirm", title, message, resolve });
    });
  }, []);

  const promptDialog = useCallback((title: string, defaultValue: string) => {
    return new Promise<string | undefined>((resolve) => {
      setDialogInputValue(defaultValue);
      setDialog({ type: "input", title, defaultValue, resolve });
    });
  }, []);

  const closeDialog = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === "confirm") {
      dialog.resolve(false);
    } else {
      dialog.resolve(undefined);
    }
    setDialog(null);
  }, [dialog]);

  const submitDialogInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!dialog || dialog.type !== "input") return;
      dialog.resolve(dialogInputValue);
      setDialog(null);
    },
    [dialog, dialogInputValue]
  );

  const acceptDialog = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === "confirm") {
      dialog.resolve(true);
    } else {
      dialog.resolve(dialogInputValue);
    }
    setDialog(null);
  }, [dialog, dialogInputValue]);

  const loadLocale = useCallback(async (code: string) => {
    let payload: { code?: string; messages?: Record<string, string>; error?: string };

    try {
      const response = await fetch(apiPath(`/api/locales?locale=${encodeURIComponent(code)}`), { cache: "no-store" });
      payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load locale");
    } catch (error) {
      const bundledLocale = bundledLocales[code];
      if (!bundledLocale) throw error;
      payload = {
        code,
        messages: bundledLocale.messages ?? {}
      };
    }

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
      setPrinterStatus(normalizePrinterStatus(payload, t("errors.printerStatus")));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.printerStatus");
      setPrinterStatus(normalizePrinterStatus({ error: message }, t("errors.printerStatus")));
    }
  }, [t]);

  const loadHeaters = useCallback(
    async (showError = false, refreshCatalog = false) => {
      const cachedHeaters = refreshCatalog
        ? []
        : heatersRef.current.length > 0
          ? heatersRef.current
          : readCachedHeaters();

      if (!refreshCatalog && heatersRef.current.length === 0 && cachedHeaters.length > 0) {
        cacheAndSetHeaters(cachedHeaters);
      }

      try {
        const response = await fetch(apiPath(heaterQueryPath(cachedHeaters, refreshCatalog)), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.loadHeaters"));

        const nextHeaters = (payload.heaters ?? []) as HeaterStatus[];
        cacheAndSetHeaters(nextHeaters);
        return nextHeaters;
      } catch (error) {
        if (cachedHeaters.length === 0) {
          cacheAndSetHeaters([]);
        }
        if (showError) {
          setMessage(error instanceof Error ? error.message : t("errors.loadHeaters"));
        }
        return undefined;
      }
    },
    [cacheAndSetHeaters, t]
  );

  const setHeaterTargetInputs = useCallback((nextHeaters: HeaterStatus[]) => {
    setHeaterTargets(
      Object.fromEntries(nextHeaters.map((heater) => [heater.name, String(Math.round(heater.target))]))
    );
  }, []);

  const refreshHeaterCatalog = useCallback(async () => {
    setHeatersLoading(true);
    setMessage(t("status.loadingHeaters"));

    try {
      const nextHeaters = await loadHeaters(true, true);
      if (nextHeaters) {
        setHeaterTargetInputs(nextHeaters);
        setMessage(t("status.heatersRefreshed"));
      }
    } finally {
      setHeatersLoading(false);
    }
  }, [loadHeaters, setHeaterTargetInputs, t]);

  const openHeatersModal = useCallback(async () => {
    setHeatersOpen(true);

    const cachedHeaters = heatersRef.current.length > 0 ? heatersRef.current : readCachedHeaters();
    if (cachedHeaters.length > 0) {
      cacheAndSetHeaters(cachedHeaters);
      setHeaterTargetInputs(cachedHeaters);
      setHeatersLoading(false);
      return;
    }

    await refreshHeaterCatalog();
  }, [cacheAndSetHeaters, refreshHeaterCatalog, setHeaterTargetInputs]);

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

    if (!(await confirmDialog(t("actions.restartFirmware"), t("confirm.restartFirmware")))) return;

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
  }, [confirmDialog, loadPrinterStatus, printerStatus, restartingFirmware, t]);

  const runQuickCommand = useCallback(
    async (command: QuickCommand, label: string) => {
      if (runningQuickCommand) return;
      if (!printerStatus || printerStatus.error) {
        setMessage(printerStatus?.error ?? t("errors.printerStatus"));
        return;
      }

      if (printerStatus.printing) {
        setMessage(t("errors.restartPrinting"));
        return;
      }

      setRunningQuickCommand(command);
      setMessage(t("status.runningCommand", { command: label }));

      try {
        const response = await fetch(apiPath("/api/printer/quick-command"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.quickCommand"));

        setMessage(t("status.commandDone", { command: label }));
        await loadPrinterStatus();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.quickCommand"));
      } finally {
        setRunningQuickCommand(null);
      }
    },
    [loadPrinterStatus, printerStatus, runningQuickCommand, t]
  );

  const runMove = useCallback(
    async (
      payload:
        | { action: "jog"; axis: JogAxis; distance: number }
        | { action: "absolute"; axis: JogAxis; position: number }
        | { action: "z-offset"; adjust: number },
      label: string
    ) => {
      if (movingAction) return;
      if (!printerStatus || printerStatus.error) {
        setMessage(printerStatus?.error ?? t("errors.printerStatus"));
        return;
      }

      if (printerStatus.printing) {
        setMessage(t("errors.restartPrinting"));
        return;
      }

      if (!printerStatus.allAxesHomed) {
        setMessage(t("errors.moveHoming"));
        return;
      }

      setMovingAction(label);
      setMessage(t("status.moving", { move: label }));

      try {
        const response = await fetch(apiPath("/api/printer/move"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? t("errors.movePrinter"));

        if (body.status) {
          setPrinterStatus(body.status);
        } else {
          await loadPrinterStatus();
        }
        setMessage(t("status.moveDone"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.movePrinter"));
      } finally {
        setMovingAction(null);
      }
    },
    [loadPrinterStatus, movingAction, printerStatus, t]
  );

  const runAbsoluteMove = useCallback(
    async (axis: JogAxis) => {
      if (!printerStatus) return;

      const position = parsePositionInput(positionInputs[axis]);
      const limit = printerStatus.positionLimits[axis];
      const axisLabel = axis.toUpperCase();

      if (position === undefined) {
        setMessage(t("errors.movePosition", { axis: axisLabel }));
        return;
      }

      if (position < limit.min || position > limit.max) {
        setMessage(
          t("errors.moveRange", {
            axis: axisLabel,
            min: formatPosition(limit.min, axis === "z" ? 3 : 2),
            max: formatPosition(limit.max, axis === "z" ? 3 : 2)
          })
        );
        return;
      }

      await runMove({ action: "absolute", axis, position }, `${axisLabel} ${formatPosition(position, axis === "z" ? 3 : 2)}`);
    },
    [positionInputs, printerStatus, runMove, t]
  );

  const coolHeater = useCallback(
    async (heater: HeaterStatus) => {
      if (settingHeaters) return;

      setSettingHeaters(true);
      setMessage(t("status.coolingHeater", { heater: heater.label }));

      try {
        const response = await fetch(apiPath("/api/printer/heaters"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets: { [heater.name]: 0 }, heaters: heatersRef.current.map((item) => item.name) })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.coolHeater"));

        const nextHeaters = (payload.heaters ?? []) as HeaterStatus[];
        cacheAndSetHeaters(nextHeaters);
        setHeaterTargetInputs(nextHeaters);
        setMessage(t("status.heaterCooling", { heater: heater.label }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.coolHeater"));
      } finally {
        setSettingHeaters(false);
      }
    },
    [cacheAndSetHeaters, setHeaterTargetInputs, settingHeaters, t]
  );

  const triggerEmergencyStop = useCallback(async () => {
    if (emergencyStopping) return;

    setEmergencyStopping(true);
    setMessage(t("status.emergencyStopping"));

    try {
      const response = await fetch(apiPath("/api/printer/emergency-stop"), { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.emergencyStop"));

      setMessage(t("status.emergencyStopped"));
      await Promise.all([loadPrinterStatus(), loadHeaters()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.emergencyStop"));
    } finally {
      setEmergencyStopping(false);
    }
  }, [emergencyStopping, loadHeaters, loadPrinterStatus, t]);

  const setHeaterTargetValue = useCallback((heaterName: string, value: string) => {
    setHeaterTargets((targets) => ({ ...targets, [heaterName]: value }));
  }, []);

  const submitHeaters = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (settingHeaters) return;

      const targets = Object.fromEntries(
        heaters.map((heater) => {
          const value = Number(heaterTargets[heater.name] ?? heater.target);
          return [heater.name, Number.isFinite(value) ? Math.max(0, value) : heater.target];
        })
      );

      setSettingHeaters(true);
      setMessage(t("status.settingHeaters"));

      try {
        const response = await fetch(apiPath("/api/printer/heaters"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets, heaters: heaters.map((heater) => heater.name) })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.setHeaters"));

        const nextHeaters = (payload.heaters ?? []) as HeaterStatus[];
        cacheAndSetHeaters(nextHeaters);
        setHeaterTargetInputs(nextHeaters);
        setHeatersOpen(false);
        setMessage(t("status.heatersSet"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.setHeaters"));
      } finally {
        setSettingHeaters(false);
      }
    },
    [cacheAndSetHeaters, heaterTargets, heaters, setHeaterTargetInputs, settingHeaters, t]
  );

  const openFile = useCallback(
    async (path: string) => {
      if (isDownloadOnlyPath(path)) {
        window.open(apiPath(`/api/download?path=${encodeURIComponent(path)}`), "_blank", "noopener,noreferrer");
        return;
      }

      setActivePath(path);
      if (openFiles.some((file) => file.path === path)) return;

      if (isImagePath(path)) {
        setOpenFiles((files) => [
          ...files,
          {
            path,
            content: "",
            savedContent: "",
            kind: "image",
            imageUrl: apiPath(`/api/download?path=${encodeURIComponent(path)}&inline=1`)
          }
        ]);
        setMessage(t("status.opened", { path }));
        return;
      }

      setOpenFiles((files) => [...files, { path, content: "", savedContent: "", kind: "text", loading: true }]);
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
                  kind: "text",
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
        body: JSON.stringify({ path: activeFile.path, content: activeFile.content, createBackup: createBackupOnSave })
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
      setMessage(
        payload.backupPath
          ? t("status.savedWithBackup", { path: activeFile.path, backupPath: payload.backupPath })
          : t("status.saved", { path: activeFile.path })
      );
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
  }, [activeFile, createBackupOnSave, t]);

  const closeFile = useCallback(
    async (path: string) => {
      const file = openFiles.find((item) => item.path === path);
      if (
        file &&
        file.kind !== "image" &&
        file.content !== file.savedContent &&
        !(await confirmDialog(t("actions.close"), t("confirm.closeUnsaved", { path })))
      ) {
        return;
      }

      const nextFiles = openFiles.filter((item) => item.path !== path);
      setOpenFiles(nextFiles);
      if (activePath === path) {
        setActivePath(nextFiles.at(-1)?.path);
      }
    },
    [activePath, confirmDialog, openFiles, t]
  );

  const createBlankFile = useCallback(async () => {
    const defaultPath = activeDirectory ? `${activeDirectory}/new.cfg` : "new.cfg";
    const requestedPath = await promptDialog(t("actions.createFile"), defaultPath);
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
  }, [activeDirectory, loadTree, openFile, promptDialog, t]);

  const downloadFile = useCallback((path: string) => {
    window.open(apiPath(`/api/download?path=${encodeURIComponent(path)}`), "_blank", "noopener,noreferrer");
  }, []);

  const deleteFile = useCallback(
    async (path: string) => {
      if (!(await confirmDialog(t("actions.deleteFile"), t("confirm.deleteFile", { path })))) return;

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
    [activePath, confirmDialog, loadTree, openFiles, t]
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

  const executeMacro = useCallback(
    async (macro: MacroEntry) => {
      if (executingMacro) return;
      if (!(await confirmDialog(t("actions.executeMacro"), t("confirm.executeMacro", { name: macro.name })))) return;

      setExecutingMacro(macro.name);
      setMessage(t("status.executingMacro", { name: macro.name }));

      try {
        const response = await fetch(apiPath("/api/printer/run-macro"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: macro.name })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.executeMacro"));

        setMessage(t("status.executedMacro", { name: macro.name }));
        await loadPrinterStatus();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.executeMacro"));
      } finally {
        setExecutingMacro(null);
      }
    },
    [confirmDialog, executingMacro, loadPrinterStatus, t]
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
    const cachedHeaters = readCachedHeaters();
    if (cachedHeaters.length > 0) {
      cacheAndSetHeaters(cachedHeaters);
      setHeaterTargetInputs(cachedHeaters);
    }
  }, [cacheAndSetHeaters, setHeaterTargetInputs]);

  useEffect(() => {
    let cancelled = false;

    const savedBackupPreference = window.localStorage.getItem("klipper-editor-create-backup-on-save");
    if (savedBackupPreference !== null) {
      setCreateBackupOnSave(savedBackupPreference === "true");
    }

    const savedHideBackupFiles = window.localStorage.getItem(hideBackupFilesKey);
    if (savedHideBackupFiles !== null) {
      setHideBackupFiles(savedHideBackupFiles === "true");
    }

    async function loadLocales() {
      try {
        const response = await fetch(apiPath("/api/locales"), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load locales");

        const apiLocales = (payload.locales ?? []) as LocaleOption[];
        const nextLocales = apiLocales.length > 0 ? apiLocales : bundledLocaleOptions();
        if (cancelled) return;

        setLocales(nextLocales);
        const savedLocale = window.localStorage.getItem("ratos-viewer-locale");
        const nextLocale =
          (savedLocale && nextLocales.some((locale) => locale.code === savedLocale) ? savedLocale : undefined) ??
          (nextLocales.some((locale) => locale.code === defaultLocaleCode) ? defaultLocaleCode : nextLocales[0]?.code);

        if (nextLocale) {
          await loadLocale(nextLocale);
        }
      } catch (error) {
        if (!cancelled) {
          const nextLocales = bundledLocaleOptions();
          setLocales(nextLocales);
          const savedLocale = window.localStorage.getItem("ratos-viewer-locale");
          const nextLocale =
            (savedLocale && nextLocales.some((locale) => locale.code === savedLocale) ? savedLocale : undefined) ??
            (nextLocales.some((locale) => locale.code === defaultLocaleCode) ? defaultLocaleCode : nextLocales[0]?.code);

          if (nextLocale) {
            await loadLocale(nextLocale);
          }
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
    if (!printerStatus) return;

    setPositionInputs((current) => {
      const next = { ...current };
      let changed = false;

      for (const axis of ["x", "y", "z"] as const) {
        if (editingPositionAxis === axis) continue;

        const value = formatPositionInput(printerStatus.position[axis], axis === "z" ? 3 : 2);
        if (next[axis] !== value) {
          next[axis] = value;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [editingPositionAxis, printerStatus]);

  useEffect(() => {
    void loadHeaters();
    const interval = window.setInterval(() => void loadHeaters(), 3000);
    return () => window.clearInterval(interval);
  }, [loadHeaters]);

  useEffect(() => {
    setSectionSearch("");
  }, [activePath]);

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

  const quickCommandDisabled =
    runningQuickCommand !== null || !printerStatus || Boolean(printerStatus.error) || printerStatus.printing;
  const movementDisabled =
    movingAction !== null ||
    !printerStatus ||
    Boolean(printerStatus.error) ||
    printerStatus.printing ||
    !printerStatus.allAxesHomed;

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
            <button
              className={hideBackupFiles ? "icon-button active-toggle" : "icon-button"}
              type="button"
              onClick={() => {
                const nextValue = !hideBackupFiles;
                setHideBackupFiles(nextValue);
                window.localStorage.setItem(hideBackupFilesKey, String(nextValue));
              }}
              title={hideBackupFiles ? t("actions.showBackupFiles") : t("actions.hideBackupFiles")}
              aria-pressed={hideBackupFiles}
              aria-label={hideBackupFiles ? t("actions.showBackupFiles") : t("actions.hideBackupFiles")}
            >
              {hideBackupFiles ? (
                <FcAcceptDatabase className="action-icon" />
              ) : (
                <FcDeleteDatabase className="action-icon" />
              )}
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
          nodes={visibleTree}
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
                {file.kind !== "image" && file.content !== file.savedContent && <Icon className="open-dot">*</Icon>}
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="editor-area">
        <div className="topbar">
          <div className="quick-toolbar">
            <button className="macro-button" type="button" onClick={openMacrosModal} title={t("actions.macros")}>
              <MdFunctions className="macro-button-icon" />
              {t("actions.macros")}
            </button>
            <div className="home-actions">
              <button
                className="home-button"
                type="button"
                disabled={quickCommandDisabled}
                title={t("actions.homeAll")}
                onClick={() => void runQuickCommand("home-all", t("actions.homeAll"))}
              >
                <MdHome className="home-button-icon" />
                All
              </button>
              <button
                className="home-button"
                type="button"
                disabled={quickCommandDisabled}
                title={t("actions.homeX")}
                onClick={() => void runQuickCommand("home-x", t("actions.homeX"))}
              >
                X
              </button>
              <button
                className="home-button"
                type="button"
                disabled={quickCommandDisabled}
                title={t("actions.homeY")}
                onClick={() => void runQuickCommand("home-y", t("actions.homeY"))}
              >
                Y
              </button>
              <button
                className="home-button"
                type="button"
                disabled={quickCommandDisabled}
                title={t("actions.homeZ")}
                onClick={() => void runQuickCommand("home-z", t("actions.homeZ"))}
              >
                Z
              </button>
              {printerStatus?.zTiltAvailable && (
                <button
                  className="home-button z-tilt-button"
                  type="button"
                  disabled={quickCommandDisabled}
                  title={t("actions.zTilt")}
                  onClick={() => void runQuickCommand("z-tilt", t("actions.zTilt"))}
                >
                  Z Tilt
                </button>
              )}
              <button
                className="home-button move-open-button"
                type="button"
                disabled={movementDisabled}
                title={
                  !printerStatus?.allAxesHomed
                    ? t("errors.moveHoming")
                    : printerStatus?.printing
                      ? t("errors.restartPrinting")
                      : t("actions.move")
                }
                onClick={() => setMovementOpen(true)}
              >
                <BsArrowsMove className="home-button-icon" />
              </button>
            </div>
            <div className="heater-toolbar">
              <button
                className={`hot-button ${anyHeaterActive ? "active" : ""}`}
                type="button"
                title={t("actions.hot")}
                onClick={() => void openHeatersModal()}
              >
                <FaHotjar className="hot-button-icon" />
                Hot
              </button>
              <div className="heater-indicators" aria-label={t("heaters.title")}>
                {heaters.slice(0, 4).map((heater) => (
                  <button
                    key={heater.name}
                    className={heater.target > 0 ? "heater-indicator active" : "heater-indicator"}
                    type="button"
                    title={t("actions.coolHeater", { heater: heater.label })}
                    aria-label={t("actions.coolHeater", { heater: heater.label })}
                    disabled={settingHeaters}
                    onClick={() => void coolHeater(heater)}
                  >
                    <TbActivityHeartbeat className="heater-indicator-icon" style={{ color: heater.color ?? "#7fd4ff" }} />
                    <span>
                      {heater.label} {formatTemperature(heater.temperature)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="emergency-button"
              type="button"
              title={t("actions.emergencyStop")}
              disabled={emergencyStopping}
              onClick={() => void triggerEmergencyStop()}
            >
              <MdEmergency className="emergency-button-icon" />
              {emergencyStopping ? t("actions.emergencyStopping") : t("actions.emergencyStop")}
            </button>
          </div>
          <div className="toolbar-actions">
            <a
              className="icon-button mainsail-button"
              href={mainsailUrl}
              title={t("actions.backToMainsail")}
              aria-label={t("actions.backToMainsail")}
            >
              <MdHome className="action-icon plain-action-icon" />
            </a>
            <a className="icon-button help-button" href={apiPath("/help")} target="_blank" rel="noreferrer" title={t("actions.help")}>
              <IoHelpCircleOutline className="action-icon plain-action-icon" />
            </a>
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
              disabled={
                !activeFile ||
                activeFile.kind === "image" ||
                activeFile.content === activeFile.savedContent ||
                activeFile.saving
              }
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
              {file.kind !== "image" && file.content !== file.savedContent && <Icon className="open-dot">*</Icon>}
              <span
                className="tab-close"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  void closeFile(file.path);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    void closeFile(file.path);
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
          ) : activeFile.kind === "image" && activeFile.imageUrl ? (
            <div className="image-preview-host">
              <div className="image-preview-frame">
                <img
                  className="image-preview"
                  src={activeFile.imageUrl}
                  alt={basename(activeFile.path)}
                  onError={() => {
                    setOpenFiles((files) =>
                      files.map((file) =>
                        file.path === activeFile.path ? { ...file, error: t("errors.openFile") } : file
                      )
                    );
                  }}
                />
              </div>
              <div className="image-preview-meta">
                <span>{activeFile.path}</span>
                <button className="dialog-button" type="button" onClick={() => downloadFile(activeFile.path)}>
                  <FcDownload className="action-icon" />
                  {t("actions.downloadFile")}
                </button>
              </div>
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
                <section className="outline-section section-outline-section">
                  <div className="panel-title">{t("panels.sections")}</div>
                  <label className="section-search-field">
                    <FcSearch className="action-icon" />
                    <input
                      value={sectionSearch}
                      placeholder={t("sections.search")}
                      onChange={(event) => setSectionSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSectionSearch("");
                        }
                      }}
                    />
                    {sectionSearch && (
                      <button
                        className="search-clear-button"
                        type="button"
                        title={t("actions.clearSearch")}
                        aria-label={t("actions.clearSearch")}
                        onClick={() => setSectionSearch("")}
                      >
                        <IoClose className="search-clear-icon" />
                      </button>
                    )}
                  </label>
                  <div className="outline-list">
                    {activeSections.length === 0 ? (
                      <p className="empty-note">{t("empty.sections")}</p>
                    ) : filteredSections.length === 0 ? (
                      <p className="empty-note">{t("empty.sectionMatches")}</p>
                    ) : (
                      filteredSections.map((section) => (
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

        {dialog && (
          <div className="modal-backdrop" role="presentation" onMouseDown={closeDialog}>
            <section
              className="options-modal app-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="app-dialog-title">{dialog.title}</h2>
                <button className="modal-close" type="button" title={t("actions.cancel")} onClick={closeDialog}>
                  x
                </button>
              </div>
              {dialog.type === "confirm" ? (
                <div className="dialog-body">
                  <p>{dialog.message}</p>
                  <div className="dialog-actions">
                    <button className="dialog-button" type="button" onClick={closeDialog}>
                      {t("actions.cancel")}
                    </button>
                    <button className="dialog-button primary" type="button" onClick={acceptDialog}>
                      {t("actions.apply")}
                    </button>
                  </div>
                </div>
              ) : (
                <form className="dialog-body" onSubmit={submitDialogInput}>
                  <label className="dialog-field">
                    <span>{dialog.title}</span>
                    <input
                      autoFocus
                      value={dialogInputValue}
                      onChange={(event) => setDialogInputValue(event.target.value)}
                    />
                  </label>
                  <div className="dialog-actions">
                    <button className="dialog-button" type="button" onClick={closeDialog}>
                      {t("actions.cancel")}
                    </button>
                    <button className="dialog-button primary" type="submit">
                      {t("actions.apply")}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        )}

        {movementOpen && printerStatus && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setMovementOpen(false)}>
            <section
              className="options-modal movement-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="movement-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="movement-title">{t("movement.title")}</h2>
                <button
                  className="modal-close"
                  type="button"
                  title={t("options.close")}
                  aria-label={t("options.close")}
                  onClick={() => setMovementOpen(false)}
                >
                  x
                </button>
              </div>
              <div className="movement-modal-body">
                <div className="movement-state">
                  <BsArrowsMove className="movement-state-icon" />
                  <span>{t("movement.absolutePosition")}</span>
                </div>
                <div className="movement-position-grid">
                  {(["x", "y", "z"] as const).map((axis) => {
                    const axisLabel = axis.toUpperCase();
                    const range = formatAxisRange(printerStatus.positionLimits[axis], axis);

                    return (
                      <label key={axis} className="movement-axis-readout">
                        <span className="movement-axis-header">
                          <span>{axisLabel}</span>
                          <small>[{range}]</small>
                        </span>
                        <input
                          value={positionInputs[axis]}
                          inputMode="decimal"
                          disabled={movementDisabled}
                          aria-label={axisLabel}
                          title={t("movement.axisRange", {
                            min: formatPosition(printerStatus.positionLimits[axis].min, axis === "z" ? 3 : 2),
                            max: formatPosition(printerStatus.positionLimits[axis].max, axis === "z" ? 3 : 2)
                          })}
                          onFocus={() => setEditingPositionAxis(axis)}
                          onBlur={() => setEditingPositionAxis(null)}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setPositionInputs((current) => ({ ...current, [axis]: nextValue }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            event.currentTarget.blur();
                            void runAbsoluteMove(axis);
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="movement-controls">
                  <div className="jog-pad xy-pad">
                    <button
                      className="jog-button jog-left"
                      type="button"
                      disabled={movementDisabled}
                      title={`X ${formatSigned(-moveStep)}`}
                      onClick={() => void runMove({ action: "jog", axis: "x", distance: -moveStep }, `X ${formatSigned(-moveStep)}`)}
                    >
                      <MdKeyboardArrowLeft className="jog-icon" />
                    </button>
                    <button
                      className="jog-button jog-up"
                      type="button"
                      disabled={movementDisabled}
                      title={`Y ${formatSigned(moveStep)}`}
                      onClick={() => void runMove({ action: "jog", axis: "y", distance: moveStep }, `Y ${formatSigned(moveStep)}`)}
                    >
                      <MdKeyboardArrowUp className="jog-icon" />
                    </button>
                    <button
                      className="jog-button jog-right"
                      type="button"
                      disabled={movementDisabled}
                      title={`X ${formatSigned(moveStep)}`}
                      onClick={() => void runMove({ action: "jog", axis: "x", distance: moveStep }, `X ${formatSigned(moveStep)}`)}
                    >
                      <MdKeyboardArrowRight className="jog-icon" />
                    </button>
                    <button
                      className="jog-button jog-down"
                      type="button"
                      disabled={movementDisabled}
                      title={`Y ${formatSigned(-moveStep)}`}
                      onClick={() => void runMove({ action: "jog", axis: "y", distance: -moveStep }, `Y ${formatSigned(-moveStep)}`)}
                    >
                      <MdKeyboardArrowDown className="jog-icon" />
                    </button>
                  </div>
                  <div className="jog-pad z-pad">
                    <button
                      className="jog-button"
                      type="button"
                      disabled={movementDisabled}
                      title={`Z ${formatSigned(moveStep)}`}
                      onClick={() => void runMove({ action: "jog", axis: "z", distance: moveStep }, `Z ${formatSigned(moveStep)}`)}
                    >
                      <MdKeyboardArrowUp className="jog-icon" />
                    </button>
                    <button
                      className="jog-button"
                      type="button"
                      disabled={movementDisabled}
                      title={`Z ${formatSigned(-moveStep)}`}
                      onClick={() => void runMove({ action: "jog", axis: "z", distance: -moveStep }, `Z ${formatSigned(-moveStep)}`)}
                    >
                      <MdKeyboardArrowDown className="jog-icon" />
                    </button>
                  </div>
                  <div className="movement-home-grid">
                    <div className="movement-home-row">
                      <button
                        className="movement-action-button"
                        type="button"
                        disabled={quickCommandDisabled}
                        onClick={() => void runQuickCommand("home-all", t("actions.homeAll"))}
                      >
                        <MdHome className="movement-action-icon" />
                        {t("movement.homeAll")}
                      </button>
                      {printerStatus.zTiltAvailable && (
                        <button
                          className="movement-action-button"
                          type="button"
                          disabled={quickCommandDisabled}
                          onClick={() => void runQuickCommand("z-tilt", t("actions.zTilt"))}
                        >
                          {t("movement.zTilt").toUpperCase()}
                        </button>
                      )}
                    </div>
                    <div className="movement-home-row axis-row">
                    <button
                      className="movement-action-button"
                      type="button"
                      disabled={quickCommandDisabled}
                      onClick={() => void runQuickCommand("home-x", t("actions.homeX"))}
                    >
                      X
                    </button>
                    <button
                      className="movement-action-button"
                      type="button"
                      disabled={quickCommandDisabled}
                      onClick={() => void runQuickCommand("home-y", t("actions.homeY"))}
                    >
                      Y
                    </button>
                    <button
                      className="movement-action-button"
                      type="button"
                      disabled={quickCommandDisabled}
                      onClick={() => void runQuickCommand("home-z", t("actions.homeZ"))}
                    >
                      Z
                    </button>
                    </div>
                  </div>
                </div>
                <div className="movement-step-grid" role="group" aria-label={t("movement.distance", { distance: moveStep })}>
                  {moveSteps.map((step) => (
                    <button
                      key={step}
                      className={step === moveStep ? "movement-step active" : "movement-step"}
                      type="button"
                      onClick={() => setMoveStep(step)}
                    >
                      {step}
                    </button>
                  ))}
                </div>
                <div className="movement-offset">
                  <div className="movement-offset-title">
                    {t("movement.zOffset", { offset: formatOffset(printerStatus.zOffset) })}
                  </div>
                  <div className="offset-grid">
                    {zOffsetSteps.map((step) => (
                      <button
                        key={`up-${step}`}
                        className="offset-button"
                        type="button"
                        disabled={movementDisabled}
                        onClick={() =>
                          void runMove({ action: "z-offset", adjust: step }, `Z-offset ${formatSigned(step)}`)
                        }
                      >
                        <MdKeyboardArrowUp className="offset-icon" />
                        {formatSigned(step)}
                      </button>
                    ))}
                    {zOffsetSteps.map((step) => (
                      <button
                        key={`down-${step}`}
                        className="offset-button"
                        type="button"
                        disabled={movementDisabled}
                        onClick={() =>
                          void runMove({ action: "z-offset", adjust: -step }, `Z-offset ${formatSigned(-step)}`)
                        }
                      >
                        <MdKeyboardArrowDown className="offset-icon" />
                        {formatSigned(-step)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {heatersOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setHeatersOpen(false)}>
            <section
              className="options-modal heaters-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="heaters-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="heaters-title">{t("heaters.title")}</h2>
                <div className="modal-header-actions">
                  <button
                    className="modal-icon-button"
                    type="button"
                    title={t("actions.refreshHeaters")}
                    aria-label={t("actions.refreshHeaters")}
                    onClick={() => void refreshHeaterCatalog()}
                  >
                    <FcRefresh className="action-icon" />
                  </button>
                  <button
                    className="modal-close"
                    type="button"
                    title={t("options.close")}
                    aria-label={t("options.close")}
                    onClick={() => setHeatersOpen(false)}
                  >
                    x
                  </button>
                </div>
              </div>
              <form className="heater-modal-body" onSubmit={submitHeaters}>
                <p className="heater-cache-note">{t("heaters.cacheHelp")}</p>
                {heatersLoading ? (
                  <p className="empty-note">{t("status.loadingHeaters")}</p>
                ) : heaters.length === 0 ? (
                  <p className="empty-note">{t("heaters.empty")}</p>
                ) : (
                  <div className="heater-list">
                    {heaters.map((heater) => (
                      <label key={heater.name} className="heater-row">
                        <span className="heater-row-name">{heater.label}</span>
                        <span className="heater-row-current">
                          {t("heaters.current")} {formatTemperature(heater.temperature)}
                        </span>
                        <span className="heater-row-target">
                          {t("heaters.target")}
                          <input
                            type="number"
                            min="0"
                            max="350"
                            step="1"
                            value={heaterTargets[heater.name] ?? ""}
                            onChange={(event) => setHeaterTargetValue(heater.name, event.target.value)}
                          />
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="dialog-actions">
                  <button className="dialog-button" type="button" onClick={() => setHeatersOpen(false)}>
                    {t("actions.cancel")}
                  </button>
                  <button className="dialog-button primary" type="submit" disabled={settingHeaters || heaters.length === 0}>
                    {settingHeaters ? t("actions.settingHeaters") : t("actions.setHeaters")}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

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
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setMacroSearch("");
                      }
                    }}
                  />
                  {macroSearch && (
                    <button
                      className="search-clear-button"
                      type="button"
                      title={t("actions.clearSearch")}
                      aria-label={t("actions.clearSearch")}
                      onClick={() => setMacroSearch("")}
                    >
                      <IoClose className="search-clear-icon" />
                    </button>
                  )}
                </label>
                <div className="macro-count">{t("macros.count", { count: filteredMacros.length })}</div>
                <div className="macro-list">
                  {macrosLoading ? (
                    <p className="empty-note">{t("macros.loading")}</p>
                  ) : filteredMacros.length === 0 ? (
                    <p className="empty-note">{t("macros.empty")}</p>
                  ) : (
                    filteredMacros.map((macro) => (
                      <div
                        key={`${macro.path}-${macro.line}-${macro.name}`}
                        className="macro-row"
                        title={`${macro.title} - ${macro.path}:${macro.line}`}
                      >
                        <button className="macro-open-button" type="button" onClick={() => void openMacro(macro)}>
                          <MdFunctions className="macro-row-icon" />
                          <span className="macro-row-main">
                            <span className="macro-row-name">{macro.name}</span>
                            <span className="macro-row-path">
                              {macro.path}:{macro.line}
                            </span>
                          </span>
                        </button>
                        <button
                          className="macro-start-button"
                          type="button"
                          title={t("actions.executeMacro")}
                          aria-label={t("actions.executeMacro")}
                          disabled={executingMacro !== null}
                          onClick={() => void executeMacro(macro)}
                        >
                          <FcStart className="macro-start-icon" />
                        </button>
                      </div>
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
                <label className="setting-checkbox">
                  <input
                    type="checkbox"
                    checked={createBackupOnSave}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setCreateBackupOnSave(checked);
                      window.localStorage.setItem("klipper-editor-create-backup-on-save", String(checked));
                    }}
                  />
                  <span>{t("options.createBackupOnSave")}</span>
                </label>
                <p className="setting-help">{t("options.createBackupOnSaveHelp")}</p>
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
              {activeFile.kind !== "image" && activeFile.content !== activeFile.savedContent
                ? ` - ${t("status.modified")}`
                : ""}
            </span>
          )}
        </footer>
      </section>
    </main>
  );
}
