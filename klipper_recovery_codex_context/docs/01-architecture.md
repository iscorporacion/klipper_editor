# 01 — Arquitectura

## Componentes

### 1. Recovery Agent / backend local

Proceso persistente junto a Moonraker o integrado en el backend existente de Klipper Editor.

Responsabilidades:

- WebSocket Moonraker;
- cache de estado;
- recibir eventos de checkpoint;
- persistencia atómica;
- exponer API al frontend;
- nunca parsear archivos enormes dentro del callback de capa.

### 2. G-code Parser

Parser streaming que produce eventos semánticos. No basar el core en regex globales.

### 3. Recovery Planner

Entrada:

```text
Parsed G-code + Checkpoint + UserInput + MachineProfile
```

Salida:

```text
RecoveryPlan
```

No habla con Moonraker.

### 4. Safety Validator

Convierte inconsistencias en warnings o blockers.

### 5. Recovery Renderer

Genera un archivo nuevo con preámbulo seguro + segmento original desde capa elegida.

### 6. Moonraker Adapter

Lectura de history/status/files y, en fase posterior, ejecución.

### 7. UI Wizard

Presenta recovery paso a paso y nunca oculta blockers.

## Integración de checkpoint recomendada

Usar un remote method registrado por un agente Moonraker y llamado desde macro con:

```jinja
{action_call_remote_method(
  "klipper_editor_recovery_checkpoint",
  layer=...,
  z=...
)}
```

El evento debe ser mínimo; el agente completa el snapshot desde su cache.

## Persistencia

MVP:

```text
recovery/
  latest.json
  previous-1.json
  previous-2.json
  generated/
```

Escritura atómica:

```text
write tmp -> flush -> rename
```

No guardar un archivo permanente por cada capa salvo modo diagnóstico.

## Callback de capa

NO hacer:

- hash de 100 MB;
- parseo completo;
- compresión;
- generación de recovery;
- queries HTTP encadenadas lentas.

Solo capturar/encolar snapshot.
