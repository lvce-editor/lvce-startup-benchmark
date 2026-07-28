import assert from 'node:assert/strict'
import test from 'node:test'
import { getServerPackageAlias, getServerStorePackageJson, getServerStoreTransitionPackageJson } from '../src/packageManager.ts'

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

test('getServerStoreTransitionPackageJson adds requested aliases before removing cached aliases', () => {
  const existingPackageJson = getServerStorePackageJson(['0.84.7', '0.84.6'])
  const transitionPackageJson = JSON.parse(getServerStoreTransitionPackageJson(existingPackageJson, ['0.84.8', '0.84.7'])) as {
    readonly dependencies: Record<string, string>
  }

  assert.deepEqual(Object.values(transitionPackageJson.dependencies), [
    'npm:@lvce-editor/server@0.84.7',
    'npm:@lvce-editor/server@0.84.6',
    'npm:@lvce-editor/server@0.84.8',
  ])
})

test('getServerStoreTransitionPackageJson ignores unrelated cached dependencies', () => {
  const existingPackageJson = JSON.stringify({
    dependencies: {
      unrelated: '1.0.0',
      'lvce-server-invalid': 'file:../server',
    },
  })
  const transitionPackageJson = getServerStoreTransitionPackageJson(existingPackageJson, ['0.84.8'])

  assert.equal(transitionPackageJson, getServerStorePackageJson(['0.84.8']))
})
