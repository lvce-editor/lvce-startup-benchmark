import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Stats, VersionSummary } from './types.ts'

interface ReportOptions {
  readonly input: string
  readonly output: string
  readonly title: string
}

interface ChartDefinition {
  readonly fileName: string
  readonly title: string
  readonly unit: string
  readonly getStats: (summary: VersionSummary) => Stats | undefined
}

const charts: readonly ChartDefinition[] = [
  {
    fileName: 'load-time.svg',
    title: 'Load event',
    unit: 'ms',
    getStats: (summary) => summary.loadTimeMs,
  },
  {
    fileName: 'dom-content-loaded-time.svg',
    title: 'DOM content loaded',
    unit: 'ms',
    getStats: (summary) => summary.domContentLoadedTimeMs,
  },
  {
    fileName: 'response-time.svg',
    title: 'Response end',
    unit: 'ms',
    getStats: (summary) => summary.responseEndTimeMs,
  },
  {
    fileName: 'wall-time.svg',
    title: 'Wall time',
    unit: 'ms',
    getStats: (summary) => summary.wallTimeMs,
  },
  {
    fileName: 'heap-used.svg',
    title: 'Heap used',
    unit: 'bytes',
    getStats: (summary) => summary.heapUsed,
  },
  {
    fileName: 'transfer-size.svg',
    title: 'Total transfer size',
    unit: 'bytes',
    getStats: (summary) => summary.transferSize,
  },
  {
    fileName: 'encoded-size.svg',
    title: 'Total encoded size',
    unit: 'bytes',
    getStats: (summary) => summary.encodedBodySize,
  },
  {
    fileName: 'decoded-size.svg',
    title: 'Total decoded size',
    unit: 'bytes',
    getStats: (summary) => summary.decodedBodySize,
  },
  {
    fileName: 'script-duration.svg',
    title: 'Script duration',
    unit: 'ms',
    getStats: (summary) => summary.scriptDurationMs,
  },
  {
    fileName: 'task-duration.svg',
    title: 'Main-thread task duration',
    unit: 'ms',
    getStats: (summary) => summary.taskDurationMs,
  },
  {
    fileName: 'layout-duration.svg',
    title: 'Layout duration',
    unit: 'ms',
    getStats: (summary) => summary.layoutDurationMs,
  },
  {
    fileName: 'style-duration.svg',
    title: 'Style recalculation duration',
    unit: 'ms',
    getStats: (summary) => summary.recalcStyleDurationMs,
  },
  {
    fileName: 'dom-nodes.svg',
    title: 'DOM nodes',
    unit: 'nodes',
    getStats: (summary) => summary.domNodes,
  },
  {
    fileName: 'resources.svg',
    title: 'Loaded resources',
    unit: 'resources',
    getStats: (summary) => summary.resources,
  },
  {
    fileName: 'event-listeners.svg',
    title: 'Event listeners',
    unit: 'listeners',
    getStats: (summary) => summary.eventListeners,
  },
]

const emptyStats: Stats = {
  mean: null,
  min: null,
  max: null,
  p95: null,
}

const formatNumber = (value: number | null, maximumFractionDigits = 2): string => {
  if (value === null) {
    return 'n/a'
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value)
}

