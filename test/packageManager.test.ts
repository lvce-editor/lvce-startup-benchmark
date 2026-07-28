import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { getServerPackageAlias, getServerStorePackageJson, installServerPackages, prepareServerPackages } from '../src/packageManager.ts'

test('getServerPackageAlias creates stable safe aliases', () => {
  assert.equal(getServerPackageAlias('0.84.7'), getServerPackageAlias('0.84.7'))
  assert.match(getServerPackageAlias('0.84.7'), /^lvce-server-0-84-7-[a-f0-9]{8}$/)
  assert.match(getServerPackageAlias('github:user/repo#main'), /^lvce-server-github-user-repo-main-[a-f0-9]{8}$/)
})

test('getServerStorePackageJson creates npm alias dependencies', () => {
  const packageJson = JSON.parse(getServerStorePackageJson(['0.84.7', '0.84.6'])) as {
    readonly dependencies: Record<string, string>
  }

  assert.deepEqual(Object.values(packageJson.dependencies), ['npm:@lvce-editor/server@0.84.7', 'npm:@lvce-editor/server@0.84.6'])
})

test('installServerPackages retries with a clean store after a cached install fails', async () => {
  const storeDir = await mkdtemp(join(tmpdir(), 'lvce-startup-server-store-'))
  const nodeModulesPath = join(storeDir, 'node_modules')
  const packageLockPath = join(storeDir, 'package-lock.json')
  let installCount = 0
  try {
    await mkdir(nodeModulesPath)
    await writeFile(packageLockPath, '{}')
    await installServerPackages(storeDir, async () => {
      installCount++
      if (installCount === 1) {
        throw new Error('cached install failed')
      }
      return { stdout: '', stderr: '' }
    })

    assert.equal(installCount, 2)
    await assert.rejects(access(nodeModulesPath))
    await assert.rejects(access(packageLockPath))
  } finally {
    await rm(storeDir, { recursive: true, force: true })
  }
})

test('prepareServerPackages reuses packages from the legacy shared store', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'lvce-startup-server-store-'))
  const version = '0.84.7'
  const alias = getServerPackageAlias(version)
  const legacyPackageDir = join(rootDir, '.tmp', 'server-store', 'node_modules', alias)
  let installCount = 0
  try {
    await mkdir(join(legacyPackageDir, 'bin'), { recursive: true })
    await writeFile(join(legacyPackageDir, 'bin', 'server.js'), '')
    const preparedServers = await prepareServerPackages([version], rootDir, async () => {
      installCount++
      return { stdout: '', stderr: '' }
    })

    assert.equal(installCount, 0)
    assert.equal(preparedServers.get(version)?.packageDir, legacyPackageDir)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('prepareServerPackages installs missing versions in isolated stores', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'lvce-startup-server-store-'))
  const version = '0.84.8'
  const alias = getServerPackageAlias(version)
  const versionStoreDir = join(rootDir, '.tmp', 'server-store', 'versions', alias)
  const expectedPackageDir = join(versionStoreDir, 'node_modules', alias)
  const installDirectories: string[] = []
  try {
    const preparedServers = await prepareServerPackages([version], rootDir, async (_command, _args, options) => {
      installDirectories.push(options.cwd)
      return { stdout: '', stderr: '' }
    })
    const packageJson = await readFile(join(versionStoreDir, 'package.json'), 'utf8')

    assert.deepEqual(installDirectories, [versionStoreDir])
    assert.equal(packageJson, getServerStorePackageJson([version]))
    assert.equal(preparedServers.get(version)?.packageDir, expectedPackageDir)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
