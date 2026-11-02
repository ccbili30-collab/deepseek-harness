import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from 'electron'
import { applyNovenIdentity, resolveNovenPaths } from '../src/noven-channel.ts'
import { NOVEN_PROFILE_RESOURCE } from '../src/noven-profile-resource.ts'

vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'Noven'),
    getPath: vi.fn(() => '/application-support'),
    setName: vi.fn(),
    setPath: vi.fn(),
    setAppLogsPath: vi.fn(),
    isPackaged: true,
  },
}))

describe('Noven launch data isolation', () => {
  beforeEach(() => {
    vi.stubEnv('NOVEN_CHANNEL', 'release')
    vi.stubEnv('NOVEN_DATA_ROOT', '/tmp/noven-isolated')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('places every runtime data root below the explicit isolated root', () => {
    expect(NOVEN_PROFILE_RESOURCE).toBe('noven-profile')
    const paths = resolveNovenPaths()

    expect(paths).toMatchObject({
      dataRoot: '/tmp/noven-isolated',
      harnessHome: '/tmp/noven-isolated/harness',
      libraryHome: '/tmp/noven-isolated/library',
      projectsRoot: '/tmp/noven-isolated/projects',
      electronData: '/tmp/noven-isolated/electron',
      logs: '/tmp/noven-isolated/logs',
    })
    applyNovenIdentity(paths)
    expect(app.setPath).toHaveBeenCalledWith('userData', '/tmp/noven-isolated/electron')
    expect(app.setPath).toHaveBeenCalledWith('sessionData', '/tmp/noven-isolated/electron')
  })

  it('keeps explicit service roots without moving Electron browser data', () => {
    vi.stubEnv('DSH_HOME', '/tmp/custom-harness')
    vi.stubEnv('NOVEN_HOME', '/tmp/custom-library')
    vi.stubEnv('NOVEN_PROJECTS_ROOT', '/tmp/custom-projects')

    const paths = resolveNovenPaths()

    expect(paths.harnessHome).toBe('/tmp/custom-harness')
    expect(paths.libraryHome).toBe('/tmp/custom-library')
    expect(paths.projectsRoot).toBe('/tmp/custom-projects')
    expect(paths.electronData).toBe('/tmp/noven-isolated/electron')
  })
})
