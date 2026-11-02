<template>
  <section class="week" data-test="week-summary">
    <div class="week-head">
      <div class="headline">
        <span class="eyebrow">{{ t('statistics.week.title') }} · {{ sportLabel }}</span>
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

    <p class="totals">
      {{ t('statistics.week.month') }} <strong>{{ monthText }}</strong> ·
      {{ t('statistics.week.year') }} <strong>{{ yearText }}</strong>
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { DERIVED, useActivityMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { formatCompactDuration } from '@/utils/duration'
import { appLocale, weekdayNarrow } from '@/utils/dateFormat'
import { distanceDimension } from '@/utils/activityMetrics'
import { getSportProfile } from '@/types/sport'
import { formatSportType } from '@/utils/sportLabels'
import type { Activity } from '@/types/activity'
import { weekSummary } from '../dashboardData'
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

const summary = computed(() => weekSummary(props.activities, ascentOf))

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

/** Against the week before at the same moment, never against a whole week. */
const compare = computed(() => {
  const now = summary.value.current[kind.value]
  const before = summary.value.previousSoFar[kind.value]
  if (now === 0 && before === 0) return t('statistics.week.nothingYet')
  if (before === 0) return t('statistics.week.nothingLastWeek')
  const diff = now - before
  if (Math.abs(diff) < (kind.value === 'duration' ? 60 : 50)) return t('statistics.week.same')
  return diff > 0
    ? t('statistics.week.more', { value: amount(diff) })
    : t('statistics.week.less', { value: amount(-diff) })
})

const days = computed(() => {
  const values = summary.value.days.map(d => d[kind.value])
  const max = Math.max(...values, 1)
  return summary.value.days.map((d, i) => {
    const v = values[i]
    return {
      isToday: d.isToday,
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
  color: rgba(255, 255, 255, 0.8);
  margin-left: 0.35rem;
}

.compare {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.82);
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
  color: rgba(255, 255, 255, 0.7);
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
  border-top: 1px solid rgba(255, 255, 255, 0.14);
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
  color: rgba(255, 255, 255, 0.82);
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
  background: rgba(255, 255, 255, 0.16);
}

.day.future .day-bar {
  background: transparent;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.25);
}

.day-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.day.today .day-name {
  color: var(--color-lime);
}

.totals {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.75);
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
