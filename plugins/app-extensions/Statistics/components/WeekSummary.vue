<template>
  <!-- Three weeks, newest on the right: a swipe to the right goes back in
       time, as a phone's photo roll does. Arrows and dots do the same for a
       mouse, a keyboard or a screen reader. -->
  <section
    class="week"
    data-test="week-summary"
    :aria-label="t('statistics.week.carousel')"
    aria-roledescription="carousel"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <div class="week-nav">
      <span class="eyebrow">{{ pageTitle }} · {{ sportLabel }}</span>
      <div class="arrows">
        <button
          type="button"
          class="arrow"
          :disabled="offset >= PAGES - 1"
          :aria-label="t('statistics.week.older')"
          data-test="week-older"
          @click="go(offset + 1)"
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="arrow"
          :disabled="offset === 0"
          :aria-label="t('statistics.week.newer')"
          data-test="week-newer"
          @click="go(offset - 1)"
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <Transition :name="slide" mode="out-in">
      <div :key="offset" class="page" aria-live="polite">
        <div class="week-head">
          <div class="headline">
            <span v-if="range" class="range">{{ range }}</span>
            <span class="headline-value" data-test="summary-volume">
              {{ headline.value }}<small v-if="headline.unit">{{ headline.unit }}</small>
            </span>
            <span class="compare">{{ compare }}</span>
          </div>

          <dl class="figures">
            <div v-if="kind === 'distance'" class="figure">
              <dt>{{ t('statistics.week.time') }}</dt>
              <dd>{{ formatCompactDuration(summary.current.duration) }}</dd>
            </div>
            <div class="figure">
              <dt>{{ t('statistics.week.sessions') }}</dt>
              <dd>{{ summary.current.count }}</dd>
            </div>
            <div v-if="summary.current.ascent > 0" class="figure">
              <dt>{{ t('statistics.week.ascent') }}</dt>
              <dd>{{ units.format('elevation', summary.current.ascent).text }}</dd>
            </div>
          </dl>
        </div>

        <!-- The shape of the week: which days were trained, and how much. -->
        <ol class="days" :aria-label="t('statistics.week.byDay')">
          <li
            v-for="(day, i) in days"
            :key="i"
            class="day"
            :class="{ today: day.isToday, future: day.isFuture }"
          >
            <span class="day-value">{{ day.label }}</span>
            <span class="day-bar" :style="{ height: day.height }" aria-hidden="true"></span>
            <span class="day-name">{{ weekdayNarrow(i + 1) }}</span>
          </li>
        </ol>
      </div>
    </Transition>

    <div class="foot">
      <p class="totals">
        {{ t('statistics.week.month') }} <strong>{{ monthText }}</strong> ·
        {{ t('statistics.week.year') }} <strong>{{ yearText }}</strong>
      </p>
      <div class="dots">
        <button
          v-for="i in PAGES"
          :key="i"
          type="button"
          class="dot"
          :class="{ active: PAGES - i === offset }"
          :aria-label="pageLabel(PAGES - i)"
          :aria-current="PAGES - i === offset ? 'true' : undefined"
          @click="go(PAGES - i)"
        ></button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { DERIVED, useActivityMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { formatCompactDuration } from '@/utils/duration'
import { appLocale, formatDate, weekdayNarrow } from '@/utils/dateFormat'
import { distanceDimension } from '@/utils/activityMetrics'
import { getSportProfile } from '@/types/sport'
import { formatSportType } from '@/utils/sportLabels'
import type { Activity } from '@/types/activity'
import { weekStart, weekSummary } from '../dashboardData'
import { periodTotals } from '../periodTotals'

const { t } = useI18n()
const { units } = usePluginContext()
const { derived } = useActivityMetricsIndex()

const props = defineProps<{
  /** Already filtered by the page's sport. */
  activities: Activity[]
  /** Empty for all sports. */
  selectedSport: string
}>()

const ascentOf = (id: string) => derived.value.get(id)?.[DERIVED.ascent]

/** This week, last week, the week before: enough to see a block's shape. */
const PAGES = 3
/** Weeks back from this one: 0 is the week under way. */
const offset = ref(0)
const slide = ref('older')

function go(next: number) {
  const clamped = Math.max(0, Math.min(PAGES - 1, next))
  if (clamped === offset.value) return
  slide.value = clamped > offset.value ? 'older' : 'newer'
  offset.value = clamped
}

let touchX = 0
let touchY = 0
function onTouchStart(e: TouchEvent) {
  touchX = e.changedTouches[0].clientX
  touchY = e.changedTouches[0].clientY
}
/** A horizontal swipe of some length; a vertical one is the page scrolling. */
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  go(dx > 0 ? offset.value + 1 : offset.value - 1)
}

