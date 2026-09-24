"use client";

import dynamic from "next/dynamic";
import PreferencesGate from "@/components/PreferencesGate";
import { preferences } from "@/lib/preferences-client";
import Image from "next/image";
import PidChart, { type PidSample } from "@/components/PidChart";
import type { BedMeshViewerData } from "@/components/BedMeshViewer";
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent as ReactDragEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MdiIcon from "@mdi/react";
import { mdiArrowCollapseLeft, mdiArrowCollapseRight, mdiConsoleLine, mdiFan, mdiLedStripVariant } from "@mdi/js";
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
  MdContentCopy,
  MdAcUnit,
  MdEdit,
  MdFunctions,
  MdGridOn,
  MdOpenInFull,
  MdHome,
  MdKeyboardArrowDown,
  MdKeyboardArrowLeft,
  MdKeyboardArrowRight,
  MdKeyboardArrowUp,
  MdSend,
  MdSensors,
  MdStar,
  MdStarBorder,
  MdTerminal
} from "react-icons/md";
import { IoClose, IoDocumentTextOutline, IoHelpCircleOutline, IoPower } from "react-icons/io5";
import logoWhite from "@/components/logoWhite.png";
import { klipperConfigParser } from "@/lib/codemirror/klipper-config";
import { bundledLocaleOptions, bundledLocales } from "@/lib/locales";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
const PtyTerminal = dynamic(() => import("@/components/PtyTerminal"), { ssr: false });
const BedMeshViewer = dynamic(() => import("@/components/BedMeshViewer"), { ssr: false });
const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const mainsailUrl = process.env.NEXT_PUBLIC_MAINSAIL_URL ?? "/";
const heaterCacheKey = "klipper-editor-heater-cache";
const heaterColorCacheKey = "klipper-editor-heater-colors";
const hideBackupFilesKey = "klipper-editor-hide-backup-files";
const terminalHeightKey = "klipper-editor-terminal-height";
const terminalHistoryKey = "klipper-editor-terminal-history";
const klipperConsoleFavoritesKey = "klipper-editor-klipper-console-favorites";
const macroFavoritesKey = "klipper-editor-macro-favorites";
const sectionPreviewDelayKey = "klipper-editor-section-preview-delay";
const sidebarCollapsedKey = "klipper-editor-sidebar-collapsed";
const useAccentLogoKey = "klipper-editor-use-accent-logo";
const themePreferenceKey = "klipper-editor-theme";
const homeWidgetsKey = "klipper-editor-home-widgets";
const sensorShowEndstopsKey = "klipper-editor-sensors-show-endstops";
const sensorHiddenKey = "klipper-editor-sensors-hidden";
const homeTabPath = "__keditor_home__";
const terminalTabPath = "__keditor_terminal__";
const availableHomeWidgets = ["macros", "console", "movement", "sensors"] as const;
type HomeWidget = typeof availableHomeWidgets[number];
const defaultHomeWidgets: HomeWidget[] = ["macros", "console", "movement"];

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
  printDetails: PrintDetails;
  printing: boolean;
  zTiltAvailable: boolean;
  homedAxes: string;
  allAxesHomed: boolean;
  position: {
    x: number;
    y: number;
    z: number;
  };
  speed: number;
  activeExtruder: string;
  excludeObject: ExcludeObjectStatus;
  positionLimits: {
    x: AxisLimit;
    y: AxisLimit;
    z: AxisLimit;
  };
  extruders: ExtruderInfo[];
  zOffset: number;
  error?: string;
};

type PrintDetails = {
  filename: string;
  state: string;
  message: string;
  progress: number;
  filePosition: number;
  fileSize: number;
  printDuration: number;
  totalDuration: number;
  filamentUsed: number;
  info: {
    currentLayer?: number;
    totalLayer?: number;
  };
  metadata?: Partial<GcodeFileEntry>;
  raw: unknown;
};

type ExcludeObjectStatus = {
  objects: Array<{
    name: string;
    polygon?: unknown;
  }>;
  excludedObjects: string[];
  currentObject: string;
};

type BedMeshProfile = {
  name: string;
  points: number[][];
  meshParams: Record<string, unknown>;
};

type BedMeshCurrent = {
  name: string;
  probedMatrix: number[][];
  meshMatrix: number[][];
  meshParams: Record<string, unknown>;
};

type BedMeshDump = {
  current: BedMeshCurrent | null;
  profiles: BedMeshProfile[];
  calibration: unknown;
  probeOffsets: number[];
  axisMinimum: number[];
  axisMaximum: number[];
  raw: unknown;
};

type XySnapshot = {
  timestamp: number;
  filename: string;
  layer?: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  activeExtruder: string;
  filePosition: number;
  suggestedIntervalMs: number;
  excludeObject: ExcludeObjectStatus;
};

type QuickCommand = "home-all" | "home-x" | "home-y" | "home-z" | "z-tilt";
type JogAxis = "x" | "y" | "z";
type MachinePowerAction = "shutdown" | "reboot";
type UnsavedCloseChoice = "save" | "discard" | "cancel";
type AxisLimit = {
  min: number;
  max: number;
};

type ExtruderInfo = {
  name: string;
  label: string;
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

type McpTunnelStatus = {
  cloudflaredInstalled?: boolean;
  running: boolean;
  starting: boolean;
  url: string;
  localUrl: string;
  token: string;
  error: string;
  log: string[];
};

type KlipperConsoleEntry = {
  id: string;
  script: string;
  status: "sent" | "error";
  message: string;
  timestamp: string;
  createdAt: number;
};

type KlipperGcodeStoreEntry = {
  message: string;
  time: number;
  type: "command" | "response";
};

type KlipperConsoleFavorite = {
  script: string;
  updatedAt: number;
};

type KlipperConsoleTab = "console" | "favorites";

type KlipperConsoleTimelineEntry =
  | {
      kind: "store";
      id: string;
      sortTime: number;
      entry: KlipperGcodeStoreEntry;
    }
  | {
      kind: "history";
      id: string;
      sortTime: number;
      entry: KlipperConsoleEntry;
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

type UpdateApp = {
  name: string;
  configuredType: string;
  channel: string;
  version: string;
  remoteVersion: string;
  isValid: boolean;
  isDirty: boolean;
  detached: boolean;
  commitsBehind: number;
  warnings: string[];
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

const availableThemeLogos = [
  { theme: "k-editor", label: "K-Editor", logoUrl: "/img/k-editor-mark.svg", logoMask: false },
  { theme: "orbys", label: "Orbys", logoUrl: "/img/orbys.svg", logoMask: true },
  { theme: "mainsail", label: "Mainsail", logoUrl: "/mainsail-themes/logo.svg", logoMask: true },
  { theme: "btt", label: "BTT", logoUrl: "/mainsail-themes/sidebarLogo-btt.svg", logoMask: true },
  { theme: "klipper", label: "Klipper", logoUrl: "/mainsail-themes/sidebarLogo-klipper.svg", logoMask: true },
  { theme: "ldo", label: "LDO", logoUrl: "/mainsail-themes/sidebarLogo-ldo.svg", logoMask: true },
  { theme: "multec", label: "Multec", logoUrl: "/mainsail-themes/sidebarLogo-multec.svg", logoMask: true },
  { theme: "prusa", label: "Prusa", logoUrl: "/mainsail-themes/sidebarLogo-prusa.svg", logoMask: true },
  { theme: "voron", label: "Voron", logoUrl: "/mainsail-themes/sidebarLogo-voron.svg", logoMask: true },
  { theme: "vzbot", label: "VzBot", logoUrl: "/mainsail-themes/sidebarLogo-vzbot.svg", logoMask: true },
  { theme: "yumi", label: "Yumi", logoUrl: "/mainsail-themes/sidebarLogo-yumi.svg", logoMask: true }
];

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

function logoOptionForTheme(theme: unknown) {
  const value = typeof theme === "string" ? theme.trim().toLowerCase() : "";
  return availableThemeLogos.find((logo) => logo.theme === value) ?? availableThemeLogos[1];
}

function normalizeEditorTheme(value: unknown): MainsailVisualTheme {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const logoOption = logoOptionForTheme(source.theme);
  const isKEditor = logoOption.theme === "k-editor";

  return {
    mode: typeof source.mode === "string" && source.mode.trim() ? source.mode.trim() : fallbackMainsailTheme.mode,
    theme: logoOption.theme,
    logo: normalizeCssColor(source.logo, fallbackMainsailTheme.logo),
    primary: normalizeCssColor(source.primary, fallbackMainsailTheme.primary),
    logoPath: typeof source.logoPath === "string" && source.logoPath.trim() && !isKEditor ? source.logoPath.trim() : null,
    logoUrl: isKEditor ? logoOption.logoUrl : typeof source.logoUrl === "string" && source.logoUrl.trim() ? source.logoUrl.trim() : logoOption.logoUrl,
    logoMask: isKEditor ? false : Boolean(source.logoMask ?? logoOption.logoMask)
  };
}

function readStoredEditorTheme() {
  try {
    const stored = preferences.getItem(themePreferenceKey);
    return stored ? normalizeEditorTheme(JSON.parse(stored)) : fallbackMainsailTheme;
  } catch {
    return fallbackMainsailTheme;
  }
}

function readHomeWidgets() {
  try {
    const stored = JSON.parse(preferences.getItem(homeWidgetsKey) ?? "null") as unknown;
    if (!Array.isArray(stored)) return defaultHomeWidgets;
    const widgets = stored.filter((item): item is HomeWidget =>
      typeof item === "string" && availableHomeWidgets.includes(item as HomeWidget)
    );
    return widgets.length > 0 ? Array.from(new Set(widgets)) : [];
  } catch {
    return defaultHomeWidgets;
  }
}

function writeHomeWidgets(widgets: HomeWidget[]) {
  preferences.setItem(homeWidgetsKey, JSON.stringify(widgets));
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

function readablePrinterMessage(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
      if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
      if (typeof record.code === "number") return `HTTP ${record.code}`;
    }
  } catch {
    // Plain Moonraker messages should pass through unchanged.
  }

  return raw
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.toLowerCase().startsWith("traceback")) ?? raw;
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
  const printDetails = status.printDetails && typeof status.printDetails === "object"
    ? (status.printDetails as Partial<PrintDetails>)
    : {};
  const printInfo = printDetails.info && typeof printDetails.info === "object"
    ? (printDetails.info as Partial<PrintDetails["info"]>)
    : {};
  const excludeObject = status.excludeObject && typeof status.excludeObject === "object"
    ? (status.excludeObject as Partial<ExcludeObjectStatus>)
    : {};

  return {
    webhooksState: String(status.webhooksState ?? "unknown"),
    webhooksMessage: readablePrinterMessage(status.webhooksMessage ?? error ?? fallbackMessage),
    printState,
    filename: String(status.filename ?? ""),
    progress: Math.min(Math.max(numericValue(status.progress), 0), 1),
    printDetails: {
      filename: String(printDetails.filename ?? status.filename ?? ""),
      state: String(printDetails.state ?? printState),
      message: String(printDetails.message ?? ""),
      progress: Math.min(Math.max(numericValue(printDetails.progress ?? status.progress), 0), 1),
      filePosition: numericValue(printDetails.filePosition),
      fileSize: numericValue(printDetails.fileSize),
      printDuration: numericValue(printDetails.printDuration),
      totalDuration: numericValue(printDetails.totalDuration),
      filamentUsed: numericValue(printDetails.filamentUsed),
      info: {
        currentLayer: printInfo.currentLayer === undefined ? undefined : numericValue(printInfo.currentLayer),
        totalLayer: printInfo.totalLayer === undefined ? undefined : numericValue(printInfo.totalLayer)
      },
      metadata: printDetails.metadata,
      raw: printDetails.raw ?? null
    },
    printing: Boolean(status.printing),
    zTiltAvailable: Boolean(status.zTiltAvailable),
    homedAxes: String(status.homedAxes ?? ""),
    allAxesHomed: Boolean(status.allAxesHomed),
    position: {
      x: numericValue(position.x),
      y: numericValue(position.y),
      z: numericValue(position.z)
    },
    speed: numericValue(status.speed),
    activeExtruder: String(status.activeExtruder ?? ""),
    excludeObject: {
      objects: Array.isArray(excludeObject.objects)
        ? excludeObject.objects
            .filter((object): object is ExcludeObjectStatus["objects"][number] => {
              return Boolean(object) && typeof object === "object" && typeof object.name === "string";
            })
            .map((object) => ({ name: object.name, polygon: object.polygon }))
        : [],
      excludedObjects: Array.isArray(excludeObject.excludedObjects)
        ? excludeObject.excludedObjects.map((object) => String(object))
        : [],
      currentObject: String(excludeObject.currentObject ?? "")
    },
    positionLimits: {
      x: axisLimitValue(positionLimits.x),
      y: axisLimitValue(positionLimits.y),
      z: axisLimitValue(positionLimits.z)
    },
    extruders: Array.isArray(status.extruders)
      ? status.extruders
          .filter((extruder): extruder is ExtruderInfo => {
            return (
              Boolean(extruder) &&
              typeof extruder === "object" &&
              typeof (extruder as ExtruderInfo).name === "string" &&
              typeof (extruder as ExtruderInfo).label === "string"
            );
          })
          .map((extruder) => ({ name: extruder.name, label: extruder.label }))
      : [],
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

type AuxiliaryControl = {
  name: string;
  label: string;
  type: "fan" | "led";
  source: string;
  controllable: boolean;
  value: number;
  color?: string;
};

type SensorState = {
  id: string;
  label: string;
  group: "sensor" | "endstop";
  state: boolean | null;
};

type MacroEntry = {
  name: string;
  title: string;
  path: string;
  line: number;
  description?: string;
  parameters: MacroParameter[];
};

type MacroParameter = {
  name: string;
  required: boolean;
  kind: "text" | "number" | "boolean";
  defaultValue?: string;
  defaultExpression?: string;
};

type MacroTab = "favorites" | "all";

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
    }
  | {
      type: "unsaved-close";
      title: string;
      message: string;
      resolve: (value: UnsavedCloseChoice) => void;
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
  "actions.deleting": "Borrando",
  "actions.renameFile": "Renombrar archivo",
  "actions.selectFile": "Seleccionar archivo",
  "actions.downloadSelectedFiles": "Descargar seleccionados",
  "actions.deleteSelectedFiles": "Borrar seleccionados",
  "actions.clearSelection": "Limpiar seleccion",
  "actions.downloadOnlyFile": "Descargar archivo",
  "actions.macros": "Macros",
  "actions.executeMacro": "Ejecutar macro",
  "actions.favoriteMacro": "Agregar macro a favoritos",
  "actions.removeFavoriteMacro": "Quitar macro de favoritos",
  "actions.klipperConsole": "Consola Klipper",
  "actions.sendGcode": "Enviar",
  "actions.sendingGcode": "Enviando",
  "actions.clearConsoleHistory": "Borrar historial",
  "actions.editCommand": "Editar comando",
  "actions.favoriteCommand": "Agregar favorito",
  "actions.removeFavoriteCommand": "Quitar favorito",
  "actions.runCommand": "Ejecutar comando",
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
  "actions.updates": "Actualizaciones",
  "actions.checkUpdates": "Revisar actualizaciones",
  "actions.updateAll": "Actualizar todo",
  "actions.updateComponent": "Actualizar",
  "actions.updating": "Actualizando",
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
  "actions.auxiliaries": "Varios",
  "actions.refreshAuxiliaries": "Actualizar varios",
  "actions.save": "Guardar",
  "actions.saving": "Guardando",
  "actions.saveAndClose": "Guardar y cerrar",
  "actions.closeWithoutSaving": "Cerrar sin guardar",
  "actions.closeAllEditors": "Cerrar todos",
  "actions.collapseSidebar": "Contraer arbol",
  "actions.expandSidebar": "Expandir arbol",
  "actions.options": "Opciones",
  "actions.terminal": "Terminal",
  "actions.openTerminal": "Abrir terminal",
  "actions.openTerminalTab": "Abrir terminal en una pestaña",
  "actions.closeTerminal": "Ocultar terminal",
  "actions.connectTerminal": "Conectar terminal",
  "actions.disconnectTerminal": "Desconectar terminal",
  "actions.runTerminalCommand": "Ejecutar",
  "actions.enableTerminal": "Habilitar terminal",
  "actions.startMcpTunnel": "Subir MCP",
  "mcp.install": "Instalar / verificar cloudflared",
  "mcp.copyFailed": "No se pudo copiar. Selecciona la URL y copiala manualmente.",
  "mcp.installing": "Instalando y verificando...",
  "mcp.installed": "Instalacion verificada",
  "mcp.installFailed": "No se pudo verificar la instalacion",
  "actions.stopMcpTunnel": "Bajar MCP",
  "actions.copyMcpUrl": "Copiar URL",
  "actions.restartFirmware": "Restar",
  "actions.restartingFirmware": "Reiniciando",
  "actions.restartFirmwareLong": "Reiniciar firmware",
  "actions.applyToGroup": "Aplicar a todos",
  "status.ready": "Listo",
  "status.opening": "Abriendo {path}",
  "status.opened": "Abierto {path}",
  "status.creating": "Creando {path}",
  "status.created": "Creado {path}",
  "status.uploading": "Subiendo {path}",
  "status.uploaded": "Subido {path}",
  "status.deleted": "Borrado {path}",
  "status.deletedSelected": "{count} archivos borrados",
  "status.renamed": "Renombrado {path} a {newPath}",
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
  "status.extruding": "Extruyendo {move}",
  "status.extruded": "Extrusion ejecutada",
  "status.settingHeaters": "Aplicando temperaturas",
  "status.heatersSet": "Temperaturas aplicadas",
  "status.loadingAuxiliaries": "Cargando varios",
  "status.auxiliariesRefreshed": "Varios actualizados",
  "status.settingAuxiliary": "Ajustando {name}",
  "status.auxiliarySet": "{name} ajustado",
  "status.emergencyStopping": "Ejecutando parada de emergencia",
  "status.emergencyStopped": "Parada de emergencia enviada",
  "status.runningCommand": "Ejecutando {command}",
  "status.commandDone": "{command} ejecutado",
  "status.loadingUpdates": "Revisando actualizaciones",
  "status.updatesLoaded": "Actualizaciones revisadas",
  "status.updateStarted": "Actualizacion iniciada",
  "status.saving": "Guardando {path}",
  "status.saved": "Guardado {path}",
  "status.savedWithBackup": "Guardado {path}; copia creada en {backupPath}",
  "status.reloadedOpenFiles": "Archivos abiertos recargados",
  "status.reloadedOpenFilesPartial": "Archivos abiertos recargados; {count} con cambios locales no se tocaron",
  "status.firmwareRestarting": "Reiniciando firmware",
  "status.firmwareRestarted": "Reinicio de firmware solicitado",
  "status.printerInitializing": "Inicializando",
  "status.printerReported": "Reporta Klipper: {state}",
  "status.terminalConnected": "Terminal conectada",
  "status.terminalDisconnected": "Terminal desconectada",
  "status.terminalRunning": "Ejecutando comando",
  "status.terminalSettingSaved": "Configuracion de terminal actualizada",
  "status.mcpTunnelStarting": "Levantando MCP",
  "status.mcpTunnelReady": "Tunel MCP listo",
  "status.mcpTunnelStopped": "Tunel MCP detenido",
  "status.mcpTunnelUrlCopied": "URL del MCP copiada",
  "status.printerState": "Impresora: {state}",
  "status.resolvingInclude": "Resolviendo include {include}",
  "status.wildcardInclude": "Include con comodin: abierto {path}; {count} coincidencias",
  "status.modified": "modificado",
  "status.themeImported": "Tema importado de Mainsail",
  "errors.loadTree": "No se pudo cargar el arbol",
  "errors.importTheme": "No se pudo importar el tema de Mainsail",
  "errors.openFile": "No se pudo abrir el archivo",
  "errors.openGeneric": "Error al abrir",
  "errors.createFile": "No se pudo crear el archivo",
  "errors.uploadFile": "No se pudo subir el archivo",
  "errors.deleteFile": "No se pudo borrar el archivo",
  "errors.renameFile": "No se pudo renombrar el archivo",
  "errors.downloadSelectedFiles": "No se pudieron descargar los archivos seleccionados",
  "errors.loadMacros": "No se pudieron cargar las macros",
  "errors.executeMacro": "No se pudo ejecutar la macro",
  "errors.gcodeCommand": "No se pudo enviar el G-code",
  "errors.gcodeStore": "No se pudo cargar la consola Klipper",
  "errors.loadGcodes": "No se pudieron cargar los archivos impresos",
  "errors.globalSearch": "No se pudo buscar en la configuracion",
  "errors.startPrint": "No se pudo iniciar la impresion",
  "errors.printControl": "No se pudo controlar la impresion",
  "errors.loadHeaters": "No se pudieron cargar los calentadores",
  "errors.coolHeater": "No se pudo enfriar el calentador",
  "errors.setHeaters": "No se pudieron aplicar las temperaturas",
  "errors.loadAuxiliaries": "No se pudieron cargar ventiladores y LEDs",
  "errors.loadSensors": "No se pudieron cargar los sensores",
  "errors.setAuxiliary": "No se pudo ajustar {name}",
  "errors.movePrinter": "No se pudo mover la impresora",
  "errors.extrudeFilament": "No se pudo extruir filamento",
  "errors.moveHoming": "Haz home de X/Y/Z antes de mover la impresora",
  "errors.movePosition": "Ingresa una posicion valida para {axis}",
  "errors.moveRange": "{axis} debe estar entre {min} y {max}",
  "errors.emergencyStop": "No se pudo ejecutar la parada de emergencia",
  "errors.quickCommand": "No se pudo ejecutar el comando",
  "errors.loadUpdates": "No se pudieron cargar las actualizaciones",
  "errors.runUpdate": "No se pudo iniciar la actualizacion",
  "errors.updatePrinting": "No se puede actualizar mientras hay una impresion en curso",
  "errors.saveFile": "No se pudo guardar",
  "errors.saveGeneric": "Error al guardar",
  "errors.restartFirmware": "No se pudo reiniciar el firmware",
  "errors.restartPrinting": "No se puede reiniciar firmware mientras hay una impresion en curso",
  "errors.terminalDisabled": "La terminal esta deshabilitada. Habilitala en Opciones > Terminal o con KLIPPER_EDITOR_ENABLE_TERMINAL=true en el servicio.",
  "errors.terminalConnection": "No se pudo conectar la terminal",
  "errors.terminalCommand": "No se pudo enviar el comando",
  "errors.terminalUnsupportedCommand": "{command} no funciona en esta terminal. Usa SSH o una terminal TTY real para herramientas interactivas.",
  "errors.mcpTunnel": "No se pudo controlar el tunel MCP",
  "errors.printerStatus": "No se pudo consultar Moonraker",
  "errors.includeNotFound": "No se encontro el include",
  "errors.includeOpen": "No se pudo abrir el include",
  "confirm.closeUnsaved": "{path} tiene cambios sin guardar. Cerrar?",
  "confirm.deleteFile": "Borrar {path}? Esta accion no se puede deshacer.",
  "confirm.deleteSelectedFiles": "Borrar {count} archivos seleccionados? Esta accion no se puede deshacer.",
  "confirm.restartFirmware": "Reiniciar firmware ahora?",
  "confirm.executeMacro": "Ejecutar macro {name} en la impresora?",
  "confirm.printFile": "Imprimir {name} ahora?",
  "confirm.enableTerminal": "La terminal permite ejecutar comandos con los permisos del usuario de K-Editor. En HTTP, el texto y las contrasenas viajan sin cifrar. Habilitala solo en una red local de confianza, sin publicar este acceso en Internet. Quieres habilitarla?",
  "confirm.cancelPrint": "Cancelar la impresion actual?",
  "confirm.updateAll": "Ejecutar todas las actualizaciones pendientes?",
  "confirm.updateComponent": "Actualizar {name}?",
  "prompt.newFilePath": "Ruta del nuevo archivo",
  "prompt.renameFilePath": "Nueva ruta del archivo",
  "panels.openEditors": "Editores abiertos",
  "panels.terminal": "Terminal",
  "panels.klipperConsole": "Consola Klipper",
  "panels.printedFiles": "Archivos impresos",
  "panels.globalSearch": "Busqueda global",
  "panels.updates": "Actualizaciones",
  "panels.includes": "Includes",
  "panels.sections": "Sesiones",
  "empty.openFile": "Abre un archivo del arbol.",
  "empty.terminal": "Terminal deshabilitada. Habilitala en Opciones > Habilitar terminal SSH basica o activa KLIPPER_EDITOR_ENABLE_TERMINAL=true en el servicio.",
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
  "options.generalTab": "General",
  "options.themeTab": "Tema",
  "options.mcpTab": "MCP",
  "options.themeLogo": "Logo",
  "options.themeLogoHelp": "Elige el logo que se muestra en la barra superior y en la pagina de bienvenida.",
  "options.themeColor": "Color de enfasis",
  "options.themeColorHelp": "Color de acento usado en botones, resaltados y en el logo K-Editor.",
  "options.importFromMainsail": "Importar de Mainsail",
  "options.importingFromMainsail": "Importando de Mainsail...",
  "options.importFromMainsailHelp": "Copia el logo y el color de enfasis configurados actualmente en Mainsail a este tema.",
  "options.language": "Idioma",
  "options.languageHelp": "Los idiomas disponibles salen de los archivos JSON en la carpeta `locales`.",
  "options.createBackupOnSave": "Crear copia de seguridad al guardar",
  "options.createBackupOnSaveHelp": "Antes de sobrescribir un archivo, crea una copia con fecha junto al original.",
  "options.startCollapsedSidebar": "Iniciar con barra colapsada",
  "options.startCollapsedSidebarHelp": "Al abrir K-Editor, muestra solo la barra lateral de iconos hasta pasar el mouse encima.",
  "options.enableTerminal": "Habilitar terminal",
  "options.enableTerminalHelp": "Acceso a la shell del usuario del servicio. Solo para una red de confianza.",
  "pty.mode": "Modo de terminal",
  "pty.basic": "Basica",
  "pty.interactive": "Interactiva (PTY)",
  "pty.changeConfirm": "Cambiar de modo cerrara la sesion activa y sus procesos. Continuar?",
  "pty.connecting": "Conectando...",
  "pty.unsupported": "PTY requiere Linux y Python 3 en la impresora. Usa el modo basico en Windows.",
  "pty.http": "HTTP sin cifrar: usa solo una red local de confianza; no introduzcas contrasenas sensibles.",
  "pty.settingsHelp": "PTY permite aplicaciones interactivas. Cerrar el panel termina su sesion; las sesiones inactivas se cierran a los 30 minutos. HTTP esta permitido solo para uso en una red local de confianza.",
  "options.enableTerminalEnvHelp": "La terminal esta habilitada por KLIPPER_EDITOR_ENABLE_TERMINAL=true en el servicio.",
  "options.mcpTunnelTitle": "MCP para ChatGPT",
  "options.mcpTunnelHelp": "Levanta el MCP HTTP local y crea un tunel HTTPS temporal con cloudflared. Usa la URL /mcp generada en ChatGPT solo mientras necesites acceso externo a los archivos de la impresora.",
  "options.mcpTunnelUrl": "URL para ChatGPT",
  "options.mcpTunnelToken": "Token temporal",
  "options.mcpTunnelStopped": "MCP apagado",
  "options.mcpTunnelStarting": "Esperando tunel",
  "options.mcpTunnelRunning": "MCP activo",
  "options.sectionPreviewDelay": "Retardo de vista previa de sesiones",
  "options.sectionPreviewDelayHelp": "Segundos que debe permanecer el mouse sobre una sesion antes de mostrar la vista previa.",
  "options.close": "Cerrar opciones",
  "options.loadingLocales": "Cargando idiomas.",
  "options.noLocales": "No hay archivos de idioma disponibles.",
  "macros.title": "Macros",
  "macros.search": "Buscar macro",
  "macros.loading": "Cargando macros.",
  "macros.empty": "Sin macros detectadas.",
  "macros.emptyFavorites": "Sin macros favoritas.",
  "homeGrid.widgetMacros": "Macros favoritas",
  "homeGrid.widgetConsole": "Consola Klipper",
  "homeGrid.widgetMovement": "Movimiento XY/Z",
  "homeGrid.widgetSensors": "Sensores",
  "homeGrid.openHome": "Mostrar widgets",
  "homeGrid.showEndstops": "Mostrar finales de carrera",
  "homeGrid.detected": "Detectado",
  "homeGrid.empty": "Vacio",
  "homeGrid.triggered": "Activado",
  "homeGrid.open": "Abierto",
  "homeGrid.unknown": "Desconocido",
  "homeGrid.hideSensor": "Ocultar {name}",
  "homeGrid.sensorVisibility": "Visibilidad de sensores",
  "homeGrid.noSensors": "No se encontraron sensores.",
  "homeGrid.openFull": "Abrir ventana completa",
  "homeGrid.send": "Enviar G-code",
  "homeGrid.moveUp": "Mover antes",
  "homeGrid.moveDown": "Mover despues",
  "homeGrid.tab": "Home Grid",
  "macros.parameters": "Parametros",
  "macros.parametersFor": "Parametros de {name}",
  "macros.parameterRequired": "Obligatorio",
  "macros.parameterOptional": "Opcional",
  "macros.parameterDefault": "Predeterminado: {value}",
  "macros.parameterDynamicDefault": "Predeterminado calculado por la macro: {value}",
  "macros.useDefault": "Usar valor predeterminado",
  "macros.booleanTrue": "Verdadero",
  "macros.booleanFalse": "Falso",
  "macros.favorites": "Favoritos",
  "macros.all": "Todas",
  "macros.count": "{count} macros",
  "klipperConsole.placeholder": "Escribe G-code o una macro. Ctrl+Enter envia.\n\nEjemplos:\nG28\nBED_MESH_CALIBRATE",
  "klipperConsole.help": "Los comandos se envian a Moonraker como script G-code. Puedes enviar varias lineas.",
  "klipperConsole.empty": "Sin comandos enviados en esta sesion.",
  "klipperConsole.console": "Consola",
  "klipperConsole.favorites": "Favoritos",
  "klipperConsole.history": "Historial",
  "klipperConsole.output": "Salida Klipper",
  "klipperConsole.favoriteSearch": "Buscar favorito",
  "klipperConsole.noOutput": "Sin mensajes de Klipper.",
  "klipperConsole.noFavorites": "Sin favoritos.",
  "klipperConsole.sent": "Enviado",
  "klipperConsole.error": "Error",
  "gcodes.files": "Archivos",
  "gcodes.history": "Historial",
  "gcodes.loading": "Cargando archivos.",
  "gcodes.empty": "Sin archivos G-code.",
  "gcodes.historyEmpty": "Sin historial de impresiones.",
  "gcodes.upload": "Subir G-code",
  "gcodes.dropUpload": "Arrastra archivos .gcode aqui o pulsa para subir",
  "gcodes.uploading": "Subiendo G-code.",
  "gcodes.uploadOnlyGcode": "Selecciona archivos .gcode.",
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
  "gcodes.statusComplete": "Completada",
  "gcodes.statusCancelled": "Cancelada",
  "gcodes.statusError": "Error",
  "gcodes.statusPrinting": "Imprimiendo",
  "gcodes.statusPaused": "Pausada",
  "gcodes.statusStandby": "En espera",
  "gcodes.statusUnknown": "Desconocido",
  "gcodes.lastStatus": "Ultima",
  "gcodes.started": "Inicio",
  "gcodes.finished": "Fin",
  "printStatus.title": "Impresion en curso",
  "printStatus.details": "Detalles",
  "printStatus.raw": "Moonraker",
  "printStatus.filePosition": "Posicion de archivo",
  "printStatus.layers": "Capas",
  "printStatus.message": "Mensaje",
  "printStatus.xyRecorder": "Registro XY",
  "printStatus.xyRecorderStart": "Activar registro XY",
  "printStatus.xyRecorderStop": "Desactivar registro XY",
  "printStatus.xyRecorderOn": "Activo",
  "printStatus.xyRecorderOff": "Inactivo",
  "printStatus.xyPanelOpen": "Abrir panel XY",
  "printStatus.xyPanelClose": "Cerrar panel XY",
  "printStatus.snapshots": "Snapshots",
  "printStatus.lastSnapshot": "Ultimo snapshot",
  "printStatus.xy": "XY",
  "printStatus.recoveryZ": "Recuperacion Z",
  "printStatus.speed": "Velocidad",
  "printStatus.suggestedInterval": "Intervalo sugerido",
  "printStatus.currentObject": "Objeto actual",
  "printStatus.excludedObjects": "Objetos excluidos",
  "globalSearch.placeholder": "Buscar en toda la configuracion",
  "globalSearch.empty": "Ingresa al menos 2 caracteres.",
  "globalSearch.noResults": "Sin resultados.",
  "globalSearch.count": "{count} resultados",
  "updates.loading": "Revisando actualizaciones.",
  "updates.empty": "No hay actualizaciones pendientes.",
  "updates.count": "{count} pendientes",
  "updates.allCount": "{count} componentes",
  "updates.upToDate": "Al dia",
  "updates.current": "Actual",
  "updates.available": "Disponible",
  "updates.channel": "Canal",
  "updates.dirty": "Cambios locales",
  "updates.detached": "Detached",
  "updates.invalid": "Invalido",
  "updates.busy": "Moonraker update manager esta ocupado.",
  "sections.search": "Buscar sesion",
  "heaters.title": "Calentadores",
  "pid.title": "Calibracion PID",
  "pid.heater": "Calentador",
  "pid.start": "Iniciar calibracion",
  "pid.busy": "Calibrando...",
  "pid.complete": "Calibracion terminada. Los resultados estan listos para guardar.",
  "pid.saved": "Configuracion guardada. Reiniciando Klipper.",
  "pid.ready": "Listo para calibrar",
  "pid.chart": "Temperatura, objetivo y potencia del calentador en tiempo real",
  "heaters.coolAll": "Enfriar todos los calentadores",
  "heaters.pidRunning": "Calibrando PID: {heater}",
  "heaters.pidSave": "Calibracion PID terminada. Guardar los resultados y reiniciar Klipper ahora? Se guardaran tambien otros cambios de calibracion pendientes.",
  "heaters.pidSaveTitle": "Guardar PID y reiniciar",
  "heaters.empty": "Sin calentadores detectados.",
  "heaters.cacheHelp": "Si modificaste tus calentadores recientemente, pulsa actualizar para recargarlos y guardarlos nuevamente.",
  "heaters.current": "Actual",
  "heaters.target": "Objetivo",
  "heaters.extruders": "Extrusores",
  "heaters.beds": "Camas",
  "heaters.groupTarget": "Valor para todos",
  "auxiliaries.title": "Varios",
  "auxiliaries.fans": "Ventiladores",
  "auxiliaries.leds": "LEDs",
  "auxiliaries.empty": "Sin ventiladores ni LEDs detectados.",
  "auxiliaries.readOnly": "Controlado por Klipper",
  "movement.title": "Movimiento",
  "movement.absolutePosition": "Posicion: absoluta",
  "movement.zOffset": "Z-Offset: {offset}",
  "movement.extrusion": "Extrusion",
  "movement.extruder": "Extrusor",
  "movement.extrudeLength": "Filamento",
  "movement.extrudeSpeed": "Velocidad",
  "movement.extrude": "Extruir",
  "movement.retract": "Retraer",
  "movement.noExtruders": "Sin extrusores detectados.",
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
  const now = Date.now();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${now}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    script,
    status,
    message,
    timestamp: new Date(now).toLocaleString(),
    createdAt: now
  };
}

function readKlipperConsoleFavorites() {
  try {
    const cached = JSON.parse(preferences.getItem(klipperConsoleFavoritesKey) ?? "[]") as unknown;
    if (!Array.isArray(cached)) return [];

    return cached
      .filter((entry): entry is Partial<KlipperConsoleFavorite> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        script: typeof entry.script === "string" ? entry.script : "",
        updatedAt: numericValue(entry.updatedAt)
      }))
      .filter((entry) => entry.script.trim());
  } catch {
    preferences.removeItem(klipperConsoleFavoritesKey);
    return [];
  }
}

