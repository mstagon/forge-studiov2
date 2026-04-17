#!/usr/bin/env node
/**
 * Patch @electron/osx-sign's pinned isbinaryfile so it doesn't crash on UTF-8
 * files whose leading bytes look like protobuf field tags (e.g. Korean
 * characters starting with 0xED). Without this patch, electron-builder fails
 * to sign the .app on any project that ships such files in its Resources.
 *
 * Re-applied on every npm install via the "postinstall" hook.
 */
const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  '@electron',
  'osx-sign',
  'node_modules',
  'isbinaryfile',
  'lib',
  'index.js'
)

if (!fs.existsSync(TARGET)) {
  // Module not installed (e.g. fresh checkout before electron-builder pulls it).
  // Nothing to do.
  process.exit(0)
}

const src = fs.readFileSync(TARGET, 'utf-8')

if (src.includes('forge-studio patch')) {
  // Already patched — nothing to do.
  process.exit(0)
}

const before = `    if (suspiciousBytes > 1 && isBinaryProto(fileBuffer, totalBytes)) {
        return true;
    }
    return false;
}`

const after = `    if (suspiciousBytes > 1) {
        try {
            if (isBinaryProto(fileBuffer, totalBytes)) {
                return true;
            }
        } catch (_e) {
            // forge-studio patch: malformed proto-like leading bytes (e.g. UTF-8
            // Korean files starting with 0xED) crash the proto parser with
            // RangeError. Fall through and treat as non-binary; the suspicious
            // byte ratio check above already returned true for real binaries.
        }
    }
    return false;
}`

if (!src.includes(before)) {
  console.warn(
    '[patch-isbinaryfile] expected anchor not found — isbinaryfile internals ' +
      'may have changed. Skipping patch.'
  )
  process.exit(0)
}

fs.writeFileSync(TARGET, src.replace(before, after))
console.log('[patch-isbinaryfile] patched', TARGET)
