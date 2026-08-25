#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="klipper-editor"
BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/editor}"
APP_PORT="${PORT:-3007}"
MOONRAKER_URL="${RATOS_MOONRAKER_URL:-http://127.0.0.1:7125}"
PUBLIC_HOST="${KLIPPER_EDITOR_PUBLIC_HOST:-}"
SERVICE_NAME="${KLIPPER_EDITOR_SERVICE_NAME:-klipper-editor}"
CONFIGURE_UPDATE_MANAGER="${KLIPPER_EDITOR_CONFIGURE_UPDATE_MANAGER:-true}"
NGINX_SNIPPET="/etc/nginx/snippets/${APP_NAME}.conf"
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
APP_DIR="${KLIPPER_EDITOR_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
START_COMMAND="${KLIPPER_EDITOR_START_COMMAND:-/usr/bin/env npm run start -- -p ${APP_PORT}}"
SERVICE_USER="${SUDO_USER:-$USER}"

log() {
  printf '%s\n' "$*"
}

run_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    exit 1
  fi
}

detect_config_root() {
  local candidates=(
    "${RATOS_VIEWER_ROOT:-}"
    "${HOME}/printer_data/config"
    "/home/${SERVICE_USER}/printer_data/config"
    "/home/biqu/printer_data/config"
    "/home/pi/printer_data/config"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -n "${candidate}" && -d "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

find_nginx_site_config() {
  local candidates=(
    "${NGINX_SITE_CONFIG:-}"
    "/etc/nginx/sites-available/mainsail"
    "/etc/nginx/sites-enabled/mainsail"
    "/etc/nginx/conf.d/mainsail.conf"
    "/etc/nginx/sites-available/default"
    "/etc/nginx/sites-enabled/default"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -n "${candidate}" && -f "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

find_moonraker_config() {
  local candidates=(
    "${MOONRAKER_CONFIG:-}"
    "${HOME}/printer_data/config/moonraker.conf"
    "/home/${SERVICE_USER}/printer_data/config/moonraker.conf"
    "/home/biqu/printer_data/config/moonraker.conf"
    "/home/pi/printer_data/config/moonraker.conf"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -n "${candidate}" && -f "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

inject_nginx_include() {
  local site_config="$1"
  local include_line="    include ${NGINX_SNIPPET}; # ${APP_NAME}"

  if grep -Fq "${NGINX_SNIPPET}" "${site_config}"; then
    log "Nginx include already exists in ${site_config}"
    return 0
  fi

  local backup="${site_config}.bak.$(date +%Y%m%d%H%M%S)"
  run_sudo cp "${site_config}" "${backup}"

  local temp_file
  temp_file="$(mktemp)"

  awk -v include_line="${include_line}" '
    BEGIN { in_server = 0; depth = 0; inserted = 0 }
    /server[[:space:]]*\{/ { in_server = 1 }
    {
      if (in_server && !inserted && depth == 1 && $0 ~ /^[[:space:]]*}[[:space:]]*$/) {
        print include_line
        inserted = 1
      }
      print
      open_count = gsub(/\{/, "{")
      close_count = gsub(/\}/, "}")
      if (in_server) {
        depth += open_count - close_count
        if (depth <= 0 && inserted) in_server = 0
      }
    }
    END {
      if (!inserted) exit 42
    }
  ' "${site_config}" > "${temp_file}" || {
    rm -f "${temp_file}"
    log "Could not inject Nginx include automatically. Add this inside your server block:"
    log "${include_line}"
    exit 1
  }

  run_sudo cp "${temp_file}" "${site_config}"
  rm -f "${temp_file}"

  if ! run_sudo nginx -t; then
    log "Nginx test failed. Restoring backup ${backup}"
    run_sudo cp "${backup}" "${site_config}"
    run_sudo nginx -t
    exit 1
  fi
}

inject_update_manager_config() {
  local moonraker_config="$1"
  local backup="${moonraker_config}.bak.$(date +%Y%m%d%H%M%S)"
  local temp_file
  temp_file="$(mktemp)"

  run_sudo cp "${moonraker_config}" "${backup}"

  awk '
    BEGIN { skip = 0; found_base = 0 }
    /^\[update_manager\][[:space:]]*$/ { found_base = 1 }
    /^\[update_manager klipper-editor\][[:space:]]*$/ { skip = 1; next }
    /^\[/ && skip { skip = 0 }
    !skip { print }
    END {
      if (!found_base) {
        print ""
        print "[update_manager]"
      }
    }
  ' "${moonraker_config}" > "${temp_file}"

  cat >> "${temp_file}" <<MOONRAKER

[update_manager klipper-editor]
type: zip
channel: stable
repo: iscorporacion/klipper_editor
path: ${APP_DIR}
enable_node_updates: False
is_system_service: True
managed_services:
  ${SERVICE_NAME}
persistent_files:
  .env.production.local
MOONRAKER

  run_sudo cp "${temp_file}" "${moonraker_config}"
  rm -f "${temp_file}"
  log "Moonraker update manager entry added to ${moonraker_config}"
}

require_command node
require_command nginx
require_command systemctl

CONFIG_ROOT="$(detect_config_root)" || {
  log "Could not detect printer_data/config."
  log "Run again with RATOS_VIEWER_ROOT=/path/to/printer_data/config bash install.sh"
  exit 1
}

NGINX_SITE_CONFIG="$(find_nginx_site_config)" || {
  log "Could not detect Nginx site config."
  log "Run again with NGINX_SITE_CONFIG=/etc/nginx/sites-available/mainsail bash install.sh"
  exit 1
}

log "Configuring ${APP_NAME}"
log "App directory: ${APP_DIR}"
log "Config root: ${CONFIG_ROOT}"
log "Moonraker URL: ${MOONRAKER_URL}"
log "Base path: ${BASE_PATH}"
log "Port: ${APP_PORT}"
if [[ -n "${PUBLIC_HOST}" ]]; then
  log "Public host: ${PUBLIC_HOST}"
fi
log "Nginx config: ${NGINX_SITE_CONFIG}"

cat > "${APP_DIR}/.env.production.local" <<ENV
RATOS_VIEWER_ROOT=${CONFIG_ROOT}
RATOS_MOONRAKER_URL=${MOONRAKER_URL}
NEXT_PUBLIC_BASE_PATH=${BASE_PATH}
PORT=${APP_PORT}
NODE_ENV=production
ENV

run_sudo tee "${SYSTEMD_UNIT}" >/dev/null <<UNIT
[Unit]
Description=Klipper Editor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env.production.local
ExecStart=${START_COMMAND}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

run_sudo install -d /etc/nginx/snippets
run_sudo tee "${NGINX_SNIPPET}" >/dev/null <<NGINX
location = ${BASE_PATH} {
    proxy_pass http://127.0.0.1:${APP_PORT}${BASE_PATH};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}

location ${BASE_PATH}/ {
    proxy_pass http://127.0.0.1:${APP_PORT}${BASE_PATH}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}
NGINX

inject_nginx_include "${NGINX_SITE_CONFIG}"

if [[ "${CONFIGURE_UPDATE_MANAGER}" == "true" ]]; then
  if MOONRAKER_CONFIG_PATH="$(find_moonraker_config)"; then
    inject_update_manager_config "${MOONRAKER_CONFIG_PATH}"
  else
    log "Could not detect moonraker.conf. Add the update_manager entry manually or run with MOONRAKER_CONFIG=/path/to/moonraker.conf"
  fi
fi

if [[ -n "${PUBLIC_HOST}" ]]; then
  log "Nginx note: the app URL is ${PUBLIC_HOST%/}${BASE_PATH}/"
else
  log "Nginx note: the installer adds only the ${BASE_PATH}/ location. The host/IP comes from your existing Nginx server block."
fi

run_sudo systemctl daemon-reload
run_sudo systemctl enable "${SERVICE_NAME}"
run_sudo systemctl restart "${SERVICE_NAME}"
run_sudo systemctl reload nginx
if [[ "${CONFIGURE_UPDATE_MANAGER}" == "true" ]] && systemctl list-unit-files moonraker.service >/dev/null 2>&1; then
  run_sudo systemctl restart moonraker
fi

log "Installed."
if [[ -n "${PUBLIC_HOST}" ]]; then
  log "Open: ${PUBLIC_HOST%/}${BASE_PATH}/"
else
  log "Open: http://$(hostname -I | awk '{print $1}')${BASE_PATH}/"
fi
