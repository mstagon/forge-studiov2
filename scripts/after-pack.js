const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

exports.default = async ({ appOutDir, packager, electronPlatformName }) => {
  if (electronPlatformName !== 'darwin') return

  const appName = packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  // 1. node-pty's spawn-helper loses its executable bit during asar packing.
  //    Without +x, every PTY spawn dies with `posix_spawnp failed`.
  const ptyBase = path.join(
    appPath,
    'Contents/Resources/app.asar.unpacked/node_modules/node-pty'
  )
  const helpers = [
    path.join(ptyBase, 'build/Release/spawn-helper'),
    path.join(ptyBase, 'prebuilds/darwin-arm64/spawn-helper'),
    path.join(ptyBase, 'prebuilds/darwin-x64/spawn-helper'),
  ]
  for (const helper of helpers) {
    if (fs.existsSync(helper)) {
      fs.chmodSync(helper, 0o755)
      console.log(`[after-pack] chmod +x ${helper}`)
    }
  }

  // 1b. Re-stamp the bundled toolchain (tmux / uv / python / cr-graph venv)
  //     with executable bits. extraResources ships the contents into
  //     Contents/Resources/bundled-tools/ but the tar+copy pipeline can drop
  //     the +x bit on individual binaries — explicitly setting 0o755 on every
  //     known entrypoint avoids spawn failures at runtime.
  const bundledRoot = path.join(appPath, 'Contents/Resources/bundled-tools')
  if (fs.existsSync(bundledRoot)) {
    // Specific top-level binaries we know about. The recursive sweep below
    // picks up everything else inside python/bin and cr-graph-venv/bin.
    const explicit = [
      path.join(bundledRoot, 'bin/tmux'),
      path.join(bundledRoot, 'bin/uv'),
    ]
    for (const bin of explicit) {
      if (fs.existsSync(bin)) {
        fs.chmodSync(bin, 0o755)
        console.log(`[after-pack] chmod +x ${bin}`)
      }
    }
    // Walk every */bin directory and chmod regular files. python-build-
    // standalone ships several entry points (python3, python3.12, pip, etc.)
    // and the cr-graph venv adds code-review-graph + activate scripts.
    const binDirs = [
      path.join(bundledRoot, 'python/bin'),
      path.join(bundledRoot, 'cr-graph-venv/bin'),
    ]
    for (const dir of binDirs) {
      if (!fs.existsSync(dir)) continue
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name)
        try {
          const stat = fs.lstatSync(p)
          // Only chmod regular files — skip symlinks (they inherit) and dirs.
          if (stat.isFile()) {
            fs.chmodSync(p, 0o755)
          }
        } catch (err) {
          console.warn(`[after-pack] chmod failed for ${p}: ${err.message}`)
        }
      }
      console.log(`[after-pack] chmod +x ${dir}/*`)
    }
  }

  // 2. Ad-hoc codesign the bundle when no Developer ID is in play.
  //    Apple Silicon dyld refuses to load entirely-unsigned native modules,
  //    and macOS Sequoia surfaces the failure as the dreaded
  //    "App is damaged and can't be opened" Gatekeeper dialog (right-click
  //    → Open does NOT recover from this — the user has to xattr -cr by
  //    hand). An ad-hoc signature ("--sign -") is enough to load and to
  //    avoid the damaged dialog; Gatekeeper still shows "unidentified
  //    developer" on first launch but right-click → Open works.
  //
  //    If electron-builder is doing real Developer ID signing, it will
  //    re-sign over our ad-hoc signature later — this is a no-op cost.
  const isDeveloperIdSigning =
    process.env.CSC_LINK ||
    process.env.CSC_NAME ||
    process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'true'
  if (!isDeveloperIdSigning) {
    try {
      execFileSync(
        'codesign',
        ['--sign', '-', '--deep', '--force', '--timestamp=none', appPath],
        { stdio: 'inherit' }
      )
      console.log(`[after-pack] ad-hoc signed ${appPath}`)
    } catch (err) {
      console.warn(
        `[after-pack] ad-hoc codesign failed (non-fatal): ${err.message}`
      )
    }
  }
}
