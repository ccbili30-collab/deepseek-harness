/**
 * update-check — channel manifest URL, validation, and semantic version order.
 * Run after build: node tests/update-check.mjs
 */
import { compareVersions, isNewerVersion, manifestUrl, normalizeManifest } from '../lib/client/update-check.js'

let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed += 1
}

check(compareVersions('1.2.3', '1.2.3') === 0, 'equal versions')
check(compareVersions('1.2.4', '1.2.3') === 1, 'patch wins')
check(compareVersions('1.3.0', '1.2.9') === 1, 'minor wins')
check(compareVersions('2.0.0', '1.99.99') === 1, 'major wins')
check(compareVersions('1.2.3', '1.2.4') === -1, 'older loses')
check(compareVersions('1.2.3', '1.2.3-beta.1') === 1, 'release outranks prerelease')
check(compareVersions('1.2.3-beta.2', '1.2.3-beta.1') === 1, 'beta ordinal')
check(compareVersions('v1.2.3', '1.2.3') === 0, 'v prefix ignored')
check(isNewerVersion('1.2.4', '1.2.3'), 'isNewerVersion true')
check(!isNewerVersion('1.2.3', '1.2.3'), 'isNewerVersion equal false')
check(!isNewerVersion('1.2.2', '1.2.3'), 'isNewerVersion older false')

check(manifestUrl('https://example.com/noven/updates/', 'stable') === 'https://example.com/noven/updates/stable.json', 'stable manifest url')
check(manifestUrl('https://example.com/noven/updates', 'beta') === 'https://example.com/noven/updates/beta.json', 'beta manifest url')

const good = normalizeManifest({ version: '0.2.0', notes: 'hi', url: 'https://example.com/dl', assets: { 'mac-arm64': 'https://example.com/a.dmg', bad: 3 } })
check(good?.version === '0.2.0' && good.notes === 'hi' && good.url === 'https://example.com/dl', 'manifest keeps scalar fields')
check(good?.assets?.['mac-arm64'] === 'https://example.com/a.dmg' && good?.assets?.bad === undefined, 'manifest keeps string assets only')
check(normalizeManifest({ version: '' }) === undefined, 'empty version rejected')
check(normalizeManifest({ notes: 'no version' }) === undefined, 'missing version rejected')
check(normalizeManifest({ version: '1.0.0', assets: [] }) === undefined, 'array assets rejected')
check(normalizeManifest(null) === undefined, 'null rejected')

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