/** Monday of the week shown. */
const monday = computed(() => {
  const d = weekStart(new Date())
  d.setDate(d.getDate() - 7 * offset.value)
  return d
})

/**
 * The moment the week is read at. Now for the week under way; for a finished
 * week, its last instant — so it is compared with the whole week before it.
 */
const readAt = computed(() => {
  if (offset.value === 0) return new Date()
  const end = new Date(monday.value)
  end.setDate(end.getDate() + 7)
  return new Date(end.getTime() - 1)
})

const summary = computed(() => weekSummary(props.activities, ascentOf, readAt.value))

function pageLabel(o: number): string {
  if (o === 0) return t('statistics.week.title')
  if (o === 1) return t('statistics.week.lastWeek')
  return t('statistics.week.weeksAgo', { n: o })
}

const pageTitle = computed(() => pageLabel(offset.value))

/** "26 Oct – 1 Nov" for a finished week; the current one needs no dates. */
const range = computed(() => {
  if (offset.value === 0) return ''
  const sunday = new Date(monday.value)
  sunday.setDate(sunday.getDate() + 6)
  const opts = { day: 'numeric', month: 'short' } as const
  return `${formatDate(monday.value.getTime(), opts)} – ${formatDate(sunday.getTime(), opts)}`
})

/**
 * Distance for one sport that moves; time otherwise. A kilometre of swimming
 * and one of cycling are not the same effort, and a gym session has none.
 */
const kind = computed<'distance' | 'duration'>(() =>
  props.selectedSport && getSportProfile(props.selectedSport).primaryMetric !== 'none'
    ? 'distance'
    : 'duration'
)

const dimension = computed(() => distanceDimension(props.selectedSport))

const sportLabel = computed(() =>
  props.selectedSport ? formatSportType(props.selectedSport) : t('statistics.allSports')
)