function writeKlipperConsoleFavorites(favorites: KlipperConsoleFavorite[]) {
  preferences.setItem(klipperConsoleFavoritesKey, JSON.stringify(favorites));
}

function readMacroFavorites() {
  try {
    const cached = JSON.parse(preferences.getItem(macroFavoritesKey) ?? "[]") as unknown;
    if (!Array.isArray(cached)) return [];

    return cached.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  } catch {
    preferences.removeItem(macroFavoritesKey);
    return [];
  }
}

function writeMacroFavorites(favorites: string[]) {
  preferences.setItem(macroFavoritesKey, JSON.stringify(favorites));
}

function isHtmlLikeMessage(message: string) {
  return /<\/?[a-z][\s\S]*>/i.test(message);
}

function sanitizeKlipperHtml(message: string) {
  if (typeof window === "undefined") return "";

  const parser = new DOMParser();
  const document = parser.parseFromString(message, "text/html");
  document.querySelectorAll("script, style, iframe, object, embed").forEach((node) => node.remove());

  document.body.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith("on") || (["href", "src"].includes(name) && /^javascript:/i.test(value))) {
        element.removeAttribute(attribute.name);
      }

      if (name === "target") {
        element.setAttribute("rel", "noopener noreferrer");
      }

      if (element.tagName === "IMG" && name === "src") {
        try {
          const sourceUrl = new URL(value, window.location.origin);
          const configPrefix = "/server/files/config/";
          if (sourceUrl.pathname.startsWith(configPrefix)) {
            const configPath = decodeURIComponent(sourceUrl.pathname.slice(configPrefix.length));
            element.setAttribute("src", apiPath(`/api/printer/config-asset?path=${encodeURIComponent(configPath)}`));
          }
        } catch {
          element.removeAttribute("src");
        }
      }
    }
  });

  return document.body.innerHTML;
}

function KlipperStoreMessage({ message }: { message: string }) {
  if (!isHtmlLikeMessage(message)) {
    return <pre>{message}</pre>;
  }

  return <div className="klipper-store-html" dangerouslySetInnerHTML={{ __html: sanitizeKlipperHtml(message) }} />;
}

function hasPendingUpdate(update: UpdateApp) {
  return (
    update.commitsBehind > 0 ||
    Boolean(update.remoteVersion && update.version && update.remoteVersion !== update.version) ||
    update.isDirty ||
    update.detached ||
    !update.isValid
  );
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

function formatCompactTemperature(value: number) {
  return `${Math.round(value)}`;
}

function heaterTargetLabel(heater: HeaterStatus) {
  return heater.target > 0 ? formatTemperature(heater.target) : "0 °C";
}

function heaterCompactTargetLabel(heater: HeaterStatus) {
  return heater.target > 0 ? formatCompactTemperature(heater.target) : "0";
}

function isExtruderHeater(heater: HeaterStatus) {
  return /^extruder\d*$/.test(heater.name);
}

function isBedHeater(heater: HeaterStatus) {
  return heater.name === "heater_bed" || /\bbed\b/i.test(`${heater.name} ${heater.label}`);
}

function HeaterTypeIcon({
  heater,
  className,
  style
}: {
  heater: HeaterStatus;
  className?: string;
  style?: CSSProperties;
}) {
  const path = isBedHeater(heater)
    ? "M20,12H4A2,2 0 0,0 2,14V22H4V20H20V22H22V14A2,2 0 0,0 20,12M7,17A1,1 0 0,1 6,18A1,1 0 0,1 5,17V15A1,1 0 0,1 6,14A1,1 0 0,1 7,15V17M11,17A1,1 0 0,1 10,18A1,1 0 0,1 9,17V15A1,1 0 0,1 10,14A1,1 0 0,1 11,15V17M15,17A1,1 0 0,1 14,18A1,1 0 0,1 13,17V15A1,1 0 0,1 14,14A1,1 0 0,1 15,15V17M19,17A1,1 0 0,1 18,18A1,1 0 0,1 17,17V15A1,1 0 0,1 18,14A1,1 0 0,1 19,15V17Z"
    : "M7,2H17V8H19V13H16.5L13,17H11L7.5,13H5V8H7V2M10,22H2V20H10A1,1 0 0,0 11,19V18H13V19A3,3 0 0,1 10,22Z";

  return (
    <svg className={className} style={style} viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

function formatProgress(value: number) {
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
}

function formatPercent(value: number) {
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)} %`;
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

function formatCoordinate(value: number | undefined) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";
}

function numberFromParam(params: Record<string, unknown>, key: string, fallback: number) {
  const number = Number(params[key]);
  return Number.isFinite(number) ? number : fallback;
}

function meshDataFromProfile(profile: BedMeshProfile | BedMeshCurrent | null, source: "probed" | "mesh" = "probed"): BedMeshViewerData | null {
  if (!profile) return null;
  const params = profile.meshParams ?? {};
  const points = "points" in profile
    ? profile.points
    : source === "mesh" && profile.meshMatrix.length
      ? profile.meshMatrix
      : profile.probedMatrix;
  if (!points.length || !points[0]?.length) return null;

  return {
    points,
    minX: numberFromParam(params, "min_x", 0),
    maxX: numberFromParam(params, "max_x", points[0].length - 1),
    minY: numberFromParam(params, "min_y", 0),
    maxY: numberFromParam(params, "max_y", points.length - 1)
  };
}

function meshStats(data: BedMeshViewerData | null) {
  const values = data?.points.flat().filter((value) => Number.isFinite(value)) ?? [];
  if (!data || !values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const minIndex = values.indexOf(min);
  const maxIndex = values.indexOf(max);
  const cols = data.points[0]?.length ?? 1;
  const pointAt = (index: number) => {
    const xIndex = index % cols;
    const yIndex = Math.floor(index / cols);
    const x = cols <= 1 ? data.minX : data.minX + ((data.maxX - data.minX) * xIndex) / (cols - 1);
    const rows = data.points.length;
    const y = rows <= 1 ? data.minY : data.minY + ((data.maxY - data.minY) * yIndex) / (rows - 1);
    return `${formatCoordinate(x)}, ${formatCoordinate(y)}`;
  };
  return {
    min,
    max,
    range: max - min,
    size: `${data.points[0]?.length ?? 0}x${data.points.length}`,
    minPoint: pointAt(minIndex),
    maxPoint: pointAt(maxIndex)
  };
}

function suggestedXySnapshotInterval(speed: number) {
  const targetDistanceMm = 25;
  const defaultIntervalMs = 1000;
  if (!Number.isFinite(speed) || speed <= 0) return defaultIntervalMs;
  return Math.min(Math.max(Math.round((targetDistanceMm / speed) * 1000), 500), 5000);
}

function normalizedPrintStatus(status: string | undefined) {
  const value = String(status ?? "").trim().toLowerCase();
  if (["complete", "completed", "success"].includes(value)) return "complete";
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  if (["error", "failed", "failure"].includes(value)) return "error";
  if (["printing", "in_progress"].includes(value)) return "printing";
  if (value === "paused") return "paused";
  if (["standby", "queued"].includes(value)) return "standby";
  return value || "unknown";
}

function printStatusClassName(status: string | undefined) {
  return `gcode-status-badge ${normalizedPrintStatus(status)}`;
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

function parsePositiveInput(value: string) {
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : undefined;
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
    const cached = JSON.parse(preferences.getItem(heaterColorCacheKey) ?? "{}") as unknown;
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
  preferences.setItem(heaterColorCacheKey, JSON.stringify(colors));
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
    const cached = JSON.parse(preferences.getItem(heaterCacheKey) ?? "[]") as unknown;
    return Array.isArray(cached) ? cached.map(cachedHeater).filter((heater): heater is HeaterStatus => Boolean(heater)) : [];
  } catch {
    return [];
  }
}

function writeCachedHeaters(heaters: HeaterStatus[]) {
  if (typeof window === "undefined") return;
  preferences.setItem(heaterCacheKey, JSON.stringify(heaters.map(({ name, label, color }) => ({ name, label, color }))));
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

function KEditorAccentMark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="22 8 180 204" role="img" aria-label="K-Editor">
      <defs>
        <linearGradient id="keditorMarkShade" x1="48" y1="24" x2="176" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#566879" />
          <stop offset="1" stopColor="#202a34" />
        </linearGradient>
        <filter id="keditorSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000000" floodOpacity="0.28" />
        </filter>
      </defs>
      <g filter="url(#keditorSoftShadow)">
        <path fill="url(#keditorMarkShade)" d="M112 14 196 62v96l-84 48-84-48V62Z" />
        <path fill="#151b22" d="M112 30 181 70v80l-69 40-69-40V70Z" opacity="0.72" />
        <path fill="var(--accent)" d="M72 58h28v45l42-45h35l-50 52 54 58h-37l-44-50v50H72Z" />
        <path fill="#f2f6fb" d="M139 86h33v13h-33Zm-15 28h48v13h-48Zm15 28h33v13h-33Z" opacity="0.95" />
        <path fill="#78d6ff" d="M55 78 35 110l20 32h16l-20-32 20-32Zm114 0 20 32-20 32h-16l20-32-20-32Z" />
      </g>
    </svg>
  );
}

function KEditorAccentLogo({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 720 220" role="img" aria-label="K-Editor">
      <defs>
        <linearGradient id="keditorLogoMarkShade" x1="48" y1="24" x2="176" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#566879" />
          <stop offset="1" stopColor="#202a34" />
        </linearGradient>
        <filter id="keditorLogoSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000000" floodOpacity="0.28" />
        </filter>
      </defs>
      <g filter="url(#keditorLogoSoftShadow)">
        <path fill="url(#keditorLogoMarkShade)" d="M112 14 196 62v96l-84 48-84-48V62Z" />
        <path fill="#151b22" d="M112 30 181 70v80l-69 40-69-40V70Z" opacity="0.72" />
        <path fill="var(--accent)" d="M72 58h28v45l42-45h35l-50 52 54 58h-37l-44-50v50H72Z" />
        <path fill="#f2f6fb" d="M139 86h33v13h-33Zm-15 28h48v13h-48Zm15 28h33v13h-33Z" opacity="0.95" />
        <path fill="#78d6ff" d="M55 78 35 110l20 32h16l-20-32 20-32Zm114 0 20 32-20 32h-16l20-32-20-32Z" />
      </g>
      <g transform="translate(240 54)">
        <text x="0" y="68" fill="#f4f7fb" fontFamily="Segoe UI, Arial, sans-serif" fontSize="72" fontWeight="800">
          K-Editor
        </text>
        <text x="4" y="112" fill="#9fb0c0" fontFamily="Segoe UI, Arial, sans-serif" fontSize="28" fontWeight="700">
          Klipper config workspace
        </text>
      </g>
    </svg>
  );
}

function kEditorFaviconDataUrl(accent: string) {
  const safeAccent = normalizeCssColor(accent, "#7bff33");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="22 8 180 204"><defs><linearGradient id="markShade" x1="48" y1="24" x2="176" y2="180" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#566879"/><stop offset="1" stop-color="#202a34"/></linearGradient></defs><path fill="url(#markShade)" d="M112 14 196 62v96l-84 48-84-48V62Z"/><path fill="#151b22" d="M112 30 181 70v80l-69 40-69-40V70Z" opacity="0.72"/><path fill="${safeAccent}" d="M72 58h28v45l42-45h35l-50 52 54 58h-37l-44-50v50H72Z"/><path fill="#f2f6fb" d="M139 86h33v13h-33Zm-15 28h48v13h-48Zm15 28h33v13h-33Z" opacity="0.95"/><path fill="#78d6ff" d="M55 78 35 110l20 32h16l-20-32 20-32Zm114 0 20 32-20 32h-16l20-32-20-32Z"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function recolorSvg(svgText: string, color: string) {
  const safeColor = normalizeCssColor(color, "#7bff33");
  const cleanedSvg = svgText
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/\sfill=(["'])(?!none\b|transparent\b|url\()[^"']*\1/gi, ` fill="${safeColor}"`)
    .replace(/\sstroke=(["'])(?!none\b|transparent\b|url\()[^"']*\1/gi, ` stroke="${safeColor}"`)
    .replace(/fill:\s*(?!none\b|transparent\b|url\()[^;"'}]+/gi, `fill:${safeColor}`)
    .replace(/stroke:\s*(?!none\b|transparent\b|url\()[^;"'}]+/gi, `stroke:${safeColor}`);

  return cleanedSvg.replace(/<svg\b(?![^>]*xmlns=)/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

function maskFaviconDataUrl(svgText: string, accent: string) {
  return `data:image/svg+xml,${encodeURIComponent(recolorSvg(svgText, accent))}`;
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

const treeFileDragType = "application/x-keditor-file";

function collectTreeFilePaths(node: TreeNode): string[] {
  if (node.type === "file") return [node.path];
  return node.children?.flatMap((child) => collectTreeFilePaths(child)) ?? [];
}

function FileTree({
  nodes,
  activePath,
  openPaths,
  selectedPaths,
  onOpen,
  onDownload,
  onDelete,
  onRename,
  onToggleSelected,
  onToggleDirectorySelected,
  onMoveFile,
  onUploadFiles,
  downloadLabel,
  deleteLabel,
  renameLabel,
  selectLabel
}: {
  nodes: TreeNode[];
  activePath?: string;
  openPaths: Set<string>;
  selectedPaths: Set<string>;
  onOpen: (path: string) => void;
  onDownload: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string) => void;
  onToggleSelected: (path: string) => void;
  onToggleDirectorySelected: (paths: string[]) => void;
  onMoveFile: (path: string, targetDirectory: string) => void;
  onUploadFiles: (files: File[], targetDirectory: string) => void;
  downloadLabel: string;
  deleteLabel: string;
  renameLabel: string;
  selectLabel: string;
}) {
  const [dropActive, setDropActive] = useState(false);

  const handleRootDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDropActive(true);
    }
  };

  const handleRootDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    setDropActive(false);
    onUploadFiles(files, "");
  };

  return (
    <div
      className={`tree ${dropActive ? "drop-active" : ""}`}
      onDragOver={handleRootDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropActive(false);
        }
      }}
      onDrop={handleRootDrop}
    >
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
          onRename={onRename}
          onToggleSelected={onToggleSelected}
          onToggleDirectorySelected={onToggleDirectorySelected}
          onMoveFile={onMoveFile}
          onUploadFiles={onUploadFiles}
          downloadLabel={downloadLabel}
          deleteLabel={deleteLabel}
          renameLabel={renameLabel}
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
  onRename,
  onToggleSelected,
  onToggleDirectorySelected,
  onMoveFile,
  onUploadFiles,
  downloadLabel,
  deleteLabel,
  renameLabel,
  selectLabel
}: {
  node: TreeNode;
  activePath?: string;
  openPaths: Set<string>;
  selectedPaths: Set<string>;
  onOpen: (path: string) => void;
  onDownload: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string) => void;
  onToggleSelected: (path: string) => void;
  onToggleDirectorySelected: (paths: string[]) => void;
  onMoveFile: (path: string, targetDirectory: string) => void;
  onUploadFiles: (files: File[], targetDirectory: string) => void;
  downloadLabel: string;
  deleteLabel: string;
  renameLabel: string;
  selectLabel: string;
}) {
  const lowerNodeName = node.name.toLowerCase();
  const defaultOpen = node.type === "directory" && (lowerNodeName === "ratos" || lowerNodeName === "ratos_generated");
  const [expanded, setExpanded] = useState(defaultOpen);
  const [dropActive, setDropActive] = useState(false);
  const isDirectory = node.type === "directory";
  const isOpenFile = openPaths.has(node.path);
  const downloadOnly = isDownloadOnlyPath(node.path);
  const directoryFilePaths = isDirectory ? collectTreeFilePaths(node) : [];
  const selectedDirectoryFiles = directoryFilePaths.filter((path) => selectedPaths.has(path)).length;
  const directoryAllSelected = directoryFilePaths.length > 0 && selectedDirectoryFiles === directoryFilePaths.length;
  const directorySomeSelected = selectedDirectoryFiles > 0 && !directoryAllSelected;
  const directoryCheckboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (directoryCheckboxRef.current) {
      directoryCheckboxRef.current.indeterminate = directorySomeSelected;
    }
  }, [directorySomeSelected]);

  if (isDirectory) {
    const handleDirectoryDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
      const hasFileDrag = event.dataTransfer.types.includes(treeFileDragType);
      const hasExternalFiles = event.dataTransfer.types.includes("Files");
      if (!hasFileDrag && !hasExternalFiles) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = hasFileDrag ? "move" : "copy";
      setDropActive(true);
    };

    const handleDirectoryDrop = (event: ReactDragEvent<HTMLDivElement>) => {
      const draggedPath = event.dataTransfer.getData(treeFileDragType);
      const files = Array.from(event.dataTransfer.files ?? []);
      if (!draggedPath && files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setDropActive(false);
      setExpanded(true);
      if (draggedPath) {
        onMoveFile(draggedPath, node.path);
        return;
      }
      onUploadFiles(files, node.path);
    };

    return (
      <div
        onDragOver={handleDirectoryDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropActive(false);
          }
        }}
        onDrop={handleDirectoryDrop}
      >
        <div
          className={`tree-row directory-row ${dropActive ? "drop-target" : ""}`}
          title={`${node.path}\n${renameLabel}`}
          onContextMenu={(event) => {
            event.preventDefault();
            onRename(node.path);
          }}
        >
          <button className="tree-open-button" type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <FcExpand className="disclosure-icon" /> : <FcNext className="disclosure-icon" />}
            <MaterialIcon name={(expanded ? node.openIcon : node.icon) ?? "folder"} className="folder-type-icon" />
            <span>{node.name}</span>
          </button>
          <div className="tree-file-actions directory-actions">
            <button
              className="tree-action-button"
              type="button"
              title={renameLabel}
              aria-label={renameLabel}
              onClick={(event) => {
                event.stopPropagation();
                onRename(node.path);
              }}
            >
              <MdEdit className="tree-action-icon" />
            </button>
            <button
              className="tree-action-button danger"
              type="button"
              title={deleteLabel}
              aria-label={deleteLabel}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(node.path);
              }}
            >
              <MdDelete className="tree-action-icon" />
            </button>
          </div>
          <input
            ref={directoryCheckboxRef}
            className="tree-select-checkbox directory-select-checkbox"
            type="checkbox"
            checked={directoryAllSelected}
            disabled={directoryFilePaths.length === 0}
            title={selectLabel}
            aria-label={selectLabel}
            onChange={() => onToggleDirectorySelected(directoryFilePaths)}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
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
                onRename={onRename}
                onToggleSelected={onToggleSelected}
                onToggleDirectorySelected={onToggleDirectorySelected}
                onMoveFile={onMoveFile}
                onUploadFiles={onUploadFiles}
                downloadLabel={downloadLabel}
                deleteLabel={deleteLabel}
                renameLabel={renameLabel}
                selectLabel={selectLabel}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`tree-row file-row ${activePath === node.path ? "active" : ""}`}
      title={`${node.path}\n${renameLabel}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(treeFileDragType, node.path);
        event.dataTransfer.setData("text/plain", node.path);
        event.dataTransfer.effectAllowed = "move";
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onRename(node.path);
      }}
    >
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
          title={renameLabel}
          aria-label={renameLabel}
          onClick={() => onRename(node.path)}
        >
          <MdEdit className="tree-action-icon" />
        </button>
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
  return <PreferencesGate><Editor /></PreferencesGate>;
}

