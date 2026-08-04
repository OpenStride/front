import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AggregateEditForm from '@plugins/app-extensions/Statistics/components/AggregateEditForm.vue'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import { convertQuantity, setUnitSystem, toSI } from '@/composables/useUnits'
import type { CapabilityReport } from '@/composables/useSampleCapabilities'
import type { PluginContext } from '@/types/plugin-context'
import en from '@/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

/** Only the slice of the context this form touches. */
const context = {
  units: {
    get system() {
      return 'metric' as const
    },
    format: () => ({ value: '', unit: '', text: '' }),
    convert: convertQuantity,
    toSI
  }
} as unknown as PluginContext

function report(overrides: Partial<CapabilityReport> = {}): CapabilityReport {
  return {
    activityCount: 10,
    sports: ['running'],
    fields: [
      {
        field: 'speed',
        labelKey: 'sampleFields.speed',
        dimension: 'speed',
        availability: 'measured',
        activityCount: 8,
        activityRatio: 0.8,
        sampleCount: 4000,
        min: 1,
        max: 6,
        mean: 3,
        p05: 2,
        p50: 3,
        p95: 4.5
      },
      {
        field: 'slope',
        labelKey: 'sampleFields.slope',
        availability: 'measured',
        activityCount: 6,
        activityRatio: 0.6,
        sampleCount: 3000,
        min: -0.2,
        max: 0.2,
        mean: 0.01,
        p05: -0.08,
        p50: 0,
        p95: 0.09
      },
      {
        field: 'power',
        labelKey: 'sampleFields.power',
        availability: 'absent',
        activityCount: 0,
        activityRatio: 0,
        sampleCount: 0
      }
    ],
    ...overrides
  }
}

const render = (props: Record<string, unknown> = {}) =>
  mount(AggregateEditForm, {
    props: { report: report(), ...props },
    global: { plugins: [i18n], provide: { [PLUGIN_CONTEXT_KEY]: context } }
  })

async function fill(wrapper: ReturnType<typeof render>, label: string) {
  await wrapper.find('[data-test="aggregate-label"]').setValue(label)
}

describe('AggregateEditForm', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('offers only the fields the library actually measured', () => {
    const options = render()
      .findAll('select')[1]
      .findAll('option')
      .map(o => o.text())

    expect(options.join(' ')).toContain('Speed')
    expect(options.join(' ')).toContain('Slope')
    // Present in the report, but nothing recorded it.
    expect(options.join(' ')).not.toContain('Power')
  })

  it('says how much of the library carries each field', () => {
    const text = render().findAll('select')[1].text()

    expect(text).toContain('80% of outings')
  })

  it('refuses to save without a name', async () => {
    const wrapper = render()
    expect(wrapper.find('[data-test="aggregate-save"]').attributes('disabled')).toBeDefined()

    await fill(wrapper, 'Climb pace')
    expect(wrapper.find('[data-test="aggregate-save"]').attributes('disabled')).toBeUndefined()
  })

  /**
   * The point of the whole units layer. A bound typed as "18" means 18 km/h to
   * this reader; what has to reach storage is 5 m/s.
   */
  it('converts a typed bound from the reader units into SI', async () => {
    const wrapper = render()
    await fill(wrapper, 'Fast bits')

    await wrapper.find('button.btn-secondary').trigger('click')
    const inputs = wrapper.find('.filter-row').findAll('input')
    await inputs[0].setValue(18)
    await inputs[1].setValue(36)
    await wrapper.find('form').trigger('submit')

    const [draft] = wrapper.emitted('save')![0] as [{ where: Array<{ min: number; max: number }> }]

    expect(draft.where[0].min).toBeCloseTo(5, 6)
    expect(draft.where[0].max).toBeCloseTo(10, 6)
  })

  /** A slope is typed as a percentage and stored as the ratio it is. */
  it('stores a slope band as a ratio, not as the percentage it was typed in', async () => {
    const wrapper = render()
    await fill(wrapper, 'Climbs')

    await wrapper.find('button.btn-secondary').trigger('click')
    const row = wrapper.find('.filter-row')
    await row.find('select').setValue('slope')
    const inputs = row.findAll('input')
    await inputs[0].setValue(2)
    await inputs[1].setValue(10)
    await wrapper.find('form').trigger('submit')

    const [draft] = wrapper.emitted('save')![0] as [
      { where: Array<{ field: string; min: number; max: number }> }
    ]

    expect(draft.where[0].field).toBe('slope')
    expect(draft.where[0].min).toBeCloseTo(0.02, 6)
    expect(draft.where[0].max).toBeCloseTo(0.1, 6)
  })

  it('prefills a new condition with the band the data occupies', async () => {
    const wrapper = render()
    await fill(wrapper, 'Anything')
    await wrapper.find('button.btn-secondary').trigger('click')

    const inputs = wrapper.find('.filter-row').findAll('input')

    // p05 = 2 m/s and p95 = 4.5 m/s, read in km/h — and rounded, because a
    // suggested band reading 16.2 would claim a precision it does not have.
    expect(Number((inputs[0].element as HTMLInputElement).value)).toBeCloseTo(7.2, 1)
    expect(Number((inputs[1].element as HTMLInputElement).value)).toBe(16)
  })

  it('drops a condition with neither bound rather than storing a filter that matches all', async () => {
    const wrapper = render()
    await fill(wrapper, 'Empty band')
    await wrapper.find('button.btn-secondary').trigger('click')

    const inputs = wrapper.find('.filter-row').findAll('input')
    await inputs[0].setValue('')
    await inputs[1].setValue('')
    await wrapper.find('form').trigger('submit')

    const [draft] = wrapper.emitted('save')![0] as [{ where: unknown[] }]
    expect(draft.where).toEqual([])
  })

  it('reads an existing definition back in the reader units', () => {
    const wrapper = render({
      existing: {
        id: 'a',
        version: 1,
        lastModified: 0,
        label: 'Climb pace',
        enabled: true,
        where: [{ field: 'slope', min: 0.02, max: 0.1 }],
        measure: { field: 'speed', op: 'avg' },
        weightBy: 'time',
        periodOp: 'avg'
      }
    })

    const inputs = wrapper.find('.filter-row').findAll('input')

    expect((wrapper.find('[data-test="aggregate-label"]').element as HTMLInputElement).value).toBe(
      'Climb pace'
    )
    expect(Number((inputs[0].element as HTMLInputElement).value)).toBeCloseTo(2, 6)
    expect(Number((inputs[1].element as HTMLInputElement).value)).toBeCloseTo(10, 6)
  })

  it('says so rather than offering an empty picker when nothing was measured', () => {
    const wrapper = render({
      report: report({ fields: report().fields.map(f => ({ ...f, availability: 'absent' })) })
    })

    expect(wrapper.text()).toContain('carry no measurement yet')
    expect(wrapper.find('[data-test="aggregate-save"]').attributes('disabled')).toBeDefined()
  })

  it('emits nothing when cancelled', async () => {
    const wrapper = render()
    await wrapper
      .findAll('button')
      .find(b => b.text().includes('Cancel'))!
      .trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
  })
})
