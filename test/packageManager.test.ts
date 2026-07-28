import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { getServerPackageAlias, getServerPackageJson, installServerPackage } from '../src/packageManager.ts'

test('getServerPackageAlias creates stable safe aliases', () => {
  assert.equal(getServerPackageAlias('0.84.7'), getServerPackageAlias('0.84.7'))
  assert.match(getServerPackageAlias('0.84.7'), /^lvce-server-0-84-7-[a-f0-9]{8}$/)
  assert.match(getServerPackageAlias('github:user/repo#main'), /^lvce-server-github-user-repo-main-[a-f0-9]{8}$/)
})

test('getServerPackageJson creates one npm alias dependency', () => {
  const packageJson = JSON.parse(getServerPackageJson('0.84.7')) as {
    readonly dependencies: Record<string, string>
  }

  assert.deepEqual(Object.keys(packageJson.dependencies), [getServerPackageAlias('0.84.7')])
  assert.deepEqual(Object.values(packageJson.dependencies), ['npm:@lvce-editor/server@0.84.7'])
})

test('installServerPackage retries with a clean version directory after a cached install fails', async () => {
  const storeDir = await mkdtemp(join(tmpdir(), 'lvce-startup-server-store-'))
  const nodeModulesPath = join(storeDir, 'node_modules')
  const packageLockPath = join(storeDir, 'package-lock.json')
  let installCount = 0
  try {
    await mkdir(nodeModulesPath)
    await writeFile(packageLockPath, '{}')
    await installServerPackage(storeDir, async () => {
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
