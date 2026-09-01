#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s /path/to/package-dir\n' "$0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="$1"
PROJECT_OWNER="${KLIPPER_EDITOR_PROJECT_OWNER:-iscorporacion}"
PROJECT_NAME="${KLIPPER_EDITOR_PROJECT_NAME:-klipper_editor}"
ASSET_NAME="${KLIPPER_EDITOR_ASSET_NAME:-klipper-editor.zip}"
VERSION="${KLIPPER_EDITOR_RELEASE_VERSION:-}"

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

mcp_tunnel_modules=(
  ansi-regex
  ansi-styles
  axios
  cliui
  color-convert
  color-name
  debug
  emoji-regex
  escalade
  follow-redirects
  get-caller-file
  is-fullwidth-code-point
  localtunnel
  ms
  openurl
  require-directory
  string-width
  strip-ansi
  wrap-ansi
  y18n
  yargs
  yargs-parser
)

for module_name in "${mcp_tunnel_modules[@]}"; do
  if [[ -d "${APP_DIR}/node_modules/${module_name}" ]]; then
    mkdir -p "${DEST_DIR}/node_modules/$(dirname "${module_name}")"
    cp -a "${APP_DIR}/node_modules/${module_name}" "${DEST_DIR}/node_modules/${module_name}"
  fi
done

if [[ -z "${VERSION}" ]]; then
  VERSION="$(git -C "${APP_DIR}" describe --tags --exact-match 2>/dev/null || git -C "${APP_DIR}" describe --tags --always --dirty 2>/dev/null || node -p "require('${APP_DIR}/package.json').version")"
fi

cat > "${DEST_DIR}/release_info.json" <<JSON
{
  "project_name": "${PROJECT_NAME}",
  "project_owner": "${PROJECT_OWNER}",
  "version": "${VERSION}",
  "asset_name": "${ASSET_NAME}"
}
JSON
