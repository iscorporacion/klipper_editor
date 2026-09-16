# 00 — Contexto y requerimientos de producto

## Objetivo

Recuperar impresiones largas interrumpidas por corte de energía, reinicio de host/Klipper/Moonraker o fallo recuperable, siempre que la pieza siga utilizable.

## Estrategia del MVP

No intentaremos reconstruir el último segmento exacto extruido. Se reanuda desde el **inicio de la última capa seleccionada**. Puede repetirse parte de una capa, pero es preferible a saltar geometría faltante o perder toda la pieza.

## Historias de usuario

### R-001 Detectar impresión interrumpida

Klipper Editor debe consultar Moonraker y presentar trabajos con estados potencialmente recuperables:

- `interrupted`;
- `klippy_disconnect`;
- `klippy_shutdown`;
- `error`.

`cancelled` no debe tratarse como recovery automático.

### R-002 Verificar archivo

Recuperar filename, ruta, metadata, tamaño, mtime y preferiblemente SHA-256. No generar recovery si el archivo cambió.

### R-003 Mostrar checkpoint

Mostrar capa, Z, tool, IDEX, exclusiones, targets térmicos, offsets conocidos, timestamp e integridad.

### R-004 Analizar altura física

El usuario puede ingresar, por ejemplo, `13.93`. El engine debe devolver Z inferior, más cercana y superior entre **capas existentes del archivo**.

Ejemplo:

```text
13.7
13.9 <- nearest
14.1
```

Nunca inventar `Z=13.93` si esa capa no existe.

### R-005 Selección de capa

Prioridad:

1. selección explícita del usuario;
2. checkpoint válido;
3. nearest real Z por medición.

No escoger automáticamente una capa posterior al checkpoint.

### R-006 Restaurar exclusiones

Reconstruir `EXCLUDE_OBJECT_DEFINE` y luego aplicar `EXCLUDE_OBJECT NAME=...` para los objetos que ya estaban descartados.

### R-007 Restaurar tool/IDEX

Restaurar herramienta, extrusor y carriage/mode necesarios. RatOS puede comentar o sustituir `T0/T1`, así que hay que interpretar macros y metadata, no solo buscar un `T1` literal.

### R-008 Preheat seguro

Si la boquilla quedó sobre la pieza:

```text
heat -> wait -> lift Z -> XY
```

No usar `M104` seguido inmediatamente por movimiento lateral. Debe existir espera efectiva (`M109` o flujo equivalente).

### R-009 Verificación XY

Antes de extruir, mover a una referencia segura, permitir corrección X/Y y exigir confirmación.

### R-010 Generar sin ejecutar

La generación del recovery debe ser independiente de la ejecución. El usuario debe poder inspeccionarlo/guardarlo.

### R-011 Auditoría

Guardar archivo origen, hash, checkpoint, capa seleccionada, offsets, exclusions, warnings, archivo generado y resultado.

## Fuera del MVP

- resume exacto a mitad de capa;
- visión artificial;
- XY automático por cámara;
- Z-tilt automático alrededor de piezas;
- soporte universal de slicers;
- recuperación si la pieza se despegó;
- compensación automática de cama físicamente movida.
