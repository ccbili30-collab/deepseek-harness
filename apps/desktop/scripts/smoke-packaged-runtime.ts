/** Validate the assembled application, including native Office conversion outside ASAR. */
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const productName = process.env.NOVEN_CHANNEL === 'test' ? 'Noven Test' : 'Noven'
const artifacts = values.unsigned ? paths.unsignedArtifacts : paths.artifacts
const application = windows ? join(artifacts, 'win-unpacked')
  : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', `${productName}.app`, 'Contents')
const resources = join(application, windows ? 'resources' : 'Resources')
const executable = windows ? join(application, `${productName}.exe`) : join(application, 'MacOS', productName)
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
  resolveDesktopPackageTarget(target))
if (windows && !values.unsigned) await verifyWindowsCode(application)
// Unsigned local builds may omit the optional Office engine; launch validation
// for those is the real GUI smoke, not the document round trip.
if (!values.unsigned) {
  await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor)
} else {
  console.log('desktop smoke: unsigned artifact descriptor verified; document round trip skipped')
}
