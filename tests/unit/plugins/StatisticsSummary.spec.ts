import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import SummarySection from '@plugins/app-extensions/Statistics/components/SummarySection.vue'
import DistributionSection from '@plugins/app-extensions/Statistics/components/DistributionSection.vue'
import { convertQuantity, formatQuantity, setUnitSystem, unitSystem } from '@/composables/useUnits'
import { periodKey } from '@/utils/dateKeys'
import type { AggregationMetricDefinition, AggregatedRecord } from '@/types/aggregation'
import type { Activity } from '@/types/activity'

/**
 * The totals at the head of the statistics page read the aggregation store —
 * the running sums the activity events keep — rather than grouping the list a
 * fourth time. What matters is that they name the period the reader is in, and
 * that they render in the reader's units.
 */

const thisWeek = periodKey(new Date(), 'week')
const lastWeek = periodKey(new Date(Date.now() - 7 * 86400000), 'week')

function record(metricId: string, key: string, value: number): AggregatedRecord {
  return {
    id: `${metricId}|week|${key}`,
    metricId,
    periodType: 'week',
    periodKey: key,
    value,
    sum: value,
    count: 1,
    lastUpdated: 1
  }
}

let metrics: AggregationMetricDefinition[] = []
let records: AggregatedRecord[] = []
const saveData = vi.fn()
const rebuildAll = vi.fn()

function makeContext() {
  return {
    units: {
      get system() {
        return unitSystem.value
      },
      format: formatQuantity,
      convert: convertQuantity,
      toSI: vi.fn()
    },
    storage: {
      getData: vi.fn(),
      saveData,
      deleteData: vi.fn(),
      exportDB: vi.fn(async () => [])
    },
    notifications: { notify: vi.fn() },
    activity: { getAllActivities: vi.fn(async () => []) },
    plugins: { isPluginActive: vi.fn(), enablePlugin: vi.fn() },
    aggregation: {
      listMetrics: () => metrics,
      getAggregated: vi.fn(async (metricId: string) =>
        records.filter(r => r.metricId === metricId)
      ),
      rebuildAll,
      loadConfigFromSettings: vi.fn(async () => {}),
      subscribe: () => () => {}
    }
  }
}

async function mountSummary(selectedSport = '') {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en, fr }
  })
  const wrapper = mount(SummarySection, {
    props: { selectedSport },
    global: { plugins: [i18n], provide: { pluginContext: makeContext() } }
  })
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('—'))
  return wrapper
}

const tileValues = (wrapper: { findAll: (s: string) => { text: () => string }[] }) =>
  wrapper.findAll('.tile-value').map(t => t.text())

beforeEach(() => {
  vi.clearAllMocks()
  setUnitSystem('metric')
  metrics = []
  records = []
})

describe('the totals at the head of the statistics page', () => {
  it('registers its metrics when the config holds none', async () => {
    await mountSummary()

    expect(saveData).toHaveBeenCalledWith('aggregationConfig', expect.anything())
    // Three metrics over three periods, each aggregated as a sum.
    expect(metrics).toHaveLength(9)
    expect(metrics.every(m => m.aggregation === 'sum')).toBe(true)
    expect(metrics.filter(m => m.periods.includes('week')).map(m => m.id)).toEqual([
      'week_distance',
      'week_duration',
      'week_totalAscent'
    ])
  })

  it('shows this period alone, not the running total of every period', async () => {
    metrics = [
      {
        id: 'week_distance',
        label: 'distance',
        enabled: true,
        sourceRef: 'distance',
        aggregation: 'sum',
        periods: ['week'],
        unit: 'm',
        dimension: 'distance',
        decimals: 1
      }
    ]
    records = [record('week_distance', lastWeek, 42000), record('week_distance', thisWeek, 12500)]

    const wrapper = await mountSummary()

    expect(tileValues(wrapper)[0]).toContain('12.5')
    expect(wrapper.text()).not.toContain('42.0')
  })

  it('shows a zero for an empty period rather than the last period on record', async () => {
    records = [record('week_distance', lastWeek, 42000)]

    const wrapper = await mountSummary()

    expect(tileValues(wrapper)[0]).toContain('0.0')
  })

  it('renders a duration in hours and minutes rather than as a decimal', async () => {
    records = [record('week_duration', thisWeek, 11100)]

    const wrapper = await mountSummary()

    expect(tileValues(wrapper)[1]).toContain('3h05')
  })

  it('follows the unit preference', async () => {
    records = [record('week_distance', thisWeek, 10000)]

    const metric = await mountSummary()
    expect(tileValues(metric)[0]).toContain('km')

    setUnitSystem('imperial')
    metrics = []
    records = [record('week_distance', thisWeek, 10000)]
    const imperial = await mountSummary()
    expect(tileValues(imperial)[0]).toContain('mi')
    expect(tileValues(imperial)[0]).toContain('6.2')
  })

  it('says so only when a sport filter it cannot honour is active', async () => {
    const unfiltered = await mountSummary()
    expect(unfiltered.find('.tiles-caption').exists()).toBe(false)

    metrics = []
    const filtered = await mountSummary('running')
    expect(filtered.find('.tiles-caption').exists()).toBe(true)
  })
})

describe('the distribution section', () => {
  it('draws distance and duration by sport, and no share pie', async () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      fallbackLocale: 'en',
      messages: { en, fr }
    })
    const activity = (id: string, type: string, distance: number): Activity => ({
      id,
      type,
      distance,
      duration: 3600,
      startTime: Date.now(),
      provider: 'test',
      version: 1,
      lastModified: 1
    })
    const activities = [activity('a', 'running', 10000), activity('b', 'cycling', 40000)]

    const wrapper = mount(DistributionSection, {
      props: { activities, allActivities: activities, selectedSport: '' },
      global: { plugins: [i18n], provide: { pluginContext: makeContext() } }
    })
    await flushPromises()

    // Two canvases, not three: the share-by-sport doughnut answered a question
    // — "which sport do I do most" — that the two bar charts already answer,
    // and answered it in the one quantity neither of them plots.
    expect(wrapper.findAll('canvas')).toHaveLength(2)
  })
})
