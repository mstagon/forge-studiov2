#!/usr/bin/env node
/**
 * electron-builder beforeBuild hook.
 *
 * Always runs `vite build` so dist/ and dist-electron/ contain the freshest
 * renderer + main + preload bundles before electron-builder packages them.
 *
 * Why: invoking `npx electron-builder` directly (e.g. for unsigned dev DMGs)
 * skips the npm script chain that normally runs `tsc && vite build` first.
 * The result is electron-builder packaging stale dist/ files — every release
 * looks bumped (Info.plist version is fresh) but the actual JS is whatever
 * was in dist/ from the last full `npm run electron:build`. This caused
 * 0.2.0 → 0.2.6 to all ship the same pre-0.2.3 renderer, so the in-app
 * update notifier and other post-0.2.2 features never reached users.
 *
 * IMPORTANT: do NOT return false from this hook. That tells electron-builder
 * to skip installing production dependencies — including the entire
 * node_modules tree, which is how native modules like node-pty get into
 * app.asar.unpacked. The 0.2.7 DMG shipped with no app.asar.unpacked at
 * all because of that, so the renderer crashed on startup with
 * "Cannot find module 'node-pty'".
 */
const { execFileSync } = require('child_process')
const path = require('path')

module.exports = async function beforeBuild() {
  const root = path.resolve(__dirname, '..')
  console.log('[before-build] vite build (refreshing dist/ + dist-electron/)')
  execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' })
  // Return nothing → electron-builder handles deps and native module
  // detection normally.
}
