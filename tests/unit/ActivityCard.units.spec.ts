import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ActivityCard from '@/components/ActivityCard.vue'
import { setUnitSystem } from '@/composables/useUnits'
import { DERIVED, useActivityMetricsIndex } from '@/composables/useActivityMetricsIndex'
import en from '@/locales/en.json'
import { createActivity } from '../fixtures/activities'

// The card pulls in interactions and Leaflet; neither is under test here.
vi.mock('@/components/MapPreview.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/InteractionBar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/services/InteractionService', () => ({
  getInteractionService: () => ({
    getMyUserId: async () => null,
    getCounts: async () => ({})
  })
}))
vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: { getInstance: async () => ({ getData: async () => null }) }
}))
vi.mock('@/router', () => ({ default: { push: vi.fn() } }))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

// Shared fixture, so a change to the canonical shape reaches this file too.
// Overridden to no route by default: the hero is asserted explicitly below.
const makeActivity = (over: Record<string, unknown> = {}) =>
  createActivity({ mapPolyline: [], ...over })

const render = (over: Record<string, unknown> = {}) =>
  mount(ActivityCard, {
    props: { activity: makeActivity(over) },
    global: { plugins: [i18n] }
  })

const metrics = (w: ReturnType<typeof render>) => w.findAll('.acard__metric').map(el => el.text())

describe('ActivityCard — sport profile drives the metrics', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('shows a run in kilometres with a pace per km', () => {
    const text = metrics(render({ type: 'running', distance: 10000, duration: 3000 })).join(' | ')
    expect(text).toContain('10.00')
    expect(text).toContain('km')
    expect(text).toContain("5'00")
    expect(text).toContain('/km')
  })

  it('shows a ride in km/h rather than a pace', () => {
    const text = metrics(render({ type: 'cycling', distance: 30000, duration: 3600 })).join(' | ')
    expect(text).toContain('30.0')
    expect(text).toContain('km/h')
    expect(text).not.toContain('/km ')
  })

  it('shows a pool swim in metres with a pace per 100 m', () => {
    // The regression that motivated this: 1500 m used to read "1.50 km" at min/km.
    const text = metrics(render({ type: 'pool_swimming', distance: 1500, duration: 1800 })).join(
      ' | '
    )
    expect(text).toContain('1500')
    expect(text).toContain('m')
    expect(text).toContain("2'00")
    expect(text).toContain('/100 m')
    expect(text).not.toContain('1.50')
  })

  it('shows a gym session as time alone', () => {
    // No pace to speak of, and "0.00 km" is noise rather than information.
    const shown = metrics(render({ type: 'yoga', distance: 0, duration: 3600 }))
    expect(shown).toHaveLength(1)
    expect(shown[0]).toContain('1:00:00')
  })

  it('keeps the distance when a gym sport actually covered ground', () => {
    // A rowing machine session has a distance even though it is indoors.
    const shown = metrics(render({ type: 'rowing_machine', distance: 5000, duration: 1200 }))
    expect(shown.join(' ')).toContain('5.00')
  })
})

describe('ActivityCard — unit preference', () => {
  it('switches a run to miles and min/mi', () => {
    setUnitSystem('imperial')
    const text = metrics(render({ type: 'running', distance: 1609.344, duration: 300 })).join(' | ')
    expect(text).toContain('1.00')
    expect(text).toContain('mi')
    expect(text).toContain("5'00")
    setUnitSystem('metric')
  })

  it('switches a pool swim to yards', () => {
    setUnitSystem('imperial')
    const text = metrics(render({ type: 'pool_swimming', distance: 914.4, duration: 600 })).join(
      ' | '
    )
    expect(text).toContain('1000')
    expect(text).toContain('yd')
    expect(text).toContain('/100 yd')
    setUnitSystem('metric')
  })

  it('re-renders a mounted card when the preference changes', async () => {
    setUnitSystem('metric')
    const wrapper = render({ type: 'running', distance: 5000, duration: 1500 })
    expect(metrics(wrapper).join(' ')).toContain('5.00')

    setUnitSystem('imperial')
    await wrapper.vm.$nextTick()

    // No remount: the shared reactive source is what makes this work.
    expect(metrics(wrapper).join(' ')).toContain('mi')
    setUnitSystem('metric')
  })
})

