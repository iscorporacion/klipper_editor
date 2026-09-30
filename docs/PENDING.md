# Pending work

Last updated: 2026-09-29

## Tracking rule

- Any item explicitly deferred during testing or release work must be added here before closing the turn, especially when phrased as "dejemos eso para despues", "luego lo integramos", or equivalent.

## Hardware configuration UI

Status: deferred until the Purge Tray and LED Status Bar widgets are stable on the printer.

### Shared requirements

- Add a hardware section to each widget configuration window.
- Keep managed macros separate from user-editable hardware files.
- Create hardware files only when missing and never overwrite them during widget updates.
- Show the exact target file and generated Klipper sections before applying changes.
- Back up every hardware file before saving from K-Editor.
- Validate required fields and numeric ranges before writing.
- Warn that MCU pin validity can only be confirmed after a Klipper restart.
- Insert includes before the Klipper `SAVE_CONFIG` block.
- Disable hardware writes while a print is active.

### Purge Tray

Target file: `purge_tray_hardware.cfg`

- Add `purge_descent_delay` to the Purge Tray configuration window so the delay before tray descent can be tuned without editing `purge_tray.cfg`.
- Configure the `purge_tray_lift` manual stepper pins and motion limits.
- Configure the TMC2209 UART pin, address, current and driver parameters.
- Configure the lift endstop pin and polarity.
- Configure the `purge_tray_bed` servo pin, pulse widths and maximum angle.
- Preserve all existing hardware values when managed `purge_tray.cfg` macros are updated.
- Provide an explicit hardware validation summary before requesting a Klipper restart.

### LED Status Bar

Proposed target file: `statusbar_hardware.cfg`

- Move the LED hardware section out of managed `statusbar_leds.cfg`.
- Configure the LED pin, chain count, color order and initial color.
- Support common RGB and RGBW color orders without changing the effect macros.
- Preserve hardware values when managed LED effects and automation are updated.
- Add a non-destructive visual LED test after Klipper has loaded the configuration.

## Related deferred improvement

- Restore automatic use of the selected Happy Hare filament color for the MMU LED state with Klipper-compatible template syntax.

## Start condition

Do not begin this hardware UI until both current widgets complete normal printer testing without configuration, restart or state-transition errors.
