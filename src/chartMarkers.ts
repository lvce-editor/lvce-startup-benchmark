export interface ChartMarker {
  readonly chartFileNames: readonly string[]
  readonly label: string
  readonly labelSide: 'after' | 'before'
  readonly version: string
}

const affectedTimingCharts = ['load-time.svg', 'dom-content-loaded-time.svg', 'wall-time.svg', 'first-paint.svg']
const sessionReplayCharts = [
  'load-time.svg',
  'dom-content-loaded-time.svg',
  'wall-time.svg',
  'heap-used.svg',
  'transfer-size.svg',
  'encoded-size.svg',
  'decoded-size.svg',
  'script-duration.svg',
  'task-duration.svg',
]

export const chartMarkers: readonly ChartMarker[] = [
  {
    chartFileNames: affectedTimingCharts,
    label: 'Cross-Origin-Opener-Policy accidentally disabled',
    labelSide: 'before',
    version: '0.99.9',
  },
  {
    chartFileNames: affectedTimingCharts,
    label: 'Cross-Origin-Opener-Policy enabled again',
    labelSide: 'after',
    version: '0.100.24',
  },
  {
    chartFileNames: sessionReplayCharts,
    label: 'Session replay player accidentally loaded at startup',
    labelSide: 'before',
    version: '0.113.25',
  },
  {
    chartFileNames: sessionReplayCharts,
    label: 'Session replay player now loads on demand',
    labelSide: 'after',
    version: '0.114.6',
  },
]
