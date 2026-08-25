#!/usr/bin/env bash
set -Eeuo pipefail

BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/editor}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_DIR="${APP_DIR}/.next/klipper-editor-runtime"

log() {
  printf '%s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    exit 1
  fi
}

require_command node
require_command npm

log "Installing Klipper Editor from source."
log "This mode compiles Next.js on this host. On low-memory printer hosts, use install-release.sh instead."

cd "${APP_DIR}"
npm ci
NEXT_PUBLIC_BASE_PATH="${BASE_PATH}" npm run build
bash "${SCRIPT_DIR}/package-standalone.sh" "${RUNTIME_DIR}"
npm prune --omit=dev

KLIPPER_EDITOR_APP_DIR="${RUNTIME_DIR}" \
KLIPPER_EDITOR_START_COMMAND="/usr/bin/env node server.js" \
KLIPPER_EDITOR_CONFIGURE_UPDATE_MANAGER="${KLIPPER_EDITOR_CONFIGURE_UPDATE_MANAGER:-false}" \
bash "${RUNTIME_DIR}/scripts/configure-host.sh"
