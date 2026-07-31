import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type {
  Granularity,
  MetricDefinition,
  SeriesPoint
} from '@plugins/app-extensions/MetricTracker/types'

/** Chart.js needs a real canvas; the configuration it is handed is the subject. */
const configs: Record<string, unknown>[] = []
vi.mock('chart.js/auto', () => ({
  default: class {
    data: unknown
    options: unknown
    constructor(_canvas: unknown, config: Record<string, unknown>) {
      configs.push(config)
      this.data = config.data
      this.options = config.options
    }
    update() {}
    destroy() {}
  }
}))

const MetricSeriesChart = (
  await import('@plugins/app-extensions/MetricTracker/components/MetricSeriesChart.vue')
).default

const SUM_METRIC: MetricDefinition = {
  id: 'distance',
  sourceRef: 'distance',
  periodOp: 'sum',
  toDisplay: raw => raw / 1000,
  format: value => `${value.toFixed(1)} km`
}

const RATIO_METRIC: MetricDefinition = {
  ...SUM_METRIC,
  id: 'pace',
  periodOp: 'ratio',
  betterIsLower: true
}

const points: SeriesPoint[] = [
  { key: '2026-01', startTime: 1, value: 10, count: 1 },
  { key: '2026-02', startTime: 2, value: 20, count: 1 },
  { key: '2026-03', startTime: 3, value: 15, count: 1 }
]

// The chart is built after a `nextTick`, so the canvas has been laid out.
const render = async (granularity: Granularity, metric: MetricDefinition = SUM_METRIC) => {
  const wrapper = mount(MetricSeriesChart, {
    props: { points, labels: points.map(p => p.key), metric, granularity }
  })
  await flushPromises()
  return wrapper
}

const config = () =>
  configs.at(-1) as {
    data: { datasets: Record<string, unknown>[] }
    options: { scales: { y: Record<string, unknown> } }
  }

/**
 * Periods are a continuum; outings are not. The mark follows the granularity
 * rather than the page, which is what let the aggregated-progress widget be
 * absorbed here without losing its reading.
 */
describe('MetricSeriesChart — the mark follows the granularity', () => {
  beforeEach(() => {
    configs.length = 0
  })

  describe('per period', () => {
    it('draws one filled line, not a cloud', async () => {
      await render('month')
      const [series, ...rest] = config().data.datasets

      expect(series.fill).toBe(true)
      expect(series.showLine).not.toBe(false)
      expect(series.tension).toBe(0.25)
      // No fitted trend: the line already is the progression.
      expect(rest).toHaveLength(0)
    })

    it('does the same for weeks and years', async () => {
      await render('week')
      expect(config().data.datasets).toHaveLength(1)
      await render('year')
      expect(config().data.datasets).toHaveLength(1)
    })
  })

  describe('per outing', () => {
    // Two Sunday long runs are not a continuum; a line zigzagging between them
    // reads far worse than a cloud with its direction fitted.
    it('draws a cloud and fits a trend through it', async () => {
      await render('activity')
      const [series, trend] = config().data.datasets

      expect(series.showLine).toBe(false)
      expect(trend.label).toBe('trend')
      expect(trend.borderDash).toEqual([6, 4])
    })
  })

  describe('the axis belongs to the metric', () => {
    // Half the distance is half the bar, so zero is a real reading.
    it('starts a summed metric at zero', async () => {
      await render('month', SUM_METRIC)
      expect(config().options.scales.y.beginAtZero).toBe(true)
    })

    // Forcing a pace to zero flattens the variation the chart exists to show.
    it('lets a ratio metric frame its own range', async () => {
      await render('month', RATIO_METRIC)
      expect(config().options.scales.y.beginAtZero).toBe(false)
    })

    it('reverses the axis when lower is better', async () => {
      await render('month', RATIO_METRIC)
      expect(config().options.scales.y.reverse).toBe(true)
    })
  })
})
