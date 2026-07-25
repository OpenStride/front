import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import RecordPeriodFilter from '@plugins/app-extensions/Statistics/components/RecordPeriodFilter.vue'
import {
  getRecordPeriodRange,
  RECORD_PERIODS,
  type RecordPeriod
} from '../../../plugins/app-extensions/Statistics/types'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, fr }
})

// 2026-07-25, a Saturday in Q3
const NOW = new Date(2026, 6, 25, 14, 30)

function localeRecords(locale: unknown) {
  return (locale as { statistics: { records: Record<string, unknown> } }).statistics.records
}

describe('getRecordPeriodRange', () => {
  it('returns an open range for all-time', () => {
    const range = getRecordPeriodRange('all', NOW)
    expect(range).toEqual({ key: 'all', start: null, end: null })
  })

  it('bounds the current calendar month', () => {
    const range = getRecordPeriodRange('month', NOW)
    expect(range.key).toBe('2026-07')
    expect(range.start).toBe(new Date(2026, 6, 1).getTime())
    expect(range.end).toBe(new Date(2026, 7, 1).getTime())
  })

  it('bounds the current calendar quarter', () => {
    const range = getRecordPeriodRange('quarter', NOW)
    expect(range.key).toBe('2026-Q3')
    expect(range.start).toBe(new Date(2026, 6, 1).getTime())
    expect(range.end).toBe(new Date(2026, 9, 1).getTime())
  })

  it('bounds the current calendar year', () => {
    const range = getRecordPeriodRange('year', NOW)
    expect(range.key).toBe('2026')
    expect(range.start).toBe(new Date(2026, 0, 1).getTime())
    expect(range.end).toBe(new Date(2027, 0, 1).getTime())
  })

  it('rolls the quarter over at a quarter boundary', () => {
    expect(getRecordPeriodRange('quarter', new Date(2026, 2, 31)).key).toBe('2026-Q1')
    expect(getRecordPeriodRange('quarter', new Date(2026, 3, 1)).key).toBe('2026-Q2')
  })

  it('rolls the month over at a year boundary', () => {
    const december = getRecordPeriodRange('month', new Date(2026, 11, 15))
    expect(december.key).toBe('2026-12')
    expect(december.end).toBe(new Date(2027, 0, 1).getTime())
  })

  it('produces a distinct cache key per period instance', () => {
    const keys = RECORD_PERIODS.map(p => getRecordPeriodRange(p, NOW).key)
    expect(new Set(keys).size).toBe(RECORD_PERIODS.length)
  })

  it('produces contiguous, non-overlapping monthly ranges', () => {
    for (let month = 0; month < 11; month++) {
      const current = getRecordPeriodRange('month', new Date(2026, month, 10))
      const next = getRecordPeriodRange('month', new Date(2026, month + 1, 10))
      expect(current.start! < current.end!).toBe(true)
      expect(current.end).toBe(next.start)
    }
  })

  it('nests each month inside its quarter and year', () => {
    const month = getRecordPeriodRange('month', NOW)
    const quarter = getRecordPeriodRange('quarter', NOW)
    const year = getRecordPeriodRange('year', NOW)
    expect(month.start! >= quarter.start!).toBe(true)
    expect(month.end! <= quarter.end!).toBe(true)
    expect(quarter.start! >= year.start!).toBe(true)
    expect(quarter.end! <= year.end!).toBe(true)
  })
})

describe('RecordPeriodFilter.vue', () => {
  function mountFilter(modelValue: RecordPeriod = 'all') {
    return mount(RecordPeriodFilter, {
      props: { modelValue },
      global: { plugins: [i18n] }
    })
  }

  it('renders one button per period with its translated label', () => {
    const wrapper = mountFilter()
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(RECORD_PERIODS.length)
    expect(buttons.map(b => b.text())).toEqual([
      'All time',
      'This month',
      'This quarter',
      'This year'
    ])
  })

  it('marks only the selected period as active and pressed', async () => {
    const wrapper = mountFilter('quarter')
    const active = wrapper.findAll('button.active')
    expect(active).toHaveLength(1)
    expect(active[0].text()).toBe('This quarter')
    expect(wrapper.get('[data-test="record-period-quarter"]').attributes('aria-pressed')).toBe(
      'true'
    )
    expect(wrapper.get('[data-test="record-period-all"]').attributes('aria-pressed')).toBe('false')
  })

  it('emits the clicked period', async () => {
    const wrapper = mountFilter()
    await wrapper.get('[data-test="record-period-month"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['month']])
  })
})

describe('record period i18n', () => {
  it('has a label for every period in every locale', () => {
    for (const locale of [en, fr]) {
      const records = localeRecords(locale)
      const period = records.period as Record<RecordPeriod, string>
      for (const p of RECORD_PERIODS) {
        expect(period[p], `missing label for "${p}"`).toBeTruthy()
      }
      expect(records.periodLabel).toBeTruthy()
      expect(records.noRecordsPeriodHint).toBeTruthy()
    }
  })
})
