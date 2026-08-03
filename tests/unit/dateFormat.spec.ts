import { describe, it, expect, afterEach } from 'vitest'
import i18n from '@/locales'
import { appLocale, formatDate, formatRelativeTime, monthShort } from '@/utils/dateFormat'

/**
 * The point of the helper: a date follows the language the user picked, not the
 * one whoever wrote the component happened to speak.
 */
const setLocale = (locale: 'en' | 'fr') => {
  i18n.global.locale.value = locale
}

afterEach(() => setLocale('en'))

const JUNE_15 = Date.UTC(2024, 5, 15, 12)

describe('appLocale', () => {
  it('follows the app preference', () => {
    setLocale('fr')
    expect(appLocale()).toBe('fr')
    setLocale('en')
    expect(appLocale()).toBe('en')
  })
})

describe('formatDate', () => {
  it('writes the month in the app language, not the browser one', () => {
    setLocale('en')
    const en = formatDate(JUNE_15, { month: 'long', timeZone: 'UTC' })
    setLocale('fr')
    const fr = formatDate(JUNE_15, { month: 'long', timeZone: 'UTC' })

    expect(en.toLowerCase()).toContain('june')
    expect(fr.toLowerCase()).toContain('juin')
  })
})

describe('monthShort', () => {
  it('answers for every month, in the app language', () => {
    setLocale('fr')
    const months = Array.from({ length: 12 }, (_, i) => monthShort(i))
    expect(months).toHaveLength(12)
    expect(new Set(months).size).toBe(12)
    // The heatmap used to carry "Fev"/"Aou" by hand; French spells them with
    // the accents Intl provides.
    expect(months[1].toLowerCase()).toContain('év')
  })
})

describe('formatRelativeTime', () => {
  const NOW = Date.UTC(2024, 5, 15, 12)
  const ago = (ms: number) => formatRelativeTime(NOW - ms, NOW)

  it('counts in the largest unit that still reads as a count', () => {
    expect(ago(10_000)).toBe('just now')
    expect(ago(12 * 60_000)).toContain('12')
    expect(ago(3 * 3_600_000)).toContain('3')
    expect(ago(2 * 86_400_000)).toContain('2')
  })

  it('falls back to the date once a count stops being an answer', () => {
    // "412d ago" is a number, not a date. Past a week, show the day itself.
    const label = ago(400 * 86_400_000)
    expect(label).not.toMatch(/ago/)
    expect(label).toMatch(/\d/)
  })

  it('reads in the app language', () => {
    setLocale('fr')
    expect(ago(10_000)).not.toBe('just now')
  })

  it('does not run backwards on a clock skew', () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe('just now')
  })
})
