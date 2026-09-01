# Klipper Editor

Web editor for Klipper/RatOS configuration files, designed to run beside Mainsail and Moonraker.

Public help page:

```text
https://iscorporacion.github.io/klipper_editor/
```

Features:

- hierarchical file browser
- editor tabs
- Klipper `.cfg` syntax highlighting
- clickable `[include ...]` directives
- clickable documentation URLs inside comments
- includes and sections side panel
- section preview popup
- Material Icon Theme file icons
- JSON-based UI translations
- macro search and execution through Moonraker
- heater status, cached heater list, target temperature controls, and cooldown shortcuts
- home buttons, movement modal, absolute axis moves, and Z-offset controls
- emergency stop button
- printer shutdown and reboot menu through Moonraker
- optional local host terminal panel, disabled by default
- optional MCP server for agents that need controlled access to printer config files
- file upload, blank file creation, file download, and delete confirmation
- image preview for supported image files
- backup copies on save, configurable from options
- Moonraker firmware restart button blocked during active prints
- help page at `/editor/help`
- optional Mainsail sidebar link through `.theme/navi.json`
- systemd startup hook that refreshes the Mainsail sidebar link after updates

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` if you want to connect to a printer while developing:

```env
RATOS_MOONRAKER_URL=http://<printer-ip>:7125
KLIPPER_EDITOR_ENABLE_TERMINAL=false
```

## Install on printer host

Recommended for RatOS printers:

```bash
curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | bash
```

This downloads the precompiled GitHub Release and avoids building Next.js on the printer.
The installer also registers Klipper Editor in Moonraker Update Manager so Mainsail can show future updates.
It also adds a Mainsail sidebar link named `code editor` through `printer_data/config/.theme/navi.json`.

To enable the optional terminal panel on the printer host:

```bash
curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | KLIPPER_EDITOR_ENABLE_TERMINAL=true bash
```

The terminal runs commands as the Klipper Editor systemd service user, so only enable it on trusted networks.

Source install, useful for development hosts:

```bash
git clone https://github.com/iscorporacion/klipper_editor.git
cd klipper_editor
bash install.sh
```

Default production URL:

```text
http://<printer-ip>/editor/
```

See [INSTALL.md](INSTALL.md) for overrides and details.

## MCP server

Klipper Editor includes an optional stdio MCP server for local agents:

```bash
npm run mcp
```

On a printer installed from GitHub Releases, update Klipper Editor first. MCP is available only in releases that include `scripts/klipper-editor-mcp.mjs`.

By default it exposes read-only file listing, file reading, config search, and printer status. Write, delete, G-code, and firmware restart actions require explicit environment flags.

See [docs/MCP.md](docs/MCP.md) for client configuration examples and the full permission model.

## Uninstall

Precompiled install:

```bash
bash ~/klipper_editor_app/current/scripts/uninstall.sh
```

Source install from a cloned repository:

```bash
cd klipper_editor
bash scripts/uninstall.sh
```

If the installer injected this line into your Nginx site config and it remains after uninstall, remove it manually:

```nginx
include /etc/nginx/snippets/klipper-editor.conf; # klipper-editor
```

## GitHub Pages

The editor itself cannot run fully on GitHub Pages because it needs server-side API routes, local filesystem access to `printer_data/config`, and Moonraker access from the printer host.

GitHub Pages is used for static documentation and screenshots:

```text
https://iscorporacion.github.io/klipper_editor/
```