const formatBytes = (value: number | null): string => {
  if (value === null) {
    return 'n/a'
  }
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let scaled = value
  let unitIndex = 0
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024
    unitIndex++
  }
  return `${formatNumber(scaled, scaled >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

const formatValue = (value: number | null, unit = ''): string => {
  if (unit === 'bytes') {
    return formatBytes(value)
  }
  const suffix = unit && value !== null ? ` ${unit}` : ''
  return `${formatNumber(value)}${suffix}`
}

const formatStats = (stats: Stats | undefined, unit = ''): string => {
  const safeStats = stats ?? emptyStats
  return `${formatValue(safeStats.mean, unit)} / ${formatValue(safeStats.min, unit)} / ${formatValue(safeStats.max, unit)} / ${formatValue(
    safeStats.p95,
    unit,
  )}`
}

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const escapeXml = escapeHtml

const getGeneratedAt = (): string => {
  return new Date().toISOString()
}

const getBestLoadTime = (summaries: readonly VersionSummary[]): VersionSummary | undefined => {
  const withLoadTime = summaries.filter((summary) => summary.loadTimeMs.mean !== null)
  return withLoadTime.toSorted((a, b) => (a.loadTimeMs.mean ?? Number.POSITIVE_INFINITY) - (b.loadTimeMs.mean ?? Number.POSITIVE_INFINITY))[0]
}

const getFastestLoadTime = (summaries: readonly VersionSummary[]): VersionSummary | undefined => {
  const withLoadTime = summaries.filter((summary) => summary.loadTimeMs.min !== null)
  return withLoadTime.toSorted((a, b) => (a.loadTimeMs.min ?? Number.POSITIVE_INFINITY) - (b.loadTimeMs.min ?? Number.POSITIVE_INFINITY))[0]
}

const getChartStats = (summary: VersionSummary, chart: ChartDefinition): Stats => {
  return chart.getStats(summary) ?? emptyStats
}

const getChartValues = (summaries: readonly VersionSummary[], chart: ChartDefinition): readonly number[] => {
  return summaries
    .flatMap((summary) => {
      const stats = getChartStats(summary, chart)
      return [stats.mean, stats.min]
    })
    .filter((value): value is number => value !== null && Number.isFinite(value))
}

const getChartDomain = (summaries: readonly VersionSummary[], chart: ChartDefinition): { readonly min: number; readonly max: number } => {
  const values = getChartValues(summaries, chart)
  if (values.length === 0) {
    return {
      min: 0,
      max: 1,
    }
  }
  const max = Math.max(...values)
  return {
    min: 0,
    max: max <= 0 ? 1 : max * 1.08,
  }
}

const pointToString = (point: readonly [number, number]): string => {
  return `${point[0].toFixed(2)},${point[1].toFixed(2)}`
}

const renderPolyline = (points: readonly (readonly [number, number])[], className: string): string => {
  if (points.length < 2) {
    return ''
  }
  return `<polyline class="${className}" points="${points.map(pointToString).join(' ')}" />`
}

const renderPoints = (points: readonly (readonly [number, number])[], className: string): string => {
  return points.map((point) => `<circle class="${className}" cx="${point[0].toFixed(2)}" cy="${point[1].toFixed(2)}" r="4" />`).join('\n')
}

const getXAxisLabels = (summaries: readonly VersionSummary[], left: number, chartWidth: number): string => {
  if (summaries.length === 0) {
    return ''
  }
  const labelInterval = Math.max(1, Math.ceil(summaries.length / 8))
  return summaries
    .map((summary, index) => {
      if (index % labelInterval !== 0 && index !== summaries.length - 1) {
        return ''
      }
      const x = summaries.length === 1 ? left + chartWidth / 2 : left + (index / (summaries.length - 1)) * chartWidth
      return `<text class="axis-label x-label" x="${x.toFixed(2)}" y="374" transform="rotate(35 ${x.toFixed(2)} 374)">${escapeXml(summary.version)}</text>`
    })
    .join('\n')
}

const renderChart = (summaries: readonly VersionSummary[], chart: ChartDefinition): string => {
  const width = 1040
  const height = 420
  const left = 76
  const right = 34
  const top = 70
  const bottom = 86
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const domain = getChartDomain(summaries, chart)
  const toX = (index: number): number => (summaries.length === 1 ? left + chartWidth / 2 : left + (index / (summaries.length - 1)) * chartWidth)
  const toY = (value: number): number => top + ((domain.max - value) / (domain.max - domain.min)) * chartHeight
  const pointsFor = (key: 'mean' | 'min'): readonly (readonly [number, number])[] =>
    summaries.flatMap((summary, index) => {
      const value = getChartStats(summary, chart)[key]
      return value === null || !Number.isFinite(value) ? [] : ([[toX(index), toY(value)]] as const)
    })
  const meanPoints = pointsFor('mean')
  const minPoints = pointsFor('min')
  const yTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const value = domain.max - ratio * (domain.max - domain.min)
      const y = top + ratio * chartHeight
      return `
        <line class="grid" x1="${left}" x2="${width - right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" />
        <text class="axis-label" x="${left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end">${escapeXml(formatValue(value, chart.unit))}</text>
      `
    })
    .join('\n')
  const latest = summaries.at(-1)
  const latestStats = latest ? getChartStats(latest, chart) : emptyStats
  const summaryLine =
    latest && latestStats.mean !== null
      ? `${latest.version}: mean ${formatValue(latestStats.mean, chart.unit)}, fastest ${formatValue(latestStats.min, chart.unit)}`
      : 'No data available'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(chart.title)}</title>
  <desc id="desc">Mean and fastest ${escapeXml(chart.title.toLowerCase())} by version.</desc>
  <style>
    .title { fill: #171717; font: 700 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .subtitle, .legend, .axis-label { fill: #5f6b7a; font: 500 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .axis-label { font-size: 11px; }
    .grid { stroke: #e3e8ef; stroke-width: 1; }
    .axis { stroke: #aeb8c5; stroke-width: 1.2; }
    .mean-line, .fastest-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 3; }
    .mean-line { stroke: #246bfe; }
    .fastest-line { stroke: #00856f; }
    .mean-point { fill: #246bfe; stroke: #ffffff; stroke-width: 1.5; }
    .fastest-point { fill: #00856f; stroke: #ffffff; stroke-width: 1.5; }
    .legend-dot.mean { fill: #246bfe; }
    .legend-dot.fastest { fill: #00856f; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="24" y="32" class="title">${escapeXml(chart.title)}</text>
  <text x="24" y="52" class="subtitle">${escapeXml(summaryLine)}</text>
  <circle class="legend-dot mean" cx="790" cy="29" r="5" />
  <text class="legend" x="802" y="33">Average</text>
  <circle class="legend-dot fastest" cx="890" cy="29" r="5" />
  <text class="legend" x="902" y="33">Fastest</text>
  ${yTicks}
  <line class="axis" x1="${left}" x2="${left}" y1="${top}" y2="${top + chartHeight}" />
  <line class="axis" x1="${left}" x2="${width - right}" y1="${top + chartHeight}" y2="${top + chartHeight}" />
  ${renderPolyline(meanPoints, 'mean-line')}
  ${renderPolyline(minPoints, 'fastest-line')}
  ${renderPoints(meanPoints, 'mean-point')}
  ${renderPoints(minPoints, 'fastest-point')}
  ${getXAxisLabels(summaries, left, chartWidth)}
</svg>
`
}

