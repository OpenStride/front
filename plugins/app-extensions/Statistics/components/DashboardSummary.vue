<template>
  <section class="kpi-band">
    <div class="band-head">
      <h3 class="band-title">
        <i class="fas fa-gauge-high" aria-hidden="true"></i>
        {{ t('statistics.dashboard.title') }}
      </h3>
      <div class="period-toggle" role="tablist" :aria-label="t('statistics.summary.periodLabel')">
        <button
          v-for="p in PERIODS"
          :key="p"
          role="tab"
          :aria-selected="p === period"
          :class="['toggle-btn', { active: p === period }]"
          @click="period = p"
        >
          {{ t(`statistics.summary.periods.${p}`) }}
        </button>
      </div>
    </div>

    <div class="tiles">
      <!-- The one dark "ink" block: the headline figure. -->
      <div class="hero">
        <span class="hero-label">{{ t('statistics.dashboard.volume') }}</span>
        <span class="hero-value">
          {{ distance.value }}<small>{{ distance.unit }}</small>
        </span>
        <span v-if="distanceDelta" class="delta" :class="distanceDelta.dir">
          <i :class="distanceDelta.icon" aria-hidden="true"></i>
          {{ distanceDelta.text }}
          <span class="delta-note">{{ t('statistics.dashboard.vsPrevious') }}</span>
        </span>
      </div>

      <div class="tile">
        <span class="tile-label">{{ t('statistics.summary.metrics.duration') }}</span>
        <span class="tile-value">{{ duration }}</span>
        <span v-if="durationDelta" class="delta" :class="durationDelta.dir">
          <i :class="durationDelta.icon" aria-hidden="true"></i>
          {{ durationDelta.text }}
        </span>
      </div>

      <div class="tile">
        <span class="tile-label">{{ t('statistics.summary.metrics.totalAscent') }}</span>
        <span class="tile-value"
          >{{ ascent.value }}<small>{{ ascent.unit }}</small></span
        >
      </div>

      <div class="tile">
        <span class="tile-label">{{ t('statistics.dashboard.records') }}</span>
        <span class="tile-value">{{ recordCount }}</span>
        <span class="tile-foot">{{ t('statistics.dashboard.recordsFoot') }}</span>
      </div>
    </div>

    <!-- Said only when it needs saying: the aggregate has no sport axis, so with
         a sport selected the totals are the one block that ignores the filter. -->
    <p v-if="selectedSport" class="band-caption">
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {{ t('statistics.summary.allSports') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, toRef, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatCompactDuration } from '@/utils/duration'
import type { Activity } from '@/types/activity'
import { useSummaryTotals } from '../composables/useSummaryTotals'
import { usePersonalRecords } from '../composables/usePersonalRecords'
import type { RecordPeriod } from '../types'

const { t } = useI18n()
const { units } = usePluginContext()

const props = defineProps<{
  activities: Activity[]
  /** The page's sport filter — honoured by the record count, not by the totals. */
  selectedSport: string
}>()

const { period, values, previousValues, PERIODS } = useSummaryTotals('week')

/** The SI figure of the current period for a base metric. */
const si = (base: string) => values.value[`${period.value}_${base}`] ?? 0
const prevSi = (base: string) => previousValues.value[`${period.value}_${base}`] ?? 0

const distance = computed(() => {
  const { value, unit } = units.convert('distance', si('distance'))
  return { value: value.toFixed(1), unit }
})

const ascent = computed(() => {
  const { value, unit } = units.convert('elevation', si('totalAscent'))
  return { value: value.toFixed(0), unit }
})

const duration = computed(() => formatCompactDuration(si('duration')))

/**
 * The change from the period before, when there is one to compare against.
 *
 * Rendered only when the previous period carried a figure: a jump "from zero"
 * is a first outing, not a trend, and reads as a meaningless +100 %.
 */
function delta(base: string) {
  const current = si(base)
  const previous = prevSi(base)
  if (previous <= 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return null
  const dir = pct > 0 ? 'up' : 'down'
  return {
    dir,
    icon: pct > 0 ? 'fas fa-caret-up' : 'fas fa-caret-down',
    text: `${Math.abs(pct)} %`
  }
}

const distanceDelta = computed(() => delta('distance'))
const durationDelta = computed(() => delta('duration'))

// The record count follows the sport filter (unlike the totals), so it agrees
// with the records table lower on the page. All-time, so it counts the records
// currently held rather than only those set this week.
const allPeriod = ref<RecordPeriod>('all')
const { records } = usePersonalRecords(
  toRef(props, 'activities'),
  toRef(props, 'selectedSport'),
  allPeriod
)
const recordCount = computed(() => records.value.length)
</script>

<style scoped>
.kpi-band {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.band-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.band-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.band-title i {
  color: var(--color-green-500);
}

.period-toggle {
  display: flex;
  gap: 0.4rem;
}

.toggle-btn {
  padding: 0.3rem 0.8rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-green-200);
  background: var(--bg-color);
  color: var(--text-color);
  font-family: var(--font-main);
  font-size: 0.8rem;
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.toggle-btn.active {
  background: var(--color-green-500);
  color: var(--color-white);
  border-color: var(--color-green-500);
}

/* Hero wider than the three figure tiles that follow it. */
.tiles {
  display: grid;
  grid-template-columns: 1.4fr repeat(3, 1fr);
  gap: 0.75rem;
}

.hero,
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem 1.1rem;
  border-radius: var(--radius-md);
  min-height: 8.5rem;
  justify-content: space-between;
}

.hero {
  background: var(--color-ink);
  border: 1px solid var(--color-ink);
  color: var(--color-white);
}

.hero-label {
  font-family: var(--font-condensed);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-lime);
}

.hero-value {
  font-family: var(--font-mono);
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--color-lime);
  margin-top: auto;
}

.hero-value small {
  font-size: 1rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.75);
  margin-left: 0.25rem;
}

.tile {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
}

.tile-label {
  font-family: var(--font-condensed);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.tile-value {
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-color);
  margin-top: auto;
}

.tile-value small {
  margin-left: 0.2rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-faint);
}

.tile-foot {
  font-size: 0.72rem;
  color: var(--text-faint);
}

.delta {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
}

.delta.up {
  color: var(--color-green-500);
}

.delta.down {
  color: var(--color-ink-soft);
}

.hero .delta.up {
  color: var(--color-lime);
}

.hero .delta.down {
  color: rgba(255, 255, 255, 0.6);
}

.delta-note {
  font-family: var(--font-main);
  font-weight: 400;
  color: rgba(255, 255, 255, 0.6);
}

.band-caption {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-faint);
}

@media (max-width: 720px) {
  .tiles {
    grid-template-columns: 1fr 1fr;
  }

  .hero {
    grid-column: 1 / -1;
    min-height: 7rem;
  }

  .hero-value {
    font-size: 2.2rem;
  }
}

@media (max-width: 420px) {
  .tiles {
    grid-template-columns: 1fr;
  }
}
</style>
