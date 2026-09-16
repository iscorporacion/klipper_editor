# 06 — Seguridad y UI

## Blockers obligatorios

No permitir ejecución si:

- archivo original no existe o cambió;
- capa elegida no existe;
- Z está fuera de límites;
- tool no resuelta;
- exclusions no corresponden a objetos definidos;
- modo de extrusión desconocido;
- homing XY no está permitido por perfil;
- impresora ya está imprimiendo;
- Klipper no está ready;
- estrategia Z no está confirmada;
- XY requiere confirmación y no se confirmó.

## Confirmaciones del usuario

```text
[ ] La pieza sigue adherida.
[ ] La cama no fue retirada.
[ ] No hay objetos sueltos.
[ ] El cabezal puede levantarse verticalmente.
[ ] El homing X/Y es físicamente posible.
```

## Z strategy

```ts
type ZRecoveryStrategy =
  | "manual-known-position"
  | "retained-position"
  | "probe-safe-area"
  | "unsupported";
```

MVP: `manual-known-position`.

No asumir que una Trident conserva el mismo plano Z después de pérdida de torque. Z-tilt automático queda fuera del MVP.

## XY

La prueba real tuvo desplazamiento Y. Por ello, homing no equivale a alineación confirmada.

Wizard:

1. candidato;
2. integridad;
3. altura/capa;
4. objetos;
5. plan;
6. preheat;
7. lift;
8. home XY;
9. XY registration;
10. resume.

## XY registration

Jog fino:

```text
step 0.01 / 0.05 / 0.10 / 0.50
X +/-
Y +/-
```

Guardar delta temporal y aplicarlo mediante estrategia validada (`SET_GCODE_OFFSET` u otra apropiada al perfil).

No extruir antes de confirmación.

## Emergency stop

Siempre visible durante ejecución.

## Modo experto

Puede permitir elegir capa, release temp, lift y ver G-code, pero no saltar blockers críticos.
