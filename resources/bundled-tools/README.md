# resources/bundled-tools/

Pre-bundled binary toolchain shipped inside the Forge Studio DMG so users can
run Agent Teams (tmux), Python tools (uv + standalone python), and
`code-review-graph` without installing anything themselves.

This directory is **not** checked into git — its contents are populated by:

```bash
bash scripts/download-bundled-tools.sh   # tmux + uv + python
bash scripts/build-cr-graph-venv.sh      # cr-graph venv on top of bundled python
```

`npm run electron:build` and `npm run release:dmg` invoke both scripts before
electron-builder runs, so a clean DMG build only needs:

```bash
npm install
npm run electron:build
```

## Layout (after running the scripts)

```
resources/bundled-tools/
└── darwin-arm64/
    ├── .download-stamp.json        # versions + sha256 sums
    ├── bin/
    │   ├── tmux                    # ~1 MB — copied from `brew --prefix tmux`
    │   └── uv                      # ~10 MB — astral-sh/uv release
    ├── python/                     # ~80 MB — python-build-standalone 3.12
    │   ├── bin/python3.12
    │   ├── lib/...
    │   └── ...
    └── cr-graph-venv/              # ~50 MB — pip-installed code-review-graph
        ├── bin/code-review-graph
        ├── bin/python -> ../../python/bin/python3.12   (or copy)
        └── lib/python3.12/site-packages/code_review_graph/...
```

Total adds **~140 MB unpacked → ~85 MB compressed** to the DMG.

## Targets

Currently `darwin-arm64` only. Adding `darwin-x64` / `linux-x64` support means:

1. Adding the platform's matching tarball URLs to `download-bundled-tools.sh`.
2. Branching the `extraResources` block in `package.json` per `process.platform`.
3. Updating `electron/services/PathManager.ts` to pick the right sub-folder.

## Re-running

Both scripts are idempotent — they write a stamp file and skip on re-run.
Force a refresh with `FORCE=1 bash scripts/download-bundled-tools.sh`.
