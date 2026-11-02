/** Validate the assembled application, including native Office conversion outside ASAR. */
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { NOVEN_PROFILE_RESOURCE, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { managedNovenSmokeProfile, smokeNovenProfile } from './smoke-noven-profile.ts'
import { verifyNovenProfile } from './noven-profile.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
const { extractAll } = builderRequire('@electron/asar') as { extractAll: (archive: string, destination: string) => void }

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
const verification = mkdtempSync(join(tmpdir(), 'noven-asar-check-'))
try {
  extractAll(join(resources, 'app.asar'), verification)
  const verificationDshRoot = join(verification, 'dsh')
  // Electron must execute the shipped ASAR: plain extraction drops executable
  // bits and cannot resolve native helpers through app.asar.unpacked.
  const packagedDshRoot = join(resources, 'app.asar', 'dsh')
  const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
    resolveDesktopPackageTarget(target))
  const profileVerification = await verifyNovenProfile(
    join(resources, NOVEN_PROFILE_RESOURCE),
    join(verificationDshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
  )
  console.log(`desktop smoke: Noven profile verified (${profileVerification.bundles} bundles, ${profileVerification.imports} imports)`)
  const runtimeProfile = join(resources, NOVEN_PROFILE_RESOURCE)
  await smokeNovenProfile({
    dshRoot: packagedDshRoot,
    profile: managedNovenSmokeProfile(paths.dsh, runtimeProfile),
    runtimeProfile,
    electron: executable,
    resourcesRuntime: join(resources, 'runtime'),
  })
  if (windows && !values.unsigned) await verifyWindowsCode(application)
  // Unsigned local builds may omit the optional Office engine; launch validation
  // for those is the real GUI smoke, not the document round trip.
  if (!values.unsigned) {
    await smokePreparedRuntime(packagedDshRoot, executable, join(resources, 'runtime'), descriptor)
  } else {
    console.log('desktop smoke: unsigned artifact descriptor verified; document round trip skipped')
  }
} finally {
  rmSync(verification, { recursive: true, force: true })
}
