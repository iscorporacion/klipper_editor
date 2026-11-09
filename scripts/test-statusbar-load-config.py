"""Validate saved LED settings through Jinja and Klipper-style argument parsing."""
import ast
import configparser
import shlex
from pathlib import Path

import jinja2

config = configparser.RawConfigParser()
config.read(Path(__file__).resolve().parents[1] / "mmu_config/statusbar_leds.cfg")
env = jinja2.Environment(variable_start_string="{", variable_end_string="}")
template = env.from_string(config["delayed_gcode STATUS_BAR_LOAD_CONFIG"]["gcode"])
states = ["startup", "standby", "homing", "heating", "printing", "paused", "mmu", "complete", "cancelled", "error"]
saved = {"status_bar_brightness": 0.7, "status_bar_automatic": 1}
for state in states:
    for field, value in {"effect": "COMET", "color": "243,232,33", "secondary": "30,28,2", "speed": 0.8}.items():
        saved[f"status_bar_{state}_{field}"] = value
rendered = template.render(printer={"save_variables": {"variables": saved}})
restored = {}
for line in rendered.splitlines():
    if not line.strip():
        continue
    tokens = shlex.split(line)
    assert tokens[0] == "SET_GCODE_VARIABLE"
    args = dict(token.split("=", 1) for token in tokens[1:])
    assert args["MACRO"] == "_STATUS_BAR_VARS"
    restored["status_bar_" + args["VARIABLE"]] = ast.literal_eval(args["VALUE"])
assert restored == saved
assert not template.render(printer={"save_variables": {"variables": {}}}).strip()
blink = config["led_effect status_bar_dynamic_blink"]
layers = env.from_string(blink["layers"])
for speed in (1, 0.45):
    layer = layers.render(params={"SPEED": speed, "R": 0.7, "G": 0.1, "B": 0}).split()
    assert layer[0] == "blink"
    period, duty = float(layer[1]), float(layer[2])
    assert duty == 0.5
    # led_effect converts each cycle into on/off frame counts at this duty ratio.
    frames_on = int(float(blink["frame_rate"]) * period * duty)
    frames_off = int(float(blink["frame_rate"]) * period * (1 - duty))
    assert frames_on > 0 and frames_off > 0
print("OK: 42 saved LED values restore as valid literals; missing values remain unchanged")
print("OK: BLINK has lit and dark frames at the configured cancellation/error speeds")
