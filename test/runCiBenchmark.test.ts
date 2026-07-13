import assert from 'node:assert/strict'
import test from 'node:test'
import { getCiBenchmarkArgs } from '../src/runCiBenchmark.ts'

test('getCiBenchmarkArgs translates the CI environment into CLI arguments', () => {
  assert.deepEqual(getCiBenchmarkArgs({ VERSIONS: '1.0.1,1.0.0', ITERATIONS: '3', PROFILE: 'true' }), [
    '--versions',
    '1.0.1,1.0.0',
    '--iterations',
    '3',
    '--warmups',
    '1',
    '--output',
    'results',
    '--profile',
  ])
})

test('getCiBenchmarkArgs omits profiling when disabled', () => {
  const args = getCiBenchmarkArgs({ VERSIONS: '1.0.0', PROFILE: 'false' })

  assert.equal(args.includes('--profile'), false)
})

test('getCiBenchmarkArgs requires resolved versions', () => {
  assert.throws(() => getCiBenchmarkArgs({}), /VERSIONS is required/)
})
