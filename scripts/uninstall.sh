#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="klipper-editor"
SERVICE_NAME="${KLIPPER_EDITOR_SERVICE_NAME:-klipper-editor}"
NGINX_SNIPPET="/etc/nginx/snippets/${APP_NAME}.conf"
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${APP_DIR}/.env.production.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "${APP_DIR}/.env.production.local"
  set +a
fi

run_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

run_sudo systemctl disable --now "${SERVICE_NAME}" || true
run_sudo rm -f "${SYSTEMD_UNIT}"
run_sudo rm -f "${NGINX_SNIPPET}"

if command -v node >/dev/null 2>&1 && [[ -f "${APP_DIR}/scripts/configure-mainsail-link.mjs" ]]; then
  node "${APP_DIR}/scripts/configure-mainsail-link.mjs" --remove || true
fi

if command -v systemctl >/dev/null 2>&1; then
  run_sudo systemctl daemon-reload
fi

cat <<MSG
Service and Nginx snippet removed.

If install.sh injected an include into your Nginx site config, remove this line manually:
include ${NGINX_SNIPPET}; # ${APP_NAME}
MSG
