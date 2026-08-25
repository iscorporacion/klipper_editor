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

The repository includes a versioned `.env` with printer-host defaults:

```env
RATOS_VIEWER_ROOT=/home/pi/printer_data/config
RATOS_MOONRAKER_URL=http://127.0.0.1:7125
NEXT_PUBLIC_BASE_PATH=/editor
PORT=3007
```

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

Nginx does not need the full host URL for the app. The installer adds this location to the existing Mainsail/default server block:

```nginx
location = /editor {
    return 301 /editor/;
}

location /editor/ {
    proxy_pass http://127.0.0.1:3007/editor/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

The host part, for example `http://192.168.58.225`, comes from the server block where the snippet is included. To print a specific public URL at the end of the installer:

```bash
KLIPPER_EDITOR_PUBLIC_HOST=http://192.168.58.225 bash install.sh
```

If Nginx auto-detection fails:

```bash
NGINX_SITE_CONFIG=/etc/nginx/sites-available/mainsail bash install.sh
```

Uninstall:

```bash
bash ratos-file-viewer/scripts/uninstall.sh
```
