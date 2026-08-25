#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="klipper-editor"
REPOSITORY="${KLIPPER_EDITOR_REPOSITORY:-iscorporacion/klipper_editor}"
VERSION="${KLIPPER_EDITOR_VERSION:-latest}"
ASSET_NAME="${KLIPPER_EDITOR_ASSET_NAME:-klipper-editor-standalone.tar.gz}"
BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/editor}"
APP_PORT="${PORT:-3007}"
SERVICE_USER="${SUDO_USER:-$USER}"
SERVICE_GROUP="$(id -gn "${SERVICE_USER}")"
INSTALL_ROOT="${KLIPPER_EDITOR_INSTALL_ROOT:-/home/${SERVICE_USER}/klipper_editor}"
RELEASES_DIR="${INSTALL_ROOT}/releases"
CURRENT_DIR="${INSTALL_ROOT}/current"

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

if [[ "${BASE_PATH}" != "/editor" ]]; then
  log "Precompiled releases are built for NEXT_PUBLIC_BASE_PATH=/editor."
  log "Use scripts/install.sh from source if you need a custom base path."
  exit 1
fi

require_command curl
require_command tar
require_command node
require_command nginx
require_command systemctl

if [[ "${VERSION}" == "latest" ]]; then
  DOWNLOAD_URL="https://github.com/${REPOSITORY}/releases/latest/download/${ASSET_NAME}"
  RELEASE_NAME="$(date +%Y%m%d%H%M%S)"
else
  DOWNLOAD_URL="https://github.com/${REPOSITORY}/releases/download/${VERSION}/${ASSET_NAME}"
  RELEASE_NAME="${VERSION}"
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

log "Downloading ${APP_NAME} ${VERSION} from ${DOWNLOAD_URL}"
curl -fL "${DOWNLOAD_URL}" -o "${TMP_DIR}/${ASSET_NAME}"
tar -xzf "${TMP_DIR}/${ASSET_NAME}" -C "${TMP_DIR}"

if [[ ! -f "${TMP_DIR}/${APP_NAME}/server.js" ]]; then
  log "Invalid release package: server.js was not found."
  exit 1
fi

RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
run_sudo install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${RELEASES_DIR}"
if [[ -e "${RELEASE_DIR}" ]]; then
  RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}-$(date +%H%M%S)"
fi
run_sudo install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${RELEASE_DIR}"
run_sudo cp -a "${TMP_DIR}/${APP_NAME}/." "${RELEASE_DIR}/"
run_sudo chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${RELEASE_DIR}"
run_sudo ln -sfnT "${RELEASE_DIR}" "${CURRENT_DIR}"
run_sudo chown -h "${SERVICE_USER}:${SERVICE_GROUP}" "${CURRENT_DIR}"

log "Installed files into ${RELEASE_DIR}"

KLIPPER_EDITOR_APP_DIR="${CURRENT_DIR}" \
KLIPPER_EDITOR_START_COMMAND="/usr/bin/env node server.js" \
PORT="${APP_PORT}" \
bash "${CURRENT_DIR}/scripts/configure-host.sh"
