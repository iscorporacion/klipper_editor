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
        self.fail_extrusion = False

    def run(self, name, **params):
        def raise_error(message):
            raise RuntimeError(message)
        rendered = templates[name].render(printer=copy.deepcopy(self.printer), params=params,
                                          action_raise_error=raise_error)
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
            elif command in templates:
                arguments = dict(item.split("=", 1) for item in line.split()[1:])
                self.run(command, **arguments)


def expect_error(machine, name, **params):
    try:
        machine.run(name, **params)
    except RuntimeError:
        return
    raise AssertionError(f"{name} should have failed")


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
