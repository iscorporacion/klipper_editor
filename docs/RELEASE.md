# Release Notes v0.1.53

## Title

K-Editor theme settings, bed mesh viewer, utilities controls, and shared preferences

## Summary

This release adds a configurable K-Editor theme independent from Mainsail,
a 3D bed mesh viewer, a Utilities window for fans and LEDs, and server-backed
preferences so key settings and favorites follow the printer instead of a
single browser.

## Changes

- Added a Theme tab in Options to select the app logo and accent color.
- Added an explicit "Import from Mainsail" action that copies the current
  Mainsail logo/color into K-Editor preferences.
- Added Orbys logo support.
- Recolored selectable SVG favicons with the configured accent color.
- Added a rotatable 3D bed mesh viewer with profile preview, active mesh
  details, calibration, profile save/load, clear mesh, and SAVE_CONFIG action.
- Added visible X/Y/Z axis indicator at the front-left bed origin.
- Added a Utilities window for fans, output pins, automatic fan readouts, and
  LED color controls detected from Moonraker objects.
- Added server-backed preferences in `.klipper-editor-preferences.json`.
- Centered the initial preferences loading state and added the shared
  indeterminate loading bar.
- Widened the Options window so all tabs fit cleanly.
- Kept open files and the active editor as browser-local state.

## Validation

Run before tagging:

```bash
npm install
npx tsc --noEmit --incremental false
npm run build
node --test scripts/test-preferences.cjs
```

Expected known warning:

```text
ESLint must be installed in order to run during builds
```

## Release Commands

Use the next semantic tag after the current release:

```bash
git status --short
git add .
git commit -m "Add theme settings bed mesh viewer and utilities controls"
git tag v0.1.53
git push --atomic origin HEAD:main refs/tags/v0.1.53
```

After GitHub Actions finishes, verify:

- The release workflow passed.
- `klipper-editor.zip` exists on the GitHub release.
- The ZIP includes `scripts/`, `app/`, `components/`, `public/img/orbys.svg`,
  the bed mesh API route, and the utilities API route.
