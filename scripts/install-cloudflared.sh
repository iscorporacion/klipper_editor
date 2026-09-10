#!/usr/bin/env bash
set -Eeuo pipefail
install_dir="${HOME:?HOME no esta definido}/.local/bin"
for candidate in "${install_dir}/cloudflared" /usr/local/bin/cloudflared "$(command -v cloudflared || true)"; do
  if [[ -n "$candidate" && -x "$candidate" ]] && "$candidate" --version 2>/dev/null; then
    exit 0
  fi
done
case "$(uname -m)" in
  aarch64|arm64) architecture=arm64; if [[ "$(getconf LONG_BIT)" == 32 ]]; then architecture=arm; fi ;;
  arm*) architecture=arm ;;
  x86_64) architecture=amd64 ;;
  i?86) architecture=386 ;;
  *) printf 'Arquitectura no soportada.\n' >&2; exit 1 ;;
esac
[[ "$(uname -s)" == Linux ]] || { printf 'Este instalador requiere Linux.\n' >&2; exit 1; }
command -v wget >/dev/null 2>&1 || { printf 'wget no esta instalado.\n' >&2; exit 1; }
mkdir -p "$install_dir"
download="$(mktemp "${install_dir}/.cloudflared-download.XXXXXX")"
trap 'rm -f -- "$download"' EXIT
wget -q --timeout=30 --tries=2 -O "$download" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${architecture}"
chmod +x "$download"
"$download" --version
mv -f "$download" "${install_dir}/cloudflared"
"${install_dir}/cloudflared" --version
