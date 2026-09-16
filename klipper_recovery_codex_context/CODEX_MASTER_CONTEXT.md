# CODEX MASTER CONTEXT

## Problema

Después de un corte o reinicio, la pieza puede seguir adherida pero Klipper pierde estado lógico. Queremos reanudar desde una capa real del G-code, reconstruyendo solo el estado necesario.

## Caso real probado

```text
medida física ≈ 13.93 mm
G-code real: Z=13.9
layer=69
next: Z=14.1 / layer=70
tool=T1
IDEX=SINGLE
4 objetos definidos
2 objetos excluidos
```

La recuperación manual arrancó, pero hubo un desplazamiento en Y. Eso convierte **XY + offsets + tool/carriage state** en parte esencial del problema.

## Arquitectura objetivo

```text
_ON_LAYER_CHANGE
      |
      v
Recovery checkpoint event
      |
      v
Recovery Agent / backend
      |
      +--> latest checkpoint persistente

Moonraker history + G-code original
      |
      v
G-code Parser -> Recovery Planner -> Safety Validator -> Renderer
                                              |
                                              v
                                       Klipper Editor Wizard
                                              |
                                              v
                                  assisted physical execution
```

## Decisiones ya tomadas

- checkpoint por capa;
- reanudar desde inicio de capa (`replay-layer`);
- el archivo manda: no usar `altura/layerHeight` como verdad;
- usar medición física solo para elegir entre Z reales del G-code;
- no ejecutar `START_PRINT` durante recovery;
- preheat y esperar antes de despegar boquilla;
- lift Z antes de cualquier XY;
- homing XY separado;
- restaurar tool, IDEX, exclusiones, temperaturas y estados dinámicos relevantes;
- verificación/ajuste XY antes de extrusión;
- recovery asistido primero;
- sin IA en decisiones físicas.

## Primer comportamiento verificable

Con un fixture equivalente al caso real:

```ts
const nearest = findNearestLayer(13.93);
expect(nearest.number).toBe(69);
expect(nearest.z).toBe(13.9);
```

Luego:

```ts
const plan = createRecoveryPlan(...);
expect(plan.resume.layer).toBe(69);
expect(plan.resume.z).toBe(13.9);
expect(plan.machine.tool).toBe("T1");
expect(plan.machine.idexMode).toBe("SINGLE");
expect(plan.machine.excludedObjects).toHaveLength(2);
```

El G-code generado **no debe contener una llamada activa a `START_PRINT`**.
