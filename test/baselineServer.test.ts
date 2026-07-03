import assert from 'node:assert/strict'
import { get } from 'node:http'
import test from 'node:test'
import { createBaselineServer } from '../src/baselineServer.ts'

const readUrl = async (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        data += chunk
      })
      response.on('end', () => {
        resolve(data)
      })
    }).on('error', reject)
  })
}

test('baseline server serves html and module script', async () => {
  const server = createBaselineServer()
  await new Promise<void>((resolve) => {
    server.listen(0, 'localhost', resolve)
  })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP port')
    }
    const baseUrl = `http://localhost:${address.port}`
    const html = await readUrl(`${baseUrl}/anything`)
    const script = await readUrl(`${baseUrl}/__baseline__/main.js`)
    assert.match(html, /<script type="module" src="\/__baseline__\/main\.js"><\/script>/)
    assert.match(script, /document\.createElement\('h1'\)/)
    assert.match(script, /Hello world/)
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
})
