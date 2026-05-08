#!/usr/bin/env bash
# download-bundled-tools.sh
#
# Pulls the static binary toolchain that ships *inside* the Forge Studio DMG so
# users do not need their own Homebrew / pyenv / pipx / uv / cargo to launch
# Agent Teams or build a code-review-graph. The script is intentionally
# idempotent — re-running it on a populated tree just verifies the marker file
# and exits.
#
# Outputs:
#   resources/bundled-tools/darwin-arm64/
#     bin/tmux             (1MB)   — agent-team multi-pane backend
#     bin/uv               (10MB)  — Python pkg manager (Astral)
#     python/              (~80MB unpacked) — python-build-standalone 3.12
#     .download-stamp.json — versions + sha256 sums (used for re-run skip)
#
# Sources:
#   tmux  : Homebrew bottle on the build host (`brew --prefix tmux`).
#           Official tmux releases ship source-only; bottling requires a
#           full libevent + ncurses static build that we'd otherwise have to
#           maintain ourselves. The CI image / dev's machine is expected to
#           already have tmux installed via brew.
#   uv    : github.com/astral-sh/uv releases (aarch64-apple-darwin tarball)
#   python: github.com/indygreg/python-build-standalone releases
#           (cpython-3.12.x+YYYYMMDD-aarch64-apple-darwin-install_only.tar.gz)
#
# Re-run safety: a `.download-stamp.json` is written after a successful run.
# If the stamp's `version` matches the values pinned in this script and every
# expected output file exists, we skip the network entirely. Override with
# `FORCE=1 bash scripts/download-bundled-tools.sh` to re-download.
#
# Target: macOS arm64 only (current build target — see README + package.json).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/resources/bundled-tools/darwin-arm64"
STAMP="${OUT_DIR}/.download-stamp.json"

# ─── Pinned versions (bump together with stamp version) ──────────────────
UV_VERSION="0.4.30"
UV_TARBALL="uv-aarch64-apple-darwin.tar.gz"
UV_URL="https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${UV_TARBALL}"

PYTHON_VERSION="3.12.7"
PYTHON_RELEASE="20241016"
PYTHON_TARBALL="cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-aarch64-apple-darwin-install_only.tar.gz"
PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_RELEASE}/${PYTHON_TARBALL}"

STAMP_VERSION="1"  # bump when any pinned version above changes

# ─── Platform guard ──────────────────────────────────────────────────────
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"
if [[ "${PLATFORM}" != "Darwin" || "${ARCH}" != "arm64" ]]; then
  echo "[bundled-tools] non-darwin-arm64 host (${PLATFORM}/${ARCH}); skipping."
  echo "[bundled-tools] CI must run this step on a macOS arm64 runner."
  exit 0
fi

# ─── Helpers ─────────────────────────────────────────────────────────────
log() { echo "[bundled-tools] $*"; }
die() { echo "[bundled-tools] ERROR: $*" >&2; exit 1; }

ensure_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

ensure_cmd curl
ensure_cmd tar
ensure_cmd shasum

mkdir -p "${OUT_DIR}/bin"

# ─── Skip-if-fresh: stamp + every expected file present ──────────────────
need_download=1
if [[ "${FORCE:-0}" != "1" && -f "${STAMP}" ]]; then
  if grep -q "\"stampVersion\": \"${STAMP_VERSION}\"" "${STAMP}" 2>/dev/null \
    && [[ -x "${OUT_DIR}/bin/tmux" ]] \
    && [[ -x "${OUT_DIR}/bin/uv" ]] \
    && [[ -x "${OUT_DIR}/python/bin/python3.12" || -x "${OUT_DIR}/python/bin/python3" ]]; then
    log "stamp v${STAMP_VERSION} matches; all binaries present — skipping."
    need_download=0
  fi
fi

if [[ "${need_download}" -eq 0 ]]; then
  exit 0
fi

# ─── 1. tmux: copy from local brew install ───────────────────────────────
# Rationale: tmux upstream ships source tarballs only — there is no official
# darwin-arm64 prebuilt binary. brew bottles ARE prebuilt + static-ish (link
# against libevent + ncurses brew bottles), and copying the resolved binary
# into our resources/ folder is the lowest-friction path. The build host
# (CI runner or developer machine) is expected to have `brew install tmux`.
if ! command -v brew >/dev/null 2>&1; then
  die "tmux bundling requires Homebrew on the build host (brew install tmux)."
fi

if ! brew --prefix tmux >/dev/null 2>&1; then
  log "tmux is not installed via brew — running 'brew install tmux'..."
  brew install tmux
fi

