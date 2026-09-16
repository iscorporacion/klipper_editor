# 03 — Especificación del parser G-code

## Objetivo

Entender la estructura necesaria para recovery sin implementar todo G-code.

## Streaming

```ts
for await (const line of source) {
  parseLine(line)
}
```

Debe manejar archivos grandes sin cargarlos completos en RAM.

## ParsedLine

```ts
interface ParsedLine {
  lineNumber: number;
  byteOffset: number;
  raw: string;
  command?: string;
  params: Record<string, string | number>;
  comment?: string;
}
```

## Eventos semánticos

```ts
type GcodeEvent =
  | LayerChangeEvent
  | ObjectDefineEvent
  | ObjectStartEvent
  | ObjectEndEvent
  | ToolSelectEvent
  | MoveEvent
  | TemperatureEvent
  | FanEvent
  | PressureAdvanceEvent
  | CoordinateModeEvent
  | ExtrusionModeEvent
  | OffsetEvent
  | MacroCallEvent
  | UnknownEvent;
```

## Capas

Compatibilidad inicial Orca/RatOS:

```text
;LAYER_CHANGE
;Z:13.9
;HEIGHT:0.2
_ON_LAYER_CHANGE LAYER=69
```

El archivo es la autoridad. No inferir número de capa por división simple.

Indexar:

```ts
interface LayerDescriptor {
  number: number;
  z: number;
  height?: number;
  startLine: number;
  startByte?: number;
  endLine?: number;
  endByte?: number;
}
```

## Nearest Z

```ts
findNearestLayers(measuredZ, layers)
```

devuelve lower/nearest/upper/delta. En empate, preferir inferior por defecto.

## Objetos

Parsear:

```text
EXCLUDE_OBJECT_DEFINE
EXCLUDE_OBJECT_START
EXCLUDE_OBJECT_END
EXCLUDE_OBJECT NAME=
```

Preservar Unicode y nombres exactos.

## Herramientas y RatOS

Reconocer `T0/T1`, pero también:

```text
INITIAL_TOOL=1
USED_TOOLS=1
IDEX_MODE=SINGLE
; Removed by RatOS post processor: T1
```

Diseñar adapters:

```ts
GenericKlipperAdapter
OrcaSlicerAdapter
RatOSAdapter
```

## Estado dinámico a rastrear

```text
G90/G91
M82/M83
G92
SET_GCODE_OFFSET
SET_PRESSURE_ADVANCE
SET_VELOCITY_LIMIT
M220/M221
M104/M109/M140/M190
M106/M107
T0/T1
macros de carriage/IDEX conocidas
```

## Unknown commands

Nunca descartar silenciosamente. Si un comando desconocido previo a resume podría modificar estado, crear warning.

## Fixture crítico

Debe existir un fixture con:

```text
first layer 0.3
layer height 0.2
layer 69 = Z 13.9
layer 70 = Z 14.1
T1
IDEX SINGLE
4 objects
2 excluded
```
