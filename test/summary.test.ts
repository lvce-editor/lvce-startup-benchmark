import assert from 'node:assert/strict'
import test from 'node:test'
import { getStats, summarizeVersion } from '../src/summary.ts'
import type { IterationResult } from '../src/types.ts'

test('getStats computes rounded summary values', () => {
  assert.deepEqual(getStats([1, 2, 3, 100]), {
    mean: 26.5,
    min: 1,
    max: 100,
    p95: 100,
  })
})

test('summarizeVersion ignores warmups and failed values for metrics', () => {
  const base = {
    version: 'latest',
    url: 'http://localhost:3000/',
    performanceMetrics: [],
  }
  const results: readonly IterationResult[] = [
    {
      ...base,
      iteration: 1,
      warmup: true,
      success: true,
      wallTimeMs: 1000,
      navigation: { startTime: 0, domInteractive: 1, domContentLoadedEventEnd: 1, loadEventEnd: 1000, responseEnd: 1, duration: 1000, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 },
      domNodeCount: 999,
      domCounters: { documents: 9, nodes: 999, jsEventListeners: 99 },
      heapUsage: { usedSize: 999, totalSize: 1999 },
      loadedResourceSizes: { resources: 99, transferSize: 999, encodedBodySize: 999, decodedBodySize: 999 },
      paintTimings: {
        firstPaintMs: 999,
        firstContentfulPaintMs: 999,
        largestContentfulPaintMs: 999,
      },
      serverOpenFileDescriptors: 999,
    },
    {
      ...base,
      iteration: 1,
      warmup: false,
      success: true,
      wallTimeMs: 200,
      navigation: { startTime: 0, domInteractive: 1, domContentLoadedEventEnd: 1, loadEventEnd: 180, responseEnd: 1, duration: 180, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 },
      domNodeCount: 10,
      domCounters: { documents: 1, nodes: 10, jsEventListeners: 2 },
      heapUsage: { usedSize: 100, totalSize: 200 },
      loadedResourceSizes: { resources: 3, transferSize: 600, encodedBodySize: 500, decodedBodySize: 900 },
      performanceMetrics: [
        { name: 'ScriptDuration', value: 0.012 },
        { name: 'TaskDuration', value: 0.034 },
        { name: 'LayoutDuration', value: 0.002 },
        { name: 'RecalcStyleDuration', value: 0.003 },
      ],
      paintTimings: {
        firstPaintMs: 20,
        firstContentfulPaintMs: 30,
        largestContentfulPaintMs: 40,
      },
      serverOpenFileDescriptors: 11,
    },
    {
      ...base,
      iteration: 2,
      warmup: false,
      success: false,
      wallTimeMs: 0,
      navigation: null,
      domNodeCount: null,
      domCounters: null,
      heapUsage: null,
      loadedResourceSizes: null,
      paintTimings: null,
      serverOpenFileDescriptors: null,
      error: 'boom',
    },
  ]
  const summary = summarizeVersion('latest', results, 45)
  assert.equal(summary.iterations, 1)
  assert.equal(summary.failures, 1)
  assert.equal(summary.serverStartupTimeMs.mean, 45)
  assert.equal(summary.loadTimeMs.mean, 180)
  assert.equal(summary.firstPaintMs.mean, 20)
  assert.equal(summary.firstContentfulPaintMs.mean, 30)
  assert.equal(summary.largestContentfulPaintMs.mean, 40)
  assert.equal(summary.domNodes.mean, 10)
  assert.equal(summary.heapUsed.mean, 100)
  assert.equal(summary.transferSize.mean, 600)
  assert.equal(summary.encodedBodySize.mean, 500)
  assert.equal(summary.decodedBodySize.mean, 900)
  assert.equal(summary.resources.mean, 3)
  assert.equal(summary.scriptDurationMs.mean, 12)
  assert.equal(summary.taskDurationMs.mean, 34)
  assert.equal(summary.layoutDurationMs.mean, 2)
  assert.equal(summary.recalcStyleDurationMs.mean, 3)
  assert.equal(summary.serverOpenFileDescriptors.mean, 11)
})

test('summarizeVersion returns empty stats for missing paint and file descriptor values', () => {
  const results: readonly IterationResult[] = [
    {
      version: 'latest',
      iteration: 1,
      warmup: false,
      success: true,
      url: 'http://localhost:3000/',
      wallTimeMs: 200,
      navigation: null,
      domNodeCount: null,
      domCounters: null,
      heapUsage: null,
      loadedResourceSizes: null,
      performanceMetrics: [],
      paintTimings: {
        firstPaintMs: null,
        firstContentfulPaintMs: null,
        largestContentfulPaintMs: null,
      },
      serverOpenFileDescriptors: null,
    },
  ]
  const summary = summarizeVersion('latest', results, 45)
  assert.equal(summary.firstPaintMs.mean, null)
  assert.equal(summary.firstContentfulPaintMs.mean, null)
  assert.equal(summary.largestContentfulPaintMs.mean, null)
  assert.equal(summary.serverOpenFileDescriptors.mean, null)
})
