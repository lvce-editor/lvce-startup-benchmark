import type { IterationResult, Stats, VersionSummary } from './types.ts'

const round = (value: number): number => Math.round(value * 100) / 100

export const getStats = (values: readonly number[]): Stats => {
  const finite = values.filter(Number.isFinite).toSorted((a, b) => a - b)
  if (finite.length === 0) {
    return {
      mean: null,
      min: null,
      max: null,
      p95: null,
    }
  }
  const sum = finite.reduce((total, value) => total + value, 0)
  const p95Index = Math.min(finite.length - 1, Math.ceil(finite.length * 0.95) - 1)
  return {
    mean: round(sum / finite.length),
    min: round(finite[0] ?? 0),
    max: round(finite.at(-1) ?? 0),
    p95: round(finite[p95Index] ?? 0),
  }
}

const successfulMeasured = (results: readonly IterationResult[]): readonly IterationResult[] => {
  return results.filter((result) => result.success && !result.warmup)
}

const getPerformanceMetric = (result: IterationResult, name: string): number => {
  return result.performanceMetrics.find((metric) => metric.name === name)?.value ?? Number.NaN
}

const secondsToMs = (value: number): number => {
  return Number.isFinite(value) ? value * 1000 : Number.NaN
}

export const summarizeVersion = (version: string, results: readonly IterationResult[]): VersionSummary => {
  const measured = successfulMeasured(results)
  return {
    version,
    iterations: measured.length,
    failures: results.filter((result) => !result.success && !result.warmup).length,
    loadTimeMs: getStats(measured.map((result) => result.navigation?.loadEventEnd ?? result.wallTimeMs)),
    domContentLoadedTimeMs: getStats(measured.map((result) => result.navigation?.domContentLoadedEventEnd ?? Number.NaN)),
    responseEndTimeMs: getStats(measured.map((result) => result.navigation?.responseEnd ?? Number.NaN)),
    wallTimeMs: getStats(measured.map((result) => result.wallTimeMs)),
    domNodes: getStats(measured.map((result) => result.domNodeCount ?? Number.NaN)),
    heapUsed: getStats(measured.map((result) => result.heapUsage?.usedSize ?? Number.NaN)),
    heapTotal: getStats(measured.map((result) => result.heapUsage?.totalSize ?? Number.NaN)),
    transferSize: getStats(measured.map((result) => result.loadedResourceSizes?.transferSize ?? result.navigation?.transferSize ?? Number.NaN)),
    encodedBodySize: getStats(measured.map((result) => result.loadedResourceSizes?.encodedBodySize ?? result.navigation?.encodedBodySize ?? Number.NaN)),
    decodedBodySize: getStats(measured.map((result) => result.loadedResourceSizes?.decodedBodySize ?? result.navigation?.decodedBodySize ?? Number.NaN)),
    resources: getStats(measured.map((result) => result.loadedResourceSizes?.resources ?? getPerformanceMetric(result, 'Resources'))),
    scriptDurationMs: getStats(measured.map((result) => secondsToMs(getPerformanceMetric(result, 'ScriptDuration')))),
    taskDurationMs: getStats(measured.map((result) => secondsToMs(getPerformanceMetric(result, 'TaskDuration')))),
    layoutDurationMs: getStats(measured.map((result) => secondsToMs(getPerformanceMetric(result, 'LayoutDuration')))),
    recalcStyleDurationMs: getStats(measured.map((result) => secondsToMs(getPerformanceMetric(result, 'RecalcStyleDuration')))),
    documents: getStats(measured.map((result) => result.domCounters?.documents ?? Number.NaN)),
    eventListeners: getStats(measured.map((result) => result.domCounters?.jsEventListeners ?? Number.NaN)),
  }
}

const format = (value: number | null): string => {
  return value === null ? 'n/a' : String(value)
}

const formatStats = (stats: Stats): string => {
  return `${format(stats.mean)} / ${format(stats.min)} / ${format(stats.max)} / ${format(stats.p95)}`
}

export const toMarkdown = (summaries: readonly VersionSummary[]): string => {
  const lines = [
    '# LVCE Startup Benchmark Results',
    '',
    'Values are `average / fastest / slowest / p95` across measured iterations.',
    '',
    '| Version | Iterations | Failures | Load ms | Wall ms | Transfer Size | Encoded Size | Decoded Size | Heap Used | DOM Nodes | Resources | Script ms | Task ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const summary of summaries) {
    lines.push(
      `| ${summary.version} | ${summary.iterations} | ${summary.failures} | ${formatStats(summary.loadTimeMs)} | ${formatStats(
        summary.wallTimeMs,
      )} | ${formatStats(summary.transferSize)} | ${formatStats(summary.encodedBodySize)} | ${formatStats(summary.decodedBodySize)} | ${formatStats(
        summary.heapUsed,
      )} | ${formatStats(summary.domNodes)} | ${formatStats(summary.resources)} | ${formatStats(summary.scriptDurationMs)} | ${formatStats(
        summary.taskDurationMs,
      )} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}
