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
import type { SampleField } from '@/types/sampleFields'
import { createActivity } from '../fixtures/activities'
import en from '@/locales/en.json'

const ensureIndex = vi.fn(async () => undefined)
const indexing = ref(false)
const progress = ref(0)

const push = vi.fn()

vi.mock('@/composables/useActivityMetricsIndex', () => ({
  useActivityMetricsIndex: () => ({ indexing, progress, ensureIndex })
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

// happy-dom has no 2d canvas context; the chart itself is not what this tests.
vi.mock('chart.js/auto', () => ({
  default: class {
    update() {}
    destroy() {}
  }
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

function field(name: SampleField, measured: boolean) {
  return {
    field: name,
    labelKey: `sampleFields.${name}`,
    availability: (measured ? 'measured' : 'absent') as 'measured' | 'absent',
    activityCount: measured ? 5 : 0,
    activityRatio: measured ? 1 : 0,
    sampleCount: measured ? 900 : 0,
    ...(measured ? { min: 90, max: 180, mean: 140, p05: 100, p50: 140, p95: 173 } : {})
  }
}

function measuredReport(measured = true, extra: SampleField[] = []): CapabilityReport {
  return {
    activityCount: 5,
    sports: ['running'],
    fields: [
      field('heartRate', measured),
      ...(['slope', 'speed', 'power'] as SampleField[]).map(f =>
        field(f, measured && extra.includes(f))
      )
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

async function open(wrapper: ReturnType<typeof render>) {
  await wrapper.find('[data-test="aggregate-manage"]').trigger('click')
  await flushPromises()
}

describe('CustomAggregatesSection — the dashboard', () => {
  beforeEach(() => {
    setUnitSystem('metric')
    ensureIndex.mockClear()
    push.mockClear()
    indexing.value = false
    progress.value = 0
  })

  /**
   * Pinning means one thing now: this is what the dashboard shows. Everything
   * else lives behind the gear, so the page grows with decisions rather than
   * with experiments.
   */
  it('shows a card for a pinned aggregate and nothing for the others', async () => {
    const wrapper = render(
      context({
        aggregates: [
          aggregate({ id: 'shown', label: 'Shown', pinned: true }),
          aggregate({ id: 'hidden', label: 'Hidden', pinned: false })
        ]
      })
    )
    await flushPromises()

    expect(wrapper.find('[data-test="aggregate-card-shown"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="aggregate-card-hidden"]').exists()).toBe(false)
  })

  it('points at the gear when nothing is shown but something is defined', async () => {
    const wrapper = render(context({ aggregates: [aggregate({ pinned: false })] }))
    await flushPromises()

    expect(wrapper.find('[data-test="aggregate-empty"]').text()).toContain('Nothing shown yet')
  })

  it('says what it is for when nothing has been defined at all', async () => {
    const wrapper = render(context())
    await flushPromises()

    expect(wrapper.find('[data-test="aggregate-empty"]').text()).toContain('Nothing followed yet')
  })

  it('keeps the management panel closed until the gear is used', async () => {
    const wrapper = render(context({ aggregates: [aggregate()] }))
    await flushPromises()

    expect(wrapper.find('[data-test="aggregate-manager"]').exists()).toBe(false)
    await open(wrapper)
    expect(wrapper.find('[data-test="aggregate-manager"]').exists()).toBe(true)
  })

  it('shows progress while the scan runs', async () => {
    indexing.value = true
    progress.value = 42

    const wrapper = render(context())
    await flushPromises()

    expect(wrapper.find('[data-test="aggregate-indexing"]').text()).toContain('42%')
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

  it('has nothing to scan when the page holds no activity', async () => {
    render(context({ report: measuredReport(false) }), { activities: [] })
    await flushPromises()

    expect(ensureIndex).not.toHaveBeenCalled()
  })
})

describe('CustomAggregatesSection — behind the gear', () => {
  beforeEach(() => {
    setUnitSystem('metric')
    ensureIndex.mockClear()
    push.mockClear()
    indexing.value = false
  })

  it('offers ready-made aggregates the data supports', async () => {
    const wrapper = render(context({ report: measuredReport(true, ['slope', 'speed']) }))
    await flushPromises()
    await open(wrapper)

    const presets = wrapper.find('[data-test="aggregate-presets"]')
    expect(presets.text()).toContain('Heart rate on climbs')
    expect(presets.text()).toContain('Speed on the flat')
  })

  /** Suggesting a power aggregate to a bike with no meter builds a dead filter. */
  it('withholds a suggestion whose field nothing recorded', async () => {
    const wrapper = render(context({ report: measuredReport(true, ['slope', 'speed']) }))
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find('[data-test="preset-climb-power"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="preset-climb-speed"]').exists()).toBe(true)
  })

  it('creates from a suggestion in one click, naming it from the locale', async () => {
    const ctx = context({ report: measuredReport(true, ['slope', 'speed']) })
    const wrapper = render(ctx)
    await flushPromises()
    await open(wrapper)

    await wrapper.find('[data-test="preset-climb-heart-rate"]').trigger('click')
    await flushPromises()

    const [draft] = (ctx.aggregates.create as unknown as { mock: { calls: [CustomAggregate][] } })
      .mock.calls[0]

    expect(draft.label).toBe('Heart rate on climbs')
    expect(draft.presetId).toBe('climb-heart-rate')
    // A slope is stored as the ratio it is, never as a percentage.
    expect(draft.where[0]).toEqual({ field: 'slope', min: 0.03 })
    expect(ensureIndex).toHaveBeenCalled()
  })

  it('stops offering a suggestion already taken', async () => {
    const wrapper = render(
      context({
        report: measuredReport(true, ['slope', 'speed']),
        aggregates: [aggregate({ presetId: 'climb-heart-rate' })]
      })
    )
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find('[data-test="preset-climb-heart-rate"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="preset-flat-speed"]').exists()).toBe(true)
  })

  it('puts an aggregate on the dashboard with its switch', async () => {
    const ctx = context({ aggregates: [aggregate({ pinned: false })] })
    const wrapper = render(ctx)
    await flushPromises()
    await open(wrapper)

    await wrapper.find('[data-test="pin-agg-1"]').trigger('change')
    await flushPromises()

    expect(ctx.aggregates.update).toHaveBeenCalledWith('agg-1', { pinned: true })
  })

  it('takes it back off with the same switch', async () => {
    const ctx = context({ aggregates: [aggregate({ pinned: true })] })
    const wrapper = render(ctx)
    await flushPromises()
    await open(wrapper)

    await wrapper.find('[data-test="pin-agg-1"]').trigger('change')
    await flushPromises()

    expect(ctx.aggregates.update).toHaveBeenCalledWith('agg-1', { pinned: false })
  })

  /** Reading the rule back, in the reader's units — a slope stored as a ratio. */
  it('describes what an aggregate does without re-storing the description', async () => {
    const wrapper = render(context({ aggregates: [aggregate()] }))
    await flushPromises()
    await open(wrapper)

    const description = wrapper.find('.row__desc').text()
    expect(description).toContain('Average')
    expect(description).toContain('Heart rate')
    expect(description).toContain('2–10 %')
  })

  it('reindexes after a definition is deleted, so its values stop being shown', async () => {
    const ctx = context({ aggregates: [aggregate()] })
    const wrapper = render(ctx)
    await flushPromises()
    await open(wrapper)

    await wrapper.find('[data-test="delete-agg-1"]').trigger('click')
    await flushPromises()

    expect(ctx.aggregates.remove).toHaveBeenCalledWith('agg-1')
    expect(ensureIndex).toHaveBeenCalled()
  })

  it('opens the form only when asked', async () => {
    const wrapper = render(context({ report: measuredReport(true, ['slope', 'speed']) }))
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find('[data-test="aggregate-label"]').exists()).toBe(false)
    await wrapper.find('[data-test="aggregate-new"]').trigger('click')
    expect(wrapper.find('[data-test="aggregate-label"]').exists()).toBe(true)
  })
})
