# Recovering a full purge bucket

Install the updated managed `purge_tray.cfg` and restart Klipper while no print
is active. The recovery flags require these macros; an older configuration
cannot track a purge that was already skipped.

When the next purge encounters a full bucket, its state and pending purge are
recorded before raising the error handled by Happy Hare. K-Editor opens a
recovery dialog once the printer is paused, including when the tray widget is
collapsed.

- Empty bucket: saves the current parked G-code state and tray position, moves
  the tray down, positions XY over the purge tray, lowers the bed to at least
  the configured emptying Z, and opens the servo. Finish closes the servo,
  restores the parked state, resets the count, and repeats purge and cleaning.
- Increase and repeat purge: uses an integer capacity greater than the current
  count, repeats purge and cleaning, and preserves the saved capacity setting.
  The temporary limit is cleared after the job ends or is cancelled.
- Resume print: remains a separate user action after successful purging and
  cleaning. Happy Hare retains ownership of restoring the print position.

An unsuccessful recovery leaves the pending flag set. K-Editor's print resume
and direct RESUME requests are rejected while purging is pending or emptying
is active. Resume through the recovery dialog. Other clients such as Mainsail
and KlipperScreen do not use K-Editor's API guard: their direct RESUME commands
are not intercepted. Happy Hare macros and configuration files are not edited.

Template verification (no hardware movement):

```sh
uv run --with jinja2 scripts/test-purge-tray-recovery.py
```
