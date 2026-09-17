import assert from "node:assert/strict";
import test from "node:test";
import { getMacroParameters } from "../lib/macro-parameters.js";

test("detects required, literal defaults, dynamic defaults and inferred types", () => {
  const parameters = getMacroParameters([
    "gcode:",
    "  {% set temp = params.TEMP|int %}",
    "  {% set speed = params.SPEED|default(300)|float %}",
    "  {% set enabled = params.ENABLED|default(true)|lower == 'true' %}",
    "  {% set target = params.TARGET|default(printer.heater_bed.target, true)|float %}",
    "  # params.IGNORED|int"
  ]);

  assert.deepEqual(parameters, [
    { name: "ENABLED", required: false, kind: "boolean", defaultValue: "true", defaultExpression: "true" },
    { name: "SPEED", required: false, kind: "number", defaultValue: "300", defaultExpression: "300" },
    { name: "TARGET", required: false, kind: "number", defaultExpression: "printer.heater_bed.target" },
    { name: "TEMP", required: true, kind: "number" }
  ]);
});

test("treats is-defined parameters as optional and missing-parameter checks as required", () => {
  const parameters = getMacroParameters([
    "{% if params.TOOL is defined %} RESPOND MSG={params.TOOL} {% endif %}",
    "{% if params.BED is not defined %} { action_raise_error('BED required') } {% endif %}"
  ]);

  assert.deepEqual(parameters, [
    { name: "BED", required: true, kind: "text" },
    { name: "TOOL", required: false, kind: "text" }
  ]);
});

test("does not require axis flags when a macro handles the all-missing case", () => {
  const parameters = getMacroParameters([
    "{% if params.X is defined %} G28 X {% endif %}",
    "{% if params.Y is defined %} G28 Y {% endif %}",
    "{% if params.X is not defined and params.Y is not defined %} G28 {% endif %}"
  ]);

  assert.deepEqual(parameters, [
    { name: "X", required: false, kind: "text" },
    { name: "Y", required: false, kind: "text" }
  ]);
});
