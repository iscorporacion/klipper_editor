# 09 — Architecture Decision Records

## ADR-001 — No IA en motor crítico

Accepted. Parsing/planning/rendering deterministas.

## ADR-002 — Reanudar desde inicio de capa

Accepted. `replay-layer` en MVP. Puede repetir material, pero evita saltos de geometría.

## ADR-003 — Checkpoint por remote method

Accepted for implementation spike. Preferir `action_call_remote_method` + agente Moonraker. Fallback mínimo con `SAVE_VARIABLE`.

## ADR-004 — Archivo original inmutable

Accepted. Siempre output nuevo.

## ADR-005 — Recovery asistido primero

Accepted. XY debe confirmarse antes de extrusión porque la prueba manual presentó desfase Y.

## ADR-006 — Parser por eventos

Accepted. No regex monolíticas.

## ADR-007 — G-code es autoridad de Z/capa

Accepted. La medición física selecciona entre capas existentes.

## ADR-008 — No ejecutar START_PRINT

Accepted. Recovery usa preámbulo propio y solo reconstruye estado necesario.

## ADR-009 — Perfiles por máquina

Accepted. Homing, lift, toolchange, IDEX, release temp y estrategia Z pertenecen a `MachineRecoveryProfile`, no al core.
