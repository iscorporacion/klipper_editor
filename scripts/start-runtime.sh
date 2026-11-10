#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
INSTALL_ROOT="$(dirname "${APP_DIR}")"

RUNTIME_ROOT="${KLIPPER_EDITOR_RUNTIME_ROOT:-${INSTALL_ROOT}/runtime}"
if ! KLIPPER_EDITOR_APP_DIR="${APP_DIR}" \
  KLIPPER_EDITOR_RUNTIME_ROOT="${RUNTIME_ROOT}" \
  bash "${SCRIPT_DIR}/ensure-node-runtime.sh"; then
  if [[ ! -x "${RUNTIME_ROOT}/current/bin/node" ]]; then
    printf 'Managed Node runtime is unavailable and no previous runtime can be used.\n' >&2
    exit 1
  fi
  printf 'Managed Node update failed; starting with the previous private runtime.\n' >&2
fi

NODE_BIN="${RUNTIME_ROOT}/current/bin/node"
exec "${NODE_BIN}" "${APP_DIR}/server.js"
