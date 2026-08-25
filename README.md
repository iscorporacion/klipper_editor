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
- Moonraker firmware restart button blocked during active prints

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` if you want to connect to a printer while developing:

```env
RATOS_MOONRAKER_URL=http://192.168.58.225:7125
```

## Install on printer host

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
