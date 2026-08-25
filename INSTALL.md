# Klipper Editor install

## Recommended: precompiled release

Use this on RatOS or any low-memory printer host:

```bash
curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | bash
```

The release installer downloads `klipper-editor-standalone.tar.gz` from GitHub Releases, extracts it under:

```text
~/klipper_editor/releases/
```

Then it points:

```text
~/klipper_editor/current
```

to the downloaded version and configures systemd plus Nginx. It does not run `npm ci` or `npm run build` on the printer.

The precompiled release is built for:

```env
NEXT_PUBLIC_BASE_PATH=/editor
```

That is the intended production path:

```text
http://<printer-ip>/editor
```

## Source install

Use this only on hosts with enough memory to compile Next.js:

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
http://<printer-ip>/editor
```

Default Moonraker connection:

```text
http://127.0.0.1:7125
```

That is the correct value when Klipper Editor runs on the same printer host as Moonraker.

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
    proxy_pass http://127.0.0.1:3007/editor;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
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

The host part comes from the server block where the snippet is included. You normally do not need to configure it. To print a specific public URL at the end of the installer, for example when using a custom hostname:

```bash
KLIPPER_EDITOR_PUBLIC_HOST=http://my-printer.local bash install.sh
```

If Nginx auto-detection fails:

```bash
NGINX_SITE_CONFIG=/etc/nginx/sites-available/mainsail bash install.sh
```

## Build and publish a precompiled release

GitHub Actions builds the app when you push a tag that starts with `v`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow:

- installs dependencies on GitHub's runner
- runs `npm run build` with `NEXT_PUBLIC_BASE_PATH=/editor`
- packages the standalone Next.js server
- uploads `klipper-editor-standalone.tar.gz` to the GitHub Release

After the release exists, printer hosts can install it with `install-release.sh`.

Uninstall:

```bash
bash ~/klipper_editor/current/scripts/uninstall.sh
```
