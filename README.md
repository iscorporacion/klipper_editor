# Klipper Editor

Web editor for Klipper/RatOS configuration files, designed to run beside Mainsail and Moonraker.

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
- file upload, blank file creation, file download, and delete confirmation
- image preview for supported image files
- backup copies on save, configurable from options
- Moonraker firmware restart button blocked during active prints
- help page at `/editor/help`

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` if you want to connect to a printer while developing:

```env
RATOS_MOONRAKER_URL=http://<printer-ip>:7125
```

## Install on printer host

Recommended for RatOS printers:

```bash
curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | bash
```

This downloads the precompiled GitHub Release and avoids building Next.js on the printer.

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

## Uninstall

Precompiled install:

```bash
bash ~/klipper_editor/current/scripts/uninstall.sh
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

GitHub Pages can be used for static documentation or screenshots, but production use should run on the printer host through systemd and Nginx.
