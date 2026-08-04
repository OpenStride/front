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

describe('CustomAggregatesSection', () => {
  beforeEach(() => {
    setUnitSystem('metric')
    ensureIndex.mockClear()
    push.mockClear()
    indexing.value = false
    progress.value = 0
  })

  it('says what it is for when nothing has been defined', async () => {
    const wrapper = render(context())
    await flushPromises()

    expect(wrapper.find('[data-test="custom-aggregates"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nothing followed yet')
    expect(wrapper.find('[data-test="aggregate-new"]').exists()).toBe(true)
  })

  /**
   * One card per aggregate, figure included. The figure and the rule behind it
   * used to live in two separate blocks, so a pinned aggregate appeared twice
   * on the same page with nothing saying it was the same thing.
   */
  it('gives every aggregate one card carrying its figure of the current period', async () => {
    const wrapper = render(context({ aggregates: [aggregate({ pinned: false })] }))
    await flushPromises()

    const cards = wrapper.findAll('[data-test="aggregate-cards"] .agg')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('Climb heart rate')
    expect(cards[0].find('.agg__value').text()).toContain('152')
  })

  it('says so plainly on a card with no figure yet', async () => {
    const ctx = context({ aggregates: [aggregate()] })
    ;(ctx.aggregation.getAggregated as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue([])

    const wrapper = render(ctx)
    await flushPromises()

    expect(wrapper.find('.agg__value').text()).toContain('No data')
  })

  it('puts the pinned ones first, since pinning now decides rank rather than presence', async () => {
    const wrapper = render(
      context({
        aggregates: [
          aggregate({ id: 'plain', label: 'AAA plain', pinned: false }),
          aggregate({ id: 'pin', label: 'ZZZ pinned', pinned: true })
        ]
      })
    )
    await flushPromises()

    const labels = wrapper.findAll('.agg__label').map(el => el.text())
    expect(labels).toEqual(['ZZZ pinned', 'AAA plain'])
  })

  /** Reading the rule back, in the reader's units — a slope stored as a ratio. */
  it('describes what an aggregate does without re-storing the description', async () => {
    const wrapper = render(context({ aggregates: [aggregate()] }))
    await flushPromises()

    const description = wrapper.find('.agg__desc').text()
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

    await wrapper.find('.agg__actions .btn-icon:last-child').trigger('click')
    await flushPromises()

    expect(ctx.aggregates.remove).toHaveBeenCalledWith('agg-1')
    expect(ensureIndex).toHaveBeenCalled()
  })
})

describe('CustomAggregatesSection — suggestions', () => {
  beforeEach(() => {
    setUnitSystem('metric')
    ensureIndex.mockClear()
    push.mockClear()
    indexing.value = false
  })

  /**
   * The point of the suggestions: the form asks eight questions before it
   * produces anything, which is a lot to answer before knowing what the answers
   * are worth.
   */
  it('offers ready-made aggregates the data supports', async () => {
    const wrapper = render(context({ report: measuredReport(true, ['slope', 'speed']) }))
    await flushPromises()

    const presets = wrapper.find('[data-test="aggregate-presets"]')
    expect(presets.exists()).toBe(true)
    expect(presets.text()).toContain('Heart rate on climbs')
    expect(presets.text()).toContain('Speed on the flat')
  })

  /** Suggesting a power aggregate to a bike with no meter builds a dead filter. */
  it('withholds a suggestion whose field nothing recorded', async () => {
    const wrapper = render(context({ report: measuredReport(true, ['slope', 'speed']) }))
    await flushPromises()

    expect(wrapper.find('[data-test="preset-climb-power"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="preset-climb-speed"]').exists()).toBe(true)
  })

  it('shows nothing at all when the data supports no suggestion', async () => {
    const wrapper = render(context({ report: measuredReport(true) }))
    await flushPromises()

    expect(wrapper.find('[data-test="aggregate-presets"]').exists()).toBe(false)
  })

  it('creates from a suggestion in one click, naming it from the locale', async () => {
    const ctx = context({ report: measuredReport(true, ['slope', 'speed']) })
    const wrapper = render(ctx)
    await flushPromises()

    await wrapper.find('[data-test="preset-climb-heart-rate"]').trigger('click')
    await flushPromises()

    expect(ctx.aggregates.create).toHaveBeenCalledTimes(1)
    const [draft] = (ctx.aggregates.create as unknown as { mock: { calls: [CustomAggregate][] } })
      .mock.calls[0]

    expect(draft.label).toBe('Heart rate on climbs')
    expect(draft.presetId).toBe('climb-heart-rate')
    expect(draft.measure).toEqual({ field: 'heartRate', op: 'avg' })
    // A slope is stored as the ratio it is, never as a percentage.
    expect(draft.where[0]).toEqual({ field: 'slope', min: 0.03 })
    expect(ensureIndex).toHaveBeenCalled()
  })

  /** Offering it twice would create a duplicate computing exactly the same thing. */
  it('stops offering a suggestion already taken', async () => {
    const wrapper = render(
      context({
        report: measuredReport(true, ['slope', 'speed']),
        aggregates: [aggregate({ presetId: 'climb-heart-rate' })]
      })
    )
    await flushPromises()

    expect(wrapper.find('[data-test="preset-climb-heart-rate"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="preset-flat-speed"]').exists()).toBe(true)
  })

  it('hands an aggregate to the tracker, which owns the chart and its windows', async () => {
    const wrapper = render(context({ aggregates: [aggregate()] }))
    await flushPromises()

    await wrapper.find('[data-test="aggregate-curve-agg-1"]').trigger('click')

    expect(push).toHaveBeenCalledWith({ path: '/metrics', query: { metric: 'agg-1' } })
  })

  it('carries the sport filter into the curve', async () => {
    const wrapper = render(context({ aggregates: [aggregate()] }), { selectedSport: 'running' })
    await flushPromises()

    await wrapper.find('[data-test="aggregate-curve-agg-1"]').trigger('click')

    expect(push).toHaveBeenCalledWith({
      path: '/metrics',
      query: { metric: 'agg-1', sport: 'running' }
    })
  })
})
