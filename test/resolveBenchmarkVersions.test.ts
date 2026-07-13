import assert from 'node:assert/strict'
import test from 'node:test'
import { selectBenchmarkVersions } from '../src/resolveBenchmarkVersions.ts'

const configuredVersions = ['1.0.2', '1.0.1', '1.0.0']

test('selectBenchmarkVersions uses configured versions by default', () => {
  const selection = selectBenchmarkVersions(configuredVersions, {})

  assert.deepEqual(selection.versions, configuredVersions)
  assert.match(selection.hash, /^[a-f0-9]{64}$/)
})

test('selectBenchmarkVersions limits configured versions', () => {
  const selection = selectBenchmarkVersions(configuredVersions, { RECENT_VERSIONS: '2' })

  assert.deepEqual(selection.versions, ['1.0.2', '1.0.1'])
})

test('selectBenchmarkVersions prefers explicit versions', () => {
  const selection = selectBenchmarkVersions(configuredVersions, {
    RECENT_VERSIONS: '1',
    VERSIONS: 'next, latest',
  })

  assert.deepEqual(selection.versions, ['next', 'latest'])
})

test('selectBenchmarkVersions rejects invalid version counts', () => {
  assert.throws(() => selectBenchmarkVersions(configuredVersions, { RECENT_VERSIONS: '0' }), /positive integer/)
})
