const fs = require('fs')
const path = require('path')

exports.default = async ({ appOutDir, packager, electronPlatformName }) => {
  if (electronPlatformName !== 'darwin') return

  const appName = packager.appInfo.productFilename
  const base = path.join(
    appOutDir,
    `${appName}.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty`
  )

  const helpers = [
    path.join(base, 'build/Release/spawn-helper'),
    path.join(base, 'prebuilds/darwin-arm64/spawn-helper'),
    path.join(base, 'prebuilds/darwin-x64/spawn-helper'),
  ]

  for (const helper of helpers) {
    if (fs.existsSync(helper)) {
      fs.chmodSync(helper, 0o755)
      console.log(`[after-pack] chmod +x ${helper}`)
    }
  }
}
