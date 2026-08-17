<template>
  <section class="section-card">
    <div class="section-header">
      <h3 class="section-title">
        <i class="fas fa-gauge-high" aria-hidden="true"></i>
        {{ t('statistics.summary.title') }}
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

    <dl class="tiles">
      <div v-for="tile in tiles" :key="tile.id" class="tile">
        <dt class="tile-label">{{ tile.label }}</dt>
        <dd class="tile-value">
          {{ tile.value }}<small v-if="tile.unit">{{ tile.unit }}</small>
        </dd>
      </div>
    </dl>

    <!-- Said only when it needs saying: the aggregate has no sport axis, so
         with a sport selected above these tiles are the one block on the page
         that does not follow the filter. -->
    <p v-if="selectedSport" class="tiles-caption">
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {{ t('statistics.summary.allSports') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatCompactDuration } from '@/utils/duration'
import type { AggregationMetricDefinition } from '@/types/aggregation'
import { useSummaryTotals } from '../composables/useSummaryTotals'

const { t } = useI18n()
const { units } = usePluginContext()

defineProps<{
  /** Only to say so when the tiles ignore it — see the caption. */
  selectedSport: string
}>()

// The reconcile / rebuild / subscribe lifecycle lives in the composable, shared
// with the dashboard KPI band so the running totals are read in one place.
const { period, definitions, values, PERIODS, BASE_METRICS } = useSummaryTotals('week')

/** One SI value, as the pair the tile prints. */
function displayOf(
  metric: AggregationMetricDefinition,
  si: number
): { value: string; unit: string } {
  if (!Number.isFinite(si)) return { value: '—', unit: '' }
  if (metric.dimension) {
    const { value, unit } = units.convert(metric.dimension, si)
    return { value: value.toFixed(metric.decimals ?? 0), unit }
  }
  // A duration reads the same in both systems, so it skips the units layer.
  if (metric.unit === 's') return { value: formatCompactDuration(si), unit: '' }
  return { value: si.toFixed(metric.decimals ?? 0), unit: metric.unit ?? '' }
}

/**
 * One tile per base metric, in declaration order.
 *
 * Read from `BASE_METRICS` rather than from the stored definitions so the row
 * keeps its order and its shape whatever a config written elsewhere holds.
 */
const tiles = computed(() =>
  BASE_METRICS.map(base => {
    const id = `${period.value}_${base.id}`
    const def = definitions.value.find(d => d.id === id)
    const shown = def ? displayOf(def, values.value[id] ?? 0) : { value: '—', unit: '' }
    return {
      id: base.id,
      label: t(`statistics.summary.metrics.${base.id}`),
      value: shown.value,
      unit: shown.unit
    }
  })
)
</script>

<style scoped>
.section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title i {
  color: var(--color-green-500);
}

.period-toggle {
  display: flex;
  gap: 0.4rem;
}

.toggle-btn {
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--color-green-200);
  background: var(--bg-color);
  color: var(--text-color);
  font-family: var(--font-main);
  font-size: 0.8rem;
  /* Global button styling shouts in uppercase; a period is a label, not a call
     to action — same reason as the scope tabs on the activity list */
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

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.6rem;
  margin: 0;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem 0.8rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
}

.tile-label {
  font-family: var(--font-condensed);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.tile-value {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-color);
}

.tile-value small {
  margin-left: 0.2rem;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-faint);
}

.tiles-caption {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.7rem 0 0;
  font-size: 0.75rem;
  color: var(--text-faint);
}
</style>
