import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBenchmarkVersions } from '../src/benchmarkVersions.ts'

test('parseBenchmarkVersions reads and trims versions', () => {
  const manifest = parseBenchmarkVersions(JSON.stringify({ versions: [' 1.0.1 ', '1.0.0'] }))

  assert.deepEqual(manifest.versions, ['1.0.1', '1.0.0'])
})

test('parseBenchmarkVersions rejects invalid manifests', () => {
  assert.throws(() => parseBenchmarkVersions('null'), /must contain an object/)
  assert.throws(() => parseBenchmarkVersions(JSON.stringify({ versions: [] })), /non-empty versions array/)
  assert.throws(() => parseBenchmarkVersions(JSON.stringify({ versions: ['1.0.0', '1.0.0'] })), /duplicate versions/)
})
