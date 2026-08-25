export interface ChartMarker {
  readonly chartFileNames: readonly string[]
  readonly label: string
  readonly labelSide: 'after' | 'before'
  readonly version: string
}

const affectedTimingCharts = ['load-time.svg', 'dom-content-loaded-time.svg', 'wall-time.svg', 'first-paint.svg']

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
]
