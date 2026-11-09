"""Render Klipper templates and exercise recovery without moving hardware."""
import ast
import configparser
import copy
import re
from pathlib import Path

import jinja2

config = configparser.RawConfigParser()
config.read(Path(__file__).resolve().parents[1] / "mmu_config/purge_tray.cfg")
env = jinja2.Environment(variable_start_string="{", variable_end_string="}")
templates = {}
for section in config.sections():
    if config.has_option(section, "gcode"):
        templates[section.split(" ", 1)[1]] = env.from_string(config[section]["gcode"])


class Machine:
    def __init__(self):
        self.printer = {
            section: {key[9:]: ast.literal_eval(value) for key, value in config[section].items()
                      if key.startswith("variable_")}
            for section in config.sections() if section.startswith("gcode_macro ")
        }
        self.printer.update({
            "pause_resume": {"is_paused": True}, "print_stats": {"state": "paused"},
            "toolhead": {"homed_axes": "xyz", "position": {"z": 120},
                         "axis_maximum": {"z": 350, "y": 350}, "axis_minimum": {"y": 0}},
            "extruder": {"target": 220, "temperature": 220}, "fan": {"speed": 0},
            "mmu": {"gate": 0, "gate_temperature": [220]}, "servo purge_tray_bed": {},
        })
        self.state = self.printer["gcode_macro _PURGE_TRAY_STATE"]
        self.vars = self.printer["gcode_macro _PURGE_TRAY_VARS"]
        self.state.update(homed=1, blob_count=80, position=25)
        self.vars.update(calibrated=1, purge_x=30, purge_y=350)
        self.commands = []
        self.messages = []
        self.fail_extrusion = False

    def run(self, name, **params):
        def raise_error(message):
            raise RuntimeError(message)
        rendered = templates[name].render(printer=copy.deepcopy(self.printer), params=params,
                                          action_raise_error=raise_error, action_respond_info=lambda message: self.messages.append(message) or "")
        for line in rendered.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            self.commands.append(line)
            command = line.split()[0]
            if self.fail_extrusion and line.startswith("G1 E"):
                raise RuntimeError("Simulated extrusion failure")
            if command == "SET_GCODE_VARIABLE":
                match = re.fullmatch(r"SET_GCODE_VARIABLE MACRO=(\S+) VARIABLE=(\S+) VALUE=(.+)", line)
                macro, variable, value = match.groups()
                if value.startswith("'"):
                    value = value[1:-1]
                self.printer["gcode_macro " + macro][variable] = ast.literal_eval(value)
            elif command == "RESUME":
                self.printer["pause_resume"]["is_paused"] = False
                self.printer["print_stats"]["state"] = "printing"
            elif command == "G28":
                self.printer["toolhead"]["homed_axes"] = "xyz"
            elif command in templates:
                arguments = dict(item.split("=", 1) for item in line.split()[1:])
                self.run(command, **arguments)


def expect_error(machine, name, **params):
    try:
        machine.run(name, **params)
    except RuntimeError:
        return
    raise AssertionError(f"{name} should have failed")


approach = Machine()
approach.state["blob_count"] = 0
approach.vars.update(brush_x2=90, brush_y=340, purge_x=30, purge_y=350,
                     brush_position=6.5, purge_position=2.5)
approach.run("PURGE_TRAY_BLOBIFIER")
expected = ["G1 X90 Y340 F9000", "PURGE_TRAY_MOVE POS=6.5 QUIET=1",
            "G1 X30 F9000", "G1 Y350 F9000", "PURGE_TRAY_MOVE POS=2.5 QUIET=1"]
indexes = [approach.commands.index(command) for command in expected]
assert indexes == sorted(indexes)
assert approach.commands.index("PURGE_TRAY_SAFE") < indexes[0]
assert approach.commands.index("_PURGE_TRAY_CLEAR_TOOLHEAD") < indexes[0]
assert indexes[-1] < approach.commands.index("_PURGE_TRAY_SET_STATE STATE=purging PROGRESS=15")
assert "G1 X30 Y350 F9000" not in approach.commands[indexes[0]:indexes[-1]]
clean = approach.commands.index("_PURGE_TRAY_CLEAN SKIP_SAFE=1 BRUSH_FIRST=1")
safe_after_clean = approach.commands.index(
    f"PURGE_TRAY_MOVE POS={approach.vars['safe_position']} SPEED={approach.vars['safe_travel_speed']} QUIET=1",
    clean,
)
assert clean < safe_after_clean < approach.commands.index("RESTORE_GCODE_STATE NAME=PURGE_TRAY_BLOBIFIER_STATE MOVE=1 MOVE_SPEED=150")

for axes in ("", "xy", "xyz"):
    homing_test = Machine()
    homing_test.state["blob_count"] = 0
    homing_test.printer["toolhead"]["homed_axes"] = axes
    homing_test.printer["print_stats"]["state"] = "standby"
    homing_test.printer["pause_resume"]["is_paused"] = False
    homing_test.run("PURGE_TRAY_BLOBIFIER")
    assert homing_test.commands.count("G28") == (0 if axes == "xyz" else 1)
    assert homing_test.messages == ([] if axes == "xyz" else ["Esperando homing XYZ"])
    if axes != "xyz":
        assert homing_test.commands.index("G28") < homing_test.commands.index("PURGE_TRAY_SAFE")

