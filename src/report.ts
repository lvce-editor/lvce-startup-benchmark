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
  readonly getStats: (summary: VersionSummary) => Stats
}

const charts: readonly ChartDefinition[] = [
  {
    fileName: 'load-time.svg',
    title: 'Load event mean',
    unit: 'ms',
    getStats: (summary) => summary.loadTimeMs,
  },
  {
    fileName: 'wall-time.svg',
    title: 'Wall time mean',
    unit: 'ms',
    getStats: (summary) => summary.wallTimeMs,
  },
  {
    fileName: 'dom-nodes.svg',
    title: 'DOM nodes mean',
    unit: 'nodes',
    getStats: (summary) => summary.domNodes,
  },
  {
    fileName: 'heap-used.svg',
    title: 'Heap used mean',
    unit: 'bytes',
    getStats: (summary) => summary.heapUsed,
  },
]

const formatNumber = (value: number | null): string => {
  if (value === null) {
    return 'n/a'
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value)
}

const formatStats = (stats: Stats, unit = ''): string => {
  const suffix = unit ? ` ${unit}` : ''
  return `${formatNumber(stats.mean)} / ${formatNumber(stats.min)} / ${formatNumber(stats.max)} / ${formatNumber(stats.p95)}${suffix}`
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

const getMetricMax = (summaries: readonly VersionSummary[], chart: ChartDefinition): number => {
  const values = summaries.map((summary) => chart.getStats(summary).mean).filter((value): value is number => value !== null && Number.isFinite(value))
  return Math.max(1, ...values)
}

const renderChart = (summaries: readonly VersionSummary[], chart: ChartDefinition): string => {
  const rowHeight = 38
  const width = 960
  const paddingTop = 62
  const paddingRight = 32
  const paddingBottom = 34
  const labelWidth = 210
  const valueWidth = 120
  const barWidth = width - labelWidth - valueWidth - paddingRight
  const height = paddingTop + paddingBottom + summaries.length * rowHeight
  const max = getMetricMax(summaries, chart)
  const colors = ['#246bfe', '#00856f', '#c45500', '#7a5af8', '#b42318']
  const rows = summaries
    .map((summary, index) => {
      const value = chart.getStats(summary).mean
      const y = paddingTop + index * rowHeight
      const safeValue = value ?? 0
      const barLength = Math.max(0, Math.round((safeValue / max) * barWidth))
      const color = colors[index % colors.length]
      return `
        <text x="24" y="${y + 23}" class="label">${escapeXml(summary.version)}</text>
        <rect x="${labelWidth}" y="${y + 8}" width="${barWidth}" height="18" rx="4" class="track" />
        <rect x="${labelWidth}" y="${y + 8}" width="${barLength}" height="18" rx="4" fill="${color}" />
        <text x="${labelWidth + barWidth + 16}" y="${y + 23}" class="value">${escapeXml(formatNumber(value))}</text>
      `
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(chart.title)}</title>
  <desc id="desc">Mean ${escapeXml(chart.title.toLowerCase())} by version.</desc>
  <style>
    .title { fill: #171717; font: 700 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .subtitle, .value { fill: #525252; font: 500 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .label { fill: #262626; font: 600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .track { fill: #eceff3; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="24" y="32" class="title">${escapeXml(chart.title)}</text>
  <text x="24" y="52" class="subtitle">Mean value in ${escapeXml(chart.unit)}</text>
  ${rows}
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
        <td>${escapeHtml(formatStats(summary.wallTimeMs, 'ms'))}</td>
        <td>${escapeHtml(formatStats(summary.domNodes))}</td>
        <td>${escapeHtml(formatStats(summary.heapUsed, 'bytes'))}</td>
        <td>${escapeHtml(formatStats(summary.heapTotal, 'bytes'))}</td>
        <td>${escapeHtml(formatStats(summary.documents))}</td>
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
        <span>Values are mean / min / max / p95</span>
      </div>
    </div>
    <div class="stats" aria-label="Run summary">
      <div class="stat"><strong>${summaries.length}</strong><span>Versions</span></div>
      <div class="stat"><strong>${summaries.reduce((total, summary) => total + summary.iterations, 0)}</strong><span>Measured iterations</span></div>
      <div class="stat"><strong>${totalFailures}</strong><span>Failed iterations</span></div>
      <div class="stat"><strong>${escapeHtml(bestLoad?.version ?? 'n/a')}</strong><span>Lowest mean load time</span></div>
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
              <th scope="col">Wall ms</th>
              <th scope="col">DOM nodes</th>
              <th scope="col">Heap used</th>
              <th scope="col">Heap total</th>
              <th scope="col">Documents</th>
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
