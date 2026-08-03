import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { ref } from 'vue'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import { convertQuantity, formatQuantity, setUnitSystem, toSI } from '@/composables/useUnits'
import type { CapabilityReport } from '@/composables/useSampleCapabilities'
import type { CustomAggregate } from '@/types/customAggregate'
import type { PluginContext } from '@/types/plugin-context'
import { periodKey } from '@/utils/dateKeys'
import { createActivity } from '../fixtures/activities'
import en from '@/locales/en.json'

const ensureIndex = vi.fn(async () => undefined)
const indexing = ref(false)
const progress = ref(0)

vi.mock('@/composables/useActivityMetricsIndex', () => ({
  useActivityMetricsIndex: () => ({ indexing, progress, ensureIndex })
}))

const CustomAggregatesSection = (
  await import('@plugins/app-extensions/Statistics/components/CustomAggregatesSection.vue')
).default

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function aggregate(over: Partial<CustomAggregate> = {}): CustomAggregate {
  return {
    id: 'agg-1',
    version: 1,
    lastModified: 0,
    label: 'Climb heart rate',
    enabled: true,
    where: [{ field: 'slope', min: 0.02, max: 0.1 }],
    measure: { field: 'heartRate', op: 'avg' },
    weightBy: 'time',
    periodOp: 'avg',
    ...over
  }
}

function measuredReport(measured = true): CapabilityReport {
  return {
    activityCount: 5,
    sports: ['running'],
    fields: [
      {
        field: 'heartRate',
        labelKey: 'sampleFields.heartRate',
        availability: measured ? 'measured' : 'absent',
        activityCount: measured ? 5 : 0,
        activityRatio: measured ? 1 : 0,
        sampleCount: measured ? 900 : 0,
        ...(measured ? { min: 90, max: 180, mean: 140, p05: 100, p50: 140, p95: 175 } : {})
      }
    ]
  }
}

function context(over: { aggregates?: CustomAggregate[]; report?: CapabilityReport } = {}) {
  const list = over.aggregates ?? []
  return {
    units: {
      get system() {
        return 'metric' as const
      },
      format: formatQuantity,
      convert: convertQuantity,
      toSI
    },
    aggregates: {
      list: vi.fn(async () => list),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(async () => true),
      capabilities: vi.fn(async () => over.report ?? measuredReport()),
      onChanged: vi.fn(() => () => undefined)
    },
    aggregation: {
      getAggregated: vi.fn(async (metricId: string, period: string) => [
        {
          id: `${metricId}|${period}|x`,
          metricId,
          periodType: period,
          periodKey: periodKey(new Date(), period as 'month'),
          value: 152.4,
          sum: 0,
          count: 1,
          lastUpdated: 0
        }
      ])
    }
  } as unknown as PluginContext
}

const ACTIVITY = createActivity({ id: 'a' })

const render = (ctx: PluginContext, props: Record<string, unknown> = {}) =>
  mount(CustomAggregatesSection, {
    props: { activities: [ACTIVITY], ...props },
    global: { plugins: [i18n], provide: { [PLUGIN_CONTEXT_KEY]: ctx } }
  })

describe('CustomAggregatesSection', () => {
  beforeEach(() => {
    setUnitSystem('metric')
    ensureIndex.mockClear()
    indexing.value = false
    progress.value = 0
  })

  it('says what it is for when nothing has been defined', async () => {
    const wrapper = render(context())
    await flushPromises()

    expect(wrapper.find('[data-test="custom-aggregates"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No aggregate yet')
    expect(wrapper.find('[data-test="aggregate-new"]').exists()).toBe(true)
  })

  it('shows a tile for a pinned aggregate, with the figure of the current period', async () => {
    const wrapper = render(context({ aggregates: [aggregate({ pinned: true })] }))
    await flushPromises()

    const tiles = wrapper.find('[data-test="aggregate-tiles"]')
    expect(tiles.exists()).toBe(true)
    expect(tiles.text()).toContain('Climb heart rate')
    expect(tiles.text()).toContain('152')
  })

  it('leaves an unpinned aggregate out of the tiles but keeps it in the list', async () => {
    const wrapper = render(context({ aggregates: [aggregate({ pinned: false })] }))
    await flushPromises()

    expect(wrapper.find('[data-test="aggregate-tiles"]').exists()).toBe(false)
    expect(wrapper.find('.stack').text()).toContain('Climb heart rate')
  })

  /** Reading the rule back, in the reader's units — a slope stored as a ratio. */
  it('describes what an aggregate does without re-storing the description', async () => {
    const wrapper = render(context({ aggregates: [aggregate()] }))
    await flushPromises()

    const description = wrapper.find('.item__desc').text()
    expect(description).toContain('Average')
    expect(description).toContain('Heart rate')
    expect(description).toContain('2–10 %')
  })

  /**
   * The dead end this section used to be: it reported "no measurement yet" and
   * left the reader to go and scroll a feed until the index happened to run.
   */
  it('runs the index itself when the library has never been scanned', async () => {
    render(context({ report: measuredReport(false) }))
    await flushPromises()

    expect(ensureIndex).toHaveBeenCalledWith([ACTIVITY])
  })

  it('does not rescan a library that already reports measurements', async () => {
    render(context())
    await flushPromises()

    expect(ensureIndex).not.toHaveBeenCalled()
  })

  it('shows progress while the scan runs', async () => {
    indexing.value = true
    progress.value = 42

    const wrapper = render(context())
    await flushPromises()

    const banner = wrapper.find('[data-test="aggregate-indexing"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('42%')
  })

  it('has nothing to scan when the page holds no activity', async () => {
    render(context({ report: measuredReport(false) }), { activities: [] })
    await flushPromises()

    expect(ensureIndex).not.toHaveBeenCalled()
  })

  it('reindexes after a definition is deleted, so its values stop being shown', async () => {
    const ctx = context({ aggregates: [aggregate({ pinned: true })] })
    const wrapper = render(ctx)
    await flushPromises()

    await wrapper.find('.item__actions .btn-icon:last-child').trigger('click')
    await flushPromises()

    expect(ctx.aggregates.remove).toHaveBeenCalledWith('agg-1')
    expect(ensureIndex).toHaveBeenCalled()
  })
})
