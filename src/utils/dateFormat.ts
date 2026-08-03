/**
 * Dates and elapsed times, in the language the user chose.
 *
 * The app has a language preference and three different things were reading
 * dates without it: `toLocaleDateString('fr-FR', …)` on the comment list, which
 * dated an English reader's comments in French; `toLocaleDateString(undefined,
 * …)` on the activity cards, which follows the *browser* rather than the
 * preference, so switching the app to French left the weekday in English; and a
 * hand-written French month table in the calendar heatmap.
 *
 * The relative time ("5 min ago") existed twice on top of that — once through
 * the `time.*` keys, once hardcoded in French — with the two disagreeing on
 * what to do past a week.
 */
import { i18n } from '@/locales'

/** Milliseconds. */
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** The language the app is displaying, as an Intl locale tag. */
export function appLocale(): string {
  return i18n.global.locale.value
}

/** A date in the user's language: `formatDate(ms, { day: 'numeric', month: 'short' })`. */
export function formatDate(timestamp: number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(timestamp).toLocaleDateString(appLocale(), options)
}

/** Abbreviated weekday for a compact chip: "Wed", "mer.". */
export function formatWeekday(timestamp: number): string {
  return formatDate(timestamp, { weekday: 'short' })
}

/** Abbreviated month name for an axis label. `month` is 0-based, like `Date`. */
export function monthShort(month: number): string {
  // Any year works — only the month is read. 2021 is not a leap year, so day 1
  // of every month exists without a special case.
  return formatDate(Date.UTC(2021, month, 1), { month: 'short', timeZone: 'UTC' })
}

/**
 * How long ago, in words: "just now", "12 min ago", "3h ago", "2d ago".
 *
 * Past a week the count stops being readable — "412d ago" is a number, not an
 * answer — so it falls back to the date itself.
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const t = i18n.global.t
  const diff = Math.max(0, now - timestamp)

  if (diff < MINUTE) return t('time.justNow')
  if (diff < HOUR) return t('time.minutesAgo', { count: Math.floor(diff / MINUTE) })
  if (diff < DAY) return t('time.hoursAgo', { count: Math.floor(diff / HOUR) })
  if (diff < WEEK) return t('time.daysAgo', { count: Math.floor(diff / DAY) })

  return formatDate(timestamp, { day: 'numeric', month: 'short' })
}