for job, paused, mmu in (("printing", False, {}), ("paused", True, {}), ("standby", True, {}),
                          ("standby", False, {"is_in_print": True}), ("standby", False, {"print_state": "printing"})):
    homing_test = Machine()
    homing_test.state["blob_count"] = 0
    homing_test.printer["toolhead"]["homed_axes"] = "xy"
    homing_test.printer["print_stats"]["state"] = job
    homing_test.printer["pause_resume"]["is_paused"] = paused
    homing_test.printer["mmu"].update(mmu)
    expect_error(homing_test, "PURGE_TRAY_BLOBIFIER")
    assert not homing_test.commands and not homing_test.messages

for speed in (0, 128, 255, 300):
    fan_test = Machine()
    fan_test.state["blob_count"] = 0
    fan_test.vars["purge_velocity_fan"] = speed
    fan_test.vars["purge_descent_delay"] = 1300
    fan_test.printer["fan"]["speed"] = 0.4
    rendered = templates["PURGE_TRAY_BLOBIFIER"].render(
        printer=fan_test.printer, params={}, action_raise_error=lambda message: None)
    lines = [line.strip() for line in rendered.splitlines() if line.strip()]
    descent = next(i for i, line in enumerate(lines) if line.startswith("MANUAL_STEPPER ") and "SYNC=0" in line)
    assert lines.index("G4 P1300") < descent
    if speed:
        assert lines.index(f"M106 S{min(speed, 255)}") == descent - 1
    else:
        assert not any(line.startswith("M106 ") for line in lines[:descent])
    restore = lines.index("M106 S102")
    assert restore > lines.index("_PURGE_TRAY_CLEAN SKIP_SAFE=1 BRUSH_FIRST=1")

machine = Machine()
expect_error(machine, "PURGE_TRAY_BLOBIFIER")
assert machine.state["state"] == "full" and machine.state["recovery_pending"] == 1
expect_error(machine, "PURGE_TRAY_RECOVERY_RESUME")
assert "RESUME" not in machine.commands
expect_error(machine, "PURGE_TRAY_RECOVER", CAPACITY=80)

machine.run("PURGE_TRAY_EMPTY_START")
assert machine.state["empty_active"] == 1
assert "G1 Z120 F600" in machine.commands  # Never raise the bed toward a tall print.
expect_error(machine, "PURGE_TRAY_RECOVER")
machine.run("PURGE_TRAY_EMPTY_FINISH")
assert machine.state["blob_count"] == 0 and machine.state["recovery_pending"] == 1
assert "RESTORE_GCODE_STATE NAME=PURGE_TRAY_EMPTY_STATE MOVE=1 MOVE_SPEED=50" in machine.commands
machine.run("PURGE_TRAY_RECOVER")
assert machine.state["recovery_ready"] == 1 and machine.state["recovery_pending"] == 0
assert machine.state["blob_count"] == 1 and "RESUME" not in machine.commands
assert machine.commands.index("_PURGE_TRAY_CLEAN SKIP_SAFE=1 BRUSH_FIRST=1") < machine.commands.index("_PURGE_TRAY_RECOVERY_COMPLETE")
machine.run("PURGE_TRAY_RECOVERY_RESUME")
assert "RESUME" in machine.commands
assert machine.state["recovery_ready"] == 0

machine = Machine()
expect_error(machine, "PURGE_TRAY_BLOBIFIER")
machine.run("PURGE_TRAY_RECOVER", CAPACITY=90)
assert machine.vars["max_blobs"] == 80 and machine.state["temporary_capacity"] == 90
assert not any("SAVE_VARIABLE VARIABLE=purge_tray_max_blobs" in line for line in machine.commands)
machine.printer["pause_resume"]["is_paused"] = False
machine.printer["print_stats"]["state"] = "complete"
machine.run("_PURGE_TRAY_CLEAR_TEMPORARY_CAPACITY")
assert machine.state["temporary_capacity"] == 0

machine = Machine()
expect_error(machine, "PURGE_TRAY_BLOBIFIER")
machine.fail_extrusion = True
expect_error(machine, "PURGE_TRAY_RECOVER", CAPACITY=90)
assert machine.state["recovery_pending"] == 1 and machine.state["recovery_ready"] == 0
machine.printer["print_stats"]["state"] = "error"
machine.run("_PURGE_TRAY_CLEAR_TEMPORARY_CAPACITY")
assert machine.state["recovery_pending"] == 1 and machine.state["temporary_capacity"] == 90
expect_error(machine, "PURGE_TRAY_RECOVERY_RESUME")
print(f"OK: {len(templates)} templates compiled; full, empty, extend, retry failure and resume scenarios passed")
