# Klipper Recovery Engine — contexto para Codex

Este paquete define un sistema de recuperación de impresiones interrumpidas para **Klipper + Moonraker**, integrado en **Klipper Editor**.

El sistema NO pretende reanudar ciegamente desde un byte del archivo. Debe capturar un checkpoint por capa, detectar trabajos interrumpidos, analizar el G-code original, reconstruir el estado necesario, generar un plan seguro, permitir verificación XY y reanudar desde una capa real del archivo.

## Prueba manual que motivó el diseño

Se validó manualmente un caso real:

- altura física medida: ~13.93 mm;
- el G-code contenía una capa real en `Z=13.9`;
- correspondía a `LAYER=69`;
- siguiente capa: `Z=14.1 / LAYER=70`;
- herramienta: `T1`;
- modo IDEX: `SINGLE`;
- 4 objetos definidos, 2 excluidos;
- se generó un G-code de recuperación que arrancó correctamente;
- se observó un desplazamiento en Y, por lo que la reconstrucción de XY/offsets es un requisito crítico.

## Principio rector

La parte que mueve la máquina debe ser **determinista, auditable y comprobable**. No usar IA para decidir capas, movimientos, offsets, herramienta, exclusiones ni comandos físicos.

## Orden de lectura para Codex

1. `AGENTS.md`
2. `CODEX_MASTER_CONTEXT.md`
3. `docs/00-context-and-requirements.md`
4. `docs/01-architecture.md`
5. `docs/02-checkpointing.md`
6. `docs/03-gcode-parser.md`
7. `docs/04-recovery-engine.md`
8. `docs/05-moonraker-integration.md`
9. `docs/06-safety-and-ui.md`
10. `docs/07-testing-and-roadmap.md`
11. `docs/08-domain-contracts.md`
12. `docs/09-adrs.md`

## MVP

El MVP será **asistido**, no completamente autónomo. El usuario confirma que la pieza sigue adherida, revisa la capa sugerida, valida objetos/tool, permite preheat + lift + homing XY, ajusta XY si hace falta y solo entonces autoriza la reanudación.
