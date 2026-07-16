import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions } from '../src/versionOrder.ts'

test('compareVersions orders numbered versions from lowest to highest', () => {
  const versions = ['0.91.14', '0.91.2', '0.80.19', '0.80.5']

  assert.deepEqual(versions.toSorted(compareVersions), ['0.80.5', '0.80.19', '0.91.2', '0.91.14'])
})

test('compareVersions keeps the baseline before numbered versions', () => {
  const versions = ['latest', '0.91.14', 'baseline', '0.80.5']

  assert.deepEqual(versions.toSorted(compareVersions), ['baseline', '0.80.5', '0.91.14', 'latest'])
})
