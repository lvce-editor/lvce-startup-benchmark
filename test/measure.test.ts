import assert from 'node:assert/strict'
import test from 'node:test'
import { measureStartup } from '../src/measure.ts'

// Keep opening dialogs while measurement finishes and closes the context.
// Playwright's default dismissal can otherwise reject outside measureStartup.
test('measureStartup handles dialogs racing with context teardown', async () => {
  const url = 'data:text/html,<h1>Ready</h1><script>setInterval(() => alert("late dialog"), 1)</script>'
  for (let iteration = 1; iteration <= 20; iteration++) {
    const result = await measureStartup('dialog', 'dialog', iteration, false, url, {
      headed: false,
      timeout: 3000,
      profile: false,
      output: '.tmp',
    })
    assert.equal(result.success, true, result.error)
    assert.ok(result.navigation)
    assert.ok(result.domNodeCount && result.domNodeCount > 0)
  }
})