describe('ActivityCard — degenerate data', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('does not print Infinity when an activity has no distance', () => {
    const text = metrics(render({ type: 'running', distance: 0, duration: 1800 })).join(' | ')
    expect(text).not.toMatch(/Infinity|NaN/)
    expect(text).toContain('—')
  })
})

describe('ActivityCard — values the scan lifted out of the details', () => {
  const { derived } = useActivityMetricsIndex()

  beforeEach(() => {
    setUnitSystem('metric')
    derived.value = new Map()
  })

  const scanned = (values: Record<string, number>) => {
    derived.value = new Map([['activity-1', values]])
  }

  it('headlines the calories of a session that has no pace', () => {
    // The card only holds an Activity, so before the scan this slot was empty.
    scanned({ [DERIVED.calories]: 410 })
    const text = metrics(render({ type: 'strength_training', distance: 0, duration: 3300 })).join(
      ' | '
    )
    expect(text).toContain('410')
    expect(text).toMatch(/Calories/i)
  })

  it('leaves the slot empty until the scan has reached the activity', () => {
    const shown = metrics(render({ type: 'strength_training', distance: 0, duration: 3300 }))
    expect(shown).toHaveLength(1) // time alone
    expect(shown.join(' ')).not.toMatch(/Calories/i)
  })

  it('headlines the climb of a hike, as the detail page already did', () => {
    scanned({ [DERIVED.ascent]: 870 })
    const text = metrics(render({ type: 'hiking', distance: 12000, duration: 14400 })).join(' | ')
    expect(text).toMatch(/Elevation/i)
    expect(text).toContain('870')
  })

  it('falls back to a pace for a hike the scan has not reached', () => {
    const text = metrics(render({ type: 'hiking', distance: 12000, duration: 14400 })).join(' | ')
    expect(text).toMatch(/\/km/)
  })

  it('converts the lifted values like any other', () => {
    // They are cached in SI precisely so the preference still applies.
    setUnitSystem('imperial')
    scanned({ [DERIVED.ascent]: 304.8 })
    const text = metrics(render({ type: 'hiking', distance: 12000, duration: 14400 })).join(' | ')
    expect(text).toContain('1000')
    expect(text).toContain('ft')
    setUnitSystem('metric')
  })

  it('does not headline calories for a sport that has a pace', () => {
    // A run's accent slot belongs to its pace; the calories are detail-page work.
    scanned({ [DERIVED.calories]: 600 })
    const text = metrics(render({ type: 'running', distance: 10000, duration: 3000 })).join(' | ')
    expect(text).toContain("5'00")
    expect(text).not.toContain('600')
  })
})

describe('ActivityCard — the hero only appears when there is a route', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('drops the map block entirely for an activity with no GPS', () => {
    // A pool swim used to reserve 186px of flat grey.
    const wrapper = render({ type: 'pool_swimming', distance: 1500, duration: 1800 })
    expect(wrapper.find('.acard__hero').exists()).toBe(false)
    // The date has to survive the hero it used to live in.
    expect(wrapper.find('.acard__meta').exists()).toBe(true)
  })

  it('keeps the hero when there is a route', () => {
    const wrapper = render({
      type: 'running',
      mapPolyline: [
        [48.85, 2.35],
        [48.86, 2.36]
      ]
    })
    expect(wrapper.find('.acard__hero').exists()).toBe(true)
    expect(wrapper.find('.acard__datechip').exists()).toBe(true)
    // No duplicate date once the hero carries it.
    expect(wrapper.find('.acard__meta').exists()).toBe(false)
  })

  it('still shows a pace for a legacy uppercase type', () => {
    const text = metrics(render({ type: 'RUNNING', distance: 10000, duration: 3000 })).join(' ')
    expect(text).toContain("5'00")
  })
})
