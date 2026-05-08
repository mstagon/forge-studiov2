#!/usr/bin/env bash
# build-cr-graph-venv.sh
#
# Pre-builds an isolated venv (using the bundled python-build-standalone
# interpreter) and pip-installs `code-review-graph` inside it so the DMG
# ships with the CLI ready to run.
#
# Output:
#   resources/bundled-tools/darwin-arm64/cr-graph-venv/
#     bin/python                (symlink → ../../python/bin/python3.12)
#     bin/code-review-graph     (entrypoint, shebang → bundled python)
#     lib/python3.12/site-packages/code_review_graph/...
#
# Idempotent: if the venv already exists and `code-review-graph --version`
# resolves, we skip the install. Pass `FORCE=1` to rebuild from scratch.
#
# Pre-requisite: scripts/download-bundled-tools.sh has already populated
# resources/bundled-tools/darwin-arm64/python/bin/python3.12. If that path is
# missing we exit non-zero so the build pipeline fails loudly rather than
# silently producing a DMG without a working code-review-graph.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS_DIR="${ROOT_DIR}/resources/bundled-tools/darwin-arm64"
PYTHON_BIN="${TOOLS_DIR}/python/bin/python3.12"
VENV_DIR="${TOOLS_DIR}/cr-graph-venv"

# ─── Platform guard: the venv's Python is darwin-arm64 — refusing to build
#     on a non-arm64 host avoids a corrupt cross-platform venv shipping in
#     the DMG. CI must run this on the same arm64 runner that downloaded the
#     standalone interpreter.
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"
if [[ "${PLATFORM}" != "Darwin" || "${ARCH}" != "arm64" ]]; then
  echo "[cr-graph-venv] non-darwin-arm64 host (${PLATFORM}/${ARCH}); skipping."
  exit 0
fi

if [[ ! -x "${PYTHON_BIN}" ]]; then
  # Fallback: the standalone tarball ships python3 (versioned) too.
  PYTHON_BIN="${TOOLS_DIR}/python/bin/python3"
fi

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "[cr-graph-venv] ERROR: bundled python not found." >&2
  echo "[cr-graph-venv] run scripts/download-bundled-tools.sh first." >&2
  exit 1
fi

# ─── Skip-if-fresh ───────────────────────────────────────────────────────
if [[ "${FORCE:-0}" != "1" \
   && -x "${VENV_DIR}/bin/code-review-graph" \
   && -x "${VENV_DIR}/bin/python" ]]; then
  if "${VENV_DIR}/bin/code-review-graph" --version >/dev/null 2>&1; then
    echo "[cr-graph-venv] existing venv at ${VENV_DIR} works — skipping."
    exit 0
  fi
fi

if [[ -d "${VENV_DIR}" ]]; then
  echo "[cr-graph-venv] removing stale venv at ${VENV_DIR}..."
  rm -rf "${VENV_DIR}"
fi

# ─── Create venv ─────────────────────────────────────────────────────────
# `--copies` makes the venv self-contained (no symlinks back into the bundled
# python tree). After the DMG is assembled, the cr-graph-venv folder ends up
# under Contents/Resources/bundled-tools/cr-graph-venv next to ../python/, so
# even with copies the relative shebang still works because we explicitly
# rewrite the shebangs below.
echo "[cr-graph-venv] creating venv with ${PYTHON_BIN}..."
"${PYTHON_BIN}" -m venv --copies "${VENV_DIR}"

# Upgrade pip first so resolve is fast + uses modern wheel cache layout.
"${VENV_DIR}/bin/python" -m pip install --upgrade pip wheel >/dev/null

# ─── Install code-review-graph ───────────────────────────────────────────
echo "[cr-graph-venv] installing code-review-graph..."
"${VENV_DIR}/bin/python" -m pip install --no-cache-dir code-review-graph

# ─── Verify ──────────────────────────────────────────────────────────────
if ! "${VENV_DIR}/bin/code-review-graph" --version >/dev/null 2>&1; then
  echo "[cr-graph-venv] ERROR: code-review-graph CLI did not install correctly." >&2
  exit 1
fi

# ─── Rewrite shebangs to a portable form ─────────────────────────────────
# `python -m venv` bakes the absolute path of PYTHON_BIN into every console
# script (e.g. `#!/Users/.../resources/bundled-tools/darwin-arm64/python/bin/python3.12`).
# That path is wrong inside the packaged DMG (Resources/bundled-tools/...),
# so we replace it with `/usr/bin/env python` + a wrapper. PathManager will
# spawn the CLI with PATH augmented to put cr-graph-venv/bin and python/bin
# first, so `env python` resolves to the bundled interpreter at runtime.
python3 - "${VENV_DIR}" <<'PY'
import os, sys, stat
venv = sys.argv[1]
bin_dir = os.path.join(venv, "bin")
for name in os.listdir(bin_dir):
    p = os.path.join(bin_dir, name)
    if os.path.islink(p) or not os.path.isfile(p):
        continue
    try:
        with open(p, "rb") as f:
            head = f.read(2)
        if head != b"#!":
            continue
        with open(p, "rb") as f:
            data = f.read()
        first_nl = data.find(b"\n")
        if first_nl == -1:
            continue
        # Replace any baked python path with /usr/bin/env python
        new_shebang = b"#!/usr/bin/env python"
        with open(p, "wb") as f:
            f.write(new_shebang + data[first_nl:])
        os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except Exception as e:
        print(f"[cr-graph-venv] warn: could not rewrite shebang for {p}: {e}", file=sys.stderr)
PY

CR_VERSION="$("${VENV_DIR}/bin/code-review-graph" --version 2>/dev/null || echo unknown)"
echo "[cr-graph-venv] installed ${CR_VERSION} -> ${VENV_DIR}/bin/code-review-graph"
