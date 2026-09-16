# 08 — Contratos de dominio TypeScript

```ts
export interface PrintSession {
  sessionId: string;
  printerId: string;
  filename: string;
  filePath: string;
  fileSize?: number;
  fileMtime?: number;
  fileSha256?: string;
  slicer?: string;
  slicerVersion?: string;
}

export interface LayerDescriptor {
  number: number;
  z: number;
  height?: number;
  startLine: number;
  startByte?: number;
  endLine?: number;
  endByte?: number;
}

export interface GcodeObject {
  name: string;
  center?: [number, number];
  polygon?: Array<[number, number]>;
}

export interface RecoveryCheckpoint {
  schemaVersion: 1;
  checkpointId: string;
  session: PrintSession;
  layer: {
    number: number;
    z: number;
    height?: number;
  };
  machine: {
    activeTool?: string;
    activeExtruder?: string;
    idexMode?: "SINGLE" | "COPY" | "MIRROR" | "UNKNOWN";
    excludedObjects: string[];
    currentObject?: string | null;
    absoluteCoordinates?: boolean;
    absoluteExtrude?: boolean;
    gcodeOffset?: { x: number; y: number; z: number };
    heaterTargets?: Record<string, number>;
    fanSpeeds?: Record<string, number>;
    pressureAdvance?: Record<string, number>;
    speedFactor?: number;
    flowFactor?: number;
  };
  integrity: {
    fileIdentityVerified: boolean;
    complete: boolean;
    warnings: string[];
  };
}

export interface UserRecoveryInput {
  measuredHeightMm?: number;
  selectedLayer?: number;
  xyAdjustment?: { x: number; y: number };
  confirmPartStillAttached: boolean;
  confirmBedNotMoved?: boolean;
}

export interface RecoveryPlan {
  version: 1;
  session: PrintSession;
  resume: {
    layer: number;
    z: number;
    strategy: "replay-layer";
    sourceStartLine: number;
    sourceStartByte?: number;
  };
  machine: {
    tool: string;
    idexMode?: string;
    excludedObjects: string[];
    targetBed?: number;
    releaseNozzleTemp?: number;
    printNozzleTemp?: number;
    xyAdjustment?: { x: number; y: number };
  };
  phases: RecoveryPhase[];
  warnings: Diagnostic[];
  blockers: Diagnostic[];
}

export type RecoveryPhase =
  | { type: "restore-object-definitions" }
  | { type: "establish-z"; z: number }
  | { type: "preheat-release"; tool: string; temperature: number }
  | { type: "lift-z"; delta: number }
  | { type: "home-xy" }
  | { type: "activate-tool"; tool: string }
  | { type: "move-to-safe-location"; x: number; y: number }
  | { type: "restore-runtime-state" }
  | { type: "apply-exclusions"; names: string[] }
  | { type: "xy-registration" }
  | { type: "resume-gcode" };

export interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error" | "blocker";
  message: string;
  details?: Record<string, unknown>;
}
```

## Interfaces

```ts
export interface GcodeParser {
  inspect(source: GcodeSource): Promise<GcodeInspection>;
  indexLayers(source: GcodeSource): Promise<LayerDescriptor[]>;
  buildStateAtLayer(source: GcodeSource, layer: number): Promise<GcodeStateSnapshot>;
}

export interface CheckpointStore {
  save(checkpoint: RecoveryCheckpoint): Promise<void>;
  getLatest(printerId: string): Promise<RecoveryCheckpoint | null>;
  listRecent(printerId: string, limit?: number): Promise<RecoveryCheckpoint[]>;
}

export interface RecoveryPlanner {
  plan(input: RecoveryPlannerInput): RecoveryPlan;
}

export interface RecoveryRenderer {
  render(input: RenderInput): Promise<RenderedRecovery>;
}

export interface MoonrakerRecoveryAdapter {
  getPrinterState(): Promise<PrinterRuntimeState>;
  getInterruptedJobs(): Promise<InterruptedPrintJob[]>;
  getFileMetadata(filename: string): Promise<GcodeFileMetadata>;
  runGcode(script: string): Promise<void>;
  startPrint(filename: string): Promise<void>;
}
```

## Diagnostic codes iniciales

```text
RECOVERY_FILE_CHANGED
RECOVERY_LAYER_NOT_FOUND
RECOVERY_TOOL_UNKNOWN
RECOVERY_XY_NOT_CONFIRMED
RECOVERY_UNSAFE_HOMING
RECOVERY_EXTRUSION_STATE_UNKNOWN
RECOVERY_Z_PLANE_UNVERIFIED
RECOVERY_EXCLUDED_OBJECT_UNDEFINED
```
