import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ActivityFiltersPanel from '@/components/ActivityFilters.vue'
import { setUnitSystem } from '@/composables/useUnits'
import type { ActivityFilters } from '@/types/activity'
import en from '@/locales/en.json'

const METERS_PER_FOOT = 0.3048

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const render = (modelValue: ActivityFilters = {}) =>
  mount(ActivityFiltersPanel, {
    props: { modelValue, hasActiveFilters: false },
    global: { plugins: [i18n] }
  })

/** The value carried by the last `update:modelValue` this panel emitted. */
const lastEmit = (wrapper: ReturnType<typeof render>): ActivityFilters => {
  const events = wrapper.emitted('update:modelValue')
  return (events?.[events.length - 1]?.[0] ?? {}) as ActivityFilters
}

const type = async (wrapper: ReturnType<typeof render>, test: string, value: string) => {
  const input = wrapper.find(`[data-test="${test}"]`)
  await input.setValue(value)
}

/**
 * Both ranges are stored in SI and typed in the reader's unit.
 *
 * Ascent used to skip that trip entirely: the panel printed a hardcoded `m` and
 * wrote whatever was typed straight into the filter, so an imperial reader
 * entered feet and filtered on metres.
 */
describe('ActivityFilters — ranges are typed in the reader’s unit', () => {
  describe('metric', () => {
    beforeEach(() => setUnitSystem('metric'))

    it('labels the ascent range in metres', () => {
      expect(render().findAll('.range-unit').at(-1)?.text()).toBe('m')
    })

    it('stores metres as typed', async () => {
      const wrapper = render()
      await type(wrapper, 'ascent-min', '500')
      expect(lastEmit(wrapper).ascentMin).toBeCloseTo(500, 3)
    })
  })

  describe('imperial', () => {
    beforeEach(() => setUnitSystem('imperial'))

    it('labels the ascent range in feet', () => {
      expect(render().findAll('.range-unit').at(-1)?.text()).toBe('ft')
    })

    it('converts feet to metres on the way in', async () => {
      const wrapper = render()
      await type(wrapper, 'ascent-max', '1000')
      expect(lastEmit(wrapper).ascentMax).toBeCloseTo(1000 * METERS_PER_FOOT, 3)
    })

    it('converts metres to feet on the way out', () => {
      const wrapper = render({ ascentMin: 1000 * METERS_PER_FOOT })
      const input = wrapper.find('[data-test="ascent-min"]').element as HTMLInputElement
      expect(Number(input.value)).toBeCloseTo(1000, 1)
    })

    // The distance range already made the trip; this pins it so the two stay
    // symmetrical rather than drifting apart again.
    it('still converts the distance range', async () => {
      const wrapper = render()
      await type(wrapper, 'distance-min', '1')
      expect(lastEmit(wrapper).distanceMin).toBeCloseTo(1609.344, 2)
    })
  })
})
