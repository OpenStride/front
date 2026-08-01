import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ActivityFiltersPanel from '@/components/ActivityFilters.vue'
import { setUnitSystem } from '@/composables/useUnits'
import type { ActivityFilters } from '@/types/activity'
import en from '@/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

type Props = { modelValue?: ActivityFilters; hasDistance?: boolean }

const render = ({ modelValue = {}, hasDistance = true }: Props = {}) =>
  mount(ActivityFiltersPanel, {
    props: { modelValue, hasActiveFilters: false, hasDistance },
    global: { plugins: [i18n] }
  })

/** The value carried by the last `update:modelValue` this panel emitted. */
const lastEmit = (wrapper: ReturnType<typeof render>): ActivityFilters => {
  const events = wrapper.emitted('update:modelValue')
  return (events?.[events.length - 1]?.[0] ?? {}) as ActivityFilters
}

const type = (wrapper: ReturnType<typeof render>, test: string, value: string) =>
  wrapper.find(`[data-test="${test}"]`).setValue(value)

const valueOf = (wrapper: ReturnType<typeof render>, test: string) =>
  (wrapper.find(`[data-test="${test}"]`).element as HTMLInputElement).value

describe('ActivityFilters — every range is stored in SI', () => {
  beforeEach(() => setUnitSystem('metric'))

  describe('distance, in the reader’s unit', () => {
    it('converts miles to metres on the way in', async () => {
      setUnitSystem('imperial')
      const wrapper = render()
      await type(wrapper, 'distance-min', '1')
      expect(lastEmit(wrapper).distanceMin).toBeCloseTo(1609.344, 2)
    })

    it('labels the range in the reader’s unit', () => {
      setUnitSystem('imperial')
      expect(render().find('.range-unit').text()).toBe('mi')
    })
  })

  // Time reads the same in both systems, so minutes need the storage
  // conversion and nothing else.
  describe('duration, in minutes', () => {
    it('stores minutes as seconds', async () => {
      const wrapper = render()
      await type(wrapper, 'duration-min', '45')
      expect(lastEmit(wrapper).durationMin).toBe(2700)
    })

    it('reads seconds back as minutes', () => {
      expect(valueOf(render({ modelValue: { durationMax: 5400 } }), 'duration-max')).toBe('90')
    })

    it('stays in minutes for an imperial reader', async () => {
      setUnitSystem('imperial')
      const wrapper = render()
      await type(wrapper, 'duration-min', '45')
      expect(lastEmit(wrapper).durationMin).toBe(2700)
    })
  })

  describe('date, bounded on the local day', () => {
    it('opens the range at the first instant of the day', async () => {
      const wrapper = render()
      await type(wrapper, 'date-from', '2026-03-01')

      const from = new Date(lastEmit(wrapper).dateFrom!)
      expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2026, 2, 1])
      expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([0, 0, 0])
    })

    // An end bound at midnight would keep only the activities logged exactly
    // at midnight, so a single-day range would read as empty.
    it('closes the range at the last instant of the day', async () => {
      const wrapper = render()
      await type(wrapper, 'date-to', '2026-03-01')

      const to = new Date(lastEmit(wrapper).dateTo!)
      expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([23, 59, 59])
    })

    it('reads a stored instant back as its day', () => {
      const at = new Date(2026, 2, 1, 9, 30).getTime()
      expect(valueOf(render({ modelValue: { dateFrom: at } }), 'date-from')).toBe('2026-03-01')
    })
  })

  // A widget shows itself from the data it needs, not from the sport.
  describe('which controls are offered', () => {
    it('offers the distance range when the library holds distances', () => {
      expect(render({ hasDistance: true }).find('[data-test="distance-section"]').exists()).toBe(
        true
      )
    })

    it('drops it for a library of pool lengths and gym sessions', () => {
      const wrapper = render({ hasDistance: false })
      expect(wrapper.find('[data-test="distance-section"]').exists()).toBe(false)
      // The two that mean something everywhere stay.
      expect(wrapper.find('[data-test="duration-min"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="date-from"]').exists()).toBe(true)
    })
  })
})