function number(value: number, decimals: number): string {
  return new Intl.NumberFormat(appLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

/** One SI amount of the headline kind, as text. */
function amount(si: number): string {
  if (kind.value === 'duration') return formatCompactDuration(si)
  const { value, unit } = units.convert(dimension.value, si)
  return `${number(value, dimension.value === 'distance' ? 1 : 0)} ${unit}`
}

const headline = computed(() => {
  const si = summary.value.current[kind.value]
  if (kind.value === 'duration') return { value: formatCompactDuration(si), unit: '' }
  const { value, unit } = units.convert(dimension.value, si)
  return { value: number(value, dimension.value === 'distance' ? 1 : 0), unit }
})

/**
 * The week under way against the week before at the same moment, never
 * against a whole week; a finished week against the whole week before it.
 */
const compare = computed(() => {
  const now = summary.value.current[kind.value]
  const before = summary.value.previousSoFar[kind.value]
  const done = offset.value > 0 ? 'Done' : ''
  if (now === 0 && before === 0) return t(`statistics.week.nothingYet${done}`)
  if (before === 0) return t(`statistics.week.nothingLastWeek${done}`)
  const diff = now - before
  if (Math.abs(diff) < (kind.value === 'duration' ? 60 : 50))
    return t(`statistics.week.same${done}`)
  return diff > 0
    ? t(`statistics.week.more${done}`, { value: amount(diff) })
    : t(`statistics.week.less${done}`, { value: amount(-diff) })
})

const days = computed(() => {
  const values = summary.value.days.map(d => d[kind.value])
  const max = Math.max(...values, 1)
  return summary.value.days.map((d, i) => {
    const v = values[i]
    return {
      // A finished week is read at its last instant: its Sunday is not today.
      isToday: offset.value === 0 && d.isToday,
      isFuture: d.isFuture,
      label: v > 0 ? shortAmount(v) : '',
      height: v > 0 ? `${Math.max((v / max) * 100, 8)}%` : '3px'
    }
  })
})

/** A day's amount without its unit: the strip is too narrow to repeat it. */
function shortAmount(si: number): string {
  if (kind.value === 'duration') return formatCompactDuration(si)
  const { value } = units.convert(dimension.value, si)
  return number(value, dimension.value === 'distance' && value < 100 ? 1 : 0)
}

const monthText = computed(() =>
  amount(periodTotals(props.activities, 'month', () => undefined).current[kind.value])
)
const yearText = computed(() =>
  amount(periodTotals(props.activities, 'year', () => undefined).current[kind.value])
)
</script>

<style scoped>
/* The one dark "ink" block of the page: the figure a reader opens it for. */
.week {
  background: var(--color-ink);
  color: var(--color-white);
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

/* A horizontal swipe changes the week; a vertical one still scrolls the page. */
.week {
  touch-action: pan-y;
}

.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: -0.5rem -0.5rem -0.6rem 0;
}

.arrows {
  display: flex;
}

.arrow {
  width: 2.75rem;
  height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-white);
  cursor: pointer;
}

.arrow:hover:not(:disabled),
.arrow:focus-visible {
  background: color-mix(in srgb, var(--color-white) 10%, transparent);
}

.arrow:disabled {
  color: color-mix(in srgb, var(--color-white) 25%, transparent);
  cursor: default;
}

.page {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.range {
  font-size: 0.85rem;
  color: color-mix(in srgb, var(--color-white) 70%, transparent);
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
}

.dots {
  display: flex;
  gap: 0.15rem;
  margin-right: -0.5rem;
}

/* A 28px target around an 8px dot: small to see, easy to hit. */
.dot {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.dot::before {
  content: '';
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--radius-round);
  background: color-mix(in srgb, var(--color-white) 30%, transparent);
}

.dot.active::before {
  background: var(--color-lime);
}

.older-enter-active,
.older-leave-active,
.newer-enter-active,
.newer-leave-active {
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
}

/* Back in time slides in from the left, like turning back a page. */
.older-enter-from,
.newer-leave-to {
  transform: translateX(-1.5rem);
  opacity: 0;
}

.older-leave-to,
.newer-enter-from {
  transform: translateX(1.5rem);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .older-enter-active,
  .older-leave-active,
  .newer-enter-active,
  .newer-leave-active {
    transition: none;
  }
}

.week-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.2rem 2.5rem;
}

.headline {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.eyebrow {
  font-family: var(--font-condensed);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-lime-soft);
}

.headline-value {
  font-family: var(--font-mono);
  font-size: 3.2rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--color-lime);
}

.headline-value small {
  font-size: 1.1rem;
  font-weight: 500;
  color: color-mix(in srgb, var(--color-white) 80%, transparent);
  margin-left: 0.35rem;
}

.compare {
  font-size: 0.95rem;
  color: color-mix(in srgb, var(--color-white) 82%, transparent);
}

.figures {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
  margin: 0;
}

.figure {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.figure dt {
  font-size: 0.85rem;
  color: color-mix(in srgb, var(--color-white) 70%, transparent);
}

.figure dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.45rem;
  font-weight: 500;
}

.days {
  list-style: none;
  margin: 0;
  padding: 0.9rem 0 0;
  border-top: 1px solid color-mix(in srgb, var(--color-white) 14%, transparent);
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.5rem;
  height: 6.5rem;
}

.day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.3rem;
  min-height: 0;
}

.day-value {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: color-mix(in srgb, var(--color-white) 82%, transparent);
  min-height: 1em;
}

.day-bar {
  width: 70%;
  max-width: 3rem;
  max-height: 3.4rem;
  background: var(--color-lime);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.day:has(.day-value:empty) .day-bar {
  background: color-mix(in srgb, var(--color-white) 16%, transparent);
}

.day.future .day-bar {
  background: transparent;
  border-bottom: 1px dashed color-mix(in srgb, var(--color-white) 25%, transparent);
}

.day-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--color-white) 70%, transparent);
}

.day.today .day-name {
  color: var(--color-lime);
}

.totals {
  margin: 0;
  font-size: 0.9rem;
  color: color-mix(in srgb, var(--color-white) 75%, transparent);
}

.totals strong {
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--color-white);
}

@media (max-width: 640px) {
  .week {
    padding: 1.1rem 1rem;
  }

  .headline-value {
    font-size: 2.6rem;
  }
}
</style>
