import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRecentPublishedVersions } from '../src/versions.ts'

test('parseRecentPublishedVersions returns newest published versions first', () => {
  const versions = parseRecentPublishedVersions(
    JSON.stringify({
      created: '2024-01-01T00:00:00.000Z',
      modified: '2024-01-06T00:00:00.000Z',
      '1.0.0': '2024-01-02T00:00:00.000Z',
      '1.0.2': '2024-01-04T00:00:00.000Z',
      '1.0.1': '2024-01-03T00:00:00.000Z',
    }),
    2,
  )

  assert.deepEqual(versions, ['1.0.2', '1.0.1'])
})
