#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${KLIPPER_EDITOR_APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
INSTALL_ROOT="$(dirname "${APP_DIR}")"
RUNTIME_ROOT="${KLIPPER_EDITOR_RUNTIME_ROOT:-${INSTALL_ROOT}/runtime}"
MANIFEST="${APP_DIR}/node-runtime.json"

if [[ ! -f "${MANIFEST}" ]]; then
  printf 'Missing Node runtime manifest: %s\n' "${MANIFEST}" >&2
  exit 1
fi

VERSION="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "${MANIFEST}" | head -n 1)"
if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Invalid Node runtime version in %s\n' "${MANIFEST}" >&2
  exit 1
fi

case "$(uname -m)" in
  armv7l|armv7*) NODE_ARCH="armv7l" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  x86_64|amd64) NODE_ARCH="x64" ;;
  *) printf 'Unsupported architecture for managed Node runtime: %s\n' "$(uname -m)" >&2; exit 1 ;;
esac

CURRENT_NODE="${RUNTIME_ROOT}/current/bin/node"
if [[ -x "${CURRENT_NODE}" ]] && [[ "$("${CURRENT_NODE}" --version 2>/dev/null || true)" == "v${VERSION}" ]]; then
  printf 'Managed Node runtime is current: v%s (%s)\n' "${VERSION}" "${NODE_ARCH}"
  exit 0
fi

for command in curl tar sha256sum; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'Missing required command for Node runtime installation: %s\n' "${command}" >&2
    exit 1
  fi
done

mkdir -p "${RUNTIME_ROOT}"
STAGING="$(mktemp -d "${RUNTIME_ROOT}/.node-runtime.XXXXXX")"
cleanup() {
  [[ -n "${STAGING:-}" && "${STAGING}" == "${RUNTIME_ROOT}"/.node-runtime.* ]] && rm -rf -- "${STAGING}"
}
trap cleanup EXIT

ARCHIVE="node-v${VERSION}-linux-${NODE_ARCH}.tar.xz"
BASE_URL="https://nodejs.org/dist/v${VERSION}"
printf 'Downloading managed Node runtime v%s (%s)\n' "${VERSION}" "${NODE_ARCH}"
curl --fail --location --retry 3 --connect-timeout 15 "${BASE_URL}/${ARCHIVE}" -o "${STAGING}/${ARCHIVE}"
curl --fail --location --retry 3 --connect-timeout 15 "${BASE_URL}/SHASUMS256.txt" -o "${STAGING}/SHASUMS256.txt"

(
  cd "${STAGING}"
  awk -v archive="${ARCHIVE}" '$2 == archive { print }' SHASUMS256.txt > SHA256SUM
  [[ -s SHA256SUM ]] || { printf 'Official checksum was not found for %s\n' "${ARCHIVE}" >&2; exit 1; }
  sha256sum --check SHA256SUM
  tar -xJf "${ARCHIVE}"
)

EXTRACTED="${STAGING}/node-v${VERSION}-linux-${NODE_ARCH}"
[[ -x "${EXTRACTED}/bin/node" ]] || { printf 'Downloaded Node runtime is incomplete.\n' >&2; exit 1; }
[[ "$("${EXTRACTED}/bin/node" --version)" == "v${VERSION}" ]] || { printf 'Downloaded Node runtime version mismatch.\n' >&2; exit 1; }

TARGET_NAME="node-v${VERSION}-linux-${NODE_ARCH}"
TARGET="${RUNTIME_ROOT}/${TARGET_NAME}"
if [[ -e "${TARGET}" ]]; then
  rm -rf -- "${TARGET}"
fi
mv "${EXTRACTED}" "${TARGET}"
rm -f -- "${RUNTIME_ROOT}/current.new"
ln -s "${TARGET_NAME}" "${RUNTIME_ROOT}/current.new"
mv -Tf "${RUNTIME_ROOT}/current.new" "${RUNTIME_ROOT}/current"

# Keep only the active runtime. Failed downloads never reach this cleanup step.
while IFS= read -r -d '' candidate; do
  [[ "${candidate}" == "${TARGET}" ]] || rm -rf -- "${candidate}"
done < <(find "${RUNTIME_ROOT}" -mindepth 1 -maxdepth 1 -type d -name 'node-v*' -print0)

printf 'Managed Node runtime installed: v%s (%s)\n' "${VERSION}" "${NODE_ARCH}"
