import assert from 'node:assert/strict'
import test from 'node:test'
import { getGpuProcessMemoryBytes } from '../src/gpuProcessMemory.ts'

test('getGpuProcessMemoryBytes reads GPU process resident memory on Linux', async () => {
  const processes = [
    { id: 10, type: 'browser' },
    { id: 20, type: 'GPU' },
  ]
  const memory = await getGpuProcessMemoryBytes(processes, async (pid) => {
    assert.equal(pid, 20)
    return 'Name:\tchrome\nVmRSS:\t81920 kB\n'
  })
  assert.equal(memory, 80 * 1024 * 1024)
})

test('getGpuProcessMemoryBytes returns null when GPU memory is unavailable', async () => {
  assert.equal(await getGpuProcessMemoryBytes([{ id: 20, type: 'GPU' }], async () => '', 'linux'), null)
  assert.equal(await getGpuProcessMemoryBytes([{ id: 20, type: 'GPU' }], async () => 'VmRSS:\t1 kB\n', 'darwin'), null)
})
