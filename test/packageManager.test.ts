import assert from 'node:assert/strict'
import test from 'node:test'
import { getServerPackageAlias, getServerStorePackageJson } from '../src/packageManager.ts'

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
