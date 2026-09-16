# 05 — Integración con Moonraker

## Datos que necesitamos

Moonraker/Klipper permiten obtener:

- `print_stats` y filename;
- `virtual_sdcard`;
- `toolhead`;
- `gcode_move`;
- `exclude_object` (`objects`, `excluded_objects`, `current_object`);
- extrusores y pressure advance;
- fan;
- `dual_carriage`;
- file metadata;
- job history;
- ejecución de G-code.

## Detección de candidato

Consultar Job History y aceptar como candidatos:

```text
interrupted
klippy_disconnect
klippy_shutdown
error
```

Moonraker expone `filename`, `exists`, metadata y estado del job. El checkpoint propio sigue siendo la fuente para la capa/state de recovery.

## Remote method para checkpoint

Un agente persistente conectado por WebSocket puede registrarse como agent y registrar:

```text
klipper_editor_recovery_checkpoint
```

Macro:

```jinja
{action_call_remote_method(
  "klipper_editor_recovery_checkpoint",
  layer=LAYER,
  z=Z
)}
```

El backend combina esto con su cache de estado.

## Suscripciones sugeridas

```text
webhooks
virtual_sdcard
print_stats
toolhead
gcode_move
exclude_object
extruder
extruder1
fan
dual_carriage
```

La lista real debe adaptarse a la configuración de cada impresora.

## API interna propuesta

```text
GET  /api/recovery/candidates
GET  /api/recovery/candidates/:id
POST /api/recovery/analyze
POST /api/recovery/plan
POST /api/recovery/render
POST /api/recovery/execute
POST /api/recovery/xy-adjust
POST /api/recovery/cancel
```

`execute` exige plan id/hash, confirmación, printer ready, ningún print activo y cero blockers.

## Referencias oficiales

- https://moonraker.readthedocs.io/en/latest/external_api/extensions/
- https://moonraker.readthedocs.io/en/latest/external_api/history/
- https://moonraker.readthedocs.io/en/latest/external_api/printer/
- https://www.klipper3d.org/Status_Reference.html
- https://www.klipper3d.org/Command_Templates.html
