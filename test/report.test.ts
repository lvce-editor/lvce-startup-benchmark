import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeReport } from '../src/report.ts'
import type { VersionSummary } from '../src/types.ts'

const stats = (mean: number) => ({
  mean,
  min: mean - 1,
  max: mean + 1,
  p95: mean + 0.5,
})

test('writeReport creates a static pages report from benchmark summaries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lvce-startup-report-'))
  const input = join(dir, 'results')
  const output = join(dir, 'pages')
  try {
    const summaries: readonly VersionSummary[] = [
      {
        version: 'latest',
        iterations: 3,
        failures: 0,
        loadTimeMs: stats(120),
        domContentLoadedTimeMs: stats(110),
        responseEndTimeMs: stats(80),
        wallTimeMs: stats(140),
        domNodes: stats(42),
        heapUsed: stats(1000),
        heapTotal: stats(2000),
        transferSize: stats(3000),
        encodedBodySize: stats(2500),
        decodedBodySize: stats(5000),
        resources: stats(8),
        scriptDurationMs: stats(12),
        taskDurationMs: stats(30),
        layoutDurationMs: stats(2),
        recalcStyleDurationMs: stats(3),
        documents: stats(1),
        eventListeners: stats(7),
      },
    ]
    await mkdir(input, { recursive: true })
    await writeFile(join(input, 'summary.json'), `${JSON.stringify(summaries, null, 2)}\n`)
    await writeFile(join(input, 'summary.md'), '# Summary\n')
    await writeReport({ input, output, title: 'Benchmark Report' })
    const html = await readFile(join(output, 'index.html'), 'utf8')
    assert.match(html, /Benchmark Report/)
    assert.match(html, /latest/)
    assert.match(html, /average \/ fastest \/ slowest \/ p95/)
    assert.match(html, /Transfer size/)
    assert.match(await readFile(join(output, 'load-time.svg'), 'utf8'), /Load event/)
    assert.match(await readFile(join(output, 'load-time.svg'), 'utf8'), /Fastest/)
    assert.match(await readFile(join(output, 'transfer-size.svg'), 'utf8'), /Total transfer size/)
    assert.equal(await readFile(join(output, 'summary.json'), 'utf8'), `${JSON.stringify(summaries, null, 2)}\n`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
