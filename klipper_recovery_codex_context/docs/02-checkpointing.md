# 02 — Checkpointing por capa

## ¿Añade carga significativa?

Con una arquitectura correcta, no. Una impresión de 1,000 capas produce 1,000 eventos, separados normalmente por segundos o minutos. El volumen lógico total es pequeño.

El riesgo real es hacer **I/O síncrono pesado** o trabajo de CPU dentro del cambio de capa.

## Recomendación

1. `_ON_LAYER_CHANGE` emite `layer` + `z`.
2. Recovery Agent ya mantiene cache de Moonraker.
3. Construye snapshot pequeño.
4. Reemplaza checkpoint pendiente si llega uno más nuevo.
5. Escritor background persiste `latest.json`.
6. Mantener opcionalmente los 2–3 anteriores.

## Por qué no `SAVE_VARIABLE` como principal

Puede servir como fallback mínimo, pero escribir el archivo de variables por cada capa no es necesario si tenemos agente. Además, guardar estado grande en macros complica mantenimiento y versionado.

Fallback mínimo posible:

```text
recovery_layer
recovery_z
recovery_session_hash
```

## Momento exacto

El checkpoint representa **inicio de capa**.

Ejemplo:

```gcode
;LAYER_CHANGE
;Z:13.9
G92 E0
_ON_LAYER_CHANGE LAYER=69
```

Al disparar la capa 69 se guarda:

```text
resume layer=69
resume Z=13.9
```

Si el corte ocurre a mitad de la capa, la capa 69 se repite.

## Campos mínimos

```json
{
  "schemaVersion": 1,
  "filename": "...",
  "layer": 69,
  "z": 13.9,
  "tool": "T1",
  "excludedObjects": []
}
```

## Campos recomendados

- session id;
- filename/path;
- size/mtime/hash;
- layer/z/height;
- active tool/extruder;
- IDEX/carriages;
- excluded objects/current object;
- G90/G91;
- M82/M83;
- `gcode_move.homing_origin` / offsets relevantes;
- heater targets;
- fan;
- pressure advance;
- speed factor;
- flow factor;
- virtual_sdcard position para diagnóstico;
- version/integrity/warnings.

## Identidad de sesión

Nunca asociar checkpoint solo por filename.

Mínimo:

```text
filename + size + mtime
```

Ideal: SHA-256 calculado en background/inicio de impresión.
