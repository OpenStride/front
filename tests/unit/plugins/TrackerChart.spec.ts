import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import type { MetricDefinition } from '@plugins/app-extensions/MetricTracker/types'
import type { MetricKind, Period } from '@plugins/app-extensions/MetricTracker/trackerData'

/** Chart.js needs a real canvas; the configuration it is handed is the subject. */
const configs: Record<string, unknown>[] = []
vi.mock('chart.js/auto', () => ({
  default: class {
    constructor(_canvas: unknown, config: Record<string, unknown>) {
      configs.push(config)
    }
    destroy() {}
  }
}))

const TrackerChart = (
  await import('@plugins/app-extensions/MetricTracker/components/TrackerChart.vue')
).default

const DISTANCE: MetricDefinition = {
  id: 'distance',
  sourceRef: 'distance',
  periodOp: 'sum',
  toDisplay: raw => raw / 1000,
  format: v => `${v.toFixed(1)} km`
}
const PACE: MetricDefinition = { ...DISTANCE, id: 'pace', periodOp: 'ratio', betterIsLower: true }

const month = (m: number, value: number | null, isCurrent = false): Period => ({
  start: new Date(2026, m, 1),
  end: new Date(2026, m + 1, 1),
  isCurrent,
  value,
  count: value === null ? 0 : 1,
  bestOuting:
    value === null ? undefined : { id: `o${m}`, startTime: new Date(2026, m, 10).getTime(), value }
})
const periods = [month(7, 30), month(8, 40), month(9, 35, true)]

async function render(kind: MetricKind, metric: MetricDefinition, extra = {}) {
  mount(TrackerChart, {
    props: {
      kind,
      metric,
      periods,
      outings: [],
      records: periods.map(p => ({ value: p.value, isNew: false })),
      grain: 'month',
      mode: 'avg',
      average: 35,
      label: 'chart',
      ...extra
    },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }
  })
  await flushPromises()
  return configs.at(-1) as {
    data: { datasets: Record<string, unknown>[] }
    options: { scales: { y: Record<string, unknown>; x: Record<string, unknown> } }
  }
}

beforeEach(() => {
  configs.length = 0
})

describe('TrackerChart — the mark follows the kind of metric', () => {
  it('draws a volume as bars from zero, with the average dotted', async () => {
    const config = await render('volume', DISTANCE)
    expect(config.data.datasets[0].type).toBe('bar')
    expect(config.data.datasets[1]).toMatchObject({ type: 'line', borderDash: [6, 4] })
    expect(config.options.scales.y.beginAtZero).toBe(true)
  })

  it('draws an intensity as a straight line over the outings, on a time axis', async () => {
    const config = await render('intensity', PACE)
    const [outings, line] = config.data.datasets
    expect(outings.type).toBe('scatter')
    expect(line).toMatchObject({ type: 'line', tension: 0 })
    expect(config.options.scales.x.type).toBe('linear')
  })

  it('puts a best-outing point where that outing happened, not mid-period', async () => {
    const config = await render('intensity', PACE, { mode: 'best' })
    const line = config.data.datasets[1] as { data: { x: number }[] }
    expect(line.data[0].x).toBe(new Date(2026, 7, 10).getTime())
  })

  it('draws a best time as the record step over the month bests', async () => {
    const config = await render('best', PACE)
    expect(config.data.datasets[0]).toMatchObject({ type: 'line', stepped: 'after' })
    expect(config.data.datasets[1].type).toBe('scatter')
  })

  it('steps the record on the date of the outing that broke it', async () => {
    const records = [
      { value: 30, isNew: true },
      { value: 30, isNew: false },
      { value: 25, isNew: true }
    ]
    const withNew = [month(7, 30), month(8, 40), month(9, 25, true)]
    const config = await render('best', PACE, { records, periods: withNew })
    const line = config.data.datasets[0] as { data: { x: number; y: number }[] }
    expect(line.data.map(d => d.x)).toEqual([
      new Date(2026, 7, 10).getTime(),
      new Date(2026, 9, 10).getTime(),
      new Date(2026, 10, 1).getTime()
    ])
    expect(line.data.map(d => d.y)).toEqual([30, 25, 25])
  })

  it('turns the axis over when lower is better, and frames a pace on its own range', async () => {
    const config = await render('intensity', PACE)
    expect(config.options.scales.y.reverse).toBe(true)
    expect(config.options.scales.y.beginAtZero).toBe(false)
  })
})
