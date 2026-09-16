# 07 — Testing y roadmap

## Tests

### Unit

Parser:

- layers/Z;
- objects;
- tool;
- temperatures;
- G90/G91;
- M82/M83;
- G92;
- offsets;
- pressure advance.

Planner:

- nearest Z;
- blockers;
- exclusions;
- phases;
- tool/IDEX.

Renderer:

- no `START_PRINT` activo;
- definitions antes de exclusions;
- comienza en capa correcta;
- original inmutable.

### Golden tests

```text
fixture.gcode + checkpoint.json + request.json
=> expected.recovery.gcode
```

### Property tests

- selected layer always exists;
- no generic `G28` if profile forbids it;
- release wait occurs before XY;
- excluded object must be defined;
- output never mutates source.

### Integration Moonraker mock

Simular history, printer state, metadata, WebSocket y remote method.

### Hardware-in-loop

1. sin pieza;
2. pieza pequeña;
3. recovery interrumpida controlada;
4. varias pruebas de repetibilidad XY;
5. solo después, piezas largas.

## Roadmap

### Fase 0

Mapear repositorio real de Klipper Editor.

### Fase 1

Parser/indexador + nearest Z.

### Fase 2

Domain + planner + validators.

### Fase 3

Renderer dry-run.

### Fase 4

Moonraker read-only + candidates.

### Fase 5

Checkpoint agent + persistencia.

### Fase 6

Wizard read-only hasta plan listo.

### Fase 7

Ejecutar fases físicas individualmente: preheat/lift/home/tool/safe move.

### Fase 8

XY registration.

### Fase 9

Resume controlado.

### Fase 10

Hardening: power-loss, corrupted checkpoint, changed file, Unicode, huge G-code, network loss.

## Criterio mínimo antes de producción

- tests parser/planner/renderer;
- golden fixture realista;
- Moonraker mock;
- 10 recoveries sin pieza;
- 5 recoveries con piezas pequeñas;
- medición repetibilidad XY.
