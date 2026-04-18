#!/usr/bin/env node
/**
 * electron-builder beforeBuild hook.
 *
 * 1. `vite build` — refresh dist/ + dist-electron/ so the renderer + main +
 *    preload bundles are current (this catches the "npx electron-builder
 *    skipped vite build → stale bundle" footgun that ate 0.2.0..0.2.6).
 *
 * 2. `electron-builder install-app-deps` — when you provide a beforeBuild
 *    hook, electron-builder skips its DEFAULT install-app-deps step
 *    (which is what runs @electron/rebuild against node-pty and decides
 *    what to copy into app.asar.unpacked). 0.2.7 + 0.2.8 shipped without
 *    `app.asar.unpacked` because of that — main process crashed at
 *    startup with "Cannot find module 'node-pty'".
 *
 *    We have to call it ourselves. Returning `undefined` (vs `false`) is
 *    not enough; that only controls whether the *npm install* step runs,
 *    not whether the install-app-deps native rebuild runs.
 *
 * Cheap to run on every build (~1s renderer + a few seconds rebuild cache
 * hit), and idempotent.
 */
const { execFileSync } = require('child_process')
const path = require('path')

module.exports = async function beforeBuild() {
  const root = path.resolve(__dirname, '..')
  console.log('[before-build] vite build (refreshing dist/ + dist-electron/)')
  execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' })

  console.log('[before-build] electron-builder install-app-deps (rebuilding native modules)')
  execFileSync('npx', ['electron-builder', 'install-app-deps'], {
    cwd: root,
    stdio: 'inherit',
  })
}
