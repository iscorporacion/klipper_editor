# AGENTS.md — instrucciones obligatorias para Codex

## Misión

Construir el **Klipper Recovery Engine** dentro de Klipper Editor.

## Reglas

1. **No IA en el motor crítico.** Parsing, planning, validación y rendering deben ser deterministas.
2. **Nunca ejecutar el `START_PRINT` original durante recovery.** Puede contener `G28`, `Z_TILT_ADJUST`, mesh, purga, offsets o movimientos incompatibles con una pieza ya impresa.
3. **Separar parser, planner, renderer, Moonraker y UI.** El motor debe poder generar un `RecoveryPlan` sin hablar con la impresora.
4. **Dry-run por defecto.** Toda función nueva debe poder analizar y renderizar sin ejecutar hardware.
5. **No adivinar.** Si falta estado crítico, devolver blocker.
6. **Primera compatibilidad:** Klipper, Moonraker, OrcaSlicer, RatOS post-processed G-code, `EXCLUDE_OBJECT_*`, IDEX `SINGLE`, T0/T1.
7. **TypeScript strict.** Evitar `any`; usar discriminated unions y validación en runtime.
8. **Tests antes de hardware.** Todo algoritmo de capa/Z/objetos/tool/rendering debe tener fixtures.
9. **Idempotencia.** Mismas entradas => mismo plan y mismo G-code, salvo metadata explícitamente dinámica.
10. **Archivo original inmutable.** Siempre generar un archivo nuevo.
11. **No empezar con implementación grande.** Primero inspeccionar el repositorio real de Klipper Editor y producir un mapa de integración.
12. **Nunca enviar G-code al hardware desde tests.** El adapter Moonraker debe mockearse por defecto.

## Estructura lógica esperada

```text
src/recovery/
  domain/
  parser/
  checkpoint/
  planner/
  renderer/
  validators/
  moonraker/
  storage/
  ui-adapter/
```

Los nombres pueden adaptarse al repo real, pero no mezclar responsabilidades.

## Primera tarea en el repositorio real

1. inspeccionar arquitectura existente;
2. localizar frontend/backend/runtime;
3. localizar cliente Moonraker actual;
4. localizar manejo de archivos G-code;
5. localizar sistema de tests;
6. documentar mapa de integración;
7. proponer cambios mínimos;
8. implementar primero parser/indexador + tests.

## Definition of Done

Una tarea requiere: tipos, validación, tests, manejo de errores, logging útil y documentación breve. `execute` debe quedar separado de `plan/render`.