TMUX_BREW_BIN="$(brew --prefix tmux)/bin/tmux"
if [[ ! -x "${TMUX_BREW_BIN}" ]]; then
  die "expected tmux at ${TMUX_BREW_BIN} but it is missing or not executable."
fi
cp -f "${TMUX_BREW_BIN}" "${OUT_DIR}/bin/tmux"
chmod +x "${OUT_DIR}/bin/tmux"
TMUX_VERSION="$("${OUT_DIR}/bin/tmux" -V 2>/dev/null | awk '{print $2}' || echo unknown)"
TMUX_SHA256="$(shasum -a 256 "${OUT_DIR}/bin/tmux" | awk '{print $1}')"
log "tmux ${TMUX_VERSION} -> ${OUT_DIR}/bin/tmux"

# Note: the brew tmux binary still dynamically links libevent + ncurses + utf8proc.
# `otool -L` against the user system would expose those — for the v0.5.1 bundle
# we ship the brew binary as-is and rely on macOS providing libSystem
# dependencies. If a user-reported missing-dylib bug shows up, switch this to
# building tmux statically (Makefile + libevent vendored).

# ─── 2. uv: tarball from astral-sh/uv releases ───────────────────────────
TMP_UV="$(mktemp -d)"
trap 'rm -rf "${TMP_UV}"' EXIT
log "downloading uv ${UV_VERSION}..."
curl --fail --location --silent --show-error \
  --output "${TMP_UV}/${UV_TARBALL}" \
  "${UV_URL}"
UV_TARBALL_SHA256="$(shasum -a 256 "${TMP_UV}/${UV_TARBALL}" | awk '{print $1}')"
log "uv tarball sha256: ${UV_TARBALL_SHA256}"

tar -xzf "${TMP_UV}/${UV_TARBALL}" -C "${TMP_UV}"
# Tarball layout: uv-aarch64-apple-darwin/uv  (and uvx). Find the binary.
UV_BIN="$(find "${TMP_UV}" -type f -name uv -perm -u+x | head -1)"
[[ -n "${UV_BIN}" ]] || die "uv binary not found inside ${UV_TARBALL}"
cp -f "${UV_BIN}" "${OUT_DIR}/bin/uv"
chmod +x "${OUT_DIR}/bin/uv"
UV_BIN_SHA256="$(shasum -a 256 "${OUT_DIR}/bin/uv" | awk '{print $1}')"
log "uv ${UV_VERSION} -> ${OUT_DIR}/bin/uv (sha ${UV_BIN_SHA256})"

# ─── 3. python: indygreg/python-build-standalone tarball ─────────────────
PY_DIR="${OUT_DIR}/python"
if [[ -d "${PY_DIR}" ]]; then
  log "removing previous python tree at ${PY_DIR}..."
  rm -rf "${PY_DIR}"
fi
TMP_PY="$(mktemp -d)"
log "downloading python ${PYTHON_VERSION}+${PYTHON_RELEASE} (~30MB)..."
curl --fail --location --silent --show-error \
  --output "${TMP_PY}/${PYTHON_TARBALL}" \
  "${PYTHON_URL}"
PY_TARBALL_SHA256="$(shasum -a 256 "${TMP_PY}/${PYTHON_TARBALL}" | awk '{print $1}')"
log "python tarball sha256: ${PY_TARBALL_SHA256}"

# install_only tarballs unpack to ./python/{bin,lib,share,include}
tar -xzf "${TMP_PY}/${PYTHON_TARBALL}" -C "${TMP_PY}"
[[ -d "${TMP_PY}/python" ]] || die "expected ./python/ dir inside install_only tarball"
mv "${TMP_PY}/python" "${PY_DIR}"
rm -rf "${TMP_PY}"

[[ -x "${PY_DIR}/bin/python3.12" || -x "${PY_DIR}/bin/python3" ]] \
  || die "extracted python tree is missing bin/python3*"
log "python -> ${PY_DIR}"

# ─── 4. write stamp ──────────────────────────────────────────────────────
cat > "${STAMP}" <<JSON
{
  "stampVersion": "${STAMP_VERSION}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tmux": {
    "version": "${TMUX_VERSION}",
    "source": "homebrew (${TMUX_BREW_BIN})",
    "sha256": "${TMUX_SHA256}"
  },
  "uv": {
    "version": "${UV_VERSION}",
    "tarball": "${UV_URL}",
    "tarballSha256": "${UV_TARBALL_SHA256}",
    "binarySha256": "${UV_BIN_SHA256}"
  },
  "python": {
    "version": "${PYTHON_VERSION}",
    "release": "${PYTHON_RELEASE}",
    "tarball": "${PYTHON_URL}",
    "tarballSha256": "${PY_TARBALL_SHA256}"
  }
}
JSON

log "done. stamp written to ${STAMP}"
