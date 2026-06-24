import type { ChildProcess } from 'node:child_process'

export type BrowserName = 'chromium'

export interface BenchmarkOptions {
  readonly versions: readonly string[]
  readonly recentVersions: number | null
  readonly iterations: number
  readonly warmups: number
  readonly timeout: number
  readonly portBase: number
  readonly workspace: string
  readonly urlPath: string
  readonly output: string
  readonly profile: boolean
  readonly headed: boolean
  readonly browser: BrowserName
}

export interface PreparedServer {
  readonly version: string
  readonly safeVersion: string
  readonly packageDir: string
  readonly binaryPath: string
  readonly binaryArgs?: readonly string[]
}

export interface RunningServer {
  readonly port: number
  readonly url: string
  readonly process: ChildProcess
  readonly stop: () => Promise<void>
}

export interface NavigationTiming {
  readonly startTime: number
  readonly domInteractive: number
  readonly domContentLoadedEventEnd: number
  readonly loadEventEnd: number
  readonly responseEnd: number
  readonly duration: number
  readonly transferSize: number
  readonly encodedBodySize: number
  readonly decodedBodySize: number
}

export interface RuntimeHeapUsage {
  readonly usedSize: number
  readonly totalSize: number
}

export interface LoadedResourceSizes {
  readonly resources: number
  readonly transferSize: number
  readonly encodedBodySize: number
  readonly decodedBodySize: number
}

export interface DomCounters {
  readonly documents: number
  readonly nodes: number
  readonly jsEventListeners: number
}

export interface PerformanceMetric {
  readonly name: string
  readonly value: number
}

export interface IterationResult {
  readonly version: string
  readonly iteration: number
  readonly warmup: boolean
  readonly success: boolean
  readonly url: string
  readonly wallTimeMs: number
  readonly navigation: NavigationTiming | null
  readonly domNodeCount: number | null
  readonly domCounters: DomCounters | null
  readonly heapUsage: RuntimeHeapUsage | null
  readonly loadedResourceSizes: LoadedResourceSizes | null
  readonly performanceMetrics: readonly PerformanceMetric[]
  readonly tracePath?: string
  readonly error?: string
}

export interface VersionResult {
  readonly version: string
  readonly safeVersion: string
  readonly rawPath: string
  readonly results: readonly IterationResult[]
}

export interface Stats {
  readonly mean: number | null
  readonly min: number | null
  readonly max: number | null
  readonly p95: number | null
}

export interface VersionSummary {
  readonly version: string
  readonly iterations: number
  readonly failures: number
  readonly loadTimeMs: Stats
  readonly domContentLoadedTimeMs: Stats
  readonly responseEndTimeMs: Stats
  readonly wallTimeMs: Stats
  readonly domNodes: Stats
  readonly heapUsed: Stats
  readonly heapTotal: Stats
  readonly transferSize: Stats
  readonly encodedBodySize: Stats
  readonly decodedBodySize: Stats
  readonly resources: Stats
  readonly scriptDurationMs: Stats
  readonly taskDurationMs: Stats
  readonly layoutDurationMs: Stats
  readonly recalcStyleDurationMs: Stats
  readonly documents: Stats
  readonly eventListeners: Stats
}
