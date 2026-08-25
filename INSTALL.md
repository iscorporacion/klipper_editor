# Klipper Editor install

After cloning the repository on the printer host:

```bash
cd klipper_editor
bash install.sh
```

The installer creates:

- `.env.production.local`
- `klipper-editor.service`
- `/etc/nginx/snippets/klipper-editor.conf`
- a Nginx include inside the detected Mainsail/default server block

Default URL:

```text
http://<printer-ip>/editor/
```

Useful overrides:

```bash
RATOS_VIEWER_ROOT=/home/biqu/printer_data/config \
RATOS_MOONRAKER_URL=http://127.0.0.1:7125 \
NEXT_PUBLIC_BASE_PATH=/editor \
PORT=3007 \
bash install.sh
```

If Nginx auto-detection fails:

```bash
NGINX_SITE_CONFIG=/etc/nginx/sites-available/mainsail bash install.sh
```

Uninstall:

```bash
bash ratos-file-viewer/scripts/uninstall.sh
```
