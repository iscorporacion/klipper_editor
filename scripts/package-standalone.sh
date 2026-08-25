#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s /path/to/package-dir\n' "$0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="$1"

if [[ ! -f "${APP_DIR}/.next/standalone/server.js" ]]; then
  printf 'Missing .next/standalone/server.js. Run npm run build first.\n'
  exit 1
fi

if [[ -z "${DEST_DIR}" || "${DEST_DIR}" == "/" ]]; then
  printf 'Refusing to package into an unsafe destination.\n'
  exit 1
fi

rm -rf "${DEST_DIR}"
mkdir -p "${DEST_DIR}/.next"

cp -a "${APP_DIR}/.next/standalone/." "${DEST_DIR}/"
cp -a "${APP_DIR}/.next/static" "${DEST_DIR}/.next/static"
cp -a "${APP_DIR}/locales" "${DEST_DIR}/locales"
cp -a "${APP_DIR}/scripts" "${DEST_DIR}/scripts"
cp "${APP_DIR}/install-release.sh" "${DEST_DIR}/install-release.sh"
cp "${APP_DIR}/install.sh" "${DEST_DIR}/install.sh"
cp "${APP_DIR}/package.json" "${DEST_DIR}/package.json"
cp "${APP_DIR}/next.config.mjs" "${DEST_DIR}/next.config.mjs"

if [[ -d "${APP_DIR}/public" ]]; then
  cp -a "${APP_DIR}/public" "${DEST_DIR}/public"
fi

mkdir -p "${DEST_DIR}/node_modules/material-icon-theme"
cp -a "${APP_DIR}/node_modules/material-icon-theme/dist" "${DEST_DIR}/node_modules/material-icon-theme/dist"
cp -a "${APP_DIR}/node_modules/material-icon-theme/icons" "${DEST_DIR}/node_modules/material-icon-theme/icons"
