# Klipper Editor install

## Recommended: precompiled release

Use this on RatOS or any low-memory printer host:

```bash
curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | bash
```

The release installer downloads `klipper-editor.zip` from GitHub Releases and extracts it under:

```text
~/klipper_editor_app/current
```

It also writes:

```text
~/klipper_editor_app/current/release_info.json
```

and configures systemd, Nginx, and Moonraker Update Manager. It does not run `npm ci` or `npm run build` on the printer.

If an older precompiled install used `~/klipper_editor/current`, run the installer again. It will move the managed installation to `~/klipper_editor_app/current` and rewrite the Moonraker Update Manager entry. Moonraker rejects updater paths located inside git repositories.

The precompiled release is built for:

```env
NEXT_PUBLIC_BASE_PATH=/editor
```

That is the intended production path:

```text
http://<printer-ip>/editor
```

## Source install

Use this only on hosts with enough memory to compile Next.js. Source installs do not register in Moonraker Update Manager by default:

```bash
cd klipper_editor
bash install.sh
```

The installer creates:

- `.env.production.local`
- `release_info.json` when installed from a precompiled release
- `klipper-editor.service`
- `/etc/nginx/snippets/klipper-editor.conf`
- a Nginx include inside the detected Mainsail/default server block
- a `[update_manager klipper-editor]` entry in `moonraker.conf`
- `printer_data/config/.theme/navi.json` with a `code editor` link for the Mainsail sidebar
- a non-blocking systemd `ExecStartPre` hook that refreshes the Mainsail sidebar link before Klipper Editor starts

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

If Moonraker config auto-detection fails:

```bash
MOONRAKER_CONFIG=/home/pi/printer_data/config/moonraker.conf bash install.sh
```

To skip Update Manager registration on precompiled installs:

```bash
curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | KLIPPER_EDITOR_CONFIGURE_UPDATE_MANAGER=false bash
```

To skip the Mainsail sidebar link:

```bash
curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | KLIPPER_EDITOR_CONFIGURE_MAINSAIL_LINK=false bash
```

The sidebar link uses Mainsail's `.theme/navi.json` integration and points to `/editor/` by default:

```json
{
  "title": "code editor",
  "href": "/editor/",
  "target": "_self"
}
```

When the sidebar link is enabled, the systemd service also runs this before each Klipper Editor start:

```ini
ExecStartPre=-/usr/bin/env node /home/<user>/klipper_editor_app/current/scripts/configure-mainsail-link.mjs
```

The leading `-` makes the hook non-blocking: if Mainsail or Moonraker is not ready yet, Klipper Editor still starts.

The Update Manager block added to `moonraker.conf` is:

```ini
[update_manager klipper-editor]
type: zip
channel: stable
repo: iscorporacion/klipper_editor
path: /home/pi/klipper_editor_app/current
enable_node_updates: False
is_system_service: True
managed_services:
  klipper-editor
persistent_files:
  .env.production.local
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
- writes `release_info.json`
- uploads `klipper-editor.zip` to the GitHub Release

After the release exists, printer hosts can install it with `install-release.sh`.

## Public documentation

GitHub Pages publishes the static help page from the `docs/` directory:

```text
https://iscorporacion.github.io/klipper_editor/
```

The full editor cannot run on GitHub Pages because it needs server-side API routes, local filesystem access, systemd/Nginx integration, and Moonraker.

Uninstall:

```bash
bash ~/klipper_editor_app/current/scripts/uninstall.sh
```
