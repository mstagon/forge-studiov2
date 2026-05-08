#!/usr/bin/env bash
# build-cr-graph-venv.sh
#
# Pre-builds an isolated venv (using the bundled python-build-standalone
# interpreter) and pip-installs `code-review-graph` inside it so the DMG
# ships with the CLI ready to run.
#
# Output:
#   resources/bundled-tools/darwin-arm64/cr-graph-venv/
#     bin/python                (RELATIVE symlink → ../../python/bin/python3.12)
#     bin/code-review-graph     (entrypoint with portable polyglot wrapper)
#     lib/python3.12/site-packages/code_review_graph/...
#
# Idempotent: if the venv already exists and `code-review-graph --version`
# resolves, we skip the install. Pass `FORCE=1` to rebuild from scratch.
#
# Pre-requisite: scripts/download-bundled-tools.sh has already populated
# resources/bundled-tools/darwin-arm64/python/bin/python3.12. If that path is
# missing we exit non-zero so the build pipeline fails loudly rather than
# silently producing a DMG without a working code-review-graph.
#
# Optional env vars:
#   SLIM_LANGUAGES=1   Prune unused tree-sitter language bindings (.abi3.so)
#                       from tree_sitter_language_pack to ~70-80MB instead of
#                       ~350MB. Keeps a curated list of languages we ship with
#                       (Dart/Flutter, JS/TS, Python, Rust, Go, Prisma, etc.).

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
# We additionally probe whether the existing venv's symlinks are *relative*
# and shebangs are *portable* — an old build that shipped absolute paths
# would pass `--version` on the build host but break inside the DMG, so we
# must rebuild it.
needs_rebuild() {
  [[ "${FORCE:-0}" == "1" ]] && return 0
  [[ ! -x "${VENV_DIR}/bin/code-review-graph" ]] && return 0
  [[ ! -e "${VENV_DIR}/bin/python" ]] && return 0

  # python symlink must be relative — `readlink` returns the link target
  # without resolving it. An absolute target (starts with `/`) is broken
  # in the packaged DMG.
  local link_target
  link_target="$(readlink "${VENV_DIR}/bin/python" 2>/dev/null || echo '')"
  if [[ -z "${link_target}" || "${link_target}" == /* ]]; then
    return 0
  fi

  # The polyglot bash exec line in the console script must use a relative
  # path computation, not a hard-coded absolute path from the build host.
  if grep -q "'''exec' '/" "${VENV_DIR}/bin/code-review-graph" 2>/dev/null; then
    return 0
  fi

  if "${VENV_DIR}/bin/code-review-graph" --version >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

if ! needs_rebuild; then
  echo "[cr-graph-venv] existing venv at ${VENV_DIR} is portable — skipping."
  exit 0
fi

if [[ -d "${VENV_DIR}" ]]; then
  echo "[cr-graph-venv] removing stale venv at ${VENV_DIR}..."
  rm -rf "${VENV_DIR}"
fi

# ─── Create venv ─────────────────────────────────────────────────────────
# python-build-standalone 의 ensurepip 가 macOS arm64 에서 종종 SIGABRT
# 로 죽는 알려진 이슈가 있어 (codesigning + Frameworks 경로) bundled uv
# 로 venv 생성한다. uv 는 자체적으로 pip 를 부트스트랩하므로 ensurepip
# 미사용. uv 가 없으면 (다운로드 실패) python venv fallback.
UV_BIN="${TOOLS_DIR}/bin/uv"
if [[ -x "${UV_BIN}" ]]; then
  echo "[cr-graph-venv] creating venv with ${UV_BIN} (python: ${PYTHON_BIN})..."
  "${UV_BIN}" venv --python "${PYTHON_BIN}" "${VENV_DIR}"
  echo "[cr-graph-venv] installing code-review-graph via uv pip..."
  "${UV_BIN}" pip install --python "${VENV_DIR}/bin/python" code-review-graph
else
  echo "[cr-graph-venv] uv 없음 — python venv fallback (ensurepip 사용)..."
  "${PYTHON_BIN}" -m venv --copies "${VENV_DIR}"
  "${VENV_DIR}/bin/python" -m pip install --upgrade pip wheel >/dev/null
  "${VENV_DIR}/bin/python" -m pip install --no-cache-dir code-review-graph
fi

# ─── Verify (build host) ─────────────────────────────────────────────────
if ! "${VENV_DIR}/bin/code-review-graph" --version >/dev/null 2>&1; then
  echo "[cr-graph-venv] ERROR: code-review-graph CLI did not install correctly." >&2
  exit 1
fi

# ─── Make python symlinks RELATIVE ───────────────────────────────────────
# uv (and `python -m venv`) bake the absolute path of the build-host's
# Python into `cr-graph-venv/bin/python`. That breaks the moment the venv
# moves to `Contents/Resources/bundled-tools/cr-graph-venv/` inside the
# DMG — the symlink dangles, and every console script that re-execs into
# `bin/python` fails with "no such file or directory".
#
# A relative symlink (`../../python/bin/python3.12`) survives any move
# because both `cr-graph-venv/` and `python/` sit side-by-side under the
# same `bundled-tools/` root in dev *and* in the packaged Resources dir.
echo "[cr-graph-venv] rewriting python symlinks to relative form..."
(
  cd "${VENV_DIR}/bin"
  for link in python python3 python3.12; do
    [[ -e "${link}" || -L "${link}" ]] || continue
    rm -f "${link}"
  done
  # The "real" interpreter is python3.12 in the sibling python/bin/.
  # The other names alias to python3.12 — using local relative aliases
  # keeps the chain short (1 hop) so dyld doesn't have to resolve a
  # multi-hop link tree.
  ln -s "../../python/bin/python3.12" "python3.12"
  ln -s "python3.12" "python3"
  ln -s "python3.12" "python"
)

# ─── Rewrite console-script polyglot wrappers to be path-portable ────────
# uv generates console scripts using a bash/Python polyglot:
#
#   #!/usr/bin/env python
#   '''exec' '/abs/path/to/cr-graph-venv/bin/python' "$0" "$@"
#   ' '''
#   ...python source...
#
# The bash interpreter sees `'''exec' '...path...' "$0" "$@"\n' '''` —
# valid bash that re-execs the file with a *real* python. Python sees
# `'''...'''` — a triple-quoted string that's a no-op. Clever, but the
# absolute path on line 2 is the *build host's* path, dead inside the DMG.
#
# We rewrite it so the bash branch computes the path at runtime:
#
#   #!/usr/bin/env bash
#   '''exec' "$(cd "$(dirname "$0")" && pwd)/python" "$0" "$@"
#   ' '''
#
# The `#!` is now bash (so the kernel always invokes bash, never `python`
# which may not exist on the user's system), and the bash exec line
# resolves `bin/python` relative to the script's own directory — which
# is `cr-graph-venv/bin/` whether we're in dev, packaged, or moved.
echo "[cr-graph-venv] rewriting console script wrappers to portable form..."
python3 - "${VENV_DIR}" <<'PY'
import os, sys, stat
venv = sys.argv[1]
bin_dir = os.path.join(venv, "bin")
PORTABLE_BASH = (
    b"#!/usr/bin/env bash\n"
    b"'''exec' \"$(cd \"$(dirname \"$0\")\" && pwd)/python\" \"$0\" \"$@\"\n"
    b"' '''\n"
)
rewritten = 0
for name in os.listdir(bin_dir):
    p = os.path.join(bin_dir, name)
    if os.path.islink(p) or not os.path.isfile(p):
        continue
    try:
        with open(p, "rb") as f:
            data = f.read()
    except Exception:
        continue
    if not data.startswith(b"#!"):
        continue
    # Parse the original header. uv-generated scripts have:
    #   line 0: shebang
    #   line 1: '''exec' '<abs python>' "$0" "$@"   (bash branch)
    #   line 2: ' '''                                (bash close / python no-op)
    lines = data.split(b"\n")
    if len(lines) < 3:
        continue
    is_polyglot = lines[1].lstrip().startswith(b"'''exec'") and lines[2].strip() == b"' '''"
    if is_polyglot:
        new_data = PORTABLE_BASH + b"\n".join(lines[3:])
    else:
        # Plain `#!/abs/python` shebang — replace with a small bash wrapper
        # that re-execs through the relative `bin/python`. Append the
        # original body verbatim (Python ignores leading shell after a
        # heredoc-less script only via the polyglot; for non-polyglot
        # scripts we keep the body and rely on the bash exec to swap to
        # the python interpreter before the body is parsed).
        rest = b"\n".join(lines[1:])
        new_data = PORTABLE_BASH + rest
    with open(p, "wb") as f:
        f.write(new_data)
    os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    rewritten += 1
print(f"[cr-graph-venv] rewrote {rewritten} console script(s)")
PY

# ─── Optional: slim the tree-sitter language pack ────────────────────────
# tree_sitter_language_pack ships ~170 precompiled language grammars as
# `bindings/<lang>.abi3.so`, totalling ~350MB. Forge users primarily work
# in Flutter (Dart), TS/JS, Python, Prisma — the long tail (cobol, verilog,
# fortran, nim, etc.) is dead weight in the DMG. When SLIM_LANGUAGES=1 is
# set we keep a curated list and delete the rest, dropping the venv from
# ~440MB → ~80MB. Default OFF so we don't surprise anyone whose workspace
# happens to contain Java/Ruby/Erlang.
if [[ "${SLIM_LANGUAGES:-0}" == "1" ]]; then
  echo "[cr-graph-venv] SLIM_LANGUAGES=1 — pruning unused tree-sitter bindings..."
  python3 - "${VENV_DIR}" <<'PY'
import os, sys
venv = sys.argv[1]
# Anchor on the actual import name used by code-review-graph + the typical
# Forge stack. If a user workspace uses a language outside this set, the
# CLI will fall back to text-only parsing for that language.
KEEP = {
    # Forge core stack
    "dart", "typescript", "tsx", "javascript", "python", "prisma",
    # Web / config
    "html", "css", "scss", "json", "jsonc", "json5", "yaml", "toml",
    "xml", "csv",
    # Native / systems (commonly imported by Forge users)
    "c", "cpp", "rust", "go", "swift", "kotlin", "java",
    # Shell / build
    "bash", "fish", "make", "cmake", "dockerfile",
    # Markup / docs
    "markdown", "markdown_inline", "rst",
    # Query languages used in the cr-graph itself
    "sql", "graphql", "regex", "comment",
    # tree-sitter helper grammars referenced by __init__.py
    "embedded_template",
}
bindings_dir = os.path.join(
    venv, "lib", "python3.12", "site-packages",
    "tree_sitter_language_pack", "bindings",
)
if not os.path.isdir(bindings_dir):
    print(f"[cr-graph-venv] no bindings dir at {bindings_dir} — skipping prune")
    sys.exit(0)

removed = 0
removed_bytes = 0
for fname in os.listdir(bindings_dir):
    if not fname.endswith(".abi3.so"):
        continue
    lang = fname[: -len(".abi3.so")]
    if lang in KEEP:
        continue
    fpath = os.path.join(bindings_dir, fname)
    try:
        removed_bytes += os.path.getsize(fpath)
        os.remove(fpath)
        removed += 1
    except OSError as e:
        print(f"[cr-graph-venv] warn: could not remove {fpath}: {e}", file=sys.stderr)
print(f"[cr-graph-venv] pruned {removed} unused grammars ({removed_bytes / (1024*1024):.1f} MB)")
PY
fi

# ─── Final verification (must work after rewrites) ───────────────────────
if ! "${VENV_DIR}/bin/code-review-graph" --version >/dev/null 2>&1; then
  echo "[cr-graph-venv] ERROR: code-review-graph CLI broke during rewrite." >&2
  exit 1
fi

CR_VERSION="$("${VENV_DIR}/bin/code-review-graph" --version 2>/dev/null || echo unknown)"
VENV_SIZE="$(du -sh "${VENV_DIR}" 2>/dev/null | awk '{print $1}')"
echo "[cr-graph-venv] installed ${CR_VERSION} (${VENV_SIZE}) -> ${VENV_DIR}/bin/code-review-graph"
