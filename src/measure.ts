import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser, type CDPSession, type Page } from 'playwright'
import { getGpuProcessMemoryBytes } from './gpuProcessMemory.ts'
import type {
  BenchmarkOptions,
  DomCounters,
  IterationResult,
  LoadedResourceSizes,
  NavigationTiming,
  PaintTimings,
  PerformanceMetric,
  RuntimeHeapUsage,
} from './types.ts'

const toNavigationTiming = (value: Record<string, unknown> | undefined): NavigationTiming | null => {
  if (!value) {
    return null
  }
  return {
    startTime: Number(value.startTime) || 0,
    domInteractive: Number(value.domInteractive) || 0,
    domContentLoadedEventEnd: Number(value.domContentLoadedEventEnd) || 0,
    loadEventEnd: Number(value.loadEventEnd) || 0,
    responseEnd: Number(value.responseEnd) || 0,
    duration: Number(value.duration) || 0,
    transferSize: Number(value.transferSize) || 0,
    encodedBodySize: Number(value.encodedBodySize) || 0,
    decodedBodySize: Number(value.decodedBodySize) || 0,
  }
}

const getPerformanceMetrics = (metrics: readonly { readonly name: string; readonly value: number }[]): readonly PerformanceMetric[] => {
  return metrics.map((metric) => ({
    name: metric.name,
    value: metric.value,
  }))
}

const getLoadedResourceSizes = async (page: Page): Promise<LoadedResourceSizes> => {
  return page.evaluate(() => {
    const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const entries = [...navigationEntries, ...resourceEntries]
    const totals = entries.reduce(
      (total, entry) => ({
        transferSize: total.transferSize + (Number(entry.transferSize) || 0),
        encodedBodySize: total.encodedBodySize + (Number(entry.encodedBodySize) || 0),
        decodedBodySize: total.decodedBodySize + (Number(entry.decodedBodySize) || 0),
      }),
      {
        transferSize: 0,
        encodedBodySize: 0,
        decodedBodySize: 0,
      },
    )
    return {
      resources: resourceEntries.length,
      ...totals,
    }
  })
}

const getPaintTimings = async (page: Page): Promise<PaintTimings> => {
  return page.evaluate(async () => {
    const getPaintTime = (name: string): number | null => {
      const entry = performance.getEntriesByType('paint').find((paintEntry) => paintEntry.name === name)
      return entry ? entry.startTime : null
    }
    const getLargestContentfulPaintTime = async (): Promise<number | null> => {
      if (!('PerformanceObserver' in window)) {
        return null
      }
      return new Promise((resolve) => {
        let latest: number | null = null
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              latest = entry.startTime
            }
          })
          observer.observe({ type: 'largest-contentful-paint', buffered: true })
          requestAnimationFrame(() => {
            setTimeout(() => {
              observer.disconnect()
              resolve(latest)
            }, 0)
          })
        } catch {
          resolve(null)
        }
      })
    }
    return {
      firstPaintMs: getPaintTime('first-paint'),
      firstContentfulPaintMs: getPaintTime('first-contentful-paint'),
      largestContentfulPaintMs: await getLargestContentfulPaintTime(),
    }
  })
}

const readProtocolStream = async (cdp: CDPSession, stream: string): Promise<string> => {
  let result = ''
  let eof = false
  while (!eof) {
    const chunk = (await cdp.send('IO.read', { handle: stream })) as { readonly data?: string; readonly eof?: boolean }
    result += chunk.data || ''
    eof = Boolean(chunk.eof)
  }
  await cdp.send('IO.close', { handle: stream }).catch(() => undefined)
  return result
}

const stopTracing = async (cdp: CDPSession, tracePath: string): Promise<void> => {
  const tracingComplete = new Promise<string>((resolve) => {
    cdp.once('Tracing.tracingComplete', (event: { readonly stream?: string }) => {
      resolve(event.stream || '')
    })
  })
  await cdp.send('Tracing.end')
  const stream = await tracingComplete
  if (!stream) {
    return
  }
  const trace = await readProtocolStream(cdp, stream)
  await writeFile(tracePath, trace)
}

const measureGpuProcessMemory = async (browser: Browser): Promise<number | null> => {
  const cdp = await browser.newBrowserCDPSession().catch(() => null)
  if (!cdp) {
    return null
  }
  try {
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo')
    return await getGpuProcessMemoryBytes(processInfo)
  } catch {
    return null
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

export const measureStartup = async (
  version: string,
  safeVersion: string,
  iteration: number,
  warmup: boolean,
  url: string,
  options: Pick<BenchmarkOptions, 'headed' | 'timeout' | 'profile' | 'output'>,
): Promise<IterationResult> => {
  const browser = await chromium.launch({ headless: !options.headed })
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  const tracePath = options.profile && !warmup ? join(options.output, `trace-${safeVersion}-${iteration}.json`) : undefined
  let tracing = false
  try {
    await cdp.send('Performance.enable')
    if (tracePath) {
      await mkdir(options.output, { recursive: true })
      await cdp.send('Tracing.start', {
        categories: 'devtools.timeline,v8,blink.user_timing,loading',
        transferMode: 'ReturnAsStream',
      })
      tracing = true
    }
    const start = performance.now()
    await page.goto(url, { waitUntil: 'load', timeout: options.timeout })
    const wallTimeMs = performance.now() - start
    if (tracePath && tracing) {
      await stopTracing(cdp, tracePath)
      tracing = false
    }
    const navigation = toNavigationTiming(
      await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0]
        return entry ? entry.toJSON() : undefined
      }),
    )
    const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length)
    const loadedResourceSizes = await getLoadedResourceSizes(page).catch(() => null)
    const domCounters = (await cdp.send('Memory.getDOMCounters').catch(() => null)) as DomCounters | null
    const heapUsage = (await cdp.send('Runtime.getHeapUsage').catch(() => null)) as RuntimeHeapUsage | null
    const paintTimings = await getPaintTimings(page).catch(() => null)
    const performanceMetricsResult = (await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }))) as {
      readonly metrics: readonly { readonly name: string; readonly value: number }[]
    }
    const gpuProcessMemoryBytes = await measureGpuProcessMemory(browser)
    return {
      version,
      iteration,
      warmup,
      success: true,
      url,
      wallTimeMs,
      navigation,
      domNodeCount,
      domCounters,
      heapUsage,
      loadedResourceSizes,
      performanceMetrics: getPerformanceMetrics(performanceMetricsResult.metrics),
      paintTimings,
      gpuProcessMemoryBytes,
      serverOpenFileDescriptors: null,
      ...(tracePath ? { tracePath } : {}),
    }
  } catch (error) {
    return {
      version,
      iteration,
      warmup,
      success: false,
      url,
      wallTimeMs: 0,
      navigation: null,
      domNodeCount: null,
      domCounters: null,
      heapUsage: null,
      loadedResourceSizes: null,
      performanceMetrics: [],
      paintTimings: null,
      gpuProcessMemoryBytes: null,
      serverOpenFileDescriptors: null,
      error: error instanceof Error ? error.stack || error.message : String(error),
      ...(tracePath ? { tracePath } : {}),
    }
  } finally {
    if (tracePath && tracing) {
      await stopTracing(cdp, tracePath).catch(() => undefined)
    }
    await context.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
