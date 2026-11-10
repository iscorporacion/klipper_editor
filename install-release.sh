#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="klipper-editor"
REPOSITORY="${KLIPPER_EDITOR_REPOSITORY:-iscorporacion/klipper_editor}"
VERSION="${KLIPPER_EDITOR_VERSION:-latest}"
ASSET_NAME="${KLIPPER_EDITOR_ASSET_NAME:-klipper-editor.zip}"
BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/editor}"
APP_PORT="${PORT:-3007}"
SERVICE_NAME="${KLIPPER_EDITOR_SERVICE_NAME:-klipper-editor}"
SERVICE_USER="${SUDO_USER:-$USER}"
SERVICE_GROUP="$(id -gn "${SERVICE_USER}")"
INSTALL_ROOT="${KLIPPER_EDITOR_INSTALL_ROOT:-/home/${SERVICE_USER}/klipper_editor_app}"
CURRENT_DIR="${INSTALL_ROOT}/current"
LEGACY_CURRENT_DIR="/home/${SERVICE_USER}/klipper_editor/current"
TEMP_ROOT="${KLIPPER_EDITOR_TEMP_ROOT:-${INSTALL_ROOT}/.install-tmp}"

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

safe_app_path() {
  local target="$1"
  [[ -n "${target}" && "${target}" != "/" && "${target}" == */current ]]
}

path_within_git_repo() {
  local target="$1"
  local dir
  dir="$(cd "$(dirname "${target}")" 2>/dev/null && pwd -P || true)"

  while [[ -n "${dir}" && "${dir}" != "/" ]]; do
    if [[ -d "${dir}/.git" ]]; then
      return 0
    fi
    dir="$(dirname "${dir}")"
  done

  return 1
}

if [[ "${BASE_PATH}" != "/editor" ]]; then
  log "Precompiled releases are built for NEXT_PUBLIC_BASE_PATH=/editor."
  log "Use scripts/install.sh from source if you need a custom base path."
  exit 1
fi

require_command curl
require_command unzip
require_command nginx
require_command systemctl
require_command tar
require_command sha256sum

if [[ "${VERSION}" == "latest" ]]; then
  DOWNLOAD_URL="https://github.com/${REPOSITORY}/releases/latest/download/${ASSET_NAME}"
else
  DOWNLOAD_URL="https://github.com/${REPOSITORY}/releases/download/${VERSION}/${ASSET_NAME}"
fi

run_sudo install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${INSTALL_ROOT}"
run_sudo install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${TEMP_ROOT}"
TEMP_ROOT="$(cd "${TEMP_ROOT}" && pwd -P)"
if [[ -z "${TEMP_ROOT}" || "${TEMP_ROOT}" == "/" ]]; then
  log "Refusing to use an unsafe temporary directory: ${TEMP_ROOT}"
  exit 1
fi
if [[ "${EUID}" -eq 0 && "${SERVICE_USER}" != "root" ]]; then
  TMP_DIR="$(runuser -u "${SERVICE_USER}" -- mktemp -d "${TEMP_ROOT}/release.XXXXXX")"
else
  TMP_DIR="$(mktemp -d "${TEMP_ROOT}/release.XXXXXX")"
fi
cleanup() {
  if [[ -n "${TMP_DIR:-}" && "${TMP_DIR}" == "${TEMP_ROOT}"/release.* ]]; then
    run_sudo rm -rf -- "${TMP_DIR}"
  fi
}
trap cleanup EXIT

log "Downloading ${APP_NAME} ${VERSION} from ${DOWNLOAD_URL}"
curl -fL "${DOWNLOAD_URL}" -o "${TMP_DIR}/${ASSET_NAME}"
unzip -q "${TMP_DIR}/${ASSET_NAME}" -d "${TMP_DIR}/release"

if [[ ! -f "${TMP_DIR}/release/server.js" ]]; then
  log "Invalid release package: server.js was not found."
  exit 1
fi

if [[ ! -f "${TMP_DIR}/release/release_info.json" ]]; then
  log "Invalid release package: release_info.json was not found."
  exit 1
fi

if ! safe_app_path "${CURRENT_DIR}"; then
  log "Refusing to install into unsafe path: ${CURRENT_DIR}"
  exit 1
fi

if path_within_git_repo "${CURRENT_DIR}"; then
  log "Refusing to install inside a git repo: ${CURRENT_DIR}"
  log "Moonraker Update Manager requires zip applications to be outside git repositories."
  log "Use a path like /home/${SERVICE_USER}/klipper_editor_app/current"
  exit 1
fi

ENV_BACKUP=""
if [[ -f "${CURRENT_DIR}/.env.production.local" ]]; then
  ENV_BACKUP="${TMP_DIR}/.env.production.local"
  cp "${CURRENT_DIR}/.env.production.local" "${ENV_BACKUP}"
elif [[ -f "${LEGACY_CURRENT_DIR}/.env.production.local" ]]; then
  ENV_BACKUP="${TMP_DIR}/.env.production.local"
  cp "${LEGACY_CURRENT_DIR}/.env.production.local" "${ENV_BACKUP}"
fi

if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  run_sudo systemctl stop "${SERVICE_NAME}" || true
fi

if [[ -e "${CURRENT_DIR}" || -L "${CURRENT_DIR}" ]]; then
  run_sudo rm -rf "${CURRENT_DIR}"
fi
run_sudo install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${CURRENT_DIR}"
run_sudo cp -a "${TMP_DIR}/release/." "${CURRENT_DIR}/"

if [[ -n "${ENV_BACKUP}" ]]; then
  run_sudo cp "${ENV_BACKUP}" "${CURRENT_DIR}/.env.production.local"
fi

run_sudo chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${CURRENT_DIR}"

log "Installed files into ${CURRENT_DIR}"

RUNTIME_ROOT="${INSTALL_ROOT}/runtime"
run_sudo install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${RUNTIME_ROOT}"
if [[ "${EUID}" -eq 0 && "${SERVICE_USER}" != "root" ]]; then
  runuser -u "${SERVICE_USER}" -- env \
    KLIPPER_EDITOR_APP_DIR="${CURRENT_DIR}" \
    KLIPPER_EDITOR_RUNTIME_ROOT="${RUNTIME_ROOT}" \
    bash "${CURRENT_DIR}/scripts/ensure-node-runtime.sh"
else
  KLIPPER_EDITOR_APP_DIR="${CURRENT_DIR}" \
  KLIPPER_EDITOR_RUNTIME_ROOT="${RUNTIME_ROOT}" \
  bash "${CURRENT_DIR}/scripts/ensure-node-runtime.sh"
fi
NODE_BIN="${RUNTIME_ROOT}/current/bin/node"

KLIPPER_EDITOR_APP_DIR="${CURRENT_DIR}" \
KLIPPER_EDITOR_NODE_BIN="${NODE_BIN}" \
KLIPPER_EDITOR_RUNTIME_ROOT="${RUNTIME_ROOT}" \
KLIPPER_EDITOR_START_COMMAND="/usr/bin/env bash ${CURRENT_DIR}/scripts/start-runtime.sh" \
PORT="${APP_PORT}" \
bash "${CURRENT_DIR}/scripts/configure-host.sh"
