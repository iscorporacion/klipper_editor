"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import type { ChangeEvent, CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MdiIcon from "@mdi/react";
import { mdiConsoleLine } from "@mdi/js";
import type { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { tags } from "@lezer/highlight";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { BsArrowsMove, BsPrinterFill, BsSignStopFill } from "react-icons/bs";
import { FaHotjar } from "react-icons/fa";
import { FaFloppyDisk, FaPause, FaPlay, FaPrint, FaStop } from "react-icons/fa6";
import {
  FcAcceptDatabase,
  FcDeleteDatabase,
  FcDownload,
  FcExpand,
  FcNext,
  FcRefresh,
  FcSearch,
  FcSettings,
  FcUpload
} from "react-icons/fc";
import {
  MdDelete,
  MdFunctions,
  MdHome,
  MdKeyboardArrowDown,
  MdKeyboardArrowLeft,
  MdKeyboardArrowRight,
  MdKeyboardArrowUp,
  MdSend,
  MdTerminal
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
const terminalHeightKey = "klipper-editor-terminal-height";
const terminalHistoryKey = "klipper-editor-terminal-history";

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

type MainsailVisualTheme = {
  mode: string;
  theme: string;
  logo: string;
  primary: string;
  logoPath: string | null;
  logoUrl?: string | null;
  logoMask?: boolean;
  error?: string;
};

type PrinterStatus = {
  webhooksState: string;
  webhooksMessage: string;
  printState: string;
  filename: string;
  progress: number;
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
type MachinePowerAction = "shutdown" | "reboot";
type AxisLimit = {
  min: number;
  max: number;
};

type TerminalChunk = {
  id: number;
  text: string;
};

type TerminalPayload = {
  id: string;
  cursor: number;
  alive: boolean;
  exitCode: number | null;
  output: TerminalChunk[];
  error?: string;
};

type KlipperConsoleEntry = {
  id: string;
  script: string;
  status: "sent" | "error";
  message: string;
  timestamp: string;
};

type GcodeThumbnail = {
  width: number;
  height: number;
  size?: number;
  relativePath: string;
};

type GcodeFileEntry = {
  path: string;
  name: string;
  size: number;
  modified: number;
  estimatedTime?: number;
  filamentTotal?: number;
  layerHeight?: number;
  objectHeight?: number;
  thumbnails: GcodeThumbnail[];
};

type GcodeHistoryEntry = {
  id: string;
  filename: string;
  status: string;
  startTime: number;
  endTime: number;
  printDuration: number;
  totalDuration: number;
  filamentUsed: number;
  metadata?: Partial<GcodeFileEntry>;
};

type GcodeModalTab = "files" | "history";
type SelectedGcodeItem = { type: "file"; item: GcodeFileEntry } | { type: "history"; item: GcodeHistoryEntry };
type PrintControlAction = "pause" | "resume" | "cancel";

type SearchResult = {
  path: string;
  line: number;
  text: string;
};

const fallbackMainsailTheme: MainsailVisualTheme = {
  mode: "dark",
  theme: "mainsail",
  logo: "#D41216",
  primary: "#2196f3",
  logoPath: null,
  logoUrl: "/mainsail-themes/logo.svg",
  logoMask: true
};

type ThemeVariables = CSSProperties & Record<`--${string}`, string>;
type LogoMaskStyle = CSSProperties & {
  WebkitMaskImage?: string;
  WebkitMaskPosition?: string;
  WebkitMaskRepeat?: string;
  WebkitMaskSize?: string;
};

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeCssColor(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  if (!color) return fallback;
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(color)) return color;
  return fallback;
}

function rgbaFromHex(value: string, alpha: number) {
  const hex = value.trim();
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return `color-mix(in srgb, ${hex} 18%, transparent)`;

  const raw = match[1];
  const expanded = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function contrastTextForColor(value: string) {
  const hex = value.trim();
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return "#ffffff";

  const raw = match[1];
  const expanded = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  const luminance = 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;

  return luminance > 0.55 ? "#111418" : "#ffffff";
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
    progress: Math.min(Math.max(numericValue(status.progress), 0), 1),
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

function isPrinterInitializingStatus(status: PrinterStatus | null) {
  if (!status || status.error) return false;
  const state = status.webhooksState.toLowerCase();
  return state !== "ready" && ["startup", "shutdown", "initializing", "connecting"].includes(state);
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
  description?: string;
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
  "app.title": "K-Editor",
  "explorer.label": "Explorer",
  "actions.refreshTree": "Actualizar arbol",
  "actions.createFile": "Crear archivo",
  "actions.uploadFiles": "Subir archivos",
  "actions.hideBackupFiles": "Ocultar backups",
  "actions.showBackupFiles": "Mostrar backups",
  "actions.downloadFile": "Descargar archivo",
  "actions.deleteFile": "Borrar archivo",
  "actions.selectFile": "Seleccionar archivo",
  "actions.downloadSelectedFiles": "Descargar seleccionados",
  "actions.deleteSelectedFiles": "Borrar seleccionados",
  "actions.clearSelection": "Limpiar seleccion",
  "actions.downloadOnlyFile": "Descargar archivo",
  "actions.macros": "Macros",
  "actions.executeMacro": "Ejecutar macro",
  "actions.klipperConsole": "Consola Klipper",
  "actions.sendGcode": "Enviar",
  "actions.sendingGcode": "Enviando",
  "actions.printedFiles": "Archivos impresos",
  "actions.globalSearch": "Buscar en configuracion",
  "actions.search": "Buscar",
  "actions.searching": "Buscando",
  "actions.printFile": "Imprimir",
  "actions.printingFile": "Enviando impresion",
  "actions.pausePrint": "Pausar",
  "actions.resumePrint": "Continuar",
  "actions.cancelPrint": "Cancelar impresion",
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
  "actions.terminal": "Terminal",
  "actions.openTerminal": "Abrir terminal",
  "actions.closeTerminal": "Ocultar terminal",
  "actions.connectTerminal": "Conectar terminal",
  "actions.disconnectTerminal": "Desconectar terminal",
  "actions.runTerminalCommand": "Ejecutar",
  "actions.restartFirmware": "Restar",
  "actions.restartingFirmware": "Reiniciando",
  "status.ready": "Listo",
  "status.opening": "Abriendo {path}",
  "status.opened": "Abierto {path}",
  "status.creating": "Creando {path}",
  "status.created": "Creado {path}",
  "status.uploading": "Subiendo {path}",
  "status.uploaded": "Subido {path}",
  "status.deleted": "Borrado {path}",
  "status.deletedSelected": "{count} archivos borrados",
  "status.openingMacro": "Abriendo macro {name}",
  "status.executingMacro": "Ejecutando macro {name}",
  "status.executedMacro": "Macro ejecutada {name}",
  "status.gcodeSent": "G-code enviado",
  "status.printStarted": "Impresion iniciada",
  "status.printPaused": "Impresion pausada",
  "status.printResumed": "Impresion reanudada",
  "status.printCancelled": "Impresion cancelada",
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
  "status.reloadedOpenFiles": "Archivos abiertos recargados",
  "status.reloadedOpenFilesPartial": "Archivos abiertos recargados; {count} con cambios locales no se tocaron",
  "status.firmwareRestarting": "Reiniciando firmware",
  "status.firmwareRestarted": "Reinicio de firmware solicitado",
  "status.printerInitializing": "Inicializando",
  "status.terminalConnected": "Terminal conectada",
  "status.terminalDisconnected": "Terminal desconectada",
  "status.terminalRunning": "Ejecutando comando",
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
  "errors.downloadSelectedFiles": "No se pudieron descargar los archivos seleccionados",
  "errors.loadMacros": "No se pudieron cargar las macros",
  "errors.executeMacro": "No se pudo ejecutar la macro",
  "errors.gcodeCommand": "No se pudo enviar el G-code",
  "errors.loadGcodes": "No se pudieron cargar los archivos impresos",
  "errors.globalSearch": "No se pudo buscar en la configuracion",
  "errors.startPrint": "No se pudo iniciar la impresion",
  "errors.printControl": "No se pudo controlar la impresion",
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
  "errors.terminalDisabled": "La terminal esta deshabilitada en este host",
  "errors.terminalConnection": "No se pudo conectar la terminal",
  "errors.terminalCommand": "No se pudo enviar el comando",
  "errors.terminalUnsupportedCommand": "{command} no funciona en esta terminal. Usa SSH o una terminal TTY real para herramientas interactivas.",
  "errors.printerStatus": "No se pudo consultar Moonraker",
  "errors.includeNotFound": "No se encontro el include",
  "errors.includeOpen": "No se pudo abrir el include",
  "confirm.closeUnsaved": "{path} tiene cambios sin guardar. Cerrar?",
  "confirm.deleteFile": "Borrar {path}? Esta accion no se puede deshacer.",
  "confirm.deleteSelectedFiles": "Borrar {count} archivos seleccionados? Esta accion no se puede deshacer.",
  "confirm.restartFirmware": "Reiniciar firmware ahora?",
  "confirm.executeMacro": "Ejecutar macro {name} en la impresora?",
  "confirm.printFile": "Imprimir {name} ahora?",
  "confirm.cancelPrint": "Cancelar la impresion actual?",
  "prompt.newFilePath": "Ruta del nuevo archivo",
  "panels.openEditors": "Editores abiertos",
  "panels.terminal": "Terminal",
  "panels.klipperConsole": "Consola Klipper",
  "panels.printedFiles": "Archivos impresos",
  "panels.globalSearch": "Busqueda global",
  "panels.includes": "Includes",
  "panels.sections": "Sesiones",
  "empty.openFile": "Abre un archivo del arbol.",
  "empty.terminal": "Terminal deshabilitada. Activa KLIPPER_EDITOR_ENABLE_TERMINAL=true en el servicio.",
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
  "selection.count": "{count} seleccionados",
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
  "klipperConsole.placeholder": "Escribe G-code o una macro. Ctrl+Enter envia.\n\nEjemplos:\nG28\nBED_MESH_CALIBRATE",
  "klipperConsole.help": "Los comandos se envian a Moonraker como script G-code. Puedes enviar varias lineas.",
  "klipperConsole.empty": "Sin comandos enviados en esta sesion.",
  "klipperConsole.sent": "Enviado",
  "klipperConsole.error": "Error",
  "gcodes.files": "Archivos",
  "gcodes.history": "Historial",
  "gcodes.loading": "Cargando archivos.",
  "gcodes.empty": "Sin archivos G-code.",
  "gcodes.historyEmpty": "Sin historial de impresiones.",
  "gcodes.noSelection": "Selecciona un archivo para ver sus detalles.",
  "gcodes.noThumbnail": "Sin miniatura",
  "gcodes.search": "Buscar archivo",
  "gcodes.fileSize": "Tamano",
  "gcodes.modified": "Modificado",
  "gcodes.estimatedTime": "Tiempo estimado",
  "gcodes.printDuration": "Tiempo de impresion",
  "gcodes.totalDuration": "Tiempo total",
  "gcodes.filament": "Filamento",
  "gcodes.layerHeight": "Altura de capa",
  "gcodes.objectHeight": "Altura objeto",
  "gcodes.status": "Estado",
  "gcodes.started": "Inicio",
  "gcodes.finished": "Fin",
  "globalSearch.placeholder": "Buscar en toda la configuracion",
  "globalSearch.empty": "Ingresa al menos 2 caracteres.",
  "globalSearch.noResults": "Sin resultados.",
  "globalSearch.count": "{count} resultados",
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

function maxTerminalHeight(viewportHeight: number) {
  return Math.max(140, viewportHeight - 260);
}

const unsupportedTerminalCommands = [
  { label: "make menuconfig", pattern: /(^|[;&|]\s*)make\s+menuconfig(\s|$)/i },
  { label: "menuconfig", pattern: /(^|[;&|]\s*)menuconfig(\s|$)/i },
  { label: "raspi-config", pattern: /(^|[;&|]\s*)(sudo\s+)?raspi-config(\s|$)/i },
  { label: "kiauh", pattern: /(^|[;&|]\s*)kiauh(\s|$)/i },
  { label: "nano", pattern: /(^|[;&|]\s*)nano(\s|$)/i },
  { label: "vim", pattern: /(^|[;&|]\s*)vim?(\s|$)/i },
  { label: "less", pattern: /(^|[;&|]\s*)less(\s|$)/i },
  { label: "more", pattern: /(^|[;&|]\s*)more(\s|$)/i },
  { label: "top", pattern: /(^|[;&|]\s*)top(\s|$)/i },
  { label: "htop", pattern: /(^|[;&|]\s*)htop(\s|$)/i },
  { label: "screen", pattern: /(^|[;&|]\s*)screen(\s|$)/i },
  { label: "tmux", pattern: /(^|[;&|]\s*)tmux(\s|$)/i },
  { label: "ssh", pattern: /(^|[;&|]\s*)ssh(\s|$)/i }
];

function unsupportedTerminalCommand(command: string) {
  return unsupportedTerminalCommands.find((item) => item.pattern.test(command));
}

function createConsoleEntry(script: string, status: KlipperConsoleEntry["status"], message: string): KlipperConsoleEntry {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    script,
    status,
    message,
    timestamp: new Date().toLocaleString()
  };
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

function formatProgress(value: number) {
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  return new Date(seconds * 1000).toLocaleString();
}

function formatMillimeters(value: number | undefined) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? `${Number(value).toFixed(2)} mm` : "-";
}

function bestThumbnail(thumbnails: GcodeThumbnail[] = []) {
  return [...thumbnails].sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

function selectedGcodeName(selection: SelectedGcodeItem) {
  return selection.type === "file" ? selection.item.name : basename(selection.item.filename);
}

function selectedGcodePath(selection: SelectedGcodeItem) {
  return selection.type === "file" ? selection.item.path : selection.item.filename;
}

function selectedGcodeThumbnails(selection: SelectedGcodeItem) {
  return selection.type === "file" ? selection.item.thumbnails : selection.item.metadata?.thumbnails ?? [];
}

function GcodeListPreview({ thumbnails }: { thumbnails: GcodeThumbnail[] }) {
  const thumbnail = bestThumbnail(thumbnails);
  if (!thumbnail) {
    return <BsPrinterFill className="gcode-row-icon" />;
  }

  return (
    <img
      className="gcode-row-thumbnail"
      src={apiPath(`/api/printer/gcode-thumbnail?path=${encodeURIComponent(thumbnail.relativePath)}`)}
      alt=""
    />
  );
}

function shouldReloadOpenFilesAfterGcode(script: string) {
  return /(^|\n)\s*(SAVE_CONFIG|RESTART|FIRMWARE_RESTART)\b/i.test(script);
}

function formatPosition(value: number, digits = 2) {
  return value.toFixed(digits).replace(/\.?0+$/, "").replace(".", ",");
}

function formatPositionInput(value: number, digits = 2) {
  return formatPosition(value, digits);
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

class IncludeOpenWidget extends WidgetType {
  constructor(private readonly includePath: string) {
    super();
  }

  eq(other: WidgetType) {
    return other instanceof IncludeOpenWidget && other.includePath === this.includePath;
  }

  toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-include-open-button";
    button.title = `Open include ${this.includePath}`;
    button.setAttribute("aria-label", `Open include ${this.includePath}`);
    button.dataset.includePath = this.includePath;
    button.innerHTML = `
      <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">
        <path d="M384 224v184a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V168a40 40 0 0 1 40-40h184" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"/>
        <path d="M336 64h112v112" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"/>
        <path d="M224 288 440 72" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"/>
      </svg>
    `;

    return button;
  }

  ignoreEvent() {
    return false;
  }
}

function buildLinkDecorations(view: EditorView) {
  const ranges: Range<Decoration>[] = [];
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
      const includePath = includeMatch[1].trim();
      const start = line.from + (includeMatch.index ?? 0);
      const end = start + includeMatch[0].length;
      ranges.push(includeMark.range(start, end));
      ranges.push(Decoration.widget({ widget: new IncludeOpenWidget(includePath), side: 1 }).range(end));
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
      const target = event.target instanceof Element ? event.target : null;
      const includeButton = target?.closest<HTMLButtonElement>(".cm-include-open-button");
      const includePath = includeButton?.dataset.includePath;
      if (includePath) {
        event.preventDefault();
        event.stopPropagation();
        onInclude(includePath, activePath);
        return true;
      }

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
  selectedPaths,
  onOpen,
  onDownload,
  onDelete,
  onToggleSelected,
  downloadLabel,
  deleteLabel,
  selectLabel
}: {
  nodes: TreeNode[];
  activePath?: string;
  openPaths: Set<string>;
  selectedPaths: Set<string>;
  onOpen: (path: string) => void;
  onDownload: (path: string) => void;
  onDelete: (path: string) => void;
  onToggleSelected: (path: string) => void;
  downloadLabel: string;
  deleteLabel: string;
  selectLabel: string;
}) {
  return (
    <div className="tree">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          activePath={activePath}
          openPaths={openPaths}
          selectedPaths={selectedPaths}
          onOpen={onOpen}
          onDownload={onDownload}
          onDelete={onDelete}
          onToggleSelected={onToggleSelected}
          downloadLabel={downloadLabel}
          deleteLabel={deleteLabel}
          selectLabel={selectLabel}
        />
      ))}
    </div>
  );
}

function TreeItem({
  node,
  activePath,
  openPaths,
  selectedPaths,
  onOpen,
  onDownload,
  onDelete,
  onToggleSelected,
  downloadLabel,
  deleteLabel,
  selectLabel
}: {
  node: TreeNode;
  activePath?: string;
  openPaths: Set<string>;
  selectedPaths: Set<string>;
  onOpen: (path: string) => void;
  onDownload: (path: string) => void;
  onDelete: (path: string) => void;
  onToggleSelected: (path: string) => void;
  downloadLabel: string;
  deleteLabel: string;
  selectLabel: string;
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
                selectedPaths={selectedPaths}
                onOpen={onOpen}
                onDownload={onDownload}
                onDelete={onDelete}
                onToggleSelected={onToggleSelected}
                downloadLabel={downloadLabel}
                deleteLabel={deleteLabel}
                selectLabel={selectLabel}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`tree-row file-row ${activePath === node.path ? "active" : ""}`} title={node.path}>
      <input
        className="tree-select-checkbox"
        type="checkbox"
        checked={selectedPaths.has(node.path)}
        title={selectLabel}
        aria-label={selectLabel}
        onChange={() => onToggleSelected(node.path)}
        onClick={(event) => event.stopPropagation()}
      />
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
  const [selectedTreeFiles, setSelectedTreeFiles] = useState<Set<string>>(() => new Set());
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [messages, setMessages] = useState<Messages>(defaultLocaleMessages);
  const [localeCode, setLocaleCode] = useState(defaultLocaleCode);
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [localesLoading, setLocalesLoading] = useState(true);
  const [mainsailTheme, setMainsailTheme] = useState<MainsailVisualTheme>(fallbackMainsailTheme);
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
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<SearchResult[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [klipperConsoleOpen, setKlipperConsoleOpen] = useState(false);
  const [klipperConsoleInput, setKlipperConsoleInput] = useState("");
  const [klipperConsoleLog, setKlipperConsoleLog] = useState<KlipperConsoleEntry[]>([]);
  const [sendingKlipperCommand, setSendingKlipperCommand] = useState(false);
  const [gcodesOpen, setGcodesOpen] = useState(false);
  const [gcodeModalTab, setGcodeModalTab] = useState<GcodeModalTab>("files");
  const [gcodeSearch, setGcodeSearch] = useState("");
  const [gcodeFiles, setGcodeFiles] = useState<GcodeFileEntry[]>([]);
  const [gcodeHistory, setGcodeHistory] = useState<GcodeHistoryEntry[]>([]);
  const [selectedGcodeItem, setSelectedGcodeItem] = useState<SelectedGcodeItem | null>(null);
  const [gcodesLoading, setGcodesLoading] = useState(false);
  const [startingPrint, setStartingPrint] = useState(false);
  const [runningPrintAction, setRunningPrintAction] = useState<PrintControlAction | null>(null);
  const [dialog, setDialog] = useState<AppDialog | null>(null);
  const [dialogInputValue, setDialogInputValue] = useState("");
  const [message, setMessage] = useState(defaultLocaleMessages["status.ready"] ?? "Ready");
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const [printerInitializing, setPrinterInitializing] = useState(false);
  const [restartingFirmware, setRestartingFirmware] = useState(false);
  const [emergencyStopping, setEmergencyStopping] = useState(false);
  const [runningQuickCommand, setRunningQuickCommand] = useState<QuickCommand | null>(null);
  const [machinePowerMenuOpen, setMachinePowerMenuOpen] = useState(false);
  const [runningMachinePowerAction, setRunningMachinePowerAction] = useState<MachinePowerAction | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalEnabled, setTerminalEnabled] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [terminalHistoryIndex, setTerminalHistoryIndex] = useState<number | null>(null);
  const [terminalCursor, setTerminalCursor] = useState(0);
  const [terminalAlive, setTerminalAlive] = useState(false);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalWarning, setTerminalWarning] = useState<string | null>(null);
  const [terminalHeight, setTerminalHeight] = useState(238);
  const [outlineWidth, setOutlineWidth] = useState(320);
  const [includePanelHeight, setIncludePanelHeight] = useState(240);
  const [sectionPreview, setSectionPreview] = useState<SectionPreview | null>(null);
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const includePanelRef = useRef<HTMLElement | null>(null);
  const previewCloseTimerRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const heatersRef = useRef<HeaterStatus[]>([]);
  const machinePowerMenuRef = useRef<HTMLDivElement | null>(null);
  const terminalOutputRef = useRef<HTMLPreElement | null>(null);
  const reloadOpenTextFilesRef = useRef<(() => Promise<void>) | null>(null);

  const activeFile = openFiles.find((file) => file.path === activePath);
  const openPathSet = useMemo(() => new Set(openFiles.map((file) => file.path)), [openFiles]);
  const selectedTreeFileList = useMemo(() => Array.from(selectedTreeFiles).sort(), [selectedTreeFiles]);
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
      `${macro.name} ${macro.path} ${macro.title} ${macro.description ?? ""}`.toLowerCase().includes(query)
    );
  }, [macroSearch, macros]);
  const anyHeaterActive = heaters.some((heater) => heater.target > 0);
  const filteredGcodeFiles = useMemo(() => {
    const query = gcodeSearch.trim().toLowerCase();
    if (!query) return gcodeFiles;
    return gcodeFiles.filter((file) => `${file.name} ${file.path}`.toLowerCase().includes(query));
  }, [gcodeFiles, gcodeSearch]);
  const filteredGcodeHistory = useMemo(() => {
    const query = gcodeSearch.trim().toLowerCase();
    if (!query) return gcodeHistory;
    return gcodeHistory.filter((job) => `${job.filename} ${job.status}`.toLowerCase().includes(query));
  }, [gcodeHistory, gcodeSearch]);
  const themeStyle = useMemo<ThemeVariables>(() => {
    const primary = normalizeCssColor(mainsailTheme.primary, fallbackMainsailTheme.primary);
    const logo = normalizeCssColor(mainsailTheme.logo, fallbackMainsailTheme.logo);

    return {
      "--accent": primary,
      "--accent-soft": rgbaFromHex(primary, 0.18),
      "--accent-hover": rgbaFromHex(primary, 0.3),
      "--accent-contrast": contrastTextForColor(primary),
      "--mainsail-logo-color": logo
    };
  }, [mainsailTheme.logo, mainsailTheme.primary]);
  const mainsailLogoUrl = mainsailTheme.logoPath
    ? apiPath(`/api/download?path=${encodeURIComponent(mainsailTheme.logoPath)}&inline=1`)
    : mainsailTheme.logoUrl
      ? apiPath(mainsailTheme.logoUrl)
      : null;
  const mainsailLogoMaskStyle = useMemo<LogoMaskStyle | undefined>(() => {
    if (!mainsailTheme.logoMask || !mainsailLogoUrl) return undefined;

    return {
      maskImage: `url(${mainsailLogoUrl})`,
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: "contain",
      WebkitMaskImage: `url(${mainsailLogoUrl})`,
      WebkitMaskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "contain"
    };
  }, [mainsailLogoUrl, mainsailTheme.logoMask]);
  const t = useCallback(
    (key: string, values?: Record<string, string | number>) => translate(messages, key, values),
    [messages]
  );

  const appendTerminalOutput = useCallback((chunks: TerminalChunk[]) => {
    if (chunks.length === 0) return;

    setTerminalOutput((current) => {
      const next = `${current}${chunks.map((chunk) => chunk.text).join("")}`;
      return next.length > 80_000 ? next.slice(next.length - 80_000) : next;
    });
  }, []);

  const applyTerminalPayload = useCallback(
    (payload: TerminalPayload) => {
      appendTerminalOutput(payload.output ?? []);
      setTerminalCursor(payload.cursor ?? 0);
      setTerminalAlive(Boolean(payload.alive));
      setTerminalSessionId(payload.id);
    },
    [appendTerminalOutput]
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

  const loadGcodes = useCallback(async () => {
    setGcodesLoading(true);

    try {
      const response = await fetch(apiPath("/api/printer/gcodes"), { cache: "no-store" });
      const payload = (await response.json()) as {
        files?: GcodeFileEntry[];
        history?: GcodeHistoryEntry[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? t("errors.loadGcodes"));

      setGcodeFiles(payload.files ?? []);
      setGcodeHistory(payload.history ?? []);
      setSelectedGcodeItem(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.loadGcodes"));
    } finally {
      setGcodesLoading(false);
    }
  }, [t]);

  const openGcodesModal = useCallback(() => {
    setGcodesOpen(true);
    setGcodeModalTab("files");
    setGcodeSearch("");
    setSelectedGcodeItem(null);
    void loadGcodes();
  }, [loadGcodes]);

  const loadPrinterStatus = useCallback(async () => {
    try {
      const response = await fetch(apiPath("/api/printer/status"), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.printerStatus"));
      const nextStatus = normalizePrinterStatus(payload, t("errors.printerStatus"));
      setPrinterStatus(nextStatus);
      if (nextStatus.webhooksState.toLowerCase() === "ready" && !nextStatus.error) {
        setPrinterInitializing(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.printerStatus");
      setPrinterStatus(normalizePrinterStatus({ error: message }, t("errors.printerStatus")));
    }
  }, [t]);

  const loadMainsailTheme = useCallback(async () => {
    try {
      const response = await fetch(apiPath("/api/mainsail/theme"), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load Mainsail theme");

      setMainsailTheme({
        mode: typeof payload.mode === "string" ? payload.mode : fallbackMainsailTheme.mode,
        theme: typeof payload.theme === "string" ? payload.theme : fallbackMainsailTheme.theme,
        logo: typeof payload.logo === "string" ? payload.logo : fallbackMainsailTheme.logo,
        primary: typeof payload.primary === "string" ? payload.primary : fallbackMainsailTheme.primary,
        logoPath: typeof payload.logoPath === "string" ? payload.logoPath : null,
        logoUrl: typeof payload.logoUrl === "string" ? payload.logoUrl : null,
        logoMask: Boolean(payload.logoMask),
        error: typeof payload.error === "string" ? payload.error : undefined
      });
    } catch (error) {
      setMainsailTheme({
        ...fallbackMainsailTheme,
        error: error instanceof Error ? error.message : "Unable to load Mainsail theme"
      });
    }
  }, []);

  const loadTerminalStatus = useCallback(async () => {
    try {
      const response = await fetch(apiPath("/api/terminal/status"), { cache: "no-store" });
      const payload = (await response.json()) as { enabled?: boolean; shell?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? t("errors.terminalConnection"));

      const enabled = Boolean(payload.enabled);
      setTerminalEnabled(enabled);
      setTerminalError(enabled ? null : t("errors.terminalDisabled"));
      return enabled;
    } catch (error) {
      setTerminalEnabled(false);
      setTerminalError(error instanceof Error ? error.message : t("errors.terminalConnection"));
      return false;
    }
  }, [t]);

  const startTerminalSession = useCallback(async () => {
    if (terminalSessionId && terminalAlive) return terminalSessionId;

    const enabled = terminalEnabled || (await loadTerminalStatus());
    if (!enabled) return undefined;

    setTerminalBusy(true);
    setTerminalError(null);

    try {
      const response = await fetch(apiPath("/api/terminal/session"), { method: "POST" });
      const payload = (await response.json()) as TerminalPayload;
      if (!response.ok) throw new Error(payload.error ?? t("errors.terminalConnection"));

      setTerminalOutput("");
      applyTerminalPayload(payload);
      setMessage(t("status.terminalConnected"));
      return payload.id;
    } catch (error) {
      const nextError = error instanceof Error ? error.message : t("errors.terminalConnection");
      setTerminalError(nextError);
      setMessage(nextError);
      return undefined;
    } finally {
      setTerminalBusy(false);
    }
  }, [applyTerminalPayload, loadTerminalStatus, t, terminalAlive, terminalEnabled, terminalSessionId]);

  const pollTerminalSession = useCallback(async () => {
    if (!terminalSessionId) return;

    try {
      const response = await fetch(
        apiPath(`/api/terminal/session?id=${encodeURIComponent(terminalSessionId)}&cursor=${terminalCursor}`),
        { cache: "no-store" }
      );
      const payload = (await response.json()) as TerminalPayload;
      if (!response.ok) throw new Error(payload.error ?? t("errors.terminalConnection"));
      applyTerminalPayload(payload);
      setTerminalError(null);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : t("errors.terminalConnection");
      setTerminalError(nextError);
      setTerminalAlive(false);
    }
  }, [applyTerminalPayload, t, terminalCursor, terminalSessionId]);

  const toggleTerminal = useCallback(async () => {
    if (terminalOpen) {
      setTerminalOpen(false);
      return;
    }

    setTerminalOpen(true);
    const enabled = terminalEnabled || (await loadTerminalStatus());
    if (enabled && !terminalSessionId) {
      await startTerminalSession();
    }
  }, [loadTerminalStatus, startTerminalSession, terminalEnabled, terminalOpen, terminalSessionId]);

  const disconnectTerminal = useCallback(async () => {
    const id = terminalSessionId;
    if (!id) return;

    setTerminalBusy(true);

    try {
      await fetch(apiPath(`/api/terminal/session?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    } finally {
      setTerminalBusy(false);
      setTerminalSessionId(null);
      setTerminalAlive(false);
      setTerminalCursor(0);
      setTerminalOutput((current) => `${current}\n${t("status.terminalDisconnected")}\n`);
      setMessage(t("status.terminalDisconnected"));
    }
  }, [t, terminalSessionId]);

  const rememberTerminalCommand = useCallback((command: string) => {
    setTerminalHistory((current) => {
      const withoutDuplicateTail = current.at(-1) === command ? current : [...current, command];
      const nextHistory = withoutDuplicateTail.slice(-80);
      window.localStorage.setItem(terminalHistoryKey, JSON.stringify(nextHistory));
      return nextHistory;
    });
    setTerminalHistoryIndex(null);
  }, []);

  const submitTerminalCommand = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const command = terminalInput.trim();
      if (!command || terminalBusy) return;

      const blockedCommand = unsupportedTerminalCommand(command);
      if (blockedCommand) {
        const warning = t("errors.terminalUnsupportedCommand", { command: blockedCommand.label });
        setTerminalInput("");
        rememberTerminalCommand(command);
        setTerminalWarning(warning);
        setMessage(warning);
        return;
      }

      const id = terminalSessionId && terminalAlive ? terminalSessionId : await startTerminalSession();
      if (!id) return;

      setTerminalInput("");
      setTerminalWarning(null);
      rememberTerminalCommand(command);
      setMessage(t("status.terminalRunning"));

      try {
        const response = await fetch(apiPath("/api/terminal/input"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, input: `${command}\n` })
        });
        const payload = (await response.json()) as TerminalPayload;
        if (!response.ok) throw new Error(payload.error ?? t("errors.terminalCommand"));
        applyTerminalPayload(payload);
      } catch (error) {
        const nextError = error instanceof Error ? error.message : t("errors.terminalCommand");
        setTerminalError(nextError);
        setMessage(nextError);
      }
    },
    [
      applyTerminalPayload,
      rememberTerminalCommand,
      startTerminalSession,
      t,
      terminalAlive,
      terminalBusy,
      terminalInput,
      terminalSessionId
    ]
  );

  const sendKlipperConsoleCommand = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const script = klipperConsoleInput.trim();
      if (!script || sendingKlipperCommand) return;

      setSendingKlipperCommand(true);
      setMessage(t("status.runningCommand", { command: script.split(/\s+/)[0] ?? "G-code" }));

      try {
        const response = await fetch(apiPath("/api/printer/gcode"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.gcodeCommand"));

        setKlipperConsoleLog((current) =>
          [createConsoleEntry(script, "sent", t("status.gcodeSent")), ...current].slice(0, 80)
        );
        setKlipperConsoleInput("");
        setMessage(t("status.gcodeSent"));
        await loadPrinterStatus();
        if (shouldReloadOpenFilesAfterGcode(script)) {
          await Promise.all([loadTree(), reloadOpenTextFilesRef.current?.()]);
        }
      } catch (error) {
        const nextError = error instanceof Error ? error.message : t("errors.gcodeCommand");
        setKlipperConsoleLog((current) => [createConsoleEntry(script, "error", nextError), ...current].slice(0, 80));
        setMessage(nextError);
      } finally {
        setSendingKlipperCommand(false);
      }
    },
    [klipperConsoleInput, loadPrinterStatus, loadTree, sendingKlipperCommand, t]
  );

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

  const reloadOpenTextFiles = useCallback(async () => {
    const reloadableFiles = openFiles.filter(
      (file) => file.kind !== "image" && !file.loading && !file.saving && file.content === file.savedContent
    );
    const skippedCount = openFiles.filter(
      (file) => file.kind !== "image" && file.content !== file.savedContent
    ).length;

    if (reloadableFiles.length === 0) {
      if (skippedCount > 0) {
        setMessage(t("status.reloadedOpenFilesPartial", { count: skippedCount }));
      }
      return;
    }

    const loadedFiles = await Promise.all(
      reloadableFiles.map(async (file) => {
        const response = await fetch(apiPath(`/api/file?path=${encodeURIComponent(file.path)}`), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.openFile"));

        return {
          path: file.path,
          content: String(payload.content ?? ""),
          modifiedAt: typeof payload.modifiedAt === "string" ? payload.modifiedAt : undefined
        };
      })
    );
    const loadedByPath = new Map(loadedFiles.map((file) => [file.path, file]));

    setOpenFiles((files) =>
      files.map((file) => {
        const loaded = loadedByPath.get(file.path);
        if (!loaded || file.content !== file.savedContent) return file;

        return {
          ...file,
          content: loaded.content,
          savedContent: loaded.content,
          modifiedAt: loaded.modifiedAt,
          error: undefined
        };
      })
    );
    setMessage(
      skippedCount > 0
        ? t("status.reloadedOpenFilesPartial", { count: skippedCount })
        : t("status.reloadedOpenFiles")
    );
  }, [openFiles, t]);
  reloadOpenTextFilesRef.current = reloadOpenTextFiles;

  const restartFirmware = useCallback(async () => {
    if (restartingFirmware) return;
    if (!printerStatus) {
      setMessage(t("errors.printerStatus"));
      return;
    }

    if (printerStatus.printing) {
      setMessage(t("errors.restartPrinting"));
      return;
    }

    if (!(await confirmDialog(t("actions.restartFirmware"), t("confirm.restartFirmware")))) return;

    setRestartingFirmware(true);
    setPrinterInitializing(true);
    setMessage(t("status.firmwareRestarting"));

    try {
      const response = await fetch(apiPath("/api/printer/firmware-restart"), { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.restartFirmware"));
      setMessage(t("status.firmwareRestarted"));
      await Promise.all([loadPrinterStatus(), loadTree(), reloadOpenTextFiles()]);
    } catch (error) {
      setPrinterInitializing(false);
      setMessage(error instanceof Error ? error.message : t("errors.restartFirmware"));
    } finally {
      setRestartingFirmware(false);
    }
  }, [confirmDialog, loadPrinterStatus, loadTree, printerStatus, reloadOpenTextFiles, restartingFirmware, t]);

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

  const runMachinePowerAction = useCallback(
    async (action: MachinePowerAction) => {
      if (runningMachinePowerAction) return;

      if (!printerStatus || printerStatus.error) {
        setMessage(printerStatus?.error ?? t("errors.printerStatus"));
        return;
      }

      if (printerStatus.printing) {
        setMessage(t("errors.machinePowerPrinting"));
        return;
      }

      const label = action === "shutdown" ? t("actions.shutdownPrinter") : t("actions.rebootPrinter");
      const confirmMessage =
        action === "shutdown" ? t("confirm.shutdownPrinter") : t("confirm.rebootPrinter");

      if (!(await confirmDialog(label, confirmMessage))) return;

      setMachinePowerMenuOpen(false);
      setRunningMachinePowerAction(action);
      setMessage(action === "shutdown" ? t("status.shuttingDownPrinter") : t("status.rebootingPrinter"));

      try {
        const response = await fetch(apiPath("/api/printer/machine-power"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.machinePower"));

        setMessage(action === "shutdown" ? t("status.shutdownPrinterSent") : t("status.rebootPrinterSent"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.machinePower"));
      } finally {
        setRunningMachinePowerAction(null);
      }
    },
    [confirmDialog, printerStatus, runningMachinePowerAction, t]
  );

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

  const toggleSelectedTreeFile = useCallback((path: string) => {
    setSelectedTreeFiles((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const downloadSelectedFiles = useCallback(async () => {
    if (selectedTreeFileList.length === 0) return;

    if (selectedTreeFileList.length === 1) {
      downloadFile(selectedTreeFileList[0]);
      return;
    }

    try {
      const response = await fetch(apiPath("/api/download-selected"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: selectedTreeFileList })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("errors.downloadSelectedFiles"));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "klipper-editor-selected-files.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.downloadSelectedFiles"));
    }
  }, [downloadFile, selectedTreeFileList, t]);

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

  const deleteSelectedFiles = useCallback(async () => {
    if (selectedTreeFileList.length === 0) return;
    if (
      !(await confirmDialog(
        t("actions.deleteSelectedFiles"),
        t("confirm.deleteSelectedFiles", { count: selectedTreeFileList.length })
      ))
    ) {
      return;
    }

    try {
      for (const path of selectedTreeFileList) {
        const response = await fetch(apiPath(`/api/file?path=${encodeURIComponent(path)}`), { method: "DELETE" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.deleteFile"));
      }

      const selected = new Set(selectedTreeFileList);
      const nextFiles = openFiles.filter((file) => !selected.has(file.path));
      setOpenFiles(nextFiles);
      if (activePath && selected.has(activePath)) {
        setActivePath(nextFiles.at(-1)?.path);
      }
      setSelectedTreeFiles(new Set());
      await loadTree();
      setMessage(t("status.deletedSelected", { count: selectedTreeFileList.length }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.deleteFile"));
    }
  }, [activePath, confirmDialog, loadTree, openFiles, selectedTreeFileList, t]);

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

  const runGlobalSearch = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const query = globalSearchQuery.trim();

      if (query.length < 2) {
        setGlobalSearchResults([]);
        return;
      }

      setGlobalSearchLoading(true);
      try {
        const response = await fetch(apiPath(`/api/search?q=${encodeURIComponent(query)}`), { cache: "no-store" });
        const payload = (await response.json()) as { results?: SearchResult[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? t("errors.globalSearch"));

        setGlobalSearchResults(payload.results ?? []);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.globalSearch"));
      } finally {
        setGlobalSearchLoading(false);
      }
    },
    [globalSearchQuery, t]
  );

  const openSearchResult = useCallback(
    async (result: SearchResult) => {
      setGlobalSearchOpen(false);
      setMessage(t("status.opening", { path: result.path }));
      setPendingJump({ path: result.path, line: result.line });
      await openFile(result.path);
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

  const startSelectedPrint = useCallback(async () => {
    if (!selectedGcodeItem || startingPrint) return;

    const filename = selectedGcodePath(selectedGcodeItem);
    const name = selectedGcodeName(selectedGcodeItem);
    if (!(await confirmDialog(t("actions.printFile"), t("confirm.printFile", { name })))) return;

    setStartingPrint(true);

    try {
      const response = await fetch(apiPath("/api/printer/print-start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.startPrint"));

      setMessage(t("status.printStarted"));
      await loadPrinterStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.startPrint"));
    } finally {
      setStartingPrint(false);
    }
  }, [confirmDialog, loadPrinterStatus, selectedGcodeItem, startingPrint, t]);

  const runPrintControl = useCallback(
    async (action: PrintControlAction) => {
      if (runningPrintAction) return;
      if (action === "cancel" && !(await confirmDialog(t("actions.cancelPrint"), t("confirm.cancelPrint")))) return;

      setRunningPrintAction(action);

      try {
        const response = await fetch(apiPath("/api/printer/print-control"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.printControl"));

        const statusKey =
          action === "pause" ? "status.printPaused" : action === "resume" ? "status.printResumed" : "status.printCancelled";
        setMessage(t(statusKey));
        await loadPrinterStatus();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.printControl"));
      } finally {
        setRunningPrintAction(null);
      }
    },
    [confirmDialog, loadPrinterStatus, runningPrintAction, t]
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
        document.body.classList.remove("is-resizing-row");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      document.body.classList.add("is-resizing");
      document.body.classList.add("is-resizing-row");
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [includePanelHeight]
  );

  const startTerminalHeightResize = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = terminalHeight;
      let latestHeight = terminalHeight;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const nextHeight = clamp(startHeight - (moveEvent.clientY - startY), 140, maxTerminalHeight(window.innerHeight));
        latestHeight = nextHeight;
        setTerminalHeight(nextHeight);
      };
      const onMouseUp = () => {
        document.body.classList.remove("is-resizing");
        document.body.classList.remove("is-resizing-row");
        window.localStorage.setItem(terminalHeightKey, String(Math.round(latestHeight)));
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      document.body.classList.add("is-resizing");
      document.body.classList.add("is-resizing-row");
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [terminalHeight]
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

    const savedTerminalHeight = Number(window.localStorage.getItem(terminalHeightKey));
    if (Number.isFinite(savedTerminalHeight) && savedTerminalHeight > 0) {
      setTerminalHeight(clamp(savedTerminalHeight, 140, maxTerminalHeight(window.innerHeight)));
    }

    try {
      const savedTerminalHistory = JSON.parse(window.localStorage.getItem(terminalHistoryKey) ?? "[]") as unknown;
      if (Array.isArray(savedTerminalHistory)) {
        setTerminalHistory(savedTerminalHistory.filter((entry): entry is string => typeof entry === "string").slice(-80));
      }
    } catch {
      window.localStorage.removeItem(terminalHistoryKey);
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
    void loadMainsailTheme();
  }, [loadMainsailTheme]);

  useEffect(() => {
    void loadTerminalStatus();
  }, [loadTerminalStatus]);

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
    if (!machinePowerMenuOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!machinePowerMenuRef.current?.contains(event.target as Node)) {
        setMachinePowerMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMachinePowerMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [machinePowerMenuOpen]);

  useEffect(() => {
    if (!terminalOpen || !terminalSessionId) return;

    void pollTerminalSession();
    const interval = window.setInterval(() => void pollTerminalSession(), 1000);
    return () => window.clearInterval(interval);
  }, [pollTerminalSession, terminalOpen, terminalSessionId]);

  useEffect(() => {
    if (!terminalOpen) return;
    const output = terminalOutputRef.current;
    if (!output) return;
    output.scrollTop = output.scrollHeight;
  }, [terminalOpen, terminalOutput]);

  useEffect(() => {
    const clampTerminalToViewport = () => {
      setTerminalHeight((current) => {
        const nextHeight = clamp(current, 140, maxTerminalHeight(window.innerHeight));
        if (nextHeight !== current) {
          window.localStorage.setItem(terminalHeightKey, String(Math.round(nextHeight)));
        }
        return nextHeight;
      });
    };

    clampTerminalToViewport();
    window.addEventListener("resize", clampTerminalToViewport);
    return () => window.removeEventListener("resize", clampTerminalToViewport);
  }, []);

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
  const movementPanelDisabled = movingAction !== null || !printerStatus || Boolean(printerStatus.error) || printerStatus.printing;
  const machinePowerDisabled =
    runningMachinePowerAction !== null || !printerStatus || Boolean(printerStatus.error) || printerStatus.printing;
  const powerMenuDisabled = restartingFirmware || runningMachinePowerAction !== null || !printerStatus;
  const showPrinterInitializing = printerInitializing || isPrinterInitializingStatus(printerStatus);

  return (
    <main className="workspace-shell" style={themeStyle}>
      {showPrinterInitializing && (
        <div className="printer-initializing-overlay" role="status" aria-live="polite">
          <div className="printer-initializing-card">
            <div className="printer-initializing-title">
              <IoPower className="printer-initializing-icon" />
              <span>{t("status.printerInitializing")}</span>
            </div>
            <div className="printer-initializing-bar" />
          </div>
        </div>
      )}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-logo" title={mainsailTheme.theme}>
              {mainsailLogoUrl && mainsailTheme.logoMask ? (
                <span className="sidebar-theme-logo sidebar-theme-logo-mask" aria-hidden="true" style={mainsailLogoMaskStyle} />
              ) : mainsailLogoUrl ? (
                <img className="sidebar-theme-logo" src={mainsailLogoUrl} alt="" />
              ) : (
                <Image className="sidebar-theme-logo" src={logoWhite} alt="" width={28} height={28} />
              )}
            </div>
            <div className="sidebar-brand-text">
              <div className="eyebrow">{t("explorer.label")}</div>
              <h1>{t("app.title")}</h1>
            </div>
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
          selectedPaths={selectedTreeFiles}
          onOpen={openFile}
          onDownload={downloadFile}
          onDelete={deleteFile}
          onToggleSelected={toggleSelectedTreeFile}
          downloadLabel={t("actions.downloadFile")}
          deleteLabel={t("actions.deleteFile")}
          selectLabel={t("actions.selectFile")}
        />
        <div className="open-editors">
          {selectedTreeFileList.length > 0 && (
            <div className="selected-files-bar">
              <span>{t("selection.count", { count: selectedTreeFileList.length })}</span>
              <div className="selected-files-actions">
                <button
                  className="tree-selection-action"
                  type="button"
                  title={t("actions.downloadSelectedFiles")}
                  aria-label={t("actions.downloadSelectedFiles")}
                  onClick={() => void downloadSelectedFiles()}
                >
                  <FcDownload className="tree-selection-icon" />
                </button>
                <button
                  className="tree-selection-action danger"
                  type="button"
                  title={t("actions.deleteSelectedFiles")}
                  aria-label={t("actions.deleteSelectedFiles")}
                  onClick={() => void deleteSelectedFiles()}
                >
                  <MdDelete className="tree-selection-icon" />
                </button>
                <button
                  className="tree-selection-action"
                  type="button"
                  title={t("actions.clearSelection")}
                  aria-label={t("actions.clearSelection")}
                  onClick={() => setSelectedTreeFiles(new Set())}
                >
                  <IoClose className="tree-selection-icon" />
                </button>
              </div>
            </div>
          )}
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

      <section className={terminalOpen ? "editor-area terminal-open" : "editor-area"}>
        <div className="topbar">
          <div className="quick-toolbar">
            <button className="macro-button" type="button" onClick={openMacrosModal} title={t("actions.macros")}>
              <MdFunctions className="macro-button-icon" />
              {t("actions.macros")}
            </button>
            <button
              className="icon-button printed-files-button"
              type="button"
              onClick={openGcodesModal}
              title={t("actions.printedFiles")}
              aria-label={t("actions.printedFiles")}
            >
              <BsPrinterFill className="action-icon plain-action-icon" />
            </button>
            <button
              className="icon-button klipper-console-button"
              type="button"
              onClick={() => setKlipperConsoleOpen(true)}
              aria-label={t("actions.klipperConsole")}
              title={t("actions.klipperConsole")}
            >
              <MdiIcon className="action-icon plain-action-icon" path={mdiConsoleLine} size={1} />
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
                disabled={movementPanelDisabled}
                title={
                  printerStatus?.printing
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
            {printerStatus?.printing && (
              <div className="print-control-actions">
                <button
                  className="print-control-button"
                  type="button"
                  disabled={runningPrintAction !== null}
                  title={printerStatus.printState === "paused" ? t("actions.resumePrint") : t("actions.pausePrint")}
                  aria-label={printerStatus.printState === "paused" ? t("actions.resumePrint") : t("actions.pausePrint")}
                  onClick={() => void runPrintControl(printerStatus.printState === "paused" ? "resume" : "pause")}
                >
                  {printerStatus.printState === "paused" ? (
                    <FaPlay className="print-control-icon" />
                  ) : (
                    <FaPause className="print-control-icon" />
                  )}
                </button>
                <button
                  className="print-control-button danger"
                  type="button"
                  disabled={runningPrintAction !== null}
                  title={t("actions.cancelPrint")}
                  aria-label={t("actions.cancelPrint")}
                  onClick={() => void runPrintControl("cancel")}
                >
                  <FaStop className="print-control-icon" />
                </button>
              </div>
            )}
            <button
              className="emergency-button"
              type="button"
              title={t("actions.emergencyStop")}
              aria-label={t("actions.emergencyStop")}
              disabled={emergencyStopping}
              onClick={() => void triggerEmergencyStop()}
            >
              <BsSignStopFill className="emergency-button-icon" />
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
              className={terminalOpen ? "icon-button active-toggle" : "icon-button"}
              type="button"
              onClick={() => void toggleTerminal()}
              title={terminalOpen ? t("actions.closeTerminal") : t("actions.openTerminal")}
              aria-label={terminalOpen ? t("actions.closeTerminal") : t("actions.openTerminal")}
              aria-pressed={terminalOpen}
            >
              <MdTerminal className="action-icon plain-action-icon" />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setGlobalSearchOpen(true)}
              title={t("actions.globalSearch")}
              aria-label={t("actions.globalSearch")}
            >
              <FcSearch className="action-icon" />
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
              <FaFloppyDisk className="action-icon save-icon" />
              {activeFile?.saving ? t("actions.saving") : t("actions.save")}
            </button>
            <div className="machine-power-menu" ref={machinePowerMenuRef}>
              <button
                className="machine-power-primary"
                type="button"
                disabled={restartingFirmware || !printerStatus || printerStatus.printing}
                title={printerStatus?.printing ? t("errors.restartPrinting") : t("actions.restartFirmware")}
                onClick={() => void restartFirmware()}
              >
                <IoPower className="power-icon" />
                {restartingFirmware ? t("actions.restartingFirmware") : t("actions.restartFirmware")}
              </button>
              <button
                className="machine-power-trigger"
                type="button"
                disabled={powerMenuDisabled}
                title={
                  printerStatus?.printing
                    ? t("actions.machinePower")
                    : printerStatus?.error
                      ? t("actions.machinePower")
                      : t("actions.machinePower")
                }
                aria-label={t("actions.machinePower")}
                aria-haspopup="menu"
                aria-expanded={machinePowerMenuOpen}
                onClick={() => setMachinePowerMenuOpen((open) => !open)}
              >
                <MdKeyboardArrowDown className="power-menu-chevron" />
              </button>
              {machinePowerMenuOpen && (
                <div className="machine-power-popover" role="menu">
                  <button
                    className="machine-power-option danger"
                    type="button"
                    role="menuitem"
                    disabled={runningMachinePowerAction !== null || machinePowerDisabled}
                    onClick={() => void runMachinePowerAction("shutdown")}
                  >
                    <IoPower className="machine-power-option-icon" />
                    {runningMachinePowerAction === "shutdown"
                      ? t("actions.shuttingDownPrinter")
                      : t("actions.shutdownPrinter")}
                  </button>
                  <button
                    className="machine-power-option"
                    type="button"
                    role="menuitem"
                    disabled={runningMachinePowerAction !== null || machinePowerDisabled}
                    onClick={() => void runMachinePowerAction("reboot")}
                  >
                    <FcRefresh className="machine-power-option-icon" />
                    {runningMachinePowerAction === "reboot" ? t("actions.rebootingPrinter") : t("actions.rebootPrinter")}
                  </button>
                </div>
              )}
            </div>
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

        {terminalOpen && (
          <section className="terminal-panel" style={{ height: terminalHeight }} aria-label={t("panels.terminal")}>
            <button
              className="panel-resizer terminal-resizer-height"
              type="button"
              aria-label={t("resize.height")}
              onMouseDown={startTerminalHeightResize}
            />
            <div className="terminal-header">
              <div className="terminal-title">
                <MdTerminal className="terminal-title-icon" />
                <span>{t("panels.terminal")}</span>
                <small>{terminalAlive ? t("status.terminalConnected") : t("status.terminalDisconnected")}</small>
              </div>
              <div className="terminal-actions">
                <button
                  className="terminal-button"
                  type="button"
                  disabled={terminalBusy || terminalAlive}
                  onClick={() => void startTerminalSession()}
                >
                  {t("actions.connectTerminal")}
                </button>
                <button
                  className="terminal-button"
                  type="button"
                  disabled={terminalBusy || !terminalSessionId}
                  onClick={() => void disconnectTerminal()}
                >
                  {t("actions.disconnectTerminal")}
                </button>
                <button className="terminal-icon-button" type="button" onClick={() => setTerminalOpen(false)}>
                  <IoClose className="terminal-close-icon" />
                </button>
              </div>
            </div>
            <div className={terminalWarning ? "terminal-warning" : "terminal-warning hidden"} role="status">
              {terminalWarning}
            </div>
            <pre ref={terminalOutputRef} className="terminal-output">
              {terminalOutput || terminalError || t("empty.terminal")}
            </pre>
            <form className="terminal-input-row" onSubmit={submitTerminalCommand}>
              <span className="terminal-prompt">$</span>
              <input
                value={terminalInput}
                disabled={!terminalEnabled || terminalBusy}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                onChange={(event) => {
                  setTerminalInput(event.target.value);
                  setTerminalHistoryIndex(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setTerminalInput("");
                    setTerminalHistoryIndex(null);
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (terminalHistory.length === 0) return;
                    const nextIndex =
                      terminalHistoryIndex === null
                        ? terminalHistory.length - 1
                        : Math.max(0, terminalHistoryIndex - 1);
                    setTerminalHistoryIndex(nextIndex);
                    setTerminalInput(terminalHistory[nextIndex] ?? "");
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (terminalHistory.length === 0 || terminalHistoryIndex === null) return;
                    const nextIndex = terminalHistoryIndex + 1;
                    if (nextIndex >= terminalHistory.length) {
                      setTerminalHistoryIndex(null);
                      setTerminalInput("");
                      return;
                    }
                    setTerminalHistoryIndex(nextIndex);
                    setTerminalInput(terminalHistory[nextIndex] ?? "");
                  }
                }}
              />
              <button className="terminal-button primary" type="submit" disabled={!terminalEnabled || terminalBusy || !terminalInput.trim()}>
                {t("actions.runTerminalCommand")}
              </button>
            </form>
          </section>
        )}

        {dialog && (
          <div className="modal-backdrop dialog-backdrop" role="presentation" onMouseDown={closeDialog}>
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
                        title={`${macro.title} - ${macro.path}:${macro.line}${macro.description ? ` - ${macro.description}` : ""}`}
                      >
                        <button className="macro-open-button" type="button" onClick={() => void openMacro(macro)}>
                          <MdFunctions className="macro-row-icon" />
                          <span className="macro-row-main">
                            <span className="macro-row-name">{macro.name}</span>
                            {macro.description && <span className="macro-row-description">{macro.description}</span>}
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
                          <FaPlay className="macro-start-icon" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {globalSearchOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setGlobalSearchOpen(false)}>
            <section
              className="options-modal global-search-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="global-search-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="global-search-title">{t("panels.globalSearch")}</h2>
                <button
                  className="modal-close"
                  type="button"
                  title={t("options.close")}
                  aria-label={t("options.close")}
                  onClick={() => setGlobalSearchOpen(false)}
                >
                  x
                </button>
              </div>
              <form className="global-search-body" onSubmit={(event) => void runGlobalSearch(event)}>
                <label className="macro-search-field">
                  <FcSearch className="action-icon" />
                  <input
                    autoFocus
                    value={globalSearchQuery}
                    placeholder={t("globalSearch.placeholder")}
                    onChange={(event) => setGlobalSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setGlobalSearchQuery("");
                        setGlobalSearchResults([]);
                      }
                    }}
                  />
                  {globalSearchQuery && (
                    <button
                      className="search-clear-button"
                      type="button"
                      title={t("actions.clearSearch")}
                      aria-label={t("actions.clearSearch")}
                      onClick={() => {
                        setGlobalSearchQuery("");
                        setGlobalSearchResults([]);
                      }}
                    >
                      <IoClose className="search-clear-icon" />
                    </button>
                  )}
                </label>
                <div className="global-search-actions">
                  <span className="macro-count">{t("globalSearch.count", { count: globalSearchResults.length })}</span>
                  <button className="dialog-button primary" type="submit" disabled={globalSearchLoading}>
                    {globalSearchLoading ? t("actions.searching") : t("actions.search")}
                  </button>
                </div>
                <div className="global-search-list">
                  {globalSearchLoading ? (
                    <p className="empty-note">{t("actions.searching")}</p>
                  ) : globalSearchQuery.trim().length < 2 ? (
                    <p className="empty-note">{t("globalSearch.empty")}</p>
                  ) : globalSearchResults.length === 0 ? (
                    <p className="empty-note">{t("globalSearch.noResults")}</p>
                  ) : (
                    globalSearchResults.map((result) => (
                      <button
                        key={`${result.path}-${result.line}-${result.text}`}
                        className="global-search-row"
                        type="button"
                        onClick={() => void openSearchResult(result)}
                      >
                        <span className="global-search-row-title">
                          <IoDocumentTextOutline className="global-search-row-icon" />
                          <span>{result.path}</span>
                          <strong>{result.line}</strong>
                        </span>
                        <span className="global-search-row-preview">{result.text || t("empty.sectionContent")}</span>
                      </button>
                    ))
                  )}
                </div>
              </form>
            </section>
          </div>
        )}

        {gcodesOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setGcodesOpen(false)}>
            <section
              className="options-modal gcodes-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="gcodes-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="gcodes-title">{t("panels.printedFiles")}</h2>
                <div className="modal-header-actions">
                  <button
                    className="modal-icon-button"
                    type="button"
                    title={t("actions.refreshTree")}
                    aria-label={t("actions.refreshTree")}
                    onClick={() => void loadGcodes()}
                  >
                    <FcRefresh className="action-icon" />
                  </button>
                  <button
                    className="modal-close"
                    type="button"
                    title={t("actions.close")}
                    aria-label={t("actions.close")}
                    onClick={() => setGcodesOpen(false)}
                  >
                    x
                  </button>
                </div>
              </div>
              <div className="gcodes-modal-body">
                <div className="gcodes-tabs" role="tablist">
                  <button
                    className={gcodeModalTab === "files" ? "gcodes-tab active" : "gcodes-tab"}
                    type="button"
                    role="tab"
                    aria-selected={gcodeModalTab === "files"}
                    onClick={() => {
                      setGcodeModalTab("files");
                      setSelectedGcodeItem(null);
                    }}
                  >
                    {t("gcodes.files")}
                  </button>
                  <button
                    className={gcodeModalTab === "history" ? "gcodes-tab active" : "gcodes-tab"}
                    type="button"
                    role="tab"
                    aria-selected={gcodeModalTab === "history"}
                    onClick={() => {
                      setGcodeModalTab("history");
                      setSelectedGcodeItem(null);
                    }}
                  >
                    {t("gcodes.history")}
                  </button>
                </div>
                <label className="gcode-search-field">
                  <FcSearch className="action-icon" />
                  <input
                    value={gcodeSearch}
                    placeholder={t("gcodes.search")}
                    onChange={(event) => setGcodeSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setGcodeSearch("");
                      }
                    }}
                  />
                  {gcodeSearch && (
                    <button
                      className="search-clear-button"
                      type="button"
                      title={t("actions.clearSearch")}
                      aria-label={t("actions.clearSearch")}
                      onClick={() => setGcodeSearch("")}
                    >
                      <IoClose className="search-clear-icon" />
                    </button>
                  )}
                </label>
                <div className="gcodes-browser">
                  <div className="gcodes-list">
                    {gcodesLoading ? (
                      <p className="empty-note">{t("gcodes.loading")}</p>
                    ) : gcodeModalTab === "files" ? (
                      filteredGcodeFiles.length === 0 ? (
                        <p className="empty-note">{t("gcodes.empty")}</p>
                      ) : (
                        filteredGcodeFiles.map((file) => (
                          <button
                            key={file.path}
                            className={
                              selectedGcodeItem?.type === "file" && selectedGcodeItem.item.path === file.path
                                ? "gcode-row active"
                                : "gcode-row"
                            }
                            type="button"
                            onClick={() => setSelectedGcodeItem({ type: "file", item: file })}
                            title={file.path}
                          >
                            <GcodeListPreview thumbnails={file.thumbnails} />
                            <span>
                              <strong>{file.name}</strong>
                              <small>{formatTimestamp(file.modified)}</small>
                            </span>
                          </button>
                        ))
                      )
                    ) : filteredGcodeHistory.length === 0 ? (
                      <p className="empty-note">{t("gcodes.historyEmpty")}</p>
                    ) : (
                      filteredGcodeHistory.map((job) => (
                        <button
                          key={job.id}
                          className={
                            selectedGcodeItem?.type === "history" && selectedGcodeItem.item.id === job.id
                              ? "gcode-row active"
                              : "gcode-row"
                          }
                          type="button"
                          onClick={() => setSelectedGcodeItem({ type: "history", item: job })}
                          title={job.filename}
                        >
                          <GcodeListPreview thumbnails={job.metadata?.thumbnails ?? []} />
                          <span>
                            <strong>{basename(job.filename)}</strong>
                            <small>
                              {job.status} · {formatTimestamp(job.startTime)}
                            </small>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <aside className={selectedGcodeItem ? "gcode-detail-panel open" : "gcode-detail-panel"}>
                    {selectedGcodeItem ? (
                      <>
                        <div className="gcode-detail-header">
                          <div>
                            <h3>{selectedGcodeName(selectedGcodeItem)}</h3>
                            <p>{selectedGcodePath(selectedGcodeItem)}</p>
                          </div>
                          <div className="gcode-detail-actions">
                            <button
                              className="dialog-button primary gcode-print-button"
                              type="button"
                              disabled={startingPrint || printerStatus?.printing}
                              title={printerStatus?.printing ? t("errors.restartPrinting") : t("actions.printFile")}
                              onClick={() => void startSelectedPrint()}
                            >
                              <FaPrint className="dialog-button-icon" />
                              {startingPrint ? t("actions.printingFile") : t("actions.printFile")}
                            </button>
                            <button
                              className="modal-close"
                              type="button"
                              title={t("actions.close")}
                              aria-label={t("actions.close")}
                              onClick={() => setSelectedGcodeItem(null)}
                            >
                              x
                            </button>
                          </div>
                        </div>
                        {bestThumbnail(selectedGcodeThumbnails(selectedGcodeItem)) ? (
                          <img
                            className="gcode-thumbnail"
                            src={apiPath(
                              `/api/printer/gcode-thumbnail?path=${encodeURIComponent(
                                bestThumbnail(selectedGcodeThumbnails(selectedGcodeItem))?.relativePath ?? ""
                              )}`
                            )}
                            alt=""
                          />
                        ) : (
                          <div className="gcode-thumbnail empty">{t("gcodes.noThumbnail")}</div>
                        )}
                        <dl className="gcode-detail-list">
                          {selectedGcodeItem.type === "file" ? (
                            <>
                              <div>
                                <dt>{t("gcodes.fileSize")}</dt>
                                <dd>{formatBytes(selectedGcodeItem.item.size)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.modified")}</dt>
                                <dd>{formatTimestamp(selectedGcodeItem.item.modified)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.estimatedTime")}</dt>
                                <dd>{formatDuration(selectedGcodeItem.item.estimatedTime ?? 0)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.filament")}</dt>
                                <dd>{formatMillimeters(selectedGcodeItem.item.filamentTotal)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.layerHeight")}</dt>
                                <dd>{formatMillimeters(selectedGcodeItem.item.layerHeight)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.objectHeight")}</dt>
                                <dd>{formatMillimeters(selectedGcodeItem.item.objectHeight)}</dd>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <dt>{t("gcodes.status")}</dt>
                                <dd>{selectedGcodeItem.item.status}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.started")}</dt>
                                <dd>{formatTimestamp(selectedGcodeItem.item.startTime)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.finished")}</dt>
                                <dd>{formatTimestamp(selectedGcodeItem.item.endTime)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.printDuration")}</dt>
                                <dd>{formatDuration(selectedGcodeItem.item.printDuration)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.totalDuration")}</dt>
                                <dd>{formatDuration(selectedGcodeItem.item.totalDuration)}</dd>
                              </div>
                              <div>
                                <dt>{t("gcodes.filament")}</dt>
                                <dd>
                                  {formatMillimeters(
                                    selectedGcodeItem.item.filamentUsed || selectedGcodeItem.item.metadata?.filamentTotal
                                  )}
                                </dd>
                              </div>
                            </>
                          )}
                        </dl>
                      </>
                    ) : (
                      <p className="empty-note">{t("gcodes.noSelection")}</p>
                    )}
                  </aside>
                </div>
              </div>
            </section>
          </div>
        )}

        {klipperConsoleOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setKlipperConsoleOpen(false)}>
            <section
              className="options-modal klipper-console-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="klipper-console-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="klipper-console-title">{t("panels.klipperConsole")}</h2>
                <button
                  className="modal-close"
                  type="button"
                  title={t("actions.close")}
                  aria-label={t("actions.close")}
                  onClick={() => setKlipperConsoleOpen(false)}
                >
                  x
                </button>
              </div>
              <form className="klipper-console-body" onSubmit={sendKlipperConsoleCommand}>
                <p className="setting-help">{t("klipperConsole.help")}</p>
                <label className="klipper-console-field">
                  <span>{t("panels.klipperConsole")}</span>
                  <textarea
                    autoFocus
                    value={klipperConsoleInput}
                    placeholder={t("klipperConsole.placeholder")}
                    spellCheck={false}
                    autoCapitalize="off"
                    onChange={(event) => setKlipperConsoleInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setKlipperConsoleInput("");
                        return;
                      }

                      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        void sendKlipperConsoleCommand();
                      }
                    }}
                  />
                </label>
                <div className="dialog-actions">
                  <button className="dialog-button" type="button" onClick={() => setKlipperConsoleOpen(false)}>
                    {t("actions.cancel")}
                  </button>
                  <button
                    className="dialog-button primary"
                    type="submit"
                    disabled={sendingKlipperCommand || !klipperConsoleInput.trim()}
                  >
                    <MdSend className="dialog-button-icon" />
                    {sendingKlipperCommand ? t("actions.sendingGcode") : t("actions.sendGcode")}
                  </button>
                </div>
                <div className="klipper-console-log" aria-label={t("panels.klipperConsole")}>
                  {klipperConsoleLog.length === 0 ? (
                    <p className="empty-note">{t("klipperConsole.empty")}</p>
                  ) : (
                    klipperConsoleLog.map((entry) => (
                      <article key={entry.id} className={`klipper-console-entry ${entry.status}`}>
                        <div className="klipper-console-entry-header">
                          <span>{entry.status === "sent" ? t("klipperConsole.sent") : t("klipperConsole.error")}</span>
                          <time>{entry.timestamp}</time>
                        </div>
                        <pre>{entry.script}</pre>
                        <p>{entry.message}</p>
                      </article>
                    ))
                  )}
                </div>
              </form>
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
              {printerStatus.printing ? ` - ${formatProgress(printerStatus.progress)}` : ""}
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
