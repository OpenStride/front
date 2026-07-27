import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ActivityCard from '@/components/ActivityCard.vue'
import { setUnitSystem } from '@/composables/useUnits'
import en from '@/locales/en.json'

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

const makeActivity = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  version: 1,
  lastModified: 0,
  provider: 'test',
  startTime: 1700000000,
  duration: 3600,
  distance: 10000,
  type: 'running',
  ...over
})

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

  it('omits the accent metric for gym sports', () => {
    const shown = metrics(render({ type: 'yoga', distance: 0, duration: 3600 }))
    // Distance and time only.
    expect(shown).toHaveLength(2)
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
