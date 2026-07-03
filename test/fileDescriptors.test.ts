import assert from 'node:assert/strict'
import test from 'node:test'
import { countOpenFileDescriptors } from '../src/fileDescriptors.ts'

test('countOpenFileDescriptors counts linux proc fd entries', async () => {
  const count = await countOpenFileDescriptors(123, {
    platform: 'linux',
    readdir: (async (path: string) => {
      assert.equal(path, '/proc/123/fd')
      return ['0', '1', '2']
    }) as never,
  })
  assert.equal(count, 3)
})

test('countOpenFileDescriptors returns null without a linux proc fd count', async () => {
  assert.equal(await countOpenFileDescriptors(undefined, { platform: 'linux' }), null)
  assert.equal(await countOpenFileDescriptors(123, { platform: 'darwin' }), null)
  assert.equal(
    await countOpenFileDescriptors(123, {
      platform: 'linux',
      readdir: (async () => {
        throw new Error('missing')
      }) as never,
    }),
    null,
  )
})
