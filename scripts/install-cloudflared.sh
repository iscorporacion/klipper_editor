#!/usr/bin/env bash
set -Eeuo pipefail
if [[ -x /usr/local/bin/cloudflared ]]; then
  /usr/local/bin/cloudflared --version
  exit 0
fi
if command -v cloudflared >/dev/null 2>&1; then
  cloudflared --version
  exit 0
fi
case "$(uname -m)" in
  arm*|aarch64) ;;
  *) printf 'Este instalador requiere una impresora Linux ARM.\n' >&2; exit 1 ;;
esac
command -v wget >/dev/null 2>&1 || { printf 'wget no esta instalado.\n' >&2; exit 1; }
if [[ "$(id -u)" != 0 ]]; then
  sudo -n true 2>/dev/null || { printf 'No se pudo instalar: el usuario de K-Editor necesita sudo sin contrasena. Ejecuta el instalador manualmente por SSH.\n' >&2; exit 1; }
fi
download="$(mktemp)"
trap 'rm -f -- "$download"' EXIT
wget -q --timeout=30 --tries=2 -O "$download" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm
chmod +x "$download"
"$download" --version
if [[ "$(id -u)" == 0 ]]; then
  mv "$download" /usr/local/bin/cloudflared
else
  sudo -n mv "$download" /usr/local/bin/cloudflared
fi
/usr/local/bin/cloudflared --version
