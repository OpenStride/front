import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import GoalEditForm from '@plugins/app-extensions/Goals/GoalEditForm.vue'
import GoalProgressBar from '@plugins/app-extensions/Goals/GoalProgressBar.vue'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import {
  convertQuantity,
  formatQuantity,
  setUnitSystem,
  toSI,
  unitSystem
} from '@/composables/useUnits'
import en from '@/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const pluginContext = {
  units: {
    get system() {
      return unitSystem.value
    },
    format: formatQuantity,
    convert: convertQuantity,
    toSI
  }
}

// Both components are typed by their own props; the tests build those props as
// plain objects, so the mount helper stays deliberately loose.
type AnyComponent = Parameters<typeof mount>[0]

const mountWith = (component: AnyComponent, props: Record<string, unknown>) =>
  mount(component, {
    props,
    global: { plugins: [i18n], provide: { [PLUGIN_CONTEXT_KEY]: pluginContext } }
  } as never)

const METERS_PER_MILE = 1609.344

describe('Goals — a target is stored in SI, whatever the reader uses', () => {
  beforeEach(() => setUnitSystem('metric'))

  const saveTarget = async (typed: number, system: 'metric' | 'imperial') => {
    setUnitSystem(system)
    const wrapper = mountWith(GoalEditForm, { availableSportTypes: [] })
    await wrapper.find('input[type="number"]').setValue(typed)
    await wrapper.find('.btn-confirm').trigger('click')
    setUnitSystem('metric')
    return wrapper.emitted('save')?.[0]?.[0] as { targetValue: number }
  }

  it('stores metres when the reader typed kilometres', async () => {
    expect((await saveTarget(50, 'metric')).targetValue).toBeCloseTo(50_000, 3)
  })

  it('stores metres when the reader typed miles', async () => {
    // The regression this guards: "50" from an imperial reader used to be
    // written as 50 km — and this config replicates to every other device.
    expect((await saveTarget(50, 'imperial')).targetValue).toBeCloseTo(50 * METERS_PER_MILE, 3)
  })

  it('labels the field with the unit it actually expects', async () => {
    setUnitSystem('imperial')
    const wrapper = mountWith(GoalEditForm, { availableSportTypes: [] })
    expect(wrapper.find('.input-unit').text()).toBe('mi')
    setUnitSystem('metric')
    expect(mountWith(GoalEditForm, { availableSportTypes: [] }).find('.input-unit').text()).toBe(
      'km'
    )
  })

  it('stores seconds when the reader typed hours', async () => {
    const wrapper = mountWith(GoalEditForm, { availableSportTypes: [] })
    await wrapper.findAll('select')[0].setValue('duration')
    await wrapper.find('input[type="number"]').setValue(3)
    await wrapper.find('.btn-confirm').trigger('click')
    const saved = wrapper.emitted('save')?.[0]?.[0] as { targetValue: number }
    expect(saved.targetValue).toBe(10_800)
  })
})

describe('Goals — progress reads back in the reader units', () => {
  beforeEach(() => setUnitSystem('metric'))

  const progress = (targetValue: number, currentValue: number, type = 'distance') => ({
    goal: { id: 'g1', type, period: 'week', targetValue, enabled: true, createdAt: 0 },
    currentValue,
    percentage: (currentValue / targetValue) * 100,
    isComplete: false
  })

  it('shows a 50 km target as km, then as mi, from one stored number', () => {
    const metric = mountWith(GoalProgressBar, { progress: progress(50_000, 20_000) })
    expect(metric.find('.goal-target').text()).toBe('50.0')
    expect(metric.find('.goal-unit').text()).toBe('km')

    setUnitSystem('imperial')
    const imperial = mountWith(GoalProgressBar, { progress: progress(50_000, 20_000) })
    expect(imperial.find('.goal-target').text()).toBe('31.1')
    expect(imperial.find('.goal-unit').text()).toBe('mi')
    setUnitSystem('metric')
  })

  it('leaves the percentage alone — a ratio of SI values has no unit', () => {
    // Both sides convert by the same factor, so progress must not move.
    const metric = mountWith(GoalProgressBar, { progress: progress(50_000, 20_000) })
    setUnitSystem('imperial')
    const imperial = mountWith(GoalProgressBar, { progress: progress(50_000, 20_000) })
    expect(imperial.find('.goal-percentage').text()).toBe(metric.find('.goal-percentage').text())
    setUnitSystem('metric')
  })

  it('shows a duration in hours, which both systems share', () => {
    const wrapper = mountWith(GoalProgressBar, { progress: progress(10_800, 5_400, 'duration') })
    expect(wrapper.find('.goal-target').text()).toBe('3.0')
    expect(wrapper.find('.goal-unit').text()).toBe('h')
  })

  it('shows a count with no unit conversion at all', () => {
    const wrapper = mountWith(GoalProgressBar, { progress: progress(5, 2, 'count') })
    expect(wrapper.find('.goal-target').text()).toBe('5')
  })
})

describe('useUnits — toSI is the exact inverse of convert', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('round-trips every dimension in both systems', () => {
    const dimensions = ['distance', 'distanceShort', 'elevation', 'speed', 'temperature'] as const
    for (const system of ['metric', 'imperial'] as const) {
      setUnitSystem(system)
      for (const dimension of dimensions) {
        const si = 1234.5
        expect(toSI(dimension, convertQuantity(dimension, si).value)).toBeCloseTo(si, 6)
      }
    }
    setUnitSystem('metric')
  })

  it('handles the offset dimension, not just the scaled ones', () => {
    // Fahrenheit is the only one with an offset; a naive inverse drops it.
    setUnitSystem('imperial')
    expect(toSI('temperature', 212)).toBeCloseTo(100, 6)
    expect(toSI('temperature', 32)).toBeCloseTo(0, 6)
    setUnitSystem('metric')
  })
})
