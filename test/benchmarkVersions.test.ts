import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultBenchmarkVersionCount, parseBenchmarkVersions } from '../src/benchmarkVersions.ts'

test('uses 250 versions by default', () => {
  assert.equal(defaultBenchmarkVersionCount, 250)
})

test('parseBenchmarkVersions reads and trims versions', () => {
  const manifest = parseBenchmarkVersions(JSON.stringify({ versions: [' 1.0.1 ', '1.0.0'] }))

  assert.deepEqual(manifest.versions, ['1.0.1', '1.0.0'])
})

test('parseBenchmarkVersions rejects invalid manifests', () => {
  assert.throws(() => parseBenchmarkVersions('null'), /must contain an object/)
  assert.throws(() => parseBenchmarkVersions(JSON.stringify({ versions: [] })), /non-empty versions array/)
  assert.throws(() => parseBenchmarkVersions(JSON.stringify({ versions: ['1.0.0', '1.0.0'] })), /duplicate versions/)
})