const renderSummaryRows = (summaries: readonly VersionSummary[]): string => {
  return summaries
    .map((summary) => {
      const status = summary.failures === 0 ? 'Passing' : `${summary.failures} failed`
      return `<tr>
        <th scope="row">${escapeHtml(summary.version)}</th>
        <td>${summary.iterations}</td>
        <td><span class="status ${summary.failures === 0 ? 'ok' : 'warn'}">${escapeHtml(status)}</span></td>
        <td>${escapeHtml(formatStats(summary.loadTimeMs, 'ms'))}</td>
        <td>${escapeHtml(formatStats(summary.domContentLoadedTimeMs, 'ms'))}</td>
        <td>${escapeHtml(formatStats(summary.wallTimeMs, 'ms'))}</td>
        <td>${escapeHtml(formatStats(summary.transferSize, 'bytes'))}</td>
        <td>${escapeHtml(formatStats(summary.encodedBodySize, 'bytes'))}</td>
        <td>${escapeHtml(formatStats(summary.decodedBodySize, 'bytes'))}</td>
        <td>${escapeHtml(formatStats(summary.heapUsed, 'bytes'))}</td>
        <td>${escapeHtml(formatStats(summary.domNodes))}</td>
        <td>${escapeHtml(formatStats(summary.resources))}</td>
        <td>${escapeHtml(formatStats(summary.scriptDurationMs, 'ms'))}</td>
        <td>${escapeHtml(formatStats(summary.taskDurationMs, 'ms'))}</td>
        <td>${escapeHtml(formatStats(summary.eventListeners))}</td>
      </tr>`
    })
    .join('\n')
}

