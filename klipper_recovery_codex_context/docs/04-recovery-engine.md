# 04 — Recovery Engine

## Pipeline

```text
LOAD
 -> VERIFY FILE
 -> PARSE/INDEX
 -> RESOLVE LAYER
 -> RECONSTRUCT STATE
 -> BUILD PLAN
 -> SAFETY VALIDATE
 -> RENDER
 -> OPTIONAL EXECUTION
```

## Estrategia MVP

```ts
strategy = "replay-layer"
```

No usar `virtual_sdcard.file_position` como punto de ejecución ciego. Puede guardarse como evidencia, pero el estado previo debe reconstruirse.

## Selección de capa

1. user-selected;
2. checkpoint;
3. nearest real Z por medición.

Ejemplo:

```text
measured 13.93 -> real Z 13.9 -> layer 69
```

## Fases del plan

```ts
type RecoveryPhase =
  | { type: "restore-object-definitions" }
  | { type: "establish-z"; z: number }
  | { type: "preheat-release"; tool: string; temperature: number }
  | { type: "lift-z"; delta: number }
  | { type: "home-xy" }
  | { type: "activate-tool"; tool: string }
  | { type: "move-to-safe-location"; x: number; y: number }
  | { type: "restore-thermal-state" }
  | { type: "restore-runtime-state" }
  | { type: "apply-exclusions"; names: string[] }
  | { type: "xy-registration" }
  | { type: "resume-gcode" };
```

## Preámbulo conceptual

```gcode
G90
G21
M83

SET_KINEMATIC_POSITION Z=13.9 SET_HOMED=Z

M140 S80
M109 S150 T1

G91
G1 Z2 F600
G90

G28 X Y
T1

; safe XY at clearance
; restore temperatures/state
; wait for XY confirmation
; restore exclusions
; continue original layer
```

No hardcodear estos valores en core. Provienen de `MachineRecoveryProfile` + checkpoint.

## Z físico vs Z de capa

Distinguir:

```text
measuredPartHeight
selectedLayerZ
currentPhysicalToolheadZ
```

`SET_KINEMATIC_POSITION` solo se permite cuando la estrategia de máquina lo autoriza.

## Extrusión

No insertar mágicamente `E-0.8`. Construir un modelo de resume de extrusión que considere M82/M83, `G92 E`, retract/unretract alrededor del punto de corte. Si no es resoluble, warning o blocker.

## Objetos

Orden:

1. definitions;
2. exclusions;
3. segmento original.

## START_PRINT

Analizar parámetros útiles, pero nunca ejecutar la llamada original durante recovery.

## Output

Cabecera con:

```text
source file/hash
checkpoint id
resume layer/Z
generator version
warnings
```