function Editor() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const [optionsTab, setOptionsTab] = useState<"general" | "home" | "theme" | "mcp" | "terminal">("general");
  const [homeWidgets, setHomeWidgets] = useState<HomeWidget[]>(defaultHomeWidgets);
  const [sensorStates, setSensorStates] = useState<SensorState[]>([]);
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [showEndstops, setShowEndstops] = useState(false);
  const [hiddenSensors, setHiddenSensors] = useState<Set<string>>(() => new Set());
  const [sensorSettingsOpen, setSensorSettingsOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [bedMeshOpen, setBedMeshOpen] = useState(false);
  const [bedMesh, setBedMesh] = useState<BedMeshDump | null>(null);
  const [bedMeshLoading, setBedMeshLoading] = useState(false);
  const [bedMeshAction, setBedMeshAction] = useState<string | null>(null);
  const [bedMeshPreviewName, setBedMeshPreviewName] = useState("__current__");
  const [bedMeshProfileName, setBedMeshProfileName] = useState("default");
  const [bedMeshShowProbed, setBedMeshShowProbed] = useState(true);
  const [bedMeshShowMesh, setBedMeshShowMesh] = useState(false);
  const [bedMeshShowFlat, setBedMeshShowFlat] = useState(false);
  const [bedMeshWireframe, setBedMeshWireframe] = useState(true);
  const [bedMeshScaleGradient, setBedMeshScaleGradient] = useState(false);
  const [bedMeshZScale, setBedMeshZScale] = useState(0.5);
  const [moveStep, setMoveStep] = useState(50);
  const [movingAction, setMovingAction] = useState<string | null>(null);
  const [positionInputs, setPositionInputs] = useState<Record<JogAxis, string>>({ x: "", y: "", z: "" });
  const [editingPositionAxis, setEditingPositionAxis] = useState<JogAxis | null>(null);
  const [selectedExtruder, setSelectedExtruder] = useState("");
  const [extrudeLength, setExtrudeLength] = useState("10");
  const [extrudeSpeed, setExtrudeSpeed] = useState("5");
  const [createBackupOnSave, setCreateBackupOnSave] = useState(true);
  const [heatersOpen, setHeatersOpen] = useState(false);
  const [heaters, setHeaters] = useState<HeaterStatus[]>([]);
  const [heaterTargets, setHeaterTargets] = useState<Record<string, string>>({});
  const [bulkExtruderTarget, setBulkExtruderTarget] = useState("");
  const [bulkBedTarget, setBulkBedTarget] = useState("");
  const [heatersLoading, setHeatersLoading] = useState(false);
  const [pidJob, setPidJob] = useState<{ id: string; heater: string } | null>(null);
  const pidBusyRef = useRef(false);
  const [pidMessage, setPidMessage] = useState("");
  const [pidOpen, setPidOpen] = useState(false);
  const [pidHeater, setPidHeater] = useState("");
  const [pidTarget, setPidTarget] = useState("");
  const [pidStarting, setPidStarting] = useState(false);
  const [pidSaving, setPidSaving] = useState(false);
  const [pidCompleted, setPidCompleted] = useState<{ id: string; heater: string } | null>(null);
  const [pidSamples, setPidSamples] = useState<PidSample[]>([]);
  const [settingHeaters, setSettingHeaters] = useState(false);
  const [auxiliariesOpen, setAuxiliariesOpen] = useState(false);
  const [auxiliaryControls, setAuxiliaryControls] = useState<AuxiliaryControl[]>([]);
  const [auxiliariesLoading, setAuxiliariesLoading] = useState(false);
  const [settingAuxiliary, setSettingAuxiliary] = useState<string | null>(null);
  const [macros, setMacros] = useState<MacroEntry[]>([]);
  const [macroTab, setMacroTab] = useState<MacroTab>("favorites");
  const [macroFavorites, setMacroFavorites] = useState<string[]>([]);
  const [macroSearch, setMacroSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [sectionsNavigating, setSectionsNavigating] = useState(false);
  const [sectionPreviewDelay, setSectionPreviewDelay] = useState(1);
  const [macrosLoading, setMacrosLoading] = useState(false);
  const [executingMacro, setExecutingMacro] = useState<string | null>(null);
  const [macroParameterTarget, setMacroParameterTarget] = useState<MacroEntry | null>(null);
  const [macroParameterValues, setMacroParameterValues] = useState<Record<string, string>>({});
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<SearchResult[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [updates, setUpdates] = useState<UpdateApp[]>([]);
  const [updatesBusy, setUpdatesBusy] = useState(false);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [runningUpdate, setRunningUpdate] = useState<string | null>(null);
  const [klipperConsoleOpen, setKlipperConsoleOpen] = useState(false);
  const [klipperConsoleInput, setKlipperConsoleInput] = useState("");
  const [klipperConsoleLog, setKlipperConsoleLog] = useState<KlipperConsoleEntry[]>([]);
  const [klipperGcodeStore, setKlipperGcodeStore] = useState<KlipperGcodeStoreEntry[]>([]);
  const [klipperConsoleClearedAt, setKlipperConsoleClearedAt] = useState(0);
  const [klipperGcodeStoreLoading, setKlipperGcodeStoreLoading] = useState(false);
  const [klipperConsoleTab, setKlipperConsoleTab] = useState<KlipperConsoleTab>("console");
  const [klipperConsoleFavorites, setKlipperConsoleFavorites] = useState<KlipperConsoleFavorite[]>([]);
  const [klipperFavoriteSearch, setKlipperFavoriteSearch] = useState("");
  const [sendingKlipperCommand, setSendingKlipperCommand] = useState(false);
  const [gcodesOpen, setGcodesOpen] = useState(false);
  const [printStatusOpen, setPrintStatusOpen] = useState(false);
  const [gcodeModalTab, setGcodeModalTab] = useState<GcodeModalTab>("files");
  const [gcodeSearch, setGcodeSearch] = useState("");
  const [gcodeFiles, setGcodeFiles] = useState<GcodeFileEntry[]>([]);
  const [gcodeHistory, setGcodeHistory] = useState<GcodeHistoryEntry[]>([]);
  const [selectedGcodeItem, setSelectedGcodeItem] = useState<SelectedGcodeItem | null>(null);
  const [gcodesLoading, setGcodesLoading] = useState(false);
  const [gcodesUploading, setGcodesUploading] = useState(false);
  const [gcodesDragActive, setGcodesDragActive] = useState(false);
  const [deletingGcodePath, setDeletingGcodePath] = useState<string | null>(null);
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
  const [terminalTabOpen, setTerminalTabOpen] = useState(false);
  const [terminalEnabled, setTerminalEnabled] = useState(false);
  const [terminalConfiguredEnabled, setTerminalConfiguredEnabled] = useState(false);
  const [terminalEnvEnabled, setTerminalEnvEnabled] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [terminalHistoryIndex, setTerminalHistoryIndex] = useState<number | null>(null);
  const [terminalCursor, setTerminalCursor] = useState(0);
  const [terminalAlive, setTerminalAlive] = useState(false);
  const [terminalMode, setTerminalMode] = useState<"basic" | "pty">("basic");
  const [ptySupported, setPtySupported] = useState(false);
  const [ptyActive, setPtyActive] = useState(false);
  const [terminalModeSaving, setTerminalModeSaving] = useState(false);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalWarning, setTerminalWarning] = useState<string | null>(null);
  const [terminalHeight, setTerminalHeight] = useState(238);
  const [mcpTunnel, setMcpTunnel] = useState<McpTunnelStatus>({
    running: false,
    starting: false,
    url: "",
    localUrl: "",
    token: "",
    error: "",
    log: []
  });
  const [mcpTunnelBusy, setMcpTunnelBusy] = useState(false);
  const [themeImporting, setThemeImporting] = useState(false);
  const [installingCloudflared, setInstallingCloudflared] = useState(false);
  const [cloudflaredInstalled, setCloudflaredInstalled] = useState<boolean | null>(null);
  const mcpUrlInputRef = useRef<HTMLInputElement>(null);
  const [mcpCopyMessage, setMcpCopyMessage] = useState("");
  const [cloudflaredInstallResult, setCloudflaredInstallResult] = useState("");
  const [xyRecorderEnabled, setXyRecorderEnabled] = useState(false);
  const [xyRecorderPanelOpen, setXyRecorderPanelOpen] = useState(false);
  const [xySnapshots, setXySnapshots] = useState<XySnapshot[]>([]);
  const [outlineWidth, setOutlineWidth] = useState(320);
  const [includePanelHeight, setIncludePanelHeight] = useState(240);
  const [sectionPreview, setSectionPreview] = useState<SectionPreview | null>(null);
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const includePanelRef = useRef<HTMLElement | null>(null);
  const previewOpenTimerRef = useRef<number | null>(null);
  const previewCloseTimerRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const gcodeUploadInputRef = useRef<HTMLInputElement | null>(null);
  const heatersRef = useRef<HeaterStatus[]>([]);
  const machinePowerMenuRef = useRef<HTMLDivElement | null>(null);
  const terminalOutputRef = useRef<HTMLPreElement | null>(null);
  const klipperConsoleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const reloadOpenTextFilesRef = useRef<(() => Promise<void>) | null>(null);
  const notifiedMcpTunnelUrlRef = useRef("");

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
  const macroFavoriteSet = useMemo(() => new Set(macroFavorites), [macroFavorites]);
  const favoriteMacros = useMemo(() => {
    const macroByName = new Map(macros.map((macro) => [macro.name, macro]));
    return macroFavorites.map((name) => macroByName.get(name)).filter((macro): macro is MacroEntry => Boolean(macro));
  }, [macroFavorites, macros]);
  const filteredFavoriteMacros = useMemo(() => {
    const query = macroSearch.trim().toLowerCase();
    if (!query) return favoriteMacros;

    return favoriteMacros.filter((macro) =>
      `${macro.name} ${macro.path} ${macro.title} ${macro.description ?? ""}`.toLowerCase().includes(query)
    );
  }, [favoriteMacros, macroSearch]);
  const visibleMacros = macroTab === "favorites" ? filteredFavoriteMacros : filteredMacros;
  const pendingUpdates = useMemo(
    () => updates.filter((update) => hasPendingUpdate(update)),
    [updates]
  );
  const anyHeaterActive = heaters.some((heater) => heater.target > 0);
  const extruderHeaters = useMemo(() => heaters.filter(isExtruderHeater), [heaters]);
  const bedHeaters = useMemo(() => heaters.filter(isBedHeater), [heaters]);
  const fanControls = useMemo(() => auxiliaryControls.filter((control) => control.type === "fan"), [auxiliaryControls]);
  const ledControls = useMemo(() => auxiliaryControls.filter((control) => control.type === "led"), [auxiliaryControls]);
  const homeWidgetSet = useMemo(() => new Set(homeWidgets), [homeWidgets]);
  const hasHomeWidgets = homeWidgets.length > 0;
  const visibleSensorStates = useMemo(
    () => sensorStates.filter((sensor) => !hiddenSensors.has(sensor.id) && (sensor.group !== "endstop" || showEndstops)),
    [hiddenSensors, sensorStates, showEndstops]
  );
  const currentPrintThumbnail = bestThumbnail(printerStatus?.printDetails.metadata?.thumbnails ?? []);
  const currentPrintThumbnailUrl = currentPrintThumbnail
    ? apiPath(`/api/printer/gcode-thumbnail?path=${encodeURIComponent(currentPrintThumbnail.relativePath)}`)
    : "";
  const bedMeshProfiles = bedMesh?.profiles ?? [];
  const previewBedMeshProfile = useMemo(() => {
    if (!bedMesh || bedMeshPreviewName === "__current__") return bedMesh?.current ?? null;
    return bedMesh.profiles.find((profile) => profile.name === bedMeshPreviewName) ?? bedMesh.current;
  }, [bedMesh, bedMeshPreviewName]);
  const previewBedMeshData = useMemo(
    () => meshDataFromProfile(previewBedMeshProfile, bedMeshShowMesh ? "mesh" : "probed"),
    [bedMeshShowMesh, previewBedMeshProfile]
  );
  const previewBedMeshStats = useMemo(() => meshStats(previewBedMeshData), [previewBedMeshData]);
  const latestXySnapshot = xySnapshots.at(-1);
  const latestGcodeHistoryByFilename = useMemo(() => {
    const jobsByFilename = new Map<string, GcodeHistoryEntry>();
    for (const job of gcodeHistory) {
      const filename = job.filename;
      const basenameKey = basename(filename);
      if (!jobsByFilename.has(filename)) jobsByFilename.set(filename, job);
      if (!jobsByFilename.has(basenameKey)) jobsByFilename.set(basenameKey, job);
    }
    return jobsByFilename;
  }, [gcodeHistory]);
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
  const favoriteScriptSet = useMemo(
    () => new Set(klipperConsoleFavorites.map((favorite) => favorite.script)),
    [klipperConsoleFavorites]
  );
  const filteredKlipperFavorites = useMemo(() => {
    const query = klipperFavoriteSearch.trim().toLowerCase();
    const favorites = [...klipperConsoleFavorites].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query) return favorites;

    return favorites.filter((favorite) => favorite.script.toLowerCase().includes(query));
  }, [klipperConsoleFavorites, klipperFavoriteSearch]);
  const klipperConsoleTimeline = useMemo<KlipperConsoleTimelineEntry[]>(() => {
    return [
      ...klipperGcodeStore
        .map((entry, index) => ({
          kind: "store" as const,
          id: `store-${entry.time}-${index}`,
          sortTime: entry.time > 0 ? entry.time * 1000 : 0,
          entry
        }))
        .filter((entry) => entry.sortTime > klipperConsoleClearedAt),
      ...klipperConsoleLog
        .map((entry) => ({
          kind: "history" as const,
          id: `history-${entry.id}`,
          sortTime: entry.createdAt,
          entry
        }))
        .filter((entry) => entry.sortTime > klipperConsoleClearedAt)
    ].sort((a, b) => b.sortTime - a.sortTime);
  }, [klipperConsoleClearedAt, klipperConsoleLog, klipperGcodeStore]);
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
  const showKEditorLogo = mainsailTheme.theme === "k-editor";
  const mainsailLogoUrl = showKEditorLogo
    ? "/img/k-editor-mark.svg"
    : mainsailTheme.logoPath
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
  const printStatusLabel = useCallback(
    (status: string | undefined) => {
      const normalized = normalizedPrintStatus(status);
      const key = `gcodes.status${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
      const label = t(key);
      return label === key ? status || t("gcodes.statusUnknown") : label;
    },
    [t]
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

  const closeUnsavedDialog = useCallback((title: string, message: string) => {
    return new Promise<UnsavedCloseChoice>((resolve) => {
      setDialog({ type: "unsaved-close", title, message, resolve });
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
    } else if (dialog.type === "unsaved-close") {
      dialog.resolve("cancel");
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
    } else if (dialog.type === "unsaved-close") {
      dialog.resolve("save");
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
    preferences.setItem("ratos-viewer-locale", payload.code ?? code);
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
    setMacroTab("favorites");
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

      setGcodeFiles([...(payload.files ?? [])].sort((a, b) => b.modified - a.modified));
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

  const loadBedMesh = useCallback(async () => {
    setBedMeshLoading(true);

    try {
      const response = await fetch(apiPath("/api/printer/bed-mesh"), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.loadBedMesh"));
      setBedMesh(payload);
      setBedMeshPreviewName((current) => {
        if (current === "__current__") return current;
        return payload.profiles?.some((profile: BedMeshProfile) => profile.name === current) ? current : "__current__";
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.loadBedMesh"));
    } finally {
      setBedMeshLoading(false);
    }
  }, [t]);

  const openBedMeshModal = useCallback(() => {
    setBedMeshOpen(true);
    void loadBedMesh();
  }, [loadBedMesh]);

  const runBedMeshAction = useCallback(
    async (action: string, profile?: string) => {
      if (bedMeshAction) return;
      if (printerStatus?.printing || printerStatus?.printState === "paused") {
        setMessage(t("errors.bedMeshPrinting"));
        return;
      }

      const profileName = profile?.trim();
      const confirmationKey =
        action === "calibrate" ? "confirm.bedMeshCalibrate"
          : action === "clear" ? "confirm.bedMeshClear"
            : action === "save-config" ? "confirm.bedMeshSaveConfig"
              : "";
      if (confirmationKey && !(await confirmDialog(t("bedMesh.title"), t(confirmationKey)))) return;

      setBedMeshAction(action);

      try {
        const response = await fetch(apiPath("/api/printer/bed-mesh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, profile: profileName })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.bedMeshAction"));
        setBedMesh(payload.mesh ?? null);
        if (action === "load" && profileName) setBedMeshPreviewName(profileName);
        setMessage(t("status.bedMeshActionDone"));
        if (action === "save-config") setPrinterInitializing(true);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.bedMeshAction"));
      } finally {
        setBedMeshAction(null);
      }
    },
    [bedMeshAction, confirmDialog, printerStatus?.printState, printerStatus?.printing, t]
  );

  const uploadGcodeFiles = useCallback(
    async (files: File[]) => {
      const gcodeUploads = files.filter((file) => file.name.toLowerCase().endsWith(".gcode"));
      if (gcodeUploads.length === 0) {
        setMessage(t("gcodes.uploadOnlyGcode"));
        return;
      }

      setGcodesUploading(true);
      setGcodeModalTab("files");

      try {
        for (const file of gcodeUploads) {
          setMessage(t("status.uploading", { path: file.name }));
          const formData = new FormData();
          formData.append("file", file);

          const response = await fetch(apiPath("/api/printer/gcodes/upload"), {
            method: "POST",
            body: formData
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? t("errors.uploadFile"));
        }

        await loadGcodes();
        setMessage(t("status.uploaded", { path: gcodeUploads.map((file) => file.name).join(", ") }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.uploadFile"));
      } finally {
        setGcodesUploading(false);
        setGcodesDragActive(false);
      }
    },
    [loadGcodes, t]
  );

  const uploadGcodesFromInput = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await uploadGcodeFiles(files);
    },
    [uploadGcodeFiles]
  );

  const loadUpdates = useCallback(
    async (refresh = false) => {
      setUpdatesLoading(true);
      setMessage(t("status.loadingUpdates"));
      setUpdatesBusy(false);
      setUpdates([]);

      try {
        const response = await fetch(apiPath(`/api/updates?refresh=${refresh ? "1" : "0"}&t=${Date.now()}`), {
          cache: "no-store"
        });
        const payload = (await response.json()) as { busy?: boolean; versionInfo?: UpdateApp[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? t("errors.loadUpdates"));

        setUpdatesBusy(Boolean(payload.busy));
        setUpdates(payload.versionInfo ?? []);
        setMessage(t("status.updatesLoaded"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.loadUpdates"));
      } finally {
        setUpdatesLoading(false);
      }
    },
    [t]
  );

  const openUpdatesModal = useCallback(() => {
    setUpdatesOpen(true);
    void loadUpdates(false);
  }, [loadUpdates]);

  const runUpdate = useCallback(
    async (update?: UpdateApp) => {
      if (runningUpdate || updatesBusy) return;
      if (printerStatus?.printing) {
        setMessage(t("errors.updatePrinting"));
        return;
      }

      const title = update ? t("actions.updateComponent") : t("actions.updateAll");
      const message = update
        ? t("confirm.updateComponent", { name: update.name })
        : t("confirm.updateAll");
      if (!(await confirmDialog(title, message))) return;

      const updateId = update?.name ?? "all";
      setRunningUpdate(updateId);
      setMessage(t("status.updateStarted"));

      try {
        const response = await fetch(apiPath("/api/updates"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            update
              ? { action: "component", name: update.name, configuredType: update.configuredType }
              : { action: "full" }
          )
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.runUpdate"));
        await loadUpdates(true);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.runUpdate"));
      } finally {
        setRunningUpdate(null);
      }
    },
    [confirmDialog, loadUpdates, printerStatus?.printing, runningUpdate, t, updatesBusy]
  );

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
      return nextStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.printerStatus");
      const nextStatus = normalizePrinterStatus({ error: message }, t("errors.printerStatus"));
      setPrinterStatus(nextStatus);
      return nextStatus;
    }
  }, [t]);

  const saveEditorTheme = useCallback((nextTheme: MainsailVisualTheme) => {
    const normalized = normalizeEditorTheme(nextTheme);
    setMainsailTheme(normalized);
    preferences.setItem(useAccentLogoKey, String(normalized.theme === "k-editor"));
    preferences.setItem(themePreferenceKey, JSON.stringify(normalized));
  }, []);

  const importMainsailTheme = useCallback(async () => {
    setThemeImporting(true);
    try {
      const response = await fetch(apiPath("/api/mainsail/theme"), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load Mainsail theme");

      const imported = normalizeEditorTheme({
        mode: typeof payload.mode === "string" ? payload.mode : fallbackMainsailTheme.mode,
        theme: typeof payload.theme === "string" ? payload.theme : fallbackMainsailTheme.theme,
        logo: typeof payload.logo === "string" ? payload.logo : fallbackMainsailTheme.logo,
        primary: typeof payload.primary === "string" ? payload.primary : fallbackMainsailTheme.primary,
        logoPath: typeof payload.logoPath === "string" ? payload.logoPath : null,
        logoUrl: typeof payload.logoUrl === "string" ? payload.logoUrl : null,
        logoMask: Boolean(payload.logoMask),
        error: typeof payload.error === "string" ? payload.error : undefined
      });
      saveEditorTheme(imported);
      setMessage(t("status.themeImported"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.importTheme"));
    } finally {
      setThemeImporting(false);
    }
  }, [saveEditorTheme, t]);

  const loadTerminalStatus = useCallback(async () => {
    try {
      const response = await fetch(apiPath("/api/terminal/status"), { cache: "no-store" });
      const payload = (await response.json()) as {
        enabled?: boolean;
        configuredEnabled?: boolean;
        envEnabled?: boolean;
        shell?: string;
        terminalMode?: "basic" | "pty";
        ptySupported?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? t("errors.terminalConnection"));

      const enabled = Boolean(payload.enabled);
      setTerminalEnabled(enabled);
      setTerminalMode(payload.terminalMode === "pty" ? "pty" : "basic");
      setPtySupported(Boolean(payload.ptySupported));
      setTerminalConfiguredEnabled(Boolean(payload.configuredEnabled));
      setTerminalEnvEnabled(Boolean(payload.envEnabled));
      setTerminalError(enabled ? null : t("errors.terminalDisabled"));
      return enabled;
    } catch (error) {
      setTerminalEnabled(false);
      setTerminalConfiguredEnabled(false);
      setTerminalEnvEnabled(false);
      setTerminalError(error instanceof Error ? error.message : t("errors.terminalConnection"));
      return false;
    }
  }, [t]);

  const normalizeMcpTunnelStatus = useCallback((payload: Partial<McpTunnelStatus>): McpTunnelStatus => {
    return {
      running: Boolean(payload.running),
      starting: Boolean(payload.starting),
      url: typeof payload.url === "string" ? payload.url : "",
      localUrl: typeof payload.localUrl === "string" ? payload.localUrl : "",
      token: typeof payload.token === "string" ? payload.token : "",
      error: typeof payload.error === "string" ? payload.error : "",
      log: Array.isArray(payload.log) ? payload.log.filter((entry): entry is string => typeof entry === "string") : []
    };
  }, []);

  const loadMcpTunnelStatus = useCallback(async () => {
    try {
      const response = await fetch(apiPath("/api/mcp-tunnel"), { cache: "no-store" });
      const payload = (await response.json()) as Partial<McpTunnelStatus> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? t("errors.mcpTunnel"));

      const nextStatus = normalizeMcpTunnelStatus(payload);
      setMcpTunnel(nextStatus);
      if (typeof payload.cloudflaredInstalled === "boolean") setCloudflaredInstalled(payload.cloudflaredInstalled);
      return nextStatus;
    } catch (error) {
      const nextError = error instanceof Error ? error.message : t("errors.mcpTunnel");
      setMcpTunnel((current) => ({ ...current, error: nextError }));
      return undefined;
    }
  }, [normalizeMcpTunnelStatus, t]);

  const startMcpTunnel = useCallback(async () => {
    if (installingCloudflared) return;
    setMcpTunnelBusy(true);
    setMessage(t("status.mcpTunnelStarting"));

    try {
      const response = await fetch(apiPath("/api/mcp-tunnel"), { method: "POST" });
      const payload = (await response.json()) as Partial<McpTunnelStatus> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? t("errors.mcpTunnel"));

      const nextStatus = normalizeMcpTunnelStatus(payload);
      setMcpTunnel(nextStatus);
      setMessage(nextStatus.url ? t("status.mcpTunnelReady") : t("status.mcpTunnelStarting"));
    } catch (error) {
      const nextError = error instanceof Error ? error.message : t("errors.mcpTunnel");
      setMcpTunnel((current) => ({ ...current, error: nextError }));
      setMessage(nextError);
    } finally {
      setMcpTunnelBusy(false);
    }
  }, [installingCloudflared, normalizeMcpTunnelStatus, t]);

  const stopMcpTunnel = useCallback(async () => {
    setMcpTunnelBusy(true);

    try {
      const response = await fetch(apiPath("/api/mcp-tunnel"), { method: "DELETE" });
      const payload = (await response.json()) as Partial<McpTunnelStatus> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? t("errors.mcpTunnel"));

      setMcpTunnel(normalizeMcpTunnelStatus(payload));
      setMessage(t("status.mcpTunnelStopped"));
    } catch (error) {
      const nextError = error instanceof Error ? error.message : t("errors.mcpTunnel");
      setMcpTunnel((current) => ({ ...current, error: nextError }));
      setMessage(nextError);
    } finally {
      setMcpTunnelBusy(false);
    }
  }, [normalizeMcpTunnelStatus, t]);

  const copyMcpTunnelUrl = useCallback(async () => {
    if (!mcpTunnel.url) return;
    let copied = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(mcpTunnel.url);
        copied = true;
      }
    } catch { /* Fall back to selecting the visible URL on local HTTP. */ }
    if (!copied && mcpUrlInputRef.current) {
      mcpUrlInputRef.current.focus();
      mcpUrlInputRef.current.select();
      mcpUrlInputRef.current.setSelectionRange(0, mcpTunnel.url.length);
      try { copied = document.execCommand("copy"); } catch { copied = false; }
    }
    const feedback = t(copied ? "status.mcpTunnelUrlCopied" : "mcp.copyFailed");
    setMcpCopyMessage(feedback);
    setMessage(feedback);
  }, [mcpTunnel.url, t]);

  useEffect(() => { setMcpCopyMessage(""); }, [mcpTunnel.url]);

  const startTerminalSession = useCallback(async () => {
    if (terminalMode !== "basic") return undefined;
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
  }, [applyTerminalPayload, loadTerminalStatus, t, terminalAlive, terminalEnabled, terminalSessionId, terminalMode]);

  const updateTerminalEnabledSetting = useCallback(
    async (enabled: boolean) => {
      if (enabled && !(await confirmDialog(t("actions.enableTerminal"), t("confirm.enableTerminal")))) return;

      try {
        const response = await fetch(apiPath("/api/terminal/settings"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terminalEnabled: enabled })
        });
        const payload = (await response.json()) as {
          terminalEnabled?: boolean;
          configuredTerminalEnabled?: boolean;
          envTerminalEnabled?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? t("errors.terminalConnection"));

        setTerminalConfiguredEnabled(Boolean(payload.configuredTerminalEnabled));
        setTerminalEnvEnabled(Boolean(payload.envTerminalEnabled));
        setTerminalEnabled(Boolean(payload.terminalEnabled));
        setTerminalError(payload.terminalEnabled ? null : t("errors.terminalDisabled"));
        setMessage(t("status.terminalSettingSaved"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.terminalConnection"));
        void loadTerminalStatus();
      }
    },
    [confirmDialog, loadTerminalStatus, t]
  );

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

    if (terminalTabOpen) {
      setActivePath(terminalTabPath);
      return;
    }

    setTerminalOpen(true);
    const enabled = terminalEnabled || (await loadTerminalStatus());
    if (enabled && terminalMode === "basic" && !terminalSessionId) {
      await startTerminalSession();
    }
  }, [loadTerminalStatus, startTerminalSession, terminalEnabled, terminalOpen, terminalSessionId, terminalMode, terminalTabOpen]);

  const openTerminalTab = useCallback(() => {
    setTerminalTabOpen(true);
    setTerminalOpen(false);
    setActivePath(terminalTabPath);
  }, []);

  const closeTerminalTab = useCallback(() => {
    setTerminalTabOpen(false);
    setActivePath((current) => current === terminalTabPath ? openFiles.at(-1)?.path : current);
  }, [openFiles]);

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

  const changeTerminalMode = useCallback(async (mode: "basic" | "pty") => {
    if (mode === terminalMode || terminalModeSaving) return;
    if ((terminalAlive || ptyActive || terminalBusy) && !(await confirmDialog(t("pty.mode"), t("pty.changeConfirm")))) return;
    setTerminalModeSaving(true);
    try {
      const response = await fetch(apiPath("/api/terminal/settings"), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalMode: mode })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setTerminalOpen(false);
      setTerminalSessionId(null);
      setTerminalAlive(false);
      setTerminalOutput("");
      setTerminalCursor(0);
      setTerminalMode(mode);
      setMessage(t("status.terminalSettingSaved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setTerminalModeSaving(false); }
  }, [terminalMode, terminalModeSaving, terminalAlive, ptyActive, terminalBusy, confirmDialog, t]);

  const rememberTerminalCommand = useCallback((command: string) => {
    setTerminalHistory((current) => {
      const withoutDuplicateTail = current.at(-1) === command ? current : [...current, command];
      const nextHistory = withoutDuplicateTail.slice(-80);
      preferences.setItem(terminalHistoryKey, JSON.stringify(nextHistory));
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

  const loadKlipperGcodeStore = useCallback(
    async (showError = false) => {
      setKlipperGcodeStoreLoading((current) => current || klipperGcodeStore.length === 0);

      try {
        const response = await fetch(apiPath("/api/printer/gcode-store?count=120"), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.gcodeStore"));
        setKlipperGcodeStore(((payload.entries ?? []) as KlipperGcodeStoreEntry[]).slice().reverse());
      } catch (error) {
        if (showError) {
          setMessage(error instanceof Error ? error.message : t("errors.gcodeStore"));
        }
      } finally {
        setKlipperGcodeStoreLoading(false);
      }
    },
    [klipperGcodeStore.length, t]
  );

  const editKlipperConsoleCommand = useCallback((script: string) => {
    setKlipperConsoleInput(script);
    window.setTimeout(() => {
      klipperConsoleInputRef.current?.focus();
      klipperConsoleInputRef.current?.select();
    }, 0);
  }, []);

  const toggleKlipperFavorite = useCallback((script: string) => {
    const normalizedScript = script.trim();
    if (!normalizedScript) return;

    setKlipperConsoleFavorites((current) => {
      const exists = current.some((favorite) => favorite.script === normalizedScript);
      const next = exists
        ? current.filter((favorite) => favorite.script !== normalizedScript)
        : [{ script: normalizedScript, updatedAt: Date.now() }, ...current.filter((favorite) => favorite.script !== normalizedScript)];
      writeKlipperConsoleFavorites(next);
      return next;
    });
  }, []);

  const sendKlipperScript = useCallback(
    async (scriptInput: string, clearInput = false) => {
      const script = scriptInput.trim();
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
          [createConsoleEntry(script, "sent", String(payload.result ?? t("status.gcodeSent"))), ...current].slice(0, 80)
        );
        if (clearInput) {
          setKlipperConsoleInput("");
        }
        setMessage(t("status.gcodeSent"));
        await loadKlipperGcodeStore();
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
    [loadKlipperGcodeStore, loadPrinterStatus, loadTree, sendingKlipperCommand, t]
  );

  const sendKlipperConsoleCommand = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      await sendKlipperScript(klipperConsoleInput, true);
    },
    [klipperConsoleInput, sendKlipperScript]
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
        if (pidOpen || pidJob) {
          const selected = nextHeaters.find((heater) => heater.name === (pidJob?.heater ?? pidHeater));
          if (selected) setPidSamples((samples) => [...samples, { time: Date.now(), temperature: selected.temperature, target: selected.target, power: selected.power }].slice(-2400));
        }
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
    [cacheAndSetHeaters, pidOpen, pidJob, pidHeater, t]
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

  const updateAuxiliaryControlLocal = useCallback((name: string, patch: Partial<AuxiliaryControl>) => {
    setAuxiliaryControls((controls) =>
      controls.map((control) => control.name === name ? { ...control, ...patch } : control)
    );
  }, []);

  const loadAuxiliaryControls = useCallback(
    async (showError = false) => {
      setAuxiliariesLoading(true);
      setMessage(t("status.loadingAuxiliaries"));

      try {
        const response = await fetch(apiPath("/api/printer/auxiliary"), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.loadAuxiliaries"));

        const controls = Array.isArray(payload.controls) ? payload.controls as AuxiliaryControl[] : [];
        setAuxiliaryControls(controls);
        setMessage(t("status.auxiliariesRefreshed"));
        return controls;
      } catch (error) {
        if (showError) {
          setMessage(error instanceof Error ? error.message : t("errors.loadAuxiliaries"));
        }
        return undefined;
      } finally {
        setAuxiliariesLoading(false);
      }
    },
    [t]
  );

  const homeWidgetLabel = useCallback(
    (widget: HomeWidget) => {
      if (widget === "macros") return t("homeGrid.widgetMacros");
      if (widget === "console") return t("homeGrid.widgetConsole");
      if (widget === "sensors") return t("homeGrid.widgetSensors");
      return t("homeGrid.widgetMovement");
    },
    [t]
  );

  const toggleHomeWidget = useCallback((widget: HomeWidget) => {
    setHomeWidgets((current) => {
      const next = current.includes(widget)
        ? current.filter((item) => item !== widget)
        : [...current, widget].filter((item, index, array) => array.indexOf(item) === index);
      writeHomeWidgets(next);
      return next;
    });
  }, []);

  const loadSensorStates = useCallback(async (withEndstops = showEndstops) => {
    setSensorsLoading(true);
    try {
      const response = await fetch(apiPath(`/api/printer/sensors?endstops=${withEndstops ? "1" : "0"}`), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.loadSensors"));
      const next = Array.isArray(payload.sensors) ? payload.sensors as SensorState[] : [];
      setSensorStates(next);
      return next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.loadSensors"));
      return [];
    } finally {
      setSensorsLoading(false);
    }
  }, [showEndstops, t]);

  const updateShowEndstops = useCallback((visible: boolean) => {
    setShowEndstops(visible);
    preferences.setItem(sensorShowEndstopsKey, String(visible));
    void loadSensorStates(visible);
  }, [loadSensorStates]);

  const toggleSensorVisibility = useCallback((id: string) => {
    setHiddenSensors((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      preferences.setItem(sensorHiddenKey, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const openAuxiliariesModal = useCallback(async () => {
    setAuxiliariesOpen(true);
    await loadAuxiliaryControls(true);
  }, [loadAuxiliaryControls]);

  const setAuxiliaryControl = useCallback(
    async (control: AuxiliaryControl, patch: Partial<Pick<AuxiliaryControl, "value" | "color">>) => {
      if (!control.controllable || settingAuxiliary) return;

      const nextValue = Math.min(Math.max(Number(patch.value ?? control.value), 0), 1);
      const nextColor = patch.color ?? control.color;
      updateAuxiliaryControlLocal(control.name, { value: nextValue, color: nextColor });
      setSettingAuxiliary(control.name);
      setMessage(t("status.settingAuxiliary", { name: control.label }));

      try {
        const response = await fetch(apiPath("/api/printer/auxiliary"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: control.name, value: nextValue, color: nextColor })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.setAuxiliary", { name: control.label }));

        if (Array.isArray(payload.controls)) {
          setAuxiliaryControls(payload.controls as AuxiliaryControl[]);
        }
        setMessage(t("status.auxiliarySet", { name: control.label }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.setAuxiliary", { name: control.label }));
        await loadAuxiliaryControls(false);
      } finally {
        setSettingAuxiliary(null);
      }
    },
    [loadAuxiliaryControls, settingAuxiliary, t, updateAuxiliaryControlLocal]
  );

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

  const restartFirmware = useCallback(async (confirmFirst = true) => {
    if (restartingFirmware) return;
    if (!printerStatus) {
      setMessage(t("errors.printerStatus"));
      return;
    }

    if (printerStatus.printing) {
      setMessage(t("errors.restartPrinting"));
      return;
    }

    if (confirmFirst && !(await confirmDialog(t("actions.restartFirmware"), t("confirm.restartFirmware")))) return;

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

      if (printerStatus.printing && payload.action !== "z-offset") {
        setMessage(t("errors.restartPrinting"));
        return;
      }

      if (payload.action !== "z-offset" && !printerStatus.allAxesHomed) {
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

  const runExtrusion = useCallback(
    async (direction: "extrude" | "retract") => {
      if (movingAction) return;
      if (!printerStatus || printerStatus.error) {
        setMessage(printerStatus?.error ?? t("errors.printerStatus"));
        return;
      }

      if (printerStatus.printing) {
        setMessage(t("errors.restartPrinting"));
        return;
      }

      const length = parsePositiveInput(extrudeLength);
      const speed = parsePositiveInput(extrudeSpeed);
      const extruder = printerStatus.extruders.find((item) => item.name === selectedExtruder);

      if (!extruder || length === undefined || speed === undefined) {
        setMessage(t("errors.extrudeFilament"));
        return;
      }

      const distance = direction === "extrude" ? length : -length;
      const label = `${extruder.label} ${formatSigned(distance)}`;
      setMovingAction(label);
      setMessage(t("status.extruding", { move: label }));

      try {
        const response = await fetch(apiPath("/api/printer/extrude"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extruder: extruder.name, distance, speed })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? t("errors.extrudeFilament"));

        if (body.status) {
          setPrinterStatus(body.status);
        } else {
          await loadPrinterStatus();
        }
        setMessage(t("status.extruded"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.extrudeFilament"));
      } finally {
        setMovingAction(null);
      }
    },
    [extrudeLength, extrudeSpeed, loadPrinterStatus, movingAction, printerStatus, selectedExtruder, t]
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

  const setHeaterGroupTargetValues = useCallback((group: HeaterStatus[], value: string) => {
    const normalizedValue = value.trim();
    if (group.length === 0) return;

    setHeaterTargets((targets) => ({
      ...targets,
      ...Object.fromEntries(group.map((heater) => [heater.name, normalizedValue]))
    }));
  }, []);

  const submitHeaters = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (settingHeaters || pidBusyRef.current) return;

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
        setMessage(t("status.heatersSet"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.setHeaters"));
      } finally {
        setSettingHeaters(false);
      }
    },
    [cacheAndSetHeaters, heaterTargets, heaters, setHeaterTargetInputs, settingHeaters, t]
  );

  const coolAllHeaters = async () => {
    if (settingHeaters) return;
    setSettingHeaters(true);
    try {
      const response = await fetch(apiPath("/api/printer/gcode"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: "TURN_OFF_HEATERS" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setHeaterTargets(Object.fromEntries(heaters.map((heater) => [heater.name, "0"])));
      await loadHeaters();
    } catch (error) {
      setPidMessage(String(error));
    } finally {
      setSettingHeaters(false);
    }
  };

  const calibratePid = async (heater: HeaterStatus) => {
    if (pidBusyRef.current || settingHeaters) return;
    const target = Number(pidTarget);
    if (!Number.isFinite(target) || target <= 0 || target > 350) return;
    pidBusyRef.current = true;
    setPidStarting(true);
    setPidCompleted(null);
    setPidSamples([]);
    setPidMessage(t("heaters.pidRunning", { heater: heater.label }));
    try {
      const response = await fetch(apiPath("/api/printer/pid"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heater: heater.name, target })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setPidJob(payload.job);
    } catch (error) {
      pidBusyRef.current = false;
      setPidMessage(String(error));
    } finally {
      setPidStarting(false);
    }
  };

  useEffect(() => {
    if (!pidJob) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(apiPath("/api/printer/pid"), { cache: "no-store" });
        const payload = await response.json();
        if (disposed) return;
        if (!response.ok) throw new Error(payload.error);
        if (!payload.job || payload.job.id !== pidJob.id) throw new Error("PID: session lost; completion could not be confirmed.");
        if (payload.job.state === "running") {
          timer = setTimeout(() => void poll(), 2000);
          return;
        }
        if (payload.job.state === "error") throw new Error(payload.job.error);
        setPidMessage(t("pid.complete"));
        setPidCompleted(pidJob);
      } catch (error) {
        setPidMessage(String(error));
        setPrinterInitializing(false);
      }
      pidBusyRef.current = false;
      setPidJob(null);
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [pidJob, t]);

  const savePid = async () => {
    if (!pidCompleted || pidSaving || pidBusyRef.current) return;
    setPidSaving(true);
    try {
      const response = await fetch(apiPath("/api/printer/pid"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", id: pidCompleted.id })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setPidCompleted(null);
      setPidMessage(t("pid.saved"));
      setPrinterInitializing(true);
      await loadPrinterStatus();
    } catch (error) { setPidMessage(String(error)); }
    finally { setPidSaving(false); }
  };

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

  const saveFile = useCallback(
    async (fileToSave: OpenFile) => {
      if (fileToSave.kind === "image" || fileToSave.saving || fileToSave.loading) return false;

      setOpenFiles((files) => files.map((file) => (file.path === fileToSave.path ? { ...file, saving: true } : file)));
      setMessage(t("status.saving", { path: fileToSave.path }));

      try {
        const response = await fetch(apiPath("/api/file"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: fileToSave.path, content: fileToSave.content, createBackup: createBackupOnSave })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.saveFile"));

        setOpenFiles((files) =>
          files.map((file) =>
            file.path === fileToSave.path
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
            ? t("status.savedWithBackup", { path: fileToSave.path, backupPath: payload.backupPath })
            : t("status.saved", { path: fileToSave.path })
        );
        return true;
      } catch (error) {
        setOpenFiles((files) =>
          files.map((file) =>
            file.path === fileToSave.path
              ? { ...file, saving: false, error: error instanceof Error ? error.message : t("errors.saveGeneric") }
              : file
          )
        );
        setMessage(error instanceof Error ? error.message : t("errors.saveGeneric"));
        return false;
      }
    },
    [createBackupOnSave, t]
  );

  const saveActiveFile = useCallback(async () => {
    if (!activeFile) return;
    await saveFile(activeFile);
  }, [activeFile, saveFile]);

  const closeFile = useCallback(
    async (path: string) => {
      const file = openFiles.find((item) => item.path === path);
      if (
        file &&
        file.kind !== "image" &&
        file.content !== file.savedContent
      ) {
        const choice = await closeUnsavedDialog(t("actions.close"), t("confirm.closeUnsaved", { path }));
        if (choice === "cancel") return;
        if (choice === "save" && !(await saveFile(file))) return;
      }

      const nextFiles = openFiles.filter((item) => item.path !== path);
      setOpenFiles(nextFiles);
      if (activePath === path) {
        setActivePath(nextFiles.at(-1)?.path);
      }
    },
    [activePath, closeUnsavedDialog, openFiles, saveFile, t]
  );

  const closeAllFiles = useCallback(async () => {
    const keepOpen = new Set<string>();

    for (const file of openFiles) {
      if (file.kind === "image" || file.content === file.savedContent) continue;

      const choice = await closeUnsavedDialog(t("actions.close"), t("confirm.closeUnsaved", { path: file.path }));
      if (choice === "cancel") return;
      if (choice === "save" && !(await saveFile(file))) {
        keepOpen.add(file.path);
      }
    }

    const nextFiles = openFiles.filter((file) => keepOpen.has(file.path));
    setOpenFiles(nextFiles);
    setActivePath(nextFiles.at(-1)?.path);
  }, [closeUnsavedDialog, openFiles, saveFile, t]);

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

  const toggleSelectedTreeDirectory = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    setSelectedTreeFiles((current) => {
      const next = new Set(current);
      const allSelected = paths.every((path) => next.has(path));
      for (const path of paths) {
        if (allSelected) {
          next.delete(path);
        } else {
          next.add(path);
        }
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

        const deletedIsDirectory = payload.type === "directory";
        const nextFiles = openFiles.filter((file) =>
          deletedIsDirectory ? file.path !== path && !file.path.startsWith(`${path}/`) : file.path !== path
        );
        setOpenFiles(nextFiles);
        if (activePath === path || (deletedIsDirectory && activePath?.startsWith(`${path}/`))) {
          setActivePath(nextFiles.at(-1)?.path);
        }
        setSelectedTreeFiles((current) => {
          const next = new Set(current);
          for (const selectedPath of current) {
            if (selectedPath === path || (deletedIsDirectory && selectedPath.startsWith(`${path}/`))) {
              next.delete(selectedPath);
            }
          }
          return next;
        });
        await loadTree();
        setMessage(t("status.deleted", { path }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.deleteFile"));
      }
    },
    [activePath, confirmDialog, loadTree, openFiles, t]
  );

  const renameFile = useCallback(
    async (path: string) => {
      const requestedPath = await promptDialog(t("prompt.renameFilePath"), path);
      if (!requestedPath) return;

      const newPath = requestedPath.trim().replaceAll("\\", "/").replace(/^\/+/, "");
      if (!newPath || newPath === path) return;

      try {
        const response = await fetch(apiPath("/api/file"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, newPath })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.renameFile"));

        const renamedPath = payload.newPath ?? newPath;
        const renamedIsDirectory = payload.type === "directory";
        const remapPath = (candidate: string) =>
          renamedIsDirectory && candidate.startsWith(`${path}/`)
            ? `${renamedPath}${candidate.slice(path.length)}`
            : candidate === path
              ? renamedPath
              : candidate;

        setOpenFiles((files) =>
          files.map((file) => {
            const nextPath = remapPath(file.path);
            return nextPath !== file.path
              ? {
                  ...file,
                  path: nextPath,
                  modifiedAt: payload.modifiedAt ?? file.modifiedAt
                }
              : file;
          })
        );
        if (activePath) {
          setActivePath(remapPath(activePath));
        }
        setSelectedTreeFiles((current) => {
          const next = new Set(current);
          for (const selectedPath of current) {
            const nextPath = remapPath(selectedPath);
            if (nextPath !== selectedPath) {
              next.delete(selectedPath);
              next.add(nextPath);
            }
          }
          return next;
        });
        await loadTree();
        setMessage(t("status.renamed", { path, newPath: renamedPath }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.renameFile"));
      }
    },
    [activePath, loadTree, promptDialog, t]
  );

  const moveFileToDirectory = useCallback(
    async (path: string, targetDirectory: string) => {
      const cleanDirectory = targetDirectory.replace(/\/+$/, "");
      const newPath = cleanDirectory ? `${cleanDirectory}/${basename(path)}` : basename(path);
      if (!newPath || newPath === path || dirname(path) === cleanDirectory) return;

      try {
        const response = await fetch(apiPath("/api/file"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, newPath })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.renameFile"));

        const movedPath = payload.newPath ?? newPath;
        setOpenFiles((files) =>
          files.map((file) =>
            file.path === path
              ? {
                  ...file,
                  path: movedPath,
                  modifiedAt: payload.modifiedAt ?? file.modifiedAt
                }
              : file
          )
        );
        if (activePath === path) {
          setActivePath(movedPath);
        }
        setSelectedTreeFiles((current) => {
          if (!current.has(path)) return current;
          const next = new Set(current);
          next.delete(path);
          next.add(movedPath);
          return next;
        });
        await loadTree();
        setMessage(t("status.renamed", { path, newPath: movedPath }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.renameFile"));
      }
    },
    [activePath, loadTree, t]
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

  const uploadFilesToDirectory = useCallback(
    async (files: File[], targetDirectory = activeDirectory) => {
      if (files.length === 0) return;

      const uploadedPaths: string[] = [];
      const cleanDirectory = targetDirectory.replace(/\/+$/, "");

      for (const file of files) {
        const targetPath = cleanDirectory ? `${cleanDirectory}/${file.name}` : file.name;
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

  const uploadFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await uploadFilesToDirectory(files);
    },
    [uploadFilesToDirectory]
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

  const runMacro = useCallback(
    async (macro: MacroEntry, parameters: Record<string, string> = {}) => {
      if (executingMacro) return;

      setExecutingMacro(macro.name);
      setMessage(t("status.executingMacro", { name: macro.name }));

      try {
        const response = await fetch(apiPath("/api/printer/run-macro"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: macro.name, parameters })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? t("errors.executeMacro"));

        setMessage(t("status.executedMacro", { name: macro.name }));
        await loadPrinterStatus();
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t("errors.executeMacro"));
        return false;
      } finally {
        setExecutingMacro(null);
      }
    },
    [executingMacro, loadPrinterStatus, t]
  );

  const executeMacro = useCallback(
    async (macro: MacroEntry) => {
      if (executingMacro) return;
      if (macro.parameters.length > 0) {
        setMacroParameterValues(Object.fromEntries(macro.parameters.map((parameter) => [parameter.name, ""])));
        setMacroParameterTarget(macro);
        return;
      }
      if (!(await confirmDialog(t("actions.executeMacro"), t("confirm.executeMacro", { name: macro.name })))) return;
      await runMacro(macro);
    },
    [confirmDialog, executingMacro, runMacro, t]
  );

  const submitMacroParameters = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!macroParameterTarget || executingMacro) return;
    const parameters = Object.fromEntries(
      macroParameterTarget.parameters
        .map((parameter) => [parameter.name, (macroParameterValues[parameter.name] ?? "").trim()] as const)
        .filter(([, value]) => value !== "")
    );
    const completed = await runMacro(macroParameterTarget, parameters);
    if (completed) setMacroParameterTarget(null);
  }, [executingMacro, macroParameterTarget, macroParameterValues, runMacro]);

  const toggleMacroFavorite = useCallback((macro: MacroEntry) => {
    setMacroFavorites((current) => {
      const exists = current.includes(macro.name);
      const next = exists ? current.filter((name) => name !== macro.name) : [macro.name, ...current.filter((name) => name !== macro.name)];
      writeMacroFavorites(next);
      return next;
    });
  }, []);

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

  const deleteSelectedGcode = useCallback(async () => {
    if (!selectedGcodeItem || selectedGcodeItem.type !== "file" || deletingGcodePath) return;
    if (printerStatus?.printing) {
      setMessage(t("errors.restartPrinting"));
      return;
    }

    const filename = selectedGcodeItem.item.path;
    if (!(await confirmDialog(t("actions.deleteFile"), t("confirm.deleteFile", { path: filename })))) return;

    setDeletingGcodePath(filename);

    try {
      const response = await fetch(apiPath("/api/printer/gcodes/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("errors.deleteFile"));

      setSelectedGcodeItem(null);
      await loadGcodes();
      setMessage(t("status.deleted", { path: filename }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.deleteFile"));
    } finally {
      setDeletingGcodePath(null);
    }
  }, [confirmDialog, deletingGcodePath, loadGcodes, printerStatus?.printing, selectedGcodeItem, t]);

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

  const clearPreviewOpenTimer = useCallback(() => {
    if (previewOpenTimerRef.current) {
      window.clearTimeout(previewOpenTimerRef.current);
      previewOpenTimerRef.current = null;
    }
  }, []);

  const schedulePreviewClose = useCallback(() => {
    clearPreviewOpenTimer();
    clearPreviewCloseTimer();
    previewCloseTimerRef.current = window.setTimeout(() => setSectionPreview(null), 180);
  }, [clearPreviewCloseTimer, clearPreviewOpenTimer]);

  const scheduleSectionPreview = useCallback(
    (section: ConfigSection, event: ReactMouseEvent<HTMLElement>) => {
      clearPreviewOpenTimer();
      clearPreviewCloseTimer();
      const previewWidth = 560;
      const previewHeight = 380;
      const maxLeft = Math.max(14, window.innerWidth - previewWidth - 14);
      const maxTop = Math.max(14, window.innerHeight - previewHeight - 14);
      const left = clamp(event.clientX - previewWidth - 18, 14, maxLeft);
      const top = clamp(event.clientY - 28, 14, maxTop);

      previewOpenTimerRef.current = window.setTimeout(
        () => setSectionPreview({ section, left, top }),
        Math.max(0, sectionPreviewDelay) * 1000
      );
    },
    [clearPreviewCloseTimer, clearPreviewOpenTimer, sectionPreviewDelay]
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
        preferences.setItem(terminalHeightKey, String(Math.round(latestHeight)));
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
    if (!printerStatus?.printing || !currentPrintThumbnailUrl) return;

    const image = new window.Image();
    image.decoding = "async";
    image.src = currentPrintThumbnailUrl;
  }, [currentPrintThumbnailUrl, printerStatus?.printing]);

  useEffect(() => {
    let cancelled = false;

    const savedBackupPreference = preferences.getItem("klipper-editor-create-backup-on-save");
    if (savedBackupPreference !== null) {
      setCreateBackupOnSave(savedBackupPreference === "true");
    }

    const savedHideBackupFiles = preferences.getItem(hideBackupFilesKey);
    if (savedHideBackupFiles !== null) {
      setHideBackupFiles(savedHideBackupFiles === "true");
    }

    const savedTerminalHeight = Number(preferences.getItem(terminalHeightKey));
    if (Number.isFinite(savedTerminalHeight) && savedTerminalHeight > 0) {
      setTerminalHeight(clamp(savedTerminalHeight, 140, maxTerminalHeight(window.innerHeight)));
    }

    const savedSectionPreviewDelay = Number(preferences.getItem(sectionPreviewDelayKey));
    if (Number.isFinite(savedSectionPreviewDelay) && savedSectionPreviewDelay >= 0) {
      setSectionPreviewDelay(clamp(savedSectionPreviewDelay, 0, 10));
    }

    setSidebarCollapsed(preferences.getItem(sidebarCollapsedKey) === "true");
    setHomeWidgets(readHomeWidgets());
    setShowEndstops(preferences.getItem(sensorShowEndstopsKey) === "true");
    try {
      const savedHiddenSensors = JSON.parse(preferences.getItem(sensorHiddenKey) ?? "[]") as unknown;
      if (Array.isArray(savedHiddenSensors)) {
        setHiddenSensors(new Set(savedHiddenSensors.filter((id): id is string => typeof id === "string")));
      }
    } catch {
      setHiddenSensors(new Set());
    }
    const hasStoredTheme = preferences.getItem(themePreferenceKey) !== null;
    const storedTheme = hasStoredTheme
      ? readStoredEditorTheme()
      : preferences.getItem(useAccentLogoKey) === "true"
        ? normalizeEditorTheme({ ...fallbackMainsailTheme, theme: "k-editor", logoUrl: "/img/k-editor-mark.svg", logoMask: false })
        : fallbackMainsailTheme;
    setMainsailTheme(storedTheme);
    if (!hasStoredTheme && storedTheme.theme === "k-editor") {
      preferences.setItem(themePreferenceKey, JSON.stringify(storedTheme));
    }

    try {
      const savedTerminalHistory = JSON.parse(preferences.getItem(terminalHistoryKey) ?? "[]") as unknown;
      if (Array.isArray(savedTerminalHistory)) {
        setTerminalHistory(savedTerminalHistory.filter((entry): entry is string => typeof entry === "string").slice(-80));
      }
    } catch {
      preferences.removeItem(terminalHistoryKey);
    }

    setKlipperConsoleFavorites(readKlipperConsoleFavorites());
    setMacroFavorites(readMacroFavorites());

    async function loadLocales() {
      try {
        const response = await fetch(apiPath("/api/locales"), { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load locales");

        const apiLocales = (payload.locales ?? []) as LocaleOption[];
        const nextLocales = apiLocales.length > 0 ? apiLocales : bundledLocaleOptions();
        if (cancelled) return;

        setLocales(nextLocales);
        const savedLocale = preferences.getItem("ratos-viewer-locale");
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
          const savedLocale = preferences.getItem("ratos-viewer-locale");
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
    if (!klipperConsoleOpen && (activeFile || !homeWidgetSet.has("console"))) return;

    void loadKlipperGcodeStore(true);
    const interval = window.setInterval(() => void loadKlipperGcodeStore(), 2000);
    return () => window.clearInterval(interval);
  }, [klipperConsoleOpen, activeFile, homeWidgetSet, loadKlipperGcodeStore]);

  useEffect(() => {
    if (!activeFile && homeWidgetSet.has("macros")) void loadMacros();
  }, [activeFile, homeWidgetSet, loadMacros]);

  useEffect(() => {
    const homeVisible = activePath === homeTabPath || (!activePath && !activeFile);
    if (!homeVisible || !homeWidgetSet.has("sensors")) return;
    void loadSensorStates();
    const interval = window.setInterval(() => void loadSensorStates(), 5000);
    return () => window.clearInterval(interval);
  }, [activeFile, activePath, homeWidgetSet, loadSensorStates]);

  useEffect(() => {
    loadTree().catch((error) => setMessage(error instanceof Error ? error.message : t("errors.loadTree")));
  }, [loadTree]);

  useEffect(() => {
    void loadTerminalStatus();
  }, [loadTerminalStatus]);

  useEffect(() => {
    void loadMcpTunnelStatus();
  }, [loadMcpTunnelStatus]);

  useEffect(() => {
    if (!optionsOpen && !mcpTunnel.starting) return;

    const interval = window.setInterval(() => void loadMcpTunnelStatus(), 2000);
    return () => window.clearInterval(interval);
  }, [loadMcpTunnelStatus, mcpTunnel.starting, optionsOpen]);

  useEffect(() => {
    if (!mcpTunnel.url) {
      notifiedMcpTunnelUrlRef.current = "";
      return;
    }

    if (notifiedMcpTunnelUrlRef.current === mcpTunnel.url) return;
    notifiedMcpTunnelUrlRef.current = mcpTunnel.url;
    setMessage(`${t("status.mcpTunnelReady")}: ${mcpTunnel.url}`);
  }, [mcpTunnel.url, t]);

  useEffect(() => {
    let cancelled = false;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='shortcut icon']"));
    const faviconLinks = links.length > 0 ? links : [document.createElement("link")];

    const applyFavicon = (href: string) => {
      if (cancelled) return;
      for (const link of faviconLinks) {
        link.rel = link.rel || "icon";
        link.type = "image/svg+xml";
        link.href = href;
        if (!link.parentNode) document.head.appendChild(link);
      }
    };

    if (showKEditorLogo) {
      applyFavicon(kEditorFaviconDataUrl(mainsailTheme.primary));
      return () => {
        cancelled = true;
      };
    }

    if (mainsailLogoUrl && mainsailTheme.logoMask) {
      applyFavicon(mainsailLogoUrl);
      void fetch(mainsailLogoUrl)
        .then((response) => response.ok ? response.text() : Promise.reject(new Error(response.statusText)))
        .then((svgText) => applyFavicon(maskFaviconDataUrl(svgText, mainsailTheme.primary)))
        .catch(() => applyFavicon(mainsailLogoUrl));
      return () => {
        cancelled = true;
      };
    }

    applyFavicon(mainsailLogoUrl ?? apiPath("/img/k-editor-mark.svg"));
    return () => {
      cancelled = true;
    };
  }, [mainsailLogoUrl, mainsailTheme.logoMask, mainsailTheme.primary, showKEditorLogo]);

  useEffect(() => {
    void loadPrinterStatus();
    const interval = window.setInterval(() => void loadPrinterStatus(), 5000);
    return () => window.clearInterval(interval);
  }, [loadPrinterStatus]);

  useEffect(() => {
    if (!xyRecorderEnabled) return;

    let cancelled = false;
    let timer: number | null = null;

    const capture = async () => {
      const status = await loadPrinterStatus();
      if (cancelled) return;

      if (status.printing && status.printState === "printing") {
        const suggestedIntervalMs = suggestedXySnapshotInterval(status.speed);
        setXySnapshots((current) => {
          const next = [
            ...current,
            {
              timestamp: Date.now(),
              filename: status.filename,
              layer: status.printDetails.info.currentLayer,
              x: status.position.x,
              y: status.position.y,
              z: status.position.z,
              speed: status.speed,
              activeExtruder: status.activeExtruder,
              filePosition: status.printDetails.filePosition,
              suggestedIntervalMs,
              excludeObject: status.excludeObject
            }
          ];
          return next.slice(-1000);
        });
        timer = window.setTimeout(capture, suggestedIntervalMs);
        return;
      }

      timer = window.setTimeout(capture, 1000);
    };

    void capture();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [loadPrinterStatus, xyRecorderEnabled]);

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

  const extruderListKey = printerStatus?.extruders.map((extruder) => extruder.name).join("|") ?? "";

  useEffect(() => {
    if (!printerStatus?.extruders.length) {
      setSelectedExtruder("");
      return;
    }

    setSelectedExtruder((current) =>
      printerStatus.extruders.some((extruder) => extruder.name === current) ? current : printerStatus.extruders[0].name
    );
  }, [extruderListKey, printerStatus]);

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
    if ((!terminalOpen && !terminalTabOpen) || !terminalSessionId || terminalMode !== "basic") return;

    void pollTerminalSession();
    const interval = window.setInterval(() => void pollTerminalSession(), 1000);
    return () => window.clearInterval(interval);
  }, [pollTerminalSession, terminalOpen, terminalSessionId, terminalMode, terminalTabOpen]);

  useEffect(() => {
    if (!terminalOpen && !terminalTabOpen) return;
    const output = terminalOutputRef.current;
    if (!output) return;
    output.scrollTop = output.scrollHeight;
  }, [terminalOpen, terminalOutput, terminalTabOpen]);

  useEffect(() => {
    const clampTerminalToViewport = () => {
      setTerminalHeight((current) => {
        const nextHeight = clamp(current, 140, maxTerminalHeight(window.innerHeight));
        if (nextHeight !== current) {
          preferences.setItem(terminalHeightKey, String(Math.round(nextHeight)));
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
      if (event.target instanceof Element && event.target.closest(".pty-terminal")) return;
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

  const activeFilePath = activeFile?.path;

  const editorExtensions = useMemo(() => {
    if (!activeFilePath) return [];
    const extensions = [fileLanguage(activeFilePath), ...editorLinkExtension(activeFilePath, resolveAndOpenInclude)];
    if (isCfgPath(activeFilePath)) {
      extensions.push(syntaxHighlighting(klipperHighlightStyle));
    }

    return extensions;
  }, [activeFilePath, resolveAndOpenInclude]);

  const quickCommandDisabled =
    runningQuickCommand !== null || !printerStatus || Boolean(printerStatus.error) || printerStatus.printing;
  const movementDisabled =
    movingAction !== null ||
    !printerStatus ||
    Boolean(printerStatus.error) ||
    printerStatus.printing ||
    !printerStatus.allAxesHomed;
  const offsetDisabled = movingAction !== null || !printerStatus || Boolean(printerStatus.error);
  const movementPanelDisabled = movingAction !== null || !printerStatus || Boolean(printerStatus.error);
  const extrusionDisabled =
    movingAction !== null ||
    !printerStatus ||
    Boolean(printerStatus.error) ||
    printerStatus.printing ||
    printerStatus.extruders.length === 0 ||
    !selectedExtruder;
  const machinePowerDisabled =
    runningMachinePowerAction !== null || !printerStatus || Boolean(printerStatus.error) || printerStatus.printing;
  const powerMenuDisabled = restartingFirmware || runningMachinePowerAction !== null || !printerStatus;
  const showPrinterInitializing = printerInitializing || isPrinterInitializingStatus(printerStatus);
  const printerInitializingState = printerStatus?.webhooksState?.trim() || "unknown";
  const printerInitializingMessage = printerStatus?.webhooksMessage?.trim() || printerStatus?.error || "";
  const canRestartFromInitializing = Boolean(printerStatus) && !printerStatus?.printing && !restartingFirmware;

  return (
    <main className={sidebarCollapsed ? "workspace-shell sidebar-collapsed" : "workspace-shell"} style={themeStyle}>
      {showPrinterInitializing && (
        <div className="printer-initializing-overlay" role="status" aria-live="polite">
          <div className="printer-initializing-card">
            <div className="printer-initializing-title">
              <IoPower className="printer-initializing-icon" />
              <span>{t("status.printerInitializing")}</span>
            </div>
            <div className="printer-initializing-bar" />
            <div className="printer-initializing-status">
              <strong>{t("status.printerReported", { state: printerInitializingState.toUpperCase() })}</strong>
              {printerInitializingMessage && <p>{printerInitializingMessage}</p>}
            </div>
            <button
              className="printer-initializing-action"
              type="button"
              disabled={!canRestartFromInitializing}
              onClick={() => void restartFirmware(false)}
            >
              <FcRefresh className="printer-initializing-action-icon" />
              <span>{restartingFirmware ? t("actions.restartingFirmware") : t("actions.restartFirmwareLong")}</span>
            </button>
          </div>
        </div>
      )}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div
              className={showKEditorLogo ? "sidebar-brand-logo keditor-brand-logo" : "sidebar-brand-logo"}
              title={showKEditorLogo ? t("app.title") : mainsailTheme.theme}
            >
              {showKEditorLogo ? (
                <KEditorAccentMark className="sidebar-theme-logo sidebar-keditor-logo" />
              ) : mainsailLogoUrl && mainsailTheme.logoMask ? (
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
                preferences.setItem(hideBackupFilesKey, String(nextValue));
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
          onRename={renameFile}
          onToggleSelected={toggleSelectedTreeFile}
          onToggleDirectorySelected={toggleSelectedTreeDirectory}
          onMoveFile={(path, targetDirectory) => void moveFileToDirectory(path, targetDirectory)}
          onUploadFiles={(files, targetDirectory) => void uploadFilesToDirectory(files, targetDirectory)}
          downloadLabel={t("actions.downloadFile")}
          deleteLabel={t("actions.deleteFile")}
          renameLabel={t("actions.renameFile")}
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
          <div className="open-editors-header">
            <div className="panel-title">{t("panels.openEditors")}</div>
            {openFiles.length > 0 && (
              <button
                className="open-editors-close-all"
                type="button"
                title={t("actions.closeAllEditors")}
                aria-label={t("actions.closeAllEditors")}
                onClick={() => void closeAllFiles()}
              >
                <IoClose className="open-editors-close-all-icon" />
              </button>
            )}
          </div>
          {openFiles.length === 0 ? (
            <p className="empty-note">{t("empty.openFile")}</p>
          ) : (
            openFiles.map((file) => (
              <div
                key={file.path}
                className={`open-editor-row ${file.path === activePath ? "active" : ""}`}
                title={file.path}
              >
                <button className="open-editor" type="button" onClick={() => setActivePath(file.path)}>
                  <FileIcon path={file.path} icon={iconByPath.get(file.path)} />
                  <span>{basename(file.path)}</span>
                  {file.kind !== "image" && file.content !== file.savedContent && <Icon className="open-dot">*</Icon>}
                </button>
                <button
                  className="open-editor-download"
                  type="button"
                  title={t("actions.downloadFile")}
                  aria-label={t("actions.downloadFile")}
                  onClick={() => downloadFile(file.path)}
                >
                  <FcDownload className="open-editor-action-icon" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className={terminalOpen ? "editor-area terminal-open" : "editor-area"}>
        <div className="topbar">
          <div className="quick-toolbar">
            <div className="toolbar-group primary-tool-group">
              <button
                className="icon-button sidebar-toggle-button"
                type="button"
                onClick={() => {
                  const nextValue = !sidebarCollapsed;
                  setSidebarCollapsed(nextValue);
                  preferences.setItem(sidebarCollapsedKey, String(nextValue));
                }}
                title={sidebarCollapsed ? t("actions.expandSidebar") : t("actions.collapseSidebar")}
                aria-label={sidebarCollapsed ? t("actions.expandSidebar") : t("actions.collapseSidebar")}
                aria-pressed={sidebarCollapsed}
              >
                <MdiIcon
                  className="action-icon plain-action-icon"
                  path={sidebarCollapsed ? mdiArrowCollapseRight : mdiArrowCollapseLeft}
                  size={1}
                />
              </button>
              <button className="macro-button" type="button" onClick={openMacrosModal} title={t("actions.macros")}>
                <MdFunctions className="macro-button-icon" />
                <span className="toolbar-label">{t("actions.macros")}</span>
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
            </div>
            <div className="home-actions">
              <button
                className="home-button"
                type="button"
                disabled={quickCommandDisabled}
                title={t("actions.homeAll")}
                onClick={() => void runQuickCommand("home-all", t("actions.homeAll"))}
              >
                <MdHome className="home-button-icon" />
                <span className="toolbar-label">All</span>
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
                  <span className="toolbar-label">Z Tilt</span>
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
              <button
                className="home-button bed-mesh-open-button"
                type="button"
                title={t("actions.bedMesh")}
                aria-label={t("actions.bedMesh")}
                onClick={openBedMeshModal}
              >
                <MdGridOn className="home-button-icon" />
              </button>
              <button
                className="home-button auxiliaries-open-button"
                type="button"
                title={t("actions.auxiliaries")}
                aria-label={t("actions.auxiliaries")}
                onClick={() => void openAuxiliariesModal()}
              >
                <MdiIcon className="home-button-icon" path={mdiFan} size={1} />
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
                <span className="toolbar-label">Hot</span>
              </button>
              <div className="heater-indicators" aria-label={t("heaters.title")}>
                {heaters.filter((heater) => heater.target > 0).slice(0, 4).map((heater) => (
                  <button
                    key={heater.name}
                    className={heater.target > 0 ? "heater-indicator active" : "heater-indicator"}
                    type="button"
                    title={t("actions.coolHeater", { heater: heater.label })}
                    aria-label={t("actions.coolHeater", { heater: heater.label })}
                    disabled={settingHeaters}
                    onClick={() => void coolHeater(heater)}
                  >
                    <HeaterTypeIcon
                      heater={heater}
                      className="heater-indicator-icon"
                      style={{ color: heater.color ?? "#7fd4ff" }}
                    />
                    <span>
                      {heater.label} {formatCompactTemperature(heater.temperature)}
                      {heater.target > 0 ? ` / ${heaterCompactTargetLabel(heater)}` : ""}
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
            <button className="icon-button" type="button" onClick={openUpdatesModal} title={t("actions.updates")}>
              <FcRefresh className="action-icon" />
            </button>
            <button className="icon-button" type="button" onClick={() => setOptionsOpen(true)} title={t("actions.options")}>
              <FcSettings className="action-icon" />
            </button>
            <button
              className={terminalOpen || terminalTabOpen ? "icon-button active-toggle" : "icon-button"}
              type="button"
              onClick={() => void toggleTerminal()}
              title={terminalOpen ? t("actions.closeTerminal") : t("actions.openTerminal")}
              aria-label={terminalOpen ? t("actions.closeTerminal") : t("actions.openTerminal")}
              aria-pressed={terminalOpen || terminalTabOpen}
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
              className="emergency-button"
              type="button"
              title={t("actions.emergencyStop")}
              aria-label={t("actions.emergencyStop")}
              disabled={emergencyStopping}
              onClick={() => void triggerEmergencyStop()}
            >
              <BsSignStopFill className="emergency-button-icon" />
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
              <span className="toolbar-label">{activeFile?.saving ? t("actions.saving") : t("actions.save")}</span>
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
                <span className="toolbar-label">
                  {restartingFirmware ? t("actions.restartingFirmware") : t("actions.restartFirmware")}
                </span>
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
          <button
            className={`home-tab-button ${activePath === homeTabPath || (!activePath && !activeFile) ? "active" : ""}`}
            type="button"
            onClick={() => setActivePath(homeTabPath)}
            title={t("homeGrid.openHome")}
            aria-label={t("homeGrid.openHome")}
            aria-pressed={activePath === homeTabPath || (!activePath && !activeFile)}
          >
            <MdGridOn />
          </button>
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
          {terminalTabOpen && (
            <button
              className={`tab ${activePath === terminalTabPath ? "active" : ""}`}
              type="button"
              onClick={() => setActivePath(terminalTabPath)}
              title={t("panels.terminal")}
            >
              <MdTerminal className="action-icon plain-action-icon" />
              <span>{t("panels.terminal")}</span>
              <span
                className="tab-close"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTerminalTab();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeTerminalTab();
                  }
                }}
                aria-label={t("tabs.closeLabel", { path: t("panels.terminal") })}
              >
                x
              </span>
            </button>
          )}
        </div>

        <div className="editor-panel">
          {activePath === terminalTabPath && terminalTabOpen ? (
            <div className="terminal-tab-view">
              {terminalMode === "pty" ? <PtyTerminal endpoint={apiPath("/api/terminal/pty")} enabled={terminalEnabled} supported={ptySupported}
                onClose={closeTerminalTab} onActive={setPtyActive}
                labels={{ connect: t("actions.connectTerminal"), disconnect: t("actions.disconnectTerminal"), connected: t("status.terminalConnected"),
                  disconnected: t("status.terminalDisconnected"), connecting: t("pty.connecting"), close: t("actions.closeTerminal"), expand: t("actions.openTerminalTab"),
                  disabled: t("errors.terminalDisabled"), unsupported: t("pty.unsupported"), http: t("pty.http") }} /> : <>
                <div className="terminal-header">
                  <div className="terminal-title">
                    <MdTerminal className="terminal-title-icon" />
                    <span>{t("panels.terminal")}</span>
                    <small>{terminalAlive ? t("status.terminalConnected") : t("status.terminalDisconnected")}</small>
                  </div>
                  <div className="terminal-actions">
                    <button className="terminal-button" type="button" disabled={terminalBusy || terminalAlive} onClick={() => void startTerminalSession()}>{t("actions.connectTerminal")}</button>
                    <button className="terminal-button" type="button" disabled={terminalBusy || !terminalSessionId} onClick={() => void disconnectTerminal()}>{t("actions.disconnectTerminal")}</button>
                    <button className="terminal-icon-button" type="button" title={t("actions.closeTerminal")} aria-label={t("actions.closeTerminal")} onClick={closeTerminalTab}>
                      <IoClose className="terminal-close-icon" />
                    </button>
                  </div>
                </div>
                <div className={terminalWarning ? "terminal-warning" : "terminal-warning hidden"} role="status">{terminalWarning}</div>
                <pre ref={terminalOutputRef} className="terminal-output">{terminalOutput || terminalError || t("empty.terminal")}</pre>
                <form className="terminal-input-row" onSubmit={submitTerminalCommand}>
                  <span className="terminal-prompt">$</span>
                  <input value={terminalInput} disabled={!terminalEnabled || terminalBusy} spellCheck={false} autoCapitalize="off" autoComplete="off"
                    onChange={(event) => { setTerminalInput(event.target.value); setTerminalHistoryIndex(null); }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") { setTerminalInput(""); setTerminalHistoryIndex(null); return; }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        if (terminalHistory.length === 0) return;
                        const nextIndex = terminalHistoryIndex === null ? terminalHistory.length - 1 : Math.max(0, terminalHistoryIndex - 1);
                        setTerminalHistoryIndex(nextIndex); setTerminalInput(terminalHistory[nextIndex] ?? ""); return;
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        if (terminalHistory.length === 0 || terminalHistoryIndex === null) return;
                        const nextIndex = terminalHistoryIndex + 1;
                        if (nextIndex >= terminalHistory.length) { setTerminalHistoryIndex(null); setTerminalInput(""); return; }
                        setTerminalHistoryIndex(nextIndex); setTerminalInput(terminalHistory[nextIndex] ?? "");
                      }
                    }} />
                  <button className="terminal-button primary" type="submit" disabled={!terminalEnabled || terminalBusy || !terminalInput.trim()}>{t("actions.runTerminalCommand")}</button>
                </form>
              </>}
            </div>
          ) : !activeFile ? (hasHomeWidgets ? (
            <div className="home-grid">
              {homeWidgets.map((widget) => (
                <section className={`home-widget home-widget-${widget}`} key={widget}>
                  <header className="home-widget-header">
                    <h2>{homeWidgetLabel(widget)}</h2>
                    <button className="modal-icon-button" type="button" title={widget === "sensors" ? t("actions.refresh") : t("homeGrid.openFull")}
                      aria-label={widget === "sensors" ? t("actions.refresh") : t("homeGrid.openFull")}
                      disabled={widget === "sensors" && sensorsLoading}
                      onClick={() => widget === "macros" ? openMacrosModal() : widget === "console" ? setKlipperConsoleOpen(true) : widget === "movement" ? setMovementOpen(true) : void loadSensorStates()}>
                      {widget === "sensors" ? <FcRefresh className="action-icon" /> : <MdOpenInFull className="action-icon" />}
                    </button>
                  </header>
                  <div className="home-widget-body">
                    {widget === "macros" ? (
                      <div className="home-macro-list">
                        {favoriteMacros.length === 0 && <p className="empty-note">{t("macros.emptyFavorites")}</p>}
                        {favoriteMacros.map((macro) => (
                          <div className="home-macro-item" key={macro.name}>
                            <span className="home-macro-name" title={macro.name}>{macro.name}</span>
                            <button className="home-macro-run" type="button" title={t("actions.executeMacro")} aria-label={`${t("actions.executeMacro")}: ${macro.name}`}
                              disabled={Boolean(executingMacro) || !printerStatus || Boolean(printerStatus.error)} onClick={() => void executeMacro(macro)}>
                              <FaPlay className="action-icon" />
                              {macro.parameters.length > 0 && <span className="home-macro-parameter-badge">{macro.parameters.length}</span>}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : widget === "console" ? (
                      <>
                        <div className="home-console-log" role="log" aria-label={t("panels.klipperConsole")}>
                          {klipperConsoleTimeline.slice(0, 30).map((item) => (
                            <div className="home-console-entry" key={item.id}>
                              {item.kind === "store" ? <KlipperStoreMessage message={item.entry.message} /> : <pre>{`${item.entry.script}\n${item.entry.message}`}</pre>}
                            </div>
                          ))}
                        </div>
                        <form className="home-console-form" onSubmit={sendKlipperConsoleCommand}>
                          <input aria-label={t("panels.klipperConsole")} value={klipperConsoleInput} placeholder="G-code" spellCheck={false}
                            onChange={(event) => setKlipperConsoleInput(event.target.value)} />
                          <button className="modal-icon-button" type="submit" disabled={sendingKlipperCommand || !klipperConsoleInput.trim()} title={t("homeGrid.send")} aria-label={t("homeGrid.send")}><MdSend /></button>
                        </form>
                        <div className="home-console-favorites">
                          {klipperConsoleFavorites.map((favorite) => (
                            <button key={favorite.script} type="button" className="dialog-button" title={favorite.script} disabled={sendingKlipperCommand}
                              onClick={() => void sendKlipperScript(favorite.script)}>{favorite.script}</button>
                          ))}
                        </div>
                      </>
                    ) : widget === "movement" ? (
                      <>
                        <div className="home-position-strip">
                          {(["x", "y", "z"] as const).map((axis) => <span key={axis}>{axis.toUpperCase()} <strong>{printerStatus ? formatPosition(printerStatus.position[axis]) : "--"}</strong></span>)}
                        </div>
                        <div className="home-jog-controls">
                          <div className="jog-pad xy-pad">
                            {([
                              ["x", -1, "left", MdKeyboardArrowLeft], ["y", 1, "up", MdKeyboardArrowUp],
                              ["x", 1, "right", MdKeyboardArrowRight], ["y", -1, "down", MdKeyboardArrowDown]
                            ] as const).map(([axis, direction, placement, Icon]) => (
                              <button key={placement} type="button" className={`jog-button jog-${placement}`} disabled={movementDisabled}
                                title={`${axis.toUpperCase()} ${formatSigned(direction * moveStep)}`} aria-label={`${axis.toUpperCase()} ${formatSigned(direction * moveStep)}`}
                                onClick={() => void runMove({ action: "jog", axis, distance: direction * moveStep }, `${axis.toUpperCase()} ${formatSigned(direction * moveStep)}`)}><Icon className="jog-icon" /></button>
                            ))}
                          </div>
                          <div className="home-z-controls"><span>Z</span>{([1, -1] as const).map((direction) => (
                            <button key={direction} className="jog-button" type="button" disabled={movementDisabled} title={`Z ${formatSigned(direction * moveStep)}`} aria-label={`Z ${formatSigned(direction * moveStep)}`}
                              onClick={() => void runMove({ action: "jog", axis: "z", distance: direction * moveStep }, `Z ${formatSigned(direction * moveStep)}`)}>
                              {direction > 0 ? <MdKeyboardArrowUp className="jog-icon" /> : <MdKeyboardArrowDown className="jog-icon" />}
                            </button>
                          ))}</div>
                        </div>
                        <div className="movement-step-grid" role="group" aria-label={t("movement.distance", { distance: moveStep })}>
                          {moveSteps.map((step) => <button key={step} type="button" className={step === moveStep ? "movement-step active" : "movement-step"} aria-pressed={step === moveStep} onClick={() => setMoveStep(step)}>{step}</button>)}
                        </div>
                        <div className="movement-offset">
                          <div className="movement-offset-title">{t("movement.zOffset", { offset: printerStatus ? formatOffset(printerStatus.zOffset) : "--" })}</div>
                          <div className="offset-grid">
                            {[1, -1].flatMap((direction) => zOffsetSteps.map((step) => (
                              <button key={direction * step} className="offset-button" type="button" disabled={offsetDisabled}
                                onClick={() => void runMove({ action: "z-offset", adjust: direction * step }, `Z-offset ${formatSigned(direction * step)}`)}>
                                {direction > 0 ? <MdKeyboardArrowUp className="offset-icon" /> : <MdKeyboardArrowDown className="offset-icon" />}{formatSigned(direction * step)}
                              </button>
                            )))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="sensor-widget-toolbar">
                          <label className="sensor-endstop-toggle">
                            <input type="checkbox" checked={showEndstops} onChange={(event) => updateShowEndstops(event.target.checked)} />
                            <span>{t("homeGrid.showEndstops")}</span>
                          </label>
                          <button className="modal-icon-button" type="button" onClick={() => setSensorSettingsOpen((open) => !open)}
                            title={t("homeGrid.sensorVisibility")} aria-label={t("homeGrid.sensorVisibility")} aria-pressed={sensorSettingsOpen}>
                            <FcSettings />
                          </button>
                        </div>
                        {sensorSettingsOpen && sensorStates.length > 0 && (
                          <div className="sensor-visibility-list">
                            {sensorStates.filter((sensor) => sensor.group === "sensor" || showEndstops).map((sensor) => (
                              <label key={sensor.id}>
                                <input type="checkbox" checked={!hiddenSensors.has(sensor.id)} onChange={() => toggleSensorVisibility(sensor.id)} />
                                <span>{sensor.label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="sensor-state-list" aria-busy={sensorsLoading}>
                          {sensorsLoading && sensorStates.length === 0 && <div className="panel-loading-bar" />}
                          {!sensorsLoading && visibleSensorStates.length === 0 && <p className="empty-note">{t("homeGrid.noSensors")}</p>}
                          {visibleSensorStates.map((sensor) => {
                            const stateLabel = sensor.state === null
                              ? t("homeGrid.unknown")
                              : sensor.group === "endstop"
                                ? t(sensor.state ? "homeGrid.triggered" : "homeGrid.open")
                                : t(sensor.state ? "homeGrid.detected" : "homeGrid.empty");
                            const stateClass = sensor.state === null
                              ? "unknown"
                              : sensor.group === "endstop"
                                ? sensor.state ? "endstop-triggered" : "endstop-open"
                                : sensor.state ? "sensor-detected" : "sensor-empty";
                            return <div className="sensor-state-row" key={sensor.id}>
                              <MdSensors className="sensor-state-icon" />
                              <span className="sensor-state-name">{sensor.label}</span>
                              <strong className={stateClass}>{stateLabel}</strong>
                              <button type="button" className="sensor-hide-button" onClick={() => toggleSensorVisibility(sensor.id)}
                                title={t("homeGrid.hideSensor", { name: sensor.label })} aria-label={t("homeGrid.hideSensor", { name: sensor.label })}>
                                <span aria-hidden="true">-</span>
                              </button>
                            </div>;
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="welcome">
              {showKEditorLogo ? (
                <KEditorAccentLogo className="welcome-logo" />
              ) : mainsailLogoUrl && mainsailTheme.logoMask ? (
                <span className="welcome-logo welcome-logo-mask" aria-hidden="true" style={mainsailLogoMaskStyle} />
              ) : mainsailLogoUrl ? (
                <img className="welcome-logo" src={mainsailLogoUrl} alt="" />
              ) : (
                <img className="welcome-logo" src={apiPath("/img/k-editor-logo.svg")} alt="" />
              )}
              <h2>{t("welcome.title")}</h2>
              <p>{t("welcome.description")}</p>
            </div>
          )) : activeFile.loading ? (
            <div className="welcome editor-loading" role="status" aria-live="polite">
              <h2>{t("loading.title")}</h2>
              <p className="editor-loading-path">{activeFile.path}</p>
              <div className="panel-loading-bar" />
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
                <section
                  className="outline-section section-outline-section"
                >
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
                          onMouseEnter={(event) => {
                            setSectionsNavigating(true);
                            scheduleSectionPreview(section, event);
                          }}
                          onMouseLeave={schedulePreviewClose}
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
          <section className={terminalMode === "pty" ? "terminal-panel terminal-panel-pty" : "terminal-panel"} style={{ height: terminalHeight }} aria-label={t("panels.terminal")}>
            <button
              className="panel-resizer terminal-resizer-height"
              type="button"
              aria-label={t("resize.height")}
              onMouseDown={startTerminalHeightResize}
            />
            {terminalMode === "pty" ? <PtyTerminal endpoint={apiPath("/api/terminal/pty")} enabled={terminalEnabled} supported={ptySupported}
              onClose={() => setTerminalOpen(false)} onExpand={openTerminalTab} onActive={setPtyActive}
              labels={{ connect: t("actions.connectTerminal"), disconnect: t("actions.disconnectTerminal"), connected: t("status.terminalConnected"),
                disconnected: t("status.terminalDisconnected"), connecting: t("pty.connecting"), close: t("actions.closeTerminal"),
                expand: t("actions.openTerminalTab"),
                disabled: t("errors.terminalDisabled"), unsupported: t("pty.unsupported"), http: t("pty.http") }} /> : <>
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
                <button className="terminal-icon-button" type="button" title={t("actions.openTerminalTab")} aria-label={t("actions.openTerminalTab")} onClick={openTerminalTab}>
                  <MdOpenInFull />
                </button>
                <button className="terminal-icon-button" type="button" title={t("actions.closeTerminal")} aria-label={t("actions.closeTerminal")} onClick={() => setTerminalOpen(false)}>
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
            </>}
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
              ) : dialog.type === "unsaved-close" ? (
                <div className="dialog-body">
                  <p>{dialog.message}</p>
                  <div className="dialog-actions three-actions">
                    <button className="dialog-button" type="button" onClick={closeDialog}>
                      {t("actions.cancel")}
                    </button>
                    <button
                      className="dialog-button"
                      type="button"
                      onClick={() => {
                        dialog.resolve("discard");
                        setDialog(null);
                      }}
                    >
                      {t("actions.closeWithoutSaving")}
                    </button>
                    <button className="dialog-button primary" type="button" onClick={acceptDialog}>
                      {t("actions.saveAndClose")}
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

        {bedMeshOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setBedMeshOpen(false)}>
            <section
              className="options-modal bed-mesh-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bed-mesh-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="bed-mesh-title">
                  <MdGridOn className="modal-title-icon" />
                  {t("bedMesh.title")}
                </h2>
                <div className="modal-header-actions">
                  <button
                    className="modal-icon-button"
                    type="button"
                    title={t("actions.refresh")}
                    aria-label={t("actions.refresh")}
                    disabled={bedMeshLoading}
                    onClick={() => void loadBedMesh()}
                  >
                    <FcRefresh className="modal-action-icon" />
                  </button>
                  <button
                    className="modal-close"
                    type="button"
                    title={t("options.close")}
                    aria-label={t("options.close")}
                    onClick={() => setBedMeshOpen(false)}
                  >
                    <IoClose />
                  </button>
                </div>
              </div>
              <div className="bed-mesh-body">
                <div className="bed-mesh-stage">
                  <div className="bed-mesh-viewer-shell">
                    {bedMeshLoading && <div className="bed-mesh-loading">{t("bedMesh.loading")}</div>}
                    {!bedMeshLoading && !previewBedMeshData && <div className="bed-mesh-empty">{t("bedMesh.empty")}</div>}
                    <BedMeshViewer
                      data={previewBedMeshData}
                      showSurface={bedMeshShowProbed || bedMeshShowMesh}
                      showPoints={bedMeshShowProbed}
                      showFlat={bedMeshShowFlat}
                      showWireframe={bedMeshWireframe}
                      scaleGradient={bedMeshScaleGradient}
                      zScale={bedMeshZScale}
                      accent={mainsailTheme.primary}
                    />
                  </div>
                  <div className="bed-mesh-controls">
                    <label className="bed-mesh-toggle">
                      <input type="checkbox" checked={bedMeshScaleGradient} onChange={(event) => setBedMeshScaleGradient(event.target.checked)} />
                      <span>{t("bedMesh.scaleGradient")}</span>
                    </label>
                    <label className="bed-mesh-toggle">
                      <input type="checkbox" checked={bedMeshShowProbed} onChange={(event) => setBedMeshShowProbed(event.target.checked)} />
                      <span>{t("bedMesh.probed")}</span>
                    </label>
                    <label className="bed-mesh-toggle">
                      <input type="checkbox" checked={bedMeshShowMesh} onChange={(event) => setBedMeshShowMesh(event.target.checked)} />
                      <span>{t("bedMesh.mesh")}</span>
                    </label>
                    <label className="bed-mesh-toggle">
                      <input type="checkbox" checked={bedMeshShowFlat} onChange={(event) => setBedMeshShowFlat(event.target.checked)} />
                      <span>{t("bedMesh.flat")}</span>
                    </label>
                    <label className="bed-mesh-toggle">
                      <input type="checkbox" checked={bedMeshWireframe} onChange={(event) => setBedMeshWireframe(event.target.checked)} />
                      <span>{t("bedMesh.wireframe")}</span>
                    </label>
                    <label className="bed-mesh-slider">
                      <span>{t("bedMesh.scaleZ")}</span>
                      <input
                        type="range"
                        min="0.1"
                        max="3"
                        step="0.1"
                        value={bedMeshZScale}
                        onChange={(event) => setBedMeshZScale(Number(event.target.value))}
                      />
                    </label>
                  </div>
                </div>
                <aside className="bed-mesh-side">
                  <section className="bed-mesh-panel">
                    <h3>{t("bedMesh.current")}</h3>
                    <dl className="bed-mesh-list">
                      <div><dt>{t("bedMesh.name")}</dt><dd>{bedMesh?.current?.name || "-"}</dd></div>
                      <div><dt>{t("bedMesh.preview")}</dt><dd>{bedMeshPreviewName === "__current__" ? t("bedMesh.current") : bedMeshPreviewName}</dd></div>
                      <div><dt>{t("bedMesh.size")}</dt><dd>{previewBedMeshStats?.size ?? "-"}</dd></div>
                      <div><dt>{t("bedMesh.max")}</dt><dd>{previewBedMeshStats ? `${previewBedMeshStats.maxPoint} / ${previewBedMeshStats.max.toFixed(3)} mm` : "-"}</dd></div>
                      <div><dt>{t("bedMesh.min")}</dt><dd>{previewBedMeshStats ? `${previewBedMeshStats.minPoint} / ${previewBedMeshStats.min.toFixed(3)} mm` : "-"}</dd></div>
                      <div><dt>{t("bedMesh.range")}</dt><dd>{previewBedMeshStats ? `${previewBedMeshStats.range.toFixed(3)} mm` : "-"}</dd></div>
                    </dl>
                  </section>
                  <section className="bed-mesh-panel">
                    <h3>{t("bedMesh.profiles")}</h3>
                    <label className="bed-mesh-field">
                      <span>{t("bedMesh.profileName")}</span>
                      <input value={bedMeshProfileName} onChange={(event) => setBedMeshProfileName(event.target.value)} />
                    </label>
                    <div className="bed-mesh-profile-list">
                      <button
                        className={bedMeshPreviewName === "__current__" ? "bed-mesh-profile active" : "bed-mesh-profile"}
                        type="button"
                        onClick={() => setBedMeshPreviewName("__current__")}
                      >
                        <span>{t("bedMesh.current")}</span>
                      </button>
                      {bedMeshProfiles.length === 0 ? (
                        <p className="empty-note">{t("bedMesh.noProfiles")}</p>
                      ) : bedMeshProfiles.map((profile) => (
                        <div key={profile.name} className={bedMeshPreviewName === profile.name ? "bed-mesh-profile active" : "bed-mesh-profile"}>
                          <button type="button" onClick={() => setBedMeshPreviewName(profile.name)}>
                            <span>{profile.name}</span>
                            <small>{meshStats(meshDataFromProfile(profile))?.range.toFixed(3) ?? "-"} mm</small>
                          </button>
                          <button
                            className="bed-mesh-profile-action"
                            type="button"
                            title={t("bedMesh.activate")}
                            aria-label={t("bedMesh.activate")}
                            disabled={Boolean(bedMeshAction)}
                            onClick={() => void runBedMeshAction("load", profile.name)}
                          >
                            <MdHome />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="bed-mesh-actions">
                    <button className="dialog-button" type="button" disabled={Boolean(bedMeshAction)} onClick={() => void runBedMeshAction("calibrate", bedMeshProfileName)}>
                      {bedMeshAction === "calibrate" ? t("bedMesh.working") : t("bedMesh.calibrate")}
                    </button>
                    <button className="dialog-button" type="button" disabled={Boolean(bedMeshAction)} onClick={() => void runBedMeshAction("save-profile", bedMeshProfileName)}>
                      {t("bedMesh.saveProfile")}
                    </button>
                    <button className="dialog-button" type="button" disabled={Boolean(bedMeshAction)} onClick={() => void runBedMeshAction("clear")}>
                      {t("bedMesh.clear")}
                    </button>
                    <button className="dialog-button primary" type="button" disabled={Boolean(bedMeshAction)} onClick={() => void runBedMeshAction("save-config")}>
                      {t("bedMesh.saveConfig")}
                    </button>
                  </section>
                </aside>
              </div>
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
                <div className="movement-extrusion">
                  <div className="movement-offset-title">{t("movement.extrusion")}</div>
                  {printerStatus.extruders.length === 0 ? (
                    <p className="empty-note">{t("movement.noExtruders")}</p>
                  ) : (
                    <>
                      <div className="extruder-selector" role="group" aria-label={t("movement.extruder")}>
                        {printerStatus.extruders.map((extruder) => (
                          <button
                            key={extruder.name}
                            className={selectedExtruder === extruder.name ? "extruder-tab active" : "extruder-tab"}
                            type="button"
                            onClick={() => setSelectedExtruder(extruder.name)}
                          >
                            {extruder.label}
                          </button>
                        ))}
                      </div>
                      <div className="extrusion-fields">
                        <label>
                          <span>{t("movement.extrudeLength")}</span>
                          <input
                            type="number"
                            min="0.1"
                            max="200"
                            step="0.1"
                            value={extrudeLength}
                            onFocus={(event) => event.currentTarget.select()}
                            onClick={(event) => event.currentTarget.select()}
                            onChange={(event) => setExtrudeLength(event.target.value)}
                          />
                          <span>mm</span>
                        </label>
                        <label>
                          <span>{t("movement.extrudeSpeed")}</span>
                          <input
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.1"
                            value={extrudeSpeed}
                            onFocus={(event) => event.currentTarget.select()}
                            onClick={(event) => event.currentTarget.select()}
                            onChange={(event) => setExtrudeSpeed(event.target.value)}
                          />
                          <span>mm/s</span>
                        </label>
                      </div>
                      <div className="extrusion-actions">
                        <button
                          className="offset-button"
                          type="button"
                          disabled={extrusionDisabled}
                          onClick={() => void runExtrusion("retract")}
                        >
                          <MdKeyboardArrowDown className="offset-icon" />
                          {t("movement.retract")}
                        </button>
                        <button
                          className="offset-button"
                          type="button"
                          disabled={extrusionDisabled}
                          onClick={() => void runExtrusion("extrude")}
                        >
                          <MdKeyboardArrowUp className="offset-icon" />
                          {t("movement.extrude")}
                        </button>
                      </div>
                    </>
                  )}
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
                        disabled={offsetDisabled}
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
                        disabled={offsetDisabled}
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
                  <button className="modal-icon-button" type="button" title={t("pid.title")} aria-label={t("pid.title")}
                    onClick={() => { if (!pidHeater && heaters[0]) setPidHeater(heaters[0].name); setPidOpen(true); }}>PID</button>
                  <button
                    className="modal-icon-button"
                    type="button"
                    title={t("heaters.coolAll")}
                    aria-label={t("heaters.coolAll")}
                    disabled={settingHeaters}
                    onClick={() => void coolAllHeaters()}
                  >
                    <MdAcUnit className="action-icon" style={{ color: "#65bdff" }} />
                  </button>
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
                  <>
                    {(extruderHeaters.length > 1 || bedHeaters.length > 1) && (
                      <div className="heater-group-controls">
                        {extruderHeaters.length > 1 && (
                          <label className="heater-group-row">
                            <span className="heater-group-name">{t("heaters.extruders")}</span>
                            <span className="heater-group-input">
                              {t("heaters.groupTarget")}
                              <input
                                type="number"
                                min="0"
                                max="350"
                                step="1"
                                value={bulkExtruderTarget}
                                onFocus={(event) => event.currentTarget.select()}
                                onClick={(event) => event.currentTarget.select()}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setBulkExtruderTarget(nextValue);
                                  setHeaterGroupTargetValues(extruderHeaters, nextValue);
                                }}
                              />
                            </span>
                            <button
                              className="dialog-button"
                              type="button"
                              disabled={!bulkExtruderTarget.trim()}
                              onClick={() => setHeaterGroupTargetValues(extruderHeaters, bulkExtruderTarget)}
                            >
                              {t("actions.applyToGroup")}
                            </button>
                          </label>
                        )}
                        {bedHeaters.length > 1 && (
                          <label className="heater-group-row">
                            <span className="heater-group-name">{t("heaters.beds")}</span>
                            <span className="heater-group-input">
                              {t("heaters.groupTarget")}
                              <input
                                type="number"
                                min="0"
                                max="350"
                                step="1"
                                value={bulkBedTarget}
                                onFocus={(event) => event.currentTarget.select()}
                                onClick={(event) => event.currentTarget.select()}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setBulkBedTarget(nextValue);
                                  setHeaterGroupTargetValues(bedHeaters, nextValue);
                                }}
                              />
                            </span>
                            <button
                              className="dialog-button"
                              type="button"
                              disabled={!bulkBedTarget.trim()}
                              onClick={() => setHeaterGroupTargetValues(bedHeaters, bulkBedTarget)}
                            >
                              {t("actions.applyToGroup")}
                            </button>
                          </label>
                        )}
                      </div>
                    )}
                    <div className="heater-list">
                      {heaters.map((heater) => (
                        <div key={heater.name} className="heater-row">
                          <span className="heater-row-name">
                            <HeaterTypeIcon
                              heater={heater}
                              className="heater-row-icon"
                              style={{ color: heater.color ?? "#7fd4ff" }}
                            />
                            <span>{heater.label}</span>
                          </span>
                          <span className="heater-row-current">
                            <span>{t("heaters.current")} {formatTemperature(heater.temperature)}</span>
                            {heater.target > 0 && (
                              <span>{t("heaters.target")} {heaterTargetLabel(heater)}</span>
                            )}
                          </span>
                          <span className="heater-row-target">
                            {t("heaters.target")}
                            <input
                              type="number"
                              min="0"
                              max="350"
                              step="1"
                              value={heaterTargets[heater.name] ?? ""}
                              aria-label={`${heater.label} ${t("heaters.target")}`}
                              disabled={Boolean(pidJob)}
                              onFocus={(event) => event.currentTarget.select()}
                              onClick={(event) => event.currentTarget.select()}
                              onChange={(event) => setHeaterTargetValue(heater.name, event.target.value)}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="dialog-actions">
                  <button className="dialog-button" type="button" onClick={() => setHeatersOpen(false)}>
                    {t("actions.cancel")}
                  </button>
                  <button className="dialog-button primary" type="submit" disabled={Boolean(pidJob) || settingHeaters || heaters.length === 0}>
                    {settingHeaters ? t("actions.settingHeaters") : t("actions.setHeaters")}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {auxiliariesOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setAuxiliariesOpen(false)}>
            <section
              className="options-modal auxiliaries-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="auxiliaries-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="auxiliaries-title">{t("auxiliaries.title")}</h2>
                <div className="modal-header-actions">
                  <button
                    className="modal-icon-button"
                    type="button"
                    title={t("actions.refreshAuxiliaries")}
                    aria-label={t("actions.refreshAuxiliaries")}
                    disabled={auxiliariesLoading || settingAuxiliary !== null}
                    onClick={() => void loadAuxiliaryControls(true)}
                  >
                    <FcRefresh className="action-icon" />
                  </button>
                  <button
                    className="modal-close"
                    type="button"
                    title={t("options.close")}
                    aria-label={t("options.close")}
                    onClick={() => setAuxiliariesOpen(false)}
                  >
                    x
                  </button>
                </div>
              </div>
              <div className="auxiliaries-modal-body">
                {auxiliariesLoading && auxiliaryControls.length === 0 ? (
                  <div className="panel-loading-state" role="status" aria-live="polite">
                    <span>{t("status.loadingAuxiliaries")}</span>
                    <div className="panel-loading-bar" />
                  </div>
                ) : auxiliaryControls.length === 0 ? (
                  <p className="empty-note">{t("auxiliaries.empty")}</p>
                ) : (
                  <>
                    {fanControls.length > 0 && (
                      <section className="auxiliary-section">
                        <div className="auxiliary-section-title">
                          <MdiIcon className="auxiliary-section-icon" path={mdiFan} size={1} />
                          <span>{t("auxiliaries.fans")}</span>
                        </div>
                        <div className="auxiliary-list">
                          {fanControls.map((control) => {
                            const busy = settingAuxiliary === control.name;
                            const valuePercent = Math.round(control.value * 100);

                            return (
                              <div key={control.name} className={control.controllable ? "auxiliary-row" : "auxiliary-row readonly"}>
                                <div className="auxiliary-row-main">
                                  <span className="auxiliary-row-name">
                                    <MdiIcon className="auxiliary-row-icon" path={mdiFan} size={0.85} />
                                    <span>{control.label}</span>
                                  </span>
                                  <span className="auxiliary-row-value">
                                    {control.controllable ? (
                                      <>
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="1"
                                          value={valuePercent}
                                          disabled={busy}
                                          aria-label={`${control.label} %`}
                                          onFocus={(event) => event.currentTarget.select()}
                                          onChange={(event) => updateAuxiliaryControlLocal(control.name, { value: Math.min(Math.max(Number(event.target.value), 0), 100) / 100 })}
                                          onBlur={(event) => void setAuxiliaryControl(control, { value: Number(event.target.value) / 100 })}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") void setAuxiliaryControl(control, { value: Number(event.currentTarget.value) / 100 });
                                          }}
                                        />
                                        <span>%</span>
                                      </>
                                    ) : (
                                      <span title={t("auxiliaries.readOnly")}>{formatPercent(control.value)}</span>
                                    )}
                                  </span>
                                </div>
                                {control.controllable ? (
                                  <div className="auxiliary-slider-row">
                                    <button className="auxiliary-step-button" type="button" disabled={busy} onClick={() => void setAuxiliaryControl(control, { value: Math.max(control.value - 0.05, 0) })}>-</button>
                                    <input
                                      className="auxiliary-slider"
                                      type="range"
                                      min="0"
                                      max="100"
                                      step="1"
                                      value={valuePercent}
                                      disabled={busy}
                                      aria-label={`${control.label} ${formatPercent(control.value)}`}
                                      onChange={(event) => updateAuxiliaryControlLocal(control.name, { value: Number(event.target.value) / 100 })}
                                      onPointerUp={(event) => void setAuxiliaryControl(control, { value: Number(event.currentTarget.value) / 100 })}
                                      onKeyUp={(event) => {
                                        if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                                          void setAuxiliaryControl(control, { value: Number(event.currentTarget.value) / 100 });
                                        }
                                      }}
                                    />
                                    <button className="auxiliary-step-button" type="button" disabled={busy} onClick={() => void setAuxiliaryControl(control, { value: Math.min(control.value + 0.05, 1) })}>+</button>
                                  </div>
                                ) : (
                                  <p className="auxiliary-readonly-note">{t("auxiliaries.readOnly")}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {ledControls.length > 0 && (
                      <section className="auxiliary-section">
                        <div className="auxiliary-section-title">
                          <MdiIcon className="auxiliary-section-icon" path={mdiLedStripVariant} size={1} />
                          <span>{t("auxiliaries.leds")}</span>
                        </div>
                        <div className="auxiliary-list">
                          {ledControls.map((control) => {
                            const busy = settingAuxiliary === control.name;
                            const color = control.color ?? "#000000";

                            return (
                              <div key={control.name} className="auxiliary-row led-row">
                                <div className="auxiliary-row-main">
                                  <span className="auxiliary-row-name">
                                    <MdiIcon className="auxiliary-row-icon" path={mdiLedStripVariant} size={0.85} />
                                    <span>{control.label}</span>
                                  </span>
                                  <label className="auxiliary-color-control" title={color}>
                                    <input
                                      type="color"
                                      value={color}
                                      disabled={busy || !control.controllable}
                                      aria-label={control.label}
                                      onChange={(event) => updateAuxiliaryControlLocal(control.name, { color: event.target.value, value: 1 })}
                                      onBlur={(event) => void setAuxiliaryControl(control, { color: event.target.value, value: 1 })}
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {pidOpen && (
          <div className="modal-backdrop pid-backdrop" role="presentation" onMouseDown={() => setPidOpen(false)}>
            <section className="options-modal pid-modal" role="dialog" aria-modal="true" aria-labelledby="pid-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2 id="pid-title">{t("pid.title")}</h2>
                <button className="modal-close" type="button" aria-label={t("options.close")} onClick={() => setPidOpen(false)}>x</button>
              </div>
              <div className="pid-body">
                <form className="pid-controls" onSubmit={(event) => { event.preventDefault(); const heater = heaters.find((item) => item.name === pidHeater); if (heater) void calibratePid(heater); }}>
                  <label>{t("pid.heater")}<select value={pidHeater} disabled={Boolean(pidJob) || pidStarting || pidSaving} onChange={(event) => { setPidHeater(event.target.value); setPidSamples([]); }}>
                    {heaters.map((heater) => <option key={heater.name} value={heater.name}>{heater.label}</option>)}
                  </select></label>
                  <label>{t("heaters.target")} (°C)<input type="number" min="1" max="350" step="1" required value={pidTarget} disabled={Boolean(pidJob) || pidStarting || pidSaving} onChange={(event) => setPidTarget(event.target.value)} /></label>
                  <button type="submit" className="dialog-button primary" disabled={Boolean(pidJob) || pidStarting || pidSaving || !pidHeater || Number(pidTarget) <= 0 || !Number.isFinite(Number(pidTarget)) || Number(pidTarget) > 350 || !printerStatus || printerStatus.printing || printerStatus.printState === "paused"}>
                    <FaPlay /> {t(pidJob || pidStarting ? "pid.busy" : "pid.start")}
                  </button>
                </form>
                <p className="pid-status" role="status">{pidMessage || t("pid.ready")}</p>
                <div className="pid-legend">
                  <span style={{ color: "#63c9ff" }}>{t("heaters.current")}: {pidSamples.length ? formatTemperature(pidSamples[pidSamples.length - 1].temperature) : "--"}</span>
                  <span style={{ color: "#efb85c" }}>{t("heaters.target")}: {pidSamples.length ? formatTemperature(pidSamples[pidSamples.length - 1].target) : "--"}</span>
                  <span style={{ color: "#cf8fee" }}>PWM: {pidSamples.at(-1)?.power !== undefined ? `${Math.round(pidSamples.at(-1)!.power! * 100)} %` : "--"}</span>
                </div>
                <PidChart samples={pidSamples} label={t("pid.chart")} />
                <div className="dialog-actions">
                  <button className="modal-icon-button" type="button" title={t("heaters.coolAll")} aria-label={t("heaters.coolAll")} disabled={settingHeaters} onClick={() => void coolAllHeaters()}><MdAcUnit className="action-icon" style={{ color: "#65bdff" }} /></button>
                  <button className="dialog-button primary" type="button" disabled={!pidCompleted || Boolean(pidJob) || pidStarting || pidSaving} onClick={() => void savePid()}><FaFloppyDisk /> {t("heaters.pidSaveTitle")}</button>
                </div>
              </div>
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
                <div className="klipper-console-tabs macro-tabs" role="tablist">
                  <button
                    className={macroTab === "favorites" ? "klipper-console-tab active" : "klipper-console-tab"}
                    type="button"
                    role="tab"
                    aria-selected={macroTab === "favorites"}
                    onClick={() => setMacroTab("favorites")}
                  >
                    {t("macros.favorites")}
                  </button>
                  <button
                    className={macroTab === "all" ? "klipper-console-tab active" : "klipper-console-tab"}
                    type="button"
                    role="tab"
                    aria-selected={macroTab === "all"}
                    onClick={() => setMacroTab("all")}
                  >
                    {t("macros.all")}
                  </button>
                </div>
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
                <div className="macro-count">{t("macros.count", { count: visibleMacros.length })}</div>
                <div className="macro-list">
                  {macrosLoading ? (
                    <div className="panel-loading-state" role="status" aria-live="polite">
                      <span>{t("macros.loading")}</span>
                      <div className="panel-loading-bar" />
                    </div>
                  ) : visibleMacros.length === 0 ? (
                    <p className="empty-note">{macroTab === "favorites" ? t("macros.emptyFavorites") : t("macros.empty")}</p>
                  ) : (
                    visibleMacros.map((macro) => (
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
                            {macro.parameters.length > 0 && (
                              <span className="macro-parameter-count">
                                {t("macros.parameters")} {macro.parameters.length}
                              </span>
                            )}
                            <span className="macro-row-path">
                              {macro.path}:{macro.line}
                            </span>
                          </span>
                        </button>
                        <button
                          className="macro-start-button"
                          type="button"
                          title={macroFavoriteSet.has(macro.name) ? t("actions.removeFavoriteMacro") : t("actions.favoriteMacro")}
                          aria-label={macroFavoriteSet.has(macro.name) ? t("actions.removeFavoriteMacro") : t("actions.favoriteMacro")}
                          onClick={() => toggleMacroFavorite(macro)}
                        >
                          {macroFavoriteSet.has(macro.name) ? (
                            <MdStar className="macro-start-icon favorite" />
                          ) : (
                            <MdStarBorder className="macro-start-icon" />
                          )}
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

        {macroParameterTarget && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => !executingMacro && setMacroParameterTarget(null)}>
            <section className="options-modal macro-parameters-modal" role="dialog" aria-modal="true" aria-labelledby="macro-parameters-title"
              onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2 id="macro-parameters-title">{t("macros.parametersFor", { name: macroParameterTarget.name })}</h2>
                <button className="modal-close" type="button" title={t("actions.close")} aria-label={t("actions.close")}
                  disabled={Boolean(executingMacro)} onClick={() => setMacroParameterTarget(null)}>x</button>
              </div>
              <form className="macro-parameters-body" onSubmit={(event) => void submitMacroParameters(event)}>
                {macroParameterTarget.description && <p className="setting-help">{macroParameterTarget.description}</p>}
                <div className="macro-parameter-list">
                  {macroParameterTarget.parameters.map((parameter) => {
                    const defaultText = parameter.defaultValue !== undefined
                      ? t("macros.parameterDefault", { value: parameter.defaultValue })
                      : parameter.defaultExpression
                        ? t("macros.parameterDynamicDefault", { value: parameter.defaultExpression })
                        : "";
                    return (
                      <label className="macro-parameter-field" key={parameter.name}>
                        <span className="macro-parameter-heading">
                          <strong>{parameter.name}</strong>
                          <small>{t(parameter.required ? "macros.parameterRequired" : "macros.parameterOptional")}</small>
                        </span>
                        {parameter.kind === "boolean" ? (
                          <select required={parameter.required} value={macroParameterValues[parameter.name] ?? ""}
                            onChange={(event) => setMacroParameterValues((current) => ({ ...current, [parameter.name]: event.target.value }))}>
                            <option value="">{defaultText || t("macros.useDefault")}</option>
                            <option value="true">{t("macros.booleanTrue")}</option>
                            <option value="false">{t("macros.booleanFalse")}</option>
                          </select>
                        ) : (
                          <input type={parameter.kind === "number" ? "number" : "text"} step={parameter.kind === "number" ? "any" : undefined}
                            required={parameter.required} value={macroParameterValues[parameter.name] ?? ""}
                            placeholder={defaultText || undefined} autoComplete="off" spellCheck={false}
                            onChange={(event) => setMacroParameterValues((current) => ({ ...current, [parameter.name]: event.target.value }))} />
                        )}
                        {defaultText && <small className="macro-parameter-default">{defaultText}</small>}
                      </label>
                    );
                  })}
                </div>
                <div className="dialog-actions">
                  <button className="dialog-button" type="button" disabled={Boolean(executingMacro)} onClick={() => setMacroParameterTarget(null)}>{t("actions.cancel")}</button>
                  <button className="dialog-button primary" type="submit" disabled={Boolean(executingMacro)}>
                    {executingMacro ? <span className="button-spinner" aria-hidden="true" /> : <FaPlay />}
                    {t("actions.executeMacro")}
                  </button>
                </div>
              </form>
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

        {updatesOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setUpdatesOpen(false)}>
            <section
              className="options-modal updates-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="updates-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="updates-title">{t("panels.updates")}</h2>
                <div className="modal-header-actions">
                  <button
                    className="modal-icon-button"
                    type="button"
                    title={t("actions.checkUpdates")}
                    aria-label={t("actions.checkUpdates")}
                    disabled={updatesLoading || runningUpdate !== null}
                    onClick={() => void loadUpdates(true)}
                  >
                    <FcRefresh className="action-icon" />
                  </button>
                  <button
                    className="modal-close"
                    type="button"
                    title={t("options.close")}
                    aria-label={t("options.close")}
                    onClick={() => setUpdatesOpen(false)}
                  >
                    x
                  </button>
                </div>
              </div>
              <div className="updates-modal-body">
                <div className="updates-summary">
                  <span>
                    {t("updates.allCount", { count: updates.length })} - {t("updates.count", { count: pendingUpdates.length })}
                  </span>
                  <button
                    className="dialog-button primary"
                    type="button"
                    disabled={updatesLoading || updatesBusy || runningUpdate !== null || pendingUpdates.length === 0 || printerStatus?.printing}
                    title={printerStatus?.printing ? t("errors.updatePrinting") : t("actions.updateAll")}
                    onClick={() => void runUpdate()}
                  >
                    {runningUpdate === "all" && <span className="button-spinner" aria-hidden="true" />}
                    {runningUpdate === "all" ? t("actions.updating") : t("actions.updateAll")}
                  </button>
                </div>
                {updatesBusy && <p className="setting-help">{t("updates.busy")}</p>}
                <div className="updates-list">
                  {updatesLoading ? (
                    <div className="panel-loading-state" role="status" aria-live="polite">
                      <span>{t("updates.loading")}</span>
                      <div className="panel-loading-bar" />
                    </div>
                  ) : updates.length === 0 ? (
                    <p className="empty-note">{t("updates.empty")}</p>
                  ) : (
                    updates.map((update) => {
                      const pending = hasPendingUpdate(update);

                      return (
                        <article className={runningUpdate === update.name ? "update-row updating" : "update-row"} key={update.name}>
                          <div className="update-row-main">
                            <div className="update-row-title">
                              <strong>{update.name}</strong>
                              {update.configuredType && <span>{update.configuredType}</span>}
                            </div>
                            <dl className="update-meta">
                              <div>
                                <dt>{t("updates.current")}</dt>
                                <dd>{update.version || "-"}</dd>
                              </div>
                              {pending && (
                                <div>
                                  <dt>{t("updates.available")}</dt>
                                  <dd>{update.remoteVersion || update.commitsBehind || "-"}</dd>
                                </div>
                              )}
                              {update.channel && (
                                <div>
                                  <dt>{t("updates.channel")}</dt>
                                  <dd>{update.channel}</dd>
                                </div>
                              )}
                            </dl>
                            <div className="update-badges">
                              {update.isDirty && <span>{t("updates.dirty")}</span>}
                              {update.detached && <span>{t("updates.detached")}</span>}
                              {!update.isValid && <span>{t("updates.invalid")}</span>}
                              {update.warnings.map((warning) => (
                                <span key={warning}>{warning}</span>
                              ))}
                            </div>
                          </div>
                          {pending ? (
                            <button
                              className="dialog-button"
                              type="button"
                              disabled={updatesLoading || updatesBusy || runningUpdate !== null || printerStatus?.printing}
                              title={printerStatus?.printing ? t("errors.updatePrinting") : t("actions.updateComponent")}
                              onClick={() => void runUpdate(update)}
                            >
                              {runningUpdate === update.name && <span className="button-spinner" aria-hidden="true" />}
                              {runningUpdate === update.name ? t("actions.updating") : t("actions.updateComponent")}
                            </button>
                          ) : (
                            <span className="update-up-to-date">{t("updates.upToDate")}</span>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
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
              <input
                ref={gcodeUploadInputRef}
                className="hidden-file-input"
                type="file"
                multiple
                accept=".gcode"
                onChange={(event) => void uploadGcodesFromInput(event)}
              />
              <div className="gcodes-modal-body">
                <div className="gcodes-toolbar">
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
                  {gcodeModalTab === "files" && (
                    <button
                      className="dialog-button gcode-upload-button"
                    type="button"
                    disabled={gcodesUploading}
                    onClick={() => gcodeUploadInputRef.current?.click()}
                  >
                    <FcUpload className="dialog-button-icon" />
                    {gcodesUploading && <span className="button-indeterminate" aria-hidden="true" />}
                    {gcodesUploading ? t("gcodes.uploading") : t("gcodes.upload")}
                  </button>
                  )}
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
                <div
                  className={
                    gcodeModalTab === "files" && gcodesDragActive
                      ? "gcodes-browser upload-active"
                      : "gcodes-browser"
                  }
                  onDragEnter={(event) => {
                    if (gcodeModalTab !== "files") return;
                    event.preventDefault();
                    setGcodesDragActive(true);
                  }}
                  onDragOver={(event) => {
                    if (gcodeModalTab !== "files") return;
                    event.preventDefault();
                    setGcodesDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (gcodeModalTab !== "files") return;
                    event.preventDefault();
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                    setGcodesDragActive(false);
                  }}
                  onDrop={(event) => {
                    if (gcodeModalTab !== "files") return;
                    event.preventDefault();
                    setGcodesDragActive(false);
                    void uploadGcodeFiles(Array.from(event.dataTransfer.files));
                  }}
                >
                  {gcodeModalTab === "files" && (
                    <div className={gcodesDragActive ? "gcode-drop-overlay active" : "gcode-drop-overlay"} aria-hidden="true">
                      <FcUpload className="action-icon" />
                      <span>{gcodesUploading ? t("gcodes.uploading") : t("gcodes.dropUpload")}</span>
                    </div>
                  )}
                  <div className="gcodes-list">
                    {gcodesLoading ? (
                      <div className="panel-loading-state" role="status" aria-live="polite">
                        <span>{t("gcodes.loading")}</span>
                        <div className="panel-loading-bar" />
                      </div>
                    ) : gcodeModalTab === "files" ? (
                      filteredGcodeFiles.length === 0 ? (
                        <p className="empty-note">{t("gcodes.empty")}</p>
                      ) : (
                        filteredGcodeFiles.map((file) => {
                          const lastJob =
                            latestGcodeHistoryByFilename.get(file.path) ?? latestGcodeHistoryByFilename.get(file.name);

                          return (
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
                                {lastJob && (
                                  <span className="gcode-row-status-line">
                                    <span className={printStatusClassName(lastJob.status)}>
                                      {printStatusLabel(lastJob.status)}
                                    </span>
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })
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
                              {formatTimestamp(job.startTime)}
                            </small>
                            <span className="gcode-row-status-line">
                              <span className={printStatusClassName(job.status)}>{printStatusLabel(job.status)}</span>
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <aside className={selectedGcodeItem ? "gcode-detail-panel open" : "gcode-detail-panel"}>
                    {selectedGcodeItem ? (
                      <>
                        <div className="gcode-detail-header">
                          <div className="gcode-detail-title">
                            <h3 title={selectedGcodeName(selectedGcodeItem)}>{selectedGcodeName(selectedGcodeItem)}</h3>
                            <p title={selectedGcodePath(selectedGcodeItem)}>{selectedGcodePath(selectedGcodeItem)}</p>
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
                            {selectedGcodeItem.type === "file" && (
                              <button
                                className="icon-button danger gcode-delete-button"
                                type="button"
                                disabled={
                                  deletingGcodePath === selectedGcodeItem.item.path ||
                                  startingPrint ||
                                  printerStatus?.printing
                                }
                                title={printerStatus?.printing ? t("errors.restartPrinting") : t("actions.deleteFile")}
                                aria-label={printerStatus?.printing ? t("errors.restartPrinting") : t("actions.deleteFile")}
                                onClick={() => void deleteSelectedGcode()}
                              >
                                <MdDelete className="action-icon plain-action-icon" />
                              </button>
                            )}
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
                                <dd>
                                  <span className={printStatusClassName(selectedGcodeItem.item.status)}>
                                    {printStatusLabel(selectedGcodeItem.item.status)}
                                  </span>
                                </dd>
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
                <div className="modal-header-actions">
                  <button
                    className="modal-icon-button"
                    type="button"
                    title={t("actions.clearConsoleHistory")}
                    aria-label={t("actions.clearConsoleHistory")}
                    disabled={klipperConsoleTimeline.length === 0}
                    onClick={() => {
                      setKlipperConsoleLog([]);
                      setKlipperConsoleClearedAt(Date.now());
                    }}
                  >
                    <MdDelete className="action-icon plain-action-icon danger-action-icon" />
                  </button>
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
              </div>
              <form className="klipper-console-body" onSubmit={sendKlipperConsoleCommand}>
                <p className="setting-help">{t("klipperConsole.help")}</p>
                <label className="klipper-console-field">
                  <span>{t("panels.klipperConsole")}</span>
                  <textarea
                    ref={klipperConsoleInputRef}
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
                <div className="klipper-console-tabs" role="tablist">
                  <button
                    className={klipperConsoleTab === "console" ? "klipper-console-tab active" : "klipper-console-tab"}
                    type="button"
                    role="tab"
                    aria-selected={klipperConsoleTab === "console"}
                    onClick={() => setKlipperConsoleTab("console")}
                  >
                    {t("klipperConsole.console")}
                  </button>
                  <button
                    className={klipperConsoleTab === "favorites" ? "klipper-console-tab active" : "klipper-console-tab"}
                    type="button"
                    role="tab"
                    aria-selected={klipperConsoleTab === "favorites"}
                    onClick={() => setKlipperConsoleTab("favorites")}
                  >
                    {t("klipperConsole.favorites")}
                  </button>
                </div>
                {klipperConsoleTab === "console" ? (
                  <section className="klipper-console-panel" aria-label={t("klipperConsole.output")}>
                    <div className="klipper-console-panel-title">{t("klipperConsole.output")}</div>
                    <div className="klipper-console-timeline">
                      {klipperGcodeStoreLoading && klipperConsoleTimeline.length === 0 ? (
                        <div className="panel-loading-state" role="status" aria-live="polite">
                          <span>{t("loading.title")}</span>
                          <div className="panel-loading-bar" />
                        </div>
                      ) : klipperConsoleTimeline.length === 0 ? (
                        <p className="empty-note">{t("klipperConsole.noOutput")}</p>
                      ) : (
                        klipperConsoleTimeline.map((item) =>
                          item.kind === "store" ? (
                            <article key={item.id} className={`klipper-store-entry ${item.entry.type}`}>
                              <time>{formatTimestamp(item.entry.time)}</time>
                              <KlipperStoreMessage message={item.entry.message} />
                            </article>
                          ) : (
                            <article key={item.id} className={`klipper-console-entry ${item.entry.status}`}>
                              <div className="klipper-console-entry-header">
                                <span>
                                  {item.entry.status === "sent" ? t("klipperConsole.sent") : t("klipperConsole.error")}
                                </span>
                                <time>{item.entry.timestamp}</time>
                              </div>
                              <pre>{item.entry.script}</pre>
                              <p>{item.entry.message}</p>
                              <div className="klipper-command-actions">
                                <button
                                  type="button"
                                  title={t("actions.editCommand")}
                                  aria-label={t("actions.editCommand")}
                                  onClick={() => editKlipperConsoleCommand(item.entry.script)}
                                >
                                  <MdEdit className="klipper-command-icon" />
                                </button>
                                <button
                                  type="button"
                                  title={t("actions.runCommand")}
                                  aria-label={t("actions.runCommand")}
                                  disabled={sendingKlipperCommand}
                                  onClick={() => void sendKlipperScript(item.entry.script)}
                                >
                                  <FaPlay className="klipper-command-icon accent" />
                                </button>
                                <button
                                  type="button"
                                  title={
                                    favoriteScriptSet.has(item.entry.script)
                                      ? t("actions.removeFavoriteCommand")
                                      : t("actions.favoriteCommand")
                                  }
                                  aria-label={
                                    favoriteScriptSet.has(item.entry.script)
                                      ? t("actions.removeFavoriteCommand")
                                      : t("actions.favoriteCommand")
                                  }
                                  onClick={() => toggleKlipperFavorite(item.entry.script)}
                                >
                                  {favoriteScriptSet.has(item.entry.script) ? (
                                    <MdStar className="klipper-command-icon favorite" />
                                  ) : (
                                    <MdStarBorder className="klipper-command-icon" />
                                  )}
                                </button>
                              </div>
                            </article>
                          )
                        )
                      )}
                    </div>
                  </section>
                ) : (
                  <div className="klipper-console-favorites">
                    <label className="macro-search-field">
                      <FcSearch className="action-icon" />
                      <input
                        value={klipperFavoriteSearch}
                        placeholder={t("klipperConsole.favoriteSearch")}
                        onChange={(event) => setKlipperFavoriteSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setKlipperFavoriteSearch("");
                          }
                        }}
                      />
                      {klipperFavoriteSearch && (
                        <button
                          className="search-clear-button"
                          type="button"
                          title={t("actions.clearSearch")}
                          aria-label={t("actions.clearSearch")}
                          onClick={() => setKlipperFavoriteSearch("")}
                        >
                          <IoClose className="search-clear-icon" />
                        </button>
                      )}
                    </label>
                    <div className="klipper-console-log">
                      {filteredKlipperFavorites.length === 0 ? (
                        <p className="empty-note">{t("klipperConsole.noFavorites")}</p>
                      ) : (
                        filteredKlipperFavorites.map((favorite) => (
                          <article key={favorite.script} className="klipper-console-entry favorite-entry">
                            <div className="klipper-console-entry-header">
                              <span>{t("klipperConsole.favorites")}</span>
                              <time>{new Date(favorite.updatedAt).toLocaleString()}</time>
                            </div>
                            <pre>{favorite.script}</pre>
                            <div className="klipper-command-actions">
                              <button
                                type="button"
                                title={t("actions.editCommand")}
                                aria-label={t("actions.editCommand")}
                                onClick={() => editKlipperConsoleCommand(favorite.script)}
                              >
                                <MdEdit className="klipper-command-icon" />
                              </button>
                              <button
                                type="button"
                                title={t("actions.runCommand")}
                                aria-label={t("actions.runCommand")}
                                disabled={sendingKlipperCommand}
                                onClick={() => void sendKlipperScript(favorite.script)}
                              >
                                <FaPlay className="klipper-command-icon accent" />
                              </button>
                              <button
                                type="button"
                                title={t("actions.removeFavoriteCommand")}
                                aria-label={t("actions.removeFavoriteCommand")}
                                onClick={() => toggleKlipperFavorite(favorite.script)}
                              >
                                <MdStar className="klipper-command-icon favorite" />
                              </button>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </form>
            </section>
          </div>
        )}

        {optionsOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setOptionsOpen(false)}>
            <section
              className="options-modal settings-modal"
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
              <div className="modal-body options-body">
                <div className="options-tabs" role="tablist" aria-label={t("options.title")}>
                  <button className={optionsTab === "home" ? "options-tab active" : "options-tab"} type="button" role="tab" aria-selected={optionsTab === "home"} onClick={() => setOptionsTab("home")}>{t("homeGrid.tab")}</button>
                  <button
                    className={optionsTab === "general" ? "options-tab active" : "options-tab"}
                    type="button"
                    role="tab"
                    aria-selected={optionsTab === "general"}
                    onClick={() => setOptionsTab("general")}
                  >
                    {t("options.generalTab")}
                  </button>
                  <button
                    className={optionsTab === "theme" ? "options-tab active" : "options-tab"}
                    type="button"
                    role="tab"
                    aria-selected={optionsTab === "theme"}
                    onClick={() => setOptionsTab("theme")}
                  >
                    {t("options.themeTab")}
                  </button>
                  <button
                    className={optionsTab === "mcp" ? "options-tab active" : "options-tab"}
                    type="button"
                    role="tab"
                    aria-selected={optionsTab === "mcp"}
                    onClick={() => setOptionsTab("mcp")}
                  >
                    {t("options.mcpTab")}
                  </button>
                  <button className={optionsTab === "terminal" ? "options-tab active" : "options-tab"} type="button" role="tab"
                    aria-selected={optionsTab === "terminal"} onClick={() => setOptionsTab("terminal")}>{t("panels.terminal")}</button>
                </div>
                {optionsTab === "general" ? (
                  <div className="options-tab-panel" role="tabpanel">
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
                          preferences.setItem("klipper-editor-create-backup-on-save", String(checked));
                        }}
                      />
                      <span>{t("options.createBackupOnSave")}</span>
                    </label>
                    <p className="setting-help">{t("options.createBackupOnSaveHelp")}</p>
                    <label className="setting-checkbox">
                      <input
                        type="checkbox"
                        checked={sidebarCollapsed}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSidebarCollapsed(checked);
                          preferences.setItem(sidebarCollapsedKey, String(checked));
                        }}
                      />
                      <span>{t("options.startCollapsedSidebar")}</span>
                    </label>
                    <p className="setting-help">{t("options.startCollapsedSidebarHelp")}</p>
                    <label className="setting-field">
                      <span>{t("options.sectionPreviewDelay")}</span>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.25"
                        value={sectionPreviewDelay}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          const nextDelay = clamp(Number(event.target.value), 0, 10);
                          setSectionPreviewDelay(nextDelay);
                          preferences.setItem(sectionPreviewDelayKey, String(nextDelay));
                        }}
                      />
                    </label>
                    <p className="setting-help">{t("options.sectionPreviewDelayHelp")}</p>
                  </div>
                ) : (
                  <div className="options-tab-panel" role="tabpanel">
                    {optionsTab === "home" ? <>
                      <div className="home-widget-order">
                        {[...homeWidgets, ...availableHomeWidgets.filter((widget) => !homeWidgetSet.has(widget))].map((widget) => {
                          const index = homeWidgets.indexOf(widget);
                          return <div key={widget}>
                          <label className="setting-checkbox">
                            <input type="checkbox" checked={index >= 0} onChange={() => toggleHomeWidget(widget)} />
                            <span>{homeWidgetLabel(widget)}</span>
                          </label>
                          {([-1, 1] as const).map((direction) => <button key={direction} className="modal-icon-button" type="button"
                            title={t(direction < 0 ? "homeGrid.moveUp" : "homeGrid.moveDown")} aria-label={t(direction < 0 ? "homeGrid.moveUp" : "homeGrid.moveDown")}
                            disabled={index < 0 || index + direction < 0 || index + direction >= homeWidgets.length}
                            onClick={() => setHomeWidgets((current) => {
                              const next = [...current];
                              [next[index], next[index + direction]] = [next[index + direction], next[index]];
                              writeHomeWidgets(next);
                              return next;
                            })}>{direction < 0 ? <MdKeyboardArrowUp /> : <MdKeyboardArrowDown />}</button>)}
                        </div>; })}
                      </div>
                    </> : optionsTab === "terminal" ? <>
                      <label className="setting-checkbox">
                        <input type="checkbox" checked={terminalEnvEnabled || terminalConfiguredEnabled} disabled={terminalEnvEnabled || terminalModeSaving}
                          onChange={(event) => void updateTerminalEnabledSetting(event.target.checked)} />
                        <span>{t("options.enableTerminal")}</span>
                      </label>
                      <p className="setting-help">{terminalEnvEnabled ? t("options.enableTerminalEnvHelp") : t("options.enableTerminalHelp")}</p>
                      <label className="setting-field"><span>{t("pty.mode")}</span>
                        <select value={terminalMode} disabled={terminalModeSaving} onChange={(event) => void changeTerminalMode(event.target.value as "basic" | "pty")}>
                          <option value="basic">{t("pty.basic")}</option><option value="pty" disabled={!ptySupported}>{t("pty.interactive")}</option>
                        </select>
                      </label>
                      {!ptySupported && <p className="setting-help">{t("pty.unsupported")}</p>}
                      <p className="setting-help">{t("pty.settingsHelp")}</p>
                    </> : optionsTab === "theme" ? <>
                      <div className="setting-field">
                        <span>{t("options.themeLogo")}</span>
                        <div className="theme-logo-grid">
                          {availableThemeLogos.map((logoOption) => {
                            const isActive = mainsailTheme.theme === logoOption.theme;
                            return (
                              <button
                                key={logoOption.theme}
                                type="button"
                                className={isActive ? "theme-logo-option active" : "theme-logo-option"}
                                aria-pressed={isActive}
                                onClick={() =>
                                  saveEditorTheme({
                                    ...mainsailTheme,
                                    theme: logoOption.theme,
                                    logo: logoOption.theme === "orbys" ? mainsailTheme.primary : mainsailTheme.logo,
                                    logoUrl: logoOption.logoUrl,
                                    logoMask: logoOption.logoMask,
                                    logoPath: null
                                  })
                                }
                              >
                                <span
                                  className="theme-logo-option-preview"
                                  style={
                                    logoOption.logoMask
                                      ? {
                                          maskImage: `url(${apiPath(logoOption.logoUrl)})`,
                                          WebkitMaskImage: `url(${apiPath(logoOption.logoUrl)})`,
                                          maskPosition: "center",
                                          WebkitMaskPosition: "center",
                                          maskRepeat: "no-repeat",
                                          WebkitMaskRepeat: "no-repeat",
                                          maskSize: "contain",
                                          WebkitMaskSize: "contain",
                                          background: mainsailTheme.primary
                                        }
                                      : undefined
                                  }
                                >
                                  {!logoOption.logoMask && <img src={apiPath(logoOption.logoUrl)} alt="" />}
                                </span>
                                <span className="theme-logo-option-label">{logoOption.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <p className="setting-help">{t("options.themeLogoHelp")}</p>
                      <label className="setting-field">
                        <span>{t("options.themeColor")}</span>
                        <input
                          type="color"
                          value={normalizeCssColor(mainsailTheme.primary, fallbackMainsailTheme.primary)}
                          onChange={(event) => {
                            const nextColor = event.target.value;
                            saveEditorTheme({ ...mainsailTheme, primary: nextColor, logo: nextColor });
                          }}
                        />
                      </label>
                      <p className="setting-help">{t("options.themeColorHelp")}</p>
                      <button
                        className="dialog-button"
                        type="button"
                        disabled={themeImporting}
                        onClick={() => void importMainsailTheme()}
                      >
                        {themeImporting ? t("options.importingFromMainsail") : t("options.importFromMainsail")}
                      </button>
                      <p className="setting-help">{t("options.importFromMainsailHelp")}</p>
                    </> : <section className="mcp-tunnel-card" aria-label={t("options.mcpTunnelTitle")}>
                      <div className="mcp-tunnel-heading">
                        <div>
                          <strong>{t("options.mcpTunnelTitle")}</strong>
                          <p>{t("options.mcpTunnelHelp")}</p>
                        </div>
                        <span className={mcpTunnel.running ? "mcp-tunnel-status running" : "mcp-tunnel-status"}>
                          {mcpTunnel.running
                            ? t("options.mcpTunnelRunning")
                            : mcpTunnel.starting
                              ? t("options.mcpTunnelStarting")
                              : t("options.mcpTunnelStopped")}
                        </span>
                      </div>
                      <div className="setting-field mcp-tunnel-url">
                        <label htmlFor="mcp-tunnel-url-input">{t("options.mcpTunnelUrl")}</label>
                        <div className="mcp-url-copy-row">
                          <input id="mcp-tunnel-url-input" ref={mcpUrlInputRef} readOnly value={mcpTunnel.url} placeholder="https://.../mcp" />
                          <button className="modal-icon-button" type="button" disabled={!mcpTunnel.url}
                            title={t("actions.copyMcpUrl")} aria-label={t("actions.copyMcpUrl")}
                            onClick={() => void copyMcpTunnelUrl()}><MdContentCopy className="action-icon" /></button>
                        </div>
                        {mcpCopyMessage && <span role="status">{mcpCopyMessage}</span>}
                      </div>
                      <label className="setting-field mcp-tunnel-url">
                        <span>{t("options.mcpTunnelToken")}</span>
                        <input readOnly value={mcpTunnel.token} placeholder="-" />
                      </label>
                      {mcpTunnel.error && <p className="mcp-tunnel-error">{mcpTunnel.error}</p>}
                      {cloudflaredInstallResult && <p role="status" className="cloudflared-install-result">{cloudflaredInstallResult}</p>}
                      <div className="mcp-tunnel-actions">
                        {(cloudflaredInstalled === false || installingCloudflared) && <button type="button" className="dialog-button" disabled={installingCloudflared || mcpTunnelBusy || mcpTunnel.running || mcpTunnel.starting}
                          onClick={async () => {
                            setInstallingCloudflared(true);
                            setCloudflaredInstallResult(t("mcp.installing"));
                            try {
                              const response = await fetch(apiPath("/api/mcp-tunnel/install"), { method: "POST" });
                              const payload = await response.json();
                              if (!response.ok || !payload.installed) throw new Error(payload.error);
                              setCloudflaredInstallResult(`${t("mcp.installed")}: ${payload.version}`);
                              setCloudflaredInstalled(true);
                              setMcpTunnel((current) => ({ ...current, error: "" }));
                            } catch (error) {
                              setCloudflaredInstallResult(`${t("mcp.installFailed")}: ${error instanceof Error ? error.message : String(error)}`);
                            } finally { setInstallingCloudflared(false); }
                          }}><FcDownload className="action-icon" />{t(installingCloudflared ? "mcp.installing" : "mcp.install")}</button>}
                        <button
                          className="dialog-button"
                          type="button"
                          disabled={installingCloudflared || mcpTunnelBusy || mcpTunnel.starting || mcpTunnel.running}
                          onClick={() => void startMcpTunnel()}
                        >
                          <FcUpload className="dialog-button-icon" />
                          {t("actions.startMcpTunnel")}
                        </button>
                        <button
                          className="dialog-button"
                          type="button"
                          disabled={mcpTunnelBusy || (!mcpTunnel.running && !mcpTunnel.starting)}
                          onClick={() => void stopMcpTunnel()}
                        >
                          <FcDownload className="dialog-button-icon" />
                          {t("actions.stopMcpTunnel")}
                        </button>
                      </div>
                    </section>}
                  </div>
                )}
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
            <div className="section-preview-body">
              <CodeMirror
                value={sectionPreview.section.content || t("empty.sectionContent")}
                height="100%"
                maxHeight="100%"
                theme={vscodeDark}
                extensions={[
                  cfgLanguage,
                  syntaxHighlighting(klipperHighlightStyle),
                  EditorView.editable.of(false),
                  EditorView.theme({
                    "&": { height: "100%" },
                    ".cm-scroller": { overflowY: "auto", overflowX: "auto" }
                  })
                ]}
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                  highlightSelectionMatches: false
                }}
              />
            </div>
          </div>
        )}

        {printerStatus?.printing && (
          <button
            className={sectionsNavigating && activeFile ? "floating-print-status compact" : "floating-print-status"}
            type="button"
            title={t("printStatus.title")}
            aria-label={t("printStatus.title")}
            style={{ "--print-progress": `${printerStatus.progress * 360}deg` } as CSSProperties}
            onMouseEnter={() => setSectionsNavigating(false)}
            onFocus={() => setSectionsNavigating(false)}
            onClick={() => setPrintStatusOpen(true)}
          >
            <span className="floating-print-ring" aria-hidden="true" />
            <BsPrinterFill className="floating-print-icon" />
            <span className="floating-print-percent">{formatProgress(printerStatus.progress)}</span>
          </button>
        )}

        {printStatusOpen && printerStatus && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setPrintStatusOpen(false)}>
            <section
              className="options-modal print-status-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="print-status-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="print-status-title">{t("printStatus.title")}</h2>
                {xyRecorderEnabled && (
                  <button
                    className={xyRecorderPanelOpen ? "xy-recorder-header-toggle active" : "xy-recorder-header-toggle"}
                    type="button"
                    title={xyRecorderPanelOpen ? t("printStatus.xyPanelClose") : t("printStatus.xyPanelOpen")}
                    aria-label={xyRecorderPanelOpen ? t("printStatus.xyPanelClose") : t("printStatus.xyPanelOpen")}
                    onClick={() => setXyRecorderPanelOpen((open) => !open)}
                  >
                    XY
                  </button>
                )}
                <button
                  className="modal-close"
                  type="button"
                  title={t("options.close")}
                  aria-label={t("options.close")}
                  onClick={() => setPrintStatusOpen(false)}
                >
                  x
                </button>
              </div>
              <div className="print-status-body">
                <div className="print-status-preview">
                  {currentPrintThumbnail ? (
                    <img
                      className="print-status-thumbnail"
                      src={currentPrintThumbnailUrl}
                      alt=""
                    />
                  ) : (
                    <div className="print-status-thumbnail-empty">
                      <BsPrinterFill />
                      <span>{t("gcodes.noThumbnail")}</span>
                    </div>
                  )}
                  <div className="print-status-progress">
                    <strong>{formatProgress(printerStatus.printDetails.progress)}</strong>
                    <span>{printerStatus.filename || "-"}</span>
                    <div className="print-status-progress-bar" aria-hidden="true">
                      <span style={{ width: `${printerStatus.printDetails.progress * 100}%` }} />
                    </div>
                    <div className="print-status-actions">
                      <button
                        className="print-status-action"
                        type="button"
                        disabled={runningPrintAction !== null}
                        title={printerStatus.printState === "paused" ? t("actions.resumePrint") : t("actions.pausePrint")}
                        aria-label={printerStatus.printState === "paused" ? t("actions.resumePrint") : t("actions.pausePrint")}
                        onClick={() => void runPrintControl(printerStatus.printState === "paused" ? "resume" : "pause")}
                      >
                        {printerStatus.printState === "paused" ? <FaPlay /> : <FaPause />}
                      </button>
                      <button
                        className="print-status-action danger"
                        type="button"
                        disabled={runningPrintAction !== null}
                        title={t("actions.cancelPrint")}
                        aria-label={t("actions.cancelPrint")}
                        onClick={() => void runPrintControl("cancel")}
                      >
                        <FaStop />
                      </button>
                      <button
                        className={xyRecorderEnabled ? "print-status-action active" : "print-status-action"}
                        type="button"
                        title={xyRecorderEnabled ? t("printStatus.xyRecorderStop") : t("printStatus.xyRecorderStart")}
                        aria-label={xyRecorderEnabled ? t("printStatus.xyRecorderStop") : t("printStatus.xyRecorderStart")}
                        onClick={() => {
                          setXyRecorderEnabled((enabled) => {
                            const nextEnabled = !enabled;
                            setXyRecorderPanelOpen(nextEnabled);
                            return nextEnabled;
                          });
                        }}
                      >
                        XY
                      </button>
                    </div>
                  </div>
                </div>
                <div className="print-status-details">
                  <h3>{t("printStatus.details")}</h3>
                  <div className="print-status-table" role="table">
                    {[
                      [t("gcodes.status"), printerStatus.printDetails.state],
                      [t("printStatus.message"), printerStatus.printDetails.message || "-"],
                      [t("gcodes.printDuration"), formatDuration(printerStatus.printDetails.printDuration)],
                      [t("gcodes.totalDuration"), formatDuration(printerStatus.printDetails.totalDuration)],
                      [t("gcodes.filament"), formatMillimeters(printerStatus.printDetails.filamentUsed)],
                      [t("gcodes.estimatedTime"), formatDuration(printerStatus.printDetails.metadata?.estimatedTime ?? 0)],
                      [t("gcodes.layerHeight"), formatMillimeters(printerStatus.printDetails.metadata?.layerHeight)],
                      [t("gcodes.objectHeight"), formatMillimeters(printerStatus.printDetails.metadata?.objectHeight)],
                      [
                        t("printStatus.filePosition"),
                        `${formatBytes(printerStatus.printDetails.filePosition)}${
                          printerStatus.printDetails.fileSize > 0
                            ? ` / ${formatBytes(printerStatus.printDetails.fileSize)}`
                            : ""
                        }`
                      ],
                      [
                        t("printStatus.layers"),
                        `${printerStatus.printDetails.info.currentLayer ?? "-"}${
                          printerStatus.printDetails.info.totalLayer ? ` / ${printerStatus.printDetails.info.totalLayer}` : ""
                        }`
                      ]
                    ].map(([label, value]) => (
                      <div className="print-status-row" role="row" key={label}>
                        <div className="print-status-cell label" role="cell">{label}</div>
                        <div className="print-status-cell value" role="cell">{value}</div>
                      </div>
                    ))}
                  </div>
                  <details className="print-status-raw">
                    <summary>{t("printStatus.raw")}</summary>
                    <pre>{JSON.stringify(printerStatus.printDetails.raw, null, 2)}</pre>
                  </details>
                </div>
              </div>
              {xyRecorderEnabled && (
                <aside className={xyRecorderPanelOpen ? "xy-recorder-drawer open" : "xy-recorder-drawer"}>
                  <button
                    className="xy-recorder-edge-toggle"
                    type="button"
                    title={xyRecorderPanelOpen ? t("printStatus.xyPanelClose") : t("printStatus.xyPanelOpen")}
                    aria-label={xyRecorderPanelOpen ? t("printStatus.xyPanelClose") : t("printStatus.xyPanelOpen")}
                    onClick={() => setXyRecorderPanelOpen((open) => !open)}
                  >
                    XY
                  </button>
                  <div className="print-status-recorder">
                    <div className="print-status-recorder-header">
                      <h3>{t("printStatus.xyRecorder")}</h3>
                      <span className="recorder-state active">{t("printStatus.xyRecorderOn")}</span>
                    </div>
                    <div className="print-status-table compact" role="table">
                      {[
                        [t("printStatus.snapshots"), String(xySnapshots.length)],
                        [
                          t("printStatus.lastSnapshot"),
                          latestXySnapshot ? new Date(latestXySnapshot.timestamp).toLocaleTimeString() : "-"
                        ],
                        [
                          t("printStatus.xy"),
                          latestXySnapshot
                            ? `X ${formatCoordinate(latestXySnapshot.x)} / Y ${formatCoordinate(latestXySnapshot.y)}`
                            : "-"
                        ],
                        [
                          t("printStatus.recoveryZ"),
                          latestXySnapshot
                            ? `L${latestXySnapshot.layer ?? "-"} / Z ${formatCoordinate(latestXySnapshot.z)} mm`
                            : "-"
                        ],
                        [
                          t("printStatus.speed"),
                          latestXySnapshot ? `${formatCoordinate(latestXySnapshot.speed)} mm/s` : "-"
                        ],
                        [
                          t("printStatus.suggestedInterval"),
                          latestXySnapshot ? `${latestXySnapshot.suggestedIntervalMs} ms` : "-"
                        ],
                        [
                          t("printStatus.filePosition"),
                          latestXySnapshot ? formatBytes(latestXySnapshot.filePosition) : "-"
                        ],
                        [
                          t("printStatus.currentObject"),
                          latestXySnapshot?.excludeObject.currentObject || "-"
                        ],
                        [
                          t("printStatus.excludedObjects"),
                          latestXySnapshot
                            ? latestXySnapshot.excludeObject.excludedObjects.length > 0
                              ? latestXySnapshot.excludeObject.excludedObjects.join(", ")
                              : "-"
                            : "-"
                        ]
                      ].map(([label, value]) => (
                        <div className="print-status-row" role="row" key={label}>
                          <div className="print-status-cell label" role="cell">{label}</div>
                          <div className="print-status-cell value" role="cell">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              )}
            </section>
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