const renderRawLinks = (rawFiles: readonly string[]): string => {
  if (rawFiles.length === 0) {
    return '<p class="muted">No raw per-version files were found.</p>'
  }
  return `<ul class="raw-links">${rawFiles.map((file) => `<li><a href="raw/${encodeURIComponent(file)}">${escapeHtml(file)}</a></li>`).join('')}</ul>`
}

const renderHtml = (summaries: readonly VersionSummary[], rawFiles: readonly string[], options: ReportOptions): string => {
  const bestLoad = getBestLoadTime(summaries)
  const fastestLoad = getFastestLoadTime(summaries)
  const totalFailures = summaries.reduce((total, summary) => total + summary.failures, 0)
  const generatedAt = getGeneratedAt()
  const chartImages = charts
    .map((chart) => `<figure><img src="${chart.fileName}" alt="${escapeHtml(chart.title)} chart" /></figure>`)
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #171717;
      --muted: #666f7a;
      --border: #d8dde5;
      --accent: #246bfe;
      --ok: #00856f;
      --warn: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    header, main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 20px;
    }
    header {
      display: grid;
      gap: 18px;
    }
    h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 3.75rem);
      line-height: 1;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 1.25rem;
      letter-spacing: 0;
    }
    a { color: var(--accent); }
    .muted { color: var(--muted); }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .stat, section, figure {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
    }
    .stat {
      padding: 14px 16px;
    }
    .stat strong {
      display: block;
      font-size: 1.35rem;
      line-height: 1.2;
    }
    .stat span {
      color: var(--muted);
      font-size: 0.9rem;
    }
    main {
      display: grid;
      gap: 20px;
      padding-top: 0;
    }
    section {
      overflow: hidden;
      padding: 18px;
    }
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr));
      gap: 16px;
    }
    figure {
      margin: 0;
      padding: 8px;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
    }
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1040px;
      font-size: 0.92rem;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 10px 12px;
      text-align: right;
      vertical-align: top;
      white-space: nowrap;
    }
    th {
      color: var(--muted);
      font-weight: 700;
    }
    th:first-child, td:first-child {
      text-align: left;
    }
    tbody th {
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.88rem;
    }
    tbody tr:last-child th, tbody tr:last-child td {
      border-bottom: 0;
    }
    .status {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 0.82rem;
      font-weight: 700;
    }
    .status.ok {
      background: #e7f5ef;
      color: var(--ok);
    }
    .status.warn {
      background: #fff0ed;
      color: var(--warn);
    }
    .raw-links {
      columns: 2 220px;
      margin: 0;
      padding-left: 20px;
    }
    @media (max-width: 700px) {
      header, main { padding-left: 14px; padding-right: 14px; }
      section { padding: 14px; }
      .meta { display: grid; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(options.title)}</h1>
      <div class="meta">
        <span>Generated ${escapeHtml(generatedAt)}</span>
        <span>Values are average / fastest / slowest / p95</span>
      </div>
    </div>
    <div class="stats" aria-label="Run summary">
      <div class="stat"><strong>${summaries.length}</strong><span>Versions</span></div>
      <div class="stat"><strong>${summaries.reduce((total, summary) => total + summary.iterations, 0)}</strong><span>Measured iterations</span></div>
      <div class="stat"><strong>${totalFailures}</strong><span>Failed iterations</span></div>
      <div class="stat"><strong>${escapeHtml(bestLoad?.version ?? 'n/a')}</strong><span>Best average load</span></div>
      <div class="stat"><strong>${escapeHtml(fastestLoad?.version ?? 'n/a')}</strong><span>Fastest load run</span></div>
    </div>
  </header>
  <main>
    <section aria-labelledby="charts-heading">
      <h2 id="charts-heading">Charts</h2>
      <div class="chart-grid">
        ${chartImages}
      </div>
    </section>
    <section aria-labelledby="summary-heading">
      <h2 id="summary-heading">Summary</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Iterations</th>
              <th scope="col">Failures</th>
              <th scope="col">Load ms</th>
              <th scope="col">DOMContentLoaded ms</th>
              <th scope="col">Wall ms</th>
              <th scope="col">Transfer size</th>
              <th scope="col">Encoded size</th>
              <th scope="col">Decoded size</th>
              <th scope="col">Heap used</th>
              <th scope="col">DOM nodes</th>
              <th scope="col">Resources</th>
              <th scope="col">Script ms</th>
              <th scope="col">Task ms</th>
              <th scope="col">Event listeners</th>
            </tr>
          </thead>
          <tbody>
            ${renderSummaryRows(summaries)}
          </tbody>
        </table>
      </div>
    </section>
    <section aria-labelledby="data-heading">
      <h2 id="data-heading">Data</h2>
      <p><a href="summary.json">summary.json</a> <span class="muted">and</span> <a href="summary.md">summary.md</a></p>
      ${renderRawLinks(rawFiles)}
    </section>
  </main>
</body>
</html>
`
}

const readSummary = async (inputDir: string): Promise<readonly VersionSummary[]> => {
  const summaryPath = join(inputDir, 'summary.json')
  const content = await readFile(summaryPath, 'utf8')
  return JSON.parse(content) as readonly VersionSummary[]
}

const copyIfExists = async (from: string, to: string): Promise<void> => {
  try {
    await copyFile(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

const getRawFiles = async (inputDir: string): Promise<readonly string[]> => {
  try {
    const entries = await readdir(join(inputDir, 'raw'), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .toSorted()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

const copyRawFiles = async (inputDir: string, outputDir: string, rawFiles: readonly string[]): Promise<void> => {
  if (rawFiles.length === 0) {
    return
  }
  const rawOutputDir = join(outputDir, 'raw')
  await mkdir(rawOutputDir, { recursive: true })
  await Promise.all(rawFiles.map((file) => copyFile(join(inputDir, 'raw', file), join(rawOutputDir, basename(file)))))
}

export const writeReport = async (options: ReportOptions): Promise<void> => {
  const summaries = await readSummary(options.input)
  const rawFiles = await getRawFiles(options.input)
  await mkdir(options.output, { recursive: true })
  await Promise.all([
    copyIfExists(join(options.input, 'summary.json'), join(options.output, 'summary.json')),
    copyIfExists(join(options.input, 'summary.md'), join(options.output, 'summary.md')),
    writeFile(join(options.output, '.nojekyll'), ''),
    ...charts.map((chart) => writeFile(join(options.output, chart.fileName), renderChart(summaries, chart))),
  ])
  await copyRawFiles(options.input, options.output, rawFiles)
  await writeFile(join(options.output, 'index.html'), renderHtml(summaries, rawFiles, options))
}

const parseArgs = (args: readonly string[]): ReportOptions => {
  const options: Record<string, string> = {
    input: 'results',
    output: '.tmp/pages',
    title: 'LVCE Startup Benchmark Results',
  }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg) {
      throw new Error(`Missing argument at index ${index}`)
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    const key = arg.slice(2)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`)
    }
    options[key] = value
    index++
  }
  return {
    input: options.input ?? 'results',
    output: options.output ?? '.tmp/pages',
    title: options.title ?? 'LVCE Startup Benchmark Results',
  }
}

const main = async (): Promise<void> => {
  await writeReport(parseArgs(process.argv.slice(2)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
